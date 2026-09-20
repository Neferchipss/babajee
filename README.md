# babajee

Custom storefront + admin tool for Babajee, a smoking-accessories store.
Next.js 16 (App Router, TypeScript, Tailwind). Backend (Supabase) is not
wired up yet — pages currently run on static data.

The earlier pitch prototype lives in
[babajee-pitch](https://github.com/Neferchipss/babajee-pitch).

## Run

    npm install
    npm run dev

## Catalogue

`src/lib/catalog-data.json` is generated from the client's stock sheet:

    python tools/parse_stock.py

Reads `data/Stock_1.xlsx` (needs `openpyxl`). Re-run when the client sends an
updated sheet. The sheet has no prices, SKUs or images yet.
