ALTER TABLE "plugins" ADD COLUMN "display_name" TEXT;
ALTER TABLE "plugins" ADD COLUMN "description" TEXT;
ALTER TABLE "plugins" ADD COLUMN "health_status" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "plugins" ADD COLUMN "failure_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "plugins" ADD COLUMN "consecutive_failures" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "plugins" ADD COLUMN "last_error" TEXT;
ALTER TABLE "plugins" ADD COLUMN "last_error_at" DATETIME;
ALTER TABLE "plugins" ADD COLUMN "last_success_at" DATETIME;
ALTER TABLE "plugins" ADD COLUMN "last_checked_at" DATETIME;

UPDATE "plugins"
SET
  "display_name" = COALESCE("display_name", "name"),
  "health_status" = CASE
    WHEN "status" = 'online' THEN 'healthy'
    WHEN "status" = 'offline' THEN 'offline'
    ELSE 'error'
  END
WHERE "health_status" = 'unknown';

CREATE TABLE "plugin_storage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "plugin_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value_json" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plugin_storage_plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "plugins" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "plugin_storage_plugin_id_key_key"
ON "plugin_storage" ("plugin_id", "key");

CREATE TABLE "plugin_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "plugin_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata_json" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plugin_events_plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "plugins" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "plugin_events_plugin_id_created_at_idx"
ON "plugin_events" ("plugin_id", "created_at");
