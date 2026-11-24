-- RF01 – Regras de integridade que o Prisma não expressa no schema.
-- Estas regras são a última linha de defesa: o backend também valida, mas o banco
-- impede vínculos entre organizações/empreendimentos distintos mesmo se um bug
-- ou um acesso direto tentar criá-los.

-- ═════════════════════════ CHECK constraints ═════════════════════════

ALTER TABLE "clients"
  ADD CONSTRAINT "clients_name_not_blank" CHECK (length(btrim("name")) > 0),
  -- CPF: 11 dígitos. CNPJ: 12 caracteres alfanuméricos + 2 dígitos verificadores
  -- (formato alfanumérico vigente desde jul/2026; CNPJs numéricos continuam válidos).
  ADD CONSTRAINT "clients_document_format" CHECK (
    "document" IS NULL OR
    ("person_type" = 'INDIVIDUAL'   AND "document" ~ '^[0-9]{11}$') OR
    ("person_type" = 'LEGAL_ENTITY' AND "document" ~ '^[0-9A-Z]{12}[0-9]{2}$')
  ),
  ADD CONSTRAINT "clients_zip_format"   CHECK ("zip_code" IS NULL OR "zip_code" ~ '^[0-9]{8}$'),
  ADD CONSTRAINT "clients_state_format" CHECK ("state" IS NULL OR "state" ~ '^[A-Z]{2}$');

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_code_format"  CHECK ("code" ~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'),
  ADD CONSTRAINT "projects_name_not_blank" CHECK (length(btrim("name")) > 0),
  ADD CONSTRAINT "projects_zip_format"   CHECK ("zip_code" IS NULL OR "zip_code" ~ '^[0-9]{8}$'),
  ADD CONSTRAINT "projects_state_format" CHECK ("state" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "projects_lat_range"    CHECK ("latitude"  IS NULL OR "latitude"  BETWEEN -90  AND 90),
  ADD CONSTRAINT "projects_lng_range"    CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "projects_coords_pair"  CHECK (("latitude" IS NULL) = ("longitude" IS NULL));

ALTER TABLE "project_characteristics"
  ADD CONSTRAINT "characteristics_land_area_nonneg"  CHECK ("land_area_m2"  IS NULL OR "land_area_m2"  >= 0),
  ADD CONSTRAINT "characteristics_built_area_nonneg" CHECK ("built_area_m2" IS NULL OR "built_area_m2" >= 0),
  ADD CONSTRAINT "characteristics_year_range"        CHECK ("construction_year" IS NULL OR "construction_year" BETWEEN 1500 AND 2100),
  ADD CONSTRAINT "characteristics_age_range"         CHECK ("estimated_age_years" IS NULL OR "estimated_age_years" BETWEEN 0 AND 1000);

ALTER TABLE "buildings"
  ADD CONSTRAINT "buildings_code_format"   CHECK ("code" ~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'),
  ADD CONSTRAINT "buildings_name_not_blank" CHECK (length(btrim("name")) > 0),
  ADD CONSTRAINT "buildings_area_nonneg"   CHECK ("built_area_m2" IS NULL OR "built_area_m2" >= 0),
  ADD CONSTRAINT "buildings_year_range"    CHECK ("construction_year" IS NULL OR "construction_year" BETWEEN 1500 AND 2100);

ALTER TABLE "locations"
  ADD CONSTRAINT "locations_code_format"    CHECK ("code" ~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'),
  ADD CONSTRAINT "locations_name_not_blank" CHECK (length(btrim("name")) > 0),
  ADD CONSTRAINT "locations_area_nonneg"    CHECK ("area_m2" IS NULL OR "area_m2" >= 0),
  ADD CONSTRAINT "locations_no_self_parent" CHECK ("parent_location_id" IS NULL OR "parent_location_id" <> "id"),
  -- Pavimento pertence a uma edificação e é sempre o primeiro nível dela.
  ADD CONSTRAINT "locations_floor_shape"    CHECK (
    "location_type" <> 'FLOOR' OR ("building_id" IS NOT NULL AND "parent_location_id" IS NULL)
  );

ALTER TABLE "private_units"
  ADD CONSTRAINT "private_units_area_nonneg" CHECK ("private_area_m2" IS NULL OR "private_area_m2" >= 0);

ALTER TABLE "project_responsible_assignments"
  ADD CONSTRAINT "assignments_period_valid" CHECK ("end_date" IS NULL OR "end_date" >= "start_date");

ALTER TABLE "project_history"
  ADD CONSTRAINT "history_title_not_blank" CHECK (length(btrim("title")) > 0);

ALTER TABLE "project_history_attachments"
  ADD CONSTRAINT "attachments_size_positive" CHECK ("size_bytes" > 0);

-- ═════════════════════ Triggers de integridade ═════════════════════

-- organization_id nunca muda depois de criado
CREATE OR REPLACE FUNCTION siigp_org_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW."organization_id" <> OLD."organization_id" THEN
    RAISE EXCEPTION 'integrity: a organização de um registro não pode ser alterada' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- project_id nunca muda depois de criado (não se move registro entre empreendimentos)
CREATE OR REPLACE FUNCTION siigp_project_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW."project_id" <> OLD."project_id" THEN
    RAISE EXCEPTION 'integrity: o empreendimento de um registro não pode ser alterado' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- project_id deve pertencer à mesma organização do registro
CREATE OR REPLACE FUNCTION siigp_project_same_org() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "projects" p WHERE p."id" = NEW."project_id" AND p."organization_id" = NEW."organization_id"
  ) THEN
    RAISE EXCEPTION 'integrity: empreendimento inexistente ou de outra organização' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- projects.client_id deve ser da mesma organização
CREATE OR REPLACE FUNCTION siigp_project_client_same_org() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "clients" c WHERE c."id" = NEW."client_id" AND c."organization_id" = NEW."organization_id"
  ) THEN
    RAISE EXCEPTION 'integrity: cliente inexistente ou de outra organização' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- locations: bloco e pai do mesmo empreendimento, herança de bloco e ausência de ciclos
CREATE OR REPLACE FUNCTION siigp_location_integrity() RETURNS trigger AS $$
DECLARE
  b_project uuid;
  p_project uuid;
  p_building uuid;
  cur uuid;
  depth int := 0;
BEGIN
  -- Escopo de unicidade do código (ver @@unique([projectId, codeScopeId, code]) no schema)
  NEW."code_scope_id" := COALESCE(NEW."building_id", NEW."project_id");

  IF NEW."building_id" IS NOT NULL THEN
    SELECT "project_id" INTO b_project FROM "buildings" WHERE "id" = NEW."building_id";
    IF b_project IS NULL OR b_project <> NEW."project_id" THEN
      RAISE EXCEPTION 'integrity: bloco pertence a outro empreendimento' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."parent_location_id" IS NOT NULL THEN
    SELECT "project_id", "building_id" INTO p_project, p_building
      FROM "locations" WHERE "id" = NEW."parent_location_id";
    IF p_project IS NULL OR p_project <> NEW."project_id" THEN
      RAISE EXCEPTION 'integrity: localização superior pertence a outro empreendimento' USING ERRCODE = '23514';
    END IF;
    IF p_building IS DISTINCT FROM NEW."building_id" THEN
      RAISE EXCEPTION 'integrity: localização e localização superior devem estar no mesmo bloco' USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'UPDATE' THEN
      cur := NEW."parent_location_id";
      WHILE cur IS NOT NULL AND depth < 200 LOOP
        IF cur = NEW."id" THEN
          RAISE EXCEPTION 'integrity: a hierarquia não pode ser circular' USING ERRCODE = '23514';
        END IF;
        SELECT "parent_location_id" INTO cur FROM "locations" WHERE "id" = cur;
        depth := depth + 1;
      END LOOP;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."location_type" = 'UNIT' AND NEW."location_type" <> 'UNIT'
     AND EXISTS (SELECT 1 FROM "private_units" WHERE "location_id" = NEW."id") THEN
    RAISE EXCEPTION 'integrity: o tipo de uma localização com unidade privativa não pode ser alterado' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- private_units: localização do mesmo empreendimento e do tipo UNIT
CREATE OR REPLACE FUNCTION siigp_private_unit_integrity() RETURNS trigger AS $$
DECLARE
  l_project uuid;
  l_type location_type;
BEGIN
  SELECT "project_id", "location_type" INTO l_project, l_type FROM "locations" WHERE "id" = NEW."location_id";
  IF l_project IS NULL OR l_project <> NEW."project_id" THEN
    RAISE EXCEPTION 'integrity: localização da unidade pertence a outro empreendimento' USING ERRCODE = '23514';
  END IF;
  IF l_type <> 'UNIT' THEN
    RAISE EXCEPTION 'integrity: a localização da unidade privativa deve ser do tipo UNIT' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- vínculos de responsável: responsável da mesma organização
CREATE OR REPLACE FUNCTION siigp_assignment_integrity() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "project_responsibles" r WHERE r."id" = NEW."responsible_id" AND r."organization_id" = NEW."organization_id"
  ) THEN
    RAISE EXCEPTION 'integrity: responsável inexistente ou de outra organização' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- anexos: histórico da mesma organização
CREATE OR REPLACE FUNCTION siigp_attachment_integrity() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "project_history" h WHERE h."id" = NEW."history_id" AND h."organization_id" = NEW."organization_id"
  ) THEN
    RAISE EXCEPTION 'integrity: histórico inexistente ou de outra organização' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- trilha de auditoria é somente-inserção
CREATE OR REPLACE FUNCTION siigp_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'integrity: registros de auditoria não podem ser alterados ou removidos' USING ERRCODE = '23514';
END $$ LANGUAGE plpgsql;

-- ── Ligação dos triggers ──

CREATE TRIGGER "projects_client_same_org" BEFORE INSERT OR UPDATE OF "client_id", "organization_id" ON "projects"
  FOR EACH ROW EXECUTE FUNCTION siigp_project_client_same_org();

CREATE TRIGGER "project_characteristics_project_same_org" BEFORE INSERT OR UPDATE OF "project_id", "organization_id" ON "project_characteristics"
  FOR EACH ROW EXECUTE FUNCTION siigp_project_same_org();
CREATE TRIGGER "buildings_project_same_org" BEFORE INSERT OR UPDATE OF "project_id", "organization_id" ON "buildings"
  FOR EACH ROW EXECUTE FUNCTION siigp_project_same_org();
CREATE TRIGGER "locations_project_same_org" BEFORE INSERT OR UPDATE OF "project_id", "organization_id" ON "locations"
  FOR EACH ROW EXECUTE FUNCTION siigp_project_same_org();
CREATE TRIGGER "private_units_project_same_org" BEFORE INSERT OR UPDATE OF "project_id", "organization_id" ON "private_units"
  FOR EACH ROW EXECUTE FUNCTION siigp_project_same_org();
CREATE TRIGGER "assignments_project_same_org" BEFORE INSERT OR UPDATE OF "project_id", "organization_id" ON "project_responsible_assignments"
  FOR EACH ROW EXECUTE FUNCTION siigp_project_same_org();
CREATE TRIGGER "history_project_same_org" BEFORE INSERT OR UPDATE OF "project_id", "organization_id" ON "project_history"
  FOR EACH ROW EXECUTE FUNCTION siigp_project_same_org();

CREATE TRIGGER "locations_integrity" BEFORE INSERT OR UPDATE ON "locations"
  FOR EACH ROW EXECUTE FUNCTION siigp_location_integrity();
CREATE TRIGGER "private_units_integrity" BEFORE INSERT OR UPDATE ON "private_units"
  FOR EACH ROW EXECUTE FUNCTION siigp_private_unit_integrity();
CREATE TRIGGER "assignments_integrity" BEFORE INSERT OR UPDATE OF "responsible_id", "organization_id" ON "project_responsible_assignments"
  FOR EACH ROW EXECUTE FUNCTION siigp_assignment_integrity();
CREATE TRIGGER "attachments_integrity" BEFORE INSERT OR UPDATE OF "history_id", "organization_id" ON "project_history_attachments"
  FOR EACH ROW EXECUTE FUNCTION siigp_attachment_integrity();

CREATE TRIGGER "audit_logs_append_only" BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION siigp_audit_append_only();

-- Imutabilidade de organization_id
CREATE TRIGGER "clients_org_immutable" BEFORE UPDATE OF "organization_id" ON "clients" FOR EACH ROW EXECUTE FUNCTION siigp_org_immutable();
CREATE TRIGGER "projects_org_immutable" BEFORE UPDATE OF "organization_id" ON "projects" FOR EACH ROW EXECUTE FUNCTION siigp_org_immutable();
CREATE TRIGGER "buildings_org_immutable" BEFORE UPDATE OF "organization_id" ON "buildings" FOR EACH ROW EXECUTE FUNCTION siigp_org_immutable();
CREATE TRIGGER "locations_org_immutable" BEFORE UPDATE OF "organization_id" ON "locations" FOR EACH ROW EXECUTE FUNCTION siigp_org_immutable();
CREATE TRIGGER "private_units_org_immutable" BEFORE UPDATE OF "organization_id" ON "private_units" FOR EACH ROW EXECUTE FUNCTION siigp_org_immutable();
CREATE TRIGGER "responsibles_org_immutable" BEFORE UPDATE OF "organization_id" ON "project_responsibles" FOR EACH ROW EXECUTE FUNCTION siigp_org_immutable();
CREATE TRIGGER "history_org_immutable" BEFORE UPDATE OF "organization_id" ON "project_history" FOR EACH ROW EXECUTE FUNCTION siigp_org_immutable();

-- Imutabilidade de project_id
CREATE TRIGGER "buildings_project_immutable" BEFORE UPDATE OF "project_id" ON "buildings" FOR EACH ROW EXECUTE FUNCTION siigp_project_immutable();
CREATE TRIGGER "locations_project_immutable" BEFORE UPDATE OF "project_id" ON "locations" FOR EACH ROW EXECUTE FUNCTION siigp_project_immutable();
CREATE TRIGGER "private_units_project_immutable" BEFORE UPDATE OF "project_id" ON "private_units" FOR EACH ROW EXECUTE FUNCTION siigp_project_immutable();
CREATE TRIGGER "assignments_project_immutable" BEFORE UPDATE OF "project_id" ON "project_responsible_assignments" FOR EACH ROW EXECUTE FUNCTION siigp_project_immutable();
CREATE TRIGGER "history_project_immutable" BEFORE UPDATE OF "project_id" ON "project_history" FOR EACH ROW EXECUTE FUNCTION siigp_project_immutable();
