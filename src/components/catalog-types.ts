export type CatItem = {
  id: string; parentId: string | null; kind: "SYSTEM" | "SUBSYSTEM" | "TYPE"; code: string; name: string; description: string | null;
  sortOrder: number; status: "ACTIVE" | "INACTIVE"; componentCount: number; criteriaCount: number; normCount: number;
};
export type Criterion = {
  id: string; typeId: string; code: string; label: string; description: string | null; responseType: "PASS_FAIL" | "YES_NO" | "NUMBER" | "TEXT" | "SINGLE_CHOICE";
  required: boolean; unit: string | null; minValue: number | null; maxValue: number | null; options: string[]; sortOrder: number; status: "ACTIVE" | "INACTIVE";
};
export type NormLink = {
  id: string; direct: boolean; inheritedFrom: string | null; notes: string | null; sectionId: string; sectionRef: string; sectionTitle: string;
  edition: string; isCurrentEdition: boolean; normCode: string; normTitle: string; sectionStatus: string;
};
