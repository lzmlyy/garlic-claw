import type { AiProviderService } from '../ai';
import type { SkillSessionService } from '../skill/skill-session.service';
import type { ToolRegistryService } from '../tool/tool-registry.service';

export interface ChatRuntimeDeps {
  aiProvider: AiProviderService;
  toolRegistry: ToolRegistryService;
  skillService: SkillSessionService;
}

export const CHAT_RUNTIME_DEPS = Symbol('CHAT_RUNTIME_DEPS');
