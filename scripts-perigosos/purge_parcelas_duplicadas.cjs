/**
 * purge_parcelas_duplicadas.cjs
 * ------------------------------------------------------------------
 * Expurgo cirúrgico de PARCELAS DUPLICADAS no Contas a Receber.
 *
 * Achado de campo (banco real, 2026-06-09): as parcelas foram criadas pelo
 * ETL de importação (NÃO pelo módulo de Split — origem_parcelamento=false).
 * O número vem do ERP com whitespace: "16983 1  " (base + espaço + índice +
 * espaços à direita). A dedup antiga `${nf}_${cnpj}_${emissao}` quebra com
 * esse whitespace/forma da emissão → cada reimport recriou a parcela.
 *
 * Alvo confirmado: nota 16983 (cliente VITALMED, CNPJ 96.706.718/0001-77):
 *   "16983 1" ×3, "16983 2" ×3, "16983 3" ×5  → manter 1 por parcela.
 * Nota 16984 não possui parcelas no banco (verificado) — o script
 * simplesmente não encontra nada para ela.
 *
 * Critério de retenção (keeper) por grupo:
 *   1) status === 'RECEBIDO' (carrega a baixa real) tem prioridade;
 *   2) senão, a de data_importacao mais ANTIGA (registro original);
 *   3) desempate determinístico por id.
 *
 * USO:
 *   node purge_parcelas_duplicadas.cjs            # DRY-RUN (só lê e reporta)
 *   node purge_parcelas_duplicadas.cjs --apply    # executa as exclusões
 *
 * Auth: Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS).
 */
const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
const PROJECT_ID = 'centra-fin';
const COLLECTION = 'Lancamentos';

// Bases-mãe alvo. Casa "16983 1", "16983-1", "16983/1", "16983.1" etc.
// Aceita override via CLI: --maes=16994,16983 (senão usa o set conhecido).
const MAES_ALVO = (() => {
  const arg = process.argv.find((a) => a.startsWith('--maes='));
  if (arg) return arg.slice('--maes='.length).split(',').map((s) => s.trim()).filter(Boolean);
  return ['16984', '16983', '16994'];
})();
const RE_PARCELA = new RegExp(`^(${MAES_ALVO.join('|')})[\\s\\-\\/.]+(\\d+)$`);

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const getRps = (d) => norm(d['rps'] ?? d['Nº NF'] ?? d['Nº NF-e'] ?? d['NF'] ?? '');
function toMillis(v) {
  if (!v) return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v._seconds != null) return v._seconds * 1000;
  if (v instanceof Date) return v.getTime();
  const t = new Date(v).getTime();
  return isNaN(t) ? null : t;
}
const isRecebido = (d) => String(d.status || d.Status || '').toUpperCase() === 'RECEBIDO';
const fmt = (ms) => (ms == null ? '—' : new Date(ms).toISOString().slice(0, 19));

(async () => {
  console.log('==================================================');
  console.log(`🧹 EXPURGO PARCELAS DUPLICADAS — ${APPLY ? '🔴 APPLY (deleta)' : '🟢 DRY-RUN (só lê)'}`);
  console.log(`Coleção: ${COLLECTION} | Mães: ${MAES_ALVO.join(', ')}`);
  console.log('==================================================\n');

  admin.initializeApp({ projectId: PROJECT_ID });
  const db = admin.firestore();

  const snap = await db.collection(COLLECTION).where('tipo', '==', 'receita').get();
  console.log(`Lidos ${snap.size} documentos tipo='receita'.\n`);

  const grupos = new Map();
  snap.forEach((doc) => {
    const data = doc.data();
    const rps = getRps(data);
    if (RE_PARCELA.test(rps)) {
      if (!grupos.has(rps)) grupos.set(rps, []);
      grupos.get(rps).push({ id: doc.id, ref: doc.ref, data });
    }
  });

  if (grupos.size === 0) {
    console.log('Nenhuma parcela das notas-alvo encontrada. Nada a fazer.');
    process.exit(0);
  }

  const aDeletar = [];
  for (const rps of [...grupos.keys()].sort()) {
    const docs = grupos.get(rps);
    console.log(`\n── "${rps}" → ${docs.length} doc(s):`);

    // Ordena candidatos a keeper: RECEBIDO primeiro, depois importacao mais antiga, depois id.
    const ordenado = [...docs].sort((a, b) => {
      const ra = isRecebido(a.data) ? 0 : 1;
      const rb = isRecebido(b.data) ? 0 : 1;
      if (ra !== rb) return ra - rb;
      const ia = toMillis(a.data.data_importacao) ?? Infinity;
      const ib = toMillis(b.data.data_importacao) ?? Infinity;
      if (ia !== ib) return ia - ib;
      return a.id < b.id ? -1 : 1;
    });
    const manter = ordenado[0];

    docs.forEach((d) => {
      const keep = d.id === manter.id;
      console.log(
        `   ${keep ? '✔ MANTER  ' : '✘ DELETAR '} id=${d.id}` +
        ` | status=${d.data.status || d.data.Status || '—'}` +
        ` | valor=${d.data.valor_fatura ?? d.data['Valor Fatura'] ?? '—'}` +
        ` | importacao=${fmt(toMillis(d.data.data_importacao))}`
      );
    });
    aDeletar.push(...docs.filter((d) => d.id !== manter.id));
  }

  console.log(`\n==================================================`);
  console.log(`Resumo: manter ${grupos.size} parcela(s) única(s); deletar ${aDeletar.length} duplicata(s).`);

  if (!APPLY) {
    console.log('🟢 DRY-RUN — nada foi deletado. Rode com --apply para executar.');
    process.exit(0);
  }
  if (aDeletar.length === 0) { console.log('Nada a deletar.'); process.exit(0); }

  const batch = db.batch();
  aDeletar.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  console.log(`🔴 APPLY — ${aDeletar.length} documento(s) deletado(s) com sucesso.`);
  console.log('IDs deletados:', aDeletar.map((d) => d.id).join(', '));
  process.exit(0);
})().catch((err) => {
  console.error('\n❌ Erro:', err.message);
  process.exit(1);
});
