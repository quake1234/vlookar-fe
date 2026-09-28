---
name: avvia-sito
description: Avvia l'ambiente locale di Vroomy — Postgres e backend FastAPI da ../vroomy-backend, sito Astro da qui — e verifica che rispondano. Si attiva su "avvia il sito", "avvia server e frontend", "fai partire tutto", "lancia backend e sito", "ferma il sito".
---

# Avvia il sito in locale

Tre pezzi, in quest'ordine: Postgres, backend, sito. Postgres e backend stanno nel repository
del backend, nella cartella accanto (`../vroomy-backend/`); il sito è questo.

| Pezzo | Comando | Indirizzo |
| --- | --- | --- |
| Postgres | `docker compose up -d` in `../vroomy-backend/` | container `vroomy-db` |
| Backend | `.venv/Scripts/uvicorn backend.app:app --reload` in `../vroomy-backend/` | http://127.0.0.1:8000 (docs su `/docs`) |
| Sito | `npm run dev` | http://localhost:4321 |

## Passi

1. **Controlla cosa è già acceso**, per non avviare due volte lo stesso server:
   `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/openapi.json` e lo stesso su
   `http://localhost:4321/`. Se risponde 200, quel pezzo è già su: salta il suo avvio.

2. **Prerequisiti.** Se manca `node_modules/`, esegui `npm install`. Se manca
   `../vroomy-backend/.venv/`, crealo da `../vroomy-backend/`:
   `python -m venv .venv && .venv/Scripts/python -m pip install -r requirements-dev.txt`.
   Se manca `../vroomy-backend/.env`, fermati e chiedilo all'utente: contiene le chiavi, non
   leggerlo e non crearlo tu.

3. **Postgres**: `docker compose up -d` da `../vroomy-backend/`. Se Docker non risponde,
   fermati e chiedi all'utente di avviare Docker Desktop: il backend senza DB non serve.

4. **Backend**, in background (`run_in_background: true`), da `../vroomy-backend/`:
   `.venv/Scripts/uvicorn backend.app:app --reload`.
   È pronto quando nel log compare `Application startup complete`.

5. **Sito**, in background: `npm run dev`.
   Astro parte **staccato** (come demone): il comando termina subito con codice 0 e stampa
   `Dev server running at http://localhost:4321`. Non è un errore, il server resta acceso.

6. **Verifica** con una richiesta HTTP a entrambi gli indirizzi (ripeti dopo qualche secondo se
   il primo tentativo fallisce). Se uno non risponde, leggi il suo log di output prima di
   riprovare: di solito è una porta occupata, `.env` mancante o il DB spento.

7. **Riporta** all'utente i due indirizzi e come fermarli.

## Fermare

- Sito: `npx astro dev stop`.
- Backend: ferma il task in background (TaskStop), oppure termina il processo `uvicorn`.
- Postgres: `docker compose stop` da `../vroomy-backend/` — solo se l'utente lo chiede; i dati
  restano nel volume.

## Note

- Il sito chiama il backend a `PUBLIC_API_URL` (predefinito `http://127.0.0.1:8000`) e il
  backend accetta le origini in `CORS_ORIGINS` (predefinito `http://localhost:4321`). Se cambi
  una porta, allinea l'altra variabile.
- Aprire una scheda di un allestimento senza risposta in cache chiama l'LLM (~45 s e costa):
  per verificare che tutto funzioni bastano la home e `/docs`, non serve aprire schede.

La stessa skill esiste nel repository del backend, con i percorsi visti da lì: se ne cambi una,
allinea l'altra.
