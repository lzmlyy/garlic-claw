import { Controller, Delete, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MemoryService } from './memory.service';

@ApiTags('Memories')
@ApiBearerAuth()
@Controller('memories')
@UseGuards(JwtAuthGuard)
export class MemoryController {
  constructor(private memoryService: MemoryService) {}

  @Get()
  listMemories(
    @CurrentUser('id') userId: string,
    @Query('category') category?: string,
    @Query('q') query?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(parseInt(limit || '50', 10), 100);
    if (query) {
      return this.memoryService.searchMemories(userId, query, take);
    }
    if (category) {
      return this.memoryService.getMemoriesByCategory(userId, category, take);
    }
    return this.memoryService.getRecentMemories(userId, take);
  }

  @Delete(':id')
  deleteMemory(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.memoryService.deleteMemory(id, userId);
  }
}
