export class PluginRuntimeHostFacade {
  constructor(moduleRef) {
    this.moduleRef = moduleRef;
  }

  getChatMessageService() {
    return this.moduleRef.get('ChatMessageService', { strict: false });
  }
}
