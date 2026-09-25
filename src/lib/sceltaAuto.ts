// Menu collegati anno → marca → modello → allestimento, nella home. Con un anno, il backend dà
// solo ciò che era in listino quell'anno. Senza anno, se il catalogo non ha voci il backend le
// chiede all'AI: lo si dice all'utente.

import * as api from "./api";
import { nomeLeggibile } from "./formato";

const AI = " · suggerito da AI";

export interface Menu {
  /** Anno di immatricolazione: filtra i tre menu. Valore vuoto = tutti gli anni. */
  anno?: HTMLSelectElement;
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

/** Riseleziona la voce di prima, se c'è ancora. Vero se l'ha trovata. */
function riseleziona(sel: HTMLSelectElement, valore: string): boolean {
  if (!valore || ![...sel.options].some((o) => o.value === valore)) return false;
  sel.value = valore;
  return true;
}

export function collega(m: Menu): void {
  const anno = () => (m.anno?.value ? +m.anno.value : null);
  // "Nessun modello nel 2008" / "Nessun modello trovato"; nessuna() per il femminile (marca)
  const nessuno = (cosa: string) => (anno() ? `Nessun${cosa} nel ${anno()}` : `Nessun${cosa} trovato`);
  const nessuna = (cosa: string) => (anno() ? `Nessun${cosa} nel ${anno()}` : `Nessun${cosa} trovata`);

  // Per ogni menu vale solo l'ultima richiesta: una risposta lenta di prima (anno cambiato due
  // volte di fila) non deve sovrascrivere quella nuova.
  const ultima = new Map<HTMLSelectElement, number>();

  async function carica<T>(sel: HTMLSelectElement, attesa: string, fn: () => Promise<T>): Promise<T | null> {
    const questa = (ultima.get(sel) ?? 0) + 1;
    ultima.set(sel, questa);
    reset(sel, "Caricamento…");
    const lento = setTimeout(() => (m.stato.textContent = attesa), 1200);
    try {
      const voci = await fn();
      return ultima.get(sel) === questa ? voci : null;
    } catch {
      if (ultima.get(sel) === questa) m.stato.textContent = "Non riusciamo a contattare il servizio. Riprova tra poco.";
      return null;
    } finally {
      clearTimeout(lento);
      if (m.stato.textContent === attesa) m.stato.textContent = "";
    }
  }

  async function caricaMarche(): Promise<boolean> {
    const voci = await carica(m.marca, "", () => api.marche(anno()));
    if (!voci) return false;
    riempi(m.marca, voci.map((v) => ({ id: v.id, label: nomeLeggibile(v.name) })),
      voci.length ? "Scegli la marca" : nessuna("a marca"));
    return true;
  }

  async function caricaModelli(): Promise<boolean> {
    reset(m.allestimento, "Prima scegli il modello");
    m.suScelta(null);
    if (!m.marca.value) {
      reset(m.modello, "Prima scegli la marca");
      return false;
    }
    const voci = await carica(m.modello, "Sto cercando i modelli di questa marca…", () =>
      api.modelli(+m.marca.value, anno()),
    );
    if (!voci) return false;
    riempi(
      m.modello,
      voci.map((v) => ({ id: v.id, label: nomeLeggibile(v.name) + (v.origin === "llm" ? AI : "") })),
      voci.length ? "Scegli il modello" : nessuno(" modello"),
    );
    return true;
  }

  async function caricaAllestimenti(): Promise<boolean> {
    m.suScelta(null);
    if (!m.modello.value) {
      reset(m.allestimento, "Prima scegli il modello");
      return false;
    }
    const voci = await carica(m.allestimento, "Sto cercando i motori di questo modello…", () =>
      api.allestimenti(+m.modello.value, anno()),
    );
    if (!voci) return false;
    riempi(
      m.allestimento,
      voci.map((v) => ({
        id: v.id,
        label: v.name + (v.fuel ? ` · ${v.fuel}` : "") + (v.origin === "llm" ? AI : ""),
      })),
      voci.length ? "Scegli motore e allestimento" : nessuno(" allestimento"),
    );
    return true;
  }


  m.marca.addEventListener("change", () => void caricaModelli());
  m.modello.addEventListener("change", () => void caricaAllestimenti());
  m.allestimento.addEventListener("change", () => m.suScelta(m.allestimento.value ? +m.allestimento.value : null));

  // Cambiando anno si ricaricano i menu, tenendo le scelte fatte se esistono ancora in quell'anno.
  // Le scelte di prima si ricordano al primo cambio: se l'anno cambia di nuovo a metà, si riparte
  // da quelle, non dai menu mezzi caricati.
  let giro = 0;
  let prima: { marca: string; modello: string; allestimento: string } | null = null;
  m.anno?.addEventListener("change", async () => {
    const questo = ++giro;
    prima ??= { marca: m.marca.value, modello: m.modello.value, allestimento: m.allestimento.value };
    const scelte = prima;
    const attuale = () => questo === giro;
    m.suScelta(null);
    reset(m.modello, "Prima scegli la marca");
    reset(m.allestimento, "Prima scegli il modello");
    try {
      if (!(await caricaMarche()) || !attuale() || !riseleziona(m.marca, scelte.marca)) return;
      if (!(await caricaModelli()) || !attuale() || !riseleziona(m.modello, scelte.modello)) return;
      if (!(await caricaAllestimenti()) || !attuale() || !riseleziona(m.allestimento, scelte.allestimento)) return;
      m.suScelta(+m.allestimento.value);
    } finally {
      if (attuale()) prima = null;
    }
  });

  void caricaMarche();
}
