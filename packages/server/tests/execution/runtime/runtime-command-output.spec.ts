import { renderRuntimeCommandTextOutput } from '../../../src/modules/execution/runtime/runtime-command-output';

describe('renderRuntimeCommandTextOutput', () => {
  it('renders empty stdout and stderr with a compact bash result structure', () => {
    expect(renderRuntimeCommandTextOutput({
      cwd: '/',
      exitCode: 0,
      stderr: '',
      stderrStats: {
        bytes: 0,
        lines: 0,
      },
      stdout: '',
      stdoutStats: {
        bytes: 0,
        lines: 0,
      },
    })).toBe([
      '<bash_result>',
      '(no output)',
      '</bash_result>',
    ].join('\n'));
  });

  it('truncates oversized stream output to a bounded tail view', () => {
    const stdout = Array.from({ length: 260 }, (_, index) => `line-${index + 1}`).join('\n');

    const output = renderRuntimeCommandTextOutput({
      cwd: '/tmp',
      exitCode: 0,
      stderr: '',
      stderrStats: {
        bytes: 0,
        lines: 0,
      },
      stdout,
      stdoutStats: {
        bytes: Buffer.byteLength(stdout, 'utf8'),
        lines: 260,
      },
    });

    expect(output).toContain('<bash_result>');
    expect(output).toContain('...output truncated (仅保留最后 200 行)...');
    expect(output).toContain('<stdout>');
    expect(output).toContain('line-61');
    expect(output).toContain('line-260');
    expect(output).not.toContain('line-1\n');
  });

  it('truncates oversized bytes without breaking the result wrapper', () => {
    const stdout = `prefix\n${'长'.repeat(10_000)}`;

    const output = renderRuntimeCommandTextOutput({
      cwd: '/tmp',
      exitCode: 7,
      stderr: 'warn',
      stderrStats: {
        bytes: 4,
        lines: 1,
      },
      stdout,
      stdoutStats: {
        bytes: Buffer.byteLength(stdout, 'utf8'),
        lines: 2,
      },
    });

    expect(output).toContain('Command exited with code 7.');
    expect(output).toContain(`...output truncated (仅保留最后 16384 字节内的内容)...`);
    expect(output).toContain('<stdout>');
    expect(output).toContain('<stderr>\nwarn\n</stderr>');
  });

  it('supports custom truncation limits', () => {
    const stdout = Array.from({ length: 8 }, (_, index) => `line-${index + 1}`).join('\n');

    const output = renderRuntimeCommandTextOutput({
      cwd: '/tmp',
      exitCode: 0,
      stderr: '',
      stderrStats: {
        bytes: 0,
        lines: 0,
      },
      stdout,
      stdoutStats: {
        bytes: Buffer.byteLength(stdout, 'utf8'),
        lines: 8,
      },
    }, {
      maxLines: 3,
    });

    expect(output).toContain('...output truncated (仅保留最后 3 行)...');
    expect(output).toContain('line-6');
    expect(output).toContain('line-8');
    expect(output).not.toContain('line-5\n');
  });

  it('can hide truncation details while still returning the bounded tail', () => {
    const stdout = Array.from({ length: 8 }, (_, index) => `line-${index + 1}`).join('\n');

    const output = renderRuntimeCommandTextOutput({
      cwd: '/tmp',
      exitCode: 0,
      stderr: '',
      stderrStats: {
        bytes: 0,
        lines: 0,
      },
      stdout,
      stdoutStats: {
        bytes: Buffer.byteLength(stdout, 'utf8'),
        lines: 8,
      },
    }, {
      maxLines: 2,
      showTruncationDetails: false,
    });

    expect(output).not.toContain('output truncated');
    expect(output).not.toContain('仅保留最后');
    expect(output).toContain('<stdout>\nline-7\nline-8\n</stdout>');
  });

  it('still exposes the saved output path when truncation details are hidden', () => {
    const stdout = Array.from({ length: 8 }, (_, index) => `line-${index + 1}`).join('\n');

    const output = renderRuntimeCommandTextOutput({
      cwd: '/tmp',
      exitCode: 0,
      outputPath: '/.garlic-claw/runtime-command-output/command-hidden-details.txt',
      stderr: '',
      stderrStats: {
        bytes: 0,
        lines: 0,
      },
      stdout,
      stdoutStats: {
        bytes: Buffer.byteLength(stdout, 'utf8'),
        lines: 8,
      },
    }, {
      maxLines: 2,
      showTruncationDetails: false,
    });

    expect(output).not.toContain('output truncated');
    expect(output).toContain('Full output saved to: /.garlic-claw/runtime-command-output/command-hidden-details.txt');
    expect(output).toContain('<stdout>\nline-7\nline-8\n</stdout>');
  });

  it('supports a custom result wrapper tag', () => {
    const output = renderRuntimeCommandTextOutput({
      cwd: '/tmp',
      exitCode: 0,
      stderr: '',
      stderrStats: {
        bytes: 0,
        lines: 0,
      },
      stdout: 'done',
      stdoutStats: {
        bytes: 4,
        lines: 1,
      },
    }, {
      resultTagName: 'powershell_result',
    });

    expect(output).toContain('<powershell_result>');
    expect(output).toContain('</powershell_result>');
    expect(output).not.toContain('<bash_result>');
  });

  it('keeps successful stderr output as compact metadata', () => {
    const output = renderRuntimeCommandTextOutput({
      cwd: '/tmp',
      exitCode: 0,
      stderr: 'warning: skipped optional step',
      stderrStats: {
        bytes: Buffer.byteLength('warning: skipped optional step', 'utf8'),
        lines: 1,
      },
      stdout: 'done',
      stdoutStats: {
        bytes: 4,
        lines: 1,
      },
    });

    expect(output).toContain('Command produced stderr output; review it for warnings or errors.');
    expect(output).toContain('<stdout>\ndone\n</stdout>');
    expect(output).toContain('<stderr>\nwarning: skipped optional step\n</stderr>');
  });

  it('marks failed commands without stderr with a compact exit-code hint', () => {
    const output = renderRuntimeCommandTextOutput({
      cwd: '/tmp',
      exitCode: 2,
      stderr: '',
      stderrStats: {
        bytes: 0,
        lines: 0,
      },
      stdout: 'partial output',
      stdoutStats: {
        bytes: Buffer.byteLength('partial output', 'utf8'),
        lines: 1,
      },
    });

    expect(output).toContain('Command exited with code 2.');
    expect(output).toContain('<stdout>\npartial output\n</stdout>');
    expect(output).not.toContain('<stderr>');
  });

  it('renders saved output path when output was truncated', () => {
    const stdout = Array.from({ length: 260 }, (_, index) => `line-${index + 1}`).join('\n');

    const output = renderRuntimeCommandTextOutput({
      cwd: '/tmp',
      exitCode: 0,
      outputPath: '/.garlic-claw/runtime-command-output/command-test.txt',
      stderr: '',
      stderrStats: {
        bytes: 0,
        lines: 0,
      },
      stdout,
      stdoutStats: {
        bytes: Buffer.byteLength(stdout, 'utf8'),
        lines: 260,
      },
    });

    expect(output).toContain('Full output saved to: /.garlic-claw/runtime-command-output/command-test.txt');
    expect(output).toContain('Use grep to search the full output or read the saved file with offset/limit to inspect a narrower window.');
  });
});
