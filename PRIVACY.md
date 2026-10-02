# Gloss AI privacy policy

Gloss AI is a browser extension that keeps an AI workspace (chats, notes and highlights) attached to the web pages you read. This page explains what Gloss AI collects, where it goes and how to delete it.

## When Gloss AI collects anything

Gloss AI reads pages **only while its side panel is open**. Closing the panel stops all page tracking: nothing about the tabs you visit is read, recorded or sent.

The first time you open the panel after signing in, Gloss AI explains what it collects. Nothing about any page is sent until you acknowledge that explanation.

## What is collected

| Data | When | Why |
| --- | --- | --- |
| Email address and password (stored as a bcrypt hash), or your Google account's email, name and picture | At sign-up or sign-in | To identify your account |
| The current page's address, title and domain | When the panel is open on that page | To attach your activity to the right page |
| The page's readable text | When the panel is open on that page | So the AI can answer questions about it |
| Your questions and the AI's answers | When you ask | So conversations persist and can be reopened |
| Notes, highlighted passages and where they sit in the page | When you save them | So they reappear when you come back |
| API keys you choose to store for an AI provider | When you add one | To answer with your own provider account. Keys are encrypted at rest (AES-256-GCM) and never sent back to the browser. |

Gloss AI does not collect browsing history beyond the pages you open the panel on. It does not read form fields, cookies or passwords from pages.

## Where data goes

- **The Gloss AI server** stores the data above in a PostgreSQL database tied to your account. Other users cannot read it.
- **The AI provider you select** (Google Gemini, OpenRouter or Anthropic Claude) receives the relevant page text, your recent conversation and your question when you ask something. Its own terms and privacy policy apply to that request.
- **Google's embedding service** receives the text of long pages, split into passages, so the most relevant passages can be found for a question.

Gloss AI does not sell data and does not use it for advertising.

## Security

- Traffic between the extension and the server uses HTTPS in production.
- AI provider credentials belonging to the server never leave the server.
- Page text is treated as material to answer from, never as instructions to the AI.
- Server logs record request routes and status codes, not page text, notes or search queries.

## Deleting your data

Open the side panel, choose your initials in the top corner, then **Settings**, and under **Account** choose **Delete account**. This permanently deletes your account and everything stored with it: pages and their text, conversations, notes, highlights, embeddings and stored API keys.

You can also delete individual notes and highlights from the panel at any time.

## Contact

For privacy questions, contact the Gloss AI team through the project's repository.
