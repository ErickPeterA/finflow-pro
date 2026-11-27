import { createServerFn } from "@tanstack/react-start";
import { requireAuthenticatedUser } from "./auth-middleware";
import { assertEmpresaAccess } from "./authorization";
import { query, withTransaction } from "./postgres";

type Mutation = { action: string; empresaId?: string; [key: string]: unknown };
const assertId = (value: unknown, label = "Registro") => {
  if (typeof value !== "string" || !value) throw new Error(`${label} inválido.`);
  return value;
};

export const mutateFinancialData = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator((data: Mutation) => {
    if (!data || (!data.empresaId && data.action !== "createEmpresa"))
      throw new Error("Empresa obrigatória.");
    return data;
  })
  .handler(async ({ context, data }) => {
    const userId = String(context.userId);
    if (data.empresaId) await assertEmpresaAccess(userId, data.empresaId);
    switch (data.action) {
      case "saveSaldos": {
        const saldos = Array.isArray(data.saldos) ? data.saldos : [];
        await withTransaction(async (client) => {
          for (const s of saldos) {
            const row = s as { contaId?: unknown; saldo?: unknown };
            await client.query(
              "insert into fluxo_saldos_bancarios (empresa_id,conta_id,saldo,informado_por) values ($1,$2,$3,$4)",
              [data.empresaId, assertId(row.contaId, "Conta"), Number(row.saldo) || 0, userId],
            );
          }
        });
        return { ok: true };
      }
      case "createConta": {
        const nome = String(data.nome ?? "").trim();
        if (!nome) throw new Error("Nome da conta obrigatório.");
        const r = await query(
          "insert into fluxo_contas_bancarias (empresa_id,nome,imagem_url,ativo) values ($1,$2,$3,true) on conflict (empresa_id,nome) do update set imagem_url=excluded.imagem_url,ativo=true returning id",
          [data.empresaId, nome.slice(0, 160), data.imagemUrl ?? null],
        );
        return r.rows[0];
      }
      case "createEmpresa": {
        const nome = String(data.nome ?? "").trim();
        if (!nome) throw new Error("Nome do projeto obrigatório.");
        const r = await query(
          "insert into empresas (nome,created_by) values ($1,$2::uuid) returning id",
          [nome.slice(0, 160), userId],
        );
        return r.rows[0];
      }
      case "updateEmpresaLogo": {
        const logoUrl = data.logoUrl == null ? null : String(data.logoUrl);
        if (
          logoUrl !== null &&
          (!logoUrl.startsWith("data:image/png;base64,") || logoUrl.length > 1_500_000)
        ) {
          throw new Error("Logo invÃ¡lida ou muito grande.");
        }
        await query("update empresas set logo_url=$1 where id=$2::uuid", [logoUrl, data.empresaId]);
        return { ok: true };
      }
      case "archiveEmpresa": {
        const admin = await query(
          "select 1 from user_roles where user_id=$1::uuid and role='admin'",
          [userId],
        );
        if (!admin.rowCount) throw new Error("Acesso restrito a administradores.");
        await query("update empresas set ativo=false where id=$1::uuid", [data.empresaId]);
        return { ok: true };
      }
      case "restoreEmpresa": {
        const admin = await query(
          "select 1 from user_roles where user_id=$1::uuid and role='admin'",
          [userId],
        );
        if (!admin.rowCount) throw new Error("Acesso restrito a administradores.");
        await query("update empresas set ativo=true where id=$1::uuid", [data.empresaId]);
        return { ok: true };
      }
      case "deleteEmpresa": {
        const admin = await query(
          "select 1 from user_roles where user_id=$1::uuid and role='admin'",
          [userId],
        );
        if (!admin.rowCount) throw new Error("Acesso restrito a administradores.");
        await query("delete from empresas where id=$1::uuid", [data.empresaId]);
        return { ok: true };
      }
      case "createTituloManual": {
        const t = data.titulo as Record<string, unknown>;
        const r = await query(
          "insert into fluxo_titulos_nibo (empresa_id,tipo,vencimento,data_projetada,competencia,descricao,categoria_nibo,pessoa,valor,status,hash,external_source,external_id,payload) values ($1,$2,$3,$3,$4,$5,$6,$7,$8,'aberto',$9,'manual_fluxo_caixa',$10,$11::jsonb) returning id",
          [
            data.empresaId,
            t.tipo,
            t.vencimento,
            t.competencia,
            t.descricao,
            t.categoria,
            t.pessoa,
            Number(t.valor),
            t.hash,
            t.externalId,
            JSON.stringify(t.payload ?? {}),
          ],
        );
        return r.rows[0];
      }
      case "updateFluxoTitulo": {
        const titulo = data["titulo"] as Record<string, unknown>;
        const ids = Array.isArray(data["ids"])
          ? [...new Set(data["ids"].map((id) => assertId(id, "Titulo")))]
          : [];
        if (!ids.length) throw new Error("Titulo obrigatorio.");
        const tipo =
          titulo["tipo"] === "paga" || titulo["tipo"] === "recebida" ? titulo["tipo"] : null;
        if (!tipo) throw new Error("Tipo invalido.");
        const vencimento = String(titulo["vencimento"] ?? "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) throw new Error("Vencimento invalido.");
        const pessoa = String(titulo["pessoa"] ?? "")
          .trim()
          .slice(0, 180);
        if (!pessoa) throw new Error("Nome obrigatorio.");
        const descricao = String(titulo["descricao"] ?? "")
          .trim()
          .slice(0, 500);
        const categoria = String(titulo["categoria"] ?? "")
          .trim()
          .slice(0, 240);
        const valorTotal = Math.abs(Number(titulo["valor"]));
        if (!Number.isFinite(valorTotal) || valorTotal <= 0)
          throw new Error("Valor deve ser maior que zero.");

        return withTransaction(async (client) => {
          const existentes = await client.query<{ id: string; valor: string }>(
            `select id,valor::text from fluxo_titulos_nibo
             where empresa_id=$1::uuid and id=any($2::uuid[]) for update`,
            [data.empresaId, ids],
          );
          if (existentes.rows.length !== ids.length)
            throw new Error("Um ou mais titulos nao foram encontrados.");
          const totalAtual = existentes.rows.reduce(
            (soma, row) => soma + Math.abs(Number(row.valor) || 0),
            0,
          );
          let distribuido = 0;
          for (const [index, row] of existentes.rows.entries()) {
            const ultimo = index === existentes.rows.length - 1;
            const proporcao =
              totalAtual > 0 ? Math.abs(Number(row.valor) || 0) / totalAtual : 1 / ids.length;
            const valor = ultimo
              ? Number((valorTotal - distribuido).toFixed(2))
              : Number((valorTotal * proporcao).toFixed(2));
            distribuido += valor;
            await client.query(
              `update fluxo_titulos_nibo set
                tipo=$1,vencimento=$2::date,data_projetada=$2::date,competencia=$3::date,
                descricao=$4,categoria_nibo=$5,pessoa=$6,valor=$7,
                payload=coalesce(payload,'{}'::jsonb) || $8::jsonb
               where empresa_id=$9::uuid and id=$10::uuid`,
              [
                tipo,
                vencimento,
                `${vencimento.slice(0, 7)}-01`,
                descricao,
                categoria || null,
                pessoa,
                valor,
                JSON.stringify({ editado_manualmente: true, editado_em: new Date().toISOString() }),
                data.empresaId,
                row.id,
              ],
            );
          }
          return { ok: true };
        });
      }
      case "deleteFluxoTitulos": {
        const tipo = data.tipo === "paga" || data.tipo === "recebida" ? data.tipo : null;
        const ids = Array.isArray(data.ids) ? data.ids.map((id) => assertId(id, "Título")) : [];
        if (tipo) {
          await query(
            "delete from fluxo_titulos_nibo where empresa_id=$1::uuid and external_source in ('fluxo_caixa','manual_fluxo_caixa') and tipo=$2",
            [data.empresaId, tipo],
          );
        } else if (ids.length) {
          await query(
            "delete from fluxo_titulos_nibo where empresa_id=$1::uuid and external_source in ('fluxo_caixa','manual_fluxo_caixa') and id=any($2::uuid[])",
            [data.empresaId, ids],
          );
        } else {
          throw new Error("Selecione ao menos um título para excluir.");
        }
        return { ok: true };
      }
      case "createHistorico": {
        const h = data.historico as Record<string, unknown>;
        await query(
          "insert into fluxo_historicos (empresa_id,periodo_inicio,periodo_fim,saldo_inicial,recebimentos_previstos,pagamentos_previstos,saldo_final_previsto,contas_consideradas,pagamentos_selecionados,payload,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11)",
          [
            data.empresaId,
            h.inicio,
            h.fim,
            Number(h.saldoInicial),
            Number(h.recebimentos),
            Number(h.pagamentos),
            Number(h.saldoFinal),
            JSON.stringify(h.contas ?? []),
            JSON.stringify(h.selecionados ?? []),
            JSON.stringify(h.payload ?? {}),
            userId,
          ],
        );
        return { ok: true };
      }
      case "createPlano": {
        const p = data.plano as Record<string, unknown>;
        await query(
          "insert into planos_acao (empresa_id,competencia_origem,problema,acao,resultado_esperado,categoria,responsavel,prioridade,prazo,status,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendente',$10)",
          [
            data.empresaId,
            p.competencia,
            p.problema,
            p.acao,
            p.resultado,
            p.categoria,
            p.responsavel,
            p.prioridade,
            p.prazo || null,
            userId,
          ],
        );
        return { ok: true };
      }
      case "updatePlanoStatus": {
        const statusPermitidos = new Set([
          "pendente",
          "em_andamento",
          "aguardando_cliente",
          "atrasado",
          "concluido",
          "cancelado",
        ]);
        const status = String(data["status"] ?? "");
        if (!statusPermitidos.has(status)) throw new Error("Status da ação inválido.");
        const resultado = await query(
          "update planos_acao set status=$1::status_acao, concluido_em=case when $1::status_acao='concluido'::status_acao then current_date else null end where id=$2::uuid and empresa_id=$3::uuid returning id,status",
          [status, assertId(data["id"]), data.empresaId],
        );
        if (!resultado.rowCount) throw new Error("Ação não encontrada para esta empresa.");
        return { ok: true, plano: resultado.rows[0] };
      }
      case "deletePlano": {
        await query("delete from planos_acao where id=$1 and empresa_id=$2", [
          assertId(data.id),
          data.empresaId,
        ]);
        return { ok: true };
      }
      case "archivePlanos": {
        const ids = Array.isArray(data.ids) ? data.ids.map((x) => assertId(x)) : [];
        await query(
          "update planos_acao set relatorio_gerado_em=now() where empresa_id=$1 and id = any($2::uuid[])",
          [data.empresaId, ids],
        );
        return { ok: true };
      }
      default:
        throw new Error("Mutação financeira inválida.");
    }
  });
