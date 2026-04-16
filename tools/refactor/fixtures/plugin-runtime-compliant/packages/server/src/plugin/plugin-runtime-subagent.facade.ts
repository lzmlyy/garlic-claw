export class PluginRuntimeSubagentFacade {
  constructor(moduleRef) {
    this.moduleRef = moduleRef;
  }

  getToolRegistry() {
    return this.moduleRef.get(ToolRegistryService, { strict: false });
  }
}
