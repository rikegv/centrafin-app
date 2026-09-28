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
 * A excecao e fechada por tres travas:
 * (1) REGRA UNICA sobre o comando INTEIRO: retiradas todas as ocorrencias do
 *     verbo "hosting:channel:deploy", se o que sobra ainda casa DEPLOY_PATTERN,
 *     entao ha publicacao de verdade junto do preview e a excecao nao se aplica.
 *     Nao ha segmentacao: tentar avaliar por segmento foi o que abriu furo (ver
 *     o comentario longo na implementacao), porque verbo partido pelo separador
 *     some de todos os segmentos.
 * (2) Canal chamado "live" nao conta como preview (aspas sao removidas antes do
 *     teste; conservador, um canal "live-teste" tambem e barrado).
 * (3) A liberacao do preview EXIGE que a conferencia de working tree limpo tenha
 *     sido bem-sucedida. No caminho do preview essa e a unica trava que sobra, e
 *     uma trava que falha aberta sozinha nao e trava.
 * hosting:clone tambem entrou na lista de verbos barrados do gate, porque promove
 * um canal a producao sem usar a palavra "deploy" e seria o caminho natural para
 * driblar a excecao. Antes desta frente ele nao era interceptado por ninguem.
 *
 * As travas 1 a 4 nasceram de uma auditoria adversarial (agente seguranca) e de
 * uma suite de teste (agente tester) que juntas acharam 7 furos na primeira
 * versao da excecao, incluindo dois furos ANTIGOS do gate. Regressao coberta por
 * scripts/test-gate-deploy.cjs.
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
  const DEPLOY_PATTERN = /(\bgit\b[^\n]*\b(?:push|send-pack)\b|\bfirebase\b[^\n]*\bdeploy\b|\bfirebase\b[^\n]*\bhosting:clone\b|firebasehosting\.googleapis\.com|\bgh\b[^\n]*\b(?:workflow|release)\b|\bkubectl\b[^\n]*\bapply\b|\bdocker\b[^\n]*\bpush\b)/i;
  const RULES_PATTERN = /firestore:rules/i;

  if (!DEPLOY_PATTERN.test(command)) {
    process.exit(0); // nao e comando de deploy/push — libera
  }

  // ── Excecao do preview channel (ver cabecalho) ───────────────────────────
  // REGRA UNICA, aplicada ao comando INTEIRO: retire do comando TODAS as
  // ocorrencias do verbo de preview "hosting:channel:deploy"; se o que sobrar
  // ainda casar DEPLOY_PATTERN, entao o comando carrega uma publicacao de
  // verdade alem do preview, e a excecao NAO se aplica.
  //
  // Historia desta linha, porque ela ja foi complicada e voltou a ser simples:
  // a primeira versao avaliava o comando por SEGMENTO (&&, ;, |, e depois &,
  // $( ), acento grave) e exigia que todo segmento de deploy fosse preview. A
  // premissa era "quebrar em mais pedacos so pode apertar". A premissa e FALSA,
  // e o tester provou: a segmentacao nao decide so a excecao, ela tambem decide
  // ONDE a deteccao olha. Um verbo PARTIDO pelo separador
  // ("firebase $(echo deploy)") sumia de todos os segmentos, nenhum casava o
  // padrao, e o segmento de preview levava o comando inteiro para a excecao.
  // Duas dessas strings eram bloqueadas ANTES de eu acrescentar separadores:
  // a tentativa de fechar buraco abriu outro.
  // Sem segmentacao esta classe inteira deixa de existir, porque a deteccao
  // volta a olhar o comando inteiro, exatamente como o gate sempre fez.
  const semOVerboDePreview = command.replace(/hosting:channel:deploy/gi, ' ');
  const temPreview = /\bfirebase\b/i.test(command) && /\bhosting:channel:deploy\b/i.test(command);
  // Canal "live" nao e preview: seria publicar em producao. As aspas sao
  // removidas antes do teste porque "live" entre aspas driblava o casamento, e o
  // token e procurado em qualquer posicao depois do verbo (o nome do canal pode
  // vir depois de flags como --expires 7d). Conservador de proposito: um canal
  // "live-teste" tambem cai aqui. Falso positivo custa trocar o nome do canal;
  // falso negativo custaria publicar em producao pela porta do preview.
  const depoisDoVerbo = command
    .replace(/["']/g, '')
    .split(/hosting:channel:deploy/i)
    .slice(1)
    .join(' ');
  const soPreview =
    temPreview &&
    !/\blive\b/i.test(depoisDoVerbo) &&
    !DEPLOY_PATTERN.test(semOVerboDePreview);

  // ── 1. Working tree limpo ────────────────────────────────────────────────
  // `arvoreConferida` registra se este criterio pode ser confiado. Para o gate
  // cheio ele continua falhando ABERTO (a flag ainda protege), mas a liberacao do
  // preview passou a EXIGIR a conferencia bem-sucedida: no caminho do preview a
  // arvore limpa e a unica trava que sobra, e uma trava fail-open sozinha nao e
  // trava (veto do seguranca, 2026-09-27: com cwd fora de repositorio git o
  // preview era liberado direto).
  let arvoreConferida = false;
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8', timeout: 5000 }).trim();
    arvoreConferida = true;
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
  if (soPreview && arvoreConferida) {
    process.stderr.write(
      'NOTA: preview channel (firebase hosting:channel:deploy). Nao toca producao, ' +
      'liberado sem flag READY_*. Producao e push continuam exigindo a flag da frente.\n'
    );
    process.exit(0);
  }
  if (soPreview && !arvoreConferida) {
    process.stderr.write(
      'AVISO: preview channel, mas nao foi possivel conferir se o working tree esta ' +
      'limpo (git indisponivel, timeout ou fora de repositorio). A excecao do preview ' +
      'NAO se aplica sem essa conferencia; caindo na exigencia de flag READY_*.\n'
    );
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
