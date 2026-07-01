#!/usr/bin/env node
/**
 * gate-deploy.js — trava de deploy do CentraFin (F0-02)
 *
 * Ligado ao agente `deployer` via hook PreToolUse:Bash. Recebe no stdin o JSON
 * padrão do hook do Claude Code (contém tool_input.command). Intercepta comandos
 * de push/deploy e SÓ libera se existir ao menos uma flag .claude/state/READY_*.
 *
 * Reforço extra: se o comando envolver `firestore:rules`, exige uma flag cujo
 * nome contenha "regra" (convenção: READY_regra-<feature> criada pelo
 * testador-auditor após rodar os testes no emulador — DoD do CLAUDE.md).
 *
 * Saída: exit 0 = libera. exit 2 = bloqueia (Claude Code interpreta como veto).
 */

const fs = require('fs');
const path = require('path');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (e) {
    return '';
  }
}

function main() {
  const raw = readStdin();
  let command = '';
  try {
    const parsed = JSON.parse(raw);
    command = (parsed.tool_input && parsed.tool_input.command) || '';
  } catch (e) {
    // Se não vier JSON válido, não arrisca — deixa passar (falha aberta seria pior
    // bloquear tudo por engano de parsing; mas comandos de deploy real sempre vêm
    // via hook estruturado do Claude Code, então isso é caso de borda raro).
    command = raw || '';
  }

  const DEPLOY_PATTERN = /(git\s+push|firebase\s+deploy|kubectl\s+apply|docker(\s+\S+)*\s+push)/i;
  const RULES_PATTERN = /firestore:rules/i;

  if (!DEPLOY_PATTERN.test(command)) {
    process.exit(0); // não é comando de deploy/push — libera
  }

  const stateDir = path.join(process.cwd(), '.claude', 'state');
  let readyFlags = [];
  try {
    readyFlags = fs.readdirSync(stateDir).filter((f) => f.startsWith('READY_'));
  } catch (e) {
    readyFlags = [];
  }

  if (readyFlags.length === 0) {
    process.stderr.write(
      'BLOQUEADO: nenhuma validacao do testador-auditor encontrada. Deploy negado.\n' +
      'Crie .claude/state/READY_<feature> via testador-auditor antes de fazer deploy.\n'
    );
    process.exit(2);
  }

  if (RULES_PATTERN.test(command)) {
    const hasRegraFlag = readyFlags.some((f) => /regra/i.test(f));
    if (!hasRegraFlag) {
      process.stderr.write(
        'BLOQUEADO: comando envolve firestore:rules mas nao ha flag READY_regra-*.\n' +
        'Mudanca de regra exige teste no emulador antes do deploy (DoD, CLAUDE.md).\n'
      );
      process.exit(2);
    }
  }

  process.exit(0); // libera
}

main();
