import type { SkillDetail } from '@garlic-claw/shared';
import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { SkillRegistryService } from '../../../execution/skill/skill-registry.service';

interface UpdateSkillGovernanceDto {
  trustLevel?: 'prompt-only' | 'asset-read' | 'local-script';
}

@Controller('skills')
export class SkillController {
  constructor(
    private readonly skillRegistryService: SkillRegistryService,
  ) {}

  @Get()
  listSkills(): Promise<SkillDetail[]> {
    return this.skillRegistryService.listSkills();
  }

  @Post('refresh')
  refreshSkills(): Promise<SkillDetail[]> {
    return this.skillRegistryService.listSkills({ refresh: true });
  }

  @Put(':skillId/governance')
  updateSkillGovernance(
    @Param('skillId') skillId: string,
    @Body() dto: UpdateSkillGovernanceDto,
  ): Promise<SkillDetail> {
    return this.skillRegistryService.updateSkillGovernance(decodeURIComponent(skillId), dto);
  }
}
