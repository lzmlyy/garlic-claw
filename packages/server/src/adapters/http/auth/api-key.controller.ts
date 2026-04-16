import type { ApiKeySummary, CreateApiKeyResponse } from '@garlic-claw/shared';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiKeyService } from '../../../auth/api-key.service';
import { CurrentUser, JwtAuthGuard } from '../../../auth/http-auth';
import { CreateApiKeyDto } from '../../../auth/dto/api-key.dto';

@Controller('auth/api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeyController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  @Get()
  listKeys(@CurrentUser('id') userId: string): Promise<ApiKeySummary[]> {
    return this.apiKeys.listKeys(userId);
  }

  @Post()
  createKey(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateApiKeyDto,
  ): Promise<CreateApiKeyResponse> {
    return this.apiKeys.createKey(userId, dto);
  }

  @Post(':id/revoke')
  revokeKey(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApiKeySummary> {
    return this.apiKeys.revokeKey(userId, id);
  }
}
