import { route, body, optBody, query } from "@/server/http";
import { reactivateLocation } from "@/server/services/locations";

export const POST = route<{ id: string }>(async (req, ctx, { id }) => {
  const b = await optBody(req);
  return reactivateLocation(ctx, id, { includeDescendants: b.includeDescendants === true });
});
