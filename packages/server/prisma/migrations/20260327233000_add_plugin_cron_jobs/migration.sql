-- 为统一插件 cron 调度新增持久化表。
CREATE TABLE "plugin_cron_jobs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "plugin_name" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "cron" TEXT NOT NULL,
  "description" TEXT,
  "source" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "data_json" TEXT,
  "last_run_at" DATETIME,
  "last_error" TEXT,
  "last_error_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "plugin_cron_jobs_plugin_name_fkey"
    FOREIGN KEY ("plugin_name") REFERENCES "plugins" ("name")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "plugin_cron_jobs_plugin_name_name_source_key"
ON "plugin_cron_jobs"("plugin_name", "name", "source");
