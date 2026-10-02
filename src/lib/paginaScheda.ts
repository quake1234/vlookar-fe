// La logica della pagina scheda, condivisa da /car e /car-old: le due pagine hanno gli stessi id e
// cambiano solo la grafica. Qui si leggono i dati dal backend e si riempie la pagina; nessun calcolo.

import * as api from "./api";
import type { Intervallo, IntervalloConNota, Intervento, Problema, Scheda } from "./api";
import { cifra, svuota } from "./anima";
import { esc, formatData, formatEuro, formatEuroCent, formatIntervallo, formatIntero, formatNumero, nomeLeggibile } from "./formato";
import * as ipotesi from "./ipotesi";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const attesa = $("attesa");
const errore = $("errore");
const senzaStima = $("senza-stima");
const servonoDati = $("servono-dati");
const calcolatore = $("calcolatore");
const resto = $("resto");
const mini = $("mini");

// Testata compatta: compare quando il nome dell'auto passa sotto la barra del sito.
const compatta = $("compatta");
let compattaPronta = false;   // i nomi arrivano con la scheda
new IntersectionObserver(([e]) => {
  compatta.classList.toggle("visibile", compattaPronta && !e.isIntersecting && e.boundingClientRect.top < 57);
}, { rootMargin: "-57px 0px 0px 0px" }).observe(document.querySelector(".testata-nome")!);
const mantenimento = $("mantenimento");

const id = Number(new URLSearchParams(location.search).get("id"));

// ---------------------------------------------------------------- stato

const anno = ipotesi.annoDaUrl(location.search);   // dell'auto cercata, scelto nella home; null = nuova
const km = ipotesi.kmDaUrl(location.search);       // dell'auto cercata, fascia scelta nella home; null = non indicata

function parametri(i: ipotesi.Ipotesi | null): api.ParametriScheda {
  return { regione: i?.regione, anno, km, nascita: i?.nascita, classe: i?.classe, indirizzo: i?.indirizzo };
}

/** I dati con cui sono calcolati i costi, in sola lettura. */
function mostraProfilo(i: ipotesi.Ipotesi) {
  const regione = ipotesi.nomeRegione(i.regione) ?? i.regione;
  const voci: Array<[string, string]> = [
    ["Dove vivi", i.indirizzo ? `${i.indirizzo.etichetta}, ${regione}` : regione],
    ["Auto", anno ? `Immatricolata nel ${anno}` : "Nuova"],
    ["Chilometri", km !== null ? ipotesi.nomeFasciaKm(km) : "Non indicati"],
    ["Data di nascita", i.nascita ? formatData(i.nascita) : "Non indicata"],
    ["Classe di merito", ipotesi.nomeClasse(i.classe) ?? "Non indicata"],
  ];
  $("profilo-dati").innerHTML = voci.map(([k, v]) => `<div><dt class="etichetta">${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  $("profilo").hidden = false;
}

// ---------------------------------------------------------------- testi

const ETICHETTA: Record<string, string> = { ufficiale: "Dato ufficiale", stima_llm: "Stima AI", calcolato: "Calcolato" };
const origine = (o: string) => `<span class="origine origine-${esc(o)}">${ETICHETTA[o] ?? esc(o)}</span>`;
const intervallo = (r: Intervallo | null | undefined) => formatIntervallo(r ?? null);
const frase = (n: string) => n[0].toUpperCase() + n.slice(1) + ".";
const MANCA: Record<string, string> = { assicurazione: "l'assicurazione", bollo: "il bollo", tagliando: "il tagliando" };

/** ['assicurazione', 'bollo'] → "Mancano l'assicurazione e il bollo" */
function elencoMancanti(chiavi: string[]): string {
  const voci = chiavi.map((k) => MANCA[k] ?? k);
  const testo = voci.length > 1 ? voci.slice(0, -1).join(", ") + " e " + voci.at(-1) : voci[0] ?? "";
  return (voci.length > 1 ? "Mancano " : "Manca ") + testo;
}

// ---------------------------------------------------------------- stima generale

// Esito dell'ultima richiesta della stima generale: 'limite' | 'errore' | null. Finché manca,
// la scheda mostra ciò che è già pronto (bollo, dati ufficiali) e "In calcolo…" sul resto.
let esitoStima: string | null = null;
const stimaInAttesa = (s: Scheda) => s.stima_da_calcolare && esitoStima === null;
const IN_CALCOLO = `<small>In calcolo…</small>`;

// ---------------------------------------------------------------- assicurazione personalizzata

// Esito dell'ultima richiesta di stima personalizzata: 'limite' | 'errore' | null.
let esitoAssicurazione: string | null = null;
const inAttesa = (c: Scheda) => !!c.assicurazione?.da_calcolare && esitoAssicurazione === null;

function perChi(a: NonNullable<Scheda["assicurazione"]>): string {
  if (!a.personalizzata) return "Media italiana, 1ª classe di merito.";
  const parti = [a.eta !== null ? `${a.eta} anni` : null, a.classe ? ipotesi.nomeClasse(a.classe) : null, a.luogo].filter(Boolean);
  return `Per te: ${parti.join(", ")}.`;
}

function notaEsitoAssicurazione(): string {
  if (esitoAssicurazione === "limite") return "Troppe richieste nell'ultima ora: la stima su misura arriverà più tardi.";
  if (esitoAssicurazione === "errore") return "La stima su misura non è disponibile ora: riprova più tardi.";
  return "";
}

// ---------------------------------------------------------------- stima per chilometraggio

// Esito dell'ultima richiesta di stima per anno e km: 'limite' | 'errore' | null.
let esitoUsura: string | null = null;
const usuraInAttesa = (s: Scheda) => !!s.usura?.da_calcolare && esitoUsura === null;
/** La stima per chilometraggio, se è pronta. */
const usuraPronta = (s: Scheda) => (s.usura && !s.usura.da_calcolare ? s.usura : null);

function notaUsura(s: Scheda): string {
  if (!s.usura?.da_calcolare) return "";
  if (esitoUsura === "limite") return `Troppe richieste nell'ultima ora: la stima per ${s.usura.fascia_km} arriverà più tardi.`;
  if (esitoUsura === "errore") return `La stima per ${s.usura.fascia_km} non è disponibile ora: riprova più tardi.`;
  return `Stiamo stimando prezzo, manutenzione e problemi per ${s.usura.fascia_km}: può volerci fino a un minuto.`;
}

// ---------------------------------------------------------------- voci di costo e totale

function dettaglioBollo(b: Scheda["bollo"]): string {
  const righe: string[] = [];
  if (b.input) {
    const euro = b.input.euro_class?.replace(/^\s*euro\s*/i, "");
    const da = b.input.origine === "ufficiale" ? "dati ufficiali" : "stima AI";
    righe.push(`${esc(b.input.kw)} kW` + (euro ? `, Euro ${esc(euro)}` : "") + ` (da ${da})`);
  }
  if (b.regione_applicata) righe.push(`tariffa ${esc(ipotesi.nomeRegione(b.regione_applicata) ?? b.regione_applicata)}`);
  if (b.importo !== null && b.superbollo) righe.push(`di cui superbollo ${esc(formatEuroCent(b.superbollo))}`);
  const testo = righe.length ? esc(frase(righe.join(", "))) + " " : "";
  const note = b.note.map((n) => esc(frase(n))).join(" ");
  const fonte = (f: { name: string; url?: string | null }) =>
    `Fonte: ${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a>` : esc(f.name)}.`;
  const fonti = (b.fonti ?? []).map(fonte).join(" ");
  // Eccezioni non calcolate: una riga ciascuna, con l'asterisco che richiama quello sul titolo.
  const eccezioni = (b.eccezioni ?? [])
    .map((e) => `<span class="eccezione">* ${esc(frase(e.testo))}${e.fonte ? " " + fonte(e.fonte) : ""}</span>`)
    .join("");
  return [testo, note, fonti].filter(Boolean).join(" ") + eccezioni;
}

function noteTagliando(c: Scheda): string {
  const t = c.tagliando;
  if (!t) return "";
  const note: string[] = [];
  if (t.intervallo_km || t.intervallo_mesi) {
    note.push("Ogni " + [t.intervallo_km ? `${formatNumero(t.intervallo_km)} km` : "", t.intervallo_mesi ? `${t.intervallo_mesi} mesi` : ""]
      .filter(Boolean).join(" o ") + ".");
  }
  for (const n of t.note) note.push(frase(n));
  if (t.nota) note.push(t.nota);
  return note.join(" ");
}

function importo(el: HTMLElement, r: Intervallo | null, testoVuoto = "Non disponibile") {
  if (!r) {
    el.innerHTML = `<small>${esc(testoVuoto)}</small>`;
    return;
  }
  el.textContent = intervallo(r);
}

function renderVoci(c: Scheda) {
  const b = $("bollo-importo");
  // senza potenza ufficiale il bollo aspetta i kW della stima
  const bolloInAttesa = c.bollo.importo === null && stimaInAttesa(c);
  if (bolloInAttesa) b.innerHTML = IN_CALCOLO;
  else if (c.bollo.importo === null) b.innerHTML = `<small>Non calcolabile</small>`;
  else if (c.bollo.importo_pieno != null)
    // con esenzioni o riduzioni: sotto, l'importo pieno calcolato dal backend
    b.innerHTML = `${esc(formatEuroCent(c.bollo.importo))}<small class="importo-pieno">senza esenzioni né riduzioni ${esc(formatEuroCent(c.bollo.importo_pieno))}</small>`;
  else b.textContent = formatEuroCent(c.bollo.importo);
  $("bollo-nota").innerHTML = bolloInAttesa ? "Aspettiamo la potenza del motore dalla stima." : dettaglioBollo(c.bollo);
  $("bollo-asterisco").hidden = !c.bollo.eccezioni?.length;

  const ass = c.assicurazione;
  if (inAttesa(c) || (!ass && stimaInAttesa(c))) $("ass-importo").innerHTML = IN_CALCOLO;
  else importo($("ass-importo"), ass && ass.min !== null && ass.max !== null ? { min: ass.min, max: ass.max } : null);
  $("ass-per-chi").textContent = ass
    ? (inAttesa(c) ? "Stiamo stimando il premio con la tua età, la tua classe e la tua via: può volerci fino a un minuto." : perChi(ass))
    : "";
  $("ass-nota").textContent = ass && !inAttesa(c)
    ? [ass.fascia ? `Guidatore ${ass.fascia}${ass.eta !== null ? ` (hai ${ass.eta} anni)` : ""}.` : "",
       ...ass.note.map(frase), notaEsitoAssicurazione(), ass.nota ?? ""].filter(Boolean).join(" ")
    : "";

  const tagliando = (el: HTMLElement, r: Intervallo | null | undefined) => {
    if (!c.tagliando && stimaInAttesa(c)) el.innerHTML = IN_CALCOLO;
    else el.textContent = intervallo(r) ?? "Non disponibile";
  };
  tagliando($("tag-aut"), c.tagliando?.officina_autorizzata);
  tagliando($("tag-mec"), c.tagliando?.meccanico);
  $("tag-nota").textContent = noteTagliando(c);
}

/** Il quadrante di /car (su /car-old non c'è): cifre delle tacche lunghe e posizioni della
 *  lancetta, così come arrivano dal backend. Senza scala: cifre vuote, lancetta a riposo. */
function renderQuadrante(q: Scheda["mantenimento"]["quadrante"]) {
  const scala = document.querySelector<SVGElement>(".scala");
  if (!scala) return;
  scala.querySelectorAll(".cifra-scala").forEach((el, i) => {
    el.textContent = q ? formatIntero(q.tacche[i]) : "";
  });
  if (q) {
    scala.style.setProperty("--min", String(q.min_pct));
    scala.style.setProperty("--max", String(q.max_pct));
    // la lancetta parte con l'accelerazione solo all'arrivo della scala, non a ogni ridisegno
    scala.classList.add("pronta");
  } else {
    scala.classList.remove("pronta");
    scala.style.removeProperty("--min");
    scala.style.removeProperty("--max");
  }
}

function renderTotale(c: Scheda) {
  const m = c.mantenimento;
  const totale = $("totale");
  const stato = $("totale-stato");
  const min = $("tot-min");
  const max = $("tot-max");
  const manca = m.min === null || m.max === null;
  const aspetta = inAttesa(c) || (manca && stimaInAttesa(c));
  totale.classList.toggle("in-attesa", aspetta);

  renderQuadrante(inAttesa(c) ? null : m.quadrante ?? null);
  if (inAttesa(c) || m.min === null || m.max === null) {
    svuota(min, "—");
    svuota(max, "—");
    $("mini-valore").textContent = "—";
    stato.textContent = inAttesa(c) ? "Stiamo stimando la tua assicurazione."
      : aspetta ? "Stiamo stimando assicurazione e tagliando."
      : elencoMancanti(m.mancano) + ": totale non calcolabile.";
    stato.hidden = false;
    return;
  }
  stato.hidden = true;
  cifra(min, m.min);
  cifra(max, m.max);
  $("mini-valore").textContent = `${formatIntero(m.min)} – ${formatEuro(m.max)}`;
}


function renderCosti(c: Scheda) {
  renderVoci(c);
  renderTotale(c);
  calcolatore.hidden = false;
  mantenimento.hidden = false;
  mini.hidden = false;
}

// ---------------------------------------------------------------- testata e resto della scheda

function renderTesta(s: Scheda) {
  const a = s.allestimento;
  const marca = nomeLeggibile(a.marca);
  const modello = nomeLeggibile(a.modello);
  document.title = `${marca} ${modello} ${a.nome} — Vroomy`;
  $("titolo").textContent = `${marca} ${modello}`;
  $("sottotitolo").textContent = a.nome;
  $("compatta-nome").textContent = `${marca} ${modello}`;
  $("compatta-versione").textContent = a.nome;
  compattaPronta = true;
  $("bc-marca").textContent = marca;
  $("bc-modello").textContent = modello;

  const st = s.stima;
  // le note sul prezzo sono lunghe: stanno nel blocco "Prezzo", sotto il calcolatore
  const prezzo = (r: IntervalloConNota | null | undefined) => r
    ? esc(intervallo(r))
    : `<span class="spec-nota">Non disponibile</span>`;
  const spec: Array<[string, string, string | null]> = [];
  if (a.alimentazione) spec.push(["Alimentazione", esc(a.alimentazione), null]);
  if (a.in_produzione !== null) spec.push(["Stato", a.in_produzione ? "In vendita" : "Fuori produzione", null]);
  if (s.dati_ufficiali) spec.push(["Motore", esc(s.dati_ufficiali.codice_motore), "ufficiale"]);
  const inCalcolo = `<span class="spec-nota">In calcolo…</span>`;
  if (st && (a.in_produzione !== false || st.prezzo_nuovo_eur)) spec.push(["Prezzo da nuova", prezzo(st.prezzo_nuovo_eur), "stima_llm"]);
  else if (stimaInAttesa(s) && a.in_produzione !== false) spec.push(["Prezzo da nuova", inCalcolo, "stima_llm"]);
  const u = usuraPronta(s);
  if (u) spec.push([`Prezzo usata, ${u.fascia_km}`, prezzo(u.prezzo_usato_eur), "stima_llm"]);
  else if (usuraInAttesa(s)) spec.push(["Prezzo usata", `<span class="spec-nota">In calcolo per ${esc(s.usura!.fascia_km)}…</span>`, "stima_llm"]);
  else if (st) spec.push(["Prezzo usata", prezzo(st.prezzo_usato_eur), "stima_llm"]);
  else if (stimaInAttesa(s)) spec.push(["Prezzo usata", inCalcolo, "stima_llm"]);
  const dl = $("specifiche");
  dl.innerHTML = spec.map(([k, v, o]) => `<div><dt class="etichetta">${esc(k)}</dt><dd>${v}</dd>${o ? origine(o) : ""}</div>`).join("");
  dl.hidden = spec.length === 0;
}

function blocco(titolo: string, o: string | null, corpo: string) {
  return `<section class="blocco">
    <div class="blocco-titolo"><h2>${esc(titolo)}</h2>${o ? origine(o) : ""}</div>
    <div class="blocco-corpo">${corpo}</div>
  </section>`;
}

function costiRiparazione(r: { costo_officina_autorizzata_eur?: Intervallo | null; costo_meccanico_eur?: Intervallo | null }): string {
  return [
    r.costo_officina_autorizzata_eur ? `<span>Officina autorizzata <strong>${esc(intervallo(r.costo_officina_autorizzata_eur))}</strong></span>` : "",
    r.costo_meccanico_eur ? `<span>Meccanico di fiducia <strong>${esc(intervallo(r.costo_meccanico_eur))}</strong></span>` : "",
  ].join("");
}

function listaProblemi(problemi: Problema[]): string {
  return `<ul class="elenco">${problemi.map((p) => {
    const costi = costiRiparazione(p) || (p.costo_riparazione_testo
      ? `<span>Riparazione: <strong>${esc(p.costo_riparazione_testo)}</strong></span>` : "");
    return `<li>
      <div class="problema-testa"><strong>${esc(p.titolo)}</strong>${p.gravita ? `<span class="gravita gravita-${esc(p.gravita)}">Gravità ${esc(p.gravita)}</span>` : ""}</div>
      <p>${esc(p.descrizione)}</p>
      ${costi ? `<div class="costi-riparazione">${costi}</div>` : ""}
    </li>`;
  }).join("")}</ul>`;
}

function listaInterventi(interventi: Intervento[]): string {
  return `<ul class="elenco">${interventi.map((i) => {
    const costi = costiRiparazione(i);
    return `<li>
      <div class="problema-testa"><strong>${esc(i.titolo)}</strong>${i.entro_km ? `<span class="gravita">A ${esc(formatNumero(i.entro_km))} km</span>` : ""}</div>
      <p>${esc(i.descrizione)}</p>
      ${costi ? `<div class="costi-riparazione">${costi}</div>` : ""}
    </li>`;
  }).join("")}</ul>`;
}

function renderResto(s: Scheda) {
  const st = s.stima;
  const usu = usuraPronta(s);
  const parti: string[] = [];
  const attesaUsura = notaUsura(s) ? `<p class="nota-fonte">${esc(notaUsura(s))}</p>` : "";
  // con i km indicati vale il prezzo dell'usata per quei km, non quello medio
  const usata = usu ? usu.prezzo_usato_eur : st?.prezzo_usato_eur;
  const note = [
    st?.prezzo_nuovo_eur?.nota ? `<li><strong>Da nuova, ${esc(intervallo(st.prezzo_nuovo_eur))}</strong><p>${esc(st.prezzo_nuovo_eur.nota)}</p></li>` : "",
    usata?.nota ? `<li><strong>Usata${usu ? ` con ${esc(usu.fascia_km)}` : ""}, ${esc(intervallo(usata))}</strong><p>${esc(usata.nota)}</p></li>` : "",
  ].join("");
  if (note || attesaUsura) parti.push(blocco("Prezzo", "stima_llm", (note ? `<ul class="elenco">${note}</ul>` : "") + attesaUsura));
  if (st?.testo) parti.push(blocco("In breve", "stima_llm", `<p>${esc(st.testo)}</p>`));

  if (usu) {
    parti.push(blocco(`Manutenzione a ${usu.fascia_km}`, "stima_llm", usu.interventi.length
      ? listaInterventi(usu.interventi) + `<p class="nota-fonte">Interventi oltre il tagliando ordinario: non sono compresi nel mantenimento annuo.</p>`
      : `<p class="muted">Nessun intervento particolare previsto a questo chilometraggio, oltre al tagliando ordinario.</p>`));
  }

  // problemi: quelli a quel chilometraggio se ci sono, altrimenti quelli del modello in generale
  if (usu && usu.problemi.length) {
    parti.push(blocco(`Problemi tipici a ${usu.fascia_km}`, "stima_llm", listaProblemi(usu.problemi)));
  } else if (st) {
    parti.push(blocco("Problemi tipici", "stima_llm", (st.problemi.length
      ? listaProblemi(st.problemi)
      : `<p class="muted">Nessun problema tipico segnalato.</p>`)
      + (usu ? `<p class="nota-fonte">Nessun problema specifico segnalato a ${esc(usu.fascia_km)}: questi sono i problemi del modello in generale.</p>` : "")));
  }

  if (st) {
    if (st.richiami?.length) {
      parti.push(blocco("Richiami ufficiali", "stima_llm", `
        <ul class="elenco">${st.richiami.map((r) => `<li><strong>${esc(r.descrizione)}</strong>
          ${r.periodo ? `<p>Esemplari prodotti: ${esc(r.periodo)}</p>` : ""}</li>`).join("")}</ul>
        <p class="nota-fonte">I richiami sono gratuiti presso la rete ufficiale: con il numero di telaio si verifica se sono stati eseguiti.</p>`));
    }
    if (st.cosa_controllare?.length) {
      parti.push(blocco("Prima di comprarla usata", "stima_llm",
        `<ul class="elenco">${st.cosa_controllare.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`));
    }
  }

  const u = s.dati_ufficiali;
  if (u && u.bocciature_mot.length) {
    const fonte = u.bocciature_mot[0];
    const righe = u.bocciature_mot.map((m) => `<div class="mot-riga">
      <span class="mot-eta">${esc(m.age_years)} anni</span>
      <div class="mot-traccia"><div class="mot-barra" style="width:${Number(m.barra)}%"></div></div>
      <span class="mot-num">${esc(formatNumero(m.fail_pct))}%</span>
      ${m.media_parco_pct !== null && m.barra_media !== null ? `<div class="mot-traccia"><div class="mot-barra media" style="width:${Number(m.barra_media)}%"></div></div>
        <span class="mot-num muted">${esc(formatNumero(m.media_parco_pct))}%</span>` : ""}
    </div>`).join("");
    parti.push(blocco("Affidabilità alla revisione UK", "ufficiale", `
      <p class="mot-legenda"><span>Motore ${esc(u.codice_motore)}</span><span class="l-media">Media delle auto della stessa età</span></p>
      <div class="mot">${righe}</div>
      <p class="nota-fonte">Percentuale di auto bocciate alla revisione britannica (MOT). Fonte: ${fonte.fonte_url
        ? `<a href="${esc(fonte.fonte_url)}" target="_blank" rel="noopener">${esc(fonte.fonte)}</a>` : esc(fonte.fonte)}</p>`));
  }

  if (st) {
    const perKm = usu?.modello_llm && usu.data ? ` Stima per ${esc(usu.fascia_km)} generata da ${esc(usu.modello_llm)} il ${esc(formatData(usu.data))}.` : "";
    parti.push(`<p class="nota-finale">Stime AI generate da ${esc(st.modello_llm)} il ${esc(formatData(st.data))}.${perKm} Sono indicative: verificale prima di decidere.</p>`);
  }
  resto.innerHTML = parti.join("");
  resto.hidden = parti.length === 0;
}

function renderSenzaStima(s: Scheda) {
  attesa.hidden = !stimaInAttesa(s);
  if (s.stima || !s.stima_da_calcolare || esitoStima === null) {
    senzaStima.hidden = true;
    return;
  }
  senzaStima.innerHTML = `<p>${esc(esitoStima === "limite"
    ? "Abbiamo ricevuto troppe richieste nell'ultima ora. Riprova più tardi per vedere prezzo, assicurazione, tagliando e problemi tipici."
    : "Il servizio di stima non risponde in questo momento. Riprova tra poco per vedere prezzo, assicurazione, tagliando e problemi tipici.")}</p>
    <button type="button" class="btn" data-riprova>Riprova</button>`;
  senzaStima.hidden = false;
}

// L'ultima scheda mostrata: assicurazione e stima per km arrivano in parallelo, e chi finisce con
// un errore ridisegna questa, non la scheda di partenza (perderebbe ciò che l'altra ha portato).
let mostrata: Scheda | null = null;

function render(s: Scheda) {
  mostrata = s;
  renderTesta(s);
  renderSenzaStima(s);
  renderResto(s);
  renderCosti(s);
}

// ---------------------------------------------------------------- caricamento

let turnoCarica = 0;
// La data si decide sulla prima risposta: le ricariche della stessa visita trovano la riga appena
// creata, e non devono presentarla come una scheda già vista.
let creataDecisa = false;
function mostraCreata(s: Scheda) {
  if (creataDecisa || !s.cronologia) return;
  creataDecisa = true;
  if (s.cronologia.nuova) return;
  const el = $("creata");
  el.innerHTML = `Scheda creata il <a href="/history">${esc(formatData(s.cronologia.creata_il))}</a>`;
  el.hidden = false;
}

// Stima generale, assicurazione e stima per km arrivano in parallelo, e ognuna ricarica la
// scheda. Una richiesta partita dopo vede tutto ciò che hanno visto quelle partite prima: si
// mostra solo la più recente, così una risposta lenta non ridisegna uno stato vecchio.
let richiesta = 0;
let mostrataRichiesta = 0;

async function ricarica(p: api.ParametriScheda, turno: number): Promise<boolean> {
  const n = ++richiesta;
  try {
    const s = await api.scheda(id, p);
    if (turno === turnoCarica && n > mostrataRichiesta) {
      mostrataRichiesta = n;
      render(s);
    }
    return true;
  } catch {
    return false;
  }
}

/** Se la scheda aspetta una stima (serve), la chiede e poi ricarica la scheda. Con limite o
 *  errore annota l'esito e ridisegna l'ultima scheda mostrata. */
async function completa(serve: boolean, chiedi: () => Promise<api.StatoStima>,
                        annota: (esito: string) => void, s: Scheda, p: api.ParametriScheda, turno: number) {
  if (!serve) return;
  let stato: string;
  try {
    stato = (await chiedi()).stato;
  } catch {
    stato = "errore";
  }
  if (turno !== turnoCarica) return;   // nel frattempo l'utente ha cambiato dati
  if (stato === "pronta" && await ricarica(p, turno)) return;
  if (turno !== turnoCarica) return;
  annota(stato === "pronta" ? "errore" : stato);
  render(mostrata ?? s);
}

async function carica(i: ipotesi.Ipotesi | null) {
  const turno = ++turnoCarica;
  esitoStima = null;
  esitoAssicurazione = null;
  esitoUsura = null;
  errore.hidden = true;
  const p = parametri(i);
  const n = ++richiesta;
  try {
    const s = await api.scheda(id, p);   // solo cache: risponde subito
    if (turno !== turnoCarica) return;
    mostrataRichiesta = n;
    mostraCreata(s);
    render(s);
    completa(s.stima_da_calcolare, () => api.stima(id), (e) => (esitoStima = e), s, p, turno);
    completa(!!s.assicurazione?.da_calcolare, () => api.assicurazione(id, p), (e) => (esitoAssicurazione = e), s, p, turno);
    completa(!!s.usura?.da_calcolare, () => api.usura(id, p), (e) => (esitoUsura = e), s, p, turno);
  } catch (e) {
    if (turno !== turnoCarica) return;
    console.error(e);
    attesa.hidden = true;
    calcolatore.hidden = true;
    mantenimento.hidden = true;
    mini.hidden = true;
    if (e instanceof api.ErroreApi && e.status === 404) mostraErrore("Quest'auto non è nel nostro catalogo.", true);
    else mostraErrore("Non riusciamo a caricare la scheda. Controlla la connessione e riprova.");
  }
}

function mostraErrore(testo: string, versoHome = false) {
  errore.innerHTML = `<p>${esc(testo)}</p>` + (versoHome
    ? `<a class="btn" href="/">Scegli un'auto</a>`
    : `<button type="button" class="btn" data-riprova>Riprova</button>`);
  errore.hidden = false;
}

/** Dati assenti (primo accesso o cancellati): la scheda aspetta, e il form si apre. */
function chiediDati() {
  $("profilo").hidden = true;
  calcolatore.hidden = true;
  mantenimento.hidden = true;
  mini.hidden = true;
  resto.hidden = true;
  errore.hidden = true;
  attesa.hidden = true;
  senzaStima.hidden = true;
  servonoDati.hidden = false;
  ipotesi.apriDati();
}

// ---------------------------------------------------------------- eventi

$("modifica").addEventListener("click", ipotesi.apriDati);
$("inserisci-dati").addEventListener("click", ipotesi.apriDati);

// Dati salvati o cancellati dal form o dal menu utente.
ipotesi.suCambio((i) => {
  if (!Number.isInteger(id) || id <= 0) return;
  if (!i) return chiediDati();
  servonoDati.hidden = true;
  mostraProfilo(i);
  carica(i);
});

// "Riprova" compare sia nell'errore di rete sia quando manca la stima.
document.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest("[data-riprova]")) carica(ipotesi.leggi());
});

if (!Number.isInteger(id) || id <= 0) {
  mostraErrore("Nessuna auto selezionata.", true);
} else {
  await ipotesi.attendi();   // con l'accesso i dati arrivano dal backend
  const salvate = ipotesi.leggi();
  if (salvate) {
    mostraProfilo(salvate);
    carica(salvate);
  } else {
    chiediDati();
    // Nel frattempo si prepara la stima: la risposta finisce in cache e arriverà subito.
    api.stima(id).catch(() => {});
  }
}
