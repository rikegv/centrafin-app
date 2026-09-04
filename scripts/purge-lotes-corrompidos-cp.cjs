#!/usr/bin/env node
/**
 * purge-lotes-corrompidos-cp.cjs — OS-CP-LIMPEZA-LOTES-CORROMPIDOS-01
 *
 * Remove de /ContasAPagar os documentos gravados pelos 3 lotes que entraram
 * corrompidos (U+FFFD) por causa do bug de encoding corrigido na
 * OS-IMPORT-ENCODING-01. Passo obrigatório ANTES da reimportação: o
 * `arquivo_hash` é calculado sobre o texto DECODIFICADO e muda com a correção,
 * então o escudo anti-duplicidade não dispara e o docId é auto-gerado —
 * reimportar direto produziria 272 corrompidos + 272 novos.
 *
 * DRY-RUN POR PADRÃO. Só apaga com --apply.
 *
 * Uso:
 *   node scripts/purge-lotes-corrompidos-cp.cjs            # dry-run (só lista)
 *   node scripts/purge-lotes-corrompidos-cp.cjs --apply    # remove de verdade
 *
 * Requer ADC (ver DIARIO / memória: token do firebase CLI como authorized_user).
 */

const fs = require('fs');
const path = require('path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const COLECAO = 'ContasAPagar';
const APPLY = process.argv.includes('--apply');

// ── CRITÉRIO DE SELEÇÃO (triplo, conjuntivo) ──────────────────────────────
// Um doc só é elegível se satisfizer AS TRÊS condições. Qualquer uma sozinha
// seria frouxa; juntas tornam impossível pegar lançamento manual:
//   1. `arquivo` é um dos 3 nomes de lote afetados;
//   2. `arquivo_hash` é o fingerprint SHA-256 daquele lote (só o ETL grava);
//   3. `origem` === 'etl_txt_gerenciador' (exclui etl_projetado_fixo e manual).
const LOTES = [
  '06 - Despesas 06_2026.txt',
  '06 - Despesas 07_2026.txt',
  '06 - Despesas 08_2026.txt',
];
const ORIGEM_ESPERADA = 'etl_txt_gerenciador';

// Janela de vencimento dos lotes — usada só para o RELATÓRIO de salvaguarda
// (mostrar o que existe nos mesmos meses e NÃO será tocado).
const JANELA_INI = '2026-06-01';
const JANELA_FIM = '2026-08-31';

const CHUNK = 400; // < 500 ops/batch do Firestore

function fmtBRL(n) {
  return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

(async () => {
  initializeApp({ projectId: 'centra-fin', credential: applicationDefault() });
  const db = getFirestore();

  console.log('='.repeat(74));
  console.log('OS-CP-LIMPEZA-LOTES-CORROMPIDOS-01 — purga dos lotes com encoding quebrado');
  console.log('MODO:', APPLY ? '*** APPLY — VAI APAGAR DE VERDADE ***' : 'DRY-RUN (nada será alterado)');
  console.log('='.repeat(74));

  const snap = await db.collection(COLECAO).get();
  console.log(`\nColeção /${COLECAO}: ${snap.size} documentos no total.\n`);

  const alvos = [];
  const recusadosNoLote = [];   // tem o nome do lote mas falhou nas outras travas
  const janelaIntactos = [];    // mesmos meses, fora dos lotes — NÃO serão tocados
  const hashesPorLote = new Map();

  snap.forEach(d => {
    const x = d.data() || {};
    const arquivo = x.arquivo || '';
    const noLote = LOTES.includes(arquivo);
    const venc = String(x.data_vencimento || '');
    const naJanela = venc >= JANELA_INI && venc <= JANELA_FIM;

    if (noLote) {
      const temHash = !!x.arquivo_hash;
      const origemOk = x.origem === ORIGEM_ESPERADA;
      if (temHash && origemOk) {
        alvos.push({ id: d.id, data: x });
        if (!hashesPorLote.has(arquivo)) hashesPorLote.set(arquivo, new Set());
        hashesPorLote.get(arquivo).add(String(x.arquivo_hash));
      } else {
        recusadosNoLote.push({ id: d.id, arquivo, origem: x.origem || '(vazio)', temHash });
      }
    } else if (naJanela) {
      janelaIntactos.push({ origem: x.origem || '(manual/sem origem)', arquivo: arquivo || '(sem arquivo)' });
    }
  });

  // ── Relatório por lote ──────────────────────────────────────────────────
  console.log('── DOCUMENTOS ELEGÍVEIS PARA REMOÇÃO ──');
  const porLote = new Map();
  for (const a of alvos) {
    const k = a.data.arquivo;
    if (!porLote.has(k)) porLote.set(k, { n: 0, soma: 0, comFFFD: 0, vMin: 'zzz', vMax: '' });
    const b = porLote.get(k);
    b.n++;
    b.soma += Number(a.data.valor_original) || 0;
    const txt = [a.data.categoria, a.data.entidade, a.data.entidade_txt, a.data.observacao]
      .filter(v => typeof v === 'string').join(' | ');
    if (txt.includes('�')) b.comFFFD++;
    const v = String(a.data.data_vencimento || '');
    if (v && v < b.vMin) b.vMin = v;
    if (v && v > b.vMax) b.vMax = v;
  }
  for (const [lote, b] of porLote) {
    const hs = [...(hashesPorLote.get(lote) || [])];
    console.log(`  ${lote}`);
    console.log(`     docs: ${b.n} | com U+FFFD: ${b.comFFFD} | soma R$ ${fmtBRL(b.soma)}`);
    console.log(`     vencimento: ${b.vMin} .. ${b.vMax}`);
    console.log(`     arquivo_hash (${hs.length} distinto/s): ${hs.map(h => h.slice(0, 16) + '…').join(', ')}`);
  }
  const somaTotal = alvos.reduce((s, a) => s + (Number(a.data.valor_original) || 0), 0);
  console.log(`\n  TOTAL A REMOVER: ${alvos.length} documentos · R$ ${fmtBRL(somaTotal)}`);

  // ── Amostra ─────────────────────────────────────────────────────────────
  console.log('\n── AMOSTRA (10 primeiros) ──');
  alvos.slice(0, 10).forEach(a => {
    console.log(`  ${a.id} | ${a.data.data_vencimento} | R$ ${String(fmtBRL(a.data.valor_original)).padStart(12)} | ${a.data.categoria} | ${a.data.entidade}`);
  });

  // ── SALVAGUARDAS ────────────────────────────────────────────────────────
  console.log('\n── SALVAGUARDAS ──');

  console.log(`  [1] Docs com nome de lote afetado mas RECUSADOS pelas travas: ${recusadosNoLote.length}`);
  if (recusadosNoLote.length) {
    console.log('      ATENÇÃO — inspecionar antes de prosseguir:');
    recusadosNoLote.slice(0, 20).forEach(r =>
      console.log(`        ${r.id} | ${r.arquivo} | origem=${r.origem} | tem arquivo_hash=${r.temHash}`));
  } else {
    console.log('      OK — todos os docs dos 3 lotes têm arquivo_hash e origem=' + ORIGEM_ESPERADA + '.');
  }

  const porOrigemJanela = new Map();
  for (const j of janelaIntactos) porOrigemJanela.set(j.origem, (porOrigemJanela.get(j.origem) || 0) + 1);
  console.log(`\n  [2] Docs com vencimento em ${JANELA_INI}..${JANELA_FIM} FORA dos 3 lotes: ${janelaIntactos.length}`);
  console.log('      (NÃO serão tocados — inclui lançamentos manuais e recorrências projetadas)');
  for (const [o, n] of [...porOrigemJanela].sort((a, b) => b[1] - a[1])) {
    console.log(`        ${String(n).padStart(6)} | origem: ${o}`);
  }

  const foraDosLotes = snap.size - alvos.length;
  console.log(`\n  [3] Documentos preservados na coleção: ${foraDosLotes} de ${snap.size}`);

  // ── Execução ────────────────────────────────────────────────────────────
  if (!APPLY) {
    console.log('\n' + '='.repeat(74));
    console.log('DRY-RUN concluído. NADA foi alterado.');
    console.log('Para executar de verdade, revise a lista acima e rode com --apply.');
    console.log('='.repeat(74));
    process.exit(0);
  }

  if (!alvos.length) {
    console.log('\nNada a remover. Encerrando.');
    process.exit(0);
  }

  // Backup ANTES de apagar — a remoção é irreversível sem ele.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(__dirname, `backup-lotes-corrompidos-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify(alvos, null, 2), 'utf8');
  console.log(`\nBackup gravado: ${backup} (${alvos.length} docs)`);

  console.log('\nRemovendo…');
  let apagados = 0;
  for (let i = 0; i < alvos.length; i += CHUNK) {
    const fatia = alvos.slice(i, i + CHUNK);
    const batch = db.batch();
    for (const a of fatia) batch.delete(db.collection(COLECAO).doc(a.id));
    await batch.commit();
    apagados += fatia.length;
    console.log(`  ${apagados}/${alvos.length}`);
  }

  const conf = await db.collection(COLECAO).get();
  const restantes = conf.docs.filter(d => LOTES.includes((d.data() || {}).arquivo)).length;
  console.log(`\nRemovidos: ${apagados}. Docs remanescentes dos 3 lotes: ${restantes} (esperado 0).`);
  console.log(`Coleção agora: ${conf.size} documentos.`);
  console.log('\nPRÓXIMO PASSO: reimportar os 3 arquivos com o importador corrigido.');
  process.exit(restantes === 0 ? 0 : 1);
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
