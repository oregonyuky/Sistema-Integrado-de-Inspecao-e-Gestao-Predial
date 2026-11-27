import { route, body, optBody, query } from "@/server/http";
import { createSection } from "@/server/services/norms";

export const POST = route<{ id: string }>(async (req, ctx, { id }) => createSection(ctx, id, await body(req)), { status: 201 });
