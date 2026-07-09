# OS-APROVACAO-MODAL-02 -- Spec de Diff Visual

## Escopo: modal `modal-apv-detalhes` + coluna OPERACAO da tabela

### O que MUDA

#### 1. Coluna OPERACAO da tabela (funcao `badgeOperacao` + `descricaoHumana`)
- **HOJE**: Badge generica ("COMPOSTA", "EDICAO", etc.) via `badgeOperacao()`.
- **DEPOIS**: Para solicitacoes que possuem campo `resumo`, usar o `resumo` como texto
  descritivo no lugar do rotulo generico da badge na coluna "O que esta sendo solicitado".
  A badge de tipo (cor + icone) permanece na coluna OPERACAO.
- Impacto no HTML: nenhum -- e mudanca no JS (`descricaoHumana` / `badgeOperacao`).

#### 2. Conteudo do modal de detalhes (funcao `abrirDetalhes`, linhas 960-1028)
- **HOJE para UPDATE**: Ja existe grid 2 colunas com `_renderCardCampos('Antes', amber)`
  e `_renderCardCampos('Depois', emerald)` -- linha 1021.
- **DEPOIS para UPDATE**: Renomear os cards:
  - "Antes" -> "Status Atual" com borda left vermelha/slate (indicando estado que sera substituido).
  - "Depois" -> "Alteracao Proposta" com borda left verde/emerald (indicando o que o Master propos).
  - Adicionar `border-l-4` nos cards para reforcar a semantica visual:
    - Status Atual: `border-l-4 border-l-red-400` (light) / usa override dark existente de red.
    - Alteracao Proposta: `border-l-4 border-l-emerald-400` (light) / usa override dark existente de emerald.
- **HOJE para BATCH_COMPOUND**: Lista crua numerada (#1 Criar, #2 Editar...) dentro de
  um unico card purple.
- **DEPOIS para BATCH_COMPOUND**: Dois cards lado a lado:
  - Card "Status Atual": Mostra `dados_antigos` se existir (estado antes da operacao composta).
    Se `dados_antigos` for null, mostrar "Operacao de criacao -- sem estado anterior".
    Borda: `border-l-4 border-l-slate-400`.
  - Card "Alteracao Proposta": Mostra resumo das operacoes compostas (reutilizar o HTML
    existente das linhas 1001-1015, mas dentro do card com borda emerald).
    Borda: `border-l-4 border-l-emerald-400`.
- **Para CREATE/DELETE/IMPORT_BATCH**: Manter layout atual (card unico) -- nao ha "antes vs depois" nesses casos.

#### 3. Botao "Realizar Alteracoes" no rodape do modal
- **HOJE**: Rodape tem apenas botao "Fechar" (linha 204-206).
- **DEPOIS**: Adicionar botao primario "Realizar Alteracoes" ao lado de "Fechar".
  - Visivel APENAS para `_isSuperAdmin` (mesma logica dos botoes Aprovar/Rejeitar).
  - Visivel APENAS quando `tipo_operacao` for UPDATE ou BATCH_COMPOUND (casos com edicao).
  - Classes do botao (reutilizar padrao do botao "Confirmar Rejeicao" adaptado):
    ```
    inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl
    bg-emerald-600 text-white text-xs font-bold
    shadow-lg shadow-emerald-600/20
    hover:bg-emerald-700 active:scale-95 transition-all
    ```
  - Icone: `edit_note` (Material Symbols).
  - Ao clicar: fecha o modal de detalhes e abre o segundo modal (item 4).

#### 4. Segundo modal: "Revisao e Aprovacao" (`modal-apv-editar`)
- **Novo elemento HTML** -- modal z-[85] (entre detalhes z-[75] e rejeicao z-[80]).
- Estrutura identica aos modais existentes (copiar esqueleto de `modal-apv-rejeicao`):
  - Overlay: `bg-slate-900/60 backdrop-blur-sm`
  - Card: `bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-100 max-h-[92vh] flex flex-col overflow-hidden`
  - Header: Icone `edit_note` em fundo `bg-emerald-50`, titulo "Revisao e Aprovacao",
    subtitulo com nome da entidade. Botao X para fechar.
  - Corpo (`flex-1 overflow-y-auto px-7 py-5`):
    - Campos pre-preenchidos com `dados_novos` da solicitacao.
    - Cada campo em layout de formulario vertical (label + input), **NAO** grid 2 colunas
      (para dar espaco de edicao).
    - Labels: `text-[11px] font-bold text-slate-500 uppercase tracking-wider` (padrao ja
      usado no modal de rejeicao, linha 232).
    - Inputs: `w-full px-4 py-3 border border-slate-200 rounded-xl text-xs text-slate-700
      font-medium outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400
      transition-all` (adaptar do textarea de rejeicao, linha 234, trocando red por emerald).
    - Campos monetarios (`valor_original`): manter `font-mono tabular-nums`.
    - Campos somente-leitura (ex: `codigo`, `colecao_alvo`): adicionar `bg-slate-50 cursor-not-allowed` e `readonly`.
  - Rodape:
    - Botao secundario "Cancelar": `px-5 py-2.5 text-xs font-bold text-slate-500 hover:text-secondary transition-colors`
    - Botao primario "Salvar e Aprovar":
      ```
      inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl
      bg-emerald-600 text-white text-xs font-bold
      shadow-lg shadow-emerald-600/20
      hover:bg-emerald-700 active:scale-95 transition-all
      disabled:opacity-60 disabled:cursor-not-allowed
      ```
    - Icone do botao: `check_circle`, com classe `spin` durante processamento (padrao existente).

---

### O que fica INTOCADO

1. **Header do modal de detalhes** (linhas 189-201): icone policy, titulo "Detalhes da solicitacao", subtitulo, botao X. Nenhuma mudanca.
2. **Card de cabecalho interno** (funcao `abrirDetalhes`, variavel `cabecalho`): badge de operacao, data, solicitante, e-mail, colecao, resumo. Intocado.
3. **Modal de rejeicao** (`modal-apv-rejeicao`): intocado.
4. **KPIs e filtros da tabela principal**: intocados.
5. **Toast e Loader overlay**: intocados.
6. **Logica de aprovacao** (`aprovarSolicitacao`): intocada nesta OS (o segundo modal chama a mesma funcao, apenas com dados possivelmente editados).

---

### Tokens do theme.css a usar

| Elemento | Token/classe Light | Override Dark existente? |
|---|---|---|
| Fundo do card "Status Atual" | `bg-amber-50/40` (ja usado) | `bg-amber-50` -> sim (linha 189) |
| Fundo do card "Alteracao Proposta" | `bg-emerald-50/40` (ja usado) | `bg-emerald-50` -> sim (linha 192) |
| Borda left vermelha | `border-l-red-400` | Texto red ja tem override; borda red nao precisa (vermelho claro legivel em dark) |
| Borda left emerald | `border-l-emerald-400` | Idem -- cor media, legivel em ambos temas |
| Borda left slate | `border-l-slate-400` | `border-slate-*` -> sim, coberto genericamente |
| Fundo modal editar | `bg-white` | `var(--bg-modal)` via `html.dark .bg-white.rounded-2xl` (linha 178) |
| Input no modal editar | `border-slate-200` | `var(--border-subtle)` via override generico (linha 168) |
| Focus ring emerald | `focus:ring-emerald-200 focus:border-emerald-400` | Sem override dedicado, mas tints claros sao seguros |
| Botao primario emerald | `bg-emerald-600 text-white` | Cor solida, nao precisa de override |
| Overlay | `bg-slate-900/60 backdrop-blur-sm` | Funciona em ambos temas (ja usado nos 3 modais existentes) |

---

### Risco de tema escuro: bg-purple-50/40

O card BATCH_COMPOUND atual usa `bg-purple-50/40` (linha 1009). `bg-purple-50` **NAO tem
tint dark** no `theme.css` (diferente de red-50, amber-50, emerald-50 que tem). Se o
redesenho mantiver o purple para BATCH_COMPOUND, o engenheiro-frontend deve adicionar a
linha correspondente no `theme.css`:

```css
html.dark .bg-purple-50 { background-color: rgba(168, 85, 247, 0.12) !important; }
```

Mesma logica para `border-purple-100` e `border-purple-200` se usados.

---

### Padrao existente a reutilizar

- **Grid 2 colunas para cards diff**: Ja existe em `aprovacoes_desktop/code.html` linha 1021:
  `grid grid-cols-1 md:grid-cols-2 gap-3`. REUSAR, nao recriar.
- **Funcao `_renderCardCampos`** (linhas 876-928): Ja renderiza card com titulo, icone,
  dl de campos. Adicionar parametro opcional para `border-l-4 border-l-{cor}` ou aplicar
  no wrapper externo.
- **Esqueleto de modal**: Copiar estrutura de `modal-apv-rejeicao` (linhas 217-246) que
  ja segue o padrao exato (overlay, card, header, corpo, rodape).
- **Padrao de label/input de formulario**: Copiar de `modal-apv-rejeicao` (label linha 232,
  textarea linha 233-235), adaptando para inputs text/number.

---

### Resumo de entregas para o engenheiro-frontend

1. Na funcao `badgeOperacao` / coluna da tabela: nao mudar. Na `descricaoHumana`: se `s.resumo` existir, usa-lo como titulo principal da descricao (ja parcialmente feito na linha 401/469).
2. Na funcao `abrirDetalhes`, caso UPDATE: renomear "Antes"->"Status Atual", "Depois"->"Alteracao Proposta"; adicionar `border-l-4` com cores semanticas nos cards.
3. Na funcao `abrirDetalhes`, caso BATCH_COMPOUND: converter para grid 2 colunas com card de estado anterior + card de operacoes propostas.
4. Adicionar botao "Realizar Alteracoes" no rodape do modal de detalhes (condicional a super_admin + UPDATE/BATCH_COMPOUND).
5. Criar novo modal `modal-apv-editar` com formulario pre-preenchido editavel + botao "Salvar e Aprovar".
6. Adicionar `bg-purple-50` no `theme.css` para dark mode.
