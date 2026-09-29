// Dati dell'utente per i costi: regione (bollo), data di nascita e classe di merito
// (assicurazione) e facoltativamente la via. Si chiedono alla prima visita e si ricordano nel
// profilo dell'account, o nel browser per chi non ha fatto accesso.
// Anno di immatricolazione e chilometri non stanno qui: riguardano l'auto cercata, e viaggiano
// nell'URL della scheda (?year=, ?km=).

import * as accesso from "./accesso";
import * as api from "./api";
import type { Indirizzo } from "./api";
import { formatIntero as n } from "./formato";

// Chiave = valore passato al backend (tax_rules.region). Trento e Bolzano hanno il bollo
// provinciale, quindi compaiono separate.
export const REGIONI: Array<[string, string]> = [
  ["abruzzo", "Abruzzo"],
  ["basilicata", "Basilicata"],
  ["bolzano", "Bolzano (Alto Adige)"],
  ["calabria", "Calabria"],
  ["campania", "Campania"],
  ["emilia-romagna", "Emilia-Romagna"],
  ["friuli-venezia giulia", "Friuli-Venezia Giulia"],
  ["lazio", "Lazio"],
  ["liguria", "Liguria"],
  ["lombardia", "Lombardia"],
  ["marche", "Marche"],
  ["molise", "Molise"],
  ["piemonte", "Piemonte"],
  ["puglia", "Puglia"],
  ["sardegna", "Sardegna"],
  ["sicilia", "Sicilia"],
  ["toscana", "Toscana"],
  ["trento", "Trento (Trentino)"],
  ["umbria", "Umbria"],
  ["valle d'aosta", "Valle d'Aosta"],
  ["veneto", "Veneto"],
];

/** Anni di immatricolazione proposti nei menu, dal più recente. */
export function anniImmatricolazione(oggi = new Date().getFullYear()): number[] {
  return Array.from({ length: 36 }, (_, i) => oggi - i);
}

/** Anno dall'URL della scheda; null se assente o fuori dai menu (= auto nuova / non so). */
export function annoDaUrl(search: string): number | null {
  const a = Number(new URLSearchParams(search).get("year"));
  return anniImmatricolazione().includes(a) ? a : null;
}

/** Fasce di chilometri proposte nel menu, identificate dal limite inferiore: 0 = 0-9.999,
 *  10.000 = 10.000-19.999, … fino a 500.000 = 500.000 e oltre. */
export const FASCE_KM: number[] = Array.from({ length: 51 }, (_, i) => i * 10_000);
const ULTIMA_FASCIA = FASCE_KM[FASCE_KM.length - 1];

/** Fascia di chilometri dall'URL della scheda; null se assente o fuori dal menu (= non indicata). */
export function kmDaUrl(search: string): number | null {
  const v = new URLSearchParams(search).get("km");
  const k = Number(v);
  return v && FASCE_KM.includes(k) ? k : null;
}

/** 20000 → "20.000-29.999 km"; l'ultima fascia → "500.000 km e oltre". */
export function nomeFasciaKm(da: number): string {
  return da === ULTIMA_FASCIA ? `${n(da)} km e oltre` : `${n(da)}-${n(da + 9_999)} km`;
}

export const nomeRegione = (k: string | null | undefined) =>
  REGIONI.find(([key]) => key === k)?.[1] ?? null;

export interface Ipotesi {
  regione: string;
  nascita: string | null; // AAAA-MM-GG; va all'LLM, esatta, per la stima dell'assicurazione
  // La via scelta dal menu dei suggerimenti, così com'è. Con data di nascita o classe di merito
  // va al backend (e all'LLM) per stimare l'assicurazione.
  indirizzo: Indirizzo | null;
  // 'nuova' (prima polizza, 14ª classe) o '1' … '14'; null = non la so (stima in 1ª classe)
  classe: string | null;
}

/** Classi di merito proposte nel menu: la polizza nuova per prima, poi dalla 1ª alla 14ª. */
export const CLASSI: Array<[string, string]> = [
  ["nuova", "Nuova assicurazione (14ª classe)"],
  ...Array.from({ length: 14 }, (_, i): [string, string] => [String(i + 1), `${i + 1}ª classe`]),
];

export const nomeClasse = (k: string | null | undefined) =>
  CLASSI.find(([key]) => key === k)?.[1] ?? null;

// ---------------------------------------------------------------- dove stanno i dati
// Con l'accesso (lib/accesso.ts) i dati stanno nel profilo dell'account, nel database: il browser
// non ne tiene copia. Senza accesso restano nel localStorage di questo browser. Al primo accesso,
// se l'account non ha ancora un profilo, i dati del browser diventano il profilo e il browser li
// dimentica.

const KEY = "vroomy.ipotesi";

function valide(v: any): Ipotesi | null {
  return typeof v?.regione === "string"
    ? {
        regione: v.regione,
        nascita: typeof v.nascita === "string" ? v.nascita : null,
        indirizzo: typeof v.indirizzo?.etichetta === "string" ? v.indirizzo : null,
        classe: CLASSI.some(([k]) => k === v.classe) ? v.classe : null,
      }
    : null;
}

function leggiLocali(): Ipotesi | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? valide(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function salvaLocali(i: Ipotesi | null): void {
  try {
    if (i) localStorage.setItem(KEY, JSON.stringify(i));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage non disponibile: le ipotesi valgono solo per questa pagina */
  }
}

let correnti: Ipotesi | null = leggiLocali();
let utente: accesso.Utente | null = null;

async function daAccount(u: accesso.Utente): Promise<Ipotesi | null> {
  const p = valide(await api.profilo(u.token));
  if (p) return p;
  const locali = leggiLocali();
  if (!locali) return null;
  await api.salvaProfilo(u.token, locali);
  salvaLocali(null);
  return locali;
}

/** Dati dell'account, o del browser se l'accesso non c'è o il backend non risponde. */
let turno = 0;   // accessi e uscite ravvicinati: vale solo l'ultima ricarica partita
async function ricarica(u: accesso.Utente | null): Promise<void> {
  const mio = ++turno;
  let nuove: Ipotesi | null;
  try {
    nuove = u ? await daAccount(u) : leggiLocali();
  } catch (e) {
    console.error(e);
    nuove = null;
  }
  if (mio !== turno) return;
  utente = u;
  correnti = nuove;
}

// Il modulo si importa anche durante la build (REGIONI, CLASSI): lì niente accesso né storage.
const nelBrowser = typeof window !== "undefined";
const pronte = nelBrowser
  ? accesso.accessoVerificato().then(accesso.attuale).then(ricarica)
  : Promise.resolve();

/** Da attendere prima della prima leggi(): con l'accesso i dati arrivano dal backend. */
export const attendi = (): Promise<void> => pronte;

/** I dati correnti (dopo attendi()). */
export const leggi = (): Ipotesi | null => correnti;

/** L'utente che ha fatto accesso, o null: i dati stanno nel suo account. */
export const account = (): accesso.Utente | null => utente;

/** Salva i dati nell'account o nel browser. Con l'accesso può fallire (rete, backend). */
export async function salva(i: Ipotesi): Promise<void> {
  const u = await accesso.attuale();
  if (u) await api.salvaProfilo(u.token, i);
  else salvaLocali(i);
  correnti = i;
}

export async function cancella(): Promise<void> {
  const u = await accesso.attuale();
  if (u) await api.cancellaProfilo(u.token);
  else salvaLocali(null);
  correnti = null;
}

// ---------------------------------------------------------------- eventi tra componenti
// Il menu utente, il form dei dati e le pagine non si conoscono: comunicano con due eventi.

/** Chiede di aprire il form dei dati (DatiUtente.astro). */
const APRI = "vroomy:apri-dati";
/** I dati sono cambiati: detail è la nuova Ipotesi, o null se sono stati cancellati. */
const CAMBIATE = "vroomy:ipotesi";

export const apriDati = () => window.dispatchEvent(new Event(APRI));
export const suApriDati = (fn: () => void) => window.addEventListener(APRI, fn);

export const annuncia = (i: Ipotesi | null) =>
  window.dispatchEvent(new CustomEvent<Ipotesi | null>(CAMBIATE, { detail: i }));
export const suCambio = (fn: (i: Ipotesi | null) => void) =>
  window.addEventListener(CAMBIATE, (e) => fn((e as CustomEvent<Ipotesi | null>).detail));

// Accesso o uscita: cambiano i dati (quelli dell'account o quelli del browser).
if (nelBrowser) accesso.suCambio(async (u, evento) => {
  if (evento === "nuova-password") return;
  const mio = turno + 1;
  await ricarica(u);
  if (mio === turno) annuncia(correnti);
});
