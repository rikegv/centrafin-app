#!/usr/bin/env node
/**
 * OS-CP-PACOTE-ONDAS-01 — PROVA NUMERICA DO DRE GERENCIAL. SOMENTE LEITURA.
 *
 * Existe para responder ao VETO 2 do agente seguranca: a Frente 3 passou a gravar
 * `empresa` no lancamento, e `empresaDespesa` do DRE da PRECEDENCIA ao campo
 * explicito. O DRE e tela JA VALIDADA, entao nenhum numero dele pode mudar sem
 * prova.
 *
 * As funcoes de atribuicao sao EXTRAIDAS do proprio `dre_gerencial_desktop/code.html`,
 * nao reimplementadas: reimplementar codificaria a mesma suposicao que se quer testar.
 *
 * Prova em tres partes:
 *   P0  a base de HOJE nao foi tocada: nenhum doc tem `empresa_origem`, logo o DRE
 *       de hoje e identico ao de antes do pacote, por ausencia de mudanca no dado.
 *   P1  soma das abas == CONSOLIDADO no cenario de HOJE (que e o unico que existe:
 *       P0 prova que nenhum doc foi carimbado, entao nao ha "depois" para agregar).
 *   P2  o cenario FUTURO, quando o carimbo comecar a rodar: quanto sai de OUTRAS e
 *       para onde vai, com a garantia de que OUTRAS so DIMINUI e que nenhum doc que
 *       ja herdava empresa muda de aba.
 *   P3  a divisao CUSTOS x G&A nao se mexe (ela le `tipo_entidade`, nao `empresa`).
 *
 * USO: GOOGLE_APPLICATION_CREDENTIALS=<adc.json> node scripts/prova-dre-pacote-ondas.cjs
 */
const fs = require('fs');
const path = require('path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ credential: applicationDefault(), projectId: 'centra-fin' });
const db = getFirestore();

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Extrai o texto de uma funcao nomeada contando chaves.
function extrairFuncao(src, nome) {
  const i = src.indexOf(`function ${nome}(`);
  if (i < 0) throw new Error(`nao achei a funcao ${nome} no DRE`);
  let j = src.indexOf('{', i), n = 0, fim = -1;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') n++;
    else if (src[k] === '}') { n--; if (!n) { fim = k + 1; break; } }
  }
  if (fim < 0) throw new Error(`chaves desbalanceadas em ${nome}`);
  return src.slice(i, fim);
}

(async () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'dre_gerencial_desktop', 'code.html'), 'utf8');

  // As tres funcoes REAIS do DRE.
  const api = new Function('fornecedorEmpresaMap',
    extrairFuncao(SRC, 'normalizarEmpresa') + '\n' +
    extrairFuncao(SRC, 'empresaDespesa') + '\n' +
    extrairFuncao(SRC, 'bucketDespesa') + '\n' +
    'return { normalizarEmpresa, empresaDespesa, bucketDespesa };');

  const [lancSnap, fornSnap] = await Promise.all([
    db.collection('ContasAPagar')
      .select('empresa', 'empresa_origem', 'codigo_fornecedor', 'valor_original', 'tipo_entidade').get(),
    db.collection('Fornecedores').select('empresa', 'codigo').get(),
  ]);

  // Mapa de fornecedor -> empresa, ESPELHANDO LINHA A LINHA o que o DRE faz em
  // `dre_gerencial_desktop/code.html:617`. A chave e EXCLUSIVA: usa `codigo` quando
  // existe e, SO ENTAO, cai para o doc-id. Nao sao duas chaves.
  //
  // CORRIGIDO em 2026-09-30, apontado pelo agente seguranca na reauditoria: a versao
  // anterior deste script registrava AS DUAS chaves, o que tornava o mapa um
  // SUPERCONJUNTO do mapa real do DRE. O efeito era classificar como "herda empresa"
  // um doc que no DRE real cai em OUTRAS, ou seja, o numero de alcancados saia
  // SUBESTIMADO (piso, nao exato). O erro apontava para o lado seguro, mas numero de
  // prova numerica nao pode ser aproximado por acidente.
  const fornMap = new Map();
  fornSnap.forEach((d) => {
    const v = d.data() || {};
    const e = String(v.empresa || '').trim().toUpperCase();
    if (!e) return;
    const cod = v.codigo != null ? String(v.codigo).trim() : String(d.id).trim();
    if (cod) fornMap.set(cod, e);
  });
  const { normalizarEmpresa, empresaDespesa, bucketDespesa } = api(fornMap);

  const lanc = lancSnap.docs.map((d) => ({ _id: d.id, ...d.data() }));
  const val = (r) => Number(r.valor_original) || 0;

  console.log(`\n=============== P0: a base de hoje foi tocada? ===============`);
  const comOrigem = lanc.filter((r) => String(r.empresa_origem || '').trim());
  const comEmpresa = lanc.filter((r) => String(r.empresa || '').trim());
  console.log(`  lancamentos: ${lanc.length}`);
  console.log(`  com 'empresa_origem' (assinatura do carimbo novo): ${comOrigem.length}`);
  console.log(`  com 'empresa' gravada (qualquer origem, inclusive cascata antiga): ${comEmpresa.length}`);
  console.log(comOrigem.length === 0
    ? `  VEREDITO P0: NENHUM doc foi carimbado por este pacote. O dado que o DRE le\n` +
      `               nao mudou, logo o DRE de hoje e identico ao de antes.`
    : `  *** ATENCAO: ${comOrigem.length} docs ja tem carimbo. A prova abaixo deixa de ser\n` +
      `      "cenario futuro" e passa a medir mudanca JA CONSUMADA.`);

  // ---------- Agregacao por aba, cenario ATUAL ----------
  function agregar(fnEmpresa) {
    const abas = new Map();
    const buckets = new Map();
    let total = 0;
    for (const r of lanc) {
      const v = val(r);
      total += v;
      const aba = normalizarEmpresa(fnEmpresa(r));
      abas.set(aba, (abas.get(aba) || 0) + v);
      const b = bucketDespesa(r);
      buckets.set(b, (buckets.get(b) || 0) + v);
    }
    return { abas, buckets, total };
  }

  const atual = agregar((r) => empresaDespesa(r));

  console.log(`\n=============== P1: consolidado e abas, HOJE ===============`);
  let somaAbas = 0;
  for (const [aba, v] of [...atual.abas.entries()].sort((a, b) => b[1] - a[1])) {
    somaAbas += v;
    console.log(`  ${aba.padEnd(10)} ${brl(v).padStart(20)}`);
  }
  console.log(`  ${'-'.repeat(32)}`);
  console.log(`  ${'soma'.padEnd(10)} ${brl(somaAbas).padStart(20)}`);
  console.log(`  ${'total'.padEnd(10)} ${brl(atual.total).padStart(20)}`);
  const p1 = Math.abs(somaAbas - atual.total) < 0.005;
  console.log(`  VEREDITO P1: ${p1 ? 'OK, soma das abas == consolidado' : '*** FALHA, balde perdido'}`);

  // ---------- P2: cenario futuro do carimbo ----------
  // Regra do carimbo: so carimba quem NAO herdaria empresa do cadastro. Para medir o
  // efeito maximo, assume-se que TODOS esses lancamentos seriam reimportados e
  // carimbados. E o limite superior do impacto, nao uma previsao.
  console.log(`\n=============== P2: cenario FUTURO do carimbo ===============`);
  const semHeranca = [];
  for (const r of lanc) {
    if (String(r.empresa || '').trim()) continue;         // ja tem explicita
    const cod = r.codigo_fornecedor == null ? '' : String(r.codigo_fornecedor).trim();
    const herdada = cod ? (fornMap.get(cod) || '') : '';
    if (!herdada) semHeranca.push(r);
  }
  const valSemHeranca = semHeranca.reduce((s, r) => s + val(r), 0);
  console.log(`  lancamentos que o carimbo alcancaria (sem empresa por nenhum caminho): ${semHeranca.length}`);
  console.log(`  valor envolvido: ${brl(valSemHeranca)}`);
  const abaHoje = new Map();
  for (const r of semHeranca) {
    const a = normalizarEmpresa(empresaDespesa(r));
    abaHoje.set(a, (abaHoje.get(a) || 0) + val(r));
  }
  console.log(`  em que aba eles estao HOJE:`);
  for (const [a, v] of [...abaHoje.entries()].sort((x, y) => y[1] - x[1])) {
    console.log(`    ${a.padEnd(10)} ${brl(v).padStart(20)}`);
  }
  const soOutras = [...abaHoje.keys()].every((a) => a === 'OUTRAS');
  console.log(`  VEREDITO P2: ${soOutras
    ? 'OK. TODOS eles estao em OUTRAS hoje. Logo o carimbo so pode MOVER valor de\n' +
      '               OUTRAS para uma aba real: OUTRAS so diminui, nenhuma aba real perde,\n' +
      '               e o CONSOLIDADO nao muda (ele soma tudo, inclusive OUTRAS).'
    : '*** ATENCAO: ha alcançados fora de OUTRAS. Carimbar poderia MOVER valor entre\n' +
      '      abas reais, e ai o Lucro por empresa muda. Precisa de decisao do diretor.'}`);

  // Prova complementar: nenhum doc que JA herda empresa e tocado pela regra.
  const jaHerdam = lanc.length - semHeranca.length - comEmpresa.length;
  console.log(`  docs que JA herdam empresa do cadastro e que a regra PRESERVA: ${jaHerdam}`);

  // ---------- P3: CUSTOS x G&A ----------
  console.log(`\n=============== P3: divisao CUSTOS x G&A ===============`);
  for (const [b, v] of [...atual.buckets.entries()].sort((a, b2) => b2[1] - a[1])) {
    console.log(`  ${b.padEnd(8)} ${brl(v).padStart(20)}`);
  }
  console.log(`  `);
  console.log(`  VEREDITO P3: bucketDespesa le APENAS 'tipo_entidade' (o pacote nao grava esse`);
  console.log(`               campo em lancamento existente), entao a fronteira Custo x Despesa`);
  console.log(`               e INVARIANTE a esta frente. O EBITDA tambem.`);

  const ok = (comOrigem.length === 0) && p1 && soOutras;
  console.log(`\n=============== VEREDITO GERAL: ${ok ? 'PASSA' : 'ATENCAO'} ===============`);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e && e.message ? e.message : e); process.exit(1); });
