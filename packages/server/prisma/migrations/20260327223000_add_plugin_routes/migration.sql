-- 为插件清单持久化新增 routes 字段，保存声明的 Web Route 描述。
ALTER TABLE "plugins" ADD COLUMN "routes" TEXT;
