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

## Escalações / decisões aguardando o diretor
- [!] F0-D1 — Repositório **público vs privado**: regras, modelo de dados e scripts de
      limpeza ficam visíveis no público. Decidir. (Não bloqueia F0-01..F0-06.)
- [!] F0-D2 — Confirmar que o `firebase login` do desktop tem permissão de deploy no projeto
      `centra-fin` (pré-condição do deployer; já em uso hoje, só registrar).

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
