# CentraFin — Backlog (TASKS.md)

Fonte de ordem do coordenador. Cada tarefa passa pelo fluxo:
(arquiteto →) engenheiro → [seguranca →] testador-auditor → [validação visual do diretor, se UI] → flag READY_<feature> → deployer.

Legenda: [ ] a fazer · [~] em andamento · [x] feito · [!] bloqueado (aguarda diretor)

---

## Fase F0 — Substrato seguro (ANTES de qualquer feature)

> Objetivo: tornar real a premissa "validar antes, deploy cirúrgico depois". Nenhuma
> tarefa F0 toca o que está em produção; tudo é inerte ou roda em emulador local.

> **F0 FECHADO em 2026-07-01.** Todos os 7 itens implementados e testados na pratica
> (trava de deploy provada bloqueando/liberando; emulador provado isolado; suite de
> regras 4/4; check de sintaxe pego erro real; check de segredo pego caso real).

- [x] F0-01 — Instalar a fábrica no repo: copiar `.claude/agents/` (**8 agentes**, incluindo
      `designer.md` redefinido — spec de diff antes / auditoria de tokens depois),
      `CLAUDE.md`, `DIARIO.md`, `TASKS.md`, e criar `design/specs/` (pasta de saída do
      designer). **PRESERVAR** `.claude/settings.json` e `settings.local.json` existentes
      (merge, nunca sobrescrever). Arquivos inertes — não tocam produção.
- [x] F0-02 — Reescrever a trava de deploy em **Node** (`scripts/gate-deploy.js`, sem
      WSL/jq), ligada ao deployer via hook PreToolUse:Bash. Deve interceptar
      `firebase deploy` e `git push` e **bloquear** se não existir `.claude/state/READY_*`.
      Reforço extra: bloquear deploy que inclua `firestore:rules` se não houver flag de
      regra correspondente.
- [x] F0-03 — Subir **Firebase Emulator Suite** (Firestore + Rules) local. Documentar
      comando de start. Smoke test provando isolamento (emulador NÃO fala com `centra-fin`).
- [x] F0-04 — Suíte mínima de testes de `firestore.rules` no emulador, cobrindo casos reais:
      admin escreve; `consulta` é bloqueado na escrita; `hasMenu('contas_receber')` libera
      `Lancamentos` e sem o menu é negado. **Este é o portão de qualquer mudança de regra.**
- [x] F0-05 — Script de check de **sintaxe** dos módulos alterados (parse JS/HTML), usado
      pelo testador-auditor como parte do DoD.
- [x] F0-06 — Check **anti-segredo pré-push** (tripwire): aborta se `.env`/chave de serviço
      rastreada. Confirmar cobertura do `.gitignore`. (Repo é público.)
- [x] F0-07 — Isolar os **scripts perigosos** (`clean_lancamentos.mjs`, `tmp_admin_clean.js`,
      `tmp_limpar_faturamento.js`, `tmp_varrer_limpar.js`, `populate.mjs`) em pasta marcada
      (ex.: `scripts-perigosos/`) com cabeçalho de aviso. Execução só com aprovação explícita
      do diretor e, de preferência, contra o emulador. Não altera comportamento de deploy
      (já estão no `ignore` do hosting).

## Backlog aberto — levantado durante OS já concluídas

- [x] ~~**"Responsável não informado" nos lançamentos do CP**~~ — **RESOLVIDO em 2026-09-30 pela
      OS-CP-PACOTE-ONDAS-01 (Frente 1), e a HIPÓTESE QUE ESTAVA AQUI ERA FALSA.** Ficou
      registrado porque a lição vale mais que o conserto: este item afirmava que a causa era
      match sensível a caixa/acento/espaço. A medição na base real derrubou isso, e
      **normalizar os dois lados corrige ZERO lançamento**. A causa real é outra: o CC gravado
      é `COMERCIAL` e **não existe área com esse nome** (existem `COMERCIAL THOMAS`,
      `COMERCIAL TEAM TAILOR` e `COMERCIAL SOULAN`). Era área faltando e ambígua, não erro de
      grafia. Prova: 49.984 lançamentos resolvem gestor ANTES e 49.984 DEPOIS, zero divergentes.
      O que a frente entregou de real: o MESMO campo era comparado com DUAS réguas
      (`_cpChaveFiltro` no filtro, `.trim()` puro no lookup), e agora há lookup único
      `_cpResponsavelDoReg` nos três consumidores, mais a distinção entre "área não cadastrada"
      e "não informado". **O conserto dos 83 lançamentos segue PENDENTE** (corrigir o cadastro
      do fornecedor #1950 para COMERCIAL SOULAN, com dry-run), e está na seção da
      OS-CP-PACOTE-ONDAS-01 mais abaixo.
- [ ] **Faturamento sem janela de carga** (levantado na OS-CP-ULTIMO-MES-01, 2026-09-08).
      `contas_a_receber_desktop/code.html:4319` faz `onSnapshot(collection(db,"Lancamentos"))`
      sem `where`/`orderBy`/`limit` — carrega a coleção inteira a cada abertura. É a mesma
      classe de problema que travava o Contas a Pagar antes da janela de 2026-06-18 (10k+ docs).
      Não foi tocado por estar fora do escopo daquela OS. Piora conforme a base cresce.
- [ ] **`scripts/check-syntax.cjs` quebrado** (pendência antiga, reconfirmada em 2026-09-08).
      Grava bloco `<script type="module">` com extensão `.cjs`, então `node --check` rejeita
      qualquer `import` — reprova identicamente arquivos intocados do HEAD. É um gate cego do
      DoD hoje; as OS recentes contornam extraindo para `.mjs`.

## Escalações / decisões aguardando o diretor
- [!] F0-D1 — Repositório **público vs privado**: regras, modelo de dados e scripts de
      limpeza ficam visíveis no público. Decidir. (Não bloqueia F0-01..F0-06.)
- [!] F0-D2 — Confirmar que o `firebase login` do desktop tem permissão de deploy no projeto
      `centra-fin` (pré-condição do deployer; já em uso hoje, só registrar).

## Contas a Pagar — refatoração em Ondas (frente corrente)

> Base medida: `/ContasAPagar` com **51.181 docs**. Mapa do que já existe e do que a
> refatoração pretende: `docs/MAPA-CP-REFATORACAO.md`. Tela viva:
> `gerenciador_contas_pagar_desktop/code.html` (confirmada pelo `sidebar.js`).

- [x] **Onda 1 — OS-CP-CORRIGE-NOMES-01 (corrigir nomes).** CONCLUÍDA e em produção.
      Correção IN-PLACE por dicionário dos 197 campos com U+FFFD ("�"), zero doc apagado
      ou criado. Validada pelo diretor. Mergeada em `main` (`7d93e37`). DIARIO 2026-09-24.
- [x] **Onda Layout — OS-CP-LAYOUT-01.** CONCLUÍDA e em produção. Colunas, KPIs, ordenação
      por clique nas 7 colunas e remoção do travessão de toda a UI do CP. Validada pelo
      diretor no preview channel, deploy `--only hosting`. Mergeada em `main` (`47e4b59`).
      DIARIO 2026-09-24.
- [x] **Onda 2 — OS-CP-CLASSIFICACAO-IMPORT-01 (classificação na importação). CONCLUÍDA e em
      produção (2026-09-29).** Validada na tela pelo diretor no preview, publicada com
      `--only hosting` (rules não mudaram), mergeada em `main` em fast-forward (`dcbb6db..c567f0a`,
      13 commits) e com push feito. Produção **idêntica byte a byte** ao branch validado
      (SHA256 `9e4c4bb7...`, HTTP 200); dependências da página servindo 200. Flag
      `READY_cp-classificacao-import` criada após o gate verde e a validação, e removida após o
      push. Preview channel removido. Gate de classificação obrigatória de favorecidos SEM TIPO no
      ETL: modal exige Tipo+CC+Empresa por favorecido (dedup por código), antes do commit; admin
      grava direto em /Fornecedores, não-admin vai pra esteira; empresa só no cadastro (Desenho B,
      override por lote fica na Onda 3). Segurança APROVADO, tester PASSA.
      Detalhe no DIARIO.md (entrada 2026-09-29 + entradas 2026-09-25 e 2026-09-27).
      - [x] Fase 1 (arquiteto/Plan) — investigação + esclarecimento da empresa (Desenho B)
      - [x] Decisões do diretor: Desenho B · trava por código distinto · admin direto/não-admin esteira
      - [x] Fase 2 — implementação (coordenador, dono do code.html)
      - [x] Segurança (veto) — APROVADO; Tester (independente) — PASSA reforços 1-5
      - [x] **Ajuste Tipo = Cliente** (2026-09-27, commit `0a2b37c`, +79/-14). Cliente não usa a
            segmentação interna de CC: o cliente É o próprio centro de custo. O campo CC some do
            modal quando o tipo é Cliente e o `centro_custo` gravado passa a ser o nome canônico do
            cliente (CAIXA ALTA, idêntico a `/Fornecedores.nome`, confirmado pelo diretor). Empresa
            segue obrigatória; os outros 3 tipos não mudaram. Fecha a Lacuna 4 do
            `docs/MAPA-CP-REFATORACAO.md`. Segurança APROVADO sem veto; tester PASSA 26/26.
      - [x] **Validação visual do diretor no preview** (2026-09-29, incluiu o caso Cliente)
      - [x] Deploy produção `--only hosting` → merge em `main` → flag `READY` real → push → registro
      - [ ] Decisões abertas do diretor: gatilho só-por-tipo (recomendado manter); remover código
            morto da quarentena antiga em OS de higiene separada; ciência de que `tipo_entidade` =
            Cliente joga a despesa para o bucket CUSTOS do DRE (`dre_gerencial_desktop/code.html:329-331`)
## OS-CP-PACOTE-ONDAS-01 — pacote único, CONCLUÍDO E EM PRODUÇÃO (2026-09-30)

> Branch `feature/cp-pacote-ondas`, 4 commits, merge fast-forward em `main`
> (`0ca791e..1e1b4d0`), deploy com **hosting + firestore.rules** no mesmo comando (as regras
> eram pré-condição da aba nova). Validado na tela pelo diretor em preview channel ANTES de
> qualquer publicação. Segurança VETOU 6 achados e depois LEVANTOU o veto. Detalhe completo no
> `DIARIO.md` (entrada 2026-09-30) e o desenho em
> `docs/os-briefings/OS-CP-PACOTE-ONDAS-01-DESENHO.md`.
>
> Provas: tester independente 210 casos verdes · rules no emulador 40 casos verdes · prova
> numérica dos cards PASSA · prova numérica do DRE PASSA · prova da Frente 1 PASSA (49.984
> antes e depois, zero divergentes).

- [x] **1. Onda 3 — empresa na importação.** CONCLUÍDA. Seletor obrigatório com as 4 empresas
      válidas, com trava em DUAS camadas (botão desabilitado e guarda de abstenção no caminho da
      escrita, mais uma segunda guarda ANTES da remoção do lote anterior). Carimbo por lote
      gravando `empresa` + o rastro `empresa_origem`, e só em quem não herdaria do cadastro.
      Coluna Detalhe/Obs virou Empresa, ordenável, reusando o filtro multiselect que já existia;
      o badge do nº do título migrou para a coluna Código e **nada saiu da tela** (`observacao`
      já era renderizado duas vezes). Guarda na cascata do master por `empresa_origem`, com
      ausência do campo cascateando, logo no-op para os 51.181 docs existentes.
- [x] **2. Onda 4 — grupos de despesa, SEM o DRE.** CONCLUÍDA. Estrutura de 3 níveis
      (`CP_Grupos_Contas` → `CP_Contas_Despesa` → `CP_Tipos_Despesa`) ancorada na **despesa do
      lançamento** (100% de cobertura e zero corrupção), e não no `CP_Base_Despesas` (27,7% de
      cobertura, por truncamento do ERP em 30 caracteres). Vínculo por ID, nunca por nome.
      Herança **derivada em runtime**, sem gravar no lançamento. Sub-aba nova "Grupos de Contas"
      no `master.html` com vínculo em massa e ordenação por volume. Coluna "Grupo de Contas" no
      CP com filtro multiselect e ordenação. Exclusão BLOQUEADA enquanto houver filho.
      Catálogo dos 104 tipos em `Metadados/CP_Catalogo_Categorias`: **os 15 maiores cobrem 91,6%
      da base**.
- [x] **3. Cards Custo Interno / Custo Externo.** CONCLUÍDA. Card OPEX REMOVIDO: ele somava só
      Interno CLT + Externo e deixava o PJ de fora, então **R$ 4.717.986,32, 9,7% do custo, não
      apareciam em card nenhum**. Entraram Interno (CLT+PJ), Externo, Cliente (mantido) e Sem
      Classificação. `MAP_CLASS_FILTRO` e `classSetExpandido` ficaram INTOCADOS.
- [x] **4. Caso Catarina — responsável "não informado".** PARCIAL, e por um bom motivo: a causa
      registrada estava **falsificada pelos dados**. Não era grafia; o CC `COMERCIAL` simplesmente
      não existe como área. A normalização entrou (lookup único nos 3 consumidores, fim das duas
      réguas para o mesmo campo) e a tela passou a dizer "área não cadastrada" em vez de "não
      informado". **O conserto dos 83 lançamentos ficou PENDENTE** (item abaixo). O sub-item de
      "padronizar a grafia dos CCs" foi RETIRADO pelo diretor: sem grafia divergente, seria
      escrita em massa regravando o valor que o doc já tem.
- [x] **5. Vazamento da natureza gravada.** CONCLUÍDA, e não estava no pedido original. A empresa
      derivada em runtime era persistida em fatura nova via `_cpProjetarRecorrencia` (que espalha
      o objeto do cache para dentro do `writeBatch`), e o DRE congelava o valor. **Medido: ZERO
      faturas afetadas** — o caminho existia e nunca havia disparado. Corrigido com Map paralelo
      e acessor único.
- [x] **6. Corte do módulo legado `contas_a_pagar_desktop`.** CONCLUÍDO e **REVERSÍVEL**: a pasta
      entrou no `ignore` do hosting e **deixou de ser publicada**, mas o arquivo NÃO foi apagado e
      segue no git e no disco. Motivo: era um SEGUNDO ESCRITOR de `ContasAPagar` sem o carimbo de
      empresa e sem a trava de abstenção. Verificação exigida pelo diretor antes de cortar
      (`scripts/verificar-uso-legado-cp.cjs`): sem link, sem rota, fora do cadastro de menus,
      fora do redirect; e nos dados, **0 dos 18 usuários têm a chave de menu legada** e **0
      lançamentos** têm as assinaturas de escrita dele. Limite declarado: a verificação não prova
      ausência de acesso por LEITURA, que não deixa rastro. Produção conferida: 404.

### PENDÊNCIA que sobrou deste pacote

- [!] **Corrigir o cadastro do fornecedor #1950 (CATARINA APARECIDA DOS SANTOS)** para a área
      **COMERCIAL SOULAN** (gestor Marcelo Medeiros), decisão já tomada pelo diretor. Corrigir
      esse 1 cadastro e deixar a cascata rodar resolve os 83 lançamentos e o futuro de uma vez.
      É escrita em produção, então vai com **DRY-RUN que o diretor aprova antes de aplicar**.
      Valor envolvido: R$ 7.077,91. É o ÚNICO CC órfão da base (varredura completa feita).

### FRENTE SEGUINTE já recortada — DRE por grupo de despesa

- [ ] **DRE Gerencial por grupo de despesa.** Ficou FORA do pacote por decisão do diretor: o DRE
      por grupo só mostra algo DEPOIS que ele agrupar as despesas na tela nova, que acabou de
      entrar em produção. Construir junto obrigaria a validar o relatório duas vezes, uma com a
      dimensão vazia e outra com dado real.
- [!] **DECISÃO PENDENTE DO DIRETOR que abre essa frente: o bucket do Cliente no DRE.** Hoje o
      bucket vem de QUEM RECEBEU o dinheiro (`bucketDespesa` em
      `dre_gerencial_desktop/code.html:329-331`: tipo Cliente → CUSTOS, todo o resto → G&A). Com
      grupos, poderia vir DO QUE FOI GASTO. Em 2026 são R$ 25.474.325,89 em CUSTOS contra
      R$ 23.419.841,17 em G&A. **Em qualquer cenário o EBITDA é idêntico ao centavo**; o que muda
      é a fronteira Custo × Despesa, logo o Lucro Bruto e a margem bruta. As três opções e a
      recomendação (cenário misto: `bucket_dre` nasce nulo e cada grupo migra sozinho quando o
      diretor classificar) estão em
      `docs/os-briefings/OS-CP-PACOTE-ONDAS-01-DESENHO.md`, seção 5.6 e pergunta Q7.
      O campo `bucket_dre` **já existe** nos docs de `CP_Grupos_Contas`, nasce `null` e **ainda
      não tem controle na tela**, exatamente para essa decisão não ser tomada por acidente.

### OS do CP encerradas sem entrega (superadas)
- [x] ~~OS-CP-FILTROS-BASE-COMPLETA-01~~ e ~~OS-CP-JANELA-6M-01~~ — **ENCERRADAS, superadas
      pela carga por recência + cache próprio em IndexedDB** (OS-CP-CARGA-RECENCIA-01), que já
      está em produção e resolveu o problema de carga que as duas atacavam. Os branches
      `feature/cp-filtros-base` e `feature/cp-janela-6m` ficam como histórico; as specs
      (`design/specs/`) e os briefings (`docs/os-briefings/`) permanecem para consulta.

### Backlog técnico do CP (gerado pelas OS anteriores, aguarda priorização)
- [x] ~~Gate de deploy não cobre `firebase hosting:channel:deploy`~~ — **ITEM ESTAVA ERRADO e foi
      RESOLVIDO em 2026-09-27 (OS-CP-GATE-PREVIEW-01).** O gate SEMPRE cobriu o comando de canal de
      preview; o problema real era o oposto, ele cobria DEMAIS e criava impasse circular (a flag
      `READY_*` só nasce depois da validação do diretor, mas é o preview que permite validar).
      Corrigido: preview passa sem flag, produção e push continuam exigindo. No caminho, a auditoria
      adversarial achou **7 furos** no gate, incluindo dois ANTIGOS (continuação de linha do
      PowerShell deixava passar produção e push sem interceptação alguma), `firebase hosting:clone`,
      `firebase hosting:disable` e `git send-pack`, todos fechados. Criada a suíte permanente
      `scripts/test-gate-deploy.cjs` (108 casos, com prova de mutação) que o gate nunca teve desde a
      fase F0. Detalhe no DIARIO.md, entrada 2026-09-27.
- [ ] **Gate: modo permissivo em `main`/`master`.** Fora de branch de frente não há slug para casar,
      então QUALQUER flag `READY_*` libera qualquer deploy a partir de `main`. O agente segurança
      elevou a prioridade disso na auditoria de 2026-09-27, com evidência viva: o repositório
      vizinho `CENTRA DASH` está em `main` com **25 flags `READY_*` acumuladas**. Recomendação dele:
      fazer esta OS ANTES de mais endurecimento da exceção de preview.
- [x] ~~**Gate: verbos de produção ainda não interceptados**~~ — **RESOLVIDO em 2026-09-29 pela
      OS-GATE-DESTRUTIVO-01**, em `main` (commit `71bf6cf`). O gate passou a barrar SEMPRE, sem flag de
      bypass e sem exceção: `firestore:delete` (o pior, apagaria coleções de produção),
      `firestore:databases:delete`, `database:remove`, `hosting:disable`, `gcloud firestore
      import/export` e `databases delete`, push forçado (`-f`, `--force-with-lease`, refspec `+`,
      `send-pack`), `reset --hard`, `clean -f`, `branch -D` e remoção recursiva de arquivo (bash,
      PowerShell e cmd). Sete rodadas de auditoria adversarial, 499 strings sondadas, segurança
      VETOU 4 vezes e levantou o veto na 7ª declarando que assina produção. Suíte de 117 → **599
      casos**, mais 577 em sondas do coordenador (total 1176). Zero rotas de escape acidentais.
      Detalhe e os 7 residuais aceitos no `DIARIO.md` (entrada 2026-09-29) e no cabeçalho do
      `scripts/gate-deploy.js`. **Ficaram para OS separada, por decisão do diretor:** os 6 verbos git
      fora da lista (`push --mirror`, `push --delete`, `push origin :branch`, `checkout -f`,
      `filter-branch --force`, `update-ref -d`) e o `curl -X DELETE` ao `firestore.googleapis.com`.
- [ ] **Gate: contrato de entrada do hook.** Payload vazio ou malformado libera (o padrão não casa).
      Sugestão do segurança: bloquear quando o stdin não é vazio e o parse falha ou
      `tool_input.command` não existe. Residual aceito hoje, não urgente.
- [ ] **Gate: os 6 verbos git e o REST DELETE do Firestore** (fatiado da OS-GATE-DESTRUTIVO-01 por
      decisão do diretor em 2026-09-29, escopo fechado): `git push --mirror`, `git push --delete`,
      `git push origin :branch`, `git checkout -f`, `git filter-branch --force`, `git update-ref -d`,
      e `curl -X DELETE` ao `firestore.googleapis.com` (a rota REST do Hosting já é coberta pelo
      `DEPLOY_PATTERN`; a do Firestore ficou descoberta). **Qualquer edição no gate roda
      `node scripts/test-gate-deploy.cjs` ANTES do commit** — é pré-condição escrita no cabeçalho do
      arquivo, porque o risco dominante do gate virou a OSCILAÇÃO (apertar um lado abre o outro, e foi
      a suíte que pegou cada inversão nas 7 rodadas).
- [ ] `CP_Base_Despesas` com mojibake **"Ã/Â" do `seeder_excel`** (ex.: `ASSESSORIA CONTÃBIL`
      = CONTÁBIL), 42/110 docs. É corrupção DIFERENTE do "�" da Onda 1 e é reversível por
      re-decodificação. Ficou fora da Onda 1 por escopo.
- [ ] 7 cadastros com `NEAT` em centro de custo
- [ ] Variantes `hover:`/`focus:` sem cobertura no tema escuro (sistêmico, 6+ pontos)
- [ ] Camada 2 — resultados cross-mês por query dirigida (índice composto)
- [ ] `snap.docChanges()` em vez de reconstruir `cacheRegistros` a cada entrega
- [ ] `atualizarKPIs` — 2x `normalize('NFD')` por linha em todo render
- [ ] Blindar "Ações em Massa" para não-super_admin (addDoc sequencial por lançamento)
- [ ] Furos remanescentes da guarda de Período (F5, "Carregar mês anterior", "Limpar" em voo)
- [ ] 1 doc com `data_vencimento` `"0026-09"`
- [ ] **`entidade` bruto vs `centro_custo` canônico no mesmo documento** (achado do tester em
      2026-09-27). `gerenciador_contas_pagar_desktop/code.html:4565` grava `entidade` com o nome sem
      trim nem caixa alta, enquanto `/Fornecedores.nome` e o `centro_custo` ficam canônicos. Para
      favorecido do tipo Cliente isso expõe duas grafias do mesmo nome na mesma linha da tela.
- [ ] **Guarda de catálogos aborta lote 100% Cliente** (`code.html:3859`). A importação é abortada
      quando `AreasContasPagar` não carregou, mas um lote em que todos os pendentes seriam Cliente
      não precisa do catálogo de CC. Falso bloqueio, direção segura.
- [ ] Higiene do travessão em COMENTÁRIOS de código do CP (passe opcional; a UI já está limpa)

---

## Próximas fases (resumo — detalhar quando F0 fechar)
- F1 — Primeira tarefa cirúrgica real em módulo de produção, exercitando o fluxo completo
  ponta a ponta (engenheiro → emulador → auditor → validação visual → deploy) como prova
  de que a esteira protege a produção.
- (demais features priorizadas pelo diretor a partir daí)

---

## Como uma feature fecha no CentraFin (referência rápida)
1. Branch `feature/<nome>`.
2. Se mexe em regra/dado: arquiteto avalia; engenheiro implementa.
3. Mudou `firestore.rules`? Testes no emulador (F0-04) obrigatórios.
4. Segurança audita se a feature toca authz/dado/LGPD.
5. Testador roda DoD adaptado; se UI, **diretor valida na tela + print**.
6. Só então testador cria `.claude/state/READY_<nome>`.
7. Deployer faz `firebase deploy` (trava confere a flag).
8. Coordenador registra no DIARIO.md.
