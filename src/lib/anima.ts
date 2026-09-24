// Transizione delle cifre: quando arriva un valore nuovo dal backend, il numero scorre dal
// vecchio al nuovo in poco tempo. È solo presentazione: il valore finale è quello ricevuto.

import { formatIntero } from "./formato";

const DURATA = 220;
const riduci = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const inCorso = new WeakMap<HTMLElement, number>();

export function cifra(el: HTMLElement, valore: number, formato: (n: number) => string = formatIntero): void {
  const da = Number(el.dataset.valore);
  el.dataset.valore = String(valore);
  cancelAnimationFrame(inCorso.get(el) ?? 0);
  if (!Number.isFinite(da) || da === valore || riduci()) {
    el.textContent = formato(valore);
    return;
  }
  const inizio = performance.now();
  const passo = (ora: number) => {
    const t = Math.min(1, (ora - inizio) / DURATA);
    el.textContent = formato(t === 1 ? valore : Math.round(da + (valore - da) * easeOut(t)));
    if (t < 1) inCorso.set(el, requestAnimationFrame(passo));
  };
  inCorso.set(el, requestAnimationFrame(passo));
}

/** Svuota la cifra (es. valore non disponibile): la prossima non scorrerà da un numero vecchio. */
export function svuota(el: HTMLElement, testo: string): void {
  cancelAnimationFrame(inCorso.get(el) ?? 0);
  delete el.dataset.valore;
  el.textContent = testo;
}
