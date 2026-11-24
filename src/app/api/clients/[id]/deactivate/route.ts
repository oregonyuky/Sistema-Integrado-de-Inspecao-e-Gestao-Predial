import { route, body, optBody, query } from "@/server/http";
import { deactivateClient } from "@/server/services/clients";

export const POST = route<{ id: string }>(async (_req, ctx, { id }) => deactivateClient(ctx, id));
