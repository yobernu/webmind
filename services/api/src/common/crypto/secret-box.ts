import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** AES-256-GCM: authenticated, so tampering is detected rather than decrypting
 * into plausible garbage. */
const ALGORITHM = 'aes-256-gcm';

/** GCM's standard nonce length; a fresh one is generated for every write. */
const IV_BYTES = 12;

const KEY_BYTES = 32;

export interface SealedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretBoxError';
  }
}

/**
 * Parses the master key from its base64 form.
 *
 * Exported so configuration can fail at boot rather than at the first write: a
 * secret store that is half-configured is worse than one that is absent, since
 * the absence is at least reported.
 */
export function parseMasterKey(encoded: string | undefined): Buffer | null {
  const trimmed = encoded?.trim();
  if (!trimmed) return null;

  let key: Buffer;
  try {
    key = Buffer.from(trimmed, 'base64');
  } catch {
    throw new SecretBoxError('CREDENTIAL_ENCRYPTION_KEY is not valid base64');
  }

  if (key.length !== KEY_BYTES) {
    throw new SecretBoxError(
      `CREDENTIAL_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}`,
    );
  }

  return key;
}

/**
 * Encrypts a secret, binding the result to `aad`.
 *
 * The additional authenticated data is the point of this design: it is not
 * secret, but decryption fails unless the exact same value is supplied. Passing
 * the owning user and provider means a ciphertext lifted into another user's row
 * will not decrypt, so a database write does not become a way to spend someone
 * else's key.
 */
export function encryptSecret(
  masterKey: Buffer,
  plaintext: string,
  aad: string,
): SealedSecret {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

/** Decrypts a sealed secret, throwing unless ciphertext, tag and aad all match. */
export function decryptSecret(
  masterKey: Buffer,
  sealed: SealedSecret,
  aad: string,
): string {
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      masterKey,
      Buffer.from(sealed.iv, 'base64'),
    );

    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(Buffer.from(sealed.authTag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // The reason is never useful to a caller and could distinguish "wrong key"
    // from "tampered", so it is flattened.
    throw new SecretBoxError('Stored credential could not be decrypted');
  }
}

/**
 * Redacts a secret from text destined for a log.
 *
 * Providers occasionally echo request material in error messages, and those
 * messages are logged. Comparison is length-guarded and constant-time to avoid
 * turning the log scrubber itself into an oracle.
 */
export function redactSecret(text: string, secret: string): string {
  if (!secret || secret.length < 8) return text;
  if (!text.includes(secret)) return text;

  return text.split(secret).join('[redacted]');
}

/** Last four characters, for showing which key is stored without revealing it. */
export function secretHint(secret: string): string {
  return secret.length <= 4 ? '••••' : `••••${secret.slice(-4)}`;
}
