# Gloss AI

A browser extension that answers questions about the page you're reading, and keeps your notes and highlights attached to it.

## Repository

Two independent apps, each with its own `package.json` and `pnpm-lock.yaml`. The root `package.json` only delegates to them; it isn't a pnpm workspace, so each app installs and builds on its own: on Render, in CI and in the AMO source archive.

| Path | What it is | Deployed to |
| --- | --- | --- |
| `apps/extension/` | Chrome / Firefox extension (React, Vite, MV3) | addons.mozilla.org; Chrome Web Store later |
| `services/api/` | API (NestJS, Prisma, PostgreSQL + pgvector) | Render, with Neon Postgres |
| `project_docs/` | PRD, SRS, brand, deploy and store guides | — |
| `render.yaml` | Render blueprint for the API | Render |
| `.github/workflows/` | CI per app, and the Firefox release | GitHub Actions |

## Develop

Node 22 (`.nvmrc`) and pnpm 10 (`corepack enable`).

```sh
pnpm install:all                 # both apps
docker compose up -d             # Postgres 16 + pgvector on :5433
cp services/api/.env.example services/api/.env   # then fill it in
pnpm --dir services/api exec prisma migrate deploy
pnpm dev:api                     # API on :3000
pnpm dev:extension               # Vite; component gallery at /gallery.html
pnpm test                        # both apps' unit tests
```

Load the extension in Chrome from `apps/extension/dist` (`pnpm build`), or in Firefox with `pnpm --dir apps/extension start:firefox`.

## Ship

- **API:** [`project_docs/DEPLOY.md`](project_docs/DEPLOY.md) covers Neon, Render and Google sign-in.
- **Firefox:** [`project_docs/firefox/SUBMITTING.md`](project_docs/firefox/SUBMITTING.md) covers the first submission, then tag-driven releases.
- **Brand:** [`project_docs/brand/README.md`](project_docs/brand/README.md).
- **Privacy policy:** [`PRIVACY.md`](PRIVACY.md).
