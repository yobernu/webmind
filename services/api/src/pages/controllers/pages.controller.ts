import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { ResolvePageDto } from '../dto/resolve-page.dto.js';
import { StoreContentDto } from '../dto/store-content.dto.js';
import { PagesService } from '../services/pages.service.js';
import { WorkspaceService } from '../services/workspace.service.js';

@Controller('pages')
@UseGuards(JwtAuthGuard)
export class PagesController {
  constructor(
    private readonly pagesService: PagesService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  /**
   * Called by the extension whenever the side panel is looking at a page.
   * Idempotent per (user, canonical URL).
   */
  @Post('resolve')
  resolve(@CurrentUser() user: AuthenticatedUser, @Body() dto: ResolvePageDto) {
    return this.pagesService.resolve(user.id, dto);
  }

  /** Follow-up upload, made only when `resolve` reported `needsContent`. */
  @Put(':id/content')
  storeContent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StoreContentDto,
  ) {
    return this.pagesService.storeContent(user.id, id, dto);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pagesService.findOwned(user.id, id);
  }

  @Get(':id/workspace')
  workspace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workspaceService.forPage(user.id, id);
  }
}
