# OS-CP-FILTROS-BASE-COMPLETA-01 — Spec de diff visual

**Tela:** `gerenciador_contas_pagar_desktop/code.html` (módulo vivo do Contas a Pagar).
**Branch:** `feature/cp-filtros-base`.
**Natureza:** iteração cirúrgica em 4 pontos. **Não** é redesign do modal "Filtrar Base",
nem da tabela, nem dos KPIs.
**Design system:** `theme.css` (tokens claro/escuro) + Tailwind CDN com `tailwind.config`
local (linhas 11-24: `primary #aad12f`, `secondary #002443`, `tertiary #59a4d8`).

> **Nota de auditoria (pós-implementação):** a seção **9** registra o resultado do gate de
> tokens e **corrige dois erros desta spec** (cobertura dark de variantes `hover:` e o
> vocabulário do sufixo). Ler a 9 antes de reusar as tabelas 3.4 e 6 em outra OS.

---

## 0. Mapa dos pontos tocados

| # | O que | Onde (linha aprox.) | Tipo de diff |
|---|---|---|---|
| 1 | União cadastro + mês nos 3 dropdowns | `_cpPopularDropdownsAsync` 1493-1512 / `_popularSelectMultiChunked` 1522-1606 | JS (dados) — **zero markup** |
| 2 | Afordância "sem dado no período" | `popularFantasmasEAplicar` 1549-1567 | JS (texto da `<option>`) |
| 3 | Modal de aviso de período pesado | **novo bloco HTML** + handler de `btn-filtros-cp-aplicar` (2189-2216) | HTML + JS |
| 4 | Estado vazio da tabela | `renderTabela` 1962-1969 (`cp-hint-recorte`, id na linha 281) e `#cp-vazio` 356-364 | texto |

Fora dessas 4 linhas-base, **nenhum outro trecho do arquivo deve aparecer no `git diff`.**

---

## 1. Dropdowns com união cadastro + mês

### 1.1 Escopo exato
Só os 3 populadores: `cp-filtro-favorecido`, `cp-filtro-cc`, `cp-filtro-empresa`.
`cp-filtro-despesa` **não muda** (é o 2º parâmetro de `_cpPopularDropdownsAsync`, linha 1504
— continua alimentado só pelo mês carregado).
`cp-filtro-status`, `cp-filtro-tipo` e `cp-filtro-classificacao` são listas fixas no HTML
(linhas 691-699, 730-739, 753-759) e **não são tocados**.

### 1.2 Markup do modal: intocado
As linhas 701-750 (`<label>` + `<select multiple size="5" data-cb-portal data-checkbox-multi
data-placeholder="…">`) ficam **byte a byte iguais**. Não mudar `size`, não mudar
`data-placeholder`, não mudar as classes, não adicionar/remover `data-cb-portal`.
O grid `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4` (linha 688) não muda —
o volume novo (~306 opções no Favorecido) mora **dentro** do painel do dropdown, não no grid,
então não há impacto de layout nem de responsividade.

### 1.3 Busca interna: já resolvida, nada a fazer
`assets/checkbox_multi.js:143-145` liga o campo "Buscar…" automaticamente quando há mais de
8 opções não-sentinela. Os 3 selects já passam desse limiar hoje; continuarão passando.
O painel tem `max-h-64` + `overflow-y-auto` (linha 77 do componente) e, em modo portal,
`_posicionarPortal` (252-275) recalcula altura e faz flip para cima quando não cabe.
Ou seja: **306 opções não estouram a viewport**. Nenhum ajuste de altura é necessário —
e não deve ser feito.

### 1.4 Ordem de renderização (decisão de UX)
> **SUPERADA pelo coordenador** (ver 9.0): a implementação usa **bloco único alfabético
> pt-BR**, com/sem dado intercalados. Motivo: leitura literal do requisito do diretor + o
> painel já tem busca textual automática. O texto abaixo fica como registro da proposta
> original.

**Presentes no mês primeiro (alfabético), depois o bloco "sem dados" (alfabético), no fim.**

Motivos:
1. É exatamente a ordem física que o arquivo já produz hoje: a lista principal é appendada
   em 1569-1582/1588-1605 e os fantasmas depois, em `popularFantasmasEAplicar` (1555-1564).
   Manter isso torna o diff mínimo — as opções do cadastro entram no **mesmo passe** dos
   fantasmas, sem reordenar nada.
2. Os primeiros ~295 itens que o operador vê ao rolar continuam idênticos aos de hoje —
   nenhuma regressão de memória muscular.
3. Findability do rabo da lista está coberta pela busca interna (1.3): quem procura
   "FORNECEDOR X" digita e acha, esteja ele em qual bloco estiver.

Não intercalar alfabeticamente a lista inteira: isso reembaralha o que o operador já conhece
para ganhar quase nada.

---

## 2. Afordância "existe no cadastro, mas sem dado no período"

### 2.1 O que é REALMENTE estilizável (leitura de `assets/checkbox_multi.js`)

O componente **não** renderiza `<option>` nativa. Ele esconde o `<select>` (linhas 46-49) e
desenha o painel próprio em `renderPanel` (136-250). Cada opção vira:

```html
<label class="cb-multi-row flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-primary/5 transition-colors">
  <input type="checkbox" data-cb-idx="N" class="w-4 h-4 rounded border-slate-300 text-primary …">
  <span class="text-[12px] font-semibold text-slate-700 flex-1 truncate" title="…">TEXTO</span>
</label>
```

Fatos que fecham o leque de opções:
- `renderPanel` lê **apenas** `opt.value`, `opt.textContent` e `opt.selected` (linhas 148-163).
  `data-*` ou `class` postos na `<option>` são **ignorados** — não chegam ao DOM visível.
- O único diferencial de estilo suportado é `value === "Todos"` → classe `cb-multi-sent`
  + `font-extrabold` + hairline inferior (linhas 150-155).
- `getOptionsArr()` é `Array.from(sel.options)` (88-90) — **achata `<optgroup>`**. A lista
  renderizada é plana (148-164): o rótulo do `<optgroup>` simplesmente **nunca é desenhado**.

### 2.2 Veredito das 3 alternativas

| Alternativa | Veredito | Por quê |
|---|---|---|
| `<optgroup>` separando "no mês" × "demais da base" | **REJEITADA** | Invisível. `checkbox_multi.js:88-90` achata e `148-164` renderiza lista plana — o operador não veria grupo nenhum. Só apareceria no fallback nativo (que nunca ocorre). |
| Classe/cor própria na opção "sem dados" | **REJEITADA** | Exigiria editar `assets/checkbox_multi.js`, que é **compartilhado** por `master.html`, `custo_folha_desktop`, `dashboard_master_desktop` e `contas_a_receber_desktop`. Mudança em componente compartilhado não está na OS → Lei do escopo estrito. Se o diretor quiser, vira OS própria. |
| Nenhuma marcação + só aviso no estado vazio | **REJEITADA como solução única** | O operador marcaria um favorecido e cairia numa tabela vazia sem entender por quê. Mas é **adotada como complemento** (seção 4). |
| **Sufixo textual na `<option>`** | **ESCOLHIDA** | Único canal que o componente propaga (`opt.textContent`), e **já é o padrão do projeto**: `gerenciador_contas_pagar_desktop/code.html:1560`, `master.html:3802`, `custo_folha_desktop/code.html:2139`. |

### 2.3 Texto exato

> **CORRIGIDO pelo coordenador** (ver 9.0): o sufixo implementado é
> **` (sem dados neste período)`** (`_CP_SUFIXO_SEM_DADO`, linha 1600), não ` (sem dados)`.
> Motivo: precisão — é esta OS que cria a distinção "existe no cadastro × sem dado neste mês".
> Consequência aceita: divergência de vocabulário com `master.html` e `custo_folha_desktop`,
> que **seguem** com "(sem dados)" e **não devem** ser alterados.

Regras de aplicação (mantidas):
- Um valor recebe o sufixo **no máximo uma vez**. Valor que é ao mesmo tempo "fantasma"
  (selecionado antes e sumiu) e "só cadastro" entra **uma vez só** na lista, com um sufixo só.
  Na prática: unificar os dois conjuntos antes de gerar as `<option>`.
- **Sentinelas nunca recebem sufixo**: `Todos`, `__SEM_CC__`, `__SEM_EMPRESA__`, `__SEM_TIPO__`.
- `[ ⚠️ MOSTRAR LANÇAMENTOS SEM CC ]` e `[ ⚠️ MOSTRAR LANÇAMENTOS SEM EMPRESA ]`
  continuam com texto idêntico e continuam sendo re-injetadas logo após o cabeçalho "Todos".

### 2.4 Sem separador visual entre os dois blocos
Não inserir uma `<option>` fazendo papel de divisória (ex.: `— demais da base —`). Toda
`<option>` vira uma linha **clicável com checkbox** (2.1) — uma divisória viraria um valor de
filtro fantasma selecionável. Divisória real exigiria tocar o componente compartilhado →
fora de escopo.

### 2.5 Consequência aceita no rótulo do gatilho
Se o operador marcar **um** item sem dados, o botão do multi-select mostra
`NOME DO FORNECEDOR (sem dados neste período)` truncado (`checkbox_multi.js:107-110`). Isso
**já acontece hoje** com os fantasmas — comportamento conhecido, não é regressão. Com 2+
marcados o rótulo vira `"N selecionados"` e o assunto desaparece.

### 2.6 Cor / tokens desta seção
**Nenhuma classe nova, nenhum token novo.** A opção "sem dados neste período" usa exatamente
o mesmo estilo das demais (`text-slate-700` → remapeado para `var(--text-primary)` no dark por
`theme.css:80-94`). Não tentar deixá-la cinza: isso cai no caso rejeitado de 2.2.

---

## 3. Modal novo: aviso de Período pesado

### 3.1 Padrão a reaproveitar
**Não existe** no repositório um componente de "aviso antes de operação pesada" — procurei em
`contas_a_receber_desktop`, `custo_folha_desktop`, `dashboard_master_desktop`,
`aprovacoes_desktop` e `master.html`. O que existe:

- **Esqueleto de modal de confirmação do próprio arquivo:**
  `gerenciador_contas_pagar_desktop/code.html:570-596` (`modal-confirmar-delete-fatura-cp`).
  **É este que se copia** — overlay, card, header com ícone em quadrado 12×12, corpo,
  rodapé com par de botões.
- **Tom âmbar de "atenção não-destrutiva" no próprio arquivo:**
  `modal-cp-duplicidade` (781-793) e `modal-explicacao-kpi` (606-607).
- **Promise de decisão com overlay de id próprio:** `_cpAbrirModalDuplicidade` (3534+) —
  é o precedente correto de fluxo (ver 3.5).
- **`confirmarAcao({ … tom })` genérico** existe em `custo_folha_desktop:4835-4887` e
  `contas_a_pagar_desktop:1377+`, mas **não** neste módulo. Portar o helper genérico para cá
  seria refactor não pedido → **não fazer**. Modal dedicado, como os outros deste arquivo.

### 3.2 Tom: âmbar, não vermelho
Vermelho neste arquivo significa **exclusão irreversível** (`bg-red-600`, ícone
`delete_forever`, linhas 589-592). Um aviso de performance não é isso — nada é destruído e a
ação é totalmente reversível. Tom correto: **âmbar** (mesma família de "Atenção: base já
importada" e do modal de KPI).

### 3.3 ARMADILHA de tema escuro — não copiar cegamente o modal de duplicidade
`theme.css` cobre no dark **apenas**: `.bg-amber-50` (linha 189), `.border-amber-200`
(linha 202) e `.text-amber-700/800/900` → `#fbbf24` (linhas 134-136).

**NÃO são cobertos:** `.bg-amber-100`, `.bg-amber-50/60` (o modificador de opacidade gera
outra classe), `.border-amber-100`, `.text-amber-500`, `.text-amber-600`.
Consequência: `modal-cp-duplicidade` (linhas 781 e 789) fica com caixa clara + texto âmbar no
tema escuro — **defeito preexistente que esta OS não corrige e NÃO deve replicar.**

Regra para o modal novo: usar **só** `bg-amber-50`, `border-amber-200` e `text-amber-700/800/900`,
**sem modificador de opacidade**.

### 3.4 Classes por elemento (todas já remapeadas em `theme.css`)

| Elemento | Classes | Token no dark |
|---|---|---|
| Wrapper do modal | `fixed inset-0 z-[84] flex items-center justify-center opacity-0 pointer-events-none transition-opacity duration-300` | — |
| Overlay | `absolute inset-0 bg-slate-900/60 backdrop-blur-sm` + **`id="cp-aviso-periodo-overlay"`** | — (idêntico aos demais modais do arquivo) |
| Card | `bg-white w-full max-w-md rounded-2xl shadow-2xl z-10 transform scale-95 transition-transform duration-300 relative border border-slate-100` | `.bg-white` → `--bg-modal`/`--bg-card` (`theme.css:44-45,178-179`); `.border-slate-100` → `--border-subtle` (65-69) |
| Quadrado do ícone | `w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0 shadow-inner` | `.bg-amber-50` → `rgba(245,158,11,0.12)` (189) |
| Ícone | `material-symbols-outlined text-amber-700 text-2xl` — glifo **`hourglass_top`** | `.text-amber-700` → `#fbbf24` (134) |
| Título `h3` | `font-headline text-lg font-extrabold text-secondary tracking-tight` | `.text-secondary` → `--text-primary` (77) |
| Subtítulo | `text-[12px] text-slate-500 font-medium mt-0.5` | `.text-slate-500` → `--text-secondary` (98) |
| Corpo | `text-sm text-slate-700` | `.text-slate-700` → `--text-primary` (80) |
| Caixa de destaque (opcional) | `rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-[12px] text-amber-900 leading-relaxed` | `bg-amber-50` (189) + `border-amber-200` (202) + `.text-amber-900` → `#fbbf24` (136) |
| Contagem | `font-extrabold tabular-nums text-secondary` | `.text-secondary` → `--text-primary` (77) |
| Rodapé | `px-7 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50 rounded-b-2xl` | `.bg-slate-50\/50` → `--bg-card-elev` (49) |
| Botão "Ajustar período" | `px-5 py-2.5 text-slate-500 border border-slate-200 hover:bg-primary/10 rounded-xl text-xs font-bold transition-all` | `.text-slate-500`(98) + `.border-slate-200`(66) + hover em alpha do brand (**ver 9.1 — `hover:bg-slate-50` NÃO tem cobertura dark**) |
| Botão "Continuar assim mesmo" | `px-5 py-2.5 bg-primary text-[#341100] rounded-xl text-xs font-bold shadow-lg shadow-primary/20 hover:brightness-105 active:scale-95 transition-all` (espelha `btn-filtros-cp-aplicar`, 763) | `primary` = `#aad12f` do `tailwind.config` local; `text-[#341100]` fica igual nos dois temas (é texto sobre a pílula verde) — correto, **não** remapear |

**Zero hex novo no diff.** Todo hex necessário já vem do `tailwind.config` local (`primary`,
`secondary`) ou do `text-[#341100]` que já existe na linha 763. Se aparecer `style="color:#…"`
ou `text-[#…]` inédito no diff, é desvio.

**Obrigatório:** o card precisa da classe `bg-white`. `abrirModal`/`fecharModal`
(2544-2557) procuram `m.querySelector('div.bg-white')` para tirar/pôr o `scale-95`.
Sem `bg-white`, a animação de entrada morre silenciosamente.

**Não usar `animate-pulse`** no ícone (o modal de duplicidade usa, linha 781). Lá é um
incidente de importação; aqui é uma informação de performance — pulsar é alarmismo.

### 3.5 Empilhamento (z-index)

Inventário real do arquivo: `modal-filtros-cp` **`z-[68]`** (648) · `modal-cp-quarentena`
`z-[68]` (868) · `modal-central-importacao` `z-[71]` (821) · `modal-editar-fatura-cp` `z-[72]`
(383) · `modal-explicacao-kpi` `z-[74]` (601) · `modal-acoes-massa-industrial` `z-[78]` (487) ·
`modal-confirmar-delete-fatura-cp` `z-[80]` (570) · `modal-cp-duplicidade` `z-[80]` (777).

**Novo modal: `z-[84]`.** Fica acima do `modal-filtros-cp` (68), que continua aberto atrás
dele, e acima da faixa 80 já ocupada — sem empatar com ninguém.

**Ressalva a verificar em tela (não é bug a corrigir):** o painel do multi-select em modo
portal é `fixed z-[200]` e mora no `<body>` (`checkbox_multi.js:77-80`) — ficaria por cima de
qualquer modal. Na prática não colide: clicar em "Aplicar" é clique fora do painel e o
handler de documento (296-302) fecha o painel no mesmo gesto. **O engenheiro deve conferir
visualmente**: abrir o dropdown de Favorecido, e com ele aberto clicar direto em "Aplicar"
com período pesado → o painel some e o modal aparece limpo. **Não alterar o `z-[200]` do
componente compartilhado.**

### 3.6 Fluxo e overlay
- O modal aparece **sobre** o `modal-filtros-cp`, que **permanece aberto** (não fechar antes).
- "Ajustar período" → fecha só o aviso, o operador continua no "Filtrar Base" com os inputs de
  data preenchidos como estavam. Recomendado devolver o foco a `cp-filtro-periodo-fim` (684).
  **Nada é aplicado** — `_cpPeriodoComitado` e a janela server-side ficam como estavam.
- "Continuar assim mesmo" → fecha o aviso e segue o corpo atual do handler (2193-2215),
  terminando com `fecharModal('modal-filtros-cp')` como hoje.
- Clique no overlay = mesmo efeito de "Ajustar período".
- **Não usar `data-modal-overlay`** neste modal. O handler genérico (2558-2560) roda uma vez
  na carga e só faz `fecharModal(...)` — fecharia o visual deixando a decisão pendurada.
  O precedente correto é `_cpAbrirModalDuplicidade` (3534-3560), que usa overlay com **id
  próprio** e resolve a Promise no cleanup. Seguir esse padrão.
- O modal **só aparece** quando o volume ultrapassa o limiar da OS. Abaixo do limiar, e ao
  **limpar** o Período (volta à janela padrão), o "Aplicar" se comporta **exatamente como
  hoje** — zero diferença visual.

### 3.7 Copy (pt-BR, linguagem de operador financeiro)

- **Título:** `Este período traz muitos lançamentos`
- **Subtítulo:** `Nada será alterado — é só um aviso de desempenho.`
- **Corpo:** `O intervalo escolhido carrega <strong>X</strong> lançamentos. Períodos longos
  deixam a tabela e os KPIs mais lentos para abrir e rolar. Você pode continuar assim mesmo
  ou voltar e encurtar o intervalo.`
- **Botões:** `Ajustar período` (secundário) · `Continuar assim mesmo` (primário)

Regras de escrita: sem "registros"/"queries"/"performance"/"renderização" — o operador
lida com **lançamentos**. O número **X** formatado em pt-BR (`toLocaleString('pt-BR')`, ex.:
`12.480`) e em `tabular-nums`.

Sobre a hierarquia dos botões: o primário é "Continuar" porque o operador acabou de clicar em
"Aplicar" um passo antes — o par de botões espelha o par `Limpar`/`Aplicar` da linha 761-764
que ele tem na tela. A cautela é carregada pelo texto e pelo âmbar, não por esconder o
caminho que ele já pediu.

### 3.8 A11y / responsividade
Card `max-w-md` centralizado, mesmo footprint do modal de exclusão — sem risco de estouro.
**Não** introduzir `role="dialog"`/`aria-modal` só neste modal: nenhum outro modal do arquivo
usa, e consistência vale mais que um atributo isolado. Padronizar ARIA seria OS própria.
**Sem botão "X"**: o molde (`modal-confirmar-delete-fatura-cp`) e o `modal-cp-duplicidade`
— os dois modais de DECISÃO do arquivo — também não têm. Confirmado na auditoria (9.5).

---

## 4. Estado vazio da tabela

Com a Camada 1, a causa mais provável de tabela vazia deixa de ser "filtro errado" e passa a
ser **"o dado existe, mas em outro mês"**. O texto atual não sugere a saída certa (mexer no
Período), então deve mudar.

### 4.1 `cp-hint-recorte` (linha 281, atribuído em 1965-1967) — **muda**
É um `<span class="text-[11px] font-bold text-slate-400">` na barra de ferramentas, ao lado do
"Aguardando sincronização…". **Precisa ficar curto** (~40 caracteres) ou empurra o layout da
barra.

| Caso | Hoje | Implementado |
|---|---|---|
| `cacheRegistros.length === 0` | `Sem dados — importe a Base Mestra e um TXT.` | **inalterado** |
| Filtrado e vazio, mês único | `Nenhum lançamento bate com os filtros atuais.` | `Nada encontrado em Set/2026.` |
| Filtrado e vazio, janela de vários meses | idem | `Nada encontrado em Ago/2026 → Set/2026.` |
| Filtrado e vazio, sem janela | idem | `Nada encontrado no período carregado.` |

As 3 variantes (decisão do engenheiro, aceita pelo coordenador) foram medidas na auditoria:
a mais longa tem 39 caracteres, **menos** que a string preexistente do mesmo span
(`Sem dados — importe a Base Mestra e um TXT.`, 43) → sem risco de layout (9.4).
Só o `textContent` muda. **Classe e token do span ficam iguais** (`text-slate-400` →
`var(--text-muted)`, `theme.css:108-114`).

### 4.2 `#cp-vazio` (linhas 356-364) — **muda só o `<p>`**
É onde há espaço real para explicar. Título `Nenhum lançamento encontrado` (linha 360) e o
ícone `inbox` **ficam intocados**. Só o parágrafo da linha 361-363:

> **Hoje:** `Ajuste os filtros ou use a **Central de Importações** para carregar a próxima
> leva de faturas e despesas.`
>
> **Proposto:** `Nada bate com os filtros dentro do período carregado. Se o lançamento é de
> outro mês, abra **Filtrar Base** e ajuste o **Período**. Se ainda não foi importado, use a
> **Central de Importações**.`

O texto é estático e cobre os dois casos (base vazia e filtro sem resultado) — não precisa
virar dinâmico. Classes (`text-[12px] text-slate-400 font-medium max-w-md mx-auto`) e os
`<strong>` ficam como estão; `max-w-md` acomoda as 3 frases em ~4 linhas.

> **Fronteira de escopo:** o item 4 da OS fala em "estado vazio da tabela", o que eu leio como
> incluindo `#cp-vazio`. Se o coordenador ler o item 4 como **só** o `cp-hint-recorte`,
> então **4.2 não é implementado** e `#cp-vazio` fica intocado — o engenheiro deve perguntar
> antes de mexer, não decidir sozinho.

---

## 5. O que fica INTOCADO (fronteira do engenheiro)

- **`assets/checkbox_multi.js` — zero alterações.** Compartilhado com `master.html`,
  `custo_folha_desktop`, `dashboard_master_desktop`, `contas_a_receber_desktop`.
- **`theme.css` e `theme_manager.js` — zero alterações.** Nenhum token novo é necessário
  nesta OS.
- **Markup do `modal-filtros-cp`** (648-766): header, seção "Período de Vencimento"
  (669-687) e seus 2 inputs `date`, grid, todos os 7 `<label>`, todos os 7 `<select>`
  (atributos e classes), botões `btn-filtros-cp-limpar` / `btn-filtros-cp-aplicar`.
  Os textos dos botões **não mudam**.
  > **Exceção autorizada pelo coordenador:** o `btn-filtros-cp-aplicar` ganha rótulo
  > **transitório** "Conferindo volume…" + `disabled` durante a contagem, restaurado no
  > `finally`. Nenhuma classe é alterada no HTML — ver ressalva 9.3.
- **`cp-filtro-despesa`** — populador, opções e sentinelas.
- **Sentinelas** `__SEM_CC__`, `__SEM_EMPRESA__`, `__SEM_TIPO__`: textos com emoji ⚠️,
  valores e posição no topo da lista.
- **Chip de filtros ativos** `cp-chip-filtros` (264) e `atualizarChipFiltros` (2115-2147):
  o formato `Label: valor` / `Label: N` continua igual. Uma opção "sem dados neste período"
  selecionada aparece no chip com o sufixo — comportamento já existente com fantasmas, aceitar.
- **Tabela, KPIs, badges de status (`BADGE_MAP`, 1949-1955), paginação `cp-paginacao`,
  `cp-ultima-sync`** — nada.
- **Modais existentes**: `modal-confirmar-delete-fatura-cp` (é o molde, mas **não** é editado),
  `modal-cp-duplicidade`, `modal-explicacao-kpi`, `modal-editar-fatura-cp`,
  `modal-acoes-massa-industrial`, `modal-central-importacao`, `modal-cp-quarentena`.
  Inclusive o defeito de dark do `modal-cp-duplicidade` (3.3) **não se corrige aqui**.
- **`abrirModal`/`fecharModal`** (2544-2557) e o binder genérico `[data-modal-overlay]`
  (2558-2560): usar, não alterar.
- **Ícone/rótulo do botão `btn-abrir-filtros-cp`** (243-246).
- **Regra permanente do projeto:** nenhum rótulo de valor fixo em gráfico/tabela é
  transformado em hover. Esta OS não encosta em gráfico.

---

## 6. Tokens de `theme.css` — referência de auditoria

`theme.css` não tem paleta de marca; ele remapeia **classes utilitárias** para tokens no dark.
Usar as classes da coluna esquerda garante os dois temas de graça.

| Classe a usar | Token no dark | `theme.css` |
|---|---|---|
| `bg-white` | `--bg-card` / `--bg-modal` | 44-45, 178-179 |
| `bg-slate-50`, `bg-slate-50/50`, `bg-slate-100` | `--bg-card-elev` | 46-54 |
| `border-slate-100`, `border-slate-200` | `--border-subtle` | 65-69 |
| `text-secondary`, `text-slate-700/800/900` | `--text-primary` | 76-94 |
| `text-slate-500/600`, `text-on-surface-variant` | `--text-secondary` | 96-106 |
| `text-slate-400` | `--text-muted` | 108-114 |
| `bg-amber-50` | `rgba(245,158,11,0.12)` | 189 |
| `border-amber-200` | `rgba(245,158,11,0.25)` | 202 |
| `text-amber-700/800/900` | `#fbbf24` | 134-136 |

**Lista negra (sem cobertura dark — não usar no diff):** `bg-amber-100`, `bg-amber-50/60`
(ou qualquer `bg-amber-*` com modificador de opacidade), `border-amber-100`, `text-amber-500`,
`text-amber-600`.

> **ATENÇÃO (corrigido em 9.1):** a tabela acima vale para o **estado de repouso**. Ela
> **NÃO** se aplica a variantes de estado do Tailwind. `theme.css` não tem **nenhuma** regra
> para `hover:`/`focus:` — os seletores são `html.dark .bg-slate-50`, e a classe gerada por
> `hover:bg-slate-50` é `.hover\:bg-slate-50`, que **não casa**. Logo: qualquer
> `hover:bg-slate-*` / `hover:text-slate-*` / `hover:text-secondary` fica com a cor **crua do
> Tailwind** no tema escuro. Em elemento NOVO, usar hover em **alpha** (`hover:bg-primary/10`,
> precedente nas linhas 244/440/887-888 do módulo), que funciona nos dois temas.

---

## 7. Checklist da minha auditoria pós-implementação

Rodo `git diff gerenciador_contas_pagar_desktop/code.html` e verifico:

1. **Escopo do diff** — só os 4 pontos da seção 0. `assets/checkbox_multi.js` e `theme.css`
   com 0 linhas alteradas.
2. **Zero cor hardcoded nova** — nenhum `#hex`, `rgb()`, `style="color:…"` ou `text-[#…]`
   inédito. Exceção admitida: `text-[#341100]` do botão primário, que já existe na linha 763.
3. **Lista negra da seção 6 ausente** do diff.
4. **Card do novo modal tem `bg-white`** (senão a animação de `abrirModal` não roda).
5. **`z-[84]`** no novo modal, e `modal-filtros-cp` continua `z-[68]`.
6. **Overlay com id próprio**, sem `data-modal-overlay` (3.6).
7. **Sufixo** é exatamente ` (sem dados neste período)`, aplicado no máximo uma vez por valor,
   e **nunca** nas sentinelas.
8. **Markup dos 7 `<select>` e dos `<label>` do modal byte-idêntico** ao de antes.
9. **`cp-filtro-despesa` fora do diff.**
10. **Copy** conforme 3.7 e 4 — sem jargão técnico, número em pt-BR com `tabular-nums`.
11. **Tema claro E escuro** conferidos com o modal de aviso aberto sobre o "Filtrar Base":
    card, quadrado do ícone, caixa âmbar, os dois botões e o texto legíveis nos dois temas —
    **inclusive nos estados `hover`/`disabled`** (acréscimo de 9.1/9.3).
12. **Dropdown com ~306 opções** aberto no tema escuro: painel escuro, busca visível, item
    "(sem dados neste período)" com o mesmo contraste dos demais.
13. **Sem regressão** no `#cp-vazio` e no `cp-hint-recorte` quando `cacheRegistros.length === 0`.

Achado eu **reporto ao coordenador**; quem corrige é o engenheiro-frontend.

---

## 8. Riscos conhecidos

1. **Tema escuro do modal novo** — risco #1 desta OS, por causa da armadilha âmbar (3.3).
   Copiar o `modal-cp-duplicidade` sem ler 3.3 reproduz um defeito conhecido.
2. **Tentação de editar `checkbox_multi.js`** para pintar as opções "sem dados". É a saída
   óbvia e é justamente a proibida (2.2) — 4 módulos em produção dependem dele.
3. **Painel `z-[200]` sobre o modal novo** (3.5): não corrigir, só verificar em tela.
4. **`cp-hint-recorte` longo demais** empurrando a barra de ferramentas (4.1) — conferir na
   janela mais estreita que o módulo suporta.
5. **Volume**: 306 opções continuam abaixo do `SYNC_LIMITE = 800` (1546), então o caminho
   síncrono segue valendo e não há mudança de performance percebida ao abrir o modal.
   Se o diff mexer em `SYNC_LIMITE` ou `CHUNK`, é desvio de escopo.
6. **Regra da fonte única (CLAUDE.md)**: o modal de aviso exibe uma contagem. Ele deve
   **mostrar** o número que a camada de dados já apurou, não recontar por conta própria com
   uma regra paralela.

---

## 9. Auditoria de aderência ao design system (pós-implementação)

Estado auditado: working tree de `feature/cp-filtros-base`, `gerenciador_contas_pagar_desktop/code.html`.

### 9.0 Divergências autorizadas (não são achados)
Sufixo ` (sem dados neste período)` (§2.3), ordem em bloco único alfabético (§1.4) e rótulo
transitório do "Aplicar" (§5) — todas registradas pelo coordenador. `master.html` e
`custo_folha_desktop` **seguem** com "(sem dados)" e não entram nesta OS.

### 9.1 ACHADO — hover do botão "Ajustar período" sem cobertura dark
`code.html:792` usa `hover:bg-slate-50`. `theme.css` só remapeia a classe de repouso
(`html.dark .bg-slate-50`, linha 48); a classe gerada é `.hover\:bg-slate-50` e **não casa**.
No tema escuro o hover pinta `#f8fafc` (quase branco) sob texto `--text-secondary` (`#cbd5e1`)
→ contraste ≈ **1,5:1** e um flash branco no card antracite.
**Correção (só na linha 792):** `hover:bg-slate-50` → `hover:bg-primary/10`.
Precedentes de hover em alpha no mesmo arquivo: linhas 244, 440, 887-888.
O mesmo defeito existe em 762, 659, 352, 260, 832, 837 — **preexistentes, fora de escopo**,
candidatos a OS própria ("variantes `hover:` sem cobertura no dark"). Corrige a tabela 3.4.

### 9.2 ACHADO — hint nomeia um mês só quando a janela é aberta de um lado
`code.html:1311-1316` (`_cpFmtJanelaCurto`) devolve só o mês da ponta conhecida quando
`_cpJanelaIni` está vazio e `_cpJanelaFim` não (alcançável: preencher apenas "Até" e Aplicar).
O hint (2196) então afirma `Nada encontrado em Set/2026.` enquanto a janela carregada é
"tudo até Set/2026" — e manda ajustar um Período que já está sem limite inferior.
**Correção:** em `_cpFmtJanelaCurto`, quando só uma ponta existe, devolver `''` (o hint cai na
variante `Nada encontrado no período carregado.`) ou espelhar `_cpFmtJanelaLabel`
(1324-1325) com `a partir de` / `até`. Ambas cabem no span (≤ 37 caracteres).

### 9.3 ACHADO menor — estado `disabled` do "Aplicar" é invisível
`code.html:2519` faz `btn.disabled = true`, mas a linha 763 não tem
`disabled:opacity-50 disabled:cursor-not-allowed` (que as linhas 560 e 590 do mesmo arquivo
têm). Durante a contagem a pílula verde continua com aparência clicável, cursor de ponteiro e
`hover:brightness-105` ativo — só o rótulo denuncia o estado. É a metade visual do
comportamento que o coordenador já autorizou. **Correção sugerida:** acrescentar as duas
utilities `disabled:` na linha 763 (nenhuma cor, neutro nos dois temas). Como a linha 763 está
listada como INTOCADA em §5, **precisa de OK do coordenador** antes de o engenheiro tocar.

### 9.4 Risco #4 fechado
Variante mais longa do hint = `Nada encontrado em Ago/2026 → Set/2026.` (39 caracteres),
menor que a string preexistente do mesmo span (43). `_cpFmtJanelaCurto` usa só as duas pontas,
então o comprimento é limitado por construção, independente de quantos meses a janela cobre.
O glifo `→` já é usado no mesmo módulo (`_cpFmtJanelaLabel`, 1322 → `#cp-janela-info`).

### 9.5 Ausência de "X" no modal novo: correto
Convenção do arquivo: modal que **devolve decisão** não tem X (`modal-confirmar-delete-fatura-cp`
570-596; `modal-cp-duplicidade` 808-842); modal **ferramenta/informativo** tem
(`modal-explicacao-kpi` 613, `modal-filtros-cp` 659). O aviso de período devolve decisão →
sem X está certo. Os dois caminhos de cancelar (botão 791 e overlay 776) apontam para o mesmo
`_cpFecharAvisoPeriodoPesado`, que limpa `_cpPeriodoPendente` — nenhuma saída deixa estado
pendurado. Não há handler de `Esc`, igual a todos os outros modais do arquivo.

### 9.6 Conformes verificados
Dark do modal novo elemento por elemento (775-797): wrapper sem cor; overlay `bg-slate-900/60`
(scrim, igual aos demais); card `bg-white`+`rounded-2xl` → `--bg-modal` (44/178) e
`border-slate-100` → `--border-subtle` (65); quadrado `bg-amber-50` → 189; ícone
`text-amber-700` → `#fbbf24` (134); `h3 text-secondary` → `--text-primary` (77); subtítulo
`text-slate-500` → `--text-secondary` (97); corpo `text-slate-700` → `--text-primary` (80);
`<strong>` injetado com `tabular-nums text-secondary` → 77; rodapé `border-slate-100` (65) +
`bg-slate-50/50` → `--bg-card-elev` (49); botão primário `bg-primary` + `text-[#341100]`
(propositalmente **fora** da lista de `text-[#hex]` de theme.css:234-237). `shadow-inner` /
`shadow-2xl` sem remap — idêntico a todos os modais do arquivo, não é regressão.
Copy do modal bate 3.7 palavra por palavra; número via `toLocaleString('pt-BR')` em
`tabular-nums`; variantes de degradação ("abrange N meses" / "sem data de início ou de fim")
sem jargão. `#cp-vazio` (361-363) bate 4.2 com classes intactas. Lista negra âmbar ausente.
Nenhum override dark local no módulo (o arquivo não tem regra `html.dark`).

### 9.7 Nits registrados, sem ação nesta OS
- `code.html:1920` — comentário ainda diz `"(sem dados)"`, texto antigo do sufixo.
- `code.html:281` — valor estático inicial do `cp-hint-recorte` é
  `Mostrando todos os registros`: usa "registros" (vocabulário que 3.7 evita) e afirma "todos"
  numa tela que carrega 1 mês. Preexistente, **fora do diff** — não tocar agora.
