#!/usr/bin/env node
/**
 * OS-CP-PACOTE-ONDAS-01 / FRENTE 4 (Onda 4)
 * Semeia/atualiza `Metadados/CP_Catalogo_Categorias`.
 *
 * POR QUE ESTE DOC EXISTE: a tela de cadastro de Grupos vive no `master.html`, que
 * NAO carrega /ContasAPagar. Sem este catalogo, para listar os tipos de despesa a
 * vincular o master teria que ler 51.181 documentos a cada abertura. Com ele, le UM.
 * E ele entrega de graca as tres coisas que fazem o trabalho manual caber: a lista
 * dos tipos, o VOLUME de lancamentos de cada um (para ordenar pelo que importa) e o
 * total, que alimenta o contador de saude do cadastro.
 *
 * NAO cria documento em CP_Tipos_Despesa: aquela colecao guarda apenas os VINCULOS
 * que o diretor fizer. Catalogo e vinculo sao coisas diferentes de proposito, e
 * semear 104 vinculos vazios criaria duas listas para manter em sincronia.
 *
 * `Metadados` NAO precisou de regra nova: o match /Metadados/{docId} ja cobre
 * (conferido pelo agente backend no emulador, 4 casos verdes).
 *
 * DRY-RUN POR PADRAO. Aplica so com --apply. NUNCA APAGA NADA: grava UM doc de
 * chave fixa, e faz backup do estado anterior dele antes.
 *
 * USO:
 *   GOOGLE_APPLICATION_CREDENTIALS=<adc.json> node scripts/seed-catalogo-categorias-cp.cjs
 *   GOOGLE_APPLICATION_CREDENTIALS=<adc.json> node scripts/seed-catalogo-categorias-cp.cjs --apply
 */
const fs = require('fs');
const path = require('path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const APPLY = process.argv.includes('--apply');
const COL_META = 'Metadados';
const DOC_ID = 'CP_Catalogo_Categorias';

initializeApp({ credential: applicationDefault(), projectId: 'centra-fin' });
const db = getFirestore();

// MESMA semantica de `_cpChaveFiltro` do Gerenciador: colapsa espaco interno, apara
// borda, sobe caixa, e PRESERVA ACENTO de proposito. Tirar acento ja juntou valores
// distintos no Faturamento (incidente "ESTAGIO", 2026-06-19), e um tipo de despesa
// contabil nao pode ser fundido com outro por causa de acento.
const chaveTipo = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

// Slug determinístico do docId do vinculo. Idempotente: reseed nunca duplica.
const slugTipo = (s) => chaveTipo(s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 180) || 'SEM_TIPO';

(async () => {
  console.log(`\n=== ${APPLY ? 'APLICANDO' : 'DRY-RUN (nada sera gravado)'} ===`);

  const snap = await db.collection('ContasAPagar').select('categoria').get();
  const porChave = new Map(); // chave -> { tipo (grafia mais comum), docs, grafias:Map }
  let semCategoria = 0;
  snap.forEach((d) => {
    const bruto = String((d.data() || {}).categoria ?? '');
    if (!bruto.trim()) { semCategoria++; return; }
    const k = chaveTipo(bruto);
    if (!porChave.has(k)) porChave.set(k, { docs: 0, grafias: new Map() });
    const e = porChave.get(k);
    e.docs++;
    e.grafias.set(bruto, (e.grafias.get(bruto) || 0) + 1);
  });

  const itens = [...porChave.entries()].map(([k, e]) => {
    // Rotulo exibido = a grafia MAIS FREQUENTE na base, nao a chave em caixa alta:
    // o diretor precisa reconhecer o nome que ele ve no ERP.
    const grafia = [...e.grafias.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { tipo: grafia.trim(), tipo_norm: k, slug: slugTipo(k), docs: e.docs };
  }).sort((a, b) => b.docs - a.docs);

  const totalDocs = itens.reduce((s, i) => s + i.docs, 0);
  console.log(`\nlancamentos lidos ........ ${snap.size}`);
  console.log(`sem categoria ............ ${semCategoria}`);
  console.log(`tipos de despesa distintos ${itens.length}`);
  console.log(`docs cobertos pelo catalogo ${totalDocs}`);

  // Colisao de slug seria fusao silenciosa de dois tipos contabeis distintos.
  const porSlug = new Map();
  for (const i of itens) {
    if (!porSlug.has(i.slug)) porSlug.set(i.slug, []);
    porSlug.get(i.slug).push(i.tipo_norm);
  }
  const colisoes = [...porSlug.entries()].filter(([, v]) => v.length > 1);
  if (colisoes.length) {
    console.log(`\n*** ABORTANDO: ${colisoes.length} colisao(oes) de slug. Dois tipos distintos`);
    console.log(`    receberiam o MESMO docId de vinculo, o que os fundiria em silencio:`);
    for (const [s, v] of colisoes) console.log(`      slug "${s}" <- ${v.map(x => JSON.stringify(x)).join(' , ')}`);
    process.exit(1);
  }
  console.log(`slugs unicos ............. OK, ${porSlug.size} para ${itens.length} tipos`);

  console.log(`\nOS 15 MAIORES POR VOLUME (e o que o cadastro mostra primeiro):`);
  let acum = 0;
  itens.slice(0, 15).forEach((i, n) => {
    acum += i.docs;
    console.log(`  ${String(n + 1).padStart(2)}. ${String(i.docs).padStart(5)} docs  ${i.tipo}`);
  });
  console.log(`  os 15 primeiros cobrem ${acum} de ${totalDocs} docs (${((acum / totalDocs) * 100).toFixed(1)}%)`);

  const payload = { atualizado_em: '<serverTimestamp>', total_docs: totalDocs, total_tipos: itens.length, itens };
  const tamanho = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  console.log(`\ntamanho do documento: ${(tamanho / 1024).toFixed(1)} KB (limite do Firestore: 1024 KB)`);
  if (tamanho > 900 * 1024) { console.log('*** ABORTANDO: perto do limite de 1 MiB.'); process.exit(1); }

  if (!APPLY) {
    console.log(`\nDRY-RUN concluido. NADA foi gravado. Rode com --apply depois da conferencia.`);
    process.exit(0);
  }

  const ref = db.collection(COL_META).doc(DOC_ID);
  const antes = await ref.get();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const arq = path.join(__dirname, `backup-catalogo-categorias-${stamp}.json`);
  fs.writeFileSync(arq, JSON.stringify({
    doc: `${COL_META}/${DOC_ID}`, existia: antes.exists,
    conteudo_anterior: antes.exists ? antes.data() : null,
  }, null, 2));
  console.log(`\nbackup do estado anterior: ${arq}`);

  await ref.set({
    atualizado_em: FieldValue.serverTimestamp(),
    atualizado_por: 'seed-catalogo-categorias-cp.cjs',
    total_docs: totalDocs,
    total_tipos: itens.length,
    itens,
  }, { merge: false });
  console.log(`GRAVADO: /${COL_META}/${DOC_ID} com ${itens.length} tipos.`);

  const conf = await ref.get();
  const d = conf.data() || {};
  console.log(`\nCONFERENCIA pos-escrita: total_tipos=${d.total_tipos} total_docs=${d.total_docs} itens=${(d.itens || []).length}`);
  process.exit(0);
})().catch((e) => { console.error('ERRO:', e && e.message ? e.message : e); process.exit(1); });
