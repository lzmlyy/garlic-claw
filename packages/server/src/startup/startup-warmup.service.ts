import { Injectable, Logger } from '@nestjs/common';
import { AutomationService } from '../automation/automation.service';
import { BootstrapAdminService } from '../auth/bootstrap-admin.service';
import { McpService } from '../mcp/mcp.service';

/**
 * 后端端口 ready 后的后台预热协调器。
 *
 * 输入:
 * - 非关键启动任务
 *
 * 输出:
 * - 在不阻塞 `app.listen()` 的前提下，触发后台 warmup
 *
 * 预期行为:
 * - 仅调度不影响核心 HTTP 可用性的初始化
 * - 失败只记日志，不拖死已经 ready 的进程
 */
@Injectable()
export class StartupWarmupService {
  private readonly logger = new Logger(StartupWarmupService.name);
  private startupPromise: Promise<void> | null = null;

  constructor(
    private readonly mcpService: McpService,
    private readonly automationService: AutomationService,
    private readonly bootstrapAdminService: BootstrapAdminService,
  ) {}

  runPostListenWarmups(): Promise<void> {
    if (!this.startupPromise) {
      this.startupPromise = Promise.allSettled([
        this.runTask('MCP 运行时预热', () => this.mcpService.warmupOnStartup()),
        this.runTask('Automation cron 恢复', () => this.automationService.restoreCronJobsOnStartup()),
        this.runTask('Bootstrap 管理员补建', () => this.bootstrapAdminService.ensureBootstrapAdminOnStartup()),
      ]).then(() => undefined);
    }

    return this.startupPromise;
  }

  private async runTask(label: string, task: () => Promise<void>): Promise<void> {
    const startedAt = Date.now();
    try {
      await task();
      this.logger.log(`${label}完成 (${Date.now() - startedAt}ms)`);
    } catch (error) {
      this.logger.error(
        `${label}失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
