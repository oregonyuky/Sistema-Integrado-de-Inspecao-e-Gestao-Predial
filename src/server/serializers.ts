import type { Prisma } from "@prisma/client";
import type { Ctx } from "./context";
import { canViewPersonalData } from "./context";
import { maskDocument } from "@/lib/document";

type Dec = Prisma.Decimal | null | undefined;

export const num = (d: Dec): number | null => (d === null || d === undefined ? null : Number(d));
export const day = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);
export const ts = (d: Date): string => d.toISOString();

const maskEmail = (e: string | null) => (e ? e.replace(/^(.).*(@.*)$/, "$1***$2") : null);
const maskPhone = (p: string | null) => (p ? `${"*".repeat(Math.max(p.length - 4, 0))}${p.slice(-4)}` : null);

type ClientRow = Prisma.ClientGetPayload<object>;

export function serializeClient(ctx: Ctx, c: ClientRow) {
  const full = canViewPersonalData(ctx);
  const personal = c.personType === "INDIVIDUAL"; // dados pessoais (LGPD) apenas de pessoa física
  const mask = !full && personal;
  return {
    id: c.id,
    personType: c.personType,
    name: c.name,
    tradeName: c.tradeName,
    document: mask ? maskDocument(c.document) : c.document,
    email: mask ? maskEmail(c.email) : c.email,
    phone: mask ? maskPhone(c.phone) : c.phone,
    addressLine: mask ? null : c.addressLine,
    addressNumber: mask ? null : c.addressNumber,
    complement: mask ? null : c.complement,
    district: mask ? null : c.district,
    city: c.city,
    state: c.state,
    zipCode: mask ? null : c.zipCode,
    contactName: c.contactName,
    notes: mask ? null : c.notes,
    status: c.status,
    masked: mask,
    createdAt: ts(c.createdAt),
    updatedAt: ts(c.updatedAt),
  };
}

type ProjectRow = Prisma.ProjectGetPayload<object>;

export function serializeProject(p: ProjectRow) {
  return {
    id: p.id,
    clientId: p.clientId,
    code: p.code,
    name: p.name,
    projectType: p.projectType,
    addressLine: p.addressLine,
    addressNumber: p.addressNumber,
    complement: p.complement,
    district: p.district,
    city: p.city,
    state: p.state,
    zipCode: p.zipCode,
    latitude: num(p.latitude),
    longitude: num(p.longitude),
    description: p.description,
    status: p.status,
    createdAt: ts(p.createdAt),
    updatedAt: ts(p.updatedAt),
  };
}

type CharRow = Prisma.ProjectCharacteristicsGetPayload<object>;

export function serializeCharacteristics(c: CharRow | null, year: number) {
  if (!c) return null;
  const calculated = c.constructionYear ? Math.max(year - c.constructionYear, 0) : null;
  return {
    landAreaM2: num(c.landAreaM2),
    builtAreaM2: num(c.builtAreaM2),
    constructionYear: c.constructionYear,
    estimatedAgeYears: c.estimatedAgeYears,
    // Idade: calculada pelo ano de construção quando conhecido; senão, a estimada informada.
    ageYears: calculated ?? c.estimatedAgeYears ?? null,
    ageSource: calculated !== null ? ("calculated" as const) : c.estimatedAgeYears !== null ? ("estimated" as const) : null,
    useType: c.useType,
    occupancyType: c.occupancyType,
    constructionTypology: c.constructionTypology,
    predominantSystem: c.predominantSystem,
    structureInfo: c.structureInfo,
    expansionsInfo: c.expansionsInfo,
    renovationsInfo: c.renovationsInfo,
    technicalNotes: c.technicalNotes,
    updatedAt: ts(c.updatedAt),
  };
}

type BuildingRow = Prisma.BuildingGetPayload<object>;

export function serializeBuilding(b: BuildingRow) {
  return {
    id: b.id,
    projectId: b.projectId,
    code: b.code,
    name: b.name,
    buildingType: b.buildingType,
    description: b.description,
    builtAreaM2: num(b.builtAreaM2),
    constructionYear: b.constructionYear,
    notes: b.notes,
    sortOrder: b.sortOrder,
    status: b.status,
    createdAt: ts(b.createdAt),
    updatedAt: ts(b.updatedAt),
  };
}

type LocationRow = Prisma.LocationGetPayload<{ include: { privateUnit: true } }>;

export function serializeLocation(l: LocationRow) {
  return {
    id: l.id,
    projectId: l.projectId,
    buildingId: l.buildingId,
    parentLocationId: l.parentLocationId,
    code: l.code,
    name: l.name,
    locationType: l.locationType,
    areaClass: l.areaClass,
    floorKind: l.floorKind,
    floorOrder: l.floorOrder,
    elevationM: num(l.elevationM),
    sortOrder: l.sortOrder,
    areaM2: num(l.areaM2),
    description: l.description,
    status: l.status,
    unit: l.privateUnit
      ? { id: l.privateUnit.id, unitType: l.privateUnit.unitType, privateAreaM2: num(l.privateUnit.privateAreaM2) }
      : null,
    createdAt: ts(l.createdAt),
    updatedAt: ts(l.updatedAt),
  };
}

type ResponsibleRow = Prisma.ProjectResponsibleGetPayload<object>;

export function serializeResponsible(ctx: Ctx, r: ResponsibleRow) {
  const full = canViewPersonalData(ctx);
  return {
    id: r.id,
    name: r.name,
    companyName: r.companyName,
    email: full ? r.email : maskEmail(r.email),
    phone: full ? r.phone : maskPhone(r.phone),
    professionalRegistration: r.professionalRegistration,
    notes: full ? r.notes : null,
    status: r.status,
    masked: !full,
    createdAt: ts(r.createdAt),
    updatedAt: ts(r.updatedAt),
  };
}

type AssignmentRow = Prisma.ProjectResponsibleAssignmentGetPayload<{ include: { responsible: true } }>;

export function serializeAssignment(ctx: Ctx, a: AssignmentRow, today: string) {
  const start = day(a.startDate)!;
  const end = day(a.endDate);
  return {
    id: a.id,
    projectId: a.projectId,
    responsibleId: a.responsibleId,
    role: a.role,
    roleDetail: a.roleDetail,
    startDate: start,
    endDate: end,
    current: start <= today && (end === null || end >= today),
    notes: canViewPersonalData(ctx) ? a.notes : null,
    responsible: serializeResponsible(ctx, a.responsible),
    createdAt: ts(a.createdAt),
    updatedAt: ts(a.updatedAt),
  };
}
