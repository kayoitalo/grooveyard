import fs from "node:fs";
import path from "node:path";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL no .env antes de continuar.");
if (process.env.AUTH_PASSWORD_HASH && !process.argv.includes("--reset")) {
  console.log("O acesso já está configurado. Para trocar a senha e revogar as sessões, use --reset.");
  process.exit(0);
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  let user;
  if (process.env.AUTH_USER_ID) {
    user = await db.user.findUnique({ where: { id: process.env.AUTH_USER_ID } });
    if (!user) throw new Error("AUTH_USER_ID não corresponde a uma conta existente.");
  } else {
    const users = await db.user.findMany({ select: { id: true }, take: 2 });
    if (users.length > 1) throw new Error("Há várias contas. Defina explicitamente AUTH_USER_ID no .env.");
    user = users[0] || await db.user.create({ data: { email: "owner@arcadium.local", displayName: "Minha sala" } });
  }
  const password = randomBytes(24).toString("base64url");
  const salt = randomBytes(16).toString("hex");
  const key = await promisify(scrypt)(password, salt, 64);
  const values = {
    AUTH_USER_ID: user.id,
    AUTH_PASSWORD_HASH: `scrypt:${salt}:${key.toString("hex")}`,
    APP_ORIGIN: process.env.APP_ORIGIN || "http://127.0.0.1:3000",
  };
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  for (const [name, value] of Object.entries(values)) {
    const line = `${name}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^${name}=.*$`, "m");
    content = pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(envPath, content, { mode: 0o600 });
  console.log("Acesso configurado para a conta:", user.id);
  console.log("Sua senha (guarde no gerenciador de senhas):", password);
  console.log("Abra", `${values.APP_ORIGIN}/login`);
  console.log("Na hospedagem, configure AUTH_USER_ID, AUTH_PASSWORD_HASH e APP_ORIGIN (HTTPS) antes do deploy.");
} finally { await db.$disconnect(); }
