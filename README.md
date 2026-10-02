# Vlookar — website

The website of Vlookar: pick a vehicle (year → make → model → trim) and get a sheet with purchase
price, insurance, road tax and typical problems. Built with Astro as a static site.

The backend (FastAPI + Postgres, with an LLM used as a cache), the data sources and the project
rules live in [Vroomy-be](https://github.com/quake1234/Vroomy-be). This site calculates nothing:
it displays values computed by the backend, and always shows whether each one is official data or
an LLM estimate.

## Run locally

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # static site in dist/
```

The site calls the backend at `PUBLIC_API_URL` (default `http://127.0.0.1:8000`, no trailing
slash). The backend must list the site's origin in `CORS_ORIGINS`.

## Deployment

Vercel project with the Astro preset (`vercel.json`), `PUBLIC_API_URL` set to the backend URL.
