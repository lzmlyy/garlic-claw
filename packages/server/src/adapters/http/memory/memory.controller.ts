import { Controller, Delete, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard } from '../../../auth/http-auth';
import { RuntimeHostUserContextService } from '../../../runtime/host/runtime-host-user-context.service';

@Controller('memories')
@UseGuards(JwtAuthGuard)
export class MemoryController {
  constructor(
    private readonly runtimeHostUserContextService: RuntimeHostUserContextService,
  ) {}

  @Get()
  async listMemories(
    @CurrentUser('id') userId: string,
    @Query('category') category?: string,
    @Query('q') query?: string,
    @Query('limit') limit?: string,
  ) {
    const normalizedCategory = readOptionalQueryStringValue(category);
    const normalizedQuery = readOptionalQueryStringValue(query);
    const resolvedLimit = readLimit(limit);

    if (normalizedQuery) {
      return this.runtimeHostUserContextService.searchMemoriesByUser(userId, normalizedQuery, resolvedLimit);
    }
    if (normalizedCategory) {
      return this.runtimeHostUserContextService.getMemoriesByCategory(userId, normalizedCategory, resolvedLimit);
    }
    return this.runtimeHostUserContextService.getRecentMemories(userId, resolvedLimit);
  }

  @Delete(':id')
  async deleteMemory(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.runtimeHostUserContextService.deleteMemory(id, userId);
  }
}

function readOptionalQueryStringValue(value: string | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readLimit(rawLimit: string | undefined): number {
  const parsed = Number.parseInt(rawLimit ?? '50', 10);
  return Number.isFinite(parsed) ? Math.min(parsed, 100) : 50;
}
