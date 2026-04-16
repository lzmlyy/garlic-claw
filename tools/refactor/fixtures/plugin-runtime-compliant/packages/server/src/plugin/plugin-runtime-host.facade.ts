export class PluginRuntimeHostFacade {
  constructor(moduleRef) {
    this.moduleRef = moduleRef;
  }

  getChatMessageService() {
    return this.moduleRef.get(ChatMessageService, { strict: false });
  }

  getSubagentTaskService() {
    return this.moduleRef.get(PluginSubagentTaskService, { strict: false });
  }
}
