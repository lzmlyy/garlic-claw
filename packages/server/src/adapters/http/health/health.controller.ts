import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return { service: 'server', status: 'ok', time: new Date().toISOString() };
  }
}
