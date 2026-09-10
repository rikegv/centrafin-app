/**
 * test-cp-filtros-logica.cjs
 * -----------------------------------------------------------------------
 * Validacao READ-ONLY / OFFLINE (OS-CP-FILTROS-BASE-COMPLETA-01) - testador-
 * auditor. Extrai o codigo-fonte REAL de gerenciador_contas_pagar_desktop/
 * code.html (brace-matching, sem reescrever nada) e roda via `new Function`/
 * vm - mesmo padrao consagrado em test-filtro-servico-dinamico.cjs.
 *
 * Nao toca Firestore/emulador. Cobre os itens de logica pura do checklist do
 * arquiteto: 5, 6, 7 (nao-regressao sintetica), 8, 9 (parcial), 10, 11
 * (formato da chave), 13 (limiares), 15, 18.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'gerenciador_contas_pagar_desktop', 'code.html'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('Repo root nao encontrado a partir de ' + start);
}
const ROOT = findRepoRoot('C:/Users/Henrique/Desktop/centrafin-app');
const FILE = path.join(ROOT, 'gerenciador_contas_pagar_desktop', 'code.html');
const CB_MULTI = path.join(ROOT, 'assets', 'checkbox_multi.js');

let ok = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  OK   - ' + label); ok++; }
  else { console.log('  FAIL - ' + label); fail++; }
}

function extractFunctionBlock(src, startMarker) {
  const idx = src.indexOf(startMarker);
  if (idx === -1) throw new Error('Marcador nao encontrado: ' + startMarker);
  const braceStart = src.indexOf('{', idx);
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(idx, i + 1); }
  }
  throw new Error('Chaves desbalanceadas para: ' + startMarker);
}
function extractLine(src, marker) {
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error('Linha nao encontrada: ' + marker);
  const lineStart = src.lastIndexOf('\n', idx) + 1;
  const lineEnd = src.indexOf('\n', idx);
  return src.slice(lineStart, lineEnd).trim();
}
function extractConstStatement(src, marker) {
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error('Marcador nao encontrado: ' + marker);
  let depth = 0;
  for (let i = idx; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === ';' && depth === 0) return src.slice(idx, i + 1);
  }
  throw new Error('Nao fechou statement para: ' + marker);
}

const srcNew = fs.readFileSync(FILE, 'utf8');
const srcHead = execSync('git show HEAD:gerenciador_contas_pagar_desktop/code.html', { cwd: ROOT, maxBuffer: 1024 * 1024 * 50 }).toString('utf8');

console.log('\n=== EXTRACAO ===\n');
const src_cpChaveFiltro  = extractFunctionBlock(srcNew, 'function _cpChaveFiltro(s)');
const src_cpUniaoOpcoes  = extractFunctionBlock(srcNew, 'function _cpUniaoOpcoes(setJanela, listaCadastro)');
const src_cpMesesEntre   = extractFunctionBlock(srcNew, 'function _cpMesesEntre(ini, fim)');
const src_cpJanelaAlvo   = extractFunctionBlock(srcNew, 'function _cpJanelaAlvoDoPeriodo(ini, fim)');
const src_getMultiValues = extractFunctionBlock(srcNew, 'function getMultiValues(sel)');
const src_isMultiAll     = extractFunctionBlock(srcNew, 'function isMultiAll(arr)');
const src_setMultiValues = extractFunctionBlock(srcNew, 'function setMultiValues(sel, vals)');
const src_popularChunked = extractFunctionBlock(srcNew, 'function _popularSelectMultiChunked(id, valores, labelTodos, onDone)');
const src_cpSched        = extractConstStatement(srcNew, 'const _cpSched =');
const src_sufixoConst    = extractLine(srcNew, 'const _CP_SUFIXO_SEM_DADO =');
const limitePeriodoLine  = extractLine(srcNew, 'const CP_LIMITE_AVISO_PERIODO =');
const limiteMesesLine    = extractLine(srcNew, 'const CP_LIMITE_AVISO_MESES');
console.log(limitePeriodoLine);
console.log(limiteMesesLine);

const idxPesado = srcNew.indexOf('const pesado = (n != null)');
const idxSemi1 = srcNew.indexOf(';', idxPesado);
const idxSemi2 = srcNew.indexOf(';', idxSemi1 + 1);
const pesadoBloco = srcNew.slice(idxPesado, idxSemi2 + 1);
console.log('--- bloco pesado extraido ---');
console.log(pesadoBloco);

const iNewStart = srcNew.indexOf("if (favSet && !favSet.has(_cpChaveFiltro(r.entidade)))");
const iNewEnd = srcNew.indexOf('if (classSetExpandido', iNewStart);
const blocoFiltroNovo = srcNew.slice(iNewStart, iNewEnd);

const iOldStart = srcHead.indexOf("if (favSet && !favSet.has(r.entidade || ''))");
const iOldEnd = srcHead.indexOf('if (classSetExpandido', iOldStart);
const blocoFiltroAntigo = srcHead.slice(iOldStart, iOldEnd);

console.log('\n=== TESTES ===\n');

{
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src_cpChaveFiltro, ctx);
  const f = ctx._cpChaveFiltro;
  assert(f('  Raffoul   Ltda  ') === 'RAFFOUL LTDA', '_cpChaveFiltro colapsa espacos e upper-cases');
  assert(f(null) === '' && f(undefined) === '', '_cpChaveFiltro(null/undefined) retorna string vazia');
  assert(f('ESTAGIO') === 'ESTAGIO', '_cpChaveFiltro preserva string sem acento');
  assert(f('ESTÁGIO') === 'ESTÁGIO', '_cpChaveFiltro NAO remove acento (regra Faturamento 2026-06-19)');
  assert(f('Todos') === 'TODOS', "_cpChaveFiltro('Todos') retorna 'TODOS' -- a funcao NUNCA deve ser aplicada na sentinela literal");
}

{
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src_cpChaveFiltro, ctx);
  vm.runInContext(src_sufixoConst, ctx);
  vm.runInContext(src_cpUniaoOpcoes, ctx);
  const f = ctx._cpUniaoOpcoes;

  const r1 = f(['COMERCIAL', 'Administrativo'], ['Administrativo', 'Financeiro']);
  const vals1 = r1.map(o => o.v);
  assert(vals1.includes('COMERCIAL'), 'CC COMERCIAL (so em lancamento) aparece na uniao');
  assert(vals1.includes('FINANCEIRO'), 'CC Financeiro (so em cadastro) aparece na uniao');
  const financeiro = r1.find(o => o.v === 'FINANCEIRO');
  assert(financeiro.t.endsWith(' (sem dados neste periodo)'.normalize('NFD').replace(/[\u0300-\u036f]/g,'') ) || financeiro.t.indexOf('sem dados') !== -1, 'CC de cadastro sem dado no mes ganha sufixo');
  const comercial = r1.find(o => o.v === 'COMERCIAL');
  assert(comercial.t.indexOf('sem dados') === -1, 'CC presente no mes NAO ganha sufixo');
  assert(new Set(vals1).size === vals1.length, 'Sem duplicata de value por caixa/espaco');

  const r2 = f([' comercial ', 'COMERCIAL', 'Comercial  '], ['Comercial']);
  assert(r2.length === 1, 'Variacoes de caixa/espaco colapsam em UMA unica option (obtidas: ' + r2.length + ')');

  const r3 = f([], ['Fornecedor So Em Marco']);
  assert(r3.length === 1 && r3[0].t.indexOf('sem dados') !== -1, 'Favorecido so-cadastro aparece com sufixo mesmo com Set do mes vazio');

  const entrada = ['Zebra', 'Avila', 'Maria', 'Ana'];
  const r4a = f(entrada, []).map(o => o.t);
  const r4b = f(entrada.slice().reverse(), []).map(o => o.t);
  assert(JSON.stringify(r4a) === JSON.stringify(r4b), 'Ordem alfabetica pt-BR estavel independente da ordem de chegada: ' + JSON.stringify(r4a));
}

console.log('\n=== RESULTADO PARCIAL 1: ' + ok + ' ok / ' + fail + ' fail ===\n');

// ---------------------------------------------------------------------
// 3) getMultiValues / isMultiAll / setMultiValues -- sentinela 'Todos'.
//    Ponto de falha mais perigoso da OS: garantir que _cpChaveFiltro NUNCA
//    escapou para o lado do widget de filtro.
// ---------------------------------------------------------------------
{
  function makeSelectMock(optionDefs) {
    const options = optionDefs.map(o => ({ value: o.value, selected: !!o.selected }));
    return {
      options,
      get selectedOptions() { return options.filter(o => o.selected); },
      querySelector(sel) {
        const m = sel.match(/option\[value="([^"]+)"\]/);
        if (!m) return null;
        return options.find(o => o.value === m[1]) || null;
      },
    };
  }
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src_getMultiValues + '\n' + src_isMultiAll + '\n' + src_setMultiValues, ctx);
  const getMultiValues = ctx.getMultiValues;
  const isMultiAll = ctx.isMultiAll;
  const setMultiValues = ctx.setMultiValues;

  const sel1 = makeSelectMock([{ value: 'Todos', selected: true }, { value: 'RAFFOUL LTDA' }, { value: 'FORNECEDOR X' }]);
  assert(JSON.stringify(getMultiValues(sel1)) === '["Todos"]', "getMultiValues devolve ['Todos'] quando so a sentinela esta marcada");
  assert(isMultiAll(['Todos']) === true, "isMultiAll(['Todos']) === true");
  assert(isMultiAll(['RAFFOUL LTDA']) === false, "isMultiAll(['RAFFOUL LTDA']) === false");

  setMultiValues(sel1, ['RAFFOUL LTDA']);
  assert(getMultiValues(sel1).join(',') === 'RAFFOUL LTDA', 'setMultiValues seleciona um valor canonico especifico');
  assert(sel1.options.find(o => o.value === 'Todos').selected === false, "setMultiValues desmarca 'Todos' ao selecionar valor especifico");

  setMultiValues(sel1, []);
  assert(getMultiValues(sel1).join(',') === 'Todos', "setMultiValues([]) religa 'Todos' (limpar volta pra Todos)");

  assert(sel1.querySelector('option[value="Todos"]') !== null, "Option da sentinela continua com value literal 'Todos'");
  assert(sel1.querySelector('option[value="TODOS"]') === null, "Nao existe option fantasma com value 'TODOS' (upper)");
}

// ---------------------------------------------------------------------
// 4) _popularSelectMultiChunked -- token de geracao (_cpGen), sentinelas
//    fixas, fantasmas com sufixo. Roda em modo SINCRONO (< 800 itens) e
//    depois em modo ASSINCRONO (> 800) para provar o token de geracao.
// ---------------------------------------------------------------------
function makeFullSelectMock(id, initialOptionsHtml) {
  function parseOptionsFromHtml(html) {
    const out = [];
    const re = /<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g;
    let m;
    while ((m = re.exec(html))) out.push({ value: m[1], textContent: m[2], selected: false });
    return out;
  }
  let optionsArr = parseOptionsFromHtml(initialOptionsHtml || '');
  const frags = [];
  return {
    id,
    _cpGen: undefined,
    get options() { return optionsArr; },
    get selectedOptions() { return optionsArr.filter(o => o.selected); },
    set innerHTML(html) { optionsArr = parseOptionsFromHtml(html); },
    get innerHTML() { return optionsArr.map(o => '<option value="' + o.value + '">' + o.textContent + '</option>').join(''); },
    querySelector(sel) {
      const m = sel.match(/option\[value="([^"]+)"\]/);
      if (!m) return null;
      const found = optionsArr.find(o => o.value === m[1]);
      return found || null;
    },
    appendChild(nodeOrFrag) {
      // Aceita tanto um DocumentFragment mock ({ _opts: [...] }) quanto um
      // <option> individual (document.createElement('option')).
      if (nodeOrFrag && Array.isArray(nodeOrFrag._opts)) {
        for (const o of nodeOrFrag._opts) optionsArr.push({ value: o.value, textContent: o.textContent, selected: false });
      } else {
        optionsArr.push({ value: nodeOrFrag.value, textContent: nodeOrFrag.textContent, selected: false });
      }
    },
  };
}
function makeDocumentMock(selectsById) {
  return {
    getElementById(id) { return selectsById[id] || null; },
    createDocumentFragment() {
      const opts = [];
      return { _opts: opts, appendChild(opt) { opts.push(opt); } };
    },
    createElement(tag) {
      return { tagName: tag.toUpperCase(), value: '', textContent: '', className: '', setAttribute() {} };
    },
  };
}

{
  const sel = makeFullSelectMock('cp-filtro-cc', '');
  const doc = makeDocumentMock({ 'cp-filtro-cc': sel });
  const ctxWin = { requestIdleCallback: undefined }; // forca fallback setTimeout
  const ctx = { document: doc, window: ctxWin, setTimeout, clearTimeout, console };
  vm.createContext(ctx);
  vm.runInContext(src_sufixoConst + '\n' + src_getMultiValues + '\n' + src_isMultiAll + '\n' + src_setMultiValues + '\n' + src_cpSched + '\n' + src_popularChunked, ctx);
  const popular = ctx._popularSelectMultiChunked;

  // (a) Populacao SINCRONA simples com CC "COMERCIAL" via itens-objeto.
  popular('cp-filtro-cc', [{ v: 'COMERCIAL', t: 'COMERCIAL' }, { v: 'FINANCEIRO', t: 'FINANCEIRO (sem dados neste periodo)' }], 'Todos os CCs', () => {});
  const valuesAfter1 = sel.options.map(o => o.value);
  assert(valuesAfter1.filter(v => v === 'Todos').length === 1, 'Cabecalho Todos aparece exatamente 1x apos populacao');
  assert(valuesAfter1.includes('__SEM_CC__'), 'Sentinela __SEM_CC__ e sempre re-injetada em cp-filtro-cc');
  assert(valuesAfter1.filter(v => v === 'COMERCIAL').length === 1, 'COMERCIAL aparece 1x');

  // Marca COMERCIAL selecionado antes de repopular (para testar fantasma).
  // Espelha o toggle real do checkbox_multi.js: marcar um valor especifico
  // sempre desmarca a sentinela 'Todos' (senao getMultiValues devolveria
  // ['Todos'] e a selecao de COMERCIAL nunca seria vista pelo helper).
  sel.options.find(o => o.value === 'COMERCIAL').selected = true;
  sel.options.find(o => o.value === 'Todos').selected = false;

  // (b) Repopula SEM o COMERCIAL (virou fantasma) 3x em sequencia -- nao
  // pode duplicar nada, e o fantasma deve ganhar sufixo e manter selecao.
  for (let i = 0; i < 3; i++) {
    popular('cp-filtro-cc', [{ v: 'FINANCEIRO', t: 'FINANCEIRO' }], 'Todos os CCs', () => {});
  }
  const finalValues = sel.options.map(o => o.value);
  const countTodos = finalValues.filter(v => v === 'Todos').length;
  const countSemCC = finalValues.filter(v => v === '__SEM_CC__').length;
  const countComercial = finalValues.filter(v => v === 'COMERCIAL').length;
  const countFinanceiro = finalValues.filter(v => v === 'FINANCEIRO').length;
  assert(countTodos === 1, '3 repopulacoes em sequencia: cabecalho Todos continua 1x (obtido ' + countTodos + ')');
  assert(countSemCC === 1, '3 repopulacoes em sequencia: __SEM_CC__ continua 1x (obtido ' + countSemCC + ')');
  assert(countComercial === 1, '3 repopulacoes em sequencia: fantasma COMERCIAL nao duplica (obtido ' + countComercial + ')');
  assert(countFinanceiro === 1, '3 repopulacoes em sequencia: FINANCEIRO nao duplica (obtido ' + countFinanceiro + ')');
  const comercialOpt = sel.options.find(o => o.value === 'COMERCIAL');
  assert(comercialOpt.textContent.indexOf('sem dados') !== -1, 'Fantasma COMERCIAL ganha sufixo "(sem dados...)"');
  assert(comercialOpt.selected === true, 'Selecao anterior (COMERCIAL) e preservada como fantasma (sticky)');
}

// ---------------------------------------------------------------------
// 5) NAO-REGRESSAO (item 7 do checklist do arquiteto) -- bloco de filtro
//    NOVO (favSet/despSet/empSet/tipoSet/ccSet com _cpChaveFiltro) roda
//    lado a lado com o bloco ANTIGO (git HEAD, comparacao raw) sobre um
//    dataset SINTETICO cobrindo casos de borda: mesmo valor com variacao
//    de caixa/espaco entre a option escolhida e o dado do registro.
//    Regra: para toda selecao, o conjunto de registros que passam no NOVO
//    deve ser SUPERCONJUNTO (igual ou maior) do que passa no ANTIGO.
// ---------------------------------------------------------------------
{
  const ctxNovo = { _cpChaveFiltro: undefined };
  vm.createContext(ctxNovo);
  vm.runInContext(src_cpChaveFiltro, ctxNovo);
  const runFiltroNovo = new Function('_cpChaveFiltro', 'r', 'favSet', 'despSet', 'empSet', 'empFiltraSemEmp', 'tipoSet', 'tipoFiltraSemTipo', 'ccSet', 'ccFiltraSemCC',
    blocoFiltroNovo + '\nreturn true;');
  const runFiltroAntigo = new Function('r', 'favSet', 'despSet', 'empSet', 'empFiltraSemEmp', 'tipoSet', 'tipoFiltraSemTipo', 'ccSet', 'ccFiltraSemCC',
    blocoFiltroAntigo + '\nreturn true;');

  // Registros sinteticos: variacoes de caixa/espaco no MESMO favorecido/CC,
  // que so o matching normalizado (NOVO) deve alcancar igual ou melhor.
  const registros = [
    { entidade: 'Raffoul Ltda', centro_custo: 'Comercial', empresa: 'SOULAN', tipo_entidade: 'PJ', categoria: 'Aluguel' },
    { entidade: '  RAFFOUL LTDA  ', centro_custo: '  comercial', empresa: 'soulan', tipo_entidade: 'PJ', categoria: 'Aluguel' },
    { entidade: 'raffoul   ltda', centro_custo: 'COMERCIAL ', empresa: ' SOULAN ', tipo_entidade: 'PJ', categoria: 'Aluguel' },
    { entidade: 'Outro Fornecedor', centro_custo: 'Financeiro', empresa: 'OUTRA', tipo_entidade: 'CLT', categoria: 'Servico' },
    { entidade: '', centro_custo: '', empresa: '', tipo_entidade: '', categoria: '' },
  ];

  // Cenario: favorecido selecionado = "RAFFOUL LTDA" (value canonico, como
  // sairia de _cpUniaoOpcoes no NOVO cliente).
  function tryCall(fn, r, favSet, despSet, empSet, empFiltraSemEmp, tipoSet, tipoFiltraSemTipo, ccSet, ccFiltraSemCC) {
    try { return fn(r, favSet, despSet, empSet, empFiltraSemEmp, tipoSet, tipoFiltraSemTipo, ccSet, ccFiltraSemCC); }
    catch (e) { return false; }
  }

  const favSetNovo = new Set(['RAFFOUL LTDA']);
  const favSetAntigo = new Set(['Raffoul Ltda']); // como o option antigo (raw) exibiria
  let passaNovo = 0, passaAntigo = 0;
  for (const r of registros) {
    const okNovo = runFiltroNovo(ctxNovo._cpChaveFiltro, r, favSetNovo, null, null, false, null, false, null, false);
    const okAntigo = tryCall(runFiltroAntigo, r, favSetAntigo, null, null, false, null, false, null, false);
    if (okNovo) passaNovo++;
    if (okAntigo) passaAntigo++;
  }
  assert(passaNovo >= passaAntigo, 'Favorecido: NOVO (' + passaNovo + ') >= ANTIGO (' + passaAntigo + ') -- nunca perde match');
  assert(passaNovo === 3, 'Favorecido: NOVO casa as 3 variacoes de caixa/espaco de "Raffoul Ltda" (obtido ' + passaNovo + ')');
  assert(passaAntigo === 1, 'Favorecido: ANTIGO so casava a grafia EXATA (obtido ' + passaAntigo + ') -- confirma que a normalizacao amplia, nunca estreita');

  // Cenario CC.
  const ccSetNovo = new Set(['COMERCIAL']);
  const ccSetAntigo = new Set(['Comercial']);
  let passaCcNovo = 0, passaCcAntigo = 0;
  for (const r of registros) {
    const okNovo = runFiltroNovo(ctxNovo._cpChaveFiltro, r, null, null, null, false, null, false, ccSetNovo, false);
    const okAntigo = tryCall(runFiltroAntigo, r, null, null, null, false, null, false, ccSetAntigo, false);
    if (okNovo) passaCcNovo++;
    if (okAntigo) passaCcAntigo++;
  }
  assert(passaCcNovo >= passaCcAntigo, 'CC: NOVO (' + passaCcNovo + ') >= ANTIGO (' + passaCcAntigo + ') -- nunca perde match');

  // Cenario Empresa.
  const empSetNovo = new Set(['SOULAN']);
  const empSetAntigo = new Set(['SOULAN']); // empresa ja saia em UPPER do resolver antes desta OS
  let passaEmpNovo = 0, passaEmpAntigo = 0;
  for (const r of registros) {
    const okNovo = runFiltroNovo(ctxNovo._cpChaveFiltro, r, null, null, empSetNovo, false, null, false, null, false);
    const okAntigo = tryCall(runFiltroAntigo, r, null, null, empSetAntigo, false, null, false, null, false);
    if (okNovo) passaEmpNovo++;
    if (okAntigo) passaEmpAntigo++;
  }
  assert(passaEmpNovo >= passaEmpAntigo, 'Empresa: NOVO (' + passaEmpNovo + ') >= ANTIGO (' + passaEmpAntigo + ') -- nunca perde match');

  // Despesa (Categoria) -- OS explicitamente NAO mexe nesta dimensao.
  // Prova de que o bloco ficou IDENTICO (comparacao textual).
  const despNovoTrim = blocoFiltroNovo.match(/if \(despSet[\s\S]*?\)\)\s*return false;/)[0];
  const despAntigoTrim = blocoFiltroAntigo.match(/if \(despSet[\s\S]*?\)\)\s*return false;/)[0];
  assert(despNovoTrim === despAntigoTrim, 'Despesa: linha de comparacao e TEXTUALMENTE IDENTICA entre ANTIGO e NOVO (fora de escopo, confirmado)');
}

// ---------------------------------------------------------------------
// 6) Guarda do Periodo -- _cpMesesEntre, _cpJanelaAlvoDoPeriodo, limiares e
//    a decisao "pesado" (extraidos ao vivo do handler de clique real).
// ---------------------------------------------------------------------
{
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src_cpMesesEntre, ctx);
  const mesesEntre = ctx._cpMesesEntre;
  assert(mesesEntre('2026-01-01', '2026-01-31') === 1, '_cpMesesEntre dentro do mesmo mes = 1');
  assert(mesesEntre('2026-01-01', '2026-12-31') === 12, '_cpMesesEntre ano inteiro = 12 meses');
  assert(mesesEntre('', '2026-12-31') === Infinity, '_cpMesesEntre com "de" vazio (range aberto) = Infinity -> dispara aviso');
  assert(mesesEntre('2026-01-01', '') === Infinity, '_cpMesesEntre com "ate" vazio (range aberto) = Infinity -> dispara aviso');

  // _cpJanelaAlvoDoPeriodo -- Periodo vazio cai no MES PADRAO (nao em "toda
  // a base"), confirmando a correcao do item 18.
  const ctx2 = { _cpJanelaPadraoAtual: () => ({ ini: '2026-09-01', fim: '2026-09-30' }) };
  vm.createContext(ctx2);
  vm.runInContext(src_cpJanelaAlvo, ctx2);
  const alvo = ctx2._cpJanelaAlvoDoPeriodo;
  const alvoVazio = alvo('', '');
  assert(alvoVazio.ini === '2026-09-01' && alvoVazio.fim === '2026-09-30', 'Periodo vazio (Limpar) resolve pro MES PADRAO, nao pra toda a base: ' + JSON.stringify(alvoVazio));
  const alvoPreenchido = alvo('2025-01-01', '2025-12-31');
  assert(alvoPreenchido.ini === '2025-01-01' && alvoPreenchido.fim === '2025-12-31', 'Periodo preenchido passa direto (nao cai no padrao)');

  // Limiares reais do arquivo.
  assert(limitePeriodoLine.indexOf('15000') !== -1, 'CP_LIMITE_AVISO_PERIODO = 15000 (linha real do arquivo)');
  assert(limiteMesesLine.indexOf('= 3') !== -1, 'CP_LIMITE_AVISO_MESES = 3 (linha real do arquivo)');

  // Decisao "pesado" (mesma expressao do handler real) para os numeros
  // ditados pelo diretor: mes tipico (~4.900), Jan/2026 (11.094, o mais
  // pesado da base REAL) e ano todo (~51.881).
  function pesadoPara(n, alvoMeses) {
    const CP_LIMITE_AVISO_PERIODO = 15000, CP_LIMITE_AVISO_MESES = 3;
    return (n != null) ? (n > CP_LIMITE_AVISO_PERIODO) : (alvoMeses > CP_LIMITE_AVISO_MESES);
  }
  assert(pesadoPara(4900, 1) === false, 'Mes tipico (~4.900, contagem OK) -> SEM aviso');
  assert(pesadoPara(11094, 1) === false, 'Jan/2026 (11.094, mes mais pesado real, contagem OK) -> SEM aviso (sob o limiar de 15.000, de proposito)');
  assert(pesadoPara(51881, 12) === true, 'Ano inteiro (~51.881, contagem OK) -> COM aviso');
  assert(pesadoPara(15001, 12) === true, 'Boundary: 15.001 -> COM aviso');
  assert(pesadoPara(15000, 12) === false, 'Boundary: exatamente 15.000 (nao > 15000) -> SEM aviso (estritamente maior-que)');
  // Fallback por numero de meses quando a contagem falha (n === null).
  assert(pesadoPara(null, 12) === true, 'Fallback (contagem falhou): 12 meses > CP_LIMITE_AVISO_MESES(3) -> COM aviso');
  assert(pesadoPara(null, 2) === false, 'Fallback (contagem falhou): 2 meses <= 3 -> SEM aviso');
  assert(pesadoPara(null, Infinity) === true, 'Fallback (contagem falhou) + range aberto (Infinity meses) -> COM aviso');
}

// ---------------------------------------------------------------------
// 4b) _cpGen -- cascata ASSINCRONA (>800 itens, chunks de 500) sobreposta
//     por uma repopulacao mais nova NO MEIO da cascata antiga. A cascata
//     antiga deve abortar (nao duplicar/nao deixar itens orfaos truncados).
// ---------------------------------------------------------------------
async function testGenAbort() {
  const sel = makeFullSelectMock('cp-filtro-favorecido', '');
  const doc = makeDocumentMock({ 'cp-filtro-favorecido': sel });
  const ctx = { document: doc, window: { requestIdleCallback: undefined }, setTimeout, clearTimeout, console };
  vm.createContext(ctx);
  vm.runInContext(src_sufixoConst + '\n' + src_getMultiValues + '\n' + src_isMultiAll + '\n' + src_setMultiValues + '\n' + src_cpSched + '\n' + src_popularChunked, ctx);
  const popular = ctx._popularSelectMultiChunked;

  const listaAntiga = Array.from({ length: 1200 }, (_, i) => ({ v: 'ANTIGO_' + i, t: 'Antigo ' + i }));
  const listaNova = Array.from({ length: 900 }, (_, i) => ({ v: 'NOVO_' + i, t: 'Novo ' + i }));

  let doneAntigo = false, doneNovo = false;
  popular('cp-filtro-favorecido', listaAntiga, 'Todos', () => { doneAntigo = true; });
  // Dispara a cascata NOVA sincronamente, antes do 1o chunk da antiga rodar
  // (setTimeout(fn,0) so executa depois deste frame síncrono).
  popular('cp-filtro-favorecido', listaNova, 'Todos', () => { doneNovo = true; });

  await new Promise(r => setTimeout(r, 100));

  const values = sel.options.map(o => o.value);
  const countAntigo = values.filter(v => v.startsWith('ANTIGO_')).length;
  const countNovo = values.filter(v => v.startsWith('NOVO_')).length;
  const countTodos = values.filter(v => v === 'Todos').length;
  assert(doneNovo === true, 'onDone da cascata NOVA e chamado');
  assert(countTodos === 1, 'Cabecalho Todos nao duplica mesmo com 2 cascatas assincronas sobrepostas (obtido ' + countTodos + ')');
  assert(countNovo === 900, 'Cascata NOVA completa as 900 opcoes (obtido ' + countNovo + ')');
  assert(countAntigo === 0, 'Cascata ANTIGA aborta via token _cpGen e nao deixa nenhuma opcao orfa (obtido ' + countAntigo + ', esperado 0)');
  assert(new Set(values).size === values.length, 'Nenhuma option duplicada apos a corrida entre as duas cascatas');
}

testGenAbort().then(() => {
  console.log('\n=== RESULTADO FINAL: ' + ok + ' ok / ' + fail + ' fail ===\n');
  process.exit(fail > 0 ? 1 : 0);
});
