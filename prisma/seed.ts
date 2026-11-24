/**
 * Seed. Sem argumentos: cria a organização e o administrador definidos no .env.
 * Com --demo: cria também dados fictícios de demonstração (Condomínio Residencial Atenas).
 */
import "dotenv/config";
import { db } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";
import type { Ctx } from "../src/server/context";
import { createClient } from "../src/server/services/clients";
import { createProject } from "../src/server/services/projects";
import { createBuilding } from "../src/server/services/buildings";
import { createLocation } from "../src/server/services/locations";
import { createAssignment } from "../src/server/services/responsibles";
import { createHistory } from "../src/server/services/history";

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function main() {
  const orgName = process.env.SEED_ORG_NAME || "Minha Organização";
  const email = (process.env.SEED_ADMIN_EMAIL || "admin@example.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "";
  if (password.length < 12) throw new Error("Defina SEED_ADMIN_PASSWORD com pelo menos 12 caracteres.");

  const org = await db.organization.upsert({
    where: { slug: slug(orgName) },
    update: {},
    create: { name: orgName, slug: slug(orgName) },
  });
  let admin = await db.user.findUnique({ where: { email } });
  if (!admin) {
    admin = await db.user.create({
      data: { organizationId: org.id, name: process.env.SEED_ADMIN_NAME || "Administrador", email, passwordHash: await hashPassword(password), role: "ADMIN" },
    });
    console.log(`Administrador criado: ${email}`);
  } else console.log(`Administrador já existe: ${email}`);

  if (!process.argv.includes("--demo")) return;

  const ctx: Ctx = { organizationId: org.id, userId: admin.id, role: "ADMIN" };
  if (await db.project.findFirst({ where: { organizationId: org.id, code: "ATENAS" } })) {
    console.log("Dados de demonstração já existem.");
    return;
  }
  const client = await createClient(ctx, { personType: "LEGAL_ENTITY", name: "Construtora Atenas Ltda", tradeName: "Atenas", document: "11222333000181", email: "contato@atenas.example", city: "São Paulo", state: "SP" });
  const project = await createProject(ctx, {
    clientId: client.id, code: "ATENAS", name: "Condomínio Residencial Atenas", projectType: "RESIDENTIAL_VERTICAL",
    addressLine: "Rua das Palmeiras", addressNumber: "250", district: "Jardim Europa", city: "São Paulo", state: "SP", zipCode: "01450-000",
    characteristics: { constructionYear: 2008, landAreaM2: 8200, builtAreaM2: 14500, useType: "RESIDENTIAL", constructionTypology: "Concreto armado com vedação em alvenaria" },
  });
  const b1 = await createBuilding(ctx, project.id, { code: "B01", name: "Bloco 01", buildingType: "BLOCK" });
  const b2 = await createBuilding(ctx, project.id, { code: "B02", name: "Bloco 02", buildingType: "BLOCK" });
  const aux = await createBuilding(ctx, project.id, { code: "PORT", name: "Portaria principal", buildingType: "AUXILIARY" });

  const floor = (buildingId: string, code: string, name: string, floorKind: string, floorOrder: number) =>
    createLocation(ctx, project.id, { buildingId, code, name, locationType: "FLOOR", floorKind, floorOrder });
  const sub = await floor(b1.id, "SS1", "Subsolo", "BASEMENT", -1);
  const ter = await floor(b1.id, "T", "Térreo", "GROUND", 0);
  const p1 = await floor(b1.id, "P1", "1º pavimento", "STANDARD", 1);
  const cob = await floor(b1.id, "COB", "Cobertura", "ROOF", 99);
  await createLocation(ctx, project.id, { parentLocationId: sub.id, code: "GAR", name: "Garagem", locationType: "ROOM", areaClass: "COMMON" });
  await createLocation(ctx, project.id, { parentLocationId: sub.id, code: "BOMBAS", name: "Sala de bombas", locationType: "TECHNICAL_AREA", areaClass: "COMMON" });
  await createLocation(ctx, project.id, { parentLocationId: ter.id, code: "HALL", name: "Hall de entrada", locationType: "ROOM", areaClass: "COMMON" });
  await createLocation(ctx, project.id, { parentLocationId: p1.id, code: "AP101", name: "Apartamento 101", locationType: "UNIT", unit: { unitType: "RESIDENTIAL", privateAreaM2: 78.5 } });
  await createLocation(ctx, project.id, { parentLocationId: p1.id, code: "AP102", name: "Apartamento 102", locationType: "UNIT", unit: { unitType: "RESIDENTIAL", privateAreaM2: 64 } });
  await createLocation(ctx, project.id, { parentLocationId: cob.id, code: "BARR", name: "Barrilete", locationType: "TECHNICAL_AREA", areaClass: "COMMON" });
  await createLocation(ctx, project.id, { parentLocationId: cob.id, code: "CASAMAQ", name: "Casa de máquinas", locationType: "TECHNICAL_AREA", areaClass: "COMMON" });
  await floor(b2.id, "T", "Térreo", "GROUND", 0);
  await floor(b2.id, "P1", "1º pavimento", "STANDARD", 1);
  await floor(b2.id, "P2", "2º pavimento", "STANDARD", 2);
  for (const [code, name] of [["PISCINA", "Piscina"], ["JARDINS", "Jardins"], ["ESTAC", "Estacionamento"], ["PLAY", "Playground"]])
    await createLocation(ctx, project.id, { code, name, locationType: "EXTERNAL_AREA", areaClass: "COMMON" });
  await createLocation(ctx, project.id, { buildingId: aux.id, code: "GAS", name: "Casa de gás", locationType: "TECHNICAL_AREA", areaClass: "COMMON" });

  await createAssignment(ctx, project.id, { responsible: { name: "Maria Souza", email: "maria@example.com", phone: "11 91234-5678" }, role: "SYNDIC", startDate: "2024-01-01" });
  await createAssignment(ctx, project.id, { responsible: { name: "Boa Vista Administradora", companyName: "Boa Vista Adm. Ltda" }, role: "ADMINISTRATOR", startDate: "2022-03-15" });
  await createHistory(ctx, project.id, { category: "CONSTRUCTION", title: "Habite-se emitido", occurredOn: "2008-11-20", description: "Conclusão da obra e entrega das unidades." });
  await createHistory(ctx, project.id, { category: "RENOVATION", title: "Pintura das fachadas", occurredOn: "2019-05-10" });
  console.log("Dados de demonstração criados (organização:", org.name + ").");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
