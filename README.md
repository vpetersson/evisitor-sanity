# evisitor-sanity

Croatian eVisitor portal is beyond terrible. This brings sanity to it.

A modern, static, single-page tool that lets accommodation hosts enter overnight guests in a clean form and download a valid `TouristCheckIns.xml` file. Upload that file once via **Turisti → Prijava putem datoteke** in eVisitor and you're done. Everything runs in the browser; nothing is ever sent to a server.

- Built with **TypeScript** and **Tailwind v4**, bundled by **Bun**.
- No CDN, no analytics, no backend. Fonts and styles are self-hosted.
- Settings (Facility code, agency OIB, defaults) persist in `localStorage`.
- Designed to look unlike the official UI on purpose.

## Quickstart

```bash
bun install
bun run dev        # http://localhost:3000, watches src/
bun test           # bun's built-in test runner
bun run typecheck  # strict TypeScript
bun run build      # writes dist/, deployable to any static host
```

## How a host uses it

1. Open the page, expand **Settings**, save your Facility code (and optional Agency OIB / MUP code / default times). These stay on this device only.
2. Click **Add guest** for each overnight visitor. Required fields show inline; the bottom-right summary turns green when everything passes.
3. Click **Download XML**. Log in to eVisitor, go to **Turisti → Prijava putem datoteke**, and upload the file.

The file is XML that mirrors the public `ImportTourists` Web-API contract — the same import path eVisitor accepts behind the web form.

## Project layout

```
src/
  index.html        page shell
  main.ts           entry: wires DOM + state + actions
  state.ts          tourist list + settings + localStorage
  render.ts         DOM render (no framework)
  validation.ts     per-field + per-tourist validation
  xml.ts            XML escape + ImportTourists serializer
  countries.ts      ISO 3166-1 alpha-3 list
  document-types.ts document & payment-category lookups
  types.ts          domain types
  styles.css        Tailwind v4 + design tokens + @font-face
scripts/
  copy-html.ts      src/index.html → dist/
  copy-public.ts    public/* and font subsets → dist/
  dev.ts            watch + Bun.serve
tests/              bun test suites
.github/workflows/  GitHub Pages deploy
```

## Deployment

GitHub Pages is wired up via `.github/workflows/deploy.yml`. Enable Pages with source **GitHub Actions** in the repo settings; every push to `main` triggers a build of `dist/` and publishes it.

A custom domain later: drop a `CNAME` file into `public/` and configure the domain in the repo's Pages settings. All assets already use relative paths so nothing else changes.

## Known unknowns

The published Web-API wiki names every field but does not ship a sample XML. A few details will only be confirmable on first real upload — if eVisitor rejects the file, please open an issue with the error.

- Root element name. We emit `<TouristCheckIns>` wrapping `<TouristCheckIn>` children. If the live system wants a different root, change it in `src/xml.ts`.
- `Gender` is emitted as `M` / `F`. If eVisitor expects numeric codes, swap them in `src/types.ts` and `src/render.ts`.
- `DocumentType` is emitted as `Passport` / `IdentityCard` / `DriverLicense` / `OtherDocument`. The exact codes the system uses are not publicly documented; adjust `src/document-types.ts` if needed.
- `TTPaymentCategory` and `ArrivalOrganisation` (MUP code) are free-text. Their lookup tables are not publicly published.

## Disclaimer

Unofficial. Not affiliated with eVisitor, the Croatian Tourist Board, or any government body. Use at your own discretion. Always double-check the produced XML before uploading.
