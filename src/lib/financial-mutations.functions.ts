import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertEmpresaAccess } from "./authorization";
import { query, withTransaction } from "./postgres";

type Mutation = { action: string; empresaId?: string; [key: string]: unknown };
const assertId = (value: unknown, label = "Registro") => { if (typeof value !== "string" || !value) throw new Error(`${label} inválido.`); return value; };

export const mutateFinancialData = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((data: Mutation) => { if (!data || (!data.empresaId && data.action !== "createEmpresa")) throw new Error("Empresa obrigatória."); return data; })
  .handler(async ({ context, data }) => {
    const userId = String(context.userId); if (data.empresaId) await assertEmpresaAccess(userId, data.empresaId);
    switch (data.action) {
      case "saveSaldos": {
        const saldos = Array.isArray(data.saldos) ? data.saldos : [];
        await withTransaction(async client => { for (const s of saldos) { const row=s as {contaId?:unknown;saldo?:unknown}; await client.query("insert into fluxo_saldos_bancarios (empresa_id,conta_id,saldo,informado_por) values ($1,$2,$3,$4)", [data.empresaId,assertId(row.contaId,"Conta"),Number(row.saldo)||0,userId]); }});
        return { ok: true };
      }
      case "createConta": { const nome=String(data.nome??"").trim(); if(!nome) throw new Error("Nome da conta obrigatório."); const r=await query("insert into fluxo_contas_bancarias (empresa_id,nome,imagem_url,ativo) values ($1,$2,$3,true) on conflict (empresa_id,nome) do update set imagem_url=excluded.imagem_url,ativo=true returning id",[data.empresaId,nome.slice(0,160),data.imagemUrl??null]); return r.rows[0]; }
      case "createEmpresa": { const nome=String(data.nome??"").trim(); if(!nome) throw new Error("Nome do projeto obrigatório."); const r=await query("insert into empresas (nome,created_by) values ($1,$2::uuid) returning id",[nome.slice(0,160),userId]); return r.rows[0]; }
      case "createTituloManual": { const t=data.titulo as Record<string,unknown>; const r=await query("insert into fluxo_titulos_nibo (empresa_id,tipo,vencimento,data_projetada,competencia,descricao,categoria_nibo,pessoa,valor,status,hash,external_source,external_id,payload) values ($1,$2,$3,$3,$4,$5,$6,$7,$8,'aberto',$9,'manual_fluxo_caixa',$10,$11::jsonb) returning id",[data.empresaId,t.tipo,t.vencimento,t.competencia,t.descricao,t.categoria,t.pessoa,Number(t.valor),t.hash,t.externalId,JSON.stringify(t.payload??{})]); return r.rows[0]; }
      case "createHistorico": { const h=data.historico as Record<string,unknown>; await query("insert into fluxo_historicos (empresa_id,periodo_inicio,periodo_fim,saldo_inicial,recebimentos_previstos,pagamentos_previstos,saldo_final_previsto,contas_consideradas,pagamentos_selecionados,payload,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11)",[data.empresaId,h.inicio,h.fim,Number(h.saldoInicial),Number(h.recebimentos),Number(h.pagamentos),Number(h.saldoFinal),JSON.stringify(h.contas??[]),JSON.stringify(h.selecionados??[]),JSON.stringify(h.payload??{}),userId]); return {ok:true}; }
      case "createPlano": { const p=data.plano as Record<string,unknown>; await query("insert into planos_acao (empresa_id,competencia_origem,problema,acao,resultado_esperado,categoria,responsavel,prioridade,prazo,status,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendente',$10)",[data.empresaId,p.competencia,p.problema,p.acao,p.resultado,p.categoria,p.responsavel,p.prioridade,p.prazo||null,userId]); return {ok:true}; }
      case "updatePlanoStatus": { await query("update planos_acao set status=$1, concluido_em=case when $1='concluido' then current_date else null end where id=$2 and empresa_id=$3",[data.status,assertId(data.id),data.empresaId]); return {ok:true}; }
      case "deletePlano": { await query("delete from planos_acao where id=$1 and empresa_id=$2",[assertId(data.id),data.empresaId]); return {ok:true}; }
      case "archivePlanos": { const ids=Array.isArray(data.ids)?data.ids.map(x=>assertId(x)):[]; await query("update planos_acao set relatorio_gerado_em=now() where empresa_id=$1 and id = any($2::uuid[])",[data.empresaId,ids]); return {ok:true}; }
      default: throw new Error("Mutação financeira inválida.");
    }
  });
