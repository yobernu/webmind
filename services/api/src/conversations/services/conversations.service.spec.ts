import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PagesService } from '../../pages/services/pages.service.js';
import type { ConversationsRepository } from '../repositories/conversations.repository.js';
import { ConversationsService, titleFromQuestion } from './conversations.service.js';

const row = {
  id: 'conv-1',
  pageId: 'page-1',
  title: null as string | null,
  createdAt: new Date('2026-09-03T10:00:00Z'),
  updatedAt: new Date('2026-09-03T10:00:00Z'),
};

function createDeps(options: { pageOwned?: boolean; latest?: unknown } = {}) {
  const conversations = {
    create: vi.fn(async () => row),
    findOwned: vi.fn(async (): Promise<typeof row | null> => row),
    listForPage: vi.fn(async () => [{ ...row, _count: { messages: 4 } }]),
    findLatestForPage: vi.fn(async () =>
      options.latest === undefined ? null : options.latest,
    ),
    touch: vi.fn(async () => row),
  };

  const pages = {
    findOwned: vi.fn(async () => {
      if (options.pageOwned === false) throw new NotFoundException('Page not found');
      return { id: 'page-1' };
    }),
  };

  return {
    conversations,
    pages,
    service: new ConversationsService(
      conversations as unknown as ConversationsRepository,
      pages as unknown as PagesService,
    ),
  };
}

describe('titleFromQuestion', () => {
  it('uses the question, whitespace collapsed', () => {
    expect(titleFromQuestion('  What   does\nit say?  ')).toBe('What does it say?');
  });

  it('truncates a very long question with an ellipsis', () => {
    const title = titleFromQuestion('q'.repeat(500));

    expect(title.length).toBeLessThanOrEqual(200);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('ConversationsService', () => {
  it('creates a conversation on a page the user owns', async () => {
    const { service, conversations } = createDeps();

    const result = await service.create('user-1', 'page-1', 'My chat');

    expect(conversations.create).toHaveBeenCalledWith('user-1', 'page-1', 'My chat');
    expect(result.messageCount).toBe(0);
  });

  it('refuses to create one on a page the user does not own', async () => {
    const { service, conversations } = createDeps({ pageOwned: false });

    await expect(service.create('user-2', 'page-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(conversations.create).not.toHaveBeenCalled();
  });

  it('treats a blank title as absent', async () => {
    const { service, conversations } = createDeps();

    await service.create('user-1', 'page-1', '   ');

    expect(conversations.create).toHaveBeenCalledWith('user-1', 'page-1', null);
  });

  it('lists page conversations with message counts', async () => {
    const { service } = createDeps();

    const [first] = await service.listForPage('user-1', 'page-1');

    expect(first.messageCount).toBe(4);
  });

  it('refuses to list conversations for another user’s page', async () => {
    const { service } = createDeps({ pageOwned: false });

    await expect(service.listForPage('user-2', 'page-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('resolveForPage', () => {
    it('reuses the most recent conversation so follow-ups stay together', async () => {
      const { service, conversations } = createDeps({ latest: row });

      const result = await service.resolveForPage('user-1', 'page-1', 'next question');

      expect(result.id).toBe('conv-1');
      expect(conversations.create).not.toHaveBeenCalled();
    });

    it('starts one titled from the question when the page has none', async () => {
      const { service, conversations } = createDeps();

      await service.resolveForPage('user-1', 'page-1', 'What is exported?');

      expect(conversations.create).toHaveBeenCalledWith(
        'user-1',
        'page-1',
        'What is exported?',
      );
    });
  });

  it('404s a conversation belonging to someone else', async () => {
    const { service, conversations } = createDeps();
    conversations.findOwned = vi.fn(async () => null);

    await expect(service.findOwned('user-2', 'conv-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
