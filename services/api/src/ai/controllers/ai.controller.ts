import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { UpdateAiPreferenceDto } from '../dto/ai-completion.dto.js';
import { AiService } from '../services/ai.service.js';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * Which providers exist, which are usable, and what this user's questions
   * will use. Lets the panel show a picker and explain an unconfigured server
   * up front rather than failing when the user presses send.
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
}
