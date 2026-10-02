import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { SearchResultType } from '../dto/search-query.dto.js';
import {
  SNIPPET_MARK_END,
  SNIPPET_MARK_START,
  type SearchRow,
} from '../dto/search-results.dto.js';

/**
 * ts_headline settings: about a sentence of context around the matches, with
 * the matches marked. The markers are private-use characters, quoted so the
 * option parser takes them literally.
 */
const HEADLINE_OPTIONS = `StartSel="${SNIPPET_MARK_START}", StopSel="${SNIPPET_MARK_END}", MaxWords=30, MinWords=12, MaxFragments=2, FragmentDelimiter=" … "`;

/**
 * One branch of the search per kind of saved item. Each searched expression
 * must match its GIN index in the add_fulltext_search migration exactly, and
 * every branch filters on the owner, so nothing crosses accounts.
 */
function branch(type: SearchResultType, userId: string): Prisma.Sql {
  switch (type) {
    case 'note':
      return Prisma.sql`
        SELECT 'note' AS "type", n."id", n."createdAt", NULL::text AS "conversationId",
               n."pageId", n."content" || ' ' || coalesce(n."sourceText", '') AS "body",
               ts_rank(to_tsvector('english', n."content" || ' ' || coalesce(n."sourceText", '')), q.query) AS "rank"
        FROM "notes" n, q
        WHERE n."userId" = ${userId}
          AND to_tsvector('english', n."content" || ' ' || coalesce(n."sourceText", '')) @@ q.query`;
    case 'message':
      return Prisma.sql`
        SELECT 'message' AS "type", m."id", m."createdAt", m."conversationId",
               c."pageId", m."content" AS "body",
               ts_rank(to_tsvector('english', m."content"), q.query) AS "rank"
        FROM "messages" m
        JOIN "conversations" c ON c."id" = m."conversationId", q
        WHERE c."userId" = ${userId}
          AND to_tsvector('english', m."content") @@ q.query`;
    case 'highlight':
      return Prisma.sql`
        SELECT 'highlight' AS "type", h."id", h."createdAt", NULL::text AS "conversationId",
               h."pageId", h."selectedText" AS "body",
               ts_rank(to_tsvector('english', h."selectedText"), q.query) AS "rank"
        FROM "highlights" h, q
        WHERE h."userId" = ${userId}
          AND to_tsvector('english', h."selectedText") @@ q.query`;
  }
}

@Injectable()
export class SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ranked matches across the user's saved items. Snippets are built only for
   * the rows that make the cut, since ts_headline re-parses the whole text.
   */
  async search(
    userId: string,
    query: string,
    types: readonly SearchResultType[],
    limit: number,
  ): Promise<SearchRow[]> {
    const branches = Prisma.join(
      types.map((type) => branch(type, userId)),
      ' UNION ALL ',
    );

    return this.prisma.$queryRaw<SearchRow[]>`
      WITH q AS (SELECT websearch_to_tsquery('english', ${query}) AS query),
      top AS (
        SELECT * FROM (${branches}) hits
        ORDER BY "rank" DESC, "createdAt" DESC
        LIMIT ${limit}
      )
      SELECT top."type", top."id", top."createdAt", top."conversationId",
             p."id" AS "pageId", p."url", p."title", p."domain",
             ts_headline('english', top."body", q.query, ${HEADLINE_OPTIONS}) AS "snippet"
      FROM top
      JOIN "pages" p ON p."id" = top."pageId", q
      ORDER BY top."rank" DESC, top."createdAt" DESC`;
  }
}
