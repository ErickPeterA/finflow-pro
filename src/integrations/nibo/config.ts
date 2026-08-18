import { existsSync } from "node:fs";

export interface NiboRuntimeConfig {
  headless: boolean;
  dryRun: boolean;
  baseUrl: string;
  downloadDir: string;
  storageStatePath: string | null;
  defaultLookbackDays: number;
  initialSyncMaxDays: number;
}

function boolEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value == null || value === "") return defaultValue;
  return ["1", "true", "yes", "sim"].includes(value.toLowerCase());
}

function numberEnv(name: string, defaultValue: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

export function getNiboRuntimeConfig(): NiboRuntimeConfig {
  const storageStatePath =
    process.env["NIBO_STORAGE_STATE"] ||
    (existsSync(".nibo-auth/storageState.json") ? ".nibo-auth/storageState.json" : null);

  return {
    headless: boolEnv("NIBO_HEADLESS", true),
    dryRun: boolEnv("NIBO_DRY_RUN", false),
    baseUrl: process.env["NIBO_BASE_URL"] || "https://www.nibo.com.br/log-in",
    downloadDir: process.env["NIBO_DOWNLOAD_DIR"] || ".nibo-downloads",
    storageStatePath,
    defaultLookbackDays: numberEnv("NIBO_SYNC_LOOKBACK_DAYS", 7),
    initialSyncMaxDays: numberEnv("NIBO_INITIAL_SYNC_MAX_DAYS", 14),
  };
}
