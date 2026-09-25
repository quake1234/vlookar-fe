// Client del backend REST. Solo chiamate e tipi: nessun calcolo (i numeri arrivano già pronti).

export const API_URL: string = import.meta.env.PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export type Origine = "ufficiale" | "stima_llm" | "calcolato";
export type OrigineCatalogo = "aci" | "manuale" | "llm";

export interface VoceCatalogo {
  id: number;
  name: string;
  origin: OrigineCatalogo;
}

export interface Allestimento extends VoceCatalogo {
  fuel: string | null;
  in_production: boolean | null;
}

export interface Intervallo {
  min: number;
  max: number;
}

export interface IntervalloConNota extends Intervallo {
  nota?: string | null;
}

export interface Problema {
  titolo: string;
  descrizione: string;
  gravita: "bassa" | "media" | "alta" | null;
  costo_officina_autorizzata_eur?: Intervallo | null;
  costo_meccanico_eur?: Intervallo | null;
  // Risposte inserite a mano da un'altra fonte: costo non diviso, riportato come testo.
  costo_riparazione_testo?: string | null;
}

export interface Fonte {
  name: string;
  url: string | null;
  consultata: string;
}

export interface Scheda {
  allestimento: {
    id: number;
    marca: string;
    modello: string;
    nome: string;
    alimentazione: string | null;
    in_produzione: boolean | null;
    origine_catalogo: OrigineCatalogo;
  };
  stima: null | {
    origine: "stima_llm";
    modello_llm: string;
    data: string;
    kw: number | null;
    euro_class: string | null;
    alimentazione: string | null;
    prezzo_nuovo_eur: IntervalloConNota | null;
    prezzo_usato_eur: IntervalloConNota | null;
    assicurazione_annua_eur: IntervalloConNota | null;
    problemi: Problema[];
    richiami?: Array<{ periodo: string | null; descrizione: string }>;
    cosa_controllare?: string[];
    testo: string;
  };
  bollo: {
    origine: "calcolato";
    importo: number | null;
    bollo?: number | null;
    superbollo?: number | null;
    regione_applicata?: string | null;
    input?: {
      kw: number;
      euro_class: string | null;
      alimentazione: string | null;
      anno_immatricolazione: number | null;
      origine: Origine;
    };
    fonti?: Fonte[];
    note: string[];
  };
  dati_ufficiali: null | {
    origine: "ufficiale";
    codice_motore: string;
    kw: number;
    euro_class: string;
    fatti: Array<Record<string, unknown>>;
    bocciature_mot: Array<{
      age_years: number;
      fail_pct: number;
      sample_size: number;
      observed_at: string;
      fonte: string;
      fonte_url: string | null;
      media_parco_pct: number | null;
      barra: number;               // lunghezza della barra 0-100, calcolata dal backend
      barra_media: number | null;
    }>;
  };
  assicurazione: null | {
    origine: "stima_llm";
    min: number | null;
    max: number | null;
    fascia: string | null;
    eta: number | null;
    nota: string | null;
    note: string[];
    personalizzata: boolean;     // per il singolo guidatore, o media italiana in 1ª classe
    classe: string | null;       // 'nuova' | '1' … '14'; null = non indicata
    luogo: string | null;
    modello_llm: string | null;
    da_calcolare: boolean;       // la stima personalizzata non è ancora pronta: chiedere /assicurazione
  };
  tagliando: null | {
    origine: "stima_llm";
    officina_autorizzata: Intervallo | null;
    meccanico: Intervallo | null;
    intervallo_km: number | null;
    intervallo_mesi: number | null;
    tagliandi_anno: number;
    nota: string | null;
    note: string[];
  };
  mantenimento: {
    origine: "calcolato";
    min: number | null;
    max: number | null;
    componenti?: {
      assicurazione: Intervallo;
      bollo: number;
      tagliandi: Intervallo;
    };
    mancano: string[];
  };
  stima_non_disponibile: null | "limite" | "errore";
}

export class ErroreApi extends Error {
  constructor(readonly status: number) {
    super(`Errore ${status}`);
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(API_URL + path, { signal });
  if (!res.ok) throw new ErroreApi(res.status);
  return res.json() as Promise<T>;
}

// anno: anno di immatricolazione. Con l'anno il backend dà solo ciò che era in listino quell'anno.
const perAnno = (anno?: number | null) => (anno ? `?anno=${anno}` : "");
export const marche = (anno?: number | null) => get<VoceCatalogo[]>(`/marche${perAnno(anno)}`);
export const modelli = (marcaId: number, anno?: number | null) =>
  get<VoceCatalogo[]>(`/marche/${marcaId}/modelli${perAnno(anno)}`);
export const allestimenti = (modelloId: number, anno?: number | null) =>
  get<Allestimento[]>(`/modelli/${modelloId}/allestimenti${perAnno(anno)}`);

/** Una via suggerita dal geocoder (dati OpenStreetMap). regione è la chiave per il bollo. */
export interface Indirizzo {
  etichetta: string;
  via: string;
  comune: string | null;
  cap: string | null;
  provincia: string | null;
  regione: string | null;
}

export const indirizzi = (q: string, signal?: AbortSignal) =>
  get<Indirizzo[]>(`/indirizzi?q=${encodeURIComponent(q)}`, signal);

/** Ciò che la scheda chiede all'utente. La via serve solo alla stima dell'assicurazione. */
export interface ParametriScheda {
  regione?: string | null;
  anno?: number | null;
  nascita?: string | null;
  classe?: string | null;
  indirizzo?: Indirizzo | null;
}

function query(p: ParametriScheda): string {
  const q = new URLSearchParams();
  if (p.regione) q.set("regione", p.regione);
  if (p.anno) q.set("anno", String(p.anno));
  if (p.nascita) q.set("nascita", p.nascita);
  if (p.classe) q.set("classe", p.classe);
  // la via serve solo alla stima personalizzata, che scatta con classe o data di nascita
  if (p.classe || p.nascita) {
    const i = p.indirizzo;
    if (i) {
      q.set("via", i.via);
      if (i.cap) q.set("cap", i.cap);
      if (i.comune) q.set("comune", i.comune);
      if (i.provincia) q.set("provincia", i.provincia);
    }
  }
  const qs = q.toString();
  return qs ? "?" + qs : "";
}

export const scheda = (id: number, p: ParametriScheda = {}) =>
  get<Scheda>(`/allestimenti/${id}/scheda${query(p)}`);

/** Chiede la stima dell'assicurazione per classe e luogo; poi la scheda la contiene. */
export const assicurazione = (id: number, p: ParametriScheda) =>
  get<{ stato: "pronta" | "limite" | "errore" }>(`/allestimenti/${id}/assicurazione${query(p)}`);
