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
- [ ] **Onda 2 — OS-CP-CLASSIFICACAO-IMPORT-01 (classificação na importação). PRÓXIMA.**
      Destrinchar OPEX em Interno (CLT+PJ) × Externo, dependente do tipo preenchido na
      importação. Branch `feature/cp-classificacao-import` criado e VAZIO (nenhum commit,
      nenhuma investigação rodada). Ao abrir: Fase 1 é investigação de alcance, e inclui o
      esclarecimento de como "empresa no cadastro" convive com "empresa na importação"
      da Onda 3.
- [ ] **Onda 3 — empresa na importação.** FUTURA. A coluna Detalhe/Obs vira "Empresa".
- [ ] **Onda 4 — grupos de despesa / DRE.** FUTURA. Coluna "Grupo de Contas".

### OS do CP encerradas sem entrega (superadas)
- [x] ~~OS-CP-FILTROS-BASE-COMPLETA-01~~ e ~~OS-CP-JANELA-6M-01~~ — **ENCERRADAS, superadas
      pela carga por recência + cache próprio em IndexedDB** (OS-CP-CARGA-RECENCIA-01), que já
      está em produção e resolveu o problema de carga que as duas atacavam. Os branches
      `feature/cp-filtros-base` e `feature/cp-janela-6m` ficam como histórico; as specs
      (`design/specs/`) e os briefings (`docs/os-briefings/`) permanecem para consulta.

### Backlog técnico do CP (gerado pelas OS anteriores, aguarda priorização)
- [ ] Gate de deploy não cobre `firebase hosting:channel:deploy`. (O acúmulo de flags
      `READY_*` já foi resolvido em `53a22da`: `.claude/state/` virou estado local.)
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
