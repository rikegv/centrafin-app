# OS-METAS-DASH-01 -- Spec de Diff Visual (Itens 1-5)

Arquivo alvo: `dashboard_master_desktop/code.html`
Secao: `#tela-metas` (Acompanhamento de Metas)

---

## Item 1 -- Novo grafico "Acompanhamento Mensal: Grupo" com Faturamento Bruto

### O que muda
- Inserir um segundo card de grafico **identico em estrutura** ao existente (linhas 1079-1087), posicionado IMEDIATAMENTE ABAIXO dele, dentro do mesmo `grid grid-cols-1 gap-6 mb-6` (linha 1079).
- O card fica entre o chart mensal existente e o card "Status de Atingimento Mensal" (linha 1089).

### Container HTML
Copiar exatamente o bloco do card existente (linhas 1080-1087) com as seguintes diferencas:

| Atributo | Existente | Novo |
|---|---|---|
| Barra lateral decorativa | `bg-brandOrange` | `bg-brandLightBlue` (#59a4d8) |
| Icone Material | `text-brandOrange` | `text-brandLightBlue` |
| Titulo | "Acompanhamento Mensal de Grupos" | "Acompanhamento Mensal: Faturamento Bruto" |
| ID do titulo | `titulo-grafico-metas-mensal` | `titulo-grafico-metas-mensal-bruto` |
| ID do chart container | `chart-metas-mensal` | `chart-metas-mensal-bruto` |
| Icone | `monitoring` | `monitoring` (manter) |

### Grafico ApexCharts (JS)
- Duplicar a inicializacao de `chartMetasMensal` (linhas 3618-3642) para `chartMetasMensalBruto`.
- Series: `Meta Mensal` (mesma) + `Faturamento Bruto` (no lugar de `Realizado`).
- Cores: `['#aad12f', '#59a4d8']` (brandGreen + brandLightBlue) -- diferencia do original que usa `['#aad12f', '#002443']`.
- Em `processarDashMetas`, atualizar `chartMetasMensalBruto` com os dados de `faturamentoBrutoPorMesProduto` (ja existe, linhas 3658-3664).
- O titulo dinamico segue a mesma logica do original (filtro por produto atualiza).

### Tema escuro
- Nenhuma acao extra: `bg-white.rounded-2xl` ja e invertido por `theme.css` L178-179 para `--bg-modal`. A barra `bg-brandLightBlue` nao precisa de override (cor vibrante funciona nos dois temas).

---

## Item 2 -- Proporcionalidade Meta Anual Bruta vs Faturamento Bruto

### O que muda
- Apenas logica JS. Nenhuma mudanca visual/HTML.
- Spec visual: **nao se aplica**. O engenheiro-frontend ajusta o calculo para que, ao filtrar meses, a barra de Meta tambem reflita apenas os meses selecionados (em vez da meta anual cheia).

### O que fica intocado
- Todo o container HTML (linhas 1061-1076), cores, layout.

---

## Item 3 -- Rotulos de valor cortados em barras pequenas

### O que muda
- Configuracao de `dataLabels` nos tres graficos de barra:
  1. `chartMetaAnualFat` (linha 3594)
  2. `chartMetaAnualBruto` (linha 3611)
  3. `chartMetasMensal` (linha 3627) e o novo `chartMetasMensalBruto`

### Regra de posicionamento
Para os graficos horizontais (Meta Anual Bruta / Meta vs Faturamento Realizado):
```
dataLabels: {
  enabled: true,
  textAnchor: 'start',
  formatter: function (val) { return window.formatMoedaFull(val); },
  offsetX: 5,
  style: { colors: ['#002443'] },  // texto escuro FORA da barra
  background: { enabled: false }
}
```
- A chave e mover o rotulo para FORA da barra quando a barra e curta. Em ApexCharts horizontal bar, usar `dataLabels.position: 'top'` no `plotOptions.bar` ja existente garante que o rotulo fica fora da barra. Se `position: 'top'` nao funcionar para barras muito curtas, usar o callback `dataLabels.offsetX` dinamico OU forcar `textAnchor: 'start'` com cor escura (porque o fundo atras sera branco/card, nao a barra).
- **Cor do rotulo**: trocar de `'#fff'` (branco, so legivel dentro da barra) para `['#002443']` (brandDarkBlue, legivel fora da barra no tema claro). No tema escuro, `theme.css` L219 ja inverte `text-[#002443]` para `--text-primary`, mas como isso e ApexCharts inline e nao classe CSS, o engenheiro deve usar a opcao `theme.mode` do ApexCharts OU aplicar cor condicional via `document.documentElement.classList.contains('dark')`.

Para o grafico vertical (Mensal):
- `plotOptions.bar.dataLabels.position` ja e `'top'` (L3625). Verificar se `offsetY: 20` (L3631) nao esta empurrando o rotulo para DENTRO da barra. Se a barra for menor que o offset, o rotulo fica cortado. Solucao: usar `offsetY: -10` (acima da barra) com cor `'#002443'` em vez de `'#fff'`.

### Regra permanente do projeto
Rotulos de valor devem ser SEMPRE visiveis e fixos (nunca so hover/tooltip). Essa correcao reafirma essa regra.

### Tema escuro
- Risco: rotulos com cor fixa `#002443` ficam invisiveis no dark. O engenheiro DEVE detectar o tema e usar `--text-primary` (#f1f5f9) no dark ou usar ApexCharts `theme: { mode: 'dark' }` que ja ajusta automaticamente.

---

## Item 4 -- Velocimetros acima de 100%

### O que muda
- Apenas logica JS: remover os caps `if (perc > 100) perc = 100` nas linhas 3883 e 3914.
- O formatter do gauge (L3567) `val.toFixed(1) + "%"` ja renderiza qualquer valor -- nao precisa de mudanca visual.

### O que fica intocado
- O arco visual (radialBar) nao precisa de redesenho. ApexCharts radialBar aceita valores > 100 no label, mas o arco fica "cheio" (100%). Isso e o comportamento desejado pelo diretor.

### Tema escuro
- O formatter do gauge usa `color: '#002443'` (L3567). No dark, `theme.css` inverte `.text-[#002443]` (L219), mas como e inline no ApexCharts, verificar se o valor e legivel. Se nao, aplicar a mesma logica do Item 3 (detectar tema).

---

## Item 5 -- Click em cards "Nao Atingida" (modal de detalhamento)

### O que muda

**1. Tornar os cards "NAO ATINGIDA" clicaveis:**
- No template de cards (L3838-3849), quando `isPassado && !semMeta && !atingiu`, adicionar:
  - `cursor-pointer` na classe do card
  - `onclick="window.abrirModalMetaNaoAtingida(${idx}, ${anoFiltro})"`

**2. Nova funcao `abrirModalMetaNaoAtingida`:**
- Reutilizar o modal `#modal-detalhe-meta` (L4313-4338) -- NAO criar modal novo.
- Mudar dinamicamente:
  - Barra decorativa topo: de `bg-brandGreen` para `bg-red-500` (ou `bg-brandOrange`)
  - Icone no titulo: de `verified` para `warning` ou `trending_down`
  - Cor do icone: de `text-brandGreen` para `text-red-500`
  - Texto do titulo: `"Produtos Abaixo da Meta: {Mes} / {Ano}"`

**3. Layout do conteudo da lista (dentro de `#modal-detalhe-meta-lista`):**
Para cada produto que NAO atingiu a meta naquele mes, gerar um card-item com este layout:

```
[Icone circulo vermelho]  |  PRODUTO           |  Realizado: R$ X.XXX
  trending_down           |  Faltou: R$ Y.YYY  |  Meta: R$ Z.ZZZ
                          |  (-XX.X%)           |
```

Detalhamento dos elementos do card-item:

| Elemento | Classe/Cor | Token |
|---|---|---|
| Container do item | `bg-red-50 rounded-xl border border-red-100` | red-50 ja tem dark override (theme.css L187) |
| Icone circular | `w-10 h-10 rounded-full bg-red-500 text-white` | Cor semantica, nao precisa de token |
| Icone Material | `trending_down` (20px) | -- |
| Nome do produto | `text-[10px] font-bold text-slate-400 uppercase tracking-widest` | Igual ao modal de sucesso |
| Texto "Faltou" | `text-sm font-extrabold text-red-600` | Destaque do deficit |
| Valor faltante | `text-sm font-extrabold text-red-600` | `window.formatMoedaFull(meta - real)` |
| Percentual faltante | `text-[10px] font-bold text-red-400` | `(-XX.X%)` |
| Coluna direita: Realizado | `text-[10px] text-slate-400` label + `text-sm font-extrabold text-brandDarkBlue` valor |
| Coluna direita: Meta | `text-[10px] text-slate-400` label + `text-sm text-slate-500` valor |

**4. Estado vazio:**
Se todos os produtos atingiram a meta (caso improvavel vindo de "NAO ATINGIDA", mas defensivo):
```html
<div class="text-center py-10 opacity-50">
    <span class="material-symbols-outlined text-4xl mb-2">check_circle</span>
    <p class="text-xs font-bold">Todos os produtos atingiram a meta neste mes.</p>
</div>
```

### Padrao reutilizado
- O card-item segue exatamente a estrutura do item de sucesso em `abrirModalMetaBatida` (L3980-3996), apenas trocando verde por vermelho e adicionando a informacao de deficit.
- O modal `#modal-detalhe-meta` (L4313-4338) e reutilizado -- a barra topo e os textos sao trocados via JS antes de exibir.

### Tema escuro
- `bg-red-50` ja tem override em `theme.css` L187: `rgba(239, 68, 68, 0.12)`.
- `bg-white.rounded-2xl` (container do modal) ja invertido L178-179.
- `text-red-500`, `text-red-600`: cores vibrantes, legiveis em fundo escuro sem override.
- `bg-red-500` (icone circular): mantido (acento de cor, nao precisa inverter).
- `text-brandDarkBlue` nos valores: invertido por L78 para `--text-primary`.
- `border-red-100`: nao tem override explicito em theme.css. **Risco menor** -- verificar se fica visivel no dark. Se necessario, adicionar `html.dark .border-red-100 { border-color: rgba(239, 68, 68, 0.2) !important; }` em theme.css.

---

## O que fica INTOCADO (delimitar escopo)

1. **Linha 1 inteira -- Gauges/Velocimetros**: nenhuma mudanca de HTML/layout. So a logica JS do cap (Item 4).
2. **Linha 2 -- Graficos Meta Anual**: nenhuma mudanca de HTML/layout. So logica JS (Item 2) e config dataLabels (Item 3).
3. **Card "Status de Atingimento Mensal"** (L1089-1107): HTML intocado. So adiciona onclick nos cards vermelhos via JS (Item 5).
4. **Modal de filtros** (L1113+): intocado.
5. **Logica de classificacao de produtos/grupos**: intocada (funcoes de parsing de tipo de servico).
6. **Todas as outras telas/modulos do Dashboard Master**: intocados.

---

## Riscos

1. **Tema escuro -- rotulos de graficos (Item 3)**: risco MEDIO. Cores hardcoded no ApexCharts (`#002443`, `#fff`) nao sao captadas pelos overrides CSS de theme.css. O engenheiro deve usar deteccao de tema ou o `theme.mode` do ApexCharts.
2. **border-red-100 no dark (Item 5)**: risco BAIXO. Pode ficar invisivel. Incluir override se necessario.
3. **Performance**: o novo grafico (Item 1) duplica uma instancia ApexCharts. Impacto desprezivel (ja existem ~10 graficos na secao).
