#!/usr/bin/env node
/**
 * fix-mojibake-cp.cjs — OS-CP-CORRIGE-NOMES-01 · FASE 2 (correção in-place)
 * ------------------------------------------------------------------------
 * Corrige os nomes corrompidos por U+FFFD ("�") IN-PLACE, via update() só do
 * campo afetado. NUNCA apaga, NUNCA recria, NUNCA reimporta. Preserva todos os
 * demais campos do documento. De-para aprovado pelo diretor na Fase 1.
 *
 * SEGURANÇA:
 *  - DRY-RUN por padrão. Só escreve com --apply.
 *  - Backup do estado anterior (docs afetados INTEGRAIS) gravado ANTES de
 *    qualquer escrita, em scripts/backup-*.json (gitignore + hosting ignore).
 *  - str_replace literal do valor corrompido pelo correto; se sobrar "�" no
 *    campo depois da troca, o doc é PULADO e reportado (corrupção não prevista).
 *  - Contagem de docs conferida antes/depois (deve ser idêntica).
 *
 * USO:
 *   GOOGLE_APPLICATION_CREDENTIALS=<adc.json> node scripts/fix-mojibake-cp.cjs
 *   GOOGLE_APPLICATION_CREDENTIALS=<adc.json> node scripts/fix-mojibake-cp.cjs --apply
 */
const fs = require('fs');
const path = require('path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const FFFD = '�';
const APPLY = process.argv.includes('--apply');
const COLECOES = ['CP_Base_Despesas', 'ContasAPagar'];
const CHUNK = 400;

// De-para APROVADO (Fase 1). Chave = string corrompida exata; valor = correta.
// 19 strings únicas (as 22 linhas colapsam: MINISTÉRIO/SERVIÇOS MANUT./VALE
// REFEIÇÃO aparecem em mais de um campo, mesma troca).
const DE_PARA = {
  'TARIFAS E COMISS�ES BANC�RIAS': 'TARIFAS E COMISSÕES BANCÁRIAS',
  'SAL�RIO L�QUIDO A PAGAR - CONT': 'SALÁRIO LÍQUIDO A PAGAR - CONT',
  'RELAT�RIO DE DESPESAS - INTERN': 'RELATÓRIO DE DESPESAS - INTERN',
  'VALE TRANSPORTE - C�LCULO - IN': 'VALE TRANSPORTE - CÁLCULO - IN',
  'OUTROS SERVI�OS PROFISSIONAIS': 'OUTROS SERVIÇOS PROFISSIONAIS',
  'CONTRIBUI��ES A SINDICATOS - F': 'CONTRIBUIÇÕES A SINDICATOS - F',
  'GIOVANNA DE F�TIMA ROBERTI': 'GIOVANNA DE FÁTIMA ROBERTI',
  'MINIST�RIO DA FAZENDA': 'MINISTÉRIO DA FAZENDA',
  'ASSESSORIA CONT�BIL P.J. - INT': 'ASSESSORIA CONTÁBIL P.J. - INT',
  'PR�MIOS/GRATIFICA��ES/BONIFICA': 'PRÊMIOS/GRATIFICAÇÕES/BONIFICA',
  'RESCIS�ES A PAGAR - CONTRATADO': 'RESCISÕES A PAGAR - CONTRATADO',
  'VALE REFEI��O - C�LCULO - INTE': 'VALE REFEIÇÃO - CÁLCULO - INTE',
  'EXAMES M�DICOS - CLIENTES': 'EXAMES MÉDICOS - CLIENTES',
  'ASSIST�NCIA M�DICA/ODONTOL�GIC': 'ASSISTÊNCIA MÉDICA/ODONTOLÓGIC',
  'AN�NCIOS E PUBLICA��ES - INTER': 'ANÚNCIOS E PUBLICAÇÕES - INTER',
  'TAXAS DE LICEN�A E FUNCIONAMEN': 'TAXAS DE LICENÇA E FUNCIONAMEN',
  'SERVI�OS DE MANUTEN��O DE INFO': 'SERVIÇOS DE MANUTENÇÃO DE INFO',
  'F�RIAS L�QUIDAS A PAGAR - CONT': 'FÉRIAS LÍQUIDAS A PAGAR - CONT',
  'EVENTOS E PROMO��ES - INTERNOS': 'EVENTOS E PROMOÇÕES - INTERNOS',
};

// Invariantes do de-para (falha fechada se algo estiver torto).
for (const [de, para] of Object.entries(DE_PARA)) {
  if (!de.includes(FFFD)) throw new Error(`de-para inválido (sem "�"): ${de}`);
  if (para.includes(FFFD)) throw new Error(`de-para inválido (para tem "�"): ${para}`);
  if (de.length !== para.length) throw new Error(`de-para de comprimento diferente: "${de}" (${de.length}) vs "${para}" (${para.length})`);
}

function corrigir(valor) {
  let novo = valor;
  for (const [de, para] of Object.entries(DE_PARA)) {
    if (novo.indexOf(de) >= 0) novo = novo.split(de).join(para);
  }
  return novo;
}

(async () => {
  initializeApp({ projectId: 'centra-fin', credential: applicationDefault() });
  const db = getFirestore();

  console.log('='.repeat(76));
  console.log('OS-CP-CORRIGE-NOMES-01 · FASE 2 · CORREÇÃO IN-PLACE');
  console.log('MODO:', APPLY ? '*** APPLY — VAI ESCREVER EM PRODUÇÃO ***' : 'DRY-RUN (nada será alterado)');
  console.log('='.repeat(76));

  // Contagem ANTES (invariante: não pode mudar).
  const countAntes = {};
  for (const col of COLECOES) countAntes[col] = (await db.collection(col).count().get()).data().count;
  console.log('Contagem de docs ANTES:', JSON.stringify(countAntes));

  // Varre e planeja as mudanças.
  const plano = [];      // {col, id, field, before, after, ref}
  const backup = [];     // {col, id, data} — doc INTEGRAL antes
  const naoPrevistos = []; // {col, id, field, value} — sobrou "�" fora do de-para
  const afetadosPorCol = {};

  for (const col of COLECOES) {
    afetadosPorCol[col] = new Set();
    process.stderr.write(`[fase2] varrendo ${col}...\n`);
    let lidos = 0;
    await new Promise((resolve, reject) => {
      const stream = db.collection(col).stream();
      stream.on('data', (doc) => {
        lidos++;
        const data = doc.data() || {};
        let docTemMudanca = false;
        for (const [field, value] of Object.entries(data)) {
          if (typeof value !== 'string' || value.indexOf(FFFD) < 0) continue;
          const novo = corrigir(value);
          if (novo.indexOf(FFFD) >= 0) {
            naoPrevistos.push({ col, id: doc.id, field, value });
            continue; // não escreve doc com corrupção não prevista
          }
          if (novo !== value) {
            plano.push({ col, id: doc.id, field, before: value, after: novo, ref: doc.ref });
            docTemMudanca = true;
          }
        }
        if (docTemMudanca) {
          afetadosPorCol[col].add(doc.id);
          backup.push({ col, id: doc.id, data });
        }
        if (lidos % 10000 === 0) process.stderr.write(`  ...${lidos}\n`);
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });
  }

  // Relatório do plano.
  console.log('\n── PLANO DE CORREÇÃO (antes -> depois) ──');
  const porColCampo = {};
  for (const p of plano) {
    const k = `${p.col}.${p.field}`;
    porColCampo[k] = (porColCampo[k] || 0) + 1;
  }
  // Agrupa por (field, before) para exibir compacto.
  const agrup = new Map();
  for (const p of plano) {
    const k = `${p.col}|${p.field}|${p.before}`;
    if (!agrup.has(k)) agrup.set(k, { col: p.col, field: p.field, before: p.before, after: p.after, n: 0 });
    agrup.get(k).n++;
  }
  for (const g of [...agrup.values()].sort((a, b) => b.n - a.n)) {
    console.log(`  [${g.col}.${g.field}] "${g.before}" -> "${g.after}"  (${g.n} doc)`);
  }
  console.log('\nResumo por coleção/campo:', JSON.stringify(porColCampo));
  console.log('Docs afetados:', Object.fromEntries(Object.entries(afetadosPorCol).map(([c, s]) => [c, s.size])));
  console.log('Total de campos a corrigir:', plano.length);
  if (naoPrevistos.length) {
    console.log('\n⚠️  CORRUPÇÃO NÃO PREVISTA (NÃO será escrita, requer decisão):', naoPrevistos.length);
    naoPrevistos.slice(0, 20).forEach(x => console.log(`   [${x.col}/${x.id}.${x.field}] ${JSON.stringify(x.value)}`));
  }

  // Backup SEMPRE (mesmo em dry-run) — pasta não servida.
  const scriptsDir = path.join(process.cwd(), 'scripts');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(scriptsDir, `backup-cp-corrige-nomes-${APPLY ? 'apply' : 'dryrun'}-${stamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({ gerado_em: new Date().toISOString(), modo: APPLY ? 'apply' : 'dryrun', de_para: DE_PARA, contagem_antes: countAntes, docs: backup }, null, 2));
  console.log('\nBackup do estado anterior gravado em:', backupFile);
  console.log(`(${backup.length} docs íntegros no backup)`);

  if (!APPLY) {
    console.log('\nDRY-RUN: nenhuma escrita. Rode com --apply após conferência do diretor.');
    const countDepois = {};
    for (const col of COLECOES) countDepois[col] = (await db.collection(col).count().get()).data().count;
    console.log('Contagem AGORA (inalterada):', JSON.stringify(countDepois));
    return;
  }

  // ── APPLY ──────────────────────────────────────────────────────────────
  console.log('\nAPLICANDO via update() em lotes de', CHUNK, '...');
  let escritos = 0;
  for (let i = 0; i < plano.length; i += CHUNK) {
    const fatia = plano.slice(i, i + CHUNK);
    const batch = db.batch();
    for (const p of fatia) batch.update(p.ref, { [p.field]: p.after });
    await batch.commit();
    escritos += fatia.length;
    process.stderr.write(`  ...${escritos}/${plano.length}\n`);
  }
  console.log(`Campos atualizados: ${escritos}`);

  // Verificação pós-escrita.
  const countDepois = {};
  for (const col of COLECOES) countDepois[col] = (await db.collection(col).count().get()).data().count;
  console.log('Contagem de docs DEPOIS:', JSON.stringify(countDepois));
  const contagemOk = COLECOES.every(c => countAntes[c] === countDepois[c]);
  console.log('Contagem inalterada?', contagemOk ? 'SIM ✓' : 'NÃO ✗ (ALERTA!)');

  // Re-scan de "�" restante.
  let restante = 0;
  for (const col of COLECOES) {
    await new Promise((resolve, reject) => {
      const stream = db.collection(col).stream();
      stream.on('data', (doc) => {
        const data = doc.data() || {};
        for (const v of Object.values(data)) if (typeof v === 'string' && v.indexOf(FFFD) >= 0) { restante++; break; }
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });
  }
  console.log('Docs com "�" restante (deve ser 0, exceto não previstos):', restante);
  console.log('Não previstos (esperado):', naoPrevistos.length);
  console.log('\nFIM DA FASE 2 (APPLY).');
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
