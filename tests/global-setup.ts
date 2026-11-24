import "dotenv/config";
import { applyMigrations } from "../scripts/db-apply";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://siigp:siigp@localhost:5432/siigp_test";
  await applyMigrations(url, { reset: true });
}
