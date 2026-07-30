# Aurora Program

A long, finite, Kittens-Game-style incremental about building a space program. Web-first (desktop + mobile responsive); Android and monetization are post-launch, with no code in v1.

Full design docs live in [`docs/`](docs) — `GDD.md` (design), `ECONOMY_MODEL.md` (values), `SPRINTS.md` (build plan), `UI_SPEC.md` (interface), `NARRATIVE_EVENTS.md` (all game text), `PROGRESS.md` (sprint history).

## Requirements

- Node.js >= 24.14.1 (enforced — `npm install` fails fast with a clear error on an older version; see `engines` in `package.json` and `.npmrc`'s `engine-strict`)

## Setup

```bash
git clone https://github.com/NicolasAbad/Aurora.git
cd Aurora
npm install
```

## Run

```bash
npm run dev       # local dev server (Vite)
npm run build     # production build
npm run preview   # preview a production build locally
npm test          # test suite (Vitest)
npm run lint       # ESLint
npm run sim        # headless economy balance simulator (dev-only, sim/run.ts)
```
