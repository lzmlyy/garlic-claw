import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createServerLogger } from '../../core/logging/server-logger';
import { readJwtSecret, readLoginSecret, SINGLE_USER_USERNAME } from './single-user-auth';

@Injectable()
export class BootstrapUserService {
  private readonly logger = createServerLogger(BootstrapUserService.name);

  constructor(private readonly configService: ConfigService) {}

  validateStartupAuthConfig(): void {
    readLoginSecret(this.configService);
    readJwtSecret(this.configService);
  }

  runStartupWarmup(): void {
    this.validateStartupAuthConfig();
    this.logger.info(`用户已就绪: ${SINGLE_USER_USERNAME}`);
  }
}
