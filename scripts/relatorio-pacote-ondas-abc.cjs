/**
 * OS-CP-PACOTE-ONDAS-01 — RELATORIO (a) (b) (c) PARA O DIRETOR. SOMENTE LEITURA.
 *
 * NAO ESCREVE NADA. Nenhum set/update/add/commit neste arquivo.
 *
 * (a) decisao 1: TODOS os lancamentos com centro de custo que nao casa com area
 *     nenhuma, para o diretor resolver caso a caso. Inclui os FORNECEDORES cujo
 *     cadastro tem CC orfao, que e a fonte dos orfaos futuros.
 * (b) decisao 3: quantos lancamentos e fornecedores estao marcados com os dois
 *     nomes orfaos (RAFUL e SOULAN CONSULTORIA 3), e se ESTAGIO existe no catalogo.
 * (c) decisao 7: quantas faturas ja foram afetadas pela gravacao indevida da
 *     empresa derivada em runtime, e por qual caminho.
 */
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ credential: applicationDefault(), projectId: 'centra-fin' });
const db = getFirestore();

const chave = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

(async () => {
  const [lancSnap, fornSnap, areaSnap, empSnap] = await Promise.all([
    db.collection('ContasAPagar').select(
      'centro_custo', 'entidade', 'codigo_fornecedor', 'empresa', 'valor_original',
      'origem', 'is_recorrente', '_projetado_pai', 'data_vencimento', 'tipo_entidade').get(),
    db.collection('Fornecedores').select('nome', 'codigo', 'empresa', 'centro_custo', 'tipo_entidade').get(),
    db.collection('AreasContasPagar').select('nome', 'gestor_nome').get(),
    db.collection('Base_Empresas').get(),
  ]);
  const lanc = lancSnap.docs.map((d) => ({ _id: d.id, ...d.data() }));
  const forn = fornSnap.docs.map((d) => ({ _id: d.id, ...d.data() }));

  // Mapa de areas pela chave canonica (o que a Frente 1 passa a usar).
  const areas = new Map();
  areaSnap.forEach((d) => {
    const v = d.data();
    const n = String(v.nome || '').trim();
    if (n) areas.set(chave(n), { nome: n, gestor: String(v.gestor_nome || '').trim() });
  });

  console.log('\n##############################################################');
  console.log('# (a) DECISAO 1: CENTROS DE CUSTO ORFAOS, caso a caso');
  console.log('##############################################################');
  console.log(`\nAreas cadastradas (${areas.size}): ${[...areas.values()].map((a) => `${a.nome} [${a.gestor || 'SEM GESTOR'}]`).join(' | ')}`);

  // --- a.1 lancamentos com CC orfao ---
  const orfaos = new Map(); // chaveCC -> { grafias:Set, docs, valor, entidades:Map, codigos:Set }
  let ccVazio = 0, ccVazioValor = 0, okDocs = 0;
  for (const r of lanc) {
    const cc = String(r.centro_custo ?? '').trim();
    const v = Number(r.valor_original) || 0;
    if (!cc) { ccVazio++; ccVazioValor += v; continue; }
    if (areas.has(chave(cc))) { okDocs++; continue; }
    const k = chave(cc);
    if (!orfaos.has(k)) orfaos.set(k, { grafias: new Set(), docs: 0, valor: 0, entidades: new Map(), codigos: new Set() });
    const o = orfaos.get(k);
    o.grafias.add(cc); o.docs++; o.valor += v;
    const ent = String(r.entidade ?? '(sem favorecido)').trim();
    o.entidades.set(ent, (o.entidades.get(ent) || 0) + 1);
    if (r.codigo_fornecedor != null) o.codigos.add(String(r.codigo_fornecedor));
  }
  console.log(`\nResumo: ${okDocs} docs casam com area | ${ccVazio} docs com CC VAZIO (${brl(ccVazioValor)}) | ` +
    `${orfaos.size} centro(s) de custo ORFAO(S)`);
  if (!orfaos.size) console.log('  NENHUM CC orfao.');
  let i = 0;
  for (const [k, o] of [...orfaos.entries()].sort((a, b) => b[1].docs - a[1].docs)) {
    i++;
    const cands = [...areas.values()].filter((a) => chave(a.nome).startsWith(k) || k.startsWith(chave(a.nome)));
    console.log(`\n  CASO ${i}: centro de custo "${[...o.grafias].join('" / "')}"`);
    console.log(`    lancamentos: ${o.docs}   valor: ${brl(o.valor)}`);
    console.log(`    favorecidos (${o.entidades.size}): ` +
      [...o.entidades.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([e, n]) => `${e} (${n})`).join(' ; '));
    console.log(`    codigos de fornecedor: ${[...o.codigos].slice(0, 15).join(', ')}${o.codigos.size > 15 ? ` ... +${o.codigos.size - 15}` : ''}`);
    console.log(`    areas PARECIDAS ja cadastradas: ` +
      (cands.length ? cands.map((a) => `"${a.nome}" -> ${a.gestor || 'SEM GESTOR'}`).join(' ; ') : '(nenhuma parecida)'));
  }

  // --- a.2 fornecedores com CC orfao (a fonte dos orfaos futuros) ---
  const fornOrfao = [];
  for (const f of forn) {
    const cc = String(f.centro_custo ?? '').trim();
    if (!cc) continue;
    if (!areas.has(chave(cc))) fornOrfao.push(f);
  }
  console.log(`\n  --- FONTE FUTURA: fornecedores cujo cadastro tem CC que nao casa com area ---`);
  console.log(`  total: ${fornOrfao.length}`);
  const porCc = new Map();
  for (const f of fornOrfao) {
    const cc = String(f.centro_custo).trim();
    if (!porCc.has(cc)) porCc.set(cc, []);
    porCc.get(cc).push(`${f.nome || '(sem nome)'} (#${f.codigo ?? f._id})`);
  }
  for (const [cc, lista] of [...porCc.entries()].sort((a, b) => b[1].length - a[1].length))
    console.log(`    "${cc}" -> ${lista.length} fornecedor(es): ${lista.slice(0, 10).join(' ; ')}${lista.length > 10 ? ' ...' : ''}`);
  const fornSemCc = forn.filter((f) => !String(f.centro_custo ?? '').trim()).length;
  console.log(`  fornecedores SEM centro de custo no cadastro: ${fornSemCc}`);

  console.log('\n##############################################################');
  console.log('# (b) DECISAO 3: NOMES ORFAOS DE EMPRESA');
  console.log('##############################################################');
  const ORFAS = ['RAFUL', 'SOULAN CONSULTORIA 3'];
  const VALIDAS = ['NEAT', 'SOULAN ADM', 'SOULAN CONSULTORIA', 'ESTAGIO'];
  console.log('\nCatalogo Base_Empresas hoje:');
  const catalogo = [];
  empSnap.forEach((d) => {
    const v = d.data();
    const rotulo = String(v.nome_fantasia || v.nome || d.id);
    catalogo.push(rotulo);
    console.log(`  id=${d.id}  rotulo exibido="${rotulo}"  nome=${JSON.stringify(v.nome ?? null)}  nome_fantasia=${JSON.stringify(v.nome_fantasia ?? null)}`);
  });
  for (const alvo of VALIDAS) {
    const achou = catalogo.some((c) => chave(c) === chave(alvo) || chave(c).replace(/[ÁÀÂÃ]/g, 'A') === chave(alvo));
    console.log(`  empresa valida "${alvo}": ${achou ? 'EXISTE no catalogo' : '*** NAO EXISTE no catalogo, precisa ser criada ***'}`);
  }

  // Mapa codigo -> empresa do fornecedor (a heranca em runtime).
  const fornEmp = new Map();
  for (const f of forn) {
    const e = String(f.empresa ?? '').trim().toUpperCase();
    if (!e) continue;
    const cod = f.codigo != null ? String(f.codigo).trim() : '';
    if (cod) fornEmp.set(cod, e);
    const id = String(f._id).trim();
    if (id && id !== cod) fornEmp.set(id, e);
  }
  for (const orfa of ORFAS) {
    const k = chave(orfa);
    const fornsAfetados = forn.filter((f) => chave(f.empresa) === k);
    let lancGravada = 0, lancGravadaValor = 0, lancHerdada = 0, lancHerdadaValor = 0;
    for (const r of lanc) {
      const v = Number(r.valor_original) || 0;
      if (chave(r.empresa) === k) { lancGravada++; lancGravadaValor += v; continue; }
      if (String(r.empresa ?? '').trim()) continue;
      const cod = r.codigo_fornecedor == null ? '' : String(r.codigo_fornecedor).trim();
      if (cod && chave(fornEmp.get(cod)) === k) { lancHerdada++; lancHerdadaValor += v; }
    }
    console.log(`\n  "${orfa}"`);
    console.log(`    fornecedores com essa empresa no cadastro: ${fornsAfetados.length}` +
      (fornsAfetados.length ? ` -> ${fornsAfetados.map((f) => `${f.nome} (#${f.codigo ?? f._id})`).join(' ; ')}` : ''));
    console.log(`    lancamentos com empresa GRAVADA nesse nome: ${lancGravada} (${brl(lancGravadaValor)})`);
    console.log(`    lancamentos que HERDARIAM esse nome do fornecedor: ${lancHerdada} (${brl(lancHerdadaValor)})`);
    console.log(`    TOTAL de lancamentos afetados: ${lancGravada + lancHerdada} (${brl(lancGravadaValor + lancHerdadaValor)})`);
  }

  console.log('\n##############################################################');
  console.log('# (c) DECISAO 7: VAZAMENTO DA EMPRESA DERIVADA');
  console.log('##############################################################');
  const comEmpresa = lanc.filter((r) => String(r.empresa ?? '').trim());
  console.log(`\nlancamentos com o campo 'empresa' GRAVADO no doc: ${comEmpresa.length}`);
  const porOrigem = new Map();
  for (const r of comEmpresa) {
    const o = String(r.origem ?? '(sem origem)');
    if (!porOrigem.has(o)) porOrigem.set(o, { n: 0, valor: 0, recorrente: 0, comPai: 0 });
    const a = porOrigem.get(o);
    a.n++; a.valor += Number(r.valor_original) || 0;
    if (r.is_recorrente === true) a.recorrente++;
    if (r._projetado_pai) a.comPai++;
  }
  console.log(`\n  quebra por campo 'origem' (a assinatura do caminho de escrita):`);
  for (const [o, a] of [...porOrigem.entries()].sort((x, y) => y[1].n - x[1].n))
    console.log(`    ${o.padEnd(32)} ${String(a.n).padStart(5)} docs | ${brl(a.valor).padStart(18)} | is_recorrente=${a.recorrente} | com _projetado_pai=${a.comPai}`);

  // O caminho do vazamento: clone de recorrencia. Assinatura = origem
  // 'edit_projetado_recorrente' OU _projetado_pai preenchido.
  const clones = lanc.filter((r) => String(r.origem ?? '') === 'edit_projetado_recorrente' || r._projetado_pai);
  const clonesComEmpresa = clones.filter((r) => String(r.empresa ?? '').trim());
  console.log(`\n  CLONES de recorrencia na base (origem='edit_projetado_recorrente' ou _projetado_pai): ${clones.length}`);
  console.log(`  desses, com 'empresa' GRAVADA (o vazamento consumado): ${clonesComEmpresa.length}` +
    ` (${brl(clonesComEmpresa.reduce((s, r) => s + (Number(r.valor_original) || 0), 0))})`);

  // Quantos deles a empresa gravada DIFERE do que a heranca daria hoje?
  // Se difere, o valor congelado ja esta mentindo em relacao ao cadastro atual.
  let divergentes = 0, iguais = 0, semHeranca = 0;
  const exemplosDiv = [];
  for (const r of clonesComEmpresa) {
    const grav = chave(r.empresa);
    const cod = r.codigo_fornecedor == null ? '' : String(r.codigo_fornecedor).trim();
    const herd = chave(fornEmp.get(cod) || '');
    if (!herd) { semHeranca++; continue; }
    if (herd === grav) iguais++;
    else {
      divergentes++;
      if (exemplosDiv.length < 10) exemplosDiv.push(`${r._id}: gravado="${r.empresa}" vs cadastro="${fornEmp.get(cod)}" (${r.entidade || '?'})`);
    }
  }
  console.log(`\n  dos clones com empresa gravada:`);
  console.log(`    gravado == o que a heranca daria hoje ... ${iguais}  (congelado, mas ainda coincide)`);
  console.log(`    gravado != o que a heranca daria hoje ... ${divergentes}  <-- JA ESTA MENTINDO`);
  console.log(`    fornecedor sem empresa no cadastro ...... ${semHeranca}  <-- valor que NAO existiria sem o vazamento`);
  if (exemplosDiv.length) {
    console.log(`\n    exemplos divergentes:`);
    for (const e of exemplosDiv) console.log(`      ${e}`);
  }

  console.log('\n=== FIM (nenhuma escrita realizada) ===');
  process.exit(0);
})().catch((e) => { console.error('ERRO:', e && e.message ? e.message : e); process.exit(1); });
