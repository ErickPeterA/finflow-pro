export function logInfo(message: string, data?: Record<string, unknown>) {
  console.log(JSON.stringify({ level: "info", message, ...data }));
}

export function logError(message: string, data?: Record<string, unknown>) {
  console.error(JSON.stringify({ level: "error", message, ...data }));
}

export function erroParaTexto(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const partes = [
      record["message"],
      record["details"],
      record["hint"] ? `hint: ${record["hint"]}` : null,
      record["code"] ? `code: ${record["code"]}` : null,
    ].filter(Boolean);
    if (partes.length) return partes.join(" | ");

    try {
      return JSON.stringify(error);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error);
}
