import { route, body, optBody, query } from "@/server/http";
import { setSectionStatus } from "@/server/services/norms";

export const POST = route<{ id: string }>(async (_req, ctx, { id }) => setSectionStatus(ctx, id, "INACTIVE"));
