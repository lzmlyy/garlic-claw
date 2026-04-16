import { HealthController } from '../../../../src/adapters/http/health/health.controller';

describe('HealthController', () => {
  it('returns an ok snapshot for server', () => {
    const snapshot = new HealthController().getHealth();

    expect(snapshot.status).toBe('ok');
    expect(snapshot.service).toBe('server');
    expect(Number.isNaN(Date.parse(snapshot.time))).toBe(false);
  });
});
