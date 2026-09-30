/**
 * test-pacote-ondas-f125.cjs
 * ---------------------------------------------------------------------------
 * OS-CP-PACOTE-ONDAS-01 — suite do agente TESTER (independente do autor).
 *
 * Cobre as FRENTES 5 (vazamento da empresa derivada), 1 (cruzamento Centro de
 * Custo x Gestor) e 2 (cards de Natureza do Custo) de
 * `gerenciador_contas_pagar_desktop/code.html`.
 *
 * PRINCIPIO: nada aqui reimplementa a regra. Todo pedaco de logica testado e
 * EXTRAIDO TEXTUALMENTE do arquivo real (por contagem de chaves) e executado com
 * stubs apenas para as dependencias de ambiente (DOM, Firestore, formatadores).
 * As duas versoes do arquivo entram no mesmo teste: o ANTES vem de
 * `git show HEAD:...` e o DEPOIS da arvore de trabalho, entao a suite se
 * atualiza sozinha enquanto o coordenador continua editando.
 *
 * READ-ONLY: nao escreve no repositorio, nao toca Firestore, nao roda emulador.
 *
 * USO:  node scripts/test-pacote-ondas-f125.cjs
 *       node scripts/test-pacote-ondas-f125.cjs --dados <caminho/dados.json>
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
console.log(` arquivo ANTES  : git show ${BASE_REF}:${REL}`);
console.log(' bytes          : antes=' + SRC_ANTES.length + '  depois=' + SRC_DEPOIS.length);
console.log(' hoje (local)   : ' + new Date().toString());

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

  secao('FRENTE 2.5 — PROVA NUMERICA sobre os dados reais');
  const CAMINHO = argDados();
  if (!CAMINHO || !fs.existsSync(CAMINHO)) {
    pular('prova numerica antes/depois nos 51.181 docs', 'snapshot nao informado (use --dados <arquivo fora do repo>)');
    return;
  }
  const registros = JSON.parse(fs.readFileSync(CAMINHO, 'utf8'));
  console.log('  snapshot: ' + CAMINHO);
  console.log('  docs: ' + registros.length.toLocaleString('pt-BR'));

  // (1) Comparacao byte a byte com o formatador REAL do arquivo.
  const strA = montarKPI(SRC_ANTES, 'antes'); strA.fn(registros);
  const strD = montarKPI(SRC_DEPOIS, 'depois'); strD.fn(registros);
  const PRESERVAR = ['kpi-total', 'kpi-total-count', 'kpi-pago', 'kpi-pago-count',
    'kpi-a-pagar', 'kpi-a-pagar-count', 'kpi-vencido', 'kpi-vencido-count',
    'kpi-tarifas', 'kpi-tarifas-count'];
  console.log('  --- formatador REAL (Intl pt-BR), comparado como STRING ---');
  for (const k of PRESERVAR) {
    const a = strA.escrito[k], d = strD.escrito[k];
    console.log('      ' + k.padEnd(20) + ' antes=' + String(a).padEnd(22) + ' depois=' + d);
    assert(a === d, 'PRESERVADO byte a byte: ' + k + ' (antes=' + a + ' depois=' + d + ')');
  }

  // (2) Valores decimais para casar com as constantes ditadas.
  const numA = montarKPI(SRC_ANTES, 'antes', { numerico: true }); numA.fn(registros);
  const numD = montarKPI(SRC_DEPOIS, 'depois', { numerico: true }); numD.fn(registros);
  console.log('  --- DEPOIS, em decimal ---');
  Object.keys(numD.escrito).sort().forEach(k => console.log('      ' + k.padEnd(22) + '= ' + numD.escrito[k]));
  console.log('  --- ANTES, em decimal ---');
  Object.keys(numA.escrito).sort().forEach(k => console.log('      ' + k.padEnd(22) + '= ' + numA.escrito[k]));

  const ESPERADO = {
    'kpi-total': '48765114.08', 'kpi-total-count': '51.176',
    'kpi-pago': '48612943.95', 'kpi-pago-count': '50.575',
    'kpi-a-pagar': '0.00',
    'kpi-tarifas': '152170.13', 'kpi-tarifas-count': '601',
    'kpi-interno': '5627953.39', 'kpi-externo': '16088181.69',
    'kpi-cliente': '25474325.89', 'kpi-sem-class': '1551255.96',
    'kpi-sem-class-count': '1.931',
  };
  for (const [k, v] of Object.entries(ESPERADO)) {
    assert(numD.escrito[k] === v, 'constante ditada ' + k + ' = ' + v + ' (obtido ' + numD.escrito[k] + ')');
  }
  assert(numA.escrito['kpi-opex'] === '18549404.72',
    'OPEX ANTES = 18549404.72 (obtido ' + numA.escrito['kpi-opex'] + ')');

  const num = (k, e) => Number((e || numD.escrito)[k] || 0);
  const interno = num('kpi-interno'), externo = num('kpi-externo');
  const cliente = num('kpi-cliente'), semClass = num('kpi-sem-class');
  const opexAntes = num('kpi-opex', numA.escrito);
  const soma4 = Math.round((interno + externo + cliente + semClass) * 100) / 100;
  const delta = Math.round((interno + externo - opexAntes) * 100) / 100;

  // (3) O DELTA e exatamente o bucket PJ. Metodo INDEPENDENTE do usado pelo
  //     coordenador: em vez de rodar a funcao so com os PJ, roda a funcao real
  //     sobre a base SEM os PJ e tira a diferenca. Nada e reimplementado.
  const semPJ = registros.filter(r => String(r.tipo_entidade || '').trim() !== 'Fornecedor Interno - PJ');
  const kSemPJ = montarKPI(SRC_DEPOIS, 'depois', { numerico: true }); kSemPJ.fn(semPJ);
  const bucketPJ = Math.round((interno - Number(kSemPJ.escrito['kpi-interno'])) * 100) / 100;
  console.log('  OPEX antes ................ ' + opexAntes.toFixed(2));
  console.log('  Interno + Externo depois .. ' + (interno + externo).toFixed(2));
  console.log('  DELTA ..................... ' + delta.toFixed(2));
  console.log('  bucket PJ (por diferenca) . ' + bucketPJ.toFixed(2));
  assert(Math.abs(interno + externo - 21716135.08) < 0.005,
    'Interno + Externo = 21716135.08 (obtido ' + (interno + externo).toFixed(2) + ')');
  assert(Math.abs(delta - 3166730.36) < 0.005, 'DELTA = 3166730.36 (obtido ' + delta.toFixed(2) + ')');
  assert(Math.abs(delta - bucketPJ) < 0.005,
    'a diferenca corresponde EXATAMENTE ao bucket Fornecedor Interno - PJ, nada alem (' + delta.toFixed(2) + ' = ' + bucketPJ.toFixed(2) + ')');
  assert(Math.abs(cliente - Number(numA.escrito['kpi-cliente'])) < 0.005,
    'kpi-cliente nao se moveu: antes=' + numA.escrito['kpi-cliente'] + ' depois=' + numD.escrito['kpi-cliente']);

  // (4) Total do recorte extraido da PROPRIA funcao real: com todo tipo_entidade
  //     removido, o `else` final joga tudo em sem_class, que ESTA exposto.
  //     Assim o total interno da funcao aparece sem reimplementar o recorte.
  const semTipoAlgum = registros.map(r => {
    const c = Object.assign({}, r); delete c.tipo_entidade; return c;
  });
  const kTotal = montarKPI(SRC_DEPOIS, 'depois', { numerico: true }); kTotal.fn(semTipoAlgum);
  const totalRecorte = Number(kTotal.escrito['kpi-sem-class']);
  const cTotal = kTotal.escrito['kpi-sem-class-count'];
  console.log('  total do recorte (tarifa expurgada) = ' + totalRecorte.toFixed(2) + ' em ' + cTotal + ' docs');
  console.log('  soma dos 4 cards de natureza        = ' + soma4.toFixed(2));
  assert(Math.abs(soma4 - totalRecorte) < 0.005,
    'os 4 cards de natureza somam o TOTAL DO RECORTE, medido pela propria funcao (' + soma4.toFixed(2) + ' = ' + totalRecorte.toFixed(2) + ')');
  assert(Math.abs(soma4 - 48741716.93) < 0.005, 'soma dos 4 = 48741716.93 (obtido ' + soma4.toFixed(2) + ')');

  // A soma dos 4 NAO e o card Total Geral, e a diferenca e explicavel.
  const kpiTotal = num('kpi-total');
  const diff = Math.round((kpiTotal - totalRecorte) * 100) / 100;
  const pago = num('kpi-pago'), aPagar = num('kpi-a-pagar'), vencido = num('kpi-vencido'), tarifas = num('kpi-tarifas');
  const outros = Math.round((totalRecorte - pago - aPagar - vencido) * 100) / 100;
  console.log('  card Total Geral (pago+tarifas) ..... ' + kpiTotal.toFixed(2));
  console.log('  diferenca vs soma dos 4 ............. ' + diff.toFixed(2));
  console.log('  decomposicao: tarifas=' + tarifas.toFixed(2) + ' aPagar=' + aPagar.toFixed(2) +
    ' vencido=' + vencido.toFixed(2) + ' provisionado/cancelado=' + outros.toFixed(2));
  assert(Math.abs(diff - 23397.15) < 0.005,
    'a divergencia soma-dos-4 vs Total Geral e ' + diff.toFixed(2) + ' = 23397.15, e NAO um erro');
  assert(Math.abs(diff - (tarifas - aPagar - vencido - outros)) < 0.02,
    'a divergencia e inteiramente explicada por tarifas - (aPagar + vencido + provisionado/cancelado): ' +
    (tarifas - aPagar - vencido - outros).toFixed(2));

  // (5) Particao completa sobre o dado REAL, medida pela propria funcao.
  const kSemClassOnly = montarKPI(SRC_DEPOIS, 'depois', { numerico: true });
  kSemClassOnly.fn(registros.map(r => Object.assign({}, r, { tipo_entidade: 'Fornecedor Misterioso' })));
  assert(Math.abs(Number(kSemClassOnly.escrito['kpi-sem-class']) - totalRecorte) < 0.005,
    'com todo tipo trocado por um tipo INVENTADO, sem_class recebe 100% do total do recorte (particao completa no dado real)');
  assert(kSemClassOnly.escrito['kpi-sem-class-count'] === cTotal,
    'e a CONTAGEM tambem fecha: ' + kSemClassOnly.escrito['kpi-sem-class-count'] + ' = ' + cTotal);
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
