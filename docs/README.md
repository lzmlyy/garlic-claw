# 文档索引

这组 `docs/` 文档主要面向开发者和维护者，不承担 agent 协作约束，也不替代项目根目录 `README.md` 的使用者入口。

## 按受众分组

### 插件开发者

- [`插件开发指南.md`](./插件开发指南.md)
  - 远程插件接入
  - manifest / hook / route / host API
  - 插件治理接口

### 后端开发者

- [`后端模型调用接口说明.md`](./后端模型调用接口说明.md)
  - AI provider 配置
  - 聊天入口
  - vision fallback
  - host model routing
  - 后端内部如何复用模型调用链

### 内核维护者

- [`扩展内核契约说明.md`](./扩展内核契约说明.md)
  - extension kernel contract
  - runtime 原语
  - plugin / MCP / skill 的统一边界

- [`扩展内核维护说明.md`](./扩展内核维护说明.md)
  - 当前 owner 边界
  - 维护规则
  - 重构后的最低验证要求

## 分层约束

- `README.md` 面向使用者和本地操作者
- `docs/` 面向开发者和维护者
- `AGENTS.md` 面向 Codex / agent / 协作流程

如果某条内容的第一受众变了，应该把它移回正确的文档，而不是在多个地方继续复制扩散。
