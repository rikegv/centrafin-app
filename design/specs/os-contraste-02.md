# OS-CONTRASTE-02 -- Rotulos truncados nos graficos Meta Anual (horizontal bar)

## Arquivo afetado
`dashboard_master_desktop/code.html`
Secao: `#tela-metas` (Acompanhamento de Metas)

---

## Problema
Nos dois graficos horizontais de barra do Dashboard Metas, o rotulo de valor
(dataLabel) usa `textAnchor: 'start'` com `offsetX: 5`, posicionando o texto na
extremidade esquerda DENTRO da barra. Quando o valor formatado e longo (ex.:
"R$ 109.989,00"), o texto transborda a borda direita da barra e fica cortado/truncado
pelo SVG. A OS-CONTRASTE-01 corrigiu as cores (branco/cinza), mas nao tratou o
truncamento.

---

## O que muda (escopo estrito)

### Grafico 1 -- `chartMetaAnualFat` (linha ~3605)

**Atual:**
```js
dataLabels: {
  enabled: true,
  formatter: function (val) { return window.formatMoedaFull(val); },
  style: { colors: ['#FFFFFF', '#475569'] },
  textAnchor: 'start',
  offsetX: 5
}
```

**Novo:**
```js
dataLabels: {
  enabled: true,
  formatter: function (val, opts) {
    return window.formatMoedaFull(val);
  },
  textAnchor: 'start',
  offsetX: 5,
  style: {
    colors: [function ({ value, seriesIndex, w }) {
      var max = Math.max.apply(null, w.globals.series.map(function(s) { return Math.max.apply(null, s); }));
      var isDark = document.documentElement.classList.contains('dark');
      // Barra pequena: rotulo "vaza" para fora -> cor legivel sobre fundo do card
      if (max > 0 && value < max * 0.30) {
        return isDark ? '#cbd5e1' : '#475569';
      }
      // Barra grande: rotulo fica dentro
      return seriesIndex === 0 ? '#FFFFFF' : '#475569';
    }]
  }
}
```

Alem disso, adicionar `overflow: 'visible'` no `plotOptions.bar.dataLabels` (se
suportado pela versao do ApexCharts) ou garantir que o container SVG nao clipe o texto:
```js
plotOptions: {
  bar: {
    horizontal: true,
    barHeight: '60%',
    borderRadius: 8,
    dataLabels: { position: 'top' }
  }
}
```
A propriedade `position: 'top'` no horizontal bar coloca o label na extremidade
direita da barra (proximo a borda). Combinado com `textAnchor: 'start'`, o label
comeca no final da barra e se estende para a direita -- ficando FORA quando a barra
e curta.

### Grafico 2 -- `chartMetaAnualBruto` (linha ~3622)
Mudanca identica ao Grafico 1 acima. Mesma config de `dataLabels` e `plotOptions`.

### Mecanismo

O `style.colors` como array de functions e suportado pelo ApexCharts a partir da
v3.33+. Cada function recebe `{ value, seriesIndex, dataPointIndex, w }` e retorna
uma string de cor. A logica:

1. Calcula o valor maximo entre todas as series (`max`).
2. Se `value < max * 0.30` (barra ocupa menos de ~30% do espaco), considera que o
   rotulo nao cabe dentro e usa cor escura (legivel sobre fundo do card).
3. Se `value >= max * 0.30`, a barra e grande o bastante -- usa branco para serie 0
   (fundo navy `#002443`) e cinza para serie 1 (fundo claro).

O threshold de 30% e uma heuristica; o engenheiro pode ajustar apos teste visual.

### Fallback (se a versao do ApexCharts nao suportar function em colors)

Se a versao do ApexCharts em uso nao suportar array de functions em `style.colors`,
a alternativa e:

1. Mudar `textAnchor` para `'end'` e `offsetX` para `-5` (alinha o texto pela direita,
   rente ao final da barra -- nao trunca).
2. Manter `style: { colors: ['#FFFFFF', '#475569'] }` como array simples.
3. Se isso ainda causar truncamento, usar `position: 'top'` com cores escuras fixas
   (`['#475569', '#475569']`) e aceitar que o rotulo SEMPRE fica fora da barra. Neste
   caso, a cor branca e abandonada (nao ha fundo navy para contraste).

O engenheiro deve testar a abordagem primaria primeiro e recorrer ao fallback so se
necessario, documentando qual abordagem ficou no commit.

---

## O que fica INTOCADO

- Todos os demais graficos: `chartMetasMensal`, `chartMetasMensalBruto`, gauges,
  graficos do Consolidado, Soulan, Thomas, Emissoes, Fechamento.
- Cores das barras (`colors` do chart): `['#002443', '#aad12f']` no Fat e
  `['#002443', '#59a4d8']` no Bruto -- nao mudam.
- Formatador (`window.formatMoedaFull`) -- nao muda.
- Tooltips e legendas -- nao mudam.
- HTML/layout dos cards que contem esses graficos -- nao muda.
- Qualquer outro modulo ou tela do sistema.

---

## Tokens / cores

| Cor         | Contexto                                        | Token CSS?  |
|-------------|-------------------------------------------------|-------------|
| `#FFFFFF`   | Label dentro da barra (serie 0, fundo navy)     | Nao (inline JS, padrao existente) |
| `#475569`   | Label fora da barra OU dentro da barra claro (light) | Nao (inline JS, padrao existente) |
| `#cbd5e1`   | Label fora da barra (dark mode)                 | Nao (inline JS, mesmo valor usado em `theme.css` L202 para ApexCharts text no dark) |
| `#002443`   | Cor de fundo da barra serie 0 (nao muda)        | Nao (inline JS, padrao existente) |

Todas essas cores ja sao usadas em configs de ApexCharts no projeto (hex inline no JS).
Nenhuma cor hardcoded nova esta sendo introduzida -- `#cbd5e1` ja e a cor padrao do
tema escuro para textos de ApexCharts (definida em `theme.css` linha 202).

---

## Interacao com `theme.css` (regra global do dark)

A linha 202 do `theme.css` aplica:
```css
html.dark .apexcharts-text tspan { fill: #cbd5e1 !important; }
```

Esta regra sobrescreve TODAS as cores de texto do ApexCharts no dark, incluindo
dataLabels. Isso significa:

- **Label DENTRO da barra navy (serie 0):** o JS define `#FFFFFF`, mas o CSS pode
  sobrescrever para `#cbd5e1`. Na pratica, `#cbd5e1` sobre `#002443` tem contraste
  aceitavel (ratio ~8.5:1). Nao ha problema funcional.
- **Label FORA da barra (sobre fundo do card):** o CSS garante `#cbd5e1` sobre
  `--bg-card: #1c1f23` (contraste ~9.8:1). Seguro.

Portanto, a deteccao `isDark` no JS e uma precaucao para o caso da regra CSS global
nao se aplicar (ex.: ApexCharts usar inline style em vez de classe). O engenheiro nao
precisa alterar o `theme.css`.

---

## Padrao equivalente em outro modulo

A OS-CONSOLIDADO-02 (secao 3, linhas 85-135 da spec) tratou sobreposicao de rotulos
nos graficos verticais do Consolidado. Porem, la o problema era em barras VERTICAIS
(column) com `offsetY: -10` -- solucao diferente. Nao ha precedente exato de
posicionamento dinamico (dentro/fora) em barras horizontais no projeto. Esta OS
estabelece o padrao para esse caso.

---

## Riscos

| Risco | Mitigacao |
|-------|-----------|
| Versao do ApexCharts nao suporta function em `style.colors` | Fallback documentado na spec (ver secao acima); engenheiro testa e adota fallback se necessario |
| Threshold 30% nao funciona para todos os cenarios de dados | Heuristica ajustavel; engenheiro testa com dados reais e reporta se precisar de calibracao |
| Regra CSS L202 do `theme.css` anula a cor JS no dark | Comportamento aceitavel -- `#cbd5e1` e legivel sobre navy e sobre bg-card escuro. Nao e um bug |
| Tema escuro: label fora da barra com `#475569` ilegivel | Coberto pela deteccao `isDark` no JS e pela regra CSS L202 como backstop |
| Responsividade | Nenhum impacto -- nao ha mudanca de layout |
| Regressao no Grafico 1 vs Grafico 2 | Config identica nos dois; engenheiro copia literalmente |

---

## Checklist para auditoria pos-implementacao

- [ ] `chartMetaAnualFat` (L~3605): `style.colors` usa function (ou fallback documentado)
- [ ] `chartMetaAnualBruto` (L~3622): `style.colors` usa function (ou fallback documentado)
- [ ] Rotulo de valor longo (ex.: "R$ 109.989,00") visivel por inteiro, sem truncamento
- [ ] Rotulo dentro da barra navy: cor branca (ou `#cbd5e1` via CSS dark -- ambos aceitos)
- [ ] Rotulo fora da barra (valor pequeno): cor escura no light, clara no dark
- [ ] Tema escuro: ambos os graficos com labels legiveis em ambos os cenarios (dentro/fora)
- [ ] Nenhum hex hardcoded NOVO alem dos ja listados na spec
- [ ] Nenhum outro grafico alterado
- [ ] Formatador `formatMoedaFull` preservado
- [ ] `plotOptions`, `colors` (barras), tooltips e legendas inalterados
