# OS-CP-FILTROS-BASE-COMPLETA-01 — Briefing consolidado do coordenador

Arquivo ÚNICO a alterar: `gerenciador_contas_pagar_desktop/code.html`.
Branch: `feature/cp-filtros-base` (já criado, working tree limpo).
Leia TAMBÉM a spec visual: `design/specs/cp-filtros-base-completa.md` — ela é vinculante
para markup, classes, tokens e copy. Este briefing é vinculante para lógica e, onde houver
conflito, **este documento vence** (as divergências já foram resolvidas pelo coordenador na
seção 0).

---

## 0. DIVERGÊNCIAS JÁ RESOLVIDAS (não reabrir)

| Ponto | Arquiteto disse | Designer disse | DECISÃO DO COORDENADOR |
|---|---|---|---|
| z-index do modal novo | `z-[80]` | `z-[84]` | **`z-[84]`** — o designer inventariou o arquivo e a faixa 80 já está ocupada por DOIS modais (`modal-confirmar-delete-fatura-cp` 570 e `modal-cp-duplicidade` 777). |
| Overlay do modal novo | usar `data-modal-overlay` | overlay com id próprio | **id próprio + handler próprio**. O binder genérico (2558-2560) só chama `fecharModal` e deixaria `_cpPeriodoPendente` pendurado. Seguir o precedente de `_cpAbrirModalDuplicidade` (3534+). |
| Texto do sufixo | ` (sem dados neste período)` | ` (sem dados)` (reusar string existente) | **` (sem dados neste período)`**. A precisão vale mais aqui: esta OS é justamente o que cria a distinção "existe no cadastro × não tem dado neste mês". Consequência aceita e registrada: divergência de vocabulário com `master.html:3802` e `custo_folha_desktop:2139`, que seguem com "(sem dados)". NÃO alterar esses outros módulos. |
| Ordem das opções | bloco único alfabético | 2 blocos (com-dado primeiro, sem-dado depois) | **bloco único alfabético pt-BR**. É a leitura literal do requisito do diretor ("ordenar de forma previsível (alfabética)") e o painel do multi-select já tem busca textual automática acima de 8 opções, então findability não depende da posição. |
| Estado vazio da tabela | só `cp-hint-recorte`, com texto longo explicando | `cp-hint-recorte` curto + parágrafo de `#cp-vazio` explica | **os dois, com a divisão do designer**: o hint fica CURTO (é `text-[11px]` na barra de ferramentas; texto longo empurra o layout) e quem explica é o parágrafo de `#cp-vazio`. Ver seção 5. |

---

## 1. PARTE 1 — União das opções (Favorecido, Centro de Custo, Empresa)

### 1.1 Fontes

| Dimensão | Select id | Campo do lançamento | Fonte de cadastro |
|---|---|---|---|
| Favorecido | `cp-filtro-favorecido` | `entidade` | `Fornecedores.nome` (NOVA var `_cpCadFavorecidos`) |
| Centro de Custo | `cp-filtro-cc` | `centro_custo` | `_ccDisponiveis` — **JÁ EXISTE** (declarada 993, preenchida 1126). REUTILIZAR, não criar nova. |
| Empresa | `cp-filtro-empresa` | `empresa` (derivado) | valores distintos de `Fornecedores.empresa` (NOVA var `_cpCadEmpresas`) |
| **Despesa** | `cp-filtro-despesa` | `categoria` | **NÃO TOCAR** — `despOrd` (1499) continua idêntico. Decisão do diretor. |

`Base_Empresas` (listener em 2366) **não é usada** e não é tocada.

### 1.2 ARMADILHA no listener de Fornecedores (obrigatório)

`inscreverFornecedoresEmpresa` (1357-1377) faz, dentro do `snap.forEach`:
```
const emp = String(data.empresa || '').trim().toUpperCase();
if (!emp) return;            // <-- ABORTA O DOC
```
Coletar `nome` DEPOIS desse `return` perderia silenciosamente todo fornecedor sem empresa.
**A coleta de `nome` (e de `empresa`) deve ficar ANTES do early-return.** O early-return
continua valendo só para a montagem do `Map` código→empresa.

### 1.3 Helpers novos

```js
const _CP_SUFIXO_SEM_DADO = ' (sem dados neste período)';

// Chave canônica. NÃO remove acento — de propósito (precedente de bug "ESTÁGIO",
// Faturamento 2026-06-19: strip de acento juntou valores distintos).
function _cpChaveFiltro(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toUpperCase();
}

// União cadastro ∪ janela. Retorna [{v, t, temDado}].
function _cpUniaoOpcoes(setJanela, listaCadastro) {
  const m = new Map();
  for (const raw of (listaCadastro || [])) {      // cadastro primeiro: rótulo curado vence
    const k = _cpChaveFiltro(raw); if (!k) continue;
    if (!m.has(k)) m.set(k, { v: k, t: String(raw).trim(), temDado: false });
  }
  for (const raw of (setJanela || [])) {
    const k = _cpChaveFiltro(raw); if (!k) continue;
    const ex = m.get(k);
    if (ex) ex.temDado = true; else m.set(k, { v: k, t: String(raw).trim(), temDado: true });
  }
  const arr = [...m.values()].sort((a, b) => a.t.localeCompare(b.t, 'pt-BR'));
  for (const it of arr) if (!it.temDado) it.t += _CP_SUFIXO_SEM_DADO;  // sufixo DEPOIS de ordenar
  return arr;
}
```
O sufixo é aplicado **após** a ordenação — senão entraria na comparação e a ordem ficaria irregular.

### 1.4 Onde plugar

A união é calculada **DENTRO de `_cpPopularDropdownsAsync` (1493)**. A assinatura
`(comps, favs, desp, ccs, empresas, onDone)` fica **INTACTA** — há 2 chamadores (1452 e 1473)
e centralizar faz os dois ganharem o comportamento sem risco de divergir.

`_popularSelectMultiChunked` (1522) passa a aceitar item-objeto, mantendo compatibilidade
total com `despOrd` (array de strings):
- no topo: `const itens = valores.map(x => typeof x === 'string' ? { v: x, t: x } : x);`
- `valoresSet = new Set(itens.map(i => i.v))`
- nos dois loops de construção (1573-1578 e 1591-1596): `opt.value = it.v; opt.textContent = it.t;`

Os fantasmas legados (1549-1567) passam a usar o **mesmo** `_CP_SUFIXO_SEM_DADO`. Um valor
que é fantasma E de cadastro entra **uma vez só**, com um sufixo só — unifique os conjuntos
antes de gerar as `<option>`. Sentinelas (`Todos`, `__SEM_CC__`, `__SEM_EMPRESA__`,
`__SEM_TIPO__`) **nunca** recebem sufixo (regra já existe em 1553 — preservar).

### 1.5 Token de geração (obrigatório)

Agora há TRÊS gatilhos de repopulação (snapshot de ContasAPagar, Fornecedores, Áreas) em vez
de dois. Duas cascatas assíncronas sobrepostas duplicariam opções. Em
`_popularSelectMultiChunked`:
- antes do `sel.innerHTML = ...`: `const meuGen = (sel._cpGen = (sel._cpGen || 0) + 1);`
- no topo de `proximoChunk`: `if (sel._cpGen !== meuGen) return;`

(Hoje o caminho é síncrono porque ~306 opções < `SYNC_LIMITE` 800; o token é o que impede o
bug quando a base de Fornecedores passar de 800 nomes. **Não alterar `SYNC_LIMITE` nem `CHUNK`.**)

### 1.6 Race — correção obrigatória em `inscreverAreas`

`inscreverAreas` (1113) só chama `renderTudo()` (1130), e `renderTudo` **não repopula
dropdowns**. Se as Áreas chegarem depois do snapshot, os CCs de cadastro nunca aparecem.
**Acrescentar após a linha 1130:**
```js
if (typeof _cpUltimoSnapRefresh === 'function') _cpUltimoSnapRefresh();
```
Mesmo padrão e mesmo guard já usados em 1375 para Fornecedores.

### 1.7 Coalescência (autorizada)

Envolver `_cpUltimoSnapRefresh` num debounce de ~80 ms. Com 3 gatilhos no load, cada
`innerHTML`/`appendChild` aciona o `MutationObserver` do `checkbox_multi.js` (314-318), que
reconstrói o painel inteiro. Higiene, não correção de bug — mas está autorizada.

### 1.8 `aplicarFiltrosCP` — normalizar SÓ o lado do REGISTRO

Com `option.value` canônico, as comparações estritas quebrariam. Alterar EXATAMENTE estas três:
- 1876 → `if (favSet && !favSet.has(_cpChaveFiltro(r.entidade))) return false;`
- 1879 → `const empReg = _cpChaveFiltro(r.empresa);` (o teste `passaSemEmp = empFiltraSemEmp && !empReg` continua igual)
- 1891 → `const ccReg = _cpChaveFiltro(r.centro_custo);`

**INTOCADOS:** 1875 (Status), 1877 (Despesa), 1884-1888 (Tipo), 1896 (Classificação).

**REGRA DE OURO — nunca normalizar o lado do FILTRO.** Jamais aplicar `_cpChaveFiltro` sobre
os arrays de `getMultiValues`: eles contêm `'Todos'`, e `'Todos'.toUpperCase() === 'TODOS'`
quebraria simultaneamente `getMultiValues` (1322), `isMultiAll` (1326), `setMultiValues` (1337)
e a constante `SENTINELA = 'Todos'` do widget (`assets/checkbox_multi.js:29`). É uma falha de
1 caractere que derruba todos os filtros da tela.

### 1.9 VETO — normalização inline e preguiçosa, NUNCA no objeto do cache

**PROIBIDO** pré-computar `r.__kFav`/`__kCC`/`__kEmp` no loop do snapshot (1429-1440).
`cacheRegistros` NÃO é só leitura: a cadeia `4714` (`cacheRegistros.find`) → `4761`
(`{...regOriginal}`) → `4661` (`{...reg}`) → `4679` (`const { _id, ...payload } = c` dentro de
`writeBatch`) **escreve o objeto do cache em /ContasAPagar**. Campo sintético seria persistido
em produção em até 120 clones de recorrência por lançamento, irreversível e sem sinal na UI.

Caminho aprovado: chamar `_cpChaveFiltro` **inline**, dentro dos `if (favSet)`/`if (empSet)`/
`if (ccSet)` que já existem — só custa CPU quando aquela dimensão está filtrada. É por isso que
`_cpChaveFiltro` **não** usa `normalize()` (a parte caríssima). Se houver regressão medida, a
única alternativa permitida é um `WeakMap<regObj, chaves>` (fora do objeto, invisível ao
spread) — **nunca** propriedade no registro.

### 1.10 `_ccDisponiveis` é somente-leitura aqui

**NÃO normalizar `_ccDisponiveis` em lugar.** Ela alimenta selects de ESCRITA
(`_cpCarregarCcNoSelect` 4595-4613 e `_cpRepopularSelectCCMassa` 2386-2393) cujos valores são
persistidos em `centro_custo` no Firestore. Normalizar em lugar gravaria CC em caixa alta no
banco. Copie/transforme, não mute.

---

## 2. PARTE 2 — Guarda do filtro de Período

### 2.1 Constantes (declarar junto de `PAGE_SIZE_CP`, ~1916)

```js
const CP_LIMITE_AVISO_PERIODO = 15000;  // registros
const CP_LIMITE_AVISO_MESES   = 3;      // fallback quando a contagem falha
```
Justificativa do 15.000 (vinculante, não mexer sem falar com o coordenador): 3x um mês típico
(4.700-5.000), então mês normal nunca avisa; Jan/2026 (11.094, o pior mês) passa com 35% de
folga — e esse volume já é alcançável hoje sem aviso nenhum clicando "Carregar mês anterior"
2x. Acima de 15.000 o passe de filtro cruza ~40 ms e, com o debounce de 180 ms da busca
textual (1750), a digitação começa a engasgar de forma perceptível.

### 2.2 Import

Adicionar **exatamente um símbolo** à lista de imports existente (942-950):
`getCountFromServer`. `collection`, `query`, `where` já estão lá. **NÃO trocar a URL nem a
versão do CDN** (seria Lei da decisão).

Antes de codar o resto, faça um smoke check de 1 linha (`console.log(typeof getCountFromServer)`)
— nenhum outro módulo do repo usa essa função hoje, é a primeira vez no projeto.

### 2.3 Índice e rules: INTOCADOS

A contagem tem desigualdade em UM único campo (`data_vencimento`), sem `orderBy` e sem segundo
campo → servida pelo índice de campo único automático. `firestore.indexes.json` **não muda**
(`fieldOverrides: []`, nenhuma exemption). `firestore.rules` **não muda** — a contagem herda o
`allow read` de `/ContasAPagar` (159-165); quem já assina o `onSnapshot` da mesma janela já
pode contar, então não há ampliação de acesso.

### 2.4 Fonte única das constraints

Extrair de `_cpSubscribeJanela` para não deixar contagem e listener divergirem:
```js
function _cpConstraintsRange(ini, fim) {
  const c = [];
  if (ini) c.push(where('data_vencimento', '>=', ini));
  if (fim) c.push(where('data_vencimento', '<=', fim));
  return c;
}
```
`_cpSubscribeJanela` (1412-1415) passa a montar `[orderBy('data_vencimento','desc'), ..._cpConstraintsRange(_cpJanelaIni, _cpJanelaFim)]`.
A contagem usa `query(collection(db, COLECAO), ..._cpConstraintsRange(ini, fim))` **sem orderBy**.

### 2.5 Fluxo do handler `btn-filtros-cp-aplicar` (2189-2216)

Fatiar em dois passos. **Extrair o corpo atual (2195-2215) inteiro para
`_cpComitarPeriodo(ini, fim)`** — commit em `_cpPeriodoComitado`, janela, `_cpAtivarJanela()`,
`_cpPage = 1`, `renderTudo()`, `_cpSalvarEstadoFiltros()`, `fecharModal('modal-filtros-cp')`.
Zero duplicação de regra.

```
PASSO A — clique em Aplicar (handler vira async)
  lê inputs -> novoIni, novoFim           (NÃO commita ainda)
  janelaMuda = (novoIni !== _cpJanelaIni || novoFim !== _cpJanelaFim)
  se (!janelaMuda) -> _cpComitarPeriodo(novoIni, novoFim)   // caminho de hoje, sem contagem
  senão:
    se (_cpContagemEmVoo) return                            // guard anti-duplo-clique
    _cpContagemEmVoo = true; botão disabled + label "Conferindo volume…"
    try   { n = (await getCountFromServer(qRange)).data().count }
    catch { n = null }                                      // degradação, nunca trava
    finally { _cpContagemEmVoo = false; restaura label e disabled do botão }
    pesado = (n != null) ? (n > CP_LIMITE_AVISO_PERIODO)
                         : (!novoIni || !novoFim || mesesEntre(novoIni, novoFim) > CP_LIMITE_AVISO_MESES)
    se (!pesado) -> _cpComitarPeriodo(novoIni, novoFim)
    senão -> _cpPeriodoPendente = { ini: novoIni, fim: novoFim, n };
             preenche o texto do modal; abrirModal('modal-cp-periodo-pesado')

PASSO B — "Continuar assim mesmo"
  _cpComitarPeriodo(_cpPeriodoPendente.ini, _cpPeriodoPendente.fim); _cpPeriodoPendente = null

PASSO B' — "Ajustar período" / X / clique no overlay
  fecharModal('modal-cp-periodo-pesado'); _cpPeriodoPendente = null
  modal-filtros-cp PERMANECE aberto com as datas digitadas
  NADA é aplicado: _cpPeriodoComitado e a janela ficam como estavam
  devolver o foco a #cp-filtro-periodo-fim (684)
```
`mesesEntre` é helper local novo (amplitude em meses entre dois ISO). Se `n == null` E o range
for aberto, o modal aparece **sem o número**, com a variante de texto
"Este período abrange N meses e pode deixar a tela lenta."

### 2.6 Modal — ver seção 3 da spec do designer (vinculante)

Resumo do que é obrigatório: id `modal-cp-periodo-pesado`; clonar a ESTRUTURA de
`modal-confirmar-delete-fatura-cp` (570-596); **`z-[84]`**; card COM a classe `bg-white`
(senão `abrirModal`/`fecharModal` 2544-2557 não acham `div.bg-white` e a animação morre em
silêncio); tom **âmbar**, não vermelho (não é ação destrutiva); ícone `hourglass_top`, **sem**
`animate-pulse`; overlay com **id próprio** (`cp-aviso-periodo-overlay`), **sem**
`data-modal-overlay`.

**LISTA NEGRA de classes (sem cobertura no tema escuro — não usar):** `bg-amber-100`,
`bg-amber-50/60` ou qualquer `bg-amber-*` com modificador de opacidade, `border-amber-100`,
`text-amber-500`, `text-amber-600`. Usar SÓ `bg-amber-50`, `border-amber-200`,
`text-amber-700/800/900`. O `modal-cp-duplicidade` (781, 789) já sofre desse defeito no tema
escuro — **defeito preexistente, NÃO corrigir aqui, e NÃO replicar.**

Copy exata na seção 3.7 da spec. Número formatado com `toLocaleString('pt-BR')` e `tabular-nums`.

---

## 3. Sticky filtros (sessionStorage)

### 3.1 Versionar a chave (obrigatório)

`_CP_SS_FILTROS` (1622): `'centrafin_cp_filters'` → **`'centrafin_cp_filters_v2'`**.
Motivo: os valores persistidos mudam de formato (`"Raffoul Ltda"` → `"RAFFOUL LTDA"`). Um
estado gravado antes do deploy seria restaurado no formato antigo, `setMultiValues` (1328-1341)
não acharia a option e cairia no fallback que marca `'Todos'` (1336-1339) — seleção perdida
em silêncio. Com a chave versionada o estado antigo fica órfão e é ignorado; é `sessionStorage`,
o lixo morre ao fechar a aba. Zero código de migração.
**Alternativa REJEITADA:** normalizar na restauração — normalizaria `'Todos'` → `'TODOS'` e
quebraria as sentinelas (ver 1.8).

### 3.2 Adiar a restauração até os cadastros chegarem

A restauração é one-shot, travada por `_cpFiltrosRestaurados` no `onDone` do PRIMEIRO snapshot
(1452-1458). Se os cadastros ainda não entregaram nesse instante, as opções só-de-cadastro não
existem → filtro salvo apontando para elas é perdido, e **não volta**.

Condicionar `_cpFiltrosRestaurados = true` a `_cpFornecedoresCarregados === true` (flag já
existe, 1354/1371) **E** a uma nova `_cpAreasCarregadas` setada em `inscreverAreas`. Se ainda
não chegaram, adiar para o próximo `onDone` — que virá do `_cpUltimoSnapRefresh` disparado
pelos próprios cadastros.
**Mais um `setTimeout` de guarda de ~1500 ms** que força a restauração mesmo sem os cadastros:
os handlers de erro dos listeners só fazem `console.warn` (1131 e 1376), e um listener com
falha de permissão não pode deixar o operador sem filtros para sempre.

---

## 4. FORA DE ESCOPO — não implementar (já reportado ao diretor)

1. **Período restaurado do sessionStorage** re-assina a janela sem guarda de contagem
   (1705-1711). F5 após confirmar um Período de 1 ano recarrega 51.881 docs sem aviso.
   Fechar isso exigiria modal no carregamento da página — intrusivo, não aprovado.
2. **"Carregar mês anterior"** (2243-2248) pode ser clicado N vezes até abrir a base inteira,
   também sem guarda.
3. **Sufixo `" (não cadastrado)"`** para valores que existem no lançamento mas não no cadastro
   (ex.: o CC "COMERCIAL"). Vocabulário já existe em 4610. Não foi pedido.
4. **Chip de filtros em caixa alta**: `atualizarChipFiltros` usa `arr[0]`, que é o **value**
   (2136), então Favorecido/CC/Empresa passam a aparecer em CAIXA ALTA no chip. Consequência
   aceita — vai para a validação visual do diretor. **NÃO "consertar"** mapeando value→textContent.
5. **Defeito de tema escuro do `modal-cp-duplicidade`** (781, 789).
6. **Camada 3** (carregar os 51.881 em memória) — proibida sob qualquer pretexto.
7. `assets/checkbox_multi.js`, `theme.css`, `theme_manager.js`, `firestore.rules`,
   `firestore.indexes.json`, `Base_Empresas`, `CP_Base_Despesas` — **zero alterações**.

---

## 5. Estado vazio da tabela (decisão do coordenador)

**`cp-hint-recorte`** (id 281, atribuído em 1965-1967) — fica CURTO:
- `cacheRegistros.length === 0` → **inalterado** (`Sem dados — importe a Base Mestra e um TXT.`)
- filtrado e vazio → `Nada encontrado em <Mês/Ano>.` usando o mês da janela atual.
  **Reusar o formatador que já existe** dentro de `_cpFmtJanelaLabel` (1254-1266) — extraia-o
  para um helper ou chame-o; **não duplicar lógica de formatação de data**.
  Classe e token do span ficam iguais.

**`#cp-vazio`** (356-364) — muda **só o `<p>`** (361-363). Título `Nenhum lançamento
encontrado` e ícone `inbox` intocados. Texto novo conforme a seção 4.2 da spec do designer
(explica que o lançamento pode ser de outro mês, aponta Filtrar Base → Período, e mantém a
menção à Central de Importações).

---

## 6. Definition of Done do engenheiro (antes de devolver)

- Parse limpo do `code.html` (extraia o `<script type="module">` para um `.mjs` temporário no
  diretório de scratchpad e rode `node --check`, ou stage o arquivo e rode
  `node scripts/check-syntax.cjs` — ele só olha arquivos staged).
- `git diff --stat` deve mostrar **apenas** `gerenciador_contas_pagar_desktop/code.html`.
- Zero `#hex`, `rgb()`, `style="color:…"` ou `text-[#…]` inédito no diff (única exceção:
  `text-[#341100]` do botão primário, que já existe em 763).
- Nenhuma classe da lista negra da seção 2.6.
- `cp-filtro-despesa` fora do diff.
- Relate no retorno: qualquer ponto onde você divergiu deste briefing e por quê; e qualquer
  regressão/defeito preexistente que você tenha identificado e corrigido no caminho (regra
  permanente do CLAUDE.md — reportar, não silenciar).
