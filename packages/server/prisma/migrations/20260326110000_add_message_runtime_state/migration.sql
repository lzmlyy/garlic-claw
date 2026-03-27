PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT,
    "parts_json" TEXT,
    "tool_calls" TEXT,
    "tool_results" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_messages" (
    "id",
    "conversation_id",
    "role",
    "content",
    "parts_json",
    "tool_calls",
    "tool_results",
    "provider",
    "model",
    "status",
    "error",
    "created_at",
    "updated_at"
)
SELECT
    "id",
    "conversation_id",
    "role",
    "content",
    "parts_json",
    "tool_calls",
    "tool_results",
    NULL,
    "model",
    'completed',
    NULL,
    "created_at",
    "created_at"
FROM "messages";

DROP TABLE "messages";
ALTER TABLE "new_messages" RENAME TO "messages";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
