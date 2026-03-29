/**
 * 默认知识库条目 ID。
 */
export const DEFAULT_KB_ENTRY_IDS = {
  PLUGIN_RUNTIME: 'builtin.plugin-runtime',
  PLUGIN_PROTOCOL: 'builtin.plugin-protocol',
} as const;

/**
 * 宿主默认知识库条目。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 宿主启动后保证存在的系统知识条目
 *
 * 预期行为:
 * - 为 `kb.*` 宿主面提供最小可用的系统知识
 * - 让内建 `kb-context` 插件在没有人工导入知识时也能工作
 */
export const DEFAULT_KB_ENTRIES = [
  {
    id: DEFAULT_KB_ENTRY_IDS.PLUGIN_RUNTIME,
    title: '统一插件运行时',
    content:
      'Garlic Claw 使用统一插件运行时。内建插件 builtin 与远程插件 remote 共享同一套 manifest、permissions、hooks、routes、host api 和 runtime 语义，只是 transport 不同。',
    tags: 'plugin,runtime,builtin,remote',
  },
  {
    id: DEFAULT_KB_ENTRY_IDS.PLUGIN_PROTOCOL,
    title: '统一插件协议',
    content:
      '插件通过 manifest 声明 tools、hooks、routes、config 和 permissions。宿主通过 host api 提供 conversation、memory、persona、provider、kb、storage、cron 等受控能力，而不是直接注入宿主对象。',
    tags: 'plugin,manifest,host-api,permissions,hooks,routes',
  },
] as const;
