-- CreateTable: faq_overrides
CREATE TABLE "faq_overrides" (
    "id"              TEXT        NOT NULL,
    "knowledgeBaseId" TEXT        NOT NULL,
    "question"        TEXT        NOT NULL,
    "answer"          TEXT        NOT NULL,
    "questionEmbed"   BYTEA,
    "isActive"        BOOLEAN     NOT NULL DEFAULT true,
    "priority"        INTEGER     NOT NULL DEFAULT 0,
    "matchCount"      INTEGER     NOT NULL DEFAULT 0,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faq_overrides_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "faq_overrides"
    ADD CONSTRAINT "faq_overrides_knowledgeBaseId_fkey"
    FOREIGN KEY ("knowledgeBaseId")
    REFERENCES "knowledge_bases"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
