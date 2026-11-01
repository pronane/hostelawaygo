# HostelAwayGo → **Away**

An event guide for hostel travellers — what's on **where you are**, and what'll be on **where you're going**.

## Where things stand

| | |
|---|---|
| **Working vertical slice** | [`apps/web`](apps/web) — Next.js PWA, SQLite, seeded Lisbon + Porto, real join flow, hostel posting. Run `cd apps/web && npm install && npm run dev`. |
| **Outreach tool** | [`apps/outreach`](apps/outreach) — finds hostels in a new city, drafts each one a letter, and sends nothing until a human approves it. Run `cd apps/outreach && npm run demo && npm start`. |
| **Install it** | [`install/`](install) — one command for macOS, Linux and Windows: checks what's already there, installs Node if it's missing, builds the database from the schema, then drives a real browser through every feature. `./install/install.sh` · `powershell -File install\install.ps1` |
| **Deploy it** | [`docs/deploy.md`](docs/deploy.md) — exactly what to click. Render: `render.yaml` ($7/mo, keeps your data) or `render.demo.yaml` (free, resets itself). Elsewhere: the `Dockerfile`. Then `node scripts/verify-deploy.mjs https://…`. Vercel needs `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` to keep data (two variables, no code change); without them it runs on a throwaway `/tmp` database and says so in `/api/health`. |
| **Concept prototype** | [`prototype/index.html`](prototype/index.html) — the original static click-through, kept for reference. |
| **Review & strategy** | [`docs/product-review-and-concept.md`](docs/product-review-and-concept.md) — repo audit, market check, gap analysis, MVP scope, data strategy, risks. |
| **Legacy code** | `app/`, `myapplication/`, `java/`, `res/`, `manifests/`, `gen/` — a 2017 Android Studio template, kept for history only. Not a foundation. |

## The product in one line

> What's on where you are, and what'll be on where you're going — built for people sleeping in hostels.

Two live windows (**HERE** / **NEXT**), with every listing scored for the solo arrival: price, walk time from your bed, whether you'll make the last metro.

## Decisions taken

- **Consumer-first city guide** — aggregate everything on, with a hostel lens, rather than a hostel SaaS first.
- **Web-first PWA** — opens from a QR code with no install; SEO on "what's on in \<city\>" is free acquisition.
- **Lisbon first** — dense, walkable independent hostel scene, year-round solo flow.

## Next

See §11 of the review. The obvious next steps: real hostel portal and auth, a city-event ingest pipeline (Ticketmaster first), and 10–15 founding Lisbon hostels.
