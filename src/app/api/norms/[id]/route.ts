import { route, body, optBody, query } from "@/server/http";
import { updateNorm } from "@/server/services/norms";

export const PUT = route<{ id: string }>(async (req, ctx, { id }) => updateNorm(ctx, id, await body(req)));
