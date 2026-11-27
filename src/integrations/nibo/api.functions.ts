import { createServerFn } from "@tanstack/react-start";
import { requireAuthenticatedUser } from "@/lib/auth-middleware";
import { assertEmpresaAccess } from "@/lib/authorization";
import { query, withTransaction } from "@/lib/postgres";
import { NiboApiClient } from "./api-client";
import { dataInicialNiboLegada, tokenNiboDaEmpresa } from "./api-config";
import {
  adaptarAgendamentosAbertosNibo,
  adaptarBaixasNibo,
  coletarNomesCentrosCustoNibo,
  deveEntrarDreNibo,
  obterIdOriginalNibo,
  type NiboApiLinha,
} from "./api-adapter";

type SyncInput = { empresaId: string };

function apiClient(empresaId: string) {
  const baseUrl = process.env["NIBO_API_BASE_URL"];
  return new NiboApiClient({
    token: tokenNiboDaEmpresa(empresaId),
    ...(baseUrl ? { baseUrl } : {}),
    timeoutMs: Number(process.env["NIBO_API_TIMEOUT_MS"] ?? 60_000),
    pageConcurrency: Number(process.env["NIBO_API_PAGE_CONCURRENCY"] ?? 4),
    maxRetries: Number(process.env["NIBO_API_MAX_RETRIES"] ?? 2),
  });
}

async function config(empresaId: string) {
  const result = await query<{
    empresa_id: string;
    nome: string;
    sync_start_date: string | null;
    last_verified_at: string | null;
    nibo_company_id: string | null;
    nibo_company_name: string | null;
  }>(
    "select e.id as empresa_id,e.nome,c.sync_start_date,c.last_verified_at,c.nibo_company_id,c.nibo_company_name from empresas e join nibo_project_configs c on c.empresa_id=e.id and c.nibo_enabled=true where e.id=$1::uuid and e.ativo=true",
    [empresaId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return row;
}

function hojeEmSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function fimDoProximoMes(hoje: string) {
  const [ano, mes] = hoje.split("-").map(Number);
  if (!ano || !mes) throw new Error("Nao foi possivel determinar o periodo de sincronizacao.");
  return new Date(Date.UTC(ano, mes + 1, 0)).toISOString().slice(0, 10);
}

function normalizarCategoria(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function persistirTitulosAbertos(
  empresaId: string,
  tipo: "paga" | "recebida",
  linhas: ReturnType<typeof adaptarAgendamentosAbertosNibo>,
) {
  return withTransaction(async (client) => {
    const ids = linhas.map((linha) => linha.external_id);
    const existentes = await client.query<{ external_id: string }>(
      "select external_id from fluxo_titulos_nibo where empresa_id=$1::uuid and external_source='nibo_api_fluxo' and tipo=$2",
      [empresaId, tipo],
    );
    const idsExistentes = new Set(existentes.rows.map((row) => row.external_id));
    const novas = linhas.filter((linha) => !idsExistentes.has(linha.external_id)).length;
    const atualizadas = linhas.length - novas;

    for (let offset = 0; offset < linhas.length; offset += 200) {
      const batch = linhas.slice(offset, offset + 200);
      await client.query(
        `insert into fluxo_titulos_nibo
          (empresa_id,tipo,vencimento,data_projetada,competencia,descricao,categoria_nibo,pessoa,centro_custo,valor,status,hash,external_source,external_id,source_content_hash,payload)
         select $1::uuid,x.tipo::tipo_lancamento,x.vencimento::date,x.data_projetada::date,
          x.competencia::date,x.descricao,x.categoria_nibo,x.pessoa,x.centro_custo,x.valor,
          x.status,x.hash,'nibo_api_fluxo',x.external_id,x.source_content_hash,x.payload
         from jsonb_to_recordset($2::jsonb) as x(
          tipo text,vencimento text,data_projetada text,competencia text,descricao text,
          categoria_nibo text,pessoa text,centro_custo text,valor numeric,status text,
          hash text,external_id text,source_content_hash text,payload jsonb)
         on conflict (empresa_id,external_source,external_id)
          where external_source is not null and external_id is not null
         do update set
          tipo=excluded.tipo,vencimento=excluded.vencimento,data_projetada=excluded.data_projetada,
          competencia=excluded.competencia,descricao=excluded.descricao,categoria_nibo=excluded.categoria_nibo,
          pessoa=excluded.pessoa,centro_custo=excluded.centro_custo,valor=excluded.valor,
          status=excluded.status,hash=excluded.hash,source_content_hash=excluded.source_content_hash,
          payload=excluded.payload`,
        [empresaId, JSON.stringify(batch)],
      );
    }

    const removidas = await client.query(
      `delete from fluxo_titulos_nibo
       where empresa_id=$1::uuid and external_source='nibo_api_fluxo' and tipo=$2
         and (cardinality($3::text[])=0 or not (external_id = any($3::text[])))`,
      [empresaId, tipo, ids],
    );
    return { encontradas: linhas.length, novas, atualizadas, removidas: removidas.rowCount ?? 0 };
  });
}

async function persistir(
  empresaId: string,
  runId: string,
  inicio: string,
  fim: string,
  tipoLancamento: "paga" | "recebida",
  linhas: NiboApiLinha[],
  idsFiltrados: string[] = [],
) {
  return withTransaction(async (client) => {
    const idsAtuais = linhas.map((linha) => linha.external_id);
    // A consulta da API e a fonte autoritativa para o periodo. Esta reconciliacao
    // remove transferencias, baixas desconciliadas, rateios alterados e registros
    // que foram excluidos no Nibo, evitando residuos de sincronizacoes anteriores.
    await client.query(
      `delete from lancamentos
       where empresa_id=$1::uuid and tipo=$2 and external_source='nibo_api'
         and data_efetiva between $3::date and $4::date
         and (cardinality($5::text[])=0 or not (external_id = any($5::text[])))`,
      [empresaId, tipoLancamento, inicio, fim, idsAtuais],
    );
    if (idsFiltrados.length) {
      await client.query(
        "delete from lancamentos where empresa_id=$1::uuid and tipo=$2 and external_source='nibo_api' and external_id like any($3::text[])",
        [empresaId, tipoLancamento, idsFiltrados.map((id) => `${id}:%`)],
      );
    }
    if (!linhas.length) return { novas: 0, atualizadas: 0, ignoradas: 0 };
    const maps = await client.query<{ categoria_nibo: string; categoria_id: string | null }>(
      "select categoria_nibo,categoria_id from mapeamentos where empresa_id=$1::uuid",
      [empresaId],
    );
    const mapa = new Map(
      maps.rows.map((row) => [normalizarCategoria(row.categoria_nibo), row.categoria_id]),
    );
    const existentes = await client.query<{
      external_id: string;
      source_content_hash: string | null;
    }>(
      `select external_id,source_content_hash from lancamentos
       where empresa_id=$1::uuid and tipo=$2 and external_source='nibo_api'
         and data_efetiva between $3::date and $4::date`,
      [empresaId, tipoLancamento, inicio, fim],
    );
    const hashesExistentes = new Map(
      existentes.rows.map((row) => [row.external_id, row.source_content_hash]),
    );
    const tipo = linhas[0]!.tipo;
    const imp = await client.query<{ id: string }>(
      "insert into importacoes (empresa_id,tipo,competencia,arquivo_nome,origem,total_registros,valor_total,duplicados,status,periodo_inicio,periodo_fim,nibo_sync_run_id) values ($1,$2,$3,$4,'nibo_auto',$5,$6,0,'processando',$7,$8,$9) returning id",
      [
        empresaId,
        tipo,
        `${inicio.slice(0, 7)}-01`,
        `API Nibo ${tipo} ${inicio} a ${fim}`,
        linhas.length,
        linhas.reduce((sum, row) => sum + row.valor, 0),
        inicio,
        fim,
        runId,
      ],
    );
    let novas = 0;
    let atualizadas = 0;
    let ignoradas = 0;
    for (const row of linhas) {
      const externalId = row.external_id;
      if (!externalId) throw new Error("Lancamento Nibo sem identificador externo.");
      const hashExistente = hashesExistentes.get(externalId);
      if (hashExistente === row.source_content_hash) {
        ignoradas++;
        continue;
      }
      await client.query(
        `insert into lancamentos (empresa_id,importacao_id,tipo,data_efetiva,competencia,descricao,categoria_nibo,categoria_id,pessoa,centro_custo,conta_bancaria,valor,hash,origem,external_source,external_id,source_content_hash)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'nibo_auto','nibo_api',$14,$15)
         on conflict (empresa_id,external_source,external_id) do update set tipo=excluded.tipo,data_efetiva=excluded.data_efetiva,competencia=excluded.competencia,descricao=excluded.descricao,categoria_nibo=excluded.categoria_nibo,categoria_id=excluded.categoria_id,pessoa=excluded.pessoa,centro_custo=excluded.centro_custo,conta_bancaria=excluded.conta_bancaria,valor=excluded.valor,hash=excluded.hash,source_content_hash=excluded.source_content_hash,origem='nibo_auto'`,
        [
          empresaId,
          imp.rows[0]!.id,
          row.tipo,
          row.data_efetiva,
          row.competencia,
          row.descricao,
          row.categoria_nibo || null,
          mapa.get(normalizarCategoria(row.categoria_nibo)) ?? null,
          row.pessoa || null,
          row.centro_custo || null,
          row.conta_bancaria || null,
          row.valor,
          row.hash,
          row.external_id,
          row.source_content_hash,
        ],
      );
      if (hashesExistentes.has(externalId)) atualizadas++;
      else novas++;
    }
    await client.query(
      "update importacoes set status='concluida',total_registros=$1,duplicados=$2 where id=$3::uuid",
      [novas + atualizadas, ignoradas, imp.rows[0]!.id],
    );
    return { novas, atualizadas, ignoradas };
  });
}

export const obterStatusNiboApi = createServerFn({ method: "GET" })
  .middleware([requireAuthenticatedUser])
  .validator((data: { empresaId: string }) => data)
  .handler(async ({ context, data }) => {
    await assertEmpresaAccess(String(context.userId), data.empresaId);
    const cfg = await config(data.empresaId);
    if (!cfg)
      return {
        disponivel: false,
        status: "indisponivel" as const,
        ultimaSincronizacao: null,
        syncStartDate: null,
      };
    const last = await query<{ finished_at: string; status: string }>(
      "select r.finished_at,r.status from nibo_sync_runs r join nibo_sync_items i on i.run_id=r.id where i.empresa_id=$1::uuid and r.status<>'running' order by r.finished_at desc nulls last limit 1",
      [data.empresaId],
    );
    return {
      disponivel: true,
      status: tokenNiboDaEmpresa(data.empresaId)
        ? ("conectado" as const)
        : ("nao_configurado" as const),
      ultimaSincronizacao: last.rows[0]?.finished_at ?? null,
      ultimoResultado: last.rows[0]?.status ?? null,
      syncStartDate: cfg.sync_start_date ?? dataInicialNiboLegada(data.empresaId),
    };
  });

export const testarConexaoNiboApi = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator((data: { empresaId: string }) => data)
  .handler(async ({ context, data }) => {
    await assertEmpresaAccess(String(context.userId), data.empresaId);
    if (!(await config(data.empresaId)))
      throw new Error("Integracao Nibo nao habilitada para esta empresa.");
    await apiClient(data.empresaId).testConnection();
    await query(
      "update nibo_project_configs set last_verified_at=now() where empresa_id=$1::uuid",
      [data.empresaId],
    );
    return { ok: true };
  });

export const sincronizarNiboApi = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator((data: SyncInput) => data)
  .handler(async ({ context, data }) => {
    await assertEmpresaAccess(String(context.userId), data.empresaId);
    const cfg = await config(data.empresaId);
    if (!cfg) throw new Error("Integracao Nibo nao habilitada para esta empresa.");
    const startDate = cfg.sync_start_date ?? dataInicialNiboLegada(data.empresaId);
    if (!startDate) throw new Error("Defina a data inicial da integracao Nibo para esta empresa.");
    const hoje = hojeEmSaoPaulo();
    if (startDate > hoje)
      throw new Error(`A data inicial da integracao (${startDate}) esta no futuro.`);
    const run = await query<{ id: string }>(
      "insert into nibo_sync_runs (trigger_source,status,created_by,projects_total) values ('manual','running',$1::uuid,1) returning id",
      [String(context.userId)],
    );
    const client = apiClient(data.empresaId);
    const result = {
      pagas: {
        encontradas: 0,
        novas: 0,
        atualizadas: 0,
        ignoradas: 0,
        periodoInicio: null as string | null,
        periodoFim: null as string | null,
        erro: null as string | null,
      },
      recebidas: {
        encontradas: 0,
        novas: 0,
        atualizadas: 0,
        ignoradas: 0,
        periodoInicio: null as string | null,
        periodoFim: null as string | null,
        erro: null as string | null,
      },
    };
    const nomesCentros = new Map<string, string>();
    for (const entry of [
      { endpoint: "payments" as const, tipo: "paga" as const, key: "pagas" as const },
      { endpoint: "receipts" as const, tipo: "recebida" as const, key: "recebidas" as const },
    ]) {
      const ultimaSincronizacao = await query<{ periodo_fim: string }>(
        `select i.periodo_fim::text from nibo_sync_items i
         where i.empresa_id=$1::uuid and i.tipo=$2 and i.status='success'
         order by i.finished_at desc nulls last limit 1`,
        [data.empresaId, entry.tipo],
      );
      // Repete o ultimo dia conferido para capturar conciliacoes e alteracoes
      // feitas no Nibo depois da sincronizacao anterior, sem reler todo o historico.
      const ultimoFim = ultimaSincronizacao.rows[0]?.periodo_fim;
      const inicio =
        ultimoFim && ultimoFim >= startDate && ultimoFim <= hoje ? ultimoFim : startDate;
      const fim = hoje;
      const item = await query<{ id: string }>(
        "insert into nibo_sync_items (run_id,empresa_id,tipo,nibo_company_id,nibo_company_name,periodo_inicio,periodo_fim,status) values ($1::uuid,$2::uuid,$3,$4,$5,$6::date,$7::date,'running') returning id",
        [
          run.rows[0]!.id,
          data.empresaId,
          entry.tipo,
          cfg.nibo_company_id ?? "hartwig-api",
          cfg.nibo_company_name ?? cfg.nome,
          inicio,
          fim,
        ],
      );
      try {
        const raw = await client.listAll(entry.endpoint, inicio, fim);
        coletarNomesCentrosCustoNibo(raw, nomesCentros);
        result[entry.key].encontradas = raw.length;
        const elegiveis = raw.filter(deveEntrarDreNibo);
        const filtradas = raw.filter((item) => !deveEntrarDreNibo(item));
        const idsFiltrados = filtradas.map(obterIdOriginalNibo).filter(Boolean);
        const persisted = await persistir(
          data.empresaId,
          run.rows[0]!.id,
          inicio,
          fim,
          entry.tipo,
          adaptarBaixasNibo(elegiveis, entry.tipo, nomesCentros),
          idsFiltrados,
        );
        Object.assign(result[entry.key], persisted, {
          ignoradas: persisted.ignoradas + filtradas.length,
          periodoInicio: inicio,
          periodoFim: fim,
        });
        await query(
          "update nibo_sync_items set status='success',finished_at=now(),registros_encontrados=$1,registros_inseridos=$2,registros_atualizados=$3,registros_ignorados=$4 where id=$5::uuid",
          [
            result[entry.key].encontradas,
            result[entry.key].novas,
            result[entry.key].atualizadas,
            result[entry.key].ignoradas,
            item.rows[0]!.id,
          ],
        );
      } catch (error) {
        result[entry.key].erro = error instanceof Error ? error.message : "Falha desconhecida.";
        await query(
          "update nibo_sync_items set status='failed',finished_at=now(),registros_encontrados=$1,error_message=$2 where id=$3::uuid",
          [result[entry.key].encontradas, result[entry.key].erro, item.rows[0]!.id],
        );
      }
    }
    const errors = [result.pagas.erro, result.recebidas.erro].filter(Boolean);
    const status =
      errors.length === 0 ? "success" : errors.length === 1 ? "partial_success" : "failed";
    await query(
      "update nibo_sync_runs set status=$1,finished_at=now(),projects_success=$2,projects_failed=$3,pagas_success=$4,pagas_failed=$5,recebidas_success=$6,recebidas_failed=$7,summary=$8::jsonb,error_message=$9 where id=$10::uuid",
      [
        status,
        status === "success" ? 1 : 0,
        status === "success" ? 0 : 1,
        result.pagas.erro ? 0 : 1,
        result.pagas.erro ? 1 : 0,
        result.recebidas.erro ? 0 : 1,
        result.recebidas.erro ? 1 : 0,
        JSON.stringify(result),
        errors.join(" | ") || null,
        run.rows[0]!.id,
      ],
    );
    return { status, ...result };
  });

export const sincronizarFluxoNiboApi = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator((data: { empresaId: string }) => data)
  .handler(async ({ context, data }) => {
    await assertEmpresaAccess(String(context.userId), data.empresaId);
    const cfg = await config(data.empresaId);
    if (!cfg) throw new Error("Integracao Nibo nao habilitada para esta empresa.");
    const hoje = hojeEmSaoPaulo();
    const horizonteFim = fimDoProximoMes(hoje);
    const run = await query<{ id: string }>(
      "insert into nibo_sync_runs (trigger_source,status,projects_total) values ('manual','running',1) returning id",
    );
    const client = apiClient(data.empresaId);
    const result = {
      pagas: null as Awaited<ReturnType<typeof persistirTitulosAbertos>> | null,
      recebidas: null as Awaited<ReturnType<typeof persistirTitulosAbertos>> | null,
      erros: [] as string[],
    };
    const nomesCentros = new Map<string, string>();
    for (const entry of [
      {
        endpoint: "schedules/debit/opened" as const,
        tipo: "paga" as const,
        key: "pagas" as const,
      },
      {
        endpoint: "schedules/credit/opened" as const,
        tipo: "recebida" as const,
        key: "recebidas" as const,
      },
    ]) {
      const item = await query<{ id: string }>(
        `insert into nibo_sync_items
          (run_id,empresa_id,tipo,nibo_company_id,nibo_company_name,periodo_inicio,periodo_fim,status)
         values ($1::uuid,$2::uuid,$3,$4,$5,$6::date,$7::date,'running') returning id`,
        [
          run.rows[0]!.id,
          data.empresaId,
          entry.tipo,
          cfg.nibo_company_id ?? "nibo-api-fluxo",
          cfg.nibo_company_name ?? cfg.nome,
          hoje,
          horizonteFim,
        ],
      );
      try {
        const raw = await client.listAllOpenedSchedules(entry.endpoint, horizonteFim);
        coletarNomesCentrosCustoNibo(raw, nomesCentros);
        const linhas = adaptarAgendamentosAbertosNibo(raw, entry.tipo, hoje, nomesCentros).filter(
          (linha) => linha.valor > 0,
        );
        result[entry.key] = await persistirTitulosAbertos(data.empresaId, entry.tipo, linhas);
        await query(
          `update nibo_sync_items set status='success',finished_at=now(),
             registros_encontrados=$1,registros_inseridos=$2,registros_atualizados=$3
           where id=$4::uuid`,
          [
            result[entry.key]?.encontradas ?? 0,
            result[entry.key]?.novas ?? 0,
            result[entry.key]?.atualizadas ?? 0,
            item.rows[0]!.id,
          ],
        );
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "falha desconhecida";
        result.erros.push(
          `${entry.tipo === "paga" ? "Contas a pagar" : "Contas a receber"}: ${mensagem}`,
        );
        await query(
          "update nibo_sync_items set status='failed',finished_at=now(),error_message=$1 where id=$2::uuid",
          [mensagem, item.rows[0]!.id],
        );
      }
    }
    const status = result.erros.length
      ? result.erros.length === 1
        ? "partial_success"
        : "failed"
      : "success";
    await query(
      `update nibo_sync_runs set status=$1,finished_at=now(),projects_success=$2,projects_failed=$3,
         pagas_success=$4,pagas_failed=$5,recebidas_success=$6,recebidas_failed=$7,
         summary=$8::jsonb,error_message=$9 where id=$10::uuid`,
      [
        status,
        status === "success" ? 1 : 0,
        status === "success" ? 0 : 1,
        result.pagas ? 1 : 0,
        result.pagas ? 0 : 1,
        result.recebidas ? 1 : 0,
        result.recebidas ? 0 : 1,
        JSON.stringify(result),
        result.erros.join(" | ") || null,
        run.rows[0]!.id,
      ],
    );
    if (!result.pagas && !result.recebidas) throw new Error(result.erros.join(" | "));
    return {
      status,
      horizonteFim,
      ...result,
    };
  });
