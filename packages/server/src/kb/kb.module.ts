import { Module } from '@nestjs/common';
import { KbService } from './kb.service';

/**
 * KB 宿主模块。
 */
@Module({
  providers: [KbService],
  exports: [KbService],
})
export class KbModule {}
