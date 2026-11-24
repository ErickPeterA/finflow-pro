const DEFAULT_BASE_URL = "https://api.nibo.com.br/empresas/v1";
export const NIBO_PAGE_SIZE = 500;

export type NiboEndpoint = "payments" | "receipts";

export interface NiboApiPage<T = Record<string, unknown>> {
  items: T[];
  count: number;
}

export interface NiboApiClientOptions {
  token: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class NiboApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly endpoint?: NiboEndpoint,
  ) {
    super(message);
    this.name = "NiboApiError";
  }
}

export class NiboApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: NiboApiClientOptions) {
    if (!options.token.trim()) throw new NiboApiError("Token da API do Nibo nao configurado.");
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async testConnection(): Promise<void> {
    await this.getPage("payments", { inicio: "2000-01-01", fim: "2000-01-01", skip: 0, top: 1 });
  }

  async listAll(endpoint: NiboEndpoint, inicio: string, fim: string) {
    const items: Record<string, unknown>[] = [];
    for (let skip = 0; ; skip += NIBO_PAGE_SIZE) {
      const page = await this.getPage(endpoint, { inicio, fim, skip, top: NIBO_PAGE_SIZE });
      items.push(...page.items);
      if (page.items.length < NIBO_PAGE_SIZE || items.length >= page.count) break;
    }
    return items;
  }

  private async getPage(
    endpoint: NiboEndpoint,
    params: { inicio: string; fim: string; skip: number; top: number },
  ): Promise<NiboApiPage> {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    url.searchParams.set("$filter", `date ge ${params.inicio} and date le ${params.fim}`);
    url.searchParams.set("$orderby", "date asc");
    url.searchParams.set("$skip", String(params.skip));
    url.searchParams.set("$top", String(params.top));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json", ApiToken: this.options.token },
        signal: controller.signal,
      });
      if (!response.ok) {
        const friendly =
          response.status === 401 || response.status === 403
            ? "O Nibo recusou a credencial configurada."
            : response.status >= 500
              ? "O Nibo esta temporariamente indisponivel."
              : `Falha ao consultar o Nibo (HTTP ${response.status}).`;
        throw new NiboApiError(friendly, response.status, endpoint);
      }
      if (response.status === 204) return { items: [], count: 0 };
      const body = (await response.json()) as unknown;
      if (Array.isArray(body))
        return { items: body as Record<string, unknown>[], count: body.length };
      if (!body || typeof body !== "object")
        throw new NiboApiError("Resposta invalida do Nibo.", response.status, endpoint);
      const record = body as Record<string, unknown>;
      const rawItems = record["items"] ?? record["value"] ?? record["results"];
      const items = Array.isArray(rawItems) ? (rawItems as Record<string, unknown>[]) : [];
      const countValue = Number(record["count"] ?? record["@odata.count"] ?? items.length);
      return { items, count: Number.isFinite(countValue) ? countValue : items.length };
    } catch (error) {
      if (error instanceof NiboApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new NiboApiError("A consulta ao Nibo excedeu o tempo limite.", undefined, endpoint);
      }
      throw new NiboApiError("Nao foi possivel conectar ao Nibo.", undefined, endpoint);
    } finally {
      clearTimeout(timer);
    }
  }
}
