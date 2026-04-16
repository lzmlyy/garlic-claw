import type {
  ActionConfig,
  AutomationAfterRunHookResult,
  AutomationBeforeRunHookResult,
  AutomationInfo,
  JsonValue,
} from '@garlic-claw/shared';
import { Inject, Injectable } from '@nestjs/common';
import { RuntimeHostConversationMessageService } from '../../runtime/host/runtime-host-conversation-message.service';
import { RuntimeHostPluginDispatchService } from '../../runtime/host/runtime-host-plugin-dispatch.service';
import { runDispatchableHookChain } from '../../runtime/kernel/runtime-plugin-hook-governance';
import { asJsonValue, cloneJsonValue } from '../../runtime/host/runtime-host-values';
import type { RuntimeAutomationRecord, AutomationRunContext } from './automation.service';

@Injectable()
export class AutomationExecutionService {
  constructor(
    @Inject(RuntimeHostPluginDispatchService)
    private readonly runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService,
    @Inject(RuntimeHostConversationMessageService)
    private readonly conversationMessageService: RuntimeHostConversationMessageService,
  ) {}

  async executeAutomation(automation: RuntimeAutomationRecord): Promise<JsonValue> {
    const context = {
      source: 'automation' as const,
      userId: automation.userId,
      automationId: automation.id,
    };
    const automationInfo = toAutomationInfo(automation);
    const beforeRun = await this.runBeforeHooks(context, automationInfo);
    if (beforeRun.action === 'short-circuit') {
      return { results: beforeRun.results, status: beforeRun.status };
    }
    const executed = await this.executeActions(
      beforeRun.actions ?? automationInfo.actions,
      context,
    );
    return this.runAfterHooks(context, automationInfo, executed);
  }

  private async runBeforeHooks(
    context: AutomationRunContext,
    automation: AutomationInfo,
  ): Promise<
    | { action: 'continue'; actions: ActionConfig[] }
    | { action: 'short-circuit'; results: JsonValue[]; status: string }
  > {
    const result = await runDispatchableHookChain<
      ActionConfig[],
      AutomationBeforeRunHookResult,
      { action: 'short-circuit'; results: JsonValue[]; status: string }
    >({
      applyResponse: (actions, mutation) =>
        mutation.action === 'short-circuit'
          ? {
              shortCircuitResult: {
                action: 'short-circuit',
                results: mutation.results,
                status: mutation.status,
              },
            }
          : {
              state: Array.isArray(mutation.actions) ? mutation.actions : actions,
            },
      hookName: 'automation:before-run',
      initialState: automation.actions,
      kernel: this.runtimeHostPluginDispatchService,
      mapPayload: (actions) => asJsonValue({ context, automation, actions }),
      readContext: () => context,
    });
    return 'shortCircuitResult' in result
      ? result.shortCircuitResult
      : { action: 'continue', actions: result.state };
  }

  private async executeActions(
    actions: ActionConfig[],
    context: AutomationRunContext,
  ): Promise<{ results: JsonValue[]; status: string }> {
    const results: JsonValue[] = [];
    let status = 'success';
    for (const action of actions) {
      try {
        results.push(await this.executeAction(action, context));
      } catch (error) {
        status = 'error';
        results.push({
          action: action.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { results, status };
  }

  private async executeAction(
    action: ActionConfig,
    context: AutomationRunContext,
  ): Promise<JsonValue> {
    if (action.type === 'device_command' && action.plugin && action.capability) {
      return {
        action: action.type,
        plugin: action.plugin,
        capability: action.capability,
        result: await this.runtimeHostPluginDispatchService.executeTool({
          pluginId: action.plugin,
          toolName: action.capability,
          params: action.params || {},
          context,
        }),
      };
    }
    if (action.type === 'ai_message') {
      const message = action.message?.trim();
      if (!message) {
        throw new Error('ai_message 动作缺少 message');
      }
      if (!action.target) {
        throw new Error('ai_message 动作缺少 target');
      }
      const result = await this.conversationMessageService.sendMessage(context, {
        content: message,
        target: { id: action.target.id, type: action.target.type },
      });
      const target = (result as {
        target?: { id?: unknown; label?: unknown; type?: unknown };
      }).target;
      return {
        action: action.type,
        target:
          target &&
          typeof target.id === 'string' &&
          target.type === 'conversation'
            ? {
                id: target.id,
                ...(typeof target.label === 'string'
                  ? { label: target.label }
                  : {}),
                type: 'conversation' as const,
              }
            : { id: action.target.id, type: action.target.type },
        result,
      };
    }
    return { action: action.type };
  }

  private async runAfterHooks(
    context: AutomationRunContext,
    automation: AutomationInfo,
    execution: { results: JsonValue[]; status: string },
  ): Promise<{ results: JsonValue[]; status: string }> {
    const result = await runDispatchableHookChain<
      { results: JsonValue[]; status: string },
      AutomationAfterRunHookResult
    >({
      applyResponse: (next, mutation) => ({
        state: {
          status: typeof mutation.status === 'string' ? mutation.status : next.status,
          results: Array.isArray(mutation.results) ? mutation.results : next.results,
        },
      }),
      hookName: 'automation:after-run',
      initialState: execution,
      kernel: this.runtimeHostPluginDispatchService,
      mapPayload: (next) =>
        asJsonValue({
          context,
          automation,
          status: next.status,
          results: next.results,
        }),
      readContext: () => context,
    });
    return 'state' in result ? result.state : result.shortCircuitResult;
  }
}

function toAutomationInfo(automation: RuntimeAutomationRecord): AutomationInfo {
  const { logs: _logs, userId: _userId, ...rest } = automation;
  return {
    ...rest,
    actions: automation.actions.map((action) => cloneJsonValue(action)),
    trigger: cloneJsonValue(automation.trigger),
  };
}
