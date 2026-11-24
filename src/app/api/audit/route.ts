import { route, body, optBody, query } from "@/server/http";
import { listAudit } from "@/server/services/history";
import { invalid } from "@/server/errors";

const ENTITIES = ["client", "project", "project_characteristics", "building", "location", "responsible", "assignment", "history"];

export const GET = route(async (req, ctx) => {
  const { entityType, entityId } = query(req);
  if (!entityType || !ENTITIES.includes(entityType) || !entityId) throw invalid("Informe entityType e entityId válidos.");
  return listAudit(ctx, entityType, entityId);
});
