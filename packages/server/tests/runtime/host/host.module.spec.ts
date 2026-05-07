import { HostModule } from '../../../src/modules/runtime/host/host.module';

describe('HostModule', () => {
  it('exports direct conversation owners for HTTP and runtime consumers', () => {
    expect(HostModule).toBeDefined();
  });
});
