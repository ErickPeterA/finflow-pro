import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TopBar } from "@/components/TopBar";
import { Bloco, SemDados, SemEmpresa } from "@/components/ui-blocos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useApp } from "@/lib/app-context";
import { usePlanosAcao } from "@/lib/data";
import { competenciaDate, dataBR, meses } from "@/lib/format";
import { cn } from "@/lib/utils";

type StatusAcao = Database["public"]["Enums"]["status_acao"];

export const Route = createFileRoute("/_authenticated/plano-acao")({
  head: () => ({
    meta: [
      { title: "Plano de Ação | Ecossistema Financeiro BPO" },
      {
        name: "description",
        content:
          "Registre problema, ação recomendada, responsável, prazo e resultado esperado das decisões acordadas com o cliente.",
      },
      { property: "og:title", content: "Plano de Ação | Ecossistema Financeiro BPO" },
      {
        property: "og:description",
        content: "Da análise à execução: acompanhamento das ações do cliente.",
      },
    ],
  }),
  component: PlanoAcaoPage,
});

const statusLabels: Record<StatusAcao, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  aguardando_cliente: "Aguardando cliente",
  concluido: "Concluído",
  atrasado: "Atrasado",
  cancelado: "Cancelado",
};

const statusCor: Record<StatusAcao, string> = {
  pendente: "bg-muted text-muted-foreground",
  em_andamento: "bg-info-soft text-info",
  aguardando_cliente: "bg-warning-soft text-warning",
  concluido: "bg-positive-soft text-positive",
  atrasado: "bg-negative-soft text-negative",
  cancelado: "bg-muted text-muted-foreground",
};

const prioridadeLabels: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

function PlanoAcaoPage() {
  const { empresaId, ano, mes } = useApp();
  const queryClient = useQueryClient();
  const { data: planos = [], isLoading } = usePlanosAcao(empresaId);
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({
    problema: "",
    acao: "",
    resultado_esperado: "",
    categoria: "",
    responsavel: "",
    prioridade: "media",
    prazo: "",
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (!empresaId) throw new Error("Selecione uma empresa.");
      if (!form.problema.trim() || !form.acao.trim())
        throw new Error("Informe o problema identificado e a ação recomendada.");
      const { error } = await supabase.from("planos_acao").insert({
        empresa_id: empresaId,
        competencia_origem: competenciaDate(ano, mes),
        problema: form.problema.trim().slice(0, 1000),
        acao: form.acao.trim().slice(0, 1000),
        resultado_esperado: form.resultado_esperado.trim().slice(0, 1000) || null,
        categoria: form.categoria.trim().slice(0, 120) || null,
        responsavel: form.responsavel.trim().slice(0, 120) || null,
        prioridade: form.prioridade,
        prazo: form.prazo || null,
        status: "pendente" as StatusAcao,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ação adicionada ao plano.");
      setForm({
        problema: "",
        acao: "",
        resultado_esperado: "",
        categoria: "",
        responsavel: "",
        prioridade: "media",
        prazo: "",
      });
      setAberto(false);
      queryClient.invalidateQueries({ queryKey: ["planos_acao"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar."),
  });

  const atualizar = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: StatusAcao }) => {
      const { error } = await supabase
        .from("planos_acao")
        .update({
          status,
          concluido_em: status === "concluido" ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["planos_acao"] }),
    onError: () => toast.error("Não foi possível atualizar o status."),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("planos_acao").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ação removida.");
      queryClient.invalidateQueries({ queryKey: ["planos_acao"] });
    },
    onError: () => toast.error("Não foi possível remover."),
  });

  const concluidas = planos.filter((p) => p.status === "concluido").length;

  return (
    <>
      <TopBar
        titulo="Plano de Ação"
        descricao="Recomendações acordadas com o cliente e acompanhamento de execução"
        acoes={
          <Button size="sm" onClick={() => setAberto((a) => !a)} disabled={!empresaId}>
            <Plus className="mr-2 h-4 w-4" /> Nova ação
          </Button>
        }
      />
      <main className="space-y-5 p-6">
        {!empresaId ? (
          <SemEmpresa />
        ) : (
          <>
            {aberto && (
              <Bloco titulo={`Nova ação · ${meses[mes]} de ${ano}`}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="problema">Problema identificado</Label>
                    <Textarea
                      id="problema"
                      maxLength={1000}
                      rows={2}
                      value={form.problema}
                      onChange={(e) => setForm({ ...form, problema: e.target.value })}
                      placeholder="Ex.: Despesas com software cresceram 42% acima da média mensal."
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="acao">Ação recomendada</Label>
                    <Textarea
                      id="acao"
                      maxLength={1000}
                      rows={2}
                      value={form.acao}
                      onChange={(e) => setForm({ ...form, acao: e.target.value })}
                      placeholder="Ex.: Revisar contratos e cancelar licenças ociosas até o fechamento do mês."
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="resultado">Resultado esperado</Label>
                    <Input
                      id="resultado"
                      maxLength={1000}
                      value={form.resultado_esperado}
                      onChange={(e) => setForm({ ...form, resultado_esperado: e.target.value })}
                      placeholder="Ex.: Redução de R$ 3.000/mês na estrutura fixa."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="categoria">Categoria relacionada</Label>
                    <Input
                      id="categoria"
                      maxLength={120}
                      value={form.categoria}
                      onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="responsavel">Responsável</Label>
                    <Input
                      id="responsavel"
                      maxLength={120}
                      value={form.responsavel}
                      onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Prioridade</Label>
                    <Select
                      value={form.prioridade}
                      onValueChange={(v) => setForm({ ...form, prioridade: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="baixa">Baixa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prazo">Prazo</Label>
                    <Input
                      id="prazo"
                      type="date"
                      value={form.prazo}
                      onChange={(e) => setForm({ ...form, prazo: e.target.value })}
                    />
                  </div>
                </div>
                <div className="mt-5 flex gap-2">
                  <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
                    {criar.isPending ? "Salvando..." : "Salvar ação"}
                  </Button>
                  <Button variant="ghost" onClick={() => setAberto(false)}>
                    Cancelar
                  </Button>
                </div>
              </Bloco>
            )}

            <Bloco
              titulo={`Ações registradas (${planos.length})`}
              acoes={
                <span className="text-xs text-muted-foreground">{concluidas} concluída(s)</span>
              }
            >
              {isLoading ? (
                <SemDados mensagem="Carregando plano de ação..." />
              ) : planos.length === 0 ? (
                <SemDados mensagem="Nenhuma ação registrada para esta empresa." />
              ) : (
                <ul className="space-y-3">
                  {planos.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-lg border bg-card p-4 transition-shadow hover:shadow-card"
                    >
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "rounded px-2 py-0.5 text-[11px] font-semibold",
                                p.prioridade === "alta" && "bg-negative-soft text-negative",
                                p.prioridade === "media" && "bg-warning-soft text-warning",
                                p.prioridade === "baixa" && "bg-info-soft text-info",
                              )}
                            >
                              {prioridadeLabels[p.prioridade] ?? p.prioridade}
                            </span>
                            <span
                              className={cn(
                                "rounded px-2 py-0.5 text-[11px] font-semibold",
                                statusCor[p.status],
                              )}
                            >
                              {statusLabels[p.status]}
                            </span>
                            <p className="font-medium">{p.acao}</p>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Problema:</span>{" "}
                            {p.problema}
                          </p>
                          {p.resultado_esperado && (
                            <p className="mt-1 text-sm text-positive">
                              Resultado esperado: {p.resultado_esperado}
                            </p>
                          )}
                          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {p.competencia_origem && (
                              <span>
                                Origem: {meses[Number(p.competencia_origem.slice(5, 7)) - 1]}/
                                {p.competencia_origem.slice(0, 4)}
                              </span>
                            )}
                            {p.categoria && <span>Categoria: {p.categoria}</span>}
                            {p.responsavel && <span>Responsável: {p.responsavel}</span>}
                            {p.prazo && <span>Prazo: {dataBR(p.prazo)}</span>}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Select
                            value={p.status}
                            onValueChange={(v) =>
                              atualizar.mutate({ id: p.id, status: v as StatusAcao })
                            }
                          >
                            <SelectTrigger className="h-8 w-44">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(statusLabels) as StatusAcao[]).map((k) => (
                                <SelectItem key={k} value={k}>
                                  {statusLabels[k]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-negative"
                            onClick={() => remover.mutate(p.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Bloco>
          </>
        )}
      </main>
    </>
  );
}
