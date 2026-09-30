/**
 * test-pacote-ondas-f125.cjs
 * ---------------------------------------------------------------------------
 * OS-CP-PACOTE-ONDAS-01 — suite do agente TESTER (independente do autor).
 *
 * Cobre as FRENTES 5 (vazamento da empresa derivada), 1 (cruzamento Centro de
 * Custo x Gestor) e 2 (cards de Natureza do Custo) de
 * `gerenciador_contas_pagar_desktop/code.html`.
 *
 * Desde 2026-09-30 cobre tambem a guarda "CANCELADO NAO E CUSTO" (decisao do
 * diretor): os 4 cards de Natureza excluem lancamento cancelado, por teste de
 * PREFIXO em `status` (/^cancel/i), o mesmo criterio do DRE Gerencial.
 *
 * PRINCIPIO: nada aqui reimplementa a regra. Todo pedaco de logica testado e
 * EXTRAIDO TEXTUALMENTE do arquivo real (por contagem de chaves) e executado com
 * stubs apenas para as dependencias de ambiente (DOM, Firestore, formatadores).
 *
 * TRES versoes do arquivo entram no mesmo teste, e cada uma responde uma pergunta
 * diferente (ver o bloco "A SEGUNDA BASE" mais abaixo para o porque):
 *   `--base` (default 0ca791e) = PRE-Frente-2, tem kpi-opex.
 *   `--head` (default HEAD)    = POS-Frente-2, SEM a guarda de cancelado.
 *   arvore de trabalho         = com tudo.
 * A suite FALHA de cara se o papel de cada ref nao for o suposto, para nunca
 * comparar a coisa errada em silencio.
 *
 * READ-ONLY: nao escreve no repositorio, nao toca Firestore, nao roda emulador.
 *
 * USO:  node scripts/test-pacote-ondas-f125.cjs
 *       node scripts/test-pacote-ondas-f125.cjs --dados <caminho/dados.json>
 *       node scripts/test-pacote-ondas-f125.cjs --base <ref> --head <ref>
 *
 * O caminho do snapshot de dados reais NAO tem default dentro do repositorio de
 * proposito: dado real em pasta servida pelo Firebase Hosting ja causou
 * incidente. Sem `--dados` a Frente 2 roda so a parte sintetica/estrutural e
 * declara os casos de prova numerica como NAO EXECUTADOS.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── localizacao do repo e das duas versoes do arquivo ─────────────────────────
function acharRaiz(inicio) {
  let dir = inicio;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'gerenciador_contas_pagar_desktop', 'code.html'))) return dir;
    const pai = path.dirname(dir);
    if (pai === dir) break;
    dir = pai;
  }
  throw new Error('Raiz do repo nao encontrada a partir de ' + inicio);
}
const ROOT = acharRaiz(__dirname);
const REL = 'gerenciador_contas_pagar_desktop/code.html';
const ARQ = path.join(ROOT, REL);

// Fim de linha normalizado para LF nas DUAS fontes: a arvore de trabalho vem
// com CRLF (core.autocrlf) e o `git show` entrega LF. Sem isso, toda comparacao
// textual "ficou intocado?" daria falso negativo por causa do \r.
const lf = (s) => s.replace(/\r\n/g, '\n');
const SRC_DEPOIS = lf(fs.readFileSync(ARQ, 'utf8'));
// BASE FIXADA, corrigido em 2026-09-30 pelo coordenador.
// A suite comparava contra `HEAD`, e no instante em que a frente foi commitada o
// HEAD passou a ser o proprio codigo novo: "antes" ficou igual a "depois" e as
// assertivas que provam o comportamento ANTIGO comecaram a falhar sozinhas. E o
// mesmo defeito que o tester registrou como GAP 5 em `test-filtro-servico-dinamico.cjs`.
// A base agora e o commit anterior a esta OS, explicito e imune a novos commits.
// Pode ser trocada por --base <ref> quando a OS fechar e virar historico.
const BASE_PADRAO = '0ca791e';
function refBase() {
  const i = process.argv.indexOf('--base');
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env.CP_BASE_REF || BASE_PADRAO;
}
const BASE_REF = refBase();
let SRC_ANTES;
try {
  SRC_ANTES = lf(execSync(`git show ${BASE_REF}:${REL}`, { cwd: ROOT, maxBuffer: 1024 * 1024 * 80 }).toString('utf8'));
} catch (e) {
  console.error(`\nERRO: nao consegui ler a base de comparacao "${BASE_REF}:${REL}".`);
  console.error(`A suite compara o codigo ANTES x DEPOIS, e sem a base ela nao prova nada.`);
  console.error(`Passe uma referencia valida com --base <commit>.`);
  process.exit(1);
}

// ── A SEGUNDA BASE, e por que ela e necessaria (2026-09-30) ───────────────────
// A suite passou a ter DUAS bases de comparacao, porque ha DUAS perguntas
// diferentes e cada uma exige um "antes" diferente. Misturar as duas foi o que
// fez 7 casos falharem quando a exclusao de cancelado entrou.
//
//   SRC_ANTES (BASE_PADRAO = 0ca791e) = PRE-FRENTE-2.
//     Tem o card unico `kpi-opex` (Fornecedor Interno + Fornecedor Externo, SEM
//     PJ, SEM trim, INCLUINDO cancelado) e nao tem `kpi-interno`/`kpi-externo`/
//     `kpi-sem-class`. E o "antes" correto para a pergunta "o que a Frente 2
//     INTEIRA mudou": OPEX -> 4 cards de Natureza.
//
//   SRC_HEAD (HEAD) = POS-FRENTE-2, PRE-GUARDA-DE-CANCELADO.
//     Ja tem os 4 cards de Natureza, ja tem o PJ dentro de `interno` e ja tem o
//     `.trim()`, e NAO tem a guarda `_ehCancelado`. E o "antes" correto para a
//     pergunta "o que a guarda de cancelado, SOZINHA, mudou": isola o efeito de
//     uma unica linha, sem o ruido da Frente 2 inteira.
//
// Com uma base so nao daria para provar o item mais importante da frente: que a
// guarda mexeu APENAS em `interno` e `externo` e em NADA mais. Contra 0ca791e,
// `kpi-interno` nem existe para comparar; contra HEAD, a comparacao e de 1 linha.
// A checagem "nao podia mudar" (kpi-total/pago/a-pagar/vencido/tarifas e as
// contagens) roda contra AS DUAS: preservado desde antes da Frente 2 E preservado
// pela guarda. Se algum dia a guarda for commitada, `--head <ref>` aponta o HEAD
// para o commit anterior a ela.
function refHead() {
  const i = process.argv.indexOf('--head');
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env.CP_HEAD_REF || 'HEAD';
}
const HEAD_REF = refHead();
let SRC_HEAD;
try {
  SRC_HEAD = lf(execSync(`git show ${HEAD_REF}:${REL}`, { cwd: ROOT, maxBuffer: 1024 * 1024 * 80 }).toString('utf8'));
} catch (e) {
  console.error(`\nERRO: nao consegui ler a 2a base de comparacao "${HEAD_REF}:${REL}".`);
  process.exit(1);
}
// Sanidade das DUAS bases: se o papel de cada ref nao for o que a suite supoe,
// todos os casos que dependem delas viram teatro. Falha cedo e alto.
const TEM_GUARDA = (s) => {
  const i = s.indexOf('function atualizarKPIs(');
  return i >= 0 && /_ehCancelado/.test(s.slice(i, casarChavesSeguro(s, i)));
};
function casarChavesSeguro(s, i) {
  const ab = s.indexOf('{', i); let n = 0;
  for (let k = ab; k < s.length; k++) { if (s[k] === '{') n++; else if (s[k] === '}') { n--; if (!n) return k + 1; } }
  return s.length;
}
const PAPEL_BASES_OK =
  !/setKPI\('kpi-interno'/.test(SRC_ANTES) && /setKPI\('kpi-opex'/.test(SRC_ANTES) &&
  /setKPI\('kpi-interno'/.test(SRC_HEAD) && !TEM_GUARDA(SRC_HEAD) &&
  /setKPI\('kpi-interno'/.test(SRC_DEPOIS) && TEM_GUARDA(SRC_DEPOIS);

// ── caminho do snapshot de dados reais (opcional, fora do repo) ───────────────
function argDados() {
  const i = process.argv.indexOf('--dados');
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const env = process.env.CP_DADOS_JSON;
  if (env) return env;
  // Fallback: scratchpad da sessao (fora do repo). Se nao existir, a Frente 2
  // roda so a parte estrutural.
  const cand = path.join(
    process.env.LOCALAPPDATA || '',
    'Temp', 'claude', 'C--Users-Henrique-Desktop-centrafin-app',
    '2471334b-a64f-47d4-81c6-b9b494bd6806', 'scratchpad', 'dados.json');
  return fs.existsSync(cand) ? cand : null;
}

// ── placar ────────────────────────────────────────────────────────────────────
let ok = 0, fail = 0, skip = 0;
const falhas = [];
function assert(cond, label) {
  if (cond) { console.log('  OK    ' + label); ok++; }
  else { console.log('  FAIL  ' + label); fail++; falhas.push(label); }
}
function pular(label, motivo) {
  console.log('  SKIP  ' + label + '  [' + motivo + ']'); skip++;
}
function secao(t) { console.log('\n' + t + '\n' + '-'.repeat(t.length)); }

// ── extracao textual ──────────────────────────────────────────────────────────
function casarChaves(src, aberturaIdx) {
  let nivel = 0;
  for (let i = aberturaIdx; i < src.length; i++) {
    if (src[i] === '{') nivel++;
    else if (src[i] === '}') { nivel--; if (nivel === 0) return i + 1; }
  }
  throw new Error('chaves desbalanceadas a partir de ' + aberturaIdx);
}
/** Funcao nomeada: `function nome(...) { ... }` */
function extrairFuncao(src, nome, rotulo) {
  const marca = 'function ' + nome + '(';
  const i = src.indexOf(marca);
  if (i < 0) throw new Error('nao achei a funcao ' + nome + (rotulo ? ' em ' + rotulo : ''));
  // Preserva o `async ` do cabecalho: cortar em `function` transformaria uma
  // funcao assincrona real numa sincrona e o `await` de dentro nao compilaria.
  const ini = src.slice(Math.max(0, i - 6), i) === 'async ' ? i - 6 : i;
  const ab = src.indexOf('{', i);
  return src.slice(ini, casarChaves(src, ab));
}
/** Bloco a partir de um marcador que contem `{` (ex.: `if (empSet) {`). */
function extrairBloco(src, marcador, rotulo) {
  const i = src.indexOf(marcador);
  if (i < 0) throw new Error('nao achei o marcador ' + JSON.stringify(marcador) + (rotulo ? ' em ' + rotulo : ''));
  const ab = src.indexOf('{', i);
  return src.slice(i, casarChaves(src, ab));
}
/** Statement `const X = ...;` respeitando parenteses/chaves/colchetes. */
function extrairStatement(src, marcador, rotulo) {
  const i = src.indexOf(marcador);
  if (i < 0) throw new Error('nao achei ' + JSON.stringify(marcador) + (rotulo ? ' em ' + rotulo : ''));
  let d = 0;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '(' || c === '{' || c === '[') d++;
    else if (c === ')' || c === '}' || c === ']') d--;
    else if (c === ';' && d === 0) return src.slice(i, k + 1);
  }
  throw new Error('statement nao fechou para ' + marcador);
}
function extrairLinha(src, marcador, rotulo) {
  const i = src.indexOf(marcador);
  if (i < 0) throw new Error('nao achei a linha ' + JSON.stringify(marcador) + (rotulo ? ' em ' + rotulo : ''));
  const a = src.lastIndexOf('\n', i) + 1;
  const b = src.indexOf('\n', i);
  return src.slice(a, b === -1 ? src.length : b);
}
/** Numero da linha (1-based) de um marcador, para citar arquivo:linha. */
function linhaDe(src, marcador) {
  const i = src.indexOf(marcador);
  if (i < 0) return -1;
  return src.slice(0, i).split('\n').length;
}

console.log('==========================================================');
console.log(' OS-CP-PACOTE-ONDAS-01 — suite do TESTER (F5 / F1 / F2)');
console.log('==========================================================');
console.log(' arquivo DEPOIS : ' + ARQ);
console.log(` base 1, ANTES  : git show ${BASE_REF}:${REL}   (PRE-Frente-2, tem kpi-opex)`);
console.log(` base 2, HEAD   : git show ${HEAD_REF}:${REL}   (POS-Frente-2, SEM guarda de cancelado)`);
console.log(' bytes          : antes=' + SRC_ANTES.length + '  head=' + SRC_HEAD.length + '  depois=' + SRC_DEPOIS.length);
console.log(' hoje (local)   : ' + new Date().toString());
secao('BASES — o papel de cada ref e o que a suite supoe?');
assert(PAPEL_BASES_OK,
  'as DUAS bases tem o papel suposto: ' + BASE_REF + ' tem kpi-opex e NAO tem kpi-interno; ' +
  HEAD_REF + ' tem kpi-interno e NAO tem a guarda _ehCancelado; a arvore de trabalho tem as duas coisas');
if (!PAPEL_BASES_OK) {
  console.log('      ' + BASE_REF + ': kpi-opex=' + /setKPI\('kpi-opex'/.test(SRC_ANTES) + ' kpi-interno=' + /setKPI\('kpi-interno'/.test(SRC_ANTES));
  console.log('      ' + HEAD_REF + ': kpi-interno=' + /setKPI\('kpi-interno'/.test(SRC_HEAD) + ' guarda=' + TEM_GUARDA(SRC_HEAD));
  console.log('      worktree: kpi-interno=' + /setKPI\('kpi-interno'/.test(SRC_DEPOIS) + ' guarda=' + TEM_GUARDA(SRC_DEPOIS));
  console.log('      Sem isso, os casos de "antes x depois" comparam a coisa errada. Use --base/--head.');
}

// =============================================================================
// FRENTE 5 — vazamento da empresa derivada
// =============================================================================
secao('FRENTE 5.1 — nenhum caminho de escrita carrega a empresa derivada');

{
  // Varredura estatica: qualquer ATRIBUICAO de `empresa` num objeto de registro.
  // Cobre reg/r/c/regOriginal/payload/item/lanc/doc/novo, com espaco livre.
  const reAtrib = /\b(reg|r|c|regOriginal|payload|item|lanc|doc|novo|clone|fatia|linha)\s*\.\s*empresa\s*=(?!=)/g;
  const contar = (src) => {
    const linhas = src.split('\n');
    const achados = [];
    linhas.forEach((l, i) => {
      reAtrib.lastIndex = 0;
      if (reAtrib.test(l)) achados.push((i + 1) + ': ' + l.trim());
    });
    return achados;
  };
  const antes = contar(SRC_ANTES);
  const depois = contar(SRC_DEPOIS);
  console.log('  ANTES (HEAD) tinha ' + antes.length + ' atribuicao(oes) de empresa no objeto do registro:');
  antes.forEach(a => console.log('      ' + REL + ':' + a));
  console.log('  DEPOIS tem ' + depois.length + ':');
  depois.forEach(a => console.log('      ' + REL + ':' + a));
  assert(antes.length >= 1, 'ANTES: existia ao menos 1 atribuicao a <reg>.empresa (o vazamento era real, nao teorico)');
  assert(depois.length === 0, 'DEPOIS: ZERO atribuicoes a <reg>.empresa no arquivo inteiro');

  // O consumidor de risco: _cpProjetarRecorrencia espalha o objeto do cache.
  const proj = extrairFuncao(SRC_DEPOIS, '_cpProjetarRecorrencia', 'depois');
  assert(proj.includes('...reg'), '_cpProjetarRecorrencia continua espalhando `...reg` (o risco nao mudou de lugar)');
  assert(!/\bempresa\b/.test(proj), '_cpProjetarRecorrencia nao menciona `empresa` em nenhum ponto do payload');
}

{
  // Prova COMPORTAMENTAL antes/depois: o laco de reenriquecimento roda sobre
  // objetos protegidos por Proxy que ESTOURA em qualquer escrita. O ANTES tem
  // que estourar (ele mutava o registro); o DEPOIS tem que passar limpo.
  // Proxy em vez de Object.freeze de proposito: freeze em modo sloppy falha em
  // SILENCIO, e silencio nao prova nada.
  function regBlindado(obj, nome) {
    return new Proxy(obj, {
      set(t, prop) { throw new Error('ESCRITA PROIBIDA em ' + nome + '.' + String(prop)); },
      defineProperty(t, prop) { throw new Error('defineProperty PROIBIDO em ' + nome + '.' + String(prop)); },
      deleteProperty(t, prop) { throw new Error('delete PROIBIDO em ' + nome + '.' + String(prop)); },
    });
  }
  function montarReenriquecedor(src, rotulo) {
    const resolver = extrairFuncao(src, '_cpResolverEmpresaDoReg', rotulo);
    let corpo;
    if (src.includes('function _cpRecomputarEmpresaDerivada')) {
      corpo = extrairFuncao(src, '_cpRecomputarEmpresaDerivada', rotulo) + '\nreturn _cpRecomputarEmpresaDerivada;';
    } else {
      // ANTES: o laco vivia dentro da closure `_cpUltimoSnapRefresh`. Extrai o
      // corpo textual dela e embrulha numa funcao com a mesma assinatura de
      // retorno (Set de empresas), sem tocar nas linhas de dentro.
      const arrow = extrairBloco(src, '_cpUltimoSnapRefresh = () => {', rotulo);
      const ab = arrow.indexOf('{');
      let miolo = arrow.slice(ab + 1, arrow.lastIndexOf('}'));
      // Descarta so as DUAS chamadas de efeito colateral de UI do fim da closure,
      // que nao fazem parte do laco de enriquecimento.
      miolo = miolo.replace(/_cpPopularDropdownsAsync\([^;]*\);/g, '')
                   .replace(/renderTudo\(\);/g, '');
      corpo = 'function __reenriquecer() {' + miolo + '\nreturn empresasReenriq; }\nreturn __reenriquecer;';
    }
    const fabricar = new Function('cacheRegistros', '_cpFornecedoresEmpresaMap', '_cpEmpresaDerivada',
      resolver + '\n' + corpo);
    return fabricar;
  }

  const fornMap = new Map([['777', 'SOULAN ADM']]);
  const cenario = () => [
    regBlindado({ _id: 'a1', codigo_fornecedor: 777 }, 'reg_sem_empresa'),
    regBlindado({ _id: 'a2', codigo_fornecedor: 999, empresa: 'neat' }, 'reg_com_empresa'),
  ];

  // ANTES
  let erroAntes = null;
  try {
    const regs = cenario();
    const fn = montarReenriquecedor(SRC_ANTES, 'antes')(regs, fornMap, new Map());
    fn();
  } catch (e) { erroAntes = e; }
  assert(erroAntes !== null && /ESCRITA PROIBIDA|defineProperty PROIBIDO/.test(String(erroAntes.message)),
    'ANTES: o laco de reenriquecimento MUTAVA o objeto do cache (erro capturado: ' + (erroAntes && erroAntes.message) + ')');

  // DEPOIS
  let erroDepois = null, mapDepois = new Map(), setDepois = null;
  try {
    const regs = cenario();
    const fn = montarReenriquecedor(SRC_DEPOIS, 'depois')(regs, fornMap, mapDepois);
    setDepois = fn();
  } catch (e) { erroDepois = e; }
  assert(erroDepois === null,
    'DEPOIS: _cpRecomputarEmpresaDerivada NAO muta o objeto do cache (nenhuma escrita tentada)' +
    (erroDepois ? ' — estourou: ' + erroDepois.message : ''));
  assert(mapDepois.get('a1') === 'SOULAN ADM', 'DEPOIS: a empresa derivada foi para o Map paralelo (a1 -> SOULAN ADM)');
  assert(mapDepois.get('a2') === 'NEAT', 'DEPOIS: registro com empresa gravada tambem entra no Map, em UPPER (a2 -> NEAT)');
  assert(setDepois instanceof Set && setDepois.size === 2,
    'DEPOIS: a funcao devolve o Set de empresas distintas para o dropdown (obtido ' + (setDepois && setDepois.size) + ')');
}

async function frente5proj() {
  secao('FRENTE 5.1b — o payload que iria para o Firestore (projecao de recorrencia)');
  // A PROVA QUE IMPORTA: roda a `_cpProjetarRecorrencia` REAL das duas versoes,
  // com um writeBatch falso que captura o PAYLOAD, sobre um registro que passou
  // pelo pipeline de enriquecimento real. O payload e o que iria para o
  // Firestore. Se a empresa derivada aparecer ali, ela esta sendo PERSISTIDA.
  function montarProjetor(src, rotulo) {
    const partes = [
      extrairFuncao(src, '_cpResolverEmpresaDoReg', rotulo),
      extrairFuncao(src, '_cpAdicionarMeses', rotulo),
      extrairFuncao(src, '_cpTetoProjecao', rotulo),
      extrairFuncao(src, 'cpEhPJInterno', rotulo),
      extrairFuncao(src, 'cpLinhaEhBeneficio', rotulo),
      extrairFuncao(src, 'cpRefMenosUmMes', rotulo),
      extrairFuncao(src, 'cpRefMMYYYY', rotulo),
      extrairFuncao(src, 'cpResolverCompetenciaRef', rotulo),
      extrairFuncao(src, '_cpProjetarRecorrencia', rotulo),
    ];
    // Laco de enriquecimento REAL de cada versao, para o registro chegar na
    // projecao exatamente como chega na tela.
    let enriquecer;
    if (src.includes('function _cpRecomputarEmpresaDerivada')) {
      partes.push(extrairFuncao(src, '_cpRecomputarEmpresaDerivada', rotulo));
      enriquecer = '_cpRecomputarEmpresaDerivada();';
    } else {
      const arrow = extrairBloco(src, '_cpUltimoSnapRefresh = () => {', rotulo);
      const ab = arrow.indexOf('{');
      enriquecer = arrow.slice(ab + 1, arrow.lastIndexOf('}'))
        .replace(/_cpPopularDropdownsAsync\([^;]*\);/g, '')
        .replace(/renderTudo\(\);/g, '');
    }
    return new Function(
      'cacheRegistros', '_cpFornecedoresEmpresaMap', '_cpEmpresaDerivada',
      'writeBatch', 'doc', 'collection', 'db', 'COLECAO', 'CHUNK_SIZE',
      'serverTimestamp', 'requestAnimationFrame',
      partes.join('\n') +
      '\nfunction __enriquecer() {' + enriquecer + '}' +
      '\nreturn { projetar: _cpProjetarRecorrencia, enriquecer: __enriquecer };'
    );
  }
  const capturados = { antes: [], depois: [] };
  function ambiente(alvo) {
    return {
      writeBatch: () => ({
        set: (_ref, payload) => { capturados[alvo].push(payload); },
        commit: async () => {},
      }),
      doc: () => ({}),
      collection: () => ({}),
      db: {},
      COLECAO: 'ContasAPagar',
      CHUNK_SIZE: 450,
      serverTimestamp: () => '<serverTimestamp>',
      requestAnimationFrame: (cb) => setTimeout(cb, 0),
    };
  }

  {
    for (const [alvo, src] of [['antes', SRC_ANTES], ['depois', SRC_DEPOIS]]) {
      const reg = {
        _id: 'p1', codigo_fornecedor: 777, entidade: 'FORNECEDOR X',
        categoria: 'ALUGUEL', centro_custo: 'ADM', valor_original: 1000,
        data_vencimento: '2026-03-10', status: 'pago', tipo_entidade: 'Fornecedor Externo',
      };
      const amb = ambiente(alvo);
      const api = montarProjetor(src, alvo)(
        [reg], new Map([['777', 'SOULAN ADM']]), new Map(),
        amb.writeBatch, amb.doc, amb.collection, amb.db, amb.COLECAO, amb.CHUNK_SIZE,
        amb.serverTimestamp, amb.requestAnimationFrame);
      api.enriquecer();                 // pipeline real de enriquecimento
      await api.projetar(reg, 2);       // liga a recorrencia: 2 clones
    }
    console.log('  payload do 1o clone, ANTES : ' + JSON.stringify(capturados.antes[0]));
    console.log('  payload do 1o clone, DEPOIS: ' + JSON.stringify(capturados.depois[0]));
    assert(capturados.antes.length === 2 && capturados.depois.length === 2,
      'as duas versoes projetaram 2 clones (antes=' + capturados.antes.length + ' depois=' + capturados.depois.length + ')');
    assert(capturados.antes.every(p => p.empresa === 'SOULAN ADM'),
      'ANTES: o clone gravado no Firestore LEVAVA a empresa derivada "SOULAN ADM" — valor calculado sendo PERSISTIDO sem decisao');
    assert(capturados.depois.every(p => !('empresa' in p)),
      'DEPOIS: o clone NAO tem a chave `empresa` (o documento original nao tinha, e nada derivado foi anexado)');
    // O resto do payload nao pode ter mudado: mesma projecao, menos o vazamento.
    const limpar = (p) => { const c = Object.assign({}, p); delete c.empresa; return c; };
    assert(JSON.stringify(limpar(capturados.antes[0])) === JSON.stringify(capturados.depois[0]),
      'DEPOIS: o payload e IDENTICO ao ANTES exceto pela ausencia de `empresa` (nada mais mudou na projecao)');
    assert(!('_id' in capturados.depois[0]) && ('_projetado_pai' in capturados.depois[0]),
      'o payload continua sem `_id` e com `_projetado_pai` (contrato da projecao preservado)');
  }
}

secao('FRENTE 5.2 — precedencia de _cpEmpresaDeReg');

const fabricarEmpresaDeReg = (src, rotulo) => {
  const f = extrairFuncao(src, '_cpEmpresaDeReg', rotulo);
  return (mapa) => new Function('_cpEmpresaDerivada', f + '\nreturn _cpEmpresaDeReg;')(mapa);
};
{
  const mapa = new Map([
    ['g1', 'SOULAN CONSULTORIA'],  // derivado existe
    ['g3', 'NEAT'],                // derivado existe E gravado existe (divergente)
  ]);
  const f = fabricarEmpresaDeReg(SRC_DEPOIS, 'depois')(mapa);

  assert(f({ _id: 'g0', empresa: 'soulan adm' }) === 'SOULAN ADM',
    'caso 1, gravado presente e derivado ausente: devolve o GRAVADO em UPPER');
  assert(f({ _id: 'g1', empresa: '' }) === 'SOULAN CONSULTORIA',
    'caso 2, gravado vazio e derivado presente: devolve o DERIVADO');
  assert(f({ _id: 'g2', empresa: '' }) === '',
    'caso 3, gravado vazio e derivado ausente: devolve string vazia');
  assert(f({ _id: 'g3', empresa: 'ESTÁGIO' }) === 'ESTÁGIO',
    'caso 4, gravado presente E derivado DIFERENTE: o GRAVADO ganha (derivado NEAT e ignorado)');

  // Bordas que o acessor precisa aguentar sem quebrar a tela.
  assert(f({ _id: 'g2', empresa: '   ' }) === '',
    'borda: empresa gravada so com espaco conta como vazia (nao vira "   " no filtro)');
  assert(f({ _id: 'g1' }) === 'SOULAN CONSULTORIA', 'borda: campo `empresa` ausente cai no derivado');
  assert(f(null) === '', 'borda: reg null nao estoura, devolve vazio');
  assert(f({ empresa: '' }) === '', 'borda: reg sem _id nao estoura, devolve vazio');
  assert(f({ _id: 'g1', empresa: null }) === 'SOULAN CONSULTORIA', 'borda: empresa null cai no derivado');
}

secao('FRENTE 5.3 — filtro de Empresa e exportacao passam pelo acessor');

{
  // Bloco REAL do filtro de empresa, extraido das duas versoes.
  const blocoDepois = extrairBloco(SRC_DEPOIS, 'if (empSet) {', 'depois');
  const blocoAntes = extrairBloco(SRC_ANTES, 'if (empSet) {', 'antes');
  console.log('  --- bloco DEPOIS (' + REL + ':' + linhaDe(SRC_DEPOIS, 'if (empSet) {') + ') ---');
  console.log(blocoDepois.split('\n').map(l => '      ' + l.trim()).join('\n'));
  console.log('  --- bloco ANTES  (HEAD:' + linhaDe(SRC_ANTES, 'if (empSet) {') + ') ---');
  console.log(blocoAntes.split('\n').map(l => '      ' + l.trim()).join('\n'));

  const chave = extrairFuncao(SRC_DEPOIS, '_cpChaveFiltro', 'depois');
  const mapa = new Map([['h1', 'SOULAN ADM']]);
  const empDeReg = fabricarEmpresaDeReg(SRC_DEPOIS, 'depois')(mapa);

  const rodaDepois = new Function('_cpChaveFiltro', '_cpEmpresaDeReg', 'r', 'empSet', 'empFiltraSemEmp',
    blocoDepois + '\nreturn true;');
  const rodaAntes = new Function('_cpChaveFiltro', 'r', 'empSet', 'empFiltraSemEmp',
    blocoAntes + '\nreturn true;');
  const fChave = new Function(chave + '\nreturn _cpChaveFiltro;')();

  // O registro do MODELO NOVO: no cache, sem `empresa` gravada (a derivada mora
  // no Map). Este e o registro que existe hoje em memoria para 44.586 docs.
  const regHerdado = { _id: 'h1', codigo_fornecedor: 777 };
  const empSet = new Set(['SOULAN ADM']);

  assert(rodaDepois(fChave, empDeReg, regHerdado, empSet, false) === true,
    'DEPOIS: lancamento que so tem empresa por HERANCA passa no filtro de Empresa');
  assert(rodaAntes(fChave, regHerdado, empSet, false) === false,
    'ANTES: o mesmo registro, lido com `r.empresa` direto, SERIA DESCARTADO (a regressao que a frente evita)');

  // Precedencia dentro do filtro: gravado ganha do derivado.
  const mapa2 = new Map([['h2', 'NEAT']]);
  const empDeReg2 = fabricarEmpresaDeReg(SRC_DEPOIS, 'depois')(mapa2);
  const regGravado = { _id: 'h2', empresa: 'soulan adm' };
  assert(rodaDepois(fChave, empDeReg2, regGravado, new Set(['SOULAN ADM']), false) === true,
    'DEPOIS: filtro por SOULAN ADM pega o registro cujo GRAVADO e "soulan adm" (derivado NEAT ignorado)');
  assert(rodaDepois(fChave, empDeReg2, regGravado, new Set(['NEAT']), false) === false,
    'DEPOIS: filtro por NEAT NAO pega esse registro (o derivado divergente nao pode vazar pro filtro)');

  // Sentinela __SEM_EMPRESA__: quem TEM empresa por heranca NAO e "sem empresa".
  const semEmp = new Set(['__SEM_EMPRESA__']);
  assert(rodaDepois(fChave, empDeReg, regHerdado, semEmp, true) === false,
    'DEPOIS: [SEM EMPRESA] NAO captura lancamento que tem empresa por heranca');
  const semNada = { _id: 'h9' };
  assert(rodaDepois(fChave, empDeReg, semNada, semEmp, true) === true,
    'DEPOIS: [SEM EMPRESA] captura lancamento sem gravado e sem derivado');
}

// Linha da exportacao — extraida do construtor de linha REAL.
function extrairLinhaExport(src, rotulo) {
  const iAnchor = src.indexOf('const linhas = new Array(fonte.length);');
  if (iAnchor < 0) throw new Error('nao achei o construtor de linhas da exportacao em ' + rotulo);
  const iCc = src.indexOf("const cc = String(r.centro_custo || '').trim();", iAnchor);
  const iObj = src.indexOf('linhas[i] = {', iCc);
  if (iCc < 0 || iObj < 0) throw new Error('nao achei o bloco cc/gestor/linhas[i] em ' + rotulo);
  const fim = casarChaves(src, src.indexOf('{', iObj));
  const miolo = src.slice(iCc, fim) + ';';
  return new Function('_cpResponsavelDoReg', '_areaGestorMap', '_cpEmpresaDeReg', 'statusVisual',
    'BADGE_MAP', 'fmtDataBR', 'hoje', 'r',
    'const linhas = []; const i = 0;\n' + miolo + '\nreturn linhas[0];');
}
{
  const statusV = new Function(extrairFuncao(SRC_DEPOIS, 'statusVisual', 'depois') + '\nreturn statusVisual;')();
  const fmtData = new Function(extrairFuncao(SRC_DEPOIS, 'fmtDataBR', 'depois') + '\nreturn fmtDataBR;')();
  const BADGE = new Function(extrairStatement(SRC_DEPOIS, 'const BADGE_MAP = {', 'depois') + '\nreturn BADGE_MAP;')();

  const linhaDepois = extrairLinhaExport(SRC_DEPOIS, 'depois');
  const linhaAntes = extrairLinhaExport(SRC_ANTES, 'antes');

  const mapa = new Map([['h1', 'SOULAN ADM']]);
  const empDeReg = fabricarEmpresaDeReg(SRC_DEPOIS, 'depois')(mapa);
  const respStub = () => ({ gestor: 'Marcelo Souza', texto: 'Marcelo Souza', estado: 'ok' });
  const reg = { _id: 'h1', codigo_fornecedor: 777, entidade: 'X', categoria: 'ALUGUEL', centro_custo: 'ADM', valor_original: 10, data_vencimento: '2026-03-10', status: 'pago' };

  const lD = linhaDepois(respStub, new Map([['ADM', 'Marcelo Souza']]), empDeReg, statusV, BADGE, fmtData, '2026-09-29', reg);
  const lA = linhaAntes(respStub, new Map([['ADM', 'Marcelo Souza']]), empDeReg, statusV, BADGE, fmtData, '2026-09-29', reg);
  assert(lD['Empresa'] === 'SOULAN ADM',
    'DEPOIS: exportacao sai com a empresa herdada preenchida (obtido ' + JSON.stringify(lD['Empresa']) + ')');
  assert(lA['Empresa'] === 'não informado',
    'ANTES: a mesma exportacao sairia "não informado" no modelo novo (obtido ' + JSON.stringify(lA['Empresa']) + ')');
}

async function frente5d() {
  secao('FRENTE 5.4 — _cpAgendarSnapRefresh na hidratacao do cache');

  function montarAgendar(src, rotulo) {
    const f = extrairFuncao(src, '_cpAgendarSnapRefresh', rotulo);
    // `_cpSnapRefreshTimer` e estado de modulo (uma declaracao `let`, nao logica);
    // declarado aqui para a funcao extraida ter onde escrever. Todo o resto e o
    // codigo real.
    // `_cpFornecedoresCarregados` entrou no caminho novo ao corrigir o GAP G1
    // (recomputar antes de /Fornecedores chegar limparia o Map restaurado do cache).
    // Também é estado de módulo, não lógica, e entra como parâmetro para o teste
    // poder exercitar os dois lados: cadastro carregado e não carregado.
    return (cacheRegistros, closure, espioes, fornCarregados = true) => new Function(
      'cacheRegistros', '_cpUltimoSnapRefresh', '_cpRecomputarEmpresaDerivada', 'renderTudo',
      'setTimeout', 'clearTimeout', '_cpFornecedoresCarregados',
      'let _cpSnapRefreshTimer = null;\n' + f + '\nreturn _cpAgendarSnapRefresh;'
    )(cacheRegistros, closure, espioes.recomputar, espioes.render, setTimeout, clearTimeout, fornCarregados);
  }
  const espiao = () => {
    const c = { recomputa: 0, render: 0, closure: 0 };
    return {
      c,
      recomputar: () => { c.recomputa++; return new Set(); },
      render: () => { c.render++; },
      closure: () => { c.closure++; },
    };
  };
  const esperar = (ms) => new Promise(r => setTimeout(r, ms));

  {
    // (a) HIDRATACAO: sem closure, com registros em cache -> nao desiste.
    {
      const e = espiao();
      montarAgendar(SRC_DEPOIS, 'depois')([{ _id: 'x' }], null, e)();
      await esperar(200);
      assert(e.c.recomputa === 1, 'DEPOIS/hidratacao: sem closure e COM cache, recomputa o Map 1x (obtido ' + e.c.recomputa + ')');
      assert(e.c.render === 1, 'DEPOIS/hidratacao: sem closure e COM cache, repinta 1x (obtido ' + e.c.render + ')');
    }
    // (b) ANTES: o mesmo cenario DESISTIA.
    {
      const e = espiao();
      montarAgendar(SRC_ANTES, 'antes')([{ _id: 'x' }], null, e)();
      await esperar(200);
      assert(e.c.recomputa === 0 && e.c.render === 0,
        'ANTES: sem closure a funcao desistia, hidratacao ficaria sem empresa (recomputa=' + e.c.recomputa + ', render=' + e.c.render + ')');
    }
    // (c) Cache VAZIO e sem closure: nao explode e nao agenda nada.
    {
      const e = espiao();
      let estourou = null;
      try { montarAgendar(SRC_DEPOIS, 'depois')([], null, e)(); } catch (err) { estourou = err; }
      await esperar(200);
      assert(estourou === null, 'DEPOIS: cache vazio e sem closure nao estoura');
      assert(e.c.recomputa === 0 && e.c.render === 0, 'DEPOIS: cache vazio e sem closure nao agenda trabalho inutil');
    }
    // (d) Closure presente: continua sendo ela a manda, sem duplicar o recompute.
    {
      const e = espiao();
      montarAgendar(SRC_DEPOIS, 'depois')([{ _id: 'x' }], e.closure, e)();
      await esperar(200);
      assert(e.c.closure === 1, 'DEPOIS: com closure, e a closure que roda (obtido ' + e.c.closure + ')');
      assert(e.c.recomputa === 0 && e.c.render === 0,
        'DEPOIS: com closure, o caminho novo NAO roda em duplicidade (recomputa=' + e.c.recomputa + ', render=' + e.c.render + ')');
    }
    // (e) Coalescencia: 5 chamadas em rajada = 1 passe.
    {
      const e = espiao();
      const f = montarAgendar(SRC_DEPOIS, 'depois')([{ _id: 'x' }], null, e);
      for (let i = 0; i < 5; i++) f();
      await esperar(250);
      assert(e.c.recomputa === 1, 'DEPOIS: 5 chamadas em rajada coalescem em 1 recompute (obtido ' + e.c.recomputa + ')');
    }

    // (f) Hidratacao real reconstroi o Map antes do primeiro render.
    {
      const bloco = SRC_DEPOIS.slice(
        SRC_DEPOIS.indexOf('if (c && Array.isArray(c.registros) && c.registros.length) {'),
        SRC_DEPOIS.indexOf('hidratou = true;') + 'hidratou = true;'.length);
      const iRec = bloco.indexOf('_cpRecomputarEmpresaDerivada();');
      const iRender = bloco.indexOf('renderTudo();');
      assert(iRec > -1 && iRender > -1 && iRec < iRender,
        'DEPOIS: na hidratacao, _cpRecomputarEmpresaDerivada() vem ANTES de renderTudo() (' + REL + ':' + linhaDe(SRC_DEPOIS, '_cpRecomputarEmpresaDerivada();') + ')');
    }
    // (g) Chave do cache proprio foi bumpada (senao o cache velho reintroduz o
    //     campo derivado como se fosse carimbo explicito).
    {
      const chaveAntes = extrairLinha(SRC_ANTES, 'const CP_CACHE_KEY').trim();
      const chaveDepois = extrairLinha(SRC_DEPOIS, 'const CP_CACHE_KEY').trim();
      console.log('      antes : ' + chaveAntes);
      console.log('      depois: ' + chaveDepois);
      assert(chaveAntes !== chaveDepois, 'DEPOIS: CP_CACHE_KEY mudou, o cache antigo (com empresa gravada no objeto) e descartado');
    }
  }
}

// =============================================================================
// FRENTE 1 — cruzamento Centro de Custo x Gestor
// =============================================================================

// Areas REAIS cadastradas (nome, gestor) — ditadas pelo coordenador.
const AREAS_REAIS = [
  ['COMERCIAL THOMAS', 'Rejane Matos'],
  ['RATEIO', ''],
  ['DIRETORIA', 'Marcelo Souza'],
  ['ginfor', ''],
  ['COMERCIAL TEAM TAILOR', 'Rejane Matos'],
  ['DADOS', 'FLAVIO'],
  ['ADM GERAL', 'Marcelo Souza'],
  ['ATRAÇÃO E SELEÇÃO', 'Nadjane Oliveira'],
  ['ADM', 'Edilaine'],
  ['CLIENTES', 'CLIENTES'],
  ['COMERCIAL SOULAN', 'Marcelo Medeiros'],
  ['MARKETING', 'Fernanda Stacy'],
  ['GENTE E CULTURA', 'Tais Rocha'],
  ['NEAT', 'Rejane Matos'],
];

/** Roda o listener REAL de /AreasContasPagar e devolve acessores da versao. */
function montarAreas(src, rotulo) {
  const partes = [
    'let _ccDisponiveis = [], _areaGestorMap = new Map(), _areaChavesSet = new Set();',
    'let _cpAreasCarregadas = false;',
    'let __render = 0, __agendou = 0, __snapCb = null, __errCb = null;',
    'function renderTudo() { __render++; }',
    'function _cpAgendarSnapRefresh() { __agendou++; }',
    'function collection() { return {}; }',
    'const db = {};',
    'function onSnapshot(_ref, cb, err) { __snapCb = cb; __errCb = err; }',
    extrairFuncao(src, '_cpChaveFiltro', rotulo),
    extrairFuncao(src, 'inscreverAreas', rotulo),
  ];
  // `_cpResponsavelDoReg` so existe no DEPOIS.
  const temResp = src.includes('function _cpResponsavelDoReg');
  if (temResp) partes.push(extrairFuncao(src, '_cpResponsavelDoReg', rotulo));

  // ANTES: as tres reguas viviam inline. Extrai cada uma textualmente.
  let ordAntes = '', expAntes = '';
  if (!temResp) {
    const iCase = src.indexOf("case 'responsavel':");
    const iBloco = src.indexOf('{', iCase);
    const corpoCase = src.slice(iBloco, casarChaves(src, iBloco));
    ordAntes = 'function __ordAntes(r) ' + corpoCase;
    const iCc = src.indexOf("const cc = String(r.centro_custo || '').trim();",
      src.indexOf('const linhas = new Array(fonte.length);'));
    const iGestor = src.indexOf('\n', src.indexOf('const gestor =', iCc));
    expAntes = 'function __expAntes(r) {' + src.slice(iCc, iGestor) + '\nreturn gestor; }';
    partes.push(ordAntes, expAntes);
  }

  partes.push([
    'return {',
    '  disparar(docs) { inscreverAreas(); __snapCb({ forEach(f) { docs.forEach(d => f({ data: () => d })); } }); },',
    '  soInscrever() { inscreverAreas(); },',
    '  get carregadas() { return _cpAreasCarregadas; },',
    '  get gestorMap() { return _areaGestorMap; },',
    '  get chaves() { return _areaChavesSet; },',
    '  get ccDisponiveis() { return _ccDisponiveis; },',
    (temResp
      ? '  resp: (reg) => _cpResponsavelDoReg(reg),'
      : '  ordenacao: (reg) => __ordAntes(reg), export: (reg) => __expAntes(reg),'),
    '};',
  ].join('\n'));

  return new Function(partes.join('\n'))();
}

const docsAreasReais = AREAS_REAIS.map(([nome, gestor]) => ({ nome, gestor_nome: gestor }));

async function frente1() {
  secao('FRENTE 1.1 — o teste que FALHA no HEAD e PASSA agora');

  const depois = montarAreas(SRC_DEPOIS, 'depois');
  const antes = montarAreas(SRC_ANTES, 'antes');
  depois.disparar(docsAreasReais);
  antes.disparar(docsAreasReais);

  const regTorto = { _id: 'z1', centro_custo: 'comercial  soulan' }; // minusculo, 2 espacos
  const rD = depois.resp(regTorto);
  const gA_ord = antes.ordenacao(regTorto).valor;
  const gA_exp = antes.export(regTorto);
  console.log('  registro: centro_custo = ' + JSON.stringify(regTorto.centro_custo));
  console.log('  ANTES  (ordenacao inline) -> ' + JSON.stringify(gA_ord));
  console.log('  ANTES  (exportacao inline) -> ' + JSON.stringify(gA_exp));
  console.log('  DEPOIS (_cpResponsavelDoReg) -> ' + JSON.stringify(rD));
  assert(gA_ord === '' && gA_exp === '',
    'ANTES: "comercial  soulan" NAO resolvia gestor nenhum (ordenacao e exportacao vazias)');
  assert(rD.gestor === 'Marcelo Medeiros' && rD.estado === 'ok',
    'DEPOIS: "comercial  soulan" resolve "Marcelo Medeiros" (obtido ' + JSON.stringify(rD.gestor) + ')');

  // A grafia EXATA tem que continuar funcionando nas duas versoes (nao-regressao).
  const regExato = { _id: 'z2', centro_custo: 'COMERCIAL SOULAN' };
  assert(antes.export(regExato) === 'Marcelo Medeiros' && depois.resp(regExato).gestor === 'Marcelo Medeiros',
    'grafia EXATA resolve o mesmo gestor no ANTES e no DEPOIS (a normalizacao nao quebrou o caminho feliz)');

  secao('FRENTE 1.2 — os quatro estados de _cpResponsavelDoReg');
  {
    // cc_vazio
    for (const cc of [undefined, null, '', '   ']) {
      const r = depois.resp({ _id: 'e', centro_custo: cc });
      assert(r.estado === 'cc_vazio' && r.texto === 'não informado' && r.gestor === '',
        'cc_vazio para centro_custo=' + JSON.stringify(cc) + ' -> texto "não informado" (obtido estado=' + r.estado + ')');
    }
    // carregando: areas ainda NAO chegaram
    const semAreas = montarAreas(SRC_DEPOIS, 'depois');
    semAreas.soInscrever(); // inscreve mas nao entrega snapshot
    assert(semAreas.carregadas === false, 'pre-condicao: _cpAreasCarregadas === false antes do 1o snapshot');
    const rCarregando = semAreas.resp({ _id: 'e', centro_custo: 'COMERCIAL' });
    assert(rCarregando.estado === 'carregando' && rCarregando.texto === 'não informado',
      'carregando: NAO acusa area inexistente enquanto /AreasContasPagar nao chegou (obtido ' + JSON.stringify(rCarregando) + ')');
    assert(rCarregando.texto !== 'área não cadastrada',
      'carregando: o texto de alarme "área não cadastrada" NAO aparece durante a carga');

    // area_sem_gestor: casos REAIS RATEIO e ginfor
    for (const cc of ['RATEIO', 'rateio', ' RATEIO ', 'ginfor', 'GINFOR', 'GinFor']) {
      const r = depois.resp({ _id: 'e', centro_custo: cc });
      assert(r.estado === 'area_sem_gestor' && r.texto === 'não informado' && r.gestor === '',
        'area_sem_gestor para ' + JSON.stringify(cc) + ' (area existe, gestor em branco) -> "não informado"');
    }
    // sem_area: caso REAL COMERCIAL (nao existe como area)
    for (const cc of ['COMERCIAL', 'comercial', 'Financeiro']) {
      const r = depois.resp({ _id: 'e', centro_custo: cc });
      assert(r.estado === 'sem_area' && r.texto === 'área não cadastrada' && r.gestor === '',
        'sem_area para ' + JSON.stringify(cc) + ' -> "área não cadastrada"');
    }
    // ok
    const rOk = depois.resp({ _id: 'e', centro_custo: ' gente  e cultura ' });
    assert(rOk.estado === 'ok' && rOk.gestor === 'Tais Rocha', 'ok: " gente  e cultura " -> Tais Rocha');
    // Os quatro estados + ok sao exaustivos e mutuamente exclusivos.
    const estados = new Set(['cc_vazio', 'carregando', 'area_sem_gestor', 'sem_area', 'ok']);
    const amostra = ['', '   ', 'RATEIO', 'COMERCIAL', 'ADM', 'ginfor', 'ATRAÇÃO E SELEÇÃO'];
    assert(amostra.every(cc => estados.has(depois.resp({ _id: 'e', centro_custo: cc }).estado)),
      'todo retorno cai num dos 5 estados conhecidos (nenhum estado fantasma)');
  }

  secao('FRENTE 1.3 — invariante de nao regressao (14 areas x grafias de CC)');
  {
    // (a) A normalizacao NAO pode fundir duas areas distintas. 14 nomes -> 14
    //     chaves, senao o `Map.set` faz a ultima area sobrescrever a anterior e
    //     o gestor exibido passa a ser de OUTRA area.
    const chaves = depois.chaves;
    assert(chaves.size === AREAS_REAIS.length,
      '14 areas reais produzem ' + AREAS_REAIS.length + ' chaves DISTINTAS (obtido ' + chaves.size + '): zero colisao, nenhum CC unificado indevidamente');
    assert(antes.gestorMap.size === depois.gestorMap.size,
      'o mapa de gestor tem o MESMO tamanho no ANTES e no DEPOIS (' + antes.gestorMap.size + ' entradas): nenhuma area ganhou nem perdeu gestor');

    // (b) Acento PRESERVADO de proposito (incidente "ESTÁGIO" de 2026-06-19).
    const comAcento = depois.resp({ _id: 'e', centro_custo: 'atração e seleção' });
    const semAcento = depois.resp({ _id: 'e', centro_custo: 'ATRACAO E SELECAO' });
    assert(comAcento.gestor === 'Nadjane Oliveira', 'acento: "atração e seleção" resolve Nadjane Oliveira');
    assert(semAcento.gestor === '' && semAcento.estado === 'sem_area',
      'acento: "ATRACAO E SELECAO" (sem acento) NAO resolve, porque _cpChaveFiltro PRESERVA acento de proposito');

    // (c) Conjunto sintetico de lancamentos com as grafias reais + variacoes.
    //     A regra estrutural e: o conjunto de resolvidos DEPOIS e SUPERCONJUNTO
    //     do ANTES (a chave nova e funcao da chave velha), e cada ganho tem que
    //     ser explicado por caixa/espaco, nunca por area diferente.
    const grafias = [];
    for (const [nome, gestor] of AREAS_REAIS) {
      grafias.push({ cc: nome, esperado: gestor });                                   // exata
      grafias.push({ cc: nome.toLowerCase(), esperado: gestor });                     // caixa
      grafias.push({ cc: '  ' + nome + '  ', esperado: gestor });                     // borda
      grafias.push({ cc: nome.replace(/ /g, '  '), esperado: gestor });               // espaco interno
    }
    grafias.push({ cc: 'COMERCIAL', esperado: '' });          // area inexistente (real)
    grafias.push({ cc: '', esperado: '' });                   // sem CC
    grafias.push({ cc: 'ATRACAO E SELECAO', esperado: '' });  // acento removido: NAO casa

    let nAntes = 0, nDepois = 0, divergencias = [], errados = [];
    for (const g of grafias) {
      const reg = { _id: 'q', centro_custo: g.cc };
      const gA = antes.export(reg);
      const gD = depois.resp(reg).gestor;
      if (gA) nAntes++;
      if (gD) nDepois++;
      if (gA && gA !== gD) divergencias.push(JSON.stringify(g.cc) + ': antes=' + gA + ' depois=' + gD);
      if (gD && gD !== g.esperado) errados.push(JSON.stringify(g.cc) + ': esperado=' + g.esperado + ' obtido=' + gD);
    }
    console.log('  lancamentos sinteticos: ' + grafias.length + ' | resolvem gestor ANTES=' + nAntes + ' DEPOIS=' + nDepois);
    assert(divergencias.length === 0,
      'nenhum lancamento que ANTES resolvia gestor passou a resolver gestor DIFERENTE' +
      (divergencias.length ? ' — ' + divergencias.join(' | ') : ''));
    assert(errados.length === 0,
      'todo gestor resolvido e o gestor da area CORRETA (nenhuma unificacao indevida)' +
      (errados.length ? ' — ' + errados.join(' | ') : ''));
    assert(nDepois >= nAntes, 'a contagem de resolvidos e SUPERCONJUNTO (' + nDepois + ' >= ' + nAntes + '): a normalizacao amplia, nunca estreita');
    // Ganho EXATO e previsivel, calculado a partir das areas reais e das DUAS
    // unicas diferencas entre `.trim()` e `_cpChaveFiltro`: caixa e espaco
    // INTERNO. A variacao de borda o `.trim()` do HEAD ja resolvia, e area de uma
    // so palavra nao tem espaco interno para dobrar. Se o ganho nao bater, a
    // normalizacao esta pegando mais (ou menos) que isso, e isso e PARADA.
    const comGestor = AREAS_REAIS.filter(([, g]) => g);
    const ganhoCaixa = comGestor.filter(([n]) => n.toLowerCase() !== n).length;
    const ganhoEspaco = comGestor.filter(([n]) => n.includes(' ')).length;
    assert(nDepois - nAntes === ganhoCaixa + ganhoEspaco,
      'o ganho e EXATAMENTE caixa (' + ganhoCaixa + ') + espaco interno (' + ganhoEspaco + ') = ' +
      (ganhoCaixa + ganhoEspaco) + ' (obtido ' + (nDepois - nAntes) +
      '): a normalizacao pega caixa e espaco, e NADA MAIS');

    // (d) Invariante estrutural que vale sem dado real: se toda grafia da base
    //     casar EXATAMENTE, a contagem nao muda. Prova com o subconjunto exato.
    const soExatas = AREAS_REAIS.map(([n]) => ({ _id: 'x', centro_custo: n }));
    const exA = soExatas.filter(r => antes.export(r)).length;
    const exD = soExatas.filter(r => depois.resp(r).gestor).length;
    assert(exA === exD,
      'so com grafias EXATAS a contagem e IDENTICA antes/depois (' + exA + ' = ' + exD + '): se a base real nao tem grafia torta, o total de 49.984 NAO se move');
  }

  secao('FRENTE 1.4 — ordenacao pelo gestor e CC exportado pelo valor GRAVADO');
  {
    // Ordenacao: extrai o `case 'responsavel'` REAL do DEPOIS.
    const iCase = SRC_DEPOIS.indexOf("case 'responsavel':");
    const fimCase = SRC_DEPOIS.indexOf('\n', iCase);
    const linha = SRC_DEPOIS.slice(iCase, fimCase);
    console.log('  ' + REL + ':' + linhaDe(SRC_DEPOIS, "case 'responsavel':") + ' -> ' + linha.trim());
    const fOrd = new Function('_cpResponsavelDoReg', 'r',
      'switch ("responsavel") {\n' + linha.replace(/^\s*case 'responsavel':/, "case 'responsavel':") + '\n}');
    const vals = [
      { _id: '1', centro_custo: 'MARKETING' },        // Fernanda Stacy
      { _id: '2', centro_custo: 'adm' },              // Edilaine
      { _id: '3', centro_custo: 'RATEIO' },           // sem gestor -> ''
      { _id: '4', centro_custo: 'gente e cultura' },  // Tais Rocha
    ].map(r => fOrd(depois.resp, r));
    console.log('  chaves de ordenacao: ' + JSON.stringify(vals));
    assert(vals.every(v => v && v.tipo === 'texto'), 'ordenacao devolve { tipo: "texto" } para Responsavel');
    assert(vals[0].valor === 'Fernanda Stacy' && vals[1].valor === 'Edilaine' && vals[3].valor === 'Tais Rocha',
      'ordenacao usa o GESTOR como chave, nao o centro de custo');
    assert(vals[2].valor === '', 'ordenacao de area sem gestor usa string vazia (semantica preservada, nao o texto da celula)');
    const ordenado = [...vals].map(v => v.valor).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    assert(JSON.stringify(ordenado) === JSON.stringify(['', 'Edilaine', 'Fernanda Stacy', 'Tais Rocha']),
      'ordenacao A-Z pelo gestor: ' + JSON.stringify(ordenado));

    // Exportacao: CC gravado, nao a chave.
    const statusV = new Function(extrairFuncao(SRC_DEPOIS, 'statusVisual', 'depois') + '\nreturn statusVisual;')();
    const fmtData = new Function(extrairFuncao(SRC_DEPOIS, 'fmtDataBR', 'depois') + '\nreturn fmtDataBR;')();
    const BADGE = new Function(extrairStatement(SRC_DEPOIS, 'const BADGE_MAP = {', 'depois') + '\nreturn BADGE_MAP;')();
    const linhaExp = extrairLinhaExport(SRC_DEPOIS, 'depois');
    const empDeReg = fabricarEmpresaDeReg(SRC_DEPOIS, 'depois')(new Map());

    const reg = { _id: 'w', centro_custo: 'comercial  soulan', entidade: 'F', categoria: 'C', valor_original: 1, data_vencimento: '2026-02-02', status: 'pago' };
    const l = linhaExp(depois.resp, depois.gestorMap, empDeReg, statusV, BADGE, fmtData, '2026-09-29', reg);
    assert(l['CC (Centro de Custo)'] === 'comercial  soulan',
      'exportacao mantem o CC GRAVADO tal como esta no doc, nao a chave em caixa alta (obtido ' + JSON.stringify(l['CC (Centro de Custo)']) + ')');
    assert(l['Gestor Responsável'] === 'Marcelo Medeiros',
      'exportacao resolve o gestor pelo lookup unico (obtido ' + JSON.stringify(l['Gestor Responsável']) + ')');

    const regSemArea = { _id: 'w2', centro_custo: 'COMERCIAL', entidade: 'F', categoria: 'C', valor_original: 1, data_vencimento: '2026-02-02', status: 'pago' };
    const l2 = linhaExp(depois.resp, depois.gestorMap, empDeReg, statusV, BADGE, fmtData, '2026-09-29', regSemArea);
    assert(l2['Gestor Responsável'] === 'não informado',
      'exportacao de CC sem area sai "não informado" (nao vaza o texto de diagnostico da tela)');

    // Os TRES consumidores usam o MESMO lookup — prova textual.
    const consumidores = (SRC_DEPOIS.match(/_cpResponsavelDoReg\(/g) || []).length;
    assert(consumidores >= 4,
      '_cpResponsavelDoReg e referenciado ' + consumidores + 'x (1 declaracao + 3 consumidores): ordenacao, celula e exportacao');
    const resiude = (SRC_DEPOIS.match(/_areaGestorMap\.get\(/g) || []).length;
    assert(resiude === 1,
      '_areaGestorMap.get() aparece ' + resiude + 'x, so DENTRO do lookup unico (zero regua paralela sobrando)');
    const antesGets = (SRC_ANTES.match(/_areaGestorMap\.get\(/g) || []).length;
    console.log('  ANTES tinha ' + antesGets + ' chamadas diretas a _areaGestorMap.get(): eram as reguas duplicadas.');
  }
}

// =============================================================================
// FRENTE 2 — cards de Natureza do Custo
// =============================================================================

/** Monta a `atualizarKPIs` REAL da versao, capturando o que ela escreve no DOM. */
function montarKPI(src, rotulo, opcoes) {
  const o = opcoes || {};
  const corpo = [
    extrairFuncao(src, 'hojeISO', rotulo),
    extrairFuncao(src, 'statusVisual', rotulo),
    extrairFuncao(src, 'atualizarKPIs', rotulo),
  ].join('\n');
  const escrito = {};
  const el = (id) => ({
    set textContent(v) { escrito[id] = v; },
    get textContent() { return escrito[id]; },
    setAttribute() {},
  });
  const document = { getElementById: (id) => el(id) };
  // Formatador: por default o REAL do arquivo (Intl pt-BR), para a comparacao
  // byte a byte antes/depois. Com `numerico`, um formatador decimal para casar
  // com as constantes ditadas.
  const fmtBRL = o.numerico
    ? { format: (n) => Number(n).toFixed(2) }
    : new Function(extrairStatement(src, 'const fmtBRL =', rotulo) + '\nreturn fmtBRL;')();
  const CP_LIMIAR_ANO = new Function(
    extrairLinha(src, 'const CP_ANO_VIGENTE =') + '\n' +
    extrairLinha(src, 'const CP_LIMIAR_ANO =') + '\nreturn CP_LIMIAR_ANO;')();
  const _cpPeriodoComitado = o.periodo || { ini: '', fim: '' };
  const fn = new Function('document', 'fmtBRL', 'CP_LIMIAR_ANO', '_cpPeriodoComitado',
    corpo + '\nreturn atualizarKPIs;')(document, fmtBRL, CP_LIMIAR_ANO, _cpPeriodoComitado);
  return { fn, escrito, CP_LIMIAR_ANO };
}

async function frente2() {
  secao('FRENTE 2.1 — MAP_CLASS_FILTRO e classSetExpandido INTOCADOS');
  {
    const mapA = extrairStatement(SRC_ANTES, 'const MAP_CLASS_FILTRO = {', 'antes');
    const mapD = extrairStatement(SRC_DEPOIS, 'const MAP_CLASS_FILTRO = {', 'depois');
    assert(mapA === mapD, 'MAP_CLASS_FILTRO e TEXTUALMENTE identico ao HEAD (' + REL + ':' + linhaDe(SRC_DEPOIS, 'const MAP_CLASS_FILTRO = {') + ')');
    if (mapA !== mapD) { console.log('      antes:\n' + mapA); console.log('      depois:\n' + mapD); }

    const recorte = (src) => {
      const i = src.indexOf('let classSetExpandido = null;');
      const j = src.indexOf('const hoje = hojeISO();', i);
      return src.slice(i, j);
    };
    const rA = recorte(SRC_ANTES), rD = recorte(SRC_DEPOIS);
    assert(rA === rD, 'a resolucao de classSetExpandido e TEXTUALMENTE identica ao HEAD');
    if (rA !== rD) { console.log('      antes:\n' + rA); console.log('      depois:\n' + rD); }

    const usoA = extrairLinha(SRC_ANTES, 'if (classSetExpandido &&').trim();
    const usoD = extrairLinha(SRC_DEPOIS, 'if (classSetExpandido &&').trim();
    assert(usoA === usoD, 'a linha que APLICA classSetExpandido no filtro tambem e identica: ' + usoD);
    assert(SRC_DEPOIS.includes("'OPEX':"), 'o bucket OPEX do filtro Classificacao CONTINUA existindo (so o card saiu)');
    // `kpi-opex` sobra apenas num COMENTARIO que documenta a remocao; o que nao
    // pode sobrar e o elemento no DOM nem a escrita no setKPI.
    assert(!SRC_DEPOIS.includes('id="kpi-opex"'), 'o elemento id="kpi-opex" saiu do DOM');
    assert(!SRC_DEPOIS.includes("setKPI('kpi-opex'"), "setKPI('kpi-opex') saiu do atualizarKPIs");
    assert(SRC_ANTES.includes('id="kpi-opex"') && SRC_ANTES.includes("setKPI('kpi-opex'"),
      'pre-condicao: ANTES o card e o setKPI de kpi-opex existiam');
    const sobras = SRC_DEPOIS.split('\n')
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => l.includes('kpi-opex') && !/^\s*(\/\/|\*|<!--)/.test(l.trim()) && !l.trim().startsWith('//'));
    assert(sobras.length === 0, 'nenhuma linha de CODIGO menciona kpi-opex (sobras: ' + JSON.stringify(sobras) + ')');
  }

  secao('FRENTE 2.2 — particao completa por construcao (dado sintetico)');
  {
    const { fn, escrito } = montarKPI(SRC_DEPOIS, 'depois', { numerico: true, periodo: { ini: '2020-01-01', fim: '2030-12-31' } });
    const regs = [
      { tipo_entidade: 'Fornecedor Interno', valor_original: 100, data_vencimento: '2026-03-01', status: 'pago', categoria: 'A', entidade: 'A' },
      { tipo_entidade: 'Fornecedor Interno - PJ', valor_original: 200, data_vencimento: '2026-03-01', status: 'pago', categoria: 'A', entidade: 'A' },
      { tipo_entidade: 'Fornecedor Externo', valor_original: 400, data_vencimento: '2026-03-01', status: 'pago', categoria: 'A', entidade: 'A' },
      { tipo_entidade: 'Cliente', valor_original: 800, data_vencimento: '2026-03-01', status: 'pago', categoria: 'A', entidade: 'A' },
      { tipo_entidade: 'Fornecedor Misterioso', valor_original: 1600, data_vencimento: '2026-03-01', status: 'pago', categoria: 'A', entidade: 'A' },
      { tipo_entidade: '   ', valor_original: 3200, data_vencimento: '2026-03-01', status: 'pago', categoria: 'A', entidade: 'A' },
      { tipo_entidade: null, valor_original: 6400, data_vencimento: '2026-03-01', status: 'pago', categoria: 'A', entidade: 'A' },
      { valor_original: 12800, data_vencimento: '2026-03-01', status: 'pago', categoria: 'A', entidade: 'A' },
    ];
    fn(regs);
    const n = (k) => Number(escrito[k]);
    console.log('  ' + JSON.stringify(escrito));
    assert(n('kpi-interno') === 300, 'interno = CLT(100) + PJ(200) = 300 (obtido ' + escrito['kpi-interno'] + ')');
    assert(n('kpi-externo') === 400, 'externo = 400');
    assert(n('kpi-cliente') === 800, 'cliente = 800');
    assert(n('kpi-sem-class') === 1600 + 3200 + 6400 + 12800,
      'sem_class recolhe tipo inventado + espaco + null + ausente = 24000 (obtido ' + escrito['kpi-sem-class'] + ')');
    assert(escrito['kpi-sem-class-count'] === '4', 'sem_class conta 4 docs (obtido ' + escrito['kpi-sem-class-count'] + ')');
    const soma4 = n('kpi-interno') + n('kpi-externo') + n('kpi-cliente') + n('kpi-sem-class');
    assert(soma4 === 25500, 'os 4 cards somam o total do recorte por CONSTRUCAO: ' + soma4 + ' = 25500');
    assert(n('kpi-total') === 25500, 'sem tarifa no conjunto, kpi-total (pago+tarifas) coincide com a soma dos 4 — coincidencia deste dado, nao invariante');

    // Tipo desconhecido tem que cair em sem_class e a soma continuar fechando.
    const so = montarKPI(SRC_DEPOIS, 'depois', { numerico: true, periodo: { ini: '2020-01-01', fim: '2030-12-31' } });
    so.fn([{ tipo_entidade: 'Fornecedor Misterioso', valor_original: 7, data_vencimento: '2026-03-01', status: 'pago', categoria: 'A', entidade: 'A' }]);
    assert(Number(so.escrito['kpi-sem-class']) === 7 && Number(so.escrito['kpi-interno']) === 0,
      'tipo inventado "Fornecedor Misterioso" cai INTEGRALMENTE em sem_class (else final)');

    // ANTES: o mesmo conjunto deixava valor fora de card nenhum.
    const a = montarKPI(SRC_ANTES, 'antes', { numerico: true, periodo: { ini: '2020-01-01', fim: '2030-12-31' } });
    a.fn(regs);
    const opexAntes = Number(a.escrito['kpi-opex']);
    const clienteAntes = Number(a.escrito['kpi-cliente']);
    console.log('  ANTES: kpi-opex=' + a.escrito['kpi-opex'] + ' kpi-cliente=' + a.escrito['kpi-cliente']);
    assert(opexAntes === 500, 'ANTES: OPEX = CLT(100) + Externo(400) = 500, o PJ (200) ficava fora');
    assert(25500 - (opexAntes + clienteAntes) === 24200,
      'ANTES: ' + (25500 - opexAntes - clienteAntes) + ' de 25500 nao apareciam em card nenhum');
  }

  secao('FRENTE 2.3 — .trim() do tipo alinhado entre card e filtro');
  {
    const blocoTipo = extrairBloco(SRC_DEPOIS, 'if (tipoSet) {', 'depois');
    console.log('  ' + REL + ':' + linhaDe(SRC_DEPOIS, 'if (tipoSet) {'));
    console.log(blocoTipo.split('\n').map(l => '      ' + l.trim()).join('\n'));
    const rodaTipo = new Function('r', 'tipoSet', 'tipoFiltraSemTipo', blocoTipo + '\nreturn true;');
    const semTipo = new Set(['__SEM_TIPO__']);
    const regEspaco = { tipo_entidade: '   ' };
    assert(rodaTipo(regEspaco, semTipo, true) === true,
      'FILTRO: tipo_entidade = "   " e capturado pela sentinela __SEM_TIPO__ (o filtro sempre trimou)');
    const k = montarKPI(SRC_DEPOIS, 'depois', { numerico: true, periodo: { ini: '2020-01-01', fim: '2030-12-31' } });
    k.fn([{ tipo_entidade: '   ', valor_original: 55, data_vencimento: '2026-03-01', status: 'pago', categoria: 'A', entidade: 'A' }]);
    assert(Number(k.escrito['kpi-sem-class']) === 55,
      'CARD: tipo_entidade = "   " cai em sem_class — card e filtro alinhados pelo mesmo trim');
    const kA = montarKPI(SRC_ANTES, 'antes', { numerico: true, periodo: { ini: '2020-01-01', fim: '2030-12-31' } });
    kA.fn([{ tipo_entidade: ' Fornecedor Externo ', valor_original: 55, data_vencimento: '2026-03-01', status: 'pago', categoria: 'A', entidade: 'A' }]);
    const kD = montarKPI(SRC_DEPOIS, 'depois', { numerico: true, periodo: { ini: '2020-01-01', fim: '2030-12-31' } });
    kD.fn([{ tipo_entidade: ' Fornecedor Externo ', valor_original: 55, data_vencimento: '2026-03-01', status: 'pago', categoria: 'A', entidade: 'A' }]);
    console.log('  tipo " Fornecedor Externo " -> ANTES opex=' + kA.escrito['kpi-opex'] + ' | DEPOIS externo=' + kD.escrito['kpi-externo']);
    assert(Number(kA.escrito['kpi-opex']) === 0 && Number(kD.escrito['kpi-externo']) === 55,
      'tipo com espaco nas bordas: ANTES caia fora do card, DEPOIS cai no card certo');
    assert(rodaTipo({ tipo_entidade: ' Fornecedor Externo ' }, new Set(['Fornecedor Externo']), false) === true,
      'e o FILTRO ja aceitava esse mesmo registro — a divergencia card/filtro era real');

    // ALERTA de alinhamento: o card sem_class recolhe tipo DESCONHECIDO, mas a
    // sentinela __SEM_TIPO__ do filtro so captura tipo VAZIO. Este teste mede a
    // diferenca em vez de assumir que nao existe.
    const desconhecido = { tipo_entidade: 'Fornecedor Misterioso' };
    const capturadoPeloFiltro = rodaTipo(desconhecido, semTipo, true);
    console.log('  tipo desconhecido capturado pela sentinela __SEM_TIPO__ do filtro? ' + capturadoPeloFiltro);
    assert(capturadoPeloFiltro === false,
      'DIVERGENCIA MEDIDA: o card sem_class SOMA tipo desconhecido, mas o toggle __SEM_TIPO__ NAO o mostra na tabela (ver GAP no relatorio)');
  }

  secao('FRENTE 2.4 — _cpMesmoConjunto e o toggle do card');
  {
    const f = new Function(extrairFuncao(SRC_DEPOIS, '_cpMesmoConjunto', 'depois') + '\nreturn _cpMesmoConjunto;')();
    assert(f(['a', 'b'], ['b', 'a']) === true, 'igualdade de conjunto independe da ordem');
    assert(f(['a'], ['a']) === true, 'conjunto de 1 elemento');
    assert(f(['a', 'b'], ['a']) === false, 'tamanhos diferentes -> false');
    assert(f(['a'], ['a', 'b']) === false, 'tamanhos diferentes na ordem inversa -> false');
    assert(f(['a', 'b'], ['a', 'c']) === false, 'mesmo tamanho, membro diferente -> false');
    assert(f(null, ['a']) === false && f(['a'], null) === false, 'null nao estoura, devolve false');
    assert(f(['Todos'], ['Fornecedor Interno', 'Fornecedor Interno - PJ']) === false, "['Todos'] nao e o conjunto do card Interno");

    const mapa = new Function(extrairStatement(SRC_DEPOIS, 'const _KPI_FILTRO_MAP = {', 'depois') + '\nreturn _KPI_FILTRO_MAP;')();
    console.log('  _KPI_FILTRO_MAP: ' + JSON.stringify(mapa));
    assert(!('opex' in mapa), 'a chave opex saiu do _KPI_FILTRO_MAP');
    assert(JSON.stringify(mapa.interno.valores) === JSON.stringify(['Fornecedor Interno', 'Fornecedor Interno - PJ']),
      'o card interno isola DOIS valores de uma vez');
    for (const k of ['interno', 'externo', 'cliente', 'sem_class']) {
      assert(mapa[k] && mapa[k].selId === 'cp-filtro-tipo', 'card ' + k + ' aponta para cp-filtro-tipo');
    }
    assert(mapa.pago.selId === 'cp-filtro-status' && mapa.a_pagar.selId === 'cp-filtro-status',
      'pago e a_pagar continuam apontando para cp-filtro-status (nao regressao)');

    // Toggle REAL com select mock.
    function mockSelect(values) {
      const options = values.map(v => ({ value: v, selected: v === 'Todos' }));
      return {
        options,
        get selectedOptions() { return options.filter(o => o.selected); },
        querySelector(s) { const m = s.match(/option\[value="([^"]+)"\]/); return m ? (options.find(o => o.value === m[1]) || null) : null; },
        dispatchEvent() { return true; },
      };
    }
    const sel = mockSelect(['Todos', '__SEM_TIPO__', 'Cliente', 'Fornecedor Externo', 'Fornecedor Interno', 'Fornecedor Interno - PJ']);
    const corpo = [
      extrairFuncao(SRC_DEPOIS, 'getMultiValues', 'depois'),
      extrairFuncao(SRC_DEPOIS, 'isMultiAll', 'depois'),
      extrairFuncao(SRC_DEPOIS, 'setMultiValues', 'depois'),
      extrairStatement(SRC_DEPOIS, 'const _KPI_FILTRO_MAP = {', 'depois'),
      extrairFuncao(SRC_DEPOIS, '_cpMesmoConjunto', 'depois'),
      extrairFuncao(SRC_DEPOIS, '_cpToggleFiltroKPI', 'depois'),
    ].join('\n');
    const estado = { limpou: 0, render: 0, pinta: 0, salvou: 0 };
    const toggle = new Function('document', 'limparTodosFiltros', 'renderTudo',
      '_cpAtualizarKPIsAtivos', '_cpSalvarEstadoFiltros', 'Event', 'estado',
      'let _cpPage = 3;\n' + corpo + '\nreturn { toggle: _cpToggleFiltroKPI, page: () => _cpPage };')(
      { getElementById: (id) => (id === 'cp-filtro-tipo' ? sel : null) },
      () => { estado.limpou++; },
      () => { estado.render++; },
      () => { estado.pinta++; },
      () => { estado.salvou++; },
      function Event() {},
      estado);

    const valores = () => sel.options.filter(o => o.selected).map(o => o.value);
    toggle.toggle('interno');
    console.log('  1o clique em Interno -> ' + JSON.stringify(valores()));
    assert(JSON.stringify(valores().sort()) === JSON.stringify(['Fornecedor Interno', 'Fornecedor Interno - PJ']),
      'clique no card Interno isola os DOIS valores de uma vez');
    assert(toggle.page() === 1, 'mudanca de recorte volta para a pagina 1 (estava em 3)');
    toggle.toggle('interno');
    console.log('  2o clique em Interno -> ' + JSON.stringify(valores()));
    assert(JSON.stringify(valores()) === JSON.stringify(['Todos']), 'segundo clique no MESMO card limpa (volta para Todos)');
    toggle.toggle('sem_class');
    assert(JSON.stringify(valores()) === JSON.stringify(['__SEM_TIPO__']), 'card Sem Classificacao isola a sentinela __SEM_TIPO__ que ja existia');
    toggle.toggle('interno');
    assert(JSON.stringify(valores().sort()) === JSON.stringify(['Fornecedor Interno', 'Fornecedor Interno - PJ']),
      'trocar de card ISOLA o novo conjunto, nao acumula com o anterior');
    // Ordem invertida na selecao ainda conta como "este card esta ativo".
    sel.options.forEach(o => { o.selected = ['Fornecedor Interno - PJ', 'Fornecedor Interno'].includes(o.value); });
    toggle.toggle('interno');
    assert(JSON.stringify(valores()) === JSON.stringify(['Todos']),
      'selecao na ordem INVERTIDA ainda e reconhecida como o conjunto do card e o toggle limpa');
  }

  secao('FRENTE 2.4b — fiacao DOM x codigo dos 8 cards');
  {
    const idsDom = new Set([...SRC_DEPOIS.matchAll(/id="(kpi-[a-z-]+)"/g)].map(m => m[1]));
    const idsSetKPI = [...SRC_DEPOIS.matchAll(/setKPI\('(kpi-[a-z-]+)'(?:[^)]*?'(kpi-[a-z-]+)')?/g)]
      .flatMap(m => [m[1], m[2]]).filter(Boolean);
    const orfaos = [...new Set(idsSetKPI.filter(id => !idsDom.has(id)))];
    console.log('  ids escritos por setKPI e AUSENTES do DOM: ' + JSON.stringify(orfaos));
    // Os ids de Natureza precisam existir, senao o card nasce congelado em R$ 0,00.
    for (const id of ['kpi-interno', 'kpi-externo', 'kpi-cliente', 'kpi-sem-class', 'kpi-sem-class-count']) {
      assert(idsDom.has(id) && idsSetKPI.includes(id), 'o card ' + id + ' existe no DOM E e escrito por setKPI');
    }
    // kpi-vencido: setKPI escreve num elemento que nao existe. Mede e prova que
    // isso JA era assim no HEAD (achado pre-existente, nao regressao da Frente 2).
    const idsDomAntes = new Set([...SRC_ANTES.matchAll(/id="(kpi-[a-z-]+)"/g)].map(m => m[1]));
    const orfaosAntes = [...new Set([...SRC_ANTES.matchAll(/setKPI\('(kpi-[a-z-]+)'(?:[^)]*?'(kpi-[a-z-]+)')?/g)]
      .flatMap(m => [m[1], m[2]]).filter(Boolean).filter(id => !idsDomAntes.has(id)))];
    console.log('  os mesmos orfaos no HEAD:            ' + JSON.stringify(orfaosAntes));
    assert(JSON.stringify(orfaos.sort()) === JSON.stringify(orfaosAntes.sort()),
      'ACHADO PRE-EXISTENTE, nao regressao: os ids orfaos sao os MESMOS do HEAD (' + JSON.stringify(orfaos) + ')');

    // Todo card clicavel tem regra de filtro (ou e o "total", que limpa tudo).
    const mapa = new Function(extrairStatement(SRC_DEPOIS, 'const _KPI_FILTRO_MAP = {', 'depois') + '\nreturn _KPI_FILTRO_MAP;')();
    const cards = [...new Set([...SRC_DEPOIS.matchAll(/data-kpi-card="([a-z_]+)"/g)].map(m => m[1]))];
    console.log('  data-kpi-card no DOM: ' + JSON.stringify(cards));
    for (const c of cards) {
      assert(c === 'total' || !!mapa[c], 'card clicavel "' + c + '" tem entrada em _KPI_FILTRO_MAP');
    }
    for (const k of Object.keys(mapa)) {
      assert(cards.includes(k), 'a entrada "' + k + '" de _KPI_FILTRO_MAP tem card correspondente no DOM (senao e regra morta)');
    }
    // Toda lampada tem texto explicativo.
    const lampadas = [...new Set([...SRC_DEPOIS.matchAll(/data-kpi="([a-z_]+)"/g)].map(m => m[1]))];
    const expl = new Function(extrairStatement(SRC_DEPOIS, 'const KPI_EXPLICACOES = {', 'depois') + '\nreturn KPI_EXPLICACOES;')();
    for (const l of lampadas) {
      assert(!!expl[l], 'a lampada "' + l + '" tem texto em KPI_EXPLICACOES (senao o modal abre vazio)');
    }
    assert(!('opex' in expl), 'o texto explicativo de OPEX saiu junto com o card');

    // CRITICO: todo valor que o toggle manda para setMultiValues precisa EXISTIR
    // como <option>. Se nao existir, setMultiValues religa 'Todos' em silencio e
    // o clique no card mostra a base INTEIRA em vez do recorte.
    const opcoesDo = (selId) => {
      const i = SRC_DEPOIS.indexOf('id="' + selId + '"');
      if (i < 0) return null;
      const fim = SRC_DEPOIS.indexOf('</select>', i);
      return new Set([...SRC_DEPOIS.slice(i, fim).matchAll(/value="([^"]*)"/g)].map(m => m[1]));
    };
    for (const [k, conf] of Object.entries(mapa)) {
      const ops = opcoesDo(conf.selId);
      assert(ops !== null, 'o select ' + conf.selId + ' existe no DOM (card ' + k + ')');
      for (const v of conf.valores) {
        assert(ops && ops.has(v),
          'card ' + k + ': a <option value="' + v + '"> existe em ' + conf.selId +
          ' (sem ela, o clique cairia em "Todos" e mostraria a base inteira)');
      }
    }
    // Os cards de Natureza tem que morar DENTRO de #kpi-grid-cp: os 3 listeners
    // sao delegados nesse wrapper.
    const iGrid = SRC_DEPOIS.indexOf('id="kpi-grid-cp"');
    const fimGrid = SRC_DEPOIS.indexOf('</section>', iGrid);
    const dentro = SRC_DEPOIS.slice(iGrid, fimGrid);
    for (const c of ['interno', 'externo', 'cliente', 'sem_class']) {
      assert(dentro.includes('data-kpi-card="' + c + '"'),
        'o card ' + c + ' esta DENTRO de #kpi-grid-cp (os listeners sao delegados nele)');
    }
  }

  // ===========================================================================
  // FRENTE 2.5 — A GUARDA DE CANCELADO. Prova SINTETICA, e ela nao e "reforco":
  // e a UNICA forma de provar quase tudo desta frente, porque a base real tem
  // apenas DOIS valores de `status` ('pago' com 51.177 docs e 'cancelado' com 4)
  // e nenhuma variacao de grafia. Com dado real da para provar que os 4 docs
  // cancelados sairam de `interno` e `externo`, e SO isso. Que `cliente` e
  // `sem_class` tambem excluem cancelado, e que o criterio e de PREFIXO e nao de
  // igualdade, NAO tem testemunha no dado real: os buckets Cliente e SemClass
  // tem ZERO cancelados hoje.
  // Estes casos sao, por isso, prova de COMPORTAMENTO DO CODIGO, nao prova de
  // dado existente. As duas coisas ficam em secoes separadas de proposito, e
  // nenhuma assertiva mistura as duas.
  // ===========================================================================
  secao('FRENTE 2.5 — a guarda de CANCELADO, comportamento do codigo (sintetico)');
  // Centavos como INTEIRO: o formatador `numerico` da suite e toFixed(2), entao a
  // string ja vem com 2 casas exatas e da para virar inteiro sem passar por
  // aritmetica de ponto flutuante. Comparar 48612943.95 com float acumulado por
  // somas sucessivas e o caminho para um teste que passa por epsilon, nao por
  // igualdade.
  const cent = (s) => {
    const m = String(s == null ? '0.00' : s).match(/^(-?)(\d+)\.(\d\d)$/);
    if (!m) throw new Error('valor nao esta no formato decimal de 2 casas: ' + s);
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 100 + Number(m[3]));
  };
  const centSoma = (e, ...ids) => ids.reduce((a, id) => a + cent(e[id]), 0);
  {
    // (a) O criterio e o MESMO do DRE, e isso e o proprio objetivo da frente.
    //     Comparado como TEXTO da expressao, extraido dos dois arquivos reais.
    const DRE_REL = 'dre_gerencial_desktop/code.html';
    const SRC_DRE = lf(fs.readFileSync(path.join(ROOT, DRE_REL), 'utf8'));
    const expr = (s) => {
      const m = s.match(/\/\^cancel\/i\s*\.test\(\s*String\(\s*\w+\.status\s*\|\|\s*''\s*\)\s*\.trim\(\)\s*\)/);
      return m ? m[0].replace(/\s+/g, '').replace(/\w+\.status/, 'X.status') : null;
    };
    const eCP = expr(extrairLinha(SRC_DEPOIS, 'const _ehCancelado ='));
    const eDRE = expr(extrairLinha(SRC_DRE, 'function cpStatusCancelado(reg)'));
    console.log('  CP  (' + REL + ':' + linhaDe(SRC_DEPOIS, 'const _ehCancelado =') + ') : ' + eCP);
    console.log('  DRE (' + DRE_REL + ':' + linhaDe(SRC_DRE, 'function cpStatusCancelado(reg)') + ') : ' + eDRE);
    assert(eCP !== null && eCP === eDRE,
      'o criterio de cancelado do CP e TEXTUALMENTE o mesmo do DRE (prefixo /^cancel/i sobre status.trim()), ' +
      'que era o proposito declarado da frente: as duas telas concordarem sobre o que e custo');
    // A guarda envolve SO os 4 buckets. Provado pela POSICAO: os acumuladores de
    // caixa sao incrementados ANTES da linha da guarda, e os 4 buckets DEPOIS.
    const corpoKPI = extrairFuncao(SRC_DEPOIS, 'atualizarKPIs', 'depois');
    const iGuarda = corpoKPI.indexOf('const _ehCancelado =');
    const pos = (t) => corpoKPI.indexOf(t);
    for (const [rot, marca] of [['total', 'total += v; cTotal++;'], ['pago', 'pago += v; cPago++;'],
      ['aPagar', 'aPagar += v; cAPagar++;'], ['vencido', 'vencido += v; cVencido++;'], ['tarifas', 'tarifas += v;']]) {
      const p = pos(marca);
      assert(p >= 0 && p < iGuarda,
        'o acumulador `' + rot + '` e incrementado ANTES da guarda, logo a guarda NAO pode afeta-lo (escopo estreito que o diretor pediu)');
    }
    for (const [rot, marca] of [['interno', 'interno += v;'], ['externo', 'externo += v;'],
      ['cliente', 'cliente += v;'], ['semClass', 'semClass += v; cSemClass++;']]) {
      const p = pos(marca);
      assert(p > iGuarda, 'o bucket `' + rot + '` e incrementado DEPOIS da guarda, logo esta coberto por ela');
    }
    // E o card Total Geral continua sendo Pago + Tarifas, sem tocar em cancelado.
    const lTotal = extrairLinha(SRC_DEPOIS, "setKPI('kpi-total',");
    assert(/pago \+ tarifas/.test(lTotal) && /cPago \+ cTarifas/.test(lTotal),
      'Total Geral continua sendo Pago + Tarifas (decisao do diretor, nao tocada): ' + lTotal.trim());
  }

  // Fabrica de registro sintetico. `categoria`/`entidade` escolhidos para NAO
  // acionarem a regra de tarifa (nada de TARIFA, nada de COMISSAO+BANC).
  const ANO_LIM = String(montarKPI(SRC_DEPOIS, 'depois', { numerico: true }).CP_LIMIAR_ANO).slice(0, 4);
  let _seq = 0;
  const mk = (tipo, valor, status, venc) => ({
    _id: 'sint-' + (++_seq), entidade: 'FORNECEDOR DE TESTE', categoria: 'ALUGUEL',
    tipo_entidade: tipo, valor_original: valor,
    data_vencimento: venc || (ANO_LIM + '-06-15'), status: status || 'pago',
  });
  const rodar = (regs) => { const k = montarKPI(SRC_DEPOIS, 'depois', { numerico: true }); k.fn(regs); return k.escrito; };
  // Mede o universo que os 4 cards cobrem SEM reimplementar o recorte: apaga
  // `tipo_entidade` de tudo e le `kpi-sem-class`, porque o `else` final da funcao
  // manda todo tipo desconhecido para la. Como `semClass` esta DENTRO da guarda,
  // o numero que sai e, por construcao, "recorte sem tarifa E SEM CANCELADO".
  const semTipo = (regs) => regs.map(r => { const c = Object.assign({}, r); delete c.tipo_entidade; return c; });
  const universo4 = (regs) => rodar(semTipo(regs));
  // O MESMO medidor, mas contra o HEAD (sem a guarda): devolve o recorte sem
  // tarifa COM cancelado. Serve para a diferenca entre os dois universos ter nome.
  const universo4H = (regs) => { const k = montarKPI(SRC_HEAD, 'head', { numerico: true }); k.fn(semTipo(regs)); return k.escrito; };

  {
    // (b) CONSISTENCIA ENTRE OS QUATRO: um cancelado de CADA um dos 4 tipos (mais
    //     um de tipo desconhecido), e NENHUM deles pode somar. Valores escolhidos
    //     distintos e nao redondos para que qualquer vazamento apareca no centavo
    //     e seja atribuivel ao bucket exato.
    const pagos = [mk('Fornecedor Interno', 100), mk('Fornecedor Interno - PJ', 200),
      mk('Fornecedor Externo', 400), mk('Cliente', 800), mk('', 1600)];
    const cancs = [mk('Fornecedor Interno', 7.01, 'cancelado'), mk('Fornecedor Interno - PJ', 11.02, 'cancelado'),
      mk('Fornecedor Externo', 13.03, 'cancelado'), mk('Cliente', 17.04, 'cancelado'),
      mk('', 19.05, 'cancelado'), mk('Fornecedor Misterioso', 23.06, 'cancelado')];
    const soPagos = rodar(pagos);
    const comCancs = rodar(pagos.concat(cancs));
    const ESP = { 'kpi-interno': 30000, 'kpi-externo': 40000, 'kpi-cliente': 80000, 'kpi-sem-class': 160000 };
    for (const [id, esp] of Object.entries(ESP)) {
      assert(cent(soPagos[id]) === esp, 'pre-condicao, so pagos: ' + id + ' = ' + (esp / 100).toFixed(2) + ' (obtido ' + soPagos[id] + ')');
      assert(cent(comCancs[id]) === esp,
        'TODOS OS 4 excluem cancelado: ' + id + ' nao se moveu ao acrescentar 1 cancelado de cada tipo (' +
        soPagos[id] + ' -> ' + comCancs[id] + ')');
    }
    // A CONTAGEM tambem. `cSemClass` esta dentro da guarda, entao o cancelado sem
    // tipo nao pode inflar o "N sem tipo" do card.
    assert(comCancs['kpi-sem-class-count'] === soPagos['kpi-sem-class-count'],
      'a CONTAGEM de Sem Classificacao tambem exclui cancelado (' + soPagos['kpi-sem-class-count'] +
      ' -> ' + comCancs['kpi-sem-class-count'] + '), senao o card mostraria valor de 1 doc e contagem de 2');
    // Contraprova de que o conjunto sintetico nao e vacuo: os cancelados EXISTEM
    // e sao vistos pela funcao, porque `total` os conta. `total` nao e exibido,
    // entao a testemunha e `kpi-a-pagar`/`kpi-vencido`: um cancelado com
    // statusVisual 'cancelado' nao entra em nenhum dos dois. Uso `kpi-total-count`,
    // que e cPago+cTarifas, para provar que eles NAO entraram em pago tambem.
    assert(comCancs['kpi-total-count'] === soPagos['kpi-total-count'],
      'os 6 cancelados sinteticos tambem nao entram em kpi-total-count (que e cPago + cTarifas), ' +
      'ou seja: cancelado hoje nao aparece em NENHUM card, nem de caixa nem de natureza');
    // E o universo que os 4 cobrem, medido pela propria funcao, exclui cancelado.
    assert(cent(universo4(pagos.concat(cancs))['kpi-sem-class']) === centSoma(comCancs, 'kpi-interno', 'kpi-externo', 'kpi-cliente', 'kpi-sem-class'),
      'soma dos 4 == recorte sem tarifa E SEM CANCELADO, em CENTAVOS inteiros (sintetico)');
  }

  {
    // (c) CRITERIO DE PREFIXO, e nao de igualdade. Cada variante entra sozinha
    //     sobre a mesma base de 1 doc pago, e o card nao pode se mover.
    //     NENHUMA destas grafias existe na base real: isto e prova do codigo.
    const base = [mk('Fornecedor Externo', 1000)];
    const VARIANTES = [
      ['cancelado', 'o literal exato, o unico que existe na base real'],
      ['CANCELADO', 'maiusculas, pego pelo /i'],
      ['Cancelada', 'genero feminino, pego pelo prefixo e NAO por igualdade'],
      ['cancelado ', 'espaco no fim, pego pelo .trim()'],
      [' cancelado', 'espaco no inicio, pego pelo .trim()'],
      ['Cancelado ', 'maiuscula + espaco, as duas defesas juntas'],
      ['cancelamento_previsto', 'PREFIXO: excluido tambem, e isto e um FALSO POSITIVO em potencial'],
      ['cancel', 'o prefixo nu'],
    ];
    for (const [st, nota] of VARIANTES) {
      const e = rodar(base.concat([mk('Fornecedor Externo', 55.55, st)]));
      assert(cent(e['kpi-externo']) === 100000,
        'status ' + JSON.stringify(st) + ' e EXCLUIDO dos cards de natureza (' + nota + '), kpi-externo ficou ' + e['kpi-externo']);
    }
    // Controle NEGATIVO: sem ele, um teste que "exclui tudo" passaria igual.
    const NAO_CANCELADO = [
      ['pago', 'o normal'],
      ['provisionado', 'status real do statusVisual, e NAO e cancelamento'],
      ['pendente', 'inexistente na base, mas nao e cancelamento'],
      ['a_cancelar', 'contem "cancel" mas NAO como prefixo: entra como custo'],
      ['pago cancelado', 'contem "cancelado" no meio: entra como custo'],
      ['concelado', 'erro de digitacao: NAO e pego, entra como custo'],
      ['estornado', 'estorno nao e cancelamento para esta regra'],
      ['', 'status vazio entra como custo'],
    ];
    for (const [st, nota] of NAO_CANCELADO) {
      const e = rodar(base.concat([mk('Fornecedor Externo', 55.55, st)]));
      assert(cent(e['kpi-externo']) === 105555,
        'status ' + JSON.stringify(st) + ' NAO e excluido, SOMA normalmente (' + nota + '), kpi-externo = ' + e['kpi-externo']);
    }
  }

  {
    // (d) GAP-A. O criterio DIVERGE dentro da MESMA funcao: `statusVisual` usa
    //     IGUALDADE (st === 'cancelado', depois de toLowerCase e SEM trim) e a
    //     guarda nova usa PREFIXO com trim. Nas grafias em que os dois discordam,
    //     a MESMA tela se contradiz: o lancamento entra no card A Pagar (e recebe
    //     o icone de "a vencer" na tabela) e ao mesmo tempo NAO conta como custo.
    const base = [mk('Fornecedor Externo', 1000)];
    const futuro = '2099-12-31';
    for (const st of ['Cancelado ', 'Cancelada', 'cancelamento_previsto']) {
      const e = rodar(base.concat([mk('Fornecedor Externo', 55.55, st, futuro)]));
      const entrouEmCaixa = cent(e['kpi-a-pagar']) === 5555;
      const saiuDoCusto = cent(e['kpi-externo']) === 100000;
      console.log('  status ' + JSON.stringify(st).padEnd(26) + ' kpi-a-pagar=' + e['kpi-a-pagar'] +
        '  kpi-externo=' + e['kpi-externo'] + (entrouEmCaixa && saiuDoCusto ? '   <== CONTRADICAO' : ''));
      assert(entrouEmCaixa && saiuDoCusto,
        'GAP-A CONFIRMADO para status ' + JSON.stringify(st) + ': statusVisual (igualdade) o trata como A VENCER e ' +
        'a guarda (prefixo) o trata como CANCELADO. Mesma funcao, dois criterios. O card A Pagar mostra ' +
        e['kpi-a-pagar'] + ' de um lancamento que os cards de custo ignoram');
      // E aqui esta a parte que torna o GAP-A PIOR, nao melhor, e que eu errei na
      // primeira tentativa deste teste: a identidade "Total Geral - soma dos 4 ==
      // tarifas" CONTINUA valendo. Ela vale por acidente algebrico, porque
      // `Total Geral` = Pago + Tarifas ignora `aPagar`, e tanto `aPagar` quanto
      // `canceladoVisual` entram na conta com o MESMO sinal. O documento apenas
      // migra de uma parcela subtraida para outra parcela subtraida e a diferenca
      // nao se move. Consequencia pratica: a reconciliacao que o diretor vai usar
      // para conferir a tela NAO detecta o GAP-A. Ele e silencioso.
      const soma4 = centSoma(e, 'kpi-interno', 'kpi-externo', 'kpi-cliente', 'kpi-sem-class');
      assert(cent(e['kpi-total']) - soma4 === cent(e['kpi-tarifas']),
        '  ... e a identidade "Total Geral - soma dos 4 == tarifas" CONTINUA valendo (' +
        (cent(e['kpi-total']) - soma4) + ' == ' + cent(e['kpi-tarifas']) + '), porque Total Geral ignora ' +
        '`aPagar`. Logo a conta de reconciliacao NAO pega o GAP-A: ele e SILENCIOSO');
    }
    // O que REALMENTE quebra a identidade nao e o cancelado com grafia estranha, e
    // sim qualquer lancamento a vencer com status normal. Prova, para a fronteira
    // da invariante 2 ficar explicita e nao ser descoberta em producao:
    const eAVencer = rodar(base.concat([mk('Fornecedor Externo', 55.55, 'pendente', futuro)]));
    const s4 = centSoma(eAVencer, 'kpi-interno', 'kpi-externo', 'kpi-cliente', 'kpi-sem-class');
    assert(cent(eAVencer['kpi-a-pagar']) === 5555 && cent(eAVencer['kpi-externo']) === 105555 &&
      cent(eAVencer['kpi-total']) - s4 !== cent(eAVencer['kpi-tarifas']),
      'FRONTEIRA da invariante 2: um unico lancamento A VENCER com status normal ja quebra ' +
      '"Total Geral - soma dos 4 == tarifas" (' + (cent(eAVencer['kpi-total']) - s4) + ' != ' +
      cent(eAVencer['kpi-tarifas']) + '), porque ele e custo mas nao e Pago. A invariante so vale ' +
      'enquanto a base estiver 100% paga. Nao e erro da frente, e limite da invariante');
  }

  {
    // (e) GAP-E, PRE-EXISTENTE mas relevante porque a identidade nova depende dele:
    //     'provisionado' NAO e cancelado, entao entra nos 4 cards como custo, mas
    //     `statusVisual` o manda para um ramo que nao alimenta pago/aPagar/vencido.
    //     Logo ele soma no custo e nao aparece em nenhum card de caixa.
    const e = rodar([mk('Fornecedor Externo', 1000), mk('Fornecedor Externo', 77.77, 'provisionado')]);
    const soma4 = centSoma(e, 'kpi-interno', 'kpi-externo', 'kpi-cliente', 'kpi-sem-class');
    console.log('  provisionado: kpi-externo=' + e['kpi-externo'] + ' kpi-pago=' + e['kpi-pago'] +
      ' kpi-a-pagar=' + e['kpi-a-pagar'] + ' kpi-vencido=' + e['kpi-vencido']);
    assert(cent(e['kpi-externo']) === 107777,
      'GAP-E: provisionado CONTA como custo nos 4 cards (nao e cancelado), kpi-externo = ' + e['kpi-externo']);
    assert(cent(e['kpi-total']) - soma4 !== cent(e['kpi-tarifas']),
      'GAP-E: com um provisionado em base, "Total Geral - soma dos 4 == tarifas" QUEBRA (' +
      (cent(e['kpi-total']) - soma4) + ' != ' + cent(e['kpi-tarifas']) + '). A identidade so vale porque HOJE ' +
      'a base nao tem provisionado, nem a vencer, nem atrasado. E COINCIDENCIA DO DADO, nao invariante estrutural');
    // A invariante que E estrutural, e que vale em TODOS os casos acima:
    assert(cent(universo4([mk('Fornecedor Externo', 1000), mk('Fornecedor Externo', 77.77, 'provisionado'),
      mk('Cliente', 5, 'cancelado')])['kpi-sem-class']) === 107777,
      'a invariante ESTRUTURAL (soma dos 4 == recorte sem tarifa e sem cancelado) sobrevive a provisionado E a cancelado');
  }

  {
    // (f) PARTICAO: tipo desconhecido cai em Sem Classificacao e a soma fecha,
    //     inclusive na presenca de cancelado.
    const regs = [mk('Fornecedor Interno', 100), mk('Fornecedor Quinto Tipo', 250.25),
      mk('Fornecedor Sexto Tipo', 0.01, 'cancelado'), mk('Cliente', 300)];
    const e = rodar(regs);
    assert(cent(e['kpi-sem-class']) === 25025,
      'tipo_entidade INVENTADO cai em Sem Classificacao (' + e['kpi-sem-class'] + '), e o cancelado de outro tipo inventado NAO');
    assert(centSoma(e, 'kpi-interno', 'kpi-externo', 'kpi-cliente', 'kpi-sem-class') === cent(universo4(regs)['kpi-sem-class']),
      'com dois tipos desconhecidos, os 4 cards continuam PARTICIONANDO o universo que cobrem (soma fecha em centavos)');
  }

  {
    // (g) MUTACAO. Um teste verde que continuaria verde com o codigo errado nao
    //     prova nada. Aqui a fonte e MUTADA em memoria (o arquivo real nunca e
    //     tocado) e os casos acima sao re-executados contra a mutacao: eles TEM
    //     que reprovar. Se uma mutacao passar, a assertiva correspondente e
    //     tautologica e precisa ser reescrita.
    const rodarSrc = (src, regs) => { const k = montarKPI(src, 'mutante', { numerico: true }); k.fn(regs); return k.escrito; };

    // M1 — prefixo trocado por IGUALDADE. As grafias variantes voltam a somar.
    const M1 = SRC_DEPOIS.replace(
      "const _ehCancelado = /^cancel/i.test(String(r.status || '').trim());",
      "const _ehCancelado = String(r.status || '').toLowerCase() === 'cancelado';");
    assert(M1 !== SRC_DEPOIS, 'mutante M1 foi construido (o texto da guarda e o que a suite supoe)');
    const m1 = rodarSrc(M1, [mk('Fornecedor Externo', 1000), mk('Fornecedor Externo', 55.55, 'Cancelada')]);
    assert(cent(m1['kpi-externo']) === 105555,
      'MUTACAO M1 REPROVADA como esperado: trocando o prefixo por igualdade, o status "Cancelada" volta a somar ' +
      '(' + m1['kpi-externo'] + '). Logo o caso do criterio de prefixo NAO e tautologico');

    // M2 — `.trim()` removido da guarda. Grafia com espaco volta a somar.
    // ARMADILHA QUE ME PEGOU, registrada para nao pegar o proximo: a expressao
    // `/^cancel/i.test(String(r.status || '').trim())` ocorre DUAS vezes no arquivo
    // (a guarda do KPI e a guarda do drill-down em `aplicarFiltrosCP`), e
    // String.replace com string troca so a PRIMEIRA. O mutante saiu com o KPI
    // intacto e o teste "falhou" apontando para o lugar errado. O alvo agora inclui
    // `const _ehCancelado = `, que e unico.
    const ALVO_GUARDA = "const _ehCancelado = /^cancel/i.test(String(r.status || '').trim());";
    assert(SRC_DEPOIS.split(ALVO_GUARDA).length - 1 === 1,
      'o alvo da mutacao M2 e UNICO no arquivo (a expressao nua ocorre 2x: KPI e drill-down)');
    const M2 = SRC_DEPOIS.replace(ALVO_GUARDA,
      "const _ehCancelado = /^cancel/i.test(String(r.status || ''));");
    assert(M2 !== SRC_DEPOIS, 'mutante M2 foi construido');
    const m2 = rodarSrc(M2, [mk('Fornecedor Externo', 1000), mk('Fornecedor Externo', 55.55, ' cancelado')]);
    assert(cent(m2['kpi-externo']) === 105555,
      'MUTACAO M2 REPROVADA como esperado: sem o .trim(), " cancelado" (espaco no inicio) volta a somar ' +
      '(' + m2['kpi-externo'] + '). Logo o caso do trim NAO e tautologico');

    // M3 — `cliente` tirado de DENTRO da guarda. O cancelado de Cliente volta a
    //      somar, e e exatamente o cenario que o dado real nao consegue testemunhar.
    const M3 = SRC_DEPOIS.replace(
      "else if (t === 'Cliente') cliente += v;",
      "else if (t === 'Cliente') { }\n                }\n                { const t2 = String(r.tipo_entidade || '').trim(); if (t2 === 'Cliente') cliente += v;");
    assert(M3 !== SRC_DEPOIS, 'mutante M3 foi construido');
    const m3 = rodarSrc(M3, [mk('Cliente', 1000), mk('Cliente', 55.55, 'cancelado')]);
    assert(cent(m3['kpi-cliente']) === 105555,
      'MUTACAO M3 REPROVADA como esperado: com `cliente` FORA da guarda, o cancelado de Cliente volta a somar ' +
      '(' + m3['kpi-cliente'] + '). Logo o caso "os QUATRO excluem cancelado" NAO e tautologico, e e ele que ' +
      'cobre o que os 51.181 docs reais nao cobrem (zero cancelados em Cliente)');

    // M4 — guarda ESTENDIDA tambem ao `pago`. O que o diretor proibiu.
    const M4 = SRC_DEPOIS.replace(
      "if (vs === 'pago') { pago += v; cPago++; }",
      "if (vs === 'pago' && !/^cancel/i.test(String(r.status || '').trim())) { pago += v; cPago++; }");
    assert(M4 !== SRC_DEPOIS, 'mutante M4 foi construido');
    const m4 = rodarSrc(M4, [mk('Fornecedor Externo', 1000), mk('Fornecedor Externo', 55.55, 'cancelado')]);
    const d4 = rodarSrc(SRC_DEPOIS, [mk('Fornecedor Externo', 1000), mk('Fornecedor Externo', 55.55, 'cancelado')]);
    assert(m4['kpi-pago'] === d4['kpi-pago'],
      'MUTACAO M4: estender a guarda ao `pago` nao muda nada HOJE, porque statusVisual ja manda cancelado para ' +
      'fora de `pago`. E por isso que a checagem de "o que nao podia mudar" NAO basta sozinha: quem garante o ' +
      'escopo estreito e o teste de POSICAO textual da guarda no laco (2.5a), nao o numero');
  }

  secao('FRENTE 2.6 — PROVA NUMERICA sobre os dados reais');
  const CAMINHO = argDados();
  if (!CAMINHO || !fs.existsSync(CAMINHO)) {
    pular('prova numerica antes/depois nos 51.181 docs', 'snapshot nao informado (use --dados <arquivo fora do repo>)');
    return;
  }
  const registros = JSON.parse(fs.readFileSync(CAMINHO, 'utf8'));
  console.log('  snapshot: ' + CAMINHO);
  console.log('  docs: ' + registros.length.toLocaleString('pt-BR'));

  // (1) O QUE NAO PODIA MUDAR, comparado como STRING com o formatador REAL do
  //     arquivo (Intl pt-BR), contra AS DUAS BASES.
  //     Contra HEAD a pergunta e "a guarda de cancelado, sozinha, mexeu nisto?".
  //     Contra 0ca791e a pergunta e "a Frente 2 inteira mexeu nisto?".
  //     A primeira e a que o diretor pediu; a segunda e a rede de seguranca.
  const strA = montarKPI(SRC_ANTES, 'antes'); strA.fn(registros);
  const strH = montarKPI(SRC_HEAD, 'head'); strH.fn(registros);
  const strD = montarKPI(SRC_DEPOIS, 'depois'); strD.fn(registros);
  const PRESERVAR = ['kpi-total', 'kpi-total-count', 'kpi-pago', 'kpi-pago-count',
    'kpi-a-pagar', 'kpi-a-pagar-count', 'kpi-vencido', 'kpi-vencido-count',
    'kpi-tarifas', 'kpi-tarifas-count'];
  console.log('  --- formatador REAL (Intl pt-BR), comparado como STRING ---');
  console.log('      ' + 'id'.padEnd(20) + BASE_REF.padEnd(24) + HEAD_REF.padEnd(24) + 'worktree');
  for (const k of PRESERVAR) {
    const a = strA.escrito[k], h = strH.escrito[k], d = strD.escrito[k];
    console.log('      ' + k.padEnd(20) + String(a).padEnd(24) + String(h).padEnd(24) + String(d));
    assert(h === d, 'a GUARDA DE CANCELADO nao tocou ' + k + ': identico como STRING contra ' + HEAD_REF +
      ' (head=' + h + ' depois=' + d + ')');
    assert(a === d, 'e nem a Frente 2 inteira tocou: identico como STRING contra ' + BASE_REF +
      ' (antes=' + a + ' depois=' + d + ')');
  }
  // E o CONTRARIO tambem tem que ser verdade, senao a comparacao acima e vacua:
  // os DOIS cards que DEVIAM mudar mudaram, e so eles.
  console.log('  --- o que DEVIA mudar (guarda de cancelado), contra ' + HEAD_REF + ' ---');
  for (const k of ['kpi-interno', 'kpi-externo', 'kpi-cliente', 'kpi-sem-class', 'kpi-sem-class-count']) {
    const h = strH.escrito[k], d = strD.escrito[k];
    const deveMudar = (k === 'kpi-interno' || k === 'kpi-externo');
    console.log('      ' + k.padEnd(20) + String(h).padEnd(24) + String(d) + (h === d ? '   (igual)' : '   (MUDOU)'));
    assert(deveMudar ? h !== d : h === d, deveMudar
      ? 'kpi-' + k.slice(4) + ' MUDOU pela guarda (' + h + ' -> ' + d + '), como esperado: tinha cancelado dentro'
      : k + ' NAO mudou pela guarda (' + d + '): nao havia cancelado neste bucket no dado real');
  }

  // (2) Valores decimais para casar com as constantes ditadas.
  const numA = montarKPI(SRC_ANTES, 'antes', { numerico: true }); numA.fn(registros);
  const numD = montarKPI(SRC_DEPOIS, 'depois', { numerico: true }); numD.fn(registros);
  console.log('  --- DEPOIS, em decimal ---');
  Object.keys(numD.escrito).sort().forEach(k => console.log('      ' + k.padEnd(22) + '= ' + numD.escrito[k]));
  console.log('  --- ANTES, em decimal ---');
  Object.keys(numA.escrito).sort().forEach(k => console.log('      ' + k.padEnd(22) + '= ' + numA.escrito[k]));

  // ── AS CONSTANTES, e POR QUE cada uma mudou (atualizadas em 2026-09-30) ──────
  // A guarda `cancelado nao e custo` tirou 4 documentos dos cards de natureza.
  // Sao estes, lidos do snapshot (o teste os RE-DERIVA logo abaixo, nao confia):
  //   Fornecedor Externo        3 docs   R$ 128.537,11
  //                                        126.785,99  EMPRESTIMOS - BANCO REAL - SEL
  //                                            700,35  TELEFONES - INTERNOS
  //                                          1.050,77  UNIFORMES/EPI'S - CLIENTES
  //   Fornecedor Interno - PJ   1 doc    R$     235,87  RELATORIO DE DESPESAS - INTERN
  //   Cliente                   0 docs   R$       0,00  <- por isso kpi-cliente nao mudou
  //   (sem tipo)                0 docs   R$       0,00  <- por isso kpi-sem-class nao mudou
  //
  // MUDARAM, e exatamente por isto:
  //   kpi-externo  16088181.69 -> 15959644.58   (-128.537,11, os 3 cancelados de Externo)
  //   kpi-interno   5627953.39 ->  5627717.52   (-235,87, o cancelado de Interno - PJ,
  //                                              que cai em `interno` porque desde a
  //                                              Frente 2 o bucket Interno agrega CLT + PJ)
  // NAO MUDARAM, e tambem por um motivo, nao por sorte:
  //   kpi-cliente e kpi-sem-class: zero cancelados nesses dois tipos no dado real.
  //     ATENCAO: isso significa que o dado real NAO testemunha que esses dois cards
  //     excluem cancelado. Quem prova isso e a FRENTE 2.5 (sintetico). Nao trate o
  //     "nao mudou" aqui como cobertura.
  //   kpi-total / kpi-pago / kpi-a-pagar / kpi-vencido / kpi-tarifas e as contagens:
  //     a guarda esta posicionada DEPOIS deles no laco (provado em 2.5 por posicao
  //     textual), e o Total Geral e Pago + Tarifas, onde cancelado nunca entrou
  //     porque `statusVisual('cancelado')` nao e 'pago'.
  const ESPERADO = {
    'kpi-total': '48765114.08', 'kpi-total-count': '51.176',
    'kpi-pago': '48612943.95', 'kpi-pago-count': '50.575',
    'kpi-a-pagar': '0.00',
    'kpi-tarifas': '152170.13', 'kpi-tarifas-count': '601',
    // ATUALIZADO 2026-09-30: era 5627953.39. Saiu R$ 235,87 (1 doc cancelado de
    // `Fornecedor Interno - PJ`). 5627953.39 - 235.87 = 5627717.52.
    'kpi-interno': '5627717.52',
    // ATUALIZADO 2026-09-30: era 16088181.69. Sairam R$ 128.537,11 (3 docs
    // cancelados de `Fornecedor Externo`). 16088181.69 - 128537.11 = 15959644.58.
    'kpi-externo': '15959644.58',
    'kpi-cliente': '25474325.89', 'kpi-sem-class': '1551255.96',
    'kpi-sem-class-count': '1.931',
  };
  for (const [k, v] of Object.entries(ESPERADO)) {
    assert(numD.escrito[k] === v, 'constante ditada ' + k + ' = ' + v + ' (obtido ' + numD.escrito[k] + ')');
  }
  assert(numA.escrito['kpi-opex'] === '18549404.72',
    'OPEX ANTES (' + BASE_REF + ') = 18549404.72 (obtido ' + numA.escrito['kpi-opex'] + ')');
  // As constantes do HEAD, para a aritmetica "antes - saiu = depois" ser explicita
  // no proprio teste em vez de virar um numero magico no comentario.
  const numH = montarKPI(SRC_HEAD, 'head', { numerico: true }); numH.fn(registros);
  assert(numH.escrito['kpi-interno'] === '5627953.39' && numH.escrito['kpi-externo'] === '16088181.69',
    'os valores do HEAD (com cancelado dentro) sao interno=5627953.39 e externo=16088181.69 (obtido ' +
    numH.escrito['kpi-interno'] + ' / ' + numH.escrito['kpi-externo'] + ')');

  // ── O QUE SAIU, medido pela PROPRIA funcao, sem reimplementar o criterio ─────
  // Metodo: roda a funcao DEPOIS sobre a base com TODO status trocado por 'pago'.
  // Como a unica coisa que a guarda le e `status`, neutralizar o status devolve
  // exatamente o comportamento pre-guarda. A diferenca contra a rodada normal E
  // o valor cancelado, por bucket, sem nenhuma reimplementacao do /^cancel/i.
  const semCancelado = registros.map(r => Object.assign({}, r, { status: 'pago' }));
  const kSemC = montarKPI(SRC_DEPOIS, 'depois', { numerico: true }); kSemC.fn(semCancelado);
  const SAIU = {};
  for (const k of ['kpi-interno', 'kpi-externo', 'kpi-cliente', 'kpi-sem-class']) {
    SAIU[k] = cent(kSemC.escrito[k]) - cent(numD.escrito[k]);
  }
  console.log('  --- o cancelado que saiu de cada bucket, em CENTAVOS (medido pela funcao real) ---');
  for (const [k, c] of Object.entries(SAIU)) console.log('      ' + k.padEnd(18) + String(c).padStart(12) + '  = R$ ' + (c / 100).toFixed(2));
  assert(SAIU['kpi-interno'] === 23587, 'saiu de kpi-interno: 23587 centavos (R$ 235,87), o 1 doc PJ cancelado (obtido ' + SAIU['kpi-interno'] + ')');
  assert(SAIU['kpi-externo'] === 12853711, 'saiu de kpi-externo: 12853711 centavos (R$ 128.537,11), os 3 docs Externo cancelados (obtido ' + SAIU['kpi-externo'] + ')');
  assert(SAIU['kpi-cliente'] === 0, 'saiu de kpi-cliente: 0, nao havia cancelado neste bucket (obtido ' + SAIU['kpi-cliente'] + ')');
  assert(SAIU['kpi-sem-class'] === 0, 'saiu de kpi-sem-class: 0, nao havia cancelado neste bucket (obtido ' + SAIU['kpi-sem-class'] + ')');
  assert(SAIU['kpi-interno'] + SAIU['kpi-externo'] + SAIU['kpi-cliente'] + SAIU['kpi-sem-class'] === 12877298,
    'o TOTAL que saiu dos 4 cards e 12877298 centavos (R$ 128.772,98), que e a divergencia exata que o CP tinha contra o DRE');
  // Contraprova cruzada: neutralizar o status tem que reproduzir o HEAD EXATAMENTE.
  // Se nao reproduzir, a guarda le mais coisa que `status` e o metodo acima e invalido.
  assert(kSemC.escrito['kpi-interno'] === numH.escrito['kpi-interno'] &&
    kSemC.escrito['kpi-externo'] === numH.escrito['kpi-externo'] &&
    kSemC.escrito['kpi-cliente'] === numH.escrito['kpi-cliente'] &&
    kSemC.escrito['kpi-sem-class'] === numH.escrito['kpi-sem-class'],
    'CONTRAPROVA do metodo: com todo status neutralizado, a funcao DEPOIS reproduz o HEAD ao centavo nos 4 cards, ' +
    'logo a guarda nao le nada alem de `status` e a medicao acima e valida');

  const num = (k, e) => Number((e || numD.escrito)[k] || 0);
  const interno = num('kpi-interno'), externo = num('kpi-externo');
  const cliente = num('kpi-cliente'), semClass = num('kpi-sem-class');
  const opexAntes = num('kpi-opex', numA.escrito);
  const soma4 = Math.round((interno + externo + cliente + semClass) * 100) / 100;
  const delta = Math.round((interno + externo - opexAntes) * 100) / 100;

  // ===========================================================================
  // (3) A IDENTIDADE RE-DERIVADA. Este caso foi REESCRITO em 2026-09-30, nao
  //     relaxado. A versao antiga afirmava:
  //
  //        (interno + externo)_novo - OPEX_antigo  ==  bucket "Fornecedor Interno - PJ"
  //                                                    "nada alem"
  //
  //     e valia com UM termo porque a unica coisa que a Frente 2 tinha feito era
  //     ACRESCENTAR o PJ ao bucket Interno. Com a guarda de cancelado ela deixou
  //     de valer: `OPEX_antigo` (0ca791e) INCLUI cancelado e os cards novos NAO.
  //     Relaxar a tolerancia ou apagar a assertiva esconderia justamente o efeito
  //     que a frente introduziu. A identidade correta tem DOIS termos:
  //
  //        DELTA = B - C
  //          B = bucket "Fornecedor Interno - PJ", SEM cancelado   (o que ENTROU)
  //          C = cancelado dos tipos que o OPEX antigo ja cobria,
  //              isto e "Fornecedor Interno" + "Fornecedor Externo" (o que SAIU)
  //
  //     Os dois termos tem sinais OPOSTOS e e por isso que o numero antigo
  //     (3.166.730,36) estava a 235,87 + 128.537,11 do novo: 235,87 porque o
  //     proprio PJ perdeu 1 cancelado (B encolheu), e 128.537,11 porque o OPEX
  //     antigo contava 3 cancelados de Externo que agora saem (C entra negativo).
  //
  //     Conferencia aritmetica, em centavos, que o teste abaixo re-executa:
  //        B (PJ sem cancelado) .............   316.649.449
  //        C (Int+Ext cancelado) ............    12.853.711
  //        B - C ............................   303.795.738  =  R$ 3.037.957,38
  //        (interno+externo)_novo ...........  2.158.736.210
  //        OPEX_antigo ......................  1.854.940.472
  //        DELTA ............................   303.795.738  FECHA
  //
  //     E o PJ COM cancelado vale 316.673.036 (R$ 3.166.730,36), que era exatamente
  //     a constante antiga. Nenhum centavo ficou sem endereco.
  // ===========================================================================
  const centD = (k) => cent(numD.escrito[k]);
  const cIntExtNovo = centD('kpi-interno') + centD('kpi-externo');
  const cOpexAntigo = cent(numA.escrito['kpi-opex']);
  const cDelta = cIntExtNovo - cOpexAntigo;

  // TERMO B, medido pela funcao real e por DIFERENCA, sem reimplementar nada:
  // roda a funcao sobre a base sem nenhum PJ e subtrai de `interno`.
  const semPJ = registros.filter(r => String(r.tipo_entidade || '').trim() !== 'Fornecedor Interno - PJ');
  const kSemPJ = montarKPI(SRC_DEPOIS, 'depois', { numerico: true }); kSemPJ.fn(semPJ);
  const cB = centD('kpi-interno') - cent(kSemPJ.escrito['kpi-interno']);
  // O MESMO termo, pelo HEAD (que nao tem a guarda), da o PJ COM cancelado.
  const kSemPJh = montarKPI(SRC_HEAD, 'head', { numerico: true }); kSemPJh.fn(semPJ);
  const cBcomCanc = cent(numH.escrito['kpi-interno']) - cent(kSemPJh.escrito['kpi-interno']);
  // TERMO C: o cancelado dos tipos que o OPEX antigo cobria. Reusa o SAIU medido
  // acima pela propria funcao. O OPEX antigo somava 'Fornecedor Interno' e
  // 'Fornecedor Externo' e NAO somava PJ, entao C e o cancelado de Externo mais o
  // cancelado de Fornecedor Interno CLT. Este ultimo e zero no dado real (o unico
  // cancelado do bucket `interno` e do PJ), o que o teste PROVA, nao supoe.
  const kSemCh = montarKPI(SRC_HEAD, 'head', { numerico: true });
  kSemCh.fn(semPJ.map(r => Object.assign({}, r, { status: 'pago' })));
  const cCancCLT = cent(kSemCh.escrito['kpi-interno']) - cent(kSemPJ.escrito['kpi-interno']);
  const cC = SAIU['kpi-externo'] + cCancCLT;

  console.log('  --- A IDENTIDADE, em CENTAVOS inteiros ---');
  console.log('      OPEX_antigo (' + BASE_REF + ') ........... ' + String(cOpexAntigo).padStart(14));
  console.log('      (interno+externo)_novo ............ ' + String(cIntExtNovo).padStart(14));
  console.log('      DELTA ............................. ' + String(cDelta).padStart(14) + '  = R$ ' + (cDelta / 100).toFixed(2));
  console.log('      B = PJ SEM cancelado .............. ' + String(cB).padStart(14) + '  = R$ ' + (cB / 100).toFixed(2));
  console.log('      C = cancelado de Int(CLT)+Ext ..... ' + String(cC).padStart(14) + '  = R$ ' + (cC / 100).toFixed(2));
  console.log('          dos quais Externo ............. ' + String(SAIU['kpi-externo']).padStart(14));
  console.log('          dos quais Interno CLT ......... ' + String(cCancCLT).padStart(14));
  console.log('      B - C ............................. ' + String(cB - cC).padStart(14));
  console.log('      PJ COM cancelado (const antiga) ... ' + String(cBcomCanc).padStart(14) + '  = R$ ' + (cBcomCanc / 100).toFixed(2));

  assert(cIntExtNovo === 2158736210,
    'Interno + Externo depois = 2158736210 centavos (R$ 21.587.362,10). ATUALIZADO 2026-09-30: era ' +
    '2171613508 (R$ 21.716.135,08); saiu o cancelado dos dois buckets (obtido ' + cIntExtNovo + ')');
  assert(cDelta === 303795738,
    'DELTA = 303795738 centavos (R$ 3.037.957,38). ATUALIZADO 2026-09-30: era 316673036 ' +
    '(R$ 3.166.730,36), que era o PJ COM cancelado; hoje o DELTA e B - C (obtido ' + cDelta + ')');
  assert(cCancCLT === 0,
    'nao ha cancelado no bucket `Fornecedor Interno` CLT no dado real (' + cCancCLT + ' centavos), ' +
    'logo C e so o cancelado de Fornecedor Externo. PROVADO, nao suposto');
  assert(cB === 316649449, 'B (PJ sem cancelado) = 316649449 centavos (R$ 3.166.494,49), obtido ' + cB);
  assert(cC === 12853711, 'C (cancelado de Int CLT + Externo) = 12853711 centavos (R$ 128.537,11), obtido ' + cC);
  // A IDENTIDADE. Comparacao de INTEIROS, sem epsilon: nao ha tolerancia a esconder nada.
  assert(cDelta === cB - cC,
    'IDENTIDADE RE-DERIVADA E FECHADA: (interno+externo)_novo - OPEX_antigo == B - C, ' +
    'onde B = PJ sem cancelado (entrou) e C = cancelado de Interno CLT + Externo (saiu). ' +
    cDelta + ' == ' + cB + ' - ' + cC + '. Cada centavo do delta tem endereco, e sao EXATAMENTE estes dois');
  // E a ponte com a constante ANTIGA, para a mudanca de numero ficar auditavel:
  assert(cBcomCanc === 316673036 && cBcomCanc - cB === 23587,
    'a constante ANTIGA (316673036 = R$ 3.166.730,36) era o PJ COM cancelado, e ela difere de B ' +
    'em exatamente 23587 centavos, o 1 doc PJ cancelado. E por isso, e so por isso, que ela mudou');
  assert(cent(numD.escrito['kpi-cliente']) === cent(numA.escrito['kpi-cliente']),
    'kpi-cliente nao se moveu nem contra ' + BASE_REF + ': antes=' + numA.escrito['kpi-cliente'] + ' depois=' + numD.escrito['kpi-cliente']);

  // ===========================================================================
  // (4) AS INVARIANTES NOVAS, todas em CENTAVOS INTEIROS.
  //     O universo que os 4 cards cobrem e medido pela PROPRIA funcao: apagando
  //     `tipo_entidade` de todo registro, o `else` final manda tudo para
  //     `semClass`, que esta exposto no DOM. Como `semClass` esta DENTRO da
  //     guarda, o numero que sai e, por construcao, "recorte sem tarifa E SEM
  //     CANCELADO". Nada do recorte e reimplementado aqui.
  // ===========================================================================
  const kUniv = universo4(registros);
  const cUniverso = cent(kUniv['kpi-sem-class']);
  const cUnivCount = kUniv['kpi-sem-class-count'];
  const cSoma4 = centSoma(numD.escrito, 'kpi-interno', 'kpi-externo', 'kpi-cliente', 'kpi-sem-class');
  // O mesmo universo medido no HEAD (COM cancelado), para a diferenca ter nome.
  const cUniversoHead = cent(universo4H(registros)['kpi-sem-class']);
  console.log('  --- INVARIANTES, em CENTAVOS inteiros ---');
  console.log('      recorte sem tarifa, COM cancelado (' + HEAD_REF + ') . ' + String(cUniversoHead).padStart(14));
  console.log('      recorte sem tarifa, SEM cancelado (worktree) ... ' + String(cUniverso).padStart(14) + ' em ' + cUnivCount + ' docs');
  console.log('      soma dos 4 cards .............................. ' + String(cSoma4).padStart(14));
  console.log('      kpi-total (Pago + Tarifas) .................... ' + String(centD('kpi-total')).padStart(14));
  console.log('      kpi-total - soma dos 4 ........................ ' + String(centD('kpi-total') - cSoma4).padStart(14));
  console.log('      kpi-tarifas ................................... ' + String(centD('kpi-tarifas')).padStart(14));

  // INVARIANTE 1 — soma dos 4 == recorte sem tarifa E SEM cancelado.
  assert(cSoma4 === cUniverso,
    'INVARIANTE 1: interno + externo + cliente + semClass == recorte sem tarifa E SEM CANCELADO, ' +
    'em centavos inteiros (' + cSoma4 + ' == ' + cUniverso + '), medido pela propria funcao');
  assert(cSoma4 === 4861294395,
    'soma dos 4 = 4861294395 centavos (R$ 48.612.943,95). ATUALIZADO 2026-09-30: era 4874171693 ' +
    '(R$ 48.741.716,93), que era o recorte COM cancelado; saiu 12877298 (R$ 128.772,98), obtido ' + cSoma4);
  assert(cUniversoHead - cUniverso === 12877298,
    'e a diferenca entre os dois universos (COM e SEM cancelado) e exatamente 12877298 centavos, ' +
    'os 4 docs cancelados. Nada mais mudou no recorte: nem o corte de ano, nem o expurgo de tarifa');

  // INVARIANTE 2 — Total Geral - soma dos 4 == tarifas, EXATAMENTE, em centavos.
  const cGap = centD('kpi-total') - cSoma4;
  assert(cGap === centD('kpi-tarifas'),
    'INVARIANTE 2: (Total Geral - soma dos 4) == tarifas, EXATAMENTE e em centavos inteiros (' +
    cGap + ' == ' + centD('kpi-tarifas') + ' = R$ 152.170,13). ATUALIZADO 2026-09-30: antes da guarda ' +
    'essa diferenca era 2339715 (R$ 23.397,15), que era tarifas menos os cancelados; agora a conta fecha ' +
    'na tarifa e so na tarifa');
  // E a prova de que a invariante 2 NAO e estrutural, e sim consequencia do dado
  // de HOJE. Sem isto, a frente seguinte construiria em cima de uma coincidencia.
  assert(centD('kpi-a-pagar') === 0 && centD('kpi-vencido') === 0 &&
    cUniverso === centD('kpi-pago'),
    'ATENCAO, a invariante 2 vale porque HOJE `a pagar` e `vencido` sao zero e o recorte sem cancelado ' +
    'e todo `pago` (' + cUniverso + ' == ' + centD('kpi-pago') + '). No dia em que houver fatura a vencer, ' +
    'provisionada ou atrasada, ela QUEBRA sem que nada esteja errado. A invariante 1 e a estrutural; ' +
    'a 2 e observacao do dado atual. A FRENTE 2.5 prova essa quebra sinteticamente');

  // INVARIANTE 3 — particao: tipo desconhecido cai em Sem Classificacao.
  const kMist = montarKPI(SRC_DEPOIS, 'depois', { numerico: true });
  kMist.fn(registros.map(r => Object.assign({}, r, { tipo_entidade: 'Fornecedor Misterioso' })));
  assert(cent(kMist.escrito['kpi-sem-class']) === cUniverso,
    'INVARIANTE 3: com TODO tipo_entidade trocado por um tipo INVENTADO, Sem Classificacao recebe 100% ' +
    'do universo e a soma continua fechando (' + cent(kMist.escrito['kpi-sem-class']) + ' == ' + cUniverso + ')');
  assert(kMist.escrito['kpi-sem-class-count'] === cUnivCount,
    'e a CONTAGEM tambem fecha: ' + kMist.escrito['kpi-sem-class-count'] + ' = ' + cUnivCount);
  // Particao com o tipo inventado CONVIVENDO com os 4 reais, que e o caso que
  // importa: so trocar tudo por um tipo so nao prova que a soma fecha na mistura.
  const kMix = montarKPI(SRC_DEPOIS, 'depois', { numerico: true });
  kMix.fn(registros.map((r, i) => i % 7 === 0 ? Object.assign({}, r, { tipo_entidade: 'Fornecedor Quinto Tipo' }) : r));
  assert(centSoma(kMix.escrito, 'kpi-interno', 'kpi-externo', 'kpi-cliente', 'kpi-sem-class') === cUniverso,
    'INVARIANTE 3b: com 1 em cada 7 registros reetiquetado para um QUINTO tipo, a soma dos 4 continua ' +
    'igual ao universo (particao por construcao, nao por sorte do dado)');

  // ===========================================================================
  // (5) O DRILL-DOWN. Eu abri este caso como GAP-B: `_KPI_FILTRO_MAP` manda os 4
  //     cards de natureza para `cp-filtro-tipo`, NAO toca `cp-filtro-status`, e
  //     `aplicarFiltrosCP` so filtrava status quando o filtro de status estava
  //     setado. Clicar no card abria uma tabela que INCLUIA os cancelados que o
  //     card acabou de excluir: card e tabela discordavam em R$ 128.537,11.
  //     O coordenador corrigiu na mesma frente, com a guarda de
  //     `_cardNaturezaAtivo` em aplicarFiltrosCP. Os casos abaixo passaram a
  //     PROVAR a correcao e a cercar os modos de falha dela.
  // ===========================================================================
  {
    // O drill-down continua NAO tocando o filtro de status, e isso esta certo:
    // a correcao nao foi por filtro de status, foi por guarda derivada.
    const mapTxt = extrairStatement(SRC_DEPOIS, 'const _KPI_FILTRO_MAP = {', 'depois');
    for (const c of ['interno', 'externo', 'cliente', 'sem_class']) {
      const linha = mapTxt.split('\n').find(l => new RegExp('^\\s*' + c + ':').test(l)) || '';
      assert(/cp-filtro-tipo/.test(linha) && !/status/.test(linha),
        'o drill-down do card ' + c + ' seta SO `cp-filtro-tipo` (a correcao nao mexeu no filtro de Status, ' +
        'entao o operador continua livre para combinar Status com o card)');
    }
    // A guarda derivada e DERIVADA mesmo, nao uma flag guardada. Textual, porque
    // uma flag e o modo de falha que faria a tabela esconder cancelado sem card ativo.
    assert(/const _cardNaturezaAtivo = !!_cpCardNaturezaAtivoKey\(tipoArr\);/.test(SRC_DEPOIS),
      '`_cardNaturezaAtivo` e DERIVADO do estado real do filtro de Tipo, nao de flag guardada (' +
      REL + ':' + linhaDe(SRC_DEPOIS, 'const _cardNaturezaAtivo =') + ')');

    // ── Harness do predicado REAL de aplicarFiltrosCP. Injeta TODAS as dependencias
    //    e ESPIONA console.warn: o `catch` de `_cpCardNaturezaAtivoKey` falha aberto
    //    (devolve ''), entao um ReferenceError por dependencia esquecida no harness
    //    apareceria como "nada a excluir" e o teste passaria pelo motivo errado.
    //    Foi exatamente isso que aconteceu na primeira rodada do coordenador.
    // AS DEPENDENCIAS, enumeradas e EXIGIDAS. O coordenador avisou que o `catch` de
    // `_cpCardNaturezaAtivoKey` falha aberto, entao uma dependencia esquecida aqui
    // apareceria como "nada a excluir" e o teste passaria pelo motivo errado.
    // Duas defesas: a lista e explicita e a ausencia de qualquer item na versao
    // DEPOIS e FALHA DURA (o extrator lanca), nunca um fallback silencioso. Na
    // versao HEAD tres delas nao existem (sao novas), e isso e DECLARADO.
    const DEPS = [
      ['stmt', 'const _KPI_FILTRO_MAP = {'],
      ['stmt', 'const _CARDS_NATUREZA = ['],
      ['fn', '_cpMesmoConjunto'],
      ['fn', '_cpCardNaturezaAtivoKey'],
    ];
    for (const [tipo, nome] of DEPS) {
      const achou = tipo === 'fn' ? SRC_DEPOIS.includes('function ' + nome + '(') : SRC_DEPOIS.includes(nome);
      assert(achou, 'dependencia do harness presente na versao DEPOIS: ' + nome +
        ' (esquecer esta e o erro que o catch de falha-aberta esconderia)');
    }
    const avisos = [];
    const construirFiltro = (src, rot) => {
      const temGuardaTabela = /_cardNaturezaAtivo && \/\^cancel\/i/.test(src);
      const pedacos = [];
      for (const [tipo, nome] of DEPS) {
        const achou = tipo === 'fn' ? src.includes('function ' + nome + '(') : src.includes(nome);
        if (achou) pedacos.push(tipo === 'fn' ? extrairFuncao(src, nome, rot) : extrairStatement(src, nome, rot));
        else if (temGuardaTabela) throw new Error(rot + ': tem a guarda da tabela mas falta ' + nome);
      }
      return new Function('r', 'tipoArr', 'consoleSpy',
        pedacos.join('\n') + '\n' +
        'const console = consoleSpy;\n' +
        'const isMultiAll = (a) => !a || !a.length || a.indexOf("Todos") >= 0;\n' +
        'const tipoSet = !isMultiAll(tipoArr) ? new Set(tipoArr) : null;\n' +
        'const tipoFiltraSemTipo = tipoSet && tipoSet.has("__SEM_TIPO__");\n' +
        (temGuardaTabela ? 'const _cardNaturezaAtivo = !!_cpCardNaturezaAtivoKey(tipoArr);\n' : '') +
        'let _ok = true;\n' +
        extrairBloco(src, 'if (tipoSet) {', rot).replace(/return false;/g, '{ _ok = false; }') + '\n' +
        (temGuardaTabela
          ? extrairLinha(src, '_cardNaturezaAtivo && /^cancel/i').replace('return false;', '{ _ok = false; }')
          : '') + '\n' +
        'return _ok;');
    };
    const spy = { warn: (...a) => avisos.push(a.join(' ')) };
    const filtroD = construirFiltro(SRC_DEPOIS, 'depois');
    const filtroH = construirFiltro(SRC_HEAD, 'head');
    assert(!/_cardNaturezaAtivo/.test(SRC_HEAD) && /_cardNaturezaAtivo/.test(SRC_DEPOIS),
      'a guarda da tabela e NOVA: nao existe em ' + HEAD_REF + ' e existe na arvore de trabalho. ' +
      'E por isso que o filtro do HEAD e montado sem ela, e nao por omissao do harness');
    const passa = (fn, r, tipoArr) => fn(r, tipoArr, spy);
    // Sanidade do harness ANTES de medir: o predicado tem que discriminar de
    // verdade, senao "tudo passa" ou "nada passa" produziria numero redondo e falso.
    assert(passa(filtroD, { tipo_entidade: 'Cliente', status: 'pago' }, ['Todos']) === true &&
      passa(filtroD, { tipo_entidade: 'Cliente', status: 'pago' }, ['Fornecedor Externo']) === false,
      'sanidade do harness do filtro: com Todos passa, com outro tipo nao passa');

    // (5a) A CORRECAO, em numero, sobre o dado real: card == tabela, ao centavo.
    const CARD = { externo: { tipo: ['Fornecedor Externo'], kpi: 'kpi-externo' },
      interno: { tipo: ['Fornecedor Interno', 'Fornecedor Interno - PJ'], kpi: 'kpi-interno' },
      cliente: { tipo: ['Cliente'], kpi: 'kpi-cliente' },
      sem_class: { tipo: ['__SEM_TIPO__'], kpi: 'kpi-sem-class' } };
    console.log('  --- clique no card: a tabela fecha com o card? (dado real) ---');
    for (const [nome, c] of Object.entries(CARD)) {
      const drill = registros.filter(r => passa(filtroD, r, c.tipo));
      const drillH = registros.filter(r => passa(filtroH, r, c.tipo));
      // O que a tabela soma: TODA linha exibida, dentro do corte de ano da query.
      const somaTab = (arr) => arr.reduce((a, r) => String(r.data_vencimento || '') < String(numD.CP_LIMIAR_ANO)
        ? a : a + cent(Number(r.valor_original || 0).toFixed(2)), 0);
      const kD = montarKPI(SRC_DEPOIS, 'depois', { numerico: true }); kD.fn(drill);
      // O ESTADO INTERMEDIARIO, que e a unica coisa contra a qual este caso pode
      // ser nao-vacuo: KPI da arvore de trabalho (JA exclui cancelado) rodando
      // sobre a tabela do HEAD (que AINDA NAO excluia). E o GAP-B que eu reportei.
      // Comparar HEAD-com-HEAD daria gap zero e nao provaria nada: no HEAD as DUAS
      // pontas incluiam cancelado, logo fechavam. A regressao morava no meio.
      const kMisto = montarKPI(SRC_DEPOIS, 'depois', { numerico: true }); kMisto.fn(drillH);
      // A tarifa fica fora do card por decisao antiga (expurgo do KPI), entao a
      // comparacao honesta e contra a tabela MENOS a tarifa daquele recorte. A
      // tarifa do recorte tambem vem da funcao real, via `kpi-tarifas`.
      const restoD = somaTab(drill) - cent(kD.escrito['kpi-tarifas']);
      const restoMisto = somaTab(drillH) - cent(kMisto.escrito['kpi-tarifas']);
      const gapD = restoD - cent(kD.escrito[c.kpi]);
      const gapMisto = restoMisto - cent(kMisto.escrito[c.kpi]);
      console.log('      ' + nome.padEnd(10) + ' linhas=' + String(drill.length).padStart(6) +
        '  tabela-tarifa=' + String(restoD).padStart(12) + '  card=' + String(cent(kD.escrito[c.kpi])).padStart(12) +
        '  gap agora=' + String(gapD).padStart(8) + '  gap no estado intermediario=' + String(gapMisto).padStart(10));
      assert(gapD === 0,
        'CORRECAO PROVADA para o card ' + nome + ': clicando nele, a tabela (descontada a tarifa, que sempre ' +
        'ficou fora do KPI) soma EXATAMENTE o valor do card, ao centavo. gap = ' + gapD);
      const ESP_GAP_MISTO = { externo: 12853711, interno: 23587, cliente: 0, sem_class: 0 };
      assert(gapMisto === ESP_GAP_MISTO[nome],
        '  ... NAO-VACUIDADE do card ' + nome + ': no estado intermediario (KPI novo + tabela do ' + HEAD_REF +
        ') o gap seria ' + ESP_GAP_MISTO[nome] + ' centavos' +
        (ESP_GAP_MISTO[nome] ? ', e e exatamente o cancelado deste bucket. O caso acima reprova esse estado' :
          ', porque este bucket nao tem cancelado no dado real: aqui a correcao e provada pelo SINTETICO de 2.5, nao por este numero'));
    }
    // (5a-bis) A SUTILEZA DO METODO, e ela IMPORTA para o que se diz ao diretor.
    //   `aplicarFiltrosCP` nao aplica o corte de ano vigente nem o expurgo de
    //   tarifa: os dois vivem dentro de `atualizarKPIs`. O coordenador descontou os
    //   dois "a parte, de forma declarada", e para a pergunta "a guarda de cancelado
    //   alinhou card e tabela?" isso e VALIDO: o teste (5a) acima fecha em ZERO.
    //   O que NAO e valido e traduzir isso para o diretor como "somar as linhas
    //   exibidas fecha com o card", porque a tabela que o operador ve na tela
    //   CONTINUA trazendo as linhas de tarifa, que o card nao conta. Medido:
    console.log('  --- o que o OPERADOR ve na tela, SEM desconto nenhum ---');
    for (const [nome, c] of Object.entries(CARD)) {
      const drill = registros.filter(r => passa(filtroD, r, c.tipo));
      const visiveis = drill.filter(r => String(r.data_vencimento || '') >= String(numD.CP_LIMIAR_ANO));
      const somaVis = visiveis.reduce((a, r) => a + cent(Number(r.valor_original || 0).toFixed(2)), 0);
      const kD = montarKPI(SRC_DEPOIS, 'depois', { numerico: true }); kD.fn(drill);
      const tarifa = cent(kD.escrito['kpi-tarifas']);
      const resto = somaVis - tarifa - cent(kD.escrito[c.kpi]);
      console.log('      ' + nome.padEnd(10) + ' linhas visiveis=' + String(visiveis.length).padStart(6) +
        '  soma visivel=' + String(somaVis).padStart(12) + '  card=' + String(cent(kD.escrito[c.kpi])).padStart(12) +
        '  tarifa na tabela=' + String(tarifa).padStart(10) + '  sobra inexplicada=' + resto);
      assert(resto === 0,
        'card ' + nome + ': soma visivel - tarifa - card == 0, logo a UNICA coisa na tabela que o card nao ' +
        'conta e a tarifa. Nada inexplicado sobrou (' + resto + ')');
    }
    {
      const drill = registros.filter(r => passa(filtroD, r, CARD.externo.tipo));
      const kD = montarKPI(SRC_DEPOIS, 'depois', { numerico: true }); kD.fn(drill);
      assert(cent(kD.escrito['kpi-tarifas']) === 15217013,
        'GAP-D: clicando em Custo Fornecedor Externo, a tabela exibida ainda traz 601 linhas de TARIFA somando ' +
        'R$ 152.170,13, que o card nao conta. Entao "somar as linhas exibidas fecha com o card" NAO e verdade ' +
        'para esse card: fecha depois de descontar a tarifa. A guarda de cancelado resolveu o desencontro de ' +
        'R$ 128.537,11; o de R$ 152.170,13 e PRE-EXISTENTE (expurgo de tarifa sempre foi so do KPI) e continua ' +
        'de pe. Nao contar isto ao diretor como "fecha" seria enganoso: ele vai somar a coluna e achar 152 mil a mais');
      // Nos outros 3 cards a tarifa e zero, entao neles a soma visivel fecha mesmo.
      for (const nome of ['interno', 'cliente', 'sem_class']) {
        const d2 = registros.filter(r => passa(filtroD, r, CARD[nome].tipo));
        const k2 = montarKPI(SRC_DEPOIS, 'depois', { numerico: true }); k2.fn(d2);
        assert(cent(k2.escrito['kpi-tarifas']) === 0,
          'no card ' + nome + ' nao ha tarifa nenhuma, entao aqui somar as linhas exibidas FECHA com o card ' +
          'sem desconto nenhum. O GAP-D e exclusivo do card Externo (todas as 601 tarifas sao Fornecedor Externo)');
      }
    }

    assert(avisos.length === 0,
      'nenhum console.warn de `_cpCardNaturezaAtivoKey` foi disparado: o harness injetou todas as dependencias ' +
      'e o `catch` que falha aberto NAO engoliu nada. Sem esta checagem, um ReferenceError apareceria como ' +
      '"nada a excluir" e os casos acima passariam pelo motivo errado' +
      (avisos.length ? ' >>> ' + avisos.join(' | ') : ''));

    // (5b) A guarda vale SO com card ativo, e isso e a parte que protege contra o
    //      pior modo de falha: lancamento cancelado SUMIR da tela sem card aceso.
    const cancReal = registros.filter(r => /^cancel/i.test(String(r.status || '').trim()));
    assert(cancReal.length === 4, 'pre-condicao: 4 cancelados no dado real (obtido ' + cancReal.length + ')');
    assert(cancReal.every(r => passa(filtroD, r, ['Todos']) === true),
      'SEM card de natureza ativo, os 4 cancelados CONTINUAM visiveis na tabela. A correcao nao esconde ' +
      'lancamento do operador, so alinha a tabela ao card quando o card esta aceso');
    // Conjunto de Tipo que NAO e o de nenhum card: a guarda nao dispara. So os
    // cancelados cujo TIPO casa com o filtro e que podem aparecer, obviamente, e a
    // exclusao a testar e a de STATUS, nao a de tipo. O PJ cai fora pelo tipo, nao
    // pela guarda, e confundir as duas coisas foi um erro meu na 1a versao deste caso.
    const cancExterno = cancReal.filter(r => String(r.tipo_entidade || '').trim() === 'Fornecedor Externo');
    assert(cancExterno.length === 3, 'pre-condicao: 3 dos 4 cancelados sao Fornecedor Externo (obtido ' + cancExterno.length + ')');
    assert(cancExterno.every(r => passa(filtroD, r, ['Fornecedor Externo', 'Cliente']) === true),
      'com um conjunto de Tipo que NAO e o de nenhum card (Externo + Cliente), a guarda nao dispara e os ' +
      '3 cancelados de Externo aparecem: a exclusao e amarrada ao card aceso, nao ao filtro de Tipo em geral');
    assert(cancExterno.every(r => passa(filtroD, r, ['Fornecedor Externo']) === false),
      'e com o conjunto EXATO do card Externo (aceso, seja por clique ou por selecao manual identica), os ' +
      'mesmos 3 desaparecem. A guarda e disparada pelo conjunto, nao pela origem do gesto');
    // BUSCA DE FURO, que foi o que o coordenador pediu para eu atacar: existe algum
    // conjunto de Tipo que dispare a exclusao SEM ser o conjunto exato de um card?
    // Varredura exaustiva de todos os subconjuntos nao vazios dos 5 valores de Tipo
    // que existem na base mais a sentinela. 63 combinacoes, nao amostragem.
    const VALORES = ['Fornecedor Interno', 'Fornecedor Interno - PJ', 'Fornecedor Externo', 'Cliente', '__SEM_TIPO__', 'Todos'];
    const CONJ_CARD = Object.values(CARD).map(c => c.tipo.slice().sort().join('|'));
    const cobaia = { tipo_entidade: 'Fornecedor Externo', status: 'cancelado', valor_original: 1, data_vencimento: '2026-06-15' };
    let furos = [], testados = 0;
    for (let m = 1; m < (1 << VALORES.length); m++) {
      const arr = VALORES.filter((_, i) => m & (1 << i));
      testados++;
      const excluiu = passa(filtroD, cobaia, arr) === false;
      const ehTipoErrado = !arr.includes('Todos') && !arr.includes('Fornecedor Externo');
      if (!excluiu || ehTipoErrado) continue; // nao excluiu, ou excluiu pelo TIPO
      if (!CONJ_CARD.includes(arr.slice().sort().join('|'))) furos.push(arr.join(' + '));
    }
    console.log('      varredura de ' + testados + ' conjuntos de Tipo, furos encontrados: ' + (furos.length || 'NENHUM'));
    assert(furos.length === 0,
      'SEM FURO: varri os ' + testados + ' subconjuntos nao vazios de {4 tipos, __SEM_TIPO__, Todos} e NAO ha ' +
      'nenhum em que a exclusao de cancelado dispare sem o conjunto ser EXATAMENTE o de um card de natureza. ' +
      'A derivacao por `_cpMesmoConjunto` nao tem caminho lateral' + (furos.length ? ' >>> ' + furos.join(' ; ') : ''));

    // (5b-bis) AS DUAS ROTAS DE FALHA de `_cpCardNaturezaAtivoKey`, e elas NAO sao
    //   iguais. O coordenador perguntou se ha caminho de execucao em que o filtro
    //   roda antes de `_KPI_FILTRO_MAP` (const declarada na linha ~6953, e
    //   `aplicarFiltrosCP` na ~2783, no MESMO <script>). Analise de ordem: TODA
    //   chamada de `renderTudo`/`aplicarFiltrosCP` esta dentro de funcao, de
    //   callback de `onAuthStateChanged`/`onSnapshot`, de `setTimeout` ou de
    //   `addEventListener`. Nenhuma e statement de topo executado durante a
    //   avaliacao do script, logo a TDZ nao e alcancavel na pratica. O que os casos
    //   abaixo provam e o COMPORTAMENTO se ela fosse, porque analise de ordem
    //   envelhece e teste nao.
    {
      const pedacosSemMap =
        extrairStatement(SRC_DEPOIS, 'const _CARDS_NATUREZA = [', 'f') + '\n' +
        extrairFuncao(SRC_DEPOIS, '_cpMesmoConjunto', 'f') + '\n' +
        extrairFuncao(SRC_DEPOIS, '_cpCardNaturezaAtivoKey', 'f') + '\n';
      // ROTA 1, TDZ: a const existe mas ainda nao foi inicializada. `typeof` sobre
      // const em TDZ LANCA ReferenceError, o catch pega, e o warn sai. FALHA ABERTA
      // E RUIDOSA: a tabela mostra tudo, e alguem fica sabendo.
      const av1 = [];
      const tdz = new Function('consoleSpy', 'const console = consoleSpy;\n' + pedacosSemMap +
        'const r = _cpCardNaturezaAtivoKey(["Fornecedor Externo"]);\n' +
        'const _KPI_FILTRO_MAP = {};\n' + 'return r;');
      const r1 = tdz({ warn: (...a) => av1.push(a.join(' ')) });
      assert(r1 === '' && av1.length === 1 && /falhou/.test(av1[0]),
        'ROTA DE FALHA 1 (TDZ, o caso que o coordenador levantou): devolve "" (falha ABERTA, tabela mostra ' +
        'cancelado) E dispara o console.warn. Ruidosa, como tem que ser. aviso: ' + (av1[0] || '(nenhum)'));
      // ROTA 2, identificador INEXISTENTE: `typeof` devolve 'undefined' e a funcao
      // sai pelo early-return.
      //
      // INVERTIDO pelo coordenador em 2026-09-30, depois deste relatorio. O caso
      // original assertava `av2.length === 0`, ou seja, DOCUMENTAVA que esta rota saia
      // CALADA, e era um pedido de correcao disfarcado de teste. A correcao foi feita
      // (o early-return ganhou `console.warn`), entao a assertiva passa a exigir o
      // aviso. Teste que afirma a existencia de um defeito tem que ser invertido quando
      // o defeito e corrigido, senao vira vermelho permanente; foi a terceira vez nesta
      // OS que isso apareceu.
      const av2 = [];
      const semMap = new Function('consoleSpy', 'const console = consoleSpy;\n' + pedacosSemMap +
        'return _cpCardNaturezaAtivoKey(["Fornecedor Externo"]);');
      const r2 = semMap({ warn: (...a) => av2.push(a.join(' ')) });
      assert(r2 === '' && av2.length === 1 && /ausente/.test(av2[0]),
        'ROTA DE FALHA 2 CORRIGIDA (identificador INEXISTENTE): devolve "" (falha ABERTA) E dispara o ' +
        'console.warn. Nao sobrou nenhuma rota silenciosa: renomear ou mover `_KPI_FILTRO_MAP` agora ' +
        'aparece no console em vez de matar a exclusao em silencio. aviso: ' + (av2[0] || '(nenhum)'));
      assert(SRC_DEPOIS.includes('const _KPI_FILTRO_MAP = {'),
        'SENTINELA da rota 2: `_KPI_FILTRO_MAP` continua declarado com este nome exato. Se este caso falhar, ' +
        'alguem renomeou a const e a exclusao de cancelado na tabela parou de funcionar SEM erro nenhum');
    }

    // (5c) GAP-C RESIDUAL. O card Interno cobre DOIS valores de tipo. Se o operador
    //      selecionar so UM deles a mao, `_cpMesmoConjunto` da falso, o card apaga e
    //      a guarda nao dispara: o cancelado volta para a tabela. Mas `atualizarKPIs`
    //      continua excluindo cancelado, entao o card (agora recalculado sobre o
    //      recorte) e a tabela voltam a discordar. E o unico caminho residual, e o
    //      valor dele hoje e pequeno, mas e mensuravel.
    const soPJ = ['Fornecedor Interno - PJ'];
    const drillPJ = registros.filter(r => passa(filtroD, r, soPJ));
    const kPJ = montarKPI(SRC_DEPOIS, 'depois', { numerico: true }); kPJ.fn(drillPJ);
    const tabPJ = drillPJ.reduce((a, r) => String(r.data_vencimento || '') < String(numD.CP_LIMIAR_ANO)
      ? a : a + cent(Number(r.valor_original || 0).toFixed(2)), 0) - cent(kPJ.escrito['kpi-tarifas']);
    const gapPJ = tabPJ - cent(kPJ.escrito['kpi-interno']);
    console.log('      filtro de Tipo = SO "Fornecedor Interno - PJ" (card Interno APAGADO):');
    console.log('        tabela-tarifa=' + tabPJ + '  card kpi-interno=' + cent(kPJ.escrito['kpi-interno']) + '  gap=' + gapPJ);
    assert(gapPJ === 23587,
      'GAP-C RESIDUAL medido: selecionando a mao SO "Fornecedor Interno - PJ" (metade do conjunto do card ' +
      'Interno), o card apaga, a guarda da tabela nao dispara, mas o KPI continua excluindo cancelado. ' +
      'Card e tabela voltam a discordar em R$ 235,87 (' + gapPJ + ' centavos). Nao e regressao da correcao: ' +
      'e a fronteira dela. Decisao do coordenador: aceitar (valor baixo, caminho manual) ou fazer o KPI ' +
      'condicionar a exclusao ao mesmo `_cardNaturezaAtivo`');
  }
}

// =============================================================================
// GAPS MEDIDOS — comportamentos que a suite CONFIRMA e que o coordenador precisa
// decidir. Nao sao falhas de implementacao da regra pedida; sao consequencias
// medidas, registradas aqui para nao virarem descoberta em producao.
// =============================================================================
async function gapsMedidos() {
  secao('GAPS MEDIDOS — consequencias que a suite confirma');

  // GAP 1 — offline / hidratacao sem /Fornecedores: a empresa DESAPARECE.
  // O cache proprio guarda o registro sem `empresa` (correto) e o Map derivado
  // nao e persistido, entao ele so pode ser reconstruido com o listener de
  // /Fornecedores, que exige rede.
  {
    const persistir = extrairFuncao(SRC_DEPOIS, '_cpCachePersistir', 'depois');
    console.log('  _cpCachePersistir (' + REL + ':' + linhaDe(SRC_DEPOIS, 'function _cpCachePersistir') + '):');
    console.log(persistir.split('\n').map(l => '      ' + l.trim()).join('\n'));
    // CORRIGIDO pelo coordenador em 2026-09-29, depois deste relatorio: a assertiva
    // virou de lado. Antes ela DOCUMENTAVA o gap ("nao persiste"); agora verifica a
    // correcao ("persiste"). Teste que afirma a presenca de um bug precisa ser
    // invertido quando o bug e consertado, senao vira falso vermelho permanente.
    assert(persistir.includes('_cpEmpresaDerivada'),
      'GAP 1 CORRIGIDO: _cpCachePersistir agora grava o Map de empresa derivada em chave propria do cache');

    // Simula a hidratacao offline: registros do cache (sem `empresa`) e o Map de
    // /Fornecedores ainda VAZIO.
    const cacheRegs = [{ _id: 'o1', codigo_fornecedor: 777, entidade: 'X' }];
    const mapaDerivado = new Map();
    const recomputa = new Function('cacheRegistros', '_cpFornecedoresEmpresaMap', '_cpEmpresaDerivada',
      extrairFuncao(SRC_DEPOIS, '_cpResolverEmpresaDoReg', 'depois') + '\n' +
      extrairFuncao(SRC_DEPOIS, '_cpRecomputarEmpresaDerivada', 'depois') +
      '\nreturn _cpRecomputarEmpresaDerivada;')(cacheRegs, new Map(), mapaDerivado);
    recomputa();
    const emp = fabricarEmpresaDeReg(SRC_DEPOIS, 'depois')(mapaDerivado);
    assert(emp(cacheRegs[0]) === '',
      'diagnostico do GAP 1 (permanece valido): recomputar SEM /Fornecedores devolve vazio, ' +
      'e e por isso que a hidratacao restaura o Map do cache ANTES e so recomputa quando o cadastro chegou');
    // A correcao de verdade: o caminho de hidratacao restaura o Map do cache e NAO
    // recomputa as cegas. Prova sobre o codigo real do caminho de abertura.
    const abrir = extrairFuncao(SRC_DEPOIS, '_cpAbrirCargaRecencia', 'depois');
    assert(abrir.includes('c.empDerivada'),
      'GAP 1 CORRIGIDO: a hidratacao restaura _cpEmpresaDerivada da chave `empDerivada` do cache');
    assert(/if\s*\(_cpFornecedoresCarregados\)\s*_cpRecomputarEmpresaDerivada\(\)/.test(abrir),
      'GAP 1 CORRIGIDO: o recompute na hidratacao e CONDICIONADO a /Fornecedores ja ter chegado, ' +
      'senao limparia o Map restaurado e a coluna piscaria vazia');
    const agendar = extrairFuncao(SRC_DEPOIS, '_cpAgendarSnapRefresh', 'depois');
    assert(/if\s*\(_cpFornecedoresCarregados\)\s*_cpRecomputarEmpresaDerivada\(\)/.test(agendar),
      'GAP 1 CORRIGIDO: o mesmo guard existe no caminho do refresh, que o listener de Areas tambem dispara');
  }

  // GAP 2 — snapshot de /AreasContasPagar VAZIO pinta a tabela inteira de alarme.
  // `_cpAreasCarregadas = true` e setado mesmo quando o snapshot nao trouxe area
  // nenhuma (permissao revogada, colecao vazia, falha transitoria de regra).
  {
    const areas = montarAreas(SRC_DEPOIS, 'depois');
    areas.disparar([]); // snapshot valido, zero areas
    assert(areas.carregadas === true, 'GAP 2: snapshot VAZIO ainda marca _cpAreasCarregadas = true');
    const r = areas.resp({ _id: 'g', centro_custo: 'ADM' });
    // CORRIGIDO: conjunto VAZIO de areas passou a ser tratado como "ainda
    // carregando", com o texto neutro, em vez de acusar area inexistente em toda
    // linha. A assertiva foi invertida junto com a correcao.
    assert(r.estado === 'carregando' && r.texto === 'não informado',
      'GAP 2 CORRIGIDO: com ZERO areas o estado e "carregando" e o texto e o neutro "não informado", ' +
      'sem pintar a tabela inteira de alarme falso');
    const antes = montarAreas(SRC_ANTES, 'antes');
    antes.disparar([]);
    assert(antes.export({ _id: 'g', centro_custo: 'ADM' }) === '',
      'GAP 2: no HEAD o mesmo caso exibia o "não informado" neutro, sem alarme — a mudanca de texto e nova');
  }

  // GAP 3 — o card "Sem Classificacao" e o toggle dele nao cobrem o mesmo
  // conjunto quando aparece um tipo_entidade desconhecido (nao vazio).
  {
    const blocoTipo = extrairBloco(SRC_DEPOIS, 'if (tipoSet) {', 'depois');
    const rodaTipo = new Function('r', 'tipoSet', 'tipoFiltraSemTipo', blocoTipo + '\nreturn true;');
    const k = montarKPI(SRC_DEPOIS, 'depois', { numerico: true, periodo: { ini: '2020-01-01', fim: '2030-12-31' } });
    const reg = { tipo_entidade: 'Fornecedor Misterioso', valor_original: 99, data_vencimento: '2026-03-01', status: 'pago', categoria: 'A', entidade: 'A' };
    k.fn([reg]);
    const noCard = Number(k.escrito['kpi-sem-class']) === 99;
    const noToggle = rodaTipo(reg, new Set(['__SEM_TIPO__']), true);
    assert(noCard && noToggle === false,
      'GAP 3: tipo desconhecido e SOMADO no card Sem Classificacao mas o clique no card (sentinela __SEM_TIPO__) ' +
      'NAO o traz na tabela. Hoje o impacto e ZERO (a base so tem os 4 tipos e o vazio), mas um 5o tipo criaria ' +
      'card que nao abre. Medido em ' + REL + ':' + linhaDe(SRC_DEPOIS, 'else { semClass += v; cSemClass++; }') + '.');
  }

  // ── GAP 4 (2026-09-30) — `total` e `cTotal` sao CODIGO MORTO, e isso muda o que
  //    dizer ao diretor sobre para onde o cancelado foi. O comentario da frente
  //    afirma que o cancelado "entra em `total` e portanto na conta do Total Geral".
  //    A primeira metade e verdade; a segunda NAO e: o card Total Geral e
  //    `pago + tarifas`, e `total`/`cTotal` nao alimentam nenhum setKPI. Como
  //    `statusVisual('cancelado')` tambem nao e 'pago', os R$ 128.772,98 de
  //    cancelado nao aparecem em card NENHUM, nem de caixa nem de natureza.
  //    Nao e bug de calculo, e imprecisao na explicacao. Vale corrigir o comentario
  //    (e o de `scripts/diag-cards-natureza-cp.cjs`), porque a proxima frente vai
  //    ler esse comentario e concluir a coisa errada sobre onde o valor esta.
  {
    const corpoKPI = extrairFuncao(SRC_DEPOIS, 'atualizarKPIs', 'depois');
    const semComentario = corpoKPI.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    // O `-` entra no lookbehind/lookahead de proposito: sem ele, os IDS do DOM
    // ('kpi-total', 'kpi-total-count') contariam como uso da VARIAVEL `total`, que
    // e exatamente o engano que este caso existe para desfazer.
    const usos = (v) => [...semComentario.matchAll(new RegExp('(?<![\\w$\\-])' + v + '(?![\\w$\\-])', 'g'))].length;
    // 2 usos = a declaracao e o incremento. Nenhum terceiro uso = nunca lido.
    assert(usos('total') === 2 && usos('cTotal') === 2,
      'GAP 4: `total` e `cTotal` sao acumulados e NUNCA lidos (' + usos('total') + ' e ' + usos('cTotal') +
      ' usos, so declaracao e incremento). O card Total Geral e `pago + tarifas`, nao `total`. ' +
      'Logo o cancelado NAO esta no Total Geral: ele nao esta em card nenhum. Corrigir o comentario em ' +
      REL + ':' + linhaDe(SRC_DEPOIS, 'esta frente (o `total` sempre incluiu cancelado') + ' e em scripts/diag-cards-natureza-cp.cjs.');
    // GAP 5 (PRE-EXISTENTE): `kpi-vencido` e escrito mas nao existe no DOM.
    assert(/setKPI\('kpi-vencido'/.test(SRC_DEPOIS) && !SRC_DEPOIS.includes('id="kpi-vencido"'),
      'GAP 5 (PRE-EXISTENTE, nao desta frente): setKPI escreve `kpi-vencido` mas nao ha elemento com esse id ' +
      'no DOM. Lancamento ATRASADO nao aparece em nenhum card visivel. Hoje o valor e zero, entao ninguem viu.');
  }
}

function fechar() {
  console.log('\n==========================================================');
  console.log(' RESULTADO: ' + ok + ' OK / ' + fail + ' FAIL / ' + skip + ' SKIP');
  if (fail) {
    console.log(' FALHAS:');
    falhas.forEach((f, i) => console.log('  ' + (i + 1) + ') ' + f));
  }
  console.log('==========================================================\n');
  process.exit(fail > 0 ? 1 : 0);
}

(async function main() {
  await frente5proj();
  await frente5d();
  await frente1();
  await frente2();
  await gapsMedidos();
  fechar();
})().catch((e) => {
  console.error('\n*** A SUITE ESTOUROU (isso conta como FALHA) ***');
  console.error(e);
  process.exit(2);
});
