import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
} from '@nestjs/common';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { UpdateUserDto } from '../dto/update-user.dto.js';
import { UsersService } from '../services/users.service.js';

/** The signed-in user's own account. There is no route to anyone else's. */
@Controller('users/me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.getProfile(user.id);
  }

  @Patch()
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateUserDto) {
    return this.users.updateProfile(user.id, dto);
  }

  /**
   * Deletes the account and everything saved under it: pages and their text,
   * conversations, notes, highlights, embeddings and stored keys (SRS §9.4).
   * Irreversible; the extension asks for confirmation first.
   */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser) {
    return this.users.deleteAccount(user.id);
  }
}
