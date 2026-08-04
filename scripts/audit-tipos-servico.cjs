/**
 * audit-tipos-servico.cjs
 * ------------------------------------------------------------------
 * Script READ-ONLY de investigação (OS-FILTRO-SERVICO-DINAMICO-01).
 *
 * Levanta, na coleção Lancamentos:
 *   1. Quais campos carregam o "tipo de serviço" e com que frequência.
 *   2. Os valores DISTINTOS brutos (com contagem).
 *   3. Os valores distintos após normalização (NFD + UPPER + trim + espaços).
 *   4. Quais deles são cobertos pelas 10 opções hardcoded do filtro atual
 *      e quais ficam órfãos (invisíveis no filtro hoje).
 *
 * USO:
 *   node scripts/audit-tipos-servico.cjs
 *
 * Auth: GOOGLE_APPLICATION_CREDENTIALS (ver referência ADC).
 * NÃO FAZ NENHUMA ESCRITA.
 */
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT_ID = 'centra-fin';
const COLLECTION = 'Lancamentos';

initializeApp({ projectId: PROJECT_ID, credential: applicationDefault() });
const db = getFirestore();

// Ordem de precedência usada HOJE pelo filtro (code.html:3121)
const CAMPOS_FILTRO = ['descricao', 'Descrição Do Contrato', 'Tipo de Serviço', 'tipo_servico'];
// Ordem usada pelo resto do sistema (obterFaturamentoReal / auditarServicosNaoMapeados)
const CAMPOS_CANON = ['descricao_contrato', 'Descrição Do Contrato', 'Tipo de Serviço', 'tipo_servico', 'descricao'];

// As 10 opções fixas do <select id="filtro-tipo-servico">
const HARDCODED = ['UNIDADES', 'TEMPORARIO', 'ESTAGIO', 'CONSULTORIA', 'PROCESSAMENTO DE PPA',
  'RPO', 'ASSESSMENT', 'TREINAMENTO', 'SUBSCRIPTION', 'HOTMART'];

// Keywords canônicas de core_rules.js (grupo1 + grupo2)
const KEYWORDS_CORE = ['TEMPORARIO', 'ESTAGIO', 'TERCEIROS', 'FOPAG', 'CONSULTORIA', 'RPO',
  'TREINAMENTO', 'PROCESSAMENTO DE PPA', 'SUBSCRIPTION', 'HR METRICS', 'INTEGRACAO',
  'UNIDADES', 'DEVOLUTIVA', 'ASSESSMENT', 'HOTMART'];

const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

(async () => {
  const snap = await db.collection(COLLECTION).get();
  console.log(`Total de documentos em ${COLLECTION}: ${snap.size}\n`);

  const presencaCampo = {};
  const brutos = new Map();      // valor bruto -> contagem
  const normalizados = new Map(); // valor normalizado -> { count, variantes:Set }
  let semServico = 0;
  let divergenciaPrecedencia = 0;

  snap.forEach(doc => {
    const d = doc.data();

    // 1. presença de cada campo candidato
    [...new Set([...CAMPOS_FILTRO, ...CAMPOS_CANON])].forEach(c => {
      if (d[c] !== undefined && d[c] !== null && String(d[c]).trim() !== '') {
        presencaCampo[c] = (presencaCampo[c] || 0) + 1;
      }
    });

    const pega = (campos) => {
      for (const c of campos) {
        const v = d[c];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
      }
      return '';
    };

    const vFiltro = pega(CAMPOS_FILTRO);
    const vCanon = pega(CAMPOS_CANON);
    if (norm(vFiltro) !== norm(vCanon)) divergenciaPrecedencia++;

    const val = vCanon;
    if (!val || val === '-') { semServico++; return; }

    brutos.set(val, (brutos.get(val) || 0) + 1);
    const n = norm(val);
    if (!normalizados.has(n)) normalizados.set(n, { count: 0, variantes: new Set() });
    const reg = normalizados.get(n);
    reg.count++;
    reg.variantes.add(val);
  });

  console.log('=== 1. PRESENÇA DOS CAMPOS CANDIDATOS ===');
  Object.entries(presencaCampo).sort((a, b) => b[1] - a[1])
    .forEach(([c, n]) => console.log(`  ${String(n).padStart(6)} docs  ->  ${c}`));
  console.log(`  ${String(semServico).padStart(6)} docs  ->  (sem tipo de serviço)`);
  console.log(`\n  Docs onde a precedência do FILTRO diverge da CANÔNICA: ${divergenciaPrecedencia}\n`);

  console.log('=== 2. VALORES DISTINTOS (normalizados) ===');
  const ordenado = [...normalizados.entries()].sort((a, b) => b[1].count - a[1].count);
  console.log(`  Total de valores distintos BRUTOS........: ${brutos.size}`);
  console.log(`  Total de valores distintos NORMALIZADOS..: ${normalizados.size}\n`);
  ordenado.forEach(([n, reg]) => {
    const dup = reg.variantes.size > 1 ? `  [${reg.variantes.size} variantes de digitação: ${[...reg.variantes].map(v => JSON.stringify(v)).join(' | ')}]` : '';
    console.log(`  ${String(reg.count).padStart(6)}x  ${n}${dup}`);
  });

  console.log('\n=== 3. COBERTURA PELO FILTRO HARDCODED (match por substring) ===');
  const orfaos = [];
  ordenado.forEach(([n, reg]) => {
    const bate = HARDCODED.some(h => n.includes(norm(h)));
    if (!bate) orfaos.push([n, reg.count]);
  });
  console.log(`  Valores distintos INVISÍVEIS no filtro atual: ${orfaos.length}`);
  orfaos.forEach(([n, c]) => console.log(`    ${String(c).padStart(6)}x  ${n}`));

  console.log('\n=== 4. KEYWORDS CANÔNICAS (core_rules) x FILTRO ===');
  KEYWORDS_CORE.forEach(k => {
    const ocorrencias = ordenado.filter(([n]) => n.includes(norm(k)))
      .reduce((s, [, r]) => s + r.count, 0);
    const noFiltro = HARDCODED.includes(k) ? 'SIM' : 'NÃO';
    console.log(`  ${k.padEnd(24)} docs=${String(ocorrencias).padStart(6)}   no filtro: ${noFiltro}`);
  });

  process.exit(0);
})().catch(e => { console.error('ERRO:', e); process.exit(1); });
