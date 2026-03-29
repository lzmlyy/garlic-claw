-- 为统一插件 persona 宿主面新增 persona 持久化与会话激活态。
CREATE TABLE "personas" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "description" TEXT,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "personas_name_key"
ON "personas"("name");

PRAGMA foreign_keys=OFF;

CREATE TABLE "new_conversations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL DEFAULT 'New Chat',
  "user_id" TEXT NOT NULL,
  "active_persona_id" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "conversations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT "conversations_active_persona_id_fkey"
    FOREIGN KEY ("active_persona_id") REFERENCES "personas" ("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

INSERT INTO "new_conversations" (
  "id",
  "title",
  "user_id",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "title",
  "user_id",
  "created_at",
  "updated_at"
FROM "conversations";

DROP TABLE "conversations";
ALTER TABLE "new_conversations" RENAME TO "conversations";

PRAGMA foreign_keys=ON;
