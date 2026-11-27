import { route, body, optBody, query } from "@/server/http";
import { getCatalogItem, updateCatalogItem } from "@/server/services/catalog";

export const GET = route<{ id: string }>(async (_req, ctx, { id }) => getCatalogItem(ctx, id));
export const PUT = route<{ id: string }>(async (req, ctx, { id }) => updateCatalogItem(ctx, id, await body(req)));
