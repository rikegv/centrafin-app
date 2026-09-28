/**
 * test-gate-deploy.cjs — teste permanente da trava de deploy (scripts/gate-deploy.js)
 * ---------------------------------------------------------------------------------
 * O gate e um hook PreToolUse: le no stdin {"tool_input":{"command":"..."}} e
 * decide por EXIT CODE (0 libera, 2 bloqueia). Este teste exercita o gate DE
 * VERDADE, por subprocesso, sem reimplementar nada da logica dele (reimplementar
 * codificaria a mesma suposicao do autor e nao pegaria mal-entendido de requisito).
 *
 * As duas pre-condicoes do gate (working tree limpo E flag .claude/state/READY_*
 * casando com o slug do branch) dependem de process.cwd(). Por isso o teste monta
 * REPOSITORIOS GIT DE MENTIRA em pasta temporaria do sistema e roda o gate com
 * cwd apontando para eles. O repositorio real NAO e tocado: nada e commitado,
 * nada e sujo, nenhuma flag READY_* de verdade e criada ou apagada. No fim, o
 * teste CONFERE que o repo real continua no mesmo estado (arvore + flags).
 *
 * ATENCAO ao editar: os verbos de deploy vivem DENTRO deste arquivo. Nunca
 * coloque um verbo de deploy na linha de comando ao rodar o teste, senao o
 * proprio hook intercepta o comando de teste.
 *
 * USO:
 *   node scripts/test-gate-deploy.cjs
 *
 * Exit 0 = todos os casos passaram. Exit 1 = algum caso falhou.
 *
 * HISTORICO da excecao de preview, cada rodada virou grupo de regressao aqui:
 *   29d95d2 abriu a excecao. O tester achou 5 furos por sonda adversarial e o
 *           commit 9e35c83 os fechou  ->  GRUPO F.
 *   O seguranca VETOU e provou mais 2 classes; 5f7bf7d as fechou  ->  GRUPO G.
 *   O tester provou que a SEGMENTACAO era a causa de um furo novo (verbo partido
 *           pelo separador sumia de todos os segmentos); 9017410 removeu a
 *           segmentacao inteira, deixando UMA regra sobre o comando todo, e
 *           acrescentou send-pack a deteccao  ->  GRUPO H.
 * Versao do gate conferida por ultimo: 9017410.
 *
 * RESIDUAIS ACEITOS, caracterizados no GRUPO I: tres formas de indirecao de shell
 * que a leitura TEXTUAL do comando nao alcanca. Ficam registradas como caso
 * rotulado, com o veredito ATUAL, para que qualquer mudanca futura apareca no
 * teste. NAO sao o comportamento desejado; sao o limite conhecido da tecnica.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const GATE = path.resolve(__dirname, 'gate-deploy.js');
const REPO_REAL = path.resolve(__dirname, '..');

// ── Comandos de teste (strings, nunca executadas) ──────────────────────────
const FB = 'firebase';
const VERBO = 'hosting:channel:deploy';   // o verbo que a regra unica retira
const PREVIEW = FB + ' ' + VERBO;
const PROD = FB + ' deploy';
const CLONE = FB + ' hosting:clone';
const DISABLE = FB + ' hosting:disable';   // derruba o hosting de producao

let falhas = 0;
let total = 0;
const sandboxes = [];

// ── Helpers de git no sandbox (identidade local, sem rede, sem hooks) ──────
function git(cwd, args) {
  return execFileSync(
    'git',
    ['-c', 'user.name=gate-tester', '-c', 'user.email=gate-tester@local',
     '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
}

/**
 * Monta um repo git de mentira em pasta temporaria do sistema.
 *   branch   : nome do branch a criar ('feature/gate-deploy-teste', 'main', ...)
 *   flags    : nomes de arquivos a criar em .claude/state/ (ex.: ['READY_x'])
 *   sujo     : true = deixa uma alteracao nao commitada (tracked modificado)
 *   destacado: true = deixa o HEAD destacado depois do commit
 *   semCommit: true = repo sem nenhum commit (branch indetectavel por rev-parse)
 *   semGit   : true = pasta que NAO e repositorio git (git status falha)
 */
function criarSandbox(rotulo, opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-deploy-test-'));
  sandboxes.push(dir);
  if (opts.semGit) {
    // Nada de git init: `git status --porcelain` falha, entao o gate nao consegue
    // CONFERIR a arvore. E a condicao do veto do seguranca (5f7bf7d).
    const stateDir0 = path.join(dir, '.claude', 'state');
    fs.mkdirSync(stateDir0, { recursive: true });
    for (const f of opts.flags || []) fs.writeFileSync(path.join(stateDir0, f), 'flag de teste\n');
    return { rotulo, dir, opts };
  }
  git(dir, ['init', '-q']);

  if (opts.semCommit) {
    // Sem commit: rev-parse --abbrev-ref HEAD falha (HEAD nao nascido).
    // Tudo ignorado via .git/info/exclude para a arvore continuar LIMPA e o
    // teste isolar exatamente o criterio "branch indetectavel".
    fs.writeFileSync(path.join(dir, '.git', 'info', 'exclude'), '*\n');
  } else {
    git(dir, ['checkout', '-q', '-b', opts.branch]);
    fs.writeFileSync(path.join(dir, '.gitignore'), '.claude/\n');
    fs.writeFileSync(path.join(dir, 'app.txt'), 'v1\n');
    git(dir, ['add', '.gitignore', 'app.txt']);
    git(dir, ['commit', '-q', '-m', 'base do sandbox']);
    if (opts.destacado) git(dir, ['checkout', '-q', '--detach']);
    if (opts.sujo) fs.writeFileSync(path.join(dir, 'app.txt'), 'v2 alterado sem commit\n');
  }

  const stateDir = path.join(dir, '.claude', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  for (const f of opts.flags || []) fs.writeFileSync(path.join(stateDir, f), 'flag de teste\n');

  return { rotulo, dir, opts };
}

function statusDe(dir) {
  try { return git(dir, ['status', '--porcelain']).trim(); } catch (e) { return '(git falhou)'; }
}
function branchDe(dir) {
  try { return git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(); } catch (e) { return '(indetectavel)'; }
}

// ── Execucao do gate por subprocesso, payload igual ao do hook ─────────────
function rodarGate(comando, cwd) {
  const r = spawnSync(process.execPath, [GATE], {
    cwd,
    input: JSON.stringify({ tool_input: { command: comando } }),
    encoding: 'utf8',
  });
  return { code: r.status === null ? -1 : r.status, err: (r.stderr || '') + (r.error ? String(r.error) : '') };
}

// Mostra o comando numa linha, com a quebra de continuacao visivel (os dois
// estilos: barra invertida do bash e acento grave do PowerShell).
const legivel = (c) => c
  .replace(/([\\`])\r?\n\s*/g, '$1<nl> ')
  .replace(/\r(?!\n)/g, '<cr>')
  .replace(/[ \t]+/g, ' ');

function caso(nome, comando, sandbox, esperado, motivoEsperado) {
  total++;
  const { code, err } = rodarGate(comando, sandbox.dir);
  let ok = code === esperado;
  let nota = '';
  if (ok && motivoEsperado && !err.includes(motivoEsperado)) {
    // Exit code certo pelo motivo ERRADO conta como falha: o gate tem que
    // bloquear/liberar pela pre-condicao que o caso esta testando.
    ok = false;
    nota = ' | motivo esperado ausente: "' + motivoEsperado + '"';
  }
  if (!ok) falhas++;
  console.log(
    '  ' + (ok ? 'PASS ' : 'FALHA') +
    ' | esperado ' + esperado + ' obtido ' + String(code).padEnd(2) +
    ' | ' + nome.padEnd(46) +
    ' | ' + legivel(comando) + nota
  );
  return ok;
}

function grupo(titulo) {
  console.log('\n== ' + titulo + ' ==');
}

// ══ Estado do repositorio REAL antes de qualquer coisa ═════════════════════
function estadoRepoReal() {
  let flags = [];
  try {
    flags = fs.readdirSync(path.join(REPO_REAL, '.claude', 'state')).filter((f) => f.startsWith('READY_'));
  } catch (e) { flags = []; }
  return { status: statusDe(REPO_REAL), branch: branchDe(REPO_REAL), flags: flags.sort().join(',') };
}

function main() {
  const antes = estadoRepoReal();
  console.log('Gate sob teste : ' + GATE);
  console.log('Repo real      : branch "' + antes.branch + '", flags READY_* [' +
              (antes.flags || 'nenhuma') + '], arvore ' + (antes.status ? 'SUJA' : 'limpa'));

  // ── Sandboxes ───────────────────────────────────────────────────────────
  const BRANCH = 'feature/gate-deploy-teste';   // slug -> gate-deploy-teste
  const FLAG_DA_FRENTE = 'READY_os-gate-deploy-teste-01';  // casa com o slug
  const FLAG_OUTRA = 'READY_os-cp-outra-frente-99';        // nao casa

  const sLimpoSemFlag = criarSandbox('limpo, sem flag', { branch: BRANCH, flags: [] });
  const sLimpoComFlag = criarSandbox('limpo, flag da frente', { branch: BRANCH, flags: [FLAG_DA_FRENTE] });
  const sLimpoFlagOutra = criarSandbox('limpo, flag de outra frente', { branch: BRANCH, flags: [FLAG_OUTRA] });
  const sSujo = criarSandbox('SUJO, flag da frente', { branch: BRANCH, flags: [FLAG_DA_FRENTE], sujo: true });
  const sDestacado = criarSandbox('HEAD destacado, flag da frente', { branch: BRANCH, flags: [FLAG_DA_FRENTE], destacado: true });
  const sSemBranch = criarSandbox('branch indetectavel, flag da frente', { semCommit: true, flags: [FLAG_DA_FRENTE] });
  const sMain = criarSandbox('main, flag de outra frente', { branch: 'main', flags: [FLAG_OUTRA] });
  const sForaDeGit = criarSandbox('fora de repositorio git, sem flag', { semGit: true, flags: [] });

  // ── Guarda anti-vacuidade: os sandboxes estao no estado pretendido? ─────
  grupo('PRE-CONDICOES DOS SANDBOXES (guarda anti-vacuidade)');
  // arvore esperada: 'limpa', 'suja' ou 'sem-git' (git status nao roda).
  const esperadoSandbox = [
    [sLimpoSemFlag, 'limpa', BRANCH, 0],
    [sLimpoComFlag, 'limpa', BRANCH, 1],
    [sLimpoFlagOutra, 'limpa', BRANCH, 1],
    [sSujo, 'suja', BRANCH, 1],
    [sDestacado, 'limpa', 'HEAD', 1],
    [sSemBranch, 'limpa', '(indetectavel)', 1],
    [sMain, 'limpa', 'main', 1],
    [sForaDeGit, 'sem-git', '(indetectavel)', 0],
  ];
  for (const [sb, devArvore, devBranch, devFlags] of esperadoSandbox) {
    total++;
    const st = statusDe(sb.dir);
    const arvore = st === '(git falhou)' ? 'sem-git' : (st ? 'suja' : 'limpa');
    const br = branchDe(sb.dir);
    let nFlags = 0;
    try { nFlags = fs.readdirSync(path.join(sb.dir, '.claude', 'state')).filter((f) => f.startsWith('READY_')).length; } catch (e) { nFlags = 0; }
    const ok = arvore === devArvore && br === devBranch && nFlags === devFlags;
    if (!ok) falhas++;
    console.log('  ' + (ok ? 'PASS ' : 'FALHA') + ' | ' + sb.rotulo.padEnd(38) +
      ' | arvore ' + arvore.padEnd(7) + ' (esperado ' + devArvore.padEnd(7) + ')' +
      ' | branch ' + br.padEnd(26) + ' (esperado ' + devBranch + ')' +
      ' | flags ' + nFlags + ' (esperado ' + devFlags + ')');
  }

  // ══ A. LIBERA ════════════════════════════════════════════════════════════
  grupo('A. LIBERA (sandbox: limpo, SEM flag)');
  caso('nao e comando de deploy', 'npm run lint', sLimpoSemFlag, 0);
  caso('preview simples', PREVIEW + ' cp-onda2-classif', sLimpoSemFlag, 0, 'preview channel');
  caso('preview com flags', PREVIEW + ' cp-onda2-classif --expires 7d', sLimpoSemFlag, 0, 'preview channel');
  caso('dois previews compostos', PREVIEW + ' a && ' + PREVIEW + ' b', sLimpoSemFlag, 0, 'preview channel');

  // ══ B. BLOQUEIA SEM FLAG ════════════════════════════════════════════════
  grupo('B. BLOQUEIA SEM FLAG (sandbox: limpo, SEM flag)');
  const SEM_FLAG = 'nenhuma flag';
  caso('producao pura', PROD, sLimpoSemFlag, 2, SEM_FLAG);
  caso('producao only hosting', PROD + ' --only hosting', sLimpoSemFlag, 2, SEM_FLAG);
  caso('push simples', 'git push origin HEAD', sLimpoSemFlag, 2, SEM_FLAG);
  caso('push com -C (flag intermediaria)', 'git -C /c/tmp/repo push origin HEAD', sLimpoSemFlag, 2, SEM_FLAG);
  caso('gh workflow run', 'gh workflow run publicar.yml', sLimpoSemFlag, 2, SEM_FLAG);
  caso('gh release create', 'gh release create v1.2.3', sLimpoSemFlag, 2, SEM_FLAG);
  caso('kubectl apply', 'kubectl apply -f manifesto.yaml', sLimpoSemFlag, 2, SEM_FLAG);
  caso('docker push', 'docker push registry/centrafin:latest', sLimpoSemFlag, 2, SEM_FLAG);
  caso('REST ao hosting API', 'curl -X POST https://firebasehosting.googleapis.com/v1beta1/sites/centra-fin/releases', sLimpoSemFlag, 2, SEM_FLAG);
  caso('hosting:clone (verbo novo)', CLONE + ' centra-fin:cp-onda2 centra-fin:live', sLimpoSemFlag, 2, SEM_FLAG);

  // ══ C. BLOQUEIA O DISFARCE DE PREVIEW ═══════════════════════════════════
  // Todos aqui rodam no sandbox SEM flag, onde o preview sozinho LIBERA (grupo
  // A). Se qualquer um destes liberar, a excecao do preview estaria servindo de
  // disfarce para producao. O motivo exigido ("nenhuma flag") prova que o
  // comando caiu no gate CHEIO, e nao no atalho do preview.
  grupo('C. BLOQUEIA O DISFARCE (sandbox: limpo, SEM flag)');
  caso('producao ANTES do preview', PROD + ' --only hosting && ' + PREVIEW + ' x', sLimpoSemFlag, 2, SEM_FLAG);
  caso('producao DEPOIS do preview', PREVIEW + ' x && ' + PROD, sLimpoSemFlag, 2, SEM_FLAG);
  caso('push no mesmo comando do preview', PREVIEW + ' x ; git push origin HEAD', sLimpoSemFlag, 2, SEM_FLAG);
  caso('hosting:clone junto do preview', PREVIEW + ' x && ' + CLONE + ' a:b c:live', sLimpoSemFlag, 2, SEM_FLAG);
  caso('preview no canal live', PREVIEW + ' live', sLimpoSemFlag, 2, SEM_FLAG);
  caso('producao quebrada por continuacao', FB + ' \\\n  deploy --only hosting', sLimpoSemFlag, 2, SEM_FLAG);
  caso('preview via pipe + producao', PREVIEW + ' x | tee log.txt && ' + PROD, sLimpoSemFlag, 2, SEM_FLAG);

  // ══ D. PRE-CONDICOES (arvore e flag) ════════════════════════════════════
  grupo('D. PRE-CONDICOES: arvore limpa e flag do branch');
  const SUJO = 'working tree sujo';
  caso('arvore SUJA bloqueia producao', PROD + ' --only hosting', sSujo, 2, SUJO);
  caso('arvore SUJA bloqueia PREVIEW', PREVIEW + ' cp-onda2-classif', sSujo, 2, SUJO);
  caso('arvore SUJA bloqueia push', 'git push origin HEAD', sSujo, 2, SUJO);
  caso('flag do branch LIBERA producao', PROD + ' --only hosting', sLimpoComFlag, 0);
  caso('flag do branch LIBERA push', 'git push origin HEAD', sLimpoComFlag, 0);
  caso('flag do branch + rules: libera com nota', PROD + ' --only firestore:rules', sLimpoComFlag, 0, 'firestore:rules');
  caso('flag de OUTRA frente bloqueia producao', PROD + ' --only hosting', sLimpoFlagOutra, 2, 'corresponde ao branch');
  caso('flag de OUTRA frente bloqueia push', 'git push origin HEAD', sLimpoFlagOutra, 2, 'corresponde ao branch');
  caso('sem nenhuma flag bloqueia producao', PROD, sLimpoSemFlag, 2, SEM_FLAG);

  // ══ E. FAIL-CLOSED ══════════════════════════════════════════════════════
  grupo('E. FAIL-CLOSED (branch nao verificavel)');
  caso('HEAD destacado bloqueia producao', PROD + ' --only hosting', sDestacado, 2);
  caso('HEAD destacado bloqueia push', 'git push origin HEAD', sDestacado, 2);
  caso('branch indetectavel bloqueia producao', PROD + ' --only hosting', sSemBranch, 2, 'fail-closed');
  // Caracterizacao, NAO aprovacao: em main/master o gate e permissivo de
  // proposito (pendencia registrada no cabecalho do gate e na secao 8 do
  // CLAUDE.md). O caso existe para que uma mudanca futura nesse comportamento
  // apareca aqui, e nao em producao.
  caso('main: qualquer flag libera (pendencia conhecida)', PROD + ' --only hosting', sMain, 0, 'AVISO');

  // ══ F. FUROS FECHADOS (regressao) ═══════════════════════════════════════
  // Os cinco furos que a sonda adversarial do tester achou na excecao de preview
  // (2026-09-27) e que o commit 9e35c83 fechou. Cada um liberava producao ou push
  // em arvore limpa SEM flag. Rodam no sandbox limpo SEM flag, a unica condicao
  // em que o furo aparecia. O motivo exigido ("nenhuma flag") prova que caem no
  // gate CHEIO, e nao no atalho do preview.
  // NOTA de prova por mutacao (tester, 2026-09-27): depois da regra geral de
  // 5f7bf7d, o splitter de segmentos virou defesa REDUNDANTE. Tirar o `&` ou as
  // fronteiras `$( )` da quebra, sozinho, nao muda nenhum veredito aqui, porque
  // a regra geral bloqueia o mesmo ataque. F5, F6 e F7 so morrem quando as DUAS
  // defesas caem juntas. A trava que sustenta esta classe hoje e a regra geral.
  grupo('F. FUROS FECHADOS, REGRESSAO (sandbox: limpo, SEM flag)');
  const BT = '`'; // acento grave: continuacao de linha e substituicao no PowerShell
  caso('F1 canal live entre aspas duplas', PREVIEW + ' "live"', sLimpoSemFlag, 2, SEM_FLAG);
  caso('F2 canal live entre aspas simples', PREVIEW + " 'live'", sLimpoSemFlag, 2, SEM_FLAG);
  caso('F3 canal live DEPOIS de flag', PREVIEW + ' --expires 7d live', sLimpoSemFlag, 2, SEM_FLAG);
  caso('F4 canal live com aspas parciais', PREVIEW + ' li"ve"', sLimpoSemFlag, 2, SEM_FLAG);
  caso('F5 separador & simples (background)', PREVIEW + ' x & ' + PROD + ' --only hosting', sLimpoSemFlag, 2, SEM_FLAG);
  caso('F6 subshell $( ) no segmento de preview', PREVIEW + ' x --token $(' + PROD + ')', sLimpoSemFlag, 2, SEM_FLAG);
  caso('F7 subshell de acento grave', PREVIEW + ' x --token ' + BT + PROD + BT, sLimpoSemFlag, 2, SEM_FLAG);
  caso('F8 continuacao PowerShell, producao', FB + ' ' + BT + '\n  deploy --only hosting', sLimpoSemFlag, 2, SEM_FLAG);
  caso('F9 continuacao PowerShell, push', 'git ' + BT + '\n  push origin HEAD', sLimpoSemFlag, 2, SEM_FLAG);
  // Caracterizacao, NAO acidente: a guarda do canal live ficou CONSERVADORA de
  // proposito (decisao registrada em 9e35c83), entao um canal chamado
  // "live-teste" tambem e barrado. Falso positivo custa trocar o nome do canal;
  // falso negativo custaria publicar em producao pela porta do preview. O caso
  // existe para que afrouxar isso no futuro apareca aqui.
  caso('F10 canal live-teste barrado de proposito', PREVIEW + ' live-teste', sLimpoSemFlag, 2, SEM_FLAG);
  // Nao-regressao do LEGITIMO: a correcao nao pode ter transformado preview de
  // verdade em falso positivo, nem quebrado comando multilinha dos dois shells.
  caso('F11 preview legitimo, nome comum, LIBERA', PREVIEW + ' cp-onda2-classif', sLimpoSemFlag, 0, 'preview channel');
  caso('F12 preview multilinha bash, LIBERA', PREVIEW + ' cp-onda2 \\\n  --expires 7d', sLimpoSemFlag, 0, 'preview channel');
  caso('F13 preview multilinha PowerShell, LIBERA', PREVIEW + ' cp-onda2 ' + BT + '\n  --expires 7d', sLimpoSemFlag, 0, 'preview channel');
  caso('F14 producao com flag e subshell, LIBERA', PROD + ' --only hosting:$(cat site.txt)', sLimpoComFlag, 0);
  caso('F15 producao com flag e contin. PS, LIBERA', FB + ' ' + BT + '\n  deploy --only hosting', sLimpoComFlag, 0);
  // Defesa em profundidade: um segmento UNICO que contem preview e tambem push
  // (ou hosting:clone) e desqualificado como preview pela lista de
  // desqualificadores. Os dois casos abaixo existem para essa lista nao cair sem
  // ninguem notar. ATENCAO: a mesma forma com "firebase deploy" no lugar do push
  // LIBERA hoje, porque producao nao esta na lista. E o gap H2 do cabecalho.
  caso('F16 segmento unico com preview e push', PREVIEW + ' x\rgit push origin HEAD', sLimpoSemFlag, 2, SEM_FLAG);
  caso('F17 segmento unico com preview e clone', PREVIEW + ' x\r' + CLONE + ' a:b c:live', sLimpoSemFlag, 2, SEM_FLAG);

  // ══ G. VETO DO SEGURANCA, FECHADO EM 5f7bf7d (regressao) ════════════════
  // Duas defesas novas, ambas achadas por auditoria adversarial:
  //  (i) desqualificacao do segmento por REGRA GERAL: tirado do segmento o
  //      trecho "hosting:channel:deploy", se sobrar qualquer match de
  //      DEPLOY_PATTERN o segmento nao e preview. Fecha a classe inteira
  //      "segmento carrega producao", inclusive com separador nao previsto.
  // (ii) o caminho do preview passou a EXIGIR a conferencia da arvore. Antes,
  //      fora de repositorio git a checagem falhava aberta e o preview era
  //      liberado com a unica trava que ele tem desligada.
  grupo('G. VETO DO SEGURANCA, FECHADO (sandbox: limpo, SEM flag)');
  caso('G1 process substitution < <( ) com preview', PREVIEW + ' t < <(' + PROD + ')', sLimpoSemFlag, 2, SEM_FLAG);
  caso('G2 segmento unico com preview e PRODUCAO', PREVIEW + ' x\r' + PROD + ' --only hosting', sLimpoSemFlag, 2, SEM_FLAG);
  caso('G3 preview e prod unidos por contin. bash', PREVIEW + ' x \\\n' + PROD, sLimpoSemFlag, 2, SEM_FLAG);
  caso('G4 preview e prod unidos por contin. PS', PREVIEW + ' x ' + BT + '\n' + PROD, sLimpoSemFlag, 2, SEM_FLAG);
  caso('G5 eval juntando preview e prod', 'eval "' + PREVIEW + ' x"$\'\\n\'"' + PROD + '"', sLimpoSemFlag, 2, SEM_FLAG);
  caso('G6 canal live por ANSI-C quoting', PREVIEW + " $'live'", sLimpoSemFlag, 2, SEM_FLAG);
  caso('G7 REST do hosting dentro do preview', PREVIEW + ' x --token $(curl https://firebasehosting.googleapis.com/x)', sLimpoSemFlag, 2, SEM_FLAG);
  // (ii) fora de repositorio git: preview NAO pode se liberar sozinho.
  caso('G8 fora de repo git, preview BLOQUEIA', PREVIEW + ' cp-onda2-classif', sForaDeGit, 2, 'NAO se aplica sem essa conferencia');
  caso('G9 fora de repo git, producao BLOQUEIA', PROD + ' --only hosting', sForaDeGit, 2, SEM_FLAG);
  caso('G10 fora de repo git, push BLOQUEIA', 'git push origin HEAD', sForaDeGit, 2, SEM_FLAG);

  // ══ H. SEGMENTACAO REMOVIDA, REGRA UNICA (9017410) ══════════════════════
  // H1 foi o furo que a propria correcao anterior abriu: com avaliacao por
  // SEGMENTO, um verbo PARTIDO pelo separador ("git $(echo push)") sumia de
  // todos os segmentos, nenhum casava o padrao, e o segmento de preview levava o
  // comando inteiro para a excecao. Tres variantes publicavam em producao ou
  // faziam push, sem flag, em arvore limpa. 9017410 tirou a segmentacao: a
  // deteccao voltou a olhar o comando INTEIRO e a excecao virou uma regra so
  // (tirado o verbo de preview, se sobra match de DEPLOY_PATTERN, nao e preview).
  // Se alguem reintroduzir a segmentacao, os casos H1 a H7 morrem.
  grupo('H. REGRA UNICA SOB ATAQUE (sandbox: limpo, SEM flag)');
  const SUB = ' && git $(echo push) origin main';
  caso('H1 push partido por $( ) junto de preview', PREVIEW + ' x' + SUB, sLimpoSemFlag, 2, SEM_FLAG);
  caso('H2 prod partida por $( ) junto de preview', PREVIEW + ' x && firebase $(echo deploy) --only hosting', sLimpoSemFlag, 2, SEM_FLAG);
  caso('H3 prod partida por acento grave', PREVIEW + ' x && firebase ' + BT + 'echo deploy' + BT, sLimpoSemFlag, 2, SEM_FLAG);
  caso('H4 prod partida em duas substituicoes', PREVIEW + ' x && fire$(echo base) $(echo deploy)', sLimpoSemFlag, 2, SEM_FLAG);
  caso('H5 prod atras de & simples', PREVIEW + ' x & firebase $(echo deploy)', sLimpoSemFlag, 2, SEM_FLAG);
  caso('H6 prod em process substitution', PREVIEW + ' x < <(firebase $(echo deploy))', sLimpoSemFlag, 2, SEM_FLAG);
  caso('H7 push por pipe e subshell aninhado', PREVIEW + ' x | ( git $(echo push) origin main )', sLimpoSemFlag, 2, SEM_FLAG);
  // send-pack: push de plumbing que nao usa a palavra push (achado do tester).
  caso('H8 git send-pack', 'git send-pack origin refs/heads/main', sLimpoSemFlag, 2, SEM_FLAG);
  caso('H9 git -C dir send-pack', 'git -C /c/tmp/repo send-pack origin main', sLimpoSemFlag, 2, SEM_FLAG);
  caso('H10 send-pack junto de preview', PREVIEW + ' x && git send-pack origin main', sLimpoSemFlag, 2, SEM_FLAG);
  // A regra unica retira do comando TODAS as ocorrencias do verbo de preview.
  // Estes casos atacam essa retirada: o verbo aparecendo em string, caminho,
  // nome de branch ou mensagem NAO pode virar passe livre, e a retirada nao pode
  // destruir um match de publicacao que deveria existir.
  caso('H11 push para branch com nome do verbo', 'firebase --version && git push origin ' + VERBO, sLimpoSemFlag, 2, SEM_FLAG);
  caso('H12 prod com mensagem citando o verbo', PROD + ' --message "' + VERBO + '"', sLimpoSemFlag, 2, SEM_FLAG);
  caso('H13 clone com o verbo no nome do canal', CLONE + ' a:' + VERBO + ' b:live', sLimpoSemFlag, 2, SEM_FLAG);
  caso('H14 REST com o verbo na querystring', 'curl https://firebasehosting.googleapis.com/v1?x=' + VERBO, sLimpoSemFlag, 2, SEM_FLAG);
  caso('H15 git e push separados pelo verbo', 'firebase x; git ' + VERBO + ' push origin main', sLimpoSemFlag, 2, SEM_FLAG);
  caso('H16 firebase e deploy separados pelo verbo', 'firebase ' + VERBO + ' deploy --only hosting', sLimpoSemFlag, 2, SEM_FLAG);
  caso('H17 REST junto do preview', PREVIEW + ' x && curl https://firebasehosting.googleapis.com/v1', sLimpoSemFlag, 2, SEM_FLAG);
  caso('H18 kubectl apply junto do preview', PREVIEW + ' x && kubectl apply -f m.yaml', sLimpoSemFlag, 2, SEM_FLAG);
  caso('H19 docker push junto do preview', PREVIEW + ' x && docker push reg/img', sLimpoSemFlag, 2, SEM_FLAG);
  caso('H20 gh release junto do preview', PREVIEW + ' x && gh release create v1', sLimpoSemFlag, 2, SEM_FLAG);
  caso('H21 prod grudada no verbo de preview', PREVIEW + ' x && firebase deploy' + VERBO, sLimpoSemFlag, 2, SEM_FLAG);
  caso('H22 verbo de preview partido ao meio', 'firebase hosting:channel:$(echo deploy) x && ' + PROD, sLimpoSemFlag, 2, SEM_FLAG);
  caso('H23 dois previews, um deles no canal live', PREVIEW + ' a && ' + PREVIEW + ' live', sLimpoSemFlag, 2, SEM_FLAG);
  // Nao-regressao do legitimo depois de tirar a segmentacao.
  caso('H24 preview com aspas no canal, LIBERA', PREVIEW + ' "cp-onda2-classif"', sLimpoSemFlag, 0, 'preview channel');
  caso('H25 preview com projeto e token, LIBERA', PREVIEW + ' cp-onda2 --project centra-fin --token $(cat t.txt)', sLimpoSemFlag, 0, 'preview channel');
  caso('H26 comando que so CITA o verbo, LIBERA', 'grep -rn "' + VERBO + '" scripts/', sLimpoSemFlag, 0);
  // Efeito colateral BOM de tirar a segmentacao: o token live dentro de uma
  // substituicao passou a ser visto. Com segmentacao (5f7bf7d) a quebra em "$("
  // tirava o "live" do pedaco avaliado e este comando LIBERAVA.
  caso('H27 canal live dentro de substituicao', PREVIEW + ' $(echo live)', sLimpoSemFlag, 2, SEM_FLAG);
  // O verbo de preview dentro de ref, arquivo, tag ou titulo de outro verbo de
  // publicacao. Provam que a retirada do verbo nao apaga a alternativa do
  // DEPLOY_PATTERN que disparou o gate. (Foi assim que se mostrou que exigir a
  // palavra "firebase" em temPreview e defesa REDUNDANTE: sem ela, estes seis
  // comandos continuam bloqueados, porque o residuo ainda casa o padrao.)
  caso('H28 send-pack com o verbo no ref', 'git send-pack origin refs/heads/' + VERBO, sLimpoSemFlag, 2, SEM_FLAG);
  caso('H29 kubectl apply com o verbo no arquivo', 'kubectl apply -f ' + VERBO + '.yaml', sLimpoSemFlag, 2, SEM_FLAG);
  caso('H30 docker push com o verbo na tag', 'docker push reg/img:' + VERBO, sLimpoSemFlag, 2, SEM_FLAG);
  caso('H31 gh release com o verbo no titulo', 'gh release create v1 -t ' + VERBO, sLimpoSemFlag, 2, SEM_FLAG);
  // hosting:disable DERRUBA o hosting de producao sem usar a palavra deploy.
  // Entrou na deteccao em 02c5310, achado do seguranca na auditoria final, pelo
  // mesmo raciocinio do hosting:clone: acao irreversivel sobre producao que o
  // texto do comando nao denuncia.
  caso('H32 hosting:disable sozinho', DISABLE, sLimpoSemFlag, 2, SEM_FLAG);
  caso('H33 hosting:disable com --site', DISABLE + ' --site centra-fin', sLimpoSemFlag, 2, SEM_FLAG);
  caso('H34 hosting:disable junto do preview', PREVIEW + ' x && ' + DISABLE, sLimpoSemFlag, 2, SEM_FLAG);
  caso('H35 hosting:disable com -f e projeto', DISABLE + ' -f --project centra-fin', sLimpoSemFlag, 2, SEM_FLAG);
  // Nao-regressao: comando de hosting que so LE ou abre o navegador continua
  // liberando. A deteccao nao pode virar "qualquer coisa com hosting:".
  caso('H36 hosting:channel:list, LIBERA', FB + ' hosting:channel:list', sLimpoSemFlag, 0);
  caso('H37 hosting:channel:open, LIBERA', FB + ' hosting:channel:open cp-onda2', sLimpoSemFlag, 0);
  caso('H38 hosting:sites:list, LIBERA', FB + ' hosting:sites:list', sLimpoSemFlag, 0);

  // ══ I. RESIDUAIS ACEITOS, CARACTERIZACAO ROTULADA ═══════════════════════
  // ATENCAO, leia antes de "consertar" um caso deste grupo: o veredito esperado
  // aqui e o veredito ATUAL, nao o desejado. Sao tres formas de indirecao de
  // shell que a leitura TEXTUAL do comando nao alcanca. Se um destes casos
  // FALHAR, o gate provavelmente MELHOROU: confira e atualize o esperado, nunca
  // afrouxe o gate para o caso voltar a passar.
  //
  // (i) Nome do BINARIO por variavel: a deteccao nem chega a acontecer, porque
  //     "firebase" e "deploy" nunca aparecem na mesma linha. Nao tem nada a ver
  //     com a excecao de preview; e o mesmo limite ja documentado no cabecalho do
  //     gate para verbo escondido dentro de arquivo (bash deploy.sh).
  // (ii) Palavra do VERBO partida por substituicao ("git p$(echo ush)"): idem,
  //     a deteccao nao ve push nenhum, com ou sem preview no comando.
  // (iii) Canal live por indirecao: a guarda do live e textual. Residual ACEITO
  //     (avaliacao do tester, 2026-09-27): quem consegue escrever $(echo live)
  //     consegue escrever $F deploy e nem passa pela excecao, entao endurecer so
  //     esta guarda nao muda o pior caso. O modo de falha realista, que e atalho
  //     ou engano de agente, usa a forma literal, e essa esta coberta no grupo F.
  grupo('I. RESIDUAIS ACEITOS, caracterizacao (esperado = comportamento ATUAL)');
  caso('I1 binario por variavel, producao', 'F=firebase\n$F deploy --only hosting', sLimpoSemFlag, 0);
  caso('I2 binario por variavel, push', 'G=git\n$G push origin main', sLimpoSemFlag, 0);
  caso('I3 palavra do verbo partida por $( )', PREVIEW + ' x && git p$(echo ush) origin main', sLimpoSemFlag, 0);
  caso('I4 canal live por variavel', 'CANAL=live; ' + PREVIEW + ' $CANAL', sLimpoSemFlag, 0);
  caso('I5 canal live por escape de caractere', PREVIEW + ' \\l\\i\\v\\e', sLimpoSemFlag, 0);
  // Artefato da retirada do verbo: verbo DOBRADO se consome inteiro. Nao e
  // executavel (a CLI do firebase nao tem esse comando), fica registrado.
  caso('I6 verbo dobrado se consome (nao executavel)', PREVIEW + ' x && firebase ' + VERBO + VERBO, sLimpoSemFlag, 0);
  // Mesma familia do I3: a palavra do verbo partida por substituicao nao e vista
  // pela deteccao, aqui aplicada ao hosting:disable.
  caso('I7 hosting:disable partido por $( )', 'firebase hosting:$(echo disable)', sLimpoSemFlag, 0);

  // ══ Repositorio real intocado ═══════════════════════════════════════════
  // O que importa aqui e que O TESTE nao mexeu no repo real. Comparar a arvore
  // inteira antes/depois dava FALSO NEGATIVO: outro agente da fabrica editando
  // DIARIO.md ou TASKS.md em paralelo mudava o status no meio da rodada e
  // derrubava o caso sem o teste ter tocado em nada. Entao a asserticao e
  // especifica: flag READY_*, branch e ausencia de artefato do teste no repo. A
  // mudanca de arvore por mao alheia sai como NOTA, nao como falha.
  grupo('REPOSITORIO REAL INTOCADO');
  const depois = estadoRepoReal();
  total++;
  const okFlagsBranch = depois.branch === antes.branch && depois.flags === antes.flags;
  if (!okFlagsBranch) falhas++;
  console.log('  ' + (okFlagsBranch ? 'PASS ' : 'FALHA') + ' | flag READY_* e branch do repo real inalterados' +
    ' | flags [' + (antes.flags || 'nenhuma') + '] -> [' + (depois.flags || 'nenhuma') + ']' +
    ' | branch ' + antes.branch + ' -> ' + depois.branch);
  total++;
  const ARTEFATO = /gate-deploy-test-|gate-probe|g-mut|t-mut|READY_/;
  const artefatos = depois.status.split('\n').filter((l) => ARTEFATO.test(l));
  if (artefatos.length > 0) falhas++;
  console.log('  ' + (artefatos.length === 0 ? 'PASS ' : 'FALHA') + ' | nenhum artefato do teste no repo real' +
    (artefatos.length ? ' | encontrados: ' + artefatos.join(' , ') : ''));
  if (depois.status !== antes.status) {
    console.log('  NOTA  | a arvore do repo real mudou durante a rodada, provavelmente outro agente ' +
      'editando em paralelo. Nao e falha do teste: ele nunca escreve no repositorio.');
  }
}

function limpar() {
  let restou = [];
  for (const dir of sandboxes) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (e) { /* conferido abaixo */ }
    if (fs.existsSync(dir)) restou.push(dir);
  }
  total++;
  if (restou.length > 0) {
    falhas++;
    console.log('  FALHA | sobraram ' + restou.length + ' sandbox(es) temporario(s): ' + restou.join(', '));
  } else {
    console.log('  PASS  | ' + sandboxes.length + ' sandbox(es) temporario(s) removido(s), zero sujeira em ' + os.tmpdir());
  }
}

try {
  main();
} catch (e) {
  falhas++;
  console.error('\nERRO NO PROPRIO TESTE: ' + ((e && e.stack) || e));
} finally {
  grupo('LIMPEZA');
  limpar();
}

console.log('\n' + '='.repeat(72));
console.log(falhas === 0
  ? 'VEREDITO: PASSA, ' + total + ' de ' + total + ' casos OK'
  : 'VEREDITO: FALHA, ' + falhas + ' de ' + total + ' casos falharam');
console.log('='.repeat(72));
process.exit(falhas === 0 ? 0 : 1);
