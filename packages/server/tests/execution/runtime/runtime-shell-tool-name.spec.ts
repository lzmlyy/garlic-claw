import {
  isAbsoluteShellWorkdir,
  readRuntimeShellToolAliases,
  readRuntimeShellToolName,
} from '../../../src/modules/execution/runtime/runtime-shell-tool-name';

describe('runtime-shell-tool-name', () => {
  it('returns powershell for windows native-shell and bash elsewhere', () => {
    expect(readRuntimeShellToolName('just-bash')).toBe('bash');
    expect(readRuntimeShellToolName('wsl-shell')).toBe('bash');
    expect(readRuntimeShellToolName('native-shell')).toBe(
      process.platform === 'win32' ? 'powershell' : 'bash',
    );
  });

  it('keeps bash and powershell as interchangeable aliases for shell tool resolution', () => {
    expect(readRuntimeShellToolAliases('native-shell')).toEqual(
      process.platform === 'win32'
        ? ['powershell', 'bash']
        : ['bash', 'powershell'],
    );
  });

  it('recognizes host absolute workdir only for host-backed shell runtimes', () => {
    expect(isAbsoluteShellWorkdir('native-shell', 'D:\\repo')).toBe(
      process.platform === 'win32',
    );
    expect(isAbsoluteShellWorkdir('wsl-shell', 'D:\\repo')).toBe(
      process.platform === 'win32',
    );
    expect(isAbsoluteShellWorkdir('just-bash', 'D:\\repo')).toBe(false);
    expect(isAbsoluteShellWorkdir('wsl-shell', '/mnt/d/repo')).toBe(true);
  });
});
