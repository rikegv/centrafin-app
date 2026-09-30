#!/usr/bin/env node
/**
 * OS-CP-PACOTE-ONDAS-01 — VERIFICACAO DE USO DO MODULO LEGADO. SOMENTE LEITURA.
 *
 * NAO ESCREVE NADA.
 *
 * O diretor autorizou tirar `contas_a_pagar_desktop/code.html` da superficie
 * servida, MAS so depois de verificar que ninguem usa, e mandou PARAR e reportar se
 * houver qualquer indicio de uso.
 *
 * O estatico ja foi conferido e nao achou porta de entrada: nao ha link no
 * `sidebar.js` (ele declara o modulo exterminado e aponta so para o Gerenciador),
 * o `master.html` nao oferece mais o menu legado no cadastro de usuarios, e o
 * `login.html` nao redireciona para ele. A unica entrada possivel e URL direta.
 *
 * Este script busca o indicio que o estatico nao alcanca: alguem AINDA TEM a chave
 * de menu legada, ou alguem JA ESCREVEU por aquele modulo.
 *
 * ASSINATURAS DE ESCRITA (conferidas no codigo dos dois modulos):
 *   legado   → origem 'etl_txt' | 'manual' | 'manual_recorrente'; campo `cliente_origem`
 *   vivo     → origem 'etl_txt_gerenciador' | 'etl_projetado_fixo' | 'edit_projetado_recorrente'
 *   ambiguo  → 'etl_projetado_fixo' (os DOIS gravam; nao serve como prova)
 *
 * USO: GOOGLE_APPLICATION_CREDENTIALS=<adc.json> node scripts/verificar-uso-legado-cp.cjs
 */
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ credential: applicationDefault(), projectId: 'centra-fin' });
const db = getFirestore();

const MENU_LEGADO = 'contas_pagar';
const MENU_VIVO = 'gerenciador_contas_pagar';
const ORIGENS_LEGADO = new Set(['etl_txt', 'manual', 'manual_recorrente']);

const dataDe = (v) => {
  try {
    if (v && typeof v.toDate === 'function') return v.toDate();
    if (typeof v === 'string' && v) return new Date(v);
  } catch (_) {}
  return null;
};
const fmt = (d) => (d ? d.toISOString().slice(0, 19).replace('T', ' ') : 'sem data');

(async () => {
  let indicios = 0;

  // ─── 1. Quem ainda tem a chave de menu legada? ───────────────────────────
  console.log(`\n=========== 1. USUARIOS COM O MENU LEGADO "${MENU_LEGADO}" ===========`);
  const users = await db.collection('Usuarios').get();
  const comLegado = [], comVivo = [];
  users.forEach((d) => {
    const v = d.data() || {};
    const menus = Array.isArray(v.menus_permitidos) ? v.menus_permitidos : [];
    const perfil = String(v.perfil || '').trim() || 'sem perfil';
    if (menus.includes(MENU_LEGADO)) comLegado.push({ id: d.id, perfil, menus });
    if (menus.includes(MENU_VIVO)) comVivo.push(d.id);
  });
  console.log(`  usuarios cadastrados ................. ${users.size}`);
  console.log(`  com o menu VIVO (${MENU_VIVO}) ....... ${comVivo.length}`);
  console.log(`  com o menu LEGADO (${MENU_LEGADO}) ... ${comLegado.length}`);
  if (comLegado.length) {
    indicios++;
    console.log(`  *** INDICIO: estes usuarios tem permissao pela chave legada:`);
    for (const u of comLegado) {
      // NAO imprime o doc-id inteiro quando ele e e-mail: minimizacao de dado
      // pessoal (secao 7). Mostra o suficiente para o diretor identificar.
      const alvo = u.id.includes('@')
        ? u.id.replace(/^(.{3}).*(@.*)$/, '$1***$2') : u.id;
      console.log(`      ${alvo}  perfil=${u.perfil}`);
    }
    console.log(`  Nota: as firestore.rules AINDA honram hasMenu('${MENU_LEGADO}') para`);
    console.log(`  ler e escrever ContasAPagar, entao essa chave e permissao viva.`);
  } else {
    console.log(`  OK: nenhum usuario tem a chave legada. Ninguem seria autorizado pelas`);
    console.log(`  rules por aquele caminho, mesmo abrindo o arquivo por URL direta.`);
  }

  // ─── 2. Alguem ESCREVEU por aquele modulo? ───────────────────────────────
  console.log(`\n=========== 2. ESCRITAS COM ASSINATURA DO MODULO LEGADO ===========`);
  const lanc = await db.collection('ContasAPagar')
    .select('origem', 'cliente_origem', 'created_at', 'updated_at', 'criado_por', 'arquivo').get();
  const porOrigem = new Map();
  let comClienteOrigem = 0;
  let maisRecenteLegado = null, exemploLegado = null;
  lanc.forEach((d) => {
    const v = d.data() || {};
    const o = String(v.origem ?? '(sem origem)');
    if (!porOrigem.has(o)) porOrigem.set(o, { n: 0, ultima: null });
    const acc = porOrigem.get(o);
    acc.n++;
    const q = dataDe(v.updated_at) || dataDe(v.created_at);
    if (q && (!acc.ultima || q > acc.ultima)) acc.ultima = q;
    if (v.cliente_origem != null) comClienteOrigem++;
    if (ORIGENS_LEGADO.has(o)) {
      if (q && (!maisRecenteLegado || q > maisRecenteLegado)) {
        maisRecenteLegado = q;
        exemploLegado = { id: d.id, origem: o, criado_por: v.criado_por || null, arquivo: v.arquivo || null };
      }
    }
  });
  console.log(`  lancamentos em ContasAPagar: ${lanc.size}`);
  console.log(`\n  por 'origem' (com a escrita mais recente de cada):`);
  for (const [o, a] of [...porOrigem.entries()].sort((x, y) => y[1].n - x[1].n)) {
    const marca = ORIGENS_LEGADO.has(o) ? '  <== LEGADO'
      : (o === 'etl_projetado_fixo' ? '  (ambiguo, os dois modulos gravam)' : '');
    console.log(`    ${o.padEnd(30)} ${String(a.n).padStart(6)} docs   ultima: ${fmt(a.ultima)}${marca}`);
  }
  console.log(`\n  docs com o campo 'cliente_origem' (SO o legado grava): ${comClienteOrigem}`);
  const totalLegado = [...ORIGENS_LEGADO].reduce((s, o) => s + ((porOrigem.get(o) || {}).n || 0), 0);
  if (totalLegado > 0 || comClienteOrigem > 0) {
    indicios++;
    console.log(`  *** INDICIO: ha ${totalLegado} doc(s) com origem do legado` +
      (comClienteOrigem ? ` e ${comClienteOrigem} com cliente_origem` : '') + `.`);
    console.log(`  escrita mais recente do legado: ${fmt(maisRecenteLegado)}`);
    if (exemploLegado) console.log(`  exemplo: ${JSON.stringify(exemploLegado)}`);
  } else {
    console.log(`  OK: nenhuma escrita com assinatura exclusiva do modulo legado.`);
  }

  // ─── 3. Logs do sistema ─────────────────────────────────────────────────
  console.log(`\n=========== 3. LOGS DO SISTEMA ===========`);
  try {
    const logs = await db.collection('Logs').select('modulo', 'modulo_origem', 'acao', 'data', 'created_at').get();
    const porModulo = new Map();
    logs.forEach((d) => {
      const v = d.data() || {};
      const m = String(v.modulo || v.modulo_origem || '(sem modulo)');
      if (!porModulo.has(m)) porModulo.set(m, { n: 0, ultima: null });
      const a = porModulo.get(m);
      a.n++;
      const q = dataDe(v.data) || dataDe(v.created_at);
      if (q && (!a.ultima || q > a.ultima)) a.ultima = q;
    });
    console.log(`  registros em Logs: ${logs.size}`);
    for (const [m, a] of [...porModulo.entries()].sort((x, y) => y[1].n - x[1].n).slice(0, 15)) {
      console.log(`    ${m.padEnd(28)} ${String(a.n).padStart(6)}   ultima: ${fmt(a.ultima)}`);
    }
    console.log(`  (o modulo legado NAO grava em Logs, entao ausencia aqui nao prova nada;`);
    console.log(`   serve para mostrar quais modulos de fato registram atividade)`);
  } catch (e) {
    console.log(`  nao foi possivel ler Logs: ${e.message}`);
  }

  // ─── VEREDITO ───────────────────────────────────────────────────────────
  console.log(`\n=========== VEREDITO ===========`);
  if (indicios === 0) {
    console.log(`  NENHUM INDICIO DE USO.`);
    console.log(`  Estatico: sem link, sem rota, fora do cadastro de menus, fora do redirect.`);
    console.log(`  Dados: ninguem tem a chave legada e nao ha escrita com assinatura dele.`);
    console.log(`  Recomendacao: pode sair da superficie servida.`);
  } else {
    console.log(`  ${indicios} INDICIO(S) ENCONTRADO(S). PARAR e reportar ao diretor antes de cortar.`);
  }
  console.log(`\n  LIMITE DESTA VERIFICACAO, declarado: ela NAO consegue provar acesso por`);
  console.log(`  LEITURA. Alguem com o menu vivo pode abrir o arquivo legado por URL direta,`);
  console.log(`  olhar a tela e sair sem gravar nada, e isso nao deixa rastro em lugar algum.`);
  console.log(`  O log de acesso do Firebase Hosting nao e consultavel por este caminho.`);
  console.log(`\n=== FIM (nenhuma escrita realizada) ===`);
  process.exit(indicios === 0 ? 0 : 2);
})().catch((e) => { console.error('ERRO:', e && e.message ? e.message : e); process.exit(1); });
