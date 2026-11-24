import { route, body, optBody, query } from "@/server/http";
import { reactivateClient } from "@/server/services/clients";

export const POST = route<{ id: string }>(async (_req, ctx, { id }) => reactivateClient(ctx, id));
