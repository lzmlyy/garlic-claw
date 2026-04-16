export class PluginChatRuntimeFacade {
  constructor(moduleRef) {
    this.moduleRef = moduleRef;
  }

  getAiProvider() {
    return this.moduleRef.get(AiProviderService, { strict: false });
  }

  getSkillSession() {
    return this.moduleRef.get(SkillSessionService, { strict: false });
  }

  getToolRegistry() {
    return this.moduleRef.get(ToolRegistryService, { strict: false });
  }
}
