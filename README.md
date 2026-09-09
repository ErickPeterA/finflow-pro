# **FinFlow Pro**

Desenvolvimento de Ecossistema Financeiro para BPO

Objetivo do sistema

Desenvolver uma plataforma web para gestão financeira e apresentação de resultados dos clientes de BPO Financeiro.

Atualmente, os dados são exportados do NIBO e tratados manualmente em planilhas para formação de um DRE Gerencial por Regime de Caixa. Depois, são produzidos gráficos, análises e relatórios em outras ferramentas.

O objetivo da plataforma é centralizar todo esse processo em um único ambiente:

Importação dos relatórios do NIBO → Conferência → Classificação → DRE Gerencial → Análises → Plano de Ação → Relatório do Cliente

A plataforma deve atender múltiplas empresas, mantendo dados, plano de contas, configurações, análises e relatórios separados para cada cliente.

1. Fonte dos dados

A única fonte de dados financeiros da plataforma serão os relatórios exportados do NIBO:

 Contas pagas;

 Contas recebidas.

Inicialmente, não haverá integração direta com API.

A alimentação será feita por upload de arquivos em Excel ou CSV.

Todas as demais informações, indicadores, médias, comparativos, gráficos, textos automáticos e análises deverão ser calculados pela própria plataforma.

Metas, regras, classificações, comentários e planos de ação serão cadastrados diretamente na interface.

2. Estrutura geral do sistema

Utilizar um menu lateral fixo com as seguintes opções:

 Home;

 Importação NIBO;

 DRE Gerencial;

 Receitas;

 Custos;

 Despesas;

 Análises;

 Ponto de Equilíbrio;

 Plano de Ação;

 Relatórios;

 Configurações.

O item selecionado deve ficar destacado no menu.

Na parte superior das telas, manter:

 Nome da empresa selecionada;

 Mês ou período selecionado;

 Filtros;

 Busca;

 Ações específicas de cada tela.

3. Home

A Home deve ser uma visão executiva, clara e simples para o cliente final.

Não deve apresentar excesso de informações técnicas.

Cards superiores

Exibir somente os seguintes indicadores:

 Receita do mês;

 Resultado Bruto;

 Resultado Operacional;

 Resultado Operacional + Financeiro;

 Resultado Líquido.

Cada card deve apresentar:

 Valor do período;

 Variação percentual;

 Comparação com o mês anterior;

 Sinalização positiva, negativa ou de atenção.

Não incluir na Home:

 Contas a pagar;

 Contas a receber;

 Ponto de equilíbrio;

 Médias detalhadas;

 Plano de ação;

 Lista de funcionalidades do sistema.

Formação do resultado

Apresentar de forma sequencial e didática:

Receita do mês – Deduções = Receita Líquida – Custos = Resultado Bruto – Despesas = Resultado Operacional + Resultado Financeiro = Resultado Líquido

Utilizar blocos conectados, valores, sinais matemáticos e cores.

Não utilizar gráfico de cascata tradicional, pois pode dificultar a compreensão do cliente.

Visão geral do mês

Exibir um gráfico simples comparando:

 Receita Líquida;

 Custos;

 Despesas;

 Margem Operacional.

Principais impactos do mês

Esse bloco deve possuir bastante destaque na Home.

Separar os fatores em:

Impactos positivos

Exemplos:

 Aumento da receita;

 Redução de custos;

 Crescimento de determinada categoria;

 Receitas financeiras.

Impactos negativos

Exemplos:

 Aumento de custo com pessoal;

 Crescimento de despesas administrativas;

 Queda de determinada receita;

 Gastos não recorrentes.

Exibir:

 Nome do impacto;

 Valor positivo ou negativo;

 Ranking;

 Impacto líquido no resultado operacional;

 Percentual da variação explicado pelos fatores.

Análises automáticas

Criar um painel com alertas curtos, como:

 Categoria acima da média;

 Maior impacto no resultado;

 Variação em relação ao mês anterior;

 Receita abaixo do esperado;

 Resultado operacional negativo;

 Resultado líquido sustentado por aporte ou empréstimo.

Qualidade do resultado

Apresentar classificações como:

 Saudável;

 Atenção;

 Crítico;

 Extraordinário.

O sistema deve diferenciar claramente:

 Resultado gerado pela operação;

 Resultado financeiro;

 Aportes;

 Empréstimos;

 Entradas extraordinárias.

4. Importação NIBO

Criar uma tela específica para importar os relatórios.

Fluxo

 Selecionar a empresa;

 Selecionar o tipo do relatório;

 Selecionar o período;

 Fazer upload do arquivo;

 Validar a estrutura;

 Exibir uma prévia;

 Apontar erros;

 Confirmar a importação.

Funcionalidades

 Importar XLSX e CSV;

 Identificar contas pagas e recebidas;

 Ler datas, valores, categorias, descrições, pessoas, centros de custo e contas bancárias;

 Validar colunas obrigatórias;

 Mostrar quantidade de registros;

 Mostrar valor total importado;

 Identificar duplicidades;

 Bloquear nova importação do mesmo lançamento;

 Permitir excluir lote antes do fechamento;

 Manter histórico das importações;

 Armazenar o arquivo original;

 Mostrar lançamentos não classificados.

5. DRE Gerencial

A tela de DRE deve ser a principal tela técnica da plataforma.

O foco deve estar na tabela completa, e não em cards ou gráficos repetidos da Home.

Estrutura da tela

Não repetir na parte superior:

 Cards de Receita;

 Resultado Bruto;

 Resultado Operacional;

 Resultado Líquido;

 Formação do resultado.

Essas informações já existem na Home.

Utilizar apenas controles compactos no topo:

 Empresa;

 Período;

 Busca;

 Filtros;

 Mostrar categorias;

 Expandir tudo;

 Recolher tudo;

 Exportar PDF;

 Exportar Excel.

Tabela do DRE

A tabela deve ocupar a maior parte da tela.

Exibir colunas como:

 Descrição;

 Janeiro;

 Fevereiro;

 Março;

 Demais meses;

 Acumulado;

 Média;

 Variação versus mês anterior;

 Variação versus mesmo período do ano anterior.

A estrutura deverá ser expansível.

Exemplos de agrupadoras

 Receita Operacional;

 Deduções;

 Custos;

 Despesas;

 Financeiro.

Ao expandir uma agrupadora, mostrar suas categorias.

Exemplo:

Receita Operacional

 Vendas;

 Serviços;

 Comissões;

 Outras Receitas.

Custos

 Custos Diretos;

 Custos Indiretos;

 Custos com Pessoal;

 Marketing;

 Comissionamento;

 Outros Custos.

Despesas

 Despesas Administrativas;

 Serviços Terceirizados;

 Softwares;

 Aluguel;

 Outras Despesas.

As categorias também poderão ser expansíveis para exibir contas mais detalhadas.

Linhas de resultado

Dar destaque visual para:

 Receita Líquida;

 Resultado Bruto;

 Resultado Operacional;

 Resultado Operacional + Financeiro;

 Resultado Líquido;

 Margem Líquida.

Painel lateral do DRE

Manter um painel de análise menor na lateral direita.

Incluir:

Gráfico 1

Evolução do Resultado Operacional

 Valores por mês;

 Margem Operacional;

 Comparação temporal.

Gráfico 2

Evolução do Resultado Líquido

 Valores por mês;

 Margem Líquida;

 Comparação temporal.

Principais insights

Exemplos:

 Resultado operacional cresceu em relação ao mês anterior;

 Resultado líquido acima da média;

 Despesas aumentaram;

 Receita líquida cresceu;

 Margem reduziu.

Card complementar

 Margem Operacional;

 Comparação com o mês anterior;

 Pequeno gráfico de tendência.

Não apresentar Ponto de Equilíbrio na tela de DRE, pois ele terá uma tela exclusiva.

6. Receitas

Criar uma tela exclusiva para análise das receitas.

Cards

 Receita do mês;

 Receita acumulada;

 Média do ano;

 Receita versus meta;

 Crescimento mensal.

Gráficos e análises

 Evolução mensal das receitas;

 Receita Bruta;

 Deduções;

 Receita Líquida;

 Distribuição por agrupadora;

 Distribuição por categoria;

 Principais fontes de receita;

 Participação percentual;

 Crescimento ou queda;

 Comparação com mês anterior;

 Comparação com média;

 Comparação com meta.

As médias devem aparecer dentro das análises específicas, sem ocupar um bloco principal excessivamente grande.

Tabela

Exibir:

 Categoria;

 Valor do mês;

 Participação;

 Média;

 Variação versus mês anterior;

 Variação versus média;

 Variação versus meta.

Ao clicar em uma categoria, abrir os lançamentos do NIBO que formaram aquele valor.

7. Custos

Criar uma tela exclusiva para custos.

Cards

 Custos do mês;

 Custos acumulados;

 Custos como percentual da receita;

 Média do ano;

 Variação mensal.

Análises

 Evolução mensal dos custos;

 Custos Diretos;

 Custos Indiretos;

 Custos com Pessoal;

 Marketing;

 Comissionamento;

 Outros Custos;

 Composição percentual;

 Impacto sobre a margem;

 Comparação com média;

 Comparação com orçamento ou meta;

 Principais aumentos;

 Principais reduções.

Principais impactos

Separar:

 Impactos positivos;

 Impactos negativos.

Tabela

Exibir:

 Categoria;

 Valor;

 Percentual da receita;

 Média;

 Variação;

 Status.

Status sugeridos:

 Bom;

 Atenção;

 Crítico.

8. Despesas

Criar uma tela exclusiva para despesas operacionais.

Cards

 Despesas do mês;

 Despesas acumuladas;

 Percentual da receita;

 Média do ano;

 Variação mensal.

Análises

 Evolução das despesas;

 Despesas fixas versus variáveis;

 Despesas recorrentes versus não recorrentes;

 Principais despesas;

 Ranking por categoria;

 Tendência;

 Comparação com média;

 Comparação com mês anterior.

Tabela

Exibir:

 Categoria;

 Valor;

 Participação;

 Média;

 Variação;

 Tendência.

Não repetir nessa tela o mesmo bloco de visão geral existente na Home, quando ele não agregar uma nova leitura.

9. Análises

Criar uma central específica para análises mais detalhadas.

Essa tela poderá concentrar:

 Comparativos mensais;

 Comparativos trimestrais;

 Comparativos semestrais;

 Médias;

 Tendências;

 Sazonalidade;

 Realizado versus meta;

 Realizado versus orçamento;

 Categorias com maiores variações;

 Categorias acima ou abaixo da média;

 Itens não recorrentes;

 Evolução de margens;

 Análise acumulada do ano.

As médias não devem ficar em destaque excessivo na Home. Devem aparecer principalmente nessa tela ou ao analisar uma categoria específica.

10. Ponto de Equilíbrio

Criar uma tela exclusiva.

Informações

 Receita líquida;

 Custos e despesas fixas;

 Custos e despesas variáveis;

 Margem de contribuição;

 Margem de contribuição percentual;

 Ponto de equilíbrio;

 Receita realizada;

 Valor acima ou abaixo do ponto de equilíbrio;

 Percentual de atingimento;

 Margem de segurança;

 Meta mensal;

 Meta diária;

 Meta semanal.

Referências

Permitir calcular o ponto de equilíbrio com base em:

 Média do 1º trimestre;

 Média do 2º trimestre;

 Média do 1º semestre;

 Média do 3º trimestre;

 Média do 4º trimestre;

 Média do 2º semestre;

 Média anual;

 Período personalizado.

Simulação

Permitir alterar valores de forma simulada:

 Receita projetada;

 Custos fixos;

 Custos variáveis;

 Margem desejada.

A simulação não deve alterar os dados realizados.

11. Plano de Ação

Criar uma tela exclusiva para acompanhamento das ações.

Não apresentar o plano de ação na Home.

Campos

 Categoria;

 Problema identificado;

 Ação;

 Responsável;

 Prazo;

 Prioridade;

 Status;

 Resultado esperado;

 Comentários;

 Evidências;

 Data de conclusão;

 Período de origem.

Status

 Pendente;

 Em andamento;

 Aguardando cliente;

 Atrasado;

 Concluído;

 Cancelado.

Uma análise ou alerta do sistema deverá permitir gerar uma ação diretamente.

12. Relatórios

Criar um módulo para geração do relatório mensal do cliente.

O relatório deverá substituir a montagem manual em outras ferramentas.

Estrutura possível

 Capa;

 Resumo executivo;

 Principais indicadores;

 Formação do resultado;

 Receita;

 Custos;

 Despesas;

 Resultado Operacional;

 Resultado Líquido;

 Principais impactos;

 Análise do consultor;

 Ponto de equilíbrio;

 Plano de ação;

 DRE completa.

Funcionalidades

 Selecionar blocos;

 Editar textos;

 Inserir comentários;

 Gerar PDF;

 Salvar versão;

 Manter histórico;

 Utilizar identidade visual da VG e do cliente.

13. Configurações

Criar configurações por cliente e configurações gerais.

Por cliente

 Plano de contas;

 Estrutura da DRE;

 Mapeamento das categorias do NIBO;

 Classificação fixa ou variável;

 Conta recorrente ou não recorrente;

 Metas;

 Orçamentos;

 Margem desejada;

 Limites de atenção;

 Regras de análise;

 Identidade visual;

 Usuários;

 Permissões.

Gerais

 Plano de contas padrão;

 Modelo padrão de DRE;

 Modelos de análise;

 Template de relatório;

 Perfis de acesso;

 Regras padrão de cálculo.

14. Regras de cálculo

O DRE principal será por Regime de Caixa.

Utilizar:

 Data efetiva de recebimento para receitas;

 Data efetiva de pagamento para custos e despesas.

Calcular:

 Receita Bruta;

 Deduções;

 Receita Líquida;

 Custos;

 Resultado Bruto;

 Despesas;

 Resultado Operacional;

 Resultado Financeiro;

 Resultado Operacional + Financeiro;

 Resultado Líquido;

 Margem Bruta;

 Margem Operacional;

 Margem Líquida.

Períodos

 Mensal;

 Acumulado;

 Média dos meses fechados;

 Trimestral;

 Semestral;

 Anual.

As médias devem considerar somente meses efetivamente fechados.

Meses futuros não devem ser considerados como zero.

15. Tratamentos obrigatórios

O sistema deve tratar separadamente:

 Transferências entre contas;

 Empréstimos;

 Aportes de sócios;

 Resgates;

 Aplicações;

 Investimentos;

 Compra de ativos;

 Reembolsos;

 Estornos;

 Juros;

 Multas;

 Tarifas;

 Receitas financeiras;

 Gastos não recorrentes.

Aportes e empréstimos podem melhorar o saldo de caixa, mas não podem melhorar o Resultado Operacional.

16. Análises automáticas

Inicialmente, utilizar regras objetivas.

Exemplos:

 Categoria acima da média;

 Categoria abaixo da média;

 Variação superior ao limite;

 Maior crescimento;

 Maior redução;

 Maior impacto positivo;

 Maior impacto negativo;

 Resultado operacional negativo;

 Resultado líquido sustentado por aporte;

 Receita abaixo da meta;

 Custo com pessoal elevado;

 Despesa não recorrente;

 Tendência de alta;

 Tendência de queda;

 Concentração excessiva em uma categoria.

Os textos gerados devem ser editáveis pelo consultor.

17. Design da plataforma

Identidade visual

Utilizar um estilo corporativo, moderno e profissional.

Cores

 Fundo e menu em azul-marinho;

 Cards brancos ou cinza muito claro;

 Azul para indicadores neutros e resultados intermediários;

 Verde para resultados positivos;

 Vermelho para valores negativos;

 Amarelo ou laranja para atenção;

 Roxo apenas para situações extraordinárias ou indicadores secundários.

Componentes

 Menu lateral fixo;

 Cards com cantos arredondados;

 Sombras suaves;

 Ícones simples;

 Tabelas limpas;

 Hierarquia clara;

 Boa quantidade de espaço;

 Evitar excesso de elementos;

 Evitar repetir informações entre telas;

 Evitar gráficos decorativos que não agreguem análise.

Responsividade

A versão desktop será a principal.

Em telas menores:

 Menu lateral recolhível;

 Cards reorganizados;

 Tabelas com rolagem horizontal;

 Gráficos responsivos.

18. Instruções técnicas

 Criar arquitetura multiempresa;

 Separar dados por cliente;

 Implementar autenticação;

 Criar perfis de acesso;

 Manter histórico de alterações;

 Manter registro de importações;

 Manter rastreabilidade entre indicadores e lançamentos;

 Permitir clicar em um valor para acessar os lançamentos de origem;

 Bloquear períodos fechados;

 Permitir reabrir período apenas com justificativa;

 Registrar usuário, data e horário das alterações;

 Preparar estrutura para integração futura com a API do NIBO;

 Permitir exportação em PDF e Excel.

19. Prioridade inicial

A primeira versão funcional deve priorizar:

 Cadastro de clientes;

 Importação NIBO;

 Plano de contas;

 Mapeamento de categorias;

 Conferência;

 Fechamento mensal;

 DRE Gerencial;

 Home;

 Receitas;

 Custos;

 Despesas;

 Análises automáticas básicas;

 Exportação do relatório.

Ponto de Equilíbrio, Plano de Ação avançado e personalização de relatórios podem ser desenvolvidos logo após a consolidação da estrutura principal.

Resultado esperado

A plataforma deverá transformar os relatórios operacionais do NIBO em uma entrega financeira gerencial completa, permitindo que a equipe da VG realize o fechamento, análise, apresentação e acompanhamento dos clientes em um único ecossistema.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
