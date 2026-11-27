import { route, body, optBody, query } from "@/server/http";
import { reactivateComponent } from "@/server/services/components";

export const POST = route<{ id: string }>(async (_req, ctx, { id }) => reactivateComponent(ctx, id));
