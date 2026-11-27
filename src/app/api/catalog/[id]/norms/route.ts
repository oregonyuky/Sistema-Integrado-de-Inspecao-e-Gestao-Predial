import { route, body, optBody, query } from "@/server/http";
import { listCatalogNorms, addCatalogNormLink } from "@/server/services/norms";

export const GET = route<{ id: string }>(async (_req, ctx, { id }) => listCatalogNorms(ctx, id));
export const POST = route<{ id: string }>(async (req, ctx, { id }) => addCatalogNormLink(ctx, id, await body(req)), { status: 201 });
