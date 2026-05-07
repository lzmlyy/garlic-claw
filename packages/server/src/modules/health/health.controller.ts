import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/http-auth';

@Controller('health')
@Public()
export class HealthController {
  @Get()
  getHealth() {
    return { service: 'server', status: 'ok', time: new Date().toISOString() };
  }
}
