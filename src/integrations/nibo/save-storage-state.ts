import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadEnvFile } from "node:process";
import { chromium } from "playwright";
import { getNiboRuntimeConfig } from "./config";

try {
  loadEnvFile(".env");
} catch {
  // Local .env is optional; environment variables can be provided by the shell.
}

const config = getNiboRuntimeConfig();
const storageStatePath = config.storageStatePath || ".nibo-auth/storageState.json";

await mkdir(dirname(storageStatePath), { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

await page.goto(config.baseUrl, { waitUntil: "domcontentloaded" });

console.log("");
console.log("Navegador aberto no NIBO.");
console.log("Faca login manualmente. Nao feche o navegador.");
console.log(`Quando a empresa/lista do NIBO estiver carregada, volte aqui e pressione Enter.`);
console.log("");

const rl = createInterface({ input, output });
await rl.question("Pressione Enter para salvar a sessao NIBO...");
rl.close();

await context.storageState({ path: storageStatePath });
await browser.close();

console.log("");
console.log(`Sessao salva em ${storageStatePath}`);
console.log(
  `Configure NIBO_STORAGE_STATE="${storageStatePath}" no .env para reutilizar essa sessao.`,
);
