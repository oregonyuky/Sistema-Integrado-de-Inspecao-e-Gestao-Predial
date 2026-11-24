import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export type Tx = Prisma.TransactionClient;
export { Prisma };

const g = globalThis as unknown as { __siigpPrisma?: PrismaClient };

function create(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

export const db: PrismaClient = g.__siigpPrisma ?? (g.__siigpPrisma = create());
