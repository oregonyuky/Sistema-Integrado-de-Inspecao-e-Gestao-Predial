import { route, body, optBody, query } from "@/server/http";
import { deselectProjectSystem } from "@/server/services/project-systems";

export const DELETE = route<{ id: string; systemId: string }>(async (_req, ctx, { id, systemId }) => deselectProjectSystem(ctx, id, systemId));
