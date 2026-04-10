import type { PluginManifest } from '@garlic-claw/shared';
import { WebSocket } from 'ws';
import { PluginGateway } from '../../plugin/plugin.gateway';

export const remoteManifest: PluginManifest = {
  id: 'remote.pc-host',
  name: '电脑助手',
  version: '1.0.0',
  runtime: 'remote',
  permissions: ['conversation:read'],
  tools: [
    {
      name: 'list_directory',
      description: '列目录',
      parameters: {
        dirPath: {
          type: 'string',
          required: true,
        },
      },
    },
  ],
  hooks: [
    {
      name: 'chat:before-model',
    },
  ],
};

export function createPluginGatewayFixture() {
  const pluginRuntime = {
    callHost: jest.fn(),
  };
  const pluginRuntimeOrchestrator = {
    registerPlugin: jest.fn(),
    unregisterPlugin: jest.fn(),
    touchPluginHeartbeat: jest.fn(),
  };
  const jwtService = {
    verify: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string, fallback: unknown) => fallback),
  };

  const gateway = new PluginGateway(
    pluginRuntime as never,
    pluginRuntimeOrchestrator as never,
    jwtService as never,
    configService as never,
  );

  return {
    gateway,
    pluginRuntime,
    pluginRuntimeOrchestrator,
    jwtService,
    configService,
  };
}

/**
 * 创建最小 WebSocket 桩对象。
 * @returns 仅包含网关测试所需字段的方法桩
 */
export function createSocketStub() {
  return {
    readyState: WebSocket.OPEN,
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    off: jest.fn(),
    ping: jest.fn(),
  };
}

export function getSocketHandler(ws: ReturnType<typeof createSocketStub>, eventName: string) {
  const handler = ws.on.mock.calls.find((call) => call[0] === eventName)?.[1];
  if (typeof handler !== 'function') {
    throw new Error(`missing socket handler for ${eventName}`);
  }

  return handler as (...args: unknown[]) => void;
}

export function readLastSentMessage(ws: ReturnType<typeof createSocketStub>) {
  return JSON.parse(ws.send.mock.calls.at(-1)?.[0] ?? '{}');
}

export async function flushPendingTasks() {
  await new Promise((resolve) => setImmediate(resolve));
}

export function closeSocketConnection(ws: ReturnType<typeof createSocketStub>) {
  getSocketHandler(ws, 'close')();
}
