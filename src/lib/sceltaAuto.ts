// Tre menu collegati marca → modello → allestimento, nella home. Se il catalogo non ha voci, il backend le chiede all'AI: lo si dice all'utente.

import * as api from "./api";
import { nomeLeggibile } from "./formato";

const AI = " · suggerito da AI";

export interface Menu {
  marca: HTMLSelectElement;
  modello: HTMLSelectElement;
  allestimento: HTMLSelectElement;
  stato: HTMLElement;
  /** Chiamata a ogni cambio: l'id dell'allestimento scelto, o null. */
  suScelta: (id: number | null) => void;
}

function riempi(sel: HTMLSelectElement, voci: Array<{ id: number; label: string }>, vuoto: string) {
  sel.replaceChildren(new Option(vuoto, ""));
  for (const v of voci) sel.add(new Option(v.label, String(v.id)));
  sel.disabled = voci.length === 0;
}

function reset(sel: HTMLSelectElement, testo: string) {
  sel.replaceChildren(new Option(testo, ""));
  sel.disabled = true;
}

export function collega(m: Menu): void {
  async function carica<T>(sel: HTMLSelectElement, attesa: string, fn: () => Promise<T>): Promise<T | null> {
    reset(sel, "Caricamento…");
    const lento = setTimeout(() => (m.stato.textContent = attesa), 1200);
    try {
      return await fn();
    } catch {
      m.stato.textContent = "Non riusciamo a contattare il servizio. Riprova tra poco.";
      return null;
    } finally {
      clearTimeout(lento);
      if (m.stato.textContent === attesa) m.stato.textContent = "";
    }
  }

  m.marca.addEventListener("change", async () => {
    reset(m.allestimento, "Prima scegli il modello");
    m.suScelta(null);
    if (!m.marca.value) return reset(m.modello, "Prima scegli la marca");
    const voci = await carica(m.modello, "Sto cercando i modelli di questa marca…", () => api.modelli(+m.marca.value));
    if (!voci) return;
    riempi(
      m.modello,
      voci.map((v) => ({ id: v.id, label: nomeLeggibile(v.name) + (v.origin === "llm" ? AI : "") })),
      voci.length ? "Scegli il modello" : "Nessun modello trovato",
    );
  });

  m.modello.addEventListener("change", async () => {
    m.suScelta(null);
    if (!m.modello.value) return reset(m.allestimento, "Prima scegli il modello");
    const voci = await carica(m.allestimento, "Sto cercando i motori di questo modello…", () =>
      api.allestimenti(+m.modello.value),
    );
    if (!voci) return;
    riempi(
      m.allestimento,
      voci.map((v) => ({
        id: v.id,
        label: v.name + (v.fuel ? ` · ${v.fuel}` : "") + (v.origin === "llm" ? AI : ""),
      })),
      voci.length ? "Scegli motore e allestimento" : "Nessun allestimento trovato",
    );
  });

  m.allestimento.addEventListener("change", () => m.suScelta(m.allestimento.value ? +m.allestimento.value : null));

  carica(m.marca, "", api.marche).then((voci) => {
    if (voci) riempi(m.marca, voci.map((v) => ({ id: v.id, label: nomeLeggibile(v.name) })), "Scegli la marca");
  });
}
