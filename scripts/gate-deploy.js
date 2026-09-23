#!/usr/bin/env node
/**
 * gate-deploy.js — trava de deploy do CentraFin
 *
 * Amarrado ao Claude Code por um hook PreToolUse (matcher Bash|PowerShell) em
 * .claude/settings.json. Recebe no stdin o JSON padrao do hook (contem
 * tool_input.command). Intercepta comandos de push/deploy e SO libera quando as
 * duas pre-condicoes estao satisfeitas:
 *
 *   1. Working tree LIMPO (git status --porcelain vazio). Deploy nao pode ficar
 *      a frente do git (incidente registrado na Parte B do CLAUDE.md).
 *   2. Existe uma flag .claude/state/READY_* CORRESPONDENTE a frente que esta
 *      sendo publicada. A correspondencia e por BRANCH: o nome da flag tem que
 *      casar com o slug do branch atual (feature/<slug> -> READY_*<slug>*), para
 *      que flags READY_* antigas acumuladas NAO liberem um deploy de outra
 *      frente. A flag e o registro deliberado de que o gate de qualidade (lint +
 *      teste de firestore.rules no emulador quando as rules mudam) e a validacao
 *      do diretor na tela aconteceram; ela nasce DEPOIS deles e e removida logo
 *      apos o push (fluxo descrito na secao 8 do CLAUDE.md).
 *
 * A responsabilidade da flag e do FLUXO de deploy (coordenador cria apos o gate
 * verde e a validacao do diretor); nenhum agente a cria por conta propria.
 *
 * Cobre: git push (inclusive "git -C <dir> push"), firebase deploy e
 * hosting:channel:deploy, chamada REST ao firebasehosting.googleapis.com,
 * gh workflow/release, kubectl apply, docker push. Roda tanto para a ferramenta
 * Bash quanto para a PowerShell (o deploy pode sair por qualquer uma das duas).
 * Falha fechada: erro inesperado do proprio gate BLOQUEIA.
 *
 * Limite conhecido (residual documentado): o hook so ve a string do comando de
 * topo; um verbo escondido dentro de um arquivo (bash deploy.sh, node deploy.js)
 * nao e interceptado. Deploy do CentraFin e sempre firebase CLI + git direto.
 *
 * Saida: exit 0 = libera. exit 2 = bloqueia (Claude Code interpreta como veto e
 * devolve o stderr ao modelo).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (e) {
    return '';
  }
}

// Normaliza um texto para slug comparavel: minusculo, nao-alfanumerico vira '-',
// bordas aparadas. "READY_OS-GATE-DEPLOY-01" -> "os-gate-deploy-01".
function normalizeSlug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Deriva o slug da frente a partir do branch. Remove o prefixo de tipo
// (feature/, fix/, hotfix/, chore/...) ficando so com a parte descritiva.
function branchSlug(branch) {
  const tail = String(branch).split('/').pop() || '';
  return normalizeSlug(tail);
}

function main() {
  const raw = readStdin();
  let command = '';
  try {
    const parsed = JSON.parse(raw);
    command = (parsed.tool_input && parsed.tool_input.command) || '';
  } catch (e) {
    // Se nao vier JSON valido, usa o texto cru. Comandos de deploy reais sempre
    // chegam via hook estruturado; isso e caso de borda.
    command = raw || '';
  }

  // Remove continuacoes de linha (barra + quebra) para o padrao nao ser furado
  // por "firebase \<nl> deploy".
  command = command.replace(/\\\r?\n/g, ' ');

  // Verbos de publicacao interceptados. Os pares verbo/objeto aceitam qualquer
  // coisa no meio (mesma linha), para nao serem furados por flags intermediarias
  // como "git -C <dir> push" ou "git --work-tree=... push". O par firebase+deploy
  // ja cobre "firebase deploy" e "firebase hosting:channel:deploy".
  const DEPLOY_PATTERN = /(\bgit\b[^\n]*\bpush\b|\bfirebase\b[^\n]*\bdeploy\b|firebasehosting\.googleapis\.com|\bgh\b[^\n]*\b(?:workflow|release)\b|\bkubectl\b[^\n]*\bapply\b|\bdocker\b[^\n]*\bpush\b)/i;
  const RULES_PATTERN = /firestore:rules/i;

  if (!DEPLOY_PATTERN.test(command)) {
    process.exit(0); // nao e comando de deploy/push — libera
  }

  // ── 1. Working tree limpo ────────────────────────────────────────────────
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8', timeout: 5000 }).trim();
    if (status.length > 0) {
      process.stderr.write(
        'BLOQUEADO: working tree sujo, ha alteracoes nao commitadas.\n' +
        'Commite as alteracoes antes de fazer deploy/push.\n' +
        'Arquivos pendentes:\n' + status + '\n'
      );
      process.exit(2);
    }
  } catch (e) {
    // git indisponivel ou timeout: nao bloqueia por este criterio (falha aberta).
  }

  // ── 2. Flag READY_* correspondente ao branch ─────────────────────────────
  const stateDir = path.join(process.cwd(), '.claude', 'state');
  let readyFlags = [];
  try {
    readyFlags = fs.readdirSync(stateDir).filter((f) => f.startsWith('READY_'));
  } catch (e) {
    readyFlags = [];
  }

  if (readyFlags.length === 0) {
    process.stderr.write(
      'BLOQUEADO: nenhuma flag .claude/state/READY_* encontrada. Deploy negado.\n' +
      'Crie a flag da frente apos o gate verde e a validacao do diretor.\n'
    );
    process.exit(2);
  }

  // Descobre o branch atual para exigir a flag correspondente.
  let branch = '';
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', timeout: 5000 }).trim();
  } catch (e) {
    branch = '';
  }

  const slug = branchSlug(branch);
  const isMainish = /^(main|master)$/i.test(branch);

  const flagSlugs = readyFlags.map((f) => normalizeSlug(f.replace(/^READY_/, '')));

  if (isMainish) {
    // main/master: nao ha slug de frente para casar. Mantem modo permissivo
    // (exige apenas que exista alguma flag, ja garantido acima) com AVISO.
    // Apertar o deploy a partir de main e pendencia registrada para OS separada
    // (ver DIARIO.md / secao 8 do CLAUDE.md).
    process.stderr.write(
      'AVISO: deploy a partir de "' + branch + '"; correspondencia estrita de flag ' +
      'nao se aplica em main/master, liberando com base na existencia de flag READY_*.\n'
    );
  } else if (branch && slug.length >= 3) {
    // Branch de frente: exige uma flag tao especifica quanto o branch, nome
    // igual ou que CONTENHA o slug do branch (cobre READY_os-<slug>-01). NAO
    // aceita o contrario (flag curta tipo "gate" liberando branch "gate-deploy"),
    // para a correspondencia nao afrouxar entre sub-frentes de nome parecido.
    const matched = flagSlugs.some((fs2) => fs2 === slug || fs2.includes(slug));
    if (!matched) {
      process.stderr.write(
        'BLOQUEADO: nenhuma flag READY_* corresponde ao branch "' + branch + '".\n' +
        'Esperado uma flag cujo nome contenha "' + slug + '" ' +
        '(ex.: .claude/state/READY_' + slug + ').\n' +
        'Flags READY_* acumuladas de outras frentes NAO liberam este deploy.\n'
      );
      process.exit(2);
    }
  } else {
    // Branch indetectavel (rev-parse falhou), HEAD destacado ou slug curto demais:
    // nao da para verificar a correspondencia. BLOQUEIA (fail-closed) em vez de
    // cair no modo permissivo, para nao reabrir a fraqueza das flags acumuladas.
    process.stderr.write(
      'BLOQUEADO: nao foi possivel determinar o branch (' + (branch || 'desconhecido') + ') ' +
      'para casar a flag READY_* da frente. Deploy negado (fail-closed).\n'
    );
    process.exit(2);
  }

  // Reforco informativo para deploy de firestore.rules (nao bloqueia por si so:
  // a flag da frente ja representa o gate verde, que inclui o teste de rules no
  // emulador quando as rules mudam, secao 8 do CLAUDE.md).
  if (RULES_PATTERN.test(command)) {
    process.stderr.write(
      'NOTA: deploy inclui firestore:rules. Confirme que o teste de rules no ' +
      'emulador rodou antes desta publicacao (pre-condicao da flag).\n'
    );
  }

  process.exit(0); // libera
}

// Fail-closed: qualquer erro inesperado no gate BLOQUEIA (exit 2), nunca deixa
// o deploy passar por um crash. process.exit() nao lanca, entao o fluxo normal
// nao cai aqui; so excecoes de verdade caem.
try {
  main();
} catch (e) {
  process.stderr.write(
    'BLOQUEADO: erro inesperado no gate de deploy, negando por seguranca (fail-closed): ' +
    ((e && e.message) || String(e)) + '\n'
  );
  process.exit(2);
}
