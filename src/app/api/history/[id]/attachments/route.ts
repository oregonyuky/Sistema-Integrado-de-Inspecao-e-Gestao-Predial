import { route } from "@/server/http";
import { invalid } from "@/server/errors";
import { addAttachment } from "@/server/services/history";
import { MAX_ATTACHMENT_BYTES } from "@/server/storage";

export const POST = route<{ id: string }>(
  async (req, ctx, { id }) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw invalid("Selecione um arquivo.");
    if (file.size > MAX_ATTACHMENT_BYTES) throw invalid("O arquivo excede o limite de 15 MB.");
    return addAttachment(ctx, id, { name: file.name, type: file.type, data: Buffer.from(await file.arrayBuffer()) });
  },
  { status: 201 },
);
