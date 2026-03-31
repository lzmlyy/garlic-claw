import type {
  ApiKeySummary,
  CreateApiKeyResponse,
} from '@garlic-claw/shared';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from './decorators/current-user.decorator';
import { CreateApiKeyDto } from './dto/api-key.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiKeyService } from './api-key.service';

@ApiTags('API Keys')
@ApiBearerAuth()
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
