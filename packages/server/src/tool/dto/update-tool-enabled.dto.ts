import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateToolEnabledDto {
  @ApiProperty({
    description: 'Whether the source or tool should be enabled',
  })
  @IsBoolean()
  enabled!: boolean;
}
