# 浏览器 Smoke

该目录放前端浏览器级 smoke。

- 覆盖登录、聊天、AI provider、plugins、mcp、automations 主链路
- 脚本结束前必须清理自己创建的 provider / automation / conversation 等测试副作用
- 若脚本自己拉起开发服务，结束后只停止自己拉起的受管环境
