const DEFAULT_BASE_URL = "https://api.nibo.com.br/empresas/v1";
export const NIBO_PAGE_SIZE = 500;

export type NiboEndpoint =
  "payments" | "receipts" | "schedules/debit/opened" | "schedules/credit/opened";

export interface NiboApiPage<T = Record<string, unknown>> {
  items: T[];
  count: number;
}

export interface NiboApiClientOptions {
  token: string;
  baseUrl?: string;
  timeoutMs?: number;
  pageConcurrency?: number;
  maxRetries?: number;
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
  private readonly pageConcurrency: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: NiboApiClientOptions) {
    if (!options.token.trim()) throw new NiboApiError("Token da API do Nibo nao configurado.");
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.pageConcurrency = Math.max(1, options.pageConcurrency ?? 4);
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async testConnection(): Promise<void> {
    await this.getPage("payments", { inicio: "2000-01-01", fim: "2000-01-01", skip: 0, top: 1 });
  }

  async listAll(endpoint: NiboEndpoint, inicio: string, fim: string) {
    return this.listPages(endpoint, { inicio, fim });
  }

  async listAllOpenedSchedules(
    endpoint: "schedules/debit/opened" | "schedules/credit/opened",
    dueDateEnd?: string,
  ) {
    return this.listPages(endpoint, dueDateEnd ? { dueDateEnd } : {});
  }

  private async listPages(
    endpoint: NiboEndpoint,
    filter: { inicio?: string; fim?: string; dueDateEnd?: string },
  ) {
    const first = await this.getPage(endpoint, { ...filter, skip: 0, top: NIBO_PAGE_SIZE });
    if (first.items.length >= first.count || first.items.length < NIBO_PAGE_SIZE)
      return first.items;

    const offsets: number[] = [];
    for (let skip = NIBO_PAGE_SIZE; skip < first.count; skip += NIBO_PAGE_SIZE) {
      offsets.push(skip);
    }
    const items = [...first.items];
    for (let index = 0; index < offsets.length; index += this.pageConcurrency) {
      const pages = await Promise.all(
        offsets
          .slice(index, index + this.pageConcurrency)
          .map((skip) => this.getPage(endpoint, { ...filter, skip, top: NIBO_PAGE_SIZE })),
      );
      for (const page of pages) items.push(...page.items);
    }
    return items.slice(0, first.count);
  }

  private async getPage(
    endpoint: NiboEndpoint,
    params: { inicio?: string; fim?: string; dueDateEnd?: string; skip: number; top: number },
  ): Promise<NiboApiPage> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.requestPage(endpoint, params);
      } catch (error) {
        lastError = error;
        if (!this.isRetryable(error) || attempt === this.maxRetries) throw error;
        await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
      }
    }
    throw lastError;
  }

  private isRetryable(error: unknown) {
    return (
      error instanceof NiboApiError &&
      (error.status === undefined || error.status === 429 || error.status >= 500)
    );
  }

  private async requestPage(
    endpoint: NiboEndpoint,
    params: { inicio?: string; fim?: string; dueDateEnd?: string; skip: number; top: number },
  ): Promise<NiboApiPage> {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    if (params.inicio && params.fim) {
      url.searchParams.set("$filter", `date ge ${params.inicio} and date le ${params.fim}`);
    } else if (params.dueDateEnd) {
      url.searchParams.set("$filter", `dueDate le ${params.dueDateEnd}`);
    }
    url.searchParams.set(
      "$orderby",
      endpoint.startsWith("schedules/") ? "dueDate asc,scheduleId asc" : "date asc,entryId asc",
    );
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
