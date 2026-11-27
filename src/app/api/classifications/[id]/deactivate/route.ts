import { route, body, optBody, query } from "@/server/http";
import { setClassificationStatus } from "@/server/services/manifestations";

export const POST = route<{ id: string }>(async (_req, ctx, { id }) => setClassificationStatus(ctx, id, "INACTIVE"));
