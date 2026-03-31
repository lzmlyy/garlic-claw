import type { SkillTrustLevel } from '@garlic-claw/shared';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class UpdateSkillGovernanceDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsIn(['prompt-only', 'asset-read', 'local-script'])
  @IsOptional()
  trustLevel?: SkillTrustLevel;
}
