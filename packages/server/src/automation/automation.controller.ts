import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AutomationService } from './automation.service';

class CreateAutomationDto {
  name!: string;
  trigger!: { type: 'cron' | 'event' | 'manual'; cron?: string; event?: string };
  actions!: {
    type: 'device_command' | 'ai_message';
    plugin?: string;
    capability?: string;
    params?: Record<string, unknown>;
    message?: string;
  }[];
}

@ApiTags('Automations')
@ApiBearerAuth()
@Controller('automations')
@UseGuards(JwtAuthGuard)
export class AutomationController {
  constructor(private automationService: AutomationService) {}

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAutomationDto,
  ) {
    return this.automationService.create(userId, dto.name, dto.trigger, dto.actions);
  }

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.automationService.findAllByUser(userId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.automationService.findById(id);
  }

  @Patch(':id/toggle')
  toggle(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.automationService.toggle(id, userId);
  }

  @Post(':id/run')
  run(@Param('id') id: string) {
    return this.automationService.executeAutomation(id);
  }

  @Get(':id/logs')
  logs(@Param('id') id: string) {
    return this.automationService.getLogs(id);
  }

  @Delete(':id')
  remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.automationService.remove(id, userId);
  }
}
