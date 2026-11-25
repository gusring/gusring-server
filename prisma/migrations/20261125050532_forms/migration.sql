-- CreateTable
CREATE TABLE "form" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "form_no" SMALLINT NOT NULL,
    "draft" JSONB NOT NULL,
    "draft_updated_at" TIMESTAMPTZ(3) NOT NULL,
    "draft_updated_by" TEXT NOT NULL,
    "published_version" INTEGER,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_version" (
    "form_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "published_by" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_version_pkey" PRIMARY KEY ("form_id","version")
);

-- CreateTable
CREATE TABLE "form_image" (
    "id" CHAR(64) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_image_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "form_key_key" ON "form"("key");

-- CreateIndex
CREATE UNIQUE INDEX "form_form_no_key" ON "form"("form_no");

-- AddForeignKey
ALTER TABLE "form_version" ADD CONSTRAINT "form_version_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "form"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
