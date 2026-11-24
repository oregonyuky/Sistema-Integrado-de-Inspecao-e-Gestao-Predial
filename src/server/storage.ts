import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { AppError } from "./errors";

/**
 * Armazenamento local de anexos, FORA de /public. O acesso só ocorre pela API
 * autenticada, que confere organização e vínculo com o histórico.
 * Para produção multi-instância, troque este módulo por um provedor de objetos
 * (S3/GCS) mantendo a mesma interface.
 */
const root = () => path.resolve(process.env.STORAGE_DIR || "./storage");

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

const ALLOWED: Record<string, { mime: string[]; magic?: (b: Buffer) => boolean }> = {
  ".pdf": { mime: ["application/pdf"], magic: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  ".png": { mime: ["image/png"], magic: (b) => b.subarray(1, 4).toString("latin1") === "PNG" },
  ".jpg": { mime: ["image/jpeg"], magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  ".jpeg": { mime: ["image/jpeg"], magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  ".webp": { mime: ["image/webp"], magic: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" },
  ".txt": { mime: ["text/plain"] },
  ".csv": { mime: ["text/csv", "application/vnd.ms-excel", "text/plain"] },
  ".docx": { mime: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], magic: (b) => b[0] === 0x50 && b[1] === 0x4b },
  ".xlsx": { mime: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], magic: (b) => b[0] === 0x50 && b[1] === 0x4b },
};

export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED);

export function validateUpload(fileName: string, _mime: string, data: Buffer) {
  if (data.length === 0) throw new AppError(422, "VALIDATION", "O arquivo está vazio.");
  if (data.length > MAX_ATTACHMENT_BYTES) throw new AppError(413, "TOO_LARGE", "O arquivo excede o limite de 15 MB.");
  const ext = path.extname(fileName).toLowerCase();
  const rule = ALLOWED[ext];
  if (!rule) throw new AppError(422, "VALIDATION", `Tipo de arquivo não permitido. Aceitos: ${ALLOWED_EXTENSIONS.join(", ")}.`);
  if (rule.magic && !rule.magic(data)) throw new AppError(422, "VALIDATION", "O conteúdo do arquivo não corresponde à extensão informada.");
  return { ext, mime: rule.mime[0] };
}

/** Remove caracteres de controle e separadores de caminho do nome exibido. */
export function safeFileName(name: string) {
  const base = path.basename(name.replace(/\\/g, "/")).replace(/[\u0000-\u001f"<>|:*?]/g, "_").trim();
  return (base || "arquivo").slice(0, 180);
}

export async function saveFile(orgId: string, historyId: string, data: Buffer) {
  const key = `${orgId}/${historyId}/${crypto.randomUUID()}`;
  const full = resolveKey(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data, { mode: 0o600 });
  return key;
}

export async function readFile(key: string) {
  return fs.readFile(resolveKey(key));
}

export async function removeFile(key: string) {
  await fs.rm(resolveKey(key), { force: true });
}

function resolveKey(key: string) {
  const full = path.resolve(root(), key);
  if (!full.startsWith(root() + path.sep)) throw new AppError(400, "BAD_REQUEST", "Caminho inválido.");
  return full;
}
