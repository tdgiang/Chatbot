-- Phase 3: Hybrid search + maxTokens default update

-- Enable pg_trgm for trigram similarity (hybrid search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index on chunks.content for fast trigram search
CREATE INDEX IF NOT EXISTS "chunks_content_trgm_idx"
  ON "chunks" USING GIN (content gin_trgm_ops);

-- Update knowledge_bases.maxTokens default: 512 → 1024
ALTER TABLE "knowledge_bases"
  ALTER COLUMN "maxTokens" SET DEFAULT 1024;

-- Migrate existing KBs still at 512 → 1024
UPDATE "knowledge_bases"
  SET "maxTokens" = 1024
  WHERE "maxTokens" = 512;
