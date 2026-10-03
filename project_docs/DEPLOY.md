# Deploying the Gloss AI API

The extension needs the API running somewhere public over HTTPS. This sets it up on free tiers:

- **Neon** for PostgreSQL with pgvector.
- **Render** for the Node API, defined by `render.yaml` at the repository root.

Allow about 20 minutes.

## 1. Database on Neon

1. Sign up at [neon.tech](https://neon.tech) and create a project named `gloss-ai`.
   - Postgres 16 or 17 both work.
   - Pick the region closest to your Render region: **AWS Europe Central (Frankfurt)** pairs with `render.yaml`.
2. Open **Connect** and copy two connection strings:

   | Copy with pooling | Looks like | Goes into |
   | --- | --- | --- |
   | **On** (pooled) | `postgresql://neondb_owner:…@ep-xxxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require` | `DATABASE_URL`: the running API |
   | **Off** (direct) | the same without `-pooler` | `DIRECT_DATABASE_URL`: migrations |

   Prisma's migrations take an advisory lock, which the pooler can't hold, so they need the direct string. `services/api/prisma.config.ts` picks it up automatically.

You don't need to create anything in the database. The first deploy runs the migrations, including `CREATE EXTENSION vector`, which Neon supports.

## 2. API on Render

1. Merge into `master` and push. `render.yaml` deploys the `master` branch; while testing a branch, change `branch:` there.
2. In the Render dashboard choose **New → Blueprint** and connect `yobernu/webmind`. Render reads `render.yaml` from the repository root and proposes a web service called `gloss-ai-api`.

   It's a monorepo, and the blueprint already handles that:
   - `rootDir: services/api` builds only the API.
   - The build filter skips deploys for commits that touch only the extension, the docs or the API's tests.
   - The API has its own `pnpm-lock.yaml`, so nothing from `apps/extension` is installed.
3. Fill in the values it asks for:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Neon's **pooled** connection string from step 1. |
   | `DIRECT_DATABASE_URL` | Neon's **direct** connection string from step 1. |
   | `GEMINI_API_KEY` | Optional. Enables Gemini answers and long-page search. |
   | `ANTHROPIC_API_KEY` | Optional. Enables Claude answers. |
   | `OPENROUTER_API_KEY` | Optional. |
   | `GOOGLE_CLIENT_ID` | **Required.** Sign-in is Google only; see step 3. |

   - Render generates `JWT_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` itself. Never rotate the encryption key once users have stored API keys, or those keys become unreadable.
   - Without any AI key, people can still use Gloss by adding their own key in **Settings**.

4. Apply the blueprint. The first build takes a few minutes. When it finishes, open:

   ```
   https://gloss-ai-api.onrender.com/health
   ```

   It should answer `{"status":"ok"}`.

   If Render gave the service a different URL (the name can be taken), put that URL in `apps/extension/.env.production` before building the extension.

### Free-tier behaviour

- **Render sleeps** a free web service after 15 minutes without traffic. The next request wakes it in about a minute, and Gloss shows "Reading page" while it waits. The Starter plan keeps it awake.
- **Neon suspends** an idle database too, but resumes in well under a second.
- **Migrations** run on every start. When nothing changed they finish immediately.

## 3. Google sign-in (required)

Gloss AI signs people in with Google only: the same button creates an account or signs in. Until this is set up, the sign-in screen says Google sign-in isn't available.

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth client of type **Web application**.
2. Under **Authorized redirect URIs**, add one line per browser:
   - **Chrome:** `https://ibgogjgdimkikamkfdhimeelgdjpjibg.chromiumapp.org/`
   - **Firefox:** `https://68d2408aba0214be149dec31307a1794d0f4812f.extensions.allizom.org/`

     Firefox derives this from the SHA-1 of the add-on ID (`gloss-ai@yobernu.dev`), so it never changes. To check it: in the Firefox window that `pnpm start:firefox` opens (not your everyday Firefox), go to `about:debugging#/runtime/this-firefox` → Gloss AI → **Inspect**, and run `browser.identity.getRedirectURL()` in the console.
3. Set the OAuth consent screen's app name to **Gloss AI**, then **publish the app** (Audience → Publishing status → *In production*). In *Testing* status only listed test users can sign in, which would lock out everyone else, including AMO's reviewers. Gloss asks only for `openid`, `email` and `profile`, which need no Google verification.
4. Put the client ID in Render's `GOOGLE_CLIENT_ID` and redeploy.

## 4. Point the extension at it

`apps/extension/.env.production` holds the API URL that production builds use. Then:

```sh
cd apps/extension
pnpm package:firefox     # Firefox: zip + source archive in web-ext-artifacts/
pnpm build               # Chrome: dist/ (load unpacked, or zip for the Chrome Web Store)
```

`pnpm package:firefox` refuses to build if the URL is still `localhost`.

Submitting to Firefox Add-ons is covered in `project_docs/firefox/SUBMITTING.md`.
