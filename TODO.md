# Garlic Claw TODO

> 本文件只保留当前仍有效的项目级真相。
> 更细的会话记录与排查过程留在 `task_plan.md / progress.md / findings.md`。

## 当前阶段：N8 [已完成]

### 最新状态（2026-04-16）

- `packages/server/src = 9973`
- `packages/shared = 2306`
- `packages/plugin-sdk = 2481`

### 最新 fresh 验证

- `packages/shared`
  - `npm run typecheck`
  - `npm run build`
- `packages/plugin-sdk`
  - `npm run typecheck`
  - `npm run build`
  - `npm test`
- `packages/server`
  - `npx tsc --noEmit`
  - `npm run build`
  - `npm test -- --runInBand`
  - `npm run smoke:http`
  - 临时 sqlite 实例下的真实 HTTP 联调
- `packages/web`
  - `npm run typecheck`
  - `npm run build`
  - `npm run test:run`
- root
  - `npm run lint`
  - root `lint` warning 清零
- WSL / Ubuntu
  - `node tools/refactor/cli.js refactor-metrics`
  - `node --test tools/refactor/refactor-cli.test.js`
  - `python3 -m unittest tools.scripts.test_runtime_scripts`

### 当前简短总结

- [x] `packages/server` cutover 后维持在 `<= 10000`
- [x] `packages/shared` 继续保持 type-only
- [x] `server / plugin-sdk / web` 的共享契约已重新对齐
- [x] 前后端构建、类型检查、测试与后端 smoke 当前都通过
- [x] 前后端运行时接口已做真实 HTTP 联调，raw JSON / 鉴权路径当前一致
- [x] `tools/refactor` 与 `tools/scripts` 已在 Windows + WSL 下通过验证
- [x] 本轮顺手清掉 root lint warning，并把 `skill-session` 的 package tool owner 从 session service 中拆出

### 固定约束

- 对外行为保持不变：
  - HTTP API 路径、DTO 语义、返回语义
  - 插件 WebSocket 协议语义
  - plugin / MCP / skill 作者侧格式兼容
- 不接受新增 `helper / helpers / facade / compatibility` 壳
- `packages/shared` 只允许前后端共享 type；不放运行时逻辑
- 不接受把复杂度平移到 `shared / plugin-sdk / web / tools`
- 继续删旧路径时，要同步删 gate / boundary map 死路径
