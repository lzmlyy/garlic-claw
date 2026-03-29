import { Module } from '@nestjs/common';
import { PersonaService } from './persona.service';

/**
 * Persona 宿主模块。
 */
@Module({
  providers: [PersonaService],
  exports: [PersonaService],
})
export class PersonaModule {}
