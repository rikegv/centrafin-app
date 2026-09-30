#!/usr/bin/env node
/**
 * OS-CP-COLUNAS-CLIENTE-01 — SUITE DO TESTER. SOMENTE LEITURA.
 *
 * Arquivo NOVO, e nao extensao de `test-pacote-ondas-f125.cjs`, de proposito:
 * aquele arquivo e a linha de base de REGRESSAO das Ondas F1..F5 (361 casos) e o
 * valor dele esta em continuar verde sem ser tocado. Misturar uma OS nova ali
 * embaralha o sinal (uma falha nova pareceria regressao da OS antiga) e obriga a
 * mexer num arquivo que hoje e prova de que nada quebrou.
 *
 * METODO, e ele e DIFERENTE do usado em `prova-filtros-cliente-favorecido.cjs`:
 * la, `aplicarFiltrosCP` foi extraida e alimentada por SELECTS FALSOS, montados a
 * mao com os valores ja prontos. Aqui os selects sao um DOM minimo de verdade
 * (innerHTML/appendChild/createElement/selectedOptions) e quem os preenche sao os
 * POPULADORES REAIS do arquivo (`_cpPopularFiltroCliente`, `_popularSelectMulti-
 * Chunked`, `setMultiValues`). O caminho testado e o mesmo que o operador
 * percorre: catalogo -> <option> -> marcacao -> filtro. Um filtro cuja LOGICA
 * esta certa e cujo CATALOGO nasce quebrado passa no primeiro metodo e reprova
 * neste.
 *
 * BASE DE COMPARACAO: `ecb83a3` (commit anterior a frente). NUNCA `HEAD`.
 *
 * USO: node scripts/test-colunas-cliente.cjs --dados <caminho/dados.json>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const REL = path.join(RAIZ, 'gerenciador_contas_pagar_desktop', 'code.html');
const BASE_REF = process.env.CP_BASE_REF || 'ecb83a3';

const iArg = process.argv.indexOf('--dados');
const CAMINHO = iArg >= 0 ? process.argv[iArg + 1] : null;
if (!CAMINHO || !fs.existsSync(CAMINHO)) {
  console.error('ERRO: passe --dados <caminho/dados.json>');
  process.exit(2);
}

// A arvore de trabalho esta em CRLF e o blob do git em LF (autocrlf). Sem
// normalizar, TODA comparacao byte-a-byte entre ANTES e DEPOIS acusaria diferenca
// falsa, uma por linha.
const semCR = s => s.replace(/\r\n/g, '\n');
const DEPOIS = semCR(fs.readFileSync(REL, 'utf8'));
const ANTES = semCR(execSync(
  `git show ${BASE_REF}:gerenciador_contas_pagar_desktop/code.html`,
  { cwd: RAIZ, maxBuffer: 1 << 28 }
).toString('utf8'));
const REGS = JSON.parse(fs.readFileSync(CAMINHO, 'utf8'));

// ───────────────────────────── placar ─────────────────────────────
let total = 0, falhas = 0;
const GAPS = [];
function ok(cond, txt) {
  total++;
  if (!cond) falhas++;
  console.log(`  ${cond ? 'OK     ' : '*FALHA*'} ${txt}`);
  return !!cond;
}
function gap(grav, titulo, detalhe) { GAPS.push({ grav, titulo, detalhe }); }
function bloco(t) { console.log(`\n===== ${t} =====`); }

// ───────────────────── extracao de codigo REAL ─────────────────────
function extrairFn(src, nome) {
  const i = src.indexOf(`function ${nome}(`);
  if (i < 0) throw new Error(`nao achei function ${nome}( nesta versao`);
  let j = src.indexOf('{', i), n = 0, fim = -1;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') n++;
    else if (src[k] === '}') { n--; if (!n) { fim = k + 1; break; } }
  }
  return src.slice(i, fim);
}
function extrairConst(src, nome) {
  const marca = `const ${nome} =`;
  const i = src.indexOf(marca);
  if (i < 0) return '';
  const linhas = src.slice(i).split('\n'); const out = [];
  for (const l of linhas) { out.push(l); if (/;\s*$/.test(l)) return out.join('\n'); if (out.length > 40) break; }
  return '';
}
function temFn(src, nome) { return src.includes(`function ${nome}(`); }

// ───────────────────── DOM minimo (selects de verdade) ─────────────────────
// So o suficiente para os populadores REAIS rodarem: option com value/selected,
// innerHTML que PARSEIA as <option>, appendChild, createDocumentFragment,
// querySelector('option[value="X"]') e dispatchEvent.
const DESESC = s => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');

function criarOption(value = '', text = '') {
  return { tagName: 'OPTION', value: String(value), textContent: String(text), selected: false };
}
function criarSelect(id) {
  const sel = {
    id, tagName: 'SELECT', options: [], _cpGen: 0,
    get selectedOptions() { return this.options.filter(o => o.selected); },
    set innerHTML(html) {
      const out = [];
      const re = /<option\s+value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g;
      let m;
      while ((m = re.exec(html))) out.push(criarOption(DESESC(m[1]), DESESC(m[2])));
      this.options = out;
    },
    get innerHTML() { return this.options.map(o => `<option value="${o.value}">${o.textContent}</option>`).join(''); },
    appendChild(no) {
      if (no && no.__frag) { for (const f of no.filhos) this.options.push(f); return no; }
      this.options.push(no); return no;
    },
    querySelector(q) {
      const m = /^option\[value="(.*)"\]$/.exec(q);
      if (!m) return null;
      return this.options.find(o => o.value === m[1]) || null;
    },
    dispatchEvent() { return true; },
  };
  return sel;
}

function montarAmbiente(src) {
  const SELECT_IDS = [
    'cp-filtro-status', 'cp-filtro-favorecido', 'cp-filtro-cliente', 'cp-filtro-despesa',
    'cp-filtro-empresa', 'cp-filtro-tipo', 'cp-filtro-cc', 'cp-filtro-classificacao',
    'cp-filtro-grupo',
  ];
  const selects = {};
  for (const id of SELECT_IDS) selects[id] = criarSelect(id);
  const documento = {
    getElementById: id => selects[id] || null,
    createElement: tag => (tag === 'option' ? criarOption() : { tagName: String(tag).toUpperCase() }),
    createDocumentFragment: () => ({ __frag: true, filhos: [], appendChild(n) { this.filhos.push(n); return n; } }),
  };
  // requestIdleCallback SINCRONO: o populador em chunks roda inteiro antes de
  // devolver, para o teste medir o resultado final e nao um estado intermediario.
  const janela = { requestIdleCallback: (fn) => { fn(); return 1; } };

  const partes = [];
  const push = t => { if (t) partes.push(t); };
  push(extrairFn(src, 'escHTML'));
  push(extrairFn(src, 'hojeISO'));
  push(extrairFn(src, 'statusVisual'));
  push(extrairFn(src, 'getMultiValues'));
  push(extrairFn(src, 'isMultiAll'));
  push(extrairFn(src, 'setMultiValues'));
  push(extrairFn(src, '_cpChaveFiltro'));
  push(extrairFn(src, '_cpNormalizarBusca'));
  push(extrairConst(src, '_CP_SUFIXO_SEM_DADO'));
  push(extrairFn(src, '_cpUniaoOpcoes'));
  push(extrairConst(src, '_cpSched'));
  push(extrairFn(src, '_popularSelectMultiChunked'));
  if (temFn(src, '_cpPopularFiltroCliente')) push(extrairFn(src, '_cpPopularFiltroCliente'));
  if (temFn(src, '_cpPopularFiltroGrupo')) push(extrairFn(src, '_cpPopularFiltroGrupo'));
  if (temFn(src, '_cpMesmoConjunto')) push(extrairFn(src, '_cpMesmoConjunto'));
  if (src.includes('const _CARDS_NATUREZA')) push(extrairConst(src, '_CARDS_NATUREZA'));
  if (temFn(src, '_cpCardNaturezaAtivoKey')) push(extrairFn(src, '_cpCardNaturezaAtivoKey'));
  if (temFn(src, '_cpEhTarifaOuComissao')) { push(extrairConst(src, '_cpNormTarifa')); push(extrairFn(src, '_cpEhTarifaOuComissao')); }
  push(extrairFn(src, 'aplicarFiltrosCP'));
  push(extrairFn(src, 'obterValorSortCP'));

  // O trecho que INDEXA o blob de busca e recortado LITERALMENTE de `_cpIngerir`,
  // em vez de reescrito aqui: reescrever codificaria a mesma suposicao do autor.
  const mBlob = src.match(/_cpBlobBusca\.set\(reg\._id, _cpNormalizarBusca\([\s\S]*?\n\s*\)\);/);
  if (!mBlob) throw new Error('nao achei o trecho de indexacao do _cpBlobBusca');
  const TRECHO_BLOB = mBlob[0];

  const corpo = partes.join('\n') + `
    let _cpClientesDaBase = new Set();
    let _cpCadFavorecidos = [];
    let _cpTermoBusca = '';
    const _cpBlobBusca = new Map();
    return {
      selects: __selects,
      setClientesBase: (s) => { _cpClientesDaBase = s; },
      setCadFavorecidos: (l) => { _cpCadFavorecidos = l; },
      popularCliente: () => (typeof _cpPopularFiltroCliente === 'function' ? _cpPopularFiltroCliente() : null),
      popularGrupo: () => (typeof _cpPopularFiltroGrupo === 'function' ? _cpPopularFiltroGrupo() : null),
      popularChunked: (id, vals, lbl) => _popularSelectMultiChunked(id, vals, lbl),
      uniao: (a, b) => _cpUniaoOpcoes(a, b),
      chave: (s) => _cpChaveFiltro(s),
      marcar: (id, vals) => setMultiValues(document.getElementById(id), vals),
      lerMarcados: (id) => getMultiValues(document.getElementById(id)),
      indexarBlob: (regs) => { for (const reg of regs) { ${TRECHO_BLOB} } },
      setTermo: (t) => { _cpTermoBusca = t; },
      filtrar: (regs) => aplicarFiltrosCP(regs),
      sort: (r, c) => obterValorSortCP(r, c),
    };
  `;

  const fabrica = new Function(
    'document', 'window', '__selects', 'CP_LIMIAR_ANO', '_cpPeriodoComitado',
    '_cpEmpresaDeReg', '_cpGrupoDeReg', '_cpResponsavelDoReg',
    'MAP_CLASS_FILTRO', '_KPI_FILTRO_MAP', corpo
  );
  return fabrica(
    documento, janela, selects, '1900-01-01', { ini: '', fim: '' },
    (r) => String(r.empresa || ''),
    () => ({ grupo: '', conta: '', estado: 'x' }),
    () => ({ gestor: '', texto: '', estado: 'x' }),
    { OPEX: new Set(['Fornecedor Interno', 'Fornecedor Externo']), Cliente: new Set(['Cliente']) },
    {
      interno: { selId: 'cp-filtro-tipo', valores: ['Fornecedor Interno', 'Fornecedor Interno - PJ'] },
      externo: { selId: 'cp-filtro-tipo', valores: ['Fornecedor Externo'] },
      cliente: { selId: 'cp-filtro-tipo', valores: ['Cliente'] },
      sem_class: { selId: 'cp-filtro-tipo', valores: ['__SEM_TIPO__'] },
    }
  );
}

// ───────────────────── recortes da UI (thead / linha) ─────────────────────
// ENDURECIDO em 2026-09-30, e por culpa propria. A versao anterior ancorava em
// `'<tr class="hover:bg-slate-50 transition-colors">'`, string EXATA. O commit
// 6a6c392 acrescentou `group` a essa classe, o indexOf devolveu -1, o slice
// comeu o arquivo inteiro e `lerLinhaTd` retornou 0 celulas SEM ERRAR. Isso
// derrubou em cascata 4 asserções que nao tinham nada a ver com o assunto, e
// uma delas ("celula de Cliente usa nao informado") chegou ao coordenador como
// se fosse defeito dele. Extrator que devolve vazio em silencio e pior do que
// extrator que nao existe: ele produz veredito errado com cara de veredito.
// Agora: ancora por PADRAO (nao por string exata) e EXPLODE se o recorte vier
// implausivel.
const semComentario = s => s.replace(/<!--[\s\S]*?-->/g, '');
function exigir(cond, msg) { if (!cond) { console.error(`\nERRO DE EXTRACAO: ${msg}`); process.exit(3); } }

function lerThead(src) {
  const i = src.indexOf('<thead');
  const f = src.indexOf('</thead>', i);
  exigir(i >= 0 && f > i, 'nao achei o bloco <thead>...</thead>');
  const bruto = semComentario(src.slice(i, f));
  exigir(!bruto.includes('<!--'), 'sobrou comentario dentro do thead apos a limpeza');
  const ths = [];
  const re = /<th\b([^>]*)>([\s\S]*?)<\/th>/g;
  let m;
  while ((m = re.exec(bruto))) {
    const attrs = m[1], dentro = m[2];
    const mSort = /ordenarTabelaCP\('([^']+)'\)/.exec(attrs);
    const mIcone = /id="icone-sort-([^"]+)"/.exec(dentro);
    // `w-NN` de largura, ignorando `max-w-NN` e o `w-` de utilitarios vizinhos.
    const mW = /(?:^|\s)w-(\d+|auto|full|max)\b/.exec(attrs);
    const mLeft = /(?:^|[\s"'])left-(?:\[(\d+)px\]|(\d+))(?=[\s"']|$)/.exec(attrs);
    const rotulo = dentro.replace(/<span[\s\S]*?<\/span>/g, '').replace(/<input[^>]*>/g, '')
      .replace(/\s+/g, ' ').trim();
    ths.push({
      rotulo, sort: mSort ? mSort[1] : null, icone: mIcone ? mIcone[1] : null,
      w: mW ? mW[1] : null, attrs,
      sticky: /(?:^|[\s"'])sticky(?:[\s"']|$)/.test(attrs),
      left: mLeft ? (mLeft[1] != null ? Number(mLeft[1]) : TW_PX(mLeft[2])) : null,
      leftBruto: mLeft ? mLeft[0].trim() : null,
      z: (/(?:^|\s)z-(\d+)\b/.exec(attrs) || [])[1] || null,
      bg: (/(?:^|\s)bg-([a-z0-9-]+)\b/.exec(attrs) || [])[1] || null,
    });
  }
  exigir(ths.length >= 10, `o thead devolveu so ${ths.length} <th>, implausivel para esta tela`);
  return ths;
}

function lerLinhaTd(src) {
  // Ancora no PADRAO da abertura da linha dentro do template literal, nao numa
  // lista fixa de classes. `linhas[i] = \`` e o marco estavel.
  const iTpl = src.indexOf('linhas[i] = `');
  exigir(iTpl >= 0, 'nao achei o template literal da linha (`linhas[i] = `)');
  const i = src.indexOf('<tr', iTpl);
  const f = src.indexOf('</tr>`', i);
  exigir(i >= 0 && f > i && f - i < 20000,
    `recorte da linha implausivel (inicio=${i}, fim=${f}); a ancora do <tr> mudou?`);
  const trecho = src.slice(i, f);
  const mTr = /<tr\b([^>]*)>/.exec(trecho);
  const tds = trecho.split(/<td\b/).slice(1);
  exigir(tds.length >= 10, `a linha devolveu so ${tds.length} <td>, implausivel para esta tela`);
  const det = tds.map(td => {
    const attrs = td.slice(0, td.indexOf('>'));
    const mW = /(?:^|\s)w-(\d+|auto|full|max)\b/.exec(attrs);
    const mLeft = /(?:^|[\s"'])left-(?:\[(\d+)px\]|(\d+))(?=[\s"']|$)/.exec(attrs);
    return {
      html: td, attrs,
      w: mW ? mW[1] : null,
      maxw: (/(?:^|\s)max-w-(\d+)\b/.exec(attrs) || [])[1] || null,
      sticky: /(?:^|[\s"'])sticky(?:[\s"']|$)/.test(attrs),
      left: mLeft ? (mLeft[1] != null ? Number(mLeft[1]) : TW_PX(mLeft[2])) : null,
      leftBruto: mLeft ? mLeft[0].trim() : null,
      z: (/(?:^|\s)z-(\d+)\b/.exec(attrs) || [])[1] || null,
      bg: (/(?:^|\s)bg-([a-z0-9-]+)\b/.exec(attrs) || [])[1] || null,
      hoverBg: (/group-hover:bg-([a-z0-9-]+)/.exec(attrs) || [])[1] || null,
      truncate: /truncate/.test(td),
    };
  });
  return { trecho, n: tds.length, tds, det, trAttrs: mTr ? mTr[1] : '' };
}

// Tailwind: w-N = N/4 rem = N*4 px (1rem = 16px).
const TW_PX = n => (Number(n) / 4) * 16;

function casesDoSort(src) {
  const fn = extrairFn(src, 'obterValorSortCP');
  return [...fn.matchAll(/case\s+'([^']+)'\s*:/g)].map(m => m[1]);
}

// ═══════════════════════════════════════════════════════════════════
console.log(`\n### OS-CP-COLUNAS-CLIENTE-01 — suite do tester`);
console.log(`base ANTES : ${BASE_REF}`);
console.log(`arquivo    : gerenciador_contas_pagar_desktop/code.html`);
console.log(`snapshot   : ${REGS.length} lancamentos`);

// ───────────────────── alvos reais da base ─────────────────────
const UP = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toUpperCase();
const contarPor = (arr, campo) => {
  const m = new Map();
  for (const r of arr) { const v = String(r[campo] || '').trim(); if (v) m.set(v, (m.get(v) || 0) + 1); }
  return m;
};
const porEntidade = contarPor(REGS, 'entidade');
const porObs = contarPor(REGS, 'observacao');
const CLIENTE = [...porEntidade.entries()].sort((a, b) => b[1] - a[1])[0][0];
const doCliente = REGS.filter(r => UP(r.entidade) === UP(CLIENTE));
const porObsDoCliente = contarPor(doCliente, 'observacao');
const FUNC = [...porObsDoCliente.entries()].sort((a, b) => b[1] - a[1])[0][0];

const vaziosEnt = REGS.filter(r => !String(r.entidade || '').trim()).length;
const vaziosObs = REGS.filter(r => !String(r.observacao || '').trim()).length;

console.log(`\nentidade   : ${porEntidade.size} distintos, ${vaziosEnt} vazios`);
console.log(`observacao : ${porObs.size} distintos, ${vaziosObs} vazios`);
console.log(`CLIENTE alvo    : ${JSON.stringify(CLIENTE)} (${doCliente.length} lanc., ${porObsDoCliente.size} favorecidos distintos)`);
console.log(`FAVORECIDO alvo : ${JSON.stringify(FUNC)} (${porObsDoCliente.get(FUNC)} lanc. dentro do cliente, ${porObs.get(FUNC)} no total)`);

const envDepois = montarAmbiente(DEPOIS);
const envAntes = montarAmbiente(ANTES);

// ═══ 1. ESTRUTURA: ordem, rotulo, alinhamento th/td, chaves de sort ═══
bloco('1. ESTRUTURA DA TABELA: 12 th, 12 td, ordem e rotulos');
const THS = lerThead(DEPOIS);
const LINHA = lerLinhaTd(DEPOIS);
const THS_ANTES = lerThead(ANTES);
const LINHA_ANTES = lerLinhaTd(ANTES);

console.log(`  antes : ${THS_ANTES.length} th / ${LINHA_ANTES.n} td`);
console.log(`  depois: ${THS.length} th / ${LINHA.n} td`);
console.log(`  ordem : ${THS.map((t, i) => `${i}:${t.rotulo || '(checkbox)'}`).join(' | ')}`);

ok(THS_ANTES.length === 11 && LINHA_ANTES.n === 11, `ANTES a tabela tinha 11 th e 11 td (${THS_ANTES.length}/${LINHA_ANTES.n})`);
ok(THS.length === 12, `DEPOIS tem 12 <th> (achei ${THS.length})`);
ok(LINHA.n === 12, `DEPOIS tem 12 <td> na linha (achei ${LINHA.n})`);
ok(THS.length === LINHA.n, `th e td alinhados em quantidade`);

// Ordem do modelo de ROLAGEM COM COLUNAS CONGELADAS (6a6c392): Mes e Codigo
// desceram porque bloco congelado tem que ser CONTIGUO, e as quatro de
// identidade sao as que ficam.
const ESPERADA = [
  '', 'Empresa Pagadora', 'Cliente', 'Favorecido', 'Mês de Referência', 'Código',
  'Despesa', 'Grupo de Contas', 'CC', 'Responsável', 'Valor', 'Ações',
];
ESPERADA.forEach((rot, i) => {
  const achado = THS[i] ? THS[i].rotulo : '(ausente)';
  ok(achado === rot, `coluna ${i} = ${JSON.stringify(rot || '(checkbox)')} (achei ${JSON.stringify(achado)})`);
});
// Daqui para baixo a suite procura coluna por NOME, nunca por indice: indice fixo
// foi o que fez 2 asserções minhas acusarem o coordenador quando a ordem mudou.
const idxCol = nome => {
  const i = THS.findIndex(t => t.rotulo === nome);
  exigir(i >= 0, `nao achei a coluna ${JSON.stringify(nome)} no thead`);
  return i;
};
const col = nome => ({ i: idxCol(nome), th: THS[idxCol(nome)], td: LINHA.det[idxCol(nome)] });
ok(THS.length === LINHA.det.length,
  `o mapa th->td e 1 para 1, entao procurar por nome no thead indexa a celula certa`);

ok(!/>\s*Empresa\s*</.test(semComentario(DEPOIS).slice(DEPOIS.indexOf('<thead'), DEPOIS.indexOf('</thead>'))),
  `nenhum <th> ficou com o rotulo antigo "Empresa" cru`);

bloco('1b. cada th clicavel tem case em obterValorSortCP, e nenhum case orfao');
const CASES = casesDoSort(DEPOIS);
const chavesTh = THS.filter(t => t.sort).map(t => t.sort);
console.log(`  th clicaveis: ${chavesTh.join(', ')}`);
console.log(`  cases       : ${CASES.join(', ')}`);
for (const k of chavesTh) ok(CASES.includes(k), `th '${k}' tem case '${k}' (senao ordenaria por string vazia)`);
for (const c of CASES) ok(chavesTh.includes(c), `case '${c}' e usado por algum th (nao e orfao)`);
for (const t of THS.filter(x => x.sort)) {
  ok(t.icone === t.sort, `th '${t.sort}' tem icone id="icone-sort-${t.sort}" (achei ${t.icone})`);
}
const idsIcone = [...DEPOIS.matchAll(/id="icone-sort-([^"]+)"/g)].map(m => m[1]);
ok(new Set(idsIcone).size === idsIcone.length, `nenhum id="icone-sort-*" duplicado (${idsIcone.length} ids)`);

bloco('1c. a celula exibe o MESMO campo que o sort e o filtro daquela coluna');
ok(/case 'cliente':\s*return \{ tipo: 'texto',\s*valor: String\(r\.entidade/.test(extrairFn(DEPOIS, 'obterValorSortCP')),
  `sort 'cliente' le r.entidade`);
ok(/case 'favorecido':\s*return \{ tipo: 'texto',\s*valor: String\(r\.observacao/.test(extrairFn(DEPOIS, 'obterValorSortCP')),
  `sort 'favorecido' le r.observacao`);
ok(/r\.entidade/.test(col('Cliente').td.html), `a celula da coluna Cliente renderiza r.entidade`);
ok(/r\.observacao/.test(col('Favorecido').td.html), `a celula da coluna Favorecido renderiza r.observacao`);
ok(/_cpEmpresaDeReg\(r\)/.test(col('Empresa Pagadora').td.html), `a celula de Empresa Pagadora usa o acessor unico _cpEmpresaDeReg`);
ok(/r\.categoria/.test(col('Despesa').td.html), `a celula de Despesa renderiza r.categoria`);
ok(/r\.centro_custo/.test(col('CC').td.html), `a celula de CC renderiza r.centro_custo`);
ok(/_cpResponsavelDoReg\(r\)/.test(col('Responsável').td.html), `a celula de Responsável usa o lookup unico`);
ok(/r\.data_vencimento/.test(col('Mês de Referência').td.html), `a celula de Mês de Referência renderiza r.data_vencimento`);
ok(/r\.codigo_fornecedor/.test(col('Código').td.html), `a celula de Código renderiza r.codigo_fornecedor`);
ok(/valor_original/.test(col('Valor').td.html), `a celula de Valor renderiza valor_original`);
{
  const amostra = REGS.slice(0, 2000);
  const sortOk = amostra.every(r => envDepois.sort(r, 'cliente').valor === String(r.entidade || ''));
  const sortOk2 = amostra.every(r => envDepois.sort(r, 'favorecido').valor === String(r.observacao || ''));
  ok(sortOk, `obterValorSortCP REAL: 'cliente' devolve entidade em 2000 registros`);
  ok(sortOk2, `obterValorSortCP REAL: 'favorecido' devolve observacao em 2000 registros`);
  const ordenado = [...amostra].sort((a, b) => String(envDepois.sort(a, 'cliente').valor)
    .localeCompare(String(envDepois.sort(b, 'cliente').valor), 'pt-BR'));
  ok(ordenado.length === amostra.length && ordenado[0].entidade <= ordenado[ordenado.length - 1].entidade,
    `ordenar por 'cliente' nao perde nem duplica linha`);
}

// ═══ 2. CATALOGO DOS FILTROS pelo POPULADOR REAL ═══
bloco('2. CATALOGO: os populadores REAIS produzem <option> utilizaveis');
const CLIENTES_BASE = new Set([...porEntidade.keys()]);
const OBS_BASE = [...porObs.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
// Cadastro de /Fornecedores nao esta no snapshot; usa-se um recorte dos proprios
// nomes de bloco, que e o que o cadastro guarda (nome oficial do fornecedor).
const CAD_FORNECEDORES = [...porEntidade.keys()].slice(0, 50);

envDepois.setClientesBase(CLIENTES_BASE);
envDepois.setCadFavorecidos(CAD_FORNECEDORES);
envDepois.popularCliente();
const selCli = envDepois.selects['cp-filtro-cliente'];
const valsCli = selCli.options.map(o => o.value);
const objetoObjeto = valsCli.filter(v => v === '[object Object]').length;
console.log(`  cp-filtro-cliente: ${valsCli.length} <option>, ${new Set(valsCli).size} valores distintos`);
console.log(`  amostra          : ${JSON.stringify(valsCli.slice(0, 4))}`);
ok(objetoObjeto === 0,
  `nenhuma <option> do filtro Cliente tem value "[object Object]" (achei ${objetoObjeto})`);
ok(new Set(valsCli).size === valsCli.length,
  `os values do filtro Cliente sao distintos (${new Set(valsCli).size}/${valsCli.length})`);
ok(valsCli.includes(envDepois.chave(CLIENTE)),
  `o cliente alvo ${JSON.stringify(envDepois.chave(CLIENTE))} existe como <option> no filtro Cliente`);
ok(valsCli.length >= porEntidade.size,
  `o catalogo de Cliente cobre os ${porEntidade.size} valores da base (tem ${valsCli.length - 1} + Todos)`);
// O populador proprio foi DELETADO e o catalogo passou a ser montado pelo
// `_popularSelectMultiChunked`, o mesmo dos outros 5 filtros. Provado abaixo.
ok(/_popularSelectMultiChunked\('cp-filtro-cliente'/.test(DEPOIS),
  `o catalogo de Cliente delega ao populador compartilhado, e nao a um molde proprio`);
ok(!/lista\.map\(n => `<option value="\$\{escHTML\(n\)\}"/.test(DEPOIS),
  `o molde proprio que gerava "[object Object]" nao existe mais no arquivo`);
ok(/_popularSelectMultiChunked\('cp-filtro-cliente'/.test(DEPOIS)
  && /typeof x === 'string' \? \{ v: x, t: x \} : x/.test(DEPOIS),
  `e o populador compartilhado normaliza string OU objeto {v,t}, que era a causa raiz`);
{
  // Marcacao do operador tem que SOBREVIVER a uma repopulacao (o listener de
  // /Fornecedores repopula a cada chegada do cadastro). Era o 3o sintoma do bug.
  const alvoOpt = valsCli.find(v => v !== 'Todos' && v === envDepois.chave(CLIENTE)) || valsCli[1];
  envDepois.marcar('cp-filtro-cliente', [alvoOpt]);
  const antesRepop = envDepois.lerMarcados('cp-filtro-cliente');
  envDepois.popularCliente();               // repopulacao, como no app
  const depoisRepop = envDepois.lerMarcados('cp-filtro-cliente');
  console.log(`  marcacao antes da repopulacao : ${JSON.stringify(antesRepop)}`);
  console.log(`  marcacao depois da repopulacao: ${JSON.stringify(depoisRepop)}`);
  ok(JSON.stringify(antesRepop) === JSON.stringify(depoisRepop) && depoisRepop[0] !== 'Todos',
    `a marcacao do operador sobrevive a uma repopulacao do catalogo de Cliente`);
  envDepois.marcar('cp-filtro-cliente', ['Todos']);
}
// O componente visual nao e mais "upgradeado" a mao aqui; confirmando que ele se
// vira sozinho, senao o dropdown ficaria com as opcoes velhas na tela.
{
  const cbm = fs.readFileSync(path.join(RAIZ, 'assets', 'checkbox_multi.js'), 'utf8');
  ok(/MutationObserver/.test(cbm) && /childList:\s*true/.test(cbm) && /cb-multi-sync/.test(cbm),
    `checkbox_multi.js reage sozinho a troca de <option> (MutationObserver childList + evento cb-multi-sync), ` +
    `entao tirar o upgrade() manual do populador de Cliente nao deixa o dropdown desatualizado`);
}
if (objetoObjeto > 0) {
  gap('BLOQUEIO', 'Filtro CLIENTE nasce inutilizavel: todas as <option> viram "[object Object]"',
    `_cpPopularFiltroCliente copiou o molde de _cpPopularFiltroGrupo, onde a lista e de STRINGS, mas alimentou ` +
    `com _cpUniaoOpcoes(), que devolve OBJETOS { v, t, temDado }. O escHTML(n) recebe um objeto e vira ` +
    `"[object Object]": ${objetoObjeto} <option> com o MESMO value e o MESMO rotulo. Consequencias medidas aqui: ` +
    `(1) o operador ve ${objetoObjeto} linhas identicas "[object Object]" no dropdown; (2) marcar qualquer uma ` +
    `manda "[object Object]" para o filtro e a tabela vai a ZERO; (3) a linha ` +
    `'const restaurar = [...marcados].filter(v => v === "Todos" || lista.includes(v))' compara string com objeto, ` +
    `entao NUNCA casa e a marcacao do operador e descartada a cada repopulacao. ` +
    `Arquivo: gerenciador_contas_pagar_desktop/code.html, function _cpPopularFiltroCliente. ` +
    `_popularSelectMultiChunked ja normaliza ("typeof x === 'string' ? {v:x,t:x} : x"); este populador nao. ` +
    `Este defeito e INVISIVEL para uma prova que monta os selects a mao: a logica de aplicarFiltrosCP esta certa, ` +
    `o que quebra e o catalogo.`);
}

envDepois.popularChunked('cp-filtro-favorecido', OBS_BASE, 'Todos os Favorecidos');
const selFav = envDepois.selects['cp-filtro-favorecido'];
const valsFav = selFav.options.map(o => o.value);
console.log(`  cp-filtro-favorecido: ${valsFav.length} <option>`);
ok(valsFav.filter(v => v === '[object Object]').length === 0,
  `nenhuma <option> do filtro Favorecido tem value "[object Object]"`);
ok(valsFav.includes(FUNC), `o favorecido alvo ${JSON.stringify(FUNC)} existe como <option>`);
ok(!valsFav.includes(CLIENTE) && !valsFav.includes(envDepois.chave(CLIENTE)),
  `o catalogo de Favorecido NAO oferta mais o nome do cliente (a uniao com /Fornecedores saiu)`);

// ═══ 3. CADA FILTRO CASA PELO CAMPO DA SUA COLUNA (fim a fim) ═══
const chaveCli = envDepois.chave(CLIENTE), chaveFunc = envDepois.chave(FUNC);

// Duas camadas, porque elas respondem perguntas diferentes e podem divergir:
//  - camada LOGICA: injeta a <option> e marca, exercitando so `aplicarFiltrosCP`.
//  - camada UI: so consegue marcar o que o CATALOGO REAL ofertou. E aqui que um
//    populador quebrado aparece, e e o que o operador vive.
function limparTudo(env) { for (const sid of Object.keys(env.selects)) env.marcar(sid, ['Todos']); }
function marcarForcado(env, id, valores) {
  const sel = env.selects[id];
  for (const v of valores) if (!sel.options.some(o => o.value === v)) sel.options.push({ tagName: 'OPTION', value: v, textContent: v, selected: false });
  env.marcar(id, valores);
}
function filtrarLogico(env, id, valores) { limparTudo(env); marcarForcado(env, id, valores); return env.filtrar(REGS); }
function filtrarUI(env, id, valores) { limparTudo(env); env.marcar(id, valores); return env.filtrar(REGS); }

bloco('3a. CAMADA LOGICA: aplicarFiltrosCP com o valor injetado a forca');
const aFavCli = filtrarLogico(envAntes, 'cp-filtro-favorecido', [chaveCli]).length;
const dFavCli = filtrarLogico(envDepois, 'cp-filtro-favorecido', [chaveCli]).length;
console.log(`  Favorecido = nome do CLIENTE    : antes=${aFavCli}  depois=${dFavCli}`);
ok(aFavCli === doCliente.length, `ANTES trazia os ${doCliente.length} lancamentos do bloco inteiro`);
ok(dFavCli === 0, `DEPOIS traz ZERO: cliente nao e favorecido (o filtro casa por observacao)`);

const aFavFunc = filtrarLogico(envAntes, 'cp-filtro-favorecido', [chaveFunc]).length;
const dFavFunc = filtrarLogico(envDepois, 'cp-filtro-favorecido', [chaveFunc]).length;
console.log(`  Favorecido = nome do FUNCIONARIO: antes=${aFavFunc}  depois=${dFavFunc}`);
ok(aFavFunc === 0, `ANTES dava ZERO ao filtrar um favorecido de verdade`);
ok(dFavFunc === porObs.get(FUNC), `DEPOIS devolve ${dFavFunc}, igual aos ${porObs.get(FUNC)} lancamentos com observacao == alvo`);

const dCliLog = filtrarLogico(envDepois, 'cp-filtro-cliente', [chaveCli]);
console.log(`  Cliente = alvo                  : ${dCliLog.length} linhas`);
ok(dCliLog.length === doCliente.length, `filtro Cliente devolve os ${doCliente.length} lancamentos, nao um subconjunto`);
ok(dCliLog.every(r => UP(r.entidade) === UP(CLIENTE)), `100% das linhas tem entidade == alvo`);
ok(new Set(dCliLog.map(r => UP(r.observacao))).size === porObsDoCliente.size,
  `e contem os ${porObsDoCliente.size} favorecidos distintos do cliente (Cliente agrega, Favorecido detalha)`);

limparTudo(envDepois);
marcarForcado(envDepois, 'cp-filtro-cliente', [chaveCli]);
marcarForcado(envDepois, 'cp-filtro-favorecido', [chaveFunc]);
const ambos = envDepois.filtrar(REGS);
ok(ambos.length === porObsDoCliente.get(FUNC),
  `Cliente + Favorecido (AND): ${ambos.length} linhas, o funcionario DENTRO daquele cliente (${porObsDoCliente.get(FUNC)})`);
{
  const outro = REGS.find(r => UP(r.entidade) !== UP(CLIENTE) && r.observacao);
  limparTudo(envDepois);
  marcarForcado(envDepois, 'cp-filtro-cliente', [chaveCli]);
  marcarForcado(envDepois, 'cp-filtro-favorecido', [envDepois.chave(outro.observacao)]);
  ok(envDepois.filtrar(REGS).length === 0, `Cliente A + Favorecido exclusivo do cliente B: ZERO linhas (o AND vale)`);
}
{
  const topCli = [...porEntidade.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  let e1 = 0;
  for (const [nome, n] of topCli) {
    const res = filtrarLogico(envDepois, 'cp-filtro-cliente', [envDepois.chave(nome)]);
    if (res.length !== n || !res.every(r => UP(r.entidade) === UP(nome))) e1++;
  }
  ok(e1 === 0, `25 clientes de maior volume: contagem e pureza exatas (${e1} erro(s))`);
  const topFav = [...porObs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  let e2 = 0;
  for (const [nome, n] of topFav) {
    const res = filtrarLogico(envDepois, 'cp-filtro-favorecido', [envDepois.chave(nome)]);
    if (res.length !== n || !res.every(r => UP(r.observacao) === UP(nome))) e2++;
  }
  ok(e2 === 0, `25 favorecidos de maior volume: contagem e pureza exatas (${e2} erro(s))`);
}

bloco('3b. CAMADA UI: o operador so consegue marcar o que o catalogo REAL ofertou');
{
  // Repopula os catalogos do zero (a camada logica injetou fantasmas).
  envDepois.setClientesBase(CLIENTES_BASE);
  envDepois.setCadFavorecidos(CAD_FORNECEDORES);
  envDepois.popularCliente();
  envDepois.popularChunked('cp-filtro-favorecido', OBS_BASE, 'Todos os Favorecidos');

  const uiFav = filtrarUI(envDepois, 'cp-filtro-favorecido', [chaveFunc]).length;
  console.log(`  Favorecido pelo catalogo real  : ${uiFav} linhas`);
  ok(uiFav === porObs.get(FUNC), `pela UI, filtrar o favorecido alvo da as ${porObs.get(FUNC)} linhas dele`);

  const uiFavCli = filtrarUI(envDepois, 'cp-filtro-favorecido', [chaveCli]).length;
  console.log(`  Favorecido = nome do CLIENTE   : ${uiFavCli} linhas (nao ha mais essa <option>)`);
  ok(uiFavCli === REGS.length, `o nome do cliente nem existe mais no catalogo de Favorecido, entao cai em "Todos"`);

  const uiCli = filtrarUI(envDepois, 'cp-filtro-cliente', [chaveCli]);
  console.log(`  Cliente pelo catalogo real     : ${uiCli.length} linhas (esperado ${doCliente.length})`);
  ok(uiCli.length === doCliente.length,
    `pela UI, marcar o cliente alvo no filtro Cliente da as ${doCliente.length} linhas dele`);

  // O que acontece de fato ao clicar na primeira opcao do dropdown de Cliente.
  const primeira = envDepois.selects['cp-filtro-cliente'].options.find(o => o.value !== 'Todos');
  const clicou = filtrarUI(envDepois, 'cp-filtro-cliente', [primeira.value]);
  console.log(`  clicar na 1a opcao (${JSON.stringify(primeira.value)}) -> ${clicou.length} linhas`);
  ok(clicou.length > 0 && clicou.length < REGS.length,
    `clicar numa opcao do filtro Cliente recorta a tabela (deu ${clicou.length} de ${REGS.length})`);
}

// ═══ 4. OS QUATRO PONTOS DE ESTADO ═══
bloco('4. OS 4 PONTOS DE ESTADO (persistir, restaurar, chip, limpar)');
function pontos(src) {
  const salvar = extrairFn(src, '_cpSalvarEstadoFiltros');
  const restaurar = extrairFn(src, '_cpRestaurarEstadoFiltros');
  const chip = extrairFn(src, temFn(src, '_cpAtualizarChipsFiltros') ? '_cpAtualizarChipsFiltros' : '_cpAtualizarHintRecorte');
  const limpar = extrairFn(src, 'limparTodosFiltros');
  return { salvar, restaurar, chip, limpar };
}
// o chip de filtros ativos e a funcao que monta `dims`
function fnDoChip(src) {
  const i = src.indexOf("['Favorecido', getMultiValues");
  const ini = src.lastIndexOf('function ', i);
  let j = src.indexOf('{', ini), n = 0, fim = -1;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') n++; else if (src[k] === '}') { n--; if (!n) { fim = k + 1; break; } }
  }
  return src.slice(ini, fim);
}
for (const [rot, src, esperado] of [['DEPOIS', DEPOIS, true], ['ANTES', ANTES, false]]) {
  const p = {
    persistir: extrairFn(src, '_cpSalvarEstadoFiltros'),
    restaurar: extrairFn(src, '_cpRestaurarEstadoFiltros'),
    chip: fnDoChip(src),
    limpar: extrairFn(src, 'limparTodosFiltros'),
  };
  for (const filtro of ['cp-filtro-cliente', 'cp-filtro-grupo']) {
    for (const [ponto, txt] of Object.entries(p)) {
      const tem = txt.includes(filtro);
      if (rot === 'DEPOIS') ok(tem, `DEPOIS: ${filtro} esta em ${ponto}`);
      else console.log(`  (base) ANTES: ${filtro} em ${ponto}: ${tem ? 'sim' : 'NAO'}`);
    }
  }
  if (rot === 'ANTES') {
    ok(!p.limpar.includes('cp-filtro-grupo'), `REGRESSAO PROVADA: em ${BASE_REF} 'cp-filtro-grupo' NAO estava no Limpar filtros`);
    ok(!p.persistir.includes('cp-filtro-grupo'), `REGRESSAO PROVADA: em ${BASE_REF} 'cp-filtro-grupo' NAO era persistido`);
    ok(!p.restaurar.includes('cp-filtro-grupo'), `REGRESSAO PROVADA: em ${BASE_REF} 'cp-filtro-grupo' NAO era restaurado`);
    ok(!p.chip.includes('cp-filtro-grupo'), `REGRESSAO PROVADA: em ${BASE_REF} 'cp-filtro-grupo' NAO entrava no chip`);
  }
}
// "Limpar filtros" de verdade: marca tudo e prova que volta ao universo inteiro
{
  const idsLimpar = [...extrairFn(DEPOIS, 'limparTodosFiltros').matchAll(/'(cp-filtro-[a-z]+)'/g)].map(m => m[1]);
  const idsExistentes = [...new Set([...DEPOIS.matchAll(/id="(cp-filtro-[a-z]+)"/g)].map(m => m[1]))]
    .filter(id => !/periodo/.test(id));
  console.log(`  limpar cobre: ${idsLimpar.join(', ')}`);
  const faltando = idsExistentes.filter(id => !idsLimpar.includes(id));
  ok(faltando.length === 0, `"Limpar filtros" cobre TODOS os multiselects da tela (faltando: ${faltando.join(', ') || 'nenhum'})`);

  limparTudo(envDepois);
  marcarForcado(envDepois, 'cp-filtro-cliente', [chaveCli]);
  marcarForcado(envDepois, 'cp-filtro-favorecido', [chaveFunc]);
  const antesLimpar = envDepois.filtrar(REGS).length;
  for (const id of idsLimpar) envDepois.marcar(id, ['Todos']);
  const depoisLimpar = envDepois.filtrar(REGS).length;
  ok(antesLimpar < REGS.length && depoisLimpar === REGS.length,
    `apos "Limpar", a tabela volta de ${antesLimpar} para os ${depoisLimpar} lancamentos`);
}

// ═══ 5. O QUE PODE TER QUEBRADO SEM PERCEBER ═══
bloco('5a. BUSCA RAPIDA: o blob ainda acha cliente E favorecido');
envDepois.indexarBlob(REGS.map(r => ({ ...r, _id: r._id || r.id || String(Math.random()) })));
// o blob e indexado por _id; o snapshot pode nao ter _id, entao reindexa com o proprio objeto
const REGS_ID = REGS.map((r, i) => (r._id ? r : { ...r, _id: `r${i}` }));
envDepois.indexarBlob(REGS_ID);
function buscar(termo) {
  for (const sid of Object.keys(envDepois.selects)) envDepois.marcar(sid, ['Todos']);
  envDepois.setTermo(termo);
  const res = envDepois.filtrar(REGS_ID);
  envDepois.setTermo('');
  return res;
}
const bCli = buscar(CLIENTE.toLowerCase());
const bFunc = buscar(FUNC.toLowerCase());
console.log(`  busca "${CLIENTE.toLowerCase().slice(0, 30)}..." -> ${bCli.length} linhas`);
console.log(`  busca "${FUNC.toLowerCase()}" -> ${bFunc.length} linhas`);
ok(bCli.length >= doCliente.length, `busca pelo nome do CLIENTE ainda acha (${bCli.length} >= ${doCliente.length})`);
ok(bFunc.length >= porObs.get(FUNC), `busca pelo nome do FAVORECIDO ainda acha (${bFunc.length} >= ${porObs.get(FUNC)})`);
{
  const mBlob = DEPOIS.match(/_cpBlobBusca\.set\(reg\._id, _cpNormalizarBusca\([\s\S]*?\n\s*\)\);/)[0];
  ok(mBlob.includes('reg.entidade') && mBlob.includes('reg.observacao'),
    `o indice de busca continua cobrindo entidade E observacao`);
}

// ─────────────── predicados reaplicaveis a QUALQUER versao ───────────────
// Cada asserção nova desta rodada vira uma FUNCAO que recebe o fonte. Assim o
// mesmo predicado roda contra a arvore de trabalho (tem que PASSAR) e contra as
// duas versoes com defeito (tem que FALHAR). Predicado que passa em todo mundo
// nao esta testando nada: e so um comentario que compila.
const CACHE_REF = new Map();
function fonteDaRef(ref) {
  if (!CACHE_REF.has(ref)) {
    CACHE_REF.set(ref, semCR(execSync(
      `git show ${ref}:gerenciador_contas_pagar_desktop/code.html`,
      { cwd: RAIZ, maxBuffer: 1 << 28 }).toString('utf8')));
  }
  return CACHE_REF.get(ref);
}
function lerExport(src) {
  const iAnc = src.indexOf('const linhas = new Array(fonte.length);');
  const trecho = src.slice(iAnc, src.indexOf("XLSX.utils.book_new()", iAnc));
  const mHeader = /header:\s*\[([\s\S]*?)\]/.exec(trecho);
  const header = mHeader ? [...mHeader[1].matchAll(/'([^']+)'/g)].map(m => m[1]) : [];
  const mCols = /!cols'\]\s*=\s*\[([\s\S]*?)\];/.exec(trecho);
  const nCols = mCols ? (mCols[1].match(/\{\s*wch:/g) || []).length : -1;
  const chave = k => {
    const re = new RegExp(`'${k.replace(/[/()$.]/g, '\\$&')}':\\s*([^,\\n]+)`);
    const m = re.exec(trecho);
    return m ? m[1].trim() : null;
  };
  return { header, nCols, chave };
}
const PRED_EXPORT = {
  'header tem "Cliente" e "Favorecido", e nao tem mais "Fornecedor/Favorecido" nem "Detalhe / Observação"':
    s => { const e = lerExport(s); return e.header.includes('Cliente') && e.header.includes('Favorecido')
      && !e.header.includes('Fornecedor/Favorecido') && !e.header.includes('Detalhe / Observação'); },
  'a coluna "Cliente" da planilha e alimentada por r.entidade':
    s => /r\.entidade/.test(lerExport(s).chave('Cliente') || ''),
  'a coluna "Favorecido" da planilha e alimentada por r.observacao':
    s => /r\.observacao/.test(lerExport(s).chave('Favorecido') || ''),
  'a coluna de empresa se chama "Empresa Pagadora", igual ao th da tela':
    s => lerExport(s).header.includes('Empresa Pagadora') && !lerExport(s).header.includes('Empresa'),
  'todo rotulo do header da planilha existe como th na tela (mesmo vocabulario)':
    s => { const e = lerExport(s); const ths = lerThead(s).map(t => t.rotulo);
      return ['Empresa Pagadora', 'Cliente', 'Favorecido', 'Despesa'].every(k => e.header.includes(k) && ths.includes(k)); },
};
const PRED_MODAL = {
  'o campo #ef-cp-favorecido NAO se chama mais "Favorecido" (ele sempre editou `entidade`)':
    s => { const m = /<label[^>]*>([^<]*)<\/label>\s*(?:<!--[\s\S]*?-->\s*)?<input id="ef-cp-favorecido"/.exec(s);
      return !!m && !/favorecido/i.test(m[1]); },
  'e passou a se chamar "Cliente", que e a coluna que ele de fato edita':
    s => { const m = /<label[^>]*>([^<]*)<\/label>\s*(?:<!--[\s\S]*?-->\s*)?<input id="ef-cp-favorecido"/.exec(s);
      return !!m && m[1].trim() === 'Cliente'; },
  'o subtitulo do modal de EDICAO identifica a linha pelo favorecido (reg.observacao)':
    s => /ef-cp-subtitulo'\)\.textContent\s*=[\s\S]{0,600}?\$\{reg\.observacao/.test(s),
  'o resumo do modal de EXCLUSAO identifica a linha pelo favorecido (reg.observacao)':
    s => /\$\{reg\.observacao[\s\S]{0,200}?fmtBRL\.format/.test(extrairFn(s, '_cpAbrirConfirmarExclusao')),
  'o log de aprovacao da exclusao tambem nomeia o favorecido':
    s => /Exclusão: \$\{reg\?\.observacao/.test(s),
};
function rodarPredicados(titulo, preds) {
  bloco(titulo);
  for (const [txt, fn] of Object.entries(preds)) {
    let r = false; try { r = !!fn(DEPOIS); } catch (_) { r = false; }
    ok(r, txt);
  }
  // O MESMO predicado contra as versoes com defeito: tem que reprovar.
  console.log(`  -- o mesmo predicado contra as versoes COM o defeito (tem que FALHAR la):`);
  for (const ref of ['ecb83a3', '3177800']) {
    const src = fonteDaRef(ref);
    const passaram = Object.entries(preds).filter(([, fn]) => { try { return !!fn(src); } catch (_) { return false; } });
    console.log(`     ${ref}: ${passaram.length}/${Object.keys(preds).length} predicados passam`);
    ok(passaram.length === 0,
      `nenhum predicado novo passa em ${ref} (se passasse, nao estaria testando a correcao). Passaram: ${passaram.map(p => p[0]).join(' / ') || 'nenhum'}`);
  }
}

rodarPredicados('5b. EXPORTACAO XLSX: a planilha fala o vocabulario da tela?', PRED_EXPORT);
{
  const e = lerExport(DEPOIS);
  console.log(`  header (${e.header.length}): ${e.header.join(' | ')}`);
  console.log(`  'Cliente'    <- ${e.chave('Cliente')}`);
  console.log(`  'Favorecido' <- ${e.chave('Favorecido')}`);
  console.log(`  !cols: ${e.nCols} larguras para ${e.header.length} colunas`);
  ok(e.nCols === e.header.length,
    `'!cols' tem uma largura por coluna (${e.nCols} x ${e.header.length}); sobrando ou faltando, as larguras deslizam de coluna`);
  const chavesObj = [...(/linhas\[i\] = \{([\s\S]*?)\n\s*\};/.exec(DEPOIS) || [, ''])[1].matchAll(/^\s*'([^']+)':/gm)].map(m => m[1]);
  console.log(`  chaves do objeto de linha (${chavesObj.length}): ${chavesObj.join(' | ')}`);
  const faltam = e.header.filter(h => !chavesObj.includes(h));
  const sobram = chavesObj.filter(k => !e.header.includes(k));
  ok(faltam.length === 0 && sobram.length === 0,
    `header e objeto de linha batem exatamente (sem header: ${sobram.join(', ') || 'nenhuma'}; sem dado: ${faltam.join(', ') || 'nenhuma'})`);
  const ordemIgual = e.header.join('>') === chavesObj.join('>');
  ok(ordemIgual, `header e objeto na MESMA ordem (se divergissem, a planilha sairia com dado sob o rotulo errado)`);
  // Comentario obsoleto: o bloco de cabecalho do export ainda descreve o mundo antigo.
  const comentarioVelho = /Fornecedor\/Favorecido real é `r\.entidade`/.test(DEPOIS);
  ok(!comentarioVelho,
    `o comentario-guia do bloco de exportacao foi atualizado junto com o codigo`);
  if (comentarioVelho) {
    gap('BAIXO', 'Comentario obsoleto sobrou no topo do bloco de exportacao',
      `Em gerenciador_contas_pagar_desktop/code.html:6381 o guia ainda afirma "Fornecedor/Favorecido real e r.entidade ` +
      `(vide linha do renderTabela)". Isso deixou de ser verdade nesta OS, e o comentario novo logo abaixo diz o ` +
      `contrario. Dois comentarios vizinhos se contradizendo e como a proxima frente aprende a coisa errada. Nao ` +
      `muda comportamento; e divida de documentacao.`);
  }
}

rodarPredicados('5c. MODAIS de edicao e exclusao: o rotulo diz a verdade?', PRED_MODAL);
{
  const abrirEdit = extrairFn(DEPOIS, '_cpAbrirEditarFatura');
  const gravaEntidade = /entidade:\s*favorecido/.test(DEPOIS);
  const hidrataEntidade = /getElementById\('ef-cp-favorecido'\)\.value\s*=\s*reg\.entidade/.test(abrirEdit);
  console.log(`  #ef-cp-favorecido: hidrata de reg.entidade? ${hidrataEntidade} | grava em entidade? ${gravaEntidade}`);
  ok(hidrataEntidade && gravaEntidade,
    `o COMPORTAMENTO do campo nao mudou (le e grava 'entidade'), so o rotulo, que era o combinado`);
  // PRESERVACAO (nao entra no grupo "tem que falhar no antigo", porque ja era
  // verdade la): o Cliente continua no resumo da exclusao, dando contexto.
  ok(/reg\.entidade/.test(extrairFn(DEPOIS, '_cpAbrirConfirmarExclusao')),
    `(preserva) o resumo da exclusao continua mostrando o Cliente ao lado do Favorecido`);
  const idAindaFavorecido = /id="ef-cp-favorecido"/.test(DEPOIS);
  ok(idAindaFavorecido, `(diagnostico) o id do elemento continua 'ef-cp-favorecido', agora divergente do rotulo`);
  gap('BAIXO', 'Divida nominal: o id `ef-cp-favorecido` virou mentira depois do rename do rotulo',
    `O rotulo virou "Cliente" e o comportamento e o certo, mas o id, a variavel local (\`const favorecido = ...\`) e ` +
    `o placeholder de ajuda continuam falando "favorecido". Nao quebra nada hoje; e o mesmo tipo de armadilha que ` +
    `gerou o BLOQUEIO 3 (nome que nao descreve o que a coisa faz). Renomear id + variavel e mecanico e cabe na ` +
    `frente que for editar o Favorecido de verdade.`);
  // O favorecido (observacao) NAO ficou editavel, e isso e escopo, nao defeito.
  ok(!/id="ef-cp-observacao"/.test(DEPOIS),
    `(escopo) nenhum campo novo de edicao de Favorecido foi criado, como o coordenador declarou`);
}

bloco('5c-bis. Dado pessoal no resumo da solicitacao de aprovacao');
{
  const mResumo = /_criarSolicitacaoAprovacao\('DELETE'[\s\S]{0,400}?`([^`]*)`/.exec(DEPOIS);
  console.log(`  resumo gravado em CP_SolicitacoesAprovacao: ${mResumo ? mResumo[1] : '(nao achei)'}`);
  const dadosAntigos = /dadosAntigos\s*=\s*reg\s*\?\s*\{([\s\S]*?)\}\s*:/.exec(DEPOIS);
  const temObsNosDados = dadosAntigos ? /observacao/.test(dadosAntigos[1]) : false;
  console.log(`  'observacao' tambem vai em dados_antigos? ${temObsNosDados}`);
  ok(!/console\.(log|warn|error)\([^)]*observacao/.test(DEPOIS),
    `'observacao' (nome de pessoa) nao e escrito em console.log/warn/error`);
  gap('BAIXO', 'Nome de pessoa passou a aparecer no `resumo` da solicitacao de aprovacao',
    `O resumo do DELETE, que antes era "Exclusão: <empresa> · <despesa>", agora e "Exclusão: <nome do funcionario> ` +
    `(cliente: <empresa>) · <despesa>" e vai gravado em CP_SolicitacoesAprovacao, lido pela tela de Aprovacoes. ` +
    `A mudanca e CERTA para o operador identificar o que aprova, e o nome ja aparece na tabela para o mesmo publico, ` +
    `entao nao vejo violacao. Mas e uma colecao NOVA recebendo nome de pessoa, e a Parte A manda o agente 'seguranca' ` +
    `olhar dado pessoal. Registro para ele carimbar, nao para travar.`);
}

bloco('5d. SESSIONSTORAGE: estado salvo ANTES desta mudanca, restaurado agora');
{
  const chave = /_CP_SS_FILTROS\s*=\s*'([^']+)'/.exec(DEPOIS)[1];
  const chaveAntes = /_CP_SS_FILTROS\s*=\s*'([^']+)'/.exec(ANTES)[1];
  console.log(`  chave do sessionStorage: antes='${chaveAntes}'  depois='${chave}'`);
  ok(chave !== chaveAntes, `a chave do sessionStorage foi bumpada, descartando o estado com o significado velho`);
  ok(/_v3'$/.test(`${chave}'`), `a chave nova e a v3 (era v2)`);
  ok(fonteDaRef('3177800').includes("_CP_SS_FILTROS = 'centrafin_cp_filters_v2'"),
    `e o commit 3177800, que este teste reprovou, ainda estava na v2 (a correcao e desta rodada)`);

  // Cenario real: estado antigo tem favorecido = nome de CLIENTE.
  // Ordem real do app: populador roda primeiro (onDone), restauracao depois.
  envDepois.setClientesBase(CLIENTES_BASE);
  envDepois.popularCliente();
  envDepois.popularChunked('cp-filtro-favorecido', OBS_BASE, 'Todos os Favorecidos');
  for (const sid of Object.keys(envDepois.selects)) envDepois.marcar(sid, ['Todos']);
  envDepois.marcar('cp-filtro-favorecido', [chaveCli]); // valor velho, do estado v2
  const marcadoAgora = envDepois.lerMarcados('cp-filtro-favorecido');
  const linhasPos = envDepois.filtrar(REGS).length;
  console.log(`  restaurando favorecido=['${chaveCli}'] -> select fica em ${JSON.stringify(marcadoAgora)}`);
  console.log(`  tabela resultante: ${linhasPos} linhas (universo = ${REGS.length})`);
  ok(linhasPos === REGS.length,
    `o estado velho NAO zera a tabela: cai em "Todos" e o operador ve os ${REGS.length} lancamentos`);
  ok(marcadoAgora.length === 1 && marcadoAgora[0] === 'Todos',
    `setMultiValues nao acha a <option> inexistente e cai no fallback "Todos"`);
  if (chave === chaveAntes) {
    gap('MEDIO', 'sessionStorage: a chave nao foi versionada e o recorte do operador some em silencio',
      `O significado dos valores persistidos em 'favorecido' mudou (nome de BLOCO -> nome de LINHA), mas ` +
      `_CP_SS_FILTROS continua '${chave}'. O proprio comentario dessa constante registra o precedente: quando os ` +
      `values mudaram de formato, a chave foi para _v2 justamente porque "setMultiValues nao acharia a option e ` +
      `cairia no fallback que marca Todos, selecao perdida em silencio". E exatamente o que este teste acabou de ` +
      `medir. NAO zera a tabela (o teste prova isso), mas ALARGA o recorte sem avisar: quem tinha 79 linhas ` +
      `filtradas volta com ${REGS.length}. Risco baixo de dado, alto de confusao. Corrigir = bump para _v3.`);
  }
  // Fantasma: se o populador rodar DEPOIS da restauracao, o valor velho vira
  // "(sem dados)" e continua marcado -> ai sim a tabela zera.
  envDepois.marcar('cp-filtro-favorecido', ['Todos']);
  const selF = envDepois.selects['cp-filtro-favorecido'];
  selF.options.push({ tagName: 'OPTION', value: chaveCli, textContent: chaveCli + ' (sem dados neste período)', selected: false });
  envDepois.marcar('cp-filtro-favorecido', [chaveCli]);
  const zerou = envDepois.filtrar(REGS).length;
  console.log(`  se o valor velho sobrevive como fantasma: ${zerou} linhas`);
  ok(zerou === 0, `(diagnostico) com o fantasma marcado a tabela vai a ZERO, e o caminho de risco`);
  envDepois.marcar('cp-filtro-favorecido', ['Todos']);
}

bloco('5e. QUEM MAIS ESCREVE/LE `entidade`? (regra fixa de briefing da Parte A)');
{
  // Escritores de `entidade` em /ContasAPagar, dentro da tela viva.
  const escritas = [...DEPOIS.matchAll(/^\s*entidade:\s*([^\n]*)$/gm)].map(m => m[1].trim());
  console.log(`  escritores de 'entidade' no arquivo vivo (${escritas.length}):`);
  for (const e of escritas) console.log(`    ${e}`);
  ok(escritas.length >= 1, `achei os escritores de 'entidade'`);
  const viaEtl = escritas.some(e => /_nomeOficial/.test(e));
  ok(viaEtl, `o ETL grava entidade = l._nomeOficial || l.entidade (nome oficial de /Fornecedores, com o bloco do TXT como fallback)`);
  ok(/entidade_txt:\s*l\.entidade/.test(DEPOIS), `o nome CRU do bloco do TXT continua preservado em 'entidade_txt'`);
  if (viaEtl) {
    gap('BAIXO', 'A coluna Cliente mostra o nome do CADASTRO, nao literalmente o nome do bloco do TXT',
      `O briefing diz que 'entidade' e "o nome do BLOCO do TXT". E o fallback. O valor gravado e ` +
      `l._nomeOficial || l.entidade: quando o codigo_fornecedor casa com /Fornecedores, quem manda e o nome OFICIAL do ` +
      `cadastro (auditoria 2026-05-15); o nome cru do TXT fica em 'entidade_txt'. Duas consequencias praticas: ` +
      `(1) renomear um fornecedor no cadastro muda a coluna Cliente de todos os lancamentos daquele codigo na proxima ` +
      `ingestao, retroativamente; (2) a uniao do catalogo de Cliente com _cpCadFavorecidos (= /Fornecedores.nome) esta ` +
      `CERTA justamente por isso, e a uniao com o mesmo cadastro seria ERRADA no filtro de Favorecido, que a Frente D ` +
      `removeu. Nao e defeito, e vocabulario: vale registrar no diario para a proxima frente nao supor outra coisa.`);
  }
  // Consumidores de `entidade` fora desta tela.
  const outras = execSync('git ls-files "*.html"', { cwd: RAIZ }).toString().trim().split('\n')
    .filter(f => f && !f.includes('gerenciador_contas_pagar_desktop'))
    .filter(f => /\.entidade\b/.test(fs.readFileSync(path.join(RAIZ, f), 'utf8')));
  console.log(`  outros arquivos que leem .entidade: ${outras.join(', ') || 'nenhum'}`);
  const sidebar = fs.readFileSync(path.join(RAIZ, 'sidebar.js'), 'utf8');
  // A pasta so conta como viva se o sidebar tiver o href DELA. Comparar por
  // substring solta daria falso positivo: "contas_a_pagar_desktop" esta dentro de
  // "gerenciador_contas_pagar_desktop".
  const vivos = outras.filter(f => new RegExp(`(^|[^\\w-])${f.split('/')[0]}/code\\.html`).test(sidebar));
  console.log(`  destes, ligados no sidebar (vivos): ${vivos.join(', ') || 'nenhum'}`);
  ok(!vivos.includes('contas_a_pagar_desktop/code.html'),
    `contas_a_pagar_desktop (tela legada que tambem exibe r.entidade) NAO esta no sidebar, nao e consumidor vivo`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. O MODELO NOVO: rolagem lateral com colunas congeladas (commit 6a6c392).
//
// A pergunta "cabe em 1366?" MORREU: a decisao do diretor foi que a tabela nao
// tenta mais caber, ela rola. As perguntas novas sao outras, e cada uma tem um
// jeito de falhar que ninguem ve olhando rapido:
//   6a  a soma das larguras bate com o declarado (1.608px)?
//   6b  os offsets `left-*` sao a soma acumulada, no <th> E no <td>?
//   6c  o bloco congelado sobra espaco util para rolar em 1366?
//   6d  em 1920 preenche sem faixa branca?
//   6e  o congelamento esta completo (contiguo, opaco, z, hover)?
//
// CORRECAO DE UMA CONSTANTE MINHA, e ela inflou os numeros da rodada passada:
// eu usei 256px de sidebar. A sidebar deste app e `w-20` (80px), fixa, e o
// <main> compensa com `ml-20`. O conteudo vive num `<div class="p-8">` (32px de
// cada lado). Entao a area util e viewport - 80 - 64 - ~15 de barra vertical, e
// nao viewport - 256 - 64. Os deficits que eu reportei estavam ~176px
// pessimistas. A conclusao qualitativa (o aperto era pre-existente) NAO muda; a
// magnitude muda, e a magnitude era minha.
// ═══════════════════════════════════════════════════════════════════════════
const SIDEBAR_PX = 80;   // <aside class="... w-20">, e <main class="ml-20">
const PAD_PX = 64;       // <div class="p-8"> = 32px de cada lado
const SCROLLV_PX = 15;   // barra de rolagem vertical
const utilDe = vp => vp - SIDEBAR_PX - PAD_PX - SCROLLV_PX;
{
  const sb = fs.readFileSync(path.join(RAIZ, 'sidebar.js'), 'utf8');
  ok(/w-20\b/.test(sb), `a sidebar e mesmo w-20 (80px), nao w-64: constante conferida na fonte, nao na memoria`);
  ok(/<main class="ml-20/.test(DEPOIS), `o <main> compensa com ml-20, entao a area util comeca em 80px`);
  ok(/<div class="p-8/.test(DEPOIS), `o conteudo vive num p-8 (32px de cada lado)`);
}

bloco('6a. A soma das larguras declaradas bate com o modelo (1.608px)');
const LARGURAS = THS.map((t, i) => ({
  rot: t.rotulo || '(checkbox)',
  th: t.w, td: LINHA.det[i].w,
  px: t.w && t.w !== 'max' && t.w !== 'full' && t.w !== 'auto' ? TW_PX(t.w) : null,
}));
const SOMA = LARGURAS.reduce((a, b) => a + (b.px || 0), 0);
{
  console.log(`  coluna                largura(th)  largura(td)   px`);
  for (const l of LARGURAS) {
    console.log(`    ${String(l.rot).padEnd(20)} ${String('w-' + l.th).padEnd(12)} ${String(l.td ? 'w-' + l.td : '(sem)').padEnd(12)} ${l.px != null ? l.px + 'px' : '-'}`);
  }
  console.log(`  SOMA = ${SOMA}px`);
  ok(LARGURAS.every(l => l.px != null),
    `TODA coluna declara largura fixa (no modelo de rolagem, coluna sem largura volta a ser elastica e desmonta o calculo)`);
  ok(SOMA === 1608, `a soma das 12 colunas e 1.608px, o declarado (achei ${SOMA}px)`);
  const divergentes = LARGURAS.filter(l => l.th !== l.td);
  console.log(`  th x td divergentes: ${divergentes.map(d => `${d.rot} (th w-${d.th} vs td w-${d.td})`).join(', ') || 'nenhuma'}`);
  ok(divergentes.length === 0,
    `a largura do <th> e a do <td> sao IGUAIS em todas as colunas; se divergissem, o cabecalho sairia do lugar da coluna`);
  // O bloco de larguras do briefing, conferido item a item.
  const DECLARADO = [40, 128, 256, 224, 96, 96, 224, 128, 96, 128, 112, 80];
  const batem = LARGURAS.every((l, i) => l.px === DECLARADO[i]);
  ok(batem, `cada largura bate com o que o coordenador declarou: ${DECLARADO.join(', ')}`);
}

bloco('6b. Os offsets `left-*` sao a soma acumulada, no <th> E no <td>');
{
  const congTh = THS.map((t, i) => ({ i, rot: t.rotulo || '(checkbox)', ...t })).filter(t => t.sticky);
  const congTd = LINHA.det.map((d, i) => ({ i, rot: THS[i].rotulo || '(checkbox)', ...d })).filter(d => d.sticky);
  console.log(`  congeladas no <th>: ${congTh.map(c => `${c.rot}@${c.leftBruto}`).join(' | ')}`);
  console.log(`  congeladas no <td>: ${congTd.map(c => `${c.rot}@${c.leftBruto}`).join(' | ')}`);
  ok(congTh.length === 4 && congTd.length === 4, `sao 4 colunas congeladas de cada lado (th=${congTh.length}, td=${congTd.length})`);
  ok(congTh.map(c => c.i).join(',') === congTd.map(c => c.i).join(','),
    `as MESMAS posicoes estao congeladas no cabecalho e no corpo`);
  // Contiguidade: tem que ser 0,1,2,3. Sticky separada por coluna que rola quebra.
  ok(congTh.map(c => c.i).join(',') === '0,1,2,3',
    `o bloco congelado e CONTIGUO e comeca na primeira coluna (posicoes ${congTh.map(c => c.i).join(',')})`);
  // O teste que o coordenador pediu: offset == soma acumulada das anteriores.
  let acumulado = 0;
  for (let k = 0; k < congTh.length; k++) {
    const esperado = acumulado;
    const th = congTh[k], td = congTd[k];
    console.log(`    ${String(th.rot).padEnd(20)} esperado left=${esperado}px | th=${th.left}px | td=${td.left}px`);
    ok(th.left === esperado, `<th> ${th.rot}: left=${th.left}px e a soma acumulada (${esperado}px)`);
    ok(td.left === esperado, `<td> ${th.rot}: left=${td.left}px espelha o <th> (${esperado}px)`);
    acumulado += LARGURAS[th.i].px;
  }
  console.log(`  bloco congelado = ${acumulado}px`);
  ok(acumulado === 648, `o bloco congelado soma 648px, o declarado (achei ${acumulado}px)`);
  // Um erro de 1px aqui desalinha em silencio: vale dizer o que aconteceria.
  ok(THS.slice(4).every(t => !t.sticky) && LINHA.det.slice(4).every(d => !d.sticky),
    `nenhuma coluna depois da 4a ficou sticky por engano (isso a faria flutuar sobre as que rolam)`);
}

bloco('6c. Em 1366px: quanto sobra para rolar depois do bloco congelado');
{
  const util = utilDe(1366);
  const congelado = 648;
  const janela = util - congelado;          // area em que o conteudo rola
  const rolante = SOMA - congelado;         // conteudo que precisa rolar
  const pctCongelado = Math.round((congelado / util) * 100);
  console.log(`  util ~${util}px | congelado ${congelado}px (${pctCongelado}% da area) | janela de rolagem ${janela}px | conteudo rolante ${rolante}px`);
  console.log(`  o operador ve ${janela}px de ${rolante}px por vez, ou seja ${Math.round((janela / rolante) * 100)}% das colunas que rolam`);
  ok(pctCongelado <= 60,
    `o bloco congelado ocupa ${pctCongelado}% da area util em 1366px, dentro do teto de 60% (acima disso sobra pouca janela para rolar)`);
  ok(janela >= 400,
    `sobram ${janela}px de janela de rolagem em 1366px, o bastante para ver 2 ou 3 colunas por vez (piso de 400px)`);
  // Qual coluna rolante NAO cabe inteira na janela? Nenhuma pode ser maior que a janela.
  const maiorRolante = Math.max(...LARGURAS.slice(4).map(l => l.px));
  ok(maiorRolante <= janela,
    `a maior coluna rolante (${maiorRolante}px) cabe inteira na janela de ${janela}px, entao nenhuma fica impossivel de ler`);
  ok(SOMA > util, `(modelo) em 1366px a tabela realmente ROLA (${SOMA}px de conteudo para ${util}px de area), que e o desenho aprovado`);
}

bloco('6d. Em 1920px: preenche sem faixa branca?');
{
  const util = utilDe(1920);
  console.log(`  util ~${util}px | tabela ${SOMA}px | ${SOMA >= util ? `ainda rola ${SOMA - util}px` : `sobra ${util - SOMA}px, esticados por min-w-full`}`);
  ok(/class="w-max min-w-full/.test(DEPOIS),
    `a tabela usa 'w-max min-w-full': w-max deixa crescer ate o conteudo, min-w-full impede faixa branca em tela larga`);
  // Especifico da tabela PRINCIPAL: o arquivo tem outras <table class="w-full">
  // em modais de importacao, que nao sao alvo desta OS.
  const iTabPrinc = DEPOIS.lastIndexOf('<table', DEPOIS.indexOf('id="cp-corpo"'));
  const tagTabPrinc = DEPOIS.slice(iTabPrinc, DEPOIS.indexOf('>', iTabPrinc) + 1);
  console.log(`  <table> principal: ${tagTabPrinc}`);
  ok(!/class="w-full/.test(tagTabPrinc),
    `a tabela PRINCIPAL nao usa mais 'w-full' (era ele que fazia o navegador ignorar as larguras declaradas)`);
  ok(/class="w-full/.test(fonteDaRef('59cb899').slice(
    fonteDaRef('59cb899').lastIndexOf('<table', fonteDaRef('59cb899').indexOf('id="cp-corpo"')),
    fonteDaRef('59cb899').indexOf('>', fonteDaRef('59cb899').lastIndexOf('<table', fonteDaRef('59cb899').indexOf('id="cp-corpo"'))) + 1)),
    `(controle) em 59cb899 ela ERA w-full, entao a troca e real e esta sendo medida`);
  const mScroll = /<div class="([^"]*overflow-x-auto[^"]*)">\s*(?:<!--[\s\S]*?-->\s*)?<table/.exec(DEPOIS);
  ok(!!mScroll, `a tabela esta dentro de um container com overflow-x-auto (a rolagem fica no container, nao na pagina)`);
  // Faixa branca: min-w-full garante >= 100%; o excedente e distribuido.
  ok(SOMA < util,
    `em 1920px a tabela (${SOMA}px) e MENOR que a area util (${util}px), entao min-w-full a estica e nao sobra faixa branca`);
  const folga = util - SOMA;
  if (folga > 0 && folga < 60) {
    gap('BAIXO', `Folga de so ${folga}px em 1920px: a rolagem quase aparece`,
      `Com a soma em ${SOMA}px e a area util em ~${util}px (viewport 1920 - sidebar ${SIDEBAR_PX} - padding ${PAD_PX} - barra ${SCROLLV_PX}), ` +
      `a tabela cabe por ${folga}px. E pouco: qualquer zoom de browser em 110%, uma barra de rolagem mais grossa, ou uma coluna ` +
      `que ganhe 1 rem no futuro fazem a barra horizontal aparecer tambem em 1920. Nao e defeito hoje, e margem curta. ` +
      `Se incomodar, os 80px de "Ações" sao o corte mais barato.`);
  }
}

bloco('6e. O congelamento esta completo: opaco, hover, z-index, borda');
{
  const congTd = LINHA.det.filter(d => d.sticky);
  const congTh = THS.filter(t => t.sticky);
  console.log(`  <td> congelados: bg=${congTd.map(d => d.bg).join(',')} | group-hover=${congTd.map(d => d.hoverBg).join(',')} | z=${congTd.map(d => d.z).join(',')}`);
  console.log(`  <th> congelados: bg=${congTh.map(t => t.bg).join(',')} | z=${congTh.map(t => t.z).join(',')}`);
  ok(congTd.every(d => d.bg && d.bg !== 'transparent'),
    `toda celula congelada tem fundo OPACO (sem isso o conteudo que rola aparece por baixo)`);
  ok(congTh.every(t => t.bg && t.bg !== 'transparent'),
    `todo cabecalho congelado tem fundo opaco`);
  ok(congTd.every(d => d.hoverBg),
    `toda celula congelada tem group-hover:bg-*, devolvendo o realce de linha que o fundo opaco mataria`);
  ok(/<tr class="group\b/.test(LINHA.trecho) || /(?:^|\s)group(?:\s|")/.test(LINHA.trAttrs),
    `o <tr> tem a classe 'group', sem a qual o group-hover das congeladas nunca dispara`);
  const hoverTr = /hover:bg-(slate-50)/.test(LINHA.trAttrs);
  const hoverIgual = congTd.every(d => d.hoverBg === 'slate-50');
  ok(hoverTr && hoverIgual,
    `o realce do <tr> e o das congeladas usam a MESMA cor (slate-50), senao a linha ficaria bicolor ao passar o mouse`);
  // Borda separando o bloco congelado do que rola.
  const ultimaCong = LINHA.det[3];
  ok(/border-r/.test(ultimaCong.attrs) && /border-r/.test(THS[3].attrs),
    `a ultima coluna congelada tem borda a direita no <th> e no <td>, marcando onde a rolagem comeca`);
  // Z-index: cabecalho congelado tem que vencer a celula congelada.
  const zTh = Number(congTh[0].z), zTd = Number(congTd[0].z);
  console.log(`  z-index: <th> congelado=${zTh}, <td> congelado=${zTd}`);
  ok(zTh > zTd, `o cabecalho congelado (z-${zTh}) fica acima da celula congelada (z-${zTd})`);
}

bloco('6f. z-index: dropdown, painel do checkbox_multi e modais passam por cima?');
{
  const cbm = fs.readFileSync(path.join(RAIZ, 'assets', 'checkbox_multi.js'), 'utf8');
  const zPortal = [...cbm.matchAll(/z-\[(\d+)\]/g)].map(m => Number(m[1]));
  const zInline = [...cbm.matchAll(/(?:^|\s)z-(\d+)\b/g)].map(m => Number(m[1]));
  const zModais = [...DEPOIS.matchAll(/fixed inset-0 z-\[(\d+)\]/g)].map(m => Number(m[1]));
  const zSticky = Math.max(...THS.filter(t => t.sticky).map(t => Number(t.z)),
    ...LINHA.det.filter(d => d.sticky).map(d => Number(d.z)));
  console.log(`  maior z das congeladas : ${zSticky}`);
  console.log(`  painel checkbox_multi  : portal z-[${Math.max(...zPortal)}], fallback inline z-${Math.max(...zInline)}`);
  console.log(`  modais (fixed inset-0) : z-[${zModais.join('], z-[')}]`);
  console.log(`  sidebar                : z-50 (fixed)`);
  ok(Math.max(...zPortal) > zSticky,
    `o painel do checkbox_multi em modo portal (z-${Math.max(...zPortal)}) passa por cima das congeladas (z-${zSticky})`);
  ok(zModais.every(z => z > zSticky),
    `TODOS os modais (menor = z-${Math.min(...zModais)}) passam por cima das congeladas (z-${zSticky})`);
  ok(/data-cb-portal/.test(DEPOIS),
    `os filtros desta tela usam 'data-cb-portal', ou seja o painel sai para o body com z-[200] e nao fica preso no container da tabela`);
  // O ponto de risco real: quem NAO e portal usa z-50 ABSOLUTO dentro do proprio
  // container. Se algum select da tabela fosse assim, o painel ficaria sob o
  // overflow-x-auto. Nenhum select vive dentro da tabela, mas vale provar.
  const selectsNaTabela = /<t[hd][^>]*>[\s\S]{0,400}?<select/.test(LINHA.trecho);
  ok(!selectsNaTabela,
    `nenhum <select> vive dentro das celulas da tabela, entao nao ha painel de dropdown preso sob o container de rolagem`);
  ok(zSticky < 50,
    `as congeladas (z-${zSticky}) ficam abaixo da sidebar (z-50), que a sobrepoe ao expandir no hover, como deve ser`);
}

bloco('6g. border-collapse com celula congelada: a borda some?');
{
  // Escopo na tabela PRINCIPAL: o arquivo tem outras <table> nos modais de
  // importacao, e uma delas usa o outro modelo. Medir no arquivo inteiro daria
  // "os dois ao mesmo tempo", que e diagnostico falso.
  const iT = DEPOIS.lastIndexOf('<table', DEPOIS.indexOf('id="cp-corpo"'));
  const tagT = DEPOIS.slice(iT, DEPOIS.indexOf('>', iT) + 1);
  const usaCollapse = /border-collapse/.test(tagT);
  const usaSeparate = /border-separate/.test(tagT);
  const divideNoTbody = /<tbody[^>]*class="[^"]*divide-y/.test(DEPOIS);
  console.log(`  tabela: border-collapse=${usaCollapse} border-separate=${usaSeparate} | divide-y no tbody=${divideNoTbody}`);
  ok(usaCollapse !== usaSeparate, `a tabela declara UM dos dois modelos de borda, nao os dois nem nenhum`);
  ok(divideNoTbody,
    `(diagnostico) as divisorias de linha vem de 'divide-y' no <tbody>, ou seja border-top no proprio <tr>`);
  if (usaCollapse && divideNoTbody) {
    gap('BAIXO', 'border-collapse + sticky: risco real de borda, mas trocar para border-separate CUSTA as divisorias de linha',
      `Resposta a pergunta do coordenador, com o custo. (1) O risco existe: no modelo COLLAPSE as bordas sao compartilhadas ` +
      `entre celulas vizinhas e pertencem a "grade" da tabela, nao a celula. Uma celula sticky e pintada fora do fluxo, e o ` +
      `Chrome tem historico de nao repintar a borda compartilhada dela ao rolar, entao o 'border-r' que separa o bloco ` +
      `congelado pode piscar ou sumir durante a rolagem. (2) MAS a troca nao e gratuita: no modelo SEPARATE o CSS NAO PINTA ` +
      `borda aplicada em <tr> nem em <tbody>, e e exatamente ai que este arquivo poe as divisorias ('divide-y divide-slate-50' ` +
      `gera border-top no <tr>). Trocar para border-separate faria TODAS as linhas da tabela perderem a divisoria de uma vez, ` +
      `um estrago visual muito maior que o risco que se quer evitar. (3) Se for trocar, tem que vir junto: ` +
      `'border-separate border-spacing-0' na <table> E mover a divisoria para as celulas (algo como ` +
      `'[&_tbody_td]:border-b [&_tbody_td]:border-slate-50'), senao a tela fica sem linha nenhuma. (4) RECOMENDACAO: NAO trocar ` +
      `agora. Manter collapse, e o diretor confere na validacao visual se a borda do bloco congelado se mantem ao rolar em 1366. ` +
      `Se sumir, ai a troca vale o custo e ja esta mapeada aqui.`);
  }
}

bloco('6h. Selecao em massa: o checkbox congelado ainda marca a linha certa?');
{
  const tdCheck = LINHA.det[0];
  ok(tdCheck.sticky && tdCheck.left === 0, `o checkbox da linha e a coluna congelada mais a esquerda (left-0)`);
  ok(/data-id="\$\{idAttr\}"/.test(tdCheck.html),
    `o checkbox continua carregando data-id="\${idAttr}", que e o que o handler le para saber a linha`);
  ok(/class="cp-row-checkbox/.test(tdCheck.html), `e continua com a classe cp-row-checkbox, usada pelo seletor do handler`);
  // A prova de que nada mudou no JS da selecao.
  const alvos = ['_cpAtualizarUIBulk', '_cpToggleSelecao'].filter(n => temFn(DEPOIS, n));
  for (const n of alvos) {
    ok(extrairFn(fonteDaRef('59cb899'), n) === extrairFn(DEPOIS, n),
      `${n} esta byte-a-byte identica a antes do congelamento`);
  }
  ok(/\.cp-row-checkbox/.test(DEPOIS) && !/querySelector\((['"])[^'"]*nth-child/.test(DEPOIS),
    `a selecao casa por CLASSE e data-id, nunca por posicao de coluna (nth-child), entao reordenar coluna nao a afeta`);
  ok(/id="cp-selecionar-todos"/.test(DEPOIS) && THS[0].sticky,
    `o checkbox mestre do cabecalho tambem ficou congelado, junto com a coluna dele`);
}
// ═══ 7. NADA DE CALCULO MUDOU ═══
bloco('7. KPIs e cards: esta OS nao podia tocar calculo');
{
  const alvos = ['atualizarKPIs', '_cpEhTarifaOuComissao', '_cpCardNaturezaAtivoKey'];
  for (const nome of alvos) {
    if (!temFn(ANTES, nome) || !temFn(DEPOIS, nome)) { ok(false, `funcao ${nome} sumiu de uma das versoes`); continue; }
    const a = extrairFn(ANTES, nome).replace(/\s+/g, ' ');
    const d = extrairFn(DEPOIS, nome).replace(/\s+/g, ' ');
    ok(a === d, `${nome} byte-a-byte identica a ${BASE_REF}`);
  }
  const aCards = extrairConst(ANTES, '_CARDS_NATUREZA').replace(/\s+/g, ' ');
  const dCards = extrairConst(DEPOIS, '_CARDS_NATUREZA').replace(/\s+/g, ' ');
  ok(aCards === dCards, `_CARDS_NATUREZA inalterada`);
  const aKpi = extrairConst(ANTES, '_KPI_FILTRO_MAP').replace(/\s+/g, ' ');
  const dKpi = extrairConst(DEPOIS, '_KPI_FILTRO_MAP').replace(/\s+/g, ' ');
  ok(aKpi === dKpi, `_KPI_FILTRO_MAP inalterado`);
}

bloco('7a-bis. 6a6c392 mexeu SO em marcacao: a logica e byte-a-byte igual a 59cb899');
{
  // A afirmacao do coordenador e "so mexi em marcacao e classes". Isso e
  // verificavel: toda funcao de LOGICA tem que sair identica ao commit anterior.
  const PRE = fonteDaRef('59cb899');
  const LOGICA = [
    'aplicarFiltrosCP', 'obterValorSortCP', 'atualizarKPIs', 'cpParsearTXT',
    '_cpEmpresaDeReg', '_cpGrupoDeReg', '_cpResponsavelDoReg', '_cpResolverEmpresaDoReg',
    '_cpChaveFiltro', '_cpUniaoOpcoes', '_popularSelectMultiChunked', '_cpPopularFiltroCliente',
    '_cpSalvarEstadoFiltros', '_cpRestaurarEstadoFiltros', 'limparTodosFiltros',
    'statusVisual', '_cpEhTarifaOuComissao', '_cpIngerir', 'getMultiValues', 'setMultiValues',
    'isMultiAll', '_cpNormalizarBusca', 'cpResolverCompetenciaRef',
  ].filter(n => temFn(PRE, n) && temFn(DEPOIS, n));
  let diferentes = [];
  for (const n of LOGICA) if (extrairFn(PRE, n) !== extrairFn(DEPOIS, n)) diferentes.push(n);
  console.log(`  ${LOGICA.length} funcoes de logica comparadas com 59cb899`);
  console.log(`  diferentes: ${diferentes.join(', ') || 'nenhuma'}`);
  ok(diferentes.length === 0,
    `TODAS as ${LOGICA.length} funcoes de logica estao byte-a-byte identicas a 59cb899 (mudou so marcacao, como declarado)`);
  // A funcao que MUDOU tem que ser so a que monta o HTML da linha.
  const renderMudou = temFn(PRE, 'renderTabela') && extrairFn(PRE, 'renderTabela') !== extrairFn(DEPOIS, 'renderTabela');
  ok(renderMudou, `(controle) renderTabela MUDOU, senao este teste estaria comparando duas versoes iguais e passando de graca`);
  // E dentro dela, as EXPRESSOES de dado tem que ser as mesmas: so as classes mudaram.
  // CONJUNTO, nao multiconjunto: envolver uma celula num <span title="..."> repete
  // a mesma expressao duas vezes (uma no title, outra no corpo). Isso muda a
  // CONTAGEM sem mudar QUAL dado e lido, que e o que importa aqui.
  const expr = s => [...new Set(lerLinhaTd(s).trecho.match(/r\.[a-z_]+|_cp[A-Za-z]+\(r\)|fmtBRL\.format|fmtDataBR/g) || [])].sort();
  const eA = expr(PRE), eD = expr(DEPOIS);
  const soAntes = eA.filter(x => !eD.includes(x)), soDepois = eD.filter(x => !eA.includes(x));
  console.log(`  campos lidos na linha: ${eD.length} | so em 59cb899: ${soAntes.join(', ') || 'nenhum'} | so agora: ${soDepois.join(', ') || 'nenhum'}`);
  ok(soAntes.length === 0 && soDepois.length === 0,
    `dentro de renderTabela, o CONJUNTO de campos lidos do registro e o mesmo: nenhum campo entrou nem saiu`);
  // E o que aumentou de repeticao tem que ser so title/tooltip, nao logica nova.
  const repet = s => (lerLinhaTd(s).trecho.match(/title="/g) || []).length;
  console.log(`  atributos title= na linha: 59cb899=${repet(PRE)} -> agora=${repet(DEPOIS)} (tooltips das colunas truncadas)`);
  ok(repet(DEPOIS) >= repet(PRE),
    `o que cresceu foi o numero de tooltips (title=), coerente com mais colunas truncadas`);
  ok(extrairFn(PRE, 'obterValorSortCP') === extrairFn(DEPOIS, 'obterValorSortCP'),
    `reordenar colunas NAO mexeu no mapa de ordenacao (as chaves nunca dependeram da posicao)`);
  // Rules, ETL e exportacao.
  const mudados = execSync(`git diff --name-only 59cb899 HEAD`, { cwd: RAIZ }).toString().trim().split('\n').filter(Boolean);
  console.log(`  arquivos alterados por 6a6c392: ${mudados.join(', ')}`);
  ok(!mudados.includes('firestore.rules'), `firestore.rules segue intocado (sem rodada de emulador)`);
  const e1 = lerExport(fonteDaRef('59cb899')), e2 = lerExport(DEPOIS);
  ok(e1.header.join('>') === e2.header.join('>'),
    `a exportacao NAO foi mexida de novo: o header continua ${e2.header.length} colunas na mesma ordem`);
}

bloco('7b. ETL e rules intocados nesta frente');
{
  const mudados = execSync(`git diff --name-only ${BASE_REF} HEAD`, { cwd: RAIZ }).toString().trim().split('\n').filter(Boolean);
  console.log(`  arquivos mudados: ${mudados.join(', ')}`);
  ok(!mudados.includes('firestore.rules'), `firestore.rules NAO mudou (nao exige rodada de emulador)`);
  const aEtl = extrairFn(ANTES, 'cpParsearTXT' ) === extrairFn(DEPOIS, 'cpParsearTXT');
  ok(aEtl, `o parser do TXT esta byte-a-byte identico (a descoberta da OS era que o ETL ja capturava o bloco)`);
}

// ═══ 8. CONVENCOES DE TEXTO ═══
bloco('8. Convencoes da Parte A nos textos novos');
{
  const novos = execSync(`git diff ${BASE_REF} HEAD -- gerenciador_contas_pagar_desktop/code.html`, { cwd: RAIZ, maxBuffer: 1 << 27 })
    .toString('utf8').split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
  const comTravessao = novos.filter(l => l.includes('—') && !/^\+\s*(\/\/|\*|<!--)/.test(l));
  ok(comTravessao.length === 0, `nenhum travessao (U+2014) em texto de UI novo (${comTravessao.length} linha(s))`);
  // REESCRITAS: antes eram `THS[1]` e `THS[4]`, indice fixo. Quando a ordem mudou
  // em 6a6c392, as duas acusaram defeito que nao existia. Agora a regra e
  // avaliada em TODOS os titulos, sem depender de posicao nenhuma.
  const MINUSCULAS = new Set(['de', 'da', 'do', 'e', 'a', 'o', 'em', 'para', 'com']);
  const titulos = THS.map(t => t.rotulo).filter(Boolean);
  console.log(`  titulos avaliados (${titulos.length}): ${JSON.stringify(titulos)}`);
  const foraDoPadrao = titulos.filter(t => t.split(' ').some((p, i) => {
    if (p.length <= 1) return false;
    if (i > 0 && MINUSCULAS.has(p.toLowerCase())) return false;   // "Grupo de Contas"
    if (p === p.toUpperCase()) return false;                       // sigla: "CC"
    return p[0] !== p[0].toLocaleUpperCase('pt-BR');
  }));
  ok(foraDoPadrao.length === 0,
    `todos os ${titulos.length} titulos de coluna em Title Case (fora do padrao: ${foraDoPadrao.join(', ') || 'nenhum'})`);
  ok(/não informado/.test(col('Cliente').td.html),
    `celula vazia de Cliente usa "não informado", nao glifo`);
  // "Valor" nao usa o marcador de propriedade: valor ausente vira R$ 0,00 pelo
  // fmtBRL, e sempre foi assim. Comparo com a versao anterior em vez de exigir um
  // absoluto, para nao acusar como defeito desta OS um comportamento herdado.
  const semMarcador = s => {
    const L = lerLinhaTd(s), T = lerThead(s);
    return T.map((t, i) => ({ rot: t.rotulo, td: L.det[i] }))
      .filter(x => x.rot && x.rot !== 'Ações' && !/não informado|_cpResponsavelDoReg/.test(x.td.html))
      .map(x => x.rot);
  };
  const antesSem = semMarcador(fonteDaRef('59cb899')), agoraSem = semMarcador(DEPOIS);
  console.log(`  colunas sem marcador de vazio: 59cb899=[${antesSem}] agora=[${agoraSem}]`);
  ok(agoraSem.every(r => antesSem.includes(r)),
    `nenhuma coluna PERDEU o "não informado" nesta mudanca (as que nao tem, ja nao tinham: ${agoraSem.join(', ') || 'nenhuma'})`);
  ok(!/[—]/.test(semComentario(DEPOIS.slice(DEPOIS.indexOf('<thead'), DEPOIS.indexOf('</thead>')))),
    `nenhum travessao nos titulos de coluna`);
  const placeholders = [...DEPOIS.matchAll(/id="cp-filtro-cliente"[^>]*data-placeholder="([^"]*)"/g)].map(m => m[1]);
  console.log(`  placeholder do filtro Cliente: ${JSON.stringify(placeholders)}`);
  ok(placeholders.length === 1 && placeholders[0] === 'Todos os clientes',
    `o filtro Cliente tem placeholder proprio`);
  ok(/id="cp-filtro-cliente"[^>]*data-checkbox-multi/.test(DEPOIS),
    `o filtro Cliente usa o componente checkbox_multi (nao <select> cru)`);
}

// ─────────────────────────── veredito ───────────────────────────
console.log(`\n${'='.repeat(70)}`);
console.log(`CASOS: ${total}   PASSOU: ${total - falhas}   FALHOU: ${falhas}`);
if (GAPS.length) {
  console.log(`\nGAPS (${GAPS.length}), do mais grave para o menos:`);
  const ordem = { BLOQUEIO: 0, ALTO: 1, MEDIO: 2, BAIXO: 3 };
  GAPS.sort((a, b) => ordem[a.grav] - ordem[b.grav]).forEach((g, i) => {
    console.log(`\n  [${g.grav}] ${i + 1}. ${g.titulo}`);
    console.log(`      ${g.detalhe.replace(/\s+/g, ' ')}`);
  });
}
console.log(`\nVEREDITO: ${falhas === 0 ? 'PASSA' : falhas + ' FALHA(S)'}`);
console.log('='.repeat(70));
process.exit(falhas === 0 ? 0 : 1);
