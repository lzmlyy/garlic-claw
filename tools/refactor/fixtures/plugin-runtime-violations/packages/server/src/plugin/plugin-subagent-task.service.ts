export class PluginSubagentTaskService {
  constructor(moduleRef) {
    this.moduleRef = moduleRef;
  }

  getPluginRuntime() {
    return this.moduleRef.get(PluginRuntimeService, { strict: false });
  }
}
