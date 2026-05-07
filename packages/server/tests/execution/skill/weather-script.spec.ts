import { spawn } from 'node:child_process';
import * as http from 'node:http';
import * as path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
const scriptPath = path.join(
  projectRoot,
  'config',
  'skills',
  'definitions',
  'weather-query',
  'scripts',
  'weather.js',
);

describe('weather-query weather.js', () => {
  it('returns a concise summary from JSON weather data', async () => {
    const requests: string[] = [];
    const server = http.createServer((request, response) => {
      requests.push(request.url ?? '');
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(
        JSON.stringify({
          current_condition: [
            {
              FeelsLikeC: '27',
              humidity: '80',
              temp_C: '25',
              weatherDesc: [{ value: '多云' }],
              winddir16Point: 'NE',
              windspeedKmph: '12',
            },
          ],
          nearest_area: [
            {
              areaName: [{ value: '中山' }],
              country: [{ value: '中国' }],
              region: [{ value: '广东' }],
            },
          ],
          weather: [
            {
              hourly: [{ weatherDesc: [{ value: '晴' }] }],
              maxtempC: '30',
              mintempC: '22',
            },
            {
              hourly: [{ weatherDesc: [{ value: '阵雨' }] }],
              maxtempC: '29',
              mintempC: '23',
            },
          ],
        }),
      );
    });

    try {
      const baseUrl = await listenServer(server);
      const result = await runWeatherScript(['广东中山'], {
        GARLIC_CLAW_WEATHER_QUERY_BASE_URL: baseUrl,
      });

      expect(requests).toEqual([
        '/%E5%B9%BF%E4%B8%9C%E4%B8%AD%E5%B1%B1?format=j1&lang=zh-cn',
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout.trim()).toBe(
        '广东中山：多云，25°C，体感27°C，湿度80%，NE风 12km/h；今天：晴，30/22°C；明天：阵雨，29/23°C',
      );
    } finally {
      await closeServer(server);
    }
  });

  it('fails with usage when location is missing', async () => {
    const result = await runWeatherScript([]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe('用法: node scripts/weather.js <地点>');
  });

  it('surfaces upstream HTTP failures', async () => {
    const server = http.createServer((_request, response) => {
      response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('upstream failed');
    });

    try {
      const baseUrl = await listenServer(server);
      const result = await runWeatherScript(['上海'], {
        GARLIC_CLAW_WEATHER_QUERY_BASE_URL: baseUrl,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr.trim()).toBe('天气查询失败: HTTP 502 upstream failed');
    } finally {
      await closeServer(server);
    }
  });
});

function runWeatherScript(
  args: string[],
  envOverrides: Record<string, string> = {},
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      env: {
        ...process.env,
        ...envOverrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({
        exitCode: exitCode ?? -1,
        stderr,
        stdout,
      });
    });
  });
}

function listenServer(server: http.Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('无法获取测试 HTTP 端口'));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}/`);
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
