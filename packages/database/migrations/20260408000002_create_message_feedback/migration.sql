-- CreateTable: message_feedback
CREATE TABLE "message_feedback" (
    "id"        TEXT        NOT NULL,
    "messageId" TEXT        NOT NULL,
    "sessionId" TEXT        NOT NULL,
    "rating"    INTEGER     NOT NULL,
    "note"      TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_feedback_pkey"      PRIMARY KEY ("id"),
    CONSTRAINT "message_feedback_msg_unique" UNIQUE ("messageId"),
    CONSTRAINT "message_feedback_rating_chk" CHECK ("rating" IN (1, -1))
);

-- AddForeignKey
ALTER TABLE "message_feedback"
    ADD CONSTRAINT "message_feedback_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_feedback"
    ADD CONSTRAINT "message_feedback_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
