import pptxgen from "pptxgenjs";
import JSZip from "jszip";

export interface SerieRelatorioPptx {
  mes: string; receita: number; resultado: number; resultadoBruto: number;
  resultadoLiquido: number; margem: number;
}
export interface CategoriaRelatorioPptx { nome: string; valor: number }
export interface ImpactoRelatorioPptx { nome: string; grupo: string; efeito: number }
export interface AcaoRelatorioPptx { acao: string; responsavel?: string | null; prazo?: string | null; status: string }
export interface RelatorioPptxDados {
  empresa: string; periodo: string; ano: number; receita: number; deducoesCustos: number;
  despesas: number; resultadoBruto: number; resultadoOperacional: number; resultadoLiquido: number;
  margemOperacional: number; margemDesejada: number; resumo: string[];
  alertas: Array<{ titulo: string; detalhe: string }>; evolucao: SerieRelatorioPptx[];
  receitasPorCategoria: CategoriaRelatorioPptx[]; custosPorCategoria: CategoriaRelatorioPptx[];
  impactosPositivos: ImpactoRelatorioPptx[]; impactosNegativos: ImpactoRelatorioPptx[];
  acoes: AcaoRelatorioPptx[];
}

const C = { navy: "032D63", blue: "075CB8", blue2: "0C74D9", panel: "084A91", panel2: "0A5AA6", cyan: "1CB5D9", green: "00A878", lime: "83C900", yellow: "F7C600", pink: "EF4770", white: "FFFFFF", muted: "FFFFFF", grid: "3772AA" };
const moeda = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

function base(slide: pptxgen.Slide, titulo: string, d: RelatorioPptxDados, numero: number) {
  slide.background = { color: C.navy };
  [[0, C.pink], [3.2, C.yellow], [6.4, C.green], [9.6, C.blue2]].forEach(([x, color], i) => slide.addShape("rect", { x: Number(x), y: 0, w: i === 3 ? 3.733 : 3.2, h: 0.1, fill: { color: String(color) }, line: { color: String(color) } }));
  slide.addText(titulo.toUpperCase(), { x: 0.62, y: 0.34, w: 8.4, h: 0.43, fontFace: "Arial", fontSize: 23, bold: true, color: C.white, margin: 0, fit: "shrink" });
  slide.addText(d.periodo, { x: 9.1, y: 0.41, w: 3.55, h: 0.22, fontFace: "Arial", fontSize: 10, color: C.muted, align: "right", margin: 0 });
  slide.addShape("line", { x: 0.62, y: 0.93, w: 12.05, h: 0, line: { color: C.grid, width: 1 } });
  slide.addText(String(numero).padStart(2, "0"), { x: 11.95, y: 7.14, w: 0.7, h: 0.2, fontFace: "Arial", fontSize: 9, bold: true, color: C.white, align: "right", margin: 0 });
}
function panel(slide: pptxgen.Slide, x: number, y: number, w: number, h: number, color = C.panel) {
  slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.06, fill: { color, transparency: 3 }, line: { color: C.grid, width: 1 } });
}
function kpi(slide: pptxgen.Slide, x: number, y: number, w: number, titulo: string, valor: string, cor: string, detalhe?: string) {
  panel(slide, x, y, w, 1.05, "063B77");
  slide.addShape("rect", { x, y, w: 0.07, h: 1.05, fill: { color: cor }, line: { color: cor } });
  slide.addText(titulo.toUpperCase(), { x: x + 0.2, y: y + 0.18, w: w - 0.35, h: 0.19, fontFace: "Arial", fontSize: 9, bold: true, color: C.muted, margin: 0, fit: "shrink" });
  slide.addText(valor, { x: x + 0.2, y: y + 0.45, w: w - 0.35, h: 0.34, fontFace: "Arial", fontSize: 18, bold: true, color: C.white, margin: 0, fit: "shrink" });
  if (detalhe) slide.addText(detalhe, { x: x + 0.2, y: y + 0.82, w: w - 0.35, h: 0.13, fontFace: "Arial", fontSize: 7.5, color: C.white, margin: 0, fit: "shrink" });
}
function tituloBloco(slide: pptxgen.Slide, texto: string, x: number, y: number, w: number) {
  slide.addText(texto.toUpperCase(), { x, y, w, h: 0.28, fontFace: "Arial", fontSize: 15, bold: true, color: C.white, margin: 0, fit: "shrink" });
  slide.addShape("line", { x, y: y + 0.36, w, h: 0, line: { color: C.yellow, width: 1.4 } });
}
const axis = { catAxisLabelColor: C.white, catAxisLabelFontSize: 10, valAxisLabelColor: C.white, valAxisLabelFontSize: 8, valGridLine: { color: C.grid, width: 1 } };

export async function gerarRelatorioPptx(d: RelatorioPptxDados) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE"; pptx.author = d.empresa; pptx.company = d.empresa;
  pptx.subject = `Relatório financeiro - ${d.empresa}`; pptx.title = `Relatório Financeiro ${d.periodo}`;

  const capa = pptx.addSlide(); capa.background = { color: C.navy };
  [[0, C.pink], [3.2, C.yellow], [6.4, C.green], [9.6, C.blue2]].forEach(([x, color], i) => capa.addShape("rect", { x: Number(x), y: 0, w: i === 3 ? 3.733 : 3.2, h: 0.12, fill: { color: String(color) }, line: { color: String(color) } }));
  capa.addText("RELATÓRIO FINANCEIRO", { x: 0.85, y: 1.15, w: 11.65, h: 0.75, fontFace: "Arial", fontSize: 40, bold: true, color: C.white, align: "center", margin: 0, fit: "shrink" });
  capa.addText(d.periodo, { x: 2.2, y: 2.05, w: 8.95, h: 0.48, fontFace: "Arial", fontSize: 23, bold: true, color: C.white, align: "center", margin: 0 });
  capa.addShape("line", { x: 4.2, y: 2.82, w: 4.95, h: 0, line: { color: C.cyan, width: 2 } });
  capa.addText(d.empresa, { x: 2.2, y: 3.2, w: 8.95, h: 0.55, fontFace: "Arial", fontSize: 27, bold: true, color: C.white, align: "center", margin: 0, fit: "shrink" });
  capa.addText("DADOS • ANÁLISE • DECISÃO", { x: 3.25, y: 4.1, w: 6.85, h: 0.32, fontFace: "Arial", fontSize: 14, bold: true, color: C.muted, charSpacing: 2.2, align: "center", margin: 0 });
  capa.addShape("roundRect", { x: 4.1, y: 5.35, w: 5.15, h: 0.72, fill: { color: C.panel2 }, line: { color: C.cyan, width: 1 } });
  capa.addText("CLAREZA QUE GERA RESULTADO", { x: 4.35, y: 5.58, w: 4.65, h: 0.22, fontFace: "Arial", fontSize: 13, bold: true, color: C.white, align: "center", margin: 0 });

  const dash = pptx.addSlide(); base(dash, "Dashboard financeiro", d, 2);
  kpi(dash, 0.62, 1.18, 2.92, "Receita operacional", moeda(d.receita), C.lime);
  kpi(dash, 3.68, 1.18, 2.92, "Custos operacionais", moeda(-Math.abs(d.deducoesCustos)), C.pink);
  kpi(dash, 6.74, 1.18, 2.92, "Despesas operacionais", moeda(-Math.abs(d.despesas)), C.yellow);
  kpi(dash, 9.8, 1.18, 2.87, "Resultado líquido", moeda(d.resultadoLiquido), d.resultadoLiquido >= 0 ? C.green : C.pink);
  const unicoMes = d.evolucao.length <= 1;
  panel(dash, 0.62, 2.52, 8.05, 4.2); tituloBloco(dash, unicoMes ? "Composição do mês" : "Evolução mensal", 0.92, 2.82, 7.45);
  if (unicoMes) dash.addChart(pptx.ChartType.bar, [{
    name: "Composição", labels: ["Receita", "Custos", "Despesas", "Resultado"],
    values: [d.receita, -Math.abs(d.deducoesCustos), -Math.abs(d.despesas), d.resultadoLiquido],
  }], { x: 0.88, y: 3.3, w: 7.55, h: 2.95, ...axis, showLegend: false, varyColors: true, chartColors: [C.lime, C.yellow, C.pink, C.green], showValue: true, dataLabelColor: C.white, dataLabelPosition: "outEnd", dataLabelFormatCode: "R$ #,##0;[Red]-R$ #,##0", showBorder: false });
  else dash.addChart(pptx.ChartType.bar, [
    { name: "Receita operacional", labels: d.evolucao.map(x => x.mes), values: d.evolucao.map(x => x.receita) },
    { name: "Resultado operacional", labels: d.evolucao.map(x => x.mes), values: d.evolucao.map(x => x.resultado) },
  ], { x: 0.88, y: 3.3, w: 7.55, h: 2.95, ...axis, showLegend: true, legendColor: C.white, legendFontSize: 9, legendPos: "b", chartColors: [C.lime, C.green], showValue: false, showBorder: false });
  panel(dash, 8.92, 2.52, 3.75, 4.2, "063B77"); tituloBloco(dash, "Leitura executiva", 9.22, 2.82, 3.15);
  dash.addText(d.resumo.map(x => `• ${x}`).join("\n\n"), { x: 9.22, y: 3.35, w: 3.15, h: 2.45, fontFace: "Arial", fontSize: 11.5, color: C.white, margin: 0.02, fit: "shrink", valign: "top" });
  dash.addShape("roundRect", { x: 9.22, y: 5.98, w: 3.15, h: 0.48, fill: { color: d.margemOperacional >= d.margemDesejada ? C.green : C.pink }, line: { color: d.margemOperacional >= d.margemDesejada ? C.green : C.pink } });
  dash.addText(`Margem ${pct(d.margemOperacional)}  •  Meta ${pct(d.margemDesejada)}`, { x: 9.35, y: 6.14, w: 2.88, h: 0.16, fontFace: "Arial", fontSize: 10, bold: true, color: C.white, align: "center", margin: 0, fit: "shrink" });

  const receita = pptx.addSlide(); base(receita, "Receita operacional", d, 3);
  panel(receita, 0.62, 1.18, 7.55, 5.85); tituloBloco(receita, "Receita mensal", 0.92, 1.52, 6.95);
  const receitas = d.receitasPorCategoria.slice(0, 6);
  if (d.evolucao.length > 1) receita.addChart(pptx.ChartType.bar, [{ name: "Receita", labels: d.evolucao.map(x => x.mes), values: d.evolucao.map(x => x.receita) }], { x: 0.9, y: 2.05, w: 6.95, h: 4.35, ...axis, chartColors: [C.lime], showLegend: false, showValue: true, dataLabelColor: C.white, dataLabelPosition: "outEnd", dataLabelFormatCode: "R$ #,##0", showBorder: false });
  else if (receitas.length) receita.addChart(pptx.ChartType.bar, [{ name: "Receita por categoria", labels: receitas.map(x => x.nome), values: receitas.map(x => Math.abs(x.valor)) }], { x: 0.9, y: 2.05, w: 6.95, h: 4.35, ...axis, chartColors: [C.lime, C.green, C.yellow, C.cyan, C.pink, C.blue2], varyColors: true, showLegend: false, showValue: true, dataLabelColor: C.white, dataLabelPosition: "outEnd", dataLabelFormatCode: "R$ #,##0", showBorder: false });
  else receita.addText("Sem categorias de receita no período selecionado.", { x: 1.0, y: 3.55, w: 6.7, h: 0.4, fontFace: "Arial", fontSize: 15, color: C.white, align: "center", margin: 0 });
  panel(receita, 8.42, 1.18, 4.25, 3.6, "063B77"); tituloBloco(receita, "Receita por categoria", 8.72, 1.52, 3.65);
  if (receitas.length) receita.addChart(pptx.ChartType.doughnut, [{ name: "Receitas", labels: receitas.map(x => x.nome), values: receitas.map(x => Math.abs(x.valor)) }], { x: 8.65, y: 1.95, w: 3.75, h: 2.45, holeSize: 58, showLegend: true, legendColor: C.white, legendFontSize: 8, legendPos: "b", chartColors: [C.green, C.lime, C.cyan, C.yellow, C.pink, C.blue2], showPercent: true, dataLabelColor: C.white, showBorder: false });
  panel(receita, 8.42, 5.02, 4.25, 2.01, "07529A"); receita.addText("DESTAQUE DO PERÍODO", { x: 8.75, y: 5.32, w: 3.6, h: 0.23, fontFace: "Arial", fontSize: 11, bold: true, color: C.white, margin: 0 });
  const pico = [...d.evolucao].sort((a, b) => b.receita - a.receita)[0];
  receita.addText(pico ? `${pico.mes} registrou a maior receita do período: ${moeda(pico.receita)}.` : "Sem série mensal disponível.", { x: 8.75, y: 5.72, w: 3.55, h: 0.65, fontFace: "Arial", fontSize: 15, bold: true, color: C.white, margin: 0, fit: "shrink" });

  const custos = pptx.addSlide(); base(custos, "Custos e despesas operacionais", d, 4);
  kpi(custos, 0.62, 1.18, 3.65, "Deduções + custos", moeda(-Math.abs(d.deducoesCustos)), C.pink, `${pct((d.deducoesCustos / Math.max(d.receita, 1)) * 100)} da receita`);
  kpi(custos, 4.45, 1.18, 3.65, "Despesas operacionais", moeda(-Math.abs(d.despesas)), C.yellow, `${pct((d.despesas / Math.max(d.receita, 1)) * 100)} da receita`);
  kpi(custos, 8.28, 1.18, 4.39, "Saídas operacionais", moeda(-(Math.abs(d.deducoesCustos) + Math.abs(d.despesas))), C.cyan);
  panel(custos, 0.62, 2.52, 8.15, 4.35); tituloBloco(custos, "Principais categorias", 0.92, 2.84, 7.55);
  const cats = d.custosPorCategoria.slice(0, 7);
  if (cats.length) custos.addChart(pptx.ChartType.bar, [{ name: "Custos e despesas", labels: cats.map(x => x.nome), values: cats.map(x => Math.abs(x.valor)) }], { x: 0.95, y: 3.3, w: 7.45, h: 3.15, ...axis, chartColors: [C.pink], showLegend: false, showValue: true, dataLabelColor: C.white, dataLabelPosition: "outEnd", dataLabelFormatCode: "R$ #,##0", showBorder: false });
  panel(custos, 9.02, 2.52, 3.65, 4.35, "063B77"); tituloBloco(custos, "Concentração", 9.32, 2.84, 3.05);
  const totalCustos = cats.reduce((s, x) => s + Math.abs(x.valor), 0);
  custos.addText(cats.slice(0, 5).map((x, i) => `${i + 1}. ${x.nome}\n${moeda(x.valor)} • ${pct((Math.abs(x.valor) / Math.max(totalCustos, 1)) * 100)}`).join("\n\n"), { x: 9.32, y: 3.38, w: 3.0, h: 2.95, fontFace: "Arial", fontSize: 11, color: C.white, margin: 0, fit: "shrink" });

  const resultados = pptx.addSlide(); base(resultados, "Contas de resultado", d, 5);
  panel(resultados, 0.62, 1.18, 12.05, 4.45); tituloBloco(resultados, "Resultado bruto • operacional • líquido", 0.92, 1.5, 11.45);
  if (d.evolucao.length > 1) resultados.addChart(pptx.ChartType.bar, [
    { name: "Resultado bruto", labels: d.evolucao.map(x => x.mes), values: d.evolucao.map(x => x.resultadoBruto) },
    { name: "Resultado operacional", labels: d.evolucao.map(x => x.mes), values: d.evolucao.map(x => x.resultado) },
    { name: "Resultado líquido", labels: d.evolucao.map(x => x.mes), values: d.evolucao.map(x => x.resultadoLiquido) },
  ], { x: 0.92, y: 1.98, w: 11.45, h: 3.25, ...axis, chartColors: [C.green, C.cyan, C.yellow], showLegend: true, legendColor: C.white, legendFontSize: 9, legendPos: "b", showValue: false, showBorder: false });
  else resultados.addChart(pptx.ChartType.bar, [{ name: "Resultado", labels: ["Resultado bruto", "Resultado operacional", "Resultado líquido"], values: [d.resultadoBruto, d.resultadoOperacional, d.resultadoLiquido] }], { x: 0.92, y: 1.98, w: 11.45, h: 3.25, ...axis, chartColors: [C.green, C.cyan, C.yellow], varyColors: true, showLegend: false, showValue: true, dataLabelColor: C.white, dataLabelPosition: "outEnd", dataLabelFormatCode: "R$ #,##0;[Red]-R$ #,##0", showBorder: false });
  kpi(resultados, 0.62, 5.88, 3.82, "Resultado bruto", moeda(d.resultadoBruto), d.resultadoBruto >= 0 ? C.green : C.pink);
  kpi(resultados, 4.75, 5.88, 3.82, "Resultado operacional", moeda(d.resultadoOperacional), d.resultadoOperacional >= 0 ? C.cyan : C.pink);
  kpi(resultados, 8.88, 5.88, 3.79, "Resultado líquido", moeda(d.resultadoLiquido), d.resultadoLiquido >= 0 ? C.yellow : C.pink);

  const dre = pptx.addSlide(); base(dre, "DRE e eficiência operacional", d, 6);
  panel(dre, 0.62, 1.18, 7.55, 5.75); tituloBloco(dre, "Margem operacional x meta", 0.92, 1.52, 6.95);
  if (d.evolucao.length > 1) dre.addChart(pptx.ChartType.line, [
    { name: "Margem operacional", labels: d.evolucao.map(x => x.mes), values: d.evolucao.map(x => x.margem) },
    { name: "Meta", labels: d.evolucao.map(x => x.mes), values: d.evolucao.map(() => d.margemDesejada) },
  ], { x: 0.95, y: 2.05, w: 6.9, h: 4.2, ...axis, valAxisLabelFormatCode: "0.0", chartColors: [C.yellow, C.pink], showLegend: true, legendColor: C.white, legendFontSize: 9, legendPos: "b", lineSize: 3, showMarker: true, markerSize: 6, showBorder: false });
  else dre.addChart(pptx.ChartType.bar, [{ name: "Margem", labels: ["Margem atual", "Meta"], values: [d.margemOperacional, d.margemDesejada] }], { x: 0.95, y: 2.05, w: 6.9, h: 4.2, ...axis, valAxisLabelFormatCode: "0.0", chartColors: [d.margemOperacional >= d.margemDesejada ? C.green : C.pink, C.yellow], varyColors: true, showLegend: false, showValue: true, dataLabelColor: C.white, dataLabelPosition: "outEnd", dataLabelFormatCode: "0.0%", showBorder: false });
  panel(dre, 8.42, 1.18, 4.25, 5.75, "063B77"); tituloBloco(dre, "DRE resumido", 8.72, 1.52, 3.65);
  const linhas: Array<[string, number, boolean]> = [["Receita operacional", d.receita, true], ["(-) Deduções e custos", -Math.abs(d.deducoesCustos), false], ["= Resultado bruto", d.resultadoBruto, true], ["(-) Despesas operacionais", -Math.abs(d.despesas), false], ["= Resultado operacional", d.resultadoOperacional, true], ["= Resultado líquido", d.resultadoLiquido, true]];
  linhas.forEach(([rotulo, valor, destaque], i) => { const y = 2.18 + i * 0.66; if (destaque) dre.addShape("rect", { x: 8.68, y: y - 0.08, w: 3.75, h: 0.47, fill: { color: "07529A" }, line: { color: "07529A" } }); dre.addText(rotulo, { x: 8.82, y, w: 2.15, h: 0.19, fontFace: "Arial", fontSize: 9.5, bold: destaque, color: C.white, margin: 0, fit: "shrink" }); dre.addText(moeda(valor), { x: 10.98, y, w: 1.3, h: 0.19, fontFace: "Arial", fontSize: 9.5, bold: destaque, color: C.white, align: "right", margin: 0, fit: "shrink" }); dre.addText(pct((valor / Math.max(d.receita, 1)) * 100), { x: 11.38, y: y + 0.23, w: 0.9, h: 0.13, fontFace: "Arial", fontSize: 7.5, color: C.white, align: "right", margin: 0 }); });

  const analise = pptx.addSlide(); base(analise, "Análise financeira", d, 7);
  panel(analise, 0.62, 1.18, 7.65, 5.85, "063B77"); tituloBloco(analise, "Diagnóstico do período", 0.92, 1.52, 7.05);
  const alertas = d.alertas.slice(0, 5);
  alertas.forEach((a, i) => {
    const y = 2.03 + i * 0.9;
    analise.addShape("roundRect", { x: 0.92, y, w: 7.05, h: 0.7, fill: { color: i % 2 ? "07529A" : C.panel }, line: { color: C.grid, width: 0.8 } });
    analise.addShape("ellipse", { x: 1.1, y: y + 0.18, w: 0.32, h: 0.32, fill: { color: i === 0 ? C.pink : C.yellow }, line: { color: i === 0 ? C.pink : C.yellow } });
    analise.addText(a.titulo, { x: 1.58, y: y + 0.11, w: 2.15, h: 0.2, fontFace: "Arial", fontSize: 10.5, bold: true, color: C.white, margin: 0, fit: "shrink" });
    analise.addText(a.detalhe, { x: 3.72, y: y + 0.1, w: 3.95, h: 0.42, fontFace: "Arial", fontSize: 9.4, color: C.white, margin: 0, fit: "shrink", valign: "mid" });
  });
  if (!alertas.length) analise.addText("Nenhum alerta relevante no período selecionado.", { x: 1.05, y: 3.65, w: 6.8, h: 0.4, fontFace: "Arial", fontSize: 15, color: C.white, align: "center", margin: 0 });
  panel(analise, 8.52, 1.18, 4.15, 5.85); tituloBloco(analise, "Síntese executiva", 8.82, 1.52, 3.55);
  analise.addText(d.resumo.map(x => `• ${x}`).join("\n\n"), { x: 8.82, y: 2.08, w: 3.55, h: 3.38, fontFace: "Arial", fontSize: 12, color: C.white, margin: 0, fit: "shrink", valign: "top" });
  analise.addShape("roundRect", { x: 8.82, y: 5.72, w: 3.55, h: 0.72, fill: { color: d.resultadoLiquido >= 0 ? C.green : C.pink }, line: { color: d.resultadoLiquido >= 0 ? C.green : C.pink } });
  analise.addText(`RESULTADO LÍQUIDO\n${moeda(d.resultadoLiquido)}`, { x: 9.02, y: 5.87, w: 3.15, h: 0.38, fontFace: "Arial", fontSize: 12, bold: true, color: C.white, align: "center", margin: 0, fit: "shrink" });

  const impactos = pptx.addSlide(); base(impactos, "Impactos do período", d, 8);
  panel(impactos, 0.62, 1.18, 5.9, 5.85, "063B77"); tituloBloco(impactos, "Melhoraram o resultado", 0.92, 1.52, 5.3);
  if (d.impactosPositivos.length) impactos.addChart(pptx.ChartType.bar, [{ name: "Impacto positivo", labels: d.impactosPositivos.map(x => x.nome), values: d.impactosPositivos.map(x => Math.abs(x.efeito)) }], { x: 0.92, y: 2.05, w: 5.25, h: 4.45, ...axis, chartColors: [C.green], showLegend: false, showValue: true, dataLabelColor: C.white, dataLabelPosition: "outEnd", dataLabelFormatCode: "R$ #,##0", showBorder: false });
  else impactos.addText("Nenhum impacto positivo relevante no período.", { x: 1.05, y: 3.65, w: 5.0, h: 0.4, fontFace: "Arial", fontSize: 14, color: C.white, align: "center", margin: 0 });
  panel(impactos, 6.77, 1.18, 5.9, 5.85); tituloBloco(impactos, "Pressionaram o resultado", 7.07, 1.52, 5.3);
  if (d.impactosNegativos.length) impactos.addChart(pptx.ChartType.bar, [{ name: "Impacto negativo", labels: d.impactosNegativos.map(x => x.nome), values: d.impactosNegativos.map(x => Math.abs(x.efeito)) }], { x: 7.07, y: 2.05, w: 5.25, h: 4.45, ...axis, chartColors: [C.pink], showLegend: false, showValue: true, dataLabelColor: C.white, dataLabelPosition: "outEnd", dataLabelFormatCode: "R$ #,##0", showBorder: false });
  else impactos.addText("Nenhum impacto negativo relevante no período.", { x: 7.2, y: 3.65, w: 5.0, h: 0.4, fontFace: "Arial", fontSize: 14, color: C.white, align: "center", margin: 0 });

  const plano = pptx.addSlide(); base(plano, "Plano de ação", d, 9);
  plano.addText("PRÓXIMOS PASSOS PRIORITÁRIOS", { x: 0.7, y: 1.25, w: 5.2, h: 0.3, fontFace: "Arial", fontSize: 15, bold: true, color: C.white, margin: 0 });
  const rows: pptxgen.TableRow[] = [[{ text: "AÇÃO", options: { bold: true, color: C.white, fill: C.panel2 } }, { text: "RESPONSÁVEL", options: { bold: true, color: C.white, fill: C.panel2 } }, { text: "PRAZO", options: { bold: true, color: C.white, fill: C.panel2 } }, { text: "STATUS", options: { bold: true, color: C.white, fill: C.panel2 } }], ...d.acoes.slice(0, 8).map(a => [a.acao, a.responsavel || "—", a.prazo || "—", a.status])];
  plano.addTable(rows, { x: 0.7, y: 1.82, w: 11.95, h: 4.75, colW: [6.0, 2.15, 1.55, 2.25], border: { type: "solid", color: C.grid, pt: 1 }, fill: C.panel, color: C.white, fontFace: "Arial", fontSize: 11, margin: 0.1, valign: "mid", rowH: 0.58, autoFit: false, breakLine: false });
  if (!d.acoes.length) plano.addText("Nenhuma ação em aberto para o período selecionado.", { x: 1, y: 3.5, w: 11.3, h: 0.5, align: "center", fontFace: "Arial", fontSize: 18, color: C.muted });

  const slug = d.empresa.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  const nomeArquivo = `relatorio-financeiro-${slug}-${d.ano}.pptx`;
  const conteudo = await pptx.write({ outputType: "blob", compression: true }) as Blob;
  const zip = await JSZip.loadAsync(conteudo);
  const graficos = Object.keys(zip.files).filter((nome) => /^ppt\/charts\/chart\d+\.xml$/.test(nome));
  await Promise.all(graficos.map(async (nome) => {
    const arquivo = zip.file(nome);
    if (!arquivo) return;
    const xml = await arquivo.async("string");
    const branco = xml
      .replace(/<a:srgbClr val="000000"\/>/g, '<a:srgbClr val="FFFFFF"/>')
      .replace(/<a:schemeClr val="(?:tx1|dk1)"\/>/g, '<a:srgbClr val="FFFFFF"/>')
      .replace(/<a:sysClr val="windowText" lastClr="000000"\/>/g, '<a:srgbClr val="FFFFFF"/>');
    zip.file(nome, branco);
  }));
  const arquivoFinal = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 }, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
  const url = URL.createObjectURL(arquivoFinal);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
