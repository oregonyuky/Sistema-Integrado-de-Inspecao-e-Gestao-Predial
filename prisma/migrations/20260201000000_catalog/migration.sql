-- MOD-02: Catálogo técnico e sistemas prediais (RF-011 a RF-022). Gerado a partir de prisma/schema.prisma.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "catalog_item_kind" AS ENUM ('SYSTEM', 'SUBSYSTEM', 'TYPE');

-- CreateEnum
CREATE TYPE "criterion_response" AS ENUM ('PASS_FAIL', 'YES_NO', 'NUMBER', 'TEXT', 'SINGLE_CHOICE');

-- CreateEnum
CREATE TYPE "classification_kind" AS ENUM ('SEVERITY', 'ORIGIN', 'RISK', 'URGENCY', 'OTHER');

-- CreateTable
CREATE TABLE "catalog_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "parent_id" UUID,
    "kind" "catalog_item_kind" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "components" (
    "id" UUID NOT NULL,
    "seq" SERIAL NOT NULL,
    "public_code" TEXT NOT NULL DEFAULT '',
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "type_id" UUID NOT NULL,
    "location_id" UUID,
    "name" TEXT NOT NULL,
    "tag" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "serial_number" TEXT,
    "installed_on" DATE,
    "description" TEXT,
    "notes" TEXT,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "deactivated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_systems" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "system_id" UUID NOT NULL,
    "notes" TEXT,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "norms" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issuer" TEXT,
    "description" TEXT,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "norms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "norm_editions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "norm_id" UUID NOT NULL,
    "edition" TEXT NOT NULL,
    "published_on" DATE,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "norm_editions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "norm_sections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "edition_id" UUID NOT NULL,
    "ref" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "norm_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_item_norm_sections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "catalog_item_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_item_norm_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_criteria" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "response_type" "criterion_response" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "unit" TEXT,
    "min_value" DECIMAL(14,4),
    "max_value" DECIMAL(14,4),
    "options" TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inspection_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manifestations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "typical_causes" TEXT,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "manifestations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_classifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "classification_kind" NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "technical_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manifestation_classifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "manifestation_id" UUID NOT NULL,
    "classification_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manifestation_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catalog_items_organization_id_kind_idx" ON "catalog_items"("organization_id", "kind");

-- CreateIndex
CREATE INDEX "catalog_items_parent_id_idx" ON "catalog_items"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_items_organization_id_code_key" ON "catalog_items"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "components_seq_key" ON "components"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "components_public_code_key" ON "components"("public_code");

-- CreateIndex
CREATE INDEX "components_organization_id_project_id_status_idx" ON "components"("organization_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "components_type_id_idx" ON "components"("type_id");

-- CreateIndex
CREATE INDEX "components_location_id_idx" ON "components"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "components_project_id_tag_key" ON "components"("project_id", "tag");

-- CreateIndex
CREATE INDEX "project_systems_organization_id_project_id_idx" ON "project_systems"("organization_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_systems_project_id_system_id_key" ON "project_systems"("project_id", "system_id");

-- CreateIndex
CREATE UNIQUE INDEX "norms_organization_id_code_key" ON "norms"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "norm_editions_norm_id_edition_key" ON "norm_editions"("norm_id", "edition");

-- CreateIndex
CREATE UNIQUE INDEX "norm_sections_edition_id_ref_key" ON "norm_sections"("edition_id", "ref");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_item_norm_sections_catalog_item_id_section_id_key" ON "catalog_item_norm_sections"("catalog_item_id", "section_id");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_criteria_type_id_code_key" ON "inspection_criteria"("type_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "manifestations_organization_id_code_key" ON "manifestations"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "technical_classifications_organization_id_code_key" ON "technical_classifications"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "manifestation_classifications_manifestation_id_classificati_key" ON "manifestation_classifications"("manifestation_id", "classification_id");

-- AddForeignKey
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "components" ADD CONSTRAINT "components_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "components" ADD CONSTRAINT "components_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "components" ADD CONSTRAINT "components_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "components" ADD CONSTRAINT "components_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_systems" ADD CONSTRAINT "project_systems_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_systems" ADD CONSTRAINT "project_systems_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_systems" ADD CONSTRAINT "project_systems_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "norms" ADD CONSTRAINT "norms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "norm_editions" ADD CONSTRAINT "norm_editions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "norm_editions" ADD CONSTRAINT "norm_editions_norm_id_fkey" FOREIGN KEY ("norm_id") REFERENCES "norms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "norm_sections" ADD CONSTRAINT "norm_sections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "norm_sections" ADD CONSTRAINT "norm_sections_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "norm_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_item_norm_sections" ADD CONSTRAINT "catalog_item_norm_sections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_item_norm_sections" ADD CONSTRAINT "catalog_item_norm_sections_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_item_norm_sections" ADD CONSTRAINT "catalog_item_norm_sections_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "norm_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_criteria" ADD CONSTRAINT "inspection_criteria_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_criteria" ADD CONSTRAINT "inspection_criteria_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifestations" ADD CONSTRAINT "manifestations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_classifications" ADD CONSTRAINT "technical_classifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifestation_classifications" ADD CONSTRAINT "manifestation_classifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifestation_classifications" ADD CONSTRAINT "manifestation_classifications_manifestation_id_fkey" FOREIGN KEY ("manifestation_id") REFERENCES "manifestations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifestation_classifications" ADD CONSTRAINT "manifestation_classifications_classification_id_fkey" FOREIGN KEY ("classification_id") REFERENCES "technical_classifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
