import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../../generated/prisma/enums.js';
import { GOOGLE_TOKEN_REJECTED_MESSAGE } from '../constants/auth.constants.js';
import { AuthService } from './auth.service.js';
import type { GoogleAuthService, GoogleIdentity } from './google-auth.service.js';
import type { UsersService } from '../../users/services/users.service.js';

interface StoredUser {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string | null;
  avatarUrl: string | null;
}

const GOOGLE_IDENTITY: GoogleIdentity = {
  sub: 'google-sub-1',
  email: 'ada@example.com',
  emailVerified: true,
  name: 'Ada Lovelace',
  avatarUrl: 'https://example.com/ada.png',
};

/**
 * In-memory stand-in for UsersService, so the linking rules can be exercised
 * without a database. Mirrors the unique constraints that matter here:
 * one account per email, one identity per (provider, providerAccountId).
 */
function createUsersStub(seed: StoredUser[] = []) {
  const users = new Map(seed.map((user) => [user.id, { ...user }]));
  const identities = new Map<string, string>();
  let nextId = seed.length + 1;

  const key = (provider: AuthProvider, providerAccountId: string) =>
    `${provider}:${providerAccountId}`;

  const stub = {
    findByEmail: vi.fn(async (email: string) =>
      [...users.values()].find((user) => user.email === email) ?? null,
    ),

    findById: vi.fn(async (id: string) => users.get(id) ?? null),

    createUser: vi.fn(async (email: string, passwordHash: string) => {
      const user: StoredUser = {
        id: `user-${nextId++}`,
        email,
        passwordHash,
        name: null,
        avatarUrl: null,
      };
      users.set(user.id, user);
      return user;
    }),

    findByProviderAccount: vi.fn(
      async (provider: AuthProvider, providerAccountId: string) => {
        const userId = identities.get(key(provider, providerAccountId));
        return userId ? (users.get(userId) ?? null) : null;
      },
    ),

    createWithIdentity: vi.fn(async (profile: any) => {
      if ([...users.values()].some((user) => user.email === profile.email)) {
        throw Object.assign(new Error('Unique constraint failed'), {
          code: 'P2002',
        });
      }

      const user: StoredUser = {
        id: `user-${nextId++}`,
        email: profile.email,
        passwordHash: null,
        name: profile.name ?? null,
        avatarUrl: profile.avatarUrl ?? null,
      };
      users.set(user.id, user);
      identities.set(key(profile.provider, profile.providerAccountId), user.id);
      return user;
    }),

    linkIdentity: vi.fn(async (userId: string, profile: any) => {
      const user = users.get(userId)!;
      user.name = user.name ?? profile.name ?? null;
      user.avatarUrl = user.avatarUrl ?? profile.avatarUrl ?? null;
      identities.set(key(profile.provider, profile.providerAccountId), userId);
      return user;
    }),
  };

  return { stub, users, identities };
}

function createService(
  usersStub: ReturnType<typeof createUsersStub>['stub'],
  verifyIdToken = vi.fn(async () => GOOGLE_IDENTITY),
) {
  const jwtService = {
    signAsync: vi.fn(async (payload: { sub: string }) => `token-for-${payload.sub}`),
  };

  const googleAuthService = { verifyIdToken } as unknown as GoogleAuthService;

  const service = new AuthService(
    usersStub as unknown as UsersService,
    jwtService as never,
    googleAuthService,
  );

  return { service, jwtService, verifyIdToken };
}

describe('AuthService.loginWithGoogle', () => {
  let usersStub: ReturnType<typeof createUsersStub>;

  beforeEach(() => {
    usersStub = createUsersStub();
  });

  it('creates an account and identity on first sign-in', async () => {
    const { service } = createService(usersStub.stub);

    const result = await service.loginWithGoogle('id-token');

    expect(usersStub.stub.createWithIdentity).toHaveBeenCalledOnce();
    expect(result.user.email).toBe('ada@example.com');
    expect(result.user.name).toBe('Ada Lovelace');
    expect(result.user.avatarUrl).toBe('https://example.com/ada.png');
    expect(result.accessToken).toBe(`token-for-${result.user.id}`);
    // A provider-only account must not get a usable password.
    expect(usersStub.users.get(result.user.id)?.passwordHash).toBeNull();
  });

  it('reuses the linked account on a later sign-in', async () => {
    const { service } = createService(usersStub.stub);

    const first = await service.loginWithGoogle('id-token');
    usersStub.stub.createWithIdentity.mockClear();
    const second = await service.loginWithGoogle('id-token');

    expect(second.user.id).toBe(first.user.id);
    expect(usersStub.stub.createWithIdentity).not.toHaveBeenCalled();
    expect(usersStub.users.size).toBe(1);
  });

  it('links onto an existing password account with the same email', async () => {
    usersStub = createUsersStub([
      {
        id: 'user-existing',
        email: 'ada@example.com',
        passwordHash: '$2b$12$hash',
        name: null,
        avatarUrl: null,
      },
    ]);
    const { service } = createService(usersStub.stub);

    const result = await service.loginWithGoogle('id-token');

    expect(result.user.id).toBe('user-existing');
    expect(usersStub.stub.linkIdentity).toHaveBeenCalledOnce();
    expect(usersStub.stub.createWithIdentity).not.toHaveBeenCalled();
    // The password still works after linking.
    expect(usersStub.users.get('user-existing')?.passwordHash).toBe('$2b$12$hash');
    // Profile gaps get filled in from Google.
    expect(result.user.name).toBe('Ada Lovelace');
  });

  it('recovers when a concurrent sign-in wins the unique constraint', async () => {
    const { service } = createService(usersStub.stub);

    // Simulate the row appearing between the lookup and the insert.
    usersStub.stub.createWithIdentity.mockImplementationOnce(async () => {
      usersStub.users.set('user-race', {
        id: 'user-race',
        email: 'ada@example.com',
        passwordHash: null,
        name: 'Ada Lovelace',
        avatarUrl: null,
      });
      usersStub.identities.set(
        `${AuthProvider.GOOGLE}:${GOOGLE_IDENTITY.sub}`,
        'user-race',
      );

      throw Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
    });

    const result = await service.loginWithGoogle('id-token');

    expect(result.user.id).toBe('user-race');
    expect(usersStub.users.size).toBe(1);
  });

  it('rethrows a create failure that is not a unique-constraint clash', async () => {
    const { service } = createService(usersStub.stub);
    const boom = Object.assign(new Error('connection lost'), {
      code: 'ECONNREFUSED',
    });
    usersStub.stub.createWithIdentity.mockRejectedValueOnce(boom);

    await expect(service.loginWithGoogle('id-token')).rejects.toBe(boom);
  });

  it('propagates a rejected token without touching the database', async () => {
    const verifyIdToken = vi.fn(async () => {
      throw new UnauthorizedException(GOOGLE_TOKEN_REJECTED_MESSAGE);
    });
    const { service } = createService(usersStub.stub, verifyIdToken as never);

    await expect(service.loginWithGoogle('bad-token')).rejects.toThrow(
      GOOGLE_TOKEN_REJECTED_MESSAGE,
    );
    expect(usersStub.stub.findByProviderAccount).not.toHaveBeenCalled();
    expect(usersStub.stub.createWithIdentity).not.toHaveBeenCalled();
  });
});

describe('AuthService.login with provider-only accounts', () => {
  it('rejects a password attempt on an account that has no password', async () => {
    const usersStub = createUsersStub([
      {
        id: 'user-google-only',
        email: 'ada@example.com',
        passwordHash: null,
        name: 'Ada Lovelace',
        avatarUrl: null,
      },
    ]);
    const { service } = createService(usersStub.stub);

    await expect(
      service.login({ email: 'ada@example.com', password: 'any-password' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
