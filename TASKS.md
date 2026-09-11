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

## Em curso — Contas a Pagar: alcance dos filtros e janela de carga (2026-09-10/11)

> Contexto medido: `/ContasAPagar` tem **51.881 docs**. Detalhe completo no DIARIO.md,
> entrada "2026-09-11 — PONTO DE RETOMADA".

### OS-CP-FILTROS-BASE-COMPLETA-01 — branch `feature/cp-filtros-base`, commit `da6b1c0`
- [x] Arquiteto — desenho, 9 vetos de implementação
- [x] Designer — spec de diff visual (`design/specs/cp-filtros-base-completa.md`)
- [x] Engenheiro — Parte 1 (união das opções) + Parte 2 (guarda do Período)
- [x] Designer — auditoria de tokens (3 achados, os 3 corrigidos)
- [x] Testador-auditor — **APROVADO** (emulador real; `getCountFromServer` e perfil `consulta` validados)
- [!] **Validação visual do diretor** — preview channel no ar, expira **2026-09-17**:
      `https://centra-fin--cp-filtros-base-ugukuksq.web.app/gerenciador_contas_pagar_desktop/code.html`
- [ ] Flag `READY_cp-filtros-base` (só após a validação visual)
- [ ] Deployer — push + deploy **somente hosting**

### OS-CP-JANELA-6M-01 — branch `feature/cp-janela-6m` (empilhado sobre `da6b1c0`)
- [x] Arquiteto — desenho, 19 vetos, orçamento de performance T1–T7
- [x] Designer — spec de diff visual (`design/specs/cp-janela-6m.md`)
- [x] Decisões do diretor: janela em `data_vencimento` · limiar 35.000 / 7 meses com isenção da
      janela padrão · ordenação de Status por severidade
- [ ] **Engenheiro-frontend** — Partes 1, 2 e 3. Briefing consolidado:
      `docs/os-briefings/OS-CP-JANELA-6M-01.md` (**próximo passo ao retomar**)
- [ ] Designer — auditoria de tokens
- [ ] Testador-auditor — com as medições T1–T7
- [ ] Validação visual do diretor → flag `READY_cp-janela-6m` → deployer

### Backlog gerado por estas duas OS (aguarda decisão do diretor)
- [ ] Trava de deploy furada: aceita qualquer uma das 18 flags `READY_*` acumuladas, logo
      **nunca bloqueia**; e não cobre `firebase hosting:channel:deploy`
- [ ] `CP_Base_Despesas` corrompido (42/110 com mojibake) — bloqueia a dimensão Despesa
- [ ] Variantes `hover:`/`focus:` sem cobertura no tema escuro (sistêmico, 6+ pontos)
- [ ] Camada 2 — resultados cross-mês por query dirigida (índice composto)
- [ ] `snap.docChanges()` em vez de reconstruir `cacheRegistros` a cada entrega
- [ ] `atualizarKPIs` — 2x `normalize('NFD')` por linha em todo render
- [ ] Blindar "Ações em Massa" para não-super_admin (addDoc sequencial por lançamento)
- [ ] Furos remanescentes da guarda de Período (F5, "Carregar mês anterior", "Limpar" em voo)
- [ ] 1 doc com `data_vencimento` `"0026-09"`
- [ ] `scripts/check-syntax.cjs` não valida `<script type="module">`

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
