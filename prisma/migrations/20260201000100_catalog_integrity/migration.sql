-- MOD-02: regras de integridade do catálogo técnico (CHECKs e triggers).
-- Mensagens começam com "integrity:" para serem traduzidas pela API (ERRCODE 23514).

-- ═════════════════════ CHECK constraints ═════════════════════
ALTER TABLE "catalog_items"
  ADD CONSTRAINT "catalog_items_code_format" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9._/-]*$'),
  ADD CONSTRAINT "catalog_items_name_not_blank" CHECK (length(btrim("name")) > 0),
  ADD CONSTRAINT "catalog_items_not_own_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
ALTER TABLE "components"
  ADD CONSTRAINT "components_name_not_blank" CHECK (length(btrim("name")) > 0),
  ADD CONSTRAINT "components_tag_not_blank" CHECK ("tag" IS NULL OR length(btrim("tag")) > 0),
  ADD CONSTRAINT "components_public_code_format" CHECK ("public_code" ~ '^CMP-[0-9]{6,}$');
ALTER TABLE "norms"
  ADD CONSTRAINT "norms_code_not_blank" CHECK (length(btrim("code")) > 0),
  ADD CONSTRAINT "norms_title_not_blank" CHECK (length(btrim("title")) > 0);
ALTER TABLE "norm_editions" ADD CONSTRAINT "norm_editions_edition_not_blank" CHECK (length(btrim("edition")) > 0);
ALTER TABLE "norm_sections"
  ADD CONSTRAINT "norm_sections_ref_not_blank" CHECK (length(btrim("ref")) > 0),
  ADD CONSTRAINT "norm_sections_title_not_blank" CHECK (length(btrim("title")) > 0);
ALTER TABLE "inspection_criteria"
  ADD CONSTRAINT "criteria_code_format" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9._/-]*$'),
  ADD CONSTRAINT "criteria_label_not_blank" CHECK (length(btrim("label")) > 0),
  ADD CONSTRAINT "criteria_range_valid" CHECK ("min_value" IS NULL OR "max_value" IS NULL OR "min_value" <= "max_value"),
  ADD CONSTRAINT "criteria_range_only_number" CHECK ("response_type" = 'NUMBER' OR ("min_value" IS NULL AND "max_value" IS NULL)),
  ADD CONSTRAINT "criteria_options_choice" CHECK (
    ("response_type" = 'SINGLE_CHOICE' AND cardinality("options") >= 2) OR
    ("response_type" <> 'SINGLE_CHOICE' AND cardinality("options") = 0));
ALTER TABLE "manifestations"
  ADD CONSTRAINT "manifestations_code_format" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9._/-]*$'),
  ADD CONSTRAINT "manifestations_name_not_blank" CHECK (length(btrim("name")) > 0);
ALTER TABLE "technical_classifications"
  ADD CONSTRAINT "classifications_code_format" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9._/-]*$'),
  ADD CONSTRAINT "classifications_name_not_blank" CHECK (length(btrim("name")) > 0);

-- ═════════════════════ Funções de integridade ═════════════════════

-- A referência (tabela/coluna passadas como argumentos) deve pertencer à mesma organização.
CREATE OR REPLACE FUNCTION siigp_ref_same_org() RETURNS trigger AS $$
DECLARE ref_id uuid; ref_org uuid;
BEGIN
  ref_id := (to_jsonb(NEW) ->> TG_ARGV[1])::uuid;
  IF ref_id IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT "organization_id" FROM %I WHERE "id" = $1', TG_ARGV[0]) INTO ref_org USING ref_id;
  IF ref_org IS DISTINCT FROM NEW."organization_id" THEN
    RAISE EXCEPTION 'integrity: registro referenciado inexistente ou de outra organização' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- Catálogo: sistema (raiz) → subsistema → tipo; o tipo pode ficar direto sob um sistema.
CREATE OR REPLACE FUNCTION siigp_catalog_integrity() RETURNS trigger AS $$
DECLARE pkind catalog_item_kind; porg uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."kind" <> OLD."kind" THEN
    RAISE EXCEPTION 'integrity: o nível de um item do catálogo (sistema, subsistema ou tipo) não pode ser alterado' USING ERRCODE = '23514';
  END IF;
  IF NEW."parent_id" IS NULL THEN
    IF NEW."kind" <> 'SYSTEM' THEN
      RAISE EXCEPTION 'integrity: subsistemas e tipos precisam estar dentro de um item superior' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT "kind", "organization_id" INTO pkind, porg FROM "catalog_items" WHERE "id" = NEW."parent_id";
  IF pkind IS NULL OR porg <> NEW."organization_id" THEN
    RAISE EXCEPTION 'integrity: item superior inexistente ou de outra organização' USING ERRCODE = '23514';
  END IF;
  IF NEW."kind" = 'SYSTEM' THEN
    RAISE EXCEPTION 'integrity: um sistema não pode estar dentro de outro item' USING ERRCODE = '23514';
  ELSIF NEW."kind" = 'SUBSYSTEM' AND pkind <> 'SYSTEM' THEN
    RAISE EXCEPTION 'integrity: um subsistema só pode estar dentro de um sistema' USING ERRCODE = '23514';
  ELSIF NEW."kind" = 'TYPE' AND pkind NOT IN ('SYSTEM', 'SUBSYSTEM') THEN
    RAISE EXCEPTION 'integrity: um tipo de componente só pode estar dentro de um sistema ou subsistema' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- Referência a item do catálogo de um nível específico (argumento: coluna e nível).
CREATE OR REPLACE FUNCTION siigp_ref_catalog_kind() RETURNS trigger AS $$
DECLARE ref_id uuid; k catalog_item_kind; o uuid;
BEGIN
  ref_id := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
  SELECT "kind", "organization_id" INTO k, o FROM "catalog_items" WHERE "id" = ref_id;
  IF k IS NULL OR o <> NEW."organization_id" THEN
    RAISE EXCEPTION 'integrity: item do catálogo inexistente ou de outra organização' USING ERRCODE = '23514';
  END IF;
  IF k::text <> TG_ARGV[1] THEN
    RAISE EXCEPTION 'integrity: o item do catálogo informado não é do nível esperado (%)', TG_ARGV[1] USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- Componente: identificador público automático e imutável; tipo e empreendimento imutáveis;
-- localização do mesmo empreendimento.
CREATE OR REPLACE FUNCTION siigp_component_integrity() RETURNS trigger AS $$
DECLARE lproj uuid; lorg uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."public_code" := 'CMP-' || lpad(NEW."seq"::text, 6, '0');
  ELSE
    IF NEW."id" <> OLD."id" OR NEW."seq" <> OLD."seq" OR NEW."public_code" <> OLD."public_code" THEN
      RAISE EXCEPTION 'integrity: o identificador de um componente não pode ser alterado' USING ERRCODE = '23514';
    END IF;
    IF NEW."type_id" <> OLD."type_id" THEN
      RAISE EXCEPTION 'integrity: o tipo de um componente não pode ser alterado; desative-o e cadastre outro' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."location_id" IS NOT NULL THEN
    SELECT "project_id", "organization_id" INTO lproj, lorg FROM "locations" WHERE "id" = NEW."location_id";
    IF lproj IS NULL OR lproj <> NEW."project_id" OR lorg <> NEW."organization_id" THEN
      RAISE EXCEPTION 'integrity: a localização deve pertencer ao mesmo empreendimento do componente' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ═════════════════════ Triggers ═════════════════════
CREATE TRIGGER "catalog_items_integrity" BEFORE INSERT OR UPDATE ON "catalog_items"
  FOR EACH ROW EXECUTE FUNCTION siigp_catalog_integrity();

CREATE TRIGGER "components_integrity" BEFORE INSERT OR UPDATE ON "components"
  FOR EACH ROW EXECUTE FUNCTION siigp_component_integrity();
CREATE TRIGGER "components_project_same_org" BEFORE INSERT OR UPDATE OF "project_id", "organization_id" ON "components"
  FOR EACH ROW EXECUTE FUNCTION siigp_project_same_org();
CREATE TRIGGER "components_type_kind" BEFORE INSERT OR UPDATE OF "type_id", "organization_id" ON "components"
  FOR EACH ROW EXECUTE FUNCTION siigp_ref_catalog_kind('type_id', 'TYPE');
CREATE TRIGGER "components_project_immutable" BEFORE UPDATE OF "project_id" ON "components"
  FOR EACH ROW EXECUTE FUNCTION siigp_project_immutable();

CREATE TRIGGER "project_systems_project_same_org" BEFORE INSERT OR UPDATE OF "project_id", "organization_id" ON "project_systems"
  FOR EACH ROW EXECUTE FUNCTION siigp_project_same_org();
CREATE TRIGGER "project_systems_system_kind" BEFORE INSERT OR UPDATE OF "system_id", "organization_id" ON "project_systems"
  FOR EACH ROW EXECUTE FUNCTION siigp_ref_catalog_kind('system_id', 'SYSTEM');
CREATE TRIGGER "project_systems_project_immutable" BEFORE UPDATE OF "project_id", "system_id" ON "project_systems"
  FOR EACH ROW EXECUTE FUNCTION siigp_project_immutable();

CREATE TRIGGER "criteria_type_kind" BEFORE INSERT OR UPDATE OF "type_id", "organization_id" ON "inspection_criteria"
  FOR EACH ROW EXECUTE FUNCTION siigp_ref_catalog_kind('type_id', 'TYPE');

CREATE TRIGGER "norm_editions_norm_same_org" BEFORE INSERT OR UPDATE OF "norm_id", "organization_id" ON "norm_editions"
  FOR EACH ROW EXECUTE FUNCTION siigp_ref_same_org('norms', 'norm_id');
CREATE TRIGGER "norm_sections_edition_same_org" BEFORE INSERT OR UPDATE OF "edition_id", "organization_id" ON "norm_sections"
  FOR EACH ROW EXECUTE FUNCTION siigp_ref_same_org('norm_editions', 'edition_id');
CREATE TRIGGER "catalog_norm_links_item_same_org" BEFORE INSERT OR UPDATE OF "catalog_item_id", "organization_id" ON "catalog_item_norm_sections"
  FOR EACH ROW EXECUTE FUNCTION siigp_ref_same_org('catalog_items', 'catalog_item_id');
CREATE TRIGGER "catalog_norm_links_section_same_org" BEFORE INSERT OR UPDATE OF "section_id", "organization_id" ON "catalog_item_norm_sections"
  FOR EACH ROW EXECUTE FUNCTION siigp_ref_same_org('norm_sections', 'section_id');
CREATE TRIGGER "manifest_class_manifest_same_org" BEFORE INSERT OR UPDATE OF "manifestation_id", "organization_id" ON "manifestation_classifications"
  FOR EACH ROW EXECUTE FUNCTION siigp_ref_same_org('manifestations', 'manifestation_id');
CREATE TRIGGER "manifest_class_class_same_org" BEFORE INSERT OR UPDATE OF "classification_id", "organization_id" ON "manifestation_classifications"
  FOR EACH ROW EXECUTE FUNCTION siigp_ref_same_org('technical_classifications', 'classification_id');

-- organization_id imutável em todas as tabelas novas
CREATE TRIGGER "catalog_items_org_immutable" BEFORE UPDATE OF "organization_id" ON "catalog_items" FOR EACH ROW EXECUTE FUNCTION siigp_org_immutable();
CREATE TRIGGER "components_org_immutable" BEFORE UPDATE OF "organization_id" ON "components" FOR EACH ROW EXECUTE FUNCTION siigp_org_immutable();
CREATE TRIGGER "project_systems_org_immutable" BEFORE UPDATE OF "organization_id" ON "project_systems" FOR EACH ROW EXECUTE FUNCTION siigp_org_immutable();
CREATE TRIGGER "norms_org_immutable" BEFORE UPDATE OF "organization_id" ON "norms" FOR EACH ROW EXECUTE FUNCTION siigp_org_immutable();
CREATE TRIGGER "norm_editions_org_immutable" BEFORE UPDATE OF "organization_id" ON "norm_editions" FOR EACH ROW EXECUTE FUNCTION siigp_org_immutable();
CREATE TRIGGER "norm_sections_org_immutable" BEFORE UPDATE OF "organization_id" ON "norm_sections" FOR EACH ROW EXECUTE FUNCTION siigp_org_immutable();
CREATE TRIGGER "catalog_norm_links_org_immutable" BEFORE UPDATE OF "organization_id" ON "catalog_item_norm_sections" FOR EACH ROW EXECUTE FUNCTION siigp_org_immutable();
CREATE TRIGGER "criteria_org_immutable" BEFORE UPDATE OF "organization_id" ON "inspection_criteria" FOR EACH ROW EXECUTE FUNCTION siigp_org_immutable();
CREATE TRIGGER "manifestations_org_immutable" BEFORE UPDATE OF "organization_id" ON "manifestations" FOR EACH ROW EXECUTE FUNCTION siigp_org_immutable();
CREATE TRIGGER "classifications_org_immutable" BEFORE UPDATE OF "organization_id" ON "technical_classifications" FOR EACH ROW EXECUTE FUNCTION siigp_org_immutable();
CREATE TRIGGER "manifest_class_org_immutable" BEFORE UPDATE OF "organization_id" ON "manifestation_classifications" FOR EACH ROW EXECUTE FUNCTION siigp_org_immutable();
