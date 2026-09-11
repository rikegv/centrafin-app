# OS-CP-JANELA-6M-01 — Spec de diff visual

**Tela:** `gerenciador_contas_pagar_desktop/code.html` (módulo vivo do Contas a Pagar).
**Branch:** `feature/cp-janela-6m`, empilhado sobre `feature/cp-filtros-base`.
**Natureza:** iteração cirúrgica em 2 frentes — (A) `<thead>` da tabela principal vira
ordenável; (B) consequências visuais da janela padrão de 6 meses. **Não** é redesign da
tabela, nem dos KPIs, nem do modal "Filtrar Base".
**Design system:** `theme.css` (tokens claro/escuro) + Tailwind CDN com `tailwind.config`
local (linhas 11-24: `primary #aad12f`, `secondary #002443`, `tertiary #59a4d8`,
`on-surface-variant #64748b`).

> **Spec anterior desta tela:** `design/specs/cp-filtros-base-completa.md`. A §9.1 de lá
> (variantes `hover:` sem cobertura no dark) é a armadilha central desta OS — esta OS
> introduz hover **e** estado ativo em 7 cabeçalhos.

---

## 0. Mapa dos pontos tocados

| # | O que | Onde (linha aprox.) | Tipo de diff |
|---|---|---|---|
| 1 | 7 `<th>` viram ordenáveis (markup + glifo de direção) | `<thead>` 288-313: linhas **298, 299, 300, 301, 302, 304, 311** | HTML (classes + wrapper + `<span>` do glifo) |
| 2 | Delegação de clique/teclado + troca dos 3 estados do glifo | bloco JS novo próximo de `renderTabela` (2199+) | JS |
| 3 | Contagem do rodapé formatada em pt-BR | `_cpAtualizarUICarregarMais` **1350** + span **351** | JS (1 expressão) + 1 classe |
| 4 | Estado de carregamento da abertura (6 meses) | **281**, **350**, **351**, **352**, **356** | HTML (texto + `hidden`/`flex`) |

Fora desses pontos, **nenhum outro trecho do arquivo deve aparecer no `git diff`.**
`assets/checkbox_multi.js`, `theme.css` e `theme_manager.js`: **zero linhas alteradas**.

---

## 1. Cabeçalhos ordenáveis (frente principal)

### 1.1 Padrão a REAPROVEITAR — existe e está em produção

`contas_a_receber_desktop/code.html:356-457` já tem cabeçalho de ordenação completo, com
vocabulário de glifos definido em `code.html:3061-3063`:

| Estado | Glifo `material-symbols-outlined` |
|---|---|
| não ordenado | `unfold_more` |
| ativo crescente | `keyboard_arrow_up` |
| ativo decrescente | `keyboard_arrow_down` |

**Estes 3 glifos são reaproveitados sem alteração.** É o único padrão de seta de ordenação
do repositório — varri `contas_a_receber_desktop`, `custo_folha_desktop`,
`dashboard_master_desktop`, `aprovacoes_desktop`, `aging_desktop` e `master.html`
(as únicas outras ocorrências de seta são `arrow_drop_down` de *dropdown* em
`master.html:635/665/702`, semântica diferente — **não usar**). Não inventar `sort`,
`swap_vert`, `arrow_upward` nem `▲/▼` em texto.

### 1.2 O que NÃO copiar do Contas a Receber (3 armadilhas)

1. **`hover:bg-slate-50`** (CRF 357, 363, 369…) — é exatamente o achado §9.1 da spec
   anterior. `theme.css:48` remapeia `html.dark .bg-slate-50`, mas a classe gerada é
   `.hover\:bg-slate-50`, que **não casa** → no tema escuro o cabeçalho pisca quase-branco
   (`#f8fafc`) sob texto `--text-secondary`. **Substituir por `hover:bg-primary/10`**
   (alpha de marca, idêntico nos dois temas). Precedente no próprio arquivo: linha **801**
   (`hover:bg-primary/10`, criada na OS anterior justamente por esse motivo), mais 244, 440,
   896 com `/5` e 888/897 com `group-hover:bg-*/20`.
2. **`group-hover:text-brandMidBlue`** (CRF 359, 365…) — `brandMidBlue` **não existe** no
   `tailwind.config` deste módulo (linhas 14-20). A classe não seria gerada e o hover do
   glifo simplesmente não aconteceria. **Não portar.** Aqui a mudança de prominência é por
   **opacidade**, não por cor (ver 1.3).
3. **`onclick="..."` inline no `<th>`** (CRF 356) — este arquivo tem **0 ocorrências** de
   `onclick=`. A convenção local é delegação com `addEventListener` + `data-*`
   (`[data-kpi-card]` em 5614-5631, `[data-cp-acao]` em 5458). **Seguir a convenção local.**

### 1.3 Os três estados — decisão

**Colunas não ativas: glifo presente, mas fantasma (`opacity-40`), subindo a
`opacity-100` no hover da célula.** Motivo: 7 setas a plena tinta num `<thead>` de 10px
viram poluição e brigam com a leitura executiva; seta totalmente ausente esconde a
afordância de 7 das 11 colunas. O meio-termo é o padrão do CRF (lá, `text-slate-300`),
mas implementado por **opacidade em vez de tom de cinza** — opacidade é 100% neutra em
relação ao tema, enquanto `text-slate-300` **não tem cobertura em `theme.css`** (a lista
começa em `text-slate-400`, linha 108) e no dark renderiza `#cbd5e1`, ou seja, o glifo
ficaria **mais claro que o próprio rótulo** — exatamente o oposto de fantasma.

**Cabeçalho ativo: só a seta muda — sem mudar peso nem fundo do `<th>`.** Duas razões:
- A seta ativa já muda **três** dimensões ao mesmo tempo (forma `unfold_more` →
  chevron direcional, opacidade 40 → 100, cor cinza → `text-secondary`). É delta
  suficiente numa tabela de 11 colunas.
- `font-bold` → `font-extrabold` num rótulo `uppercase tracking-widest` muda a largura do
  texto e faz a coluna **pular de largura** a cada troca de ordenação (Favorecido, Despesa
  e CC não têm `w-*` fixo). Tabela executiva não pula.

**Por que a cor do ativo vai no `<span>` e NUNCA no `<th>`:** `theme.css:161` é
`html.dark table thead th { color: var(--text-secondary) !important; }`. Qualquer classe de
cor aplicada ao `<th>` é **achatada no dark** (é por isso que o `text-secondary` do `<th>`
Valor, linha 311, não se distingue hoje no tema escuro — defeito preexistente, **fora de
escopo**). O `<span>` do glifo é outro elemento: a regra `html.dark .text-secondary`
(`theme.css:77`) casa nele e entrega `--text-primary` (`#f1f5f9`). Logo `text-secondary` no
glifo = `#002443` no claro e `#f1f5f9` no escuro — forte nos dois. **Correto e obrigatório.**

| Estado | `textContent` | Classes alternadas |
|---|---|---|
| inativo | `unfold_more` | `text-slate-400 opacity-40` |
| ativo ↑ (crescente) | `keyboard_arrow_up` | `text-secondary opacity-100` |
| ativo ↓ (decrescente) | `keyboard_arrow_down` | `text-secondary opacity-100` |

Classes **constantes** do glifo (nunca removidas):
`material-symbols-outlined text-[14px] leading-none transition-opacity group-hover:opacity-100`

`opacity-40` e `opacity-100` **nunca coexistem** (troca é add/remove do par inteiro) —
se coexistissem, quem ganha depende da ordem no CSS gerado pelo CDN, não da ordem no
`class`. Já `group-hover:opacity-100` pode ficar permanente: `.group:hover .group-hover\:opacity-100`
tem especificidade maior que `.opacity-40`, então vence por especificidade (não por ordem),
e é inócua quando o estado já é `opacity-100`.

### 1.4 Markup exato — cabeçalho ordenável canônico

Exemplo real da coluna **Favorecido** (substitui a linha 301 na íntegra):

```html
<th data-cp-sort="favorecido"
    class="px-4 py-3 text-left font-bold text-on-surface-variant uppercase tracking-widest group cursor-pointer select-none hover:bg-primary/10 transition-colors">
    <div role="button" tabindex="0" title="Ordenar por Favorecido"
         class="inline-flex items-center gap-1 whitespace-nowrap rounded focus:outline-none focus:ring-2 focus:ring-primary/30">
        Favorecido<span data-cp-sort-ico="favorecido"
            class="material-symbols-outlined text-[14px] leading-none transition-opacity group-hover:opacity-100 text-slate-400 opacity-40">unfold_more</span>
    </div>
</th>
```

Notas de implementação que **não são negociáveis**:
- **`inline-flex`, não `flex`.** Um bloco `inline-flex` obedece ao `text-align` que o `<th>`
  já tem, então as três variantes de alinhamento da tabela (`text-left`, `text-center`,
  `text-right`) continuam valendo **sem** precisar de `justify-center`/`justify-end` por
  coluna (o CRF precisa, porque usa `flex`). Nenhuma classe de alinhamento existente é
  tocada.
- **`group` no `<th>`** (é o elemento com hover) e `group-hover:` no `<span>`.
- **`whitespace-nowrap`** no wrapper: impede que rótulo e glifo quebrem em duas linhas nas
  colunas estreitas (`w-20` do Código, `w-28` de Vencimento/Status).
- **`focus:ring-primary/30`** espelha o foco já usado no arquivo (linha 296, checkbox do
  cabeçalho). Alpha de marca ⇒ visível nos dois temas.
- O glifo é irmão **imediato** do texto, sem espaço em branco antes do `<span>` (o `gap-1`
  é quem separa) — espaço extra some no `inline-flex`, mas mantém o diff limpo.
- `transition-colors` no `<th>` (fundo) e `transition-opacity` no `<span>`: as duas já são
  vocabulário do arquivo.

### 1.5 As 7 colunas — parâmetros por coluna

| `<th>` | `data-cp-sort` | Alinhamento atual (preservar) | Posição do glifo | `title` |
|---|---|---|---|---|
| 298 Status | `status` | `text-center w-28` | depois do rótulo | `Ordenar por Status` |
| 299 Vencimento | `vencimento` | `text-left w-28` | depois do rótulo | `Ordenar por Vencimento` |
| 300 Código | `codigo` | `text-left w-20` | depois do rótulo | `Ordenar por Código` |
| 301 Favorecido | `favorecido` | `text-left` | depois do rótulo | `Ordenar por Favorecido` |
| 302 Despesa | `despesa` | `text-left` | depois do rótulo | `Ordenar por Despesa` |
| 304 CC | `cc` | `text-left` | depois do rótulo | `Ordenar por Centro de Custo` |
| 311 Valor | `valor` | `text-right font-bold text-secondary` | **antes** do rótulo | `Ordenar por Valor` |

**Única variante intencional — coluna Valor.** É a única coluna `text-right`, alinhada com
números `tabular-nums`/`font-mono` embaixo. Glifo à direita do rótulo empurraria "VALOR"
~18px para dentro, desalinhando o cabeçalho da coluna de dinheiro. Logo, **no Valor o
`<span>` vem antes do texto**; em todas as outras vem depois. O `text-secondary` já
existente no `<th>` 311 **fica como está** (não remover, não "consertar" — ver 1.3).

A coluna Vencimento ordena por `data_vencimento` (a data que a própria célula exibe,
linha 2265), não por competência — o rótulo continua "Vencimento", sem sufixo.

### 1.6 Estado na abertura da tela

A consulta já chega ordenada por `data_vencimento desc` (linha 1270). Então:

- **Preferido:** semear o estado como `vencimento` / decrescente, e o `<th>` 299 nasce com
  `keyboard_arrow_down` + `text-secondary opacity-100`. O indicador passa a dizer a verdade
  sobre a ordem exibida, de graça.
- Se a implementação **não** semear (ou se algum passo posterior reordenar o cache), então
  **todos** os 7 nascem `unfold_more` inativos. **Proibido** mostrar seta ativa numa ordem
  que a tabela não está seguindo.

Ao trocar de coluna/direção, a paginação volta para a **página 1** (mesmo comportamento já
adotado quando o recorte muda, linha 5571) — senão o operador ordena e continua vendo o
meio da lista.

### 1.7 Acessibilidade — seguir o precedente do próprio arquivo

O arquivo já tem superfície clicável que não é `<button>`: os cards de KPI, linhas
**122, 138, 151, 164, 177, 190** — `<div data-kpi-card="…" role="button" tabindex="0"
title="…">` + `cursor-pointer select-none`, com clique delegado no container e
`keydown` de Enter/Space (5614-5631). **É esse padrão que se copia.**

Decisões:
- **Não** transformar o `<th>` em `<button>`: nenhum `<button>` no arquivo mora dentro de
  `<th>`, e o hover/afordância precisa cobrir a célula inteira (com `<button>` interno,
  padding e largura teriam de ser reconstruídos).
- **`role="button" tabindex="0"` vai no `<div>` interno, não no `<th>`.** Pôr
  `role="button"` no `<th>` destruiria a semântica implícita `columnheader` da tabela; no
  `<div>` interno, a tabela continua tabela e a superfície continua acionável por teclado.
- Clique e `keydown` (Enter/Space, com `preventDefault`) **delegados no `<thead>`** via
  `e.target.closest('[data-cp-sort]')`, espelhando 5614-5631. Ignorar o clique quando o
  alvo é o checkbox `#cp-selecionar-todos` (a coluna 295 não tem `data-cp-sort`, então o
  `closest` já devolve `null` — só não introduzir `data-cp-sort` no `<tr>` ou no `<thead>`).
- **Não** adicionar `aria-sort`. O arquivo tem exatamente 1 uso de ARIA
  (`aria-readonly`, linha 5449) e nenhum `aria-live`/`aria-sort`. Padronizar ARIA de tabela
  aqui seria padrão isolado — mesmo raciocínio que descartou `role="dialog"` na spec
  anterior (§3.8). Fica como candidato a OS própria de a11y.

### 1.8 Colunas que NÃO ordenam — ficam byte a byte iguais

Linhas **295** (checkbox master), **303** (Detalhe / Obs.), **310** (Gestor) e **312**
(Ações). Sem `cursor-pointer`, sem `group`, sem glifo, sem `data-cp-sort`. A ausência de
afordância nessas 4 é informação correta: elas realmente não ordenam. Não "uniformizar".

---

## 2. Janela de 6 meses — impacto visual indireto

### 2.1 `cp-janela-info` (351) e a contagem — cabe, mas o número precisa de milhar

Pior caso realista: `Exibindo: Mar/2026 → Ago/2026 · 28.415 lançamento(s) em cache`
= **61 caracteres** a 11px ≈ 340px. A barra é `flex justify-between` num card cuja largura é
ditada pelas 11 colunas da tabela (>1100px) e o botão à direita ocupa ~190px. **Cabe com
folga; nenhum ajuste de layout, nenhuma classe de largura, nenhum `truncate`.**

Dois ajustes pontuais, esses sim necessários:
- **Linha 1350** — `cacheRegistros.length` entra cru no template e renderia `28415`. Trocar
  por `cacheRegistros.length.toLocaleString('pt-BR')` → `28.415`. É a mesma convenção já
  usada na linha 2231 do próprio arquivo.
- **Linha 351** — acrescentar **`tabular-nums`** ao span (`text-[11px] font-medium
  text-slate-500 tabular-nums`). Número que muda a cada snapshot não deve dançar de largura.
  Classe neutra de tema. Nada mais muda nesse span.

O rótulo do botão **"Carregar mês anterior" continua correto e intocado** (352): ele recua
1 mês por clique, independente de a janela abrir com 1 ou com 6.

### 2.2 `cp-hint-recorte` (281) — envelope confirmado, texto do hint intocado

`_cpFmtJanelaCurto` (1328-1335) usa **só as duas pontas** da janela, então o comprimento não
cresce com a quantidade de meses. Variante longa com 6 meses:
`Nada encontrado em Mar/2026 → Ago/2026.` = **39 caracteres** — idêntico ao medido na
auditoria anterior (§9.4) e abaixo da string preexistente do mesmo span
(`Sem dados — importe a Base Mestra e um TXT.`, 43). Todos os nomes de mês têm 3 letras
(`_MESES_PT_CP`, 1213), então 39 é o teto por construção. **Confirmado: nada a ajustar em
2217 nem nas classes do span.**

### 2.3 Estado de carregamento da abertura — existe componente para reusar, mas NÃO é o overlay

Hoje `#cp-vazio` (356) **não tem `hidden`** na classe inicial: "Nenhum lançamento
encontrado" é pintado no primeiro paint e só sai quando `renderTabela` roda (2221). Com 1
mês isso era a pendência não bloqueante da OS anterior; com 6 meses e ~28.000 docs a tela
**afirma por vários segundos que não há lançamentos**. Isso passa de cosmético a errado e
entra nesta OS.

**O que NÃO usar:** `#cp-loader-overlay` / `_cpMostrarLoader` (635-641, 5358). É um scrim
`fixed inset-0 z-[90]` que cobre **a sidebar inteira** e cuja mensagem é "Mantenha esta aba
aberta" — está reservado a importação/gravação, que é bloqueante por natureza. Usá-lo na
abertura trancaria o operador dentro do módulo durante a carga, sem poder navegar para
outra tela. Abrir uma tela não é operação bloqueante.

**Solução — 4 edições de markup, zero componente novo, zero JS de limpeza:**

1. **356** — `#cp-vazio` nasce com `hidden`:
   `class="hidden px-8 py-16 text-center"`. `renderTabela` já faz
   `remove('hidden')`/`add('hidden')` (2206/2221), então o estado vazio real continua
   funcionando **sem nenhuma linha de JS nova**.
2. **350** — `#cp-carregar-mais-bar` nasce visível: `hidden` → `flex`
   (`class="flex items-center justify-between gap-3 px-6 py-3 border-t border-slate-100 bg-white"`).
   `_cpAtualizarUICarregarMais` (1351) já garante `flex` depois.
3. **352** — `#cp-btn-carregar-mais` nasce com `hidden` (`class="hidden inline-flex …"`),
   porque a barra passou a aparecer antes de existir janela. A linha 1353 já faz
   `toggle('hidden', !_cpJanelaIni)` e assume o controle no primeiro snapshot.
4. **351** — conteúdo inicial do `#cp-janela-info` passa a ser spinner + texto:

```html
<span id="cp-janela-info" class="text-[11px] font-medium text-slate-500 tabular-nums">
    <span class="material-symbols-outlined text-[14px] leading-none text-primary spin align-middle">progress_activity</span>
    Carregando os últimos 6 meses… pode levar alguns segundos.
</span>
```

O glifo `progress_activity` + a classe `.spin` (declarada em **43**, usada em **637**) já são
o vocabulário de "carregando" do módulo — nada novo. E como 1350 escreve
`info.textContent = …`, o spinner é **descartado automaticamente** no primeiro update:
nenhum código de teardown, nenhum risco de spinner órfão girando para sempre.

5. **281** — texto estático inicial do `#cp-hint-recorte` passa de
   `Mostrando todos os registros` para **`Carregando…`**. Hoje ele afirma "todos os
   registros" numa tela que carrega uma janela — mentira que agora dura segundos.
   `renderTabela` sobrescreve no primeiro render (2215/2229). De quebra sai o vocabulário
   "registros" (o operador lida com **lançamentos**), nit §9.7 da spec anterior.

**Nada além disso.** Não criar skeleton de linhas, não criar overlay, não pôr
`animate-pulse` no card da tabela, não adicionar barra de progresso.

---

## 3. O que fica INTOCADO (fronteira do engenheiro)

- **`assets/checkbox_multi.js`, `theme.css`, `theme_manager.js` — zero alterações.**
  Nenhum token novo é necessário nesta OS.
- **`<thead>` 288** (`bg-slate-50 border-b border-slate-100 text-[10px]`) e o `<tr>` 289:
  classes inalteradas. Nada de `sticky`, nada de `shadow`, nada de `border-r` entre colunas
  (o CRF tem; **não importar** — a tabela do CP é sem grade vertical de propósito).
- **`<th>` 295, 303, 310, 312** (1.8) e o `<tbody id="cp-corpo">` 315 com
  `divide-y divide-slate-50`.
- **Todo o markup das `<td>`** (2261-2270+): `font-mono`, `tabular-nums`, `text-tertiary`
  do Código, badges de status (`BADGE_MAP`, 2191-2197), coluna Valor. Ordenação não muda
  como a célula é pintada.
- **Alinhamento, `w-20`/`w-28` e rótulos textuais** das 7 colunas ordenáveis: só entram
  `data-cp-sort`, o wrapper e o glifo. "Vencimento" não vira "Vencimento ↓" no texto.
- **`#cp-paginacao`** (321-343) inteiro: markup, botões e glifos
  (`first_page`/`chevron_*`/`last_page`).
- **`#cp-loader-overlay`** (635-641), `cpMostrarLoader`/`cpEsconderLoader` (5358-5371):
  usar em importação como hoje, **não** tocar e **não** chamar na abertura (2.3).
- **`#cp-vazio`**: o `<h4>` "Nenhum lançamento encontrado" (360), o ícone `inbox` (358) e o
  `<p>` (361-363, escrito na OS anterior) ficam **iguais** — só a classe `hidden` entra.
- **`modal-filtros-cp`** inteiro (643-766) e o **`modal-cp-periodo-pesado`** da OS anterior
  (775-797), inclusive copy, `z-[84]` e overlay de id próprio. Os limiares
  `CP_LIMITE_AVISO_PERIODO` / `CP_LIMITE_AVISO_MESES` (2157-2158) **não são um item de
  design** — se a janela padrão de 6 meses fizer o aviso disparar em situação indevida,
  **reportar ao coordenador**, não recalibrar por conta própria.
- **KPIs, `[data-kpi-card]`, `_cpAtualizarKPIsAtivos`** (5576-5613) e o chip
  `cp-chip-filtros`.
- **Regra permanente do projeto:** nenhum rótulo de valor visível vira hover. Aqui vale em
  dobro — a **seta de direção da coluna ativa é estado persistente, nunca só no hover**.
  Só a *prominência da seta inativa* depende do hover; a informação (qual coluna, qual
  direção) fica fixa na tela.

---

## 4. Tokens de `theme.css` — referência desta OS

`theme.css` não é paleta; ele remapeia **classes utilitárias em repouso** para tokens no
dark. Usar as classes da coluna esquerda entrega os dois temas de graça.

| Classe usada aqui | Token no dark | `theme.css` |
|---|---|---|
| `text-on-surface-variant` (rótulo do `<th>`) | `--text-secondary` | 96-106 (+ 161, que força `thead th`) |
| `text-secondary` (glifo **ativo**) | `--text-primary` (`#f1f5f9`) | 76-94 |
| `text-slate-400` (glifo **inativo**) | `--text-muted` (`#94a3b8`) | 108-114 |
| `text-slate-500` (`cp-janela-info`) | `--text-secondary` | 96-106 |
| `bg-white` / `bg-slate-50` (barra / thead) | `--bg-card` / `--bg-card-elev` (thead → `--bg-thead`) | 44-54, 160 |
| `border-slate-100` | `--border-subtle` | 65-69 |
| `hover:bg-primary/10`, `focus:ring-primary/30`, `text-primary` (spinner) | — (alpha/brand, idêntico nos 2 temas) | n/a — é o ponto |
| `opacity-40` / `opacity-100` / `tabular-nums` / `whitespace-nowrap` / `select-none` | — (neutras) | n/a |

**Lista negra desta OS (não podem aparecer no diff):**
`hover:bg-slate-50`, `hover:bg-slate-100`, `hover:text-secondary`, `hover:text-slate-*`,
`group-hover:text-secondary`, `group-hover:text-slate-*` (todas as variantes `hover:`/
`focus:`/`group-hover:` de cinza/`secondary` são **cegas ao dark** — §9.1 anterior);
`text-slate-300` (sem cobertura, inverte de sentido no dark); `text-brandMidBlue`
(inexistente neste `tailwind.config`); `bg-amber-100`, `border-amber-100`, `text-amber-500`,
`text-amber-600` (lista negra herdada, §6 anterior).

**Zero hex novo no diff.** Nenhum `#hex`, `rgb()`, `style="color:…"` ou `text-[#…]` inédito.

---

## 5. Checklist da minha auditoria pós-implementação

Rodo `git diff gerenciador_contas_pagar_desktop/code.html` e verifico:

1. **Escopo** — só os 4 pontos da §0. `assets/checkbox_multi.js`, `theme.css`,
   `theme_manager.js` com 0 linhas.
2. **Lista negra da §4 ausente** do diff — em especial **nenhum `hover:bg-slate-*` novo** e
   nenhum `group-hover:text-*` de cinza/`secondary`.
3. **Zero cor hardcoded nova**; zero token inventado.
4. **7 `<th>` com `data-cp-sort`** e nenhum a mais: 295, 303, 310, 312 sem afordância de
   clique.
5. **Glifos** são exatamente `unfold_more` / `keyboard_arrow_up` / `keyboard_arrow_down`
   (1.1). Nenhum glifo alternativo, nenhum `▲`/`▼` textual.
6. **Cor do estado ativo mora no `<span>`**, não no `<th>` (senão `theme.css:161` achata no
   dark). `text-secondary` do `<th>` 311 preservado.
7. **`opacity-40` e `opacity-100` nunca coexistem** na mesma `class` do glifo, em nenhum
   estado (inspeção no DOM, os 3 estados).
8. **Alinhamentos preservados**: `text-center` no Status, `text-right` no Valor com o glifo
   **antes** do rótulo, `text-left` nos outros 5. `w-20`/`w-28` intactos e **sem quebra de
   linha** no cabeçalho na janela mais estreita que o módulo suporta.
9. **A11y conforme 1.7**: `role="button" tabindex="0"` no `<div>` interno (nunca no `<th>`),
   delegação de `click` + `keydown` Enter/Space, **nenhum `aria-sort`**. Navegação por Tab
   alcança os 7 e o anel de foco (`focus:ring-primary/30`) é visível nos dois temas.
10. **Estado inicial honesto** (1.6): ou seta ativa em Vencimento ↓ *com* o cache realmente
    em `data_vencimento desc`, ou os 7 inativos.
11. **Carregamento (2.3)**: `#cp-vazio` com `hidden` inicial; barra visível com spinner
    `progress_activity` + `.spin`; botão "Carregar mês anterior" oculto até o 1º snapshot;
    `#cp-hint-recorte` inicial = `Carregando…`. E: recarregar a tela e confirmar que
    **"Nenhum lançamento encontrado" não aparece** durante a carga dos 6 meses, e que o
    spinner **desaparece** quando o rodapé atualiza.
12. **Estado vazio real não regrediu**: com filtro impossível, `#cp-vazio` volta a aparecer
    e o hint mostra `Nada encontrado em <Mês>/<Ano> → <Mês>/<Ano>.` sem estourar a barra.
13. **Rodapé**: contagem em pt-BR com milhar (`28.415`) e `tabular-nums`; texto completo
    de 6 meses sem truncar nem empurrar o botão.
14. **Os dois temas, os três estados**: claro e escuro, com (a) nenhuma coluna ordenada,
    (b) coluna ativa ↑, (c) coluna ativa ↓, e (d) **hover** em cabeçalho ordenável e em
    cabeçalho não ordenável. No escuro: fundo de hover visível e não esbranquiçado, glifo
    inativo perceptivelmente mais fraco que o rótulo, glifo ativo claramente mais forte.
15. **`transition`** presente (sem piscar duro) e **sem `animate-pulse`** em nenhum ponto
    novo.

Achado eu **reporto ao coordenador**; quem corrige é o engenheiro-frontend.

---

## 6. Riscos conhecidos

1. **Risco #1 — hover cego no tema escuro.** Copiar o `<th>` do Contas a Receber traz
   `hover:bg-slate-50` + `group-hover:text-brandMidBlue`. O primeiro dá flash quase-branco
   no dark (§9.1 anterior, achado já corrigido uma vez neste mesmo arquivo na linha 801); o
   segundo é classe inexistente neste módulo e simplesmente não faz nada. É o erro mais
   provável desta OS.
2. **Cor de estado ativo aplicada no `<th>`.** `theme.css:161` tem `!important` em
   `thead th` — funcionaria no claro e sumiria no escuro. Sintoma clássico de "funciona na
   minha tela": quem testa só no tema claro não vê.
3. **Largura das colunas estreitas.** `Código` (`w-20`) e `Vencimento`/`Status` (`w-28`) com
   rótulo `uppercase tracking-widest` + glifo de 14px podem estourar a largura sugerida e
   fazer a tabela redistribuir alguns pixels. `whitespace-nowrap` evita a quebra de linha,
   mas a redistribuição horizontal precisa ser olhada em tela. O `<thead>` também pode
   crescer ~3px de altura (glifo 14px num rótulo de 10px) — esperado e aceitável.
4. **`#cp-vazio` com `hidden` inicial + falha de leitura.** Se o primeiro snapshot nunca
   chegar (erro de permissão, offline), `renderTabela` pode não rodar e a tela fica com o
   spinner girando e nenhum estado vazio. É trade-off aceito (hoje o comportamento é o
   oposto e pior: afirmar "sem lançamentos" antes de saber), mas o engenheiro deve
   confirmar que o caminho de erro existente ainda produz alguma mensagem — se não
   produzir, **reportar**, não improvisar componente de erro.
5. **Sorting × paginação × snapshot.** A tabela é paginada em 50 linhas (2148) e recebe
   `onSnapshot` contínuo. Se a ordenação for aplicada só na página visível, o operador vê
   "ordenado" que muda de conteúdo ao paginar — e o indicador de direção passa a mentir.
   Do ponto de vista visual, a única saída aceitável é ordenar o recorte inteiro
   (`_cpUltimosFiltrados`) antes do slice, e a seta é o contrato dessa promessa.
6. **~28.000 lançamentos em memória + reordenação a cada clique.** Se a ordenação
   engasgar visivelmente, a resposta **não** é inventar spinner de ordenação nesta OS —
   é reportar ao coordenador.
7. **Limiar do aviso de período pesado (2157) vs. janela padrão de 6 meses.** 6 meses
   típicos (~28.000) passam de 15.000. Se o aviso passar a disparar em fluxos onde antes
   não disparava, isso muda a percepção do modal criado na OS anterior — decisão de
   produto/limiar, **escalar**, não ajustar.
