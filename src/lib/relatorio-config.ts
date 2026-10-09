export const graficosRelatorio = [
  { id: "receita_mensal", label: "Evolução da receita" },
  { id: "receitas_categoria", label: "Receitas por categoria" },
  { id: "custos_categoria", label: "Custos e despesas por categoria" },
  { id: "resultados", label: "Contas de resultado" },
  { id: "margem_meta", label: "Margem operacional x meta" },
  { id: "impactos", label: "Impactos do período" },
] as const;

export type GraficoRelatorioId = (typeof graficosRelatorio)[number]["id"];

export interface RelatorioPptxLayout {
  graficos: GraficoRelatorioId[];
}

export const layoutRelatorioPadrao: RelatorioPptxLayout = {
  graficos: ["receitas_categoria", "custos_categoria", "resultados", "margem_meta"],
};

export function tituloGraficoRelatorio(id: GraficoRelatorioId) {
  return graficosRelatorio.find((grafico) => grafico.id === id)?.label ?? "Análise financeira";
}

/**
 * Mantém o código contábil quando ele acompanha uma descrição, mas nunca
 * transforma o nome em número. Essa string é usada tanto na prévia quanto
 * nas formas de texto do PPTX.
 */
export function rotuloCategoriaRelatorio(nome: unknown) {
  const texto = String(nome ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return texto || "Categoria não identificada";
}
