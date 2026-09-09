import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import { hashPassword } from "../lib/auth.server";
import { withTransaction } from "../lib/postgres";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Uso: npm run auth:set-password -- email@empresa.com");
  process.exit(1);
}
if (!process.stdin.isTTY) {
  console.error("Este comando requer um terminal interativo.");
  process.exit(1);
}

let ocultar = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!ocultar) process.stdout.write(chunk, encoding as BufferEncoding);
    callback();
  },
});
const terminal = createInterface({ input: process.stdin, output, terminal: true });

async function solicitarSenha(label: string) {
  process.stdout.write(label);
  ocultar = true;
  const senha = await terminal.question("");
  ocultar = false;
  process.stdout.write("\n");
  return senha;
}

try {
  const senha = await solicitarSenha("Nova senha: ");
  const confirmacao = await solicitarSenha("Confirme a senha: ");
  if (senha.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
  if (senha !== confirmacao) throw new Error("As senhas não coincidem.");
  const passwordHash = await hashPassword(senha);
  await withTransaction(async (client) => {
    const result = await client.query<{ id: string }>("update users set password_hash=$1,password_changed_at=now() where lower(email)=$2 returning id", [passwordHash,email]);
    if (!result.rowCount) throw new Error("Usuário não encontrado.");
    await client.query("update auth_sessions set revoked_at=now() where user_id=$1 and revoked_at is null", [result.rows[0]!.id]);
  });
  console.log(`Senha atualizada para ${email}; sessões anteriores foram revogadas.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Não foi possível atualizar a senha.");
  process.exitCode = 1;
} finally {
  terminal.close();
}
