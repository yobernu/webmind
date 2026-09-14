import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  decryptSecret,
  encryptSecret,
  parseMasterKey,
  redactSecret,
  SecretBoxError,
  secretHint,
} from './secret-box.js';

const KEY = randomBytes(32);
const OTHER_KEY = randomBytes(32);
const SECRET = 'AIzaSyExampleGeminiKeyValue0123456789';

const aadFor = (userId: string, provider = 'gemini', version = 1) =>
  `${userId}:${provider}:${version}`;

describe('parseMasterKey', () => {
  it('returns null when unset, so the feature can report itself unavailable', () => {
    expect(parseMasterKey(undefined)).toBeNull();
    expect(parseMasterKey('   ')).toBeNull();
  });

  it('rejects a key of the wrong length rather than silently weakening', () => {
    expect(() => parseMasterKey(randomBytes(16).toString('base64'))).toThrow(
      SecretBoxError,
    );
  });

  it('accepts a 32-byte base64 key', () => {
    expect(parseMasterKey(KEY.toString('base64'))).toHaveLength(32);
  });
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips', () => {
    const sealed = encryptSecret(KEY, SECRET, aadFor('user-1'));
    expect(decryptSecret(KEY, sealed, aadFor('user-1'))).toBe(SECRET);
  });

  it('never stores the plaintext in the sealed form', () => {
    const sealed = encryptSecret(KEY, SECRET, aadFor('user-1'));
    const serialized = JSON.stringify(sealed);

    expect(serialized).not.toContain(SECRET);
    // Nor any recognisable run of it.
    expect(serialized).not.toContain(SECRET.slice(0, 12));
  });

  it('produces different ciphertext each time, so equal keys are not detectable', () => {
    const a = encryptSecret(KEY, SECRET, aadFor('user-1'));
    const b = encryptSecret(KEY, SECRET, aadFor('user-1'));

    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it('refuses a ciphertext lifted into another user', () => {
    // The property BYOK rests on: copying a row between accounts, even with
    // database write access, does not yield a usable key.
    const sealed = encryptSecret(KEY, SECRET, aadFor('user-1'));

    expect(() => decryptSecret(KEY, sealed, aadFor('user-2'))).toThrow(
      SecretBoxError,
    );
  });

  it('refuses a ciphertext re-labelled as another provider', () => {
    const sealed = encryptSecret(KEY, SECRET, aadFor('user-1', 'gemini'));

    expect(() =>
      decryptSecret(KEY, sealed, aadFor('user-1', 'openrouter')),
    ).toThrow(SecretBoxError);
  });

  it('detects a tampered ciphertext', () => {
    const sealed = encryptSecret(KEY, SECRET, aadFor('user-1'));
    const bytes = Buffer.from(sealed.ciphertext, 'base64');
    bytes[0] ^= 0xff;

    expect(() =>
      decryptSecret(
        KEY,
        { ...sealed, ciphertext: bytes.toString('base64') },
        aadFor('user-1'),
      ),
    ).toThrow(SecretBoxError);
  });

  it('detects a tampered auth tag', () => {
    const sealed = encryptSecret(KEY, SECRET, aadFor('user-1'));
    const tag = Buffer.from(sealed.authTag, 'base64');
    tag[0] ^= 0xff;

    expect(() =>
      decryptSecret(KEY, { ...sealed, authTag: tag.toString('base64') }, aadFor('user-1')),
    ).toThrow(SecretBoxError);
  });

  it('refuses the wrong master key', () => {
    const sealed = encryptSecret(KEY, SECRET, aadFor('user-1'));

    expect(() => decryptSecret(OTHER_KEY, sealed, aadFor('user-1'))).toThrow(
      SecretBoxError,
    );
  });

  it('refuses a ciphertext whose recorded key version was changed', () => {
    const sealed = encryptSecret(KEY, SECRET, aadFor('user-1', 'gemini', 1));

    expect(() =>
      decryptSecret(KEY, sealed, aadFor('user-1', 'gemini', 2)),
    ).toThrow(SecretBoxError);
  });
});

describe('redactSecret', () => {
  it('removes a key echoed inside an error message', () => {
    const message = `OpenRouter rejected Bearer ${SECRET} for this account`;

    const scrubbed = redactSecret(message, SECRET);

    expect(scrubbed).not.toContain(SECRET);
    expect(scrubbed).toContain('[redacted]');
  });

  it('removes every occurrence', () => {
    const message = `${SECRET} then ${SECRET}`;
    expect(redactSecret(message, SECRET)).toBe('[redacted] then [redacted]');
  });

  it('leaves unrelated text untouched', () => {
    expect(redactSecret('nothing to see', SECRET)).toBe('nothing to see');
  });

  it('ignores implausibly short secrets, which would redact ordinary words', () => {
    expect(redactSecret('a short story', 'short')).toBe('a short story');
  });
});

describe('secretHint', () => {
  it('shows only the last four characters', () => {
    expect(secretHint(SECRET)).toBe(`••••${SECRET.slice(-4)}`);
    expect(secretHint(SECRET)).not.toContain(SECRET.slice(0, 8));
  });

  it('reveals nothing about a very short value', () => {
    expect(secretHint('abc')).toBe('••••');
  });
});
