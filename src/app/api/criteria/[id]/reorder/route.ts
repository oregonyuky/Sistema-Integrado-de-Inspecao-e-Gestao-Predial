import { route, body, optBody, query } from "@/server/http";
import { reorderCriterion } from "@/server/services/criteria";

export const POST = route<{ id: string }>(async (req, ctx, { id }) => reorderCriterion(ctx, id, await body(req)));
