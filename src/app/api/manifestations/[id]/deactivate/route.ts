import { route, body, optBody, query } from "@/server/http";
import { setManifestationStatus } from "@/server/services/manifestations";

export const POST = route<{ id: string }>(async (_req, ctx, { id }) => setManifestationStatus(ctx, id, "INACTIVE"));
