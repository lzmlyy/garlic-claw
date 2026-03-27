/**
 * AI SDK 轻量类型存根入口。
 *
 * 输入:
 * - `ai` 与多个 `@ai-sdk/*` 包的类型导入
 *
 * 输出:
 * - 拆分后的轻量类型与工厂存根聚合导出
 *
 * 预期行为:
 * - 保持路径别名不变
 * - 让单文件体积降下来
 * - 继续隔离外部 SDK 的重泛型
 */

export * from './ai-sdk-stub-core';
export * from './ai-sdk-stub-providers';
export * from './ai-sdk-stub-runtime';
