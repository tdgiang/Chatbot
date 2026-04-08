-- AlterTable: chunks — add chunk control columns
ALTER TABLE "chunks"
  ADD COLUMN IF NOT EXISTS "isEnabled"     BOOLEAN      NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "sourceSection" TEXT,
  ADD COLUMN IF NOT EXISTS "chunkType"     TEXT         NOT NULL DEFAULT 'raw',
  ADD COLUMN IF NOT EXISTS "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
