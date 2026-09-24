// Formattazione per la lettura. Non calcola nulla: mostra i numeri che arrivano dal backend.

import type { Intervallo } from "./api";

// useGrouping "always": in italiano Intl non separa le migliaia sotto 10.000 ("7500 €"),
// e accanto a "10.500 €" sembra un errore.
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" });
const euroCent = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, useGrouping: "always" });
const numero = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1, useGrouping: "always" });

const intero = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: "always" });

export const formatEuro = (n: number) => euro.format(n);
/** Solo la cifra, senza simbolo: per i totali grandi, dove "€" è composto a parte. */
export const formatIntero = (n: number) => intero.format(n);
export const formatEuroCent = (n: number) => euroCent.format(n);
export const formatNumero = (n: number) => numero.format(n);

export function formatIntervallo(r: Intervallo | null): string | null {
  if (!r) return null;
  return r.min === r.max ? formatEuro(r.min) : `${formatEuro(r.min)} – ${formatEuro(r.max)}`;
}

export function formatData(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

/** Escape per tutto il testo che finisce in innerHTML: le risposte dell'LLM comprese. */
export function esc(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** 'GOLF VIII 2020' → 'Golf VIII 2020'. Le sigle (TSI, GTI, VIII) restano maiuscole. */
export function nomeLeggibile(s: string): string {
  return s
    .split(" ")
    .map((w) => (w.length <= 4 || /\d/.test(w) || /^[IVX]+$/.test(w) ? w : w[0] + w.slice(1).toLowerCase()))
    .join(" ");
}
