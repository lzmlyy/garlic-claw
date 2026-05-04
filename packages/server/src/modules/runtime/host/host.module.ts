import { forwardRef, Module, OnModuleInit } from '@nestjs/common';
import { AiModelExecutionService } from '../../ai/ai-model-execution.service';
import { AiManagementService } from '../../ai-management/ai-management.service';
import { AiProviderSettingsService } from '../../ai-management/ai-provider-settings.service';
import { CoreLoggingModule } from '../../../core/logging/core-logging.module';
import { AutomationExecutionService } from '../../execution/automation/automation-execution.service';
import { AutomationService } from '../../execution/automation/automation.service';
import { BashToolService } from '../../execution/bash/bash-tool.service';
import { EditToolService } from '../../execution/edit/edit-tool.service';
import { HostFilesystemBackendService } from '../../execution/file/host-filesystem-backend.service';
import { GlobToolService } from '../../execution/glob/glob-tool.service';
import { GrepToolService } from '../../execution/grep/grep-tool.service';
import { InvalidToolService } from '../../execution/invalid/invalid-tool.service';
import { McpService } from '../../execution/mcp/mcp.service';
import { ProjectWorktreeOverlayModule } from '../../execution/project/project-worktree-overlay.module';
import { ProjectWorktreeSearchOverlayService } from '../../execution/project/project-worktree-search-overlay.service';
import { ReadToolService } from '../../execution/read/read-tool.service';
import { RuntimeCommandService } from '../../execution/runtime/runtime-command.service';
import { RUNTIME_BACKENDS_TOKEN } from '../../execution/runtime/runtime-backend.tokens';
import { RuntimeBackendRoutingService } from '../../execution/runtime/runtime-backend-routing.service';
import { RuntimeCommandCaptureService } from '../../execution/runtime/runtime-command-capture.service';
import { RuntimeFileFreshnessService } from '../../execution/runtime/runtime-file-freshness.service';
import { RUNTIME_FILESYSTEM_BACKENDS_TOKEN } from '../../execution/runtime/runtime-filesystem-backend.tokens';
import { RuntimeFilesystemBackendService } from '../../execution/runtime/runtime-filesystem-backend.service';
import { RuntimeFilesystemPostWriteService } from '../../execution/runtime/runtime-filesystem-post-write.service';
import { RuntimeJustBashService } from '../../execution/runtime/runtime-just-bash.service';
import { RuntimeNativeShellService } from '../../execution/runtime/runtime-native-shell.service';
import { RuntimeOneShotShellService } from '../../execution/runtime/runtime-one-shot-shell.service';
import { RuntimeSessionEnvironmentService } from '../../execution/runtime/runtime-session-environment.service';
import { RuntimeToolBackendService } from '../../execution/runtime/runtime-tool-backend.service';
import { RuntimeToolPermissionService } from '../../execution/runtime/runtime-tool-permission.service';
import { RuntimeToolsSettingsService } from '../../execution/runtime/runtime-tools-settings.service';
import { SubagentSettingsService } from '../../execution/subagent/subagent-settings.service';
import { SubagentToolService } from '../../execution/subagent/subagent-tool.service';
import { RuntimeWslShellService } from '../../execution/runtime/runtime-wsl-shell.service';
import { SkillRegistryService } from '../../execution/skill/skill-registry.service';
import { SkillToolService } from '../../execution/skill/skill-tool.service';
import { TodoToolService } from '../../execution/todo/todo-tool.service';
import { WebFetchService } from '../../execution/webfetch/webfetch-service';
import { WebFetchToolService } from '../../execution/webfetch/webfetch-tool.service';
import { WriteToolService } from '../../execution/write/write-tool.service';
import { ToolManagementSettingsService } from '../../execution/tool/tool-management-settings.service';
import { ToolOutputCaptureService } from '../../execution/tool/tool-output-capture.service';
import { ToolRegistryService } from '../../execution/tool/tool-registry.service';
import { PersonaService } from '../../persona/persona.service';
import { PluginModule } from '../../plugin/plugin.module';
import { RuntimeGatewayModule } from '../gateway/runtime-gateway.module';
import { RuntimeKernelModule } from '../kernel/runtime-kernel.module';
import { AiVisionService } from '../../vision/ai-vision.service';
import { ConversationMessageService } from './conversation-message.service';
import { ConversationStoreService } from './conversation-store.service';
import { ConversationTodoService } from './conversation-todo.service';
import { KnowledgeReaderService } from './knowledge-reader.service';
import { PluginDispatchService } from './plugin-dispatch.service';
import { PluginRuntimeService } from './plugin-runtime.service';
import { ToolGatewayService } from './tool-gateway.service';
import { PluginHostService } from './plugin-host.service';
import { SubagentRunnerService } from './subagent-runner.service';
import { UserContextService } from './user-context.service';
import { SettingsStore } from '../../../core/config/settings.store';
import { ConversationModule } from '../../conversation/conversation.module';

@Module({
  imports: [CoreLoggingModule, PluginModule, RuntimeGatewayModule, RuntimeKernelModule, ProjectWorktreeOverlayModule, forwardRef(() => ConversationModule)],
  providers: [
    AiModelExecutionService,
    AiManagementService,
    AiProviderSettingsService,
    AutomationExecutionService,
    AutomationService,
    BashToolService,
    EditToolService,
    GlobToolService,
    GrepToolService,
    InvalidToolService,
    McpService,
    PersonaService,
    ProjectWorktreeSearchOverlayService,
    AiVisionService,
    ConversationMessageService,
    ConversationStoreService,
    ConversationTodoService,
    {
      provide: RUNTIME_BACKENDS_TOKEN,
      useFactory: (
        runtimeJustBashService: RuntimeJustBashService,
        runtimeNativeShellService: RuntimeNativeShellService,
        runtimeWslShellService: RuntimeWslShellService,
      ) => process.platform === 'win32'
        ? [runtimeJustBashService, runtimeNativeShellService, runtimeWslShellService]
        : [runtimeJustBashService, runtimeNativeShellService],
      inject: [RuntimeJustBashService, RuntimeNativeShellService, RuntimeWslShellService],
    },
    {
      provide: RUNTIME_FILESYSTEM_BACKENDS_TOKEN,
      useFactory: (hostFilesystemBackendService: HostFilesystemBackendService) => [hostFilesystemBackendService],
      inject: [HostFilesystemBackendService],
    },
    RuntimeCommandService,
    RuntimeCommandCaptureService,
    RuntimeBackendRoutingService,
    RuntimeFileFreshnessService,
    RuntimeFilesystemBackendService,
    RuntimeFilesystemPostWriteService,
    RuntimeToolBackendService,
    RuntimeToolPermissionService,
    SettingsStore,
    RuntimeToolsSettingsService,
    ToolManagementSettingsService,
    ToolOutputCaptureService,
    SubagentSettingsService,
    SubagentToolService,
    RuntimeWslShellService,
    KnowledgeReaderService,
    PluginDispatchService,
    PluginRuntimeService,
    ToolGatewayService,
    PluginHostService,
    SubagentRunnerService,
    UserContextService,
    RuntimeJustBashService,
    RuntimeNativeShellService,
    RuntimeOneShotShellService,
    RuntimeSessionEnvironmentService,
    HostFilesystemBackendService,
    ReadToolService,
    SkillRegistryService,
    SkillToolService,
    TodoToolService,
    WebFetchService,
    WebFetchToolService,
    WriteToolService,
    ToolRegistryService,
  ],
  exports: [CoreLoggingModule, AiModelExecutionService, AiManagementService, AiProviderSettingsService, AiVisionService, AutomationService, BashToolService, EditToolService, GlobToolService, GrepToolService, InvalidToolService, McpService, PersonaService, ProjectWorktreeSearchOverlayService, RuntimeCommandService, RuntimeCommandCaptureService, RuntimeBackendRoutingService, RuntimeFileFreshnessService, RuntimeFilesystemBackendService, RuntimeFilesystemPostWriteService, ConversationMessageService, ConversationStoreService, ConversationTodoService, HostFilesystemBackendService, KnowledgeReaderService, PluginDispatchService, PluginRuntimeService, ToolGatewayService, SubagentRunnerService, PluginHostService, UserContextService, RuntimeJustBashService, RuntimeNativeShellService, RuntimeOneShotShellService, RuntimeSessionEnvironmentService, RuntimeToolBackendService, RuntimeToolPermissionService, SettingsStore, RuntimeToolsSettingsService, ToolManagementSettingsService, ToolOutputCaptureService, SubagentSettingsService, SubagentToolService, RuntimeWslShellService, ReadToolService, SkillRegistryService, SkillToolService, TodoToolService, ToolRegistryService, WebFetchService, WebFetchToolService, WriteToolService],
})
export class HostModule implements OnModuleInit {
  constructor(private readonly subagentRunner: SubagentRunnerService) {}

  onModuleInit(): void {
    this.subagentRunner.resumePendingSubagents();
  }
}
