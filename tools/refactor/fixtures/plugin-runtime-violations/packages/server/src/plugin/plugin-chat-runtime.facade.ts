export class PluginChatRuntimeFacade {
  constructor(moduleRef) {
    this.moduleRef = moduleRef;
  }

  getAiProvider() {
    return this.moduleRef.get(AiProviderService, { strict: false });
  }
}
