/**
 * Aplica as migrations de prisma/migrations diretamente com `pg`, registrando-as
 * em `_prisma_migrations` (mesmo formato do Prisma, com checksum SHA-256).
 * Alternativa sem binários ao `prisma migrate deploy` (ex.: CI/sandbox sem acesso
 * a binaries.prisma.sh). Pode ser usado antes de `prisma migrate deploy`: o Prisma
 * reconhecerá as migrations como já aplicadas.
 *
 *   npm run db:apply            → aplica as pendentes
 *   npm run db:apply -- --reset → APAGA o schema public e reaplica tudo
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Client } from "pg";

export async function applyMigrations(databaseUrl: string, opts: { reset?: boolean } = {}) {
  const dir = path.join(process.cwd(), "prisma", "migrations");
  const names = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    if (opts.reset) {
      await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    }
    await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      id VARCHAR(36) PRIMARY KEY NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      finished_at TIMESTAMPTZ,
      migration_name VARCHAR(255) NOT NULL,
      logs TEXT,
      rolled_back_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_steps_count INTEGER NOT NULL DEFAULT 0
    )`);
    const done = new Set(
      (await client.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`)).rows.map(
        (r) => r.migration_name as string,
      ),
    );
    const applied: string[] = [];
    for (const name of names) {
      if (done.has(name)) continue;
      const sql = fs.readFileSync(path.join(dir, name, "migration.sql"), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count)
           VALUES ($1, $2, $3, now(), 1)`,
          [crypto.randomUUID(), checksum, name],
        );
        await client.query("COMMIT");
        applied.push(name);
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(`Falha na migration ${name}: ${(e as Error).message}`);
      }
    }
    return applied;
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("db-apply.ts")) {
  (async () => {
    await import("dotenv/config");
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não definido");
    const applied = await applyMigrations(url, { reset: process.argv.includes("--reset") });
    console.log(applied.length ? `Migrations aplicadas: ${applied.join(", ")}` : "Nenhuma migration pendente.");
  })().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
