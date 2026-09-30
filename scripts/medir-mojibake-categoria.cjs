/**
 * OS-CP-PACOTE-ONDAS-01 — MEDICAO SOMENTE LEITURA, rodada 2.
 *
 * NAO ESCREVE NADA.
 *
 * Fecha tres lacunas da rodada 1:
 *   1. O regex de mojibake da rodada 1 saiu corrompido na escrita do arquivo
 *      (virou /[AA][-?]|A[-]|A[^\s]/ depois do mangle). Aqui o padrao e escrito
 *      com escapes \u para nao poder ser corrompido: a assinatura de UTF-8 lido
 *      como Latin-1 e U+00C3 ou U+00C2 seguido de um byte na faixa 80..BF.
 *   2. Mojibake em ContasAPagar.categoria, que NUNCA foi medido e e a ancora
 *      candidata do modelo de 3 niveis da Onda 4.
 *   3. O universo real da dimensao Empresa: Base_Empresas cru (com os docs sem
 *      nome) contra os valores distintos de Fornecedores.empresa.
 */
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ credential: applicationDefault(), projectId: 'centra-fin' });
const db = getFirestore();

// Assinatura de UTF-8 lido como Latin-1/CP1252: Ã ou Â seguido de 0x80..0xBF.
const MOJI = /[ÃÂ][-¿]/;
const FFFD = /�/;

(async () => {
  const [despSnap, lancSnap, fornSnap, empSnap] = await Promise.all([
    db.collection('CP_Base_Despesas').get(),
    db.collection('ContasAPagar').select('categoria').get(),
    db.collection('Fornecedores').select('empresa').get(),
    db.collection('Base_Empresas').get(),
  ]);

  console.log('\n=== 1. CP_Base_Despesas, mojibake com o padrao CORRETO ===');
  let dMoji = 0, dFffd = 0;
  const exemplos = [];
  despSnap.forEach((d) => {
    const v = d.data();
    const alvo = `${v.despesa || ''} ${v.despesa_norm || ''}`;
    if (MOJI.test(alvo)) { dMoji++; if (exemplos.length < 8) exemplos.push(v.despesa); }
    if (FFFD.test(alvo)) dFffd++;
  });
  console.log(`  docs: ${despSnap.size} | com Ã/Â: ${dMoji} | com U+FFFD: ${dFffd}`);
  console.log(`  exemplos: ${exemplos.map((s) => JSON.stringify(s)).join(' , ')}`);

  console.log('\n=== 2. ContasAPagar.categoria, mojibake (a ancora da Onda 4) ===');
  const cats = new Map();
  lancSnap.forEach((d) => {
    const c = String(d.data().categoria ?? '');
    cats.set(c, (cats.get(c) || 0) + 1);
  });
  let catsMoji = 0, docsMoji = 0, catsFffd = 0, docsFffd = 0;
  const listaMoji = [];
  for (const [c, n] of cats) {
    if (MOJI.test(c)) { catsMoji++; docsMoji += n; listaMoji.push([c, n]); }
    if (FFFD.test(c)) { catsFffd++; docsFffd += n; }
  }
  console.log(`  valores distintos de categoria: ${cats.size}`);
  console.log(`  distintos com Ã/Â: ${catsMoji}  (afetando ${docsMoji} docs)`);
  console.log(`  distintos com U+FFFD: ${catsFffd}  (afetando ${docsFffd} docs)`);
  if (listaMoji.length) {
    console.log(`  os corrompidos:`);
    for (const [c, n] of listaMoji.sort((a, b) => b[1] - a[1]))
      console.log(`    ${JSON.stringify(c)} -> ${n} docs`);
  } else {
    console.log(`  NENHUM. A ancora categoria esta limpa dos dois tipos de corrupcao.`);
  }

  console.log('\n=== 3. Dimensao EMPRESA, o universo real ===');
  console.log(`  Base_Empresas, doc por doc (${empSnap.size} docs):`);
  empSnap.forEach((d) => {
    const v = d.data();
    console.log(`    id=${d.id}  campos=${JSON.stringify(v)}`);
  });
  const emps = new Map();
  fornSnap.forEach((d) => {
    const e = String(d.data().empresa ?? '').trim();
    emps.set(e, (emps.get(e) || 0) + 1);
  });
  console.log(`\n  Fornecedores.empresa, valores distintos: ${emps.size}`);
  for (const [e, n] of [...emps.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`    ${JSON.stringify(e || '(VAZIO)')} -> ${n} fornecedores`);

  console.log('\n=== FIM (nenhuma escrita realizada) ===');
  process.exit(0);
})().catch((e) => { console.error('ERRO:', e && e.message ? e.message : e); process.exit(1); });
