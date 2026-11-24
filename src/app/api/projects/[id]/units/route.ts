import { route, body, optBody, query } from "@/server/http";
import { listUnits } from "@/server/services/locations";

export const GET = route<{ id: string }>(async (req, ctx, { id }) => listUnits(ctx, id, query(req)));
