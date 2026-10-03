# Gloss AI: Firefox Add-ons listing

Copy for the addons.mozilla.org (AMO) listing. Lengths are within AMO's limits.

## Name

Gloss AI

## Add-on URL slug

`gloss-ai` (gives `addons.mozilla.org/firefox/addon/gloss-ai/`)

## Summary

At most 250 characters.

> Ask questions about the page you're reading, highlight passages and write notes that stay with the page. Come back later and everything is still there, marked on the page.

## Description

> Gloss AI is a reading companion in your sidebar. A gloss is the note a reader writes in a book's margin to explain the text, and that's what Gloss does for the web.
>
> **Ask about the page.** Open the sidebar on any article, documentation page or report and ask a question. Answers come from the page itself. Select a passage and choose Ask to question exactly that part.
>
> **Highlight what matters.** Select text and choose Highlight. Gloss marks it again whenever you come back to the page, even after the page has changed around it.
>
> **Notes that stay put.** Write notes beside the page, quoting the passage they're about. They're there the next time you visit.
>
> **Find it again.** Search every note, conversation and highlight across every page you've used Gloss on, and jump straight back to the source.
>
> **Private by design.** Gloss reads a page only while the sidebar is open, and sends nothing until you've seen exactly what it collects. You choose the AI provider (Anthropic Claude, Google Gemini or OpenRouter) and can use your own API key. Delete your account and everything in it from Settings at any time.
>
> Open the sidebar from the toolbar button or with Alt+Shift+G.

## Categories

The closest AMO categories, in order of fit:

- Feeds, News & Blogging (reading)
- Search Tools (finding saved notes)

Use **Other** if neither fits once you see the current list.

## Tags

`reading`, `notes`, `highlights`, `ai`, `research`, `annotation`

## Support

- **Support email:** an address you read (AMO shows it publicly).
- **Support site / homepage:** the project repository, or a page you control.

## Privacy policy

Paste the contents of `PRIVACY.md` (repository root) into the privacy-policy field.

## Screenshots

`project_docs/firefox/screenshots/01.png` to `04.png`, 1280×800, in this order:

1. Ask about the page you're reading
2. Highlights that come back when you do
3. Notes that stay with the page
4. Find anything you've saved

They're composed from the real components by the gallery: `pnpm dev`, then open `gallery.html?only=store&shot=0` to `3`.

## Notes for reviewers

Paste this into the "Notes to reviewer" field:

> Sign-in is with Google only: click "Continue with Google" in the sidebar and any Google account works. The same button creates the account, so no invite or test account is required.
>
> The API runs on a free hosting tier that sleeps when idle, so the first request after a pause can take up to a minute.
>
> Build instructions are in AMO_REVIEW.md at the root of the source archive (Node 22, pnpm 10, `pnpm install --frozen-lockfile && pnpm build:firefox`). The innerHTML lint warnings come from React and Mozilla's Readability. The sidePanel API warning is Chrome's API and is called only when it exists.
