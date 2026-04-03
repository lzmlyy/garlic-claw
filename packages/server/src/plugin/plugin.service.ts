import type {
  JsonObject,
  JsonValue,
  PluginConfigSnapshot,
  PluginEventLevel,
  PluginEventListResult,
  PluginHealthSnapshot,
  PluginManifest,
  PluginScopeSettings,
  PluginSelfInfo,
} from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import type { ListPluginEventOptions } from './plugin-event.helpers';
import { PluginEventWriteService } from './plugin-event-write.service';
import { PluginGovernanceWriteService } from './plugin-governance-write.service';
import {
  type PluginGovernanceSnapshot,
  PluginLifecycleWriteService,
} from './plugin-lifecycle-write.service';
import { PluginReadService } from './plugin-read.service';
import { PluginStorageService } from './plugin-storage.service';

export type { PluginGovernanceSnapshot } from './plugin-lifecycle-write.service';

type PluginEventInput = {
  type: string;
  message: string;
  metadata?: JsonObject;
};

@Injectable()
export class PluginService {
  constructor(
    private readonly pluginEventWriteService: PluginEventWriteService,
    private readonly pluginGovernanceWriteService: PluginGovernanceWriteService,
    private readonly pluginLifecycleWriteService: PluginLifecycleWriteService,
    private readonly pluginReadService: PluginReadService,
    private readonly pluginStorageService: PluginStorageService,
  ) {}

  readonly registerPlugin = (
    name: string,
    deviceType: string,
    manifest: PluginManifest,
  ): Promise<PluginGovernanceSnapshot> =>
    this.pluginLifecycleWriteService.registerPlugin(name, deviceType, manifest);

  readonly getGovernanceSnapshot = (name: string): Promise<PluginGovernanceSnapshot> =>
    this.pluginReadService.getGovernanceSnapshot(name);

  readonly setOnline = (name: string) =>
    this.pluginLifecycleWriteService.setOnline(name);

  readonly setOffline = (name: string) =>
    this.pluginLifecycleWriteService.setOffline(name);

  readonly heartbeat = (name: string) =>
    this.pluginLifecycleWriteService.heartbeat(name);

  readonly findAll = () => this.pluginReadService.findAll();

  readonly findOnline = () => this.pluginReadService.findOnline();

  readonly findByName = (name: string) => this.pluginReadService.findByName(name);

  readonly deletePlugin = (name: string) =>
    this.pluginLifecycleWriteService.deletePlugin(name);

  readonly getPluginConfig = (name: string): Promise<PluginConfigSnapshot> =>
    this.pluginReadService.getPluginConfig(name);

  readonly getResolvedConfig = (name: string): Promise<JsonObject> =>
    this.pluginReadService.getResolvedConfig(name);

  readonly getPluginStorage = (
    name: string,
    key: string,
  ): Promise<JsonValue | null> => this.pluginStorageService.getPluginStorage(name, key);

  readonly setPluginStorage = (
    name: string,
    key: string,
    value: JsonValue,
  ): Promise<JsonValue> => this.pluginStorageService.setPluginStorage(name, key, value);

  readonly deletePluginStorage = (name: string, key: string): Promise<boolean> =>
    this.pluginStorageService.deletePluginStorage(name, key);

  readonly listPluginStorage = (
    name: string,
    prefix?: string,
  ): Promise<Array<{ key: string; value: JsonValue }>> =>
    this.pluginStorageService.listPluginStorage(name, prefix);

  readonly getPluginSelfInfo = (name: string): Promise<PluginSelfInfo> =>
    this.pluginReadService.getPluginSelfInfo(name);

  readonly updatePluginConfig = (
    name: string,
    values: JsonObject,
  ): Promise<PluginConfigSnapshot> =>
    this.pluginGovernanceWriteService.updatePluginConfig(name, values);

  readonly getPluginScope = (name: string): Promise<PluginScopeSettings> =>
    this.pluginReadService.getPluginScope(name);

  readonly updatePluginScope = (
    name: string,
    scope: PluginScopeSettings,
  ): Promise<PluginScopeSettings> =>
    this.pluginGovernanceWriteService.updatePluginScope(name, scope);

  readonly getPluginHealth = (name: string): Promise<PluginHealthSnapshot> =>
    this.pluginReadService.getPluginHealth(name);

  readonly listPluginEvents = (
    name: string,
    options: ListPluginEventOptions = {},
  ): Promise<PluginEventListResult> =>
    this.pluginReadService.listPluginEvents(name, options);

  readonly recordPluginEvent = (
    name: string,
    input: PluginEventInput & { level: PluginEventLevel },
  ): Promise<void> => this.pluginEventWriteService.recordPluginEvent(name, input);

  readonly recordPluginSuccess = (
    name: string,
    input: PluginEventInput & {
      checked?: boolean;
      persistEvent?: boolean;
    },
  ): Promise<void> => this.pluginEventWriteService.recordPluginSuccess(name, input);

  readonly recordPluginFailure = (
    name: string,
    input: PluginEventInput & {
      checked?: boolean;
    },
  ): Promise<void> => this.pluginEventWriteService.recordPluginFailure(name, input);

  readonly recordHealthCheck = (
    name: string,
    input: {
      ok: boolean;
      message: string;
      metadata?: JsonObject;
    },
  ): Promise<void> => this.pluginEventWriteService.recordHealthCheck(name, input);
}
