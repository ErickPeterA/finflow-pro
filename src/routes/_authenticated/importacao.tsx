import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type DragEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { TopBar } from "@/components/TopBar";
import { Bloco, SemDados, SemEmpresa } from "@/components/ui-blocos";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { useImportacoes, useLancamentos, useMapeamentos } from "@/lib/data";
import { importarLinhasFinanceiras } from "@/lib/importacao/importer";
import { parseArquivoNibo, type LinhaImportada } from "@/lib/nibo";
import { brl, competenciaDate, dataBR, meses } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/importacao")({
  head: () => ({
    meta: [
      { title: "Importação NIBO | Ecossistema Financeiro BPO" },
      {
        name: "description",
        content:
          "Importe as planilhas de contas recebidas e pagas do NIBO com conferência de duplicidades e classificação automática.",
      },
      { property: "og:title", content: "Importação NIBO | Ecossistema Financeiro BPO" },
      {
        property: "og:description",
        content: "Entrada de dados padronizada, sem retrabalho e sem duplicidade.",
      },
    ],
  }),
  component: ImportacaoPage,
});

function ImportacaoPage() {
  const { empresaId, ano, mes } = useApp();
  const queryClient = useQueryClient();
  const { data: importacoes = [] } = useImportacoes(empresaId);
  const { data: mapeamentos = [] } = useMapeamentos(empresaId);
  const { data: lancamentos = [] } = useLancamentos(empresaId, ano);

  const [arquivos, setArquivos] = useState<File[]>([]);
  const [previa, setPrevia] = useState<LinhaImportada[]>([]);
  const [erros, setErros] = useState<string[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [processando, setProcessando] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);

  const hashesExistentes = useMemo(() => new Set(lancamentos.map((l) => l.hash)), [lancamentos]);

  const duplicadas = previa.filter((l) => hashesExistentes.has(l.hash)).length;

  const totalRecebidas = previa
    .filter((l) => l.tipo === "recebida")
    .reduce((s, l) => s + Math.abs(l.valor), 0);
  const totalPagas = previa
    .filter((l) => l.tipo === "paga")
    .reduce((s, l) => s + Math.abs(l.valor), 0);
  const totalPrevia = previa.reduce((s, l) => s + l.valor, 0);
  const semCategoria = previa.filter((l) => !l.categoria_nibo).length;
  const competenciasPrevia = useMemo(
    () => Array.from(new Set(previa.map((l) => l.competencia))).sort(),
    [previa],
  );
  const anosPrevia = useMemo(
    () => Array.from(new Set(competenciasPrevia.map((c) => c.slice(0, 4)))).sort(),
    [competenciasPrevia],
  );
  const nomesArquivos = useMemo(() => {
    if (!arquivos.length) return "";
    if (arquivos.length === 1) return arquivos[0]?.name ?? "";
    return `${arquivos.length} arquivos: ${arquivos.map((f) => f.name).join(", ")}`;
  }, [arquivos]);
  const nomeImportacao = nomesArquivos || "arquivo";

  function arquivoAceito(file: File) {
    return /\.(xlsx|xls|csv)$/i.test(file.name);
  }

  async function selecionarArquivos(lista: File[]) {
    const arquivosValidos = lista.filter(arquivoAceito);
    const rejeitados = lista.length - arquivosValidos.length;

    setArquivos(arquivosValidos);
    setPrevia([]);
    setErros([]);
    setAvisos([]);

    if (rejeitados) {
      toast.error("Alguns arquivos foram ignorados. Use apenas Excel (.xlsx, .xls) ou CSV.");
    }
    if (!arquivosValidos.length) return;

    setProcessando(true);
    try {
      const resultados = await Promise.all(
        arquivosValidos.map(async (file) => ({
          file,
          resultado: await parseArquivoNibo(file, competenciaDate(ano, mes)),
        })),
      );
      const linhas = resultados.flatMap((item) => item.resultado.linhas);
      const errosArquivos = resultados.flatMap((item) =>
        item.resultado.erros.map((erro) => `${item.file.name}: ${erro}`),
      );
      const avisosArquivos = resultados.flatMap((item) =>
        item.resultado.avisos.map((aviso) => `${item.file.name}: ${aviso}`),
      );

      setPrevia(linhas);
      setErros(errosArquivos);
      setAvisos(avisosArquivos);
      if (linhas.length) toast.success(`${linhas.length} lançamento(s) prontos para importar.`);
    } catch {
      setErros(["Não foi possível ler o arquivo. Verifique se é um Excel ou CSV do NIBO."]);
    } finally {
      setProcessando(false);
    }
  }

  function aoSoltar(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    e.stopPropagation();
    setArrastando(false);
    selecionarArquivos(Array.from(e.dataTransfer.files));
  }

  const importar = useMutation({
    mutationFn: async () => {
      if (!empresaId) throw new Error("Selecione uma empresa.");
      return importarLinhasFinanceiras({
        supabase,
        empresaId,
        linhas: previa,
        mapeamentos,
        arquivoNome: nomeImportacao,
        origem: "manual",
        ignorarDuplicados: true,
      });
    },
    onSuccess: ({ inseridos, ignorados }) => {
      toast.success(
        `${inseridos} lançamento(s) importado(s).${ignorados ? ` ${ignorados} duplicado(s) ignorado(s).` : ""}`,
      );
      setPrevia([]);
      setArquivos([]);
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      queryClient.invalidateQueries({ queryKey: ["importacoes"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao importar."),
  });

  const excluirImportacao = useMutation({
    mutationFn: async (importacaoId: string) => {
      if (!empresaId) throw new Error("Selecione uma empresa.");

      const { error } = await supabase
        .from("importacoes")
        .delete()
        .eq("id", importacaoId)
        .eq("empresa_id", empresaId);

      if (error) throw error;
    },
    onMutate: (importacaoId) => setExcluindoId(importacaoId),
    onSuccess: () => {
      toast.success("Importação excluída. Os lançamentos desse arquivo foram removidos.");
      queryClient.invalidateQueries({ queryKey: ["importacoes"] });
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao excluir a importação."),
    onSettled: () => setExcluindoId(null),
  });

  return (
    <>
      <TopBar titulo="Importação NIBO" descricao="Contas recebidas e pagas · regime de caixa" />
      <main className="space-y-5 p-6">
        {!empresaId ? (
          <SemEmpresa />
        ) : (
          <>
            <Bloco titulo="Nova importação">
              <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Competência</Label>
                    <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                      Reconhecida pela data da planilha
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Se a planilha tiver um ano inteiro, cada linha entra no mês e ano da própria
                      data do NIBO.
                    </p>
                  </div>
                </div>

                <div>
                  <label
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setArrastando(true);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                      setArrastando(true);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        setArrastando(false);
                      }
                    }}
                    onDrop={aoSoltar}
                    className={cn(
                      "flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors hover:border-info hover:bg-info-soft/40",
                      arquivos.length > 0 && "border-info bg-info-soft/30",
                      arrastando && "border-info bg-info-soft/60 ring-2 ring-info/20",
                    )}
                  >
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      multiple
                      className="hidden"
                      onChange={(e) => selecionarArquivos(Array.from(e.target.files ?? []))}
                    />
                    <FileSpreadsheet className="h-8 w-8 text-info" />
                    <p className="mt-3 text-sm font-medium">
                      {nomesArquivos || "Arraste e solte as planilhas do NIBO aqui"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Excel (.xlsx, .xls) ou CSV · colunas reconhecidas automaticamente
                    </p>
                  </label>

                  {processando && (
                    <p className="mt-3 text-sm text-muted-foreground">Lendo arquivo...</p>
                  )}

                  {erros.map((e) => (
                    <p
                      key={e}
                      className="mt-3 flex items-start gap-2 rounded-lg bg-negative-soft px-3 py-2 text-sm text-negative"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {e}
                    </p>
                  ))}
                  {avisos.map((a) => (
                    <p
                      key={a}
                      className="mt-3 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {a}
                    </p>
                  ))}
                </div>
              </div>
            </Bloco>

            {previa.length > 0 && (
              <Bloco
                titulo="Conferência antes de importar"
                acoes={
                  <Button size="sm" onClick={() => importar.mutate()} disabled={importar.isPending}>
                    <Upload className="mr-2 h-4 w-4" />
                    {importar.isPending ? "Importando..." : `Importar ${previa.length}`}
                  </Button>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                  <Resumo rotulo="Linhas válidas" valor={String(previa.length)} />
                  <Resumo rotulo="Recebidas" valor={brl(totalRecebidas)} />
                  <Resumo rotulo="Pagas" valor={brl(totalPagas)} />
                  <Resumo rotulo="Saldo" valor={brl(totalPrevia)} />
                  <Resumo rotulo="Competências" valor={`${competenciasPrevia.length} mês(es)`} />
                  <Resumo
                    rotulo="Sem categoria"
                    valor={String(semCategoria)}
                    alerta={semCategoria > 0}
                  />
                </div>
                {competenciasPrevia.length > 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Período detectado: {meses[Number(competenciasPrevia[0]?.slice(5, 7)) - 1]}/
                    {competenciasPrevia[0]?.slice(0, 4)} até{" "}
                    {meses[Number(competenciasPrevia.at(-1)?.slice(5, 7)) - 1]}/
                    {competenciasPrevia.at(-1)?.slice(0, 4)}
                    {anosPrevia.length > 1 ? ` · ${anosPrevia.length} anos` : ""}
                  </p>
                )}
                {duplicadas > 0 && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {duplicadas} lançamento(s) já existem no sistema e serão ignorados.
                  </p>
                )}
                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
                  Lançamentos já existentes são detectados pela chave única e ignorados
                  automaticamente.
                </p>

                <div className="-mx-5 mt-4 max-h-96 overflow-auto border-t">
                  <table className="w-full min-w-[840px] text-sm">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                      <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-5 py-2 text-left font-medium">Data</th>
                        <th className="px-3 py-2 text-left font-medium">Competência</th>
                        <th className="px-3 py-2 text-left font-medium">Tipo</th>
                        <th className="px-3 py-2 text-left font-medium">Descrição</th>
                        <th className="px-3 py-2 text-left font-medium">Pessoa</th>
                        <th className="px-3 py-2 text-left font-medium">Categoria NIBO</th>
                        <th className="px-5 py-2 text-right font-medium">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previa.slice(0, 200).map((l) => (
                        <tr key={l.hash} className="border-b">
                          <td className="px-5 py-2 text-muted-foreground">
                            {dataBR(l.data_efetiva)}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {meses[Number(l.competencia.slice(5, 7)) - 1]}/
                            {l.competencia.slice(0, 4)}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                "rounded px-2 py-0.5 text-xs font-medium",
                                l.tipo === "recebida"
                                  ? "bg-positive-soft text-positive"
                                  : "bg-negative-soft text-negative",
                              )}
                            >
                              {valorAssinadoPrevia(l) < 0 ? "Saída" : "Entrada"}
                            </span>
                          </td>
                          <td className="max-w-[260px] truncate px-3 py-2">{l.descricao || "—"}</td>
                          <td className="max-w-[180px] truncate px-3 py-2 text-muted-foreground">
                            {l.pessoa || "—"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {l.categoria_nibo || (
                              <span className="text-warning">Sem categoria</span>
                            )}
                          </td>
                          <td
                            className={cn(
                              "tabular px-5 py-2 text-right font-medium",
                              valorAssinadoPrevia(l) < 0 ? "text-negative" : "text-positive",
                            )}
                          >
                            {brl(valorAssinadoPrevia(l))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Bloco>
            )}

            <Bloco titulo="Histórico de importações">
              {importacoes.length === 0 ? (
                <SemDados mensagem="Nenhuma importação registrada para esta empresa." />
              ) : (
                <div className="-mx-5 -mb-5 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-5 py-2 text-left font-medium">Arquivo</th>
                        <th className="px-3 py-2 text-left font-medium">Tipo</th>
                        <th className="px-3 py-2 text-left font-medium">Competência</th>
                        <th className="px-3 py-2 text-right font-medium">Importados</th>
                        <th className="px-3 py-2 text-right font-medium">Duplicados</th>
                        <th className="px-5 py-2 text-left font-medium">Status</th>
                        <th className="px-5 py-2 text-right font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importacoes.map((i) => (
                        <tr key={i.id as string} className="border-b">
                          <td className="max-w-[240px] truncate px-5 py-2">
                            {i.arquivo_nome as string}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {i.tipo === "recebida" ? "Recebidas" : "Pagas"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {meses[Number(String(i.competencia).slice(5, 7)) - 1]}/
                            {String(i.competencia).slice(0, 4)}
                          </td>
                          <td className="tabular px-3 py-2 text-right">
                            {Number(i.total_registros ?? 0)}
                          </td>
                          <td className="tabular px-3 py-2 text-right text-muted-foreground">
                            {Number(i.duplicados ?? 0)}
                          </td>
                          <td className="px-5 py-2">
                            <span
                              className={cn(
                                "rounded px-2 py-0.5 text-xs font-medium",
                                i.status === "concluida"
                                  ? "bg-positive-soft text-positive"
                                  : "bg-warning-soft text-warning",
                              )}
                            >
                              {i.status === "concluida" ? "Concluída" : String(i.status)}
                            </span>
                          </td>
                          <td className="px-5 py-2 text-right">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:bg-negative-soft hover:text-negative"
                                  disabled={excluirImportacao.isPending}
                                  title="Excluir dados desta importação"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir esta importação?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Isso vai apagar os lançamentos importados de "
                                    {String(i.arquivo_nome)}" (
                                    {i.tipo === "recebida" ? "recebidas" : "pagas"}) e remover essa
                                    linha do histórico. As outras importações permanecem intactas.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    disabled={excluindoId === String(i.id)}
                                    onClick={() => excluirImportacao.mutate(String(i.id))}
                                  >
                                    {excluindoId === String(i.id) ? "Excluindo..." : "Excluir"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Bloco>
          </>
        )}
      </main>
    </>
  );
}

function Resumo({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className={cn("rounded-lg border px-4 py-3", alerta && "border-warning bg-warning-soft")}>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="tabular mt-1 text-base font-semibold">{valor}</p>
    </div>
  );
}

function valorAssinadoPrevia(linha: LinhaImportada) {
  return linha.valor;
}
