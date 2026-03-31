import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SkillCommandService } from './skill-command.service';
import { SkillController } from './skill.controller';
import { SkillExecutionService } from './skill-execution.service';
import {
  SKILL_DISCOVERY_OPTIONS,
  SkillDiscoveryService,
} from './skill-discovery.service';
import {
  SKILL_GOVERNANCE_OPTIONS,
  SkillGovernanceService,
} from './skill-governance.service';
import { SkillRegistryService } from './skill-registry.service';
import { SkillSessionService } from './skill-session.service';

@Module({
  imports: [AuthModule],
  controllers: [SkillController],
  providers: [
    SkillDiscoveryService,
    {
      provide: SKILL_DISCOVERY_OPTIONS,
      useValue: {},
    },
    {
      provide: SKILL_GOVERNANCE_OPTIONS,
      useValue: {},
    },
    SkillRegistryService,
    SkillGovernanceService,
    SkillSessionService,
    SkillExecutionService,
    SkillCommandService,
  ],
  exports: [
    SkillRegistryService,
    SkillGovernanceService,
    SkillSessionService,
    SkillExecutionService,
    SkillCommandService,
  ],
})
export class SkillModule {}
