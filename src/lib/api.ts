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
  /** null se non si sa. Origine: "nome" = letti dal nome ACI (dei CV e kW, uno è calcolato),
   * "manuale" = corretti a mano, "ufficiale" = da una fonte aperta. */
  carrozzeria: string | null;
  carrozzeria_origine: OrigineDettaglio | null;
  cv: number | null;
  kw: number | null;
  potenza_origine: OrigineDettaglio | null;
}

export type OrigineDettaglio = "nome" | "manuale" | "ufficiale";

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

/** Intervento di manutenzione oltre il tagliando ordinario, previsto a un certo chilometraggio. */
export interface Intervento {
  titolo: string;
  descrizione: string;
  entro_km: number | null;
  costo_officina_autorizzata_eur: Intervallo | null;
  costo_meccanico_eur: Intervallo | null;
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
    problemi: Problema[];
    richiami?: Array<{ periodo: string | null; descrizione: string }>;
    cosa_controllare?: string[];
    testo: string;
  };
  bollo: {
    origine: "calcolato";
    importo: number | null;
    // senza esenzioni né riduzioni per età e alimentazione; null se uguale a importo
    importo_pieno?: number | null;
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
    // Eccezioni che il calcolo non considera (anno di immatricolazione, CO2), già filtrate per
    // regione e alimentazione dal backend: il sito le mostra con un asterisco.
    eccezioni?: Array<{ testo: string; fonte: Fonte | null }>;
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
  /** Solo per chi ha fatto accesso e ha nel profilo via, data di nascita e classe di merito. */
  assicurazione: null | {
    origine: "stima_llm";
    min: number | null;
    max: number | null;
    eta: number | null;
    nota: string | null;
    classe: string;              // 'nuova' | '1' … '14'
    luogo: string;
    modello_llm: string | null;
    da_calcolare: boolean;       // la stima non è ancora pronta: chiedere /assicurazione
  };
  /** Perché manca l'assicurazione: 'accesso', oppure 'via', 'nascita', 'classe' del profilo. */
  assicurazione_mancano: string[];
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
    /** false: solo bollo + tagliandi (chi non ha fatto accesso non vede l'assicurazione) */
    con_assicurazione: boolean;
    componenti?: {
      assicurazione?: Intervallo;
      bollo: number;
      tagliandi: Intervallo;
    };
    mancano: string[];
    /** Scala del quadrante di /car, calcolata dal backend: cifre delle tacche lunghe (da 0)
     *  e posizione di min e max in percentuale del fondo scala. null se il totale manca. */
    quadrante?: { tacche: number[]; min_pct: number; max_pct: number; tacca_massimo_pct: number } | null;
  };
  // Stima per anno e fascia di km; null se l'utente non ha indicato i km.
  usura: null | {
    origine: "stima_llm";
    km_da: number;
    fascia_km: string;           // "120.000-129.999 km"
    anno_immatricolazione: number | null;
    prezzo_usato_eur: IntervalloConNota | null;
    interventi: Intervento[];    // ordinati per km previsti dal backend
    problemi: Problema[];
    modello_llm: string | null;
    data: string | null;
    da_calcolare: boolean;       // non ancora pronta: chiedere /usura
  };
  stima_da_calcolare: boolean;   // la stima generale non è ancora pronta: chiedere /stima
  /** Solo con l'accesso: quando l'utente ha aperto per la prima volta questa scheda (allestimento,
   *  anno e km), e se la riga di cronologia è nata con questa richiesta. */
  cronologia?: { creata_il: string; nuova: boolean } | null;
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

// I dati personali (data di nascita, classe di merito, indirizzo) vanno nel corpo di una POST,
// mai nell'URL: gli URL finiscono nei log del server e della piattaforma che lo ospita.
async function post<T>(path: string, corpo: object, signal?: AbortSignal, token?: string | null): Promise<T> {
  const res = await fetch(API_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(corpo),
    signal,
  });
  if (!res.ok) throw new ErroreApi(res.status);
  return res.json() as Promise<T>;
}

// anno: anno di immatricolazione. Con l'anno il backend dà solo ciò che era in listino quell'anno.
const perAnno = (anno?: number | null) => (anno ? `?year=${anno}` : "");
export const marche = (anno?: number | null) => get<VoceCatalogo[]>(`/makes${perAnno(anno)}`);
export const modelli = (marcaId: number, anno?: number | null) =>
  get<VoceCatalogo[]>(`/makes/${marcaId}/models${perAnno(anno)}`);
export const allestimenti = (modelloId: number, anno?: number | null) =>
  get<Allestimento[]>(`/models/${modelloId}/versions${perAnno(anno)}`);

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
  post<Indirizzo[]>("/addresses", { q }, signal);

/** Ciò che la scheda manda al backend. Data di nascita, classe e via non ci sono: il backend
 *  le prende dal profilo di chi ha fatto accesso, e solo con quelle stima l'assicurazione. */
export interface ParametriScheda {
  regione?: string | null;
  anno?: number | null;
  km?: number | null;             // inizio della fascia di km
}

function corpo(p: ParametriScheda): Record<string, string | number> {
  const c: Record<string, string | number> = {};
  if (p.regione) c.regione = p.regione;
  if (p.anno) c.anno = p.anno;
  if (p.km != null) c.km = p.km;
  return c;
}

// Token dell'utente che ha fatto accesso: lo imposta lib/ipotesi.ts. Con il token il backend
// prende data di nascita, classe e via dal profilo e lega la stima dell'assicurazione all'utente.
let tokenAttuale: () => Promise<string | null> = async () => null;
export const usaToken = (fn: () => Promise<string | null>) => { tokenAttuale = fn; };

async function conProfilo<T>(path: string, p: ParametriScheda): Promise<T> {
  return post<T>(path, corpo(p), undefined, await tokenAttuale());
}

export const scheda = (id: number, p: ParametriScheda = {}) =>
  conProfilo<Scheda>(`/versions/${id}/report`, p);

export type StatoStima = { stato: "pronta" | "limite" | "errore" };

/** Chiede la stima generale dell'allestimento; poi la scheda la contiene. */
export const stima = (id: number) => get<StatoStima>(`/versions/${id}/estimate`);

/** Chiede la stima dell'assicurazione con i dati del profilo; poi la scheda la contiene. */
export const assicurazione = (id: number, p: ParametriScheda) =>
  conProfilo<StatoStima>(`/versions/${id}/insurance`, p);

/** Chiede la stima per anno e fascia di km; poi la scheda la contiene. */
export const usura = (id: number, p: ParametriScheda) =>
  get<StatoStima>(`/versions/${id}/mileage?${new URLSearchParams([
    ...(p.anno ? [["year", String(p.anno)]] : []),
    ...(p.km != null ? [["km", String(p.km)]] : []),
  ])}`);

// ---------------------------------------------------------------- profilo (utente registrato)
// Il token è quello di Supabase Auth (lib/accesso.ts). I dati personali viaggiano solo nel
// corpo della richiesta e della risposta, mai nell'URL.

/** I dati dell'utente come li salva il backend (tabella user_profiles, /profile). */
export interface Profilo {
  regione: string;
  nascita: string | null;
  classe: string | null;
  indirizzo: Indirizzo | null;
}

async function conToken<T>(metodo: string, path: string, token: string, corpo?: object): Promise<T> {
  const res = await fetch(API_URL + path, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(corpo ? { "Content-Type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (!res.ok) throw new ErroreApi(res.status);
  return (res.status === 204 ? null : await res.json()) as T;
}

/** null se l'utente non ha ancora salvato i suoi dati. */
export const profilo = (token: string) => conToken<Profilo | null>("GET", "/profile", token);
export const salvaProfilo = (token: string, p: Profilo) => conToken<Profilo>("PUT", "/profile", token, p);
export const cancellaProfilo = (token: string) => conToken<null>("DELETE", "/profile", token);

// ---------------------------------------------------------------- cronologia (utente registrato)
// Il backend registra una riga per allestimento + anno + fascia di km ogni volta che l'utente
// apre una scheda (POST /versions/{id}/report con il token), con il costo annuo di quel momento.

export interface Ricerca {
  id: number;
  allestimento: { id: number; marca: string; modello: string; nome: string };
  anno: number | null;           // null = auto nuova / anno non indicato
  km: number | null;             // inizio della fascia; null = non indicati
  /** Mantenimento annuo (assicurazione + bollo + tagliandi) calcolato dalla scheda; null se la
   *  scheda non l'aveva ancora (stime non pronte, dati mancanti). */
  costo_annuo: null | ({ origine: "calcolato" } & Intervallo);
  cercata_il: string;
}

export interface FiltriCronologia {
  marca?: number | null;
  modello?: number | null;
  allestimento?: number | null;
  anno?: number | "new" | null;  // "new" = solo auto nuove
  costoDa?: number | null;
  costoA?: number | null;
}

export interface Cronologia {
  righe: Ricerca[];
  /** Le voci dei menu dei filtri, dalle ricerche dell'utente. anni: null = auto nuova. */
  filtri: {
    marche: Array<{ id: number; name: string }>;
    modelli: Array<{ id: number; name: string }>;
    allestimenti: Array<{ id: number; name: string }>;
    anni: Array<number | null>;
  };
}

export function cronologia(token: string, f: FiltriCronologia = {}): Promise<Cronologia> {
  const q = new URLSearchParams();
  const metti = (k: string, v: number | string | null | undefined) => { if (v != null) q.set(k, String(v)); };
  metti("make", f.marca);
  metti("model", f.modello);
  metti("version", f.allestimento);
  metti("year", f.anno);
  metti("price_from", f.costoDa);
  metti("price_to", f.costoA);
  const qs = q.toString();
  return conToken<Cronologia>("GET", `/history${qs ? `?${qs}` : ""}`, token);
}
export const cancellaRicerca = (token: string, id: number) => conToken<null>("DELETE", `/history/${id}`, token);
export const cancellaCronologia = (token: string) => conToken<null>("DELETE", "/history", token);
