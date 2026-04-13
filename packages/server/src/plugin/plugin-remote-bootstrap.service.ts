import {
  type PluginManifest,
  type RemotePluginBootstrapInfo,
  DeviceType,
} from '@garlic-claw/shared';
import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { PrismaService } from '../prisma/prisma.service';
import { createPluginEvent } from './plugin-event.helpers';
import { serializePersistedPluginManifest } from './plugin-manifest.persistence';
import { uuidv7 } from '@garlic-claw/shared';

interface IssueRemotePluginBootstrapInput {
  pluginName: string;
  deviceType: DeviceType;
  displayName?: string;
  description?: string;
  version?: string;
}

interface RemotePluginAuthClaims {
  sub: string;
  role: 'remote_plugin';
  authKind: 'remote-plugin';
  pluginName: string;
  deviceType: DeviceType;
}

@Injectable()
export class PluginRemoteBootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async issueBootstrap(
    input: IssueRemotePluginBootstrapInput,
  ): Promise<RemotePluginBootstrapInfo> {
    const pluginName = input.pluginName.trim();
    const displayName = input.displayName?.trim() || pluginName;
    const description = input.description?.trim() || undefined;
    const version = input.version?.trim() || '0.0.0';
    const existing = await this.prisma.plugin.findUnique({
      where: {
        name: pluginName,
      },
      select: {
        id: true,
        runtimeKind: true,
        manifestJson: true,
        displayName: true,
        description: true,
        version: true,
        deviceType: true,
      },
    });

    if (existing && existing.runtimeKind !== 'remote') {
      throw new BadRequestException(
        `插件 ${pluginName} 不是 remote 插件，不能生成远程接入令牌`,
      );
    }

    const placeholderManifest = buildRemotePluginPlaceholderManifest({
      pluginName,
      displayName,
      description,
      version,
    });
    const pluginRecord = existing
      ? await this.updateRemotePluginPlaceholder(existing, {
        deviceType: input.deviceType,
        displayName,
        description,
        version,
        placeholderManifest,
      })
      : await this.prisma.plugin.create({
        data: {
          id: uuidv7(),
          name: pluginName,
          displayName,
          deviceType: input.deviceType,
          runtimeKind: 'remote',
          description,
          status: 'offline',
          manifestJson: serializePersistedPluginManifest(placeholderManifest),
          version,
          healthStatus: 'unknown',
        },
        select: {
          id: true,
        },
      });

    await createPluginEvent({
      prisma: this.prisma,
      pluginId: pluginRecord.id,
      type: 'governance:remote-bootstrap',
      level: 'info',
      message: '已生成远程插件接入令牌',
      metadata: {
        deviceType: input.deviceType,
      },
    });

    const tokenExpiresIn = this.readTokenExpiresIn();
    const token = this.jwtService.sign(
      buildRemotePluginAuthClaims({
        pluginName,
        deviceType: input.deviceType,
      }),
      {
        secret: this.configService.get<string>('JWT_SECRET', 'fallback-secret'),
        expiresIn: tokenExpiresIn,
      },
    );

    return {
      pluginName,
      deviceType: input.deviceType,
      serverUrl: this.resolveRemotePluginServerUrl(),
      token,
      tokenExpiresIn,
    };
  }

  private async updateRemotePluginPlaceholder(
    existing: {
      id: string;
      manifestJson: string | null;
      displayName: string | null;
      description: string | null;
      version: string | null;
      deviceType: string;
    },
    input: {
      deviceType: DeviceType;
      displayName: string;
      description?: string;
      version: string;
      placeholderManifest: PluginManifest;
    },
  ): Promise<{ id: string }> {
    const nextData: Record<string, unknown> = {};

    if (existing.deviceType !== input.deviceType) {
      nextData.deviceType = input.deviceType;
    }
    if ((existing.displayName ?? '') !== input.displayName) {
      nextData.displayName = input.displayName;
    }
    if ((existing.description ?? '') !== (input.description ?? '')) {
      nextData.description = input.description ?? null;
    }
    if ((existing.version ?? '') !== input.version) {
      nextData.version = input.version;
    }
    if (!existing.manifestJson) {
      nextData.manifestJson = serializePersistedPluginManifest(input.placeholderManifest);
    }

    if (Object.keys(nextData).length === 0) {
      return {
        id: existing.id,
      };
    }

    return this.prisma.plugin.update({
      where: {
        id: existing.id,
      },
      data: nextData,
      select: {
        id: true,
      },
    });
  }

  private resolveRemotePluginServerUrl(): string {
    const explicitUrl = this.configService.get<string>('REMOTE_PLUGIN_WS_URL');
    if (explicitUrl?.trim()) {
      return explicitUrl.trim();
    }

    const port = this.configService.get<number>('WS_PORT', 23331);
    return `ws://127.0.0.1:${port}`;
  }

  private readTokenExpiresIn(): StringValue {
    return this.configService.get<StringValue>('REMOTE_PLUGIN_TOKEN_EXPIRES_IN')
      ?? '30d';
  }
}

function buildRemotePluginPlaceholderManifest(input: {
  pluginName: string;
  displayName: string;
  description?: string;
  version: string;
}): PluginManifest {
  return {
    id: input.pluginName,
    name: input.displayName,
    version: input.version,
    runtime: 'remote',
    ...(input.description ? { description: input.description } : {}),
    permissions: [],
    tools: [],
    hooks: [],
    routes: [],
  };
}

function buildRemotePluginAuthClaims(input: {
  pluginName: string;
  deviceType: DeviceType;
}): RemotePluginAuthClaims {
  return {
    sub: `remote-plugin:${input.pluginName}`,
    role: 'remote_plugin',
    authKind: 'remote-plugin',
    pluginName: input.pluginName,
    deviceType: input.deviceType,
  };
}
