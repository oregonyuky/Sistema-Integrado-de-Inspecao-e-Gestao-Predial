import { route, body, optBody, query } from "@/server/http";
import { createAssignment, listAssignments } from "@/server/services/responsibles";

export const GET = route<{ id: string }>(async (req, ctx, { id }) => listAssignments(ctx, id, query(req)));
export const POST = route<{ id: string }>(async (req, ctx, { id }) => createAssignment(ctx, id, await body(req)), { status: 201 });
