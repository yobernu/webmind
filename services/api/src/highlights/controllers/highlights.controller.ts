import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { CreateHighlightDto } from '../dto/create-highlight.dto.js';
import { HighlightsService } from '../services/highlights.service.js';

/** Routes named exactly as SRS §6 specifies them. */
@Controller()
export class HighlightsController {
  constructor(private readonly highlights: HighlightsService) {}

  @Post('pages/:id/highlights')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) pageId: string,
    @Body() dto: CreateHighlightDto,
  ) {
    return this.highlights.create(
      user.id,
      pageId,
      dto.selectedText,
      dto.selector,
    );
  }

  @Get('pages/:id/highlights')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) pageId: string,
  ) {
    return this.highlights.listForPage(user.id, pageId);
  }

  @Delete('highlights/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) highlightId: string,
  ) {
    return this.highlights.remove(user.id, highlightId);
  }
}
