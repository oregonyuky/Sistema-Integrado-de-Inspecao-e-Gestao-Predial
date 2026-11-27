import { route, body, optBody, query } from "@/server/http";
import { reactivateCatalogItem } from "@/server/services/catalog";

export const POST = route<{ id: string }>(async (req, ctx, { id }) => { const b = await optBody(req); return reactivateCatalogItem(ctx, id, { includeDescendants: b.includeDescendants === true }); });
