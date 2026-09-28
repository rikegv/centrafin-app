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
 * GAPS ABERTOS DO GATE (achados por sonda adversarial nesta frente, NAO corrigidos
 * aqui: quem testa nao conserta o codigo de producao). Nao estao na lista de casos
 * abaixo para o teste nao ficar vermelho de proposito nem carimbar o furo como
 * comportamento esperado. Quando o coordenador mandar fechar, estes sao os casos
 * prontos, todos devem passar a dar exit 2 em sandbox limpo SEM flag:
 *   G1 canal live entre aspas .... firebase hosting:channel:deploy "live"
 *   G2 separador & ............... <preview> x & firebase deploy --only hosting
 *   G3 subshell no segmento ...... <preview> x --token $(firebase deploy)
 *   G4 continuacao PowerShell .... firebase `<nova linha> deploy --only hosting
 *   G5 continuacao PS no push .... git `<nova linha> push origin HEAD
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const GATE = path.resolve(__dirname, 'gate-deploy.js');
const REPO_REAL = path.resolve(__dirname, '..');

// ── Comandos de teste (strings, nunca executadas) ──────────────────────────
const FB = 'firebase';
const PREVIEW = FB + ' hosting:channel:deploy';
const PROD = FB + ' deploy';
const CLONE = FB + ' hosting:clone';

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
 */
function criarSandbox(rotulo, opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-deploy-test-'));
  sandboxes.push(dir);
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

// Mostra o comando numa linha, com a quebra de continuacao visivel.
const legivel = (c) => c.replace(/\\\r?\n\s*/g, '\\<nl> ').replace(/\s+/g, ' ');

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

  // ── Guarda anti-vacuidade: os sandboxes estao no estado pretendido? ─────
  grupo('PRE-CONDICOES DOS SANDBOXES (guarda anti-vacuidade)');
  const esperadoSandbox = [
    [sLimpoSemFlag, false, BRANCH, 0],
    [sLimpoComFlag, false, BRANCH, 1],
    [sLimpoFlagOutra, false, BRANCH, 1],
    [sSujo, true, BRANCH, 1],
    [sDestacado, false, 'HEAD', 1],
    [sSemBranch, false, '(indetectavel)', 1],
    [sMain, false, 'main', 1],
  ];
  for (const [sb, devSujo, devBranch, devFlags] of esperadoSandbox) {
    total++;
    const st = statusDe(sb.dir);
    const br = branchDe(sb.dir);
    let nFlags = 0;
    try { nFlags = fs.readdirSync(path.join(sb.dir, '.claude', 'state')).filter((f) => f.startsWith('READY_')).length; } catch (e) { nFlags = 0; }
    const ok = (!!st === devSujo) && br === devBranch && nFlags === devFlags;
    if (!ok) falhas++;
    console.log('  ' + (ok ? 'PASS ' : 'FALHA') + ' | ' + sb.rotulo.padEnd(38) +
      ' | arvore ' + (st ? 'suja ' : 'limpa') + ' (esperado ' + (devSujo ? 'suja' : 'limpa') + ')' +
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

  // ══ Repositorio real intocado ═══════════════════════════════════════════
  grupo('REPOSITORIO REAL INTOCADO');
  const depois = estadoRepoReal();
  total++;
  const intocado = depois.status === antes.status && depois.branch === antes.branch && depois.flags === antes.flags;
  if (!intocado) falhas++;
  console.log('  ' + (intocado ? 'PASS ' : 'FALHA') + ' | arvore/branch/flags do repo real iguais antes e depois');
  console.log('    antes : arvore ' + (antes.status ? 'SUJA' : 'limpa') + ', branch ' + antes.branch + ', flags [' + (antes.flags || 'nenhuma') + ']');
  console.log('    depois: arvore ' + (depois.status ? 'SUJA' : 'limpa') + ', branch ' + depois.branch + ', flags [' + (depois.flags || 'nenhuma') + ']');
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
