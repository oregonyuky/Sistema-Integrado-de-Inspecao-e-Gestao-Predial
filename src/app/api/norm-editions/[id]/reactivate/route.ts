import { route, body, optBody, query } from "@/server/http";
import { setEditionStatus } from "@/server/services/norms";

export const POST = route<{ id: string }>(async (_req, ctx, { id }) => setEditionStatus(ctx, id, "ACTIVE"));
