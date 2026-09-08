import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronsUpDown,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Loader2,
  Plus,
  Printer,
  Search,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { TopBar } from "@/components/TopBar";
import { Bloco, SemDados, SemEmpresa } from "@/components/ui-blocos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/lib/app-context";
import { filtrarLancamentosPorCentroCusto } from "@/lib/centro-custo";
import {
  useEmpresaAtual,
  useFluxoChecklistPagamentos,
  useFluxoContasBancarias,
  useFluxoSaldosBancarios,
  useFluxoTitulosNibo,
  useFluxoTitulosPagarVencidos,
  useFluxoTitulosReceberVencidos,
  useLancamentosFluxo,
  useLancamentosReceberVencidos,
  type FluxoContaBancaria,
  type FluxoTituloNibo,
  type StatusChecklistFluxo,
} from "@/lib/data";
import { mutateFinancialData } from "@/lib/financial-mutations.functions";
import type { Lancamento } from "@/lib/dre";
import { brl, dataBR } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/fluxo-caixa")({
  head: () => ({
    meta: [
      { title: "Fluxo de Caixa | Ecossistema Financeiro BPO" },
      {
        name: "description",
        content: "Projecao semanal de entradas, saidas e saldos a partir dos lancamentos NIBO.",
      },
      { property: "og:title", content: "Fluxo de Caixa | Ecossistema Financeiro BPO" },
      {
        property: "og:description",
        content: "Caixa projetado com saldos manuais, checklist e exportacao para clientes.",
      },
    ],
  }),
  component: FluxoCaixaPage,
});

type PeriodoFluxo = "semana_atual" | "proximos_7" | "proximos_15" | "proximos_30" | "personalizado";
type TipoFiltro = "todos" | "recebimentos" | "pagamentos";

type LinhaFluxo = {
  id: string;
  origem: "lancamento" | "titulo" | "manual";
  lancamento?: Lancamento;
  titulo?: FluxoTituloNibo;
  dataProjetada: string;
  vencimento: string;
  nome: string;
  descricao: string;
  categoria: string;
  identificadorNibo: string;
  recebimento: number;
  pagamento: number;
  saldoProjetado: number;
};

type FormularioLancamentoManual = {
  vencimento: string;
  nome: string;
  descricao: string;
  tipo: "recebida" | "paga";
  valor: string;
};

type BancoPreConfigurado = {
  id: string;
  nome: string;
  imagemUrl: string;
};

const bancosPreConfigurados: BancoPreConfigurado[] = [
  {
    id: "conta-simples",
    nome: "Conta Simples",
    imagemUrl: "/contasimples.png",
  },
  {
    id: "sicredi",
    nome: "Sicredi",
    imagemUrl: "/sicredi.jpg",
  },
  {
    id: "pagbank",
    nome: "PagBank",
    imagemUrl: "/pagbank.png",
  },
  {
    id: "bradesco",
    nome: "Bradesco",
    imagemUrl: "/bradesco.jpg",
  },
  {
    id: "itau",
    nome: "Itau",
    imagemUrl: "/itau.png",
  },
  {
    id: "banco-do-brasil",
    nome: "Banco do Brasil",
    imagemUrl: "/bancobrasil.jpg",
  },
  {
    id: "nubank",
    nome: "Nubank",
    imagemUrl: "/nubank.png",
  },
  {
    id: "banrisul",
    nome: "Banrisul",
    imagemUrl: "/banrisul.jpg",
  },
  {
    id: "inter",
    nome: "Inter Empresas",
    imagemUrl: "/inter.png",
  },
  {
    id: "santander",
    nome: "Santander",
    imagemUrl: "/santander.png",
  },
  {
    id: "caixa-eletronica",
    nome: "Caixa Eletrônica",
    imagemUrl: "/caixa.jpg",
  },
  {
    id: "ton",
    nome: "Ton",
    imagemUrl: "/ton.png",
  },
  {
    id: "c6bank",
    nome: "C6 Bank",
    imagemUrl: "/c6bank.jpg",
  },
  {
    id: "inifity-pay",
    nome: "Infinity Pay",
    imagemUrl: "/infiniti.png",
  },
  {
    id: "picpay",
    nome: "PicPay",
    imagemUrl: "/picpay.png",
  },
];

function FluxoCaixaPage() {
  const queryClient = useQueryClient();
  const mutateData = useServerFn(mutateFinancialData);
  const { empresaId, centroCusto } = useApp();
  const { data: empresa } = useEmpresaAtual(empresaId);
  const hoje = hojeISO();
  const semana = semanaAtual(hoje);
  const [periodo, setPeriodo] = useState<PeriodoFluxo>("semana_atual");
  const [inicioPersonalizado, setInicioPersonalizado] = useState(semana.inicio);
  const [fimPersonalizado, setFimPersonalizado] = useState(semana.fim);
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>("todos");
  const [busca, setBusca] = useState("");
  const [contasSelecionadas, setContasSelecionadas] = useState<string[]>([]);
  const [contasRestauradas, setContasRestauradas] = useState(false);
  const [saldosEditados, setSaldosEditados] = useState<Record<string, string>>({});
  const [saldosPendentes, setSaldosPendentes] = useState<Record<string, true>>({});
  const [saldosSalvando, setSaldosSalvando] = useState<Record<string, true>>({});
  const [seletorBancosAberto, setSeletorBancosAberto] = useState(false);
  const [lancamentoManualAberto, setLancamentoManualAberto] = useState(false);
  const [lancamentoManual, setLancamentoManual] = useState<FormularioLancamentoManual>(() =>
    criarFormularioLancamentoManual(hoje),
  );
  const lateralFluxoRef = useRef<HTMLElement | null>(null);
  const saldosPersistidosRef = useRef<Record<string, number>>({});
  const [alturaLateralFluxo, setAlturaLateralFluxo] = useState(0);

  const range = useMemo(
    () => rangePeriodo(periodo, hoje, inicioPersonalizado, fimPersonalizado),
    [periodo, hoje, inicioPersonalizado, fimPersonalizado],
  );
  const { data: lancamentos = [], isLoading: carregandoLancamentos } = useLancamentosFluxo(
    empresaId,
    range.inicio,
    range.fim,
  );
  const { data: titulos = [], isLoading: carregandoTitulos } = useFluxoTitulosNibo(
    empresaId,
    range.inicio,
    range.fim,
  );
  const { data: vencidos = [] } = useLancamentosReceberVencidos(empresaId, hoje);
  const { data: titulosVencidos = [] } = useFluxoTitulosReceberVencidos(empresaId, hoje);
  const { data: titulosPagarVencidos = [] } = useFluxoTitulosPagarVencidos(empresaId, hoje);
  const { data: contas = [], isLoading: carregandoContas } = useFluxoContasBancarias(empresaId);
  const { data: saldos = [] } = useFluxoSaldosBancarios(empresaId);
  const { data: checklist = [] } = useFluxoChecklistPagamentos(empresaId);
  const carregando = carregandoLancamentos || carregandoTitulos || carregandoContas;

  const saldosPorConta = useMemo(
    () => new Map(saldos.map((saldo) => [saldo.conta_id, saldo])),
    [saldos],
  );
  const contasPorNome = useMemo(
    () => new Map(contas.map((conta) => [normalizar(conta.nome), conta])),
    [contas],
  );
  const checklistPorLancamento = useMemo(
    () => new Map(checklist.map((item) => [item.lancamento_id, item])),
    [checklist],
  );
  const checklistPorTitulo = useMemo(
    () => new Map(checklist.map((item) => [item.titulo_id, item])),
    [checklist],
  );

  useEffect(() => {
    setContasSelecionadas([]);
    setContasRestauradas(false);
    setSaldosEditados({});
    setSaldosPendentes({});
    setSaldosSalvando({});
    saldosPersistidosRef.current = {};
  }, [empresaId]);

  useEffect(() => {
    setSaldosEditados((atuais) => {
      const proximos = { ...atuais };
      for (const conta of contas) {
        const saldoPersistido = Number(saldosPorConta.get(conta.id)?.saldo ?? 0);
        saldosPersistidosRef.current[conta.id] = saldoPersistido;
        if (proximos[conta.id] === undefined) {
          proximos[conta.id] = formatarCampoMonetario(saldoPersistido);
        }
      }
      return proximos;
    });
  }, [contas, saldosPorConta]);

  useEffect(() => {
    if (contasRestauradas || !empresaId || contas.length === 0) return;
    const contasDisponiveis = new Set(contas.map((conta) => conta.id));
    const salvas = lerContasSelecionadasFluxo(empresaId);
    const comSaldo = saldos
      .filter((saldo) => contasDisponiveis.has(saldo.conta_id) && Number(saldo.saldo) !== 0)
      .map((saldo) => saldo.conta_id);
    const selecionadas = salvas
      ? salvas.filter((contaId) => contasDisponiveis.has(contaId))
      : comSaldo;

    setContasSelecionadas([...new Set(selecionadas)]);
    setContasRestauradas(true);
  }, [contas, contasRestauradas, empresaId, saldos]);

  useEffect(() => {
    if (!empresaId || !contasRestauradas) return;
    salvarContasSelecionadasFluxo(empresaId, contasSelecionadas);
  }, [contasRestauradas, contasSelecionadas, empresaId]);

  useEffect(() => {
    if (!empresaId) return;
    const idsPendentes = Object.keys(saldosPendentes).filter((contaId) =>
      contasSelecionadas.includes(contaId),
    );
    if (idsPendentes.length === 0) return;

    const linhasSaldo = idsPendentes
      .map((contaId) => ({
        empresa_id: empresaId,
        conta_id: contaId,
        saldo: numeroDoCampo(saldosEditados[contaId] ?? "0"),
      }))
      .filter((linha) => saldosPersistidosRef.current[linha.conta_id] !== linha.saldo);

    if (linhasSaldo.length === 0) {
      setSaldosPendentes((atuais) => {
        const proximos = { ...atuais };
        for (const id of idsPendentes) delete proximos[id];
        return proximos;
      });
      return;
    }

    const timeout = window.setTimeout(async () => {
      const ids = linhasSaldo.map((linha) => linha.conta_id);
      setSaldosSalvando((atuais) => ({
        ...atuais,
        ...Object.fromEntries(ids.map((id) => [id, true])),
      }));

      try {
        await mutateData({ data: { action: "saveSaldos", empresaId, saldos: linhasSaldo.map((linha) => ({ contaId: linha.conta_id, saldo: linha.saldo })) } });
      } catch {
        toast.error("Nao foi possivel salvar os saldos automaticamente.");
        setSaldosSalvando((atuais) => {
          const proximos = { ...atuais };
          for (const id of ids) delete proximos[id];
          return proximos;
        });
        return;
      }

      for (const linha of linhasSaldo) {
        saldosPersistidosRef.current[linha.conta_id] = linha.saldo;
      }
      setSaldosPendentes((atuais) => {
        const proximos = { ...atuais };
        for (const id of ids) delete proximos[id];
        return proximos;
      });
      setSaldosSalvando((atuais) => {
        const proximos = { ...atuais };
        for (const id of ids) delete proximos[id];
        return proximos;
      });
      await queryClient.invalidateQueries({ queryKey: ["fluxo-saldos-bancarios", empresaId] });
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [contasSelecionadas, empresaId, queryClient, saldosEditados, saldosPendentes]);

  useEffect(() => {
    const lateral = lateralFluxoRef.current;
    if (!lateral) return;

    const atualizarAltura = () => {
      setAlturaLateralFluxo(Math.ceil(lateral.getBoundingClientRect().height));
    };

    atualizarAltura();
    window.addEventListener("resize", atualizarAltura);

    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", atualizarAltura);
    }

    const observer = new ResizeObserver(atualizarAltura);
    observer.observe(lateral);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", atualizarAltura);
    };
  }, [carregando, empresaId]);

  const saldoDisponivel = useMemo(
    () =>
      contasSelecionadas.reduce(
        (total, contaId) => total + numeroDoCampo(saldosEditados[contaId] ?? "0"),
        0,
      ),
    [contasSelecionadas, saldosEditados],
  );
  const contasExibidas = useMemo(
    () =>
      contasSelecionadas
        .map((contaId) => contas.find((conta) => conta.id === contaId))
        .filter((conta): conta is FluxoContaBancaria => !!conta),
    [contas, contasSelecionadas],
  );

  const linhas = useMemo(() => {
    const textoBusca = normalizar(busca);
    const lancamentosCentro = filtrarLancamentosPorCentroCusto(lancamentos, centroCusto);
    const titulosCentro = filtrarLancamentosPorCentroCusto(titulos, centroCusto);
    const linhasLancamentos: LinhaFluxo[] = lancamentosCentro.map((lancamento) => {
      const vencimento = lancamento.data_efetiva.slice(0, 10);
      const tipoLancamento = tipoProjetadoLancamento(lancamento);
      const valor = Math.abs(Number(lancamento.valor) || 0);
      const pagamento = tipoLancamento === "paga" ? valor : 0;
      const recebimento = tipoLancamento === "recebida" ? valor : 0;

      return {
        id: lancamento.id,
        origem: "lancamento",
        lancamento,
        dataProjetada: vencimento,
        vencimento,
        nome: lancamento.pessoa?.trim() || "Sem nome",
        descricao: formatarDescricao(lancamento.descricao),
        categoria: lancamento.categoria_nibo?.trim() || "Nao classificado",
        identificadorNibo: lancamento.external_id || lancamento.hash || lancamento.id,
        recebimento,
        pagamento,
        saldoProjetado: 0,
      };
    });
    const linhasTitulos: LinhaFluxo[] = titulosCentro.map((titulo) => {
      const tipoTitulo = tipoProjetadoTitulo(titulo);
      const valor = Math.abs(Number(titulo.valor) || 0);
      const vencimento = titulo.vencimento.slice(0, 10);

      return {
        id: titulo.id,
        origem: titulo.external_source === "manual_fluxo_caixa" ? "manual" : "titulo",
        titulo,
        dataProjetada: vencimento,
        vencimento,
        nome: titulo.pessoa?.trim() || "Sem nome",
        descricao: formatarDescricao(titulo.descricao),
        categoria: titulo.categoria_nibo?.trim() || "Nao classificado",
        identificadorNibo: titulo.external_id || titulo.hash || titulo.id,
        recebimento: tipoTitulo === "recebida" ? valor : 0,
        pagamento: tipoTitulo === "paga" ? valor : 0,
        saldoProjetado: 0,
      };
    });
    const base = [...linhasLancamentos, ...linhasTitulos]
      .filter((linha) => linha.dataProjetada >= range.inicio && linha.dataProjetada <= range.fim)
      .filter((linha) => {
        if (tipoFiltro === "recebimentos") return linha.recebimento > 0;
        if (tipoFiltro === "pagamentos") return linha.pagamento > 0;
        return true;
      })
      .filter((linha) => {
        if (!textoBusca) return true;
        return normalizar(`${linha.nome} ${linha.descricao}`).includes(textoBusca);
      })
      .sort((a, b) => {
        const data = a.dataProjetada.localeCompare(b.dataProjetada);
        if (data !== 0) return data;
        const vencimento = a.vencimento.localeCompare(b.vencimento);
        if (vencimento !== 0) return vencimento;
        return a.id.localeCompare(b.id);
      });

    let saldo = saldoDisponivel;
    return base.map((linha) => {
      saldo += linha.recebimento - linha.pagamento;
      return { ...linha, saldoProjetado: saldo };
    });
  }, [busca, centroCusto, lancamentos, range, saldoDisponivel, tipoFiltro, titulos]);

  const resumo = useMemo(() => resumirFluxo(linhas, saldoDisponivel), [linhas, saldoDisponivel]);
  const alertas = useMemo(() => calcularAlertas(linhas), [linhas]);
  const serieSaldo = useMemo(
    () => montarSerieSaldo(linhas, saldoDisponivel, range.inicio, range.fim),
    [linhas, range.fim, range.inicio, saldoDisponivel],
  );
  const pagamentosSemana = linhas.filter((linha) => linha.pagamento > 0);
  const inadimplentes = useMemo(
    () =>
      montarInadimplentes(
        filtrarLancamentosPorCentroCusto(vencidos, centroCusto),
        filtrarLancamentosPorCentroCusto(titulosVencidos, centroCusto),
        hoje,
      ),
    [centroCusto, vencidos, titulosVencidos, hoje],
  );
  const pagamentosAtrasados = useMemo(
    () =>
      montarPagamentosAtrasados(
        filtrarLancamentosPorCentroCusto(titulosPagarVencidos, centroCusto),
        hoje,
      ),
    [centroCusto, titulosPagarVencidos, hoje],
  );
  const periodoLabel = labelPeriodo(range.inicio, range.fim);
  const estiloAlturaProjecao = alturaLateralFluxo
    ? ({ "--altura-projecao": `${alturaLateralFluxo}px` } as CSSProperties)
    : undefined;
  const dataPadraoLancamentoManual =
    hoje >= range.inicio && hoje <= range.fim ? hoje : range.inicio;

  const criarLancamentoManual = useMutation({
    mutationFn: async () => {
      if (!empresaId) throw new Error("Selecione uma empresa.");
      const vencimento = lancamentoManual.vencimento;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) {
        throw new Error("Informe o vencimento.");
      }

      const nome = lancamentoManual.nome.trim();
      if (!nome) throw new Error("Informe o nome.");

      const valor = Math.abs(numeroDoCampo(lancamentoManual.valor));
      if (valor <= 0) throw new Error("Informe um valor maior que zero.");

      const descricao =
        lancamentoManual.descricao.trim() ||
        (lancamentoManual.tipo === "paga" ? "Conta a pagar manual" : "Conta a receber manual");
      const criadoEm = new Date().toISOString();
      const externalId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      await mutateData({ data: { action: "createTituloManual", empresaId, titulo: { tipo: lancamentoManual.tipo, vencimento, competencia: competenciaDoVencimento(vencimento), descricao: descricao.slice(0,500), categoria: lancamentoManual.tipo === "paga" ? "Manual - Contas a pagar" : "Manual - Contas a receber", pessoa: nome.slice(0,180), valor, hash: `manual|${empresaId}|${externalId}`, externalId, payload: { origem: "manual_fluxo_caixa", criado_em: criadoEm } } } });
    },
    onSuccess: async () => {
      toast.success("Lancamento manual incluido.");
      setLancamentoManualAberto(false);
      setLancamentoManual(criarFormularioLancamentoManual(dataPadraoLancamentoManual));
      await queryClient.invalidateQueries({ queryKey: ["fluxo-titulos-nibo", empresaId] });
      await queryClient.invalidateQueries({
        queryKey: ["fluxo-titulos-pagar-vencidos", empresaId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["fluxo-titulos-receber-vencidos", empresaId],
      });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Nao foi possivel incluir o lancamento."),
  });

  function abrirLancamentoManual(aberto: boolean) {
    setLancamentoManualAberto(aberto);
    if (aberto) {
      setLancamentoManual(criarFormularioLancamentoManual(dataPadraoLancamentoManual));
    }
  }

  function atualizarLancamentoManual<K extends keyof FormularioLancamentoManual>(
    campo: K,
    valor: FormularioLancamentoManual[K],
  ) {
    setLancamentoManual((atual) => ({ ...atual, [campo]: valor }));
  }

  async function selecionarBanco(banco: BancoPreConfigurado) {
    if (!empresaId) return;
    const existente = contasPorNome.get(normalizar(banco.nome));
    if (existente) {
      setContasSelecionadas((atuais) =>
        atuais.includes(existente.id)
          ? atuais.filter((id) => id !== existente.id)
          : [...atuais, existente.id],
      );
      return;
    }

    const data = await mutateData({ data: { action: "createConta", empresaId, nome: banco.nome, imagemUrl: banco.imagemUrl } });
    if (data?.id) {
      setContasSelecionadas((atuais) => [...new Set([...atuais, data.id])]);
      setSaldosEditados((atuais) => ({ ...atuais, [data.id]: formatarCampoMonetario(0) }));
    }
    await queryClient.invalidateQueries({ queryKey: ["fluxo-contas-bancarias", empresaId] });
  }

  function atualizarSaldoConta(contaId: string, valor: string) {
    setSaldosEditados((atuais) => ({ ...atuais, [contaId]: valor }));
    setSaldosPendentes((atuais) => ({ ...atuais, [contaId]: true }));
  }

  async function salvarHistorico() {
    if (!empresaId) return;
    const pagamentosSelecionados = pagamentosSemana
      .filter(
        (linha) =>
          statusChecklistLinha(linha, checklistPorLancamento, checklistPorTitulo) ===
          "selecionado_pagamento",
      )
      .map((linha) => ({
        origem: linha.origem,
        registro_id: linha.id,
        descricao: linha.descricao,
        valor: linha.pagamento,
      }));

    await mutateData({ data: { action: "createHistorico", empresaId, historico: {
      inicio: range.inicio, fim: range.fim, saldoInicial: saldoDisponivel, recebimentos: resumo.recebimentos, pagamentos: resumo.pagamentos, saldoFinal: resumo.saldoFinal,
      empresa_id: empresaId,
      periodo_inicio: range.inicio,
      periodo_fim: range.fim,
      saldo_inicial: saldoDisponivel,
      recebimentos_previstos: resumo.recebimentos,
      pagamentos_previstos: resumo.pagamentos,
      saldo_final_previsto: resumo.saldoFinal,
      contas_consideradas: contas
        .filter((conta) => contasSelecionadas.includes(conta.id))
        .map((conta) => ({
          id: conta.id,
          nome: conta.nome,
          saldo: numeroDoCampo(saldosEditados[conta.id] ?? "0"),
        })) as Json,
      pagamentos_selecionados: pagamentosSelecionados as Json,
      payload: {
        linhas: linhas.map(linhaParaExportacao),
        alertas: {
          menorSaldo: alertas.menorSaldo,
          dataMenorSaldo: alertas.dataMenorSaldo,
          primeiroNegativo: alertas.primeiroNegativo,
          maiorPagamento: alertas.maiorPagamento
            ? {
                descricao: alertas.maiorPagamento.descricao,
                valor: alertas.maiorPagamento.pagamento,
              }
            : null,
          diaMaiorPagamento: alertas.diaMaiorPagamento ?? null,
          necessidadeCaixa: alertas.necessidadeCaixa,
        },
      },
    } } });
  }

  function exportarExcel() {
    const workbook = XLSX.utils.book_new();
    const fluxo = linhas.map(linhaParaExportacao);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(fluxo), "Fluxo");
    const resumoSheet = [
      { item: "Saldo inicial", valor: saldoDisponivel },
      { item: "Entradas previstas", valor: resumo.recebimentos },
      { item: "Saidas previstas", valor: resumo.pagamentos },
      { item: "Variacao liquida", valor: resumo.variacaoLiquida },
      { item: "Saldo final projetado", valor: resumo.saldoFinal },
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(resumoSheet), "Resumo");
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        pagamentosSemana.map((linha) => ({
          pagamento: linha.descricao,
          fornecedor: linha.nome,
          valor: linha.pagamento,
          status: labelStatus(
            statusChecklistLinha(linha, checklistPorLancamento, checklistPorTitulo),
          ),
        })),
      ),
      "Checklist",
    );
    XLSX.writeFile(workbook, `fluxo-caixa-${range.inicio}-${range.fim}.xlsx`);
  }

  return (
    <>
      <TopBar
        titulo="Fluxo de Caixa"
        descricao={`${empresa?.nome ?? "Selecione uma empresa"} - projecao ${periodoLabel}`}
        mostrarFiltrosData={false}
      />
      <main className="space-y-5 p-6">
        {!empresaId ? (
          <SemEmpresa />
        ) : carregando ? (
          <SemDados mensagem="Carregando fluxo de caixa..." />
        ) : (
          <>
            <div className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <SeletorBancos
                  aberto={seletorBancosAberto}
                  bancos={bancosPreConfigurados}
                  contasPorNome={contasPorNome}
                  contasSelecionadas={contasSelecionadas}
                  onAberto={setSeletorBancosAberto}
                  onSelecionar={selecionarBanco}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {contasExibidas.map((conta) => (
                  <CardConta
                    key={conta.id}
                    conta={conta}
                    valor={saldosEditados[conta.id] ?? "0"}
                    selecionada={contasSelecionadas.includes(conta.id)}
                    atualizadoEm={saldosPorConta.get(conta.id)?.informado_em}
                    salvando={!!saldosSalvando[conta.id]}
                    onSelecionar={(checked) =>
                      setContasSelecionadas((atuais) =>
                        checked
                          ? [...new Set([...atuais, conta.id])]
                          : atuais.filter((id) => id !== conta.id),
                      )
                    }
                    onValor={(valor) => atualizarSaldoConta(conta.id, valor)}
                  />
                ))}
                <KpiFluxo
                  titulo="Saldo total disponivel"
                  valor={saldoDisponivel}
                  icone={Wallet}
                  tom="positivo"
                />
                <KpiFluxo
                  titulo="Saldo projetado do periodo"
                  valor={resumo.saldoFinal}
                  icone={ClipboardCheck}
                  tom={resumo.saldoFinal >= saldoDisponivel ? "positivo" : "negativo"}
                />
              </div>
            </div>

            <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-h-0 xl:h-[var(--altura-projecao)]" style={estiloAlturaProjecao}>
                <Bloco
                  titulo="Projecao de caixa"
                  className="flex h-full min-h-0 flex-col overflow-hidden [&>div:first-child]:shrink-0 [&>div:last-child]:flex [&>div:last-child]:min-h-0 [&>div:last-child]:flex-1 [&>div:last-child]:flex-col"
                  acoes={
                    <div className="flex flex-wrap items-center gap-2">
                      <Dialog open={lancamentoManualAberto} onOpenChange={abrirLancamentoManual}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Plus className="h-4 w-4" />
                            Lancamento manual
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-xl">
                          <DialogHeader>
                            <DialogTitle>Lancamento manual</DialogTitle>
                          </DialogHeader>
                          <form
                            className="space-y-4"
                            onSubmit={(event) => {
                              event.preventDefault();
                              criarLancamentoManual.mutate();
                            }}
                          >
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label htmlFor="manual-vencimento">Vencimento</Label>
                                <Input
                                  id="manual-vencimento"
                                  type="date"
                                  value={lancamentoManual.vencimento}
                                  onChange={(event) =>
                                    atualizarLancamentoManual("vencimento", event.target.value)
                                  }
                                  required
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="manual-tipo">Tipo</Label>
                                <Select
                                  value={lancamentoManual.tipo}
                                  onValueChange={(valor) =>
                                    atualizarLancamentoManual(
                                      "tipo",
                                      valor as FormularioLancamentoManual["tipo"],
                                    )
                                  }
                                >
                                  <SelectTrigger id="manual-tipo">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="paga">Pagamento</SelectItem>
                                    <SelectItem value="recebida">Recebimento</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="manual-nome">Nome</Label>
                                <Input
                                  id="manual-nome"
                                  value={lancamentoManual.nome}
                                  onChange={(event) =>
                                    atualizarLancamentoManual("nome", event.target.value)
                                  }
                                  maxLength={180}
                                  autoFocus
                                  required
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="manual-valor">Valor</Label>
                                <Input
                                  id="manual-valor"
                                  value={lancamentoManual.valor}
                                  onChange={(event) =>
                                    atualizarLancamentoManual("valor", event.target.value)
                                  }
                                  onBlur={() =>
                                    atualizarLancamentoManual(
                                      "valor",
                                      formatarCampoMonetario(lancamentoManual.valor),
                                    )
                                  }
                                  inputMode="decimal"
                                  className="tabular"
                                  required
                                />
                              </div>
                              <div className="space-y-1.5 sm:col-span-2">
                                <Label htmlFor="manual-descricao">Descricao</Label>
                                <Input
                                  id="manual-descricao"
                                  value={lancamentoManual.descricao}
                                  onChange={(event) =>
                                    atualizarLancamentoManual("descricao", event.target.value)
                                  }
                                  maxLength={500}
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setLancamentoManualAberto(false)}
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="submit"
                                disabled={
                                  criarLancamentoManual.isPending ||
                                  !lancamentoManual.nome.trim() ||
                                  numeroDoCampo(lancamentoManual.valor) <= 0
                                }
                              >
                                {criarLancamentoManual.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Plus className="h-4 w-4" />
                                )}
                                Incluir
                              </Button>
                            </DialogFooter>
                          </form>
                        </DialogContent>
                      </Dialog>
                      <Button variant="outline" size="sm" onClick={exportarExcel}>
                        <FileSpreadsheet className="h-4 w-4" />
                        Excel
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => window.print()}>
                        <Printer className="h-4 w-4" />
                        PDF
                      </Button>
                      <Button variant="outline" size="sm" onClick={salvarHistorico}>
                        <Download className="h-4 w-4" />
                        Historico
                      </Button>
                    </div>
                  }
                >
                  <div className="mb-4 grid shrink-0 gap-3 border-b pb-4 sm:grid-cols-2 lg:grid-cols-5">
                    <CampoSelect label="Periodo" value={periodo} onValue={setPeriodo}>
                      <SelectItem value="semana_atual">Semana atual</SelectItem>
                      <SelectItem value="proximos_7">Proximos 7 dias</SelectItem>
                      <SelectItem value="proximos_15">Proximos 15 dias</SelectItem>
                      <SelectItem value="proximos_30">Proximos 30 dias</SelectItem>
                      <SelectItem value="personalizado">Personalizado</SelectItem>
                    </CampoSelect>
                    <CampoInput
                      label="De"
                      type="date"
                      value={range.inicio}
                      disabled={periodo !== "personalizado"}
                      onChange={setInicioPersonalizado}
                    />
                    <CampoInput
                      label="Ate"
                      type="date"
                      value={range.fim}
                      disabled={periodo !== "personalizado"}
                      onChange={setFimPersonalizado}
                    />
                    <CampoSelect label="Tipo" value={tipoFiltro} onValue={setTipoFiltro}>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="recebimentos">Recebimentos</SelectItem>
                      <SelectItem value="pagamentos">Pagamentos</SelectItem>
                    </CampoSelect>
                    <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                      <Label className="text-xs font-medium text-muted-foreground">Busca</Label>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={busca}
                          onChange={(event) => setBusca(event.target.value)}
                          placeholder="Nome ou descricao"
                          className="h-8 pl-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {linhas.length === 0 ? (
                    <SemDados mensagem="Nenhum lancamento encontrado para o periodo e filtros atuais." />
                  ) : (
                    <div className="-mx-5 -mb-5 min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
                      <table className="w-full min-w-[720px] text-xs">
                        <thead>
                          <tr className="sticky top-0 z-10 border-b bg-muted/80 text-[10px] uppercase text-muted-foreground backdrop-blur">
                            <th className="px-3 py-1.5 text-left font-medium">Vencimento</th>
                            <th className="px-2 py-1.5 text-left font-medium">Nome</th>
                            <th className="px-2 py-1.5 text-left font-medium">Descricao</th>
                            <th className="px-2 py-1.5 text-right font-medium">Receb.</th>
                            <th className="px-2 py-1.5 text-right font-medium">Pag.</th>
                            <th className="px-3 py-1.5 text-right font-medium">Saldo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {linhas.map((linha) => (
                            <tr key={linha.id} className="border-b hover:bg-muted/30">
                              <td className="tabular px-3 py-1.5 text-muted-foreground">
                                {dataBR(linha.vencimento)}
                              </td>
                              <td className="max-w-40 px-2 py-1.5">
                                <span className="block truncate font-medium">{linha.nome}</span>
                                <span className="block truncate text-[10px] text-muted-foreground">
                                  {linha.identificadorNibo}
                                </span>
                              </td>
                              <td className="max-w-52 px-2 py-1.5">
                                <span className="block truncate">{linha.descricao}</span>
                                <span className="block truncate text-[10px] text-muted-foreground">
                                  {linha.categoria}
                                </span>
                              </td>
                              <td className="tabular px-2 py-1.5 text-right font-medium text-positive">
                                {linha.recebimento ? brl(linha.recebimento) : "-"}
                              </td>
                              <td className="tabular px-2 py-1.5 text-right font-medium text-negative">
                                {linha.pagamento ? brl(linha.pagamento) : "-"}
                              </td>
                              <td
                                className={cn(
                                  "tabular px-3 py-1.5 text-right font-semibold",
                                  linha.saldoProjetado < 0 ? "text-negative" : "text-info",
                                )}
                              >
                                {brl(linha.saldoProjetado)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="bg-card px-3 py-2 text-[11px] text-muted-foreground">
                        Mostrando {linhas.length} lancamentos - recalculo automatico por vencimento.
                      </div>
                    </div>
                  )}
                </Bloco>
              </div>

              <aside ref={lateralFluxoRef} className="space-y-4 self-start">
                <ResumoPeriodo resumo={resumo} />
                <PanoramaAtrasos
                  titulo="Panorama de inadimplentes"
                  nomeColuna="Cliente"
                  vazio="Nao ha recebimentos vencidos."
                  totalRotulo="Total em atraso"
                  itens={inadimplentes}
                />
                <PanoramaAtrasos
                  titulo="Pagamentos em atraso"
                  nomeColuna="Fornecedor"
                  vazio="Nao ha pagamentos vencidos."
                  totalRotulo="Total vencido"
                  itens={pagamentosAtrasados}
                />
                <Bloco titulo="Alertas automaticos">
                  <dl className="space-y-3 text-sm">
                    <ItemAlerta
                      rotulo="Menor saldo projetado"
                      valor={`${brl(alertas.menorSaldo)} em ${dataBR(alertas.dataMenorSaldo)}`}
                      destaque={alertas.menorSaldo < 0}
                    />
                    <ItemAlerta
                      rotulo="Primeiro dia negativo"
                      valor={
                        alertas.primeiroNegativo
                          ? dataBR(alertas.primeiroNegativo)
                          : "Nao identificado"
                      }
                      destaque={!!alertas.primeiroNegativo}
                    />
                    <ItemAlerta
                      rotulo="Maior pagamento"
                      valor={
                        alertas.maiorPagamento
                          ? `${alertas.maiorPagamento.descricao} - ${brl(alertas.maiorPagamento.pagamento)}`
                          : "Sem pagamentos"
                      }
                    />
                    <ItemAlerta
                      rotulo="Maior concentracao"
                      valor={
                        alertas.diaMaiorPagamento
                          ? `${dataBR(alertas.diaMaiorPagamento.data)} - ${brl(alertas.diaMaiorPagamento.total)}`
                          : "Sem saidas"
                      }
                    />
                    <ItemAlerta
                      rotulo="Necessidade de caixa"
                      valor={brl(alertas.necessidadeCaixa)}
                      destaque={alertas.necessidadeCaixa > 0}
                    />
                  </dl>
                </Bloco>
              </aside>
            </div>

            <div>
              <Bloco titulo="Evolucao do saldo projetado" className="overflow-hidden">
                <div className="h-[420px] min-h-[360px] min-w-0 xl:h-[calc(100vh-340px)]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={serieSaldo}
                      margin={{ top: 28, right: 16, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="saldoProjetado" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="var(--info)" stopOpacity={0.32} />
                          <stop offset="100%" stopColor="var(--info)" stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="var(--border)"
                      />
                      <XAxis dataKey="data" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis
                        tickFormatter={(v) => brl(Number(v), true)}
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        width={86}
                      />
                      <Tooltip
                        formatter={(v) => brl(Number(v))}
                        cursor={{ stroke: "var(--info)", strokeOpacity: 0.2 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="saldo"
                        fill="url(#saldoProjetado)"
                        stroke="var(--info)"
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="saldo"
                        stroke="var(--info)"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      >
                        <LabelList
                          dataKey="label"
                          position="top"
                          fontSize={11}
                          fill="var(--foreground)"
                        />
                      </Line>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Bloco>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function SeletorBancos({
  aberto,
  bancos,
  contasPorNome,
  contasSelecionadas,
  onAberto,
  onSelecionar,
}: {
  aberto: boolean;
  bancos: BancoPreConfigurado[];
  contasPorNome: Map<string, FluxoContaBancaria>;
  contasSelecionadas: string[];
  onAberto: (aberto: boolean) => void;
  onSelecionar: (banco: BancoPreConfigurado) => void;
}) {
  const selecionados = bancos.filter((banco) => {
    const conta = contasPorNome.get(normalizar(banco.nome));
    return conta ? contasSelecionadas.includes(conta.id) : false;
  });

  return (
    <div className="space-y-1">
      <Popover open={aberto} onOpenChange={onAberto}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={aberto}
            className="h-9 min-w-[260px] justify-between"
          >
            <span className="truncate">
              {selecionados.length
                ? `${selecionados.length} banco(s) selecionado(s)`
                : "Selecionar bancos"}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[320px] p-0">
          <Command>
            <CommandInput placeholder="Buscar banco..." />
            <CommandList>
              <CommandEmpty>Nenhum banco encontrado.</CommandEmpty>
              <CommandGroup>
                {bancos.map((banco) => {
                  const conta = contasPorNome.get(normalizar(banco.nome));
                  const selecionado = conta ? contasSelecionadas.includes(conta.id) : false;

                  return (
                    <CommandItem
                      key={banco.id}
                      value={banco.nome}
                      onSelect={() => onSelecionar(banco)}
                    >
                      <BancoImagem nome={banco.nome} imagemUrl={banco.imagemUrl} />
                      <span className="min-w-0 flex-1 truncate">{banco.nome}</span>
                      <Check className={cn("h-4 w-4", selecionado ? "opacity-100" : "opacity-0")} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function CardConta({
  conta,
  valor,
  selecionada,
  atualizadoEm,
  salvando,
  onSelecionar,
  onValor,
}: {
  conta: FluxoContaBancaria;
  valor: string;
  selecionada: boolean;
  atualizadoEm?: string;
  salvando?: boolean;
  onSelecionar: (checked: boolean) => void;
  onValor: (valor: string) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 shadow-card",
        selecionada ? "border-info/35" : "opacity-75",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <BancoImagem nome={conta.nome} imagemUrl={imagemBancoLocal(conta.nome, conta.imagem_url)} />
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Checkbox
            checked={selecionada}
            onCheckedChange={(checked) => onSelecionar(checked === true)}
          />
          Usar
        </label>
      </div>
      <p className="mt-2 text-[10px] font-medium uppercase text-muted-foreground">
        Saldo informado manualmente
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold">{conta.nome}</p>
      <Input
        value={valor}
        onChange={(event) => onValor(event.target.value)}
        onBlur={() => onValor(formatarCampoMonetario(valor))}
        inputMode="decimal"
        className="tabular mt-2 h-8 text-base font-semibold text-positive"
      />
      <p className="mt-1.5 truncate text-[10px] text-muted-foreground">
        {salvando
          ? "Salvando..."
          : atualizadoEm
            ? `Atualizado em ${dataHoraBR(atualizadoEm)}`
            : "Ainda nao salvo"}
      </p>
    </div>
  );
}

function BancoImagem({ nome, imagemUrl }: { nome: string; imagemUrl?: string | null }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted text-[11px] font-semibold text-muted-foreground">
      {imagemUrl ? (
        <img src={imagemUrl} alt="" className="h-full w-full object-contain p-1" />
      ) : (
        iniciaisBanco(nome)
      )}
    </span>
  );
}

function imagemBancoLocal(nome: string, fallback?: string | null) {
  return (
    bancosPreConfigurados.find((banco) => normalizar(banco.nome) === normalizar(nome))?.imagemUrl ??
    fallback
  );
}

function KpiFluxo({
  titulo,
  valor,
  icone: Icone,
  tom,
}: {
  titulo: string;
  valor: number;
  icone: LucideIcon;
  tom: "positivo" | "negativo";
}) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-card">
      <span
        className={cn(
          "grid size-9 place-items-center rounded-lg",
          tom === "positivo" ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative",
        )}
      >
        <Icone className="h-4 w-4" />
      </span>
      <p className="mt-2 text-[10px] font-medium uppercase text-muted-foreground">{titulo}</p>
      <p
        className={cn(
          "tabular mt-1.5 text-xl font-semibold",
          tom === "positivo" ? "text-positive" : "text-negative",
        )}
      >
        {brl(valor)}
      </p>
    </div>
  );
}

function CampoInput({
  label,
  value,
  type,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  type: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9"
      />
    </div>
  );
}

function CampoSelect<T extends string>({
  label,
  value,
  onValue,
  children,
}: {
  label: string;
  value: T;
  onValue: (value: T) => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={(valor) => onValue(valor as T)}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

function ResumoPeriodo({ resumo }: { resumo: ReturnType<typeof resumirFluxo> }) {
  return (
    <Bloco titulo="Resumo do periodo">
      <dl className="space-y-3 text-sm">
        <LinhaResumo rotulo="Entradas previstas" valor={resumo.recebimentos} tom="positivo" />
        <LinhaResumo rotulo="Saidas previstas" valor={resumo.pagamentos} tom="negativo" />
        <LinhaResumo
          rotulo="Variacao liquida"
          valor={resumo.variacaoLiquida}
          tom={resumo.variacaoLiquida >= 0 ? "positivo" : "negativo"}
        />
        <LinhaResumo
          rotulo="Saldo final projetado"
          valor={resumo.saldoFinal}
          tom={resumo.saldoFinal >= 0 ? "positivo" : "negativo"}
        />
      </dl>
    </Bloco>
  );
}

function LinhaResumo({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string;
  valor: number;
  tom: "positivo" | "negativo";
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd
        className={cn(
          "tabular font-semibold",
          tom === "positivo" ? "text-positive" : "text-negative",
        )}
      >
        {brl(valor)}
      </dd>
    </div>
  );
}

type ItemAtraso = {
  id: string;
  nome: string;
  dias: number;
  valor: number;
  status: string;
};

function PanoramaAtrasos({
  titulo,
  nomeColuna,
  vazio,
  totalRotulo,
  itens,
}: {
  titulo: string;
  nomeColuna: string;
  vazio: string;
  totalRotulo: string;
  itens: ItemAtraso[];
}) {
  const total = itens.reduce((s, item) => s + item.valor, 0);
  return (
    <Bloco titulo={titulo}>
      {itens.length === 0 ? (
        <SemDados mensagem={vazio} />
      ) : (
        <div className="space-y-3">
          <div className="max-h-48 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-card text-muted-foreground">
                <tr>
                  <th className="pb-2 text-left font-medium">{nomeColuna}</th>
                  <th className="pb-2 text-right font-medium">Dias</th>
                  <th className="pb-2 text-right font-medium">Valor</th>
                  <th className="pb-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="max-w-28 truncate py-2 font-medium">{item.nome}</td>
                    <td className="tabular py-2 text-right">{item.dias}</td>
                    <td className="tabular py-2 text-right">{brl(item.valor, true)}</td>
                    <td className="py-2 text-right">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          item.status === "Critico"
                            ? "bg-negative-soft text-negative"
                            : item.status === "Alto"
                              ? "bg-warning-soft text-warning"
                              : "bg-info-soft text-info",
                        )}
                      >
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t pt-3 text-sm">
            <span className="font-medium">{totalRotulo}</span>
            <span className="tabular font-semibold text-negative">{brl(total)}</span>
          </div>
        </div>
      )}
    </Bloco>
  );
}

function ItemAlerta({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 border-b pb-3 last:border-0">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg",
          destaque ? "bg-negative-soft text-negative" : "bg-info-soft text-info",
        )}
      >
        {destaque ? <AlertTriangle className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {rotulo}
        </dt>
        <dd className="mt-1 break-words font-medium">{valor}</dd>
      </div>
    </div>
  );
}

function resumirFluxo(linhas: LinhaFluxo[], saldoInicial: number) {
  const recebimentos = linhas.reduce((s, linha) => s + linha.recebimento, 0);
  const pagamentos = linhas.reduce((s, linha) => s + linha.pagamento, 0);
  const variacaoLiquida = recebimentos - pagamentos;
  return {
    recebimentos,
    pagamentos,
    variacaoLiquida,
    saldoFinal: saldoInicial + variacaoLiquida,
  };
}

function calcularAlertas(linhas: LinhaFluxo[]) {
  const menor = linhas.reduce<LinhaFluxo | null>(
    (atual, linha) => (!atual || linha.saldoProjetado < atual.saldoProjetado ? linha : atual),
    null,
  );
  const primeiroNegativo = linhas.find((linha) => linha.saldoProjetado < 0);
  const maiorPagamento = linhas
    .filter((linha) => linha.pagamento > 0)
    .sort((a, b) => b.pagamento - a.pagamento)[0];
  const pagamentosPorDia = new Map<string, number>();
  for (const linha of linhas) {
    if (!linha.pagamento) continue;
    pagamentosPorDia.set(
      linha.dataProjetada,
      (pagamentosPorDia.get(linha.dataProjetada) ?? 0) + linha.pagamento,
    );
  }
  const diaMaiorPagamento = [...pagamentosPorDia.entries()]
    .map(([data, total]) => ({ data, total }))
    .sort((a, b) => b.total - a.total)[0];
  const menorSaldo = menor?.saldoProjetado ?? 0;

  return {
    menorSaldo,
    dataMenorSaldo: menor?.dataProjetada ?? "",
    primeiroNegativo: primeiroNegativo?.dataProjetada ?? null,
    maiorPagamento,
    diaMaiorPagamento,
    necessidadeCaixa: Math.max(0, -menorSaldo),
  };
}

function montarSerieSaldo(linhas: LinhaFluxo[], saldoInicial: number, inicio: string, fim: string) {
  const mapa = new Map<string, number>();
  for (const linha of linhas) {
    mapa.set(linha.dataProjetada, linha.saldoProjetado);
  }

  const serie = [
    { data: dataBR(inicio).slice(0, 5), saldo: saldoInicial, label: brl(saldoInicial, true) },
  ];
  let cursor = inicio;
  let ultimoSaldo = saldoInicial;
  while (cursor <= fim) {
    ultimoSaldo = mapa.get(cursor) ?? ultimoSaldo;
    serie.push({
      data: dataBR(cursor).slice(0, 5),
      saldo: ultimoSaldo,
      label: mapa.has(cursor) ? brl(ultimoSaldo, true) : "",
    });
    cursor = somarDias(cursor, 1);
  }
  return serie;
}

function montarInadimplentes(
  lancamentos: Lancamento[],
  titulosVencidos: FluxoTituloNibo[],
  hoje: string,
) {
  const deLancamentos = lancamentos.map((lancamento) => {
    const dias = diferencaDias(lancamento.data_efetiva.slice(0, 10), hoje);
    return {
      id: lancamento.id,
      nome: lancamento.pessoa?.trim() || "Sem cliente",
      dias,
      valor: Math.abs(Number(lancamento.valor) || 0),
      status: dias > 30 ? "Critico" : dias > 15 ? "Alto" : "Atencao",
    };
  });
  const deTitulos = titulosVencidos.map((titulo) => {
    const dias = diferencaDias(titulo.vencimento.slice(0, 10), hoje);
    return {
      id: titulo.id,
      nome: titulo.pessoa?.trim() || "Sem cliente",
      dias,
      valor: Math.abs(Number(titulo.valor) || 0),
      status: dias > 30 ? "Critico" : dias > 15 ? "Alto" : "Atencao",
    };
  });

  return [...deLancamentos, ...deTitulos].sort((a, b) => b.dias - a.dias).slice(0, 8);
}

function montarPagamentosAtrasados(titulosVencidos: FluxoTituloNibo[], hoje: string): ItemAtraso[] {
  return titulosVencidos
    .map((titulo) => {
      const dias = diferencaDias(titulo.vencimento.slice(0, 10), hoje);
      return {
        id: titulo.id,
        nome: titulo.pessoa?.trim() || titulo.descricao?.trim() || "Sem fornecedor",
        dias,
        valor: Math.abs(Number(titulo.valor) || 0),
        status: dias > 30 ? "Critico" : dias > 15 ? "Alto" : "Atencao",
      };
    })
    .sort((a, b) => b.dias - a.dias)
    .slice(0, 8);
}

function linhaParaExportacao(linha: LinhaFluxo) {
  return {
    Vencimento: dataBR(linha.vencimento),
    Nome: linha.nome,
    Descricao: linha.descricao,
    Recebimentos: linha.recebimento,
    Pagamentos: linha.pagamento,
    "Saldo projetado": linha.saldoProjetado,
    Categoria: linha.categoria,
    "ID NIBO": linha.identificadorNibo,
    Origem:
      linha.origem === "manual"
        ? "Lancamento manual"
        : linha.origem === "titulo"
          ? "Titulo futuro"
          : "Lancamento realizado",
  };
}

function tipoProjetadoTitulo(titulo: FluxoTituloNibo) {
  const texto = normalizar(
    `${titulo.descricao ?? ""} ${titulo.categoria_nibo ?? ""} ${titulo.pessoa ?? ""} ${titulo.status ?? ""} ${titulo.hash ?? ""}`,
  );
  const codigoCategoria = titulo.categoria_nibo?.match(/\d+/)?.[0] ?? "";
  if (/(^|[| ])recebida($|[| ])/.test(texto)) return "recebida";
  if (/(^|[| ])paga($|[| ])/.test(texto)) return "paga";
  if (codigoCategoria.startsWith("1")) return "recebida";
  if (["2", "3", "4", "5"].some((prefixo) => codigoCategoria.startsWith(prefixo))) {
    return "paga";
  }
  if (/recebido|recebida/.test(texto)) return "recebida";
  if (/pago|paga/.test(texto)) return "paga";

  const pontosReceber = pontuarTexto(texto, [
    "contas a receber",
    "receber",
    "recebido",
    "recebida",
    "recebimento",
    "recebimentos",
    "receita",
    "entrada",
    "entradas",
    "cliente",
    "clientes",
    "sacado",
    "tomador",
    "devedor",
    "venda",
  ]);
  const pontosPagar = pontuarTexto(texto, [
    "contas a pagar",
    "pagar",
    "pago",
    "paga",
    "pagamento",
    "pagamentos",
    "despesa",
    "saida",
    "saidas",
    "fornecedor",
    "fornecedores",
    "boleto",
  ]);

  if (titulo.tipo === "paga" && pontosReceber > pontosPagar + 1) return "recebida";
  if (titulo.tipo === "recebida" && pontosPagar > pontosReceber + 1) return "paga";
  return titulo.tipo;
}

function tipoProjetadoLancamento(lancamento: Lancamento) {
  const texto = normalizar(
    `${lancamento.descricao ?? ""} ${lancamento.categoria_nibo ?? ""} ${lancamento.pessoa ?? ""} ${lancamento.hash ?? ""}`,
  );
  const codigoCategoria = lancamento.categoria_nibo?.match(/\d+/)?.[0] ?? "";
  if (/(^|[| ])recebida($|[| ])/.test(texto)) return "recebida";
  if (/(^|[| ])paga($|[| ])/.test(texto)) return "paga";
  if (codigoCategoria.startsWith("1")) return "recebida";
  if (["2", "3", "4", "5"].some((prefixo) => codigoCategoria.startsWith(prefixo))) {
    return "paga";
  }
  if (/recebido|recebida|receber|recebimento|receita|entrada|cliente|sacado/.test(texto)) {
    return "recebida";
  }
  if (/pago|paga|pagar|pagamento|despesa|saida|fornecedor|boleto/.test(texto)) return "paga";
  if (Number(lancamento.valor) < 0) return "paga";
  if (Number(lancamento.valor) > 0) return "recebida";
  return lancamento.tipo;
}

function pontuarTexto(texto: string, termos: string[]) {
  return termos.reduce((total, termo) => total + (texto.includes(normalizar(termo)) ? 1 : 0), 0);
}

function statusChecklistLinha(
  linha: LinhaFluxo,
  checklistPorLancamento: Map<string | null, { status: StatusChecklistFluxo }>,
  checklistPorTitulo: Map<string | null, { status: StatusChecklistFluxo }>,
) {
  return (
    (linha.origem === "lancamento"
      ? checklistPorLancamento.get(linha.id)?.status
      : checklistPorTitulo.get(linha.id)?.status) ?? "nao_selecionado"
  );
}

function labelStatus(status?: StatusChecklistFluxo) {
  if (status === "identificado_pago") return "Identificado como pago";
  if (status === "selecionado_pagamento") return "Selecionado para pagamento";
  return "Nao selecionado";
}

function rangePeriodo(
  periodo: PeriodoFluxo,
  hoje: string,
  inicioCustom: string,
  fimCustom: string,
) {
  if (periodo === "personalizado") return normalizarRange(inicioCustom, fimCustom);
  if (periodo === "proximos_7") return { inicio: hoje, fim: somarDias(hoje, 6) };
  if (periodo === "proximos_15") return { inicio: hoje, fim: somarDias(hoje, 14) };
  if (periodo === "proximos_30") return { inicio: hoje, fim: somarDias(hoje, 29) };
  return semanaAtual(hoje);
}

function normalizarRange(inicio: string, fim: string) {
  if (!inicio || !fim) return semanaAtual(hojeISO());
  return inicio <= fim ? { inicio, fim } : { inicio: fim, fim: inicio };
}

function semanaAtual(iso: string) {
  const data = dataLocal(iso);
  const dia = data.getDay();
  const segundaOffset = dia === 0 ? -6 : 1 - dia;
  const inicio = addDays(data, segundaOffset);
  const fim = addDays(inicio, 6);
  return { inicio: toISODate(inicio), fim: toISODate(fim) };
}

function hojeISO() {
  return toISODate(new Date());
}

function somarDias(iso: string, dias: number) {
  return toISODate(addDays(dataLocal(iso), dias));
}

function addDays(data: Date, dias: number) {
  const nova = new Date(data);
  nova.setDate(nova.getDate() + dias);
  return nova;
}

function dataLocal(iso: string) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano ?? 2000, (mes ?? 1) - 1, dia ?? 1);
}

function toISODate(data: Date) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

function diferencaDias(inicio: string, fim: string) {
  const ms = dataLocal(fim).getTime() - dataLocal(inicio).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function numeroDoCampo(valor: string) {
  const normalizado = String(valor)
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : 0;
}

function formatarCampoMonetario(valor: string | number) {
  return brl(typeof valor === "number" ? valor : numeroDoCampo(valor));
}

function iniciaisBanco(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatarDescricao(texto?: string | null) {
  return (texto?.trim() || "Sem descricao").toUpperCase();
}

function labelPeriodo(inicio: string, fim: string) {
  return `${dataBR(inicio)} a ${dataBR(fim)}`;
}

function criarFormularioLancamentoManual(vencimento: string): FormularioLancamentoManual {
  return {
    vencimento,
    nome: "",
    descricao: "",
    tipo: "paga",
    valor: "",
  };
}

function competenciaDoVencimento(vencimento: string) {
  return `${vencimento.slice(0, 7)}-01`;
}

function chaveContasSelecionadasFluxo(empresaId: string) {
  return `vg.fluxo.contasSelecionadas.${empresaId}`;
}

function lerContasSelecionadasFluxo(empresaId: string) {
  const salvo = localStorage.getItem(chaveContasSelecionadasFluxo(empresaId));
  if (!salvo) return null;

  try {
    const parsed = JSON.parse(salvo);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && !!item);
    }
  } catch {
    return null;
  }

  return null;
}

function salvarContasSelecionadasFluxo(empresaId: string, contasSelecionadas: string[]) {
  localStorage.setItem(
    chaveContasSelecionadasFluxo(empresaId),
    JSON.stringify([...new Set(contasSelecionadas)]),
  );
}

function dataHoraBR(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}
