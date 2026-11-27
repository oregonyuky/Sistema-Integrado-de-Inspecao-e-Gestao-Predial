import { route, body, optBody, query } from "@/server/http";
import { updateCriterion } from "@/server/services/criteria";

export const PUT = route<{ id: string }>(async (req, ctx, { id }) => updateCriterion(ctx, id, await body(req)));
