import pptxgen from "pptxgenjs";
import JSZip from "jszip";
import {
  layoutRelatorioPadrao,
  rotuloCategoriaRelatorio,
  tituloGraficoRelatorio,
  type GraficoRelatorioId,
  type RelatorioPptxLayout,
} from "@/lib/relatorio-config";

export interface SerieRelatorioPptx {
  mes: string;
  receita: number;
  resultado: number;
  resultadoBruto: number;
  resultadoLiquido: number;
  margem: number;
}
export interface CategoriaRelatorioPptx {
  nome: string;
  valor: number;
}
export interface ImpactoRelatorioPptx {
  nome: string;
  grupo: string;
  efeito: number;
}
export interface AcaoRelatorioPptx {
  acao: string;
  responsavel?: string | null;
  prazo?: string | null;
  status: string;
}
export interface RelatorioPptxDados {
  empresa: string;
  logoClienteUrl?: string | null;
  periodo: string;
  ano: number;
  receita: number;
  deducoesCustos: number;
  despesas: number;
  resultadoBruto: number;
  resultadoOperacional: number;
  resultadoLiquido: number;
  margemOperacional: number;
  margemDesejada: number;
  resumo: string[];
  alertas: Array<{ titulo: string; detalhe: string }>;
  evolucao: SerieRelatorioPptx[];
  receitasPorCategoria: CategoriaRelatorioPptx[];
  custosPorCategoria: CategoriaRelatorioPptx[];
  impactosPositivos: ImpactoRelatorioPptx[];
  impactosNegativos: ImpactoRelatorioPptx[];
  acoes: AcaoRelatorioPptx[];
  layout?: RelatorioPptxLayout;
}

const C = {
  navy: "07356B",
  blue: "0A4A8A",
  blue2: "1479D2",
  panel: "0A427D",
  panel2: "0D559C",
  cyan: "26B9E8",
  green: "28B78D",
  lime: "73C76B",
  yellow: "F2C94C",
  pink: "F04F78",
  white: "FFFFFF",
  muted: "DDEBFA",
  grid: "2C6094",
};
const moeda = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;
const pontosPercentuais = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(1).replace(".", ",")} p.p.`;

function periodoCapa(periodo: string) {
  return periodo.replace(/\s+de\s+(\d{4})$/i, "/$1");
}

function iniciaisEmpresa(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte.charAt(0))
    .join("")
    .toUpperCase();
}

async function imagemComoDataUri(url?: string | null) {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  try {
    const resposta = await fetch(url);
    if (!resposta.ok) return null;
    const blob = await resposta.blob();
    return await new Promise<string>((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result));
      leitor.onerror = () => reject(leitor.error);
      leitor.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function base(slide: pptxgen.Slide, titulo: string, d: RelatorioPptxDados, numero: number) {
  slide.background = { color: C.navy };
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.1,
    fill: { color: C.blue2 },
    line: { color: C.blue2 },
  });
  slide.addText(titulo.toUpperCase(), {
    x: 0.62,
    y: 0.34,
    w: 8.4,
    h: 0.43,
    fontFace: "Arial",
    fontSize: 23,
    bold: true,
    color: C.white,
    margin: 0,
    fit: "shrink",
  });
  slide.addText(d.periodo, {
    x: 9.1,
    y: 0.41,
    w: 3.55,
    h: 0.22,
    fontFace: "Arial",
    fontSize: 10,
    color: C.muted,
    align: "right",
    margin: 0,
  });
  slide.addShape("line", { x: 0.62, y: 0.93, w: 12.05, h: 0, line: { color: C.grid, width: 1 } });
  slide.addText(String(numero).padStart(2, "0"), {
    x: 11.95,
    y: 7.14,
    w: 0.7,
    h: 0.2,
    fontFace: "Arial",
    fontSize: 9,
    bold: true,
    color: C.white,
    align: "right",
    margin: 0,
  });
}
function panel(slide: pptxgen.Slide, x: number, y: number, w: number, h: number, color = C.panel) {
  slide.addShape("roundRect", {
    x,
    y,
    w,
    h,
    rectRadius: 0.06,
    fill: { color, transparency: 3 },
    line: { color: C.grid, width: 1 },
  });
}
function kpi(
  slide: pptxgen.Slide,
  x: number,
  y: number,
  w: number,
  titulo: string,
  valor: string,
  cor: string,
  detalhe?: string,
) {
  panel(slide, x, y, w, 1.05, "063B77");
  slide.addShape("rect", { x, y, w: 0.07, h: 1.05, fill: { color: cor }, line: { color: cor } });
  slide.addText(titulo.toUpperCase(), {
    x: x + 0.2,
    y: y + 0.18,
    w: w - 0.35,
    h: 0.19,
    fontFace: "Arial",
    fontSize: 9,
    bold: true,
    color: C.muted,
    margin: 0,
    fit: "shrink",
  });
  slide.addText(valor, {
    x: x + 0.2,
    y: y + 0.45,
    w: w - 0.35,
    h: 0.34,
    fontFace: "Arial",
    fontSize: 18,
    bold: true,
    color: C.white,
    margin: 0,
    fit: "shrink",
  });
  if (detalhe)
    slide.addText(detalhe, {
      x: x + 0.2,
      y: y + 0.82,
      w: w - 0.35,
      h: 0.13,
      fontFace: "Arial",
      fontSize: 7.5,
      color: C.white,
      margin: 0,
      fit: "shrink",
    });
}
function tituloBloco(slide: pptxgen.Slide, texto: string, x: number, y: number, w: number) {
  slide.addText(texto.toUpperCase(), {
    x,
    y,
    w,
    h: 0.28,
    fontFace: "Arial",
    fontSize: 15,
    bold: true,
    color: C.white,
    margin: 0,
    fit: "shrink",
  });
  slide.addShape("line", { x, y: y + 0.36, w, h: 0, line: { color: C.yellow, width: 1.4 } });
}
const axis = {
  catAxisLabelColor: C.white,
  catAxisLabelFontSize: 10,
  valAxisLabelColor: C.white,
  valAxisLabelFontSize: 8,
  valGridLine: { color: C.grid, width: 1 },
};

function barrasCategorias(
  slide: pptxgen.Slide,
  itens: CategoriaRelatorioPptx[],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const dados = itens.slice(0, 7).map((item) => ({
    nome: rotuloCategoriaRelatorio(item.nome),
    valor: Math.abs(item.valor),
  }));
  if (!dados.length) {
    slide.addText("Sem categorias no período selecionado.", {
      x,
      y: y + h / 2 - 0.2,
      w,
      h: 0.4,
      fontFace: "Arial",
      fontSize: 15,
      color: C.white,
      align: "center",
      margin: 0,
    });
    return;
  }
  const maximo = Math.max(...dados.map((item) => item.valor), 1);
  const graficoH = h - 0.72;
  const gap = 0.16;
  const largura = Math.max(0.38, (w - gap * (dados.length - 1)) / dados.length);
  [0.25, 0.5, 0.75, 1].forEach((proporcao) => {
    const linhaY = y + graficoH * (1 - proporcao);
    slide.addShape("line", {
      x,
      y: linhaY,
      w,
      h: 0,
      line: { color: C.grid, transparency: 20, width: 0.7 },
    });
  });
  dados.forEach((item, indice) => {
    const barraH = Math.max(0.06, (item.valor / maximo) * (graficoH - 0.35));
    const barraX = x + indice * (largura + gap);
    const barraY = y + graficoH - barraH;
    slide.addShape("rect", {
      x: barraX,
      y: barraY,
      w: largura,
      h: barraH,
      fill: {
        color:
          [C.cyan, C.blue2, C.green, C.yellow, C.pink, C.lime, "7D9FE8"][indice % 7] ?? C.blue2,
      },
      line: { transparency: 100 },
    });
    slide.addText(moeda(item.valor), {
      x: barraX - 0.04,
      y: Math.max(y, barraY - 0.25),
      w: largura + 0.08,
      h: 0.18,
      fontFace: "Arial",
      fontSize: 7.5,
      bold: true,
      color: C.white,
      align: "center",
      margin: 0,
      fit: "shrink",
    });
    slide.addText(item.nome, {
      x: barraX - 0.08,
      y: y + graficoH + 0.08,
      w: largura + 0.16,
      h: 0.48,
      fontFace: "Arial",
      fontSize: 7.2,
      color: C.white,
      align: "center",
      valign: "top",
      margin: 0.01,
      fit: "shrink",
      breakLine: false,
    });
  });
}

type BarraVisual = { nome: string; valor: number; cor: string };

/**
 * Barras desenhadas como formas do slide. Além de dar mais controle visual,
 * isso evita que Canva/Google Slides troquem os rótulos do gráfico por 1, 2, 3...
 * ao importar o PPTX.
 */
function barrasComparativas(
  slide: pptxgen.Slide,
  itens: BarraVisual[],
  x: number,
  y: number,
  w: number,
  h: number,
  formatarValor: (valor: number) => string = moeda,
  escalaMax?: number,
) {
  if (!itens.length) return;
  const maximo = Math.max(escalaMax ?? 0, ...itens.map((item) => Math.abs(item.valor)), 1);
  const areaH = h - 0.65;
  const gap = Math.min(0.3, w / Math.max(itens.length * 5, 1));
  const largura = Math.max(0.18, (w - gap * (itens.length - 1)) / itens.length);

  [0.25, 0.5, 0.75, 1].forEach((proporcao) => {
    slide.addShape("line", {
      x,
      y: y + areaH * (1 - proporcao),
      w,
      h: 0,
      line: { color: C.grid, transparency: 22, width: 0.7 },
    });
  });

  itens.forEach((item, indice) => {
    const barraH = Math.max(0.07, (Math.abs(item.valor) / maximo) * (areaH - 0.32));
    const barraX = x + indice * (largura + gap);
    const barraY = y + areaH - barraH;
    slide.addShape("roundRect", {
      x: barraX + largura * 0.16,
      y: barraY,
      w: largura * 0.68,
      h: barraH,
      rectRadius: 0.04,
      fill: { color: item.cor },
      line: { color: item.cor, transparency: 100 },
    });
    slide.addText(formatarValor(item.valor), {
      x: barraX - 0.04,
      y: Math.max(y, barraY - 0.25),
      w: largura + 0.08,
      h: 0.2,
      fontFace: "Arial",
      fontSize: 8,
      bold: true,
      color: C.white,
      align: "center",
      margin: 0,
      fit: "shrink",
    });
    slide.addText(rotuloCategoriaRelatorio(item.nome), {
      x: barraX - 0.05,
      y: y + areaH + 0.07,
      w: largura + 0.1,
      h: 0.46,
      fontFace: "Arial",
      fontSize: 8,
      bold: true,
      color: C.white,
      align: "center",
      valign: "top",
      margin: 0.01,
      fit: "shrink",
    });
  });
}

function barrasHorizontais(
  slide: pptxgen.Slide,
  itens: CategoriaRelatorioPptx[],
  x: number,
  y: number,
  w: number,
  h: number,
  cor: string,
) {
  const dados = itens.slice(0, 5).map((item) => ({
    nome: rotuloCategoriaRelatorio(item.nome),
    valor: Math.abs(item.valor),
  }));
  if (!dados.length) return;
  const maximo = Math.max(...dados.map((item) => item.valor), 1);
  const linhaH = h / dados.length;

  dados.forEach((item, indice) => {
    const linhaY = y + indice * linhaH;
    slide.addText(item.nome, {
      x,
      y: linhaY,
      w: w * 0.66,
      h: 0.2,
      fontFace: "Arial",
      fontSize: 9.5,
      bold: true,
      color: C.white,
      margin: 0,
      fit: "shrink",
    });
    slide.addText(moeda(item.valor), {
      x: x + w * 0.67,
      y: linhaY,
      w: w * 0.33,
      h: 0.2,
      fontFace: "Arial",
      fontSize: 8.5,
      bold: true,
      color: C.white,
      align: "right",
      margin: 0,
      fit: "shrink",
    });
    slide.addShape("roundRect", {
      x,
      y: linhaY + 0.28,
      w,
      h: 0.14,
      rectRadius: 0.04,
      fill: { color: C.grid, transparency: 35 },
      line: { color: C.grid, transparency: 100 },
    });
    slide.addShape("roundRect", {
      x,
      y: linhaY + 0.28,
      w: Math.max(0.09, w * (item.valor / maximo)),
      h: 0.14,
      rectRadius: 0.04,
      fill: { color: cor },
      line: { color: cor, transparency: 100 },
    });
  });
}

function evolucaoMensal(
  slide: pptxgen.Slide,
  dados: SerieRelatorioPptx[],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (!dados.length) return;
  const maximo = Math.max(
    ...dados.flatMap((item) => [Math.abs(item.receita), Math.abs(item.resultado)]),
    1,
  );
  const areaH = h - 0.72;
  const grupoW = w / dados.length;
  const barraW = Math.max(0.06, Math.min(0.22, grupoW * 0.25));

  [0.25, 0.5, 0.75, 1].forEach((proporcao) => {
    slide.addShape("line", {
      x,
      y: y + areaH * (1 - proporcao),
      w,
      h: 0,
      line: { color: C.grid, transparency: 22, width: 0.7 },
    });
  });
  dados.forEach((item, indice) => {
    const centro = x + grupoW * indice + grupoW / 2;
    [
      { valor: item.receita, cor: C.lime, deslocamento: -barraW - 0.025 },
      { valor: item.resultado, cor: item.resultado >= 0 ? C.green : C.pink, deslocamento: 0.025 },
    ].forEach((serie) => {
      const barraH = Math.max(0.05, (Math.abs(serie.valor) / maximo) * (areaH - 0.16));
      slide.addShape("rect", {
        x: centro + serie.deslocamento,
        y: y + areaH - barraH,
        w: barraW,
        h: barraH,
        fill: { color: serie.cor },
        line: { color: serie.cor, transparency: 100 },
      });
    });
    slide.addText(item.mes, {
      x: x + grupoW * indice,
      y: y + areaH + 0.08,
      w: grupoW,
      h: 0.2,
      fontFace: "Arial",
      fontSize: 8,
      bold: true,
      color: C.white,
      align: "center",
      margin: 0,
      fit: "shrink",
    });
  });
  [
    { nome: "Receita", cor: C.lime, x: x + w * 0.34 },
    { nome: "Resultado", cor: C.green, x: x + w * 0.54 },
  ].forEach((item) => {
    slide.addShape("ellipse", {
      x: item.x,
      y: y + h - 0.16,
      w: 0.1,
      h: 0.1,
      fill: { color: item.cor },
      line: { color: item.cor },
    });
    slide.addText(item.nome, {
      x: item.x + 0.14,
      y: y + h - 0.19,
      w: 0.85,
      h: 0.16,
      fontFace: "Arial",
      fontSize: 7.5,
      color: C.muted,
      margin: 0,
    });
  });
}

function graficoMargemMeta(
  slide: pptxgen.Slide,
  margem: number,
  meta: number,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const diferenca = margem - meta;
  const atingimento = meta > 0 ? (margem / meta) * 100 : 0;
  const corAtual = diferenca >= 0 ? C.green : C.pink;
  const escala = Math.max(Math.abs(margem), Math.abs(meta), 10) * 1.2;
  const itens: BarraVisual[] = [
    { nome: "Margem atual", valor: margem, cor: corAtual },
    { nome: "Meta", valor: meta, cor: C.yellow },
  ];

  barrasComparativas(slide, itens, x, y, w * 0.58, h, pct, escala);
  slide.addShape("roundRect", {
    x: x + w * 0.64,
    y: y + 0.12,
    w: w * 0.36,
    h: h - 0.24,
    rectRadius: 0.06,
    fill: { color: "063B77", transparency: 2 },
    line: { color: corAtual, width: 1.2 },
  });
  slide.addText(diferenca >= 0 ? "META SUPERADA" : "DISTÂNCIA DA META", {
    x: x + w * 0.67,
    y: y + 0.42,
    w: w * 0.3,
    h: 0.24,
    fontFace: "Arial",
    fontSize: 10,
    bold: true,
    color: C.muted,
    align: "center",
    margin: 0,
    fit: "shrink",
  });
  slide.addText(pontosPercentuais(diferenca), {
    x: x + w * 0.67,
    y: y + 0.86,
    w: w * 0.3,
    h: 0.55,
    fontFace: "Arial",
    fontSize: 28,
    bold: true,
    color: corAtual,
    align: "center",
    margin: 0,
    fit: "shrink",
  });
  slide.addText("em relação à meta", {
    x: x + w * 0.67,
    y: y + 1.43,
    w: w * 0.3,
    h: 0.2,
    fontFace: "Arial",
    fontSize: 8.5,
    color: C.muted,
    align: "center",
    margin: 0,
  });
  slide.addText(`Atingimento da meta: ${pct(atingimento)}`, {
    x: x + w * 0.67,
    y: y + h - 0.58,
    w: w * 0.3,
    h: 0.22,
    fontFace: "Arial",
    fontSize: 9,
    bold: true,
    color: C.white,
    align: "center",
    margin: 0,
    fit: "shrink",
  });
  // Mantém a escala explícita para a comparação continuar honesta.
  slide.addText(`Escala: 0 a ${pct(escala)}`, {
    x: x + w * 0.67,
    y: y + h - 0.3,
    w: w * 0.3,
    h: 0.16,
    fontFace: "Arial",
    fontSize: 7,
    color: C.muted,
    align: "center",
    margin: 0,
  });
}

function adicionarSlideGrafico(
  pptx: pptxgen,
  d: RelatorioPptxDados,
  grafico: GraficoRelatorioId,
  numero: number,
) {
  const slide = pptx.addSlide();
  base(slide, tituloGraficoRelatorio(grafico), d, numero);
  kpi(slide, 0.62, 1.18, 3.65, "Receita operacional", moeda(d.receita), C.blue2);
  kpi(slide, 4.45, 1.18, 3.65, "Resultado operacional", moeda(d.resultadoOperacional), C.cyan);
  kpi(slide, 8.28, 1.18, 4.39, "Margem operacional", pct(d.margemOperacional), C.green);
  panel(slide, 0.62, 2.52, 8.15, 4.35);
  tituloBloco(slide, tituloGraficoRelatorio(grafico), 0.92, 2.84, 7.55);
  panel(slide, 9.02, 2.52, 3.65, 4.35, "063B77");
  tituloBloco(slide, "Leitura do período", 9.32, 2.84, 3.05);

  if (grafico === "receitas_categoria") {
    barrasCategorias(slide, d.receitasPorCategoria, 1.02, 3.35, 7.28, 2.95);
  } else if (grafico === "custos_categoria") {
    barrasCategorias(slide, d.custosPorCategoria, 1.02, 3.35, 7.28, 2.95);
  } else if (grafico === "receita_mensal" && d.evolucao.length > 1) {
    slide.addChart(
      pptx.ChartType.bar,
      [
        {
          name: "Receita",
          labels: d.evolucao.map((item) => item.mes),
          values: d.evolucao.map((item) => item.receita),
        },
      ],
      {
        x: 0.98,
        y: 3.3,
        w: 7.45,
        h: 3.05,
        ...axis,
        chartColors: [C.blue2],
        showLegend: false,
        showValue: true,
        dataLabelColor: C.white,
        dataLabelPosition: "outEnd",
        dataLabelFormatCode: "R$ #,##0",
        showBorder: false,
      },
    );
  } else if (grafico === "resultados") {
    const labels = d.evolucao.length > 1 ? d.evolucao.map((item) => item.mes) : [d.periodo];
    slide.addChart(
      pptx.ChartType.bar,
      [
        {
          name: "Resultado bruto",
          labels,
          values:
            d.evolucao.length > 1
              ? d.evolucao.map((item) => item.resultadoBruto)
              : [d.resultadoBruto],
        },
        {
          name: "Resultado operacional",
          labels,
          values:
            d.evolucao.length > 1
              ? d.evolucao.map((item) => item.resultado)
              : [d.resultadoOperacional],
        },
        {
          name: "Resultado líquido",
          labels,
          values:
            d.evolucao.length > 1
              ? d.evolucao.map((item) => item.resultadoLiquido)
              : [d.resultadoLiquido],
        },
      ],
      {
        x: 0.98,
        y: 3.3,
        w: 7.45,
        h: 3.05,
        ...axis,
        chartColors: [C.blue2, C.cyan, C.green],
        showLegend: true,
        legendColor: C.white,
        legendFontSize: 9,
        legendPos: "b",
        showBorder: false,
      },
    );
  } else if (grafico === "margem_meta") {
    graficoMargemMeta(slide, d.margemOperacional, d.margemDesejada, 1.02, 3.28, 7.28, 3.02);
  } else if (grafico === "impactos") {
    barrasCategorias(
      slide,
      [...d.impactosPositivos, ...d.impactosNegativos].map((item) => ({
        nome: item.nome,
        valor: item.efeito,
      })),
      1.02,
      3.35,
      7.28,
      2.95,
    );
  } else {
    barrasCategorias(slide, d.receitasPorCategoria, 1.02, 3.35, 7.28, 2.95);
  }

  const ranking =
    grafico === "receitas_categoria"
      ? d.receitasPorCategoria
      : grafico === "custos_categoria"
        ? d.custosPorCategoria
        : [];
  const total = ranking.reduce((soma, item) => soma + Math.abs(item.valor), 0);
  const leitura = ranking.length
    ? ranking
        .slice(0, 5)
        .map(
          (item, indice) =>
            `${indice + 1}. ${rotuloCategoriaRelatorio(item.nome)}\n${moeda(item.valor)} • ${pct((Math.abs(item.valor) / Math.max(total, 1)) * 100)}`,
        )
        .join("\n\n")
    : d.resumo.map((texto) => `• ${texto}`).join("\n\n");
  slide.addText(leitura, {
    x: 9.32,
    y: 3.38,
    w: 3.0,
    h: 2.95,
    fontFace: "Arial",
    fontSize: 10.5,
    color: C.white,
    margin: 0,
    fit: "shrink",
    valign: "top",
  });
}

export async function gerarRelatorioPptx(d: RelatorioPptxDados) {
  const [logoMarca, logoCliente] = await Promise.all([
    imagemComoDataUri("/logobranca.png"),
    imagemComoDataUri(d.logoClienteUrl),
  ]);
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = d.empresa;
  pptx.company = d.empresa;
  pptx.subject = `Relatório financeiro - ${d.empresa}`;
  pptx.title = `Relatório Financeiro ${d.periodo}`;

  const capa = pptx.addSlide();
  capa.background = { color: C.navy };
  [
    { x: 0, w: 3.18, cor: C.pink },
    { x: 3.18, w: 3.2, cor: C.yellow },
    { x: 6.38, w: 3.2, cor: C.green },
    { x: 9.58, w: 3.753, cor: C.blue2 },
  ].forEach((faixa) =>
    capa.addShape("rect", {
      x: faixa.x,
      y: 0,
      w: faixa.w,
      h: 0.13,
      fill: { color: faixa.cor },
      line: { color: faixa.cor, transparency: 100 },
    }),
  );
  capa.addText(`Relatório Financeiro ${periodoCapa(d.periodo)}`, {
    x: 1.25,
    y: 1.8,
    w: 10.83,
    h: 0.62,
    fontFace: "Arial",
    fontSize: 31,
    bold: true,
    color: C.white,
    align: "center",
    margin: 0,
    fit: "shrink",
  });
  capa.addText(
    [
      { text: "CLAREZA", options: { bold: true, color: C.yellow } },
      { text: " que gera ", options: { color: C.white } },
      { text: "RESULTADO!", options: { bold: true, color: C.white } },
    ],
    {
      x: 3.75,
      y: 3.14,
      w: 5.83,
      h: 0.36,
      fontFace: "Arial",
      fontSize: 18,
      color: C.white,
      align: "center",
      margin: 0,
      fit: "shrink",
    },
  );
  capa.addShape("line", {
    x: 4.22,
    y: 3.6,
    w: 4.9,
    h: 0,
    line: { color: C.white, width: 2 },
  });
  capa.addShape("line", {
    x: 6.665,
    y: 3.6,
    w: 0,
    h: 2.24,
    line: { color: C.white, width: 1.5 },
  });
  capa.addShape("line", {
    x: 0.3,
    y: 5.84,
    w: 12.73,
    h: 0,
    line: { color: C.white, width: 1.5 },
  });
  if (logoMarca) {
    capa.addImage({ data: logoMarca, x: 4.42, y: 4.19, w: 1.82, h: 0.72 });
  } else {
    capa.addText("VG\nRESULTADOS", {
      x: 4.4,
      y: 4.13,
      w: 1.86,
      h: 0.88,
      fontFace: "Arial",
      fontSize: 20,
      bold: true,
      color: C.white,
      align: "center",
      margin: 0,
      fit: "shrink",
    });
  }
  if (logoCliente) {
    capa.addImage({
      data: logoCliente,
      x: 7.12,
      y: 3.9,
      w: 1.55,
      h: 1.55,
      sizing: { type: "contain", w: 1.55, h: 1.55 },
    });
  } else {
    capa.addShape("roundRect", {
      x: 7.19,
      y: 3.94,
      w: 1.42,
      h: 1.42,
      rectRadius: 0.08,
      fill: { color: C.white, transparency: 92 },
      line: { color: C.white, transparency: 55, width: 1 },
    });
    capa.addText(iniciaisEmpresa(d.empresa) || "LOGO", {
      x: 7.36,
      y: 4.24,
      w: 1.08,
      h: 0.42,
      fontFace: "Arial",
      fontSize: 22,
      bold: true,
      color: C.white,
      align: "center",
      margin: 0,
      fit: "shrink",
    });
    capa.addText(d.empresa, {
      x: 6.94,
      y: 4.77,
      w: 1.92,
      h: 0.32,
      fontFace: "Arial",
      fontSize: 7.5,
      color: C.muted,
      align: "center",
      margin: 0,
      fit: "shrink",
    });
  }

  const dash = pptx.addSlide();
  base(dash, "Dashboard financeiro", d, 2);
  kpi(dash, 0.62, 1.18, 2.92, "Receita operacional", moeda(d.receita), C.lime);
  kpi(dash, 3.68, 1.18, 2.92, "Custos operacionais", moeda(-Math.abs(d.deducoesCustos)), C.pink);
  kpi(dash, 6.74, 1.18, 2.92, "Despesas operacionais", moeda(-Math.abs(d.despesas)), C.yellow);
  kpi(
    dash,
    9.8,
    1.18,
    2.87,
    "Resultado líquido",
    moeda(d.resultadoLiquido),
    d.resultadoLiquido >= 0 ? C.green : C.pink,
  );
  const unicoMes = d.evolucao.length <= 1;
  panel(dash, 0.62, 2.52, 8.05, 4.2);
  tituloBloco(dash, unicoMes ? "Composição do mês" : "Evolução mensal", 0.92, 2.82, 7.45);
  if (unicoMes) {
    barrasComparativas(
      dash,
      [
        { nome: "Receita operacional", valor: d.receita, cor: C.lime },
        { nome: "Custos operacionais", valor: -Math.abs(d.deducoesCustos), cor: C.yellow },
        { nome: "Despesas operacionais", valor: -Math.abs(d.despesas), cor: C.pink },
        {
          nome: "Resultado líquido",
          valor: d.resultadoLiquido,
          cor: d.resultadoLiquido >= 0 ? C.green : C.pink,
        },
      ],
      0.94,
      3.3,
      7.4,
      2.95,
    );
  } else {
    evolucaoMensal(dash, d.evolucao, 0.94, 3.3, 7.4, 2.95);
  }
  panel(dash, 8.92, 2.52, 3.75, 4.2, "063B77");
  tituloBloco(dash, "Leitura executiva", 9.22, 2.82, 3.15);
  dash.addText(d.resumo.map((x) => `• ${x}`).join("\n\n"), {
    x: 9.22,
    y: 3.35,
    w: 3.15,
    h: 2.45,
    fontFace: "Arial",
    fontSize: 11.5,
    color: C.white,
    margin: 0.02,
    fit: "shrink",
    valign: "top",
  });
  dash.addShape("roundRect", {
    x: 9.22,
    y: 5.98,
    w: 3.15,
    h: 0.48,
    fill: { color: d.margemOperacional >= d.margemDesejada ? C.green : C.pink },
    line: { color: d.margemOperacional >= d.margemDesejada ? C.green : C.pink },
  });
  dash.addText(`Margem ${pct(d.margemOperacional)}  •  Meta ${pct(d.margemDesejada)}`, {
    x: 9.35,
    y: 6.14,
    w: 2.88,
    h: 0.16,
    fontFace: "Arial",
    fontSize: 10,
    bold: true,
    color: C.white,
    align: "center",
    margin: 0,
    fit: "shrink",
  });

  const layout = d.layout ?? layoutRelatorioPadrao;
  const graficosLayout = [...layout.graficos, ...layoutRelatorioPadrao.graficos].slice(0, 4);
  graficosLayout.forEach((grafico, indice) => adicionarSlideGrafico(pptx, d, grafico, indice + 3));

  const analise = pptx.addSlide();
  base(analise, "Análise financeira", d, 7);
  panel(analise, 0.62, 1.18, 7.65, 5.85, "063B77");
  tituloBloco(analise, "Diagnóstico do período", 0.92, 1.52, 7.05);
  const alertas = d.alertas.slice(0, 5);
  alertas.forEach((a, i) => {
    const y = 2.03 + i * 0.9;
    analise.addShape("roundRect", {
      x: 0.92,
      y,
      w: 7.05,
      h: 0.7,
      fill: { color: i % 2 ? "07529A" : C.panel },
      line: { color: C.grid, width: 0.8 },
    });
    analise.addShape("ellipse", {
      x: 1.1,
      y: y + 0.18,
      w: 0.32,
      h: 0.32,
      fill: { color: i === 0 ? C.pink : C.yellow },
      line: { color: i === 0 ? C.pink : C.yellow },
    });
    analise.addText(a.titulo, {
      x: 1.58,
      y: y + 0.11,
      w: 2.15,
      h: 0.2,
      fontFace: "Arial",
      fontSize: 10.5,
      bold: true,
      color: C.white,
      margin: 0,
      fit: "shrink",
    });
    analise.addText(a.detalhe, {
      x: 3.72,
      y: y + 0.1,
      w: 3.95,
      h: 0.42,
      fontFace: "Arial",
      fontSize: 9.4,
      color: C.white,
      margin: 0,
      fit: "shrink",
      valign: "mid",
    });
  });
  if (!alertas.length)
    analise.addText("Nenhum alerta relevante no período selecionado.", {
      x: 1.05,
      y: 3.65,
      w: 6.8,
      h: 0.4,
      fontFace: "Arial",
      fontSize: 15,
      color: C.white,
      align: "center",
      margin: 0,
    });
  panel(analise, 8.52, 1.18, 4.15, 5.85);
  tituloBloco(analise, "Síntese executiva", 8.82, 1.52, 3.55);
  analise.addText(d.resumo.map((x) => `• ${x}`).join("\n\n"), {
    x: 8.82,
    y: 2.08,
    w: 3.55,
    h: 3.38,
    fontFace: "Arial",
    fontSize: 12,
    color: C.white,
    margin: 0,
    fit: "shrink",
    valign: "top",
  });
  analise.addShape("roundRect", {
    x: 8.82,
    y: 5.72,
    w: 3.55,
    h: 0.72,
    fill: { color: d.resultadoLiquido >= 0 ? C.green : C.pink },
    line: { color: d.resultadoLiquido >= 0 ? C.green : C.pink },
  });
  analise.addText(`RESULTADO LÍQUIDO\n${moeda(d.resultadoLiquido)}`, {
    x: 9.02,
    y: 5.87,
    w: 3.15,
    h: 0.38,
    fontFace: "Arial",
    fontSize: 12,
    bold: true,
    color: C.white,
    align: "center",
    margin: 0,
    fit: "shrink",
  });

  const impactos = pptx.addSlide();
  base(impactos, "Impactos do período", d, 8);
  panel(impactos, 0.62, 1.18, 5.9, 5.85, "063B77");
  tituloBloco(impactos, "Melhoraram o resultado", 0.92, 1.52, 5.3);
  if (d.impactosPositivos.length) {
    barrasHorizontais(
      impactos,
      d.impactosPositivos.map((item) => ({ nome: item.nome, valor: item.efeito })),
      0.92,
      2.08,
      5.25,
      4.35,
      C.green,
    );
  } else
    impactos.addText("Nenhum impacto positivo relevante no período.", {
      x: 1.05,
      y: 3.65,
      w: 5.0,
      h: 0.4,
      fontFace: "Arial",
      fontSize: 14,
      color: C.white,
      align: "center",
      margin: 0,
    });
  panel(impactos, 6.77, 1.18, 5.9, 5.85);
  tituloBloco(impactos, "Pressionaram o resultado", 7.07, 1.52, 5.3);
  if (d.impactosNegativos.length) {
    barrasHorizontais(
      impactos,
      d.impactosNegativos.map((item) => ({ nome: item.nome, valor: item.efeito })),
      7.07,
      2.08,
      5.25,
      4.35,
      C.pink,
    );
  } else
    impactos.addText("Nenhum impacto negativo relevante no período.", {
      x: 7.2,
      y: 3.65,
      w: 5.0,
      h: 0.4,
      fontFace: "Arial",
      fontSize: 14,
      color: C.white,
      align: "center",
      margin: 0,
    });

  const plano = pptx.addSlide();
  base(plano, "Plano de ação", d, 9);
  plano.addText("PRÓXIMOS PASSOS PRIORITÁRIOS", {
    x: 0.7,
    y: 1.25,
    w: 5.2,
    h: 0.3,
    fontFace: "Arial",
    fontSize: 15,
    bold: true,
    color: C.white,
    margin: 0,
  });
  const rows: pptxgen.TableRow[] = [
    [
      { text: "AÇÃO", options: { bold: true, color: C.white, fill: C.panel2 } },
      { text: "RESPONSÁVEL", options: { bold: true, color: C.white, fill: C.panel2 } },
      { text: "PRAZO", options: { bold: true, color: C.white, fill: C.panel2 } },
      { text: "STATUS", options: { bold: true, color: C.white, fill: C.panel2 } },
    ],
    ...d.acoes.slice(0, 8).map((a) => [a.acao, a.responsavel || "—", a.prazo || "—", a.status]),
  ];
  plano.addTable(rows, {
    x: 0.7,
    y: 1.82,
    w: 11.95,
    h: 4.75,
    colW: [6.0, 2.15, 1.55, 2.25],
    border: { type: "solid", color: C.grid, pt: 1 },
    fill: C.panel,
    color: C.white,
    fontFace: "Arial",
    fontSize: 11,
    margin: 0.1,
    valign: "mid",
    rowH: 0.58,
    autoFit: false,
    breakLine: false,
  });
  if (!d.acoes.length)
    plano.addText("Nenhuma ação em aberto para o período selecionado.", {
      x: 1,
      y: 3.5,
      w: 11.3,
      h: 0.5,
      align: "center",
      fontFace: "Arial",
      fontSize: 18,
      color: C.muted,
    });

  const slug = d.empresa
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const nomeArquivo = `relatorio-financeiro-${slug}-${d.ano}.pptx`;
  const conteudo = (await pptx.write({ outputType: "blob", compression: true })) as Blob;
  const zip = await JSZip.loadAsync(conteudo);
  const graficos = Object.keys(zip.files).filter((nome) =>
    /^ppt\/charts\/chart\d+\.xml$/.test(nome),
  );
  await Promise.all(
    graficos.map(async (nome) => {
      const arquivo = zip.file(nome);
      if (!arquivo) return;
      const xml = await arquivo.async("string");
      const branco = xml
        .replace(/<a:srgbClr val="000000"\/>/g, '<a:srgbClr val="FFFFFF"/>')
        .replace(/<a:schemeClr val="(?:tx1|dk1)"\/>/g, '<a:srgbClr val="FFFFFF"/>')
        .replace(/<a:sysClr val="windowText" lastClr="000000"\/>/g, '<a:srgbClr val="FFFFFF"/>');
      zip.file(nome, branco);
    }),
  );
  const arquivoFinal = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
  const url = URL.createObjectURL(arquivoFinal);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
