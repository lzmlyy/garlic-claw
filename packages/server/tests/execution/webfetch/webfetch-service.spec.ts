import http from 'node:http';
import { WebFetchService } from '../../../src/modules/execution/webfetch/webfetch-service';

describe('WebFetchService', () => {
  const service = new WebFetchService();

  it('fetches html and converts it to markdown by default', async () => {
    const server = await startFixtureServer((request, response) => {
      if (request.url === '/article') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<html><head><title>Smoke Article</title></head><body><h1>Smoke</h1><p>Hello <strong>webfetch</strong>.</p></body></html>');
        return;
      }
      response.writeHead(404);
      response.end('missing');
    });

    try {
      const result = await service.fetch({
        url: `${server.url}/article`,
      });

      expect(result).toEqual(expect.objectContaining({
        contentType: 'text/html',
        format: 'markdown',
        status: 200,
        title: 'Smoke Article',
      }));
      expect(result.output).toContain('# Smoke');
      expect(result.output).toMatch(/Hello\s+webfetch\./);
    } finally {
      await server.close();
    }
  });

  it('returns raw html when explicitly requested', async () => {
    const server = await startFixtureServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<html><body><p>raw html</p></body></html>');
    });

    try {
      const result = await service.fetch({
        url: server.url,
        format: 'html',
      });

      expect(result.output).toContain('<p>raw html</p>');
    } finally {
      await server.close();
    }
  });

  it('accepts application/text as plain text content', async () => {
    const server = await startFixtureServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/text; charset=utf-8' });
      response.end('Zhongshan: sunny 27C');
    });

    try {
      const result = await service.fetch({
        url: server.url,
        format: 'text',
      });

      expect(result).toEqual(expect.objectContaining({
        contentType: 'application/text',
        format: 'text',
        output: 'Zhongshan: sunny 27C',
        status: 200,
      }));
    } finally {
      await server.close();
    }
  });

  it('rejects urls outside http or https', async () => {
    await expect(service.fetch({
      url: 'file:///tmp/test.txt',
    })).rejects.toThrow('webfetch url 必须以 http:// 或 https:// 开头');
  });
});

async function startFixtureServer(
  handler: (request: http.IncomingMessage, response: http.ServerResponse) => void,
): Promise<{ close: () => Promise<void>; url: string }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('无法获取 webfetch fixture 地址');
  }
  return {
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    url: `http://127.0.0.1:${address.port}`,
  };
}
