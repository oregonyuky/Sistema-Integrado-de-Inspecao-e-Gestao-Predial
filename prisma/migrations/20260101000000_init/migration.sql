-- CreateEnum
CREATE TYPE "record_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "person_type" AS ENUM ('INDIVIDUAL', 'LEGAL_ENTITY');

-- CreateEnum
CREATE TYPE "project_type" AS ENUM ('RESIDENTIAL_HORIZONTAL', 'RESIDENTIAL_VERTICAL', 'COMMERCIAL', 'MIXED_USE', 'INDUSTRIAL', 'HOSPITAL', 'EDUCATIONAL', 'PUBLIC', 'STANDALONE', 'OTHER');

-- CreateEnum
CREATE TYPE "use_type" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'MIXED', 'INDUSTRIAL', 'INSTITUTIONAL', 'HEALTHCARE', 'EDUCATIONAL', 'PUBLIC', 'OTHER');

-- CreateEnum
CREATE TYPE "building_type" AS ENUM ('BLOCK', 'TOWER', 'STANDALONE', 'AUXILIARY', 'PARKING', 'OTHER');

-- CreateEnum
CREATE TYPE "location_type" AS ENUM ('FLOOR', 'ROOM', 'CIRCULATION', 'TECHNICAL_AREA', 'EXTERNAL_AREA', 'UNIT', 'OTHER');

-- CreateEnum
CREATE TYPE "floor_kind" AS ENUM ('BASEMENT', 'GROUND', 'MEZZANINE', 'STANDARD', 'PENTHOUSE', 'ROOF', 'TECHNICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "area_class" AS ENUM ('COMMON', 'PRIVATE', 'UNDEFINED');

-- CreateEnum
CREATE TYPE "unit_type" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'INSTITUTIONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "responsible_role" AS ENUM ('SYNDIC', 'SUB_SYNDIC', 'ADMINISTRATOR', 'FACILITY_MANAGER', 'CARETAKER', 'MAINTENANCE_MANAGER', 'TECHNICAL_MANAGER', 'ADMIN_CONTACT', 'OTHER');

-- CreateEnum
CREATE TYPE "history_category" AS ENUM ('CONSTRUCTION', 'EXPANSION', 'RENOVATION', 'USE_CHANGE', 'RELEVANT_INTERVENTION', 'INCIDENT', 'RELEVANT_OCCURRENCE', 'REGISTRY_UPDATE', 'OTHER');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'VIEWER',
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "person_type" "person_type" NOT NULL,
    "name" TEXT NOT NULL,
    "trade_name" TEXT,
    "document" VARCHAR(14),
    "email" TEXT,
    "phone" TEXT,
    "address_line" TEXT,
    "address_number" TEXT,
    "complement" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" VARCHAR(2),
    "zip_code" VARCHAR(8),
    "contact_name" TEXT,
    "notes" TEXT,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "project_type" "project_type" NOT NULL,
    "address_line" TEXT NOT NULL,
    "address_number" TEXT,
    "complement" TEXT,
    "district" TEXT,
    "city" TEXT NOT NULL,
    "state" VARCHAR(2) NOT NULL,
    "zip_code" VARCHAR(8),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "description" TEXT,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_characteristics" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "land_area_m2" DECIMAL(14,2),
    "built_area_m2" DECIMAL(14,2),
    "construction_year" INTEGER,
    "estimated_age_years" INTEGER,
    "use_type" "use_type",
    "occupancy_type" TEXT,
    "construction_typology" TEXT,
    "predominant_system" TEXT,
    "structure_info" TEXT,
    "expansions_info" TEXT,
    "renovations_info" TEXT,
    "technical_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_characteristics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "building_type" "building_type" NOT NULL DEFAULT 'BLOCK',
    "description" TEXT,
    "built_area_m2" DECIMAL(14,2),
    "construction_year" INTEGER,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "building_id" UUID,
    "parent_location_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location_type" "location_type" NOT NULL,
    "area_class" "area_class" NOT NULL DEFAULT 'UNDEFINED',
    "floor_kind" "floor_kind",
    "floor_order" INTEGER,
    "elevation_m" DECIMAL(8,2),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "area_m2" DECIMAL(14,2),
    "description" TEXT,
    "code_scope_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "private_units" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "unit_type" "unit_type" NOT NULL,
    "private_area_m2" DECIMAL(14,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "private_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_responsibles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "professional_registration" TEXT,
    "notes" TEXT,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_responsibles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_responsible_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "responsible_id" UUID NOT NULL,
    "role" "responsible_role" NOT NULL,
    "role_detail" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_responsible_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_history" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "category" "history_category" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "occurred_on" DATE NOT NULL,
    "recorded_by_user_id" UUID,
    "notes" TEXT,
    "source_type" TEXT,
    "source_id" UUID,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_history_attachments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "history_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "uploaded_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_history_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");

-- CreateIndex
CREATE INDEX "clients_organization_id_status_idx" ON "clients"("organization_id", "status");

-- CreateIndex
CREATE INDEX "clients_organization_id_name_idx" ON "clients"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "clients_organization_id_document_key" ON "clients"("organization_id", "document");

-- CreateIndex
CREATE INDEX "projects_organization_id_client_id_idx" ON "projects"("organization_id", "client_id");

-- CreateIndex
CREATE INDEX "projects_organization_id_status_idx" ON "projects"("organization_id", "status");

-- CreateIndex
CREATE INDEX "projects_organization_id_name_idx" ON "projects"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organization_id_code_key" ON "projects"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "project_characteristics_project_id_key" ON "project_characteristics"("project_id");

-- CreateIndex
CREATE INDEX "project_characteristics_organization_id_idx" ON "project_characteristics"("organization_id");

-- CreateIndex
CREATE INDEX "buildings_organization_id_project_id_idx" ON "buildings"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "buildings_project_id_status_idx" ON "buildings"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_project_id_code_key" ON "buildings"("project_id", "code");

-- CreateIndex
CREATE INDEX "locations_organization_id_project_id_idx" ON "locations"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "locations_project_id_building_id_idx" ON "locations"("project_id", "building_id");

-- CreateIndex
CREATE INDEX "locations_parent_location_id_idx" ON "locations"("parent_location_id");

-- CreateIndex
CREATE INDEX "locations_project_id_location_type_idx" ON "locations"("project_id", "location_type");

-- CreateIndex
CREATE INDEX "locations_project_id_status_idx" ON "locations"("project_id", "status");

-- CreateIndex
CREATE INDEX "locations_project_id_name_idx" ON "locations"("project_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "locations_project_id_code_scope_id_code_key" ON "locations"("project_id", "code_scope_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "private_units_location_id_key" ON "private_units"("location_id");

-- CreateIndex
CREATE INDEX "private_units_organization_id_project_id_idx" ON "private_units"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "private_units_project_id_unit_type_idx" ON "private_units"("project_id", "unit_type");

-- CreateIndex
CREATE INDEX "project_responsibles_organization_id_name_idx" ON "project_responsibles"("organization_id", "name");

-- CreateIndex
CREATE INDEX "project_responsibles_organization_id_status_idx" ON "project_responsibles"("organization_id", "status");

-- CreateIndex
CREATE INDEX "project_responsible_assignments_organization_id_project_id_idx" ON "project_responsible_assignments"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "project_responsible_assignments_responsible_id_idx" ON "project_responsible_assignments"("responsible_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_responsible_assignments_project_id_responsible_id_r_key" ON "project_responsible_assignments"("project_id", "responsible_id", "role", "start_date");

-- CreateIndex
CREATE INDEX "project_history_project_id_occurred_on_idx" ON "project_history"("project_id", "occurred_on");

-- CreateIndex
CREATE INDEX "project_history_project_id_category_idx" ON "project_history"("project_id", "category");

-- CreateIndex
CREATE INDEX "project_history_organization_id_idx" ON "project_history"("organization_id");

-- CreateIndex
CREATE INDEX "project_history_source_type_source_id_idx" ON "project_history"("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_history_attachments_storage_key_key" ON "project_history_attachments"("storage_key");

-- CreateIndex
CREATE INDEX "project_history_attachments_history_id_idx" ON "project_history_attachments"("history_id");

-- CreateIndex
CREATE INDEX "project_history_attachments_organization_id_idx" ON "project_history_attachments"("organization_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_entity_type_entity_id_idx" ON "audit_logs"("organization_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_characteristics" ADD CONSTRAINT "project_characteristics_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_characteristics" ADD CONSTRAINT "project_characteristics_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_location_id_fkey" FOREIGN KEY ("parent_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_units" ADD CONSTRAINT "private_units_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_units" ADD CONSTRAINT "private_units_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_units" ADD CONSTRAINT "private_units_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_responsibles" ADD CONSTRAINT "project_responsibles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_responsible_assignments" ADD CONSTRAINT "project_responsible_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_responsible_assignments" ADD CONSTRAINT "project_responsible_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_responsible_assignments" ADD CONSTRAINT "project_responsible_assignments_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "project_responsibles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_history" ADD CONSTRAINT "project_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_history" ADD CONSTRAINT "project_history_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_history_attachments" ADD CONSTRAINT "project_history_attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_history_attachments" ADD CONSTRAINT "project_history_attachments_history_id_fkey" FOREIGN KEY ("history_id") REFERENCES "project_history"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

