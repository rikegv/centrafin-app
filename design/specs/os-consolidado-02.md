# OS-CONSOLIDADO-02 -- Spec de diff visual

## Arquivo afetado
`dashboard_master_desktop/code.html`
Secao: `#visao-consolidado` (HTML linhas ~777-800, JS linhas ~1538-1650)

---

## 1. REORDENACAO dos graficos

### Estado atual (HTML)
```
<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">        <!-- grid 2-col -->
  [card] Bruto vs Realizado por Empresa   (#chart-consolidado-empresa)
  [card] Bruto vs Realizado por Servico   (#chart-consolidado-servico)
</div>
[card full-width] Bruto vs Realizado - Consolidado (#chart-consolidado-total)
```

### Nova ordem (HTML)
```
[card full-width] Bruto vs Realizado - Consolidado (#chart-consolidado-total)   <-- TOPO
<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">        <!-- grid 2-col -->
  [card] Bruto vs Realizado por Empresa   (#chart-consolidado-empresa)
  [card] Bruto vs Realizado por Servico   (#chart-consolidado-servico)
</div>
```

### O que muda
- Mover o bloco HTML do card `#chart-consolidado-total` (linhas 793-800) para ANTES
  do `<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">` (linha 778).
- Trocar `mt-6` do card total por `mb-6` (o espacamento agora e abaixo dele, nao acima).
- Nenhuma classe adicional. Nenhuma mudanca nos dois cards internos do grid.

### O que NAO muda
- Classes do grid 2-col e dos cards internos.
- IDs dos elementos (`chart-consolidado-total`, `chart-consolidado-empresa`,
  `chart-consolidado-servico`).
- Nenhuma mudanca no JS de inicializacao/renderizacao -- a ordem do HTML nao afeta a
  logica ApexCharts (binds por ID).

---

## 2. PALETA DE CORES

### Tokens de referencia (definidos em tailwind.config linhas 20-21 do code.html)
| Token           | Hex       | Uso semantico                           |
|-----------------|-----------|-----------------------------------------|
| brandLightBlue  | `#59a4d8` | Azul Soulan (barras de Bruto na visao Soulan) |
| brandGreen      | `#aad12f` | Verde Soulan (barras/linhas de Realizado) |
| `#ff5f15`       | --        | Laranja Thomas (barras da visao Thomas, linhas 2958/2974) |

### Mapeamento por grafico

| Grafico                      | Serie "Bruto"               | Serie "Realizado"            | Mudanca? |
|------------------------------|-----------------------------|------------------------------|----------|
| Consolidado (topo, total)    | `#59a4d8` (brandLightBlue)  | `#ff5f15` (laranja Thomas)   | SIM -- era `#59a4d8`/`#aad12f` |
| Por Empresa                  | `#59a4d8` (brandLightBlue)  | `#aad12f` (brandGreen)       | NAO -- ja esta correto |
| Por Servico                  | `#59a4d8` (brandLightBlue)  | `#aad12f` (brandGreen)       | SIM -- era `#ff8864`/`#89d5c9` |

### Implementacao (JS)
Na funcao `_initChartsConsolidado()`:

- **`_chartConsTotal`** (linha 1579): trocar `colors: ['#59a4d8', '#aad12f']`
  por `colors: ['#59a4d8', '#ff5f15']`.
- **`_chartConsServico`** (linha 1571): trocar `colors: ['#ff8864', '#89d5c9']`
  por `colors: ['#59a4d8', '#aad12f']`.
- **`_chartConsEmpresa`** (linha 1563): manter `colors: ['#59a4d8', '#aad12f']` -- intocado.

### Nota sobre `#ff5f15`
Esta cor NAO e um token do tailwind.config, mas e a cor ja usada nos graficos da Visao
Thomas (linhas 2958, 2974). Como a barra "Realizado" do grafico Consolidado (topo)
representa a soma de Soulan+Neat, usar o laranja Thomas e a decisao do diretor para
diferenciar visualmente do verde das visoes individuais. Se o diretor preferir usar
`brandOrange` (`#ff8864`) em vez de `#ff5f15`, basta trocar -- ambos sao laranjas do
sistema. A spec segue o pedido literal: "token laranja da Visao Thomas" = `#ff5f15`.

### Risco tema escuro
- `#ff5f15` tem luminosidade alta (laranja vivo), legivel sobre fundo escuro
  (`--bg-card: #1c1f23`). Sem risco de contraste.
- `#59a4d8` e `#aad12f` ja validados na OS-CONSOLIDADO-01. Sem risco.

---

## 3. ROTULOS SOBREPOSTOS (dataLabels em barras pequenas)

### Problema
No grafico "Por Servico", barras de valor pequeno (RPO, Fopag, Estagio, Outros) geram
sobreposicao do rotulo com a barra ou com o eixo. O `offsetY: -10` posiciona o label
acima da barra, mas quando a barra e muito curta o label fica sobre o eixo X ou sobre
labels de barras vizinhas.

### Solucao: posicao dinamica via custom formatter + offsetY condicional
ApexCharts nao oferece `position: 'outside'` nativo para barras verticais (column).
A abordagem correta e usar a opcao do `plotOptions.bar.dataLabels.position: 'top'`
(que ja esta no `baseBar`) combinada com um threshold que oculta labels que
colideriam. Porem, o pedido e reposicionar FORA, nao ocultar.

**Recomendacao tecnica para o engenheiro-frontend:**

Adicionar ao config especifico do `_chartConsServico` (nao no baseBar global):

```js
dataLabels: {
  enabled: true,
  formatter: function (val) {
    if (!val || isNaN(val) || val === 0 || !isFinite(val)) return "";
    return window.formatMil ? window.formatMil(val) : val;
  },
  offsetY: -10,
  style: { fontSize: '9px', fontWeight: 700, colors: ['#475569'] },
  background: { enabled: false },
  dropShadow: { enabled: false }
},
plotOptions: {
  bar: {
    horizontal: false,
    columnWidth: '58%',
    borderRadius: 6,
    dataLabels: { position: 'top' }
  }
}
```

Ajustes especificos vs baseBar:
- `fontSize: '9px'` (1px menor que o baseBar, para caber em barras estreitas com
  muitas categorias).
- Se ainda houver colisao visual apos teste, o engenheiro pode reduzir para `'8px'`
  ou adicionar `rotate: -45` nos labels do xaxis para abrir espaco horizontal.

### Alternativa robusta (se a acima nao resolver)
Trocar o grafico "Por Servico" para barras **horizontais** (`horizontal: true`), onde
os labels ficam naturalmente a direita da barra sem sobreposicao. Isso exigiria
ajustar a altura do container para acomodar N categorias empilhadas verticalmente.
**So adotar se o diretor aprovar** -- muda o layout visual.

---

## 4. O que NAO muda (escopo intocado)

- KPI cards (Bruto/Liquido/Realizado/Atrasado) -- intactos.
- Logica de calculo em `processarConsolidado()` -- intacta.
- Graficos fora do `#visao-consolidado` (Soulan, Thomas, Emissoes, Fechamento) -- intactos.
- Estrutura do grid 2-col (classes, responsividade) -- intacta.
- dataLabels do baseBar (ja corretos desde OS-CONSOLIDADO-01) -- intactos.
  So o `_chartConsServico` recebe override de fontSize menor.

---

## 5. Riscos

| Risco | Mitigacao |
|-------|-----------|
| Labels invisiveis no dark | Coberto por `theme.css` linha 202 (regra global ApexCharts) |
| `#ff5f15` sem par no Tailwind config | Cor usada inline no JS (como ja e feito nos charts Thomas); nao precisa de classe Tailwind |
| Reordenacao quebrando layout | Apenas troca de posicao de blocos HTML; IDs preservados; JS nao depende de ordem DOM |
| Rotulos ainda sobrepostos apos fix | Engenheiro testa visualmente; se persistir, escalar ao diretor com alternativa horizontal |

---

## 6. Checklist para auditoria pos-implementacao

- [ ] Grafico Consolidado (total) aparece no TOPO, antes do grid 2-col
- [ ] Cores do Consolidado total: Bruto=`#59a4d8`, Realizado=`#ff5f15`
- [ ] Cores do Por Empresa: Bruto=`#59a4d8`, Realizado=`#aad12f` (inalterado)
- [ ] Cores do Por Servico: Bruto=`#59a4d8`, Realizado=`#aad12f` (era salmao/aqua)
- [ ] Rotulos do Por Servico legiveis sem sobreposicao em barras pequenas
- [ ] Tema escuro: todos os labels e legendas legiveis
- [ ] Nenhum outro grafico/secao/KPI fora do escopo foi alterado
- [ ] `mt-6` do card total trocado por `mb-6` (ou equivalente para espacamento correto)
