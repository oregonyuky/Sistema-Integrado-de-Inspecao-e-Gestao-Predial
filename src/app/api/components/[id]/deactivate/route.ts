import { route, body, optBody, query } from "@/server/http";
import { deactivateComponent } from "@/server/services/components";

export const POST = route<{ id: string }>(async (_req, ctx, { id }) => deactivateComponent(ctx, id));
