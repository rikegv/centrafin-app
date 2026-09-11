# OS-CP-JANELA-6M-01 — Briefing consolidado do coordenador

Arquivo ÚNICO a alterar: `gerenciador_contas_pagar_desktop/code.html`.
Branch: `feature/cp-janela-6m`, empilhado sobre `feature/cp-filtros-base` (base `da6b1c0`).
A OS anterior (união das opções dos filtros + modal `modal-cp-periodo-pesado` + guarda com
`getCountFromServer`) **já está no código que você vai ler**.

Leia TAMBÉM `design/specs/cp-janela-6m.md` (spec visual, vinculante para markup/classes/tokens)
e, como contexto, `design/specs/cp-filtros-base-completa.md` §9 (auditoria anterior desta tela).
Onde a spec visual e este briefing conflitarem, **este documento vence** — as divergências já
estão resolvidas na seção 0.

---

## 0. DECISÕES JÁ TOMADAS (não reabrir)

### 0.1 Decisões do diretor (confirmadas nominalmente)

| Tema | Decisão |
|---|---|
| Campo da janela | **6 meses de `data_vencimento`**, não de competência. O diretor foi informado e confirmou a consequência: a competência mais antiga visível será tipicamente 1 mês mais antiga que o `ini` da janela (nota de serviço PJ recua 1 mês na competência). **Não é bug e não se "corrige".** |
| Aviso de Período | **Isentar a janela padrão** + `CP_LIMITE_AVISO_PERIODO` 15.000 → **35.000** + `CP_LIMITE_AVISO_MESES` 3 → **7**. |
| Ordenação de Status | **Por severidade**: asc = VENCIDO → A PAGAR → PROVISIONADO → PAGO → CANCELADO. |

### 0.2 Resoluções do coordenador

| Ponto | Arquiteto | Designer | DECISÃO |
|---|---|---|---|
| `aria-sort` | "bem-vindo e barato" | não usar (o arquivo quase não tem ARIA; consistência vence) | **USAR `aria-sort` no `<th>` ativo** (`ascending`/`descending`, removido quando inativo). O argumento de consistência não se sustenta aqui: a spec já introduz `role="button"` + `tabindex="0"`, ou seja, já estamos fazendo acessibilidade neste elemento. `aria-sort` é o único atributo que torna a interação legível, custa 1 atributo e não tem efeito visual. |
| Collator em `_cpUniaoOpcoes` (1646) e `despOrd` (1669) | "autorizar ou medir" | — | **AUTORIZADO.** Trocar `localeCompare(a,b,'pt-BR')` pelo `_cpColeta` compartilhado. Cai no item 3 da Parte 1 da OS ("aproveitar as otimizações necessárias para não engasgar com esse volume") — a cardinalidade dos dropdowns dobra com a janela de 6 meses. |
| Estado de carregamento (`#cp-vazio`) | não tratou | 5 edições de markup + spinner existente | **APROVADO como o designer propôs.** É consequência direta da Parte 1: sem isso a tela afirma "Nenhum lançamento encontrado" durante vários segundos a cada abertura. |

---

## 1. VETOS — caminhos de implementação PROIBIDOS

| # | Veto | Por quê |
|---|---|---|
| **V1** | Anexar o blob — ou QUALQUER campo derivado (`_blobBusca`, `_sortKey`, `_statusVisual`…) — a objetos de `cacheRegistros` | Cadeia provada: **5077** (`cacheRegistros.find`) → **5123-5129** (`{...regOriginal}`) → **5024** (`{...reg}`, até 120 clones) → **5042** (`const {_id, ...payload} = c`, remove SÓ `_id`) → **5044** (`batch.set` em `/ContasAPagar`). Segundo caminho independente: **5086** → **1052-1066** grava em `/CP_SolicitacoesAprovacao`. Lixo sintético irreversível em produção. |
| **V2** | Array paralelo indexado para o blob | A ordenação da Parte 3 desalinha o índice → a busca casa o texto do registro ERRADO, em silêncio. Correta nos testes rasos, errada em produção. |
| **V3** | `Map<docId, blob>` sem reconstrução total por snapshot | Cresce sem teto ao percorrer janelas e serve blob VELHO para doc editado. |
| **V4** | Reimplementar a normalização do blob em vez de chamar `_cpNormalizarBusca` (**1962-1967**) | O termo digitado passa por ela em **1975**; normalizadores diferentes = busca com acento para de casar. |
| **V5** | Mudar o `orderBy` da query (**1537**), adicionar índice composto, ou editar `firestore.indexes.json` | Quebra o índice de campo único automático (**1202/1534/993**) e vira artefato de deploy. |
| **V6** | Fazer a janela operar em `competencia_ref` | Formato duplo (**1369-1375**): na forma `MM/YYYY` a comparação é anticronológica entre anos (`"12/2025" > "01/2026"`). Range quebrado por construção. |
| **V7** | Carregar a base inteira / `_cpJanelaIni = ''` / remover o range | ~95 MB de objetos planos → 350-450 MB de aba. |
| **V8** | Camada 3: qualquer query nova disparada por digitação ou ordenação | Proibida pelo diretor. A busca opera SÓ sobre a janela carregada. |
| **V9** | Alterar `atualizarKPIs` (**2310**), `statusVisual` (**1387**), `cpResolverCompetenciaRef`, ou qualquer cálculo de valor — **inclusive "otimizações" que preservem o resultado** | Restrição explícita da OS. |
| **V10** | Tratar valor negativo como vazio/zero, ou `Math.abs`, na ordenação de Valor | **Estornos — Regra Brendon Costa Vital** (Parte A do CLAUDE.md). Negativo é redução legítima de rubrica e ordena ABAIXO de zero. |
| **V11** | Ordenar `cacheRegistros` in place (é o que o CRF faz em `contas_a_receber_desktop:3067`) | Seria desfeito pela próxima entrega do snapshot (**1566**) — a ordenação "sumiria" quando alguém importasse ou editasse algo. |
| **V12** | `localeCompare(x, 'pt-BR', {...})` dentro de comparador | ~415.000 comparações (28k × log₂28k) reconstruindo o collator: 2-8 s por clique em vez de 120-400 ms. |
| **V13** | `new Date()` dentro de comparador de data; `hojeISO()` dentro do comparador de status | ~830k alocações/chamadas por ordenação. |
| **V14** | Tornar ordenáveis colunas fora das 7 aprovadas (Detalhe/Obs. **303**, Gestor **310**, checkbox **295**, Ações **312**); criar coluna de competência | Escopo estrito. |
| **V15** | `onclick` inline + globais em `window` no `<thead>` | O CP é `<script type="module">` (**980**) — handler inline não vê o escopo do módulo. Usar `data-cp-sort` + delegação, padrão que o arquivo já usa em **5280-5288** e **2703-2710**. |
| **V16** | Bumpar `_CP_SS_FILTROS` para `_v3` (**1814**) | Chave nova e antes ausente é compatível nos dois sentidos; bumpar descartaria gratuitamente o estado vivo de filtros do operador no deploy. |
| **V17** | Tocar `firestore.rules` | Nada aqui exige. Se sentir necessidade, **PARE e escale** (Lei da decisão). |
| **V18** | Tocar `_cpAdicionarMeses` (**3782**) ou `_cpDescobrirMesPadrao` (**1260**) | A primeira é write path da recorrência e não trata `n` negativo. A segunda é a unidade validada da OS anterior — a expansão para 6 meses é EXTERNA a ela. |
| **V19** | Tocar `assets/checkbox_multi.js`, `theme.css`, `theme_manager.js`, ou qualquer outro módulo | Compartilhados / fora de escopo. |

---

## 2. Blob de busca pré-computado — `WeakMap`

```js
const _cpBlobBusca = new WeakMap();   // reg → blob normalizado. NUNCA propriedade do reg.
```

Populado **no próprio `forEach` do snapshot** (**1554-1565**), sem passe extra:
```js
snap.forEach(d => {
    const reg = { _id: d.id, ...d.data() };
    const empResolvida = _cpResolverEmpresaDoReg(reg);
    if (empResolvida) reg.empresa = empResolvida;
    _cpBlobBusca.set(reg, _cpNormalizarBusca(
        (reg.entidade || '') + ' ' +
        (reg.codigo_fornecedor != null ? reg.codigo_fornecedor : '') + ' ' +
        (reg.categoria || '') + ' ' +
        (reg.observacao || '')
    ));
    regs.push(reg);
    // ... Sets como já estão
});
```

Em `aplicarFiltrosCP` (**2131-2139**), o bloco do termo passa a ler do WeakMap, com fallback
para o cálculo inline (defesa, não otimização):
```js
if (termo) {
    const blob = _cpBlobBusca.get(r);
    const alvo = (blob != null) ? blob : _cpNormalizarBusca(/* mesma concatenação de 4 campos */);
    if (!alvo.includes(termo)) return false;
}
```

**Por que WeakMap:** (a) não pode vazar para o banco por construção — não é propriedade, nenhum
`{...reg}` a alcança; é a única opção que torna a regressão do V1 **impossível** em vez de
**evitada por disciplina**; (b) invalidação = zero código — em **1566** (`cacheRegistros = regs`)
os objetos antigos ficam inalcançáveis e as entradas morrem com eles, então trocar de janela
("Carregar mês anterior", Período, Limpar) não deixa estado sujo; (c) custo ~4,5 MB sobre 28k,
irrelevante perto dos ~51 MB dos registros.

**Os campos do blob são exatamente os 4 atuais.** Acrescentar campo muda a semântica da busca
e está fora de escopo. (Nota para o futuro, não para agora: `_cpUltimoSnapRefresh` **1587-1598**
muta `r.empresa` in place — inofensivo porque `empresa` não está no blob. Se uma OS futura
adicionar `empresa` à busca, o blob terá de ser recomputado ali também.)

---

## 3. Transporte de dados: `onSnapshot` MANTIDO

**Nada muda no transporte.** O diretor pediu para avaliar `getDocs`; a recomendação é manter, e
ele será informado do custo assumido.

`onSnapshot` é o que sustenta o auto-refresh em **6 caminhos de escrita** que não têm nenhuma
chamada de re-render própria: edição individual (**5101-5111**), exclusão individual (**5258**),
alteração em massa (**2839-2846**), exclusão em massa (**5234**), e os KPIs do ETL
(**3532-3533**: *"os 5/7 cards macros só recalculam depois do writeBatch via snapshot reativo"*).
Há comentário explícito em **1206-1208** declarando essa dependência.

`getDocs` puro mataria os 6 e exigiria re-fetch manual em cada um — e cada re-fetch é **um
download completo de 25 MB**, pior em cota, banda e latência do que os deltas do `onSnapshot`.
Híbrido exigiria merge/dedup por docId e a parte servida por `getDocs` ficaria **cega a
exclusões** (linha apagada continua na tela até o F5): troca bug visível por bug invisível.
`Metadados/UltimaImportacao_CP` não serve de gatilho único — é best-effort (falha engolida em
**5347-5350**), não cobre edição/exclusão/massa, e entrega uma vez ao assinar.

**Custo assumido, a medir (não corrigir nesta OS):** cada entrega do snapshot reitera os 28k docs
→ ~200-400 ms de main thread por entrega (contra ~40-80 ms com 1 mês). Durante um ETL de 5.000
lançamentos são ~12 commits de 450 (`CHUNK_SIZE`, **1024**), e o loop de `_cpFinalizarImportacao`
(**3974-4047**) **não cede a thread entre chunks**. Projeção: 2,5 a 5 s de churn durante a
importação. A correção certa (atualizar `cacheRegistros` via `snap.docChanges()` em vez de
reconstruir) é **OS sucessora** — fazê-la na mesma OS que multiplica o volume por 6 destruiria a
capacidade de atribuir causa se a performance regredir.

---

## 4. Janela de 6 meses

### 4.1 Constante única (é o botão de voltar atrás)

```js
const CP_MESES_JANELA_PADRAO = 6;   // recuo da feature = mudar SÓ este número
```

### 4.2 Aritmética — cuidado com o off-by-one

**6 meses inclusive da âncora = recuar 5 meses** (`CP_MESES_JANELA_PADRAO - 1`). Recuar 6
entregaria 7 meses (~30.706 em vez de ~25.114): ~20% de volume a mais.

```js
function _cpPrimeiroDiaMenosMeses(iso, n) {        // pura, sem estado de módulo
    const m = String(iso || '').match(/^(\d{4})-(\d{2})/);
    if (!m) return iso;
    let ano = +m[1], mes = +m[2] - 1 - n;           // 0-index
    while (mes < 0) { mes += 12; ano -= 1; }
    return `${ano}-${String(mes + 1).padStart(2,'0')}-01`;
}
function _cpExpandirJanelaPadrao(mesAncora) {
    return { ini: _cpPrimeiroDiaMenosMeses(mesAncora.ini, CP_MESES_JANELA_PADRAO - 1),
             fim: mesAncora.fim };
}
```
`_cpRecuarIniUmMes` (**1302-1310**) **deve delegar** a `_cpPrimeiroDiaMenosMeses(base, 1)` —
autorizado: ela serve o "Carregar mês anterior" (**2609**) que a Parte 1 obriga a manter, e duas
implementações de aritmética de mês na mesma feature é convite a divergência.

### 4.3 `_cpJanelaPadrao` guarda os 6 MESES, não o mês âncora

```js
// inscreverContasPagar (1510-1519):
const ancora    = await _cpDescobrirMesPadrao();     // contrato INTACTO — devolve o mês âncora
_cpJanelaPadrao = _cpExpandirJanelaPadrao(ancora);   // fonte única da janela padrão
_cpJanelaIni = _cpJanelaPadrao.ini;
_cpJanelaFim = _cpJanelaPadrao.fim;
_cpAtivarJanela();
```
**Crítico:** se a expansão ficasse só em `inscreverContasPagar`, **"Limpar Filtros" jogaria o
operador de volta em 1 mês** — regressão da própria feature. Consumidores de
`_cpJanelaPadraoAtual()` (**1297-1299**): `limparTodosFiltros` (**2426-2429**), o branch de
Período vazio de `_cpComitarPeriodo` (**2457-2459**), e `_cpJanelaAlvoDoPeriodo` (**2474**).
Expandir também o fallback `_cpMesCorrenteRange()` de **1298**, para que "a janela padrão tem 6
meses" seja invariante sem exceção.

### 4.4 Meses de CALENDÁRIO, não "meses com dado"

Os 6 são meses de calendário. Mês vazio conta. Razões: uma janela = uma query = um listener
("6 meses com dado" exigiria 6 queries e uma camada de merge/dedup, classe de bug nova); e o
rótulo "Abr/2026 → Set/2026" precisa ser uma afirmação previsível sobre o calendário, senão o
operador não sabe onde o "Carregar mês anterior" o deixa. O "com dados" do pedido já está
honrado na ponta: `_cpDescobrirMesPadrao` para no primeiro lançamento não-projetado.

### 4.5 Veto de rótulo

Proibido rotular a janela como "competência" na UI. `_cpFmtJanelaLabel` (**1336-1345**) diz
*"Exibindo: Abr/2026 → Set/2026"* — honesto e suficiente. Se algum rótulo precisar desambiguar,
a palavra é **vencimento**.

---

## 5. Recalibragem do aviso de Período

**(i) Isentar a janela padrão, por igualdade exata.** No handler do "Aplicar", antes da contagem
(há curto-circuito análogo em **2532**):
```js
const _padrao = _cpJanelaPadraoAtual();
if (alvo.ini === _padrao.ini && alvo.fim === _padrao.fim) { _cpComitarPeriodo(novoIni, novoFim); return; }
```
Torna logicamente impossível avisar sobre o volume que a tela entrega sozinha. Bônus: elimina um
`getCountFromServer` do gesto de limpar o Período.

**(ii)** `CP_LIMITE_AVISO_PERIODO`: 15.000 → **35.000**.
**(iii)** `CP_LIMITE_AVISO_MESES`: 3 → **7**. Se ficasse em 3, offline um Período igual à janela
padrão dispararia *"abrange 6 meses e pode deixar a tela lenta"* — a incoerência voltando pela
porta dos fundos.

**(iv) OBRIGATÓRIO:** reescrever o comentário **2149-2156**, que hoje justifica os 15.000 como
*"3x um mês típico (4.700–5.000)"*. Deixá-lo é regressão de documentação.

---

## 6. Ordenação por coluna (Parte 3)

### 6.1 Dois estados, primeiro clique = asc

2 estados (asc ⇄ desc). É o convencional e é o que o CentraFin já faz
(`contas_a_receber_desktop:3052-3085`, `dashboard_master_desktop:670-686`). Primeiro clique = asc
em toda coluna — previsibilidade vence esperteza.

### 6.2 Onde ordenar

```js
function _renderTudoSync() {                        // 2175
    const filtrados = aplicarFiltrosCP(cacheRegistros);
    _cpAplicarOrdenacao(filtrados);                 // in place; no-op se _cpSort.col === null
    atualizarKPIs(filtrados);                       // somas: ordem irrelevante
    if (_cpUltimosFiltrados.length !== filtrados.length) _cpPage = 1;
    _cpUltimosFiltrados = filtrados;
    renderTabela(filtrados);
    // ...
}
```
O array vem de `.filter`, é novo — ordenar in place não muta nada compartilhado.
**Ordenar ANTES de `_cpUltimosFiltrados = filtrados` é deliberado:** a exportação Excel lê
`_cpUltimosFiltrados` (**4834**) e promete espelhar o recorte visível (**4812-4815**) → **a
planilha passa a sair na ordem da tela**. Comportamento correto; vai para o DIARIO.

### 6.3 Comparadores

**Um único collator no módulo** (este é o maior risco de performance da Parte 3):
```js
const _cpColeta = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
```

- **`valor_original`** — `Number(r.valor_original) || 0`, subtração. Null/inválido conta como 0 e
  **não** vai para o fim: a célula (**2285**) já renderiza `R$ 0,00`, e a ordenação tem de
  concordar com o que está na tela. **V10: negativo ordena abaixo de zero.**
- **`data_vencimento`** — comparação lexicográfica de string (ISO já é cronológico; o módulo todo
  depende disso em **1393**, **2049**, **2096**). Sem `new Date()`.
- **`entidade` / `categoria` / `centro_custo`** — `_cpColeta.compare`. O `sensitivity:'base'`
  deixa "ESTÁGIO"/"ESTAGIO" adjacentes, e **aqui isso é desejável**, porque decide só *posição*.
  **Comentar a distinção** com `_cpChaveFiltro` (**1625-1627**), que deliberadamente NÃO strip
  acento porque lá decide *identidade* (bug ESTÁGIO do Faturamento, 2026-06-19) — senão alguém
  "unifica" as duas e reintroduz o bug.
- **`codigo_fornecedor`** — é genuinamente `number | string` na base (ETL grava `l.codigo` em
  **4003**; auto-cadastro grava `Number(codStr) || codStr` em **5142**). **Não comparar tipos
  mistos com `<`.** Tratar como texto com o mesmo collator (`numeric:true` → "9" antes de "10"),
  o que casa com a célula, que renderiza o valor cru (**2266**).
- **`status`** — DERIVADO de `statusVisual(reg, hoje)`. Ordem por **severidade** (decisão do
  diretor):
  ```js
  const _CP_RANK_STATUS = { atrasado: 0, a_vencer: 1, provisionado: 2, pago: 3, cancelado: 4 }; // desconhecido → 99
  ```
  **`hojeISO()` calculado UMA vez fora do comparador** (V13).
- **Vazios: SEMPRE no fim, nas duas direções** (convenção do Excel). O teste vem **antes** do
  fator de direção:
  ```js
  if (!a && !b) return 0;  if (!a) return 1;  if (!b) return -1;   // fora do * fator
  ```
  Exceção única: `valor_original`. **Não copiar `contas_a_receber_desktop:3080`**, que erra isso
  para texto (string vazia no topo em asc e no fim em desc).

### 6.4 Estabilidade

`Array.prototype.sort` é estável por especificação (ES2019) e o V8 a implementa como estável
(TimSort) desde o Chrome 70. Como a ordem de entrada é a da query (`data_vencimento desc`), o
desempate sai determinístico: mesmo critério → vencimento mais recente primeiro.
**Não adicionar comparador de desempate explícito** — custaria uma comparação extra em 415k e não
compra nada perceptível. Documentar no comentário para ninguém "descobrir um bug" depois.

### 6.5 Interações

- **`_cpPage = 1` explicitamente no handler.** O reset heurístico de **2181-2183** só dispara
  quando o *tamanho* muda, e ordenar nunca muda o tamanho. Mesmo padrão do handler de busca
  (**1979**) e do toggle de KPI (**5571**).
- Handler chama **`renderTudo()`** (**2168-2174**), nunca `_renderTudoSync()` direto (o rAF
  coalesce cliques rápidos), e **nunca** o atalho `renderTabela(_cpUltimosFiltrados)` usado pela
  paginação (**2619/2624/2630/2638**), que pula o passe de filtro+ordenação.
- **Sticky: SIM.** Adicionar `ordem: { col, dir }` ao objeto de **1856-1873** e restaurar em
  `_cpRestaurarEstadoFiltros` (**1887-1955**), **validando `col` contra a whitelist de colunas e
  `dir` contra `asc|desc`** (o sessionStorage é editável pelo usuário). Restaurar também o ícone
  do cabeçalho. **Chave continua `centrafin_cp_filters_v2`** (V16).
- **`limparTodosFiltros()` (2404-2432)** zera a ordenação e reseta os ícones — ele se declara
  "estado inicial canônico".
- **Se o cache não estiver em `data_vencimento desc` na abertura, os 7 cabeçalhos nascem
  inativos.** Proibido mostrar seta ativa numa ordem que a tabela não segue.

### 6.6 Markup e binding

Reusar o **vocabulário visual** do CRF: `unfold_more` (inativo) → `keyboard_arrow_up` /
`keyboard_arrow_down`. Detalhes de classes, tokens e os três estados estão na spec do designer —
**siga-a**, incluindo: cor do estado ativo no `<span>` do glifo e **nunca** no `<th>` (porque
`theme.css:161` é `html.dark table thead th { color: … !important }` e achata qualquer cor no
`<th>`); inativo por **opacidade** (`text-slate-400 opacity-40`), não `text-slate-300` (sem
cobertura no dark); hover em **alpha** (`hover:bg-primary/10`), nunca `hover:bg-slate-50`;
wrapper `inline-flex` para respeitar o `text-align` de cada `<th>`; e na coluna **Valor** (única
`text-right`) o glifo vem **antes** do rótulo.

**Mecanismo:** `data-cp-sort="<chave>"` nos `<th>` + **um** listener delegado no `<thead>`
(padrão de **5280-5288**). Zero global novo, zero `onclick` (V15).

**Colunas ordenáveis = exatamente 7**, no `<thead>` (**288-313**): Status (**298**), Vencimento
(**299**), Código (**300**), Favorecido (**301**), Despesa (**302**), CC (**304**), Valor
(**311**). Apenas **um** cabeçalho ativo por vez. `aria-sort` no `<th>` ativo (resolução 0.2).

### 6.7 Custo

~415k comparações. Com collator cacheado: 120-400 ms (texto), 15-40 ms (numérico/data).
Tolerável para gesto explícito e pontual. **Não pré-otimizar.** Se o testador medir acima de
800 ms, a otimização sancionada é decorate-sort-undecorate — e o array de chaves vive em
**variável local** da função de ordenação, nunca anexado ao reg (V1).

---

## 7. Collator nos dropdowns (autorizado — seção 0.2)

`_cpUniaoOpcoes` (**1646**) e `despOrd` (**1669**) usam `localeCompare(a,b,'pt-BR')` sem collator
cacheado. Com a janela de 6 meses a cardinalidade de favorecidos dobra (~2.000-4.000), em 3
selects, na abertura: 50-300 ms por select. Trocar pelo `_cpColeta` da seção 6.3. **Só a troca do
comparador** — não mexer em mais nada dessas funções.

---

## 8. Estado de carregamento da abertura (aprovado — seção 0.2)

Conforme a spec do designer: `hidden` no `#cp-vazio` (**356**, que hoje é pintado no primeiro
frame e passaria segundos afirmando "Nenhum lançamento encontrado"); barra do rodapé nasce
visível com `progress_activity` + a classe `.spin` **já existente** (**43/637**); botão "Carregar
mês anterior" oculto até o 1º snapshot; hint inicial = `Carregando…`. Como **1350** usa
`textContent`, o spinner se autodestrói no primeiro update — sem teardown em JS.

**Não usar** `#cp-loader-overlay` / `_cpMostrarLoader`: é scrim `z-[90]` que cobre a sidebar e diz
"Mantenha esta aba aberta" — trancaria o operador dentro do módulo durante toda a abertura.

**Também:** **1350** injeta `cacheRegistros.length` cru e renderizaria `28415`. Aplicar
`toLocaleString('pt-BR')` + `tabular-nums` no span.

---

## 9. Documentação a atualizar (deixar intacto é regressão)

- Comentário HTML **345-349**: afirma *"a tela abre só com UM mês (carga leve)"* — passa a ser falso.
- Comentário **2149-2156**: justifica os 15.000 como "3x um mês típico".
- Comentário **1206-1208**: segue válido (mantivemos `onSnapshot`) — **não** mexer.

---

## 10. Definition of Done do engenheiro

- Parse limpo: extraia os blocos `<script>` para `.mjs`/`.cjs` no scratchpad e rode `node --check`.
- `git diff --stat` deve listar **apenas** `gerenciador_contas_pagar_desktop/code.html`.
- Zero `#hex`, `rgb()`, `style="color:…"` ou `text-[#…]` inédito (exceção: `text-[#341100]`, já existente).
- Nenhuma classe da lista negra do dark (`bg-amber-100`, âmbar com opacidade, `border-amber-100`,
  `text-amber-500/600`, `text-slate-300`, qualquer `hover:bg-slate-*`).
- Rodar `node scripts/test-cp-filtros-base-completa-logica.cjs` (suíte da OS anterior, 57 casos)
  e confirmar que **continua 57/57** — é a sua rede de segurança contra regressão na Camada 1.
- **NÃO commitar, NÃO pushar, NÃO deployar.**
- No relatório: pontos onde divergiu e por quê; **e qualquer regressão ou defeito preexistente
  que você identificou e corrigiu no caminho** (regra permanente do CLAUDE.md — reportar, não
  silenciar); e o que não conseguiu testar.
