# Vlookar — sito

Il sito di Vlookar: scelta del veicolo (anno → marca → modello → allestimento) e scheda con prezzo,
assicurazione, bollo e problemi tipici. Astro, sito statico.

**Il resto del progetto sta nel repository del backend**, `quake1234/Vroomy-be` (in locale
`../vroomy-backend`): regole non negoziabili, architettura, piano tecnico e handoff sono nel suo
`CLAUDE.md`. Leggilo prima di una modifica che non sia solo grafica. Il contratto tra i due è
l'API REST del backend (`/docs`).

## Regole del sito

- **Nessun calcolo nel frontend.** Il sito mostra valori già calcolati dal backend; un calcolo
  qui va spostato in `backend/core/`.
- **Ogni valore mostra da dove viene**: dato ufficiale o stima LLM, mai confusi.
- Data di nascita, classe di merito e via vanno solo nel corpo di una `POST`, mai in un URL.
- Tutte le chiamate al backend passano da `src/lib/api.ts`; quelle a Supabase Auth (accesso,
  pagina `/login`) solo da `src/lib/accesso.ts`. Chi ha fatto accesso ha i dati nel profilo del
  backend (`/profile`), non nel localStorage.
- **Accesso obbligatorio**: ogni pagina usa `layouts/Base.astro`, che senza accesso porta a
  `/login`; solo `/login` passa `pubblica`. Chi carica dati li chiede dopo
  `ipotesi.attendi()` (o `accesso.accessoVerificato()`), mai prima.
- **Tutti gli URL sono in inglese**: pagine (`/car`, `/login`), parametri (`?id=`, `?year=`,
  `?km=`, `?mode=`, `?next=`) e endpoint del backend. Testi e codice restano in italiano.

## Claude Code

Questo repository ha il suo `.claude/`: l'agente `revisore-sito` (da usare dopo una modifica,
prima di considerarla chiusa) e la skill `avvia-sito` (Postgres e backend da
`../vroomy-backend`, sito da qui). Agenti e skill su dati, fonti, bollo e catalogo stanno nel
repository del backend: per quel lavoro apri la sessione in `../vroomy-backend`. Lo stato del
lavoro e i prossimi passi sono in `../vroomy-backend/docs/HANDOFF.md`.

## Comandi

```bash
npm install
npm run dev      # http://localhost:4321; il backend in locale su http://127.0.0.1:8000
npm run build    # sito statico in dist/
```

`PUBLIC_API_URL` è l'indirizzo del backend (predefinito `http://127.0.0.1:8000`, senza `/`
finale: `api.ts` ci attacca i percorsi). Il backend deve avere l'origine del sito in
`CORS_ORIGINS`. `PUBLIC_SUPABASE_URL` e `PUBLIC_SUPABASE_ANON_KEY` (chiave pubblica, mai la
service_role) attivano l'accesso; senza, il sito lo nasconde e i dati restano nel browser.

**Produzione**: progetto Vercel `vroomy-fe`, https://vroomy-fe.vercel.app, preset Astro
(`vercel.json`), `PUBLIC_API_URL=https://vroomy-two.vercel.app`. Ogni push sul branch di
produzione pubblica solo il sito.

---

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
