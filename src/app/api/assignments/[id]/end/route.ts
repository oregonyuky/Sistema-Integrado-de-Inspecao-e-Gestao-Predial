import { route, body, optBody, query } from "@/server/http";
import { endAssignment } from "@/server/services/responsibles";

export const POST = route<{ id: string }>(async (req, ctx, { id }) => {
  const b = await optBody(req);
  return endAssignment(ctx, id, b.endDate);
});
