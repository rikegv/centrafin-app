/**
 * test-import-robustez.cjs
 * ------------------------------------------------------------------
 * Testa a importação de Lancamentos no emulador, replicando fielmente
 * a lógica do browser (contas_a_receber_desktop/code.html).
 *
 * Testes:
 *   (a) Importar 5.639 registros, validar contagem e soma.
 *   (b) Reimportar os mesmos 5.639 — zero criados, todos atualizados.
 *   (c) Relatório bate com os números.
 *
 * USO:
 *   firebase emulators:start &   (porta 8080 Firestore, 9099 Auth)
 *   node scripts/test-import-robustez.cjs "caminho/para/planilha.xlsx"
 *
 * NÃO FAZ NENHUMA ESCRITA EM PRODUÇÃO — apenas no emulador local.
 */
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const XLSX = require('xlsx');
const path = require('path');

// ── Config ──
const EMULATOR_HOST = 'localhost:8080';
const PROJECT_ID = 'centra-fin';
const COLLECTION = 'Lancamentos';
const TAMANHO_LOTE = 450;

// Apontar para emulador
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
admin.initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

// ── parseMoedaCRF (réplica exata de core_rules.js:19-40) ──
function parseMoedaCRF(val) {
  if (typeof val === 'number' && isFinite(val)) return val;
  if (val === null || val === undefined) return 0;
  let s = String(val).trim();
  if (s === '' || s === '-') return 0;
  s = s.replace(/[R$\s]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

// ── normChaveDoc (réplica exata de code.html:2403-2404) ──
const normChaveDoc = (rps, cnpj) =>
  `${String(rps ?? '').replace(/\s+/g, ' ').trim().toUpperCase()}__${String(cnpj ?? '').replace(/\D/g, '')}`;

// ── serialExcelToDate (timezone-safe, réplica de parseDataLocal do core_rules.js) ──
function serialExcelToDate(serial) {
  if (typeof serial !== 'number' || serial < 1) return null;
  const dUtc = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return new Date(dUtc.getUTCFullYear(), dUtc.getUTCMonth(), dUtc.getUTCDate());
}

// ── Colunas obrigatórias (réplica exata de code.html:2143-2152) ──
const COLUNAS_OBRIGATORIAS = [
  "Nº NF", "Valor Fatura", "Valor Unitário", "Quantidade", "Taxa", "Tributo", "Valor INSS", "Valor IRRF",
  "Valor PIS", "Valor COFINS", "Valor CSLL", "Valor ISS", "Valor Caução", "Valor Multa", "Valor Juros",
  "Valor Descto.", "Vl. Líquido", "Pagto Parcial", "Dt Emissao", "Dt Vecto", "Dt Baixa", "Dt Credito",
  "Cliente", "CNPJ Cliente", "Cd.Cliente", "CTR", "TPF", "Descrição Do Contrato", "Centro Custo",
  "Tel.Cliente", "Cidade do Cliente", "Situação", "Região", "Comissionado 01", "Vendedor",
  "Cpt.Primeiro Fat.", "Cpt.Primeiro Dup.", "Nº NF-e", "Cod.", "Grupo Econômico", "% ISS",
  "Situação ISS", "Opções Cálculo ISS", "Percentual Tributo", "Perc.Fat.", "Centro Resultado",
  "Banco", "Status", "Valor Baixa", "Usuário Inclusão", "Obs. Emissão"
];

const TOKENS_LIXO = ['PLANILHA DE FATURAMENTO', 'EMPRESA:', 'AGENCIAMENTO', 'CONTRATADO'];
const normalizarCelula = (v) => String(v || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().toUpperCase();

// ── Ler e parsear planilha (réplica do ETL do browser) ──
function lerPlanilha(filePath) {
  console.log(`Lendo planilha: ${filePath}`);
  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawAoA = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

  // Encontrar cabeçalho
  let headerIndex = -1;
  for (let i = 0; i < rawAoA.length; i++) {
    const row = rawAoA[i];
    const normalizedRow = row.map(cell => String(cell || "").trim().toUpperCase());
    const hasNF = normalizedRow.includes('Nº NF') || normalizedRow.includes('Nº NF-E') || normalizedRow.includes('NF');
    const hasValorFatura = normalizedRow.some(c => c.includes('VALOR FATURA') || c.includes('FATURA'));
    if (hasNF && hasValorFatura) { headerIndex = i; break; }
  }
  if (headerIndex === -1) throw new Error("Cabeçalho não encontrado");

  const actualHeader = rawAoA[headerIndex];
  const cleanedRows = [];

  for (let i = headerIndex + 1; i < rawAoA.length; i++) {
    const row = rawAoA[i];
    if (row.every(cell => cell === null || cell === undefined || String(cell).trim() === "")) continue;
    const firstCellNormalized = String(row[0] || "").trim().toUpperCase();
    const firstCellSemAcento = normalizarCelula(row[0]);
    if (firstCellNormalized.includes('TEMPORÁRIO') || firstCellNormalized.includes('TEMPORARIO')) continue;
    if (firstCellNormalized === 'Nº NF' || firstCellNormalized === 'NF') continue;
    if (firstCellNormalized.includes('TOTAL') || firstCellNormalized.includes('TOTAIS')) continue;
    if (row.some(c => String(c).trim().toUpperCase().includes('TOTAL GERAL'))) continue;
    if (TOKENS_LIXO.some(tok => firstCellSemAcento.includes(tok))) continue;
    cleanedRows.push(row);
  }

  // Mapear colunas
  const headerMap = {};
  actualHeader.forEach((col, idx) => { if (col) headerMap[String(col).trim().toUpperCase()] = idx; });

  const mappedRaw = cleanedRows.map((row) => {
    const obj = {};
    COLUNAS_OBRIGATORIAS.forEach(colName => {
      const idxNoExcel = headerMap[colName.toUpperCase()];
      obj[colName] = (idxNoExcel !== undefined && row[idxNoExcel] !== undefined) ? row[idxNoExcel] : "";
    });
    return obj;
  });

  // Sanitização: descartar placeholders
  const mappedData = mappedRaw.filter((item) => {
    const clienteNorm = normalizarCelula(item['Cliente']);
    const vFaturaParsed = parseMoedaCRF(item['Valor Fatura']);
    if (clienteNorm === 'CLIENTE NAO INFORMADO' && vFaturaParsed === 0) return false;
    return true;
  });

  console.log(`Linhas lidas após sanitização: ${mappedData.length}`);
  return mappedData;
}

// ── ETL: transformar linha da planilha em docData (réplica de code.html:2416-2482) ──
function transformarLinhaEmDoc(item) {
  const docData = {};
  COLUNAS_OBRIGATORIAS.forEach(col => {
    let val = item[col];
    const isNumeric = col.toLowerCase().includes('valor') || col.toLowerCase().includes('vl.') || col.includes('%') || col.toLowerCase().includes('taxa') || col.toLowerCase().includes('tributo') || col.toLowerCase().includes('perc') || col === 'Quantidade';
    if (val === null || val === undefined || String(val).trim() === "") val = isNumeric ? 0 : "";
    docData[col] = val;
  });

  const vlLiquidoBruto = parseMoedaCRF(item['Vl. Líquido'] !== undefined ? item['Vl. Líquido'] : item['Valor Líquido']);
  const valorDesconto = parseMoedaCRF(item['Valor Descto.'] !== undefined ? item['Valor Descto.'] : item['Desconto']);
  const valorLiquidoFinal = Number((vlLiquidoBruto - valorDesconto).toFixed(2));
  docData['Vl. Líquido'] = vlLiquidoBruto;
  docData['Valor Descto.'] = valorDesconto;
  docData['valor_liquido'] = valorLiquidoFinal;
  docData['Taxa'] = parseMoedaCRF(item['Taxa'] || item['Valor Taxa'] || item['Vl. Taxa'] || 0);

  docData.rps = item['Nº NF'] || item['N° NF'] || item['NF'] || "";
  docData.numero_nfe = item['Nº NF-e'] || item['N° NF-e'] || "";
  docData.tipo = 'receita';

  let statusBase = item['Status'] || item['Situação'] || 'Faturado';
  const temBaixa = item['Dt Baixa'] || item['data_baixa'] || item['data_recebimento'];
  if (temBaixa && String(temBaixa).trim() !== "") {
    statusBase = "RECEBIDO";
  }
  if (!docData.status) docData.status = statusBase;
  docData.data_importacao = new Date();

  const vFatura = parseMoedaCRF(item['Valor Fatura']);
  const vBaixa = parseMoedaCRF(item['Valor Baixa'] || item['Pagto Parcial']);
  const saldo_residual = vFatura - vBaixa;
  docData.saldo_residual = saldo_residual;

  if (vBaixa > 0) {
    if (saldo_residual > 0) docData.tipo_divergencia = "DEBITO";
    else if (saldo_residual < 0) docData.tipo_divergencia = "CREDITO";
    else docData.tipo_divergencia = "PAGO INTEGRAL";
  } else {
    docData.tipo_divergencia = "";
  }

  docData['Valor Fatura'] = vFatura;

  return docData;
}

// ── Fase de dedup (réplica de code.html:2387-2482) ──
async function classificarNovosVsExistentes(dadosTransformados) {
  console.log('Buscando documentos existentes no emulador...');
  const snap = await db.collection(COLLECTION).where('tipo', '==', 'receita').get();
  console.log(`Docs existentes: ${snap.size}`);

  const mapExistentes = new Map();
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const nf = String(data.nf || data['Nº NF'] || data['Nº NF-e'] || data.NF || data.rps || '');
    const cnpj = data.cnpj || data['CNPJ Cliente'] || '';
    if (nf.replace(/\s+/g, ' ').trim()) {
      mapExistentes.set(normChaveDoc(nf, cnpj), { id: docSnap.id, ...data });
    }
  });

  const novos = [];
  const atualizados = [];

  for (const docData of dadosTransformados) {
    const nfExcelNorm = String(docData.rps ?? '').replace(/\s+/g, ' ').trim();
    const chaveExcel = normChaveDoc(docData.rps, docData['cnpj'] || docData['CNPJ Cliente'] || '');

    if (nfExcelNorm && mapExistentes.has(chaveExcel)) {
      const existente = mapExistentes.get(chaveExcel);
      docData.idExistente = existente.id;
      docData.comercialAntigo = existente['Comissionado 01'] || existente['Vendedor'];
      docData.historico_comercial_existente = existente.historico_comercial || [];
      atualizados.push(docData);
    } else {
      novos.push(docData);
    }
  }

  return { novos, atualizados };
}

// ── Importação em writeBatch (réplica da nova processarSalvamentoImportacao) ──
async function processarSalvamentoImportacao(novos, atualizados) {
  let criados = 0;
  let atualizadosOk = 0;
  const falhas = [];
  const totalOps = novos.length + atualizados.length;

  // FASE 1: Novos em lotes
  const lotesNovos = [];
  for (let i = 0; i < novos.length; i += TAMANHO_LOTE) {
    lotesNovos.push(novos.slice(i, i + TAMANHO_LOTE));
  }

  for (let idx = 0; idx < lotesNovos.length; idx++) {
    const processados = (idx * TAMANHO_LOTE) + lotesNovos[idx].length;
    process.stdout.write(`\r  Criando lote ${idx + 1} de ${lotesNovos.length} — ${processados} de ${novos.length}   `);

    const batch = db.batch();
    const docsNoLote = [];
    for (const docData of lotesNovos[idx]) {
      const nfRef = docData.rps || docData['Nº NF'] || '(sem NF)';
      delete docData.idExistente;
      delete docData.comercialAntigo;
      delete docData.historico_comercial_existente;
      const novoDocRef = db.collection(COLLECTION).doc();
      batch.set(novoDocRef, docData);
      docsNoLote.push(nfRef);
    }

    try {
      await batch.commit();
      criados += lotesNovos[idx].length;
    } catch (errLote) {
      for (const nf of docsNoLote) {
        falhas.push({ nf, motivo: errLote.message || String(errLote) });
      }
    }
  }
  if (novos.length > 0) console.log();

  // FASE 2: Atualizados em lotes
  const lotesAtualiz = [];
  for (let i = 0; i < atualizados.length; i += TAMANHO_LOTE) {
    lotesAtualiz.push(atualizados.slice(i, i + TAMANHO_LOTE));
  }

  for (let idx = 0; idx < lotesAtualiz.length; idx++) {
    const processados = (idx * TAMANHO_LOTE) + lotesAtualiz[idx].length;
    process.stdout.write(`\r  Atualizando lote ${idx + 1} de ${lotesAtualiz.length} — ${processados} de ${atualizados.length}   `);

    const batch = db.batch();
    const docsNoLote = [];
    for (const docData of lotesAtualiz[idx]) {
      const idDoc = docData.idExistente;
      const nfRef = docData.rps || docData['Nº NF'] || '(sem NF)';
      delete docData.idExistente;

      const updatePayload = {
        'Dt Baixa': docData['Dt Baixa'] || "",
        'Valor Baixa': docData['Valor Baixa'] || 0,
        'Status': docData['Status'] || "",
        'saldo_residual': docData.saldo_residual || 0,
        'tipo_divergencia': docData.tipo_divergencia || "",
        data_edicao: new Date()
      };
      const novoComercial = docData['Comissionado 01'] || docData['Vendedor'];
      const antigoComercial = docData.comercialAntigo;
      if (novoComercial && antigoComercial && novoComercial !== antigoComercial) {
        updatePayload.historico_comercial = docData.historico_comercial_existente || [];
        updatePayload.historico_comercial.push({
          comercial_antigo: antigoComercial,
          comercial_novo: novoComercial,
          data_alteracao: new Date().toISOString()
        });
        updatePayload['Comissionado 01'] = novoComercial;
      }

      delete docData.comercialAntigo;
      delete docData.historico_comercial_existente;
      if (docData.status) updatePayload.status = docData.status;

      batch.update(db.collection(COLLECTION).doc(idDoc), updatePayload);
      docsNoLote.push(nfRef);
    }

    try {
      await batch.commit();
      atualizadosOk += lotesAtualiz[idx].length;
    } catch (errLote) {
      for (const nf of docsNoLote) {
        falhas.push({ nf, motivo: errLote.message || String(errLote) });
      }
    }
  }
  if (atualizados.length > 0) console.log();

  return { criados, atualizadosOk, falhas, totalOps };
}

// ── Validação: contar docs e somar valores por mês ──
async function validarResultados(esperado) {
  console.log('\nValidando resultados no emulador...');
  const snap = await db.collection(COLLECTION).where('tipo', '==', 'receita').get();
  console.log(`Total de docs receita no emulador: ${snap.size}`);

  let somaValorFatura = 0;
  const porMes = {};

  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const vf = parseMoedaCRF(data['Valor Fatura'] || data.valor_fatura || 0);
    somaValorFatura += vf;

    // Extrair mês pela Dt Emissao (serial Excel)
    const dtEmissao = data['Dt Emissao'] || data['Dt Emissão'];
    if (typeof dtEmissao === 'number' && dtEmissao > 1) {
      const d = serialExcelToDate(dtEmissao);
      if (d && d.getFullYear() === 2025) {
        const mesKey = d.getMonth() + 1;
        porMes[mesKey] = (porMes[mesKey] || 0) + 1;
      }
    }
  });

  console.log(`\n── Validação vs. esperado ──`);
  const checkDocs = snap.size === esperado.totalDocs;
  console.log(`  Docs: ${snap.size} ${checkDocs ? '✓' : '✗'} (esperado: ${esperado.totalDocs})`);

  const somaArred = Number(somaValorFatura.toFixed(2));
  const checkSoma = Math.abs(somaArred - esperado.somaValorFatura) < 0.02;
  console.log(`  Valor Fatura total: R$ ${somaArred.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ${checkSoma ? '✓' : '✗'} (esperado: R$ ${esperado.somaValorFatura.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`);
  if (!checkSoma) {
    console.log(`  DIFERENÇA: R$ ${(somaArred - esperado.somaValorFatura).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  }

  console.log(`\n  Distribuição por mês:`);
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  let mesOk = true;
  for (let m = 1; m <= 12; m++) {
    const real = porMes[m] || 0;
    const esp = esperado.porMes[m] || 0;
    const ok = real === esp;
    if (!ok) mesOk = false;
    console.log(`    ${meses[m - 1].padEnd(4)} ${String(real).padStart(4)} ${ok ? '✓' : '✗'} (esperado: ${esp})`);
  }

  return { docsOk: checkDocs, somaOk: checkSoma, mesOk };
}

// ── Main ──
async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Uso: node scripts/test-import-robustez.cjs "<caminho-da-planilha>"');
    process.exit(1);
  }

  const esperado = {
    totalDocs: 5639,
    somaValorFatura: 94799626.63,
    porMes: { 1: 722, 2: 588, 3: 497, 4: 433, 5: 430, 6: 380, 7: 365, 8: 400, 9: 427, 10: 423, 11: 404, 12: 570 }
  };

  // ══════════════════════════════════════════════════
  // TESTE (a): Importar 5.639 registros
  // ══════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log('TESTE (a): Importar base 2025 completa');
  console.log('═'.repeat(60));

  const dados = lerPlanilha(filePath);
  const dadosTransformados = dados.map(transformarLinhaEmDoc);
  console.log(`Docs transformados: ${dadosTransformados.length}`);

  const { novos: novosA, atualizados: atualizadosA } = await classificarNovosVsExistentes(dadosTransformados);
  console.log(`Novos: ${novosA.length} | Já existentes: ${atualizadosA.length}`);

  const resultA = await processarSalvamentoImportacao(novosA, atualizadosA);
  console.log(`\n  RELATÓRIO TESTE (a):`);
  console.log(`    Criados:     ${resultA.criados}`);
  console.log(`    Atualizados: ${resultA.atualizadosOk}`);
  console.log(`    Falhados:    ${resultA.falhas.length}`);

  if (resultA.falhas.length > 0) {
    console.log(`    Primeiras 10 falhas:`);
    resultA.falhas.slice(0, 10).forEach(f => console.log(`      NF ${f.nf}: ${f.motivo}`));
  }

  const valA = await validarResultados(esperado);
  const testeAOk = valA.docsOk && valA.somaOk && valA.mesOk && resultA.falhas.length === 0;
  console.log(`\n  TESTE (a): ${testeAOk ? 'PASSOU ✓' : 'FALHOU ✗'}`);

  // ══════════════════════════════════════════════════
  // TESTE (b): Reimportar — zero criados
  // ══════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log('TESTE (b): Reimportar mesma base — zero duplicatas');
  console.log('═'.repeat(60));

  // Reler e retransformar (simula nova importação completa)
  const dados2 = lerPlanilha(filePath);
  const dadosTransformados2 = dados2.map(transformarLinhaEmDoc);

  const { novos: novosB, atualizados: atualizadosB } = await classificarNovosVsExistentes(dadosTransformados2);
  console.log(`Novos: ${novosB.length} | Já existentes: ${atualizadosB.length}`);

  if (novosB.length > 0) {
    console.log(`\n  ⚠ ALERTA: ${novosB.length} registros classificados como NOVOS na reimportação!`);
    console.log(`  Primeiros 10 "novos" suspeitos:`);
    novosB.slice(0, 10).forEach(d => {
      console.log(`    NF: "${d.rps}" CNPJ: "${d['CNPJ Cliente']}" Chave: ${normChaveDoc(d.rps, d['CNPJ Cliente'])}`);
    });
  }

  const resultB = await processarSalvamentoImportacao(novosB, atualizadosB);
  console.log(`\n  RELATÓRIO TESTE (b):`);
  console.log(`    Criados:     ${resultB.criados} (esperado: 0)`);
  console.log(`    Atualizados: ${resultB.atualizadosOk} (esperado: ${esperado.totalDocs})`);
  console.log(`    Falhados:    ${resultB.falhas.length} (esperado: 0)`);

  // Validar que não duplicou
  const snapCheck = await db.collection(COLLECTION).where('tipo', '==', 'receita').get();
  const testeBOk = resultB.criados === 0 && resultB.atualizadosOk === esperado.totalDocs && resultB.falhas.length === 0 && snapCheck.size === esperado.totalDocs;
  console.log(`  Docs após reimportação: ${snapCheck.size} (esperado: ${esperado.totalDocs})`);
  console.log(`\n  TESTE (b): ${testeBOk ? 'PASSOU ✓' : 'FALHOU ✗'}`);

  // ══════════════════════════════════════════════════
  // TESTE (c): Relatório final
  // ══════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log('TESTE (c): Relatório final confere');
  console.log('═'.repeat(60));

  console.log(`  Teste (a) relatório: criados=${resultA.criados} atualizados=${resultA.atualizadosOk} falhados=${resultA.falhas.length}`);
  const relAOk = resultA.criados === esperado.totalDocs && resultA.atualizadosOk === 0 && resultA.falhas.length === 0;
  console.log(`    Esperado: criados=${esperado.totalDocs} atualizados=0 falhados=0 → ${relAOk ? '✓' : '✗'}`);

  console.log(`  Teste (b) relatório: criados=${resultB.criados} atualizados=${resultB.atualizadosOk} falhados=${resultB.falhas.length}`);
  const relBOk = resultB.criados === 0 && resultB.atualizadosOk === esperado.totalDocs && resultB.falhas.length === 0;
  console.log(`    Esperado: criados=0 atualizados=${esperado.totalDocs} falhados=0 → ${relBOk ? '✓' : '✗'}`);

  const testeCOk = relAOk && relBOk;
  console.log(`\n  TESTE (c): ${testeCOk ? 'PASSOU ✓' : 'FALHOU ✗'}`);

  // ══════════════════════════════════════════════════
  // RESULTADO FINAL
  // ══════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log('RESULTADO FINAL');
  console.log('═'.repeat(60));
  console.log(`  Teste (a) — Importação completa:    ${testeAOk ? 'PASSOU ✓' : 'FALHOU ✗'}`);
  console.log(`  Teste (b) — Zero duplicatas:        ${testeBOk ? 'PASSOU ✓' : 'FALHOU ✗'}`);
  console.log(`  Teste (c) — Relatório confere:      ${testeCOk ? 'PASSOU ✓' : 'FALHOU ✗'}`);
  const todosOk = testeAOk && testeBOk && testeCOk;
  console.log(`\n  VEREDICTO: ${todosOk ? 'TODOS OS TESTES PASSARAM ✓' : 'ALGUM TESTE FALHOU ✗'}`);
  console.log('═'.repeat(60));

  process.exit(todosOk ? 0 : 1);
}

main().catch(err => {
  console.error('ERRO FATAL:', err);
  process.exit(1);
});
