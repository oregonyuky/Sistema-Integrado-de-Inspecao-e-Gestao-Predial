/** Rótulos em português para enums do domínio (usados na API e na interface). */

export const personTypeLabels = { INDIVIDUAL: "Pessoa física", LEGAL_ENTITY: "Pessoa jurídica" } as const;

export const recordStatusLabels = { ACTIVE: "Ativo", INACTIVE: "Inativo" } as const;

export const projectTypeLabels = {
  RESIDENTIAL_HORIZONTAL: "Condomínio residencial horizontal",
  RESIDENTIAL_VERTICAL: "Condomínio residencial vertical",
  COMMERCIAL: "Edifício comercial",
  MIXED_USE: "Uso misto",
  INDUSTRIAL: "Industrial",
  HOSPITAL: "Hospital",
  EDUCATIONAL: "Instituição de ensino",
  PUBLIC: "Edificação pública",
  STANDALONE: "Edificação isolada",
  OTHER: "Outro",
} as const;

export const useTypeLabels = {
  RESIDENTIAL: "Residencial",
  COMMERCIAL: "Comercial",
  MIXED: "Misto",
  INDUSTRIAL: "Industrial",
  INSTITUTIONAL: "Institucional",
  HEALTHCARE: "Saúde",
  EDUCATIONAL: "Educacional",
  PUBLIC: "Público",
  OTHER: "Outro",
} as const;

export const buildingTypeLabels = {
  BLOCK: "Bloco",
  TOWER: "Torre",
  STANDALONE: "Edificação isolada",
  AUXILIARY: "Edificação auxiliar (portaria, casa de gás…)",
  PARKING: "Edifício-garagem",
  OTHER: "Outro",
} as const;

export const locationTypeLabels = {
  FLOOR: "Pavimento",
  ROOM: "Ambiente",
  CIRCULATION: "Circulação",
  TECHNICAL_AREA: "Área técnica",
  EXTERNAL_AREA: "Área externa",
  UNIT: "Unidade privativa",
  OTHER: "Outro",
} as const;

export const floorKindLabels = {
  BASEMENT: "Subsolo",
  GROUND: "Térreo",
  MEZZANINE: "Mezanino",
  STANDARD: "Pavimento-tipo",
  PENTHOUSE: "Ático",
  ROOF: "Cobertura",
  TECHNICAL: "Pavimento técnico",
  OTHER: "Outro",
} as const;

export const areaClassLabels = { COMMON: "Área comum", PRIVATE: "Área privativa", UNDEFINED: "Não classificada" } as const;

export const unitTypeLabels = {
  RESIDENTIAL: "Residencial",
  COMMERCIAL: "Comercial",
  INDUSTRIAL: "Industrial",
  INSTITUTIONAL: "Institucional",
  OTHER: "Outro",
} as const;

export const responsibleRoleLabels = {
  SYNDIC: "Síndico",
  SUB_SYNDIC: "Subsíndico",
  ADMINISTRATOR: "Administradora",
  FACILITY_MANAGER: "Gestor predial",
  CARETAKER: "Zelador",
  MAINTENANCE_MANAGER: "Responsável pela manutenção",
  TECHNICAL_MANAGER: "Responsável técnico",
  ADMIN_CONTACT: "Contato administrativo",
  OTHER: "Outro",
} as const;

export const historyCategoryLabels = {
  CONSTRUCTION: "Construção",
  EXPANSION: "Ampliação",
  RENOVATION: "Reforma",
  USE_CHANGE: "Alteração de uso",
  RELEVANT_INTERVENTION: "Intervenção relevante",
  INCIDENT: "Incidente",
  RELEVANT_OCCURRENCE: "Ocorrência relevante",
  REGISTRY_UPDATE: "Atualização cadastral",
  OTHER: "Outros acontecimentos",
} as const;

export const roleLabels = { ADMIN: "Administrador", EDITOR: "Editor", VIEWER: "Consulta" } as const;

export type Labels = Record<string, string>;
