/**
 * Dados iniciais OPCIONAIS do catálogo técnico (MOD-02). Idempotente: o que já existe é ignorado.
 * Conteúdo genérico, apenas para começar. Das normas entram só código, título e ano — as seções são
 * genéricas e DEVEM ser revisadas/complementadas pela equipe técnica (não transcrevemos textos de normas).
 * Uso: npm run db:seed:catalog
 */
import "dotenv/config";
import { db } from "../src/server/db";
import type { Ctx } from "../src/server/context";
import { createCatalogItem } from "../src/server/services/catalog";
import { createCriterion } from "../src/server/services/criteria";
import { createClassification, createManifestation } from "../src/server/services/manifestations";
import { createNorm, createEdition, createSection, addCatalogNormLink } from "../src/server/services/norms";

type Sys = { code: string; name: string; types: [string, string][] };
const SYSTEMS: Sys[] = [
  { code: "ELE", name: "Instalações elétricas", types: [["QDG", "Quadro geral de distribuição"], ["QD", "Quadro de distribuição"], ["GER", "Gerador"], ["LUM", "Luminária de emergência"]] },
  { code: "HID", name: "Instalações hidrossanitárias", types: [["BOM", "Bomba de recalque"], ["RES", "Reservatório"], ["REG", "Registro / válvula"]] },
  { code: "SPDA", name: "Proteção contra descargas atmosféricas", types: [["CAP", "Captor"], ["ATR", "Aterramento"]] },
  { code: "INC", name: "Prevenção e combate a incêndio", types: [["EXT", "Extintor de incêndio"], ["HID-INC", "Hidrante"], ["ALM", "Central de alarme"]] },
  { code: "ELV", name: "Transporte vertical", types: [["ELEV", "Elevador"]] },
  { code: "ENV", name: "Envoltória e estrutura", types: [["FAC", "Fachada"], ["COB", "Cobertura / telhado"], ["IMP", "Impermeabilização"]] },
];

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || "admin@example.com").toLowerCase();
  const admin = await db.user.findUnique({ where: { email } });
  if (!admin) throw new Error("Administrador não encontrado. Rode antes: npm run db:seed");
  const ctx: Ctx = { organizationId: admin.organizationId, userId: admin.id, role: "ADMIN" };
  const org = ctx.organizationId;
  const find = (code: string) => db.catalogItem.findFirst({ where: { organizationId: org, code } });
  let created = 0;

  const typeIds: Record<string, string> = {};
  for (const s of SYSTEMS) {
    let sys = await find(s.code);
    if (!sys) { const r = await createCatalogItem(ctx, { kind: "SYSTEM", parentId: null, code: s.code, name: s.name }); sys = await db.catalogItem.findFirst({ where: { id: r.id } }); created++; }
    for (const [c, n] of s.types) {
      const code = `${s.code}.${c}`;
      let t = await find(code);
      if (!t) { const r = await createCatalogItem(ctx, { kind: "TYPE", parentId: sys!.id, code, name: n }); t = await db.catalogItem.findFirst({ where: { id: r.id } }); created++; }
      typeIds[code] = t!.id;
    }
  }

  const criteria: Record<string, [string, string, string, Record<string, unknown>?][]> = {
    "INC.EXT": [["LACRE", "Lacre de segurança intacto?", "YES_NO"], ["CARGA", "Carga dentro da validade?", "YES_NO"], ["MANOM", "Manômetro na faixa de operação?", "PASS_FAIL"], ["SINAL", "Sinalização e acesso desobstruídos?", "PASS_FAIL"]],
    "ELE.QDG": [["TERM", "Conexões sem sinais de aquecimento?", "PASS_FAIL"], ["IDENT", "Circuitos identificados?", "YES_NO"], ["TEMP", "Temperatura medida no barramento", "NUMBER", { unit: "°C", maxValue: "70" }], ["OBS", "Observações", "TEXT", { required: false }]],
    "HID.BOM": [["RUIDO", "Ruído / vibração anormal?", "YES_NO"], ["VAZ", "Presença de vazamento", "SINGLE_CHOICE", { options: ["Nenhum", "Gotejamento", "Vazamento contínuo"] }]],
  };
  for (const [code, list] of Object.entries(criteria)) {
    const id = typeIds[code]; if (!id) continue;
    if (await db.inspectionCriterion.count({ where: { typeId: id } })) continue;
    for (const [c, label, responseType, extra] of list) { await createCriterion(ctx, id, { code: c, label, responseType, required: true, ...(extra ?? {}) }); created++; }
  }

  const clsDefs: [string, string, string][] = [["GRAV-BAIXA", "Gravidade baixa", "SEVERITY"], ["GRAV-MEDIA", "Gravidade média", "SEVERITY"], ["GRAV-ALTA", "Gravidade alta", "SEVERITY"],
    ["ORIG-USO", "Origem: uso e desgaste", "ORIGIN"], ["ORIG-EXEC", "Origem: falha de execução", "ORIGIN"], ["ORIG-MANUT", "Origem: falta de manutenção", "ORIGIN"],
    ["URG-IMED", "Urgência imediata", "URGENCY"], ["URG-CURTO", "Urgência a curto prazo", "URGENCY"], ["URG-PROG", "Urgência programável", "URGENCY"]];
  const cls: Record<string, string> = {};
  for (const [code, name, kind] of clsDefs) {
    let r = await db.technicalClassification.findFirst({ where: { organizationId: org, code } });
    if (!r) { const x = await createClassification(ctx, { code, name, kind }); r = await db.technicalClassification.findFirst({ where: { id: x.id } }); created++; }
    cls[code] = r!.id;
  }
  const manDefs: [string, string, string, string[]][] = [
    ["FISSURA", "Fissura", "Abertura linear na superfície do elemento.", ["GRAV-MEDIA", "ORIG-EXEC"]],
    ["CORROSAO", "Corrosão", "Deterioração de metais por ação do meio.", ["GRAV-ALTA", "ORIG-MANUT"]],
    ["INFILTR", "Infiltração", "Penetração indevida de umidade.", ["GRAV-MEDIA", "URG-CURTO"]],
    ["VAZAMENTO", "Vazamento", "Perda de fluido em tubulação ou equipamento.", ["URG-IMED"]],
    ["DESGASTE", "Desgaste", "Perda de material ou desempenho por uso.", ["ORIG-USO", "URG-PROG"]],
  ];
  for (const [code, name, description, c] of manDefs) {
    if (await db.manifestation.findFirst({ where: { organizationId: org, code } })) continue;
    await createManifestation(ctx, { code, name, description, classificationIds: c.map((k) => cls[k]) }); created++;
  }

  // Normas: apenas identificação (código, título, ano). Seções genéricas a completar pela equipe técnica.
  const norms: [string, string, string, string[]][] = [
    ["ABNT NBR 5410", "Instalações elétricas de baixa tensão", "2004", ["ELE"]],
    ["ABNT NBR 5419", "Proteção contra descargas atmosféricas", "2015", ["SPDA"]],
    ["ABNT NBR 5674", "Manutenção de edificações — Requisitos para o sistema de gestão de manutenção", "2012", ["ENV"]],
    ["ABNT NBR 16280", "Reforma em edificações — Sistema de gestão de reformas", "2015", ["ENV"]],
    ["ABNT NBR 16747", "Inspeção predial — Diretrizes, conceitos, terminologia e procedimento", "2020", ["ENV", "ELE", "HID", "INC", "ELV", "SPDA"]],
  ];
  for (const [code, title, year, systems] of norms) {
    if (await db.norm.findFirst({ where: { organizationId: org, code } })) continue;
    const n = await createNorm(ctx, { code, title, issuer: "ABNT" });
    const e = await createEdition(ctx, n.id, { edition: year, isCurrent: true });
    const sec = await createSection(ctx, e.id, { ref: "1", title: "Escopo (complementar com as seções aplicáveis)" });
    for (const s of systems) { const item = await find(s); if (item) await addCatalogNormLink(ctx, item.id, { sectionId: sec.id }); }
    created++;
  }
  console.log(`Catálogo inicial: ${created} registro(s) criado(s).`);

  if (process.argv.includes("--demo")) {
    const p = await db.project.findFirst({ where: { organizationId: org, code: "ATENAS" } });
    if (!p) return console.log("Empreendimento ATENAS não encontrado; rode npm run db:seed:demo antes.");
    const { selectProjectSystem } = await import("../src/server/services/project-systems");
    const { createComponent } = await import("../src/server/services/components");
    for (const c of ["ELE", "INC", "HID"]) { const s = await find(c); const ex = s && await db.projectSystem.findFirst({ where: { projectId: p.id, systemId: s.id, status: "ACTIVE" } }); if (s && !ex) await selectProjectSystem(ctx, p.id, { systemId: s.id }); }
    if (!(await db.component.count({ where: { projectId: p.id } }))) {
      const loc = await db.location.findFirst({ where: { projectId: p.id, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
      await createComponent(ctx, p.id, { typeId: typeIds["ELE.QDG"], locationId: loc?.id ?? null, name: "Quadro geral — demonstração", tag: "QDG-01" });
      await createComponent(ctx, p.id, { typeId: typeIds["INC.EXT"], locationId: loc?.id ?? null, name: "Extintor ABC 6 kg — demonstração", tag: "EXT-001" });
      console.log("Componentes de demonstração criados.");
    }
  }
}
main().then(() => db.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
