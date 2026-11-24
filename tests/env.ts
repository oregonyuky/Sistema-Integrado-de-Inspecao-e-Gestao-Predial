import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Os testes sempre usam o banco de teste (apagado e recriado em global-setup).
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://siigp:siigp@localhost:5432/siigp_test";
process.env.SESSION_SECRET ||= "test-secret-test-secret-test-secret-0123456789";
process.env.BCRYPT_COST = "4";
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "siigp-storage-"));
