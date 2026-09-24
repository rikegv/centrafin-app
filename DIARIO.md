# Diario do Projeto - CentraFin

Registro vivo de decisoes e progresso. Entradas mais recentes no topo.
Mantido pelo coordenador a cada tarefa concluida ou decisao tomada.

---

## 2026-09-24 — OS-CP-LAYOUT-01: ajustes de colunas, KPIs, ordenacao e travessao no Contas a Pagar

Frente de UI na tela viva `gerenciador_contas_pagar_desktop/code.html`. Validada
visualmente pelo diretor no preview channel antes do deploy. Branch `feature/cp-layout`.

**Colunas da tabela:**
- Removida a coluna "Status" (todo lancamento sobe pago; nao ha vencido).
- "Vencimento" renomeada para "Mes de Referencia" (mesmo dado, data completa dd/mm/aaaa).
- "Favorecido" passou a exibir o favorecido REAL (`observacao`, a pessoa) no lugar da
  empresa (`entidade`). Investigacao provou 0 de 51.181 com `observacao` vazia, entao a
  coluna nunca fica em branco na pratica (fallback inerte usa "nao informado").
- "Gestor" renomeada para "Responsavel" (mesmo dado e regra CC->gestor via `_areaGestorMap`).
- Centro de Custo mantido.

**KPIs (cards do topo):**
- Removido o card "Vencidos" (grid 7->6 colunas).
- "Total Geral" passou a somar **Total Pago + Tarifas e Comissoes** (reusa os valores ja
  calculados `pago` e `tarifas`, sem logica nova).
- "Total Pago" mostra so o pago, sem tarifas (ja era o comportamento; tarifas seguem
  expurgadas so na matematica dos KPIs, nunca na tabela).
- "Custo Cliente" mantido.

**Ordenacao por clique (regra permanente "toda tabela ordena por clique"):** 7 colunas
ordenaveis (Mes de Referencia, Codigo, Favorecido, Despesa, CC, Responsavel, Valor), 1o
clique asc, 2o desc, seta indicadora na coluna ativa. Mesmo idioma do Faturamento
(`window.ordenarTabelaCP`, espelho de `ordenarTabelaCRF`): ordena o array-mestre
`cacheRegistros` in place e re-renderiza respeitando filtros/busca. Detalhe/Obs e Acoes
nao ordenam.

**Travessao (em dash U+2014) removido de TODA a UI do CP** (regra permanente): marcador
de celula vazia virou "nao informado" (tabela, export Excel, fallbacks de data); modais,
toasts, paginacao, labels, tooltip, opcoes de select e wizard/quarentena de importacao
tiveram o travessao trocado por pontuacao. Comentarios de codigo (nao sao UI) ficaram
intactos.

**MAPA versionado:** `docs/MAPA-CP-REFATORACAO.md` (mapa do que ja existe pronto para a
futura refatoracao do CP, modelo Soulan) entrou no git.

**Deploy:** `--only hosting` (firestore.rules nao mudaram). Nenhuma mudanca de calculo
alem dos KPIs 8/9. Carga por recencia, filtros, busca e cache proprio preservados.

**Ondas futuras registradas (fora desta OS):** Detalhe/Obs vira "Empresa" (Onda 3);
coluna "Grupo de Contas" (Onda 4); destrinchar OPEX em Interno (CLT+PJ) x Externo,
dependente do tipo preenchido (Onda 2). Higiene do travessao em COMENTARIOS de codigo
fica como passe opcional futuro.

---

## 2026-09-24 — OS-CP-CORRIGE-NOMES-01: correcao IN-PLACE dos nomes com "�" (sem apagar nada)

Nomes corrompidos por U+FFFD ("�", char de substituicao) por importacao anterior a
correcao de encoding. Diretor exigiu correcao NO LUGAR, sem apagar/reimportar/duplicar
(a base esta validada pelo time desde janeiro). Branch `feature/cp-corrige-nomes`.

**Fase 1 (investigacao, read-only):** scanner `scripts/scan-mojibake-cp.cjs` varreu as
duas colecoes e montou o de-para por dicionario (para cada nome com "�", achou o nome
INTEGRO que casa por comprimento + wildcard nas posicoes do "�", usando os nomes ja
integros em outros registros/meses como fonte da verdade). Resultado: **22 valores
distintos, TODOS resolviveis, ZERO ambiguos**. Contagem atual de "�": 2 docs em
`CP_Base_Despesas` (campo `despesa`) + 178 em `ContasAPagar` (`categoria` 170,
`observacao` 17, `entidade_txt` 8).

**Fase 2 (correcao in-place):** `scripts/fix-mojibake-cp.cjs`, dry-run por padrao,
`--apply` so apos o diretor conferir o de-para e o dry-run. Corrigiu **197 campos**
(2 em `CP_Base_Despesas` + 195 em `ContasAPagar`) via `update()` de campo unico
(`str_replace` do valor corrompido pelo correto). **Zero docs apagados, zero criados:
contagem 51.181 (ContasAPagar) e 112 (CP_Base_Despesas) identica antes e depois.**
"�" restante = 0. Backup do estado anterior (180 docs integrais) salvo LOCAL em
`scripts/backup-cp-corrige-nomes-apply-*.json` (gitignored + hosting ignore, fora do
Hosting). Validado visualmente pelo diretor (nomes com acento, zero "�" na tela).
Sem deploy de Hosting: nenhum arquivo servido mudou, so dado + os `.cjs` (que o
Hosting ignora).

**REGRA PERMANENTE (nova):** correcao de encoding em base JA VALIDADA pelo time e
sempre **IN-PLACE por dicionario** (update do campo com o nome correto, achado nos
registros integros), **nunca apagar/reimportar**. Isso **invalida a
OS-CP-LIMPEZA-LOTES-CORROMPIDOS-01** antiga (que apagava os 272 docs e reimportava):
NAO usar aquela abordagem.

**Fase 3 (garantir daqui pra frente): ja verde.** O importador do CP usa um
decodificador unico `cpLerTextoAutoEncoding` (UTF-8 estrito -> Windows-1252, nunca
gera "�") nos DOIS caminhos que gravam texto (ETL de faturas `code.html:3609` e ETL
de Beneficios PJ `code.html:4653`). Nada a corrigir; a OS-IMPORT-ENCODING-01 ja cobriu.

**Distincao registrada:** o "42/110" de 04/09 em `CP_Base_Despesas` NAO era "�", e a
OUTRA corrupcao (mojibake "Ã/Â" do `seeder_excel`, ex.: `ASSESSORIA CONTÃBIL` =
CONTÁBIL), reversivel por re-decodificacao. Fica FORA desta OS (escopo era so "�"),
registrada como OS futura separada se o diretor priorizar.

---

## 2026-09-24 — Merge de `feature/cp-carga-total` -> `main` (pendencia #1 FECHADA) + gate destravado

Diretor autorizou sincronizar a `main` com o que ja rodava em producao (a carga por
recencia do Contas a Pagar). Objetivo: eliminar o risco de um deploy futuro a partir
da `main` derrubar a versao no ar.

**O que foi feito:**
- **Fast-forward de `feature/cp-carga-total` -> `main`.** A `main` era ancestral
  direto do branch (merge-base = `3440f4a`), entao o merge foi FF puro: `main` avancou
  para o tip do branch (`53a22da`). Os 14 commits da carga (recencia, cache proprio,
  KPIs, filtros base, gate, modelo de 6 agentes) agora estao na `main`.
- **A flag `READY_cp-carga-total` NAO entrou na `main`** (o branch ja a removera).
- **Producao inalterada:** o merge nao muda nada no ar (producao ja servia esse
  codigo). Arquivos servidos conferidos em 200 depois do push.

**Pendencia do gate (acumulo de flags) RESOLVIDA DE VEZ:** o branch removia as 28
flags `READY_*` historicas da `main`, e sem flag no disco o proprio gate travava o
push da `main` (chicken-egg). Correcao: **`.claude/state/` foi para o `.gitignore`**
(commit `53a22da`). As flags do gate passam a ser ESTADO LOCAL DE DISCO (nascem e
morrem no push, nunca versionadas). Isso conserta o acumulo de flags no git e o
travamento de merge de uma so vez. E a correcao que a propria fabrica ja recomendara
ao ligar o gate. Hosting ja ignora `**/.*`, entao `.claude/` nunca foi servido.

**Estado apos esta sessao:** `main` = producao (codigo servido identico); nenhuma
flag no git; `.claude/state/` fora do versionamento. A pendencia #1 abaixo esta
fechada. Segue aberto: Faturamento com carga sem limite (mesma classe do CP),
`main`/`master` estrito no gate, `CP_Base_Despesas` corrompido, limpeza dos 272 docs
corrompidos (OS-CP-LIMPEZA-LOTES-CORROMPIDOS-01, preparada desde 2026-09-04) e os 7
cadastros com `NEAT` em centro de custo.

---

## 2026-09-23 — PONTO DE RETOMADA (fim de sessao, tudo validado e em producao)

> Sessao encerrada pelo diretor com tudo certo. Estado autossuficiente abaixo.

**Em producao (https://centra-fin.web.app), deployado hoje pelo gate:**
- **OS-CP-CARGA-RECENCIA-01** (Contas a Pagar): carga por recencia + cache proprio
  em IndexedDB. Validada no preview pelo diretor (onda1 <~5s, refresh quase
  instantaneo). Ver a entrada "saga da carga" abaixo. Arquivos 200 conferidos.
- **OS-GATE-DEPLOY-01**: o gate de deploy passou a funcionar de verdade (hook
  PreToolUse). Este foi o 1o deploy real que passou por ele, e liberou correto.

**Branch de trabalho:** `feature/cp-carga-total` (pushado em origin). Contem, alem
da carga do CP: o gate (OS-GATE-DEPLOY-01), o modelo de 6 agentes + CLAUDE.md nova,
e a base CP filtros (da6b1c0). A flag `READY_cp-carga-total` ja foi removida (commit
`75c8adc`, LOCAL: o gate barra push sem flag, entao sincroniza no proximo push
gated/merge; origin ainda tem o arquivo da flag, nao levar no merge).

**Pendencias para o diretor decidir (nada bloqueado):**
1. **Mergear `feature/cp-carga-total` -> `main`** quando quiser: producao serve o
   codigo desse branch, mas `main` nao reflete. E um merge grande (gate + agentes +
   CP filtros + saga de carga). Decisao do diretor.
2. **Faturamento** tem a MESMA pendencia de carga (base grande). Aplicar o padrao
   que resolveu o CP: memory cache + recencia (`limit`) + cache proprio em IndexedDB
   (NAO `persistentLocalCache`). Ver a entrada da saga e a regra permanente abaixo.
3. `main`/`master` estrito no gate: OS separada ja registrada (OS-GATE-DEPLOY-01).

---

## 2026-09-23 — Contas a Pagar: a saga da carga (total → duas ondas → RECENCIA + cache proprio)

Frente longa, em tres OS encadeadas na branch `feature/cp-carga-total`, sobre a
tela viva `gerenciador_contas_pagar_desktop/code.html` (o `contas_a_pagar_desktop/`
e legado exterminado). Registro como APRENDIZADO porque o caminho ensinou mais que
o destino.

**1. OS-CP-CARGA-TOTAL-01 (rejeitada):** carregar TODOS os ~51.864 docs de uma vez
via getDocs + persistentLocalCache. Mediu 16,72s de cold start no preview. O
diretor rejeitou (inaceitavel para o time). A rede de seguranca (medicao
obrigatoria antes de "pronto") funcionou.

**2. OS-CP-CARGA-DUAS-ONDAS-01 (nao servia):** dividir em onda 1 = ano vigente,
onda 2 = anos anteriores. NAO reduziu nada, e a investigacao explicou por que:
**99,998% da base tem vencimento em 2026** (51.863 de 51.864 docs; so 1 doc de ano
anterior; zero futuro). "Ano vigente" = a base inteira. Distribuicao por mes de
2026: jan 11.094, fev 8.470, mar 7.202, abr 5.592, mai 5.039, jun 4.864, jul 4.678,
ago 4.835, set 89. A contagem foi feita por aggregation (getCountFromServer via REST
com o token do firebase CLI, sem baixar docs). Alem disso, o
**`persistentLocalCache` do Firebase PIORA:** com a base ja no IndexedDB, o cache
"quente" ficou MAIS lento (48s) que o cold sem cache (16s), e o refresh nao acelerou
(bate com o alerta publico de leitura ate 20x mais lenta em certas versoes do SDK).
Ele e o freio, nao a solucao.

**3. OS-CP-CARGA-RECENCIA-01 (a solucao, em producao 2026-09-23):**
- **Removido o `persistentLocalCache`** do init do Firestore (`initializeFirestore`
  com `memoryLocalCache()`; cache do SDK so em memoria, zero disco do SDK).
- **1a onda por RECENCIA:** `orderBy('data_vencimento','desc') + limit(5000)` pinta
  a tela em <~5s (os ~2 meses mais recentes). O restante carrega em background via
  `startAfter(cursor)` em chunks, com aviso discreto "carregando restante..." e sem
  travar a interacao. Cursor = ultimo `QueryDocumentSnapshot`, nunca o objeto reg.
- **Cache PROPRIO da aplicacao em IndexedDB** (`centrafin_cp_cache`, store
  `snapshot`, 1 registro `{stamp, registros, blob}`): guarda o array JA PROCESSADO +
  o blob de busca e hidrata de uma vez com um `get` unico no 2o acesso (refresh
  quase instantaneo, medido pelo diretor), seguido de reconcile server-autoritativo
  em background. O reconcile e INCONDICIONAL de proposito (edicoes/exclusoes de
  outros usuarios NAO bumpam o stamp do ETL, so o reconcile as pega).
- **LGPD (GAP #5 estendido):** a store propria e apagada no logout
  (`indexedDB.deleteDatabase`) em TODOS os caminhos de saida (btn-logout e guarda de
  inatividade no `sidebar.js`, + os 6 redirects de auth do code.html). Dado
  financeiro/pessoal de fornecedor nao fica no disco da estacao apos sair.
- **KPIs do topo acompanham o filtro de Periodo** (ajuste do diretor): sem filtro,
  somam o ano vigente (na pratica quase tudo); com filtro de Periodo ativo, somam o
  recorte filtrado e nunca zeram. `atualizarKPIs` (calculo) ficou intacto; prova
  numerica confirmou os 7 cards identicos ao estado anterior.
- Preservados: uniao cadastro∪dados nos filtros, rotulos curados, populacao chunked,
  filtro salvo `_v2`, paginacao (50), blob pre-computado. Botao "carregar mes
  anterior" removido. `firestore.rules`/indices intocados (orderBy+limit+startAfter =
  campo unico).

**REGRA UTIL (permanente): NAO usar `persistentLocalCache` do Firebase para base
grande.** Ele degrada com a base ja em cache e nao entrega refresh rapido. O padrao
que resolveu: `memoryLocalCache` + 1a pintura por recencia (`limit`) + resto em
`startAfter` background + **cache proprio em IndexedDB** (array processado, hidratado
por `get` unico) + reconcile em background + limpeza no logout. **Faturamento tem o
mesmo problema de carga pendente (base grande) e deve seguir este mesmo padrao.**

Auditoria por OS: arquiteto → backend → frontend → seguranca (APROVADO: init sem
persistencia, limpeza da store em todo logout, C-LOG do HUD) → tester (PASS: prova
numerica dos KPIs, cursor/dedup, sem loop). Deploy isolado pelo gate novo
(OS-GATE-DEPLOY-01), so `--only hosting` (rules nao mudaram).

---

## 2026-09-23 — OS-GATE-DEPLOY-01: o gate de deploy amarrado de verdade

**Achado que originou a OS:** o gate de deploy NUNCA esteve amarrado. Nao havia
hook `PreToolUse` no `.claude/settings.json`, e o `.claude/settings.local.json`
tinha `firebase deploy *`, `git push *`, `npx firebase *` e 3x
`PowerShell(firebase deploy ...)` na allowlist. Ou seja, apesar de a constituicao
afirmar o contrario, o deploy estava LIBERADO, nao travado. A constituicao
descrevia uma trava que nunca existiu na pratica.

**O que foi feito (branch `feature/gate-deploy`):**
1. Hook `PreToolUse` registrado no `.claude/settings.json`, matcher `Bash|PowerShell`
   -> `node scripts/gate-deploy.js`. Cobre a rota de escape via ferramenta PowerShell.
2. Allowlist do `settings.local.json` limpa (removidas as entradas de deploy/push).
   Observacao: `settings.local.json` e gitignored (config local de maquina), entao a
   limpeza vive localmente e nao e versionada; o hook roda independente da allowlist.
3. `scripts/gate-deploy.js` reescrito: cabecalho migrado para o modelo de 6 papeis
   (sem `deployer`/`testador-auditor`); passou a exigir flag `READY_*`
   CORRESPONDENTE ao branch (nao qualquer flag acumulada); cobre
   `firebase hosting:channel:deploy`.
4. 28 flags `READY_*` antigas acumuladas foram APAGADAS (o fluxo manda remover apos
   o push; nunca eram removidas, e por isso o gate de "qualquer flag" nunca barrava).

**As 8 rotas de escape que a seguranca fechou (auditoria adversarial, veto + re-audit):**
- G1: `git -C <dir> push` e `git --work-tree=... push` furavam o regex de adjacencia.
  Corrigido para `\bgit\b[^\n]*\bpush\b` / `\bfirebase\b[^\n]*\bdeploy\b`.
- G2: crash do proprio hook = fail-open (deploy passava). Corrigido: `main()` em
  try/catch com `process.exit(2)` (fail-closed).
- G3: se `git` falhava, caia no modo permissivo (qualquer flag). Corrigido: branch
  indetectavel/HEAD destacado/slug curto agora BLOQUEIA (fail-closed).
- G4: verbo escondido dentro de arquivo (`bash deploy.sh`) nao e interceptado.
  RESIDUAL DOCUMENTADO e aceito (fora do threat model; deploy do CentraFin e sempre
  firebase CLI + git direto). Documentado no cabecalho do script.
- G5: deploy via REST (`firebasehosting.googleapis.com`) e `gh workflow/release`
  nao eram cobertos. Adicionados ao padrao.
- G6: match de slug bidirecional afrouxava (flag curta `READY_gate` liberava branch
  `gate-deploy`). Corrigido: `fs2 === slug || fs2.includes(slug)` (a flag tem que
  ser tao especifica quanto o branch).
- G7: quebra de linha (`firebase \<nl> deploy`) furava. Corrigido: normaliza
  continuacao de linha antes do teste.
- G8: o hook dispara em Bash de SUBAGENTE? PROVADO empiricamente (um subagente rodou
  `echo "... firebase deploy ..."` e foi bloqueado). Subagente nao e rota de escape.

**Prova (tester 7/7 independente + regressao pos-patch, repo git temporario isolado):**
A (suja+sem flag)=BLOQ; B (limpa+sem flag / so flag de outra frente)=BLOQ;
C (limpa+flag correspondente)=LIBERA; D (`hosting:channel:deploy` sem flag)=BLOQ,
com flag=LIBERA; benigno=LIBERA sempre. Sem ReDoS.

**Decisoes do diretor (2026-09-23):**
1. Limpeza das 28 flags antigas: APROVADA (feita nesta OS).
2. `main`/`master` estrito: DEFERIDO para OS separada (hoje, em `main`/`master`, o gate
   fica permissivo e qualquer flag existente libera; corretamente cercado e documentado).
3. Atrito fail-closed (comando read-only que so CITA "git...push"/"firebase...deploy"
   na mesma linha e bloqueado): ACEITO como esta (ruido seguro, direcao correta).

**PENDENCIA REGISTRADA:** OS futura para apertar o deploy a partir de `main`/`master`
(unico buraco conhecido remanescente, hoje contido e documentado). Recomendacao adicional
surgida na execucao: avaliar tornar `.claude/state/` gitignored, para a flag ser estado
local (nasce/morre sem commit) e nunca mais acumular no versionado.

**Primeiro teste real do gate:** o proprio `git push` desta OS passou pelo gate novo
(arvore limpa + flag `READY_gate-deploy` = liberou). Gate provado no uso real.

---

## 2026-09-11 — PONTO DE RETOMADA (sessão interrompida pelo diretor)

> **Para retomar: leia esta entrada inteira. Ela é autossuficiente.**
> Duas OS abertas, empilhadas, **nenhuma em produção**. `main` segue em `3440f4a`.

### Estado dos branches

| Branch | Commit | Estado |
|---|---|---|
| `main` | `3440f4a` | produção; **não foi tocada** |
| `feature/cp-filtros-base` | `da6b1c0` | OS-CP-FILTROS-BASE-COMPLETA-01 **completa**, todos os gates técnicos passados. **Aguardando validação visual do diretor.** Não pushada. |
| `feature/cp-janela-6m` | (sem commits de código) | OS-CP-JANELA-6M-01: arquiteto e designer concluídos, decisões do diretor tomadas. **Próximo passo = despachar o engenheiro-frontend.** Branch ativo no momento da interrupção. |

### O QUE FAZER AO RETOMAR, em ordem

1. **Cobrar do diretor a validação visual da OS-CP-FILTROS-BASE-COMPLETA-01.** Sem ela não
   há flag e nenhuma das duas OS vai a produção (a segunda está empilhada na primeira).
   Preview channel: `https://centra-fin--cp-filtros-base-ugukuksq.web.app/gerenciador_contas_pagar_desktop/code.html`
   — **expira em 2026-09-17**. Se tiver expirado, o deployer recria com
   `npx firebase hosting:channel:deploy cp-filtros-base --project centra-fin --expires 7d`.
   O roteiro dos 5 pontos que o diretor deve olhar está na seção "Validação visual pendente" abaixo.
2. **Despachar o engenheiro-frontend da OS-CP-JANELA-6M-01**, usando
   `docs/os-briefings/OS-CP-JANELA-6M-01.md` (briefing consolidado, vinculante para lógica)
   + `design/specs/cp-janela-6m.md` (vinculante para markup/tokens). Nada mais é necessário:
   os dois documentos já contêm as decisões, os 19 vetos e o checklist.
3. Depois: designer (auditoria de tokens) → testador-auditor (com as medições T1–T7 do briefing)
   → validação visual do diretor → flag → deployer.

---

## 2026-09-10 — Investigação: filtros e busca do Contas a Pagar vs. base completa

**Pedido do diretor:** investigar (sem implementar) por que os filtros e a pesquisa do Contas a
Pagar só alcançam o mês carregado na tela.

### Números medidos em produção (read-only, via token do firebase CLI como ADC)

- `/ContasAPagar` = **51.881 documentos** (5x os "10k+" que motivaram a janela de mês em 2026-06-18).
- Por mês de `data_vencimento`: Jan/2026 **11.094** · Fev 8.470 · Mar 7.202 · Abr 5.592 ·
  Mai 5.039 · Jun 4.874 · Jul 4.679 · Ago 4.855 · Set 75. Mais 32 docs com `competencia_ref`
  12/2025 vencendo em Jan/2026 (regra de competência de PJ funcionando).
- Crescimento ~4.700–5.000 docs/mês.
- Peso: 919 B/doc em JSON (45,5 MB a base inteira); **1,83 KB/doc de heap** como objeto JS
  (~90 MB a base inteira, ~150–250 MB de aba com as cópias internas do SDK).
- Passe de filtro **com** busca textual: 11–14 ms em 5.000 docs; **110–165 ms em 51.881**.
  Sem busca textual: 15–19 ms. O gargalo é `_cpNormalizarBusca` montando e normalizando (NFD)
  um blob de 4 campos por registro **a cada tecla**.
- Valores distintos: 295 favorecidos · 121 despesas · **12** centros de custo · 817 códigos de
  fornecedor · 1.176 docs sem CC.
- Um documento com `data_vencimento` corrompido: `"0026-09"` (e `competencia_ref` `09/0026`).
  Hoje invisível por estar fora de qualquer janela. **Não tratado — candidato a limpeza.**

### Diagnóstico: o que travava em junho de 2026

**Não existe entrada no DIARIO sobre 2026-06-18** — o diário começa em 2026-07-01. A única
documentação era o comentário no código. Reconstituição pela sequência de correções:

- **2026-05-18** paginação `PAGE_SIZE_CP = 50` → renderização já estava resolvida ANTES de junho.
- **2026-05-18** `requestAnimationFrame` coalescendo `renderTudo`.
- **2026-05-20** inserção das `<option>` em blocos de 500 via `requestIdleCallback`.
- **2026-06-18** só então entrou a janela de mês.

Logo, o que junho atacou foi **dado em memória + listener em tempo real**, não renderização:
(a) o SDK Web do Firestore **não suporta projeção de campos** (`select()` não existe), então o
browser sempre baixa o documento inteiro; (b) cada entrega do `onSnapshot` reconstrói o array
inteiro + 5 Sets, e o ETL em lotes de 450 dispara ~12 entregas por importação; (c) passes O(n)
por tecla.

### Achado adicional (não estava na OS)

**O filtro de Período já permitia reproduzir a regressão de junho.** Aplicar um Período de 1 ano
copiava o range para a janela e reassinava o `onSnapshot` **sem `limit`** → listener ao vivo sobre
51.881 docs, sem aviso. Foi o que originou a Parte 2 da OS seguinte.

### Correções de premissa registradas

1. **Firestore não tem `DISTINCT`** e não faz busca textual parcial. A opção (b) do diretor
   ("query pontual levanta só os valores distintos") **não é implementável** como descrita.
2. **`empresa` não existe no documento** — é derivada no cliente por lookup em
   `Fornecedores.codigo_fornecedor`. Não há como filtrar por empresa no servidor.
3. `scripts/check-syntax.cjs` **não está quebrado** como o DIARIO afirmava em 2026-09-08: ele só
   checa arquivos *staged*. É gate cego por desenho, não por defeito. Para `<script type="module">`
   ele também falha por gravar o corpo como `.cjs` (o `node --check` rejeita `import`) — limitação
   preexistente da ferramenta, confirmada idêntica no baseline. Usar `node --check` sobre `.mjs` extraído.

### Proposta aprovada pelo diretor: três camadas

- **Camada 1** — opções completas vindas dos cadastros já carregados. Custo zero. → virou a
  OS-CP-FILTROS-BASE-COMPLETA-01.
- **Camada 2** — resultados cross-mês por query dirigida (entidade/categoria/centro_custo), com
  índice composto. **Não implementada.**
- **Camada 3** — varredura da base inteira em memória. **Proibida** por decisão permanente.

---

## 2026-09-10/11 — OS-CP-FILTROS-BASE-COMPLETA-01 (COMPLETA, aguardando validação visual)

Branch `feature/cp-filtros-base`, commit **`da6b1c0`**. 4 arquivos, +1466/−48
(`gerenciador_contas_pagar_desktop/code.html` = +411/−48; o resto é spec e testes).

### Escopo entregue

**Parte 1 — união das opções.** Os dropdowns de **Favorecido**, **Centro de Custo** e **Empresa**
passam a ofertar a união de (cadastro ∪ mês carregado). Opções sem lançamento na janela recebem o
sufixo ` (sem dados neste período)`. Zero leitura nova — os cadastros já eram carregados por
listeners existentes.

**Parte 2 — guarda do Período.** `getCountFromServer` conta antes de abrir o listener; acima de
`CP_LIMITE_AVISO_PERIODO = 15000`, abre `modal-cp-periodo-pesado` pedindo confirmação. Fallback
por nº de meses (`CP_LIMITE_AVISO_MESES = 3`) quando a contagem falha.

### Decisões do diretor nesta OS

1. **Despesa ficou FORA.** Medição: `CP_Base_Despesas` tem **42 de 110 registros corrompidos por
   mojibake** (`"ADIANTAMENTO DE 13Âº SALÃRIO -"`, `origem: seeder_excel`, nunca alcançado pela
   OS-IMPORT-ENCODING-01) e cobre só **85 dos 121** valores em uso. Reverter o mojibake em memória
   recupera bem e derruba a lacuna de 72 para 36, mas ainda injetaria nomes estranhos no dropdown.
   Decisão: não conectar. **A corrupção do cadastro é OS própria**, junto da
   OS-CP-LIMPEZA-LOTES-CORROMPIDOS-01 que segue aguardando autorização desde 2026-09-04.
2. **Limiar 15.000**, não os ~5.000 do exemplo do diretor. Jan/2026 (11.094, o pior mês) **não é
   lento** (~25–36 ms/passe) e esse volume já era alcançável sem aviso clicando "Carregar mês
   anterior" 2x. Avisar à toa treina o operador a ignorar o modal.
3. **Fonte da dimensão Empresa corrigida pelo coordenador:** `Fornecedores.empresa` (17 valores
   reais) e **não** `Base_Empresas` (5 docs, 3 nomes úteis, alguns `_id` são hash). É o mesmo campo
   de onde `_cpResolverEmpresaDoReg` já deriva a empresa — sem divergência de regra.
4. **Validação visual em preview channel com dados reais**, não em emulador com dados sintéticos.

### Cobertura real dos cadastros (medida, não presumida)

| Dimensão | Fonte | Cobertura |
|---|---|---|
| Favorecido | `Fornecedores.nome` | **perfeita** — 306 nomes cobrem os 295 em uso, zero lacunas |
| Centro de Custo | `AreasContasPagar.nome` | cobre 11 de 12; "COMERCIAL" existe só nos lançamentos (a união resolve) |
| Empresa | `Fornecedores.empresa` | universo completo (17 distintos) |
| Despesa | `CP_Base_Despesas` | **inadequada** — ver decisão 1 |

### O veto que evitou contaminar produção

A saída natural para economizar CPU seria pré-calcular chaves de comparação **dentro** de cada
registro em memória. O arquiteto rastreou que esses objetos são espalhados por
**dois caminhos independentes** até escritas reais: `code.html:5077` (`cacheRegistros.find`) →
`5123-5129` → `5024` (até 120 clones de recorrência) → `5042` (`const {_id, ...payload}`, remove
**só** `_id`) → `5044` (`batch.set` em `/ContasAPagar`); e `5086` → `1052-1066`
(`/CP_SolicitacoesAprovacao`). Campo sintético seria **persistido em produção sem nenhum sinal na
UI**. Vetado; a normalização é inline, dentro dos `if` que já existiam.

### Gates

| Gate | Resultado |
|---|---|
| Arquiteto | aprovado, 9 vetos de implementação, todos respeitados |
| Designer (spec) | `design/specs/cp-filtros-base-completa.md` |
| Engenheiro | +411/−48 em 1 arquivo de produção |
| Designer (auditoria de tokens) | 3 achados, os 3 corrigidos |
| Testador-auditor | **APROVADO** — emulador real com as `firestore.rules` de produção; confirmou ao vivo `getCountFromServer` (contagem exata, contagem com `where`, degradação em `permission-denied`) e o perfil `consulta` |
| Sintaxe | 3 blocos de `<script>`, parse limpo |
| Regressão | `scripts/test-cp-filtros-base-completa-logica.cjs` → **57/57** |
| Segredos | `check-secrets.cjs` limpo |
| `firestore.rules` / `firestore.indexes.json` | **intocados** — a contagem herda o `allow read` de `/ContasAPagar` e usa índice de campo único automático. Gate de emulador de regras não acionado (DoD). |

### Achados do designer (os 3 corrigidos)

1. **`theme.css` não cobre variantes `hover:` do Tailwind.** Os seletores são
   `html.dark .bg-slate-50`, e o Tailwind gera `.hover\:bg-slate-50` — nome diferente, não casa.
   Há exatamente 2 regras com `:hover` no arquivo inteiro. No botão novo isso dava contraste
   ~1,5:1 no tema escuro (flash branco com o rótulo apagando). Corrigido com `hover:bg-primary/10`
   (alpha funciona nos dois temas). **O designer corrigiu a própria spec, que afirmava o contrário.**
   **Defeito sistêmico preexistente em outros 6 pontos do arquivo** (incluindo
   `btn-filtros-cp-limpar`, de onde o molde foi copiado) — **não corrigidos, OS própria.**
2. **`_cpFmtJanelaCurto` mentia sobre o recorte** quando a janela tinha só uma ponta (ex.: só
   "Até" preenchido): afirmava "Nada encontrado em Set/2026" quando a janela real era "tudo até
   Set/2026", e mandava ajustar um Período que já estava sem piso. Corrigido espelhando o
   vocabulário de `_cpFmtJanelaLabel` ("até Set/2026" / "a partir de Ago/2026").
3. **Estado `disabled` invisível** no botão "Aplicar" durante a contagem. Corrigido com
   `disabled:opacity-50 disabled:cursor-not-allowed`. **Autorizado pelo coordenador** por ser a
   metade visual de um comportamento já aprovado, apesar de a spec marcar a linha como intocada.

### Erro do coordenador, pego pelo engenheiro (reporte obrigatório)

O briefing mandava comparar o Período novo com a janela **literal**. Assim, **limpar o Período**
daria `janelaMuda = true` e a contagem rodaria com range vazio = **coleção inteira** → o gesto mais
leve da tela abriria o modal de aviso. O engenheiro implementou `_cpJanelaAlvoDoPeriodo`
(Período vazio = mês padrão) e reportou a divergência. Erro de desenho do coordenador, corrigido
antes de virar bug.

### Consequências aceitas (vão para a validação visual)

- **Chip de filtros em CAIXA ALTA** para Favorecido (o chip usa o `value`, que é a chave canônica).
  CC e Empresa não mudam (a tabela já renderiza em caixa alta e a empresa já era UPPER).
  Instruído a **não** "consertar" — é ajuste de 1 linha se incomodar.
- **Divergência de vocabulário:** este módulo usa "(sem dados neste período)"; `master.html` e
  `custo_folha_desktop` seguem com "(sem dados)". Deliberado.
- **Ausência de botão "X" no modal novo** está correta: a convenção do arquivo é que modal que
  devolve decisão não tem X (os dois moldes existentes também não têm).

### Validação visual pendente — roteiro para o diretor

1. Dropdowns de Favorecido/CC/Empresa com a tela em Set/2026: devem ofertar toda a base, com
   sufixo nos sem-dado. **Despesa deve continuar curta** (ficou fora por decisão).
2. Período `01/01/2026 → 31/12/2026` → modal com **51.881** formatado em pt-BR.
   **Olhar no tema escuro e passar o mouse nos dois botões** (pedido expresso do designer).
3. Período de 1 mês → carrega direto, sem modal.
4. Abrir o dropdown de Favorecido e, **com ele aberto**, clicar em Aplicar com período pesado:
   o painel (`z-[200]` em portal) deve sumir no mesmo gesto e o modal aparecer limpo.
5. Chip de filtros em caixa alta (consequência aceita acima).

**Expectativa a calibrar:** escolher um fornecedor que só existe em outro mês traz a **tabela
vazia**, com o texto novo explicando que o dado pode estar em outro período. É o comportamento
correto desta OS — trazer resultado de fora da janela é a Camada 2.

---

## 2026-09-11 — OS-CP-JANELA-6M-01 (gates de desenho concluídos, pronta para o engenheiro)

Branch `feature/cp-janela-6m`, empilhado sobre `da6b1c0`. **Nenhum código escrito ainda.**

**Briefing consolidado (vinculante para lógica):** `docs/os-briefings/OS-CP-JANELA-6M-01.md`
**Spec visual (vinculante para markup/tokens):** `design/specs/cp-janela-6m.md`

### Escopo
Parte 1: janela de 6 meses na abertura (mantendo `PAGE_SIZE_CP` 50 e o "Carregar mês anterior") +
blob de busca pré-computado. Parte 2: busca e filtros sobre os 6 meses carregados. Parte 3:
ordenação por coluna em 7 colunas.

### Decisão de empilhamento (coordenador)
`feature/cp-janela-6m` foi criado **sobre** `feature/cp-filtros-base`, porque a Parte 2 da OS nova
assume a Camada 1 implementada e as duas OS mexem nas mesmas funções. **Risco declarado ao
diretor:** se a validação visual pedir mudança na Camada 1, ela vem por baixo do trabalho novo.

### Decisões do diretor (confirmadas nominalmente)

1. **A janela opera em `data_vencimento`, não em competência.** Aplicada a regra do "conceito
   diferente" do CLAUDE.md. Impedimentos para competência: exigiria índice composto novo, e
   `competencia_ref` é gravado em dois formatos, num dos quais a comparação é **anticronológica
   entre anos** (`"12/2025" > "01/2026"`). **Consequência confirmada como aceitável:** a competência
   mais antiga visível será tipicamente 1 mês mais antiga que o início da janela (nota de serviço
   PJ recua 1 mês). **Não é bug.**
2. **Recalibragem do aviso de Período:** isentar a janela padrão por igualdade exata +
   `CP_LIMITE_AVISO_PERIODO` 15.000 → **35.000** + `CP_LIMITE_AVISO_MESES` 3 → **7**.
   Motivo: a janela de 6 meses (~25.114 a 32.241) ficaria **1,7x a 2,1x acima** do limiar que a OS
   anterior acabou de instalar — avisaríamos de um volume que já entregamos calados. Subir o número
   sozinho não resolvia: a pior janela de 6 meses da base é Jan–Jun = **42.271**, e um limiar à
   prova dela ficaria em 87% da base, virando código morto.
3. **Ordenação de Status por severidade** (asc = VENCIDO → A PAGAR → PROVISIONADO → PAGO →
   CANCELADO), não alfabética. Status é **derivado** por `statusVisual`, não existe no banco.

### Decisões do coordenador

- **`aria-sort` no `<th>` ativo: USAR** (o arquiteto era a favor, o designer contra por
  consistência). A spec já introduz `role="button"` + `tabindex`, ou seja, já estamos fazendo
  acessibilidade no elemento; `aria-sort` é o atributo que torna a interação legível, custa 1
  atributo e não tem efeito visual.
- **Collator cacheado em `_cpUniaoOpcoes` e `despOrd`: AUTORIZADO.** `localeCompare` sem collator
  custaria 50–300 ms por dropdown, 3x na abertura. Cai no item 3 da Parte 1 da OS ("otimizações
  necessárias para não engasgar com esse volume").
- **Estado de carregamento: APROVADO.** `#cp-vazio` **não nasce oculto** hoje — é pintado no
  primeiro frame. Com 1 mês dura centésimos; com 6 meses a tela **afirmaria "Nenhum lançamento
  encontrado" durante vários segundos a cada abertura**. Defeito preexistente que esta OS é
  obrigada a corrigir. Usa o spinner já existente no arquivo; **recusado** o loader de tela cheia
  (`z-[90]`, cobre a sidebar, diz "Mantenha esta aba aberta").

### Decisões técnicas do arquiteto (detalhe no briefing)

- **Blob de busca em `WeakMap<regObj, blob>`**, populado no próprio `forEach` do snapshot.
  Escolhido não por memória (~4,5 MB, irrelevante) mas por **correção**: é a única opção que torna
  o veto de contaminação **impossível por construção** em vez de evitado por disciplina. Invalidação
  = zero código (os objetos antigos morrem em `cacheRegistros = regs`).
  **Array paralelo vetado** (a ordenação da Parte 3 desalinha o índice → busca casa o registro
  errado, em silêncio). **`Map<docId>` vetado** (cresce sem teto e serve blob velho para doc editado).
- **`onSnapshot` MANTIDO.** `getDocs` mataria o auto-refresh em **6 caminhos de escrita** que não
  têm re-render próprio (edição, exclusão, massa, exclusão em massa, KPIs do ETL), e cada re-fetch
  custaria 25 MB. `Metadados/UltimaImportacao_CP` não serve de gatilho: é best-effort com falha
  engolida, não cobre edição/exclusão/massa, e entrega uma vez ao assinar.
  **Custo assumido:** ~200–400 ms de main thread por entrega, e 2,5–5 s de churn durante um ETL
  (o loop de `_cpFinalizarImportacao` não cede a thread entre chunks). A correção certa
  (`snap.docChanges()` em vez de reconstruir) é **OS sucessora** — fazê-la junto destruiria a
  capacidade de atribuir causa se a performance regredir.
- **`CP_MESES_JANELA_PADRAO = 6` como constante única** — é o botão de voltar atrás. Escada de
  recuo: 6 → 4 meses (~20k) → 3 meses (~15k, que restaura a coerência com o limiar original) → 1 mês
  mantendo só a Parte 3. Gatilhos objetivos de recuo: abertura > 12 s, heap > 600 MB, freeze de ETL
  > 10 s, ou crash de aba.
- **Off-by-one:** 6 meses inclusive da âncora = recuar **5**. Recuar 6 entregaria 7 meses (~20% de
  volume a mais).
- **`_cpJanelaPadrao` guarda os 6 meses, não o mês âncora** — senão "Limpar Filtros" jogaria o
  operador de volta em 1 mês, regressão da própria feature.
- **Meses de calendário, não "meses com dado"** — mês vazio conta. "6 meses com dado" exigiria 6
  queries e uma camada de merge/dedup.
- **Ordenação client-side sobre o conjunto filtrado**, antes de `_cpUltimosFiltrados` — com isso
  **a exportação Excel passa a sair na ordem da tela** (ela lê essa variável e promete espelhar o
  recorte visível). Comportamento correto, registrado aqui.
- **19 vetos de implementação** no briefing, incluindo: não ordenar `cacheRegistros` in place;
  `localeCompare` com opções dentro de comparador (415k reconstruções de collator = 2–8 s por
  clique); `new Date()` em comparador; negativo tratado como zero na ordenação de Valor
  (**Estornos — Regra Brendon Costa Vital**); `onclick` inline (o módulo é `type="module"`).

### Orçamento de performance (limites que o testador vai medir)

| Métrica | Aceitável | Reprovado |
|---|---|---|
| T1 abertura até a 1ª linha pintada | ≤ 8 s (bom ≤ 5 s) | > 12 s |
| T2 render com termo de busca (3 chars) | ≤ 80 ms | > 120 ms |
| T4 clique de ordenação → repaint | ≤ 400 ms | > 800 ms |
| T5 heap estabilizado | ≤ 400 MB | > 600 MB |
| T7 freeze percebido durante ETL | ≤ 5 s | > 10 s |

**T2 deve ser medido COM e SEM o blob** — o diretor pediu o blob por causa de uma projeção; a
entrega tem de virar número. **T6** (`atualizarKPIs` isolado) registrado mesmo sendo termo cercado
pela restrição "não alterar KPIs": é o **maior custo restante por tecla** (30–50 ms) e a candidata
nº 1 a OS sucessora.

**Fato dominante:** a abertura passa a ser limitada pela **rede** (25 MB), não por CPU — 2–4 s a
50 Mbps, 8–20 s a 10 Mbps. Nenhuma otimização de JS muda isso.

### Fatos comunicados ao diretor, sem decisão pedida

1. Abertura em segundos, limitada pela rede (acima).
2. **Cota:** 28.000 leituras por abertura ≈ US$ 0,017; de ~US$ 1,3 para **~US$ 7,4/mês por
   operador**. Cada "Carregar mês anterior" **recobra a janela inteira** (o listener é reassinado).
3. **Risco preexistente agravado:** para perfil não-super_admin, "selecionar todos → Ações em
   Massa" faz **um `addDoc` sequencial por lançamento** (`code.html:2858-2865`). Com 6 meses,
   "selecionar todos" passa a marcar ~28.000. Fora de escopo; **testador proibido de exercitar esse
   caminho contra produção**. Candidato a OS de blindagem.

---

## Backlog gerado por estas duas OS (aguardando decisão do diretor)

- [ ] **Trava de deploy furada.** `scripts/gate-deploy.js` só verifica se existe **alguma** flag
      `READY_*` em `.claude/state/` — e há **18 flags acumuladas desde julho**. Com qualquer uma
      presente, o check passa sempre: a proteção que deveria exigir uma flag nova por feature
      **nunca bloqueia**. Deveria exigir a flag da feature do branch corrente.
      Além disso, o padrão `/(git\s+push|firebase\s+deploy|…)/` **não cobre**
      `firebase hosting:channel:deploy` — preview passa livre (conveniente, mas acidental).
- [ ] **`CP_Base_Despesas` corrompido** — 42/110 docs com mojibake (`origem: seeder_excel`), e
      cobre só 85 dos 121 valores em uso. Bloqueia a dimensão Despesa na Camada 1.
      Casa com a OS-CP-LIMPEZA-LOTES-CORROMPIDOS-01, pendente desde 2026-09-04.
- [ ] **Variantes `hover:`/`focus:` sem cobertura no tema escuro** — sistêmico, 6+ pontos no
      `gerenciador_contas_pagar_desktop/code.html` (inclusive `btn-filtros-cp-limpar`).
- [ ] **Camada 2** — resultados cross-mês por query dirigida com índice composto.
- [ ] **`snap.docChanges()`** em vez de reconstruir `cacheRegistros` a cada entrega do snapshot.
- [ ] **`atualizarKPIs`** — 2x `normalize('NFD')` por linha em todo render, inclusive a cada tecla.
- [ ] **Blindar "Ações em Massa"** para não-super_admin (addDoc sequencial por lançamento).
- [ ] **Furos da guarda de Período que a OS anterior não fechou:** F5 após confirmar um Período
      longo recarrega sem aviso; "Carregar mês anterior" sem guarda; e o risco residual de clicar
      "Limpar" durante a contagem em voo (~200–600 ms) — o testador julgou **não bloqueante**
      (client-side, sem escrita, recuperável com um segundo clique).
- [ ] **1 doc com `data_vencimento` `"0026-09"`** em `/ContasAPagar`.
- [ ] `scripts/check-syntax.cjs` não valida `<script type="module">` (grava como `.cjs`).

---

## 2026-09-08 — OS-CP-ULTIMO-MES-01: Contas a Pagar abre no último mês COM DADOS (deploy em produção)

**Sintoma (diretor):** em setembro, com o fechamento de agosto ainda em andamento e setembro
ainda não importado, a Central Financeira → Contas a Pagar abria **em branco**. O operador
precisava clicar repetidamente em "Carregar mês anterior" até chegar onde havia dados.

### Causa raiz
A janela de carga server-side do CP (introduzida em 2026-06-18 para não travar o browser com
10k+ docs) era ancorada em `_cpMesCorrenteRange()` → `new Date()`: **mês do calendário, não dado
existente**. O mesmo default aparecia em mais dois pontos além da abertura — `limparTodosFiltros()`
e o ramo "Período vazio" do Aplicar. Corrigir só a abertura deixaria "Limpar filtros" devolvendo
o operador à tela branca.

### Premissa do diretor corrigida antes de implementar
"O Faturamento já faz isso, replicar o padrão" — **o Faturamento não tem essa lógica**.
`contas_a_receber_desktop/code.html:4319` faz `onSnapshot(collection(db,"Lancamentos"))` sem
`where`/`orderBy`/`limit`: carrega a coleção inteira. Nunca abre em branco porque mostra tudo,
sempre. Replicar isso no CP reintroduziria exatamente a regressão documentada em
`code.html:1140`. Decisão: **manter a janela, trocar só a âncora**.

### Armadilha de dado que moldou o desenho
Não se pode usar `max(data_vencimento)`: a recorrência projeta lançamentos **até 120 meses no
futuro** (`_cpProjetarRecorrencia`). O topo absoluto da coleção cairia em Dez/2026 ou além —
trocaria uma tela branca por outra. Teto duro = fim do mês corrente.

### Correção (1 arquivo, sem tocar cálculo/valores)
- `_cpDescobrirMesPadrao()` — varredura descendente do fim do mês corrente, em páginas
  escalonadas [50,250,500,500], para no primeiro lançamento **não-projetado**. Range + `orderBy`
  no MESMO campo → sem índice composto novo. Falha de leitura ou base vazia cai no comportamento
  anterior; a tela nunca quebra.
- `_cpEhProjecao()` — **decisão do diretor 2026-09-08:** clone de recorrência não ancora a
  abertura. Discriminante persistido (`origem`/`match_tipo`); doc legado sem esses campos conta
  como real.
- `_cpJanelaPadraoAtual()` — "Limpar filtros" e "Aplicar com Período vazio" voltam ao mês
  resolvido na abertura, não ao do calendário.

### Bug adicional encontrado e corrigido (item 2 da OS)
O botão "Carregar mês anterior" **nunca esteve quebrado** — recua o piso 1 mês e re-assina o
listener corretamente. O que o fazia parecer morto: `_cpRestaurarEstadoFiltros()` restaurava o
Período salvo em `sessionStorage` como filtro **client-side** sem re-sincronizar a janela
**server-side**. Período Jul + janela no mês default = interseção vazia → tela branca, e o botão
trazia Ago do servidor mas o filtro de Jul descartava tudo. Agora a janela passa a ser o próprio
Período restaurado. **Decisão do diretor: MANTER o botão** (navegação rápida mês a mês,
complementar ao filtro de período).

### Gates
19 casos no emulador (Firestore + `firestore.rules` de produção), executando o **código-fonte
real extraído do HTML** e instanciado com `new Function` — não uma reimplementação no teste.
Cobrem setembro vazio → Agosto; setembro só com projeção → Agosto; setembro importado → Setembro
(sem regressão); doc legado; 120 projeções estourando a 1ª página; base vazia; virada de ano;
fevereiro com 28 dias; perfil `consulta` lendo normal; usuário sem menu (fallback sem quebrar);
e a navegação acumulativa Ago→Jul→Jun. `firestore.rules` **não tocado** → gate do emulador de
regras não se aplica (DoD). Validação visual do diretor em 2026-09-08 no emulador local com
cenário semeado. Flag `READY_cp-ultimo-mes`.

### Desvio de escopo reportado
Além dos pontos da OS, foi alterado o texto-placeholder estático do rodapé
("Exibindo: mês corrente" → "Carregando…"), porque a frase descrevia justamente o comportamento
que a OS elimina. É sobrescrito no primeiro snapshot.

### Deploy (2026-09-08) — CONCLUÍDO
Autorizado pelo diretor após a validação visual. Executado pelo deployer atrás da trava
(`gate-deploy.js`: working directory limpo + flag `READY_*` presente).

```
Commits:  1bd6374 (fix) + f0a86d5 (DIARIO/flag) → merge ee135f6 em main
Push:     rikegv/centrafin-app — main 2155678..ee135f6 + branch feature/cp-ultimo-mes (nova)
Deploy:   npx firebase deploy --only hosting --project centra-fin — 2.042 arquivos, release complete
Escopo:   SOMENTE hosting. firestore.rules NÃO alterado e NÃO deployado.
URL:      https://centra-fin.web.app/gerenciador_contas_pagar_desktop/code.html
```

Verificação pós-deploy (todos 200): a própria página, `/sidebar.js`, `/theme_manager.js`,
`/assets/checkbox_multi.js`, `/theme.css`, `/login.html` e o XLSX do CDN. O Tailwind responde
302 → 200 (redirect normal de resolução de versão para 3.4.17, comportamento pré-existente em
todas as páginas, não relacionado a este deploy). O HTML servido em produção é **byte-idêntico**
ao local (314.596 bytes) e contém `_cpDescobrirMesPadrao`, `_cpEhProjecao`, `_cpJanelaPadraoAtual`
e `startAfter`. Sem risco de cache servir a versão antiga: o `firebase.json` já manda
`no-cache, no-store, must-revalidate` em todo `**/*.html`.

Emulador de homologação derrubado após o deploy (portas 4000/5000/8080/9099 liberadas); working
directory limpo; `HEAD` local e `origin/main` no mesmo SHA.

### Pendências não bloqueantes (OS própria)
- **Faturamento carrega `Lancamentos` inteira, sem janela nem limite.** Não é escopo desta OS e
  não foi tocado, mas é a mesma classe de problema de performance que motivou a janela do CP em
  2026-06-18. Merece OS própria antes que a base cresça mais.
- `scripts/check-syntax.cjs` segue quebrado (pré-existente, gate cego) — já registrado em OS
  anteriores. A verificação de sintaxe desta OS foi feita com extração para `.mjs`.
- Enquanto a âncora resolve (1 roundtrip), o estado vazio "Nenhum lançamento encontrado" fica
  visível por alguns centésimos a mais que antes. Não há skeleton nessa fase — já era assim para
  o primeiro snapshot. Só vale OS se incomodar na prática.

---

## 2026-09-04 — OS-CC-LISTA-COMPLETA-01: lista de liberação de Centro de Custo alimentada por todas as fontes (deploy em produção)

**Sintoma (diretor):** cadastrou o CC "COMERCIAL TEAM TAILOR", alocou o fornecedor PJ Campus
Girassol (cod 2399) nele, mas o CC não aparecia na tela onde se libera visualização por usuário.
Já "COMERCIAL SOULAN", criado do mesmo jeito, apareceu.

### Causa raiz
`Base_Centros_Custo` — fonte da lista de liberação (`master.html`, seção "3º NÍVEL: FILTRO POR
CENTRO DE CUSTO") — tinha **um único escritor em todo o repositório**: `sincronizarCentrosDeCusto`
(`custo_folha_desktop`), dentro do pipeline de importação da **Folha**. Como **PJ não gera
registro em `CustosFolha`**, todo CC composto só por PJ ficava invisível.

Prova estatística, sem exceção nos dois sentidos:
```
CCs em CustosFolha:                    22  → 0 ausentes da Base
CCs que existem SÓ em CP/Fornecedores:  4  → 4 ausentes da Base
```

### Três investigações que corrigiram premissas do diretor
1. **"O CC não tem lançamento."** Falso — havia **24 lançamentos** de Contas a Pagar nesse CC.
   Ter lançamento não basta: tem que ser lançamento *de folha*.
2. **"O Fernando Nery gera registro em CustosFolha, o Campus Girassol não."** Falso — **nenhum
   dos dois** está em `CustosFolha` (0 e 0). As linhas de folha do Fernando vêm do **merge de PJ**:
   o Gerenciador lê `ContasAPagar where tipo_entidade == 'Fornecedor Interno - PJ'` ao vivo e cruza
   com `CP_Beneficios_PJ`. Decomposição exata do que o diretor via na tela: 05/2026 R$ 1.671,30 =
   soma das 13 faturas em CP; 06 e 07/2026 R$ 660 = `valor_vr` do `CP_Beneficios_PJ`. **Não existia
   "processo pelo qual o Fernando passou" para replicar.** O que pôs "COMERCIAL SOULAN" na lista
   foram **3 CLTs** (Catarina, Tatiana, Bianca), não o Fernando.
3. **Terceira coleção descoberta durante a implementação:** `AreasContasPagar` — é ONDE o diretor
   de fato cria o CC (alimenta o dropdown do Banco de Fornecedores, `master.html:3945`). Distinta
   de `Base_Centros_Custo`, com sobreposição só parcial. Sem ela como fonte, um CC recém-criado
   sem fornecedor alocado seguiria invisível — a mesma classe de bug, adiada um passo. Levou à
   decisão do diretor de incluí-la.

### Correção
Botão **"Sincronizar centros de custo"** na lista de CC, em dois passos (preview → confirmar),
reaproveitando o esqueleto de `modal-alterar-cc-massa` e os helpers `fornMAbrirModal`/`fornMToast`.
- `CC_SYNC_FONTES = [{Fornecedores, centro_custo}, {AreasContasPagar, nome}]` — as fontes expõem o
  nome em **campos diferentes**, daí o par `{colecao, campo}`.
- Não varre `ContasAPagar` (~37 mil docs): o ETL de CP **herda** o `centro_custo` do cadastro, e a
  auditoria confirmou 0 CCs em CP ausentes de Fornecedores. 794 leituras em vez de 37 mil.
- `setDoc merge:true` + **slug idêntico ao do ETL da Folha** → os dois escritores convergem no
  mesmo `docId`; idempotência comprovada (2ª execução: `ADICIONA (0)`).
- `CC_SYNC_EXCLUIDOS = ['NEAT','ginfor','RATEIO']` — NEAT é nome de empresa em campo errado
  (temporário até o diretor corrigir 7 cadastros); os outros dois são lixo.
- Filtro de sanidade rejeita sentinelas (vazio, só pontuação, só zeros) — foi o que deixou um CC
  `"."` vazar da folha para a UI de permissão.
- Roda na área já travada para `master`/`super_admin`: **zero alteração em `firestore.rules`**,
  não dispara a Lei da decisão.

### Escritas em produção (todas com dry-run conferido pelo diretor + backup JSON)
1. Fornecedor 2395 (Patrícia): `centro_custo` "TEAM TAILOR" → "COMERCIAL TEAM TAILOR".
2. `Base_Centros_Custo`: removido o resíduo `"."` (docId `CC`).
3. `AreasContasPagar`: removido o doc `TEAM TAILOR` (`7Hck746r9BETWKNH6XaL`) — duplicata eliminada
   na origem, com salvaguarda verificando 0 referências em 4 coleções antes de apagar.
4. Sync aplicado: +CLIENTES, +COMERCIAL TEAM TAILOR. Lista final **28 CCs**, nenhum preexistente
   perdido, sem slugs duplicados.

### Ordem de execução importa (registrado como aprendizado)
Corrigir o cadastro 2395 **antes** de rodar o sync. Invertido, "TEAM TAILOR" entraria na lista e
teria de ser removido depois. A fábrica detectou a dependência na simulação e a sequência foi
imposta na OS.

### Desvio reportado ao diretor
A fábrica acrescentou `'TEAM TAILOR'` à lista de exclusão além das 3 entradas que o diretor
enumerou: ligar `AreasContasPagar` como fonte (decisão 3) colidia com o critério de aceite
(decisão 4), porque o registro sobrevivia lá após a correção do cadastro. Escolhida a via
reversível (exclusão em código) em vez de apagar dado não autorizado. Com a autorização posterior,
o documento foi excluído e a entrada saiu do código — estado final tem a duplicata eliminada na
origem, sem exclusão defensiva.

### 🔒 Achado de segurança — aprendizado permanente
Os scripts de manutenção gravam **backup JSON com dados reais de produção** em `scripts/`, e
`firebase.json` serve a raiz (`public: "."`) sem ignorar `.json`. **Esse backup seria publicado no
hosting e ficaria acessível por URL.** Não chegou a ocorrer — detectado antes de qualquer deploy.
Adicionado `**/backup-*.json` ao ignore do `firebase.json` e ao `.gitignore`.

**Regra permanente que fica deste episódio: script de manutenção NUNCA deve gravar dado real em
pasta servida pelo hosting.** O `public: "."` do CentraFin torna a raiz inteira publicável por
padrão — todo artefato novo com dado de produção precisa entrar no ignore ANTES de existir. Vale
também para o `purge-lotes-corrompidos-cp.cjs` da OS anterior, que tem o mesmo comportamento e
ainda não rodou com `--apply`.

### Pendências abertas
- Os 7 cadastros de fornecedor com `centro_custo = "NEAT"` (nome de empresa em campo errado)
  seguem para correção manual do diretor. Quando corrigidos, `'NEAT'` sai de `CC_SYNC_EXCLUIDOS`.
- `permissoes.filtros.centrosCusto` continua sendo consumido **apenas** por `custo_folha_desktop`
  e `custo_folha_dash`. O Gerenciador de Contas a Pagar vivo **não lê** esse campo. A lista agora
  está completa, mas liberar um CC não dá visibilidade dos lançamentos de CP — e, por ser whitelist
  restritiva, marcar um CC para quem hoje vê tudo REDUZ o escopo dessa pessoa na Folha. Se o
  objetivo for visibilidade de CP por centro de custo, é outra implementação. Alertado 3×.

---

## 2026-09-04 — OS-IMPORT-ENCODING-01: detecção automática de encoding nos importadores TXT (deploy em produção)

**Sintoma (diretor):** após importar a base de Contas a Pagar, toda palavra acentuada aparecia
com `�` — "TRANSFER�NCIA DE CONTA CORRENT", "TARIFAS E COMISS�ES BANC�RIAS",
"PR�MIOS/GRATIFICA��ES/BONIFICA". Reportado como **regressão** ("já funcionava antes").

### Diagnóstico — não era regressão de código
`git log -S` sobre **todo** o histórico: nunca existiu `TextDecoder`, `latin1`, `iso-8859`,
`windows-1252`, `unescape` nem `fromCharCode` no repositório. `await f.text()` está no fonte
desde o **primeiro commit** do módulo (`a6a6e8a`, 2026-04-30) e sobreviveu intacto a todos os
commits seguintes. Não havia o que ter sido removido.

O que o diretor lembrava como "normalizador" era `cpNormalizarTexto` + os `.normalize('NFD')`,
que servem **só para montar chave de match** — nunca tocam o valor gravado (`categoria: l.despesa`
vai cru pro Firestore). O tratamento de Windows-1252 **documentado em comentário** (auditorias
2026-05-27 e 2026-06-05) é de outro importador (Benefícios PJ) e só afrouxa a regex do nome do
mês; não decodifica nada.

**A causa real: o ERP mudou o layout de exportação.** Até maio os arquivos vinham em UTF-8
("TODAS AS EMPRESAS ..."); de junho em diante vêm em Windows-1252 ("06 - Despesas MM_2026.txt").
`f.text()` e `readAsText(file,'UTF-8')` forçam UTF-8 por especificação (não aceitam charset), e
byte acentuado de arquivo Windows-1252 vira U+FFFD com o byte original **descartado**.

Prova byte a byte, reconstruída a partir do dado gravado:

| Gravado | Original | Bytes cp1252 | `�` esperados |
|---|---|---|---|
| `COMISS�ES` | COMISSÕES | `D5` | 1 |
| `GRATIFICA��ES` | GRATIFICAÇÕES | `C7 D5` | 2 |
| `MANUTEN��O` | MANUTENÇÃO | `C7 C3` | 2 |

Corte limpo no tempo, medido nos 37.669 docs de `/ContasAPagar`: **zero** `�` em todos os lotes
de nome antigo (34 mil docs); **100%** dos docs dos 3 lotes de nome novo corrompidos.

### Correção
`cpLerTextoAutoEncoding`: `TextDecoder('utf-8', {fatal:true})` e, se lançar, fallback para
`windows-1252` — que mapeia os 256 valores de byte e por isso **nunca** gera U+FFFD. Resolve os
dois formatos sem depender de o ERP padronizar. Aplicado em 3 pontos: ETL de faturas do
Gerenciador de CP, importador de Benefícios PJ do Gerenciador (preventivo — o `nome` do
funcionário é gravado cru) e o espelho no Custo de Folha. Intocados: normalização de chave de
match, cálculo e `firestore.rules`.

### Verificação
`scripts/test-import-encoding.cjs` **extrai o parser real do fonte de produção** (`cpParsearTXT`
+ dependências, por fatiamento do HTML) em vez de reimplementar — testa o código que vai ao ar.
- Regressão: 21 arquivos UTF-8 reais / 38.627 lançamentos → saída **byte-idêntica** ao
  comportamento antigo.
- Windows-1252 (fixture reencodado de arquivo real): 9.959 `�` antes, **0** depois, round-trip
  idêntico ao texto original.
- Das 17 categorias quebradas, 15 existem no arquivo de teste: 15/15 corretas.

Ressalvas registradas ao diretor **antes** da aprovação: os 3 arquivos reais não estavam no
disco (teste (a) usou fixture fiel), e a verificação rodou o parser de produção em Node, **não**
no emulador/browser. Diretor aprovou nessa base em 2026-09-04 (mudança sem diferença visual).

### Falso PASS no próprio teste (reporte obrigatório)
A primeira execução do teste (c) passou com `0/0` categorias: o seletor do fixture casou
`BENEFICIOS PJS - MAIO.txt` (0 lançamentos) em vez de `MAIO TODAS AS EMPRESAS.txt`, e a assertiva
vazia reportou PASS. Corrigido o seletor e **adicionada guarda anti-vacuidade** que reprova se
menos de 10 das 17 categorias estiverem presentes. Lição: assertiva sobre conjunto vazio é
aprovação falsa — todo teste de cobertura precisa de piso mínimo.

### Risco latente fechado, não materializado
Em arquivo corrompido a trava de "TRANSFERÊNCIA DE CONTA CORRENT" **falha** (não reconhece
`TRANSFER�NCIA`) e as transferências internas vazam como faturas reais, inflando KPIs. No fixture
vazaram 15. Conferido em produção: **0 vazaram** nos 3 lotes reais — o relatório "06 - Despesas"
não traz essas linhas. A correção fecha o buraco de qualquer forma.

### Deploy
`--only hosting` (rules não tocadas). 2026-09-04 17:49–17:50 UTC, merge `0045e5b`, 1.997 arquivos.
Verificado em produção: `theme_manager.js`, `assets/checkbox_multi.js`, `core_rules.js`,
`sidebar.js` e os 2 módulos alterados respondem **200**; `cpLerTextoAutoEncoding` e
`_folhaLerTextoAutoEncoding` presentes no HTML servido; zero resíduo de `f.text()` /
`readAsText(...,'UTF-8')` em código executável (as 2 ocorrências restantes são comentário).

### Pendências abertas por esta OS
- **Os 217 docs corrompidos não são reparáveis pelo importador.** U+FFFD é destrutivo. Exige
  reimportação — e a reimportação direta **duplicaria** a base: o `arquivo_hash` é do texto
  decodificado, muda com a correção (`e6e12221…` → `4e689fbe…`), o escudo anti-duplicidade não
  dispara e o docId é auto-gerado. Os 272 docs dos 3 lotes precisam ser removidos antes.
  → OS-CP-LIMPEZA-LOTES-CORROMPIDOS-01.
- **`scripts/check-syntax.cjs` quebrado (pré-existente, gate cego).** A linha 52 grava todo bloco
  `<script type="module">` com extensão `.cjs`, então `node --check` rejeita qualquer `import`.
  Reprova os arquivos **intocados do HEAD** identicamente — não é regressão desta OS. Um gate do
  DoD está cego hoje. Diretor determinou (2026-09-04) **não corrigir nesta OS** — escopo estrito;
  registrado aqui para OS futura.
- `contas_a_pagar_desktop/code.html:1648` ainda tem `await f.text()` — módulo legado exterminado
  em 2026-05-14, sem rota no `sidebar.js`. Não tocado.

---

## 2026-09-04 — OS-CP-LIMPEZA-LOTES-CORROMPIDOS-01: script pronto, AGUARDANDO autorização de execução

**Estado: PREPARADO, NÃO EXECUTADO.** `scripts/purge-lotes-corrompidos-cp.cjs`. Dry-run rodado
contra produção (só leitura); nada foi alterado.

**Critério de seleção — triplo e conjuntivo** (qualquer um sozinho seria frouxo):
`arquivo` ∈ os 3 nomes de lote **E** `arquivo_hash` presente (só o ETL grava) **E**
`origem === 'etl_txt_gerenciador'` (exclui `etl_projetado_fixo` e lançamento manual).

**Resultado do dry-run:** 272 docs · R$ 1.545.678,62 — 96 (jun) + 85 (jul) + 91 (ago),
1 `arquivo_hash` distinto por lote, 217 com `�` em campo de texto.

**Salvaguardas verificadas:** 0 docs com nome de lote afetado recusados pelas travas (todos os
272 satisfazem as 3 condições); **0** documentos com vencimento em 2026-06-01..2026-08-31 fora
dos 3 lotes — ou seja, **não existe lançamento manual em risco**; 37.397 de 37.669 preservados.

**Consequência que o diretor precisa saber:** como não há nenhum outro registro nesses meses,
entre o `--apply` e a reimportação **Contas a Pagar fica zerado em jun/jul/ago**. Janela
esperada e temporária, mas real.

O script grava **backup JSON de tudo que vai apagar antes de apagar**, e só remove com `--apply`.
Sequência acordada: (a) dry-run → diretor confere → (b) `--apply` → (c) diretor reimporta com o
importador já corrigido.

---

## 2026-08-26 — OS-FILTROS-MULTI-BLOCO-1: filtros do Dashboard Master em multi-select

**Contexto (diretor):** precisava selecionar mais de uma condição por filtro. Antecedeu esta OS
um levantamento completo dos filtros do sistema (ver seção "Mapa de filtros" abaixo), que separou
o que era só limitação de implementação do que exige decisão de negócio antes de mudar.

**Escopo:** os 5 filtros do modal "Filtros Avançados" do Dashboard Master
(`dashboard_master_desktop/code.html`): Cliente, Comercial, Empresa, Região, Descrição/Serviço.
Arquivo único alterado (+294/−74). Reaproveitou o componente `assets/checkbox_multi.js` já em
produção em 19 filtros — **sem implementação nova e sem tocar no componente compartilhado**.

### Correção ao enunciado da OS (arquiteto)
A OS presumia que os 4 pontos que chamam `aplicarFiltrosModal()` programaticamente setavam os
selects. **Não setam**: `limparFiltroGraficoEmissoes` e os 3 `dataPointSelection`
(chart-emissoes-30dias, chart-emissoes-ano, chart-cr-inad-mensal) mexem apenas nos dois inputs de
data. Confirmado por grep que são exatamente 4. Ficaram **intocados** (byte-idênticos a `main`) e
foram validados só por regressão.

### Decisão do diretor durante a execução (R3)
Na aba Contas a Receber, a lista de Cliente era repopulada a partir de `_ultimoArrayProcessado`
(dataset **já filtrado**). Com single-select isso apenas impedia alargar a seleção; com
multi-select viraria perda de dado — os clientes selecionados sumiriam da lista, o componente
cairia no fallback e religaria "Todos", **apagando o filtro ao simplesmente reabrir o modal**.
Diretor aprovou corrigir dentro desta OS: a fonte passou a ser `dadosGlobaisFirestore`.

### Regressão latente pré-existente, corrigida de passagem (reporte obrigatório)
`popularListasFiltro` roda a **cada snapshot** do Firestore e recriava as options com
`innerHTML +=` dentro do laço, o que **destruía `option.selected`** enquanto `filtrosPorAba`
continuava indicando filtro ativo. Efeito em produção até hoje: um colega salvando uma nota no
Gerenciador **zerava silenciosamente o filtro do diretor no meio da análise**, com o badge
"Filtros Ativos" seguindo aceso. Refatorado para `.map().join('')` com atribuição única +
preservação de seleção + `cb-multi-sync`. É mudança de comportamento observável, por isso
registrada e não absorvida em silêncio.

Também corrigido: `preencherSelect` sobrescrevia os rótulos específicos ("Todos os Clientes",
"Todas as Regiões") por um genérico "Todos" no primeiro snapshot.

### Armadilhas da migração string→array (todas tratadas)
- `verificarFiltroAtivoNaAba` usava truthiness — `['Todos']` é truthy e o badge acenderia para
  sempre. Helper `temMulti()`.
- `{ ...filtroAplicado }` é spread raso: as 5 abas passariam a compartilhar o **mesmo** array.
  Trocado por factories (`_filtroNeutro()` / cópia profunda).
- `Set`s pré-computados **fora** do `.filter()` — instrumentado: 1 construção por chamada sobre
  5.000 notas, nunca O(N).
- Caixa assimétrica preservada de propósito: `emp`/`ser` em UPPER, `cli`/`com`/`reg` raw.
- Sentinela do componente é a string literal `Todos` (o `value=""` anterior não era reconhecido).

### Empresa passou a ser data-derived
As 4 `<option>` fixas saíram do HTML. Derivação usa a **mesma expressão do predicado**
(`calcEmpresaExcel(ser) || empresa_atribuida`), cuja regra canônica vive em `core_rules.js` —
sem classificador novo, respeitando a fonte única. Fallback defensivo mantém as 4 fixas enquanto
a base não carregou.

### Gate de designer (spec + auditoria)
Achado que a investigação inicial não tinha pego: `checkbox_multi.js` hardcoda cores claras
(`bg-white`, `slate-*`) e **este modal é escuro** (`bg-[#002443]`) — renderizaria blocos brancos.
Contorno: bloco CSS escopado em `#modal-filtros` no `<style>` da própria página, com `!important`
(necessário porque `theme.css` remapeia `.bg-white → var(--bg-card) !important` no tema escuro) e
ancorado em ID para vencer por especificidade. **`checkbox_multi.js` e `theme.css` intactos** —
os 19 usos em produção preservados. Spec em `design/specs/os-filtros-multi-bloco1.md`.
`data-cb-portal` **não** foi usado: em modo portal o painel migra para o `<body>` sem atributo
identificador e escaparia do CSS de escopo, voltando a ficar branco.
Auditoria de tokens: aprovada, cobertura de cor completa, sem elemento órfão. O designer ainda
encontrou 2 regras do `theme.css` não catalogadas na própria spec e verificou que também perdem
por especificidade. `primary` **não** foi adicionado ao `tailwind.config` — o override já supre
accent, foco e hover (e neutraliza o anel azul padrão do Tailwind, que o config sozinho deixaria).

### Testes (testador-auditor, bateria própria)
O testador **rejeitou confiar** nos 17 testes do engenheiro: eram honestos, mas reimplementavam
`calcEmpresaExcel` em vez de usar o `core_rules.js` real e **não comparavam contra `main`** —
justamente a equivalência exigida. Escreveu bateria própria extraindo o código ao vivo dos dois
branches. Resultado: **T-A a T-K todos PASS**.
- **Equivalência**: 36 seleções únicas sobre dataset com casos-limite (ESTÁGIO com/sem acento,
  caixa mista, campos ausentes, chaves alternativas, fallback `empresa_atribuida`) → resultado
  **idêntico registro a registro** ao predicado de `main`. Zero regressão em seleção única.
- União (OR dentro do campo, AND entre campos), sentinela, badge, preservação de seleção em
  snapshot e no ramo CR, ausência de aliasing, normalização do consumidor CR, escopo, DoD e
  performance: todos PASS.
- `firestore.rules` **não** foi tocada → sem gate de emulador nesta OS.

### Validação visual e deploy (2026-08-26)
Fluxo executado: arquiteto → designer (spec) → engenheiro-frontend → designer (auditoria de
tokens) → testador-auditor → flag `READY_filtros-multi-bloco1` → deployer.

**Ressalva formal — a validação visual do diretor NÃO foi concluída antes do deploy.**
O ambiente foi preparado (`firebase serve` local na porta 5000, contra Firestore real, com
verificação prévia de que o servidor entregava a versão nova e não cache) e o roteiro de
validação foi entregue ao diretor, com dois pontos que só se verificam em runtime: o painel do
campo "Descrição / Serviço" (último do grid, abre sempre para baixo, sem flip) e a barra de busca
do componente em lista longa. O diretor então **autorizou explicitamente o deploy em produção**,
e o coordenador registrou essa autorização como evidência do gate — leitura que o próprio diretor
corrigiu em seguida, ao informar que o Bloco 2 aguarda a validação visual do Bloco 1.

Portanto: **o Bloco 1 está em produção com a validação visual pendente**, por decisão expressa do
diretor de autorizar o deploy. A Lei do fluxo prevê a validação ANTES da flag; aqui a ordem foi
invertida por autorização direta. Fica registrado como exceção consciente, não como precedente —
e a validação visual segue pendente sobre o código já publicado.

- Commit da feature: `3d9cf88` (branch `feature/filtros-multi-bloco1`).
- Merge na main: **`15fcd87`**, sem conflito, sem `--force`.
- **Push executado** para `origin` (main e branch de feature) — diferente da OS anterior, que
  ficou sem push.
- Deploy **isolado**: `firebase deploy --only hosting`. `firestore.rules` não incluída.
- Timestamp: **26/08/2026, 17:15:54–17:16:19**. Health check HTTP 200 em
  `https://centra-fin.web.app`, com `data-checkbox-multi` presente 5× e `checkbox_multi.js` 200.
- **Check anti-tag-faltante** (o diretor exigiu, após o deploy anterior ter quebrado o
  Gerenciador por uma tag de `core_rules.js` ausente): as 6 tags `<script src>` verificadas
  **três vezes** — pré-merge, pós-merge em `main` e em produção. Todas presentes.

### Mapa de filtros do sistema (levantamento que originou os blocos)
19 filtros já eram multi (Contas a Pagar 7, Folha 4+3 de exportação, Faturamento 4, Fornecedores 3).
17 eram single: **12 de conversão direta** e **5 que exigem decisão do diretor antes**, por
alimentarem cálculo ou eixo de gráfico:
1. **Competência do DRE** — igualdade estrita de mês; multi obriga escolher entre DRE acumulado
   (com margem recalculada, não somada) ou colunas mês a mês, que é outra tela.
2. **Ano do AGING** — âncora do eixo de 12 meses; multi-ano colapsa o eixo. Saída sugerida:
   trocar Ano+Meses por intervalo de competência, como já faz o Dashboard de Custo de Folha.
3. **Ano da aba Metas (dashboard)** — meta é grandeza anual por produto; somar dois anos produz
   % de atingimento sem significado.
4. **Ano da Gestão de Metas** — viável (risco médio), atenção ao `where ano == X` → `where in`.
5. **Abas de Empresa do DRE** — multi é consolidado parcial; já existe a aba CONSOLIDADO.
   Decisão de UX, não de código.

**Blocos restantes propostos:** Bloco 2 = os pequenos (Aprovações tipo/módulo, Despesas
evento/valor, Funcionário do Dashboard de Custo de Folha, Empresa da Auditoria do CRF).
Bloco 3 = só após decisão do diretor sobre competência/ano.
**Bloco 2 está bloqueado até a validação visual do Bloco 1 pelo diretor** (decisão do diretor,
2026-08-26).

### Estado ao encerrar a sessão (2026-08-26)
- Produção: `main` = `15fcd87`, deployada e saudável. `origin/main` sincronizada com o merge.
- Commits de documentação do DIARIO (`e4350c6` e este) publicados em `origin` pelo deployer,
  sob autorização do diretor. Nenhum código pendente de publicação.
- Servidor local `firebase serve` (porta 5000), preparado para a validação visual, **derrubado**
  ao fim da sessão por autorização do diretor. Para retomar a validação:
  `firebase serve --only hosting --port 5000` e abrir `http://localhost:5000/login.html`
  (o código validado é o mesmo que está em produção).
- **Pendência aberta e bloqueante para o Bloco 2:** validação visual do Bloco 1 pelo diretor.
- Branch `feature/filtros-multi-bloco1` preservada local e no remoto (não deletada).
- Artefatos de teste (scripts de equivalência, sintaxe e performance) ficaram no scratchpad da
  sessão, **não versionados** — a evidência dos resultados está registrada acima.

### Aprendizado de processo desta OS
Três achados relevantes só apareceram **por causa dos gates**, não da leitura inicial do código:
o conflito de tema escuro × componente claro (gate do designer, antes de codar); o fato de os 4
pontos programáticos não tocarem os selects (gate do arquiteto, corrigindo a premissa da própria
OS); e a regressão latente de perda de seleção em snapshot (arquiteto, ao mapear o estado).
O testador ter **recusado os testes do engenheiro** e escrito bateria própria foi o que produziu
a evidência de equivalência contra `main` — o teste que o diretor havia exigido nominalmente e
que a suíte do engenheiro não cobria.

### Pendências registradas e NÃO corrigidas (escopo estrito)
- **R7**: `filtrosPorAba` não tem a aba `consolidado`, embora `alternarVisao` a suporte — o badge
  congela nessa visão e o estado não é replicado para ela. Bug pré-existente.
- Foco por teclado no trigger ficou só como borda verde, sem anel (coerente com os inputs de data
  do mesmo modal, não é regressão). Ajuste futuro de 1 linha, se o diretor quiser.
- Segmentos/Serviços do AGING continuam **hardcoded** (4 opções) — candidato a data-derived.

---

## 2026-08-04 — OS-FILTRO-SERVICO-DINAMICO-01: filtro de Tipo de Serviço data-derived

**Problema (relatado pelo diretor):** o filtro avançado de "tipo de serviço" no Gerenciador
de Faturamentos não trazia todos os tipos da base — lista fixa no HTML. Tipo novo cadastrado
não aparecia no filtro.

### Investigação (arquiteto)

Lista hardcoded em `contas_a_receber_desktop/code.html:824-838`: 10 `<option>` estáticas.
Campo real nos documentos: **`Descrição Do Contrato`** (9.496 docs, vindo do ETL) +
`descricao`/`descricao_contrato` (109 docs, criados/editados no app). 10 docs sem tipo.

Varredura dos 9.513 docs reais de `Lancamentos` (`scripts/audit-tipos-servico.cjs`, read-only):
**14 tipos distintos normalizados** (15 grafias brutas) contra **10 no filtro**.

| tipo | notas | | tipo | notas |
|---|---|---|---|---|
| TEMPORARIO | 4.181 | | RPO | 29 |
| UNIDADES | 2.162 | | **INTEGRAÇÃO** | **21** |
| **TERCEIROS** | **1.145** | | **DEVOLUTIVA** | **20** |
| CONSULTORIA | 786 | | ASSESSMENT | 19 |
| SUBSCRIPTION | 674 | | HOTMART | 8 |
| TREINAMENTO | 228 | | **TREINAMENTO DE PPA** | **1** |
| **FOPAG** | **182** | | ESTAGIO/ESTÁGIO | 47 |

Em negrito, os 5 tipos **invisíveis no filtro** — **1.368 notas (14,4% da base)** que nenhum
filtro específico alcançava. Além disso, a opção `PROCESSAMENTO DE PPA` existia no filtro
com **zero** notas na base (opção morta).

Normalização era necessária: a base tem `ESTAGIO` e `ESTÁGIO` para o mesmo serviço — sem
tratar, a opção apareceria duplicada. Mesmo bug de acento da auditoria 2026-06-19
(`core_rules.js:95`).

### Decisões do diretor
- Ordenação **alfabética pt-BR** (posição estável; ordenar por volume faria o item pular
  de lugar conforme a base cresce).
- Casamento **EXATO normalizado**, não mais por substring: marcar TREINAMENTO deixa de
  arrastar TREINAMENTO DE PPA. Opções passam a ser 1:1 com o que está gravado.

### Implementação (arquivo único: `contas_a_receber_desktop/code.html`)
- `<option>` fixas removidas; sobrou só "Todos" — espelha `filtro-comercial`.
- Nova IIFE `popularFiltroTipoServico()` ao lado de `popularFiltroComercial()`, dentro do
  mesmo callback do `onSnapshot`. **Zero query nova ao Firestore**: deriva de `todasAsNotas`,
  já em memória. Rótulo = grafia majoritária do grupo, desempate alfabético (determinístico,
  não depende da ordem de leitura do snapshot).
- Helpers compartilhados `obterTipoServicoBruto` / `normTipoServico` — os dois lados (option
  gerada e valor comparado) obrigados a usar a mesma leitura e a mesma normalização.
- `Set` normalizado montado fora do laço das ~9,5 mil notas.

**Regressão corrigida durante a execução (reporte obrigatório):** `aplicarFiltros():3121` lia
o campo `descricao` **antes** de `descricao_contrato` — ordem divergente do resto do módulo
(`obterFaturamentoReal`, `auditarServicosNaoMapeados`). Unificado na ordem canônica. Validado
contra os 9.513 docs reais: **zero documentos divergentes hoje**, nenhum efeito colateral no
filtro de Empresa nem na busca textual, que compartilham a mesma variável. Corrigido como
higiene — com a option gerada de um lado e a comparação do outro, ordens diferentes seriam
divergência silenciosa esperando o primeiro documento com os dois campos preenchidos.

**Incidente de execução (reporte obrigatório):** o engenheiro gravou o bloco de helpers com
acentos escapados como `ç` em vez de UTF-8 real; detectou no próprio `git diff` e
corrigiu antes de entregar. Sem impacto funcional — registrado por ser erro que passa
despercebido em revisão rápida.

### Validação (testador-auditor)
`scripts/test-filtro-servico-dinamico.cjs` (read-only) **extrai o código real** do
`code.html` por brace-matching e roda via `vm` contra os 9.513 docs de produção — não
reimplementa a lógica, senão o teste não provaria nada sobre o que vai ao ar.

- Soma das options + 10 sem tipo = **9.513** = total real. Nenhuma nota some ou duplica.
- Alcance do filtro: **8.135 → 9.503 notas (+1.368)**.
- TREINAMENTO devolve exatamente 228 (não arrasta TREINAMENTO DE PPA); ESTAGIO/ESTÁGIO
  viram uma option que traz as 47; PROCESSAMENTO DE PPA sumiu.
- `firestore.rules` não tocado → gate do emulador não se aplica.

### Validação visual do diretor
O diretor informou que só consegue validar em produção. Em vez de deployar sem validação
(violaria a Lei do fluxo), usou-se **preview channel** — previsto na constituição para este
caso: app real, Firestore real, URL temporário, produção intocada.
`https://centra-fin--filtro-servico-gdk18bq4.web.app` (expira 2026-08-11).
**Diretor validou textualmente em 2026-08-04: "Validado".**

### Deploy (2026-08-04)

Fluxo cumprido na ordem: arquiteto (investigação) → engenheiro-frontend → testador-auditor
→ validação visual do diretor → flag `READY_OS-FILTRO-SERVICO-DINAMICO-01` → deployer.

- Commit da feature: `1b102e1` (branch `feature/filtro-servico-dinamico`).
- Merge na main: **`8fb0a1d`** (`--no-ff`, sem conflito, mesmo padrão dos merges anteriores).
- Deploy **isolado**: `firebase deploy --only hosting --project centra-fin`. `firestore.rules`
  **não** foi incluído — confirmado por `git diff` vazio para esse arquivo antes e depois do
  merge. Release complete, health check **HTTP 200** em `https://centra-fin.web.app`.
- **Sem push para o GitHub** — não autorizado nesta rodada; a main ficou 4 commits à frente
  de `origin/main`.
- **Diretor confirmou o sucesso do deploy em 2026-08-04** e seguiu conferindo o
  comportamento em produção.

### Incidentes de processo (registro para não se repetirem)

**1. Gate de deploy bloqueou por sujeira de OSs anteriores.** O `gate-deploy.js` (hook
`PreToolUse:Bash`) barrou o deployer: `git status --porcelain` exige limpo, e havia **10
arquivos untracked que não pertenciam a esta OS** — flags `READY_` de 8 features já mescladas
(aprovacao-modal 02/03/05, crf-data-timezone, folha-blocos-abcd, folha-col-salario,
folha-fonte-unica, folha-pj-empresa, import-robustez) e 5 scripts de teste. Ficaram como
untracked nos merges passados e foram se acumulando até travar o deploy de outra feature.
O deployer **parou e escalou em vez de forçar** — comportamento correto. Resolvido pelo
coordenador com dois commits separados, deliberadamente fora do commit da feature:
`d037f7a` (chore: artefatos órfãos) e `c1598cb` (docs: DIARIO).
**Lição:** flag READY e scripts de teste devem entrar no commit da própria OS que os gerou;
caso contrário, viram dívida que cobra juros no deploy seguinte.

**2. `check-secrets.cjs` dá verde falso quando chamado sem nada staged.** Ele varre apenas
`git diff --cached`. Com o índice vazio respondeu *"Nada staged. Nada para checar"* e saiu
com sucesso — um "limpo" por **ausência de escopo, não por verificação**. O deployer não
aceitou o verde: rodou os mesmos padrões manualmente contra
`git diff main..feature/filtro-servico-dinamico` (o diff que de fato ia a produção) e
confirmou zero ocorrências. Somado ao `check-syntax.cjs` cego neste módulo, são **dois gates
do DoD emitindo verde não confiável** na mesma OS.

**3. Validação visual sem ambiente local.** O diretor informou que só consegue validar em
produção. Em vez de deployar antes da validação (violaria a Lei do fluxo), usou-se o
**preview channel** — previsto na constituição exatamente para isso. Deve ser o caminho
padrão nas próximas features com UI: app real + Firestore real + URL temporário, produção
intocada até a aprovação.

**4. Housekeeping pendente:** 16 worktrees de agentes órfãos acumulados em
`.claude/worktrees/`, de OSs anteriores. Removido apenas o desta OS; os demais aguardam
autorização do diretor.

### Pendências abertas (fora de escopo, aguardando OS própria)
1. **Injeção de HTML nas `<option>`** (severidade MÉDIA): `` `<option value="${s}">${s}</option>` ``
   sem escape. Não é classe nova — `popularFiltroComercial` já fazia igual — mas a superfície
   cresceu (antes 100% estático). Exige acesso autenticado de escrita. Hardening: reusar o
   `escapeHTML` de `assets/checkbox_multi.js`.
2. `auditarServicosNaoMapeados()` (~linha 2861) tem as mesmas listas hardcoded envelhecendo,
   e é ela que zera o Faturamento Real de serviço não reconhecido. Mesma doença, outro lugar.
3. **Os dois gates do DoD furados** (ver Incidentes 1 e 2):
   - `scripts/check-syntax.cjs` está **cego neste módulo** — falha em `<script>` #7 e #8 mesmo
     sem mudança alguma (regex casa `<script>` dentro de comentário HTML; corpo ESM salvo como
     `.cjs`). Confirmado independentemente contra HEAD.
   - `scripts/check-secrets.cjs` **aprova sem verificar** quando chamado com o índice vazio.
   Enquanto não forem corrigidos, o verde desses dois gates não significa nada.
4. Filtro de **Status** fixo com 5 valores, mas `obterStatusReal()` produz 7 — faltam
   `Cancelada` e `DESMEMBRADO`. Mesmo tipo de buraco, não autorizado a corrigir.
   (Filtro de **Empresa** está correto: os 4 valores são o retorno fechado de
   `calcularEmpresaAtribuida`, não dado livre.)
5. Divergência entre regra e base: `core_rules.js` lista a keyword `HR METRICS`, que não tem
   nenhuma nota; e `TREINAMENTO DE PPA` (1 nota) aparenta ser erro de digitação de
   `PROCESSAMENTO DE PPA`.

---

## 2026-07-23 — Sessão completa: Importação 2025, Timezone, Folha Blocos A–D, Fonte Única

### 1. Importação da base 2025 (OS-IMPORT-ROBUSTEZ-01, commit 9c0b908)

**Problema:** Importação parcial — 3.639 de 5.639 registros entraram, faltando R$ 7.360.360,61.
Causa raiz: `addDoc` gera ID no cliente; numa operação longa (5.639 escritas sequenciais),
retry do SDK após resposta de rede perdida reenviou o mesmo ID → "Document already exists" →
loop abortou sem tolerância a falha, deixando importação parcial silenciosa.

**Correção:** writeBatch com chunks de 450 (usa `batch.set`, não `batch.create` — retry
sobrescreve silenciosamente em vez de falhar). Tolerância a falha por lote (cada
`batch.commit` tem try/catch individual — lote que falha registra NFs afetadas e continua).
Relatório final obrigatório (criados/atualizados/falhados + lista de NFs com erro).
Indicador de progresso ("Criando lote X de Y — Z de N"). Dedup por nf+cnpj preservada
intacta.

**Resultado em produção:** 2.000 criados, 3.639 atualizados, 0 falhados. Base 2025 fechada
em 5.639 docs / R$ 94.799.626,63.

**Números de referência auditados (base 2025):**
- Total: 5.639 docs, R$ 94.799.626,63 (Valor Fatura)
- Jan 722 / Fev 588 / Mar 497 / Abr 433 / Mai 430 / Jun 380 / Jul 365 / Ago 400 /
  Set 427 / Out 423 / Nov 404 / Dez 570

---

### 2. Bug de timezone na conversão de data (OS-CRF-DATA-TIMEZONE-01, commit f92aea2)

**Problema:** 6 conversões inline de serial Excel no CRF usavam
`new Date((serial - 25569) * 86400 * 1000)`, criando Date em UTC midnight. No fuso de
Brasília (UTC-3), `getMonth()`/`getDate()` retornavam o dia/mês ANTERIOR para notas
emitidas no dia 1º.

- 1 função quebrada de fato: `parseDataAuditoria` — 90 notas de 2025 e 81 de 2026
  (R$ 737.386,86) apareciam no mês errado no relatório de auditoria.
- 5 funções "funcionavam por acaso" — usavam `.toISOString()`/`.getTime()` logo depois,
  que anulavam o erro por coincidência. Bomba-relógio: bastaria trocar por `.getMonth()`
  numa refatoração futura para o bug ressurgir.

**Correção:** Todas as 6 substituídas por `parseDataLocal`/`extrairISOLocal` do core_rules.js
(que usam `getUTCFullYear`/`getUTCMonth`/`getUTCDate` — imunes a timezone). 72 linhas
removidas, 14 inseridas. Dashboard Master e DRE Gerencial não afetados (já usavam métodos
corretos).

---

### 3. Auditoria de Folha — Blocos A/B/C/D (merges 7691a2e, f43c2c8, daebefe)

- **Bloco A:** Removida mensagem "informativo, não entra no Custo Total"; rótulo simplificado
  para "Descontos". Regra permanente registrada: as 5 verbas investigadas (INSS retido, IRRF,
  Contribuição Assistencial, Seguro de Vida, Contribuição Odontológica) já estão embutidas no
  Salário Bruto — somá-las seria DUPLA CONTAGEM.
- **Bloco B:** DIFERENCA_SALARIAL reclassificada de "outros valores" para Vencimentos
  (keyword `DIFERENCA` adicionada ao `isVencimento`).
- **Bloco C:** Seção "Exame Médico" adicionada ao modal Olho do Gerenciador. Conflito de
  merge com bloco A resolvido (rótulo "Descontos" do A + seção "Exame Médico" do C).
- **Bloco D:** Selo de build debug removido do Dashboard de Custo de Folha.

---

### 4. Fonte Única de cálculo de folha (commits d3b77fa, fe713c5, 87ac299, b9e84f4)

**Problema:** Gerenciador e Dashboard tinham implementações SEPARADAS da mesma regra de
cálculo de custo de folha, que divergiram ao longo do tempo. Resolvido em 3 camadas
sucessivas, cada uma revelando a próxima:

**(a) Fórmula de cálculo (OS-FOLHA-FONTE-UNICA-01, d3b77fa):**
Classificadores (isVencimento, isEncargo, isDescFolhaInfo, isBnfDesc, isSalarioBrutoKey) e
`calcularTotais` extraídos do Gerenciador para `core_rules.js` como funções `folhaCusto*`.
Ambos os módulos passaram a delegar. Divergências corrigidas no Dashboard: faltavam
`BOLSA_AUXILIO`, `DIFERENCA`, `SALARIO_CADASTRAL` rejection, 3 itens informativos em
isDescFolhaInfo, e a guarda `_has_benef_txt` (TXT como fonte de verdade para benefícios).

**(b) Atribuição de empresa dos PJs (OS-FOLHA-PJ-EMPRESA-01, fe713c5):**
Gerenciador marcava todo PJ como `empresa='PJ'`, normalizado para "SOULAN CONSULTORIA" via
`folhaEmpresaCanonica`. Dashboard resolvia a empresa real via lookup em Fornecedores.
Decisão do diretor: PJ aparece na empresa real. Impacto medido: SOULAN CONSULTORIA
desinflou R$ 753.673,73; NEAT ganhou R$ 650.221,74; SOULAN ADM ganhou R$ 103.451,99.
Total global inalterado (R$ 0,00 de diferença). Funções extraídas: `folhaPjResolverEmpresa`,
`folhaEmpresaCanonica`, `folhaNormalizarCompetenciaPJ`.

**(c) Enriquecimento de benefícios CLT via TXT (b9e84f4):**
O Dashboard não enriquecia CLTs com benefícios do TXT analítico (CP_Beneficios_PJ). A
função `enriquecerCltComBeneficios` e o cache `_cacheBeneficiosPorMatricula` existiam
APENAS no Gerenciador. Dashboard subestimava benefícios em R$ 67.258,97 e descontos em
R$ 1.587,87 (gap de R$ 68.846,84 no Custo Total para NEAT). Extraídos para core_rules.js:
`folhaEnriquecerCltComBeneficios`, `folhaMontarCacheBeneficiosPJ`.

**Incidente durante o processo (hotfix 87ac299):**
Deploy quebrou o Gerenciador em produção ("ReferenceError: folhaCustoIsVencimento is not
defined") porque a tag `<script src="core_rules.js">` foi adicionada ao Dashboard mas
esquecida no Gerenciador. Tela em branco por ~10 minutos até o hotfix.

---

### Aprendizados (REGRAS PERMANENTES)

1. **Ao extrair lógica para módulo compartilhado, verificar que TODOS os módulos consumidores
   têm a tag de import.** A ausência só aparece em runtime — não há typecheck nem build step
   neste projeto. Checklist pós-extração: `grep -r "folha*" *.html` confirma uso; confirmar
   que cada HTML que usa tem `<script src="core_rules.js">`.

2. **Divergência entre dois módulos raramente tem causa única.** Unificar a fórmula não basta
   se a ORIGEM DOS DADOS (merges, caches, enriquecimentos) continuar duplicada. Verificar as
   três camadas: (a) fórmula de cálculo, (b) conjunto de registros (PJs, filtros), (c)
   enriquecimento pré-cálculo (benefícios TXT).

3. **Nunca "portar" (copiar) uma função para outro módulo como solução de divergência.** Isso
   recria a causa raiz — em poucos meses as duas implementações divergem de novo. Sempre
   extrair para local comum (core_rules.js) e ambos os módulos chamam a mesma função.

4. **Operações de escrita em massa (importação) exigem batch + tolerância a falha + relatório
   final.** Loop sequencial sem isso produz falha parcial silenciosa — o usuário não sabe o
   que entrou e o que faltou. writeBatch + try/catch por lote + contadores ao final.

---

### Resumo técnico da sessão

| OS | Commit(s) | Arquivo principal | Saldo |
|----|-----------|-------------------|-------|
| IMPORT-ROBUSTEZ-01 | 9c0b908 | contas_a_receber_desktop/code.html | +175 -35 |
| CRF-DATA-TIMEZONE-01 | f92aea2 | contas_a_receber_desktop/code.html | +14 -72 |
| FOLHA Blocos A–D | 7691a2e, f43c2c8, daebefe | custo_folha_desktop, custo_folha_dash | merge de 3 branches |
| FOLHA-FONTE-UNICA-01 | d3b77fa | core_rules.js, custo_folha_desktop, custo_folha_dash | +285 -553 |
| FOLHA-PJ-EMPRESA-01 | fe713c5 | core_rules.js, custo_folha_desktop, custo_folha_dash | +90 -69 |
| Hotfix script tag | 87ac299 | custo_folha_desktop/code.html | +1 |
| Benefícios CLT TXT | b9e84f4 | core_rules.js, custo_folha_desktop, custo_folha_dash | +114 -176 |

---

## 2026-07-23 — OS-IMPORT-ROBUSTEZ-01: Importação de Lancamentos resiliente (entrada original)

### Status: CONCLUÍDO — deployado e validado em produção.

### Causa raiz do problema
Importação da base 2025 de Contas a Receber falhou após 3.639 de 5.639 registros.
Loop sequencial de `addDoc` individuais sofria retry do SDK Firebase em perda de rede
→ "Document already exists" → abortava tudo, deixando 2.000 registros faltantes
(R$ 7.360.360,61).

### O que foi implementado (branch `feature/import-robustez`)
1. **writeBatch com lotes de 450** — substitui loop sequencial de addDoc/updateDoc.
   Usa `doc(collection(db, "Lancamentos"))` para IDs aleatórios client-side (equivalente
   funcional a addDoc, sem risco de duplicar docs existentes com IDs determinísticos).
2. **Tolerância a falha por lote** — try/catch individual por batch.commit(). Lote que
   falha registra docs falhados e continua com o próximo. Não aborta.
3. **Indicador de progresso** — botão mostra "Criando/Atualizando lote X de Y — Z de N".
4. **Relatório final** — modal de sucesso expandido com cards (Criados/Atualizados/Falhados)
   + lista de NFs com motivo de falha (até 50, com indicador de overflow).
5. **Dedup INTOCADA** — normChaveDoc, mapExistentes, classificação novos/atualizados
   preservados integralmente.

### Decisão do diretor
- NÃO reimportar até validação completa da robustez.

### Arquivo alterado
- `contas_a_receber_desktop/code.html` — função `processarSalvamentoImportacao` + modal de sucesso.

### Pendências
- Validação visual do diretor (feature com UI).
- Testes com dados reais: (a) 5.639 registros entram; (b) reimportação não duplica; (c) relatório bate.
- Flag READY_OS-IMPORT-ROBUSTEZ-01 após validação.

---

## Pendência — Custo de Folha × Reembolsos de PJ Interno (registrada 2026-07-17)

**Status: PENDENTE — aguarda solicitação explícita do diretor para implementar.**

Lançamentos de REEMBOLSO feitos a PJs internos (vindos do módulo Contas a Pagar) NÃO
devem entrar no custo de folha. Reembolso (Uber, almoço com cliente, compras adiantadas)
é devolução de dinheiro que o PJ adiantou — não é custo de pessoal/remuneração. Só deve
entrar no custo de folha a nota de serviço/remuneração do PJ.

### A definir antes da implementação

Como o sistema distingue um lançamento de "reembolso" de uma "nota de serviço" do PJ:
campo específico, categoria, palavra na descrição, ou se precisará de marcação nova. Essa
definição determina se é correção simples de filtro ou mudança estrutural.

---

## 2026-07-16 — OS-FOLHA-CUSTO-REAL-01 (Bloco A): Composição do custo de folha — investigação e transparência

### Decisão do diretor

Investigação completa sobre a composição do custo de folha para determinar se verbas
marcadas como "informativo" (INSS retido, IRRF, Contribuição Assistencial, Seguro de
Vida, Contribuição Odontológica) deviam ser adicionadas ao custo total.

### Conclusão comprovada aritmeticamente (REGRA PERMANENTE — protege contra dupla contagem)

Todas as 5 verbas investigadas **JÁ ESTÃO EMBUTIDAS no Salário Bruto / Vencimentos**:
- **INSS retido** (`INSS_Valor`) — retenção do funcionário, incluída no bruto
- **IRRF retido** (`IRRF_Valor`, `IR_RETIDO_Valor`) — retenção do funcionário, incluída no bruto
- **Contribuição Assistencial** (`CONTRIBUICAO_ASSISTENCIAL_Valor`) — desconto sindical do funcionário, incluído no bruto
- **Seguro de Vida** (`SEGURO_DE_VIDA_Valor`) — coparticipação do funcionário, incluída no bruto
- **Contribuição Odontológica** (`DESCONTO_CONTRIBUICAO_ODONTOLOGICA_Valor`) — coparticipação do funcionário, incluída no bruto

**Prova**: `TOTAL_VECTO − TOTAL_DESCTO = LIQUIDO` com gap zero em todos os funcionários
testados (Beatriz Martins Romao, Débora Santos Gomes, Caio Monteiro). As 5 verbas compõem
o `TOTAL_DESCTO` — são deduzidas do bruto para chegar ao líquido.

**Consequência**: somá-las ao custo total causaria **DUPLA CONTAGEM** (o bruto já as contém).
O cálculo atual (`calcularTotais()`: vencimentos + encargos + benefícios − descontos_bnf)
está algebricamente correto.

**Qualquer futura alteração que pretenda "adicionar descontos ao custo total" deve ser
rejeitada**, salvo prova de que a natureza da verba mudou (passou a ser custo adicional
pago pela empresa por cima do salário, não desconto do funcionário).

### O que foi implementado

1. Rótulo da seção "Descontos de Folha" no modal Olho renomeado para "Descontos" — sem
   mensagem explicativa (decisão do diretor: tela limpa).
2. Mensagem "informativo, não entra no Custo Total" removida completamente.
3. **Nenhuma alteração de cálculo** — apenas texto de UI.

### Nota sobre Seguro de Vida e Contribuição Odontológica

Os campos `Bnf_Seguro` e `Bnf_Odonto` (custo bruto do benefício pago pela empresa)
existem na estrutura mas estão zerados em Jun/2026 — dependem de importação de
benefícios PJ (`_origens.beneficios`). Quando preenchidos, esses campos entram
corretamente como "Benefícios Pagos" (bucket separado, sem risco de dupla contagem).

### Contexto de risco

Esta OS opera na mesma área sensível da inflação acidental revertida em `bab45d8`
(dupla contagem de `salario_cadastral`). A investigação em 3 fases com aprovação
do diretor antes de cada etapa foi aplicada para máxima cautela.

---

## 2026-07-10 — OS-APROVACAO-MODAL-02 a 05: Modais de Aprovação — diff, resumo de negócio, campos editáveis

### Contexto e escopo final

Série de 4 OSs (MODAL-02 a 05) cobrindo a tela de Aprovações (`aprovacoes_desktop/code.html`)
e os call sites de captura de dados nos módulos CRF, CP, Folha e Metas.

### O que foi implementado

1. **Badge com nome real da operação** — "PARCELAMENTO", "DESFAZER PARCELAMENTO" em vez do
   genérico "COMPOSTA" (tabela e modal).
2. **Diff real para edições simples (UPDATE)** — tabela "Campo | Valor atual | Alterado para"
   mostrando SOMENTE campos que efetivamente mudaram.
   - Iteração apenas de chaves de `dados_novos` (campo ausente no novo = não tocado).
   - Normalização: `"1800"` (string) = `1800` (number); `null` = `""`.
   - Metadados excluídos: `data_edicao`, `data_importacao`, `created_at`, `updated_at`, `*_timestamp`.
3. **Captura completa de `dados_antigos`** — spread do registro em cache nos 4 módulos, em vez
   de subconjunto manual de 3-5 campos.
4. **Resumo de negócio por tipo de operação composta:**
   - **Parcelamento:** Status Atual (Valor da Fatura + Status) | Tabela de parcelas (Valor + Vencimento).
   - **Desfazer parcelamento:** Status Atual (Status + Parcelas geradas) | Resumo (N excluídas + nota restaurada).
   - **Exclusão em massa (DELETE_BATCH):** formato existente mantido (N registros + lista IDs).
5. **Modal "Realizar Alterações"** — campos editáveis filtrados:
   - UPDATE simples: apenas campos do diff.
   - Parcelamento: apenas Valor + Vencimento por parcela.
   - Desfazer parcelamento / DELETE_BATCH: botão removido (sem campos editáveis).

### Decisão do diretor: `data_edicao` é metadado

`data_edicao` (carimbo automático de salvamento) adicionado a `_isMetadadoTecnico` — muda a
cada edição mas nunca é decisão do usuário. `data_importacao` idem (carimbo do ETL).

### Aprendizado (5+ rodadas até acertar)

**Operações compostas exigem definição explícita de "resumo de negócio" por tipo.** Não é
suficiente generalizar a lógica de diff de edição simples para operações como parcelamento,
desfazer parcelamento ou exclusão em massa — cada tipo tem campos relevantes diferentes,
lógica de exibição diferente, e campos editáveis diferentes (ou nenhum). A abordagem correta
é: (1) propor o resumo de negócio em texto ao diretor, tipo por tipo; (2) obter confirmação
antes de implementar; (3) implementar renderização dedicada, não genérica.

**Evidência antes de tela:** Na OS-MODAL-04 o diretor exigiu prova do cálculo de diff em texto
com dados reais ANTES de qualquer mudança de HTML — isso evitou uma quarta rodada de
"parece certo mas na prática não funciona". Lição: para lógica de transformação de dados,
provar o cálculo com dados reais antes de tocar na interface.

### Commits

- `7d894d7` feat: OS-APROVACAO-MODAL-02 — badge real, card legível, diagnóstico do botão
- `dad23a4` feat: OS-APROVACAO-MODAL-03 — diff real nos modais de aprovação
- `c7218ad` fix: OS-APROVACAO-MODAL-04 — diff definitivo com tabela unificada
- `8f93845` feat: OS-APROVACAO-MODAL-05 — resumo de negócio para operações compostas
- `234e08a` fix: OS-APROVACAO-MODAL-05 — valor fatura no status, modal revisão cirúrgico

---

## 2026-07-08 — Reforço gate-deploy.js: trava de working directory sujo

### Decisão do diretor (2026-07-08)

Motivado pelo deploy fora de sequência da OS-APROVACAO-AJUSTES-02 (código em produção sem commit), o diretor aprovou a adição de um check no `scripts/gate-deploy.js` que bloqueia deploy/push quando há alterações não commitadas (`git status --porcelain`).

### Testes realizados

| Cenário | Resultado | Exit code |
|---------|-----------|-----------|
| Working directory sujo (arquivos modificados/untracked) | **BLOQUEADO** com lista de arquivos pendentes | 2 |
| Working directory limpo (tudo commitado) | **LIBERADO** | 0 |

### Ajuste complementar no .gitignore

Adicionados `.claude/worktrees/` e `.claude/settings.local.json` ao `.gitignore` — são arquivos de sessão local do Claude Code que sujavam o working directory permanentemente, o que impediria deploys legítimos.

---

## 2026-07-08 — OS-APROVACAO-AJUSTES-02: Banner + Data no Parcelamento

### Correções

| Item | Problema | Correção |
|------|----------|----------|
| Banner esteira | Exibido para Master (sidebar.js:238 incluía 'master'), violando regra de discrição | Condição alterada para `perfilN !== 'super_admin'` — Master nunca vê. Título renomeado de "Atenção Master" para "Esteira de Aprovações". Contraste corrigido (text-amber-900/800). |
| Data no parcelamento CRF | Modal de parcelamento não tinha campo de data — datas auto-calculadas sem customização | Novo campo "Data Base de Vencimento" (input type="date") editável, pré-preenchido com vencimento da nota. Preview recalcula ao alterar. |

### Registro de deploy fora de sequência

**Esta OS foi deployada ANTES de ser commitada, por decisão do diretor motivada por dificuldade de acesso ao ambiente local. O deploy em produção ficou temporariamente à frente do git entre 16:05:11 (horário do deploy) e o commit `c9d1711` (horário deste commit).** O diretor autorizou o deploy direto e o alinhamento posterior do repositório. Situação regularizada com commit + push.

### Arquivos alterados
- `sidebar.js` — condição de visibilidade + título + contraste do banner
- `contas_a_receber_desktop/code.html` — campo de data + lógica de override em calcularParcelas/renderPreviewParcelas

---

## 2026-07-04 — Sistema de Aprovações em Dois Níveis

### Decisão do diretor (2026-07-03): enforcement client-side

**RISCO ACEITO E REGISTRADO:** O mecanismo de aprovação (master propõe, super_admin
aprova) é implementado com trava **client-side apenas** (JavaScript da tela). As
`firestore.rules` das coleções de dado real (Lancamentos, ContasAPagar, CustosFolha,
Base_Empresas, MetasFinanceiras) **NÃO foram restringidas** para o perfil master —
ele mantém escrita técnica direta nelas.

Consequência: um usuário Master com conhecimento técnico pode, em teoria, burlar a
esteira de aprovação escrevendo diretamente no Firestore via DevTools, SDK ou
qualquer cliente HTTP autenticado. Esse risco foi **comunicado ao diretor na proposta
arquitetural** (2026-07-03) e **aceito conscientemente**, dado que a alternativa
(Cloud Functions) introduziria dependência e custo novos, exigindo aprovação via Lei
da Decisão. O modelo é consistente com o já aceito na Fase 3 (Esteira de Aprovação
de Fornecedores) para operadores comuns.

Única proteção no banco: `CP_SolicitacoesAprovacao` tem `allow update/delete`
restrito a `isSuperAdmin()` — master NÃO pode auto-aprovar suas próprias
solicitações (isso SIM é enforced no banco).

### OS incluídas neste deploy

| OS | Escopo |
|----|--------|
| OS-SISTEMA-APROVACOES | Interceptores de CRUD para master em 5 módulos (CRF, CP, Folha, Metas, Aprovações); funções isSuperAdmin()/isMaster() em firestore.rules; índice composto; tipos BATCH_COMPOUND e DELETE_BATCH |
| OS-APROVACAO-DISCRICAO-01 | Ocultação total do mecanismo para o master: menu Aprovações oculto, toasts de sucesso idênticos ao fluxo direto |
| OS-APROVACAO-IDENTIFICADOR-01 | Nº NF (e equivalente por módulo) na descrição das solicitações, substituindo o ID interno do Firestore |
| Correção toast exclusão CRF | alertaSucesso dentro de modal fechado → _toastEsteira flutuante |

### Validação visual do diretor (2026-07-04)

- Exclusão individual (CRF): toast de sucesso aparece corretamente ✓
- Parcelamento (CRF): toast de sucesso aparece corretamente ✓
- Menu Aprovações oculto para Master ✓
- Nº da NF exibido corretamente na tela de Aprovações ✓

### Teste de emulador (firestore.rules): 15/15 cenários passaram

---

## 2026-07-03 — Deploy em produção: lote de 10 OS

**URL:** https://centra-fin.web.app
**Timestamp:** 2026-07-03, deploy via `firebase deploy --only hosting`
**Commit range:** aec5c39..66f487b (9 commits, push 797fffd..66f487b)

### OS deployadas neste lote

| OS | Escopo | Validação visual |
|----|--------|-----------------|
| OS-AGING-01 | Tabela Aging de Notas Vencidas no Dashboard Master | Aprovada pelo diretor |
| OS-CONSOLIDADO-01 | Gráfico Consolidado full-width (aba Consolidado) | Aprovada pelo diretor |
| OS-CONSOLIDADO-02 | Reordenação (Consolidado no topo), paleta Por Serviço (azul/verde), rótulos sobrepostos (threshold 5%) | Aprovada pelo diretor |
| OS-METAS-DASH-01 (itens 1,3,5,6) | Gráfico mensal bruto, dataLabels corrigidos, modal "Não Atingida", filtro ampliado | Aprovada pelo diretor |
| OS-METAS-KPI-01 | Cards KPI Meta Anual Bruta/Real na tela Metas | Aprovada pelo diretor |
| OS-CONTRASTE-01 | Cores de dataLabels nos gráficos Meta Anual (branco/cinza por série) | Aprovada pelo diretor |
| OS-CONTRASTE-02 | Overflow de rótulos nos gráficos Meta Anual (textAnchor: end + function colors) | Aprovada pelo diretor |
| OS-METAS-BINARIO-01 | Cards de atingimento mensal binários + modal universal abrirModalDetalheMeta (reverte OS-METAS-PARCIAL-01) | Aprovada pelo diretor |
| Gauges individuais >100% | Remoção do Math.min nos 5 velocímetros de produto (completa OS-METAS-DASH-01 item 4) | Aprovada pelo diretor |

### Notas

- **Aba Consolidado — itens conhecidos entregues:** a reordenação (Consolidado no topo)
  e a paleta do gráfico Por Serviço foram entregues como parte da OS-CONSOLIDADO-02.
  Todos os 3 itens da spec estão em produção.
- **OS-METAS-PARCIAL-01 revertida:** o estado "Parcial" (amber) nos cards mensais foi
  introduzido e revertido na mesma sessão. Decisão do diretor: a classificação binária
  global é a correta (soma vs meta geral). O detalhe por produto vive apenas no modal
  de clique (abrirModalDetalheMeta).
- **Regra permanente adicionada ao CLAUDE.md:** reporte obrigatório de regressões
  corrigidas silenciosamente (decisão do diretor, motivada por regressão no filtro de
  status do modal de metas).
- **Código morto identificado:** funções `abrirModalMetaBatida` e `abrirModalMetaNaoAtingida`
  não são mais chamadas (substituídas por `abrirModalDetalheMeta`). Limpeza pendente
  para sessão futura.
- **Override `border-amber-200` em theme.css:** remanescente da OS-METAS-PARCIAL-01.
  Não causa dano; pode ser removido em limpeza futura ou reaproveitado.

---

## 2026-07-01 - OS-FECHAMENTO-01 concluida (deploy em producao)

Matrizes Comercial x Servico no Dashboard Master > Fechamento publicadas em
https://centra-fin.web.app. Firebase deploy --only hosting executado com sucesso.

Resumo da feature entregue:
- Bug critico corrigido: pivot .bruto agora acumula vFatura (antes usava faturReal,
  fazendo Bruto e Real mostrarem o mesmo numero).
- Soulan: 2 tabelas (Faturamento Bruto + Faturamento Real por Comercial).
- Thomas: 3 tabelas (Faturamento Bruto + Real + Taxa por Comercial).
- Tabelas transpostas "por Servico" removidas. Funcao renderTabelaPorServico removida.
- Novo pivot .taxa para Thomas acumulando campo Taxa (OS-CRF-01).

Correcao de processo aplicada durante esta OS: o testador-auditor criou a flag
READY_os-fechamento-01 ANTES da validacao visual do diretor, violando o fluxo do
CLAUDE.md. Flag removida e recriada somente apos aprovacao visual. Licao: o testador
aprova tecnicamente, mas a flag so e criada DEPOIS da validacao visual do diretor
(para features com UI). Ordem correta: testador aprova -> diretor valida visualmente
-> flag criada -> deployer.

Fluxo exercitado: arquiteto -> designer (spec) -> engenheiro-frontend -> designer
(auditoria) -> testador-auditor -> validacao visual do diretor -> flag -> deployer.

---

## 2026-07-01 - Licao: dependencia de dado vs dependencia de deploy

Correcao de entendimento registrada pelo diretor. A dependencia bloqueante original da
OS-FECHAMENTO-01 presumia que ela precisava aguardar o DEPLOY EM PRODUCAO da OS-CRF-01.
Isso estava errado — a dependencia real era o DADO existir no Firestore, nao a TELA
estar publicada. Como o arquiteto ja havia confirmado que os campos Comercial e Taxa ja
existiam nos documentos reais (ETL ja gravava), a OS-FECHAMENTO-01 poderia ter sido
implementada em paralelo, sem esperar deploy.

Regra geral para mapeamento de dependencias entre OS:
- "Depende do dado existir na fonte" (Firestore) != "depende da tela estar publicada"
  (deploy). Sao coisas diferentes.
- Dependencia de deploy so bloqueia de verdade se a nova OS depender de uma MUDANCA DE
  COMPORTAMENTO da tela ja publicada (ex.: formulario que passa a gravar campo novo), nao
  de LER um campo que ja existe.
- Nas proximas OS, distinguir explicitamente essas duas categorias ao mapear dependencias.

Nenhuma acao retroativa necessaria — apenas registro de aprendizado.

---

## 2026-07-01 - OS-CRF-01 concluida (deploy em producao)

Firebase deploy --only hosting executado com sucesso. OS-CRF-01 em producao em
https://centra-fin.web.app. 591 arquivos enviados, 135 novos uploads.

Resumo da feature entregue:
- Colunas Comercial e Taxa no Gerenciador CRF (Contas a Receber)
- Comercial: exibe nome limpo do comissionado (campo Comissionado 01, sem prefixo numerico)
- Taxa: valor monetario entre Faturamento Bruto e Valor Liquido
- 19 colunas reordenadas, cabecalhos centralizados
- Filtro avancado multi-select por Comercial
- Campo Comercial editavel no modal de edicao
- Comercial e Taxa no modal de detalhe e exportacao Excel

Achado do arquiteto: os campos ja existiam nos 3.410 documentos do Firestore (ETL ja
gravava). Nao foi necessario backfill nem reimportacao — tarefa foi puramente de UI.

Fluxo completo exercitado: arquiteto -> designer (spec) -> engenheiro-frontend ->
designer (auditoria) -> testador-auditor -> validacao visual do diretor -> deployer.

---

## 2026-07-01 - Revogacao da regra do print obrigatorio

Decisao do diretor: remover a obrigatoriedade de captura/armazenamento de screen.png no
modulo para features com UI. A validacao visual do diretor continua como gate obrigatorio
— a mudanca e apenas na forma de evidencia: aprovacao textual do diretor registrada no
DIARIO.md e suficiente, sem necessidade de print anexado ao repositorio.

Motivo: custo de armazenamento acumulado no Git e overhead de processamento de imagem
nao se justificam frente ao ganho de auditoria. Trade-off pesado conscientemente pelo
diretor.

Alteracoes: CLAUDE.md secao "Validacao visual do diretor" (removida exigencia de
screen.png) e Definition of Done (atualizado para refletir aprovacao textual).

Aplicacao retroativa: OS-CRF-01 em andamento beneficiada — validacao visual do diretor
ja dada nesta conversa e suficiente para prosseguir sem print.

---

## 2026-07-01 - OS-CRF-01: Validacao visual aprovada pelo diretor

Diretor abriu o modulo Contas a Receber (Gerenciador CRF) no servidor local
(localhost:5000) e validou visualmente a implementacao:
- Colunas Comercial e Taxa nas posicoes corretas
- Cabecalhos centralizados
- Filtro avancado Comercial funcional
- Campo editavel no modal de edicao
- Detalhe (olho) com Comercial e Taxa

Aprovacao registrada textualmente (conforme nova clausula — sem print obrigatorio).
OS-CRF-01 liberada para merge/deploy.

---

## 2026-07-01 - Merge F0 em main (fabrica em producao)

Branch feature/instalar-fabrica-f0 mesclado em main via fast-forward e push para origin.
Fluxo completo da fabrica exercitado pela primeira vez:

- Testador-auditor: revisou os 18 arquivos do branch, rodou checks de sintaxe e segredos
  (ambos limpos), confirmou que firestore.rules NAO foi alterado (emulador dispensado),
  verificou ausencia de segredos nos commits. Flag READY_instalar-fabrica-f0 criada.
- Deployer: confirmou flag, merge --ff-only (3 commits, 1040 linhas), check de segredos
  pre-push limpo, git push origin main sem --force. Range 8bdf875..f6e0cd0.
- Nenhum firebase deploy necessario (sem mudanca em rules/hosting).

Commits agora em main:
- 47cc83a feat: instala fabrica de agentes no CentraFin (F0-01)
- 48d9b82 feat: completa Fase F0 (F0-02 a F0-07)
- f6e0cd0 docs: registra correcao de protocolo

Fase F0 encerrada. Fabrica operacional em main. Proximo: F1 (primeira tarefa cirurgica).

---

## 2026-07-01 - F0 fechado (substrato seguro completo)

Fabrica instalada e testada de ponta a ponta no branch feature/instalar-fabrica-f0,
sem tocar main/producao. Todos os 7 itens da Fase F0 implementados e PROVADOS na
pratica (nao so escritos):

- F0-01: 8 agentes + CLAUDE.md + TASKS.md + DIARIO.md. settings.json/settings.local.json
  originais preservados (nao sobrescritos).
- F0-02: trava de deploy em Node (scripts/gate-deploy.js). Testada: bloqueia push sem
  flag READY_*, libera com flag, bloqueia deploy de firestore:rules sem flag "regra".
- F0-03: Firebase Emulator Suite local (Firestore + UI). Isolamento comprovado (host
  127.0.0.1, impossivel tocar centra-fin real). Regras reais carregadas e aplicadas
  (bloqueio 403 confirmado num teste sem auth).
- F0-04: scripts/test-firestore-rules.cjs. 4/4 casos passando contra as regras reais:
  admin escreve, consulta bloqueado na escrita, hasMenu libera leitura, sem menu nega.
- F0-05: scripts/check-syntax.cjs. Testado com arquivo JS quebrado de proposito (pegou
  o erro) e com arquivos validos (passou).
- F0-06: scripts/check-secrets.cjs. Corrigido um bug real (o script se autodenunciava
  por conter os proprios padroes de busca como texto) e re-testado limpo/sujo.
- F0-07: purge_parcelas_duplicadas.cjs confirmado isolado em scripts-perigosos/.

Decisoes tomadas nesta sessao:
- Designer redefinido (nao gera prototipo, so spec de diff + auditoria de tokens) -
  fabrica ficou em 8 agentes.
- Emulador local = homologacao (nao projeto Firebase separado, por decisao do diretor
  de nao mudar nada do ambiente atual).

Achado durante a instalacao (fora do escopo da fabrica, resolvido a parte):
- Working tree tinha pendencias nao commitadas com um client_secret real hardcoded em
  2 arquivos (audit_headcount_maio.cjs, diag_crf_notas.cjs). Nunca foi commitado
  (confirmado via git log --all -S). Arquivos tirados do stage e adicionados ao
  .gitignore. Nao precisou rotacionar credencial.

Pendente (nao bloqueia F0, aguarda diretor):
- F0-D1: repo publico vs privado.
- F0-D2: confirmar permissao de deploy do firebase login atual (ja em uso, so registrar).

Proximo passo: commit final do branch, push unico (combinado com o diretor), depois
F1 = primeira tarefa cirurgica real exercitando o fluxo completo ponta a ponta.

---

## 2026-07-01 - F0-D1 e F0-D2 fechados (zero pendencias no F0)

- F0-D1: repositorio ja estava privado (diretor havia liberado temporariamente so para
  leitura inicial da fabrica nesta sessao, depois fechou de volta). Confirmado via teste
  de clone sem credenciais (falhou = privado).
- F0-D2: credenciais do firebase login estavam expiradas (Authentication Error ao rodar
  firebase projects:list). Resolvido com firebase login --reauth. Permissao de deploy
  em centra-fin confirmada via firebase deploy --only hosting --dry-run (sucesso).

Fase F0 encerrada sem nenhuma pendencia em aberto. Proxima etapa: F1 (primeira tarefa
cirurgica real) ou merge do PR feature/instalar-fabrica-f0 -> main, a criterio do diretor.

---

## 2026-07-01 - Correcao de protocolo: devolucao da gestao ao coordenador

O diretor apontou (corretamente) que toda a Fase F0 foi executada por mim (Claude, no
chat, fora do Claude Code) escrevendo arquivos e codigo diretamente - papel que deveria
ser do coordenador (e dos agentes sob ele), nao meu. Isso so foi aceitavel porque a
fabrica ainda nao existia: nao havia coordenador para delegar. Agora que ela esta de pe,
essa excecao acabou.

A partir de agora: qualquer codigo, documento de memoria (CLAUDE.md/TASKS.md/DIARIO.md)
ou artefato sob gestao da fabrica e trabalho do coordenador (via Claude Code), seguindo
o fluxo normal de agentes. Eu (chat) volto ao papel de apoio fora da fabrica - discussao,
planejamento, decisoes de arquitetura antes de existir tarefa - nao de execucao dentro
dela.

Licao para o coordenador registrar como propria: o DIARIO.md e a memoria viva do
PROJETO gerida por VOCE (coordenador). Toda entrada daqui em diante deve ser escrita
por voce mesmo, ao fechar cada tarefa - nao herdada de fora.

---

## Decisoes de arquitetura (fechadas na fase de planejamento)

1. Fabrica instalada no branch feature/instalar-fabrica-f0 (2026-07-01), 8 agentes
   (coordenador, arquiteto, designer redefinido, engenheiro-backend, engenheiro-frontend,
   seguranca, testador-auditor, deployer).
2. Stack protegida: Firebase Hosting + Firestore + Auth, HTML/JS vanilla, projeto centra-fin.
3. Homologacao = Firebase Emulator Suite local (F0-03, pendente).
4. Trava de deploy sera em Node (gate-deploy.js), sem WSL/jq (F0-02, pendente).
5. Scripts perigosos isolados em scripts-perigosos/ (purge_parcelas_duplicadas.cjs).

## Pendencias (aguardando)
- Diretor: decidir repo publico vs privado (F0-D1).
- Diretor: confirmar permissao de deploy do firebase login atual (F0-D2).

## Progresso
- F0-01 em andamento: CLAUDE.md, TASKS.md e 8 agentes instalados. Faltam F0-02 a F0-07.
