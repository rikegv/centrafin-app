# OS-FILTROS-MULTI-BLOCO-1 — Spec de diff visual

**Tela:** `dashboard_master_desktop/code.html` — modal `#modal-filtros` ("Filtros Avançados").
**Mudança:** os 5 `<select>` single viram multi-select por checkbox usando o componente
existente `assets/checkbox_multi.js`.
**Natureza:** iteração cirúrgica. Nada de redesign do modal.

---

## 1. Escopo — o que muda

Somente os 5 campos abaixo (linhas ~1147-1185 do arquivo):

| id | container | placeholder (texto exato) | `size` |
|---|---|---|---|
| `filtro-modal-cliente` | `div[data-filtro-campo="cliente"]` (col-span-1) | `Todos os Clientes` | `6` |
| `filtro-modal-comercial` | `div[data-filtro-campo="comercial"]` (col-span-1) | `Todos os Comerciais` | `5` |
| `filtro-modal-empresa` | `div[data-filtro-campo="empresa"]` (col-span-1) | `Todas` | `5` |
| `filtro-modal-regiao` | `div[data-filtro-campo="regiao"]` (col-span-1) | `Todas as Regiões` | `6` |
| `filtro-modal-servico` | `div[data-filtro-campo="servico"]` (col-span-2) | `Todos os Serviços` | `6` |

Placeholders são **exatamente** os textos de hoje (o `data-placeholder` é o que o operador
lê no botão quando nada está selecionado — não pode mudar o vocabulário da tela).
`size` é irrelevante em runtime (o `<select>` é escondido pelo upgrader, linha 47 do
componente), mas é mantido como fallback caso o JS falhe — mesma convenção do CRF/CP.

Cada select recebe: `multiple size="N" data-checkbox-multi data-placeholder="…"` e o
**option sentinela** `<option value="Todos" selected>…</option>` no lugar do
`<option value="">` de hoje.

> **Atenção obrigatória (comportamento, não estética):** o componente trata `"Todos"` como
> sentinela **hardcoded** (`var SENTINELA = 'Todos'`, linha 29). Sentinela com `value=""`
> não funciona: o "Limpar" interno, o religar-automático quando o operador desmarca tudo
> (linhas 239-241) e o label do botão (linhas 103-106) deixam de funcionar. Os populadores
> `preencherSelect` (~linha 2371) e o repopulador de Cliente da aba Contas a Receber
> (~linha 1291) hoje escrevem `'<option value="">Todos…'` — precisam passar a escrever
> `value="Todos" selected` e, ao final, disparar `el.dispatchEvent(new Event('cb-multi-sync'))`
> (padrão em `contas_a_receber_desktop/code.html:2961-2965`).

---

## 2. O PROBLEMA CRÍTICO: componente claro dentro de modal escuro

### 2.1 O que o componente injeta por conta própria (`assets/checkbox_multi.js`)

Todas as cores abaixo são **hardcoded claras**, direto no JS:

| Elemento | Linha | Classes injetadas (recorte) |
|---|---|---|
| Botão/trigger (a "pílula") | 61 | `border-slate-200 rounded-xl py-2.5 px-3.5 bg-white hover:border-primary/40 focus:ring-2 focus:ring-primary/30 focus:border-primary shadow-inner` |
| Label do trigger | 65 | `truncate text-slate-500` |
| Chevron | 66 | `text-slate-400 text-[18px]` |
| Label com 1+ seleção | 108-114 | troca `text-slate-500` por `text-slate-800 font-bold` |
| Panel modo portal | 77 | `fixed z-[200] bg-white border-slate-200 rounded-xl shadow-2xl max-h-64` |
| Panel modo normal | 82 | `absolute z-50 top-full bg-white border-slate-200 rounded-xl shadow-xl max-h-64` |
| "Nenhuma opção disponível." | 139 | `text-slate-400 italic` |
| Texto do item / sentinela | 152-154 | `text-slate-700` / `text-slate-700 border-b border-slate-100` |
| Linha (hover) | 157 | `hover:bg-primary/5` |
| Checkbox | 159 | `border-slate-300 text-primary focus:ring-primary/30` |
| "Nenhuma opção bate com…" | 169 | `text-slate-400 italic` |
| Header sticky da busca | 177 | `sticky bg-white border-b border-slate-100` |
| Input de busca + lupa | 179-182 | `text-slate-400` / `border-slate-200 focus:ring-primary/30 focus:border-primary` |

Conclusão: **o componente não tem variante dark e não lê nenhum token de `theme.css`.**
Não existe atributo de tema previsto. Colado como está no modal `bg-[#002443]`, ele
renderiza um retângulo **branco** com texto cinza-escuro dentro de um modal azul-marinho —
inaceitável, e pior ainda porque a barra de busca (`bg-white` sticky) aparece nos campos
com mais de 8 opções (Cliente, Serviço, Região certamente cairão nesse caso, ver linha 145).

### 2.2 Dois agravantes específicos desta página

**(a) `theme.css` piora, não resolve.** No tema escuro, `theme.css:44-45` remapeia
`.bg-white → var(--bg-card)` **com `!important`**, e `theme.css:80-94/97-106` remapeia
`.text-slate-700/800` e `.text-slate-500`. Resultado: no dark o painel fica cinza-chumbo
`#1c1f23` dentro de um modal azul — melhor que branco, mas ainda estranho — e, no claro,
fica branco puro. Além disso, esse `!important` define a regra de implementação abaixo:
**o CSS de escopo desta página PRECISA usar `!important`**, senão perde para o `theme.css`
no tema escuro. Como nosso seletor é ancorado em `#modal-filtros` (especificidade de ID),
com `!important` dos dois lados ele vence `html.dark .bg-white`.

**(b) A cor `primary` não existe nesta página.** O `tailwind.config` do
`dashboard_master_desktop/code.html` (linhas 15-25) define **apenas** `brandGreen`,
`brandDarkBlue`, `brandMidBlue`, `brandLightBlue`, `brandPaleBlue`, `brandAqua`,
`brandOrange`. Não há `primary`. Logo `hover:bg-primary/5`, `focus:ring-primary/30`,
`text-primary` e `border-primary` **não geram CSS nenhum** aqui: sem hover no item, sem
anel de foco, sem cor de marcação no checkbox. Isso precisa ser suprido explicitamente no
CSS de escopo (com `brandGreen`), não é opcional.
*(Alternativa descartada: adicionar `primary` ao `tailwind.config` da página. Resolveria só
o acento, continuaria com painel branco, e mexeria numa config global fora do escopo da OS.)*

### 2.3 Como contornar — SEM tocar no componente e SEM afetar os 19 usos existentes

**Regra de ouro: nenhuma linha de `assets/checkbox_multi.js` é alterada.** O contorno é um
bloco CSS **escopado em `#modal-filtros`**, dentro do `<style>` que já existe no head do
`dashboard_master_desktop/code.html` (linhas 36-103), inserido logo antes do `</style>` da
linha 103. Como o seletor exige o ancestral `#modal-filtros` desta página, nenhum dos 19
usos em produção (CP, CRF, master, custo_folha) é alcançado.

As regras **não** são condicionadas a `html.dark`: o modal é escuro nos dois temas do app
(cor de marca hardcoded no legado), então o multi-select tem que ficar escuro nos dois.

Bloco a implementar (copiar como está; comentário incluído é parte do entregável):

```css
/* ── Multi-select por checkbox (assets/checkbox_multi.js) dentro do modal DARK
   de Filtros Avançados. O componente injeta classes CLARAS hardcoded
   (bg-white / slate-* / primary-*, ver linhas 61-66, 77-82, 139-182 dele).
   Aqui elas são remapeadas para a paleta do modal, em ESCOPO LOCAL — o
   componente não é alterado e os demais módulos (CP/CRF/master) não são afetados.
   `!important` é obrigatório: theme.css:44-45 e 80-106 remapeiam .bg-white e
   .text-slate-* com !important no tema escuro. Especificidade de ID vence. */
#modal-filtros {
  --dm-f-surface: #0a192f;              /* mesma superfície dos inputs de data */
  --dm-f-panel-bg: #0a192f;
  --dm-f-border: #1a4895;               /* brandMidBlue */
  --dm-f-text: #ffffff;
  --dm-f-muted: #bfd7ea;                /* brandPaleBlue */
  --dm-f-accent: #aad12f;               /* brandGreen */
  --dm-f-hover: rgba(170, 209, 47, 0.12);
  --dm-f-hairline: rgba(255, 255, 255, 0.10);
}

/* Trigger: geometria alinhada aos inputs de data do modal (rounded-lg / px-3 py-2) */
#modal-filtros .cb-multi-trigger {
  background: var(--dm-f-surface) !important;
  border-color: var(--dm-f-border) !important;
  border-radius: 0.5rem !important;
  padding: 0.5rem 0.75rem !important;
  box-shadow: none !important;
}
#modal-filtros .cb-multi-trigger:hover,
#modal-filtros .cb-multi-trigger:focus,
#modal-filtros .cb-multi-trigger:focus-visible {
  border-color: var(--dm-f-accent) !important;
  box-shadow: none !important;
  outline: none !important;
}
#modal-filtros .cb-multi-trigger [data-cb-label] { color: var(--dm-f-muted) !important; }
#modal-filtros .cb-multi-trigger [data-cb-label].text-slate-800 { color: var(--dm-f-text) !important; }
#modal-filtros .cb-multi-trigger [data-cb-chevron] { color: var(--dm-f-muted) !important; }

/* Panel */
#modal-filtros .cb-multi-panel {
  background: var(--dm-f-panel-bg) !important;
  border-color: var(--dm-f-border) !important;
  box-shadow: 0 18px 40px -12px rgba(0, 0, 0, 0.65) !important;
  max-height: min(16rem, 42vh) !important;
  color-scheme: dark;
}
#modal-filtros .cb-multi-panel > p { color: var(--dm-f-muted) !important; }

/* Itens */
#modal-filtros .cb-multi-row span { color: var(--dm-f-text) !important; }
#modal-filtros .cb-multi-row:hover { background: var(--dm-f-hover) !important; }
#modal-filtros .cb-multi-row.cb-multi-sent span {
  color: var(--dm-f-accent) !important;
  border-bottom-color: var(--dm-f-hairline) !important;
}
#modal-filtros .cb-multi-row input[type="checkbox"] {
  accent-color: var(--dm-f-accent);
  background-color: var(--dm-f-surface);
  border-color: var(--dm-f-border) !important;
}

/* Busca interna (aparece com > 8 opções — checkbox_multi.js:145) */
#modal-filtros .cb-multi-busca-wrap {
  background: var(--dm-f-panel-bg) !important;
  border-bottom-color: var(--dm-f-hairline) !important;
}
#modal-filtros .cb-multi-busca-wrap .material-symbols-outlined { color: var(--dm-f-muted) !important; }
#modal-filtros [data-cb-busca] {
  background: #002443 !important;
  border-color: var(--dm-f-border) !important;
  color: var(--dm-f-text) !important;
}
#modal-filtros [data-cb-busca]::placeholder { color: var(--dm-f-muted) !important; opacity: 0.7; }
#modal-filtros [data-cb-busca]:focus {
  border-color: var(--dm-f-accent) !important;
  box-shadow: none !important;
}

/* Scrollbar do panel — mesma receita do .custom-scroll da página (linhas 62-74) */
#modal-filtros .cb-multi-panel::-webkit-scrollbar { width: 6px; }
#modal-filtros .cb-multi-panel::-webkit-scrollbar-track { background: rgba(26, 72, 149, 0.2); border-radius: 4px; }
#modal-filtros .cb-multi-panel::-webkit-scrollbar-thumb { background: #59a4d8; border-radius: 4px; }
```

Sobre tokens: os hex acima **não são cores novas** — são exatamente as já usadas no modal
hoje (`#002443`, `#0a192f`, `brandMidBlue #1a4895`, `brandPaleBlue #bfd7ea`,
`brandGreen #aad12f`). Foram promovidos a **variáveis CSS locais** (`--dm-f-*`) para que
o bloco tenha uma única fonte de cor, em vez de hex espalhado por 20 regras. `theme.css`
não possui paleta de marca (só `--bg-*`, `--text-*`, `--border-*`, tema claro/escuro do app),
e criar tokens de marca em `theme.css` seria mudança global fora do escopo desta OS —
não fazer.

Nenhum hex novo deve aparecer no diff além dos listados no bloco `#modal-filtros { … }`.

### 2.4 Carregamento do script

O `dashboard_master_desktop/code.html` **ainda não carrega** o componente. Adicionar no
head, junto dos demais scripts (após `core_rules.js`, linha 34), com o mesmo versionamento
dos outros módulos:

```html
<script src="../assets/checkbox_multi.js?v=20260518v5" defer></script>
```

O `upgradeAll()` roda sozinho no `DOMContentLoaded` (linhas 337-341) e o
`MutationObserver` (linha 318) cobre os populadores dinâmicos. Não chamar `upgrade()` manualmente.

---

## 3. `data-cb-portal`: **NÃO usar** aqui

Decisão: **sem `data-cb-portal`** nos 5 selects. Justificativa:

1. **Não há clipping a resolver.** `#modal-filtros` é filho direto do `<body>` (abre na
   linha 1123, depois do `</main>` da linha 1121) e nem ele nem o `#modal-content`
   (`max-w-2xl`, sem `overflow-*`, sem `max-h`) recortam conteúdo. O caso que motivou o
   portal (modal de Filtros do CP, comentário nas linhas 70-73 do componente) era
   overflow de ancestral — não existe aqui.
2. **Z-index não é problema.** O panel não-portal é `absolute z-50` dentro do stacking
   context do modal `z-[100]`; os irmãos no grid são estáticos e sem z-index, então o panel
   fica por cima deles. O backdrop está abaixo.
3. **O portal QUEBRARIA o contorno de cor da seção 2.** Em modo portal o panel é
   `document.body.appendChild(panel)` já no upgrade (linha 80) e **não** carrega nenhum
   atributo identificador (o `data-cb-multi-for` fica no wrap, linha 54, não no panel).
   Fora de `#modal-filtros`, o CSS de escopo não o alcança e não há hook para escopar sem
   editar o componente — voltaríamos ao painel branco. Este é o argumento decisivo.
4. **O portal também briga com o esconde-campos da aba Contas a Receber** (~linha 1269, que
   oculta os containers `data-filtro-campo`): um panel aberto vivendo no `<body>` não some
   junto com o container escondido.

Risco assumido e mitigado: sem portal o panel abre sempre para baixo (`top-full`), sem flip
automático. O campo mais baixo é `Descrição / Serviço` (col-span-2, última linha). Por isso
o bloco CSS acima usa `max-height: min(16rem, 42vh)` no panel — em telas curtas ele encolhe
em vez de transbordar a viewport. **O engenheiro deve conferir visualmente esse campo em
janela de ~700px de altura** antes de devolver ao coordenador.

---

## 4. Comportamento da pílula: 1 valor vs. vários

Comportamento **nativo do componente** (linhas 98-116) — nada a customizar, apenas validar:

- **Nada selecionado / sentinela "Todos" marcada** → mostra o `data-placeholder`
  ("Todos os Clientes" etc.), na cor `--dm-f-muted` (`brandPaleBlue`), peso normal.
- **Exatamente 1 selecionado** → mostra o texto da opção, em `--dm-f-text` (branco) e
  `font-bold`. Truncamento por `truncate` (linha 65) com reticências — correto para nomes
  longos de cliente/serviço em coluna de metade da largura do modal.
- **2 ou mais** → mostra `"N selecionados"` (contador), branco e bold.

Não inventar chips/tags nem lista de valores concatenados: o padrão do sistema é contador,
e é o que os 19 usos em produção já mostram. O nome completo de cada item continua
disponível via `title` no item do painel (linha 160).

---

## 5. O que fica INTOCADO

- Estrutura do modal: `#modal-filtros` (`z-[100]`, backdrop, blur), `#modal-content`
  (`bg-[#002443] border-brandMidBlue rounded-2xl max-w-2xl`), cabeçalho com ícone
  `filter_alt` e botão de fechar (linhas 1123-1134).
- `grid grid-cols-2 gap-4` e os `col-span-*` de cada campo — **nenhuma mudança de layout**.
- Bloco "Período de Análise (Emissão)" e os dois `input[type=date]`
  (`filtro-modal-data-inicio` / `-fim`, linhas 1137-1145): sem alteração alguma.
- `<label>` dos 5 campos: `text-brandPaleBlue text-xs font-bold mb-1.5 block` — textos e
  classes preservados.
- Botões "Limpar Tudo" e "Aplicar Filtros" (linhas 1188-1195): estilo, texto e handlers
  intocados.
- Os wrappers `div[data-filtro-campo="…"]` continuam sendo os ganchos de
  mostrar/esconder da aba Contas a Receber. O componente insere o `.cb-multi-wrap` **dentro**
  desse div (linha 55), então o esconde-campos segue funcionando — não mexer nele.
- Todo o resto da página: header, KPIs, gráficos, tabelas, badge de tema.
- `assets/checkbox_multi.js`: **zero alterações** (é compartilhado com 19 usos em produção).

---

## 6. Badge "Filtros Ativos" do topo — opinião

`#aviso-filtro-ativo` / `#texto-filtro-ativo` (linhas 252-258). Hoje o texto é
**estático** ("Filtros Ativos"), nenhum JS o reescreve.

**Recomendação: não mudar o texto nem o visual do badge.** Ele é binário (há filtro / não
há) e continua verdadeiro com seleção múltipla; a informação de "quantos" já fica visível na
pílula dentro do modal. Transformá-lo em resumo de valores é escopo novo — se o diretor
quiser, vira OS própria.

**Mas há um bug visual iminente que o engenheiro PRECISA tratar:**
`verificarFiltroAtivoNaAba` (linhas 1210-1221) decide pela truthiness:
`let ativo = f.ini || f.fim || f.cli || f.com || f.emp || f.reg || f.ser;`.
Se o estado por aba (`window.filtrosPorAba`, linhas 1202-1208) passar de string `''` para
**array**, um array vazio `[]` é **truthy** em JS → o badge acende permanentemente, mesmo
sem filtro, e o operador não consegue "apagá-lo". A condição precisa passar a testar
comprimento/sentinela (ex.: helper que considera `[]` e `["Todos"]` como vazio). É correção
obrigatória dentro desta OS, porque é o badge desta tela quebrando.

---

## 7. Padrão equivalente já existente — o que copiar

- **Markup dos selects, SEM portal (referência principal):**
  `contas_a_receber_desktop/code.html:825-830` (Tipo de Serviço, `multiple size="6"
  data-checkbox-multi data-placeholder="Todos os Serviços"` + sentinela
  `<option value="Todos" selected>`); mesmos padrões nas linhas 833-841, 845-852, 856-859.
- **Markup com portal (NÃO copiar aqui, só referência do que estamos evitando):**
  `gerenciador_contas_pagar_desktop/code.html:690-694` e `master.html:1178-1183`.
- **Leitura do estado (`getMultiValues`, com sentinela "Todos"):**
  `contas_a_receber_desktop/code.html:2914-2920`.
- **Reset + `cb-multi-sync` após repopular/limpar:**
  `contas_a_receber_desktop/code.html:2961-2965` e `custo_folha_desktop/code.html:1953-1962`.
- **Inclusão do script:** `contas_a_receber_desktop/code.html:18`,
  `gerenciador_contas_pagar_desktop/code.html:64`, `master.html:20`.
- **Helpers get/set multi em página com vários filtros:** `master.html:3489-3493` em diante.

Não existe, em nenhum dos 19 usos, um multi-select sobre fundo escuro. O bloco CSS da
seção 2.3 é o primeiro — e por isso deve nascer escopado em `#modal-filtros`, para não
virar precedente global sem decisão do diretor.

---

## 8. Riscos para a auditoria pós-implementação

1. Hex fora do bloco `#modal-filtros { --dm-f-*: … }` → desvio (a paleta tem que ter fonte única).
2. Qualquer alteração em `assets/checkbox_multi.js` → desvio grave (19 usos em produção).
3. `!important` ausente nas regras de cor → regressão silenciosa **só no tema escuro**
   (painel cinza `#1c1f23` via `theme.css:44-45`). **Testar a tela nos dois temas.**
4. Barra de busca branca em Cliente/Serviço (>8 opções) → indica `.cb-multi-busca-wrap` /
   `[data-cb-busca]` não cobertos.
5. Sentinela com `value=""` → label do trigger e "limpar" quebrados.
6. Badge "Filtros Ativos" permanentemente aceso → seção 6 não aplicada.
7. Painel do campo "Descrição / Serviço" saindo da viewport em tela curta → `max-height`
   não aplicado.
8. Rótulos fixos de gráficos e demais regras permanentes: fora do escopo, mas o diff não
   pode encostar em `chart-*` nem em `theme.css`.
