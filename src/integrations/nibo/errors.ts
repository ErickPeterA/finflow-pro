export class NiboSyncError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "NiboSyncError";
  }
}

export class NiboFlowNotMappedError extends NiboSyncError {
  constructor(area: string) {
    super(
      `Fluxo NIBO ainda nao mapeado para: ${area}. Execute a fase piloto com Playwright MCP antes da sincronizacao real.`,
      "NIBO_FLOW_NOT_MAPPED",
    );
  }
}
