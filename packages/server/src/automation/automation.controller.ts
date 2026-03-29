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
import { CreateAutomationDto } from './dto/automation.dto';

@ApiTags('Automations')
@ApiBearerAuth()
@Controller('automations')
@UseGuards(JwtAuthGuard)
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

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
  run(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.automationService.executeAutomation(id, userId);
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
