# OS-CONTRASTE-01 — Correcao de contraste de rotulos nos graficos Meta Anual

## Problema
Nos dois graficos horizontais de barra do Dashboard Metas ("Meta Anual Bruta vs
Faturamento Bruto" e "Meta vs Faturamento Realizado (Global)"), o rotulo de valor
(dataLabel) usa cor unica `#475569` (cinza) para ambas as series. A serie 0 (Meta) tem
fundo navy `#002443`, onde o cinza eh ilegivel. Regressao da OS-METAS-DASH-01 item 3.

## O que muda (escopo estrito)

### Grafico 1 — `chartMetaAnualBruto` (linha ~3621)
- **Atual:** `dataLabels: { ..., style: { colors: ['#475569'] }, ... }`
- **Novo:**  `dataLabels: { ..., style: { colors: ['#FFFFFF', '#475569'] }, ... }`
  - `#FFFFFF` (branco) para serie 0 "Meta Anual Bruta" (fundo `#002443` navy).
  - `#475569` (cinza) para serie 1 "Faturamento Bruto" (fundo `#59a4d8` azul claro).

### Grafico 2 — `chartMetaAnualFat` (linha ~3604)
- **Atual:** `dataLabels: { ..., style: { colors: ['#475569'] }, ... }`
- **Novo:**  `dataLabels: { ..., style: { colors: ['#FFFFFF', '#475569'] }, ... }`
  - `#FFFFFF` (branco) para serie 0 "Meta Total" (fundo `#002443` navy).
  - `#475569` (cinza) para serie 1 "Faturamento Real" (fundo `#aad12f` verde claro).

### Mecanismo ApexCharts
Quando `style.colors` recebe um array com N elementos, o ApexCharts aplica o indice 0 a
serie 0, indice 1 a serie 1, etc. Trocar de array de 1 para array de 2 resolve.

## O que fica INTOCADO
- Todos os demais graficos do Dashboard Metas (mensal consolidado, mensal bruto, etc.).
- Cores das barras (`colors` do chart) -- nao mudam.
- Formatadores, tooltips, legendas, posicionamento (`textAnchor`, `offsetX`).
- Qualquer outro modulo ou tela do sistema.

## Tokens / cores hardcoded
Os graficos ApexCharts recebem cores via objetos JS de configuracao (nao via CSS
variables). O projeto ja usa hex hardcoded nesse contexto (`#475569`, `#002443`,
`#aad12f`, `#59a4d8`, `#64748b`) em todas as configs de chart. Nao ha token CSS
aplicavel aqui -- padrao consistente com o restante dos graficos do Dashboard Master.

## Riscos
- **Tema escuro:** nenhum risco. O `theme.css` nao sobrescreve cores internas de
  dataLabels do ApexCharts (somente `apexcharts-datalabel-label` via fill, que e para
  radialBar labels, nao bar dataLabels). O branco funciona em ambos os temas porque o
  fundo da barra navy permanece `#002443` independente do tema.
- **Responsividade:** nenhum impacto. Nao ha mudanca de layout.
- **Regressao:** a mudanca e um array de 1 -> array de 2. Se por engano se usar array
  de 1 com branco, a serie sobre fundo claro ficaria ilegivel (o inverso do bug atual).
  O engenheiro deve garantir que o array tenha exatamente 2 elementos.

## Padrao equivalente em outros modulos
Nao ha outro grafico de barras no projeto com esse problema. Os graficos mensais usam
barras verticais com `offsetY: -10` (rotulo acima da barra, sobre fundo do card), onde
a cor unica cinza funciona. A correcao e especifica dos dois graficos horizontais cujo
rotulo fica DENTRO da barra escura.
