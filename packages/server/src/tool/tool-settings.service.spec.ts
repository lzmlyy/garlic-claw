import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ToolSettingsService } from './tool-settings.service';

describe('ToolSettingsService', () => {
  const tempConfigPath = path.join(
    os.tmpdir(),
    `garlic-claw-tool-settings-${process.pid}-${Date.now()}.json`,
  );

  beforeEach(() => {
    process.env.GARLIC_CLAW_TOOL_GOVERNANCE_PATH = tempConfigPath;
    fs.rmSync(tempConfigPath, { force: true });
  });

  afterAll(() => {
    delete process.env.GARLIC_CLAW_TOOL_GOVERNANCE_PATH;
    fs.rmSync(tempConfigPath, { force: true });
  });

  it('persists source and tool enabled overrides to a dedicated governance file', () => {
    const service = new ToolSettingsService();

    expect(fs.existsSync(tempConfigPath)).toBe(false);
    expect(service.getSourceEnabled('mcp', 'weather-server')).toBeUndefined();
    expect(service.getToolEnabled('mcp:weather-server:get_forecast')).toBeUndefined();

    service.setSourceEnabled('mcp', 'weather-server', false);
    service.setToolEnabled('mcp:weather-server:get_forecast', false);

    expect(fs.existsSync(tempConfigPath)).toBe(true);
    const persisted = JSON.parse(fs.readFileSync(tempConfigPath, 'utf-8'));

    expect(persisted).toEqual({
      version: 1,
      sources: {
        'mcp:weather-server': {
          enabled: false,
        },
      },
      tools: {
        'mcp:weather-server:get_forecast': {
          enabled: false,
        },
      },
    });

    const reloaded = new ToolSettingsService();
    expect(reloaded.getSourceEnabled('mcp', 'weather-server')).toBe(false);
    expect(reloaded.getToolEnabled('mcp:weather-server:get_forecast')).toBe(false);
  });

  it('keeps valid persisted source and tool overrides while dropping malformed entries', () => {
    fs.writeFileSync(
      tempConfigPath,
      JSON.stringify({
        version: 1,
        sources: {
          'mcp:weather-server': {
            enabled: false,
          },
          'mcp:broken-string': {
            enabled: 'nope',
          },
          'mcp:not-object': 'bad',
        },
        tools: {
          'mcp:weather-server:get_forecast': {
            enabled: true,
          },
          'mcp:broken-array': [],
          'mcp:broken-value': {
            enabled: null,
          },
        },
      }, null, 2),
      'utf-8',
    );

    const service = new ToolSettingsService();

    expect(service.getSourceEnabled('mcp', 'weather-server')).toBe(false);
    expect(service.getSourceEnabled('mcp', 'broken-string')).toBeUndefined();
    expect(service.getToolEnabled('mcp:weather-server:get_forecast')).toBe(true);
    expect(service.getToolEnabled('mcp:broken-value')).toBeUndefined();
  });
});
