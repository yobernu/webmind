import { parseMasterKey } from '../../common/crypto/secret-box.js';

/** Short secrets make HS256 tokens guessable offline. */
const MIN_JWT_SECRET_LENGTH = 32;
const PLACEHOLDER_JWT_SECRET = 'replace-me-with-a-long-random-string';

/**
 * Checks environment invariants at boot, before anything serves traffic.
 *
 * Passed to `ConfigModule.forRoot({ validate })`. The rule for optional
 * secrets is: absent is fine and reported as a disabled feature, malformed is
 * fatal. A key that is present but unusable would otherwise surface as a
 * runtime failure on the first user who tries to store a credential, long after
 * deployment.
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  // Required: without these the API cannot store anything or trust a token.
  // Checked here so a misconfigured deploy fails at boot with a clear message.
  if (typeof config.DATABASE_URL !== 'string' || !config.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set');
  }

  const jwtSecret = config.JWT_SECRET;
  if (typeof jwtSecret !== 'string' || jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters; generate one with ` +
        `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
    );
  }
  if (jwtSecret === PLACEHOLDER_JWT_SECRET) {
    throw new Error('JWT_SECRET is still the placeholder from .env.example');
  }

  // Throws on a wrong-length or non-base64 key; returns null when unset.
  parseMasterKey(config.CREDENTIAL_ENCRYPTION_KEY as string | undefined);

  const port = config.PORT;
  if (port !== undefined && Number.isNaN(Number(port))) {
    throw new Error(`PORT must be a number, got "${String(port)}"`);
  }

  return config;
}
