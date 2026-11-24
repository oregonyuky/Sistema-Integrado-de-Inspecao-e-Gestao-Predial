import { db } from "@/server/db";
import { toAppError } from "@/server/errors";
import { hashPassword } from "@/server/auth/password";
import type { Ctx } from "@/server/context";

export async function resetData() {
  await db.$executeRawUnsafe(`TRUNCATE TABLE "organizations" RESTART IDENTITY CASCADE`);
}

let seq = 0;
export const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export interface TestOrg {
  orgId: string;
  admin: Ctx;
  editor: Ctx;
  viewer: Ctx;
}

export async function makeOrg(name = "Org"): Promise<TestOrg> {
  const org = await db.organization.create({ data: { name, slug: `${name.toLowerCase()}-${uniq()}` } });
  const hash = await hashPassword("senha-de-teste-123");
  const mk = async (role: "ADMIN" | "EDITOR" | "VIEWER"): Promise<Ctx> => {
    const u = await db.user.create({
      data: { organizationId: org.id, name: `${name} ${role}`, email: `${role.toLowerCase()}-${uniq()}@${name.toLowerCase()}.test`, passwordHash: hash, role },
    });
    return { organizationId: org.id, userId: u.id, role };
  };
  return { orgId: org.id, admin: await mk("ADMIN"), editor: await mk("EDITOR"), viewer: await mk("VIEWER") };
}

/** Executa e devolve o AppError normalizado (falha o teste se não houver erro). */
export async function err(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return toAppError(e);
  }
  throw new Error("Era esperado um erro, mas a operação foi concluída.");
}

// ── geradores de documentos válidos (independentes do validador do app) ──

export function genCPF(seed = Math.floor(Math.random() * 1e9)): string {
  const base = String(seed).padStart(9, "0").slice(0, 9).split("").map(Number);
  if (new Set(base).size === 1) base[8] = (base[8] + 1) % 10;
  const dv = (digits: number[]) => {
    const len = digits.length + 1;
    const s = digits.reduce((acc, d, i) => acc + d * (len - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  return [...base, d1, d2].join("");
}

export function genCNPJ(root = String(Math.floor(Math.random() * 1e8)).padStart(8, "0") + "0001"): string {
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const v = (c: string) => c.charCodeAt(0) - 48;
  const dv = (s: string, w: number[]) => {
    const sum = s.split("").reduce((acc, ch, i) => acc + v(ch) * w[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(root, w1);
  const d2 = dv(root + d1, w2);
  return `${root}${d1}${d2}`;
}

// ── payloads de exemplo ──

export const clientPayload = (o: Record<string, unknown> = {}) => ({
  personType: "LEGAL_ENTITY",
  name: "Construtora Atenas Ltda",
  document: genCNPJ(),
  ...o,
});

export const projectPayload = (clientId: string, o: Record<string, unknown> = {}) => ({
  clientId,
  code: `P-${uniq()}`.toUpperCase(),
  name: "Condomínio Residencial Atenas",
  projectType: "RESIDENTIAL_VERTICAL",
  addressLine: "Rua das Flores",
  addressNumber: "100",
  city: "São Paulo",
  state: "SP",
  ...o,
});

export const buildingPayload = (code: string, o: Record<string, unknown> = {}) => ({
  code,
  name: `Bloco ${code}`,
  buildingType: "BLOCK",
  ...o,
});

export const floorPayload = (buildingId: string, code: string, o: Record<string, unknown> = {}) => ({
  buildingId,
  code,
  name: `Pavimento ${code}`,
  locationType: "FLOOR",
  floorKind: "STANDARD",
  floorOrder: 1,
  ...o,
});

export const roomPayload = (parentLocationId: string | null, code: string, o: Record<string, unknown> = {}) => ({
  parentLocationId,
  code,
  name: `Ambiente ${code}`,
  locationType: "ROOM",
  ...o,
});
