import { createServerFn } from "@tanstack/react-start";
import { requireAuthenticatedUser } from "./auth-middleware";
import { assertEmpresaAccess } from "./authorization";
import { query } from "./postgres";

type RequestData = { resource: string; empresaId?: string | null; ano?: number | null; inicio?: string; fim?: string; hoje?: string };

const companyResources = new Set([
  "empresa", "categorias", "lancamentos", "hashes", "anos", "centros", "lancamentosFluxo",
  "lancamentosReceberVencidos", "contas", "saldos", "ajustes", "checklist", "titulos",
  "titulosReceberVencidos", "titulosPagarVencidos", "metas", "configuracao", "importacoes",
  "planos", "periodos", "mapeamentos", "relatorios", "perfil",
]);

const sql: Record<string, (d: RequestData, userId: string) => { text: string; values: unknown[] }> = {
  empresas: (_d, userId) => ({ text: "select id,nome,cnpj,cor_primaria,logo_url,ativo from empresas where public.can_access_empresa($1::uuid,id) order by nome", values: [userId] }),
  cargo: (_d, userId) => ({ text: "select role from user_roles where user_id=$1::uuid order by case role when 'admin' then 1 when 'consultor' then 2 else 3 end limit 1", values: [userId] }),
  empresa: d => ({ text: "select id,nome,cnpj,cor_primaria,logo_url,ativo from empresas where id=$1::uuid", values: [d.empresaId] }),
  categorias: d => ({ text: "select * from categorias where empresa_id=$1::uuid order by ordem", values: [d.empresaId] }),
  lancamentos: d => ({ text: "select * from lancamentos where empresa_id=$1::uuid and competencia between $2::date and $3::date order by competencia,data_efetiva,id", values: [d.empresaId, `${d.ano}-01-01`, `${d.ano}-12-01`] }),
  hashes: d => ({ text: "select hash from lancamentos where empresa_id=$1::uuid and competencia between $2::date and $3::date", values: [d.empresaId, `${d.ano}-01-01`, `${d.ano}-12-01`] }),
  anos: d => ({ text: "select distinct extract(year from competencia)::int as ano from lancamentos where empresa_id=$1::uuid order by ano desc", values: [d.empresaId] }),
  centros: d => ({ text: "select distinct nullif(trim(centro_custo),'') as centro_custo from lancamentos where empresa_id=$1::uuid and ($2::int is null or competencia between make_date($2,1,1) and make_date($2,12,1))", values: [d.empresaId, d.ano] }),
  lancamentosFluxo: d => ({ text: "select * from lancamentos where empresa_id=$1::uuid and data_efetiva between $2::date and $3::date order by data_efetiva,id", values: [d.empresaId,d.inicio,d.fim] }),
  lancamentosReceberVencidos: d => ({ text: "select * from lancamentos where empresa_id=$1::uuid and tipo='recebida' and data_efetiva<$2::date order by data_efetiva limit 50", values: [d.empresaId,d.hoje] }),
  contas: d => ({ text: "select * from fluxo_contas_bancarias where empresa_id=$1::uuid and ativo=true order by nome", values: [d.empresaId] }),
  saldos: d => ({ text: "select distinct on (conta_id) * from fluxo_saldos_bancarios where empresa_id=$1::uuid order by conta_id,informado_em desc", values: [d.empresaId] }),
  ajustes: d => ({ text: "select * from fluxo_ajustes_lancamentos where empresa_id=$1::uuid", values: [d.empresaId] }),
  checklist: d => ({ text: "select * from fluxo_checklist_pagamentos where empresa_id=$1::uuid", values: [d.empresaId] }),
  titulos: d => ({ text: "select * from fluxo_titulos_nibo where empresa_id=$1::uuid and data_projetada between $2::date and $3::date and status <> 'cancelado' order by data_projetada,id", values: [d.empresaId,d.inicio,d.fim] }),
  titulosReceberVencidos: d => ({ text: "select * from fluxo_titulos_nibo where empresa_id=$1::uuid and tipo='recebida' and vencimento<$2::date and status <> 'cancelado' order by vencimento limit 50", values: [d.empresaId,d.hoje] }),
  titulosPagarVencidos: d => ({ text: "select * from fluxo_titulos_nibo where empresa_id=$1::uuid and tipo='paga' and vencimento<$2::date and status not in ('cancelado','pago','recebido') order by vencimento limit 50", values: [d.empresaId,d.hoje] }),
  metas: d => ({ text: "select * from metas where empresa_id=$1::uuid and competencia between $2::date and $3::date", values: [d.empresaId,`${d.ano}-01-01`,`${d.ano}-12-01`] }),
  configuracao: d => ({ text: "select * from configuracoes where empresa_id=$1::uuid", values: [d.empresaId] }),
  importacoes: d => ({ text: "select * from importacoes where empresa_id=$1::uuid order by created_at desc", values: [d.empresaId] }),
  planos: d => ({ text: "select * from planos_acao where empresa_id=$1::uuid order by created_at desc", values: [d.empresaId] }),
  periodos: d => ({ text: "select * from periodos_fechados where empresa_id=$1::uuid order by competencia", values: [d.empresaId] }),
  mapeamentos: d => ({ text: "select * from mapeamentos where empresa_id=$1::uuid order by categoria_nibo", values: [d.empresaId] }),
  relatorios: d => ({ text: "select * from relatorios where empresa_id=$1::uuid order by created_at desc", values: [d.empresaId] }),
  perfil: d => ({ text: "select perfil from projeto_usuarios where empresa_id=$1::uuid and user_id=$2::uuid and ativo=true", values: [d.empresaId] }),
};

export const getFinancialData = createServerFn({ method: "GET" })
  .middleware([requireAuthenticatedUser])
  .validator((data: RequestData) => data)
  .handler(async ({ data, context }) => {
    if (!sql[data.resource]) throw new Error("Recurso de dados inválido.");
    if (companyResources.has(data.resource)) {
      if (!data.empresaId) throw new Error("Empresa obrigatória.");
      await assertEmpresaAccess(String(context.userId), data.empresaId);
    }
    const statement = sql[data.resource](data, String(context.userId));
    const result = await query(statement.text, statement.values);
    return result.rows;
  });
