import { route, body, optBody, query } from "@/server/http";
import { searchSections } from "@/server/services/norms";

export const GET = route(async (req, ctx) => searchSections(ctx, query(req)));
