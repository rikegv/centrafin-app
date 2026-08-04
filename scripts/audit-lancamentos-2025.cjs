/**
 * audit-lancamentos-2025.cjs
 * ------------------------------------------------------------------
 * Script READ-ONLY de auditoria: conta lançamentos de 2025 por
 * mês/competência e soma valores, para comparar com a planilha original.
 *
 * Também detecta colisões na chave de idempotência (normChaveDoc)
 * para dimensionar o risco de reimportação.
 *
 * USO:
 *   node scripts/audit-lancamentos-2025.cjs
 *
 * Auth: GOOGLE_APPLICATION_CREDENTIALS (ver referência ADC).
 * NÃO FAZ NENHUMA ESCRITA.
 */
const admin = require('firebase-admin');

const PROJECT_ID = 'centra-fin';
const COLLECTION = 'Lancamentos';

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

// Mesma normalização do importador (code.html:2403-2404)
const normChaveDoc = (rps, cnpj) =>
  `${String(rps ?? '').replace(/\s+/g, ' ').trim().toUpperCase()}__${String(cnpj ?? '').replace(/\D/g, '')}`;

function serialExcelToDate(serial) {
  if (typeof serial !== 'number' || serial < 1) return null;
  const d = new Date((serial - 25569) * 86400000);
  return isNaN(d.getTime()) ? null : d;
}

function extrairAnoMes(doc) {
  const campos = [
    'competencia_ref',
    'Dt Emissao',       // sem acento — nome real no banco
    'Dt Emissão',
    'data_emissao',
    'Dt Vecto',         // sem ponto — nome real no banco
    'Dt Vencto.',
    'data_vencimento',
  ];
  for (const campo of campos) {
    const val = doc[campo];
    if (val === null || val === undefined || val === '') continue;

    // Serial Excel (número)
    if (typeof val === 'number' && val > 1 && val < 60000) {
      const d = serialExcelToDate(val);
      if (d) return { ano: d.getFullYear(), mes: d.getMonth() + 1, fonte: campo };
    }

    // Firestore Timestamp
    if (val._seconds !== undefined || (typeof val.toDate === 'function')) {
      try {
        const d = typeof val.toDate === 'function' ? val.toDate() : new Date(val._seconds * 1000);
        if (!isNaN(d.getTime())) return { ano: d.getFullYear(), mes: d.getMonth() + 1, fonte: campo };
      } catch (_) { /* fallthrough */ }
    }
    if (val instanceof Date && !isNaN(val.getTime())) {
      return { ano: val.getFullYear(), mes: val.getMonth() + 1, fonte: campo };
    }

    const s = String(val).trim();
    if (!s) continue;
    let m = s.match(/^(\d{4})-(\d{2})/);
    if (m) return { ano: parseInt(m[1]), mes: parseInt(m[2]), fonte: campo };
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return { ano: parseInt(m[3]), mes: parseInt(m[2]), fonte: campo };

    const num = parseFloat(s);
    if (!isNaN(num) && num > 1 && num < 60000) {
      const d = serialExcelToDate(num);
      if (d) return { ano: d.getFullYear(), mes: d.getMonth() + 1, fonte: campo + '(str)' };
    }
  }
  return null;
}

function parseMoeda(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const s = String(val).trim();
  if (!s) return 0;
  // Tenta parse direto
  const n = parseFloat(s.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

async function main() {
  console.log('=== AUDITORIA READ-ONLY: Lancamentos 2025 ===\n');
  console.log('Buscando todos os Lancamentos tipo=receita...\n');

  const snap = await db.collection(COLLECTION).where('tipo', '==', 'receita').get();
  console.log(`Total de documentos tipo=receita: ${snap.size}\n`);

  // ── 1. Contagem e soma por mês/competência (2025) ──
  const porMes = {};       // "2025-MM" → { count, valorFatura, valorLiquido }
  const porAno = {};       // "YYYY" → count
  let semData = 0;
  let total2025 = 0;

  // ── 2. Detecção de colisões na chave de idempotência ──
  const chaveMap = new Map();  // chave → [{ id, rps, cnpj, status, valorFatura }]

  // ── 3. Docs com data_importacao (para identificar a importação que falhou) ──
  const importacoes = new Map();  // "YYYY-MM-DD HH:mm" → count

  snap.forEach((docSnap) => {
    const data = docSnap.data();

    // Chave de idempotência
    const nf = String(data.nf || data['Nº NF'] || data['Nº NF-e'] || data.NF || data.rps || '');
    const cnpj = data.cnpj || data['CNPJ Cliente'] || '';
    const chave = normChaveDoc(nf, cnpj);
    if (nf.replace(/\s+/g, ' ').trim()) {
      if (!chaveMap.has(chave)) chaveMap.set(chave, []);
      chaveMap.get(chave).push({
        id: docSnap.id,
        rps: nf,
        cnpj: cnpj,
        status: data.status || data.Status || '',
        valorFatura: parseMoeda(data['Valor Fatura'] || data.valor_fatura || 0),
        origem_parcelamento: !!data.origem_parcelamento,
        parent_rps: data.parent_rps || '',
        parent_id: data.parent_id || '',
      });
    }

    // Data de importação
    if (data.data_importacao) {
      let di;
      try {
        di = typeof data.data_importacao.toDate === 'function'
          ? data.data_importacao.toDate()
          : new Date(data.data_importacao._seconds ? data.data_importacao._seconds * 1000 : data.data_importacao);
      } catch (_) { di = null; }
      if (!di || isNaN(di.getTime())) return;
      const key = di.toISOString().slice(0, 16).replace('T', ' ');
      importacoes.set(key, (importacoes.get(key) || 0) + 1);
    }

    // Competência / data
    const info = extrairAnoMes(data);
    if (!info) { semData++; return; }

    const anoStr = String(info.ano);
    porAno[anoStr] = (porAno[anoStr] || 0) + 1;

    if (info.ano !== 2025) return;
    total2025++;

    const mesKey = `2025-${String(info.mes).padStart(2, '0')}`;
    if (!porMes[mesKey]) porMes[mesKey] = { count: 0, valorFatura: 0, valorLiquido: 0 };
    porMes[mesKey].count++;
    porMes[mesKey].valorFatura += parseMoeda(data['Valor Fatura'] || data.valor_fatura || 0);
    porMes[mesKey].valorLiquido += parseMoeda(data.valor_liquido || data['Vl. Líquido'] || 0);
  });

  // ── RELATÓRIO 1: Distribuição por ano ──
  console.log('── Distribuição por ANO (todos os registros receita) ──');
  Object.keys(porAno).sort().forEach(ano => {
    console.log(`  ${ano}: ${porAno[ano]} docs`);
  });
  console.log(`  Sem data identificável: ${semData}`);
  console.log();

  // ── RELATÓRIO 2: Detalhamento 2025 por mês ──
  console.log('── DETALHAMENTO 2025 por mês ──');
  console.log(`${'Mês'.padEnd(10)} ${'Qtd'.padStart(6)} ${'Valor Fatura'.padStart(18)} ${'Valor Líquido'.padStart(18)}`);
  console.log('-'.repeat(54));

  let somaFatura = 0, somaLiquido = 0, somaCount = 0;
  Object.keys(porMes).sort().forEach(mes => {
    const m = porMes[mes];
    somaFatura += m.valorFatura;
    somaLiquido += m.valorLiquido;
    somaCount += m.count;
    console.log(
      `${mes.padEnd(10)} ${String(m.count).padStart(6)} ${m.valorFatura.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).padStart(18)} ${m.valorLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).padStart(18)}`
    );
  });
  console.log('-'.repeat(54));
  console.log(
    `${'TOTAL'.padEnd(10)} ${String(somaCount).padStart(6)} ${somaFatura.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).padStart(18)} ${somaLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).padStart(18)}`
  );
  console.log();

  // ── RELATÓRIO 3: Colisões na chave de idempotência ──
  const colisoes = [];
  chaveMap.forEach((docs, chave) => {
    if (docs.length > 1) {
      colisoes.push({ chave, docs });
    }
  });

  console.log(`── COLISÕES na chave de idempotência (normChaveDoc) ──`);
  console.log(`Total de chaves únicas: ${chaveMap.size}`);
  console.log(`Chaves com COLISÃO (>1 doc): ${colisoes.length}`);
  console.log();

  if (colisoes.length > 0) {
    // Ordenar por quantidade de colisões (maior primeiro)
    colisoes.sort((a, b) => b.docs.length - a.docs.length);

    // Classificar colisões
    let colParcelamento = 0;
    let colDuplicata = 0;
    let colOutro = 0;

    colisoes.forEach(({ chave, docs }) => {
      const temFilha = docs.some(d => d.origem_parcelamento || d.parent_rps);
      if (temFilha) colParcelamento++;
      else {
        const statusSet = new Set(docs.map(d => String(d.status).toUpperCase()));
        if (statusSet.size === 1) colDuplicata++;
        else colOutro++;
      }
    });

    console.log(`  Por parcelamento (parent_rps/origem_parcelamento): ${colParcelamento}`);
    console.log(`  Possíveis duplicatas (mesmo status): ${colDuplicata}`);
    console.log(`  Outros: ${colOutro}`);
    console.log();

    // Listar os primeiros 30 casos (ou todos se < 30)
    const mostrar = colisoes.slice(0, 30);
    console.log(`── Primeiros ${mostrar.length} casos de colisão (de ${colisoes.length} total) ──`);
    mostrar.forEach(({ chave, docs }) => {
      console.log(`\n  CHAVE: ${chave} (${docs.length} docs)`);
      docs.forEach(d => {
        const flags = [];
        if (d.origem_parcelamento) flags.push('PARCELA');
        if (d.parent_rps) flags.push(`parent=${d.parent_rps}`);
        console.log(`    ID: ${d.id}  RPS: "${d.rps}"  Status: ${d.status}  Fatura: ${d.valorFatura.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}  ${flags.join(' ')}`);
      });
    });
    console.log();
  }

  // ── RELATÓRIO 4: Importações por timestamp ──
  console.log('── Importações por data/hora (data_importacao) ──');
  const importList = [...importacoes.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (importList.length === 0) {
    console.log('  Nenhum doc com data_importacao encontrado.');
  } else {
    // Agrupar por dia
    const porDia = {};
    importList.forEach(([ts, count]) => {
      const dia = ts.slice(0, 10);
      if (!porDia[dia]) porDia[dia] = 0;
      porDia[dia] += count;
    });
    Object.keys(porDia).sort().forEach(dia => {
      console.log(`  ${dia}: ${porDia[dia]} docs importados`);
    });
  }
  console.log();

  console.log('=== FIM DA AUDITORIA (somente leitura) ===');
  process.exit(0);
}

main().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
