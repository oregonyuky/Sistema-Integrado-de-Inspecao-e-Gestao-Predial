import { route, body, optBody, query } from "@/server/http";
import { updateEdition } from "@/server/services/norms";

export const PUT = route<{ id: string }>(async (req, ctx, { id }) => updateEdition(ctx, id, await body(req)));
