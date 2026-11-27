import { route, body, optBody, query } from "@/server/http";
import { listComponents, createComponent } from "@/server/services/components";

export const GET = route<{ id: string }>(async (req, ctx, { id }) => listComponents(ctx, id, query(req)));
export const POST = route<{ id: string }>(async (req, ctx, { id }) => createComponent(ctx, id, await body(req)), { status: 201 });
