import fs from 'node:fs';
import {
  listWindowsPowerShellCommandCandidates,
  readWindowsPowerShellVariant,
  supportsWindowsPowerShellAndAnd,
} from '../../../src/modules/execution/runtime/runtime-powershell-variant';

describe('runtime-powershell-variant', () => {
  const originalPath = process.env.PATH;
  const originalProgramFiles = process.env.ProgramFiles;
  const originalProgramFilesX86 = process.env['ProgramFiles(x86)'];
  const originalSystemRoot = process.env.SystemRoot;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    if (originalProgramFiles === undefined) {
      delete process.env.ProgramFiles;
    } else {
      process.env.ProgramFiles = originalProgramFiles;
    }
    if (originalProgramFilesX86 === undefined) {
      delete process.env['ProgramFiles(x86)'];
    } else {
      process.env['ProgramFiles(x86)'] = originalProgramFilesX86;
    }
    if (originalSystemRoot === undefined) {
      delete process.env.SystemRoot;
    } else {
      process.env.SystemRoot = originalSystemRoot;
    }
  });

  it('lists pwsh before Windows PowerShell command candidates', () => {
    expect(listWindowsPowerShellCommandCandidates()).toEqual([
      'pwsh.exe',
      'pwsh',
      'powershell.exe',
      'powershell',
    ]);
  });

  it('treats pwsh as the preferred detected PowerShell variant', () => {
    process.env.ProgramFiles = 'C:\\Program Files';
    process.env['ProgramFiles(x86)'] = 'C:\\Program Files (x86)';
    process.env.SystemRoot = 'C:\\Windows';
    process.env.PATH = 'C:\\Tools';

    jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => String(filePath).toLowerCase().includes('pwsh'));

    expect(readWindowsPowerShellVariant()).toBe('pwsh');
    expect(supportsWindowsPowerShellAndAnd()).toBe(true);
  });

  it('falls back to Windows PowerShell when pwsh is unavailable', () => {
    process.env.ProgramFiles = 'C:\\Program Files';
    process.env['ProgramFiles(x86)'] = 'C:\\Program Files (x86)';
    process.env.SystemRoot = 'C:\\Windows';
    process.env.PATH = 'C:\\Tools';

    jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
      const normalized = String(filePath).toLowerCase();
      return normalized.includes('windowspowershell') || normalized.endsWith('powershell.exe') || normalized.endsWith('powershell');
    });

    expect(readWindowsPowerShellVariant()).toBe('powershell');
    expect(supportsWindowsPowerShellAndAnd()).toBe(false);
  });

  it('still prefers pwsh when it is only available from PATH', () => {
    process.env.ProgramFiles = 'C:\\missing-program-files';
    process.env['ProgramFiles(x86)'] = 'C:\\missing-program-files-x86';
    process.env.SystemRoot = 'C:\\Windows';
    process.env.PATH = 'C:\\Tools';

    jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
      const normalized = String(filePath).toLowerCase();
      return normalized === 'c:\\tools\\pwsh.exe';
    });

    expect(readWindowsPowerShellVariant()).toBe('pwsh');
    expect(supportsWindowsPowerShellAndAnd()).toBe(true);
  });
});
