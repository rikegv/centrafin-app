/**
 * OS-CP-PACOTE-ONDAS-01 — MEDICAO SOMENTE LEITURA (Fase 1, insumo do arquiteto).
 *
 * NAO ESCREVE NADA. Nenhum set/update/add/commit neste arquivo.
 * Mede o que o desenho das 4 frentes precisa saber sobre a base real:
 *   F1 (Catarina) : grafias de centro_custo x AreasContasPagar.nome, quem falha no match exato
 *   F2 (cards)    : cobertura de tipo_entidade, valores por tipo com o mesmo expurgo dos KPIs
 *   F3 (empresa)  : quantos lancamentos ja tem `empresa` gravada, quantos herdam, quantos ficam sem
 *   F4 (grupos)   : CP_Base_Despesas, mojibake e ligacao por nome com categoria do lancamento
 */
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ credential: applicationDefault(), projectId: 'centra-fin' });
const db = getFirestore();

const norm = (s) => String(s || '').trim().toUpperCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');
const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ANO_VIGENTE = new Date().getFullYear();
const LIMIAR = `${ANO_VIGENTE}-01-01`;

// Mesma regra de tarifa/comissao do atualizarKPIs (code.html:2766-2774).
function ehTarifa(categoria, entidade) {
  const blob = `${norm(categoria)} ${norm(entidade)}`;
  return blob.includes('TARIFA') || (blob.includes('COMISSAO') && blob.includes('BANC'));
}

async function lerTudo(col, campos) {
  const snap = campos ? await db.collection(col).select(...campos).get() : await db.collection(col).get();
  return snap.docs.map((d) => ({ _id: d.id, ...d.data() }));
}

(async () => {
  const [lanc, forn, areas, empresas, despesas] = await Promise.all([
    lerTudo('ContasAPagar', ['tipo_entidade', 'centro_custo', 'empresa', 'valor_original',
      'categoria', 'entidade', 'data_vencimento', 'codigo_fornecedor']),
    lerTudo('Fornecedores', ['nome', 'codigo', 'empresa', 'centro_custo', 'tipo_entidade']),
    lerTudo('AreasContasPagar', ['nome', 'gestor_nome']),
    lerTudo('Base_Empresas'),
    lerTudo('CP_Base_Despesas'),
  ]);

  console.log(`\n=== VOLUMETRIA ===`);
  console.log(`ContasAPagar ......... ${lanc.length}`);
  console.log(`Fornecedores ......... ${forn.length}`);
  console.log(`AreasContasPagar ..... ${areas.length}`);
  console.log(`Base_Empresas ........ ${empresas.length}`);
  console.log(`CP_Base_Despesas ..... ${despesas.length}`);

  // ---------- F2: cobertura e valor por tipo_entidade ----------
  console.log(`\n=== F2 — TIPO_ENTIDADE no lancamento (universo TOTAL) ===`);
  const porTipo = new Map();
  let tarifaCount = 0, tarifaVal = 0;
  for (const r of lanc) {
    const t = r.tipo_entidade == null || String(r.tipo_entidade).trim() === ''
      ? '(VAZIO/NULL)' : String(r.tipo_entidade);
    const v = Number(r.valor_original) || 0;
    const tar = ehTarifa(r.categoria, r.entidade);
    if (tar) { tarifaCount++; tarifaVal += v; }
    const noAno = String(r.data_vencimento || '') >= LIMIAR;
    if (!porTipo.has(t)) porTipo.set(t, { n: 0, v: 0, nAno: 0, vAno: 0, nAnoSemTarifa: 0, vAnoSemTarifa: 0 });
    const a = porTipo.get(t);
    a.n++; a.v += v;
    if (noAno) { a.nAno++; a.vAno += v; if (!tar) { a.nAnoSemTarifa++; a.vAnoSemTarifa += v; } }
  }
  const ordenado = [...porTipo.entries()].sort((x, y) => y[1].n - x[1].n);
  for (const [t, a] of ordenado) {
    const pct = ((a.n / lanc.length) * 100).toFixed(1);
    console.log(`  ${t.padEnd(28)} total=${String(a.n).padStart(6)} (${pct}%)  ` +
      `${ANO_VIGENTE}_sem_tarifa: ${String(a.nAnoSemTarifa).padStart(5)} docs = ${brl(a.vAnoSemTarifa)}`);
  }
  console.log(`  [tarifa/comissao expurgada, universo total] ${tarifaCount} docs = ${brl(tarifaVal)}`);

  // Simulacao dos cards no recorte que a tela mostra por padrao (ano vigente, sem tarifa).
  const get = (t) => porTipo.get(t) || { nAnoSemTarifa: 0, vAnoSemTarifa: 0 };
  const interno = get('Fornecedor Interno'), pj = get('Fornecedor Interno - PJ');
  const pjVar = get('Fornecedor Interno (PJ)');
  const externo = get('Fornecedor Externo'), cli = get('Cliente'), vazio = get('(VAZIO/NULL)');
  const opexHoje = interno.vAnoSemTarifa + externo.vAnoSemTarifa;
  const internoNovo = interno.vAnoSemTarifa + pj.vAnoSemTarifa + pjVar.vAnoSemTarifa;
  console.log(`\n  --- SIMULACAO DOS CARDS (${ANO_VIGENTE}, tarifa expurgada) ---`);
  console.log(`  OPEX HOJE (Interno CLT + Externo, PJ de fora) ...... ${brl(opexHoje)}`);
  console.log(`  Custo Fornecedor Interno NOVO (CLT + PJ) .......... ${brl(internoNovo)}`);
  console.log(`  Custo Fornecedor Externo NOVO .................... ${brl(externo.vAnoSemTarifa)}`);
  console.log(`  Custo Cliente (mantem) .......................... ${brl(cli.vAnoSemTarifa)}`);
  console.log(`  Sem Classificacao NOVO .......................... ${brl(vazio.vAnoSemTarifa)} (${vazio.nAnoSemTarifa} docs)`);
  console.log(`  DELTA Interno+Externo novo vs OPEX hoje .......... ${brl(internoNovo + externo.vAnoSemTarifa - opexHoje)}`);

  // ---------- F3: empresa no lancamento ----------
  console.log(`\n=== F3 — EMPRESA ===`);
  console.log(`  Base_Empresas: ${empresas.map((e) => e.nome || e._id).join(' | ')}`);
  const fornEmpresa = new Map();
  for (const f of forn) fornEmpresa.set(String(f.codigo ?? '').trim(), String(f.empresa || '').trim());
  let comEmpresaGravada = 0, herdaDoForn = 0, semNada = 0;
  for (const r of lanc) {
    if (String(r.empresa || '').trim()) { comEmpresaGravada++; continue; }
    const cod = r.codigo_fornecedor == null ? '' : String(r.codigo_fornecedor).trim();
    if (cod && fornEmpresa.get(cod)) herdaDoForn++; else semNada++;
  }
  console.log(`  lancamentos com campo `.padEnd(40) + `empresa GRAVADO: ${comEmpresaGravada}`);
  console.log(`  sem campo, mas HERDAM do fornecedor: `.padEnd(40) + `${herdaDoForn}`);
  console.log(`  SEM EMPRESA de jeito nenhum: `.padEnd(40) + `${semNada}  <-- alvo do carimbo em massa`);

  // ---------- F1: match centro_custo x area ----------
  console.log(`\n=== F1 — CATARINA: match centro_custo x AreasContasPagar.nome ===`);
  const mapaExato = new Map();   // como a tela faz hoje: String(nome).trim()
  const mapaNorm = new Map();    // como passaria a fazer: norm()
  for (const a of areas) {
    const nome = String(a.nome || '').trim();
    const g = String(a.gestor_nome || '').trim();
    if (nome) { mapaExato.set(nome, g); mapaNorm.set(norm(nome), g); }
  }
  const ccs = new Map();
  for (const r of lanc) {
    const cc = String(r.centro_custo || '').trim();
    if (!ccs.has(cc)) ccs.set(cc, 0);
    ccs.set(cc, ccs.get(cc) + 1);
  }
  let okHoje = 0, ganhaComNorm = 0, semAreaNenhuma = 0, ccVazio = 0;
  const listaGanho = [], listaSemArea = [];
  for (const [cc, n] of ccs) {
    if (!cc) { ccVazio += n; continue; }
    const temHoje = !!mapaExato.get(cc);
    const temNorm = !!mapaNorm.get(norm(cc));
    if (temHoje) okHoje += n;
    else if (temNorm) { ganhaComNorm += n; listaGanho.push([cc, n, mapaNorm.get(norm(cc))]); }
    else { semAreaNenhuma += n; listaSemArea.push([cc, n]); }
  }
  console.log(`  CCs distintos no lancamento: ${ccs.size}  |  Areas cadastradas: ${areas.length}`);
  console.log(`  docs que JA acham gestor hoje ............ ${okHoje}`);
  console.log(`  docs que GANHAM gestor com normalizacao .. ${ganhaComNorm}   <-- o conserto da F1`);
  console.log(`  docs sem area cadastrada (nem normalizada) ${semAreaNenhuma}  <-- normalizar NAO resolve`);
  console.log(`  docs com centro_custo vazio .............. ${ccVazio}`);
  if (listaGanho.length) {
    console.log(`\n  CCs que a normalizacao conserta (grafia do lancamento -> gestor):`);
    for (const [cc, n, g] of listaGanho.sort((a, b) => b[1] - a[1]))
      console.log(`    "${cc}" (${n} docs) -> ${g}`);
  }
  if (listaSemArea.length) {
    console.log(`\n  CCs SEM area cadastrada (top 25 por volume):`);
    for (const [cc, n] of listaSemArea.sort((a, b) => b[1] - a[1]).slice(0, 25))
      console.log(`    "${cc}" (${n} docs)`);
  }
  // Caso concreto do diretor
  console.log(`\n  --- CASO CATARINA ---`);
  const cat = lanc.filter((r) => norm(r.entidade).includes('CATARINA'));
  console.log(`  lancamentos com entidade contendo CATARINA: ${cat.length}`);
  const grafiasCat = new Map();
  for (const r of cat) {
    const k = `cc="${String(r.centro_custo ?? '')}" | tipo="${String(r.tipo_entidade ?? '')}"`;
    grafiasCat.set(k, (grafiasCat.get(k) || 0) + 1);
  }
  for (const [k, n] of grafiasCat) {
    const cc = k.match(/cc="([^"]*)"/)[1].trim();
    console.log(`    ${k} (${n} docs) -> gestor hoje: "${mapaExato.get(cc) || '(nenhum)'}" ` +
      `| normalizado: "${mapaNorm.get(norm(cc)) || '(nenhum)'}"`);
  }
  const areaComercial = areas.filter((a) => norm(a.nome).includes('COMERCIAL'));
  console.log(`  Areas que casam COMERCIAL: ` +
    (areaComercial.map((a) => `"${a.nome}" -> "${a.gestor_nome || '(sem gestor)'}"`).join(' ; ') || '(nenhuma)'));

  // ---------- F4: CP_Base_Despesas ----------
  console.log(`\n=== F4 — CP_Base_Despesas e ligacao com o lancamento ===`);
  const MOJI = /[ÃÂ][-¿]|Ã[-]|Â[^\s]/;
  let moji = 0;
  const nomesDesp = new Set();
  for (const d of despesas) {
    const alvo = `${d.nome || ''} ${d.descricao || ''} ${d.despesa || ''} ${d.nome_normalizado || ''}`;
    if (MOJI.test(alvo)) moji++;
    for (const k of ['nome', 'descricao', 'despesa']) if (d[k]) nomesDesp.add(norm(d[k]));
  }
  console.log(`  docs em CP_Base_Despesas: ${despesas.length} | com mojibake A-til/A-circ: ${moji}`);
  console.log(`  campos presentes no 1o doc: ${despesas[0] ? Object.keys(despesas[0]).join(', ') : '(vazio)'}`);
  const cats = new Map();
  for (const r of lanc) {
    const c = String(r.categoria || '').trim();
    if (!c) continue;
    cats.set(norm(c), (cats.get(norm(c)) || 0) + 1);
  }
  let catCasa = 0, catNaoCasa = 0;
  const naoCasam = [];
  for (const [c, n] of cats) {
    if (nomesDesp.has(c)) catCasa += n; else { catNaoCasa += n; naoCasam.push([c, n]); }
  }
  console.log(`  categorias distintas no lancamento: ${cats.size}`);
  console.log(`  docs cuja categoria CASA por nome com CP_Base_Despesas ... ${catCasa}`);
  console.log(`  docs cuja categoria NAO casa ............................ ${catNaoCasa}`);
  console.log(`  amostra que nao casa (top 15): ` +
    naoCasam.sort((a, b) => b[1] - a[1]).slice(0, 15).map(([c, n]) => `"${c}"(${n})`).join(' '));
  const semCat = lanc.filter((r) => !String(r.categoria || '').trim()).length;
  console.log(`  docs SEM categoria (nao teriam grupo herdado): ${semCat}`);

  console.log(`\n=== FIM (nenhuma escrita realizada) ===`);
  process.exit(0);
})().catch((e) => { console.error('ERRO:', e && e.message ? e.message : e); process.exit(1); });
