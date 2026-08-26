import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  BrainCircuit,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Filter,
  History,
  Lightbulb,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { SemDados, SemEmpresa } from "@/components/ui-blocos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { filtrarLancamentosPorCentroCusto } from "@/lib/centro-custo";
import { useApp } from "@/lib/app-context";
import { useCategorias, useLancamentos } from "@/lib/data";
import { mesDaCompetencia, nomeCategoria, type Categoria, type Lancamento } from "@/lib/dre";
import { brl, dataBR, mesesCurtos, pct } from "@/lib/format";
import { mesesDoPeriodoFiltro } from "@/lib/periodo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/auditoria-financeira")({
  head: () => ({
    meta: [
      { title: "Auditoria Financeira | Ecossistema Financeiro BPO" },
      {
        name: "description",
        content:
          "Central de exceções para revisar lançamentos importados do NIBO por cliente, histórico, regras e aderência ao plano de contas.",
      },
      { property: "og:title", content: "Auditoria Financeira | Ecossistema Financeiro BPO" },
      {
        property: "og:description",
        content: "Auditoria de classificação, completude, recorrências, valores e duplicidades.",
      },
    ],
  }),
  component: AuditoriaFinanceiraPage,
});

type Criticidade = "critico" | "atencao" | "informativo";
type StatusRevisao = "pendente" | "revisado";
type TipoAuditoria =
  | "classificacao"
  | "conta_agrupadora"
  | "completude"
  | "valor"
  | "quantidade"
  | "novo_fornecedor"
  | "fornecedor_atipico"
  | "duplicidade";
type MovimentoFiltro = "todos" | "receitas" | "pagamentos";
type AbaFiltro = "todas" | "classificacao" | "completude" | "valores" | "novos" | "duplicidades";

interface AuditoriaItem {
  id: string;
  status: StatusRevisao;
  criticidade: Criticidade;
  tipo: TipoAuditoria;
  lancamento?: Lancamento;
  lancamentoLabel: string;
  categoriaAtual: string;
  sugestao: string;
  confianca: number;
  valor: number | null;
  motivo: string;
  evidencias: string[];
  categoriaId?: string | null;
  movimento: "receita" | "pagamento";
}

interface PerfilFornecedor {
  fornecedor: string;
  ocorrencias: number;
  categoriaPredominante: string;
  categorias: string[];
  valorMedio: number;
  ultimaOcorrencia: string;
  frequencia: string;
  descricoes: string[];
}

const labelsTipo: Record<TipoAuditoria, string> = {
  classificacao: "Classificação",
  conta_agrupadora: "Conta agrupadora",
  completude: "Ausência",
  valor: "Valor",
  quantidade: "Quantidade",
  novo_fornecedor: "Novo fornecedor",
  fornecedor_atipico: "Fornecedor atípico",
  duplicidade: "Duplicidade",
};

const labelsCriticidade: Record<Criticidade, string> = {
  critico: "Crítico",
  atencao: "Atenção",
  informativo: "Informativo",
};

const quickFilters: Array<{ value: AbaFiltro; label: string }> = [
  { value: "todas", label: "Todas" },
  { value: "classificacao", label: "Classificação" },
  { value: "completude", label: "Completude" },
  { value: "valores", label: "Valores fora do padrão" },
  { value: "novos", label: "Novos fornecedores" },
  { value: "duplicidades", label: "Duplicidades" },
];

function AuditoriaFinanceiraPage() {
  const { empresaId, ano, mes, periodo, centroCusto } = useApp();
  const { data: lancamentos = [], isLoading } = useLancamentos(empresaId, ano);
  const { data: categorias = [] } = useCategorias(empresaId);
  const mesesPeriodo = useMemo(() => mesesDoPeriodoFiltro(periodo, mes), [periodo, mes]);
  const lancamentosCentro = useMemo(
    () => filtrarLancamentosPorCentroCusto(lancamentos, centroCusto),
    [centroCusto, lancamentos],
  );
  const lancamentosPeriodo = useMemo(
    () =>
      lancamentosCentro.filter((lancamento) =>
        mesesPeriodo.includes(mesDaCompetencia(lancamento.competencia)),
      ),
    [lancamentosCentro, mesesPeriodo],
  );

  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("todas");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | StatusRevisao>("todos");
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | TipoAuditoria>("todos");
  const [criticidadeFiltro, setCriticidadeFiltro] = useState<"todos" | Criticidade>("todos");
  const [movimentoFiltro, setMovimentoFiltro] = useState<MovimentoFiltro>("todos");
  const [somentePendentes, setSomentePendentes] = useState(false);
  const [somenteRevisados, setSomenteRevisados] = useState(false);
  const [aba, setAba] = useState<AbaFiltro>("todas");
  const [decisoes, setDecisoes] = useState<Record<string, string>>({});
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [execucaoManual, setExecucaoManual] = useState(0);

  const auditoriasBase = useMemo(
    () => gerarAuditorias(lancamentosCentro, lancamentosPeriodo, categorias, mesesPeriodo),
    [categorias, lancamentosCentro, lancamentosPeriodo, mesesPeriodo],
  );

  const auditorias = useMemo(
    () =>
      auditoriasBase.map((item) => ({
        ...item,
        status: decisoes[item.id] ? "revisado" : item.status,
      })),
    [auditoriasBase, decisoes],
  );

  const categoriasFiltro = useMemo(
    () =>
      [
        ...new Set(auditorias.map((item) => item.categoriaAtual).filter((nome) => nome !== "—")),
      ].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [auditorias],
  );

  const auditoriasFiltradas = useMemo(() => {
    const termo = normalizar(busca);
    return auditorias.filter((item) => {
      const texto = normalizar(
        [
          item.lancamentoLabel,
          item.categoriaAtual,
          item.sugestao,
          item.motivo,
          item.lancamento?.pessoa,
          item.lancamento?.descricao,
        ].join(" "),
      );
      if (termo && !texto.includes(termo)) return false;
      if (categoriaFiltro !== "todas" && item.categoriaAtual !== categoriaFiltro) return false;
      if (statusFiltro !== "todos" && item.status !== statusFiltro) return false;
      if (tipoFiltro !== "todos" && item.tipo !== tipoFiltro) return false;
      if (criticidadeFiltro !== "todos" && item.criticidade !== criticidadeFiltro) return false;
      if (movimentoFiltro === "receitas" && item.movimento !== "receita") return false;
      if (movimentoFiltro === "pagamentos" && item.movimento !== "pagamento") return false;
      if (somentePendentes && item.status !== "pendente") return false;
      if (somenteRevisados && item.status !== "revisado") return false;
      if (
        aba === "classificacao" &&
        !["classificacao", "conta_agrupadora", "fornecedor_atipico"].includes(item.tipo)
      ) {
        return false;
      }
      if (aba === "completude" && !["completude", "quantidade"].includes(item.tipo)) return false;
      if (aba === "valores" && item.tipo !== "valor") return false;
      if (aba === "novos" && item.tipo !== "novo_fornecedor") return false;
      if (aba === "duplicidades" && item.tipo !== "duplicidade") return false;
      return true;
    });
  }, [
    aba,
    auditorias,
    busca,
    categoriaFiltro,
    criticidadeFiltro,
    movimentoFiltro,
    somentePendentes,
    somenteRevisados,
    statusFiltro,
    tipoFiltro,
  ]);

  const resumo = useMemo(
    () => calcularResumo(lancamentosPeriodo.length, auditorias),
    [auditorias, lancamentosPeriodo.length],
  );
  const selecionado = auditorias.find((item) => item.id === selecionadoId) ?? null;
  const perfilFornecedor = useMemo(
    () =>
      selecionado?.lancamento?.pessoa
        ? montarPerfilFornecedor(selecionado.lancamento.pessoa, lancamentosCentro, categorias)
        : null,
    [categorias, lancamentosCentro, selecionado],
  );

  function registrarDecisao(item: AuditoriaItem, decisao: string) {
    setDecisoes((atuais) => ({ ...atuais, [item.id]: decisao }));
  }

  return (
    <>
      <TopBar
        titulo="Auditoria Financeira"
        descricao={`Exceções do período ${mesesPeriodo.map((m) => mesesCurtos[m]).join(", ")} de ${ano}`}
        acoes={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExecucaoManual((valor) => valor + 1)}
          >
            <Sparkles className="h-4 w-4" />
            {execucaoManual ? "Auditoria atualizada" : "Executar auditoria"}
          </Button>
        }
      />
      <main className="space-y-5 p-6">
        {!empresaId ? (
          <SemEmpresa />
        ) : isLoading ? (
          <SemDados mensagem="Carregando base financeira do cliente..." />
        ) : lancamentosPeriodo.length === 0 ? (
          <SemDados mensagem="Ainda não há lançamentos importados para o período selecionado." />
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <KpiAuditoria
                titulo="Analisados"
                valor={String(resumo.analisados)}
                legenda="lançamentos NIBO"
                icon={ClipboardCheck}
                tom="neutro"
              />
              <KpiAuditoria
                titulo="Coerentes"
                valor={String(resumo.coerentes)}
                legenda={`${pct(resumo.coerencia)} da base`}
                icon={BadgeCheck}
                tom="positivo"
              />
              <KpiAuditoria
                titulo="Atenções"
                valor={String(resumo.atencoes)}
                legenda="para conferência"
                icon={AlertTriangle}
                tom="atencao"
              />
              <KpiAuditoria
                titulo="Críticos"
                valor={String(resumo.criticos)}
                legenda="prioridade alta"
                icon={ShieldAlert}
                tom="negativo"
              />
              <KpiAuditoria
                titulo="Score"
                valor={pct(resumo.score, 0)}
                legenda="aderência estimada"
                icon={ShieldCheck}
                tom={resumo.score >= 90 ? "positivo" : resumo.score >= 70 ? "atencao" : "negativo"}
              />
            </section>

            <section className="rounded-xl border bg-card shadow-card">
              <div className="border-b px-5 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative min-w-64 flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={busca}
                      onChange={(event) => setBusca(event.target.value)}
                      placeholder="Buscar lançamento, fornecedor, categoria ou motivo"
                      className="pl-9"
                    />
                  </div>
                  <Badge variant="outline" className="gap-1 py-1.5">
                    <Filter className="h-3.5 w-3.5" />
                    {auditoriasFiltradas.length} exceções
                  </Badge>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
                    <SelectTrigger>
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as categorias</SelectItem>
                      {categoriasFiltro.map((categoria) => (
                        <SelectItem key={categoria} value={categoria}>
                          {categoria}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={statusFiltro}
                    onValueChange={(value) => setStatusFiltro(value as typeof statusFiltro)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os status</SelectItem>
                      <SelectItem value="pendente">Pendentes</SelectItem>
                      <SelectItem value="revisado">Revisados</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={tipoFiltro}
                    onValueChange={(value) => setTipoFiltro(value as typeof tipoFiltro)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Tipo de auditoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os tipos</SelectItem>
                      {Object.entries(labelsTipo).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={criticidadeFiltro}
                    onValueChange={(value) =>
                      setCriticidadeFiltro(value as typeof criticidadeFiltro)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Criticidade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas as criticidades</SelectItem>
                      <SelectItem value="critico">Crítico</SelectItem>
                      <SelectItem value="atencao">Atenção</SelectItem>
                      <SelectItem value="informativo">Informativo</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={movimentoFiltro}
                    onValueChange={(value) => setMovimentoFiltro(value as MovimentoFiltro)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Receitas/Pagamentos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Receitas e pagamentos</SelectItem>
                      <SelectItem value="receitas">Receitas</SelectItem>
                      <SelectItem value="pagamentos">Pagamentos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <FiltroSwitch
                    id="somente-pendentes"
                    checked={somentePendentes}
                    onCheckedChange={(checked) => {
                      setSomentePendentes(checked);
                      if (checked) setSomenteRevisados(false);
                    }}
                    label="Somente pendentes"
                  />
                  <FiltroSwitch
                    id="somente-revisados"
                    checked={somenteRevisados}
                    onCheckedChange={(checked) => {
                      setSomenteRevisados(checked);
                      if (checked) setSomentePendentes(false);
                    }}
                    label="Somente revisados"
                  />
                </div>

                <Tabs
                  value={aba}
                  onValueChange={(value) => setAba(value as AbaFiltro)}
                  className="mt-4"
                >
                  <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-muted/70 p-1">
                    {quickFilters.map((item) => (
                      <TabsTrigger key={item.value} value={item.value} className="h-8">
                        {item.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>

              <TabelaAuditoria
                auditorias={auditoriasFiltradas}
                onSelecionar={(item) => setSelecionadoId(item.id)}
                onRegistrarDecisao={registrarDecisao}
              />
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <PainelConhecimento categorias={categorias} lancamentos={lancamentosCentro} />
              <PainelFases />
            </section>
          </>
        )}
      </main>

      <Sheet open={!!selecionado} onOpenChange={(open) => !open && setSelecionadoId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {selecionado && (
            <PainelRevisao
              item={selecionado}
              perfilFornecedor={perfilFornecedor}
              decisao={decisoes[selecionado.id]}
              onRegistrarDecisao={(decisao) => registrarDecisao(selecionado, decisao)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function TabelaAuditoria({
  auditorias,
  onSelecionar,
  onRegistrarDecisao,
}: {
  auditorias: AuditoriaItem[];
  onSelecionar: (item: AuditoriaItem) => void;
  onRegistrarDecisao: (item: AuditoriaItem, decisao: string) => void;
}) {
  if (auditorias.length === 0) {
    return <SemDados mensagem="Nenhuma exceção encontrada com os filtros atuais." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead>Status</TableHead>
          <TableHead>Auditoria</TableHead>
          <TableHead>Lançamento</TableHead>
          <TableHead>Categoria atual</TableHead>
          <TableHead>Sugestão / esperado</TableHead>
          <TableHead className="text-right">Confiança</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead>Motivo</TableHead>
          <TableHead className="w-32 text-right">Ação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {auditorias.map((item) => (
          <TableRow key={item.id} className="cursor-pointer" onClick={() => onSelecionar(item)}>
            <TableCell>
              <div className="space-y-1">
                <StatusBadge status={item.status} />
                <CriticidadeBadge criticidade={item.criticidade} />
              </div>
            </TableCell>
            <TableCell>
              <span className="font-medium">{labelsTipo[item.tipo]}</span>
            </TableCell>
            <TableCell className="max-w-72">
              <span className="block truncate font-medium">{item.lancamentoLabel}</span>
              {item.lancamento && (
                <span className="block truncate text-xs text-muted-foreground">
                  {dataBR(item.lancamento.data_efetiva)} ·{" "}
                  {item.lancamento.pessoa ?? "Sem fornecedor"}
                </span>
              )}
            </TableCell>
            <TableCell className="max-w-48 truncate">{item.categoriaAtual}</TableCell>
            <TableCell className="max-w-56 truncate font-medium text-primary">
              {item.sugestao}
            </TableCell>
            <TableCell className="text-right tabular">{pct(item.confianca, 0)}</TableCell>
            <TableCell className="text-right tabular">
              {item.valor == null ? "—" : brl(item.valor)}
            </TableCell>
            <TableCell className="max-w-80 truncate text-muted-foreground">{item.motivo}</TableCell>
            <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => onSelecionar(item)}
                title="Abrir revisão"
              >
                <Eye className="h-4 w-4" />
              </Button>
              {item.status === "pendente" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={() => onRegistrarDecisao(item, "Mantido após revisão rápida")}
                  title="Marcar como revisado"
                >
                  <Check className="h-4 w-4" />
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PainelRevisao({
  item,
  perfilFornecedor,
  decisao,
  onRegistrarDecisao,
}: {
  item: AuditoriaItem;
  perfilFornecedor: PerfilFornecedor | null;
  decisao?: string;
  onRegistrarDecisao: (decisao: string) => void;
}) {
  const lancamento = item.lancamento;

  return (
    <div className="space-y-6">
      <SheetHeader>
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <CriticidadeBadge criticidade={item.criticidade} />
          <Badge variant="outline">{labelsTipo[item.tipo]}</Badge>
          <StatusBadge status={item.status} />
        </div>
        <SheetTitle>{item.lancamentoLabel}</SheetTitle>
        <SheetDescription>{item.motivo}</SheetDescription>
      </SheetHeader>

      <section className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Lançamento</h3>
        </div>
        <dl className="grid gap-3 p-4 text-sm sm:grid-cols-2">
          <InfoItem rotulo="Data" valor={lancamento ? dataBR(lancamento.data_efetiva) : "—"} />
          <InfoItem rotulo="Fornecedor/cliente" valor={lancamento?.pessoa ?? "—"} />
          <InfoItem
            rotulo="Descrição"
            valor={lancamento?.descricao ?? item.lancamentoLabel}
            className="sm:col-span-2"
          />
          <InfoItem rotulo="Valor" valor={item.valor == null ? "—" : brl(item.valor)} />
          <InfoItem rotulo="Tipo" valor={item.movimento === "receita" ? "Receita" : "Pagamento"} />
          <InfoItem rotulo="Categoria atual" valor={item.categoriaAtual} />
          <InfoItem rotulo="Centro de custo" valor={lancamento?.centro_custo ?? "—"} />
        </dl>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Sugestão do sistema</h3>
        </div>
        <div className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Categoria sugerida / esperado
              </p>
              <p className="mt-1 text-lg font-semibold text-primary">{item.sugestao}</p>
            </div>
            <div className="rounded-lg bg-info-soft px-3 py-2 text-right text-info">
              <p className="text-xs font-medium">Confiança</p>
              <p className="tabular text-xl font-semibold">{pct(item.confianca, 0)}</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">{item.motivo}</p>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">Evidências</p>
            <ul className="space-y-2">
              {item.evidencias.map((evidencia) => (
                <li key={evidencia} className="flex gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm">
                  <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                  <span>{evidencia}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Ações</h3>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          <Button onClick={() => onRegistrarDecisao(`Corrigido para ${item.sugestao}`)}>
            <CheckCircle2 className="h-4 w-4" />
            Corrigir categoria
          </Button>
          <Button
            variant="outline"
            onClick={() => onRegistrarDecisao("Classificação atual mantida")}
          >
            <ShieldCheck className="h-4 w-4" />
            Manter atual
          </Button>
          <Button
            variant="outline"
            onClick={() => onRegistrarDecisao("Lançamento ignorado nesta auditoria")}
          >
            <X className="h-4 w-4" />
            Ignorar lançamento
          </Button>
          <Button
            variant="outline"
            onClick={() => onRegistrarDecisao("Exceção cadastrada para recorrências semelhantes")}
          >
            <Lightbulb className="h-4 w-4" />
            Criar exceção
          </Button>
          <Button variant="outline" onClick={() => onRegistrarDecisao("Regra de auditoria criada")}>
            <BookOpen className="h-4 w-4" />
            Criar regra
          </Button>
          <Button variant="outline" onClick={() => onRegistrarDecisao("Regra aberta para edição")}>
            <History className="h-4 w-4" />
            Editar regra
          </Button>
          <Button
            variant="outline"
            onClick={() => onRegistrarDecisao("Histórico do fornecedor consultado")}
          >
            <History className="h-4 w-4" />
            Histórico do fornecedor
          </Button>
          <Button
            variant="outline"
            onClick={() => onRegistrarDecisao("Histórico da categoria consultado")}
          >
            <BookOpen className="h-4 w-4" />
            Histórico da categoria
          </Button>
        </div>
        {decisao && (
          <div className="border-t bg-positive-soft px-4 py-3 text-sm text-positive">
            Decisão registrada nesta sessão: {decisao}
          </div>
        )}
      </section>

      {perfilFornecedor && (
        <section className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Histórico do fornecedor/cliente</h3>
          </div>
          <dl className="grid gap-3 p-4 text-sm sm:grid-cols-2">
            <InfoItem rotulo="Ocorrências" valor={String(perfilFornecedor.ocorrencias)} />
            <InfoItem
              rotulo="Categoria predominante"
              valor={perfilFornecedor.categoriaPredominante}
            />
            <InfoItem rotulo="Valor médio" valor={brl(perfilFornecedor.valorMedio)} />
            <InfoItem
              rotulo="Última ocorrência"
              valor={dataBR(perfilFornecedor.ultimaOcorrencia)}
            />
            <InfoItem rotulo="Frequência" valor={perfilFornecedor.frequencia} />
            <InfoItem
              rotulo="Categorias utilizadas"
              valor={perfilFornecedor.categorias.join(", ")}
            />
            <InfoItem
              rotulo="Descrições recorrentes"
              valor={perfilFornecedor.descricoes.join(" · ")}
              className="sm:col-span-2"
            />
          </dl>
        </section>
      )}
    </div>
  );
}

function PainelConhecimento({
  categorias,
  lancamentos,
}: {
  categorias: Categoria[];
  lancamentos: Lancamento[];
}) {
  const categoriasAtivas = categorias.filter((categoria) => categoria.ativo);
  const recorrentes = categoriasAtivas.filter((categoria) => categoria.recorrente).length;
  const fornecedores = new Set(
    lancamentos.map((lancamento) => normalizarFornecedor(lancamento.pessoa)).filter(Boolean),
  ).size;
  const agrupadoras = identificarAgrupadoras(categoriasAtivas).size;

  return (
    <section className="rounded-xl border bg-card shadow-card">
      <div className="border-b px-5 py-3">
        <h2 className="text-sm font-semibold">Base de conhecimento financeira</h2>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat
          icon={BookOpen}
          label="Plano de contas"
          value={`${categoriasAtivas.length} categorias`}
        />
        <MiniStat icon={ShieldAlert} label="Agrupadoras" value={`${agrupadoras} bloqueadas`} />
        <MiniStat icon={History} label="Histórico" value={`${lancamentos.length} movimentos`} />
        <MiniStat icon={BadgeCheck} label="Recorrência" value={`${recorrentes} categorias`} />
      </div>
      <div className="border-t px-5 py-4">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Fornecedores/clientes
            </p>
            <p className="mt-1 font-semibold">{fornecedores}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Evidências priorizadas
            </p>
            <p className="mt-1 font-semibold">Regra, histórico, descrição e valor</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Modelo por cliente
            </p>
            <p className="mt-1 font-semibold">Manual + histórico + decisões</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PainelFases() {
  const fases = [
    {
      nome: "Fase 1",
      status: "Nesta tela",
      itens: "classificação, ausência, valor, novo fornecedor e duplicidade",
    },
    {
      nome: "Fase 2",
      status: "Preparado",
      itens: "regras aprovadas, exceções e histórico de decisões persistente",
    },
    {
      nome: "Fase 3",
      status: "Preparado",
      itens: "similaridade semântica, perfis automáticos e anomalias avançadas",
    },
  ];

  return (
    <section className="rounded-xl border bg-card shadow-card">
      <div className="border-b px-5 py-3">
        <h2 className="text-sm font-semibold">Ciclo de aprendizado</h2>
      </div>
      <div className="space-y-3 p-5">
        {fases.map((fase) => (
          <div key={fase.nome} className="flex gap-3 rounded-lg border p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-info-soft text-info">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{fase.nome}</p>
                <Badge variant="outline">{fase.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{fase.itens}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function KpiAuditoria({
  titulo,
  valor,
  legenda,
  icon: Icon,
  tom,
}: {
  titulo: string;
  valor: string;
  legenda: string;
  icon: typeof ClipboardCheck;
  tom: "positivo" | "negativo" | "atencao" | "neutro";
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {titulo}
          </p>
          <p className="tabular mt-2 text-2xl font-semibold">{valor}</p>
        </div>
        <div
          className={cn(
            "rounded-lg p-2",
            tom === "positivo" && "bg-positive-soft text-positive",
            tom === "negativo" && "bg-negative-soft text-negative",
            tom === "atencao" && "bg-warning-soft text-warning",
            tom === "neutro" && "bg-info-soft text-info",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">{legenda}</p>
    </div>
  );
}

function FiltroSwitch({
  id,
  checked,
  onCheckedChange,
  label,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
    </div>
  );
}

function StatusBadge({ status }: { status: StatusRevisao }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "w-fit",
        status === "revisado"
          ? "border-positive/30 bg-positive-soft text-positive"
          : "border-info/30 bg-info-soft text-info",
      )}
    >
      {status === "revisado" ? "Revisado" : "Pendente"}
    </Badge>
  );
}

function CriticidadeBadge({ criticidade }: { criticidade: Criticidade }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "w-fit",
        criticidade === "critico" && "border-negative/30 bg-negative-soft text-negative",
        criticidade === "atencao" && "border-warning/30 bg-warning-soft text-warning",
        criticidade === "informativo" && "border-info/30 bg-info-soft text-info",
      )}
    >
      {labelsCriticidade[criticidade]}
    </Badge>
  );
}

function InfoItem({
  rotulo,
  valor,
  className,
}: {
  rotulo: string;
  valor: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase text-muted-foreground">{rotulo}</dt>
      <dd className="mt-1 break-words font-medium">{valor}</dd>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase text-muted-foreground">{label}</p>
        <p className="truncate font-semibold">{value}</p>
      </div>
    </div>
  );
}

function gerarAuditorias(
  lancamentosAno: Lancamento[],
  lancamentosPeriodo: Lancamento[],
  categorias: Categoria[],
  mesesPeriodo: number[],
): AuditoriaItem[] {
  const itens: AuditoriaItem[] = [];
  const porId = new Set<string>();
  const agrupadoras = identificarAgrupadoras(categorias);
  const mapaCategorias = new Map(categorias.map((categoria) => [categoria.id, categoria]));
  const historico = lancamentosAno.filter(
    (lancamento) => !lancamentosPeriodo.some((atual) => atual.id === lancamento.id),
  );
  const historicoFornecedor = agruparHistoricoFornecedor(historico, categorias);
  const historicoCategoria = agruparHistoricoCategoria(historico, categorias);

  for (const lancamento of lancamentosPeriodo) {
    const categoriaAtual = nomeCategoria(lancamento, categorias);
    const categoria = lancamento.categoria_id
      ? mapaCategorias.get(lancamento.categoria_id)
      : undefined;
    const valorAbs = Math.abs(Number(lancamento.valor) || 0);
    const fornecedorKey = normalizarFornecedor(lancamento.pessoa);
    const categoriaKey = lancamento.categoria_id ?? categoriaAtual;
    const movimento = lancamento.tipo === "recebida" ? "receita" : "pagamento";

    if (categoria && agrupadoras.has(categoria.id)) {
      const sugestao =
        primeiraCategoriaFilha(categoria, categorias)?.nome ??
        "Categoria analítica abaixo da agrupadora";
      itens.push({
        id: `agrupadora-${lancamento.id}`,
        status: "pendente",
        criticidade: "critico",
        tipo: "conta_agrupadora",
        lancamento,
        lancamentoLabel: lancamento.descricao || lancamento.pessoa || "Lançamento sem descrição",
        categoriaAtual,
        sugestao,
        confianca: 100,
        valor: valorAbs,
        motivo:
          "A categoria atual foi identificada como conta agrupadora e não deve receber lançamentos diretamente.",
        evidencias: [
          "A categoria possui subcategorias analíticas no plano de contas do cliente.",
          "Contas agrupadoras são tratadas como regra explícita de alta prioridade.",
        ],
        categoriaId: lancamento.categoria_id,
        movimento,
      });
      porId.add(lancamento.id);
    }

    const fornecedorStats = fornecedorKey ? historicoFornecedor.get(fornecedorKey) : undefined;
    const categoriaPredominante = fornecedorStats
      ? categoriaMaisFrequente(fornecedorStats.categorias)
      : null;
    if (
      categoriaPredominante &&
      fornecedorStats &&
      fornecedorStats.total >= 3 &&
      categoriaPredominante.rate >= 0.75 &&
      categoriaPredominante.nome !== categoriaAtual
    ) {
      itens.push({
        id: `historico-fornecedor-${lancamento.id}`,
        status: "pendente",
        criticidade: categoriaPredominante.rate >= 0.9 ? "critico" : "atencao",
        tipo: "classificacao",
        lancamento,
        lancamentoLabel: lancamento.descricao || lancamento.pessoa || "Lançamento sem descrição",
        categoriaAtual,
        sugestao: categoriaPredominante.nome,
        confianca: Math.min(96, Math.round(72 + categoriaPredominante.rate * 22)),
        valor: valorAbs,
        motivo: `O histórico deste cliente associa ${lancamento.pessoa ?? "este fornecedor"} a ${categoriaPredominante.nome} em ${categoriaPredominante.count} de ${fornecedorStats.total} ocorrências.`,
        evidencias: [
          "Histórico consistente de fornecedor para categoria dentro do mesmo cliente.",
          "A sugestão considera também descrição, valor e recorrência antes de gerar a exceção.",
        ],
        categoriaId: lancamento.categoria_id,
        movimento,
      });
      porId.add(lancamento.id);
    }

    const sugestaoSemantica = sugerirCategoriaPorTexto(lancamento, categorias, categoriaAtual);
    if (
      sugestaoSemantica &&
      sugestaoSemantica.sugestao !== categoriaAtual &&
      sugestaoSemantica.confianca >= 72
    ) {
      itens.push({
        id: `texto-categoria-${lancamento.id}`,
        status: "pendente",
        criticidade: sugestaoSemantica.confianca >= 88 ? "critico" : "atencao",
        tipo: "classificacao",
        lancamento,
        lancamentoLabel: lancamento.descricao || lancamento.pessoa || "Lançamento sem descrição",
        categoriaAtual,
        sugestao: sugestaoSemantica.sugestao,
        confianca: sugestaoSemantica.confianca,
        valor: valorAbs,
        motivo:
          "A descrição do lançamento tem maior aderência ao significado da categoria sugerida do que à categoria atual.",
        evidencias: [
          `Termos relevantes: ${sugestaoSemantica.termos.join(", ")}`,
          "A análise usa descrição e plano de contas, não apenas o nome do fornecedor.",
        ],
        categoriaId: lancamento.categoria_id,
        movimento,
      });
      porId.add(lancamento.id);
    }

    const valoresHistoricos =
      fornecedorKey && fornecedorStats?.valoresPorCategoria.get(categoriaKey)?.length
        ? fornecedorStats.valoresPorCategoria.get(categoriaKey)!
        : (historicoCategoria.get(categoriaKey)?.valores ?? []);
    if (valoresHistoricos.length >= 3) {
      const media =
        valoresHistoricos.reduce((soma, valor) => soma + valor, 0) / valoresHistoricos.length;
      const variacaoValor = media > 0 ? ((valorAbs - media) / media) * 100 : 0;
      if (media > 0 && Math.abs(variacaoValor) >= 60 && Math.abs(valorAbs - media) >= 100) {
        itens.push({
          id: `valor-${lancamento.id}`,
          status: "pendente",
          criticidade: Math.abs(variacaoValor) >= 100 ? "critico" : "atencao",
          tipo: "valor",
          lancamento,
          lancamentoLabel: lancamento.descricao || lancamento.pessoa || "Lançamento sem descrição",
          categoriaAtual,
          sugestao: `Média histórica ${brl(media)}`,
          confianca: Math.min(94, Math.round(Math.abs(variacaoValor))),
          valor: valorAbs,
          motivo: `Valor ${pct(Math.abs(variacaoValor), 0)} ${variacaoValor > 0 ? "acima" : "abaixo"} da média histórica.`,
          evidencias: [
            `${valoresHistoricos.length} ocorrências comparáveis foram localizadas no histórico.`,
            "Faixa histórica de valor é evidência média e gera conferência, não correção automática.",
          ],
          categoriaId: lancamento.categoria_id,
          movimento,
        });
        porId.add(lancamento.id);
      }
    }

    if (fornecedorKey && !fornecedorStats && !porId.has(lancamento.id)) {
      const coerencia = sugerirCategoriaPorTexto(lancamento, categorias, categoriaAtual);
      itens.push({
        id: `novo-fornecedor-${lancamento.id}`,
        status: "pendente",
        criticidade: "informativo",
        tipo: "novo_fornecedor",
        lancamento,
        lancamentoLabel: lancamento.descricao || lancamento.pessoa || "Lançamento sem descrição",
        categoriaAtual,
        sugestao:
          coerencia?.sugestao === categoriaAtual
            ? "Provável classificação correta"
            : (coerencia?.sugestao ?? categoriaAtual),
        confianca: coerencia?.sugestao === categoriaAtual ? Math.max(76, coerencia.confianca) : 65,
        valor: valorAbs,
        motivo:
          "Fornecedor sem histórico para este cliente; a classificação foi comparada com descrição, categoria e valor.",
        evidencias: [
          "Fornecedor novo tem peso baixo na hierarquia de evidências.",
          "A auditoria marca para conferência sem tratar automaticamente como erro.",
        ],
        categoriaId: lancamento.categoria_id,
        movimento,
      });
    }

    const categoriaStats = historicoCategoria.get(categoriaKey);
    if (
      fornecedorKey &&
      categoriaStats &&
      categoriaStats.total >= 8 &&
      !categoriaStats.fornecedores.has(fornecedorKey)
    ) {
      itens.push({
        id: `fornecedor-atipico-${lancamento.id}`,
        status: "pendente",
        criticidade: "atencao",
        tipo: "fornecedor_atipico",
        lancamento,
        lancamentoLabel: lancamento.descricao || lancamento.pessoa || "Lançamento sem descrição",
        categoriaAtual,
        sugestao: "Conferir aderência à categoria",
        confianca: 82,
        valor: valorAbs,
        motivo:
          "Fornecedor atípico para uma categoria com histórico concentrado em outros fornecedores.",
        evidencias: [
          `${categoriaStats.total} ocorrências históricas existem para esta categoria.`,
          "O fornecedor não apareceu anteriormente nesta categoria para o cliente selecionado.",
        ],
        categoriaId: lancamento.categoria_id,
        movimento,
      });
    }
  }

  for (const duplicidade of encontrarDuplicidades(lancamentosPeriodo, categorias)) {
    itens.push(duplicidade);
  }

  for (const ausencia of encontrarAusencias(
    lancamentosAno,
    lancamentosPeriodo,
    categorias,
    mesesPeriodo,
  )) {
    itens.push(ausencia);
  }

  return deduplicarAuditorias(itens).sort((a, b) => prioridade(b) - prioridade(a));
}

function calcularResumo(total: number, auditorias: AuditoriaItem[]) {
  const lancamentosComAlerta = new Set(
    auditorias.map((item) => item.lancamento?.id).filter(Boolean),
  );
  const criticos = auditorias.filter((item) => item.criticidade === "critico").length;
  const atencoes = auditorias.filter((item) => item.criticidade === "atencao").length;
  const coerentes = Math.max(total - lancamentosComAlerta.size, 0);
  const coerencia = total > 0 ? (coerentes / total) * 100 : 0;
  const score =
    total > 0 ? Math.max(0, Math.round(((total - criticos * 2.5 - atencoes) / total) * 100)) : 0;
  return { analisados: total, coerentes, atencoes, criticos, coerencia, score };
}

function identificarAgrupadoras(categorias: Categoria[]) {
  const agrupadoras = new Set<string>();
  const prefixos = new Map<string, Categoria>();
  for (const categoria of categorias) {
    const prefixo = extrairPrefixo(categoria.nome);
    if (prefixo) prefixos.set(prefixo, categoria);
    if (normalizar(categoria.nome).includes("agrupadora")) agrupadoras.add(categoria.id);
  }
  for (const [prefixo, categoria] of prefixos) {
    if (
      [...prefixos.keys()].some((outro) => outro.startsWith(`${prefixo}.`) && outro !== prefixo)
    ) {
      agrupadoras.add(categoria.id);
    }
  }
  return agrupadoras;
}

function primeiraCategoriaFilha(categoria: Categoria, categorias: Categoria[]) {
  const prefixo = extrairPrefixo(categoria.nome);
  if (!prefixo) return null;
  return categorias
    .filter(
      (item) => extrairPrefixo(item.nome)?.startsWith(`${prefixo}.`) && item.id !== categoria.id,
    )
    .sort((a, b) => a.ordem - b.ordem)[0];
}

function extrairPrefixo(texto: string) {
  return texto.match(/^(\d+(?:\.\d+)*)/)?.[1] ?? null;
}

function agruparHistoricoFornecedor(lancamentos: Lancamento[], categorias: Categoria[]) {
  const mapa = new Map<
    string,
    {
      total: number;
      categorias: Map<string, number>;
      valoresPorCategoria: Map<string, number[]>;
    }
  >();

  for (const lancamento of lancamentos) {
    const fornecedor = normalizarFornecedor(lancamento.pessoa);
    if (!fornecedor) continue;
    const categoria = nomeCategoria(lancamento, categorias);
    const categoriaKey = lancamento.categoria_id ?? categoria;
    const atual = mapa.get(fornecedor) ?? {
      total: 0,
      categorias: new Map(),
      valoresPorCategoria: new Map(),
    };
    atual.total += 1;
    atual.categorias.set(categoria, (atual.categorias.get(categoria) ?? 0) + 1);
    const valores = atual.valoresPorCategoria.get(categoriaKey) ?? [];
    valores.push(Math.abs(Number(lancamento.valor) || 0));
    atual.valoresPorCategoria.set(categoriaKey, valores);
    mapa.set(fornecedor, atual);
  }

  return mapa;
}

function agruparHistoricoCategoria(lancamentos: Lancamento[], categorias: Categoria[]) {
  const mapa = new Map<string, { total: number; valores: number[]; fornecedores: Set<string> }>();

  for (const lancamento of lancamentos) {
    const categoria = nomeCategoria(lancamento, categorias);
    const categoriaKey = lancamento.categoria_id ?? categoria;
    const atual = mapa.get(categoriaKey) ?? {
      total: 0,
      valores: [],
      fornecedores: new Set<string>(),
    };
    atual.total += 1;
    atual.valores.push(Math.abs(Number(lancamento.valor) || 0));
    const fornecedor = normalizarFornecedor(lancamento.pessoa);
    if (fornecedor) atual.fornecedores.add(fornecedor);
    mapa.set(categoriaKey, atual);
  }

  return mapa;
}

function categoriaMaisFrequente(categorias: Map<string, number>) {
  const total = [...categorias.values()].reduce((soma, valor) => soma + valor, 0);
  const [nome, count] = [...categorias.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!nome || !count || !total) return null;
  return { nome, count, rate: count / total };
}

function sugerirCategoriaPorTexto(
  lancamento: Lancamento,
  categorias: Categoria[],
  categoriaAtual: string,
) {
  const texto = normalizar(`${lancamento.descricao} ${lancamento.pessoa ?? ""}`);
  const scores = categorias
    .filter((categoria) => categoria.ativo)
    .map((categoria) => {
      const termos = termosCategoria(categoria.nome);
      const encontrados = termos.filter((termo) => texto.includes(termo));
      return {
        nome: categoria.nome,
        score: termos.length ? encontrados.length / Math.min(termos.length, 5) : 0,
        encontrados,
      };
    })
    .filter((item) => item.encontrados.length > 0)
    .sort((a, b) => b.score - a.score || b.encontrados.length - a.encontrados.length);

  const melhor = scores[0];
  if (!melhor) return null;
  const atual = scores.find((score) => score.nome === categoriaAtual)?.score ?? 0;
  const confianca = Math.min(94, Math.round(68 + melhor.score * 26));
  if (melhor.nome === categoriaAtual)
    return { sugestao: melhor.nome, confianca, termos: melhor.encontrados };
  if (melhor.score - atual < 0.22) return null;
  return { sugestao: melhor.nome, confianca, termos: melhor.encontrados };
}

function termosCategoria(nome: string) {
  const base = palavrasSignificativas(nome);
  const texto = normalizar(nome);
  const extras: string[] = [];
  const dicionario: Array<[string[], string[]]> = [
    [
      ["software", "apps", "sistema", "licenca"],
      ["assinatura", "cloud", "saas", "workspace", "microsoft", "google", "canva", "nibo", "aws"],
    ],
    [
      ["treinamento", "capacitacao", "curso"],
      ["educacao", "aula", "formacao", "workshop", "certificacao", "fgv"],
    ],
    [
      ["deslocamento", "viagem", "transporte"],
      ["uber", "99", "taxi", "combustivel", "pedagio", "estacionamento"],
    ],
    [
      ["energia", "eletrica", "luz"],
      ["equatorial", "enel", "cemig", "copel", "conta de luz"],
    ],
    [
      ["imposto", "taxa", "tributo"],
      ["simples", "das", "receita federal", "iss", "icms", "inss", "fgts"],
    ],
    [
      ["marketing", "publicidade"],
      ["trafego", "anuncio", "ads", "meta", "google ads", "campanha"],
    ],
    [
      ["salario", "folha", "pessoal"],
      ["pro labore", "holerite", "rescisao", "ferias", "13"],
    ],
    [
      ["aluguel", "locacao"],
      ["condominio", "imovel", "sala comercial"],
    ],
    [
      ["bancaria", "tarifa", "juros", "multa"],
      ["iof", "pix", "ted", "boleto", "cartao"],
    ],
    [
      ["correios", "cartorio"],
      ["postagem", "sedex", "reconhecimento", "firma"],
    ],
  ];

  for (const [gatilhos, termos] of dicionario) {
    if (gatilhos.some((gatilho) => texto.includes(gatilho))) extras.push(...termos);
  }

  return [...new Set([...base, ...extras].map(normalizar).filter((termo) => termo.length >= 3))];
}

function palavrasSignificativas(texto: string) {
  const stopwords = new Set([
    "de",
    "da",
    "do",
    "das",
    "dos",
    "e",
    "em",
    "para",
    "com",
    "sem",
    "por",
    "a",
    "o",
  ]);
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter((palavra) => palavra.length >= 3 && !stopwords.has(palavra));
}

function encontrarDuplicidades(lancamentos: Lancamento[], categorias: Categoria[]) {
  const grupos = new Map<string, Lancamento[]>();
  for (const lancamento of lancamentos) {
    const chave = [
      normalizarFornecedor(lancamento.pessoa),
      normalizar(lancamento.descricao),
      Math.round(Math.abs(Number(lancamento.valor) || 0) * 100),
      lancamento.data_efetiva,
      lancamento.categoria_id ?? nomeCategoria(lancamento, categorias),
    ].join("|");
    const grupo = grupos.get(chave) ?? [];
    grupo.push(lancamento);
    grupos.set(chave, grupo);
  }

  return [...grupos.values()]
    .filter((grupo) => grupo.length > 1)
    .map((grupo) => {
      const lancamento = grupo[0];
      const categoriaAtual = nomeCategoria(lancamento, categorias);
      return {
        id: `duplicidade-${grupo.map((item) => item.id).join("-")}`,
        status: "pendente" as const,
        criticidade: "critico" as const,
        tipo: "duplicidade" as const,
        lancamento,
        lancamentoLabel: lancamento.descricao || lancamento.pessoa || "Lançamento sem descrição",
        categoriaAtual,
        sugestao: `${grupo.length} lançamentos semelhantes`,
        confianca: 95,
        valor: Math.abs(Number(lancamento.valor) || 0),
        motivo:
          "Foram encontrados lançamentos com fornecedor, descrição, valor, data e categoria semelhantes.",
        evidencias: [
          `${grupo.length} registros possuem a mesma combinação de dados-chave.`,
          "A auditoria gera pendência para revisão e não exclui lançamentos automaticamente.",
        ],
        categoriaId: lancamento.categoria_id,
        movimento: lancamento.tipo === "recebida" ? "receita" : "pagamento",
      };
    });
}

function encontrarAusencias(
  lancamentosAno: Lancamento[],
  lancamentosPeriodo: Lancamento[],
  categorias: Categoria[],
  mesesPeriodo: number[],
) {
  const primeiroMes = Math.min(...mesesPeriodo);
  const mesesHistoricos = Array.from({ length: primeiroMes }, (_, index) => index);
  if (mesesHistoricos.length < 3) return [];

  const grupos = new Map<string, Lancamento[]>();
  for (const lancamento of lancamentosAno) {
    const mesLancamento = mesDaCompetencia(lancamento.competencia);
    if (!mesesHistoricos.includes(mesLancamento)) continue;
    const fornecedor = normalizarFornecedor(lancamento.pessoa);
    if (!fornecedor) continue;
    const chave = [
      fornecedor,
      lancamento.categoria_id ?? nomeCategoria(lancamento, categorias),
      lancamento.tipo,
    ].join("|");
    const grupo = grupos.get(chave) ?? [];
    grupo.push(lancamento);
    grupos.set(chave, grupo);
  }

  const presentes = new Set(
    lancamentosPeriodo.map((lancamento) =>
      [
        normalizarFornecedor(lancamento.pessoa),
        lancamento.categoria_id ?? nomeCategoria(lancamento, categorias),
        lancamento.tipo,
      ].join("|"),
    ),
  );

  return [...grupos.entries()]
    .map(([chave, grupo]) => {
      const mesesComOcorrencia = new Set(
        grupo.map((lancamento) => mesDaCompetencia(lancamento.competencia)),
      );
      return { chave, grupo, mesesComOcorrencia };
    })
    .filter(
      ({ chave, mesesComOcorrencia }) =>
        mesesComOcorrencia.size >= Math.max(3, Math.ceil(mesesHistoricos.length * 0.65)) &&
        !presentes.has(chave),
    )
    .map(({ chave, grupo, mesesComOcorrencia }) => {
      const exemplo = grupo[groupIndexMaisRecente(grupo)];
      const categoriaAtual = nomeCategoria(exemplo, categorias);
      const valorMedio =
        grupo.reduce((soma, item) => soma + Math.abs(Number(item.valor) || 0), 0) / grupo.length;
      const tipoReceita = exemplo.tipo === "recebida";
      return {
        id: `ausencia-${chave}`,
        status: "pendente" as const,
        criticidade: tipoReceita ? ("atencao" as const) : ("critico" as const),
        tipo: "completude" as const,
        lancamentoLabel: exemplo.pessoa ?? categoriaAtual,
        categoriaAtual: "—",
        sugestao: tipoReceita ? `Receita recorrente: ${categoriaAtual}` : categoriaAtual,
        confianca: 100,
        valor: valorMedio,
        motivo: `${exemplo.pessoa ?? "Item recorrente"} apareceu em ${mesesComOcorrencia.size} meses anteriores e não foi localizado no período atual.`,
        evidencias: [
          "Padrão recorrente identificado no histórico do cliente.",
          "Ausência é alerta de conferência, não afirmação automática de erro.",
        ],
        categoriaId: exemplo.categoria_id,
        movimento: tipoReceita ? ("receita" as const) : ("pagamento" as const),
      };
    });
}

function montarPerfilFornecedor(
  fornecedor: string,
  lancamentos: Lancamento[],
  categorias: Categoria[],
): PerfilFornecedor {
  const chaveFornecedor = normalizarFornecedor(fornecedor);
  const base = lancamentos.filter(
    (lancamento) => normalizarFornecedor(lancamento.pessoa) === chaveFornecedor,
  );
  const categoriasUsadas = new Map<string, number>();
  for (const lancamento of base) {
    const categoria = nomeCategoria(lancamento, categorias);
    categoriasUsadas.set(categoria, (categoriasUsadas.get(categoria) ?? 0) + 1);
  }
  const predominante = categoriaMaisFrequente(categoriasUsadas);
  const valorMedio =
    base.reduce((soma, lancamento) => soma + Math.abs(Number(lancamento.valor) || 0), 0) /
    Math.max(base.length, 1);
  const ultima = [...base].sort((a, b) => b.data_efetiva.localeCompare(a.data_efetiva))[0];
  const meses = new Set(base.map((lancamento) => mesDaCompetencia(lancamento.competencia))).size;
  const descricoes = [
    ...new Set(base.map((lancamento) => lancamento.descricao).filter(Boolean)),
  ].slice(0, 4);

  return {
    fornecedor,
    ocorrencias: base.length,
    categoriaPredominante: predominante?.nome ?? "Sem padrão",
    categorias: [...categoriasUsadas.keys()].slice(0, 5),
    valorMedio,
    ultimaOcorrencia: ultima?.data_efetiva ?? "",
    frequencia: meses >= 6 ? "Mensal recorrente" : meses >= 3 ? "Recorrente parcial" : "Pontual",
    descricoes,
  };
}

function groupIndexMaisRecente(grupo: Lancamento[]) {
  let index = 0;
  for (let i = 1; i < grupo.length; i += 1) {
    if (grupo[i].data_efetiva > grupo[index].data_efetiva) index = i;
  }
  return index;
}

function deduplicarAuditorias(itens: AuditoriaItem[]) {
  const vistos = new Set<string>();
  return itens.filter((item) => {
    if (vistos.has(item.id)) return false;
    vistos.add(item.id);
    return true;
  });
}

function prioridade(item: AuditoriaItem) {
  const criticidade =
    item.criticidade === "critico" ? 30 : item.criticidade === "atencao" ? 20 : 10;
  const status = item.status === "pendente" ? 5 : 0;
  return criticidade + status + item.confianca / 100;
}

function normalizarFornecedor(valor: string | null | undefined) {
  return normalizar(valor ?? "")
    .replace(/\b(ltda|me|eireli|sa|s\/a|mei)\b/g, "")
    .trim();
}

function normalizar(valor: string) {
  return valor
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
