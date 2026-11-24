import { route, body, optBody, query } from "@/server/http";
import { updateResponsible } from "@/server/services/responsibles";

export const PUT = route<{ id: string }>(async (req, ctx, { id }) => updateResponsible(ctx, id, await body(req)));
