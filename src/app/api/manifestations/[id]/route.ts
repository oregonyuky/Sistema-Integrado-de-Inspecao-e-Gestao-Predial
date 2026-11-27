import { route, body, optBody, query } from "@/server/http";
import { updateManifestation } from "@/server/services/manifestations";

export const PUT = route<{ id: string }>(async (req, ctx, { id }) => updateManifestation(ctx, id, await body(req)));
