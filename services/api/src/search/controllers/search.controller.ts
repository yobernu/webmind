import { Controller, Get, Query } from '@nestjs/common';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { SearchQueryDto } from '../dto/search-query.dto.js';
import { SearchService } from '../services/search.service.js';

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** GET /search?q=… — SRS §6. */
  @Get()
  find(@CurrentUser() user: AuthenticatedUser, @Query() query: SearchQueryDto) {
    return this.search.query(user.id, query.q, {
      type: query.type,
      limit: query.limit,
    });
  }
}
