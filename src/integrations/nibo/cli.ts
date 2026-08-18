import { loadEnvFile } from "node:process";
import { createNiboSyncSupabaseClient } from "./database";
import { runNiboSync } from "./sync";
import { erroParaTexto, logError } from "./logger";

try {
  loadEnvFile(".env");
} catch {
  // Cloud environments should provide variables directly; local .env is optional.
}

const triggerSource = process.env["NIBO_SYNC_TRIGGER"] === "scheduled" ? "scheduled" : "manual";

try {
  const supabase = await createNiboSyncSupabaseClient();
  await runNiboSync(supabase, triggerSource);
} catch (error) {
  logError("nibo_sync_failed", { erro: erroParaTexto(error) });
  process.exitCode = 1;
}
