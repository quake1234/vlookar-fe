// Menu collegati anno → marca → modello → allestimento, nella home. Con un anno, il backend dà
// solo ciò che era in listino quell'anno. Senza anno, se il catalogo non ha voci il backend le
// chiede all'AI: lo si dice all'utente. Con più di SOGLIA_FILTRI versioni compaiono i filtri
// per carrozzeria e potenza, con i soli valori presenti tra quelle versioni; scelta una
// carrozzeria, il filtro potenza offre solo le potenze che esistono con quella carrozzeria.

import * as api from "./api";
import { nomeLeggibile } from "./formato";

const AI = " · suggerito da AI";
const SOGLIA_FILTRI = 10;
const NON_INDICATA = "-";

export interface Filtri {
  /** Contenitore dei due filtri: nascosto se nessuno dei due serve. */
  riga: HTMLElement;
  carrozzeria: HTMLSelectElement;
  potenza: HTMLSelectElement;
}

export interface Menu {
  /** Anno di immatricolazione: filtra i tre menu. Valore vuoto = tutti gli anni. */
  anno?: HTMLSelectElement;
  marca: HTMLSelectElement;
  modello: HTMLSelectElement;
  allestimento: HTMLSelectElement;
  stato: HTMLElement;
  filtri?: Filtri;
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

/** Le voci di un filtro: (valore, etichetta) già in ordine, e se qualche versione non dice il
 * valore (voce "Non indicata"). */
interface Voci {
  valori: Array<[string, string]>;
  mancanti: boolean;
}

function vociCarrozzeria(vs: api.Allestimento[]): Voci {
  const nomi = [...new Set(vs.map((v) => v.carrozzeria).filter((c): c is string => !!c))];
  return {
    valori: nomi.sort((a, b) => a.localeCompare(b, "it")).map((c) => [c, c]),
    mancanti: vs.some((v) => !v.carrozzeria),
  };
}

function vociPotenza(vs: api.Allestimento[]): Voci {
  const potenze = new Map<number, number | null>();
  for (const v of vs) if (v.cv !== null) potenze.set(v.cv, v.kw);
  return {
    valori: [...potenze]
      .sort(([a], [b]) => a - b)
      .map(([cv, kw]) => [String(cv), kw === null ? `${cv} CV` : `${cv} CV · ${kw} kW`]),
    mancanti: vs.some((v) => v.cv === null),
  };
}

/** Vero se il filtro offre almeno una scelta vera. */
const utile = (v: Voci) => v.valori.length > 0 && v.valori.length + (v.mancanti ? 1 : 0) >= 2;

/** Riempie un filtro, tenendo la scelta di prima se c'è ancora. */
function riempiFiltro(sel: HTMLSelectElement, { valori, mancanti }: Voci) {
  const prima = sel.value;
  sel.replaceChildren(new Option("Tutte", ""));
  for (const [valore, etichetta] of valori) sel.add(new Option(etichetta, valore));
  if (mancanti && valori.length) sel.add(new Option("Non indicata", NON_INDICATA));
  if (!riseleziona(sel, prima)) sel.value = "";
}

const chiaveCarrozzeria = (v: api.Allestimento) => v.carrozzeria ?? NON_INDICATA;
const chiavePotenza = (v: api.Allestimento) => (v.cv === null ? NON_INDICATA : String(v.cv));

export function collega(m: Menu): void {
  const anno = () => (m.anno?.value ? +m.anno.value : null);
  // "Nessun modello nel 2008" / "Nessun modello trovato"; nessuna() per il femminile (marca)
  const nessuno = (cosa: string) => (anno() ? `Nessun${cosa} nel ${anno()}` : `Nessun${cosa} trovato`);
  const nessuna = (cosa: string) => (anno() ? `Nessun${cosa} nel ${anno()}` : `Nessun${cosa} trovata`);

  // Per ogni menu vale solo l'ultima richiesta: una risposta lenta di prima (anno cambiato due
  // volte di fila) non deve sovrascrivere quella nuova.
  const ultima = new Map<HTMLSelectElement, number>();
  // Le versioni del modello scelto, prima dei filtri.
  let versioni: api.Allestimento[] = [];

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

  function nascondiFiltri() {
    if (m.filtri) m.filtri.riga.hidden = true;
  }

  /** Filtri per carrozzeria e potenza, solo se le versioni sono tante e c'è qualcosa da scegliere. */
  function preparaFiltri() {
    const f = m.filtri;
    if (!f) return;
    if (versioni.length <= SOGLIA_FILTRI) return nascondiFiltri();
    const carrozzerie = vociCarrozzeria(versioni);
    f.carrozzeria.value = "";
    f.potenza.value = "";
    riempiFiltro(f.carrozzeria, carrozzerie);
    // quali filtri mostrare si decide su tutte le versioni del modello, non cambia con la scelta
    // il select sta in un contenitore con la sua etichetta: si nasconde quello
    const perCarrozzeria = utile(carrozzerie);
    const perPotenza = utile(vociPotenza(versioni));
    (f.carrozzeria.parentElement as HTMLElement).hidden = !perCarrozzeria;
    (f.potenza.parentElement as HTMLElement).hidden = !perPotenza;
    f.riga.hidden = !(perCarrozzeria || perPotenza);
    aggiornaPotenze();
  }

  /** Le potenze che esistono con la carrozzeria scelta (tutte, se non ne è scelta nessuna). */
  function aggiornaPotenze() {
    const f = m.filtri;
    if (!f) return;
    const c = f.carrozzeria.value;
    riempiFiltro(f.potenza, vociPotenza(c ? versioni.filter((v) => chiaveCarrozzeria(v) === c) : versioni));
  }

  /** Il menu delle versioni con i filtri applicati; tiene la scelta se passa ancora i filtri. */
  function mostraVersioni(): void {
    const f = m.filtri;
    const scelta = m.allestimento.value;
    const voci = versioni.filter(
      (v) =>
        !f || f.riga.hidden ||
        ((!f.carrozzeria.value || chiaveCarrozzeria(v) === f.carrozzeria.value) &&
          (!f.potenza.value || chiavePotenza(v) === f.potenza.value)),
    );
    riempi(
      m.allestimento,
      voci.map((v) => ({
        id: v.id,
        label: v.name + (v.fuel ? ` · ${v.fuel}` : "") + (v.origin === "llm" ? AI : ""),
      })),
      voci.length
        ? "Scegli motore e allestimento"
        : versioni.length
          ? "Nessuna versione con questi filtri"
          : nessuno(" allestimento"),
    );
    if (!riseleziona(m.allestimento, scelta) && scelta) m.suScelta(null);
  }

  async function caricaModelli(): Promise<boolean> {
    nascondiFiltri();
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
    nascondiFiltri();
    if (!m.modello.value) {
      reset(m.allestimento, "Prima scegli il modello");
      return false;
    }
    const voci = await carica(m.allestimento, "Sto cercando i motori di questo modello…", () =>
      api.allestimenti(+m.modello.value, anno()),
    );
    if (!voci) return false;
    versioni = voci;
    preparaFiltri();
    mostraVersioni();
    return true;
  }


  m.marca.addEventListener("change", () => void caricaModelli());
  m.modello.addEventListener("change", () => void caricaAllestimenti());
  m.filtri?.carrozzeria.addEventListener("change", () => {
    aggiornaPotenze();
    mostraVersioni();
  });
  m.filtri?.potenza.addEventListener("change", mostraVersioni);
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
    nascondiFiltri();
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
