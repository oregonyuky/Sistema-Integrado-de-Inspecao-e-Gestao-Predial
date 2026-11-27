import { route, body, optBody, query } from "@/server/http";
import { updateSection } from "@/server/services/norms";

export const PUT = route<{ id: string }>(async (req, ctx, { id }) => updateSection(ctx, id, await body(req)));
