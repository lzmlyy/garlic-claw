PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_plugins" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "display_name" TEXT,
    "device_type" TEXT NOT NULL DEFAULT 'pc',
    "runtime_kind" TEXT NOT NULL DEFAULT 'remote',
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "manifest_json" TEXT,
    "version" TEXT,
    "config" TEXT,
    "default_enabled" BOOLEAN NOT NULL DEFAULT true,
    "conversation_scopes" TEXT,
    "health_status" TEXT NOT NULL DEFAULT 'unknown',
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "last_error_at" DATETIME,
    "last_success_at" DATETIME,
    "last_checked_at" DATETIME,
    "last_seen_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

INSERT INTO "new_plugins" (
    "id",
    "name",
    "display_name",
    "device_type",
    "runtime_kind",
    "description",
    "status",
    "manifest_json",
    "version",
    "config",
    "default_enabled",
    "conversation_scopes",
    "health_status",
    "failure_count",
    "consecutive_failures",
    "last_error",
    "last_error_at",
    "last_success_at",
    "last_checked_at",
    "last_seen_at",
    "created_at",
    "updated_at"
)
SELECT
    "id",
    "name",
    "display_name",
    "device_type",
    "runtime_kind",
    "description",
    "status",
    json_patch(
        json_patch(
            json_object(
                'id', "name",
                'name', COALESCE(NULLIF("display_name", ''), "name"),
                'version', COALESCE(NULLIF("version", ''), '0.0.0'),
                'runtime', CASE
                    WHEN "runtime_kind" = 'builtin' THEN 'builtin'
                    ELSE 'remote'
                END,
                'permissions', CASE
                    WHEN json_valid("permissions") THEN json("permissions")
                    ELSE json('[]')
                END,
                'tools', CASE
                    WHEN json_valid("capabilities") THEN json("capabilities")
                    ELSE json('[]')
                END,
                'hooks', CASE
                    WHEN json_valid("hooks") THEN json("hooks")
                    ELSE json('[]')
                END,
                'routes', CASE
                    WHEN json_valid("routes") THEN json("routes")
                    ELSE json('[]')
                END
            ),
            CASE
                WHEN "description" IS NOT NULL AND trim("description") <> ''
                    THEN json_object('description', "description")
                ELSE json('{}')
            END
        ),
        CASE
            WHEN json_valid("config_schema")
                THEN json_object('config', json("config_schema"))
            ELSE json('{}')
        END
    ),
    "version",
    "config",
    "default_enabled",
    "conversation_scopes",
    "health_status",
    "failure_count",
    "consecutive_failures",
    "last_error",
    "last_error_at",
    "last_success_at",
    "last_checked_at",
    "last_seen_at",
    "created_at",
    "updated_at"
FROM "plugins";

DROP TABLE "plugins";
ALTER TABLE "new_plugins" RENAME TO "plugins";
CREATE UNIQUE INDEX "plugins_name_key" ON "plugins"("name");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
