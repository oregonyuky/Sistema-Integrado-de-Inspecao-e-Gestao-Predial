import { route, body, optBody, query } from "@/server/http";
import { setNormStatus } from "@/server/services/norms";

export const POST = route<{ id: string }>(async (_req, ctx, { id }) => setNormStatus(ctx, id, "ACTIVE"));
