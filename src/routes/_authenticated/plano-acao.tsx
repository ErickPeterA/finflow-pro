import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, FileDown, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TopBar } from "@/components/TopBar";
import { Bloco, SemDados, SemEmpresa } from "@/components/ui-blocos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";
import { useApp } from "@/lib/app-context";
import { usePlanosAcao } from "@/lib/data";
import { mutateFinancialData } from "@/lib/financial-mutations.functions";
import { competenciaDate, dataBR, meses } from "@/lib/format";
import { cn } from "@/lib/utils";

type StatusAcao = Database["public"]["Enums"]["status_acao"];
type PlanoAcao = Database["public"]["Tables"]["planos_acao"]["Row"];
type ColunaKanban = "a_fazer" | "em_execucao" | "concluido";

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

const colunasKanban: Array<{
  id: ColunaKanban;
  titulo: string;
  descricao: string;
  proximo?: StatusAcao;
  textoBotao?: string;
}> = [
  {
    id: "a_fazer",
    titulo: "A fazer",
    descricao: "Ações recém-criadas e próximas decisões.",
    proximo: "em_andamento",
    textoBotao: "Iniciar",
  },
  {
    id: "em_execucao",
    titulo: "Em execução",
    descricao: "Ações que já estão sendo acompanhadas.",
    proximo: "concluido",
    textoBotao: "Concluir",
  },
  {
    id: "concluido",
    titulo: "Concluído",
    descricao: "Ações finalizadas no plano.",
  },
];

function colunaDoStatus(status: StatusAcao): ColunaKanban {
  if (status === "concluido") return "concluido";
  if (status === "em_andamento") return "em_execucao";
  return "a_fazer";
}

function competenciaLabel(competencia: string | null) {
  if (!competencia) return null;
  const mesCompetencia = Number(competencia.slice(5, 7)) - 1;
  const anoCompetencia = competencia.slice(0, 4);
  return `${meses[mesCompetencia]}/${anoCompetencia}`;
}

function dataHoraBR(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function quebrarTexto(texto: string, limite = 86) {
  const palavras = texto.replace(/\s+/g, " ").trim().split(" ");
  const linhas: string[] = [];
  let linha = "";

  for (const palavra of palavras) {
    const tentativa = linha ? `${linha} ${palavra}` : palavra;
    if (tentativa.length <= limite) {
      linha = tentativa;
      continue;
    }
    if (linha) linhas.push(linha);
    linha = palavra;
  }

  if (linha) linhas.push(linha);
  return linhas.length ? linhas : [""];
}

function byteWinAnsi(char: string) {
  const code = char.charCodeAt(0);
  if (code <= 255) return code;

  const especiais: Record<string, number> = {
    "–": 45,
    "—": 45,
    "“": 34,
    "”": 34,
    "‘": 39,
    "’": 39,
    "•": 45,
  };

  if (especiais[char]) return especiais[char];

  const ascii = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return ascii.charCodeAt(0) <= 255 ? ascii.charCodeAt(0) : 63;
}

function textoPdf(texto: string) {
  let resultado = "(";
  for (const char of texto) {
    const byte = byteWinAnsi(char);
    if (byte === 40 || byte === 41 || byte === 92) {
      resultado += `\\${String.fromCharCode(byte)}`;
    } else if (byte < 32 || byte > 126) {
      resultado += `\\${byte.toString(8).padStart(3, "0")}`;
    } else {
      resultado += String.fromCharCode(byte);
    }
  }
  return `${resultado})`;
}

function baixarPdf(nomeArquivo: string, paginas: string[]) {
  const encoder = new TextEncoder();
  const objetos: string[] = [];
  const pageIds = paginas.map((_, index) => 5 + index * 2);

  objetos.push("<< /Type /Catalog /Pages 2 0 R >>");
  objetos.push(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${paginas.length} >>`,
  );
  objetos.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objetos.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );

  paginas.forEach((stream, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;

    objetos.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objetos.push(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
  });

  const partes = ["%PDF-1.4\n"];
  const offsets = [0];

  objetos.forEach((objeto, index) => {
    offsets.push(encoder.encode(partes.join("")).length);
    partes.push(`${index + 1} 0 obj\n${objeto}\nendobj\n`);
  });

  const inicioXref = encoder.encode(partes.join("")).length;
  partes.push(`xref\n0 ${objetos.length + 1}\n`);
  partes.push("0000000000 65535 f \n");
  offsets.slice(1).forEach((offset) => {
    partes.push(`${offset.toString().padStart(10, "0")} 00000 n \n`);
  });
  partes.push(
    `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF`,
  );

  const blob = new Blob(partes, { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function adicionarTexto(
  comandos: string[],
  texto: string,
  x: number,
  y: number,
  tamanho = 10,
  fonte = "F1",
  cor = "0.10 0.12 0.16",
) {
  comandos.push(`${cor} rg`);
  comandos.push(`BT /${fonte} ${tamanho} Tf ${x} ${y} Td ${textoPdf(texto)} Tj ET`);
}

function adicionarLinha(comandos: string[], x1: number, y: number, x2: number) {
  comandos.push("0.82 0.86 0.90 RG");
  comandos.push(`0.8 w ${x1} ${y} m ${x2} ${y} l S`);
}

function gerarRelatorioPlanos(planos: PlanoAcao[]) {
  const paginas: string[] = [];
  let comandos: string[] = [];
  let y = 790;

  const novaPagina = () => {
    if (comandos.length) paginas.push(comandos.join("\n"));
    comandos = [];
    y = 790;
  };

  const garantirEspaco = (altura: number) => {
    if (y - altura < 56) novaPagina();
  };

  const campo = (label: string, valor: string | null | undefined) => {
    if (!valor) return;
    const linhas = quebrarTexto(valor, 88);
    garantirEspaco(24 + linhas.length * 13);
    adicionarTexto(comandos, label, 58, y, 9, "F2", "0.36 0.40 0.47");
    y -= 14;
    linhas.forEach((linha) => {
      adicionarTexto(comandos, linha, 58, y, 10.5, "F1", "0.10 0.12 0.16");
      y -= 13;
    });
    y -= 8;
  };

  planos.forEach((plano, index) => {
    garantirEspaco(150);

    comandos.push("0.94 0.97 1 rg");
    comandos.push(`48 ${y - 8} 499 28 re f`);
    adicionarTexto(comandos, `Ação ${index + 1}`, 60, y, 13, "F2", "0.05 0.22 0.42");
    y -= 34;

    campo("Ação recomendada", plano.acao);
    campo("Problema identificado", plano.problema);
    campo("Resultado esperado", plano.resultado_esperado);

    const detalhes = [
      competenciaLabel(plano.competencia_origem)
        ? `Competência de origem: ${competenciaLabel(plano.competencia_origem)}`
        : null,
      plano.prazo ? `Prazo: ${dataBR(plano.prazo)}` : null,
    ].filter(Boolean);

    if (detalhes.length) {
      campo("Detalhes", detalhes.join("   |   "));
    }

    adicionarLinha(comandos, 48, y + 2, 547);
    y -= 26;
  });

  if (comandos.length) paginas.push(comandos.join("\n"));
  baixarPdf("plano-de-acoes.pdf", paginas.length ? paginas : [""]);
}

function CampoVisualizacao({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function VisualizarPlanoDialog({ plano, children }: { plano: PlanoAcao; children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Visualizar plano de ação</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <CampoVisualizacao label="Problema identificado" className="md:col-span-2">
            <Textarea
              readOnly
              rows={2}
              value={plano.problema}
              className="resize-none bg-muted/40"
            />
          </CampoVisualizacao>
          <CampoVisualizacao label="Ação recomendada" className="md:col-span-2">
            <Textarea readOnly rows={2} value={plano.acao} className="resize-none bg-muted/40" />
          </CampoVisualizacao>
          <CampoVisualizacao label="Resultado esperado" className="md:col-span-2">
            <Input readOnly value={plano.resultado_esperado ?? ""} className="bg-muted/40" />
          </CampoVisualizacao>
          <CampoVisualizacao label="Categoria relacionada">
            <Input readOnly value={plano.categoria ?? ""} className="bg-muted/40" />
          </CampoVisualizacao>
          <CampoVisualizacao label="Responsável">
            <Input readOnly value={plano.responsavel ?? ""} className="bg-muted/40" />
          </CampoVisualizacao>
          <CampoVisualizacao label="Prioridade">
            <Input
              readOnly
              value={prioridadeLabels[plano.prioridade] ?? plano.prioridade}
              className="bg-muted/40"
            />
          </CampoVisualizacao>
          <CampoVisualizacao label="Prazo">
            <Input
              readOnly
              value={plano.prazo ? dataBR(plano.prazo) : ""}
              className="bg-muted/40"
            />
          </CampoVisualizacao>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlanoAcaoPage() {
  const { empresaId, ano, mes } = useApp();
  const queryClient = useQueryClient();
  const mutateData = useServerFn(mutateFinancialData);
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
      await mutateData({ data: { action: "createPlano", empresaId, plano: { competencia: competenciaDate(ano, mes), problema: form.problema.trim().slice(0, 1000), acao: form.acao.trim().slice(0, 1000), resultado: form.resultado_esperado.trim().slice(0, 1000) || null, categoria: form.categoria.trim().slice(0, 120) || null, responsavel: form.responsavel.trim().slice(0, 120) || null, prioridade: form.prioridade, prazo: form.prazo || null } } });
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
      if (!empresaId) throw new Error("Selecione uma empresa.");
      await mutateData({ data: { action: "updatePlanoStatus", empresaId, id, status } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["planos_acao"] }),
    onError: () => toast.error("Não foi possível atualizar o status."),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      if (!empresaId) throw new Error("Selecione uma empresa.");
      await mutateData({ data: { action: "deletePlano", empresaId, id } });
    },
    onSuccess: () => {
      toast.success("Ação removida.");
      queryClient.invalidateQueries({ queryKey: ["planos_acao"] });
    },
    onError: () => toast.error("Não foi possível remover."),
  });

  const acoesParaRelatorio = planos.filter((plano) => !plano.relatorio_gerado_em);
  const acoesHistorico = planos
    .filter((plano) => plano.relatorio_gerado_em)
    .sort(
      (a, b) =>
        new Date(b.relatorio_gerado_em ?? "").getTime() -
        new Date(a.relatorio_gerado_em ?? "").getTime(),
    );

  const gerarRelatorio = useMutation({
    mutationFn: async () => {
      if (acoesParaRelatorio.length === 0) {
        throw new Error("Nenhuma ação ativa para gerar o relatório.");
      }

      gerarRelatorioPlanos(acoesParaRelatorio);

      if (!empresaId) throw new Error("Selecione uma empresa.");
      await mutateData({ data: { action: "archivePlanos", empresaId, ids: acoesParaRelatorio.map((plano) => plano.id) } });
    },
    onSuccess: () => {
      toast.success("Relatório gerado e ações movidas para o histórico.");
      queryClient.invalidateQueries({ queryKey: ["planos_acao"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o relatório."),
  });

  const concluidas = acoesParaRelatorio.filter((p) => p.status === "concluido").length;
  const planosPorColuna = colunasKanban.reduce(
    (acc, coluna) => ({
      ...acc,
      [coluna.id]: planos.filter((plano) => colunaDoStatus(plano.status) === coluna.id),
    }),
    {} as Record<ColunaKanban, PlanoAcao[]>,
  );

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
                      placeholder="Ex.: Redução de R$ 3.000/mês na estrutura mensal."
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

            <Tabs defaultValue="ativos" className="space-y-5">
              <TabsList>
                <TabsTrigger value="ativos">Ativos ({acoesParaRelatorio.length})</TabsTrigger>
                <TabsTrigger value="historico">Histórico ({acoesHistorico.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="ativos" className="space-y-5">
                <Bloco
                  titulo={`Ações criadas (${acoesParaRelatorio.length})`}
                  acoes={
                    <span className="text-xs text-muted-foreground">{concluidas} concluída(s)</span>
                  }
                >
                  {isLoading ? (
                    <SemDados mensagem="Carregando plano de ação..." />
                  ) : acoesParaRelatorio.length === 0 ? (
                    <SemDados mensagem="Nenhuma ação ativa para esta empresa." />
                  ) : (
                    <div className="overflow-hidden rounded-lg border">
                      <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_110px_92px] gap-3 bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase text-muted-foreground max-lg:hidden">
                        <span>Ação</span>
                        <span>Problema</span>
                        <span>Status</span>
                        <span />
                      </div>
                      <ul className="divide-y">
                        {acoesParaRelatorio.map((plano) => (
                          <li
                            key={plano.id}
                            className="grid gap-3 px-4 py-3 text-sm lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_110px_92px] lg:items-center"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">{plano.acao}</p>
                              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                {plano.prazo && <span>Prazo: {dataBR(plano.prazo)}</span>}
                                {competenciaLabel(plano.competencia_origem) && (
                                  <span>Origem: {competenciaLabel(plano.competencia_origem)}</span>
                                )}
                              </p>
                            </div>
                            <p className="line-clamp-2 text-muted-foreground">{plano.problema}</p>
                            <span
                              className={cn(
                                "w-fit rounded px-2 py-0.5 text-[11px] font-semibold",
                                statusCor[plano.status],
                              )}
                            >
                              {statusLabels[plano.status]}
                            </span>
                            <div className="flex items-center gap-1">
                              <VisualizarPlanoDialog plano={plano}>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </VisualizarPlanoDialog>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-negative"
                                onClick={() => remover.mutate(plano.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Bloco>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => gerarRelatorio.mutate()}
                    disabled={
                      isLoading || acoesParaRelatorio.length === 0 || gerarRelatorio.isPending
                    }
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    {gerarRelatorio.isPending ? "Gerando..." : "Gerar relatório"}
                  </Button>
                </div>

                <Bloco titulo="Kanban do plano">
                  {isLoading ? (
                    <SemDados mensagem="Carregando kanban..." />
                  ) : planos.length === 0 ? (
                    <SemDados mensagem="Crie uma ação para montar o kanban." />
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-3">
                      {colunasKanban.map((coluna) => (
                        <section
                          key={coluna.id}
                          className="flex min-h-[360px] flex-col rounded-lg border bg-muted/25"
                        >
                          <div className="border-b px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <h3 className="text-sm font-semibold">{coluna.titulo}</h3>
                              <span className="rounded bg-background px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                                {planosPorColuna[coluna.id].length}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{coluna.descricao}</p>
                          </div>
                          <div className="flex flex-1 flex-col gap-3 p-3">
                            {planosPorColuna[coluna.id].length === 0 ? (
                              <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed bg-background/70 p-4 text-center text-xs text-muted-foreground">
                                Nenhuma ação nesta etapa.
                              </div>
                            ) : (
                              planosPorColuna[coluna.id].map((plano) => (
                                <article
                                  key={plano.id}
                                  className="rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-card"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="line-clamp-2 text-sm font-semibold">
                                        {plano.acao}
                                      </p>
                                      <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                                        {plano.problema}
                                      </p>
                                    </div>
                                    <span
                                      className={cn(
                                        "shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold",
                                        plano.prioridade === "alta" &&
                                          "bg-negative-soft text-negative",
                                        plano.prioridade === "media" &&
                                          "bg-warning-soft text-warning",
                                        plano.prioridade === "baixa" && "bg-info-soft text-info",
                                      )}
                                    >
                                      {prioridadeLabels[plano.prioridade] ?? plano.prioridade}
                                    </span>
                                  </div>

                                  {plano.resultado_esperado && (
                                    <p className="mt-3 rounded bg-positive-soft px-3 py-2 text-xs text-positive">
                                      {plano.resultado_esperado}
                                    </p>
                                  )}

                                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                    {plano.responsavel && <span>{plano.responsavel}</span>}
                                    {plano.categoria && <span>{plano.categoria}</span>}
                                    {plano.prazo && <span>Prazo: {dataBR(plano.prazo)}</span>}
                                  </div>

                                  <div className="mt-4 flex items-center justify-between gap-2">
                                    <VisualizarPlanoDialog plano={plano}>
                                      <Button size="sm" variant="ghost" className="h-8">
                                        <Eye className="mr-2 h-3.5 w-3.5" />
                                        Abrir
                                      </Button>
                                    </VisualizarPlanoDialog>

                                    {coluna.proximo && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 shrink-0"
                                        onClick={() =>
                                          atualizar.mutate({
                                            id: plano.id,
                                            status: coluna.proximo!,
                                          })
                                        }
                                        disabled={atualizar.isPending}
                                      >
                                        {coluna.textoBotao}
                                        <ArrowRight className="ml-2 h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                </article>
                              ))
                            )}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </Bloco>
              </TabsContent>

              <TabsContent value="historico">
                <Bloco titulo={`Histórico de relatórios (${acoesHistorico.length})`}>
                  {isLoading ? (
                    <SemDados mensagem="Carregando histórico..." />
                  ) : acoesHistorico.length === 0 ? (
                    <SemDados mensagem="Nenhum plano de ação foi gerado em relatório ainda." />
                  ) : (
                    <div className="overflow-hidden rounded-lg border">
                      <div className="grid grid-cols-[160px_minmax(0,1.5fr)_minmax(0,1fr)_90px] gap-3 bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase text-muted-foreground max-lg:hidden">
                        <span>Relatório</span>
                        <span>Ação</span>
                        <span>Problema</span>
                        <span />
                      </div>
                      <ul className="divide-y">
                        {acoesHistorico.map((plano) => (
                          <li
                            key={plano.id}
                            className="grid gap-3 px-4 py-3 text-sm lg:grid-cols-[160px_minmax(0,1.5fr)_minmax(0,1fr)_90px] lg:items-center"
                          >
                            <span className="text-xs text-muted-foreground">
                              {dataHoraBR(plano.relatorio_gerado_em)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{plano.acao}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {statusLabels[plano.status]}
                              </p>
                            </div>
                            <p className="line-clamp-2 text-muted-foreground">{plano.problema}</p>
                            <VisualizarPlanoDialog plano={plano}>
                              <Button size="sm" variant="outline">
                                <Eye className="mr-2 h-4 w-4" />
                                Abrir
                              </Button>
                            </VisualizarPlanoDialog>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Bloco>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </>
  );
}
