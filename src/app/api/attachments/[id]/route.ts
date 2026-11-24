import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { deleteAttachment, getAttachmentFile } from "@/server/services/history";

/** Download protegido: exige sessão e confere a organização do anexo. */
export const GET = route<{ id: string }>(async (_req, ctx, { id }) => {
  const f = await getAttachmentFile(ctx, id);
  return new NextResponse(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});
export const DELETE = route<{ id: string }>(async (_req, ctx, { id }) => deleteAttachment(ctx, id));
