-- 为统一插件 KB 宿主面新增知识库条目持久化。
CREATE TABLE "knowledge_base_entries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "tags" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);
