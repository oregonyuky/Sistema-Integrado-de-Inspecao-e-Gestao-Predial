import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createClient } from "@/server/services/clients";
import { createProject, deactivateProject } from "@/server/services/projects";
import { createBuilding } from "@/server/services/buildings";
import { createLocation, deactivateLocation } from "@/server/services/locations";
import {
  createCatalogItem, deactivateCatalogItem, getCatalogItem, listCatalog, reactivateCatalogItem, updateCatalogItem,
} from "@/server/services/catalog";
import { deselectProjectSystem, listProjectSystems, selectProjectSystem } from "@/server/services/project-systems";
import {
  componentHistory, createComponent, deactivateComponent, getComponent, listComponents, reactivateComponent, updateComponent,
} from "@/server/services/components";
import {
  addCatalogNormLink, createEdition, createNorm, createSection, listCatalogNorms, listNorms, removeCatalogNormLink,
  searchSections, setSectionStatus, updateEdition,
} from "@/server/services/norms";
import { createCriterion, listCriteria, reorderCriterion, setCriterionStatus, updateCriterion } from "@/server/services/criteria";
import {
  createClassification, createManifestation, listClassifications, listManifestations, setManifestationStatus, updateManifestation,
} from "@/server/services/manifestations";
import { buildingPayload, clientPayload, err, floorPayload, makeOrg, projectPayload, resetData, roomPayload, uniq, type TestOrg } from "./helpers";

beforeAll(async () => { await resetData(); });

/** Cenário padrão: org com empreendimento, bloco, pavimento, sala e catálogo ELE › QUADROS › QDG. */
async function scenario(name = "Alfa") {
  const org = await makeOrg(name);
  const client = await createClient(org.admin, clientPayload());
  const project = await createProject(org.admin, projectPayload(client.id));
  const building = await createBuilding(org.admin, project.id, buildingPayload("B1"));
  const floor = await createLocation(org.admin, project.id, floorPayload(building.id, "P1"));
  const room = await createLocation(org.admin, project.id, { ...roomPayload(floor.id, "S1"), buildingId: building.id });
  const sys = await createCatalogItem(org.admin, { kind: "SYSTEM", code: "ELE", name: "Instalações elétricas" });
  const sub = await createCatalogItem(org.admin, { kind: "SUBSYSTEM", parentId: sys.id, code: "ELE.QD", name: "Quadros" });
  const type = await createCatalogItem(org.admin, { kind: "TYPE", parentId: sub.id, code: "QDG", name: "Quadro geral de baixa tensão" });
  return { org, client, project, building, floor, room, sys, sub, type };
}
type S = Awaited<ReturnType<typeof scenario>>;
const comp = (s: S, o: Record<string, unknown> = {}) => ({ typeId: s.type.id, name: "QDG Bloco 1", locationId: s.room.id, ...o });
async function withSystem(s: S) { await selectProjectSystem(s.org.admin, s.project.id, { systemId: s.sys.id }); }

describe("RF-011 Catálogo mestre", () => {
  let s: S;
  beforeAll(async () => { s = await scenario("Cat"); });

  it("mantém a biblioteca de sistemas e a lista com contagens", async () => {
    const { items } = await listCatalog(s.org.viewer);
    expect(items.map((i) => i.code).sort()).toEqual(["ELE", "ELE.QD", "QDG"]);
    expect(items.find((i) => i.code === "QDG")).toMatchObject({ kind: "TYPE", status: "ACTIVE", componentCount: 0 });
  });
  it("normaliza o código para maiúsculas e rejeita código repetido na organização", async () => {
    const a = await createCatalogItem(s.org.editor, { kind: "SYSTEM", code: "hid", name: "Hidrossanitário" });
    expect(a.code).toBe("HID");
    const e = await err(createCatalogItem(s.org.editor, { kind: "SYSTEM", code: "HID", name: "Outro" }));
    expect(e.status).toBe(409);
    expect((e.details as { fields: Record<string, string> }).fields.code).toBeTruthy();
  });
  it("o mesmo código pode existir em outra organização", async () => {
    const other = await makeOrg("Beta");
    await expect(createCatalogItem(other.admin, { kind: "SYSTEM", code: "ELE", name: "Elétrica" })).resolves.toMatchObject({ code: "ELE" });
  });
  it("valida campos obrigatórios com mensagens por campo", async () => {
    const e = await err(createCatalogItem(s.org.admin, { kind: "SYSTEM", code: "", name: " " }));
    expect(e.status).toBe(422);
    expect(Object.keys((e.details as { fields: object }).fields)).toEqual(expect.arrayContaining(["code", "name"]));
  });
  it("perfil de consulta não altera o catálogo", async () => {
    expect((await err(createCatalogItem(s.org.viewer, { kind: "SYSTEM", code: "GAS", name: "Gás" }))).status).toBe(403);
  });
  it("isola o catálogo por organização", async () => {
    const other = await makeOrg("Gama");
    expect((await err(getCatalogItem(other.admin, s.sys.id))).status).toBe(404);
    expect((await listCatalog(other.admin)).items).toHaveLength(0);
  });
});

describe("RF-013 / RF-015 Cadastro hierárquico e inclusão", () => {
  let s: S;
  beforeAll(async () => { s = await scenario("Hier"); });

  it("sistema → subsistema → tipo, e tipo direto sob sistema", async () => {
    const d = await createCatalogItem(s.org.admin, { kind: "TYPE", parentId: s.sys.id, code: "LUM", name: "Luminária" });
    expect(d.parentId).toBe(s.sys.id);
    const info = await getCatalogItem(s.org.admin, s.type.id);
    expect(info.path.map((p) => p.kind)).toEqual(["SYSTEM", "SUBSYSTEM", "TYPE"]);
  });
  it("rejeita níveis inválidos (serviço)", async () => {
    expect((await err(createCatalogItem(s.org.admin, { kind: "SUBSYSTEM", code: "X1", name: "x" }))).status).toBe(422);
    expect((await err(createCatalogItem(s.org.admin, { kind: "SYSTEM", parentId: s.sys.id, code: "X2", name: "x" }))).status).toBe(422);
    expect((await err(createCatalogItem(s.org.admin, { kind: "TYPE", parentId: s.type.id, code: "X3", name: "x" }))).status).toBe(422);
    expect((await err(createCatalogItem(s.org.admin, { kind: "SUBSYSTEM", parentId: s.sub.id, code: "X4", name: "x" }))).status).toBe(422);
    expect((await err(createCatalogItem(s.org.admin, { kind: "TYPE", code: "X5", name: "x" }))).status).toBe(422);
  });
  it("o banco também bloqueia níveis inválidos e pai de outra organização", async () => {
    const e1 = await err(db.catalogItem.create({ data: { organizationId: s.org.orgId, kind: "SUBSYSTEM", code: "DB1", name: "x" } }));
    expect(e1.code).toBe("INTEGRITY");
    const other = await makeOrg("Delta");
    const e2 = await err(db.catalogItem.create({ data: { organizationId: other.orgId, kind: "SUBSYSTEM", parentId: s.sys.id, code: "DB2", name: "x" } }));
    expect(e2.code).toBe("INTEGRITY");
    const e3 = await err(db.catalogItem.update({ where: { id: s.type.id }, data: { kind: "SUBSYSTEM" } }));
    expect(e3.code).toBe("INTEGRITY");
  });
  it("não aceita item superior inativo", async () => {
    const sys2 = await createCatalogItem(s.org.admin, { kind: "SYSTEM", code: "INA", name: "Inativo" });
    await deactivateCatalogItem(s.org.admin, sys2.id);
    expect((await err(createCatalogItem(s.org.admin, { kind: "SUBSYSTEM", parentId: sys2.id, code: "INA.S", name: "x" }))).status).toBe(409);
  });
});

describe("RF-016 Edição da árvore preservando referências", () => {
  it("renomear e mover mantém ids; componentes continuam ligados e passam ao novo sistema", async () => {
    const s = await scenario("Edit");
    await withSystem(s);
    const c = await createComponent(s.org.editor, s.project.id, comp(s));
    const sys2 = await createCatalogItem(s.org.admin, { kind: "SYSTEM", code: "AUT", name: "Automação" });
    const renamed = await updateCatalogItem(s.org.editor, s.sub.id, { parentId: sys2.id, code: "AUT.QD", name: "Quadros de automação" });
    expect(renamed.id).toBe(s.sub.id);
    const got = await getComponent(s.org.viewer, c.id);
    expect(got.type?.id).toBe(s.type.id);
    expect(got.system?.id).toBe(sys2.id);
    expect(got.id).toBe(c.id);
    expect(got.publicCode).toBe(c.publicCode);
    const log = await db.auditLog.findFirst({ where: { entityType: "catalog_item", entityId: s.sub.id, action: "UPDATE" } });
    expect(JSON.stringify(log?.changes)).toContain("AUT.QD");
  });
  it("não permite código repetido nem mover para pai de nível errado", async () => {
    const s = await scenario("Edit2");
    expect((await err(updateCatalogItem(s.org.admin, s.sub.id, { parentId: s.sys.id, code: "ELE", name: "x" }))).status).toBe(409);
    expect((await err(updateCatalogItem(s.org.admin, s.sub.id, { parentId: s.type.id, code: "ELE.QD", name: "x" }))).status).toBe(422);
  });
  it("o nível (kind) não é editável pela API", async () => {
    const s = await scenario("Edit3");
    const r = await updateCatalogItem(s.org.admin, s.type.id, { kind: "SYSTEM", parentId: s.sub.id, code: "QDG", name: "Quadro" } as never);
    expect(r.kind).toBe("TYPE");
  });
});

describe("RF-017 Exclusão controlada (desativação)", () => {
  it("apenas administrador desativa; descendentes acompanham; histórico é mantido", async () => {
    const s = await scenario("Off");
    await withSystem(s);
    const c = await createComponent(s.org.editor, s.project.id, comp(s));
    expect((await err(deactivateCatalogItem(s.org.editor, s.sys.id))).status).toBe(403);
    const r = await deactivateCatalogItem(s.org.admin, s.sys.id);
    expect(r.itemsDeactivated).toBe(3);
    expect(r.activeComponentsKept).toBe(1);
    const all = await listCatalog(s.org.viewer);
    expect(all.items.every((i) => i.status === "INACTIVE")).toBe(true);
    expect((await getComponent(s.org.viewer, c.id)).name).toBe("QDG Bloco 1"); // continua consultável
    expect((await listCatalog(s.org.viewer, { status: "ACTIVE" })).items).toHaveLength(0);
  });
  it("tipo inativo deixa de aceitar novos componentes", async () => {
    const s = await scenario("Off2");
    await withSystem(s);
    await deactivateCatalogItem(s.org.admin, s.type.id);
    const e = await err(createComponent(s.org.editor, s.project.id, comp(s)));
    expect(e.status).toBe(409);
  });
  it("reativar exige o item superior ativo; pode reativar descendentes", async () => {
    const s = await scenario("Off3");
    await deactivateCatalogItem(s.org.admin, s.sys.id);
    expect((await err(reactivateCatalogItem(s.org.admin, s.sub.id))).status).toBe(409);
    const r = await reactivateCatalogItem(s.org.admin, s.sys.id, { includeDescendants: true });
    expect(r.itemsReactivated).toBe(3);
  });
});

describe("RF-012 Identificação individual", () => {
  let s: S;
  beforeAll(async () => { s = await scenario("Id"); await withSystem(s); });

  it("componentes distintos recebem identificadores diferentes e no formato CMP-", async () => {
    const a = await createComponent(s.org.editor, s.project.id, comp(s, { name: "A", tag: "T-1" }));
    const b = await createComponent(s.org.editor, s.project.id, comp(s, { name: "B", tag: "T-2" }));
    expect(a.publicCode).toMatch(/^CMP-\d{6}$/);
    expect(a.publicCode).not.toBe(b.publicCode);
    expect(a.id).not.toBe(b.id);
  });
  it("editar o cadastro não altera o identificador", async () => {
    const a = await createComponent(s.org.editor, s.project.id, comp(s, { name: "Original", tag: "T-9" }));
    const u = await updateComponent(s.org.editor, a.id, { name: "Renomeado", tag: "T-9", locationId: null, manufacturer: "WEG" });
    expect(u.id).toBe(a.id);
    expect(u.publicCode).toBe(a.publicCode);
    expect(u.name).toBe("Renomeado");
  });
  it("o banco recusa alterar identificador, id e tipo", async () => {
    const a = await createComponent(s.org.editor, s.project.id, comp(s, { name: "Imutável", tag: "T-10" }));
    expect((await err(db.$executeRawUnsafe(`UPDATE components SET public_code = 'CMP-999999' WHERE id = '${a.id}'`))).code).toBe("INTEGRITY");
    expect((await err(db.$executeRawUnsafe(`UPDATE components SET seq = seq + 1000 WHERE id = '${a.id}'`))).code).toBe("INTEGRITY");
    const other = await createCatalogItem(s.org.admin, { kind: "TYPE", parentId: s.sys.id, code: "OUT", name: "Outro tipo" });
    expect((await err(db.component.update({ where: { id: a.id }, data: { typeId: other.id } }))).code).toBe("INTEGRITY");
  });
  it("plaqueta é única no empreendimento", async () => {
    await createComponent(s.org.editor, s.project.id, comp(s, { name: "X", tag: "PLQ-1" }));
    const e = await err(createComponent(s.org.editor, s.project.id, comp(s, { name: "Y", tag: "PLQ-1" })));
    expect(e.status).toBe(409);
  });
});

describe("RF-014 Associação por localização", () => {
  let s: S;
  beforeAll(async () => { s = await scenario("Loc"); await withSystem(s); });

  it("vincula o componente a uma sala do empreendimento e filtra por local", async () => {
    const c = await createComponent(s.org.editor, s.project.id, comp(s));
    const got = await getComponent(s.org.viewer, c.id);
    expect(got.location?.path).toEqual(["Bloco B1", "Pavimento P1", "Ambiente S1"]);
    const byLoc = await listComponents(s.org.viewer, s.project.id, { locationId: s.room.id });
    expect(byLoc.items.map((i) => i.id)).toContain(c.id);
    expect((await listComponents(s.org.viewer, s.project.id, { locationId: s.floor.id })).total).toBe(0);
  });
  it("localização é opcional e pode ser trocada na edição", async () => {
    const c = await createComponent(s.org.editor, s.project.id, comp(s, { locationId: null, name: "Sem local" }));
    expect(c.location).toBeNull();
    const u = await updateComponent(s.org.editor, c.id, { name: "Sem local", locationId: s.floor.id });
    expect(u.location?.id).toBe(s.floor.id);
  });
  it("rejeita localização de outro empreendimento (serviço e banco)", async () => {
    const p2 = await createProject(s.org.admin, projectPayload(s.client.id));
    const b2 = await createBuilding(s.org.admin, p2.id, buildingPayload("B9"));
    const f2 = await createLocation(s.org.admin, p2.id, floorPayload(b2.id, "P9"));
    expect((await err(createComponent(s.org.editor, s.project.id, comp(s, { locationId: f2.id })))).status).toBe(422);
    const c = await createComponent(s.org.editor, s.project.id, comp(s, { name: "Direto" }));
    expect((await err(db.component.update({ where: { id: c.id }, data: { locationId: f2.id } }))).code).toBe("INTEGRITY");
  });
  it("não aceita localização inativa para novos vínculos", async () => {
    const r2 = await createLocation(s.org.admin, s.project.id, { ...roomPayload(s.floor.id, "S2"), buildingId: s.building.id });
    await deactivateLocation(s.org.admin, r2.id);
    expect((await err(createComponent(s.org.editor, s.project.id, comp(s, { locationId: r2.id })))).status).toBe(409);
  });
});

describe("RF-018 Catálogo personalizável por empreendimento", () => {
  it("só cria componentes de sistemas selecionados no empreendimento", async () => {
    const s = await scenario("Sel");
    expect((await err(createComponent(s.org.editor, s.project.id, comp(s)))).code).toBe("SYSTEM_NOT_SELECTED");
    await withSystem(s);
    await expect(createComponent(s.org.editor, s.project.id, comp(s))).resolves.toBeTruthy();
  });
  it("lista sistemas com selecionado e contagem; seleção repetida é recusada; outro empreendimento não herda", async () => {
    const s = await scenario("Sel2");
    await withSystem(s);
    expect((await err(selectProjectSystem(s.org.admin, s.project.id, { systemId: s.sys.id }))).code).toBe("ALREADY_SELECTED");
    await createComponent(s.org.editor, s.project.id, comp(s));
    const list = await listProjectSystems(s.org.viewer, s.project.id);
    expect(list.find((x) => x.code === "ELE")).toMatchObject({ selected: true, componentCount: 1 });
    const p2 = await createProject(s.org.admin, projectPayload(s.client.id));
    expect((await listProjectSystems(s.org.viewer, p2.id)).find((x) => x.code === "ELE")?.selected).toBe(false);
  });
  it("remover a seleção é bloqueado com componentes ativos e permitido depois de desativá-los; reselecionar reativa", async () => {
    const s = await scenario("Sel3");
    await withSystem(s);
    const c = await createComponent(s.org.editor, s.project.id, comp(s));
    expect((await err(deselectProjectSystem(s.org.editor, s.project.id, s.sys.id))).code).toBe("HAS_COMPONENTS");
    await deactivateComponent(s.org.editor, c.id);
    await deselectProjectSystem(s.org.editor, s.project.id, s.sys.id);
    expect((await listProjectSystems(s.org.viewer, s.project.id)).find((x) => x.code === "ELE")?.selected).toBe(false);
    await expect(selectProjectSystem(s.org.editor, s.project.id, { systemId: s.sys.id })).resolves.toBeTruthy();
  });
  it("só aceita itens do nível sistema e sistemas ativos; o banco também confere", async () => {
    const s = await scenario("Sel4");
    expect((await err(selectProjectSystem(s.org.editor, s.project.id, { systemId: s.type.id }))).status).toBe(409);
    await deactivateCatalogItem(s.org.admin, s.sys.id);
    expect((await err(selectProjectSystem(s.org.editor, s.project.id, { systemId: s.sys.id }))).status).toBe(409);
    const e = await err(db.projectSystem.create({ data: { organizationId: s.org.orgId, projectId: s.project.id, systemId: s.type.id } }));
    expect(e.code).toBe("INTEGRITY");
  });
  it("empreendimento inativo não aceita seleção", async () => {
    const s = await scenario("Sel5");
    await deactivateProject(s.org.admin, s.project.id);
    expect((await err(selectProjectSystem(s.org.editor, s.project.id, { systemId: s.sys.id }))).status).toBe(409);
  });
});

describe("Componentes: ciclo de vida, permissões e isolamento", () => {
  let s: S;
  beforeAll(async () => { s = await scenario("Life"); await withSystem(s); });

  it("desativa sem apagar e reativa; inativo não pode ser editado", async () => {
    const c = await createComponent(s.org.editor, s.project.id, comp(s, { name: "Ciclo" }));
    const off = await deactivateComponent(s.org.editor, c.id);
    expect(off.status).toBe("INACTIVE");
    expect(off.deactivatedAt).toBeTruthy();
    expect((await err(updateComponent(s.org.editor, c.id, { name: "x", locationId: null }))).status).toBe(409);
    expect((await listComponents(s.org.viewer, s.project.id, { status: "ACTIVE" })).items.some((i) => i.id === c.id)).toBe(false);
    expect((await listComponents(s.org.viewer, s.project.id, { status: "INACTIVE" })).items.some((i) => i.id === c.id)).toBe(true);
    expect((await reactivateComponent(s.org.editor, c.id)).status).toBe("ACTIVE");
  });
  it("busca por nome, código público e plaqueta; filtra por sistema e tipo; pagina", async () => {
    const a = await createComponent(s.org.editor, s.project.id, comp(s, { name: "Disjuntor mestre", tag: "DJ-77" }));
    expect((await listComponents(s.org.viewer, s.project.id, { q: "disjuntor" })).items.map((i) => i.id)).toContain(a.id);
    expect((await listComponents(s.org.viewer, s.project.id, { q: a.publicCode })).total).toBe(1);
    expect((await listComponents(s.org.viewer, s.project.id, { q: "DJ-77" })).total).toBe(1);
    expect((await listComponents(s.org.viewer, s.project.id, { systemId: s.sys.id })).total).toBeGreaterThan(0);
    expect((await listComponents(s.org.viewer, s.project.id, { typeId: s.type.id, pageSize: "1" })).items).toHaveLength(1);
    const other = await createCatalogItem(s.org.admin, { kind: "SYSTEM", code: "GAS", name: "Gás" });
    expect((await listComponents(s.org.viewer, s.project.id, { systemId: other.id })).total).toBe(0);
  });
  it("consulta não escreve; organização alheia não enxerga", async () => {
    expect((await err(createComponent(s.org.viewer, s.project.id, comp(s)))).status).toBe(403);
    const c = await createComponent(s.org.editor, s.project.id, comp(s, { name: "Privado" }));
    const other = await makeOrg("Intruso");
    expect((await err(getComponent(other.admin, c.id))).status).toBe(404);
    expect((await err(listComponents(other.admin, s.project.id, {}))).status).toBe(404);
    expect((await err(updateComponent(other.admin, c.id, { name: "x", locationId: null }))).status).toBe(404);
  });
  it("valida campos (nome obrigatório, data válida)", async () => {
    const e = await err(createComponent(s.org.editor, s.project.id, comp(s, { name: "", installedOn: "2024-02-31" })));
    expect(e.status).toBe(422);
    expect(Object.keys((e.details as { fields: object }).fields)).toEqual(expect.arrayContaining(["name", "installedOn"]));
  });
  it("empreendimento inativo bloqueia novos componentes mas mantém a consulta", async () => {
    const t = await scenario("Life2");
    await withSystem(t);
    const c = await createComponent(t.org.editor, t.project.id, comp(t));
    await deactivateProject(t.org.admin, t.project.id);
    expect((await err(createComponent(t.org.editor, t.project.id, comp(t)))).status).toBe(409);
    expect((await getComponent(t.org.viewer, c.id)).id).toBe(c.id);
  });
});

describe("RF-019 Biblioteca normativa", () => {
  let s: S;
  let sectionId: string;
  beforeAll(async () => { s = await scenario("Norm"); });

  it("cadastra norma, edição e seção; apenas uma edição vigente por norma", async () => {
    const n = await createNorm(s.org.editor, { code: "ABNT NBR 5410", title: "Instalações elétricas de baixa tensão", issuer: "ABNT" });
    const e1 = await createEdition(s.org.editor, n.id, { edition: "2004", isCurrent: true });
    const e2 = await createEdition(s.org.editor, n.id, { edition: "2004 Versão corrigida 2008", isCurrent: true });
    const list = await listNorms(s.org.viewer);
    const eds = list.find((x) => x.id === n.id)!.editions;
    expect(eds.filter((e) => e.isCurrent).map((e) => e.id)).toEqual([e2.id]);
    await updateEdition(s.org.editor, e1.id, { edition: "2004", isCurrent: true });
    expect((await listNorms(s.org.viewer)).find((x) => x.id === n.id)!.editions.filter((e) => e.isCurrent)).toHaveLength(1);
    const sec = await createSection(s.org.editor, e2.id, { ref: "6.5", title: "Quadros de distribuição" });
    sectionId = sec.id;
    expect((await searchSections(s.org.viewer, { q: "6.5" })).map((x) => x.id)).toContain(sec.id);
  });
  it("rejeita duplicidades", async () => {
    expect((await err(createNorm(s.org.editor, { code: "ABNT NBR 5410", title: "x" }))).status).toBe(409);
    const n = (await listNorms(s.org.viewer))[0];
    expect((await err(createEdition(s.org.editor, n.id, { edition: n.editions[0].edition }))).status).toBe(409);
    const withSec = n.editions.find((e) => e.sections.length > 0)!;
    expect((await err(createSection(s.org.editor, withSec.id, { ref: withSec.sections[0].ref, title: "x" }))).status).toBe(409);
  });
  it("relaciona seção ao tipo e herda do sistema; componente mostra normas aplicáveis", async () => {
    await withSystem(s);
    const link = await addCatalogNormLink(s.org.editor, s.type.id, { sectionId, notes: "Verificar identificação dos circuitos" });
    await addCatalogNormLink(s.org.editor, s.sys.id, { sectionId });
    expect((await err(addCatalogNormLink(s.org.editor, s.type.id, { sectionId }))).code).toBe("DUPLICATE");
    const direct = await listCatalogNorms(s.org.viewer, s.type.id);
    expect(direct).toHaveLength(2);
    expect(direct.filter((d) => !d.direct)[0].inheritedFrom).toBe("Instalações elétricas");
    const c = await createComponent(s.org.editor, s.project.id, comp(s));
    const got = await getComponent(s.org.viewer, c.id);
    expect(got.norms.map((n) => n.normCode)).toContain("ABNT NBR 5410");
    expect(got.norms.find((n) => n.linkId === link.id)).toMatchObject({ sectionRef: "6.5", edition: "2004 Versão corrigida 2008" });
    await removeCatalogNormLink(s.org.editor, link.id);
    expect(await listCatalogNorms(s.org.viewer, s.type.id)).toHaveLength(1);
  });
  it("seção inativa não pode ser vinculada; vínculo entre organizações é impossível", async () => {
    const n = await createNorm(s.org.editor, { code: "NR-10", title: "Segurança em instalações elétricas" });
    const e = await createEdition(s.org.editor, n.id, { edition: "2019" });
    const sec = await createSection(s.org.editor, e.id, { ref: "10.2", title: "Medidas de controle" });
    await setSectionStatus(s.org.editor, sec.id, "INACTIVE");
    expect((await err(addCatalogNormLink(s.org.editor, s.type.id, { sectionId: sec.id }))).status).toBe(409);
    const other = await makeOrg("NormB");
    const foreign = await createCatalogItem(other.admin, { kind: "SYSTEM", code: "ELE", name: "x" });
    expect((await err(addCatalogNormLink(other.admin, foreign.id, { sectionId }))).status).toBe(404);
    expect((await err(db.catalogItemNormSection.create({ data: { organizationId: other.orgId, catalogItemId: foreign.id, sectionId } }))).code).toBe("INTEGRITY");
  });
  it("consulta apenas lê", async () => {
    expect((await err(createNorm(s.org.viewer, { code: "X", title: "x" }))).status).toBe(403);
    expect((await listNorms(s.org.viewer)).length).toBeGreaterThan(0);
  });
});

describe("RF-020 Critérios de inspeção por tipo de componente", () => {
  let s: S;
  beforeAll(async () => { s = await scenario("Crit"); });

  it("configura critérios de cada tipo de resposta e monta o formulário ordenado", async () => {
    await createCriterion(s.org.editor, s.type.id, { code: "estado", label: "Estado geral", responseType: "PASS_FAIL" });
    await createCriterion(s.org.editor, s.type.id, { code: "TEMP", label: "Temperatura", responseType: "NUMBER", unit: "°C", minValue: "0", maxValue: "70", required: false });
    const k3 = await createCriterion(s.org.editor, s.type.id, { code: "ETIQ", label: "Identificação", responseType: "SINGLE_CHOICE", options: ["Legível", "Parcial", "Ausente"] });
    await createCriterion(s.org.editor, s.type.id, { code: "OBS", label: "Observações", responseType: "TEXT", required: false });
    await createCriterion(s.org.editor, s.type.id, { code: "ATERR", label: "Aterramento conectado?", responseType: "YES_NO" });
    const list = await listCriteria(s.org.viewer, s.type.id);
    expect(list.map((k) => k.code)).toEqual(["ESTADO", "TEMP", "ETIQ", "OBS", "ATERR"]);
    expect(list[1]).toMatchObject({ unit: "°C", minValue: 0, maxValue: 70, required: false });
    await reorderCriterion(s.org.editor, k3.id, { direction: "up" });
    expect((await listCriteria(s.org.viewer, s.type.id)).map((k) => k.code).slice(0, 3)).toEqual(["ESTADO", "ETIQ", "TEMP"]);
    await reorderCriterion(s.org.editor, k3.id, { direction: "up" });
    await reorderCriterion(s.org.editor, k3.id, { direction: "up" }); // já no topo: sem efeito
    expect((await listCriteria(s.org.viewer, s.type.id))[0].code).toBe("ETIQ");
  });
  it("valida regras por tipo de resposta", async () => {
    const f = async (o: Record<string, unknown>) => (await err(createCriterion(s.org.editor, s.type.id, { code: `C${uniq()}`, label: "x", ...o }))).status;
    expect(await f({ responseType: "SINGLE_CHOICE", options: ["A"] })).toBe(422);
    expect(await f({ responseType: "SINGLE_CHOICE", options: ["A", "a"] })).toBe(422);
    expect(await f({ responseType: "TEXT", options: ["A", "B"] })).toBe(422);
    expect(await f({ responseType: "NUMBER", minValue: 10, maxValue: 1 })).toBe(422);
    expect(await f({ responseType: "TEXT", minValue: 1 })).toBe(422);
    expect(await f({ responseType: "NUMBER", minValue: "abc" })).toBe(422);
    expect(await f({ responseType: "XYZ" })).toBe(422);
  });
  it("código único por tipo; só tipos recebem critérios", async () => {
    expect((await err(createCriterion(s.org.editor, s.type.id, { code: "estado", label: "x", responseType: "TEXT" }))).status).toBe(409);
    expect((await err(createCriterion(s.org.editor, s.sys.id, { code: "A", label: "x", responseType: "TEXT" }))).status).toBe(422);
  });
  it("o banco confere os mesmos limites", async () => {
    const e = await err(db.inspectionCriterion.create({ data: { organizationId: s.org.orgId, typeId: s.type.id, code: "DBX", label: "x", responseType: "NUMBER", minValue: 5, maxValue: 1 } }));
    expect(e.status).toBe(422);
    const e2 = await err(db.inspectionCriterion.create({ data: { organizationId: s.org.orgId, typeId: s.sys.id, code: "DBY", label: "x", responseType: "TEXT" } }));
    expect(e2.code).toBe("INTEGRITY");
  });
  it("critério desativado sai do formulário do componente, mas segue listado", async () => {
    await withSystem(s);
    const c = await createComponent(s.org.editor, s.project.id, comp(s));
    const before = (await getComponent(s.org.viewer, c.id)).form.length;
    const k = (await listCriteria(s.org.viewer, s.type.id)).find((x) => x.code === "OBS")!;
    await setCriterionStatus(s.org.editor, k.id, "INACTIVE");
    expect((await getComponent(s.org.viewer, c.id)).form).toHaveLength(before - 1);
    expect((await listCriteria(s.org.viewer, s.type.id)).some((x) => x.id === k.id && x.status === "INACTIVE")).toBe(true);
    await updateCriterion(s.org.editor, k.id, { code: "OBS", label: "Observações gerais", responseType: "TEXT", required: false });
    await setCriterionStatus(s.org.editor, k.id, "ACTIVE");
  });
  it("perfil de consulta não configura critérios", async () => {
    expect((await err(createCriterion(s.org.viewer, s.type.id, { code: "Z", label: "x", responseType: "TEXT" }))).status).toBe(403);
  });
});

describe("RF-021 Modelos de manifestações e classificações técnicas", () => {
  let org: TestOrg;
  beforeAll(async () => { org = await makeOrg("Man"); });

  it("mantém bibliotecas distintas de manifestações e de classificações", async () => {
    const grav = await createClassification(org.editor, { code: "GRAV-ALTA", name: "Alta", kind: "SEVERITY" });
    const orig = await createClassification(org.editor, { code: "ORIG-EXEC", name: "Falha de execução", kind: "ORIGIN" });
    const m = await createManifestation(org.editor, { code: "FISS", name: "Fissura", typicalCauses: "Retração, recalque", classificationIds: [grav.id, orig.id] });
    expect(m.classifications.map((c) => c.code).sort()).toEqual(["GRAV-ALTA", "ORIG-EXEC"]);
    expect((await listClassifications(org.viewer, { kind: "SEVERITY" })).map((c) => c.code)).toEqual(["GRAV-ALTA"]);
    expect((await listManifestations(org.viewer)).map((x) => x.code)).toEqual(["FISS"]);
    // são entidades diferentes: mesmo código pode existir em ambas
    await expect(createClassification(org.editor, { code: "FISS", name: "Classe homônima", kind: "OTHER" })).resolves.toBeTruthy();
  });
  it("edita vínculos, rejeita duplicidade e referências inválidas", async () => {
    const [m] = await listManifestations(org.viewer);
    const u = await updateManifestation(org.editor, m.id, { code: "FISS", name: "Fissura", classificationIds: [] });
    expect(u.classifications).toHaveLength(0);
    expect((await err(createManifestation(org.editor, { code: "fiss", name: "x" }))).status).toBe(409);
    expect((await err(createManifestation(org.editor, { code: "NOVA", name: "x", classificationIds: ["00000000-0000-4000-8000-000000000000"] }))).status).toBe(409);
    expect((await err(createClassification(org.editor, { code: "X", name: "x", kind: "FOO" }))).status).toBe(422);
  });
  it("desativa e reativa preservando o registro; consulta não escreve; outra organização não vê", async () => {
    const [m] = await listManifestations(org.viewer);
    expect((await setManifestationStatus(org.editor, m.id, "INACTIVE")).status).toBe("INACTIVE");
    expect((await listManifestations(org.viewer, { status: "ACTIVE" }))).toHaveLength(0);
    expect((await listManifestations(org.viewer)).length).toBe(1);
    await setManifestationStatus(org.editor, m.id, "ACTIVE");
    expect((await err(createManifestation(org.viewer, { code: "VIEW", name: "x" }))).status).toBe(403);
    const other = await makeOrg("ManB");
    expect(await listManifestations(other.admin)).toHaveLength(0);
    expect((await err(updateManifestation(other.admin, m.id, { code: "FISS", name: "x" }))).status).toBe(404);
  });
});

describe("RF-022 Histórico do componente (parcial: alterações de cadastro)", () => {
  it("reúne criação, edição e mudança de situação do componente, com autor", async () => {
    const s = await scenario("Hist");
    await withSystem(s);
    const c = await createComponent(s.org.editor, s.project.id, comp(s, { name: "Antes" }));
    await updateComponent(s.org.editor, c.id, { name: "Depois", locationId: s.room.id });
    await deactivateComponent(s.org.editor, c.id);
    await reactivateComponent(s.org.editor, c.id);
    const h = await componentHistory(s.org.viewer, c.id);
    expect(h.items.map((i) => i.action).reverse()).toEqual(["CREATE", "UPDATE", "DEACTIVATE", "REACTIVATE"]);
    expect(JSON.stringify(h.items.find((i) => i.action === "UPDATE")?.changes)).toContain("Depois");
    expect(h.items[0].user).toContain("EDITOR");
    expect(h.sources).toEqual({ cadastro: true, inspecoes: false, ocorrencias: false });
  });
  it("não vaza histórico entre organizações", async () => {
    const s = await scenario("Hist2");
    await withSystem(s);
    const c = await createComponent(s.org.editor, s.project.id, comp(s));
    const other = await makeOrg("HistB");
    expect((await err(componentHistory(other.admin, c.id))).status).toBe(404);
  });
});

describe("Persistência real e trilha de auditoria", () => {
  it("os dados ficam gravados no PostgreSQL e as alterações são auditadas sem sobrescrever", async () => {
    const s = await scenario("Pers");
    await withSystem(s);
    const c = await createComponent(s.org.editor, s.project.id, comp(s));
    const row = await db.component.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.publicCode).toBe(c.publicCode);
    expect(await db.auditLog.count({ where: { entityType: "component", entityId: c.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { organizationId: s.org.orgId, entityType: "catalog_item" } })).toBe(3);
    expect((await err(db.auditLog.deleteMany({ where: { entityId: c.id } }))).code).toBe("INTEGRITY");
  });
});
