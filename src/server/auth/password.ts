import bcrypt from "bcryptjs";

const COST = Number(process.env.BCRYPT_COST || 12);
export const hashPassword = (p: string) => bcrypt.hash(p, COST);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);
