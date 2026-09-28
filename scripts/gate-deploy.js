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
 * Cobre: git push (inclusive "git -C <dir> push"), firebase deploy,
 * hosting:clone (promove canal para live sem usar a palavra "deploy"), chamada
 * REST ao firebasehosting.googleapis.com, gh workflow/release, kubectl apply,
 * docker push. Roda tanto para a ferramenta Bash quanto para a PowerShell (o
 * deploy pode sair por qualquer uma das duas).
 * Falha fechada: erro inesperado do proprio gate BLOQUEIA.
 *
 * EXCECAO DO PREVIEW (OS-CP-GATE-PREVIEW-01, decisao do diretor 2026-09-27):
 * "firebase hosting:channel:deploy <canal>" publica num PREVIEW CHANNEL, que NAO
 * toca producao e e justamente o ambiente onde o diretor valida. Exigir a flag
 * READY_* nele criava impasse circular: a flag so nasce DEPOIS da validacao, mas
 * e o preview que permite validar. Preview passa SEM flag, mantendo a exigencia
 * de working tree limpo (o que e servido tem que ter vindo de um commit, para a
 * investigacao pos-fato continuar possivel). Producao (firebase deploy) e push
 * seguem exigindo flag correspondente ao branch.
 * A excecao e fechada por tres travas: (1) o comando e avaliado por SEGMENTO
 * (&&, ||, ;, |, nova linha), entao "firebase deploy && firebase
 * hosting:channel:deploy x" NAO se disfarca de preview; (2) canal chamado "live"
 * nao conta como preview; (3) hosting:clone entrou na lista de verbos barrados,
 * porque seria o caminho natural para promover um canal a producao driblando a
 * excecao.
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

  // Remove continuacoes de linha para o padrao nao ser furado por
  // "firebase \<nl> deploy". Cobre os DOIS estilos, porque o hook roda tanto
  // para Bash (barra invertida) quanto para PowerShell (acento grave): sem o
  // segundo caso, "firebase `<nl> deploy" nao era interceptado por ninguem
  // (furo antigo, achado pelo tester em 2026-09-27).
  command = command.replace(/[\\`]\r?\n/g, ' ');

  // Verbos de publicacao interceptados. Os pares verbo/objeto aceitam qualquer
  // coisa no meio (mesma linha), para nao serem furados por flags intermediarias
  // como "git -C <dir> push" ou "git --work-tree=... push". O par firebase+deploy
  // ja cobre "firebase deploy" e "firebase hosting:channel:deploy".
  const DEPLOY_PATTERN = /(\bgit\b[^\n]*\bpush\b|\bfirebase\b[^\n]*\bdeploy\b|\bfirebase\b[^\n]*\bhosting:clone\b|firebasehosting\.googleapis\.com|\bgh\b[^\n]*\b(?:workflow|release)\b|\bkubectl\b[^\n]*\bapply\b|\bdocker\b[^\n]*\bpush\b)/i;
  const RULES_PATTERN = /firestore:rules/i;

  if (!DEPLOY_PATTERN.test(command)) {
    process.exit(0); // nao e comando de deploy/push — libera
  }

  // ── Excecao do preview channel (ver cabecalho) ───────────────────────────
  // Avaliacao por SEGMENTO: um comando composto so e tratado como preview se
  // TODOS os segmentos que disparam o gate forem preview. Assim
  // "firebase deploy && firebase hosting:channel:deploy x" cai no gate cheio.
  //
  // A DETECCAO (DEPLOY_PATTERN acima) roda sempre no comando INTEIRO; a
  // segmentacao decide apenas se a EXCECAO se aplica. Por isso quebrar em mais
  // pedacos so pode APERTAR: se a quebra fizer nenhum segmento casar o padrao,
  // `segmentosDeploy` fica vazio e `soPreview` e false, caindo no gate cheio.
  // Separadores cobertos, todos achados pelo tester em 2026-09-27:
  // `&&` `||` `;` `|` nova linha, o `&` SIMPLES (background no bash) e as
  // fronteiras de substituicao de comando `$(` `)` e acento grave, que
  // escondiam um "firebase deploy" dentro de um segmento de preview.
  const segmentos = command.split(/&&|&|\|\||\||;|\r?\n|\$\(|\)|`/);
  const segmentosDeploy = segmentos.filter((s) => DEPLOY_PATTERN.test(s));
  const ehSegmentoPreview = (s) => {
    if (!/\bfirebase\b/i.test(s)) return false;
    if (!/\bhosting:channel:deploy\b/i.test(s)) return false;
    // Canal "live" nao e preview: seria publicar em producao. As aspas sao
    // removidas antes do teste porque "live" entre aspas driblava o casamento,
    // e o teste procura o token em qualquer posicao depois do verbo (o nome do
    // canal pode vir depois de flags como --expires 7d).
    const semAspas = s.replace(/["']/g, '');
    const depoisDoVerbo = semAspas.split(/hosting:channel:deploy/i).slice(1).join(' ');
    // Conservador de proposito: um canal como "live-teste" tambem cai aqui e e
    // barrado. Falso positivo custa trocar o nome do canal; falso negativo
    // custaria publicar em producao pela porta do preview.
    if (/\blive\b/i.test(depoisDoVerbo)) return false;
    // Qualquer outro verbo de publicacao no mesmo segmento desqualifica.
    if (/\bfirebase\b[^\n]*\bhosting:clone\b/i.test(s)) return false;
    if (/\bgit\b[^\n]*\bpush\b/i.test(s)) return false;
    return true;
  };
  const soPreview = segmentosDeploy.length > 0 && segmentosDeploy.every(ehSegmentoPreview);

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

  // ── 1b. Preview channel: libera SEM flag (ver EXCECAO DO PREVIEW) ────────
  // Chega aqui so com working tree limpo (checagem 1 acima), entao o que vai
  // para o canal de preview corresponde a um commit.
  if (soPreview) {
    process.stderr.write(
      'NOTA: preview channel (firebase hosting:channel:deploy). Nao toca producao, ' +
      'liberado sem flag READY_*. Producao e push continuam exigindo a flag da frente.\n'
    );
    process.exit(0);
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
