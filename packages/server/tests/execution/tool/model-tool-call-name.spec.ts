import {
  resolveKnownModelToolCallName,
  sanitizeModelToolCallName,
} from '../../../src/modules/execution/tool/model-tool-call-name';

describe('model-tool-call-name', () => {
  it('sanitizes leaked channel suffixes', () => {
    expect(sanitizeModelToolCallName('powershell<|channel|>commentary')).toBe(
      'powershell',
    );
  });

  it('maps bash and powershell between each other when only one shell tool is exposed', () => {
    expect(resolveKnownModelToolCallName('bash', ['powershell'])).toBe('powershell');
    expect(resolveKnownModelToolCallName('powershell', ['bash'])).toBe('bash');
  });
});
