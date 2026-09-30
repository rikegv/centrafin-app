#!/usr/bin/env node
/**
 * OS-CP-COLUNAS-CLIENTE-01 — PROVA das Frentes B e D. SOMENTE LEITURA.
 *
 * O que se prova, com a funcao REAL `aplicarFiltrosCP` extraida do arquivo:
 *   D1. O filtro de FAVORECIDO passou a casar por `observacao` (o funcionario, que e
 *       o que a coluna Favorecido exibe). Antes casava por `entidade` (o bloco).
 *   D2. O caso DISCRIMINANTE: filtrar Favorecido por um nome de CLIENTE (ex.: MEIWA)
 *       devolvia centenas de linhas ANTES e devolve ZERO agora, porque cliente nao e
 *       favorecido. E o inverso: filtrar Favorecido por um FUNCIONARIO devolvia ZERO
 *       antes e devolve as linhas dele agora.
 *   B1. O filtro de CLIENTE casa por `entidade` e devolve exatamente o que a coluna
 *       Cliente mostra.
 *   B2. Os dois filtros sao INDEPENDENTES e combinaveis (AND).
 *
 * USO: node scripts/prova-filtros-cliente-favorecido.cjs --dados <caminho/dados.json>
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const i = process.argv.indexOf('--dados');
const CAMINHO = i >= 0 ? process.argv[i + 1] : null;
if (!CAMINHO || !fs.existsSync(CAMINHO)) { console.error('ERRO: passe --dados <json>'); process.exit(1); }
const regs = JSON.parse(fs.readFileSync(CAMINHO, 'utf8'));
const REL = path.join(__dirname, '..', 'gerenciador_contas_pagar_desktop', 'code.html');
const DEPOIS = fs.readFileSync(REL, 'utf8');
// "ANTES" = o commit anterior a esta frente. Base FIXA, nunca `HEAD`: base presa a
// HEAD apodrece no primeiro commit da propria frente (aconteceu 3x nesta fabrica).
const BASE = process.env.CP_BASE_REF || 'ecb83a3';
const ANTES = execSync(`git show ${BASE}:gerenciador_contas_pagar_desktop/code.html`,
  { cwd: path.join(__dirname, '..'), maxBuffer: 1 << 27 }).toString('utf8');

function extrair(src, nome) {
  const i2 = src.indexOf(`function ${nome}(`);
  if (i2 < 0) throw new Error(`nao achei ${nome} nesta versao`);
  let j = src.indexOf('{', i2), n = 0, fim = -1;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') n++; else if (src[k] === '}') { n--; if (!n) { fim = k + 1; break; } }
  }
  return src.slice(i2, fim);
}
function extrairConst(src, nome) {
  const marca = `const ${nome} =`;
  const i2 = src.indexOf(marca);
  if (i2 < 0) return '';
  const linhas = src.slice(i2).split('\n'); const out = [];
  for (const l of linhas) { out.push(l); if (/;\s*$/.test(l)) return out.join('\n'); if (out.length > 30) break; }
  return '';
}

// Ambiente minimo: selects falsos expondo `selectedOptions`, que e o que
// `getMultiValues` le de verdade.
function rodar(src, filtros) {
  const selects = {};
  const mk = (id, vals) => {
    const opts = (vals || ['Todos']).map(v => ({ value: v, selected: true }));
    selects[id] = { id, options: opts, selectedOptions: opts };
  };
  for (const id of ['cp-filtro-status', 'cp-filtro-favorecido', 'cp-filtro-cliente',
    'cp-filtro-despesa', 'cp-filtro-empresa', 'cp-filtro-tipo', 'cp-filtro-cc',
    'cp-filtro-classificacao', 'cp-filtro-grupo']) mk(id, ['Todos']);
  for (const [id, vals] of Object.entries(filtros || {})) mk(id, vals);
  const document = { getElementById: (id) => selects[id] || null };

  const temTarifaFonteUnica = src.includes('function _cpEhTarifaOuComissao(');
  const partes = [
    extrair(src, 'hojeISO'), extrair(src, 'statusVisual'),
    extrair(src, 'getMultiValues'), extrair(src, 'isMultiAll'),
    extrair(src, '_cpChaveFiltro'), extrair(src, '_cpNormalizarBusca'),
  ];
  if (src.includes('function _cpMesmoConjunto(')) partes.push(extrair(src, '_cpMesmoConjunto'));
  if (src.includes('const _CARDS_NATUREZA')) partes.push(extrairConst(src, '_CARDS_NATUREZA'));
  if (src.includes('function _cpCardNaturezaAtivoKey(')) partes.push(extrair(src, '_cpCardNaturezaAtivoKey'));
  if (temTarifaFonteUnica) { partes.push(extrairConst(src, '_cpNormTarifa')); partes.push(extrair(src, '_cpEhTarifaOuComissao')); }

  return new Function('document', 'registros', 'CP_LIMIAR_ANO', '_cpPeriodoComitado',
    '_cpTermoBusca', '_cpBlobBusca', '_cpEmpresaDeReg', '_cpGrupoDeReg',
    'MAP_CLASS_FILTRO', '_KPI_FILTRO_MAP',
    partes.filter(Boolean).join('\n') + '\n' + extrair(src, 'aplicarFiltrosCP') +
    '\nreturn aplicarFiltrosCP(registros);'
  )(document, regs, '1900-01-01', { ini: '', fim: '' }, '', new Map(),
    (r) => String(r.empresa || ''), () => ({ grupo: '', conta: '', estado: 'x' }),
    { OPEX: new Set(['Fornecedor Interno', 'Fornecedor Externo']), Cliente: new Set(['Cliente']) },
    { interno: { selId: 'cp-filtro-tipo', valores: ['Fornecedor Interno', 'Fornecedor Interno - PJ'] },
      externo: { selId: 'cp-filtro-tipo', valores: ['Fornecedor Externo'] },
      cliente: { selId: 'cp-filtro-tipo', valores: ['Cliente'] },
      sem_class: { selId: 'cp-filtro-tipo', valores: ['__SEM_TIPO__'] } });
}

const UP = s => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();
let falhas = 0;
const ok = (cond, txt) => { if (!cond) falhas++; console.log(`  ${cond ? 'OK    ' : '*FALHA*'} ${txt}`); };

// Escolhe alvos REAIS da base, sem chutar nome.
const porEnt = new Map();
for (const r of regs) { const e = String(r.entidade || '').trim(); if (e) porEnt.set(e, (porEnt.get(e) || 0) + 1); }
const CLIENTE = [...porEnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
const doCliente = regs.filter(r => UP(r.entidade) === UP(CLIENTE));
const porObs = new Map();
for (const r of doCliente) { const o = String(r.observacao || '').trim(); if (o) porObs.set(o, (porObs.get(o) || 0) + 1); }
const FUNC = [...porObs.entries()].sort((a, b) => b[1] - a[1])[0][0];

console.log(`\nalvo CLIENTE     : ${JSON.stringify(CLIENTE)}  (${doCliente.length} lancamentos, ${porObs.size} favorecidos distintos)`);
console.log(`alvo FAVORECIDO  : ${JSON.stringify(FUNC)}  (${porObs.get(FUNC)} lancamentos dentro desse cliente)`);

console.log(`\n===== D2: o caso DISCRIMINANTE (antes x depois) =====`);
{
  const aF = rodar(ANTES, { 'cp-filtro-favorecido': [UP(CLIENTE)] }).length;
  const dF = rodar(DEPOIS, { 'cp-filtro-favorecido': [UP(CLIENTE)] }).length;
  console.log(`  filtrar FAVORECIDO pelo nome do CLIENTE: antes=${aF} linhas, depois=${dF} linhas`);
  ok(aF > 0, `ANTES o filtro de Favorecido casava por entidade, entao trazia ${aF} linhas do cliente`);
  ok(dF === 0, `DEPOIS traz ZERO, porque cliente nao e favorecido (o filtro casa por observacao)`);

  const aG = rodar(ANTES, { 'cp-filtro-favorecido': [UP(FUNC)] }).length;
  const dG = rodar(DEPOIS, { 'cp-filtro-favorecido': [UP(FUNC)] }).length;
  console.log(`  filtrar FAVORECIDO pelo nome do FUNCIONARIO: antes=${aG} linhas, depois=${dG} linhas`);
  ok(aG === 0, `ANTES dava ZERO: o funcionario nunca esteve no campo que o filtro casava`);
  ok(dG > 0, `DEPOIS devolve ${dG} linha(s), que e o que o operador espera ao filtrar um favorecido`);
}

console.log(`\n===== D1/B1: cada filtro casa pelo campo da SUA coluna =====`);
{
  const porFav = rodar(DEPOIS, { 'cp-filtro-favorecido': [UP(FUNC)] });
  ok(porFav.length > 0 && porFav.every(r => UP(r.observacao) === UP(FUNC)),
    `filtro Favorecido: as ${porFav.length} linhas tem observacao == alvo, 100%`);
  const porCli = rodar(DEPOIS, { 'cp-filtro-cliente': [UP(CLIENTE)] });
  ok(porCli.length > 0 && porCli.every(r => UP(r.entidade) === UP(CLIENTE)),
    `filtro Cliente: as ${porCli.length} linhas tem entidade == alvo, 100%`);
  ok(porCli.length === doCliente.length,
    `filtro Cliente devolve TODOS os ${doCliente.length} lancamentos do cliente, nao um subconjunto`);
  const obsDistintos = new Set(porCli.map(r => UP(r.observacao))).size;
  ok(obsDistintos > 1,
    `e esses ${porCli.length} lancamentos tem ${obsDistintos} favorecidos distintos, ou seja, Cliente agrega e Favorecido detalha`);
}

console.log(`\n===== B2: os dois filtros combinam (AND), sem um anular o outro =====`);
{
  const ambos = rodar(DEPOIS, { 'cp-filtro-cliente': [UP(CLIENTE)], 'cp-filtro-favorecido': [UP(FUNC)] });
  ok(ambos.length === porObs.get(FUNC),
    `Cliente + Favorecido juntos: ${ambos.length} linha(s), exatamente o funcionario DENTRO daquele cliente`);
  // Um funcionario de OUTRO cliente combinado com este cliente tem que dar zero.
  const outro = regs.find(r => UP(r.entidade) !== UP(CLIENTE) && r.observacao);
  const cruzado = rodar(DEPOIS, { 'cp-filtro-cliente': [UP(CLIENTE)], 'cp-filtro-favorecido': [UP(outro.observacao)] });
  ok(cruzado.length === 0,
    `Cliente A + Favorecido que so existe no cliente B: ZERO linhas, o AND vale de verdade`);
}

console.log(`\n===== VEREDITO: ${falhas === 0 ? 'PASSA' : falhas + ' FALHA(S)'} =====`);
process.exit(falhas === 0 ? 0 : 1);
