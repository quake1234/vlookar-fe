// Dati dell'utente per i costi: regione (bollo), data di nascita e classe di merito
// (assicurazione) e facoltativamente la via. Si chiedono al primo accesso e si ricordano nel browser.
// Anno di immatricolazione e chilometri non stanno qui: riguardano l'auto cercata, e viaggiano
// nell'URL della scheda (?anno=, ?km=).

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
  const a = Number(new URLSearchParams(search).get("anno"));
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

const KEY = "vroomy.ipotesi";

export function leggi(): Ipotesi | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return typeof v?.regione === "string"
      ? {
          regione: v.regione,
          nascita: typeof v.nascita === "string" ? v.nascita : null,
          indirizzo: typeof v.indirizzo?.etichetta === "string" ? v.indirizzo : null,
          classe: CLASSI.some(([k]) => k === v.classe) ? v.classe : null,
        }
      : null;
  } catch {
    return null;
  }
}

export function salva(i: Ipotesi): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(i));
  } catch {
    /* storage non disponibile: le ipotesi valgono solo per questa pagina */
  }
}

export function cancella(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage non disponibile: non c'era niente da cancellare */
  }
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
