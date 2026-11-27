import { route, body, optBody, query } from "@/server/http";
import { updateClassification } from "@/server/services/manifestations";

export const PUT = route<{ id: string }>(async (req, ctx, { id }) => updateClassification(ctx, id, await body(req)));
