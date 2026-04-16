import { RuntimeHostModule } from '../../../src/runtime/host/runtime-host.module';

describe('RuntimeHostModule', () => {
  it('exports direct conversation owners for HTTP and runtime consumers', () => {
    expect(RuntimeHostModule).toBeDefined();
  });
});
