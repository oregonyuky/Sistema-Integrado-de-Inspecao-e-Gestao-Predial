import { route, body, optBody, query } from "@/server/http";
import { updateCharacteristics } from "@/server/services/projects";

export const PUT = route<{ id: string }>(async (req, ctx, { id }) => updateCharacteristics(ctx, id, await body(req)));
