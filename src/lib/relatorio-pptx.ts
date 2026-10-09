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
    const labels = d.evolucao.length > 1 ? d.evolucao.map((item) => item.mes) : [d.periodo];
    slide.addChart(
      pptx.ChartType.line,
      [
        {
          name: "Margem operacional",
          labels,
          values:
            d.evolucao.length > 1 ? d.evolucao.map((item) => item.margem) : [d.margemOperacional],
        },
        { name: "Meta", labels, values: labels.map(() => d.margemDesejada) },
      ],
      {
        x: 0.98,
        y: 3.3,
        w: 7.45,
        h: 3.05,
        ...axis,
        valAxisLabelFormatCode: "0.0",
        chartColors: [C.cyan, C.white],
        showLegend: true,
        legendColor: C.white,
        legendFontSize: 9,
        legendPos: "b",
        lineSize: 3,
        showMarker: true,
        markerSize: 6,
        showBorder: false,
      },
    );
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
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = d.empresa;
  pptx.company = d.empresa;
  pptx.subject = `Relatório financeiro - ${d.empresa}`;
  pptx.title = `Relatório Financeiro ${d.periodo}`;

  const capa = pptx.addSlide();
  capa.background = { color: C.navy };
  capa.addShape("rect", {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.12,
    fill: { color: C.blue2 },
    line: { color: C.blue2 },
  });
  capa.addText("RELATÓRIO FINANCEIRO", {
    x: 0.85,
    y: 1.15,
    w: 11.65,
    h: 0.75,
    fontFace: "Arial",
    fontSize: 40,
    bold: true,
    color: C.white,
    align: "center",
    margin: 0,
    fit: "shrink",
  });
  capa.addText(d.periodo, {
    x: 2.2,
    y: 2.05,
    w: 8.95,
    h: 0.48,
    fontFace: "Arial",
    fontSize: 23,
    bold: true,
    color: C.white,
    align: "center",
    margin: 0,
  });
  capa.addShape("line", { x: 4.2, y: 2.82, w: 4.95, h: 0, line: { color: C.cyan, width: 2 } });
  capa.addText(d.empresa, {
    x: 2.2,
    y: 3.2,
    w: 8.95,
    h: 0.55,
    fontFace: "Arial",
    fontSize: 27,
    bold: true,
    color: C.white,
    align: "center",
    margin: 0,
    fit: "shrink",
  });
  capa.addText("DADOS • ANÁLISE • DECISÃO", {
    x: 3.25,
    y: 4.1,
    w: 6.85,
    h: 0.32,
    fontFace: "Arial",
    fontSize: 14,
    bold: true,
    color: C.muted,
    charSpacing: 2.2,
    align: "center",
    margin: 0,
  });
  capa.addShape("roundRect", {
    x: 4.1,
    y: 5.35,
    w: 5.15,
    h: 0.72,
    fill: { color: C.panel2 },
    line: { color: C.cyan, width: 1 },
  });
  capa.addText("CLAREZA QUE GERA RESULTADO", {
    x: 4.35,
    y: 5.58,
    w: 4.65,
    h: 0.22,
    fontFace: "Arial",
    fontSize: 13,
    bold: true,
    color: C.white,
    align: "center",
    margin: 0,
  });

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
  if (unicoMes)
    dash.addChart(
      pptx.ChartType.bar,
      [
        {
          name: "Composição",
          labels: ["Receita", "Custos", "Despesas", "Resultado"],
          values: [
            d.receita,
            -Math.abs(d.deducoesCustos),
            -Math.abs(d.despesas),
            d.resultadoLiquido,
          ],
        },
      ],
      {
        x: 0.88,
        y: 3.3,
        w: 7.55,
        h: 2.95,
        ...axis,
        showLegend: false,
        varyColors: true,
        chartColors: [C.lime, C.yellow, C.pink, C.green],
        showValue: true,
        dataLabelColor: C.white,
        dataLabelPosition: "outEnd",
        dataLabelFormatCode: "R$ #,##0;[Red]-R$ #,##0",
        showBorder: false,
      },
    );
  else
    dash.addChart(
      pptx.ChartType.bar,
      [
        {
          name: "Receita operacional",
          labels: d.evolucao.map((x) => x.mes),
          values: d.evolucao.map((x) => x.receita),
        },
        {
          name: "Resultado operacional",
          labels: d.evolucao.map((x) => x.mes),
          values: d.evolucao.map((x) => x.resultado),
        },
      ],
      {
        x: 0.88,
        y: 3.3,
        w: 7.55,
        h: 2.95,
        ...axis,
        showLegend: true,
        legendColor: C.white,
        legendFontSize: 9,
        legendPos: "b",
        chartColors: [C.lime, C.green],
        showValue: false,
        showBorder: false,
      },
    );
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
  if (d.impactosPositivos.length)
    impactos.addChart(
      pptx.ChartType.bar,
      [
        {
          name: "Impacto positivo",
          labels: d.impactosPositivos.map((x) => x.nome),
          values: d.impactosPositivos.map((x) => Math.abs(x.efeito)),
        },
      ],
      {
        x: 0.92,
        y: 2.05,
        w: 5.25,
        h: 4.45,
        ...axis,
        chartColors: [C.green],
        showLegend: false,
        showValue: true,
        dataLabelColor: C.white,
        dataLabelPosition: "outEnd",
        dataLabelFormatCode: "R$ #,##0",
        showBorder: false,
      },
    );
  else
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
  if (d.impactosNegativos.length)
    impactos.addChart(
      pptx.ChartType.bar,
      [
        {
          name: "Impacto negativo",
          labels: d.impactosNegativos.map((x) => x.nome),
          values: d.impactosNegativos.map((x) => Math.abs(x.efeito)),
        },
      ],
      {
        x: 7.07,
        y: 2.05,
        w: 5.25,
        h: 4.45,
        ...axis,
        chartColors: [C.pink],
        showLegend: false,
        showValue: true,
        dataLabelColor: C.white,
        dataLabelPosition: "outEnd",
        dataLabelFormatCode: "R$ #,##0",
        showBorder: false,
      },
    );
  else
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
