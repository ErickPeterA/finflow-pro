import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { TopBar } from "@/components/TopBar";
import { Bloco, SemDados, SemEmpresa } from "@/components/ui-blocos";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { useImportacoes, useLancamentos, useMapeamentos } from "@/lib/data";
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

type Tipo = "recebida" | "paga";

function ImportacaoPage() {
  const { empresaId, ano, mes } = useApp();
  const queryClient = useQueryClient();
  const { data: importacoes = [] } = useImportacoes(empresaId);
  const { data: mapeamentos = [] } = useMapeamentos(empresaId);
  const { data: lancamentos = [] } = useLancamentos(empresaId, ano);

  const [tipo, setTipo] = useState<Tipo>("recebida");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<LinhaImportada[]>([]);
  const [erros, setErros] = useState<string[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [processando, setProcessando] = useState(false);

  const hashesExistentes = useMemo(
    () => new Set(lancamentos.map((l) => `${l.tipo}|${l.data_efetiva}`)),
    [lancamentos],
  );

  const duplicadas = previa.filter((l) =>
    hashesExistentes.has(`${tipo}|${l.data_efetiva}`) ? false : false,
  ).length;

  const totalPrevia = previa.reduce((s, l) => s + l.valor, 0);
  const semCategoria = previa.filter((l) => !l.categoria_nibo).length;

  async function selecionar(file: File | null) {
    setArquivo(file);
    setPrevia([]);
    setErros([]);
    setAvisos([]);
    if (!file) return;
    setProcessando(true);
    try {
      const r = await parseArquivoNibo(file, tipo);
      setPrevia(r.linhas);
      setErros(r.erros);
      setAvisos(r.avisos);
      if (r.linhas.length) toast.success(`${r.linhas.length} lançamento(s) prontos para importar.`);
    } catch {
      setErros(["Não foi possível ler o arquivo. Verifique se é um Excel ou CSV do NIBO."]);
    } finally {
      setProcessando(false);
    }
  }

  const importar = useMutation({
    mutationFn: async () => {
      if (!empresaId) throw new Error("Selecione uma empresa.");
      const competencia = competenciaDate(ano, mes);
      const mapaCat = new Map(
        mapeamentos.map((m) => [
          String(m.categoria_nibo).toLowerCase(),
          m.categoria_id as string | null,
        ]),
      );

      const { data: imp, error: erroImp } = await supabase
        .from("importacoes")
        .insert({
          empresa_id: empresaId,
          tipo,
          competencia,
          arquivo_nome: arquivo?.name ?? "arquivo",
          total_linhas: previa.length,
          status: "processando",
        })
        .select("id")
        .single();
      if (erroImp) throw erroImp;

      const registros = previa.map((l) => ({
        empresa_id: empresaId,
        importacao_id: imp.id,
        tipo,
        data_efetiva: l.data_efetiva,
        competencia,
        descricao: l.descricao,
        categoria_nibo: l.categoria_nibo || null,
        categoria_id: mapaCat.get(l.categoria_nibo.toLowerCase()) ?? null,
        pessoa: l.pessoa || null,
        centro_custo: l.centro_custo || null,
        conta_bancaria: l.conta_bancaria || null,
        valor: l.valor,
        hash: l.hash,
      }));

      let inseridos = 0;
      let ignorados = 0;
      for (let i = 0; i < registros.length; i += 400) {
        const lote = registros.slice(i, i + 400);
        const { data, error } = await supabase
          .from("lancamentos")
          .upsert(lote, { onConflict: "empresa_id,hash", ignoreDuplicates: true })
          .select("id");
        if (error) throw error;
        inseridos += data?.length ?? 0;
        ignorados += lote.length - (data?.length ?? 0);
      }

      await supabase
        .from("importacoes")
        .update({
          status: "concluida",
          total_importados: inseridos,
          total_duplicados: ignorados,
        })
        .eq("id", imp.id);

      return { inseridos, ignorados };
    },
    onSuccess: ({ inseridos, ignorados }) => {
      toast.success(
        `${inseridos} lançamento(s) importado(s).${ignorados ? ` ${ignorados} duplicado(s) ignorado(s).` : ""}`,
      );
      setPrevia([]);
      setArquivo(null);
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      queryClient.invalidateQueries({ queryKey: ["importacoes"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao importar."),
  });

  return (
    <>
      <TopBar
        titulo="Importação NIBO"
        descricao="Contas recebidas e pagas · regime de caixa"
      />
      <main className="space-y-5 p-6">
        {!empresaId ? (
          <SemEmpresa />
        ) : (
          <>
            <Bloco titulo="Nova importação">
              <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Tipo de relatório</Label>
                    <Select
                      value={tipo}
                      onValueChange={(v) => {
                        setTipo(v as Tipo);
                        setPrevia([]);
                        setArquivo(null);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recebida">Contas recebidas</SelectItem>
                        <SelectItem value="paga">Contas pagas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Competência</Label>
                    <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                      {meses[mes]} de {ano}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Definida pelo seletor de período no topo da tela.
                    </p>
                  </div>
                </div>

                <div>
                  <label
                    className={cn(
                      "flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors hover:border-info hover:bg-info-soft/40",
                      arquivo && "border-info bg-info-soft/30",
                    )}
                  >
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => selecionar(e.target.files?.[0] ?? null)}
                    />
                    <FileSpreadsheet className="h-8 w-8 text-info" />
                    <p className="mt-3 text-sm font-medium">
                      {arquivo ? arquivo.name : "Selecione o arquivo exportado do NIBO"}
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
                  <Button
                    size="sm"
                    onClick={() => importar.mutate()}
                    disabled={importar.isPending}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {importar.isPending ? "Importando..." : `Importar ${previa.length}`}
                  </Button>
                }
              >
                <div className="grid gap-3 sm:grid-cols-4">
                  <Resumo rotulo="Linhas válidas" valor={String(previa.length)} />
                  <Resumo rotulo="Valor total" valor={brl(totalPrevia)} />
                  <Resumo rotulo="Sem categoria NIBO" valor={String(semCategoria)} alerta={semCategoria > 0} />
                  <Resumo rotulo="Duplicidades no arquivo" valor={String(duplicadas)} />
                </div>
                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
                  Lançamentos já existentes são detectados pela chave única e ignorados
                  automaticamente.
                </p>

                <div className="-mx-5 mt-4 max-h-96 overflow-auto border-t">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                      <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-5 py-2 text-left font-medium">Data</th>
                        <th className="px-3 py-2 text-left font-medium">Descrição</th>
                        <th className="px-3 py-2 text-left font-medium">Pessoa</th>
                        <th className="px-3 py-2 text-left font-medium">Categoria NIBO</th>
                        <th className="px-5 py-2 text-right font-medium">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previa.slice(0, 200).map((l) => (
                        <tr key={l.hash} className="border-b">
                          <td className="px-5 py-2 text-muted-foreground">{dataBR(l.data_efetiva)}</td>
                          <td className="max-w-[260px] truncate px-3 py-2">{l.descricao || "—"}</td>
                          <td className="max-w-[180px] truncate px-3 py-2 text-muted-foreground">
                            {l.pessoa || "—"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {l.categoria_nibo || (
                              <span className="text-warning">Sem categoria</span>
                            )}
                          </td>
                          <td className="tabular px-5 py-2 text-right font-medium">{brl(l.valor)}</td>
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
                            {Number(i.total_importados ?? 0)}
                          </td>
                          <td className="tabular px-3 py-2 text-right text-muted-foreground">
                            {Number(i.total_duplicados ?? 0)}
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

function Resumo({
  rotulo,
  valor,
  alerta,
}: {
  rotulo: string;
  valor: string;
  alerta?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border px-4 py-3", alerta && "border-warning bg-warning-soft")}>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="tabular mt-1 text-base font-semibold">{valor}</p>
    </div>
  );
}
