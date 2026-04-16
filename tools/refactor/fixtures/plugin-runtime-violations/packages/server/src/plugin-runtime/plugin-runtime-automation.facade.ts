export class PluginRuntimeAutomationFacade {
  constructor(moduleRef) {
    this.moduleRef = moduleRef;
  }

  getAutomationService() {
    return this.moduleRef.get(AutomationService, { strict: false });
  }
}
