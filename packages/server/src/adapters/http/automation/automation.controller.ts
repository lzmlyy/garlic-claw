import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard } from '../../../auth/http-auth';
import { AutomationService } from '../../../execution/automation/automation.service';

@Controller('automations')
@UseGuards(JwtAuthGuard)
export class AutomationController {
  constructor(
    private readonly automationService: AutomationService,
  ) {}

  @Post()
  async create(
    @CurrentUser('id') userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.automationService.create(
      userId,
      body as never,
    );
  }

  @Get()
  async list(@CurrentUser('id') userId: string) {
    return this.automationService.listByUser(userId);
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.automationService.getById(userId, id);
  }

  @Patch(':id/toggle')
  async toggle(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.automationService.toggle(userId, id);
  }

  @Post(':id/run')
  async run(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.automationService.run(userId, id);
  }

  @Get(':id/logs')
  async logs(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.automationService.getLogs(userId, id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.automationService.remove(userId, id);
  }
}
