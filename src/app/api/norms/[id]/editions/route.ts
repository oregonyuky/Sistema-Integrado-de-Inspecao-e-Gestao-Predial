import { route, body, optBody, query } from "@/server/http";
import { createEdition } from "@/server/services/norms";

export const POST = route<{ id: string }>(async (req, ctx, { id }) => createEdition(ctx, id, await body(req)), { status: 201 });
