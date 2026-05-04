import type { ActionConfig, AutomationBeforeRunHookResult, AutomationInfo, JsonValue } from '@garlic-claw/shared';
import { Inject, Injectable } from '@nestjs/common';
import { ToolRegistryService } from '../tool/tool-registry.service';
import { asJsonValue, cloneJsonValue } from '../../runtime/host/host-input.codec';
import { ConversationMessageLifecycleService } from '../../conversation/conversation-message-lifecycle.service';
import { PluginDispatchService } from '../../runtime/host/plugin-dispatch.service';
import { applyMutatingDispatchableHooks, runDispatchableHookChain } from '../../runtime/kernel/runtime-plugin-hook-governance';
import type { AutomationRunContext, RuntimeAutomationRecord } from './automation.service';

interface AutomationRunPlan {
  actions: ActionConfig[];
  automation: AutomationInfo;
  context: AutomationRunContext;
}
interface AutomationExecutionOutcome { results: JsonValue[]; status: string; }
interface ShortCircuitedAutomationRun extends AutomationExecutionOutcome { action: 'short-circuit'; }

@Injectable()
export class AutomationExecutionService {
  constructor(
    @Inject(PluginDispatchService) private readonly pluginDispatch: PluginDispatchService,
    private readonly conversationMessageLifecycleService: ConversationMessageLifecycleService,
    private readonly toolRegistryService: ToolRegistryService,
  ) {}

  async executeAutomation(automation: RuntimeAutomationRecord): Promise<JsonValue> {
    const plan = createAutomationRunPlan(automation);
    const prepared = await prepareAutomationRun(plan, this.pluginDispatch);
    if ('action' in prepared) {
      return asJsonValue({ results: prepared.results, status: prepared.status });
    }
    const execution = await executeAutomationActions(prepared, this.conversationMessageLifecycleService, this.toolRegistryService);
    return asJsonValue(await settleAutomationRun(prepared, execution, this.pluginDispatch));
  }
}

function createAutomationRunPlan(automation: RuntimeAutomationRecord): AutomationRunPlan {
  const conversationId = automation.executionConversationId ?? readAutomationConversationId(automation.actions);
  return {
    actions: automation.actions.map((action) => cloneJsonValue(action)),
    automation: toAutomationInfo(automation),
    context: {
      automationId: automation.id,
      ...(conversationId ? { conversationId } : {}),
      source: 'automation',
      userId: automation.userId,
    },
  };
}

function readAutomationConversationId(actions: ActionConfig[]): string | null {
  for (const action of actions) {
    if (action.type === 'ai_message' && action.target?.type === 'conversation' && typeof action.target.id === 'string' && action.target.id.trim()) {
      return action.target.id;
    }
  }
  return null;
}

async function prepareAutomationRun(
  plan: AutomationRunPlan,
  kernel: PluginDispatchService,
): Promise<AutomationRunPlan | ShortCircuitedAutomationRun> {
  const result = await runDispatchableHookChain<ActionConfig[], AutomationBeforeRunHookResult, ShortCircuitedAutomationRun>({
    applyResponse: (actions, mutation) => mutation.action === 'short-circuit'
      ? { shortCircuitResult: { action: 'short-circuit', results: mutation.results, status: mutation.status } }
      : { state: Array.isArray(mutation.actions) ? mutation.actions : actions },
    hookName: 'automation:before-run',
    initialState: plan.actions,
    kernel,
    mapPayload: (actions) => asJsonValue({ context: plan.context, automation: plan.automation, actions }),
    readContext: () => plan.context,
  });
  if ('shortCircuitResult' in result) {
    return result.shortCircuitResult;
  }
  return { ...plan, actions: result.state };
}

async function executeAutomationActions(
  plan: AutomationRunPlan,
  conversationMessageLifecycleService: ConversationMessageLifecycleService,
  toolRegistryService: ToolRegistryService,
): Promise<AutomationExecutionOutcome> {
  const results: JsonValue[] = [];
  let status = 'success';
  for (const action of plan.actions) {
    try {
      results.push(await executeAutomationAction(action, plan.context, conversationMessageLifecycleService, toolRegistryService));
    } catch (error) {
      status = 'error';
      results.push({ action: action.type, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { results, status };
}

async function executeAutomationAction(
  action: ActionConfig,
  context: AutomationRunContext,
  conversationMessageLifecycleService: ConversationMessageLifecycleService,
  toolRegistryService: ToolRegistryService,
): Promise<JsonValue> {
  const toolSourceId = action.sourceId ?? action.plugin;
  const toolSourceKind = action.sourceKind ?? (action.plugin ? 'plugin' : undefined);
  if (action.type === 'device_command' && action.capability && toolSourceId && toolSourceKind) {
    return asJsonValue({
      action: action.type,
      capability: action.capability,
      ...(action.plugin ? { plugin: action.plugin } : {}),
      ...(action.sourceId ? { sourceId: action.sourceId } : {}),
      ...(action.sourceKind ? { sourceKind: action.sourceKind } : {}),
      result: await toolRegistryService.executeRegisteredTool({
        context,
        params: action.params || {},
        sourceId: toolSourceId,
        sourceKind: toolSourceKind,
        toolName: action.capability,
      }),
    });
  }
  if (action.type !== 'ai_message') {
    return { action: action.type };
  }
  const message = action.message?.trim();
  if (!message) {
    throw new Error('ai_message 动作缺少 message');
  }
  const conversationId = action.target?.id ?? context.conversationId;
  if (!conversationId) {
    throw new Error('ai_message 动作缺少 target');
  }
  const fallbackTarget = action.target ?? { id: conversationId, type: 'conversation' as const };
  const result = await conversationMessageLifecycleService.startMessageGeneration(
    conversationId,
    { content: message },
    context.userId,
  );
  return {
    action: action.type,
    target: readAutomationMessageTarget(result, fallbackTarget),
    result,
  };
}

async function settleAutomationRun(
  plan: AutomationRunPlan,
  execution: AutomationExecutionOutcome,
  kernel: PluginDispatchService,
): Promise<AutomationExecutionOutcome> {
  return applyMutatingDispatchableHooks({
    applyMutation: (next, mutation) => ({
      status: typeof mutation.status === 'string' ? mutation.status : next.status,
      results: Array.isArray(mutation.results) ? mutation.results : next.results,
    }),
    hookName: 'automation:after-run',
    kernel,
    payload: execution,
    mapPayload: (next) => asJsonValue({
      context: plan.context,
      automation: plan.automation,
      status: next.status,
      results: next.results,
    }),
    readContext: () => plan.context,
  });
}

function readAutomationMessageTarget(
  result: JsonValue,
  fallbackTarget: { id: string; type: 'conversation' },
): { id: string; label?: string; type: 'conversation' } {
  const target = (
    result as {
      target?: { id?: unknown; label?: unknown; type?: unknown };
      userMessage?: { target?: { id?: unknown; label?: unknown; type?: unknown } };
    }
  ).target
    ?? (
      result as {
        userMessage?: { target?: { id?: unknown; label?: unknown; type?: unknown } };
      }
    ).userMessage?.target;
  if (target && typeof target.id === 'string' && target.type === 'conversation') {
    return { id: target.id, ...(typeof target.label === 'string' ? { label: target.label } : {}), type: 'conversation' };
  }
  return { id: fallbackTarget.id, type: fallbackTarget.type };
}

function toAutomationInfo(automation: RuntimeAutomationRecord): AutomationInfo {
  const { logs: _logs, userId: _userId, ...rest } = automation;
  return {
    ...rest,
    actions: automation.actions.map((action) => cloneJsonValue(action)),
    trigger: cloneJsonValue(automation.trigger),
  };
}
