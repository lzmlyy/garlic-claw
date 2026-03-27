-- AlterTable
ALTER TABLE "messages" ADD COLUMN "parts_json" TEXT;

-- CreateTable
CREATE TABLE "conversation_image_transcriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversation_id" TEXT NOT NULL,
    "image_hash" TEXT NOT NULL,
    "mime_type" TEXT,
    "transcription" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "conversation_image_transcriptions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "conversation_image_transcriptions_conversation_id_image_hash_key"
ON "conversation_image_transcriptions"("conversation_id", "image_hash");
