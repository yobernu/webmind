import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

import {
  GOOGLE_NOT_CONFIGURED_MESSAGE,
  GOOGLE_SCOPES,
  GOOGLE_TOKEN_REJECTED_MESSAGE,
  GOOGLE_UNVERIFIED_EMAIL_MESSAGE,
} from '../constants/auth.constants.js';

/** The parts of a verified Google ID token this app relies on. */
export interface GoogleIdentity {
  /** Google's stable account id, unique and never reused. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

/**
 * Verifies Google ID tokens produced by the extension's sign-in flow.
 *
 * The OAuth client is a Chrome Extension (public) client, so there is no client
 * secret anywhere: verification is offline against Google's published keys,
 * checking the signature, issuer, expiry and — critically — that the token's
 * audience is *our* client id. Without the audience check, an ID token minted
 * for any other Google app would be accepted.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly clientId: string;
  private readonly client: OAuth2Client | null;

  constructor(configService: ConfigService) {
    this.clientId = configService.get<string>('GOOGLE_CLIENT_ID')?.trim() ?? '';
    this.client = this.clientId ? new OAuth2Client(this.clientId) : null;

    if (!this.client) {
      this.logger.warn(
        'GOOGLE_CLIENT_ID is not set; Google sign-in is disabled.',
      );
    }
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  /** Public client id and scopes, safe to hand to the extension. */
  describeProvider() {
    return {
      enabled: this.isConfigured,
      clientId: this.clientId || null,
      scopes: GOOGLE_SCOPES,
    };
  }

  async verifyIdToken(idToken: string): Promise<GoogleIdentity> {
    if (!this.client) {
      throw new ServiceUnavailableException(GOOGLE_NOT_CONFIGURED_MESSAGE);
    }

    let payload;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      payload = ticket.getPayload();
    } catch (cause) {
      // Malformed, expired, wrong audience, bad signature — all indistinguishable
      // to the caller on purpose. The reason is logged, not returned.
      this.logger.warn(
        `Rejected Google ID token: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
      throw new UnauthorizedException(GOOGLE_TOKEN_REJECTED_MESSAGE);
    }

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException(GOOGLE_TOKEN_REJECTED_MESSAGE);
    }

    // An unverified address cannot be trusted to belong to the signer, and
    // accepting it would let anyone claim someone else's Gloss AI account.
    if (!payload.email_verified) {
      throw new UnauthorizedException(GOOGLE_UNVERIFIED_EMAIL_MESSAGE);
    }

    return {
      sub: payload.sub,
      email: payload.email.toLowerCase().trim(),
      emailVerified: true,
      name: payload.name ?? null,
      avatarUrl: payload.picture ?? null,
    };
  }
}
