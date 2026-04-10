import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AiController } from '../../ai/ai.controller';
import { AutomationController } from '../../automation/automation.controller';
import { ApiKeyController } from '../../auth/api-key.controller';
import { AuthController } from '../../auth/auth.controller';
import { ChatController } from '../../chat/chat.controller';
import { OpenApiMessageController } from '../../chat/open-api-message.controller';
import { McpController } from '../../mcp/mcp.controller';
import { MemoryController } from '../../memory/memory.controller';
import { PersonaController } from '../../persona/persona.controller';
import { PluginCommandController } from '../../plugin/plugin-command.controller';
import { PluginRouteController } from '../../plugin/plugin-route.controller';
import { PluginSubagentTaskController } from '../../plugin/plugin-subagent-task.controller';
import { PluginController } from '../../plugin/plugin.controller';
import { SkillController } from '../../skill/skill.controller';
import { ToolController } from '../../tool/tool.controller';
import { UserController } from '../../user/user.controller';

type ControllerClass = abstract new (...args: never[]) => object;

export const API_CONTROLLERS = [
  AiController,
  ApiKeyController,
  AuthController,
  AutomationController,
  ChatController,
  McpController,
  MemoryController,
  OpenApiMessageController,
  PersonaController,
  PluginCommandController,
  PluginController,
  PluginRouteController,
  PluginSubagentTaskController,
  SkillController,
  ToolController,
  UserController,
] as const;

export const WEB_API_UTILITY_FILES = [
  'base.ts',
  'shared-contract.typecheck.ts',
] as const;

export const SERVER_CONTROLLER_WEB_API_COVERAGE: Record<string, string[]> = {
  'ai': ['ai-settings'],
  'auth': ['auth'],
  'auth/api-keys': ['api-keys'],
  'automations': ['automations'],
  'chat': ['chat', 'skills'],
  'mcp': ['tools'],
  'personas': ['personas'],
  'plugin-commands': ['commands'],
  'plugin-routes': ['plugins'],
  'plugin-subagent-tasks': ['subagents'],
  'plugins': ['plugins'],
  'skills': ['skills'],
  'tools': ['tools'],
  'users': ['auth'],
};

export const SERVER_ONLY_CONTROLLER_GROUPS = [
  'memories',
  'open-api/conversations',
] as const;

export {
  AiController,
  ApiKeyController,
  AuthController,
  AutomationController,
  ChatController,
  McpController,
  MemoryController,
  OpenApiMessageController,
  PersonaController,
  PluginCommandController,
  PluginController,
  PluginRouteController,
  PluginSubagentTaskController,
  SkillController,
  ToolController,
  UserController,
};

export function listControllerRoutes(controller: ControllerClass): string[] {
  const controllerPaths = readPathMetadata(controller);
  const prototype = controller.prototype as Record<string, unknown>;

  return Object.getOwnPropertyNames(prototype)
    .filter((propertyName) => propertyName !== 'constructor')
    .flatMap((propertyName) => {
      const handler = prototype[propertyName];
      if (typeof handler !== 'function') {
        return [];
      }

      const requestMethod = Reflect.getMetadata(
        METHOD_METADATA,
        handler,
      ) as RequestMethod | undefined;
      if (typeof requestMethod === 'undefined') {
        return [];
      }

      return controllerPaths.flatMap((controllerPath) =>
        readPathMetadata(handler).map((handlerPath) => (
          `${toHttpMethodLabel(requestMethod)} /api${joinRoutePath(controllerPath, handlerPath)}`
        )));
    })
    .sort();
}

export function listServerControllerPaths(): string[] {
  return API_CONTROLLERS
    .flatMap((controller) => readPathMetadata(controller))
    .sort();
}

export function listWebFeatureApiRoots(): string[] {
  const featuresDirectory = resolve(process.cwd(), '../web/src/features');
  return readdirSync(featuresDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((featureName) => {
      const apiDirectory = resolve(featuresDirectory, featureName, 'api');
      try {
        return readdirSync(apiDirectory).some((fileName) => fileName.endsWith('.ts'));
      } catch {
        return false;
      }
    })
    .sort();
}

export function listWebApiUtilityFiles(): string[] {
  const apiDirectory = resolve(process.cwd(), '../web/src/api');
  return readdirSync(apiDirectory)
    .filter((fileName) => fileName.endsWith('.ts'))
    .filter((fileName) => WEB_API_UTILITY_FILES.includes(fileName as typeof WEB_API_UTILITY_FILES[number]))
    .sort();
}

export function listWebFeatureApiFiles(): string[] {
  const featuresDirectory = resolve(process.cwd(), '../web/src/features');
  return listWebFeatureApiRoots()
    .flatMap((featureName) => {
      const apiDirectory = resolve(featuresDirectory, featureName, 'api');
      return readdirSync(apiDirectory)
        .filter((fileName) => fileName.endsWith('.ts'))
        .map((fileName) => `${featureName}/${fileName}`);
    })
    .sort();
}

function readPathMetadata(target: object): string[] {
  const metadata = Reflect.getMetadata(PATH_METADATA, target) as string | string[] | undefined;
  if (Array.isArray(metadata)) {
    return metadata.map((value) => normalizePathSegment(value));
  }

  return [normalizePathSegment(metadata ?? '')];
}

function normalizePathSegment(segment: string): string {
  const trimmed = segment.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/^\/+|\/+$/g, '');
}

function joinRoutePath(controllerPath: string, handlerPath: string): string {
  const parts = [controllerPath, handlerPath].filter((part) => part.length > 0);
  return parts.length > 0 ? `/${parts.join('/')}` : '';
}

function toHttpMethodLabel(method: RequestMethod): string {
  switch (method) {
    case RequestMethod.GET:
      return 'GET';
    case RequestMethod.POST:
      return 'POST';
    case RequestMethod.PUT:
      return 'PUT';
    case RequestMethod.DELETE:
      return 'DELETE';
    case RequestMethod.PATCH:
      return 'PATCH';
    case RequestMethod.ALL:
      return 'ALL';
    default:
      return `UNKNOWN(${method})`;
  }
}
