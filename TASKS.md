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

- [ ] **"Responsável não informado" nos lançamentos do CP** (perdida numa queda de sessão,
      re-registrada em 2026-09-24). Centro de custo aparece com Responsável "não informado"
      mesmo com o gestor JÁ cadastrado na tela de Áreas & Gestores.
      **Caso concreto:** CATARINA APARECIDA DOS SANTOS, centro de custo "Comercial",
      responsável cadastrado e mesmo assim exibido como "não informado".
      **Hipótese a investigar quando a frente abrir:** o Responsável não é campo gravado, é
      DERIVADO em runtime do cruzamento `lancamento.centro_custo` × `AreasContasPagar.nome`
      → `gestor_nome`. O match é EXATO e sensível a caixa/acento/espaço interno: o mapa é
      chaveado por `String(data.nome).trim()` (`gerenciador_contas_pagar_desktop/code.html:1257-1261`)
      e consultado por `String(r.centro_custo).trim()` (`code.html:2539` e `code.html:5151`),
      sem `toUpperCase`/`normalize('NFD')` dos dois lados. Qualquer divergência de grafia
      entre o CC gravado no lançamento e o nome cadastrado na Área faz o lookup falhar em
      silêncio e cair no marcador "não informado".
      **Status: NO RADAR.** Entra em frente própria DEPOIS das Ondas 2/3/4. Não iniciar agora.
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
- [ ] **Onda 3 — empresa na importação.** FUTURA. A coluna Detalhe/Obs vira "Empresa".
- [ ] **Onda 4 — grupos de despesa / DRE.** FUTURA. Coluna "Grupo de Contas".

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
- [ ] **Gate: verbos de produção ainda não interceptados** (levantado em 2026-09-27, aguarda a lista
      final do tester): verificar `hosting:sites:delete`, `functions:delete`, `firestore:delete`,
      `target:apply` e afins. `hosting:clone`, `hosting:disable` e `git send-pack` já entraram.
- [ ] **Gate: contrato de entrada do hook.** Payload vazio ou malformado libera (o padrão não casa).
      Sugestão do segurança: bloquear quando o stdin não é vazio e o parse falha ou
      `tool_input.command` não existe. Residual aceito hoje, não urgente.
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
