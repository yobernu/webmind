import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

const stored = {
  id: 'user-1',
  email: 'ada@example.com',
  passwordHash: '$2b$12$secret',
  name: 'Ada',
  avatarUrl: null,
  emailVerified: false,
  aiProvider: 'gemini',
  aiModel: null,
};

function createService(found: typeof stored | null = stored) {
  const prisma = {
    user: {
      findUnique: vi.fn(async () => found),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...stored,
        ...data,
      })),
      delete: vi.fn(async () => stored),
    },
  };

  return {
    prisma,
    service: new UsersService(prisma as unknown as PrismaService),
  };
}

describe('UsersService', () => {
  it('returns only the public profile fields', async () => {
    const { service } = createService();

    const profile = await service.getProfile('user-1');

    expect(profile).toEqual({
      id: 'user-1',
      email: 'ada@example.com',
      name: 'Ada',
      avatarUrl: null,
    });
    expect(profile).not.toHaveProperty('passwordHash');
  });

  it('404s a profile that no longer exists', async () => {
    const { service } = createService(null);

    await expect(service.getProfile('user-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updates the name, treating blank as cleared', async () => {
    const { service, prisma } = createService();

    await service.updateProfile('user-1', { name: '  Ada L.  ' });
    expect(prisma.user.update).toHaveBeenLastCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Ada L.' },
    });

    const cleared = await service.updateProfile('user-1', { name: '   ' });
    expect(cleared.name).toBeNull();
  });

  it('leaves the name alone when it is not sent', async () => {
    const { service, prisma } = createService();

    await service.updateProfile('user-1', {});

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {},
    });
  });

  it('deletes the account by id, relying on cascades for its data', async () => {
    const { service, prisma } = createService();

    await service.deleteAccount('user-1');

    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
  });
});
