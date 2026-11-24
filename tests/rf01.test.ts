import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { toAppError } from "@/server/errors";
import { currentYear } from "@/lib/dates";
import {
  createClient,
  deactivateClient,
  getClient,
  listClients,
  reactivateClient,
  updateClient,
} from "@/server/services/clients";
import {
  createProject,
  deactivateProject,
  getProject,
  getProjectOverview,
  listProjects,
  reactivateProject,
  updateCharacteristics,
  updateProject,
} from "@/server/services/projects";
import {
  createBuilding,
  deactivateBuilding,
  deleteBuilding,
  listBuildings,
  reactivateBuilding,
  reorderBuilding,
  updateBuilding,
} from "@/server/services/buildings";
import {
  createLocation,
  deactivateLocation,
  deleteLocation,
  getLocation,
  getTree,
  listUnits,
  moveLocation,
  reactivateLocation,
  reorderLocation,
  searchLocations,
  updateLocation,
} from "@/server/services/locations";
import {
  createAssignment,
  createResponsible,
  endAssignment,
  listAssignments,
  listResponsibles,
  setResponsibleStatus,
  updateAssignment,
} from "@/server/services/responsibles";
import {
  addAttachment,
  createHistory,
  deleteAttachment,
  getAttachmentFile,
  listAudit,
  listHistory,
  restoreHistory,
  updateHistory,
  voidHistory,
} from "@/server/services/history";
import {
  buildingPayload,
  clientPayload,
  err,
  floorPayload,
  genCPF,
  makeOrg,
  projectPayload,
  resetData,
  roomPayload,
  type TestOrg,
} from "./helpers";

let A: TestOrg;
let B: TestOrg;

beforeAll(async () => {
  await resetData();
});

beforeEach(async () => {
  await resetData();
  A = await makeOrg("Alfa");
  B = await makeOrg("Beta");
});

/** Cria cliente + empreendimento na organização A. */
async function seedProject(org = A, o: Record<string, unknown> = {}) {
  const client = await createClient(org.admin, clientPayload());
  const project = await createProject(org.admin, projectPayload(client.id, o));
  return { client, project };
}

// ═══════════════════════════ RF-001 Clientes ═══════════════════════════

describe("RF-001 – Clientes", () => {
  it("cadastra, consulta e edita um cliente", async () => {
    const c = await createClient(A.admin, clientPayload({ email: "contato@atenas.test", phone: "(11) 91234-5678", state: "sp", zipCode: "01310-100" }));
    expect(c.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.phone).toBe("11912345678");
    expect(c.state).toBe("SP");
    expect(c.zipCode).toBe("01310100");
    expect(c.status).toBe("ACTIVE");

    const up = await updateClient(A.admin, c.id, clientPayload({ name: "Atenas S/A", document: c.document }));
    expect(up.name).toBe("Atenas S/A");
    expect((await getClient(A.admin, c.id)).name).toBe("Atenas S/A");
  });

  it("valida CPF/CNPJ conforme o tipo de pessoa", async () => {
    const e1 = await err(createClient(A.admin, { personType: "INDIVIDUAL", name: "Fulano", document: "111.111.111-11" }));
    expect(e1.status).toBe(422);
    expect((e1.details as { fields: Record<string, string> }).fields.document).toBe("CPF inválido.");

    const e2 = await err(createClient(A.admin, { personType: "LEGAL_ENTITY", name: "Empresa", document: "11.222.333/0001-82" }));
    expect((e2.details as { fields: Record<string, string> }).fields.document).toBe("CNPJ inválido.");

    const ok = await createClient(A.admin, { personType: "INDIVIDUAL", name: "Fulano", document: "529.982.247-25" });
    expect(ok.document).toBe("52998224725");
  });

  it("aceita cliente sem documento (campo opcional)", async () => {
    await createClient(A.admin, { personType: "INDIVIDUAL", name: "Sem documento 1" });
    await createClient(A.admin, { personType: "INDIVIDUAL", name: "Sem documento 2" });
    expect((await listClients(A.admin, {})).total).toBe(2);
  });

  it("impede CPF/CNPJ duplicado na mesma organização, mesmo com máscara diferente", async () => {
    await createClient(A.admin, { personType: "INDIVIDUAL", name: "Fulano", document: "529.982.247-25" });
    const e = await err(createClient(A.admin, { personType: "INDIVIDUAL", name: "Outro Fulano", document: "52998224725" }));
    expect(e.status).toBe(409);
    expect(e.code).toBe("DUPLICATE_DOCUMENT");
  });

  it("permite o mesmo documento em organizações diferentes", async () => {
    await createClient(A.admin, { personType: "INDIVIDUAL", name: "Fulano", document: "52998224725" });
    const other = await createClient(B.admin, { personType: "INDIVIDUAL", name: "Fulano", document: "52998224725" });
    expect(other.id).toBeTruthy();
  });

  it("pessoa física não guarda nome fantasia nem contato (campos condicionais)", async () => {
    const c = await createClient(A.admin, { personType: "INDIVIDUAL", name: "Fulano", tradeName: "Fantasia", contactName: "Alguém" });
    expect(c.tradeName).toBeNull();
    expect(c.contactName).toBeNull();
    const pj = await createClient(A.admin, clientPayload({ tradeName: "Atenas", contactName: "Ana" }));
    expect(pj.tradeName).toBe("Atenas");
    expect(pj.contactName).toBe("Ana");
  });

  it("um cliente pode ter vários empreendimentos", async () => {
    const c = await createClient(A.admin, clientPayload());
    await createProject(A.admin, projectPayload(c.id, { code: "P1" }));
    await createProject(A.admin, projectPayload(c.id, { code: "P2" }));
    await createProject(A.admin, projectPayload(c.id, { code: "P3" }));
    const full = await getClient(A.admin, c.id);
    expect(full.projects).toHaveLength(3);
    expect((await listClients(A.admin, {})).items[0].projectCount).toBe(3);
  });

  it("desativar o cliente preserva empreendimentos e histórico", async () => {
    const { client, project } = await seedProject();
    await createHistory(A.admin, project.id, { category: "CONSTRUCTION", title: "Obra", occurredOn: "2010-01-01" });
    const off = await deactivateClient(A.admin, client.id);
    expect(off.status).toBe("INACTIVE");
    expect((await getClient(A.admin, client.id)).projects).toHaveLength(1);
    expect(await listHistory(A.admin, project.id, {})).toHaveLength(1);
    expect((await getProject(A.admin, project.id)).status).toBe("ACTIVE");
    expect((await reactivateClient(A.admin, client.id)).status).toBe("ACTIVE");
  });

  it("filtra por situação, tipo de pessoa e texto", async () => {
    const a = await createClient(A.admin, clientPayload({ name: "Zeta Engenharia" }));
    await createClient(A.admin, { personType: "INDIVIDUAL", name: "Maria Silva", document: genCPF() });
    await deactivateClient(A.admin, a.id);
    expect((await listClients(A.admin, { status: "ACTIVE" })).total).toBe(1);
    expect((await listClients(A.admin, { status: "INACTIVE" })).total).toBe(1);
    expect((await listClients(A.admin, { status: "ALL" })).total).toBe(2);
    expect((await listClients(A.admin, { personType: "INDIVIDUAL" })).items[0].name).toBe("Maria Silva");
    expect((await listClients(A.admin, { q: "zeta" })).total).toBe(1);
    expect((await listClients(A.admin, { q: "silva" })).total).toBe(1);
  });
});

// ═══════════════════════════ RF-002 / RF-003 Empreendimentos ═══════════════════════════

describe("RF-002 – Empreendimentos", () => {
  it("cadastra um empreendimento vinculado ao cliente", async () => {
    const { client, project } = await seedProject(A, { code: "atenas-01", latitude: -23.55, longitude: -46.63, zipCode: "01450-000" });
    expect(project.code).toBe("ATENAS-01");
    expect(project.client.id).toBe(client.id);
    expect(project.latitude).toBe(-23.55);
    expect(project.zipCode).toBe("01450000");
  });

  it("exige latitude e longitude juntas", async () => {
    const c = await createClient(A.admin, clientPayload());
    const e = await err(createProject(A.admin, projectPayload(c.id, { latitude: -23.5 })));
    expect(e.status).toBe(422);
  });

  it("código é único dentro da organização, mas pode repetir em outra", async () => {
    const c = await createClient(A.admin, clientPayload());
    await createProject(A.admin, projectPayload(c.id, { code: "ATENAS" }));
    const dup = await err(createProject(A.admin, projectPayload(c.id, { code: "atenas" })));
    expect(dup.code).toBe("DUPLICATE_CODE");

    const cb = await createClient(B.admin, clientPayload());
    expect((await createProject(B.admin, projectPayload(cb.id, { code: "ATENAS" }))).code).toBe("ATENAS");
  });

  it("não permite vincular a cliente de outra organização", async () => {
    const cb = await createClient(B.admin, clientPayload());
    const e = await err(createProject(A.admin, projectPayload(cb.id)));
    expect(e.status).toBe(404);
  });

  it("não permite criar empreendimento para cliente inativo", async () => {
    const c = await createClient(A.admin, clientPayload());
    await deactivateClient(A.admin, c.id);
    const e = await err(createProject(A.admin, projectPayload(c.id)));
    expect(e.code).toBe("CLIENT_INACTIVE");
  });

  it("edita e troca o código respeitando a unicidade", async () => {
    const { client, project } = await seedProject(A, { code: "A1" });
    const other = await createProject(A.admin, projectPayload(client.id, { code: "A2" }));
    const e = await err(updateProject(A.admin, other.id, projectPayload(client.id, { code: "A1" })));
    expect(e.code).toBe("DUPLICATE_CODE");
    const ok = await updateProject(A.admin, project.id, projectPayload(client.id, { code: "A1", name: "Novo nome" }));
    expect(ok.name).toBe("Novo nome");
  });

  it("desativar preserva edificações, localizações e histórico", async () => {
    const { project } = await seedProject();
    const b = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    await createLocation(A.admin, project.id, floorPayload(b.id, "T"));
    await createHistory(A.admin, project.id, { category: "CONSTRUCTION", title: "Obra", occurredOn: "2010-01-01" });

    const off = await deactivateProject(A.admin, project.id);
    expect(off.status).toBe("INACTIVE");
    expect(await db.building.count({ where: { projectId: project.id } })).toBe(1);
    expect(await db.location.count({ where: { projectId: project.id } })).toBe(1);
    expect(await db.projectHistory.count({ where: { projectId: project.id } })).toBe(1);

    const e = await err(createBuilding(A.admin, project.id, buildingPayload("B02")));
    expect(e.code).toBe("INACTIVE");
    expect((await reactivateProject(A.admin, project.id)).status).toBe("ACTIVE");
  });

  it("lista com filtros por cliente, tipo, situação e texto", async () => {
    const c1 = await createClient(A.admin, clientPayload());
    const c2 = await createClient(A.admin, clientPayload());
    await createProject(A.admin, projectPayload(c1.id, { code: "AAA", name: "Edifício Alfa", projectType: "COMMERCIAL" }));
    const p2 = await createProject(A.admin, projectPayload(c2.id, { code: "BBB", name: "Hospital Beta", projectType: "HOSPITAL" }));
    await deactivateProject(A.admin, p2.id);
    expect((await listProjects(A.admin, { clientId: c1.id })).total).toBe(1);
    expect((await listProjects(A.admin, { projectType: "HOSPITAL" })).total).toBe(1);
    expect((await listProjects(A.admin, { status: "INACTIVE" })).items[0].code).toBe("BBB");
    expect((await listProjects(A.admin, { q: "bbb" })).total).toBe(1);
    expect((await listProjects(A.admin, { q: "alfa" })).total).toBe(1);
    expect((await listProjects(A.admin, { status: "ALL" })).total).toBe(2);
  });
});

describe("RF-003 – Caracterização técnica", () => {
  it("calcula a idade pelo ano de construção e aceita idade estimada", async () => {
    const { project } = await seedProject();
    const year = currentYear();

    let p = await updateCharacteristics(A.admin, project.id, { constructionYear: year - 20, estimatedAgeYears: 5, landAreaM2: "1.250,5".replace(".", "").replace(",", ".") });
    expect(p.characteristics?.ageYears).toBe(20);
    expect(p.characteristics?.ageSource).toBe("calculated");

    p = await updateCharacteristics(A.admin, project.id, { estimatedAgeYears: 35 });
    expect(p.characteristics?.ageYears).toBe(35);
    expect(p.characteristics?.ageSource).toBe("estimated");

    p = await updateCharacteristics(A.admin, project.id, {});
    expect(p.characteristics?.ageYears).toBeNull();
  });

  it("campos desconhecidos permanecem não informados e valores inválidos são recusados", async () => {
    const { project } = await seedProject();
    const p = await updateCharacteristics(A.admin, project.id, {});
    expect(p.characteristics?.builtAreaM2).toBeNull();
    const e = await err(updateCharacteristics(A.admin, project.id, { builtAreaM2: -5 }));
    expect(e.status).toBe(422);
    const e2 = await err(updateCharacteristics(A.admin, project.id, { constructionYear: currentYear() + 3 }));
    expect(e2.status).toBe(422);
  });

  it("número de blocos, pavimentos e unidades é calculado dos cadastros (não digitado)", async () => {
    const { project } = await seedProject();
    const b1 = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    const b2 = await createBuilding(A.admin, project.id, buildingPayload("B02"));
    const f1 = await createLocation(A.admin, project.id, floorPayload(b1.id, "T"));
    await createLocation(A.admin, project.id, floorPayload(b1.id, "P1"));
    await createLocation(A.admin, project.id, floorPayload(b2.id, "T"));
    await createLocation(A.admin, project.id, roomPayload(f1.id, "HALL"));
    await createLocation(A.admin, project.id, { parentLocationId: f1.id, code: "AP1", name: "Ap 1", locationType: "UNIT", unit: { unitType: "RESIDENTIAL" } });

    const ov = await getProjectOverview(A.admin, project.id);
    expect(ov.indicators.buildings.active).toBe(2);
    expect(ov.indicators.floors.active).toBe(3);
    expect(ov.indicators.environments.active).toBe(1);
    expect(ov.indicators.units.active).toBe(1);

    await deactivateBuilding(A.admin, b2.id);
    const ov2 = await getProjectOverview(A.admin, project.id);
    expect(ov2.indicators.buildings).toEqual({ active: 1, inactive: 1 });
    expect(ov2.indicators.floors).toEqual({ active: 2, inactive: 1 });
  });
});

// ═══════════════════════════ RF-004 Edificações ═══════════════════════════

describe("RF-004 – Edificações e blocos", () => {
  it("permite vários blocos, edificação isolada e estruturas auxiliares", async () => {
    const { project } = await seedProject();
    await createBuilding(A.admin, project.id, buildingPayload("B01"));
    await createBuilding(A.admin, project.id, buildingPayload("B02"));
    await createBuilding(A.admin, project.id, buildingPayload("ISO", { buildingType: "STANDALONE" }));
    await createBuilding(A.admin, project.id, buildingPayload("PORT", { buildingType: "AUXILIARY", name: "Portaria" }));
    await createBuilding(A.admin, project.id, buildingPayload("GAR", { buildingType: "PARKING", name: "Edifício-garagem" }));
    const list = await listBuildings(A.admin, project.id);
    expect(list.map((b) => b.code)).toEqual(["B01", "B02", "ISO", "PORT", "GAR"]);
  });

  it("código é único dentro do empreendimento e livre entre empreendimentos", async () => {
    const { client, project } = await seedProject();
    await createBuilding(A.admin, project.id, buildingPayload("B01"));
    const dup = await err(createBuilding(A.admin, project.id, buildingPayload("b01")));
    expect(dup.code).toBe("DUPLICATE_CODE");
    const p2 = await createProject(A.admin, projectPayload(client.id));
    expect((await createBuilding(A.admin, p2.id, buildingPayload("B01"))).code).toBe("B01");
  });

  it("impede exclusão física com registros relacionados e permite se estiver vazio", async () => {
    const { project } = await seedProject();
    const b = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    await createLocation(A.admin, project.id, floorPayload(b.id, "T"));
    const e = await err(deleteBuilding(A.admin, b.id));
    expect(e.code).toBe("HAS_RELATED_RECORDS");

    const empty = await createBuilding(A.admin, project.id, buildingPayload("B02"));
    expect((await deleteBuilding(A.admin, empty.id)).ok).toBe(true);
    expect(await db.building.count({ where: { id: empty.id } })).toBe(0);
  });

  it("desativar preserva as localizações (apenas muda a situação) e reativar as restaura", async () => {
    const { project } = await seedProject();
    const b = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    const f = await createLocation(A.admin, project.id, floorPayload(b.id, "T"));
    await createLocation(A.admin, project.id, roomPayload(f.id, "HALL"));

    const off = await deactivateBuilding(A.admin, b.id);
    expect(off.locationsDeactivated).toBe(2);
    expect(await db.location.count({ where: { buildingId: b.id } })).toBe(2);
    expect(await db.location.count({ where: { buildingId: b.id, status: "INACTIVE" } })).toBe(2);

    const on = await reactivateBuilding(A.admin, b.id, { includeDescendants: true });
    expect(on.locationsReactivated).toBe(2);
    expect(await db.location.count({ where: { buildingId: b.id, status: "ACTIVE" } })).toBe(2);
  });

  it("não cria localizações em edificação inativa e reordena blocos", async () => {
    const { project } = await seedProject();
    const b1 = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    const b2 = await createBuilding(A.admin, project.id, buildingPayload("B02"));
    await reorderBuilding(A.admin, b2.id, { direction: "up" });
    expect((await listBuildings(A.admin, project.id)).map((b) => b.code)).toEqual(["B02", "B01"]);

    await deactivateBuilding(A.admin, b1.id);
    const e = await err(createLocation(A.admin, project.id, floorPayload(b1.id, "T")));
    expect(e.code).toBe("BUILDING_INACTIVE");
  });

  it("atualiza dados e mantém a unicidade do código", async () => {
    const { project } = await seedProject();
    const b1 = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    await createBuilding(A.admin, project.id, buildingPayload("B02"));
    const e = await err(updateBuilding(A.admin, b1.id, buildingPayload("B02")));
    expect(e.code).toBe("DUPLICATE_CODE");
    const ok = await updateBuilding(A.admin, b1.id, buildingPayload("B01", { name: "Torre Norte", builtAreaM2: 5200, constructionYear: 2005 }));
    expect(ok.name).toBe("Torre Norte");
    expect(ok.builtAreaM2).toBe(5200);
  });
});

// ═══════════════════ RF-005 a RF-008 Estrutura física (árvore) ═══════════════════

describe("RF-005 – Pavimentos", () => {
  it("cadastra pavimentos diferentes por bloco, com subsolos e nomes personalizados", async () => {
    const { project } = await seedProject();
    const b1 = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    const b2 = await createBuilding(A.admin, project.id, buildingPayload("B02"));
    await createLocation(A.admin, project.id, floorPayload(b1.id, "SS2", { name: "Subsolo 02", floorKind: "BASEMENT", floorOrder: -2, elevationM: -6.5 }));
    await createLocation(A.admin, project.id, floorPayload(b1.id, "T", { name: "Térreo", floorKind: "GROUND", floorOrder: 0 }));
    await createLocation(A.admin, project.id, floorPayload(b1.id, "TECH", { name: "Casa dos elevadores (nome livre)", floorKind: "TECHNICAL", floorOrder: 20 }));
    await createLocation(A.admin, project.id, floorPayload(b2.id, "T", { name: "Térreo", floorKind: "GROUND", floorOrder: 0 }));

    const tree = await getTree(A.admin, project.id);
    expect(tree.locations.filter((l) => l.buildingId === b1.id)).toHaveLength(3);
    expect(tree.locations.filter((l) => l.buildingId === b2.id)).toHaveLength(1);
    expect(tree.locations.find((l) => l.code === "SS2")?.elevationM).toBe(-6.5);
  });

  it("pavimento exige edificação e é o primeiro nível dela", async () => {
    const { project } = await seedProject();
    const b = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    const f = await createLocation(A.admin, project.id, floorPayload(b.id, "T"));
    const e1 = await err(createLocation(A.admin, project.id, { code: "X", name: "Sem bloco", locationType: "FLOOR" }));
    expect(e1.status).toBe(422);
    const e2 = await err(createLocation(A.admin, project.id, { ...floorPayload(b.id, "Y"), parentLocationId: f.id }));
    expect(e2.status).toBe(422);
  });
});

describe("RF-006 / RF-007 – Ambientes e áreas comuns (mesma tabela hierárquica)", () => {
  it("cadastra ambientes em pavimentos e ambientes dentro de ambientes, herdando o bloco", async () => {
    const { project } = await seedProject();
    const b = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    const f = await createLocation(A.admin, project.id, floorPayload(b.id, "SS1", { floorKind: "BASEMENT", floorOrder: -1 }));
    const gar = await createLocation(A.admin, project.id, roomPayload(f.id, "GAR", { name: "Garagem", areaClass: "COMMON", areaM2: 900 }));
    const vaga = await createLocation(A.admin, project.id, roomPayload(gar.id, "VAGAS", { name: "Vagas cobertas" }));
    expect(gar.buildingId).toBe(b.id);
    expect(vaga.buildingId).toBe(b.id);
    expect(vaga.parentLocationId).toBe(gar.id);

    const detail = await getLocation(A.admin, vaga.id);
    expect(detail.path.map((p) => p.code)).toEqual(["SS1", "GAR"]);
    expect(detail.building?.code).toBe("B01");
  });

  it("áreas externas e técnicas podem existir sem bloco, diretamente no empreendimento", async () => {
    const { project } = await seedProject();
    const piscina = await createLocation(A.admin, project.id, { code: "PISCINA", name: "Piscina", locationType: "EXTERNAL_AREA", areaClass: "COMMON" });
    const jardim = await createLocation(A.admin, project.id, roomPayload(null, "JARDINS", { name: "Jardins", locationType: "EXTERNAL_AREA", areaClass: "COMMON" }));
    expect(piscina.buildingId).toBeNull();
    expect(jardim.buildingId).toBeNull();
    // sub-localização de área externa herda a ausência de bloco
    const deck = await createLocation(A.admin, project.id, roomPayload(piscina.id, "DECK", { name: "Deck" }));
    expect(deck.buildingId).toBeNull();
  });

  it("classificação comum/privativa é atributo independente do tipo físico", async () => {
    const { project } = await seedProject();
    const a = await createLocation(A.admin, project.id, { code: "SALA", name: "Sala técnica", locationType: "TECHNICAL_AREA", areaClass: "COMMON" });
    const b = await createLocation(A.admin, project.id, { code: "DEP", name: "Depósito", locationType: "ROOM", areaClass: "PRIVATE" });
    expect(a.areaClass).toBe("COMMON");
    expect(b.areaClass).toBe("PRIVATE");
    expect(await searchLocations(A.admin, project.id, { areaClass: "COMMON" })).toHaveLength(1);
  });

  it("código é único por edificação (e entre áreas sem edificação), mas pode repetir em blocos diferentes", async () => {
    const { project } = await seedProject();
    const b1 = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    const b2 = await createBuilding(A.admin, project.id, buildingPayload("B02"));
    await createLocation(A.admin, project.id, floorPayload(b1.id, "T"));
    const dup = await err(createLocation(A.admin, project.id, floorPayload(b1.id, "t")));
    expect(dup.code).toBe("DUPLICATE_CODE");
    expect((await createLocation(A.admin, project.id, floorPayload(b2.id, "T"))).code).toBe("T");

    await createLocation(A.admin, project.id, { code: "PLAY", name: "Playground", locationType: "EXTERNAL_AREA" });
    const dup2 = await err(createLocation(A.admin, project.id, { code: "PLAY", name: "Outro", locationType: "EXTERNAL_AREA" }));
    expect(dup2.code).toBe("DUPLICATE_CODE");
    // mesmo código dentro de um bloco é permitido: escopos diferentes
    expect((await createLocation(A.admin, project.id, floorPayload(b1.id, "PLAY"))).code).toBe("PLAY");
  });

  it("rejeita pai ou bloco de outro empreendimento", async () => {
    const { client, project } = await seedProject();
    const p2 = await createProject(A.admin, projectPayload(client.id));
    const b2 = await createBuilding(A.admin, p2.id, buildingPayload("X"));
    const f2 = await createLocation(A.admin, p2.id, floorPayload(b2.id, "T"));

    const e1 = await err(createLocation(A.admin, project.id, roomPayload(f2.id, "R")));
    expect(e1.status).toBe(422);
    const e2 = await err(createLocation(A.admin, project.id, floorPayload(b2.id, "T")));
    expect(e2.status).toBe(422);
  });

  it("exige que o pai esteja ativo", async () => {
    const { project } = await seedProject();
    const b = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    const f = await createLocation(A.admin, project.id, floorPayload(b.id, "T"));
    const r = await createLocation(A.admin, project.id, roomPayload(f.id, "R"));
    await deactivateLocation(A.admin, r.id);
    const e = await err(createLocation(A.admin, project.id, roomPayload(r.id, "R2")));
    expect(e.code).toBe("PARENT_INACTIVE");
  });

  it("pesquisa por código ou nome e filtra por tipo/situação", async () => {
    const { project } = await seedProject();
    const b = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    const f = await createLocation(A.admin, project.id, floorPayload(b.id, "T"));
    await createLocation(A.admin, project.id, roomPayload(f.id, "BARR", { name: "Barrilete" }));
    const cm = await createLocation(A.admin, project.id, roomPayload(f.id, "CM", { name: "Casa de máquinas" }));
    await deactivateLocation(A.admin, cm.id);

    expect((await searchLocations(A.admin, project.id, { q: "barri" }))[0].code).toBe("BARR");
    expect((await searchLocations(A.admin, project.id, { q: "CM" }))).toHaveLength(1);
    expect(await searchLocations(A.admin, project.id, { type: "FLOOR" })).toHaveLength(1);
    expect(await searchLocations(A.admin, project.id, { status: "ACTIVE" })).toHaveLength(2);
    expect(await searchLocations(A.admin, project.id, { status: "INACTIVE" })).toHaveLength(1);
  });
});

describe("Hierarquia – mover, ordenar, desativar e excluir", () => {
  async function build() {
    const { project } = await seedProject();
    const b1 = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    const b2 = await createBuilding(A.admin, project.id, buildingPayload("B02"));
    const f1 = await createLocation(A.admin, project.id, floorPayload(b1.id, "T"));
    const f2 = await createLocation(A.admin, project.id, floorPayload(b2.id, "T"));
    const r1 = await createLocation(A.admin, project.id, roomPayload(f1.id, "R1"));
    const r2 = await createLocation(A.admin, project.id, roomPayload(r1.id, "R2"));
    const r3 = await createLocation(A.admin, project.id, roomPayload(r2.id, "R3"));
    return { project, b1, b2, f1, f2, r1, r2, r3 };
  }

  it("impede estruturas circulares (mover para si mesmo ou para um descendente)", async () => {
    const { r1, r2, r3 } = await build();
    const e1 = await err(moveLocation(A.admin, r1.id, { parentLocationId: r3.id }));
    expect(e1.code).toBe("CYCLE");
    const e2 = await err(moveLocation(A.admin, r1.id, { parentLocationId: r1.id }));
    expect(e2.code).toBe("CYCLE");
    const e3 = await err(moveLocation(A.admin, r2.id, { parentLocationId: r3.id }));
    expect(e3.code).toBe("CYCLE");
  });

  it("move uma subárvore para outro pavimento/bloco atualizando o bloco de todos os descendentes", async () => {
    const { b2, f2, r1, r2, r3 } = await build();
    const moved = await moveLocation(A.admin, r1.id, { parentLocationId: f2.id });
    expect(moved.buildingId).toBe(b2.id);
    for (const id of [r2.id, r3.id]) {
      const l = await db.location.findUniqueOrThrow({ where: { id } });
      expect(l.buildingId).toBe(b2.id);
    }
    // relacionamentos preservados: R3 continua filho de R2, e R2 de R1
    expect((await db.location.findUniqueOrThrow({ where: { id: r3.id } })).parentLocationId).toBe(r2.id);
    expect((await db.location.findUniqueOrThrow({ where: { id: r2.id } })).parentLocationId).toBe(r1.id);
  });

  it("detecta conflito de código ao mover para outro bloco", async () => {
    const { project, f2, r1 } = await build();
    await createLocation(A.admin, project.id, roomPayload(f2.id, "R1"));
    const e = await err(moveLocation(A.admin, r1.id, { parentLocationId: f2.id }));
    expect(e.code).toBe("DUPLICATE_CODE");
  });

  it("mover um pavimento para dentro de um de seus próprios descendentes é ciclo", async () => {
    const { f1, r1 } = await build();
    const e = await err(moveLocation(A.admin, f1.id, { parentLocationId: r1.id }));
    expect(e.code).toBe("CYCLE");
  });

  it("pavimento só vai para a raiz de uma edificação (e o código é validado no destino)", async () => {
    const { project, b2, f1, f2 } = await build();
    // destino que NÃO é descendente: um ambiente do outro bloco → recusado pela regra de forma do pavimento
    const alheio = await createLocation(A.admin, project.id, roomPayload(f2.id, "RX"));
    const e = await err(moveLocation(A.admin, f1.id, { parentLocationId: alheio.id }));
    expect(e.status).toBe(422);
    // raiz de outra edificação: o código "T" já existe lá (f2) → conflito de código
    const dup = await err(moveLocation(A.admin, f1.id, { parentLocationId: null, buildingId: b2.id }));
    expect(dup.code).toBe("DUPLICATE_CODE");
    // renomeando o código, a mudança de bloco funciona e leva a subárvore junto
    await updateLocation(A.admin, f1.id, { code: "T-ANTIGO" });
    const ok = await moveLocation(A.admin, f1.id, { parentLocationId: null, buildingId: b2.id });
    expect(ok.buildingId).toBe(b2.id);
    const inB2 = await db.location.findMany({ where: { buildingId: b2.id } });
    expect(inB2.map((l) => l.code).sort()).toEqual(["R1", "R2", "R3", "RX", "T", "T-ANTIGO"]);
  });

  it("reordena irmãos (exceto pavimentos, ordenados por 'ordem do pavimento')", async () => {
    const { project, f1, r1 } = await build();
    const a = await createLocation(A.admin, project.id, roomPayload(f1.id, "RA"));
    await reorderLocation(A.admin, a.id, { direction: "up" });
    const sibs = (await getTree(A.admin, project.id)).locations.filter((l) => l.parentLocationId === f1.id).map((l) => l.code);
    expect(sibs).toEqual(["RA", "R1"]);
    const e = await err(reorderLocation(A.admin, f1.id, { direction: "up" }));
    expect(e.status).toBe(422);
    void r1;
  });

  it("desativa elemento e descendentes sem excluir; reativa com ou sem descendentes", async () => {
    const { r1, r2, r3 } = await build();
    const off = await deactivateLocation(A.admin, r1.id);
    expect(off.affected).toBe(3);
    expect(await db.location.count({ where: { id: { in: [r1.id, r2.id, r3.id] }, status: "INACTIVE" } })).toBe(3);

    const e = await err(reactivateLocation(A.admin, r2.id));
    expect(e.code).toBe("PARENT_INACTIVE");

    const on = await reactivateLocation(A.admin, r1.id);
    expect(on.affected).toBe(1);
    expect((await db.location.findUniqueOrThrow({ where: { id: r2.id } })).status).toBe("INACTIVE");
    const all = await reactivateLocation(A.admin, r1.id, { includeDescendants: true });
    expect(all.affected).toBe(2);
  });

  it("exclusão física só para elementos sem filhos", async () => {
    const { r1, r3 } = await build();
    const e = await err(deleteLocation(A.admin, r1.id));
    expect(e.code).toBe("HAS_RELATED_RECORDS");
    expect((await deleteLocation(A.admin, r3.id)).ok).toBe(true);
    expect(await db.location.count({ where: { id: r3.id } })).toBe(0);
  });

  it("renomear e editar propriedades preserva os relacionamentos", async () => {
    const { r1, r2 } = await build();
    const up = await updateLocation(A.admin, r1.id, { name: "Hall social", areaM2: 42.5, areaClass: "COMMON", code: "HALL" });
    expect(up.name).toBe("Hall social");
    expect(up.areaM2).toBe(42.5);
    expect((await db.location.findUniqueOrThrow({ where: { id: r2.id } })).parentLocationId).toBe(r1.id);
  });

  it("pavimentos e unidades não mudam de tipo", async () => {
    const { f1 } = await build();
    const e = await err(updateLocation(A.admin, f1.id, { locationType: "ROOM" }));
    expect(e.status).toBe(422);
  });
});

describe("RF-008 – Unidades privativas", () => {
  it("cadastra unidades de tipos diferentes, vários por pavimento, e consulta com bloco e pavimento", async () => {
    const { project } = await seedProject();
    const b = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    const f = await createLocation(A.admin, project.id, floorPayload(b.id, "P1"));
    const ap = await createLocation(A.admin, project.id, { parentLocationId: f.id, code: "AP101", name: "Apartamento 101", locationType: "UNIT", unit: { unitType: "RESIDENTIAL", privateAreaM2: 78.5 } });
    await createLocation(A.admin, project.id, { parentLocationId: f.id, code: "AP102", name: "Apartamento 102", locationType: "UNIT", unit: { unitType: "RESIDENTIAL" } });
    await createLocation(A.admin, project.id, { parentLocationId: f.id, code: "SL201", name: "Sala comercial 201", locationType: "UNIT", unit: { unitType: "COMMERCIAL" } });

    expect(ap.areaClass).toBe("PRIVATE");
    expect(ap.unit?.privateAreaM2).toBe(78.5);

    const all = await listUnits(A.admin, project.id, {});
    expect(all).toHaveLength(3);
    expect(all[0].building?.code).toBe("B01");
    expect(all[0].floor?.name).toBe("Pavimento P1");
    expect(await listUnits(A.admin, project.id, { unitType: "COMMERCIAL" })).toHaveLength(1);
    expect(await listUnits(A.admin, project.id, { q: "102" })).toHaveLength(1);
  });

  it("empreendimento sem unidades é válido; unidade exige dados de unidade", async () => {
    const { project } = await seedProject();
    expect(await listUnits(A.admin, project.id, {})).toHaveLength(0);
    const e = await err(createLocation(A.admin, project.id, { code: "U1", name: "Unidade", locationType: "UNIT" }));
    expect(e.status).toBe(422);
    const e2 = await err(createLocation(A.admin, project.id, { code: "R1", name: "Sala", locationType: "ROOM", unit: { unitType: "RESIDENTIAL" } }));
    expect(e2.status).toBe(422);
  });

  it("atualiza a área privativa e exclui a unidade junto com a localização (sem filhos)", async () => {
    const { project } = await seedProject();
    const u = await createLocation(A.admin, project.id, { code: "CASA12", name: "Casa 12", locationType: "UNIT", unit: { unitType: "RESIDENTIAL", privateAreaM2: 120 } });
    const up = await updateLocation(A.admin, u.id, { name: "Casa 12 (reformada)", unit: { unitType: "RESIDENTIAL", privateAreaM2: 135 } });
    expect(up.unit?.privateAreaM2).toBe(135);
    await deleteLocation(A.admin, u.id);
    expect(await db.privateUnit.count({ where: { projectId: project.id } })).toBe(0);
  });
});

// ═══════════════════════════ RF-009 Responsáveis ═══════════════════════════

describe("RF-009 – Responsáveis", () => {
  it("vincula responsáveis novos e existentes; a mesma pessoa pode atuar em vários empreendimentos", async () => {
    const { client, project } = await seedProject();
    const p2 = await createProject(A.admin, projectPayload(client.id));
    const a1 = await createAssignment(A.admin, project.id, { responsible: { name: "Maria Souza", email: "Maria@Ex.com", phone: "11 91234-5678" }, role: "SYNDIC", startDate: "2024-01-01" });
    expect(a1.responsible.email).toBe("maria@ex.com");
    const a2 = await createAssignment(A.admin, p2.id, { responsibleId: a1.responsibleId, role: "FACILITY_MANAGER", startDate: "2024-06-01" });
    expect(a2.responsibleId).toBe(a1.responsibleId);
    expect(await listResponsibles(A.admin, {})).toHaveLength(1);
    expect((await listResponsibles(A.admin, {}))[0].assignmentCount).toBe(2);
  });

  it("registra o período; 'desvincular' encerra o vínculo e preserva o histórico", async () => {
    const { project } = await seedProject();
    const a = await createAssignment(A.admin, project.id, { responsible: { name: "João" }, role: "CARETAKER", startDate: "2020-01-01" });
    expect(a.current).toBe(true);
    const ended = await endAssignment(A.admin, a.id, "2021-12-31");
    expect(ended.endDate).toBe("2021-12-31");
    expect(ended.current).toBe(false);

    const all = await listAssignments(A.admin, project.id, {});
    expect(all).toHaveLength(1); // histórico preservado
    expect(await listAssignments(A.admin, project.id, { current: "true" })).toHaveLength(0);
    expect(await listAssignments(A.admin, project.id, { current: "false" })).toHaveLength(1);
  });

  it("permite substituir o síndico: novo vínculo da mesma função sem sobrepor o período anterior", async () => {
    const { project } = await seedProject();
    const old = await createAssignment(A.admin, project.id, { responsible: { name: "Síndico Antigo" }, role: "SYNDIC", startDate: "2020-01-01", endDate: "2022-12-31" });
    await createAssignment(A.admin, project.id, { responsible: { name: "Síndico Novo" }, role: "SYNDIC", startDate: "2023-01-01" });
    expect((await listAssignments(A.admin, project.id, {}))).toHaveLength(2);
    void old;
  });

  it("recusa períodos sobrepostos da mesma pessoa/função e datas incoerentes", async () => {
    const { project } = await seedProject();
    const a = await createAssignment(A.admin, project.id, { responsible: { name: "Ana" }, role: "SYNDIC", startDate: "2022-01-01", endDate: "2022-12-31" });
    const e = await err(createAssignment(A.admin, project.id, { responsibleId: a.responsibleId, role: "SYNDIC", startDate: "2022-06-01" }));
    expect(e.code).toBe("OVERLAP");
    const ok = await createAssignment(A.admin, project.id, { responsibleId: a.responsibleId, role: "SUB_SYNDIC", startDate: "2022-06-01" });
    expect(ok.role).toBe("SUB_SYNDIC");

    const bad = await err(createAssignment(A.admin, project.id, { responsible: { name: "Bia" }, role: "SYNDIC", startDate: "2023-05-01", endDate: "2023-01-01" }));
    expect(bad.status).toBe(422);
    const other = await err(createAssignment(A.admin, project.id, { responsible: { name: "Caio" }, role: "OTHER", startDate: "2023-05-01" }));
    expect((other.details as { fields: Record<string, string> }).fields.roleDetail).toBeTruthy();
  });

  it("edita vínculo e dados do responsável; inativo não recebe novos vínculos", async () => {
    const { project } = await seedProject();
    const a = await createAssignment(A.admin, project.id, { responsible: { name: "Dora" }, role: "ADMIN_CONTACT", startDate: "2023-01-01" });
    const up = await updateAssignment(A.admin, a.id, { endDate: "2023-12-31" });
    expect(up.endDate).toBe("2023-12-31");
    await setResponsibleStatus(A.admin, a.responsibleId, "INACTIVE");
    const e = await err(createAssignment(A.admin, project.id, { responsibleId: a.responsibleId, role: "SYNDIC", startDate: "2024-01-01" }));
    expect(e.code).toBe("INACTIVE");
  });
});

// ═══════════════════════════ RF-010 Histórico ═══════════════════════════

describe("RF-010 – Histórico do empreendimento", () => {
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n");

  it("lista cronologicamente e filtra por categoria e período", async () => {
    const { project } = await seedProject();
    await createHistory(A.admin, project.id, { category: "RENOVATION", title: "Pintura", occurredOn: "2019-05-10" });
    await createHistory(A.admin, project.id, { category: "CONSTRUCTION", title: "Habite-se", occurredOn: "2008-11-20" });
    await createHistory(A.admin, project.id, { category: "INCIDENT", title: "Vazamento", occurredOn: "2023-02-01" });

    expect((await listHistory(A.admin, project.id, {})).map((h) => h.title)).toEqual(["Habite-se", "Pintura", "Vazamento"]);
    expect((await listHistory(A.admin, project.id, { order: "desc" })).map((h) => h.title)).toEqual(["Vazamento", "Pintura", "Habite-se"]);
    expect(await listHistory(A.admin, project.id, { category: "INCIDENT" })).toHaveLength(1);
    expect((await listHistory(A.admin, project.id, { from: "2015-01-01", to: "2020-12-31" })).map((h) => h.title)).toEqual(["Pintura"]);
    expect(await listHistory(A.admin, project.id, { from: "2023-02-01" })).toHaveLength(1); // limites inclusivos
  });

  it("registra o autor, tem identificação própria e prepara vínculos futuros", async () => {
    const { project } = await seedProject();
    const h = await createHistory(A.editor, project.id, { category: "OTHER", title: "Registro", occurredOn: "2024-01-01" });
    expect(h.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(h.recordedBy?.name).toBe("Alfa EDITOR");
    expect(h).toHaveProperty("sourceType");
    expect(h).toHaveProperty("sourceId");
  });

  it("edições geram trilha de auditoria com antes e depois", async () => {
    const { project } = await seedProject();
    const h = await createHistory(A.admin, project.id, { category: "OTHER", title: "Antes", occurredOn: "2024-01-01" });
    await updateHistory(A.admin, h.id, { category: "OTHER", title: "Depois", occurredOn: "2024-01-01" });
    const trail = await listAudit(A.admin, "history", h.id);
    expect(trail.map((t) => t.action)).toEqual(["UPDATE", "CREATE"]);
    expect(trail[0].changes).toMatchObject({ title: { from: "Antes", to: "Depois" } });
  });

  it("nunca apaga: anula com justificativa, oculta por padrão e permite restaurar", async () => {
    const { project } = await seedProject();
    const h = await createHistory(A.admin, project.id, { category: "OTHER", title: "Lançado por engano", occurredOn: "2024-01-01" });
    const e = await err(voidHistory(A.admin, h.id, {}));
    expect(e.status).toBe(422);
    const v = await voidHistory(A.admin, h.id, { reason: "Duplicado" });
    expect(v.status).toBe("INACTIVE");
    expect(await listHistory(A.admin, project.id, {})).toHaveLength(0);
    expect(await listHistory(A.admin, project.id, { includeVoided: "true" })).toHaveLength(1);
    const e2 = await err(updateHistory(A.admin, h.id, { category: "OTHER", title: "x", occurredOn: "2024-01-01" }));
    expect(e2.code).toBe("VOIDED");
    expect((await restoreHistory(A.admin, h.id)).status).toBe("ACTIVE");
  });

  it("anexa, baixa e remove arquivos com validação de tipo e conteúdo", async () => {
    const { project } = await seedProject();
    const h = await createHistory(A.admin, project.id, { category: "CONSTRUCTION", title: "Com anexo", occurredOn: "2010-01-01" });

    const att = await addAttachment(A.admin, h.id, { name: "../../laudo final.pdf", type: "application/pdf", data: pdf });
    expect(att.fileName).toBe("laudo final.pdf");
    expect((await listHistory(A.admin, project.id, {}))[0].attachments).toHaveLength(1);

    const file = await getAttachmentFile(A.viewer, att.id);
    expect(file.data.equals(pdf)).toBe(true);
    expect(file.mimeType).toBe("application/pdf");

    const bad1 = await err(addAttachment(A.admin, h.id, { name: "virus.exe", type: "application/octet-stream", data: Buffer.from("MZ") }));
    expect(bad1.status).toBe(422);
    const bad2 = await err(addAttachment(A.admin, h.id, { name: "falso.pdf", type: "application/pdf", data: Buffer.from("isto não é pdf") }));
    expect(bad2.status).toBe(422);
    const bad3 = await err(addAttachment(A.admin, h.id, { name: "vazio.txt", type: "text/plain", data: Buffer.alloc(0) }));
    expect(bad3.status).toBe(422);

    await deleteAttachment(A.admin, att.id);
    expect(await db.projectHistoryAttachment.count()).toBe(0);
  });
});

// ═══════════════════════════ Permissões e LGPD ═══════════════════════════

describe("Permissões por perfil (verificadas no backend)", () => {
  it("perfil de consulta não escreve em nenhum cadastro", async () => {
    const { client, project } = await seedProject();
    const v = A.viewer;
    const checks = [
      createClient(v, clientPayload()),
      updateClient(v, client.id, clientPayload()),
      createProject(v, projectPayload(client.id)),
      createBuilding(v, project.id, buildingPayload("X")),
      createLocation(v, project.id, { code: "X", name: "X", locationType: "EXTERNAL_AREA" }),
      createResponsible(v, { name: "X" }),
      createAssignment(v, project.id, { responsible: { name: "X" }, role: "SYNDIC", startDate: "2024-01-01" }),
      createHistory(v, project.id, { category: "OTHER", title: "X", occurredOn: "2024-01-01" }),
    ];
    for (const c of checks) expect((await err(c)).status).toBe(403);
  });

  it("somente administrador desativa clientes e empreendimentos", async () => {
    const { client, project } = await seedProject();
    expect((await err(deactivateClient(A.editor, client.id))).status).toBe(403);
    expect((await err(deactivateProject(A.editor, project.id))).status).toBe(403);
    expect((await deactivateProject(A.admin, project.id)).status).toBe("INACTIVE");
  });

  it("editor cadastra e edita", async () => {
    const c = await createClient(A.editor, clientPayload());
    const p = await createProject(A.editor, projectPayload(c.id));
    expect((await createBuilding(A.editor, p.id, buildingPayload("B01"))).code).toBe("B01");
  });

  it("dados pessoais de pessoa física ficam mascarados para o perfil de consulta (LGPD)", async () => {
    const c = await createClient(A.admin, { personType: "INDIVIDUAL", name: "Fulano", document: "52998224725", email: "fulano@exemplo.com", phone: "11912345678", addressLine: "Rua X", notes: "obs sensível" });
    const seen = await getClient(A.viewer, c.id);
    expect(seen.document).toBe("***.982.***-**");
    expect(seen.email).toBe("f***@exemplo.com");
    expect(seen.phone).toBe("*******5678");
    expect(seen.addressLine).toBeNull();
    expect(seen.notes).toBeNull();
    expect(seen.masked).toBe(true);
    expect((await getClient(A.editor, c.id)).document).toBe("52998224725");

    const { project } = await seedProject();
    await createAssignment(A.admin, project.id, { responsible: { name: "Maria", email: "maria@x.com", phone: "11999998888", notes: "pessoal" }, role: "SYNDIC", startDate: "2024-01-01" });
    const as = await listAssignments(A.viewer, project.id, {});
    expect(as[0].responsible.email).toBe("m***@x.com");
    expect(as[0].responsible.notes).toBeNull();
  });

  it("a trilha de auditoria não registra o valor de dados pessoais alterados", async () => {
    const c = await createClient(A.admin, { personType: "INDIVIDUAL", name: "Fulano", document: "52998224725", email: "velho@x.com" });
    await updateClient(A.admin, c.id, { personType: "INDIVIDUAL", name: "Fulano", document: "52998224725", email: "novo@x.com" });
    const trail = await listAudit(A.admin, "client", c.id);
    const changes = trail[0].changes as Record<string, unknown>;
    expect(changes.email).toEqual({ changed: true });
    expect(JSON.stringify(trail)).not.toContain("novo@x.com");
    expect(JSON.stringify(trail)).not.toContain("52998224725");
  });
});

// ═══════════════════ Isolamento entre organizações ═══════════════════

describe("Isolamento entre organizações", () => {
  it("a organização B não enxerga nem altera nada da organização A", async () => {
    const { client, project } = await seedProject();
    const b = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    const f = await createLocation(A.admin, project.id, floorPayload(b.id, "T"));
    const h = await createHistory(A.admin, project.id, { category: "OTHER", title: "X", occurredOn: "2024-01-01" });
    const att = await addAttachment(A.admin, h.id, { name: "a.txt", type: "text/plain", data: Buffer.from("segredo") });
    const asg = await createAssignment(A.admin, project.id, { responsible: { name: "Maria" }, role: "SYNDIC", startDate: "2024-01-01" });

    const X = B.admin;
    const notFound = async (p: Promise<unknown>) => expect((await err(p)).status).toBe(404);

    expect((await listClients(X, {})).total).toBe(0);
    expect((await listProjects(X, {})).total).toBe(0);
    expect(await listResponsibles(X, {})).toHaveLength(0);

    await notFound(getClient(X, client.id));
    await notFound(updateClient(X, client.id, clientPayload()));
    await notFound(deactivateClient(X, client.id));
    await notFound(getProject(X, project.id));
    await notFound(updateProject(X, project.id, projectPayload(client.id)));
    await notFound(getProjectOverview(X, project.id));
    await notFound(deactivateProject(X, project.id));
    await notFound(listBuildings(X, project.id));
    await notFound(createBuilding(X, project.id, buildingPayload("B99")));
    await notFound(updateBuilding(X, b.id, buildingPayload("B01")));
    await notFound(deactivateBuilding(X, b.id));
    await notFound(getTree(X, project.id));
    await notFound(createLocation(X, project.id, { code: "Z", name: "Z", locationType: "EXTERNAL_AREA" }));
    await notFound(getLocation(X, f.id));
    await notFound(updateLocation(X, f.id, { name: "Hack" }));
    await notFound(moveLocation(X, f.id, { parentLocationId: null, buildingId: b.id }));
    await notFound(deactivateLocation(X, f.id));
    await notFound(deleteLocation(X, f.id));
    await notFound(searchLocations(X, project.id, {}));
    await notFound(listUnits(X, project.id, {}));
    await notFound(listAssignments(X, project.id, {}));
    await notFound(createAssignment(X, project.id, { responsible: { name: "Intruso" }, role: "SYNDIC", startDate: "2024-01-01" }));
    await notFound(endAssignment(X, asg.id));
    await notFound(listHistory(X, project.id, {}));
    await notFound(createHistory(X, project.id, { category: "OTHER", title: "Intruso", occurredOn: "2024-01-01" }));
    await notFound(updateHistory(X, h.id, { category: "OTHER", title: "Hack", occurredOn: "2024-01-01" }));
    await notFound(voidHistory(X, h.id, { reason: "Hack" }));
    await notFound(addAttachment(X, h.id, { name: "b.txt", type: "text/plain", data: Buffer.from("x") }));
    await notFound(getAttachmentFile(X, att.id));
    await notFound(deleteAttachment(X, att.id));
    expect(await listAudit(X, "project", project.id)).toHaveLength(0);

    // nada mudou
    expect((await getProject(A.admin, project.id)).name).toBe("Condomínio Residencial Atenas");
    expect(await db.building.count({ where: { projectId: project.id } })).toBe(1);
    expect(await db.projectHistory.count({ where: { projectId: project.id } })).toBe(1);
  });

  it("identificadores malformados retornam 404 (sem vazar detalhes)", async () => {
    expect((await err(getProject(A.admin, "nao-e-uuid"))).status).toBe(404);
    expect((await err(getClient(A.admin, "123"))).status).toBe(404);
  });
});

// ═══════════════════ Integridade garantida pelo próprio banco ═══════════════════
// Acessos diretos (sem passar pelos serviços) também não conseguem violar as regras.

describe("Integridade no banco (triggers e constraints)", () => {
  it("rejeita localização cujo bloco pertence a outro empreendimento", async () => {
    const { client, project } = await seedProject();
    const p2 = await createProject(A.admin, projectPayload(client.id));
    const b2 = await createBuilding(A.admin, p2.id, buildingPayload("X"));
    const e = await err(
      db.location.create({ data: { organizationId: A.orgId, projectId: project.id, buildingId: b2.id, code: "R", name: "R", locationType: "ROOM" } }),
    );
    expect(e.code).toBe("INTEGRITY");
  });

  it("rejeita pai de outro empreendimento e pai de outro bloco", async () => {
    const { client, project } = await seedProject();
    const p2 = await createProject(A.admin, projectPayload(client.id));
    const b2 = await createBuilding(A.admin, p2.id, buildingPayload("X"));
    const f2 = await createLocation(A.admin, p2.id, floorPayload(b2.id, "T"));
    const e = await err(
      db.location.create({ data: { organizationId: A.orgId, projectId: project.id, parentLocationId: f2.id, code: "R", name: "R", locationType: "ROOM" } }),
    );
    expect(e.code).toBe("INTEGRITY");

    const b1 = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    const b1b = await createBuilding(A.admin, project.id, buildingPayload("B02"));
    const f1 = await createLocation(A.admin, project.id, floorPayload(b1.id, "T"));
    const e2 = await err(
      db.location.create({ data: { organizationId: A.orgId, projectId: project.id, buildingId: b1b.id, parentLocationId: f1.id, code: "R", name: "R", locationType: "ROOM" } }),
    );
    expect(e2.code).toBe("INTEGRITY");
  });

  it("rejeita ciclos criados por UPDATE direto", async () => {
    const { project } = await seedProject();
    const b = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    const f = await createLocation(A.admin, project.id, floorPayload(b.id, "T"));
    const r1 = await createLocation(A.admin, project.id, roomPayload(f.id, "R1"));
    const r2 = await createLocation(A.admin, project.id, roomPayload(r1.id, "R2"));
    const e = await err(db.location.update({ where: { id: r1.id }, data: { parentLocationId: r2.id } }));
    expect(e.code).toBe("INTEGRITY");
    const e2 = await err(db.location.update({ where: { id: r1.id }, data: { parentLocationId: r1.id } }));
    expect(["INTEGRITY", "VALIDATION"]).toContain(e2.code);
  });

  it("rejeita mudar organização ou empreendimento de um registro existente", async () => {
    const { client, project } = await seedProject();
    const p2 = await createProject(A.admin, projectPayload(client.id));
    const b = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    expect((await err(db.building.update({ where: { id: b.id }, data: { projectId: p2.id } }))).code).toBe("INTEGRITY");
    expect((await err(db.building.update({ where: { id: b.id }, data: { organizationId: B.orgId } }))).code).toBe("INTEGRITY");
  });

  it("rejeita vínculos entre organizações (cliente, responsável, empreendimento)", async () => {
    const cb = await createClient(B.admin, clientPayload());
    const e = await err(
      db.project.create({ data: { organizationId: A.orgId, clientId: cb.id, code: "X", name: "X", projectType: "OTHER", addressLine: "x", city: "x", state: "SP" } }),
    );
    expect(e.code).toBe("INTEGRITY");

    const { project } = await seedProject();
    const rb = await createResponsible(B.admin, { name: "Intruso" });
    const e2 = await err(
      db.projectResponsibleAssignment.create({ data: { organizationId: A.orgId, projectId: project.id, responsibleId: rb.id, role: "SYNDIC", startDate: new Date("2024-01-01") } }),
    );
    expect(e2.code).toBe("INTEGRITY");

    const { project: pb } = await seedProject(B);
    const e3 = await err(
      db.building.create({ data: { organizationId: A.orgId, projectId: pb.id, code: "B", name: "B" } }),
    );
    expect(e3.code).toBe("INTEGRITY");
  });

  it("unidade privativa só pode apontar para localização UNIT do mesmo empreendimento", async () => {
    const { client, project } = await seedProject();
    const room = await createLocation(A.admin, project.id, { code: "SALA", name: "Sala", locationType: "ROOM" });
    const e = await err(db.privateUnit.create({ data: { organizationId: A.orgId, projectId: project.id, locationId: room.id, unitType: "OTHER" } }));
    expect(e.code).toBe("INTEGRITY");

    const p2 = await createProject(A.admin, projectPayload(client.id));
    const u2 = await createLocation(A.admin, p2.id, { code: "U", name: "U", locationType: "UNIT", unit: { unitType: "OTHER" } });
    const e2 = await err(db.privateUnit.update({ where: { locationId: u2.id }, data: { projectId: project.id } }));
    expect(e2.code).toBe("INTEGRITY");
  });

  it("restrições CHECK: pavimento sem bloco, áreas negativas, período invertido e formatos", async () => {
    const { project } = await seedProject();
    const base = { organizationId: A.orgId, projectId: project.id };
    expect((await err(db.location.create({ data: { ...base, code: "F", name: "F", locationType: "FLOOR" } }))).status).toBeGreaterThanOrEqual(400);
    expect((await err(db.location.create({ data: { ...base, code: "N", name: "N", locationType: "ROOM", areaM2: -1 } }))).status).toBeGreaterThanOrEqual(400);
    expect((await err(db.location.create({ data: { ...base, code: "com espaço", name: "N", locationType: "ROOM" } }))).status).toBeGreaterThanOrEqual(400);
    const r = await createResponsible(A.admin, { name: "Z" });
    expect(
      (await err(db.projectResponsibleAssignment.create({ data: { ...base, responsibleId: r.id, role: "SYNDIC", startDate: new Date("2024-02-01"), endDate: new Date("2024-01-01") } }))).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (await err(db.client.create({ data: { organizationId: A.orgId, personType: "INDIVIDUAL", name: "X", document: "123" } }))).status,
    ).toBeGreaterThanOrEqual(400);
  });

  it("chaves estrangeiras são restritivas: nada é apagado em cascata", async () => {
    const { client, project } = await seedProject();
    const b = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    await createLocation(A.admin, project.id, floorPayload(b.id, "T"));
    await createHistory(A.admin, project.id, { category: "OTHER", title: "X", occurredOn: "2024-01-01" });
    expect((await err(db.project.delete({ where: { id: project.id } }))).status).toBeGreaterThanOrEqual(400);
    expect((await err(db.client.delete({ where: { id: client.id } }))).status).toBeGreaterThanOrEqual(400);
    expect((await err(db.building.delete({ where: { id: b.id } }))).status).toBeGreaterThanOrEqual(400);
    expect((await err(db.organization.delete({ where: { id: A.orgId } }))).status).toBeGreaterThanOrEqual(400);
  });

  it("a trilha de auditoria é somente de inserção", async () => {
    const { project } = await seedProject();
    const log = await db.auditLog.findFirstOrThrow({ where: { entityId: project.id } });
    expect((await err(db.auditLog.update({ where: { id: log.id }, data: { action: "HACK" } }))).code).toBe("INTEGRITY");
    expect((await err(db.auditLog.delete({ where: { id: log.id } }))).code).toBe("INTEGRITY");
  });
});

// ═══════════════════ Persistência ═══════════════════

describe("Persistência real", () => {
  it("os dados continuam disponíveis após descartar a conexão e reabrir (nova conexão ao banco)", async () => {
    const { client, project } = await seedProject();
    const b = await createBuilding(A.admin, project.id, buildingPayload("B01"));
    await createLocation(A.admin, project.id, floorPayload(b.id, "T"));

    await db.$disconnect();
    // nova conexão lazy: lê do PostgreSQL, não de memória
    expect((await getClient(A.admin, client.id)).id).toBe(client.id);
    expect((await getTree(A.admin, project.id)).locations).toHaveLength(1);
  });
});
