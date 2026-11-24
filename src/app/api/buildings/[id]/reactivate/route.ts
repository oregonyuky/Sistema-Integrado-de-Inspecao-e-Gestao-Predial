import { route, body, optBody, query } from "@/server/http";
import { reactivateBuilding } from "@/server/services/buildings";

export const POST = route<{ id: string }>(async (req, ctx, { id }) => {
  const b = await optBody(req);
  return reactivateBuilding(ctx, id, { includeDescendants: b.includeDescendants === true });
});
