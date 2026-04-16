export class PluginCronSchedulerService {
  constructor(moduleRef) {
    this.moduleRef = moduleRef;
  }

  getRuntime() {
    return this.moduleRef.get(PluginRuntimeService, { strict: false });
  }
}
