import type { JsonObject, JsonValue } from './json';
import type { PluginCallContext } from './plugin';

/** Host API 方法名。 */
export type PluginHostMethod =
  | 'automation.create'
  | 'automation.event.emit'
  | 'automation.list'
  | 'automation.run'
  | 'automation.toggle'
  | 'config.get'
  | 'cron.delete'
  | 'cron.list'
  | 'cron.register'
  | 'conversation.get'
  | 'conversation.session.finish'
  | 'conversation.session.get'
  | 'conversation.session.keep'
  | 'conversation.session.start'
  | 'conversation.messages.list'
  | 'conversation.title.set'
  | 'kb.get'
  | 'kb.list'
  | 'kb.search'
  | 'llm.generate'
  | 'llm.generate-text'
  | 'log.list'
  | 'log.write'
  | 'message.send'
  | 'message.target.current.get'
  | 'memory.search'
  | 'memory.save'
  | 'persona.activate'
  | 'persona.current.get'
  | 'persona.get'
  | 'persona.list'
  | 'plugin.self.get'
  | 'provider.current.get'
  | 'provider.get'
  | 'provider.list'
  | 'provider.model.get'
  | 'storage.delete'
  | 'storage.get'
  | 'storage.list'
  | 'storage.set'
  | 'subagent.run'
  | 'subagent.task.get'
  | 'subagent.task.list'
  | 'subagent.task.start'
  | 'state.delete'
  | 'state.get'
  | 'state.list'
  | 'state.set'
  | 'user.get';

/** Host API 调用负载。 */
export interface HostCallPayload {
  method: PluginHostMethod;
  params: JsonObject;
  context?: PluginCallContext;
}

/** Host API 返回负载。 */
export interface HostResultPayload {
  data: JsonValue;
}
