import { route, body, optBody, query } from "@/server/http";
import { setCriterionStatus } from "@/server/services/criteria";

export const POST = route<{ id: string }>(async (_req, ctx, { id }) => setCriterionStatus(ctx, id, "ACTIVE"));
