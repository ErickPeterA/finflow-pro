import type {
  ImportarLinhasOptions,
  ImportarTitulosOptions,
  ResultadoImportacaoFinanceira,
} from "./types";

export async function importarLinhasFinanceiras({
  supabase,
  empresaId,
  linhas,
  mapeamentos,
  arquivoNome,
  origem = "manual",
  ignorarDuplicados = true,
  niboSyncRunId,
  periodoInicio,
  periodoFim,
}: ImportarLinhasOptions): Promise<ResultadoImportacaoFinanceira> {
  if (!empresaId) throw new Error("Selecione uma empresa.");
  if (!linhas.length) return { inseridos: 0, atualizados: 0, ignorados: 0 };

  const mapaCat = new Map(
    mapeamentos.map((m) => [String(m.categoria_nibo).toLowerCase(), m.categoria_id]),
  );

  let inseridos = 0;
  let atualizados = 0;
  let ignorados = 0;
  const hashesNoArquivo = new Set<string>();
  const grupos = new Map<string, { linhas: typeof linhas; duplicadosInternos: number }>();

  for (const linha of linhas) {
    const chave = `${linha.tipo}::${linha.competencia}`;
    const grupo = grupos.get(chave) ?? { linhas: [], duplicadosInternos: 0 };
    if (hashesNoArquivo.has(linha.hash)) {
      grupo.duplicadosInternos += 1;
      grupos.set(chave, grupo);
      continue;
    }
    hashesNoArquivo.add(linha.hash);
    grupo.linhas.push(linha);
    grupos.set(chave, grupo);
  }

  for (const [chave, grupo] of grupos) {
    const linhasTipo = grupo.linhas;
    if (!linhasTipo.length) continue;
    const [tipoImportacao, competencia] = chave.split("::") as [
      (typeof linhas)[number]["tipo"],
      string,
    ];

    const { data: imp, error: erroImp } = await supabase
      .from("importacoes")
      .insert({
        empresa_id: empresaId,
        tipo: tipoImportacao,
        competencia,
        arquivo_nome: arquivoNome,
        origem,
        nibo_sync_run_id: niboSyncRunId ?? null,
        periodo_inicio: periodoInicio ?? null,
        periodo_fim: periodoFim ?? null,
        total_registros: linhasTipo.length,
        valor_total: linhasTipo.reduce((s, l) => s + l.valor, 0),
        duplicados: grupo.duplicadosInternos,
        status: "processando",
      })
      .select("id")
      .single();
    if (erroImp) throw erroImp;

    const registros = linhasTipo.map((l) => ({
      empresa_id: empresaId,
      importacao_id: imp.id,
      tipo: l.tipo,
      data_efetiva: l.data_efetiva,
      competencia: l.competencia,
      descricao: l.descricao,
      categoria_nibo: l.categoria_nibo || null,
      categoria_id: mapaCat.get(l.categoria_nibo.toLowerCase()) ?? null,
      pessoa: l.pessoa || null,
      centro_custo: l.centro_custo || null,
      conta_bancaria: l.conta_bancaria || null,
      valor: l.valor,
      hash: l.hash,
      origem,
      external_source: l.external_source ?? (l.external_id ? "nibo" : null),
      external_id: l.external_id ?? null,
      source_content_hash: l.source_content_hash ?? null,
    }));

    let inseridosTipo = 0;
    let atualizadosTipo = 0;
    let ignoradosTipo = grupo.duplicadosInternos;
    const usarConflitoExterno =
      origem === "nibo_auto" && registros.every((registro) => registro.external_id);
    const idsExternosExistentes = new Set<string>();

    if (usarConflitoExterno) {
      const idsExternos = registros
        .map((registro) => registro.external_id)
        .filter((id): id is string => Boolean(id));

      for (let i = 0; i < idsExternos.length; i += 400) {
        const { data, error } = await supabase
          .from("lancamentos")
          .select("external_id")
          .eq("empresa_id", empresaId)
          .eq("external_source", "nibo")
          .in("external_id", idsExternos.slice(i, i + 400));
        if (error) throw error;
        data?.forEach((registro) => {
          if (registro.external_id) idsExternosExistentes.add(registro.external_id);
        });
      }
    }

    for (let i = 0; i < registros.length; i += 400) {
      const lote = registros.slice(i, i + 400);
      const { data, error } = await supabase
        .from("lancamentos")
        .upsert(lote, {
          onConflict: "empresa_id,hash",
          ignoreDuplicates: usarConflitoExterno ? false : ignorarDuplicados,
        })
        .select("id");
      if (error) throw error;

      if (usarConflitoExterno) {
        const atualizadosLote = lote.filter((registro) =>
          idsExternosExistentes.has(registro.external_id ?? ""),
        ).length;
        atualizadosTipo += atualizadosLote;
        inseridosTipo += lote.length - atualizadosLote;
      } else {
        inseridosTipo += data?.length ?? 0;
        ignoradosTipo += lote.length - (data?.length ?? 0);
      }
    }

    inseridos += inseridosTipo;
    atualizados += atualizadosTipo;
    ignorados += ignoradosTipo;

    await supabase
      .from("importacoes")
      .update({
        status: "concluida",
        total_registros: inseridosTipo,
        duplicados: ignoradosTipo,
      })
      .eq("id", imp.id);
  }

  return { inseridos, atualizados, ignorados };
}

export async function importarTitulosFinanceiros({
  supabase,
  empresaId,
  titulos,
  arquivoNome,
  origem = "manual",
  ignorarDuplicados = true,
  periodoInicio,
  periodoFim,
}: ImportarTitulosOptions): Promise<ResultadoImportacaoFinanceira> {
  if (!empresaId) throw new Error("Selecione uma empresa.");
  if (!titulos.length) return { inseridos: 0, atualizados: 0, ignorados: 0 };

  let inseridos = 0;
  let ignorados = 0;
  const hashesNoArquivo = new Set<string>();
  const grupos = new Map<string, { titulos: typeof titulos; duplicadosInternos: number }>();

  for (const titulo of titulos) {
    const chave = `${titulo.tipo}::${titulo.competencia}`;
    const grupo = grupos.get(chave) ?? { titulos: [], duplicadosInternos: 0 };
    if (hashesNoArquivo.has(titulo.hash)) {
      grupo.duplicadosInternos += 1;
      grupos.set(chave, grupo);
      continue;
    }
    hashesNoArquivo.add(titulo.hash);
    grupo.titulos.push(titulo);
    grupos.set(chave, grupo);
  }

  for (const [chave, grupo] of grupos) {
    const titulosTipo = grupo.titulos;
    if (!titulosTipo.length) continue;
    const [tipoImportacao, competencia] = chave.split("::") as [
      (typeof titulos)[number]["tipo"],
      string,
    ];

    const { data: imp, error: erroImp } = await supabase
      .from("importacoes")
      .insert({
        empresa_id: empresaId,
        tipo: tipoImportacao,
        competencia,
        arquivo_nome: arquivoNome,
        origem,
        periodo_inicio: periodoInicio ?? null,
        periodo_fim: periodoFim ?? null,
        total_registros: titulosTipo.length,
        valor_total: titulosTipo.reduce((s, titulo) => s + titulo.valor, 0),
        duplicados: grupo.duplicadosInternos,
        status: "processando_titulos",
      })
      .select("id")
      .single();
    if (erroImp) throw erroImp;

    const registros = titulosTipo.map((titulo) => ({
      empresa_id: empresaId,
      importacao_id: imp.id,
      tipo: titulo.tipo,
      vencimento: titulo.vencimento,
      data_projetada: titulo.data_projetada,
      competencia: titulo.competencia,
      descricao: titulo.descricao,
      categoria_nibo: titulo.categoria_nibo || null,
      pessoa: titulo.pessoa || null,
      centro_custo: titulo.centro_custo || null,
      valor: titulo.valor,
      status: titulo.status,
      hash: titulo.hash,
      external_source: titulo.external_source ?? (titulo.external_id ? "nibo" : null),
      external_id: titulo.external_id ?? null,
      source_content_hash: titulo.source_content_hash ?? null,
      payload: {},
    }));

    let inseridosTipo = 0;
    let ignoradosTipo = grupo.duplicadosInternos;

    for (let i = 0; i < registros.length; i += 400) {
      const lote = registros.slice(i, i + 400);
      const { data, error } = await supabase
        .from("fluxo_titulos_nibo")
        .upsert(lote, {
          onConflict: "empresa_id,hash",
          ignoreDuplicates: ignorarDuplicados,
        })
        .select("id");
      if (error) throw error;

      inseridosTipo += data?.length ?? 0;
      ignoradosTipo += lote.length - (data?.length ?? 0);
    }

    inseridos += inseridosTipo;
    ignorados += ignoradosTipo;

    await supabase
      .from("importacoes")
      .update({
        status: "concluida_titulos",
        total_registros: inseridosTipo,
        duplicados: ignoradosTipo,
      })
      .eq("id", imp.id);
  }

  return { inseridos, atualizados: 0, ignorados };
}
