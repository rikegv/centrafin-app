#!/usr/bin/env node
/**
 * fix-cc-os-cc-lista-completa.cjs — OS-CC-LISTA-COMPLETA-01
 *
 * Duas correções pontuais em produção, ambas decididas pelo diretor em 2026-09-04:
 *
 *  [A] Fornecedor 2395 (PATRICIA VALERIO BARROSO): centro_custo
 *      "TEAM TAILOR" -> "COMERCIAL TEAM TAILOR".
 *      Motivo: "TEAM TAILOR" é duplicata por digitação e existe em UM único lugar
 *      no sistema — o cadastro dela. Como o ETL de Contas a Pagar HERDA o CC do
 *      cadastro no momento da importação, deixar assim faria as notas FUTURAS
 *      dela caírem num CC diferente das anteriores (que já estão sob
 *      "COMERCIAL TEAM TAILOR"), partindo o histórico de custo em dois.
 *      Não exige backfill: a nota antiga já está no CC correto.
 *
 *  [B] Base_Centros_Custo: remover o documento cujo `nome` é "." — sentinela de
 *      quarentena do ETL da Folha que vazou para a UI de permissão. Zero
 *      ocorrências em CustosFolha, ContasAPagar e Fornecedores.
 *      NÃO remove DADOS / RAFUL COZINHA CENTRAL / SDR / SUPORTE: o diretor
 *      confirmou que são CCs reais.
 *
 * DRY-RUN POR PADRÃO. Só escreve com --apply.
 *
 *   node scripts/fix-cc-os-cc-lista-completa.cjs           # só mostra
 *   node scripts/fix-cc-os-cc-lista-completa.cjs --apply   # aplica
 */

const fs = require('fs');
const path = require('path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const APPLY = process.argv.includes('--apply');

const FORN_ID = '2395';
const CC_ERRADO = 'TEAM TAILOR';
const CC_CORRETO = 'COMERCIAL TEAM TAILOR';
const RESIDUO_NOME = '.';
const PRESERVAR = ['DADOS', 'RAFUL COZINHA CENTRAL', 'SDR', 'SUPORTE'];

(async () => {
  initializeApp({ projectId: 'centra-fin', credential: applicationDefault() });
  const db = getFirestore();

  console.log('='.repeat(76));
  console.log('OS-CC-LISTA-COMPLETA-01 — correções pontuais');
  console.log('MODO:', APPLY ? '*** APPLY — VAI ESCREVER EM PRODUÇÃO ***' : 'DRY-RUN (nada será alterado)');
  console.log('='.repeat(76));

  // ── [A] Cadastro 2395 ───────────────────────────────────────────────────
  console.log('\n[A] FORNECEDOR 2395 — correção de centro_custo\n');
  const ref = db.collection('Fornecedores').doc(FORN_ID);
  const snapA = await ref.get();
  let planoA = null;

  if (!snapA.exists) {
    console.log(`    ERRO: documento Fornecedores/${FORN_ID} não existe. Nada a fazer.`);
  } else {
    const x = snapA.data() || {};
    const atual = String(x.centro_custo || '').trim();
    console.log('    ANTES');
    console.log(`      docId:        ${FORN_ID}`);
    console.log(`      nome:         ${JSON.stringify(x.nome)}`);
    console.log(`      codigo:       ${JSON.stringify(x.codigo)}`);
    console.log(`      tipo:         ${JSON.stringify(x.tipo)}`);
    console.log(`      empresa:      ${JSON.stringify(x.empresa)}`);
    console.log(`      centro_custo: ${JSON.stringify(x.centro_custo)}`);
    if (atual === CC_ERRADO) {
      planoA = { ref, de: atual, para: CC_CORRETO };
      console.log('    DEPOIS');
      console.log(`      centro_custo: ${JSON.stringify(CC_CORRETO)}   <<< ÚNICO CAMPO ALTERADO`);
      console.log('      (updated_at / updated_by NÃO são tocados por este script)');
    } else if (atual === CC_CORRETO) {
      console.log('    -> já está correto. Nada a fazer.');
    } else {
      console.log(`    -> ATENÇÃO: valor inesperado ${JSON.stringify(atual)}.`);
      console.log(`       Esperado ${JSON.stringify(CC_ERRADO)}. ABORTANDO por segurança.`);
      process.exit(1);
    }
  }

  // ── [B] Resíduo "." ─────────────────────────────────────────────────────
  console.log('\n[B] Base_Centros_Custo — remoção do resíduo "."\n');
  const bcc = await db.collection('Base_Centros_Custo').get();
  const alvosB = bcc.docs.filter(d => String((d.data() || {}).nome || '').trim() === RESIDUO_NOME);

  console.log(`    coleção tem ${bcc.size} documentos`);
  console.log(`    documentos com nome === "." : ${alvosB.length}`);
  alvosB.forEach(d => console.log(`      docId=${d.id} | dados=${JSON.stringify(d.data())}`));

  console.log('\n    SALVAGUARDA — os 4 CCs que o diretor mandou PRESERVAR:');
  for (const nome of PRESERVAR) {
    const achou = bcc.docs.find(d => String((d.data() || {}).nome || '').trim() === nome);
    console.log(`      ${achou ? 'PRESENTE  ' : 'AUSENTE   '} ${JSON.stringify(nome)}${achou ? ' (docId=' + achou.id + ') — NÃO será tocado' : ''}`);
  }
  const outros = bcc.docs.filter(d => {
    const n = String((d.data() || {}).nome || '').trim();
    return n !== RESIDUO_NOME;
  }).length;
  console.log(`\n    Documentos que permanecem na coleção: ${outros} de ${bcc.size}`);

  // ── Execução ────────────────────────────────────────────────────────────
  if (!APPLY) {
    console.log('\n' + '='.repeat(76));
    console.log('DRY-RUN concluído. NADA foi alterado.');
    console.log('Revise [A] e [B] acima e rode com --apply para aplicar.');
    console.log('='.repeat(76));
    process.exit(0);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(__dirname, `backup-os-cc-lista-completa-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify({
    fornecedor_2395: snapA.exists ? snapA.data() : null,
    base_centros_custo_removidos: alvosB.map(d => ({ id: d.id, data: d.data() })),
  }, null, 2), 'utf8');
  console.log(`\nBackup gravado: ${backup}`);

  if (planoA) {
    await planoA.ref.update({ centro_custo: planoA.para });
    console.log(`[A] Fornecedor ${FORN_ID}: "${planoA.de}" -> "${planoA.para}" OK`);
  } else {
    console.log('[A] nada a aplicar.');
  }

  for (const d of alvosB) {
    await d.ref.delete();
    console.log(`[B] Base_Centros_Custo/${d.id} removido.`);
  }
  if (!alvosB.length) console.log('[B] nada a remover.');

  // Conferência pós-escrita
  const confA = await ref.get();
  const confB = await db.collection('Base_Centros_Custo').get();
  const aindaPonto = confB.docs.filter(d => String((d.data() || {}).nome || '').trim() === RESIDUO_NOME).length;
  const preservados = PRESERVAR.filter(n => confB.docs.some(d => String((d.data() || {}).nome || '').trim() === n));
  console.log('\nCONFERÊNCIA');
  console.log(`  Fornecedor ${FORN_ID}.centro_custo = ${JSON.stringify((confA.data() || {}).centro_custo)}`);
  console.log(`  Base_Centros_Custo: ${confB.size} docs | com "." : ${aindaPonto} (esperado 0)`);
  console.log(`  Preservados encontrados: ${preservados.length}/${PRESERVAR.length} — ${preservados.join(', ')}`);
  process.exit(aindaPonto === 0 ? 0 : 1);
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
