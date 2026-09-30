#!/usr/bin/env node
/**
 * DIAGNOSTICO dos cards de Natureza do Custo do Contas a Pagar. SOMENTE LEITURA.
 * Pedido do diretor em 2026-09-30: reconciliar a diferenca de R$ 23.397,15 entre o
 * card "Total Geral" e a soma dos 4 cards de natureza. NAO CORRIGE NADA.
 *
 * METODO, e ele importa para a conta ser prova e nao suposicao:
 *   1. EXTRAI a funcao REAL `atualizarKPIs` (mais `statusVisual` e `hojeISO`) do
 *      proprio `gerenciador_contas_pagar_desktop/code.html` e roda sobre os dados
 *      reais. Esses sao os numeros AUTORITATIVOS: e o que a tela mostra.
 *   2. Faz uma decomposicao propria, por status e por tipo_entidade.
 *   3. VALIDA a decomposicao contra os numeros do passo 1. Se nao reproduzir ao
 *      centavo, a decomposicao e descartada em vez de reportada. Decomposicao que
 *      nao fecha com a funcao real nao prova nada.
 *
 * USO: GOOGLE_APPLICATION_CREDENTIALS=<adc.json> node scripts/diag-cards-natureza-cp.cjs
 */
const fs = require('fs');
const path = require('path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ credential: applicationDefault(), projectId: 'centra-fin' });
const db = getFirestore();

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const cent = (n) => Math.round(n * 100);

function extrairFuncao(src, nome) {
  const i = src.indexOf(`function ${nome}(`);
  if (i < 0) throw new Error(`nao achei ${nome}`);
  let j = src.indexOf('{', i), n = 0, fim = -1;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') n++;
    else if (src[k] === '}') { n--; if (!n) { fim = k + 1; break; } }
  }
  return src.slice(i, fim);
}

(async () => {
  const REL = path.join(__dirname, '..', 'gerenciador_contas_pagar_desktop', 'code.html');
  const SRC = fs.readFileSync(REL, 'utf8');

  // ── 1. A FUNCAO REAL DA TELA ──────────────────────────────────────────────
  const escrito = {};
  const fakeEl = (id) => ({
    set textContent(v) { escrito[id] = v; },
    get textContent() { return escrito[id]; },
    setAttribute() {},
  });
  const CP_ANO_VIGENTE = new Date().getFullYear();
  const atualizarKPIs = new Function(
    'document', 'fmtBRL', 'CP_LIMIAR_ANO', '_cpPeriodoComitado',
    extrairFuncao(SRC, 'hojeISO') + '\n' +
    extrairFuncao(SRC, 'statusVisual') + '\n' +
    extrairFuncao(SRC, 'atualizarKPIs') + '\n' +
    'return atualizarKPIs;'
  )({ getElementById: fakeEl }, { format: (n) => Number(n).toFixed(2) },
    `${CP_ANO_VIGENTE}-01-01`, { ini: '', fim: '' });

  const statusVisual = new Function(extrairFuncao(SRC, 'statusVisual') + '\nreturn statusVisual;')();
  const hojeISO = new Function(extrairFuncao(SRC, 'hojeISO') + '\nreturn hojeISO;')();

  const snap = await db.collection('ContasAPagar')
    .select('tipo_entidade', 'valor_original', 'categoria', 'entidade', 'data_vencimento', 'status').get();
  const regs = snap.docs.map((d) => ({ _id: d.id, ...d.data() }));

  atualizarKPIs(regs);
  const num = (k) => Number(String(escrito[k] ?? '0'));

  console.log(`\n############ OS CARDS, pela FUNCAO REAL da tela (${regs.length} docs) ############`);
  const CARDS = [
    ['kpi-total', 'Total Geral'], ['kpi-pago', 'Total Pago'], ['kpi-a-pagar', 'A Pagar'],
    ['kpi-tarifas', 'Tarifas e Comissoes'], ['kpi-interno', 'Custo Fornecedor Interno'],
    ['kpi-externo', 'Custo Fornecedor Externo'], ['kpi-cliente', 'Custo Cliente'],
    ['kpi-sem-class', 'Sem Classificacao'],
  ];
  for (const [id, lbl] of CARDS) console.log(`  ${lbl.padEnd(26)} ${brl(num(id)).padStart(20)}`);

  const somaNat = num('kpi-interno') + num('kpi-externo') + num('kpi-cliente') + num('kpi-sem-class');
  const diff = num('kpi-total') - somaNat;
  console.log(`  ${'-'.repeat(47)}`);
  console.log(`  ${'SOMA das 4 naturezas'.padEnd(26)} ${brl(somaNat).padStart(20)}`);
  console.log(`  ${'DIFERENCA (Total Geral -)'.padEnd(26)} ${brl(diff).padStart(20)}`);

  // ── 2. DECOMPOSICAO PROPRIA ───────────────────────────────────────────────
  // A regra de tarifa e INLINE dentro de atualizarKPIs, entao nao da para extrair
  // isolada; ela e reproduzida aqui e VALIDADA contra a funcao real logo abaixo.
  const normTexto = (s) => String(s || '').trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ehTarifa = (r) => {
    const blob = `${normTexto(r.categoria)} ${normTexto(r.entidade)}`;
    return blob.includes('TARIFA') || (blob.includes('COMISSAO') && blob.includes('BANC'));
  };
  const LIMIAR = `${CP_ANO_VIGENTE}-01-01`;
  const hoje = hojeISO();
  const TIPOS_CARD = new Set(['Fornecedor Interno', 'Fornecedor Interno - PJ', 'Fornecedor Externo', 'Cliente']);

  // Mesmo critério do DRE e, desde 2026-09-30, do CP: teste de PREFIXO em `status`.
  const ehCancelado = (r) => /^cancel/i.test(String(r.status || '').trim());

  const porStatus = new Map();       // statusVisual -> { n, v } (no recorte, sem tarifa)
  const porTipo = new Map();         // tipo_entidade -> { n, v, nTar, vTar, nFora, vFora, nCanc, vCanc }
  let foraDoRecorte = { n: 0, v: 0 };
  let tarifa = { n: 0, v: 0 };
  let cancelado = { n: 0, v: 0 };
  let totalRecorteSemTarifa = { n: 0, v: 0 };          // inclui cancelado (é o `total` da função)
  let totalNaturezas = { n: 0, v: 0 };                 // exclui cancelado (é o que os 4 cards somam)

  for (const r of regs) {
    const v = Number(r.valor_original) || 0;
    const t = r.tipo_entidade == null || String(r.tipo_entidade).trim() === ''
      ? '(VAZIO/NULL)' : String(r.tipo_entidade);
    if (!porTipo.has(t)) porTipo.set(t, { n: 0, v: 0, nTar: 0, vTar: 0, nFora: 0, vFora: 0, nCanc: 0, vCanc: 0 });
    const pt = porTipo.get(t);

    if (String(r.data_vencimento || '') < LIMIAR) {     // 1o `continue` da funcao
      foraDoRecorte.n++; foraDoRecorte.v += v; pt.nFora++; pt.vFora += v; continue;
    }
    if (ehTarifa(r)) {                                   // 2o `continue` da funcao
      tarifa.n++; tarifa.v += v; pt.nTar++; pt.vTar += v; continue;
    }
    totalRecorteSemTarifa.n++; totalRecorteSemTarifa.v += v;
    const sv = statusVisual(r, hoje);
    if (!porStatus.has(sv)) porStatus.set(sv, { n: 0, v: 0 });
    const ps = porStatus.get(sv); ps.n++; ps.v += v;
    // A guarda de 2026-09-30: cancelado entra em `total` (e portanto na conta do
    // Total Geral) mas NAO entra nos 4 cards de natureza.
    if (ehCancelado(r)) {
      cancelado.n++; cancelado.v += v; pt.nCanc++; pt.vCanc += v; continue;
    }
    totalNaturezas.n++; totalNaturezas.v += v;
    pt.n++; pt.v += v;
  }

  // ── 3. VALIDACAO da decomposicao contra a funcao real ────────────────────
  console.log(`\n############ VALIDACAO: a decomposicao reproduz a tela? ############`);
  const checks = [
    ['Tarifas', tarifa.v, num('kpi-tarifas')],
    ['Total Pago', (porStatus.get('pago') || { v: 0 }).v, num('kpi-pago')],
    ['A Pagar', (porStatus.get('a_vencer') || { v: 0 }).v, num('kpi-a-pagar')],
    ['soma das 4 naturezas', totalNaturezas.v, somaNat],
  ];
  let okAll = true;
  for (const [lbl, meu, real] of checks) {
    const ok = cent(meu) === cent(real);
    if (!ok) okAll = false;
    console.log(`  ${ok ? 'CONFERE ' : '*DIVERGE*'} ${lbl.padEnd(22)} decomposicao=${brl(meu)}  tela=${brl(real)}`);
  }
  if (!okAll) {
    console.log(`\n  *** A decomposicao NAO reproduz a tela. Descartada; nao reporto breakdown.`);
    process.exit(1);
  }
  console.log(`  Todas conferem ao centavo. A decomposicao abaixo e confiavel.`);

  // ── 4. TODOS os valores distintos de tipo_entidade ───────────────────────
  console.log(`\n############ (2) TODOS os valores distintos de tipo_entidade ############`);
  console.log(`  ${'valor'.padEnd(26)} ${'no recorte, sem tarifa'.padStart(24)} ${'tarifa'.padStart(16)} ${'fora do ano'.padStart(16)}`);
  let somaCards = 0;
  for (const [t, a] of [...porTipo.entries()].sort((x, y) => y[1].v - x[1].v)) {
    const marca = TIPOS_CARD.has(t) ? '' : (t === '(VAZIO/NULL)' ? '  -> card Sem Classificacao' : '  <== QUINTO TIPO');
    console.log(`  ${t.padEnd(26)} ${brl(a.v).padStart(24)} ${brl(a.vTar).padStart(16)} ${brl(a.vFora).padStart(16)}${marca}`);
    somaCards += a.v;
  }
  const quintos = [...porTipo.keys()].filter((t) => t !== '(VAZIO/NULL)' && !TIPOS_CARD.has(t));
  console.log(`\n  valores distintos: ${porTipo.size}`);
  console.log(`  QUINTO TIPO (valor fora dos 4 esperados e nao vazio): ` +
    (quintos.length ? `*** ${quintos.length}: ${quintos.join(' , ')} ***` : 'NENHUM'));
  console.log(`  Nota: mesmo se existisse, o laco da funcao tem um \`else\` final que manda`);
  console.log(`  qualquer tipo desconhecido para "Sem Classificacao", entao os 4 cards`);
  console.log(`  PARTICIONAM o recorte por construcao. Nenhum lancamento fica fora dos 4.`);

  // ── 5. Status: onde vive a diferenca ────────────────────────────────────
  console.log(`\n############ (3) A RECONCILIACAO EXATA ############`);
  console.log(`\n  Status dos lancamentos no recorte (tarifa ja expurgada):`);
  let somaStatus = 0;
  for (const [s, a] of [...porStatus.entries()].sort((x, y) => y[1].v - x[1].v)) {
    const entra = (s === 'pago') ? 'entra no card Total Pago'
      : (s === 'a_vencer') ? 'entra no card A Pagar'
      : (s === 'atrasado') ? 'entra em Vencidos (card que NAO existe no DOM)'
      : 'NAO entra em NENHUM card de caixa';
    console.log(`    ${s.padEnd(14)} ${String(a.n).padStart(6)} docs ${brl(a.v).padStart(18)}   ${entra}`);
    somaStatus += a.v;
  }
  console.log(`    ${'TOTAL'.padEnd(14)} ${String(totalRecorteSemTarifa.n).padStart(6)} docs ${brl(somaStatus).padStart(18)}`);

  const pago = (porStatus.get('pago') || { v: 0 }).v;
  console.log(`\n  A CONTA, depois da correcao de 2026-09-30:`);
  console.log(`    Total Geral do card = Pago + Tarifas  (mantido por decisao do diretor)`);
  console.log(`      ${brl(pago)} + ${brl(tarifa.v)} = ${brl(pago + tarifa.v)}`);
  console.log(`    Soma das 4 naturezas = recorte SEM tarifa e SEM cancelado`);
  console.log(`      ${brl(totalNaturezas.v)}`);
  console.log(`    Diferenca esperada = APENAS as tarifas`);
  console.log(`      ${brl(diff)} contra tarifas de ${brl(tarifa.v)}`);
  const fecha = cent(diff) === cent(tarifa.v);
  console.log(`    ${fecha ? 'FECHA' : '*** NAO FECHA ***'}: a diferenca e exatamente a tarifa.`);

  console.log(`\n  O que os 4 cards passaram a NAO contar (cancelado nao e custo):`);
  console.log(`    cancelado      ${String(cancelado.n).padStart(6)} docs ${brl(cancelado.v).padStart(18)}`);
  for (const [t, a] of [...porTipo.entries()].filter(([, a]) => a.vCanc > 0).sort((x, y) => y[1].vCanc - x[1].vCanc)) {
    console.log(`      de ${t.padEnd(24)} ${String(a.nCanc).padStart(4)} docs ${brl(a.vCanc).padStart(18)}`);
  }
  // CORRIGIDO em 2026-09-30, apontado pelo tester: a versao anterior desta linha
  // dizia que o cancelado "continua em `total`, e portanto na conta do Total Geral".
  // A segunda metade era FALSA. `total` e `cTotal` sao incrementados dentro de
  // `atualizarKPIs` e NUNCA LIDOS; o card Total Geral e `pago + tarifas`. Como
  // cancelado nao e `pago` nem tarifa, ele nao entra em card NENHUM.
  console.log(`    Esse valor nao aparece em card NENHUM: o Total Geral e Pago + Tarifas,`);
  console.log(`    e cancelado nao e nenhum dos dois. Ele segue na base e na tabela.`);

  // Alerta contra uma coincidencia do dado de HOJE virar suposicao amanha.
  if (cent(totalNaturezas.v) === cent(pago)) {
    console.log(`\n  AVISO: hoje a soma das 4 naturezas e IGUAL ao Total Pago, mas isso e`);
    console.log(`  COINCIDENCIA do dado atual (A Pagar e Vencidos estao zerados, e o unico`);
    console.log(`  status fora de "pago" no recorte era o cancelado, que saiu). NAO e`);
    console.log(`  identidade estrutural: no dia em que houver fatura a vencer, os dois numeros`);
    console.log(`  se separam. Nao construa nada em cima dessa igualdade.`);
  }

  // ── 6. Mesmo conjunto e mesmo campo? ───────────────────────────────────
  console.log(`\n############ (4) MESMO CONJUNTO E MESMO CAMPO? ############`);
  console.log(`  Campo de valor: os DOIS usam \`valor_original\`. Uma leitura so, no topo do laco.`);
  console.log(`  Conjunto: os DOIS partem do MESMO laco e dos MESMOS dois cortes:`);
  console.log(`    corte 1, ano vigente  : ${foraDoRecorte.n} docs fora (${brl(foraDoRecorte.v)})`);
  console.log(`    corte 2, tarifa       : ${tarifa.n} docs expurgados (${brl(tarifa.v)})`);
  console.log(`  A diferenca NAO esta no conjunto nem no campo: esta em QUAIS ACUMULADORES`);
  console.log(`  alimentam cada card. "Total Geral" NAO e o total do conjunto; e Pago + Tarifas,`);
  console.log(`  por decisao da Onda Layout. Os 4 cards de natureza somam o conjunto inteiro.`);

  console.log(`\n############ (1) AS TARIFAS ENTRAM NAS 4 NATUREZAS? ############`);
  console.log(`  NAO. O \`continue\` do expurgo de tarifa roda ANTES dos buckets de natureza,`);
  console.log(`  entao ${brl(tarifa.v)} em ${tarifa.n} docs fica FORA dos 4 cards.`);
  console.log(`  E ENTRA no Total Geral, porque aquele card e Pago + Tarifas.`);
  console.log(`  Por tipo, a tarifa expurgada se distribui assim:`);
  for (const [t, a] of [...porTipo.entries()].filter(([, a]) => a.vTar > 0).sort((x, y) => y[1].vTar - x[1].vTar)) {
    console.log(`    ${t.padEnd(26)} ${String(a.nTar).padStart(5)} docs ${brl(a.vTar).padStart(18)}`);
  }

  console.log(`\n=== FIM (nenhuma escrita realizada) ===`);
  process.exit(0);
})().catch((e) => { console.error('ERRO:', e && e.message ? e.message : e); process.exit(1); });
