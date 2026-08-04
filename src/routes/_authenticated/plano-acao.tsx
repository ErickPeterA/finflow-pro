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
import { useApp } from "@/lib/app-context";
import { usePlanosAcao } from "@/lib/data";
import { brl, competenciaDate, dataBR, meses } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/plano-acao")({
  head: () => ({
    meta: [
      { title: "Plano de Ação | Ecossistema Financeiro BPO" },
      {
        name: "description",
        content:
          "Registre recomendações, responsáveis, prazos e impacto esperado das ações acordadas com o cliente.",
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

const statusLabels: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
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
    titulo: "",
    descricao: "",
    responsavel: "",
    prioridade: "media",
    prazo: "",
    impacto_estimado: "",
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (!empresaId) throw new Error("Selecione uma empresa.");
      if (!form.titulo.trim()) throw new Error("Informe o título da ação.");
      const { error } = await supabase.from("planos_acao").insert({
        empresa_id: empresaId,
        competencia: competenciaDate(ano, mes),
        titulo: form.titulo.trim().slice(0, 200),
        descricao: form.descricao.trim().slice(0, 2000) || null,
        responsavel: form.responsavel.trim().slice(0, 120) || null,
        prioridade: form.prioridade,
        prazo: form.prazo || null,
        impacto_estimado: form.impacto_estimado ? Number(form.impacto_estimado) : null,
        status: "pendente",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ação adicionada ao plano.");
      setForm({
        titulo: "",
        descricao: "",
        responsavel: "",
        prioridade: "media",
        prazo: "",
        impacto_estimado: "",
      });
      setAberto(false);
      queryClient.invalidateQueries({ queryKey: ["planos_acao"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar."),
  });

  const atualizar = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("planos_acao").update({ status }).eq("id", id);
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

  const impactoTotal = planos
    .filter((p) => p.status !== "cancelada")
    .reduce((s, p) => s + Number(p.impacto_estimado ?? 0), 0);

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
                    <Label htmlFor="titulo">Título</Label>
                    <Input
                      id="titulo"
                      maxLength={200}
                      value={form.titulo}
                      onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                      placeholder="Ex.: Renegociar contrato de software"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="descricao">Descrição</Label>
                    <Textarea
                      id="descricao"
                      maxLength={2000}
                      rows={3}
                      value={form.descricao}
                      onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                      placeholder="O que precisa ser feito, por quê e qual resultado esperamos."
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
                  <div className="space-y-2">
                    <Label htmlFor="impacto">Impacto estimado (R$/mês)</Label>
                    <Input
                      id="impacto"
                      type="number"
                      step={100}
                      value={form.impacto_estimado}
                      onChange={(e) => setForm({ ...form, impacto_estimado: e.target.value })}
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
                <span className="text-xs text-muted-foreground">
                  Impacto estimado total: {brl(impactoTotal)}/mês
                </span>
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
                      key={p.id as string}
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
                              {prioridadeLabels[String(p.prioridade)] ?? String(p.prioridade)}
                            </span>
                            <p className="font-medium">{p.titulo as string}</p>
                          </div>
                          {p.descricao && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {p.descricao as string}
                            </p>
                          )}
                          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              Competência:{" "}
                              {meses[Number(String(p.competencia).slice(5, 7)) - 1]}/
                              {String(p.competencia).slice(0, 4)}
                            </span>
                            {p.responsavel && <span>Responsável: {p.responsavel as string}</span>}
                            {p.prazo && <span>Prazo: {dataBR(p.prazo as string)}</span>}
                            {p.impacto_estimado != null && (
                              <span className="text-positive">
                                Impacto: {brl(Number(p.impacto_estimado))}/mês
                              </span>
                            )}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Select
                            value={String(p.status)}
                            onValueChange={(v) =>
                              atualizar.mutate({ id: p.id as string, status: v })
                            }
                          >
                            <SelectTrigger className="h-8 w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(statusLabels).map(([k, v]) => (
                                <SelectItem key={k} value={k}>
                                  {v}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-negative"
                            onClick={() => remover.mutate(p.id as string)}
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
