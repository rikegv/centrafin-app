#!/usr/bin/env node
/**
 * purge-area-team-tailor.cjs — OS-CC-LISTA-COMPLETA-01
 *
 * Remove o documento "TEAM TAILOR" da coleção AreasContasPagar — solução
 * DEFINITIVA da duplicata por digitação de "COMERCIAL TEAM TAILOR".
 *
 * Contexto: "TEAM TAILOR" existia em dois lugares. O cadastro do fornecedor
 * 2395 (Patrícia) já foi corrigido; sobrou o registro em AreasContasPagar, que
 * a segunda fonte do sync reintroduziria na lista de liberação. Enquanto ele
 * existir, o código precisa carregar 'TEAM TAILOR' em CC_SYNC_EXCLUIDOS —
 * apagado o documento, essa exclusão sai do código.
 *
 * DRY-RUN POR PADRÃO. Só apaga com --apply. Grava backup antes.
 *
 *   node scripts/purge-area-team-tailor.cjs           # só mostra
 *   node scripts/purge-area-team-tailor.cjs --apply   # apaga
 */

const fs = require('fs');
const path = require('path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const APPLY = process.argv.includes('--apply');
const ALVO = 'TEAM TAILOR';
const CORRETO = 'COMERCIAL TEAM TAILOR';

(async () => {
  initializeApp({ projectId: 'centra-fin', credential: applicationDefault() });
  const db = getFirestore();

  console.log('='.repeat(76));
  console.log('OS-CC-LISTA-COMPLETA-01 — remover "TEAM TAILOR" de AreasContasPagar');
  console.log('MODO:', APPLY ? '*** APPLY — VAI APAGAR ***' : 'DRY-RUN (nada será alterado)');
  console.log('='.repeat(76));

  const areas = await db.collection('AreasContasPagar').get();
  const alvos = areas.docs.filter(d => String((d.data() || {}).nome || '').trim() === ALVO);

  console.log(`\nAreasContasPagar: ${areas.size} documentos.`);
  console.log(`Documentos com nome === "${ALVO}": ${alvos.length}\n`);
  alvos.forEach(d => {
    console.log(`  docId: ${d.id}`);
    const x = d.data() || {};
    Object.keys(x).sort().forEach(k => {
      const v = x[k];
      const s = (v && v.toDate) ? v.toDate().toISOString().slice(0, 19) : JSON.stringify(v);
      console.log(`    ${k.padEnd(14)} ${s}`);
    });
  });

  if (alvos.length !== 1) {
    console.log(`\nABORTANDO: esperado exatamente 1 documento, encontrado ${alvos.length}.`);
    process.exit(1);
  }

  // ── SALVAGUARDAS: alguém ainda aponta para "TEAM TAILOR"? ────────────────
  console.log('── SALVAGUARDAS — referências remanescentes ao valor ──\n');
  const [forn, cap, cf, bcc] = await Promise.all([
    db.collection('Fornecedores').get(),
    db.collection('ContasAPagar').get(),
    db.collection('CustosFolha').get(),
    db.collection('Base_Centros_Custo').get(),
  ]);
  const conta = (docs, campo) => docs.filter(d => String((d.data() || {})[campo] || '').trim() === ALVO).length;
  const refs = [
    ['Fornecedores.centro_custo', conta(forn.docs, 'centro_custo')],
    ['ContasAPagar.centro_custo', conta(cap.docs, 'centro_custo')],
    ['CustosFolha.centro_custo', conta(cf.docs, 'centro_custo')],
    ['Base_Centros_Custo.nome', conta(bcc.docs, 'nome')],
  ];
  let pendentes = 0;
  refs.forEach(([rot, n]) => {
    if (n > 0) pendentes += n;
    console.log(`  ${n === 0 ? 'OK  ' : 'ALERTA'} | ${String(n).padStart(5)} referência(s) | ${rot}`);
  });

  // O CC correto segue intacto?
  const corretoAreas = areas.docs.filter(d => String((d.data() || {}).nome || '').trim() === CORRETO).length;
  const corretoBase = bcc.docs.filter(d => String((d.data() || {}).nome || '').trim() === CORRETO).length;
  const corretoForn = conta(forn.docs, 'centro_custo') >= 0
    ? forn.docs.filter(d => String((d.data() || {}).centro_custo || '').trim() === CORRETO).length : 0;
  console.log(`\n  "${CORRETO}" permanece: AreasContasPagar=${corretoAreas} · Base_Centros_Custo=${corretoBase} · Fornecedores=${corretoForn}`);

  if (pendentes > 0) {
    console.log(`\nABORTANDO: ainda há ${pendentes} registro(s) apontando para "${ALVO}".`);
    console.log('Corrija a origem antes de remover a área, senão o valor vira órfão.');
    process.exit(1);
  }
  console.log('\n  Nenhum registro aponta mais para o valor — remoção é segura.');
  console.log(`  AreasContasPagar ficará com ${areas.size - 1} documentos.`);

  if (!APPLY) {
    console.log('\n' + '='.repeat(76));
    console.log('DRY-RUN concluído. NADA foi alterado.');
    console.log('Revise acima e rode com --apply.');
    console.log('='.repeat(76));
    process.exit(0);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(__dirname, `backup-area-team-tailor-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify(alvos.map(d => ({ id: d.id, data: d.data() })), null, 2), 'utf8');
  console.log(`\nBackup gravado: ${backup}`);

  await alvos[0].ref.delete();
  console.log(`Removido: AreasContasPagar/${alvos[0].id}`);

  const conf = await db.collection('AreasContasPagar').get();
  const resta = conf.docs.filter(d => String((d.data() || {}).nome || '').trim() === ALVO).length;
  const aindaCorreto = conf.docs.filter(d => String((d.data() || {}).nome || '').trim() === CORRETO).length;
  console.log('\nCONFERÊNCIA');
  console.log(`  AreasContasPagar: ${conf.size} docs | com "${ALVO}": ${resta} (esperado 0)`);
  console.log(`  "${CORRETO}" ainda presente: ${aindaCorreto} (esperado 1)`);
  process.exit(resta === 0 && aindaCorreto === 1 ? 0 : 1);
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
