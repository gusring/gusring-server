-- CreateEnum
CREATE TYPE "lang" AS ENUM ('ko', 'en', 'zh', 'ja', 'vi');

-- CreateEnum
CREATE TYPE "feedback_type" AS ENUM ('general', 'translation', 'guide', 'bug');

-- CreateEnum
CREATE TYPE "feedback_status" AS ENUM ('new', 'read', 'resolved');

-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('landing_view', 'list_view', 'form_view', 'form_download', 'language_select', 'search', 'category_filter', 'feedback_click', 'detail_time', 'fill_start', 'field_open', 'fill_preview', 'fill_png_save', 'fill_print', 'fill_reset');

-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "lang" "lang" NOT NULL,
    "form_key" TEXT,
    "form_no" SMALLINT,
    "field_id" TEXT,
    "type" "feedback_type" NOT NULL DEFAULT 'general',
    "message" TEXT NOT NULL,
    "status" "feedback_status" NOT NULL DEFAULT 'new',
    "ip_hash" CHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_event" (
    "id" BIGSERIAL NOT NULL,
    "type" "event_type" NOT NULL,
    "lang" "lang",
    "form_key" TEXT,
    "form_no" SMALLINT,
    "field_id" TEXT,
    "category" TEXT,
    "search_term" TEXT,
    "result_count" INTEGER,
    "duration_sec" INTEGER,
    "visitor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_status_created_at_idx" ON "feedback"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "feedback_form_key_idx" ON "feedback"("form_key");

-- CreateIndex
CREATE INDEX "feedback_ip_hash_created_at_idx" ON "feedback"("ip_hash", "created_at");

-- CreateIndex
CREATE INDEX "usage_event_type_created_at_idx" ON "usage_event"("type", "created_at");

-- CreateIndex
CREATE INDEX "usage_event_form_key_type_idx" ON "usage_event"("form_key", "type");

-- CreateIndex
CREATE INDEX "usage_event_created_at_idx" ON "usage_event"("created_at");
