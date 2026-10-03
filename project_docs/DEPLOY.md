# Deploying the Gloss AI API

The extension needs the API running somewhere public over HTTPS. This sets it up on free tiers:

- **Neon** for PostgreSQL with pgvector.
- **Render** for the Node API, defined by `render.yaml` at the repository root.

Allow about 20 minutes.

## 1. Database on Neon

1. Sign up at [neon.tech](https://neon.tech) and create a project named `gloss-ai`.
   - Postgres 16 or 17 both work.
   - Pick the region closest to your Render region: **AWS Europe Central (Frankfurt)** pairs with `render.yaml`.
2. Open **Connect** and turn **off** connection pooling. Copy the *direct* connection string. It looks like:

   ```
   postgresql://neondb_owner:…@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```

   Prisma's migrations need the direct connection; the pooled one breaks them.

You don't need to create anything in the database. The first deploy runs the migrations, including `CREATE EXTENSION vector`, which Neon supports.

## 2. API on Render

1. Push the branch you want to deploy to GitHub. Render deploys from the repository, so merge into `master` first or pick the branch in step 3.
2. In the Render dashboard choose **New → Blueprint** and connect the repository. Render reads `render.yaml` and proposes a web service called `gloss-ai-api`.
3. Fill in the values it asks for:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | The Neon direct connection string from step 1. |
   | `GEMINI_API_KEY` | Optional. Enables Gemini answers and long-page search. |
   | `ANTHROPIC_API_KEY` | Optional. Enables Claude answers. |
   | `OPENROUTER_API_KEY` | Optional. |
   | `GOOGLE_CLIENT_ID` | Optional. See step 4; leave empty for email-only sign-in. |

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

## 3. Google sign-in (optional)

Email and password sign-in works without this.

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth client of type **Web application**.
2. Under **Authorized redirect URIs**, add one line per browser:
   - **Chrome:** `https://ibgogjgdimkikamkfdhimeelgdjpjibg.chromiumapp.org/`
   - **Firefox:** run the extension, open `about:debugging` → **This Firefox** → Gloss AI → **Inspect**, and run `browser.identity.getRedirectURL()` in the console. It returns an `https://….extensions.allizom.org/` address that depends only on the add-on ID, so it never changes.
3. Set the OAuth consent screen's app name to **Gloss AI**.
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
