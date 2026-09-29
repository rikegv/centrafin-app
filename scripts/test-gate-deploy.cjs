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
 * proprio hook intercepta o comando de teste. Desde OS-GATE-DESTRUTIVO-01 isso
 * vale IGUAL para os verbos DESTRUTIVOS (rm -rf, git reset --hard, git push
 * --force, firestore:delete...): eles tambem sao interceptados pelo hook, e
 * tambem so podem aparecer DENTRO deste arquivo, nunca na linha de comando.
 *
 * NENHUMA string deste arquivo e executada. O teste alimenta a string no STDIN do
 * gate e le o EXIT CODE (spawnSync do proprio node sobre gate-deploy.js). Nenhum
 * comando destrutivo roda, nem contra o repositorio, nem contra producao, nem
 * contra os sandboxes.
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
 *   OS-GATE-DESTRUTIVO-01 (2026-09-29) acrescentou o bloco 0 do gate, que barra
 *           comando DESTRUTIVO sem flag de bypass  ->  GRUPO J (sub-blocos J.1 a
 *           J.9). A sonda do tester achou nessa rodada: caminho do binario de
 *           remocao com barra normal (/bin/rm -rf) escapando, e tres falsos
 *           positivos que travavam trabalho de rotina.
 *   2a RODADA da mesma OS: a reauditoria do seguranca manteve o veto e provou 8
 *           rotas de escape NOVAS, todas abertas pelas CORRECOES da 1a rodada.
 *           Viraram regressao permanente  ->  GRUPO J.10. A sonda do tester na
 *           vizinhanca dessas correcoes achou mais tres coisas  ->  GRUPO J.11
 *           (fechadas na 3a rodada).
 *   3a RODADA: o seguranca manteve o veto e diagnosticou a CAUSA COMUM das tres
 *           geracoes de furo, transformacao de texto rodando antes de o gate saber
 *           o que era citacao. O gate foi reescrito com UM tokenizador e os
 *           replaces foram removidos  ->  GRUPO J.12, a regressao dessa reescrita.
 *           A sonda do tester achou um falso positivo residual  ->  GRUPO J.13.
 *           Dois pontos OSCILARAM dentro da propria 3a rodada (o skip do verbo
 *           so-do-cmd e o "-o" do agrupamento): a suite acusou as duas viradas de
 *           veredito na hora, e a versao final acertou os dois  ->  GRUPO J.14.
 *   4a RODADA: a 5a auditoria do seguranca achou dois furos de uma mesma raiz (as
 *           producoes de "$(" e de acento grave subidas para antes do ramo de aspa
 *           SEM CONDICAO), um falso negativo grave em aspas simples e um falso
 *           positivo no `n do PowerShell  ->  GRUPO J.15. O coordenador pediu
 *           ataque ao mecanismo de DESCARTAR leitura malformada: aguentou as 12
 *           formas do GRUPO J.16. E a sonda do tester achou o HEREDOC, que o
 *           tokenizador nao modela  ->  GRUPO J.17.
 * Versao do gate conferida por ultimo: sha256 curto bf9b2fc729ac (4a rodada da
 *           OS-GATE-DESTRUTIVO-01, ja com a correcao do heredoc; a suite imprime a
 *           impressao VIVA no topo, que e a que vale). A propria suite imprime a impressao digital do
 *           gate no topo e FALHA se ele mudar no meio da rodada. Isso ja aconteceu
 *           em tres rodadas (tres edicoes na 1a, tres na 3a, uma no meio da 4a) e
 *           foi o que pegou duas inversoes de veredito na 3a, entao a impressao
 *           digital nao e enfeite: e a unica coisa que amarra o veredito a uma
 *           versao do gate. Por decisao do coordenador na 4a rodada, rodar esta
 *           suite passou a ser PRE-CONDICAO de qualquer commit no gate.
 *
 * A LICAO QUE ESTE ARQUIVO REGISTRA, e o motivo de ele existir: em TODAS as
 * rodadas desta trava, a correcao de um furo abriu outro. Grupo F fechou 5 e o
 * seguranca achou 2; G fechou esses 2 e a segmentacao virou furo novo; H tirou a
 * segmentacao; J.10 sao 8 rotas abertas pelas correcoes de J.1 a J.9. Por isso
 * nenhuma regressao daqui pode viver em sonda de scratchpad.
 * O padrao so quebrou na 3a rodada, e quebrou do mesmo jeito das duas vezes
 * anteriores em que quebrou (grupo H, e agora J.12): TIRANDO mecanismo, nao
 * acrescentando defesa. Duas vezes a saida foi remover transformacao de texto e
 * deixar UMA leitura decidir. Vale lembrar disso antes de propor o proximo
 * replace.
 *
 * RESIDUAIS ACEITOS, caracterizados no GRUPO I: tres formas de indirecao de shell
 * que a leitura TEXTUAL do comando nao alcanca. Ficam registradas como caso
 * rotulado, com o veredito ATUAL, para que qualquer mudanca futura apareca no
 * teste. NAO sao o comportamento desejado; sao o limite conhecido da tecnica.
 *
 * LEIA ANTES DE OLHAR O VEREDITO (GRUPO J): os sub-blocos J.6 (GAPS) e J.7
 * (FALSOS POSITIVOS) usam como esperado o REQUISITO da ordem de tarefa, nao o
 * comportamento atual do gate. Eles FALHAM de proposito enquanto o gate nao for
 * corrigido: e o teste escrito a partir do requisito, que quem constroi faz
 * passar. Nao ajuste o esperado deles para o verde; conserte o gate. O sub-bloco
 * J.8 e o oposto: caracterizacao do comportamento ATUAL de residuais aceitos.
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
// Nomes dos casos que falharam, para o resumo do fim. Sem isso, quem le a saida
// tem que cacar as linhas FALHA no meio de 250 linhas de PASS.
const falhasDetalhe = [];

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
  // Sobrou quebra de linha de verdade (heredoc, comando multilinha): tambem vira
  // marcador, senao uma linha do relatorio estoura em varias e a tabela se perde.
  .replace(/\r?\n/g, '<nl> ')
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
  if (!ok) {
    falhas++;
    falhasDetalhe.push(nome + '  (esperado ' + esperado + ', obtido ' + code + ')' + nota);
  }
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

// sha256 curto do gate, para o veredito ficar atribuido a uma versao dele.
function hashDoGate() {
  try {
    return require('crypto').createHash('sha256')
      .update(fs.readFileSync(GATE)).digest('hex').slice(0, 12);
  } catch (e) { return '(nao foi possivel ler o gate)'; }
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
  // Impressao digital do gate. Sem isso, um veredito desta suite nao diz CONTRA
  // QUAL versao do gate ele vale, o que ja atrapalhou uma rodada em que o gate
  // foi editado no meio do teste (2026-09-29). O hash entra no relatorio.
  console.log('Gate sob teste : ' + GATE);
  console.log('Impressao      : ' + hashDoGate() + ' (sha256 curto de gate-deploy.js)');
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
  //
  // MUDANCA DE MOTIVO em OS-GATE-DESTRUTIVO-01: estes 4 casos continuam
  // bloqueando (exit 2), mas agora pelo bloco DESTRUTIVO, que roda ANTES e nao
  // depende de flag, e nao mais por "nenhuma flag". A trava ficou mais forte:
  // antes, uma flag READY_* da frente liberaria hosting:disable; agora nada
  // libera. O motivo esperado muda junto, senao o teste carimbaria o exit code
  // certo pelo motivo errado, que e exatamente o que a guarda existe para pegar.
  const DESTRUTIVO = 'comando DESTRUTIVO';
  caso('H32 hosting:disable sozinho', DISABLE, sLimpoSemFlag, 2, DESTRUTIVO);
  caso('H33 hosting:disable com --site', DISABLE + ' --site centra-fin', sLimpoSemFlag, 2, DESTRUTIVO);
  caso('H34 hosting:disable junto do preview', PREVIEW + ' x && ' + DISABLE, sLimpoSemFlag, 2, DESTRUTIVO);
  caso('H35 hosting:disable com -f e projeto', DISABLE + ' -f --project centra-fin', sLimpoSemFlag, 2, DESTRUTIVO);
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

  // ══ J. COMANDO DESTRUTIVO: BLOQUEIO INCONDICIONAL ═══════════════════════
  // OS-GATE-DESTRUTIVO-01 (diretor, 2026-09-29). O bloco 0 do gate barra SEMPRE
  // os comandos que apagam/sobrescrevem dado ou codigo em massa: sem flag de
  // bypass, sem excecao de preview, sem depender de arvore limpa.
  //
  // NENHUMA destas strings e executada: cada uma entra pelo STDIN do gate e o
  // teste le so o EXIT CODE. Nada roda contra o repositorio, contra producao nem
  // contra os sandboxes.
  //
  // O motivo exigido em cada caso nao e generico: e o rotulo do DETECTOR
  // especifico ("Detectado: git reset --hard"). Exit 2 pelo detector errado conta
  // como falha, porque provaria que o comando foi barrado por acaso e nao pela
  // regra que o caso testa.
  //
  // SANDBOX PADRAO DESTE GRUPO = sLimpoComFlag, o cenario MAIS PERMISSIVO do
  // gate inteiro (arvore limpa + flag READY_* casando o branch), justamente onde
  // qualquer comando de publicacao passaria. Se bloqueia AQUI, a trava nao
  // depende de flag. O sub-bloco J.4 repete a prova nos outros seis sandboxes.
  const DET_FSDEL = 'Detectado: firebase firestore:delete';
  const DET_FSDB = 'Detectado: firebase firestore:databases:delete';
  const DET_DBREM = 'Detectado: firebase database:remove';
  const DET_DISAB = 'Detectado: firebase hosting:disable';
  const DET_GCIE = 'Detectado: gcloud firestore import/export';
  const DET_GCDEL = 'Detectado: gcloud firestore databases delete';
  const DET_PUSHF = 'Detectado: git push --force';
  const DET_RESET = 'Detectado: git reset --hard';
  const DET_CLEAN = 'Detectado: git clean -f';
  const DET_BRD = 'Detectado: git branch -D';
  const DET_RM = 'Detectado: remocao recursiva de arquivos';
  const DET_NET = 'Detectado: System.IO.Directory';

  grupo('J.1 FIREBASE E GCLOUD DESTRUTIVOS (sandbox MAIS PERMISSIVO: limpo + flag da frente)');
  caso('J01 firestore:delete recursivo', 'firebase firestore:delete /Clientes -r', sLimpoComFlag, 2, DET_FSDEL);
  caso('J02 firestore:delete --all-collections', 'firebase firestore:delete --all-collections -y', sLimpoComFlag, 2, DET_FSDEL);
  caso('J03 firestore:delete --recursive --force', 'firebase firestore:delete /Col --recursive --force', sLimpoComFlag, 2, DET_FSDEL);
  caso('J04 firestore:delete via npx', 'npx firebase firestore:delete /Col -r', sLimpoComFlag, 2, DET_FSDEL);
  caso('J05 firestore:delete via npx firebase-tools', 'npx -y firebase-tools firestore:delete /Col -r', sLimpoComFlag, 2, DET_FSDEL);
  caso('J06 firestore:delete binario caminho absoluto', '/c/Users/x/AppData/Roaming/npm/firebase firestore:delete /Col -r', sLimpoComFlag, 2, DET_FSDEL);
  caso('J07 firestore:delete binario caminho Windows', 'C:\\Users\\x\\npm\\firebase.cmd firestore:delete /Col -r', sLimpoComFlag, 2, DET_FSDEL);
  caso('J08 firestore:delete verbo entre aspas duplas', 'firebase "firestore:delete" /Col -r', sLimpoComFlag, 2, DET_FSDEL);
  caso('J09 firestore:delete verbo entre aspas simples', "firebase 'firestore:delete' /Col -r", sLimpoComFlag, 2, DET_FSDEL);
  caso('J10 firestore:delete em caixa alta', 'FIREBASE FIRESTORE:DELETE /COL -R', sLimpoComFlag, 2, DET_FSDEL);
  caso('J11 firestore:delete continuacao bash', 'firebase \\\n  firestore:delete /Col -r', sLimpoComFlag, 2, DET_FSDEL);
  caso('J12 firestore:delete continuacao PowerShell', 'firebase ' + BT + '\n  firestore:delete /Col -r', sLimpoComFlag, 2, DET_FSDEL);
  caso('J13 firestore:delete encadeado por &&', 'npm run build && firebase firestore:delete /Col -r', sLimpoComFlag, 2, DET_FSDEL);
  caso('J14 firestore:delete encadeado por ;', 'firebase firestore:delete /Col -r ; echo fim', sLimpoComFlag, 2, DET_FSDEL);
  caso('J15 firestore:delete encadeado por pipe', 'firebase firestore:delete /Col -r | tee log.txt', sLimpoComFlag, 2, DET_FSDEL);
  caso('J16 firestore:delete atras do preview', PREVIEW + ' x && firebase firestore:delete /Col -r', sLimpoComFlag, 2, DET_FSDEL);
  caso('J17 firestore:databases:delete', 'firebase firestore:databases:delete "(default)"', sLimpoComFlag, 2, DET_FSDB);
  caso('J18 database:remove', 'firebase database:remove /usuarios', sLimpoComFlag, 2, DET_DBREM);
  caso('J19 database:remove na raiz', 'firebase database:remove / --instance centra-fin', sLimpoComFlag, 2, DET_DBREM);
  caso('J20 hosting:disable', DISABLE, sLimpoComFlag, 2, DET_DISAB);
  caso('J21 hosting:disable --site', DISABLE + ' --site centra-fin', sLimpoComFlag, 2, DET_DISAB);
  caso('J22 hosting:disable com -f e projeto', DISABLE + ' -f --project centra-fin', sLimpoComFlag, 2, DET_DISAB);
  caso('J23 hosting:disable continuacao PowerShell', FB + ' ' + BT + '\n  hosting:disable', sLimpoComFlag, 2, DET_DISAB);
  caso('J24 gcloud firestore import', 'gcloud firestore import gs://bkp/2026-09-29', sLimpoComFlag, 2, DET_GCIE);
  caso('J25 gcloud firestore export', 'gcloud firestore export gs://bkp/hoje --collection-ids=Clientes', sLimpoComFlag, 2, DET_GCIE);
  caso('J26 gcloud firestore import em caixa alta', 'GCLOUD FIRESTORE IMPORT gs://b/x', sLimpoComFlag, 2, DET_GCIE);
  caso('J27 gcloud export encadeado', 'cd /tmp && gcloud firestore export gs://b/x', sLimpoComFlag, 2, DET_GCIE);
  caso('J28 gcloud firestore databases delete', 'gcloud firestore databases delete --database="(default)"', sLimpoComFlag, 2, DET_GCDEL);
  caso('J29 gcloud alpha databases delete', 'gcloud alpha firestore databases delete --database=x', sLimpoComFlag, 2, DET_GCDEL);

  grupo('J.2 GIT DESTRUTIVO (sandbox MAIS PERMISSIVO: limpo + flag da frente)');
  caso('J30 push --force', 'git push --force origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J31 push --force-with-lease', 'git push --force-with-lease origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J32 push --force-if-includes', 'git push --force-if-includes origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J33 push --force-with-lease=<ref>', 'git push --force-with-lease=main origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J34 push -f', 'git push -f origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J35 push com -f depois do remoto', 'git push origin main -f', sLimpoComFlag, 2, DET_PUSHF);
  caso('J36 push -uf (agrupamento Unix)', 'git push -uf origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J37 push --f (abreviacao)', 'git push --f origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J38 push refspec + (forca sem a palavra)', 'git push origin +main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J39 push refspec + completo', 'git push origin +refs/heads/main:refs/heads/main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J40 push refspec +HEAD:main', 'git push origin +HEAD:main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J41 git -C <dir> push --force', 'git -C /c/tmp/repo push --force origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J42 git --work-tree push -f', 'git --work-tree=/c/tmp push -f origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J43 push flag entre aspas duplas', 'git push "--force" origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J44 push flag entre aspas simples', "git push '--force' origin main", sLimpoComFlag, 2, DET_PUSHF);
  caso('J45 push --force binario absoluto', '/usr/bin/git push --force origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J46 push --force em caixa alta', 'GIT PUSH --FORCE ORIGIN MAIN', sLimpoComFlag, 2, DET_PUSHF);
  caso('J47 push --force continuacao PowerShell', 'git ' + BT + '\n  push --force origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J48 push --force continuacao bash', 'git \\\n  push --force origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J49 push --force encadeado', 'git add -A ; git commit -m x ; git push --force', sLimpoComFlag, 2, DET_PUSHF);
  caso('J50 reset --hard', 'git reset --hard', sLimpoComFlag, 2, DET_RESET);
  caso('J51 reset --hard HEAD~1', 'git reset --hard HEAD~1', sLimpoComFlag, 2, DET_RESET);
  caso('J52 reset --hard origin/main', 'git reset --hard origin/main', sLimpoComFlag, 2, DET_RESET);
  caso('J53 git -C <dir> reset --hard', 'git -C /c/tmp/repo reset --hard', sLimpoComFlag, 2, DET_RESET);
  caso('J54 reset com --hard entre aspas', 'git reset "--hard" HEAD', sLimpoComFlag, 2, DET_RESET);
  caso('J55 reset --hard encadeado', 'git fetch && git reset --hard origin/main', sLimpoComFlag, 2, DET_RESET);
  caso('J56 reset --hard em caixa alta', 'GIT RESET --HARD', sLimpoComFlag, 2, DET_RESET);
  caso('J57 reset --hard continuacao PowerShell', 'git reset ' + BT + '\n  --hard HEAD', sLimpoComFlag, 2, DET_RESET);
  caso('J58 reset --hard binario absoluto', '/usr/bin/git reset --hard', sLimpoComFlag, 2, DET_RESET);
  caso('J59 clean -fd', 'git clean -fd', sLimpoComFlag, 2, DET_CLEAN);
  caso('J60 clean -f -d', 'git clean -f -d', sLimpoComFlag, 2, DET_CLEAN);
  caso('J61 clean -fdx', 'git clean -fdx', sLimpoComFlag, 2, DET_CLEAN);
  caso('J62 clean -f -d -x', 'git clean -f -d -x', sLimpoComFlag, 2, DET_CLEAN);
  caso('J63 clean -xdf (ordem trocada)', 'git clean -xdf', sLimpoComFlag, 2, DET_CLEAN);
  caso('J64 clean --force -d', 'git clean --force -d', sLimpoComFlag, 2, DET_CLEAN);
  caso('J65 clean com flag entre aspas', 'git clean "-fd"', sLimpoComFlag, 2, DET_CLEAN);
  caso('J66 git -C <dir> clean -fd', 'git -C /c/tmp/repo clean -fd', sLimpoComFlag, 2, DET_CLEAN);
  caso('J67 clean -fd em caixa alta', 'GIT CLEAN -FD', sLimpoComFlag, 2, DET_CLEAN);
  caso('J68 branch -D', 'git branch -D feature/velha', sLimpoComFlag, 2, DET_BRD);
  caso('J69 branch -D com dois branches', 'git branch -D feature/a feature/b', sLimpoComFlag, 2, DET_BRD);
  caso('J70 branch --delete --force', 'git branch --delete --force x', sLimpoComFlag, 2, DET_BRD);
  caso('J71 branch --force --delete (invertido)', 'git branch --force --delete x', sLimpoComFlag, 2, DET_BRD);
  caso('J72 branch com -D entre aspas', 'git branch "-D" x', sLimpoComFlag, 2, DET_BRD);
  caso('J73 branch -Dr (agrupado)', 'git branch -Dr origin/x', sLimpoComFlag, 2, DET_BRD);
  caso('J74 git -C <dir> branch -D', 'git -C /c/tmp/repo branch -D x', sLimpoComFlag, 2, DET_BRD);
  caso('J75 branch -D encadeado', 'git checkout main && git branch -D feature/velha', sLimpoComFlag, 2, DET_BRD);

  grupo('J.3 REMOCAO RECURSIVA, BASH E POWERSHELL (limpo + flag da frente)');
  caso('J76 rm -rf', 'rm -rf node_modules', sLimpoComFlag, 2, DET_RM);
  caso('J77 rm -r -f (separadas)', 'rm -r -f node_modules', sLimpoComFlag, 2, DET_RM);
  caso('J78 rm -fr (invertidas)', 'rm -fr node_modules', sLimpoComFlag, 2, DET_RM);
  caso('J79 rm -Rf (maiuscula)', 'rm -Rf node_modules', sLimpoComFlag, 2, DET_RM);
  caso('J80 rm --recursive --force (longas)', 'rm --recursive --force node_modules', sLimpoComFlag, 2, DET_RM);
  caso('J81 rm -rf na raiz', 'rm -rf /', sLimpoComFlag, 2, DET_RM);
  caso('J82 sudo rm -rf', 'sudo rm -rf /var/www', sLimpoComFlag, 2, DET_RM);
  caso('J83 rm -rf com caminho entre aspas', 'rm -rf "c:/Users/Henrique/Desktop/centrafin-app/scripts"', sLimpoComFlag, 2, DET_RM);
  caso('J84 rm com flag entre aspas', 'rm "-rf" pasta', sLimpoComFlag, 2, DET_RM);
  caso('J85 rm.exe -rf', 'rm.exe -rf pasta', sLimpoComFlag, 2, DET_RM);
  caso('J86 rm -rf encadeado por &&', 'npm run build && rm -rf dist', sLimpoComFlag, 2, DET_RM);
  caso('J87 rm -rf encadeado por ;', 'cd /tmp; rm -rf x', sLimpoComFlag, 2, DET_RM);
  caso('J88 rm -rf encadeado por pipe', 'rm -rf dist | tee log', sLimpoComFlag, 2, DET_RM);
  caso('J89 rm -rf dentro de find -exec', 'find . -name "*.tmp" -exec rm -rf {} \\;', sLimpoComFlag, 2, DET_RM);
  caso('J90 rm -rf com caminho por substituicao', 'rm -rf $(pwd)/dist', sLimpoComFlag, 2, DET_RM);
  caso('J91 rm -rf no fim de cadeia longa', 'npm test && npm run build && rm -rf dist && npm ci', sLimpoComFlag, 2, DET_RM);
  caso('J92 rmdir -rf', 'rmdir -rf pasta', sLimpoComFlag, 2, DET_RM);
  caso('J93 Remove-Item -Recurse -Force', 'Remove-Item -Recurse -Force .\\dist', sLimpoComFlag, 2, DET_RM);
  caso('J94 Remove-Item -rec -for (abreviacao PS)', 'Remove-Item -rec -for .\\dist', sLimpoComFlag, 2, DET_RM);
  caso('J95 Remove-Item -r -fo (abreviacao curta)', 'Remove-Item -r -fo .\\dist', sLimpoComFlag, 2, DET_RM);
  caso('J96 Remove-Item -Path ... -Recurse -Force', 'Remove-Item -Path .\\dist -Recurse -Force', sLimpoComFlag, 2, DET_RM);
  caso('J97 Remove-Item -Force -Recurse (invertido)', 'Remove-Item -Force -Recurse .\\dist', sLimpoComFlag, 2, DET_RM);
  caso('J98 Remove-Item continuacao acento grave', 'Remove-Item -Recurse ' + BT + '\n  -Force .\\dist', sLimpoComFlag, 2, DET_RM);
  caso('J99 REMOVE-ITEM em caixa alta', 'REMOVE-ITEM -RECURSE -FORCE .\\DIST', sLimpoComFlag, 2, DET_RM);
  caso('J100 apelido ri -r -fo', 'ri -r -fo .\\dist', sLimpoComFlag, 2, DET_RM);
  caso('J101 apelido rd -Recurse -Force', 'rd -Recurse -Force .\\dist', sLimpoComFlag, 2, DET_RM);
  caso('J102 apelido del -Recurse -Force', 'del -Recurse -Force .\\dist', sLimpoComFlag, 2, DET_RM);
  caso('J103 apelido erase -Recurse -Force', 'erase -Recurse -Force .\\dist', sLimpoComFlag, 2, DET_RM);
  caso('J104 Remove-Item depois de pipe', 'Get-ChildItem | Remove-Item -Recurse -Force', sLimpoComFlag, 2, DET_RM);
  caso('J105 Remove-Item -Force:$true', 'Remove-Item .\\dist -Recurse -Force:$true', sLimpoComFlag, 2, DET_RM);
  caso('J106 rm -rf junto de push legitimo', 'rm -rf pasta && git push origin main', sLimpoComFlag, 2, DET_RM);

  // ── J.4 A TRAVA NAO DEPENDE DE NENHUMA PRE-CONDICAO ──────────────────────
  // A mesma string tem que bloquear nos SETE sandboxes, do mais restritivo ao
  // mais permissivo. J108 e o caso central pedido pelo diretor: arvore limpa E
  // flag READY_* casando o branch, o unico cenario em que o gate libera deploy de
  // producao. J110 prova que a trava nao depende nem do git existir.
  //
  // J107 prova tambem a ORDEM do bloco no gate: "rm -rf" nao casa DEPLOY_PATTERN.
  // Se o bloco destrutivo ficasse DEPOIS do early-exit, este caso sairia 0 pela
  // porta da frente sem nunca ser olhado. Exit 2 aqui prova que o bloco roda
  // ANTES.
  grupo('J.4 INDEPENDENCIA DE FLAG, ARVORE E BRANCH (mesma string, 7 sandboxes)');
  caso('J107 rm -rf, limpo SEM flag (prova a ordem)', 'rm -rf node_modules', sLimpoSemFlag, 2, DET_RM);
  caso('J108 rm -rf, limpo COM flag da frente', 'rm -rf node_modules', sLimpoComFlag, 2, DET_RM);
  caso('J109 rm -rf, arvore SUJA', 'rm -rf node_modules', sSujo, 2, DET_RM);
  caso('J110 rm -rf, fora de repositorio git', 'rm -rf node_modules', sForaDeGit, 2, DET_RM);
  caso('J111 rm -rf, branch main', 'rm -rf node_modules', sMain, 2, DET_RM);
  caso('J112 rm -rf, HEAD destacado', 'rm -rf node_modules', sDestacado, 2, DET_RM);
  caso('J113 rm -rf, branch indetectavel', 'rm -rf node_modules', sSemBranch, 2, DET_RM);
  caso('J114 push --force, limpo COM flag da frente', 'git push --force origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J115 push --force, branch main', 'git push --force origin main', sMain, 2, DET_PUSHF);
  caso('J116 firestore:delete, limpo COM flag', 'firebase firestore:delete /Col -r', sLimpoComFlag, 2, DET_FSDEL);
  caso('J117 firestore:delete, fora de repo git', 'firebase firestore:delete /Col -r', sForaDeGit, 2, DET_FSDEL);
  caso('J118 hosting:disable, limpo COM flag', DISABLE, sLimpoComFlag, 2, DET_DISAB);
  caso('J119 reset --hard, arvore SUJA', 'git reset --hard', sSujo, 2, DET_RESET);
  caso('J120 branch -D, limpo COM flag', 'git branch -D feature/velha', sLimpoComFlag, 2, DET_BRD);

  // ── J.5 O LEGITIMO CONTINUA PASSANDO ────────────────────────────────────
  // Requisito EXPLICITO do diretor, nao detalhe: a trava nao pode virar
  // fail-closed que trava trabalho normal alem do necessario. Os casos de
  // deploy/push legitimo rodam em sLimpoComFlag (senao seriam barrados pela regra
  // da flag, que e outra coisa); o resto roda em sLimpoSemFlag, onde a unica
  // trava possivel e a destrutiva.
  grupo('J.5 LEGITIMO PARECIDO CONTINUA PASSANDO (requisito do diretor)');
  caso('J121 rm -f um arquivo so', 'rm -f um-arquivo.txt', sLimpoSemFlag, 0);
  caso('J122 rm sem flag', 'rm arquivo.txt', sLimpoSemFlag, 0);
  caso('J123 rm -v um arquivo', 'rm -v arquivo.txt', sLimpoSemFlag, 0);
  caso('J124 Remove-Item -Force um arquivo', 'Remove-Item -Force arquivo.txt', sLimpoSemFlag, 0);
  caso('J125 Remove-Item sem flag', 'Remove-Item arquivo.txt', sLimpoSemFlag, 0);
  caso('J126 Remove-Item -Path ... -Force', 'Remove-Item -Path .\\tmp\\a.txt -Force', sLimpoSemFlag, 0);
  caso('J127 Remove-Item -Confirm:$false um arquivo', 'Remove-Item -Confirm:$false a.txt', sLimpoSemFlag, 0);
  caso('J128 Remove-Item -Filter num caminho', 'Remove-Item -Filter *.tmp -Path .\\logs', sLimpoSemFlag, 0);
  caso('J129 git push normal', 'git push', sLimpoComFlag, 0);
  caso('J130 git push origin HEAD', 'git push origin HEAD', sLimpoComFlag, 0);
  caso('J131 git push -u', 'git push -u origin feature/x', sLimpoComFlag, 0);
  caso('J132 git push --set-upstream', 'git push --set-upstream origin feature/x', sLimpoComFlag, 0);
  caso('J133 git push --follow-tags', 'git push --follow-tags', sLimpoComFlag, 0);
  caso('J134 git push --tags', 'git push --tags origin', sLimpoComFlag, 0);
  caso('J135 git push --dry-run', 'git push --dry-run origin main', sLimpoComFlag, 0);
  caso('J136 git push refspec sem +', 'git push origin refs/heads/main:refs/heads/main', sLimpoComFlag, 0);
  caso('J137 git push --no-verify', 'git push origin main --no-verify', sLimpoComFlag, 0);
  caso('J138 git branch -d (minusculo, seguro)', 'git branch -d feature/mergeada', sLimpoSemFlag, 0);
  caso('J139 git branch -a', 'git branch -a', sLimpoSemFlag, 0);
  caso('J140 git branch --list', 'git branch --list', sLimpoSemFlag, 0);
  caso('J141 git branch -m (renomeia)', 'git branch -m nome-novo', sLimpoSemFlag, 0);
  caso('J142 git clean -n (dry run)', 'git clean -n', sLimpoSemFlag, 0);
  caso('J143 git clean --dry-run -d', 'git clean --dry-run -d', sLimpoSemFlag, 0);
  caso('J144 git reset HEAD~1 (sem --hard)', 'git reset HEAD~1', sLimpoSemFlag, 0);
  caso('J145 git reset --soft', 'git reset --soft HEAD~1', sLimpoSemFlag, 0);
  caso('J146 git reset --mixed', 'git reset --mixed HEAD', sLimpoSemFlag, 0);
  caso('J147 firebase deploy --only hosting', PROD + ' --only hosting', sLimpoComFlag, 0);
  caso('J148 firebase deploy --only firestore:rules', PROD + ' --only firestore:rules', sLimpoComFlag, 0, 'firestore:rules');
  caso('J149 preview channel legitimo', PREVIEW + ' cp-onda2-classif', sLimpoSemFlag, 0, 'preview channel');
  caso('J150 hosting:channel:list', FB + ' hosting:channel:list', sLimpoSemFlag, 0);
  caso('J151 firebase firestore:indexes', FB + ' firestore:indexes', sLimpoSemFlag, 0);
  caso('J152 gcloud firestore databases list', 'gcloud firestore databases list', sLimpoSemFlag, 0);
  caso('J153 grep -rf (so letras parecidas)', 'grep -rf padroes.txt arquivo.txt', sLimpoSemFlag, 0);
  caso('J154 npm run clean', 'npm run clean', sLimpoSemFlag, 0);
  caso('J155 npm install --force (sem git)', 'npm install --force', sLimpoSemFlag, 0);
  caso('J156 git rm --cached (nao apaga do disco)', 'git rm --cached arquivo.txt', sLimpoSemFlag, 0);
  caso('J157 git status', 'git status --porcelain', sLimpoSemFlag, 0);
  caso('J158 git stash', 'git stash', sLimpoSemFlag, 0);
  caso('J159 git restore', 'git restore arquivo.txt', sLimpoSemFlag, 0);
  caso('J160 git checkout -b', 'git checkout -b feature/nova', sLimpoSemFlag, 0);
  caso('J161 cp -r (copia recursiva)', 'cp -r pasta1 pasta2', sLimpoSemFlag, 0);
  caso('J162 mv arquivo', 'mv antigo.txt novo.txt', sLimpoSemFlag, 0);
  caso('J163 rodar este proprio teste', 'node scripts/test-gate-deploy.cjs', sLimpoSemFlag, 0);
  caso('J164 push legitimo depois do teste', 'node scripts/test-gate-deploy.cjs && git push origin HEAD', sLimpoComFlag, 0);
  caso('J165 rm -f e push no mesmo comando', 'rm -f log.txt && git push origin main', sLimpoComFlag, 0);
  caso('J166 push e rm -f no mesmo comando', 'git push origin main && rm -f tmp.txt', sLimpoComFlag, 0);
  caso('J167 push com redirecionamento', 'git push origin main 2>&1 | tee log.txt', sLimpoComFlag, 0);

  // ── J.6 CAMINHO DO BINARIO DE REMOCAO (furo achado e fechado nesta frente) ──
  // Estes seis casos NASCERAM COMO GAP nesta rodada: o detector de remocao exigia
  // que o token (rm/rmdir/ri/rd/del/erase/Remove-Item) viesse depois de inicio de
  // linha ou de um separador, e a BARRA NORMAL nao estava na classe. Resultado:
  // "/bin/rm -rf x" passava, enquanto a mesma forma com barra INVERTIDA
  // ("C:\...\del.exe", J173) era barrada. Assimetria, nao decisao. O "/" entrou na
  // classe de separadores e os seis passaram a bloquear.
  // Para firebase, gcloud e git o caminho absoluto sempre foi coberto (J06, J07,
  // J45, J58), porque aqueles detectores nao ancoram em separador.
  // NAO-REGRESSAO do outro lado desta correcao: J153 (grep -rf) e J163 (rodar
  // este proprio teste) tem que continuar LIBERANDO, e continuam.
  grupo('J.6 CAMINHO DO BINARIO DE REMOCAO (furo fechado nesta frente)');
  caso('J168 rm -rf por /bin/rm', '/bin/rm -rf /tmp/x', sLimpoComFlag, 2, DET_RM);
  caso('J169 rm -rf por /usr/bin/rm', '/usr/bin/rm -rf /tmp/x', sLimpoComFlag, 2, DET_RM);
  caso('J170 rm -rf por caminho relativo', './scripts/rm -rf x', sLimpoComFlag, 2, DET_RM);
  caso('J171 rm -rf por caminho com variavel', '$HOME/bin/rm -rf x', sLimpoComFlag, 2, DET_RM);
  caso('J172 rm.exe -rf, caminho com barra normal', 'C:/Program Files/Git/usr/bin/rm.exe -rf x', sLimpoComFlag, 2, DET_RM);
  // J173 OSCILOU no meio da 3a rodada e voltou a bloquear, agora pela regra certa.
  // A historia importa, porque ela mostra a forma do problema:
  //   1. o seguranca provou um falso positivo em que um SEGMENTO DE CAMINHO
  //      chamado "rd" ou "del" era lido como invocacao do cmd (`rm -f cache/rd/s`);
  //   2. a primeira correcao IGNOROU esses verbos sempre que vinham depois de
  //      barra ou aspa. Isso matou o falso positivo E este caso junto, que voltou
  //      a LIBERAR: a suite acusou na hora, com este J173 virando FALHA;
  //   3. a correcao final distingue INVOCACAO de SEGMENTO pelo contexto, e os dois
  //      lados passam a valer ao mesmo tempo: J173 bloqueia e J412 a J416 liberam.
  // Nota do tester, para a proporcao ficar registrada: mesmo no passo 2 o furo NAO
  // era explotavel, porque `del`, `rd` e `erase` sao BUILTIN do cmd.exe e nao
  // existem como binario (medido com `where`: nenhum dos tres e encontrado, e
  // C:/Windows/System32/del.exe nao existe), e o unico que existe como binario, o
  // `rmdir.exe` do GNU, so apaga diretorio VAZIO (`rmdir --help`: nao tem -r nem
  // -f). Quem e destrutivo por caminho e `rm` e `Remove-Item`, que nunca sairam da
  // classe larga.
  caso('J173 verbo do cmd por caminho, BLOQUEIA', 'C:\\Windows\\System32\\del.exe -Recurse -Force x', sLimpoComFlag, 2, DET_RM);

  // ── J.7 FALSOS POSITIVOS PROVADOS (esperado = REQUISITO, FALHAM hoje) ───
  // O OUTRO LADO DO MESMO REQUISITO, e o risco que o diretor mandou vigiar:
  // comando LEGITIMO barrado como se fosse destrutivo. Todos sao trabalho normal
  // da fabrica e hoje recebem exit 2.
  //
  // FP-1 (J174 a J178), O UNICO FALSO POSITIVO AINDA ABERTO: o verbo destrutivo
  //   CITADO DENTRO DE UMA STRING, como ARGUMENTO de outro comando. A janela do
  //   git nao morre dentro das aspas (de proposito: separador entre aspas e nome
  //   de arquivo, nao fim de comando), entao "reset" e "--hard" dentro da mensagem
  //   de commit caem na mesma janela do "git" e o commit e barrado. O mesmo vale
  //   para o "rm" dentro da mensagem e para grep pelo texto.
  //   ISTO NAO E TEORICO: durante esta propria rodada, um comando de LEITURA do
  //   tester (`node -e` que procurava a linha "git clean -f (apaga" no gate) foi
  //   barrado pelo detector de clean. O impacto operacional e a mensagem de commit
  //   e o DIARIO desta frente, que falam dos verbos que o gate bloqueia.
  //   ATENCAO ao corrigir: a correcao NAO pode ser simplesmente ignorar o que esta
  //   entre aspas, senao J54 (git reset "--hard"), J65 (git clean "-fd"), J84
  //   (rm "-rf") e J207/J208 (verbo partido por aspas) voltam a passar. O caminho
  //   que atende os dois lados e separar as duas leituras: achar o COMANDO e o
  //   SUBCOMANDO ignorando o conteudo entre aspas, e ler as FLAGS removendo so os
  //   CARACTERES de aspas. Uma alternativa mais estreita, que resolve o caso
  //   pratico sem tocar na leitura de flags: nao atribuir subcomando a um git cujo
  //   primeiro token nao-flag ja foi outro subcomando (aqui, "commit").
  // FP-2 (J179), o verbo citado em COMENTARIO de shell depois do comando: fechado
  //   nesta rodada, fica como regressao.
  // FP-3 (J180 a J182), a janela de flags do "clean" atravessava o separador
  //   quando o "clean" era de OUTRO programa (npm run clean) e a palavra "git"
  //   tinha aparecido antes na cadeia. Fechado ancorando a janela no proprio
  //   "git", nao no subcomando. Fica como regressao.
  grupo('J.7 CUSTO ACEITO e falsos positivos CORRIGIDOS');
  // J174 a J178: CUSTO ACEITO, decisao do coordenador em 2026-09-29, aguardando
  // ratificacao do diretor. O esperado aqui e o comportamento ATUAL (bloqueia),
  // nao o comportamento desejado, no mesmo espirito do GRUPO I.
  //
  // POR QUE NAO FOI CORRIGIDO: os dois caminhos que o tester sugeriu foram
  // tentados e nenhum fecha sem abrir rota de escape. Ignorar o conteudo entre
  // aspas na deteccao do VERBO faz `'rm' -rf build/` passar, e essa string
  // executa `rm -rf` num shell real (o seguranca a provou como furo F5). Nao ha
  // como separar "verbo citado em texto" de "verbo em posicao de comando" sem
  // SEGMENTAR o comando, e segmentar e exatamente o mecanismo que abriu furo na
  // OS-CP-GATE-PREVIEW-01 (verbo partido pelo separador sumia de todos os
  // segmentos). A licao registrada la foi: TIRAR mecanismo fechou o furo,
  // ACRESCENTAR defesa especifica abriu outro.
  //
  // O diretor pediu, com estas palavras, "nao pode haver rota de escape" e
  // "fail-closed: na duvida, bloqueia". Entre barrar um comando de LEITURA e
  // deixar passar um que APAGA, a escolha segue a ordem que ele deu.
  //
  // CONTORNO, que a fabrica ja usa para os verbos de publicacao desde
  // 2026-09-27: mensagem que cite os verbos vai por arquivo (`git commit -F
  // <arquivo>`), e busca por texto usa a ferramenta Grep em vez do grep de shell.
  caso('J174 custo aceito: commit citando reset --hard', 'git commit -m "feat(gate): bloqueia rm -rf e reset --hard"', sLimpoSemFlag, 2, DESTRUTIVO);
  caso('J175 custo aceito: add e commit citando o verbo', 'git add scripts/gate-deploy.js && git commit -m "docs: cita git reset --hard"', sLimpoSemFlag, 2, DESTRUTIVO);
  caso('J176 custo aceito: commit citando rm -rf', 'git commit -m "chore: tira o rm -rf do script"', sLimpoSemFlag, 2, DESTRUTIVO);
  caso('J177 custo aceito: grep pelo texto git reset --hard', 'grep -rn "git reset --hard" scripts/', sLimpoSemFlag, 2, DESTRUTIVO);
  caso('J178 custo aceito: grep pelo texto rm -rf', 'grep -rn "rm -rf" scripts/', sLimpoSemFlag, 2, DESTRUTIVO);
  // A partir daqui, falso positivo REAL que foi CORRIGIDO: esperado = 0 e passa.
  caso('J179 push com comentario citando --force', 'git push origin main # nunca com --force', sLimpoComFlag, 0);
  caso('J180 git status e npm run clean --force', 'git status && npm run clean -- --force', sLimpoSemFlag, 0);
  caso('J181 git log e npm run clean --force', 'git log --oneline && npm run clean --force', sLimpoSemFlag, 0);
  caso('J182 npm run clean --force sozinho', 'npm run clean -- --force', sLimpoSemFlag, 0);
  // Nao-regressao do que a correcao de FP-1 nao pode quebrar. Ficam ao lado dos
  // falsos positivos de proposito: quem for consertar le os dois lados juntos.
  caso('J183 e a correcao NAO pode soltar reset "--hard"', 'git reset "--hard" HEAD', sLimpoSemFlag, 2, DET_RESET);
  caso('J184 e a correcao NAO pode soltar rm "-rf"', 'rm "-rf" pasta', sLimpoSemFlag, 2, DET_RM);

  // ── J.8 RESIDUAIS CARACTERIZADOS (esperado = comportamento ATUAL) ───────
  // Mesma disciplina do GRUPO I: o esperado aqui e o veredito de HOJE, nao o
  // desejado. Se um destes FALHAR, o gate provavelmente MELHOROU; confira e
  // atualize o esperado, nunca afrouxe o gate para o caso voltar ao verde.
  // Sao as formas de INDIRECAO que a leitura textual do comando nao alcanca, a
  // mesma familia ja caracterizada no GRUPO I para os verbos de publicacao.
  grupo('J.8 RESIDUAIS CARACTERIZADOS (esperado = comportamento ATUAL do gate)');
  caso('J185 nome do binario por variavel', 'R=rm\n$R -rf x', sLimpoComFlag, 0);
  caso('J186 verbo escondido dentro de arquivo', 'bash scripts/limpar.sh', sLimpoComFlag, 0);
  // Este NAO e residual: a flag montada por substituicao continua legivel como
  // texto ("-rf" aparece literal na janela), e o gate bloqueia. Fica registrado do
  // lado certo, para ninguem "consertar" o gate afrouxando isso.
  caso('J187 flag montada por substituicao, BLOQUEIA', 'rm $(echo -rf) pasta', sLimpoComFlag, 2, DET_RM);
  caso('J188 reset --har (abreviacao aceita pelo git)', 'git reset --har HEAD~1', sLimpoComFlag, 0);
  caso('J189 push --forc nao existe, mas --forc casa', 'git push --forc origin main', sLimpoComFlag, 2, DET_PUSHF);

  // ── J.9 DEFESAS DESTA RODADA (regressao do bloco destrutivo) ────────────
  // Cada caso aqui corresponde a uma defesa que o bloco 0 ganhou nesta frente,
  // varias delas vindas do veto do seguranca. Se alguma cair, o caso morre aqui e
  // nao em producao.
  //  (a) J190 a J193: a janela de flags roda em TODAS as ocorrencias do verbo, nao
  //      so na primeira. Ancorar na primeira deixava passar exatamente o fluxo que
  //      a constituicao manda usar: conferir antes (dry-run), aplicar depois.
  //  (b) J194 a J196: cano para um removedor, com a recursao no comando de ORIGEM.
  //  (c) J197, J198: chamada .NET direta, que nao usa verbo de shell nenhum.
  //  (d) J199 a J203: nome do binario qualificado, entre aspas ou dentro de uma
  //      string passada a outro shell.
  //  (e) J204 a J206: forma cmd.exe ("/s /q"), que nao usa flag com traco.
  //  (f) J207 a J209: verbo de producao partido por aspas, fechado pela variante
  //      "comando sem aspas".
  //  (g) J210, J211: recursivo JA basta para barrar remocao (o "-f" so cala o
  //      prompt). E uma regra MAIS restritiva que a letra do pedido do diretor
  //      (que falava em "rm -rf"); fica registrada para ele confirmar. O limite
  //      que ele pediu explicitamente continua valendo: J121 (rm -f um arquivo) e
  //      J124 (Remove-Item -Force um arquivo) passam.
  //  (h) J212, J213: excecao do "git rm", que mexe no INDICE e nao no disco.
  grupo('J.9 DEFESAS DESTA RODADA (regressao do bloco destrutivo)');
  caso('J190 clean dry-run antes do clean -fd', 'git clean --dry-run && git clean -fd', sLimpoComFlag, 2, DET_CLEAN);
  caso('J191 push normal antes do push -f', 'git push origin main ; git push -f origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J192 branch --list antes do branch -D', 'git branch --list && git branch -D feature/x', sLimpoComFlag, 2, DET_BRD);
  caso('J193 rm -f antes do rm -rf', 'rm -f a.txt && rm -rf pasta', sLimpoComFlag, 2, DET_RM);
  caso('J194 cano com -Recurse na origem', 'Get-ChildItem .\\dist -Recurse | Remove-Item -Force', sLimpoComFlag, 2, DET_RM);
  caso('J195 cano com -Recurse na origem, apelido rm', 'Get-ChildItem x -Recurse | rm -Force', sLimpoComFlag, 2, DET_RM);
  caso('J196 cano sem recursao na origem, LIBERA', 'Get-ChildItem *.log | Remove-Item -Force', sLimpoComFlag, 0);
  caso('J197 .NET Directory::Delete recursivo', '[System.IO.Directory]::Delete("C:\\dist", $true)', sLimpoComFlag, 2, DET_NET);
  caso('J198 .NET File::Delete', '[System.IO.File]::Delete("C:\\a.txt")', sLimpoComFlag, 2, DET_NET);
  caso('J199 binario qualificado do PowerShell', 'Microsoft.PowerShell.Management\\Remove-Item -Recurse -Force x', sLimpoComFlag, 2, DET_RM);
  caso('J200 nome do binario entre aspas', "'rm' -rf x", sLimpoComFlag, 2, DET_RM);
  caso('J201 rm -rf dentro de sh -c', 'sh -c "rm -rf x"', sLimpoComFlag, 2, DET_RM);
  caso('J202 rm -rf dentro de bash -c', 'bash -c "rm -rf x"', sLimpoComFlag, 2, DET_RM);
  caso('J203 Remove-Item dentro de -Command', 'powershell -Command "Remove-Item -Recurse -Force x"', sLimpoComFlag, 2, DET_RM);
  caso('J204 rmdir /s /q (cmd.exe)', 'rmdir /s /q pasta', sLimpoComFlag, 2, DET_RM);
  caso('J205 del /f /s /q (cmd.exe)', 'del /f /s /q C:\\pasta', sLimpoComFlag, 2, DET_RM);
  caso('J206 rd /s /q (cmd.exe)', 'rd /s /q pasta', sLimpoComFlag, 2, DET_RM);
  caso('J207 firestore:delete partido por aspas', 'firebase firestore":"delete /Col -r', sLimpoComFlag, 2, DET_FSDEL);
  caso('J208 firestore:delete com aspas no meio', 'firebase fire"store:delete" /Col -r', sLimpoComFlag, 2, DET_FSDEL);
  caso('J209 hosting:disable partido por aspas', 'firebase hosting:dis"able"', sLimpoComFlag, 2, DET_DISAB);
  caso('J210 rm -r sem force (recursivo ja basta)', 'rm -r pasta', sLimpoComFlag, 2, DET_RM);
  caso('J211 Remove-Item -Recurse sem Force', 'Remove-Item -Recurse .\\pasta', sLimpoComFlag, 2, DET_RM);
  caso('J212 git rm -r --cached, LIBERA (so o indice)', 'git rm -r --cached pasta', sLimpoComFlag, 0);
  caso('J213 git rm -rf (apaga do disco), BLOQUEIA', 'git rm -rf pasta', sLimpoComFlag, 2, DET_RM);

  // ══ J.10 AS 8 ROTAS DE ESCAPE DA 2a RODADA (regressao permanente) ═══════
  // Contexto: a REAUDITORIA do seguranca manteve o veto e provou 8 rotas NOVAS,
  // todas abertas pelas CORRECOES da primeira rodada. E o padrao ja registrado
  // neste arquivo desde a OS-CP-GATE-PREVIEW-01: acrescentar defesa especifica
  // abre furo novo. Por isso elas viram caso PERMANENTE aqui, e nao ficam numa
  // sonda de scratchpad: sonda descartavel nao impede a proxima mudanca no gate
  // de reabrir tudo em silencio.
  //
  // Cada sub-bloco e uma rota, com o MECANISMO no comentario. Todos rodam na
  // sandbox mais permissiva (limpa + flag da frente), que e onde o gate mais
  // libera. Conferidos um a um pela sonda do tester contra o gate c1a9b3c817d9.
  //
  // N1, bloco de comentario do PowerShell <# ... #>: o gate corta comentario para
  //     nao ler flag de dentro dele, e o corte TRUNCAVA o comando, sumindo com o
  //     que vinha depois.
  grupo('J.10 AS 8 ROTAS DE ESCAPE DA 2a RODADA (limpo + flag da frente)');
  caso('J214 N1 comentario PS antes do --force', 'git push origin main <# nota #> --force', sLimpoComFlag, 2, DET_PUSHF);
  caso('J215 N1 comentario PS antes do -f', 'git push origin main <# n #> -f', sLimpoComFlag, 2, DET_PUSHF);
  caso('J216 N1 comentario PS antes do rm -rf', 'Write-Output ok <# n #> ; rm -rf build/', sLimpoComFlag, 2, DET_RM);
  caso('J217 N1 comentario PS no meio do verbo', 'firebase <# n #> firestore:delete', sLimpoComFlag, 2, DET_FSDEL);
  caso('J218 N1 comentario PS antes do reset --hard', 'git status <# n #> ; git reset --hard', sLimpoComFlag, 2, DET_RESET);
  caso('J219 N1 comentario PS nao fechado', 'git push origin main <# nota --force', sLimpoComFlag, 2, DET_PUSHF);
  caso('J220 N1 comentario PS na frente do comando', '<# n #> rm -rf build/', sLimpoComFlag, 2, DET_RM);
  caso('J221 N1 comentario PS sem espacos em volta', 'git push origin main <#n#>--force', sLimpoComFlag, 2, DET_PUSHF);
  caso('J222 N1 dois comentarios PS seguidos', 'git push origin main <# a #> <# b #> --force', sLimpoComFlag, 2, DET_PUSHF);
  caso('J223 N1 comentario PS com a flag DENTRO', 'git push origin main <# -f #> --force', sLimpoComFlag, 2, DET_PUSHF);
  caso('J224 N1 comentario PS depois do rm -rf', 'rm -rf x <# nota #>', sLimpoComFlag, 2, DET_RM);

  // N2, escape por barra invertida: o shell come a barra e COLA o verbo de volta
  //     ("firestore\:delete" executa como "firestore:delete"), mas a regex via a
  //     barra no meio e nao casava.
  caso('J225 N2 firestore:delete com barra no verbo', 'firebase firestore\\:delete --all-collections', sLimpoComFlag, 2, DET_FSDEL);
  caso('J226 N2 firestore:delete com barra no nome', 'firebase fire\\store:delete -r /x', sLimpoComFlag, 2, DET_FSDEL);
  caso('J227 N2 hosting:disable com barra', 'firebase hosting\\:disable', sLimpoComFlag, 2, DET_DISAB);
  caso('J228 N2 database:remove com barra', 'firebase database\\:remove /x', sLimpoComFlag, 2, DET_DBREM);
  caso('J229 N2 push com barra no verbo', 'git p\\ush -f origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J230 N2 reset com barra na flag', 'git reset --h\\ard HEAD~3', sLimpoComFlag, 2, DET_RESET);
  caso('J231 N2 rm com barra no binario', 'r\\m -rf build/', sLimpoComFlag, 2, DET_RM);
  caso('J232 N2 clean com barra no verbo', 'git c\\lean -fd', sLimpoComFlag, 2, DET_CLEAN);
  caso('J233 N2 gcloud import com barra', 'gcloud firestore imp\\ort gs://bak', sLimpoComFlag, 2, DET_GCIE);
  caso('J234 N2 barra DENTRO da flag agrupada', 'rm -r\\f build/', sLimpoComFlag, 2, DET_RM);
  caso('J235 N2 barra antes da flag agrupada', 'rm -\\rf build/', sLimpoComFlag, 2, DET_RM);
  caso('J236 N2 barra no -f do push', 'git push -\\f origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J237 N2 barra no nome do git', 'g\\it push -f origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J238 N2 barra no subcomando reset', 'git re\\set --hard', sLimpoComFlag, 2, DET_RESET);
  caso('J239 N2 barra no subcomando branch', 'git br\\anch -D x', sLimpoComFlag, 2, DET_BRD);
  caso('J240 N2 barra antes do espaco', 'rm\\ -rf build/', sLimpoComFlag, 2, DET_RM);
  caso('J241 N2 duas barras no mesmo verbo', 'firebase firestore\\:\\delete /x -r', sLimpoComFlag, 2, DET_FSDEL);
  caso('J242 N2 barra na frente do verbo', 'firebase \\firestore:delete /x -r', sLimpoComFlag, 2, DET_FSDEL);

  // N3, prefixo curto virava parametro inofensivo: "-dr" era lido como abreviacao
  //     de um parametro da lista de inofensivos em vez de agrupamento "-d -r".
  caso('J243 N3 rm -dr', 'rm -dr build/', sLimpoComFlag, 2, DET_RM);
  caso('J244 N3 rm -dr -f', 'rm -dr -f build/', sLimpoComFlag, 2, DET_RM);
  caso('J245 N3 rm -dR (maiuscula)', 'rm -dR build/', sLimpoComFlag, 2, DET_RM);
  caso('J246 N3 rm -dRf', 'rm -dRf build/', sLimpoComFlag, 2, DET_RM);

  // N4, teto de comprimento da flag: agrupamento so era lido ate N letras, entao
  //     bastava alongar a flag com letras inofensivas para o "r" e o "f" sairem da
  //     janela de leitura. E a rota que a regressao J36 (git push -uf) pegou.
  caso('J247 N4 rm -rfvvd', 'rm -rfvvd build/', sLimpoComFlag, 2, DET_RM);
  caso('J248 N4 rm -vrfvd', 'rm -vrfvd build/', sLimpoComFlag, 2, DET_RM);
  caso('J249 N4 clean -ffdxq', 'git clean -ffdxq', sLimpoComFlag, 2, DET_CLEAN);
  caso('J250 N4 clean -fdxqq', 'git clean -fdxqq', sLimpoComFlag, 2, DET_CLEAN);
  caso('J251 N4 push -fvvvv', 'git push -fvvvv origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J252 N4 push -vvvvf', 'git push -vvvvf origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J253 N4 push -uf (o caso que pegou o furo)', 'git push -uf origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J254 N4 rm -rfv (controle)', 'rm -rfv build/', sLimpoComFlag, 2, DET_RM);
  caso('J255 N4 rm -vrfd (controle)', 'rm -vrfd build/', sLimpoComFlag, 2, DET_RM);
  caso('J256 N4 flag muito longa, rm', 'rm -vvvvvvvvvvrf x', sLimpoComFlag, 2, DET_RM);
  caso('J257 N4 flag muito longa, push', 'git push -vvvvvvvvvvf origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J258 N4 flag muito longa, clean', 'git clean -qqqqqqqqf', sLimpoComFlag, 2, DET_CLEAN);

  // N5, separador dentro de $( ): a janela do git morria no ";" ou no "|" de
  //     dentro da substituicao, e o verbo que vinha depois ficava fora dela.
  caso('J259 N5 pipe dentro de $( )', 'git -C $(ls|head -1) push -f', sLimpoComFlag, 2, DET_PUSHF);
  caso('J260 N5 ponto-e-virgula dentro de $( )', 'git -C $(echo a;echo b) push -f', sLimpoComFlag, 2, DET_PUSHF);
  caso('J261 N5 && dentro de $( )', 'git -C $(pwd&&pwd) push --force', sLimpoComFlag, 2, DET_PUSHF);
  caso('J262 N5 $( ) entre aspas', 'git -C "$(ls|head -1)" push -f', sLimpoComFlag, 2, DET_PUSHF);
  caso('J263 N5 $( ) com espacos', 'git -C $(ls | head -1) push --force', sLimpoComFlag, 2, DET_PUSHF);
  caso('J264 N5 substituicao em --git-dir', 'git --git-dir=$(pwd|tr a b)/.git push -f', sLimpoComFlag, 2, DET_PUSHF);
  caso('J265 N5 acento grave no lugar do $( )', 'git -C `ls|head -1` push -f', sLimpoComFlag, 2, DET_PUSHF);
  caso('J266 N5 variavel com chaves', 'git -C ${PWD} push -f', sLimpoComFlag, 2, DET_PUSHF);

  // N6, escape \" invertia o estado de aspa: a contagem de aspas tratava a aspa
  //     ESCAPADA como abertura/fechamento, e o resto do comando virava "dentro de
  //     aspas", onde o separador nao corta.
  caso('J267 N6 aspa escapada no nome do arquivo', 'rm "a\\"|b" -rf', sLimpoComFlag, 2, DET_RM);
  caso('J268 N6 duas aspas escapadas', 'rm "a\\"b\\"|c" -rf', sLimpoComFlag, 2, DET_RM);
  caso('J269 N6 LIBERA aspa escapada sem recursao', 'rm -f "a\\"b" ; ls -R x', sLimpoComFlag, 0);

  // N7, apostrofo de texto anulava o corte de comentario: o "'" de "it's" abria
  //     uma aspa que nunca fechava, e o "#" depois dele deixava de cortar.
  caso('J270 N7 LIBERA apostrofo antes do comentario', "echo it's ok # rm -rf build/", sLimpoComFlag, 0);
  caso('J271 N7 LIBERA comentario citando --force', 'git push origin main # nunca com --force', sLimpoComFlag, 0);
  caso('J272 N7 LIBERA apostrofo escapado', "echo 'it'\\''s ok' # rm -rf build/", sLimpoComFlag, 0);
  caso('J273 N7 LIBERA acento no comentario', 'echo "nao e destrutivo" # rm -rf x', sLimpoComFlag, 0);
  caso('J274 N7 LIBERA comentario depois de --format', 'git log --format="%h %s" # cita rm -rf', sLimpoComFlag, 0);
  // O outro lado do N7: "#" ENTRE ASPAS e texto, nao comentario, e nao pode
  // cortar o comando. Se cortasse, tudo depois dele sumiria da deteccao.
  caso('J275 N7 # entre aspas nao corta, rm -rf', 'git commit -m "fix #123" && rm -rf x', sLimpoComFlag, 2, DET_RM);
  caso('J276 N7 # entre aspas simples nao corta', "git push origin main '#' --force", sLimpoComFlag, 2, DET_PUSHF);
  caso('J277 N7 # entre aspas duplas nao corta', 'git push origin main "#" -f', sLimpoComFlag, 2, DET_PUSHF);

  // N8, flag do cmd colada: "rd /s/q" junta os dois switches num token so.
  caso('J278 N8 rd /s/q colado', 'rd /s/q C:\\tmp\\x', sLimpoComFlag, 2, DET_RM);
  caso('J279 N8 rd /s /q (controle)', 'rd /s /q pasta', sLimpoComFlag, 2, DET_RM);
  caso('J280 N8 del /f /s /q (controle)', 'del /f /s /q C:\\pasta', sLimpoComFlag, 2, DET_RM);
  caso('J281 N8 del /s/q colado', 'del /s/q C:\\tmp', sLimpoComFlag, 2, DET_RM);

  // git rm ESTREITADO NO --cached: o que decide nao e a flag, e o --cached. Sem
  // ele, "git rm -r" APAGA DO DISCO e tem que bloquear; com ele, mexe so no
  // indice e e trabalho de rotina (tirar node_modules do versionamento).
  caso('J282 git rm -r sem --cached, BLOQUEIA', 'git rm -r src/', sLimpoComFlag, 2, DET_RM);
  caso('J283 git rm -rf sem --cached, BLOQUEIA', 'git rm -rf src/', sLimpoComFlag, 2, DET_RM);
  caso('J284 LIBERA git rm -r --cached', 'git rm -r --cached node_modules', sLimpoComFlag, 0);
  caso('J285 LIBERA git rm -r --cached (pasta)', 'git rm -r --cached config/', sLimpoComFlag, 0);
  caso('J286 LIBERA git rm --cached um arquivo', 'git rm --cached arquivo.txt', sLimpoComFlag, 0);
  // Estes dois nao estavam na lista e valem: o "-f" junto do --cached continua
  // sendo so indice, e a ordem das flags nao pode mudar o veredito.
  caso('J287 LIBERA git rm -rf --cached', 'git rm -rf --cached node_modules', sLimpoComFlag, 0);
  caso('J288 LIBERA git rm --cached -r (ordem trocada)', 'git rm --cached -r pasta', sLimpoComFlag, 0);
  caso('J289 git rm --cached seguido de rm -rf', 'git rm -r --cached x && rm -rf y', sLimpoComFlag, 2, DET_RM);

  // O OUTRO LADO: legitimos que as correcoes acima nao podem derrubar. A guarda
  // do "/s" e do "/f" do cmd e o ponto de risco aqui, porque ela le um token que
  // tambem aparece em CAMINHO.
  caso('J290 LIBERA Get-ChildItem -Force', 'Get-ChildItem C:/stuff -Force', sLimpoComFlag, 0);
  caso('J291 LIBERA Get-ChildItem -Recurse (so le)', 'Get-ChildItem C:/stuff -Recurse', sLimpoComFlag, 0);
  caso('J292 LIBERA Remove-Item um arquivo -Force', 'Remove-Item C:/stuff/a.txt -Force', sLimpoComFlag, 0);
  caso('J293 LIBERA Remove-Item -Force -Confirm:$false', 'Remove-Item C:/stuff/a.txt -Force -Confirm:$false', sLimpoComFlag, 0);
  caso('J294 LIBERA git status e npm run clean --force', 'git status && npm run clean --force', sLimpoComFlag, 0);
  caso('J295 LIBERA git log e npm run build --force', 'git log --oneline && npm run build --force', sLimpoComFlag, 0);
  caso('J296 LIBERA npm run build --force sem git', 'npm run build --force && npm test', sLimpoComFlag, 0);
  caso('J297 LIBERA git diff e npm run clean --force', 'git diff --stat && npm run clean --force', sLimpoComFlag, 0);

  // ══ J.11 ACHADOS DA SONDA DO TESTER NA 2a RODADA (fechados na 3a) ═══════
  // Os tres achados desta sonda nasceram FALHANDO (o esperado era o requisito, nao
  // o comportamento do gate) e foram fechados na 3a rodada. Ficam como regressao:
  // duas rotas de escape que tinham sobrado meio fechadas, e um falso positivo que
  // a propria correcao N8 havia introduzido.
  //
  // ACHADO-1 (J298), comentario PowerShell ANINHADO. O PowerShell aceita
  //   "<# a <# b #> #>", e o corte tira so o bloco interno, deixando um "#>"
  //   solto que o corte de comentario de LINHA entende como inicio de comentario
  //   e trunca o resto, levando junto o "-f". Confirmado por diferenca: com o
  //   bloco NAO aninhado (J222) e com o bloco aninhado mas nao fechado (J299), o
  //   gate bloqueia. So a forma aninhada e fechada escapa. Correcao provavel:
  //   repetir a remocao de bloco ate estabilizar, em vez de uma passada.
  // ACHADO-2 (J301 a J304), forma cmd.exe TOTALMENTE colada. A correcao N8 fechou
  //   "rd /s/q" (switches colados entre si), mas nao "rd/s/q" (switch colado no
  //   VERBO), que o cmd.exe tambem aceita. Causa: o detector exige espaco logo
  //   depois do nome do verbo. Mesma ressalva de sempre desta familia: cmd.exe
  //   nao e nenhuma das duas ferramentas do hook. Fica registrado porque a rota
  //   ja foi aceita como dentro do escopo quando N8 foi corrigido: meio fechada e
  //   pior do que decidida.
  // ACHADO-3 (J305 a J309), FALSO POSITIVO NOVO, criado pela correcao N8: um
  //   CAMINHO que contenha o segmento "/s" e lido como o switch recursivo do
  //   cmd. "Remove-Item C:/s/a.txt" apaga UM arquivo e e barrado, e nem precisa
  //   de flag nenhuma para isso (J306). Contraprova de que e o "/s" e nao outra
  //   coisa: com "/q" ou "/f" no mesmo lugar o comando passa (J310, J311).
  //   Correcao que fecha sem perder nada: exigir que o switch do cmd comece em
  //   fronteira de espaco, algo como (?:^|\s)\/[sSqQfF](?:\/[sSqQfF])*(?=\s|$).
  //   Isso mantem J278 a J281 bloqueados e devolve o caminho ao trabalho normal.
  grupo('J.11 ACHADOS DA 2a RODADA (fechados na 3a, ficam como regressao)');
  caso('J298 comentario PS aninhado', 'git push origin main <# a <# b #> #> -f', sLimpoComFlag, 2, DET_PUSHF);
  caso('J299 controle: aninhado nao fechado bloqueia', 'git push origin main <# a <# b #> -f', sLimpoComFlag, 2, DET_PUSHF);
  caso('J300 controle: aninhado com rm -rf bloqueia', 'rm -rf x <# a <# b #> #>', sLimpoComFlag, 2, DET_RM);
  caso('J301 rd/s/q colado no verbo', 'rd/s/q pasta', sLimpoComFlag, 2, DET_RM);
  caso('J302 rmdir/s/q colado no verbo', 'rmdir/s/q pasta', sLimpoComFlag, 2, DET_RM);
  caso('J303 del/s/q colado no verbo', 'del/s/q C:\\tmp', sLimpoComFlag, 2, DET_RM);
  caso('J304 rd/s /q meio colado', 'rd/s /q pasta', sLimpoComFlag, 2, DET_RM);
  caso('J305 caminho com /s, Remove-Item -Force', 'Remove-Item C:/s/a.txt -Force', sLimpoComFlag, 0);
  caso('J306 caminho com /s, sem flag nenhuma', 'Remove-Item C:/s/a.txt', sLimpoComFlag, 0);
  caso('J307 caminho com /s, rm -f', 'rm -f src/s/x.txt', sLimpoComFlag, 0);
  caso('J308 caminho com /s entre aspas', 'rm -f "C:/s/a.txt"', sLimpoComFlag, 0);
  caso('J309 caminho com /s, del um arquivo', 'del C:/s/a.txt', sLimpoComFlag, 0);
  caso('J310 contraprova: mesmo caminho com /q passa', 'rm -f C:/q/a.txt', sLimpoComFlag, 0);
  caso('J311 contraprova: mesmo caminho com /f passa', 'rm -f C:/f/a.txt', sLimpoComFlag, 0);
  caso('J312 contraprova: caminho src/ normal passa', 'rm -f C:/src/a.txt', sLimpoComFlag, 0);

  // ══ J.12 3a GERACAO: O TOKENIZADOR (regressao permanente) ═══════════════
  // MUDANCA ESTRUTURAL, e o motivo de este grupo existir separado dos outros. A
  // terceira auditoria do seguranca diagnosticou que as TRES geracoes de furo
  // tinham a mesma assinatura: TRANSFORMACAO DE TEXTO rodando antes de o gate
  // saber o que era citacao. Cada correcao era um replace novo, e cada replace
  // novo era um furo novo. O gate foi reescrito com UMA funcao `tokenizar()` que
  // percorre o comando uma vez e classifica cada caractere (codigo, citado,
  // comentario de linha, comentario de bloco com profundidade, substituicao).
  // `varrerForaDeCitacao`, `semComentarioDeShell` e as 4 variantes por replace
  // foram removidas; sobraram DUAS leituras, porque o bash trata "\" como escape
  // e o PowerShell nao.
  //
  // Este grupo e a regressao dessa reescrita. Se alguem voltar a "consertar" o
  // gate com um replace em cima do texto cru, e aqui que vai aparecer.
  //
  // G3-1, o "<#" CITADO apagava pedaco de comando que o shell EXECUTA. O corte de
  //   comentario de bloco nao olhava se o "<#" estava dentro de aspas, entao
  //   `echo "<#" ; rm -rf build/ ; echo "#>"` perdia o miolo, que e justamente o
  //   comando destrutivo, e o gate liberava.
  grupo('J.12 3a GERACAO, TOKENIZADOR (limpo + flag da frente)');
  caso('J313 G1 bloco citado com aspas duplas', 'Write-Output "<#" ; rm -rf build/ ; Write-Output "#>"', sLimpoComFlag, 2, DET_RM);
  caso('J314 G1 bloco citado com aspas simples', "echo '<#' ; rm -rf build/ ; echo '#>'", sLimpoComFlag, 2, DET_RM);
  caso('J315 G1 bloco citado escondendo push --force', 'git commit -m "<#" ; git push --force ; git commit -m "#>"', sLimpoComFlag, 2, DET_PUSHF);
  caso('J316 G1 bloco citado escondendo firestore:delete', "echo '<#' ; firebase firestore:delete ; echo '#>'", sLimpoComFlag, 2, DET_FSDEL);
  caso('J317 G1 bloco citado escondendo reset --hard', 'grep "<#" a.txt ; git reset --hard ; grep "#>" a.txt', sLimpoComFlag, 2, DET_RESET);
  caso('J318 G1 LIBERA comentario de bloco de verdade', 'git push origin main <# nota do autor #>', sLimpoComFlag, 0);
  // Vizinhanca do G3-1 (sonda do tester): marcador citado sozinho, bloco citado
  // completo, e aninhamento de TRES niveis.
  caso('J319 G1 so o "<#" citado, com &&', 'echo "<#" && rm -rf x', sLimpoComFlag, 2, DET_RM);
  caso('J320 G1 so o "#>" citado', "echo '#>' ; rm -rf x", sLimpoComFlag, 2, DET_RM);
  caso('J321 G1 bloco citado completo', 'echo "<# a #>" ; rm -rf x', sLimpoComFlag, 2, DET_RM);
  caso('J322 G1 aninhamento de tres niveis', 'git push origin main <# a <# b <# c #> #> #> -f', sLimpoComFlag, 2, DET_PUSHF);
  caso('J323 G1 tres niveis com rm -rf', 'rm -rf x <# a <# b <# c #> #> #>', sLimpoComFlag, 2, DET_RM);

  // G3-2, paridade GLOBAL de aspas: contar aspas antes de varrer fazia uma aspa de
  //   um tipo DENTRO de uma regiao citada do outro tipo desligar o primeiro tipo e
  //   reabrir o corte no meio do comando. Agora a decisao vem da varredura.
  caso('J324 G2 aspa dupla dentro de simples', 'rm \'a"b\' "c|d" -rf', sLimpoComFlag, 2, DET_RM);
  caso('J325 G2 aspa simples dentro de dupla', 'rm "a\'b" \'c|d\' -rf', sLimpoComFlag, 2, DET_RM);
  caso('J326 G2 separador ; dentro da citacao', 'rm \'a"b\' "c;d" -rf', sLimpoComFlag, 2, DET_RM);
  caso('J327 G2 dois -m e rm -rf depois', 'git commit -m \'a"b\' -m "x #1" && rm -rf y', sLimpoComFlag, 2, DET_RM);
  caso('J328 G2 dois -m e push --force depois', 'git commit -m \'a"b\' -m "v #2" && git push --force', sLimpoComFlag, 2, DET_PUSHF);
  caso('J329 G2 LIBERA apostrofo de texto (controle)', "echo it's ok # rm -rf build/", sLimpoComFlag, 0);
  // Vizinhanca do G3-2 (sonda do tester): o ESCAPE DO POWERSHELL e o acento grave,
  // nao a barra invertida. E o gemeo exato do furo da aspa escapada, no outro
  // shell: se o tokenizador nao tratasse o acento grave como escape, a aspa
  // escapada fecharia a citacao antes da hora e o "-rf" cairia fora da janela.
  caso('J330 G2 aspa escapada com acento grave', 'rm "a' + BT + '"|b" -rf', sLimpoComFlag, 2, DET_RM);
  caso('J331 G2 acento grave e novo comando', 'rm "a' + BT + '"; rm -rf x', sLimpoComFlag, 2, DET_RM);
  caso('J332 G2 acento grave no Remove-Item', 'Remove-Item "a' + BT + '"|b" -Recurse -Force', sLimpoComFlag, 2, DET_RM);
  caso('J333 G2 acento grave no push', 'git push origin "a' + BT + '"|b" -f', sLimpoComFlag, 2, DET_PUSHF);
  caso('J334 G2 aspa dupla aberta e nunca fechada', 'echo "abre ; rm -rf build/', sLimpoComFlag, 2, DET_RM);
  caso('J335 G2 aspa simples aberta e nunca fechada', "echo 'abre ; rm -rf build/", sLimpoComFlag, 2, DET_RM);
  caso('J336 G2 aspa aberta escondendo push --force', 'git commit -m "abre && git push --force', sLimpoComFlag, 2, DET_PUSHF);
  caso('J337 G2 aspa solta e reset --hard depois', "git commit -m 'aspa \" solta' && git reset --hard", sLimpoComFlag, 2, DET_RESET);
  caso('J338 G2 marcadores no texto e rm -rf depois', 'git commit -m "usa <# e #> no texto" && rm -rf x', sLimpoComFlag, 2, DET_RM);
  // Comentario de linha: o "#" citado ou dentro de substituicao NAO corta, e o "#"
  // de verdade corta so o que vem DEPOIS dele.
  caso('J339 G2 # dentro de substituicao nao corta', 'git push origin main $(echo "#") --force', sLimpoComFlag, 2, DET_PUSHF);
  caso('J340 G2 # citado nao corta o clean -fd', 'echo "#" ; git clean -fd', sLimpoComFlag, 2, DET_CLEAN);
  caso('J341 G2 comentario DEPOIS do --force', 'git push origin main --force # comentario depois', sLimpoComFlag, 2, DET_PUSHF);
  caso('J342 G2 comentario DEPOIS do rm -rf', 'rm -rf x # comentario depois', sLimpoComFlag, 2, DET_RM);
  caso('J343 G2 LIBERA substituicao antes do comentario', 'echo $(date) # rm -rf x', sLimpoComFlag, 0);
  caso('J344 G2 acento grave solto antes do rm -rf', 'echo ' + BT + '" ; rm -rf x', sLimpoComFlag, 2, DET_RM);

  // G3-3, "/s" dentro de caminho POSIX era switch do cmd. Falso positivo que a
  //   correcao do cmd.exe havia criado; a ancora agora exige fronteira de espaco.
  caso('J345 G3 LIBERA caminho /var/s', 'rm -f /var/s/app.log', sLimpoComFlag, 0);
  caso('J346 G3 LIBERA caminho terminando em /s', 'rm -f dist/s', sLimpoComFlag, 0);
  caso('J347 G3 LIBERA /s no meio de caminho longo', 'rm -f cache/https/s/x.json', sLimpoComFlag, 0);
  caso('J348 G3 LIBERA /etc/s', 'rm -f /etc/s', sLimpoComFlag, 0);
  caso('J349 G3 LIBERA Remove-Item em /var/s', 'Remove-Item /var/s/x.log -Force', sLimpoComFlag, 0);
  caso('J350 G3 LIBERA /s duas vezes no caminho', 'rm -f a/s/b/s/c.txt', sLimpoComFlag, 0);
  // E o switch de verdade, que continua sendo switch mesmo depois do caminho.
  caso('J351 G3 switch /s depois do alvo', 'rd pasta /s', sLimpoComFlag, 2, DET_RM);
  caso('J352 G3 switch /s /q depois do alvo', 'rd pasta /s /q', sLimpoComFlag, 2, DET_RM);

  // G3-4, conjunto de letras do agrupamento. Errou nos DOIS sentidos, cada erro
  //   custando uma rodada: estreito demais deixou `git push -uf` escapar (furo
  //   pego por esta suite), largo demais barrou parametro real do PowerShell com
  //   "r" e "f" no meio (`-Format`, `-Prefix`, `-NoProfile`).
  caso('J353 G4 LIBERA -Force -Format', 'Remove-Item -Force -Format x a.txt', sLimpoComFlag, 0);
  caso('J354 G4 LIBERA -Force -Prefix', 'Remove-Item -Force -Prefix p a.txt', sLimpoComFlag, 0);
  caso('J355 G4 LIBERA -NoProfile com cano que le', 'powershell -NoProfile -Command "Get-ChildItem C:\\tmp | Remove-Item -Force"', sLimpoComFlag, 0);
  caso('J356 G4 LIBERA -Force -Filter', 'Remove-Item -Force -Filter *.log a.txt', sLimpoComFlag, 0);
  caso('J357 G4 LIBERA -Force -ErrorAction', 'Remove-Item -Force -ErrorAction SilentlyContinue a.txt', sLimpoComFlag, 0);
  caso('J358 G4 LIBERA -Force -Verbose', 'Remove-Item -Force -Verbose a.txt', sLimpoComFlag, 0);
  caso('J359 G4 LIBERA -NoProfile -File', 'powershell -NoProfile -File x.ps1', sLimpoComFlag, 0);
  caso('J360 G4 -Force -Recurse continua bloqueando', 'Remove-Item -Force -Recurse a.txt', sLimpoComFlag, 2, DET_RM);
  caso('J361 G4 abreviacao -rec -for bloqueia', 'Remove-Item -rec -for x', sLimpoComFlag, 2, DET_RM);
  // Matriz do agrupamento: cada letra CURTA que rm, git push e git clean aceitam
  // de verdade, junto do "f" ou do "r". O conjunto tem que cobrir todas.
  caso('J362 G4 push -qf', 'git push -qf origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J363 G4 push -nf', 'git push -nf origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J364 G4 push -vf', 'git push -vf origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J365 G4 push -df', 'git push -df origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J366 G4 clean -ff (force duplo)', 'git clean -ff', sLimpoComFlag, 2, DET_CLEAN);
  caso('J367 G4 clean -Xf', 'git clean -Xf', sLimpoComFlag, 2, DET_CLEAN);
  caso('J368 G4 rm -Rfv', 'rm -Rfv x', sLimpoComFlag, 2, DET_RM);
  caso('J369 G4 rm -fIr', 'rm -fIr x', sLimpoComFlag, 2, DET_RM);
  // O "-o" do git push (push option) EXIGE valor, e opcao curta com valor
  // obrigatorio CONSOME O RESTO DO TOKEN como o valor. Provado read-only pelo
  // analogo `git log -n1 --oneline`, que sai 0 (o "-n" tambem exige valor e "n1"
  // significa n=1). Consequencia para a leitura de agrupamento:
  //   - "-of"  = --push-option=f   -> NAO tem force, tem que LIBERAR (J370);
  //   - "-ufo" = -u -f -o <valor>  -> o "f" vem ANTES do "o", e force (J415);
  //   - "-uof" = -u -o "f"         -> o "f" e VALOR, nao flag, e libera (J416).
  // Este ponto tambem oscilou no meio da rodada: numa versao o "o" entrou no
  // conjunto de letras e o "-of" passou a bloquear (falso positivo pequeno), e a
  // versao final trata o "-o" como truncador do grupo, que e a semantica real do
  // git e resolve os dois lados. A matriz do -o esta no grupo J.14, J419 a J424.
  //   - "z" ficou fora do conjunto com razao: o git recusa "-z" no push ("error:
  //     unknown switch `z'", medido pelo tester), entao nao ha force a barrar ali.
  caso('J370 G4 LIBERA push -of (o "f" e valor do -o)', 'git push -of origin main', sLimpoComFlag, 0);
  caso('J371 G4 push -zf, LIBERA (o git recusa -z)', 'git push -zf origin main', sLimpoComFlag, 0);

  // G3-5, digito no agrupamento. A premissa (o git agrupa "-4f" como
  // "--ipv4 --force") estava ASSUMIDA e o tester a PROVOU localmente, sem executar
  // push nenhum, com git 2.53.0.windows.2:
  //   (a) `git push -h` lista "-4, --ipv4", "-6, --ipv6" e "-f, --force" como
  //       opcoes curtas (saida de USO, nao contata remoto);
  //   (b) `git status -sb` sai 0, provando que o parse-options do git agrupa
  //       opcao curta (comando de leitura, nao muda nada);
  //   (c) `git push -4f -h` sai pelo texto de USO, SEM "unknown switch", enquanto
  //       o controle `git push -zf -h` responde "error: unknown switch `z'". O
  //       "-h" faz o parse-options imprimir o uso e sair ANTES do corpo do
  //       comando, e o sandbox nao tinha remoto nenhum configurado: nenhum push
  //       aconteceu em nenhum momento.
  // Conclusao: bloquear "-4f" nao e so fail-closed, e correto. O digito no
  // conjunto de agrupamento esta certo.
  caso('J372 G5 push -4f (ipv4 + force)', 'git push -4f origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J373 G5 push -6f (ipv6 + force)', 'git push -6f origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J374 G5 push -f4 (ordem trocada)', 'git push -f4 origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J375 G5 push -46f (dois digitos)', 'git push -46f origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J376 G5 push -4 -f (separadas)', 'git push -4 -f origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J377 G5 LIBERA git log -1', 'git log -1 --oneline', sLimpoComFlag, 0);

  // G3-6, "--cached" DEPOIS de um "--" solto e pathspec, nao opcao: o git passa a
  //   tratar tudo como caminho, entao a remocao volta a ser do DISCO.
  caso('J378 G6 --cached depois do -- bloqueia', 'git rm -r -- --cached src/', sLimpoComFlag, 2, DET_RM);
  caso('J379 G6 --staged depois do -- bloqueia', 'git rm -r -- --staged src/', sLimpoComFlag, 2, DET_RM);
  caso('J380 G6 git rm -rf -- <path> bloqueia', 'git rm -rf -- src/', sLimpoComFlag, 2, DET_RM);
  caso('J381 G6 LIBERA --cached antes do --', 'git rm -r --cached -- src/', sLimpoComFlag, 0);
  caso('J382 G6 LIBERA --staged (sinonimo)', 'git rm -r --staged node_modules', sLimpoComFlag, 0);

  // Nao-regressao da tokenizacao em si: escape do bash, o "\" que NAO e escape
  // (caminho qualificado do PowerShell), substituicao com separador dentro, e o
  // "#" entre aspas. Cada um destes ja foi furo em alguma rodada.
  caso('J383 TK escape do bash no verbo', 'firebase firestore\\:delete --all-collections', sLimpoComFlag, 2, DET_FSDEL);
  caso('J384 TK escape do bash no binario', 'r\\m -rf build/', sLimpoComFlag, 2, DET_RM);
  caso('J385 TK barra que NAO e escape', 'Microsoft.PowerShell.Management\\Remove-Item -Recurse -Force C:\\tmp\\x', sLimpoComFlag, 2, DET_RM);
  caso('J386 TK aspa escapada com barra', 'rm "a\\"|b" -rf', sLimpoComFlag, 2, DET_RM);
  caso('J387 TK separador dentro de $( )', 'git -C $(ls|head -1) push -f', sLimpoComFlag, 2, DET_PUSHF);
  caso('J388 TK # entre aspas nao corta', 'git commit -m "fix #123" && rm -rf x', sLimpoComFlag, 2, DET_RM);
  caso('J389 TK LIBERA Get-ChildItem -Force', 'Get-ChildItem C:/stuff -Force', sLimpoComFlag, 0);
  caso('J390 TK LIBERA Remove-Item um arquivo', 'Remove-Item C:/stuff/a.txt -Force', sLimpoComFlag, 0);
  caso('J391 TK heredoc sem aspas, rm depois', 'cat <<EOF\nnada\nEOF\nrm -rf x', sLimpoComFlag, 2, DET_RM);
  caso('J392 TK LIBERA heredoc sem verbo dentro', 'cat <<EOF\nnada\nEOF', sLimpoComFlag, 0);

  // ══ J.13 ACHADO DA 3a RODADA DO TESTER ══════════════════════════════════
  // UM achado novo, e um menor do que os das rodadas anteriores. NAO AJUSTE O
  // ESPERADO PARA OBTER VERDE.
  //
  // ACHADO, falso positivo: o gate le "-Recurse" e ignora o sufixo ":$false", que
  // no PowerShell DESLIGA o parametro. `Remove-Item -Force -Recurse:$false a.txt`
  // apaga UM arquivo, explicitamente sem recursao, e e barrado. As quatro formas
  // do sufixo caem igual (J393 a J396).
  // Repare que `-Confirm:$false` passa (J127), mas por outro motivo: "confirm"
  // esta em PARAMS_INOFENSIVOS. O gate nao entende o sufixo, so nao se importa com
  // aquele parametro. A negacao em si nunca foi lida.
  // CORRECAO ESTREITA: token que casa /^-[A-Za-z][\w-]*:\$false$/i e parametro
  // DESLIGADO, entao nao conta como recursivo nem como forcado. J397 a J399 sao a
  // trava dessa correcao: ":$true" e o parametro sem sufixo nao podem afrouxar.
  // PESO: menor. Escrever ":$false" a mao e raro; aparece quando um script repassa
  // um parametro adiante. Fica registrado porque o custo de fechar e baixo e a
  // direcao e a mesma que o diretor pediu, nao travar trabalho legitimo.
  grupo('J.13 ACHADO DA 3a RODADA (fechado na propria rodada, fica regressao)');
  caso('J393 LIBERA -Recurse:$false depois do -Force', 'Remove-Item -Force -Recurse:$false a.txt', sLimpoComFlag, 0);
  caso('J394 LIBERA -Recurse:$false antes do -Force', 'Remove-Item -Recurse:$false -Force a.txt', sLimpoComFlag, 0);
  caso('J395 LIBERA -Recurse:$False (caixa alta)', 'Remove-Item -Force -Recurse:$False a.txt', sLimpoComFlag, 0);
  caso('J396 LIBERA -Recurse:$false sem -Force', 'Remove-Item a.txt -Recurse:$false', sLimpoComFlag, 0);
  caso('J397 trava: -Recurse:$true continua bloqueando', 'Remove-Item -Force -Recurse:$true x', sLimpoComFlag, 2, DET_RM);
  caso('J398 trava: -Recurse sem sufixo bloqueia', 'Remove-Item -Force -Recurse x', sLimpoComFlag, 2, DET_RM);
  caso('J399 trava: -Force:$true com -Recurse bloqueia', 'Remove-Item -Recurse -Force:$true x', sLimpoComFlag, 2, DET_RM);
  caso('J400 contraprova: sem verbo de remocao, LIBERA', 'Get-ChildItem -Recurse:$false C:/x', sLimpoComFlag, 0);
  // CUSTO ACEITO, da mesma familia do J.7 e registrado aqui porque a sonda desta
  // rodada passou por ele: o corpo de um heredoc e DADO, nao comando, e mesmo
  // assim o verbo citado ali bloqueia. Nao e achado novo, e a mesma decisao que o
  // coordenador levou ao diretor. Esperado = comportamento atual.
  caso('J401 custo aceito: verbo no corpo de heredoc', "cat <<'EOF'\nrm -rf x\nEOF", sLimpoComFlag, 2, DET_RM);
  caso('J402 custo aceito: verbo em string de node -e', 'node -e "const s=\'rm -rf x\'"', sLimpoComFlag, 2, DET_RM);

  // ══ J.14 AJUSTE TARDIO DA 3a RODADA (skip do verbo so-do-cmd, e o "-o") ══
  // O gate mudou DE NOVO no meio desta rodada (impressao 1808518e5035 ->
  // 8a1ef9624043) e duas mudancas alteraram vereditos que esta suite ja tinha
  // fixado. Os dois casos viraram FALHA na hora, que e o comportamento correto da
  // suite: mudanca de veredito aparece, nao passa batido. Depois de conferir, os
  // dois estao CERTOS e o esperado foi atualizado com a evidencia no comentario
  // (J173 no grupo J.6, J370 no J.12). Este grupo guarda o que NAO pode ceder
  // junto.
  //
  // (a) J403 a J418: o skip do verbo que existe so no cmd.exe (rd, rmdir, del,
  //     erase) quando vem depois de barra ou aspa. O skip e seguro porque esses
  //     verbos sao builtin do cmd e nao existem como binario invocavel por
  //     caminho (medido: `where del`, `where rd`, `where erase` nao acham nada; o
  //     unico que existe e o rmdir.exe do GNU, que so apaga diretorio vazio).
  //     Mas as rotas em que esses mesmos verbos RODAM DE VERDADE passam por
  //     dentro de uma string de outro shell, e ali o tokenizador ja tirou as
  //     aspas, entao o verbo fica em posicao de comando e continua barrado. Sao
  //     estes casos. Se alguem "simplificar" o skip, eles caem.
  grupo('J.14 AJUSTE TARDIO DA 3a RODADA (limpo + flag da frente)');
  caso('J403 cmd /c com del entre aspas', 'cmd /c "del /s /q C:\\tmp\\x"', sLimpoComFlag, 2, DET_RM);
  caso('J404 cmd.exe /c com rd entre aspas', 'cmd.exe /c "rd /s /q C:\\tmp"', sLimpoComFlag, 2, DET_RM);
  caso('J405 cmd /c com rmdir entre aspas', 'cmd /c "rmdir /s /q C:\\tmp"', sLimpoComFlag, 2, DET_RM);
  caso('J406 cmd /c com del SEM aspas', 'cmd /c del /s /q C:\\tmp\\x', sLimpoComFlag, 2, DET_RM);
  caso('J407 powershell -Command com del (apelido)', 'powershell -Command "del -Recurse -Force C:\\tmp"', sLimpoComFlag, 2, DET_RM);
  caso('J408 powershell -Command com rd (apelido)', 'powershell -Command "rd -Recurse -Force C:\\tmp"', sLimpoComFlag, 2, DET_RM);
  caso('J409 pwsh -c com erase (apelido)', 'pwsh -c "erase -Recurse -Force C:\\tmp"', sLimpoComFlag, 2, DET_RM);
  caso('J410 nome do verbo entre aspas simples', "'del' -Recurse -Force C:\\tmp", sLimpoComFlag, 2, DET_RM);
  caso('J411 nome do verbo entre aspas duplas', '"rd" /s /q C:\\tmp', sLimpoComFlag, 2, DET_RM);
  caso('J412 LIBERA rd como segmento de caminho', 'rm -f cache/rd/s', sLimpoComFlag, 0);
  caso('J413 LIBERA del como segmento de caminho', 'rm -f cache/del/s', sLimpoComFlag, 0);
  caso('J414 LIBERA leitura de arquivo em pasta rd', 'cat logs/rd/s.txt', sLimpoComFlag, 0);
  caso('J415 LIBERA erase como segmento de caminho', 'rm -f a/erase/s', sLimpoComFlag, 0);
  caso('J416 LIBERA ls em pasta rmdir', 'ls cache/rmdir/s', sLimpoComFlag, 0);
  // O outro lado do mesmo par: INVOCACAO por caminho continua sendo invocacao.
  caso('J417 rd por caminho absoluto, BLOQUEIA', '/usr/bin/rd -Recurse -Force x', sLimpoComFlag, 2, DET_RM);
  caso('J418 rmdir.exe por caminho, BLOQUEIA', 'C:/Program Files/Git/usr/bin/rmdir.exe -rf x', sLimpoComFlag, 2, DET_RM);
  // (b) O "-o" como TRUNCADOR do grupo, que e a semantica real do git: tudo depois
  //     do "o" e o VALOR da push option, nao flag. A matriz completa, para ninguem
  //     "simplificar" isso de novo em nenhuma das duas direcoes.
  caso('J419 push -ufo <valor>, f ANTES do o, BLOQUEIA', 'git push -ufo ci.skip origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J420 push -fo <valor>, f antes do o, BLOQUEIA', 'git push -fo x origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J421 LIBERA push -uof (f e valor do -o)', 'git push -uof origin main', sLimpoComFlag, 0);
  caso('J422 LIBERA push -ofu (fu e valor do -o)', 'git push -ofu origin main', sLimpoComFlag, 0);
  caso('J423 LIBERA push -o <valor> sem force', 'git push -o ci.skip origin main', sLimpoComFlag, 0);
  caso('J424 push -uf continua BLOQUEANDO', 'git push -uf origin main', sLimpoComFlag, 2, DET_PUSHF);
  // (c) A negacao ":$false" nao pode virar passe livre para o ":$true" nem para o
  //     parametro sem sufixo (trava da correcao do achado J393 a J396).
  caso('J425 -Recurse -Force:$false BLOQUEIA', 'Remove-Item -Recurse -Force:$false x', sLimpoComFlag, 2, DET_RM);

  // ══ J.15 5a GERACAO: ASPA SIMPLES, ACENTO GRAVE E A PILHA (regressao) ════
  // Os dois furos desta geracao tem a MESMA raiz: as producoes de "$(" e de acento
  // grave foram subidas para antes do ramo de aspa SEM CONDICAO.
  //  - G5-1, falso NEGATIVO grave: em aspas SIMPLES nenhum shell substitui nada,
  //    entao um "$(" ou um acento grave IMPAR dentro de aspas simples zerava o
  //    estado de citacao, e um "#" de dentro da string passava a abrir comentario
  //    de linha, descartando o resto da linha junto com o verbo destrutivo.
  //  - G5-2, falso POSITIVO: o acento grave dentro de aspas DUPLAS e ESCAPE no
  //    PowerShell (`n e nova linha, uso de todo dia), e tratado como substituicao
  //    fundia comandos encadeados numa janela so.
  //
  // A SEMANTICA DE SHELL destes casos foi MEDIDA, nao suposta (bash 5.2.37 do Git
  // for Windows, payload inerte `echo MARCADOR` no lugar do verbo destrutivo):
  //   'a$(b #c'  e  'a`b #c'  em aspas SIMPLES  -> o bash EXECUTA o comando
  //      seguinte (MARCADOR saiu), logo bloquear e OBRIGATORIO, nao precaucao;
  //   "a$(b #c"  em aspas DUPLAS -> o bash RECUSA ("unexpected EOF while looking
  //      for matching"), logo liberar e seguro: nao ha comando a rodar.
  // Essa e a diferenca que sustenta o par J426/J433 e ela e observavel, o que
  // significa que uma regressao aqui pode ser conferida com um comando inerte.
  grupo('J.15 5a GERACAO: aspa simples, acento grave e pilha (limpo + flag)');
  caso('J426 G51 $( impar em aspas simples, rm -rf', "echo 'a$(b #c' ; rm -rf build/", sLimpoComFlag, 2, DET_RM);
  caso('J427 G51 acento grave impar em aspas simples', "echo 'a" + BT + "b #c' ; rm -rf build/", sLimpoComFlag, 2, DET_RM);
  caso('J428 G51 $( impar e push --force', "git commit -m 'fix $(x #1' && git push --force", sLimpoComFlag, 2, DET_PUSHF);
  caso('J429 G51 acento grave impar e push --force', "git commit -m 'usa " + BT + "flag #1' && git push --force", sLimpoComFlag, 2, DET_PUSHF);
  caso('J430 G51 $( impar e firestore:delete', "echo 'nota $(x #1' ; firebase firestore:delete", sLimpoComFlag, 2, DET_FSDEL);
  caso('J431 G51 acento grave impar e reset --hard', "echo 'char " + BT + " aqui #1' ; git reset --hard", sLimpoComFlag, 2, DET_RESET);
  caso('J432 G51 $( impar e hosting:disable', "echo 'x $(y #1' ; firebase hosting:disable", sLimpoComFlag, 2, DET_DISAB);
  caso('J433 G51 LIBERA $( balanceado (awk)', "awk '{print $(NF)}' f.txt ; rm -f a.txt", sLimpoComFlag, 0);
  caso('J434 G51 LIBERA acento grave PAR', "echo 'usa " + BT + "x" + BT + " #1' ; rm -f a.txt", sLimpoComFlag, 0);
  caso('J435 G51 LIBERA $( impar em aspas DUPLAS', 'echo "a$(b #c" ; rm -rf build/', sLimpoComFlag, 0);
  caso('J436 G52 LIBERA `n dentro de aspas duplas', 'rm -f "log' + BT + 'nx.txt" ; Get-ChildItem -Recurse .', sLimpoComFlag, 0);
  caso('J437 G52 LIBERA acento grave em mensagem', 'git status ; git commit -m "char ' + BT + ' aqui" ; npm run clean --force', sLimpoComFlag, 0);
  caso('J438 G52 LIBERA $( citado e rm -f depois', "grep -n '$(' x.js ; rm -f tmp.log ; ls -R dist", sLimpoComFlag, 0);
  caso('J439 G52 LIBERA acento grave solto e rm -f', 'echo ' + BT + ' ; rm -f tmp.log ; ls -R dist', sLimpoComFlag, 0);
  // A PILHA de citacao: substituicao abre contexto NOVO, inclusive dentro de
  // aspas, e a aspa de dentro nao fecha a de fora. Sem pilha, a aspa interna
  // fechava a externa e dali em diante o separador voltava a cortar janela.
  caso('J440 PILHA aspas dentro de $( )', 'rm "$(echo "a|b")" -rf', sLimpoComFlag, 2, DET_RM);
  caso('J441 PILHA printf com # dentro de $( )', 'git commit -m "$(printf "fix #1")" && git push --force', sLimpoComFlag, 2, DET_PUSHF);
  caso('J442 PILHA $( ) e firestore:delete depois', 'echo "$(printf "nota #1")" ; firebase firestore:delete', sLimpoComFlag, 2, DET_FSDEL);
  caso('J443 PILHA dirname aninhado', 'rm "$(dirname "$0")/build" -rf', sLimpoComFlag, 2, DET_RM);
  caso('J444 PILHA verbo dentro de acento grave', 'echo ' + BT + 'git push --force' + BT, sLimpoComFlag, 2, DET_PUSHF);
  // Marcadores de comentario de bloco em posicao INERTE para o shell: em aspas,
  // escapados, em $'...' e em printf. Todos tem que continuar bloqueando, porque
  // o shell NAO abre comentario nenhum ali e o verbo do meio roda.
  caso('J445 marcador em $\'...\' (ANSI-C)', "echo $'<#' ; rm -rf x ; echo $'#>'", sLimpoComFlag, 2, DET_RM);
  caso('J446 marcador escapado com barra', 'echo \\<\\# ; rm -rf x ; echo \\#\\>', sLimpoComFlag, 2, DET_RM);
  caso('J447 marcador em aspas duplas', 'echo "<#" ; rm -rf x ; echo "#>"', sLimpoComFlag, 2, DET_RM);
  caso('J448 marcador em aspas simples', "echo '<#' ; rm -rf x ; echo '#>'", sLimpoComFlag, 2, DET_RM);
  caso('J449 marcador via printf', 'printf %s "<#" ; rm -rf x ; printf %s "#>"', sLimpoComFlag, 2, DET_RM);
  caso('J450 marcador partido por acento grave', 'echo ' + BT + '<' + BT + '# ; rm -rf x', sLimpoComFlag, 2, DET_RM);

  // ══ J.16 ATAQUE AO MECANISMO DE DESCARTAR LEITURA MALFORMADA ════════════
  // Pedido explicito do coordenador, porque e uma decisao de NAO OLHAR: a leitura
  // que termina com substituicao ABERTA e considerada a leitura do shell errado e
  // e descartada. A pergunta e se da para forjar comando que um shell EXECUTA e
  // cuja leitura correspondente o gate descarta.
  //
  // RESULTADO DO ATAQUE: o mecanismo AGUENTOU, nas 12 formas abaixo, e o motivo e
  // estrutural, nao sorte:
  //  (a) substituicao aberta e ERRO DE SINTAXE nos dois shells. Medido: `echo ` e
  //      `echo $(` fazem o bash recusar com "unexpected EOF"/"syntax error". Logo a
  //      leitura descartada corresponde mesmo a um shell que NAO executaria.
  //  (b) a assimetria de escape puxa para o lado certo: o que mata a leitura bash
  //      (acento grave solto) e justamente o que o PowerShell trata como escape, e
  //      vice-versa. A leitura que sobra e a do shell que rodaria.
  //  (c) quando o verbo vem depois de um escape que COLA o nome (r`m, -`f), a
  //      leitura sobrevivente le o verbo colado e bloqueia.
  //  (d) as duas leituras malformadas -> as duas valem (fail-closed), J457 a J460.
  // O furo que eu achei nesta rodada NAO e deste mecanismo: as duas leituras do
  // caso do heredoc sao BEM FORMADAS, elas so estao erradas sobre o que e DADO.
  // Ver J.17. Vale registrar a distincao: o mecanismo que mais preocupava passou.
  grupo('J.16 ATAQUE AO DESCARTE DE LEITURA MALFORMADA (aguentou)');
  caso('J451 acento grave escapado, bash executa', 'echo \\' + BT + ' ; rm -rf x', sLimpoComFlag, 2, DET_RM);
  caso('J452 acento grave escapado em aspas duplas', 'echo "\\' + BT + '" ; rm -rf x', sLimpoComFlag, 2, DET_RM);
  caso('J453 escape do PS colando o nome do verbo', 'r' + BT + 'm -rf x', sLimpoComFlag, 2, DET_RM);
  caso('J454 escape do PS colando Remove-Item', 'Remove-Ite' + BT + 'm -Recurse -Force x', sLimpoComFlag, 2, DET_RM);
  caso('J455 escape do PS colando a flag -f', 'git push -' + BT + 'f origin main', sLimpoComFlag, 2, DET_PUSHF);
  caso('J456 $( escapado com barra', 'echo \\$( ; rm -rf x', sLimpoComFlag, 2, DET_RM);
  caso('J457 $( solto: as duas leituras malformadas', 'echo $( ; rm -rf x', sLimpoComFlag, 2, DET_RM);
  caso('J458 $( solto duas vezes', 'echo $(echo $( ; rm -rf x', sLimpoComFlag, 2, DET_RM);
  caso('J459 acento grave solto', 'echo ' + BT + ' ; rm -rf x', sLimpoComFlag, 2, DET_RM);
  caso('J460 tres acentos graves (impar)', 'echo ' + BT + BT + BT + ' ; rm -rf x', sLimpoComFlag, 2, DET_RM);
  caso('J461 substituicao aberta DEPOIS do verbo', 'rm -rf x ; echo $(', sLimpoComFlag, 2, DET_RM);
  caso('J462 acento grave aberto DEPOIS do verbo', 'rm -rf x ; echo ' + BT, sLimpoComFlag, 2, DET_RM);

  // ══ J.17 ACHADO DA 4a RODADA: HEREDOC (esperado = REQUISITO; FALHA hoje) ═
  // NAO AJUSTE O ESPERADO PARA OBTER VERDE.
  //
  // O QUE E: o corpo de um heredoc e DADO, nao codigo. O bash nao interpreta nada
  // ali dentro quando o delimitador esta entre aspas, e mesmo sem aspas ele nao
  // enxerga "#" como comentario nem "<#" como bloco. O tokenizador modela aspa,
  // comentario e substituicao, mas NAO modela heredoc, entao um "<#" no corpo de um
  // heredoc ABRE comentario de bloco, um "#>" no corpo de um heredoc POSTERIOR o
  // FECHA, e tudo que esta entre os dois desaparece da leitura, inclusive o comando
  // destrutivo. Exit 0.
  //
  // E EXECUTAVEL, MEDIDO, NAO DEDUZIDO. Com o verbo trocado por um payload inerte,
  // o bash 5.2.37 do Git for Windows imprimiu:
  //     <#
  //     MARCADOR_EXECUTOU
  //     #>
  // ou seja, os dois corpos saem como texto e o comando do meio RODA. Trocando o
  // payload pelo verbo destrutivo, ele roda igual e o gate devolve 0.
  //
  // SUPERFICIE, medida variante por variante: vale para TODA forma de heredoc,
  // <<EOF, <<'EOF', <<"EOF", <<-EOF, delimitador proprio, forma de uma linha so com
  // ";", e heredoc alimentando outro comando. NAO vale para o here-string <<< do
  // bash nem para os here-strings @'...'@ e @"..."@ do PowerShell, que ja bloqueiam
  // (J477 a J479): nesses tres a citacao que o gate ja modela cobre o corpo.
  //
  // RAIZ, e por que ela e a MESMA do G5-1 desta rodada: a correcao do G5-1 foi
  // "marcador dentro de regiao CITADA nao abre comentario". O corpo de heredoc e a
  // ultima especie de regiao citada que o tokenizador nao conhece. Nao e mecanismo
  // novo que falta, e o mecanismo que existe aplicado a mais um caso.
  // DIRECAO DE CORRECAO (o gate e do coordenador, eu so reporto): ao ver
  // `<<` + `-`? + aspa? + DELIM, marcar como CITADO tudo da proxima quebra de linha
  // ate a linha igual ao delimitador. Reusa o estado que ja existe, nao acrescenta
  // mecanismo, e nao encosta na leitura de flag. Os controles J470 a J476 sao a
  // trava dessa correcao: heredoc legitimo tem que continuar passando, e verbo NO
  // CORPO do heredoc tem que continuar bloqueando (custo aceito do J.7, J401).
  grupo('J.17 ACHADO DA 4a RODADA: heredoc (esperado = REQUISITO; FALHA hoje)');
  caso('J463 GAP heredoc <<\'EOF\', par de marcadores', "cat <<'EOF'\n<#\nEOF\nrm -rf build/\ncat <<'EOF'\n#>\nEOF", sLimpoComFlag, 2, DET_RM);
  caso('J464 GAP heredoc <<EOF (sem aspas)', 'cat <<EOF\n<#\nEOF\nrm -rf build/\ncat <<EOF\n#>\nEOF', sLimpoComFlag, 2, DET_RM);
  caso('J465 GAP heredoc <<"EOF"', 'cat <<"EOF"\n<#\nEOF\nrm -rf build/\ncat <<"EOF"\n#>\nEOF', sLimpoComFlag, 2, DET_RM);
  caso('J466 GAP heredoc <<-EOF', 'cat <<-EOF\n<#\nEOF\nrm -rf build/\ncat <<-EOF\n#>\nEOF', sLimpoComFlag, 2, DET_RM);
  caso('J467 GAP heredoc com delimitador proprio', 'cat <<FIM\n<#\nFIM\nrm -rf build/\ncat <<FIM\n#>\nFIM', sLimpoComFlag, 2, DET_RM);
  caso('J468 GAP heredoc numa linha so, com ;', "cat <<'EOF'\n<#\nEOF ; rm -rf build/ ; cat <<'EOF'\n#>\nEOF", sLimpoComFlag, 2, DET_RM);
  caso('J469 GAP heredoc alimentando outro comando', "grep x <<'EOF'\n<#\nEOF\nrm -rf build/\ngrep x <<'EOF'\n#>\nEOF", sLimpoComFlag, 2, DET_RM);
  caso('J470 GAP heredoc escondendo push --force', "cat <<'EOF'\n<#\nEOF\ngit push --force\ncat <<'EOF'\n#>\nEOF", sLimpoComFlag, 2, DET_PUSHF);
  caso('J471 GAP heredoc escondendo firestore:delete', "cat <<'EOF'\n<#\nEOF\nfirebase firestore:delete\ncat <<'EOF'\n#>\nEOF", sLimpoComFlag, 2, DET_FSDEL);
  // Controles que JA bloqueiam e nao podem cair junto com a correcao.
  caso('J472 controle: so o <# (bloco aberto)', "cat <<'EOF'\n<#\nEOF\nrm -rf build/", sLimpoComFlag, 2, DET_RM);
  caso('J473 controle: so o #>', "cat <<'EOF'\n#>\nEOF\nrm -rf build/", sLimpoComFlag, 2, DET_RM);
  caso('J474 controle: <# e #> no MESMO corpo', "cat <<'EOF'\n<# a #>\nEOF\nrm -rf build/", sLimpoComFlag, 2, DET_RM);
  caso('J475 controle: acento grave no corpo', "cat <<'EOF'\n" + BT + "\nEOF\nrm -rf build/", sLimpoComFlag, 2, DET_RM);
  caso('J476 controle: $( no corpo', "cat <<'EOF'\n$(\nEOF\nrm -rf build/", sLimpoComFlag, 2, DET_RM);
  caso('J477 here-string <<< do bash', "cat <<< '<#'\nrm -rf build/\ncat <<< '#>'", sLimpoComFlag, 2, DET_RM);
  caso('J478 here-string @\'...\'@ do PowerShell', "$a = @'\n<#\n'@\nrm -rf build/\n$b = @'\n#>\n'@", sLimpoComFlag, 2, DET_RM);
  caso('J479 here-string @"..."@ do PowerShell', '$a = @"\n<#\n"@\nrm -rf build/\n$b = @"\n#>\n"@', sLimpoComFlag, 2, DET_RM);
  // Heredoc LEGITIMO: a correcao nao pode transformar heredoc em passe livre. O
  // verbo NO CORPO continua bloqueando, que e o custo aceito registrado no J.7.
  caso('J480 verbo no corpo do heredoc (custo aceito)', "cat <<'EOF'\nrm -rf build/\nEOF", sLimpoComFlag, 2, DET_RM);
  caso('J481 LIBERA heredoc sem verbo dentro', 'cat <<EOF\nnada\nEOF', sLimpoComFlag, 0);
  caso('J482 LIBERA heredoc e comando legitimo depois', "cat <<'EOF'\ntexto\nEOF\nnpm run build", sLimpoComFlag, 0);

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

const hashInicio = hashDoGate();
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
// O gate nao pode ter mudado no meio da rodada, senao metade dos casos foi
// julgada contra uma versao e metade contra outra, e o veredito nao vale nada.
const hashFim = hashDoGate();
if (hashInicio !== hashFim) {
  falhas++;
  total++;
  console.log('FALHA | o gate MUDOU durante a rodada: ' + hashInicio + ' -> ' + hashFim +
    '. Veredito invalido, rode de novo com o gate parado.');
}
if (falhasDetalhe.length > 0) {
  console.log('CASOS QUE FALHARAM (' + falhasDetalhe.length + '):');
  for (const f of falhasDetalhe) console.log('  - ' + f);
  console.log('');
  console.log('Casos com prefixo "GAP" ou "FP" sao os GAPS abertos do gate: o esperado');
  console.log('deles e o REQUISITO da ordem de tarefa, nao o comportamento atual. Corrija');
  console.log('o gate (scripts/gate-deploy.js), nunca o esperado do teste.');
  console.log('');
}
console.log(falhas === 0
  ? 'VEREDITO: PASSA, ' + total + ' de ' + total + ' casos OK'
  : 'VEREDITO: FALHA, ' + falhas + ' de ' + total + ' casos falharam');
console.log('='.repeat(72));
process.exit(falhas === 0 ? 0 : 1);
