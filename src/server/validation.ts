import { z } from "zod";
import {
  AreaClass,
  BuildingType,
  FloorKind,
  HistoryCategory,
  LocationType,
  PersonType,
  ProjectType,
  RecordStatus,
  ResponsibleRole,
  UnitType,
  UseType,
} from "@prisma/client";
import { BR_STATES, isValidCNPJ, isValidCPF, normalizeDocument } from "@/lib/document";

// ───────────── primitivos reutilizáveis ─────────────

const REQUIRED = "Campo obrigatório.";

export const uuid = z.string().uuid("Identificador inválido.");

/** Texto obrigatório. */
export const reqText = (max: number) =>
  z.string({ required_error: REQUIRED, invalid_type_error: REQUIRED }).trim().min(1, REQUIRED).max(max, `Máximo de ${max} caracteres.`);

/** Texto opcional: vazio/ausente vira null. */
export const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .nullish()
    .transform((v) => (v ? v : null));

/** Número opcional: vazio/ausente vira null. */
export const optNumber = (o: { min?: number; max?: number; int?: boolean; label?: string } = {}) =>
  z
    .preprocess(
      (v) => (v === "" || v === undefined || v === null ? null : typeof v === "string" ? Number(v.replace(",", ".")) : v),
      z
        .number({ invalid_type_error: "Informe um número válido." })
        .finite("Informe um número válido.")
        .refine((n) => !o.int || Number.isInteger(n), "Informe um número inteiro.")
        .refine((n) => o.min === undefined || n >= o.min, `Valor mínimo: ${o.min}.`)
        .refine((n) => o.max === undefined || n <= o.max, `Valor máximo: ${o.max}.`)
        .nullable(),
    )
    .transform((v) => v as number | null);

export const optArea = optNumber({ min: 0, max: 999_999_999_999 });

export const code = z
  .string({ required_error: REQUIRED })
  .trim()
  .min(1, REQUIRED)
  .max(40, "Máximo de 40 caracteres.")
  .transform((s) => s.toUpperCase())
  .refine(
    (s) => /^[A-Z0-9][A-Z0-9._/-]*$/.test(s),
    "Use apenas letras, números, ponto, hífen, barra ou sublinhado, sem espaços.",
  );

export const isoDate = z
  .string({ required_error: REQUIRED, invalid_type_error: REQUIRED })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD).")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && d.getUTCFullYear() >= 1500 && d.getUTCFullYear() <= 2100;
  }, "Data inválida.");

export const optIsoDate = z
  .union([isoDate, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const toDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Máximo de 254 caracteres.")
  .email("E-mail inválido.")
  .nullish()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

const phone = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v.replace(/\D/g, "") : null))
  .refine((v) => v === null || (v.length >= 10 && v.length <= 13), "Telefone inválido (informe DDD + número).");

const zip = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v.replace(/\D/g, "") : null))
  .refine((v) => v === null || v.length === 8, "CEP inválido (8 dígitos).");

const stateOpt = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v.toUpperCase() : null))
  .refine((v) => v === null || (BR_STATES as readonly string[]).includes(v), "UF inválida.");

const stateReq = z
  .string({ required_error: REQUIRED })
  .trim()
  .min(1, REQUIRED)
  .transform((v) => v.toUpperCase())
  .refine((v) => (BR_STATES as readonly string[]).includes(v), "UF inválida.");

const nativeEnum = <T extends Record<string, string>>(e: T, msg = "Valor inválido.") =>
  z.nativeEnum(e, { errorMap: () => ({ message: msg }) });

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const statusFilter = z.union([nativeEnum(RecordStatus), z.literal("ALL")]).optional();

// ───────────── RF-001 Clientes ─────────────

export const clientSchema = z
  .object({
    personType: nativeEnum(PersonType, "Selecione o tipo de pessoa."),
    name: reqText(200),
    tradeName: optText(200),
    document: z
      .string()
      .trim()
      .nullish()
      .transform((v) => (v ? normalizeDocument(v) : null)),
    email,
    phone,
    addressLine: optText(200),
    addressNumber: optText(20),
    complement: optText(100),
    district: optText(100),
    city: optText(100),
    state: stateOpt,
    zipCode: zip,
    contactName: optText(200),
    notes: optText(4000),
  })
  .superRefine((v, ctx) => {
    if (v.document) {
      const ok = v.personType === "INDIVIDUAL" ? isValidCPF(v.document) : isValidCNPJ(v.document);
      if (!ok) ctx.addIssue({ code: "custom", path: ["document"], message: v.personType === "INDIVIDUAL" ? "CPF inválido." : "CNPJ inválido." });
    }
  })
  .transform((v) => (v.personType === "INDIVIDUAL" ? { ...v, tradeName: null, contactName: null } : v));

export const clientListQuery = pagination.extend({
  q: z.string().trim().max(100).optional(),
  status: statusFilter,
  personType: nativeEnum(PersonType).optional(),
});

// ───────────── RF-003 Caracterização técnica ─────────────

const thisYear = new Date().getUTCFullYear();

export const characteristicsSchema = z.object({
  landAreaM2: optArea,
  builtAreaM2: optArea,
  constructionYear: optNumber({ int: true, min: 1500, max: thisYear }),
  estimatedAgeYears: optNumber({ int: true, min: 0, max: 1000 }),
  useType: nativeEnum(UseType).nullish().transform((v) => v ?? null),
  occupancyType: optText(200),
  constructionTypology: optText(200),
  predominantSystem: optText(200),
  structureInfo: optText(4000),
  expansionsInfo: optText(4000),
  renovationsInfo: optText(4000),
  technicalNotes: optText(4000),
});

// ───────────── RF-002 Empreendimentos ─────────────

export const projectSchema = z
  .object({
    clientId: uuid,
    code,
    name: reqText(200),
    projectType: nativeEnum(ProjectType, "Selecione o tipo de empreendimento."),
    addressLine: reqText(200),
    addressNumber: optText(20),
    complement: optText(100),
    district: optText(100),
    city: reqText(100),
    state: stateReq,
    zipCode: zip,
    latitude: optNumber({ min: -90, max: 90 }),
    longitude: optNumber({ min: -180, max: 180 }),
    description: optText(4000),
    characteristics: characteristicsSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.latitude === null) !== (v.longitude === null))
      ctx.addIssue({ code: "custom", path: [v.latitude === null ? "latitude" : "longitude"], message: "Informe latitude e longitude juntas." });
  });

export const projectListQuery = pagination.extend({
  q: z.string().trim().max(100).optional(),
  clientId: uuid.optional(),
  projectType: nativeEnum(ProjectType).optional(),
  status: statusFilter,
});

// ───────────── RF-004 Edificações ─────────────

export const buildingSchema = z.object({
  code,
  name: reqText(200),
  buildingType: nativeEnum(BuildingType, "Selecione o tipo de edificação."),
  description: optText(4000),
  builtAreaM2: optArea,
  constructionYear: optNumber({ int: true, min: 1500, max: thisYear }),
  notes: optText(4000),
});

// ───────────── RF-005..008 Localizações e unidades ─────────────

const unitPayload = z.object({
  unitType: nativeEnum(UnitType, "Selecione o tipo de unidade."),
  privateAreaM2: optArea,
});

const locationBase = z.object({
  buildingId: uuid.nullish().transform((v) => v ?? null),
  parentLocationId: uuid.nullish().transform((v) => v ?? null),
  code,
  name: reqText(200),
  locationType: nativeEnum(LocationType, "Selecione o tipo."),
  areaClass: nativeEnum(AreaClass).optional(),
  floorKind: nativeEnum(FloorKind).nullish().transform((v) => v ?? null),
  floorOrder: optNumber({ int: true, min: -200, max: 500 }),
  elevationM: optNumber({ min: -1000, max: 10000 }),
  areaM2: optArea,
  description: optText(4000),
  unit: unitPayload.nullish().transform((v) => v ?? null),
});

export const locationCreateSchema = locationBase;

/** Atualização parcial (o tipo e a posição na árvore não mudam aqui; use /move). */
export const locationUpdateSchema = locationBase
  .omit({ buildingId: true, parentLocationId: true })
  .partial();

export const locationMoveSchema = z.object({
  parentLocationId: uuid.nullable(),
  buildingId: uuid.nullable().optional(),
});

export const reorderSchema = z.object({ direction: z.enum(["up", "down"]) });

export const locationSearchQuery = z.object({
  q: z.string().trim().max(100).optional(),
  type: nativeEnum(LocationType).optional(),
  areaClass: nativeEnum(AreaClass).optional(),
  status: statusFilter,
});

export const unitListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  unitType: nativeEnum(UnitType).optional(),
  status: statusFilter,
});

export const reactivateSchema = z.object({ includeDescendants: z.boolean().optional() }).optional();

// ───────────── RF-009 Responsáveis ─────────────

export const responsibleSchema = z.object({
  name: reqText(200),
  companyName: optText(200),
  email,
  phone,
  professionalRegistration: optText(100),
  notes: optText(2000),
});

export const responsibleListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: statusFilter,
});

export const assignmentCreateSchema = z
  .object({
    responsibleId: uuid.optional(),
    responsible: responsibleSchema.optional(),
    role: nativeEnum(ResponsibleRole, "Selecione a função."),
    roleDetail: optText(100),
    startDate: isoDate,
    endDate: optIsoDate,
    notes: optText(2000),
  })
  .superRefine((v, ctx) => {
    if (!!v.responsibleId === !!v.responsible)
      ctx.addIssue({ code: "custom", path: ["responsibleId"], message: "Selecione um responsável existente ou cadastre um novo." });
    if (v.endDate && v.endDate < v.startDate)
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "A data de término não pode ser anterior ao início." });
    if (v.role === "OTHER" && !v.roleDetail)
      ctx.addIssue({ code: "custom", path: ["roleDetail"], message: "Descreva a função." });
  });

export const assignmentUpdateSchema = z
  .object({
    role: nativeEnum(ResponsibleRole),
    roleDetail: optText(100),
    startDate: isoDate,
    endDate: optIsoDate,
    notes: optText(2000),
  })
  .partial()
  .superRefine((v, ctx) => {
    if (v.startDate && v.endDate && v.endDate < v.startDate)
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "A data de término não pode ser anterior ao início." });
  });

export const assignmentListQuery = z.object({
  current: z.enum(["true", "false"]).optional(),
});

// ───────────── RF-010 Histórico ─────────────

export const historySchema = z.object({
  category: nativeEnum(HistoryCategory, "Selecione a categoria."),
  title: reqText(200),
  description: optText(8000),
  occurredOn: isoDate,
  notes: optText(4000),
});

export const historyListQuery = z.object({
  category: nativeEnum(HistoryCategory).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
  includeVoided: z.enum(["true", "false"]).optional(),
});

export const voidSchema = z.object({ reason: reqText(500) });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  password: z.string().min(1, REQUIRED).max(200),
});

export type ClientInput = z.output<typeof clientSchema>;
export type ProjectInput = z.output<typeof projectSchema>;
export type CharacteristicsInput = z.output<typeof characteristicsSchema>;
export type BuildingInput = z.output<typeof buildingSchema>;
export type LocationCreateInput = z.output<typeof locationCreateSchema>;
export type LocationUpdateInput = z.output<typeof locationUpdateSchema>;
export type ResponsibleInput = z.output<typeof responsibleSchema>;
export type AssignmentCreateInput = z.output<typeof assignmentCreateSchema>;
export type AssignmentUpdateInput = z.output<typeof assignmentUpdateSchema>;
export type HistoryInput = z.output<typeof historySchema>;
