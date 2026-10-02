import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Put,
} from '@nestjs/common';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import {
  StoreCredentialDto,
  UpdateAiPreferenceDto,
} from '../dto/ai-completion.dto.js';
import {
  AI_ANSWER_PROVIDERS,
  isAiProviderId,
  type AiAnswerProvider,
} from '../providers/ai-provider.interface.js';
import { AiService } from '../services/ai.service.js';
import { CredentialsService } from '../services/credentials.service.js';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly credentials: CredentialsService,
    @Inject(AI_ANSWER_PROVIDERS)
    private readonly providers: AiAnswerProvider[],
  ) {}

  /**
   * Which providers exist, which are usable, and what this user's questions
   * will use — including whose key will pay for them.
   */
  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.aiService.status(user.id);
  }

  /** Stores the user's provider/model choice and echoes the new state. */
  @Put('preference')
  setPreference(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAiPreferenceDto,
  ) {
    return this.aiService.setPreference(user.id, dto.provider, dto.model);
  }

  /**
   * The user's stored keys, masked.
   *
   * There is deliberately no endpoint that returns a key: once stored, a key
   * only ever leaves the database into a live provider call.
   */
  @Get('credentials')
  listCredentials(@CurrentUser() user: AuthenticatedUser) {
    return this.credentials.listForUser(user.id);
  }

  /** Validates the key against the provider, then stores it encrypted. */
  @Put('credentials/:provider')
  async storeCredential(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') providerId: string,
    @Body() dto: StoreCredentialDto,
  ) {
    const provider = this.requireProvider(providerId);

    // Checked before anything is written, so a typo never becomes a stored key
    // that fails at the next question.
    await provider.validateKey(dto.apiKey.trim());

    return this.credentials.store(user.id, provider.id, dto.apiKey);
  }

  /** Removes the key; answers fall back to the server's, if it has one. */
  @Delete('credentials/:provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCredential(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') providerId: string,
  ) {
    const provider = this.requireProvider(providerId);

    await this.credentials.remove(user.id, provider.id);
  }

  private requireProvider(providerId: string): AiAnswerProvider {
    if (!isAiProviderId(providerId)) {
      throw new BadRequestException(`Unknown provider: ${providerId}`);
    }

    const provider = this.providers.find((entry) => entry.id === providerId);

    if (!provider) {
      throw new BadRequestException(`Unknown provider: ${providerId}`);
    }

    return provider;
  }
}
