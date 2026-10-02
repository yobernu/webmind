import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AI_ANSWER_PROVIDERS,
  EMBEDDING_PROVIDER,
  type AiAnswerProvider,
  type AnswerChunk,
  type EmbeddingProvider,
} from '../src/ai/providers/ai-provider.interface.js';
import { ANSWER_SENTINEL } from '../src/ai/utils/answer-stream.js';

/**
 * End-to-end acceptance checks (SRS §11–12) against a real, migrated database
 * and the real HTTP stack, with only the AI vendor replaced.
 *
 *   docker compose up -d
 *   DATABASE_URL=… pnpm prisma migrate deploy
 *   DATABASE_URL=… pnpm test:e2e
 *
 * Skipped when DATABASE_URL is unset, so a plain `pnpm test:e2e` on a machine
 * without the database reports that instead of failing on a connection error.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

process.env.JWT_SECRET ||= 'e2e-secret-that-is-at-least-thirty-two-characters-long';
// The fake provider below stands in for Gemini, and the server only offers a
// provider it holds a key for. The value never leaves the process.
process.env.GEMINI_API_KEY ||= 'e2e-placeholder-key';

/** Answers every question with a fixed, recognisable reply. */
const fakeAnswerer: AiAnswerProvider = {
  id: 'gemini',
  label: 'Fake',
  hasServerKey: true,
  models: ['fake-model'],
  defaultModel: 'fake-model',
  async *streamAnswer(): AsyncIterable<AnswerChunk> {
    yield { type: 'text', text: `${ANSWER_SENTINEL}Ruritania ` };
    yield { type: 'text', text: 'exports timber.' };
    yield { type: 'finish', reason: 'stop' };
  },
  async validateKey() {},
};

/** Deterministic vectors of the stored dimensionality, so page indexing runs
 * against the real pgvector column without calling out. */
const fakeEmbeddings: EmbeddingProvider = {
  hasServerKey: true,
  embeddingDimensions: 768,
  async embed(texts: string[]) {
    return texts.map((_, index) =>
      Array.from({ length: 768 }, (__, dimension) => (dimension === index % 768 ? 1 : 0)),
    );
  },
};

/** Reads a server-sent-events body as a string. */
function readStream(
  res: request.Response,
  callback: (error: Error | null, body: string) => void,
) {
  // At parse time superagent hands over the raw Node response stream.
  const stream = res as unknown as NodeJS.ReadableStream;
  let body = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => (body += chunk));
  stream.on('end', () => callback(null, body));
}

function events(body: string): { type: string; [key: string]: unknown }[] {
  return body
    .split('\n\n')
    .map((frame) => frame.replace(/^data: /, '').trim())
    .filter(Boolean)
    .map((json) => JSON.parse(json));
}

describe.skipIf(!hasDatabase)('WebMind API (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  const alice = { email: `alice-${randomUUID()}@example.com`, password: 'correct horse battery' };
  const mallory = { email: `mallory-${randomUUID()}@example.com`, password: 'another long password' };
  let aliceToken = '';
  let malloryToken = '';

  let pageA = '';
  let pageB = '';
  let conversationId = '';
  let noteId = '';
  let highlightId = '';

  const asAlice = () => ({ Authorization: `Bearer ${aliceToken}` });
  const asMallory = () => ({ Authorization: `Bearer ${malloryToken}` });

  beforeAll(async () => {
    // Imported here, not at the top: loading AppModule validates the
    // environment, which would fail the run before the skip could apply.
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_ANSWER_PROVIDERS)
      .useValue([fakeAnswerer])
      .overrideProvider(EMBEDDING_PROVIDER)
      .useValue(fakeEmbeddings)
      .compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    http = request(app.getHttpServer());

    const signup = await http.post('/auth/signup').send(alice).expect(201);
    aliceToken = signup.body.accessToken;

    const second = await http.post('/auth/register').send(mallory).expect(201);
    malloryToken = second.body.accessToken;
  });

  afterAll(async () => {
    // Account deletion cascades, so this also cleans up everything created.
    if (aliceToken) await http.delete('/users/me').set(asAlice());
    if (malloryToken) await http.delete('/users/me').set(asMallory());
    await app?.close();
  });

  describe('authentication (FR-01)', () => {
    it('logs in with the password used at sign-up', async () => {
      // Nest's POST default; the extension only checks for success.
      const res = await http.post('/auth/login').send(alice).expect(201);

      expect(res.body.user.email).toBe(alice.email);
      expect(res.body.user).not.toHaveProperty('passwordHash');
    });

    it('rejects a wrong password', async () => {
      await http.post('/auth/login').send({ ...alice, password: 'wrong password!' }).expect(401);
    });

    it('rejects requests without a token, or with a forged one', async () => {
      await http.post('/pages/resolve').send({ url: 'https://example.com' }).expect(401);
      await http.get('/users/me').set({ Authorization: 'Bearer not.a.token' }).expect(401);
    });

    it('returns the signed-in profile', async () => {
      const res = await http.get('/users/me').set(asAlice()).expect(200);
      expect(res.body.email).toBe(alice.email);
    });
  });

  describe('page identification (FR-02)', () => {
    it('creates a page once per canonical URL, ignoring tracking parameters', async () => {
      const first = await http
        .post('/pages/resolve')
        .set(asAlice())
        .send({ url: 'https://example.com/article?utm_source=x', title: 'Article A' })
        .expect(201);

      const again = await http
        .post('/pages/resolve')
        .set(asAlice())
        .send({ url: 'https://example.com/article' })
        .expect(201);

      pageA = first.body.page.id;
      expect(again.body.page.id).toBe(pageA);
      expect(first.body.needsContent).toBe(true);

      const other = await http
        .post('/pages/resolve')
        .set(asAlice())
        .send({ url: 'https://example.org/unrelated', title: 'Article B' })
        .expect(201);
      pageB = other.body.page.id;
      expect(pageB).not.toBe(pageA);
    });

    it('stores the page text without ever returning it', async () => {
      const res = await http
        .put(`/pages/${pageA}/content`)
        .set(asAlice())
        .send({ content: 'Ruritania is a small country. It exports mostly timber.' })
        .expect(200);

      expect(res.body.hasContent).toBe(true);
      expect(res.body).not.toHaveProperty('content');
    });
  });

  describe('questions and conversations (FR-04, FR-05)', () => {
    it('streams an answer and persists the question and answer in order', async () => {
      const created = await http
        .post(`/pages/${pageA}/conversations`)
        .set(asAlice())
        .send({})
        .expect(201);
      conversationId = created.body.id;

      const res = await http
        .post(`/conversations/${conversationId}/messages`)
        .set(asAlice())
        .set('Accept', 'text/event-stream')
        .send({ content: 'What does Ruritania export?' })
        .buffer(true)
        .parse(readStream)
        .expect(200);

      const stream = events(res.body as string);
      expect(stream.map((event) => event.type)).toContain('delta');
      expect(stream.at(-1)).toMatchObject({ type: 'done', content: 'Ruritania exports timber.' });

      const messages = await http
        .get(`/conversations/${conversationId}/messages`)
        .set(asAlice())
        .expect(200);

      expect(messages.body.map((m: { role: string }) => m.role)).toEqual(['USER', 'ASSISTANT']);
      expect(messages.body[1].incomplete).toBe(false);
    });

    it('lists the page’s conversations, titled from the first question', async () => {
      const res = await http.get(`/pages/${pageA}/conversations`).set(asAlice()).expect(200);

      expect(res.body[0]).toMatchObject({
        id: conversationId,
        title: 'What does Ruritania export?',
        messageCount: 2,
      });
    });
  });

  describe('notes and highlights (FR-06, FR-07)', () => {
    it('creates, edits and lists a note on its own page only', async () => {
      const created = await http
        .post(`/pages/${pageA}/notes`)
        .set(asAlice())
        .send({ content: 'Timber is the main export', sourceText: 'exports mostly timber' })
        .expect(201);
      noteId = created.body.id;

      await http
        .patch(`/notes/${noteId}`)
        .set(asAlice())
        .send({ content: 'Timber is the main export, per the article' })
        .expect(200);

      const onA = await http.get(`/pages/${pageA}/notes`).set(asAlice()).expect(200);
      expect(onA.body).toHaveLength(1);
      expect(onA.body[0].content).toContain('per the article');

      // SRS §12: a note created on Page A does not appear on Page B.
      const onB = await http.get(`/pages/${pageB}/notes`).set(asAlice()).expect(200);
      expect(onB.body).toEqual([]);
    });

    it('saves a highlight with its selector', async () => {
      const selector = {
        quote: { exact: 'exports mostly timber', prefix: 'It ', suffix: '.' },
        position: { start: 33, end: 54 },
      };

      const res = await http
        .post(`/pages/${pageA}/highlights`)
        .set(asAlice())
        .send({ selectedText: 'exports mostly timber', selector })
        .expect(201);
      highlightId = res.body.id;

      expect(res.body.selector).toEqual(selector);
    });

    it('rejects a malformed selector', async () => {
      await http
        .post(`/pages/${pageA}/highlights`)
        .set(asAlice())
        .send({ selectedText: 'x', selector: { quote: { exact: '' } } })
        .expect(400);
    });
  });

  describe('workspace restoration (FR-08)', () => {
    it('restores conversations, notes, highlights and activity for the page', async () => {
      const res = await http.get(`/pages/${pageA}/workspace`).set(asAlice()).expect(200);

      expect(res.body.counts).toEqual({ conversations: 1, notes: 1, highlights: 1 });
      expect(res.body.conversations[0].id).toBe(conversationId);
      expect(res.body.notes[0].id).toBe(noteId);
      expect(res.body.highlights[0].id).toBe(highlightId);
      expect(res.body.lastActivityAt).not.toBeNull();
    });

    it('shows an empty workspace for an unrelated page', async () => {
      const res = await http.get(`/pages/${pageB}/workspace`).set(asAlice()).expect(200);

      expect(res.body.counts).toEqual({ conversations: 0, notes: 0, highlights: 0 });
      expect(res.body.lastActivityAt).toBeNull();
    });
  });

  describe('global search (FR-09)', () => {
    it('finds notes, messages and highlights with their source page', async () => {
      const res = await http.get('/search').query({ q: 'timber' }).set(asAlice()).expect(200);

      const types = new Set(res.body.map((hit: { type: string }) => hit.type));
      expect(types).toEqual(new Set(['note', 'message', 'highlight']));
      for (const hit of res.body) {
        expect(hit.page).toMatchObject({ id: pageA, domain: 'example.com' });
      }

      const message = res.body.find((hit: { type: string }) => hit.type === 'message');
      expect(message.conversationId).toBe(conversationId);
    });

    it('narrows by type', async () => {
      const res = await http
        .get('/search')
        .query({ q: 'timber', type: 'note' })
        .set(asAlice())
        .expect(200);

      expect(res.body.map((hit: { type: string }) => hit.type)).toEqual(['note']);
    });

    it('validates the query', async () => {
      await http.get('/search').query({ q: 'x' }).set(asAlice()).expect(400);
    });
  });

  // SRS §12: a user cannot access another user's pages, conversations, notes
  // or highlights. Each attempt is a 404, not a 403, so ids cannot be probed.
  describe('isolation between users', () => {
    it('hides another user’s page and workspace', async () => {
      await http.get(`/pages/${pageA}`).set(asMallory()).expect(404);
      await http.get(`/pages/${pageA}/workspace`).set(asMallory()).expect(404);
      await http.get(`/pages/${pageA}/notes`).set(asMallory()).expect(404);
      await http.get(`/pages/${pageA}/highlights`).set(asMallory()).expect(404);
      await http.get(`/pages/${pageA}/conversations`).set(asMallory()).expect(404);
    });

    it('refuses writes to another user’s page or items', async () => {
      await http.post(`/pages/${pageA}/notes`).set(asMallory()).send({ content: 'x' }).expect(404);
      await http.patch(`/notes/${noteId}`).set(asMallory()).send({ content: 'x' }).expect(404);
      await http.delete(`/notes/${noteId}`).set(asMallory()).expect(404);
      await http.delete(`/highlights/${highlightId}`).set(asMallory()).expect(404);
      await http.post(`/pages/${pageA}/conversations`).set(asMallory()).send({}).expect(404);
    });

    it('refuses to read or extend another user’s conversation', async () => {
      await http.get(`/conversations/${conversationId}/messages`).set(asMallory()).expect(404);
      await http
        .post(`/conversations/${conversationId}/messages`)
        .set(asMallory())
        .send({ content: 'hello' })
        .expect(404);
    });

    it('keeps another user’s content out of search', async () => {
      const res = await http.get('/search').query({ q: 'timber' }).set(asMallory()).expect(200);
      expect(res.body).toEqual([]);
    });

    it('gives the same URL its own page record per user', async () => {
      const res = await http
        .post('/pages/resolve')
        .set(asMallory())
        .send({ url: 'https://example.com/article' })
        .expect(201);

      expect(res.body.page.id).not.toBe(pageA);
    });
  });

  describe('deletion', () => {
    it('deletes a note and a highlight', async () => {
      await http.delete(`/notes/${noteId}`).set(asAlice()).expect(204);
      await http.delete(`/highlights/${highlightId}`).set(asAlice()).expect(204);

      const res = await http.get(`/pages/${pageA}/workspace`).set(asAlice()).expect(200);
      expect(res.body.counts).toMatchObject({ notes: 0, highlights: 0 });
    });

    it('deletes the account, after which its token stops working', async () => {
      await http.delete('/users/me').set(asMallory()).expect(204);
      await http.get('/users/me').set(asMallory()).expect(401);
      malloryToken = '';
    });
  });
});
