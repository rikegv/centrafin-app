# OS-CONSOLIDADO-01 -- Spec de diff visual

## Escopo

Arquivo: `dashboard_master_desktop/code.html`
Secao: `#visao-consolidado` (linhas ~734-785 HTML, ~1500-1604 JS)

---

## 1. NOVO GRAFICO: "Bruto vs Realizado - Consolidado (Total)"

### Posicao
Inserir um TERCEIRO card de grafico **apos** o grid 2-colunas existente (linha ~783,
logo antes do `</div>` que fecha o wrapper `.bg-slate-100/70`).
O novo grafico ocupa **largura total** (full-width, fora do grid 2-col).

### HTML do container (seguir padrao dos dois existentes)
```
<div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 min-w-0 mt-6">
  <h3 class="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
    <span class="material-symbols-outlined text-slate-400 text-[18px]">insert_chart</span>
    Bruto vs Realizado - Consolidado
  </h3>
  <div id="chart-consolidado-total" class="w-full h-[280px]"></div>
</div>
```
Notas:
- Altura menor (280px vs 320px) porque sao apenas 1-2 barras (TOTAL, ou SOULAN+NEAT+TOTAL).
- O card segue exatamente as mesmas classes dos dois cards acima.

### Dados
- Duas barras: **Bruto** (soma de porEmpresa.SOULAN.bruto + porEmpresa.NEAT.bruto) e
  **Realizado** (idem .real). Categoria unica no eixo X: `['TOTAL']`.
- Alternativa: 3 categorias `['SOULAN', 'NEAT', 'TOTAL']` lado a lado, onde TOTAL
  e a soma. A decisao e do diretor; spec base assume categoria unica `['TOTAL']`.

### JS
- Novo `let _chartConsTotal = null;` junto aos outros dois.
- Inicializado em `_initChartsConsolidado()` com o mesmo `baseBar` (apos correcao de
  cores e dataLabels descrita abaixo).
- Atualizado em `processarConsolidado()` apos os dois charts existentes.

---

## 2. CORRECAO: dataLabels fixos e visiveis (rotulos de valor)

### O que muda
Os tres graficos da secao Consolidado (por Empresa, por Servico, e o novo Total)
devem exibir rotulos de valor **fixos** sobre cada barra -- nunca so tooltip.

### Referencia de padrao existente
O `colOpt` (linha ~3011-3031) ja implementa dataLabels corretos para os graficos
da secao principal (Faturamento Bruto/Realizado mensais). Reusar a mesma logica:

```js
dataLabels: {
  enabled: true,
  formatter: function (val) {
    if (!val || isNaN(val) || val === 0 || !isFinite(val)) return "";
    return window.formatMil(val);  // "1,2M", "450K" etc.
  },
  offsetY: -10,
  style: {
    fontSize: '10px',
    fontWeight: 700,
    colors: ['#475569']  // --text-secondary (tema claro)
  },
  background: { enabled: false },
  dropShadow: { enabled: false }
}
```

### Onde aplicar
No objeto `baseBar` (linha ~1512-1521), trocar:
```js
dataLabels: { enabled: false },
```
por:
```js
dataLabels: {
  enabled: true,
  formatter: function (val) {
    if (!val || isNaN(val) || val === 0 || !isFinite(val)) return "";
    return window.formatMil ? window.formatMil(val) : val;
  },
  offsetY: -10,
  style: { fontSize: '10px', fontWeight: 700, colors: ['#475569'] },
  background: { enabled: false },
  dropShadow: { enabled: false }
},
plotOptions: { bar: { ..., dataLabels: { position: 'top' } } },
```

**Nota tema escuro**: a cor `#475569` dos labels se torna ilegivel no dark.
O `theme.css` ja tem regra global `html.dark .apexcharts-text tspan { fill: #cbd5e1 }` (linha 202)
que forca fill claro em dark mode, entao os dataLabels serao legiveveis automaticamente.
NAO adicionar override extra -- o CSS global ja cobre.

---

## 3. CORRECAO: paleta de cores -- substituir hex hardcoded por tokens brand

### Tokens Tailwind disponiveis (definidos no `<script>` do code.html, linhas 20-21)
| Token            | Hex       | Uso semantico no sistema              |
|------------------|-----------|---------------------------------------|
| brandLightBlue   | #59a4d8   | Bruto (graficos por Empresa na secao principal) |
| brandGreen       | #aad12f   | Realizado (graficos por Empresa na secao principal) |
| brandOrange      | #ff8864   | Bruto (graficos por Servico na secao principal) |
| brandAqua        | #89d5c9   | Realizado (graficos por Servico na secao principal) |

### Cores atuais no Consolidado (baseBar, linha 1518)
```js
colors: ['#64748b', '#10b981'], // slate-500 (Bruto) / emerald-500 (Realizado)
```
Sao hex hardcoded e **nao correspondem** a nenhum token brand do sistema.

### Mapeamento proposto
Para consistencia com os graficos da secao principal (que o usuario ja conhece):

| Grafico Consolidado       | Serie "Bruto"         | Serie "Realizado"     |
|---------------------------|-----------------------|-----------------------|
| Por Empresa               | `#59a4d8` (brandLightBlue) | `#aad12f` (brandGreen) |
| Por Servico               | `#ff8864` (brandOrange)    | `#89d5c9` (brandAqua)  |
| Total (novo)              | `#59a4d8` (brandLightBlue) | `#aad12f` (brandGreen) |

### Implementacao
O `baseBar` nao deve mais definir `colors` globalmente, pois cada grafico precisa
de paleta diferente. Remover `colors` do `baseBar` e passar individualmente:

- `_chartConsEmpresa`: `colors: ['#59a4d8', '#aad12f']`
- `_chartConsServico`: `colors: ['#ff8864', '#89d5c9']`
- `_chartConsTotal`:   `colors: ['#59a4d8', '#aad12f']`

**Justificativa**: esses hex SAO os tokens brand do Tailwind config do projeto.
Nao sao hardcoded arbitrarios -- sao as mesmas cores ja usadas nos graficos
principais (linhas 3038-3040). Manter paridade visual entre secoes.

---

## 4. O que NAO muda (escopo intocado)

- **Estrutura HTML** dos 4 KPI cards (Bruto/Liquido/Realizado/Atrasado) -- intacta.
- **Estrutura HTML** dos dois containers de grafico existentes -- intacta (apenas JS
  muda no config do ApexCharts).
- **Logica de calculo** em `processarConsolidado()` (Map/Reduce de dados) -- intacta.
  Apenas adicionar alimentacao do terceiro grafico ao final.
- **Graficos da secao principal** (chart-empresa, chart-servico fora do Consolidado) --
  intactos, nao sao escopo desta OS.
- **Grafico "por Servico"** no Consolidado: estrutura de barras agrupadas (NEAT como
  bloco unico) nao muda. So recebe dataLabels e nova paleta.

---

## 5. Riscos de tema escuro / responsividade

| Risco | Mitigacao |
|-------|-----------|
| dataLabels invisiveis no dark | Coberto por `theme.css` linha 202 (`html.dark .apexcharts-text tspan { fill: #cbd5e1 }`) |
| Cores brand escuras demais no dark | brandLightBlue (#59a4d8) e brandGreen (#aad12f) tem luminosidade media-alta, legiveveis sobre fundo escuro. brandOrange (#ff8864) e brandAqua (#89d5c9) idem. Sem risco. |
| Novo card quebrando layout mobile | Card full-width com `min-w-0` segue o mesmo padrao dos existentes. Sem risco de overflow. |
| Legend labels invisiveis no dark | `theme.css` linha 203 cobre (`html.dark .apexcharts-legend-text { color: #cbd5e1 }`) |

---

## 6. Checklist para auditoria pos-implementacao

- [ ] `dataLabels.enabled: true` nos 3 graficos do Consolidado
- [ ] Nenhum hex hardcoded fora dos tokens brand (`#59a4d8`, `#aad12f`, `#ff8864`, `#89d5c9`)
- [ ] Novo container `#chart-consolidado-total` presente no HTML
- [ ] Novo chart inicializado e alimentado no JS
- [ ] KPIs e graficos existentes inalterados
- [ ] Tema escuro: labels e legendas legiveis (cobertos por theme.css global)
- [ ] `formatMil` usado no formatter (nunca valor cru)
