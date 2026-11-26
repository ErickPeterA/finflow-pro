type NiboEnvironment = Record<string, string | undefined>;

export function tokensNiboPorEmpresa(raw: string | undefined) {
  if (!raw?.trim()) return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .map(([empresaId, token]) => [empresaId.trim(), token.trim()])
        .filter(([empresaId, token]) => empresaId && token),
    );
  } catch {
    throw new Error("NIBO_API_TOKENS_JSON deve ser um objeto JSON valido.");
  }
}

export function tokenNiboDaEmpresa(empresaId: string, env: NiboEnvironment = process.env) {
  const token = tokensNiboPorEmpresa(env["NIBO_API_TOKENS_JSON"])[empresaId];
  if (token) return token;

  // Compatibilidade durante a migracao da configuracao de empresa unica.
  const legacyEmpresaId = env["NIBO_HARTWIG_EMPRESA_ID"]?.trim();
  if (legacyEmpresaId === empresaId) return env["NIBO_HARTWIG_API_TOKEN"]?.trim() ?? "";
  return "";
}

export function dataInicialNiboLegada(empresaId: string, env: NiboEnvironment = process.env) {
  const legacyEmpresaId = env["NIBO_HARTWIG_EMPRESA_ID"]?.trim();
  return legacyEmpresaId === empresaId
    ? (env["NIBO_HARTWIG_SYNC_START_DATE"]?.trim() ?? null)
    : null;
}
