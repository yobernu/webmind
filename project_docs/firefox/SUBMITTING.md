# Publishing Gloss AI on Firefox Add-ons

Publishing on addons.mozilla.org (AMO) is free. You need the API running first (`project_docs/DEPLOY.md`), because reviewers will try the add-on.

## 1. Try it in Firefox

```sh
cd apps/extension
pnpm build:firefox
pnpm start:firefox     # opens Firefox with Gloss AI loaded
```

`start:firefox` keeps its own Firefox profile in `apps/extension/.firefox-profile` (gitignored), so you stay signed in between runs. It lives in the project rather than in `/tmp` because Ubuntu's snap Firefox can't read `/tmp` and reports "Your Firefox profile cannot be loaded". Delete the folder for a fresh profile.

You can also go to `about:debugging` → **This Firefox** → **Load Temporary Add-on…** and pick `dist-firefox/manifest.json`.

Then check:

- The toolbar button and **Alt+Shift+G** open the sidebar.
- **Continue with Google** signs you in (the Firefox redirect URI must be registered, see `project_docs/DEPLOY.md`), then the privacy notice appears; ask a question and get a streamed answer.
- Selecting text shows the toolbar; Highlight marks the passage and survives a reload.
- Notes, History search and Settings work.

## 2. Build the upload

```sh
pnpm package:firefox
```

This refuses to build against `localhost`, lints the add-on with Mozilla's own validator and writes two files to `web-ext-artifacts/`:

- `gloss_ai-0.1.0.zip`: the add-on to upload.
- `gloss_ai-0.1.0-source.zip`: the source, for the reviewer. Commit your changes first so the archive matches the build.

The validator reports **0 errors**. The warnings it shows are explained in `apps/extension/AMO_REVIEW.md`.

## 3. Submit

1. Sign in at [addons.mozilla.org/developers](https://addons.mozilla.org/developers/) with a Firefox account. AMO asks you to turn on two-step authentication before your first submission.
2. Choose **Submit a New Add-on** → **On this site**. This is a listed add-on: AMO hosts it, signs it and delivers updates.
3. Upload `gloss_ai-0.1.0.zip`. For platforms, select **Firefox** (desktop) only, because Android has no sidebar.
4. When asked whether you use a compiler, minifier or bundler, answer **Yes** and upload `gloss_ai-0.1.0-source.zip`.
5. Fill in the listing from `project_docs/firefox/LISTING.md`: name, summary, description, categories, support details, privacy policy, screenshots and reviewer notes.
6. Submit.

The add-on ID `gloss-ai@yobernu.dev` is now permanent. Every future version must keep it, and it's written into `scripts/firefox.mjs`.

## 4. After submitting

- **Automated validation** runs at once. A listed add-on is usually public within minutes to a day, and human review can follow later.
- **If a reviewer asks for changes,** reply in the developer hub, rebuild and upload a new version.
- **Updates:** see the next section. Installed copies update automatically.

## 5. Later versions: release from GitHub

After the first version is on AMO, `.github/workflows/firefox-release.yml` publishes each new version. It builds the add-on, validates it, and uploads it to AMO together with its source archive.

**One-time setup**

1. On AMO, open [Manage API Keys](https://addons.mozilla.org/developers/addon/api/key/) and generate credentials: a *JWT issuer* and a *JWT secret*.
2. On GitHub, open `yobernu/webmind` → **Settings → Environments → New environment**, and name it `amo`. Add two **secrets**:
   - `AMO_JWT_ISSUER`
   - `AMO_JWT_SECRET`

   The workflow runs in this environment, so you can require your approval before each release.
3. Optional: under **Settings → Secrets and variables → Actions → Variables**, add `VITE_API_BASE_URL` if the API URL differs from `apps/extension/.env.production`.

**Each release**

```sh
# 1. raise "version" in apps/extension/public/manifest.json (e.g. 0.1.1), commit, push
git tag extension-v0.1.1
git push origin extension-v0.1.1
```

The workflow refuses a tag that doesn't match the manifest version. It uploads the new version and doesn't wait for review; follow its progress in the AMO developer hub. You can also start it from the Actions tab (**Firefox release → Run workflow**).

The other two workflows run tests on every push or pull request that touches their folder: `api.yml` for `services/api`, `extension.yml` for `apps/extension`.

## Chrome Web Store, later

The same codebase builds for Chrome (`pnpm build` → `dist/`). The Chrome Web Store charges a one-time $5 registration fee. Zip `dist/` and upload it; the manifest `key` keeps the extension ID that the API's CORS setting and Google sign-in expect.
