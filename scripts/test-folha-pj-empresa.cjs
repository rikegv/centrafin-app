/**
 * test-folha-pj-empresa.cjs
 * Prova numérica: verifica que PJs são atribuídos à empresa real e que
 * o total global não muda. NÃO escreve nada.
 */
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
admin.initializeApp({ projectId: 'centra-fin' });
const db = getFirestore();

// ── Réplica de folhaPjResolverEmpresa ──
function folhaEmpresaCanonica(empresaRaw) {
    var emp = String(empresaRaw || '').trim();
    if (!emp) return emp;
    var cmp = emp.toUpperCase().replace(/\s+/g, ' ').trim();
    if (cmp === 'SOULAN CONSULTORIA 3') return 'SOULAN CONSULTORIA';
    if (cmp === 'PJ') return 'SOULAN CONSULTORIA';
    return emp;
}

function folhaPjResolverEmpresa(codForn, dataLanc, caches) {
    var _norm = function(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim(); };
    var _digitos = function(s) { return String(s || '').replace(/\D/g, ''); };
    var emp = '';
    if (codForn != null && caches.porCodigo && caches.porCodigo.has(String(codForn)))
        emp = caches.porCodigo.get(String(codForn));
    if (!emp && dataLanc) {
        var doc = _digitos(dataLanc.cnpj || dataLanc.cpf || dataLanc.cnpj_cpf || dataLanc.documento);
        if (doc && caches.porDoc && caches.porDoc.has(doc)) emp = caches.porDoc.get(doc);
    }
    if (!emp && dataLanc) {
        var nm = _norm(dataLanc.entidade || dataLanc.favorecido || dataLanc.nome);
        if (nm && caches.porNome && caches.porNome.has(nm)) emp = caches.porNome.get(nm);
    }
    if (!emp && dataLanc && dataLanc.empresa) emp = String(dataLanc.empresa);
    emp = folhaEmpresaCanonica(emp);
    return emp || 'SOULAN CONSULTORIA';
}

function folhaNormalizarCompetenciaPJ(raw, fallbackVencimento) {
    var s = String(raw || '').trim();
    var m = s.match(/^(\d{4})-(\d{2})$/);
    if (m) return s;
    m = s.match(/^(\d{2})\/(\d{4})$/);
    if (m) return m[2] + '-' + m[1];
    var mv = String(fallbackVencimento || '').match(/^(\d{4})-(\d{2})/);
    if (mv) return mv[1] + '-' + mv[2];
    return '';
}

// ── calcularTotais (réplica de folhaCustoCalcularTotais) ──
function _ht(key, token) { return new RegExp('(^|_)' + token + '(_|$)').test(key); }
const SET_P = new Set(['VALE_TRANSPORTE_Valor','VALE_REFEICAO_Valor','ASSISTENCIA_MEDICA_Valor','ASSISTENCIA_ODONTOLOGICA_Valor','VALE_ALIMENTACAO_Valor']);
const SET_D = new Set(['SEGURO_DE_VIDA_Valor','DESCTO_DE_VALE_TRANSPORTE_Valor','DEVOLUCAO_DE_VR_NAO_UTILIZADO_Valor','DESCTO_DE_VALE_REFEICAO_Valor','DESCTO_DE_ASSISTENCIA_MEDICA_Valor']);
function isV(k){var key=String(k||'').toUpperCase();if(key.endsWith('_QTDE'))return false;if(key==='SALARIO_CADASTRAL')return false;var p=key.includes('PRO_LABORE')||key.includes('PROLABORE');if(p){if(key.startsWith('DESC_')||key.startsWith('DESCTO_'))return false;if(key.includes('DESCONTO'))return false;if(key.startsWith('BASE_'))return false;return true;}if(key.includes('INSS')||key.includes('IRRF')||key.includes('DESCONTO')||key.includes('EDUCACAO')||key.includes('FGTS')||key.includes('BASE_'))return false;return['SALARIO','PRO_LABORE','DSR','CRECHE','COMISSAO','BANCO_DE_HORAS','ARREDONDAMENTO','REEMBOLSO','AVISO_PREVIO','FERIAS','1_3','EMPRESTIMO_SALDO_NEGATIVO','13O','AJUDA_DE_CUSTO','RESCISAO','HORA_EXTRA','PARTICIPACAO','LUCRO','BONUS','PREMIO','PREMIACAO','GRATIFICACAO','SERVICOS_PRESTADOS','BOLSA_AUXILIO','DIFERENCA'].some(w=>key.includes(w));}
function isE(k){var key=String(k||'').toUpperCase();if(key.endsWith('_QTDE'))return false;if(key.startsWith('BASE_'))return false;if(key.startsWith('DESC_')||key.startsWith('DESCTO_'))return false;if(key.includes('DESCONTO'))return false;if(key.includes('PRO_LABORE')||key.includes('PROLABORE'))return false;if(_ht(key,'IRRF')||_ht(key,'IR_RETIDO'))return false;if(key.includes('SINDIC'))return false;if(_ht(key,'CONTRIBUICAO_ASSISTENCIAL'))return false;if(_ht(key,'INSS_RETIDO'))return false;if(_ht(key,'INSS')&&!key.includes('PATRONAL'))return false;return['INSS_PATRONAL','FGTS','TERCEIROS','RAT','FAP','SISTEMA_S'].some(t=>_ht(key,t));}
function isDFI(k){var key=String(k||'').toUpperCase();if(key.endsWith('_QTDE'))return false;if(key.startsWith('BASE_'))return false;if(_ht(key,'INSS')&&!key.includes('PATRONAL'))return true;if(_ht(key,'IRRF')||_ht(key,'IR_RETIDO'))return true;if(key.includes('SINDIC'))return true;if(_ht(key,'CONTRIBUICAO_ASSISTENCIAL'))return true;if(_ht(key,'MULTA_ART_480_CLT'))return true;if(_ht(key,'HORAS_NAO_COMPENSADAS'))return true;if(key.startsWith('DESC_EMPRESTIMO_CONSIGNADO'))return true;return false;}
function isBD(k){if(SET_D.has(k))return true;var key=String(k||'').toUpperCase();if(key.endsWith('_QTDE'))return false;if(key.startsWith('BASE_'))return false;var d=key.startsWith('DESC_')||key.startsWith('DESCTO_')||key.includes('DESCONTO');if(d&&key.includes('ODONTOL'))return true;return false;}
function calc(reg){var v=0,e=0,b=0,d=0;var txt=(reg&&reg._has_benef_txt===true);for(var k of Object.keys(reg||{})){var raw=reg[k];if(typeof raw!=='number'||!Number.isFinite(raw))continue;if(isDFI(k))continue;if(isE(k)){e+=raw;continue;}if(k.startsWith('Bnf_')){b+=raw;continue;}if(k.startsWith('BnfDesc_')){d+=raw;continue;}if(!txt&&SET_P.has(k)){b+=raw;continue;}if(!txt&&isBD(k)){d+=raw;continue;}if(isV(k)){v+=raw;continue;}}return{total:v+e+b-d,v,e,b,d};}

const fmt = (v) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
    // 1) Carregar Fornecedores → montar caches de empresa
    const fornSnap = await db.collection('Fornecedores').get();
    const porCodigo = new Map(), porDoc = new Map(), porNome = new Map();
    const _norm = (s) => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
    const _dig = (s) => String(s||'').replace(/\D/g,'');
    fornSnap.forEach(d => {
        const data = d.data()||{};
        const codigo = String(data.codigo!=null?data.codigo:d.id);
        const idDoc = String(d.id||'').trim();
        const emp = String(data.empresa||'').trim().toUpperCase();
        if (emp) {
            porCodigo.set(codigo, emp);
            if (idDoc && idDoc !== codigo) porCodigo.set(idDoc, emp);
            const doc = _dig(data.cnpj||data.cpf||data.cnpj_cpf||data.documento);
            if (doc) porDoc.set(doc, emp);
            const nm = _norm(data.nome||data.nome_fantasia||data.razao_social||data.entidade);
            if (nm) porNome.set(nm, emp);
        }
    });
    const caches = { porCodigo, porDoc, porNome };
    console.log(`Fornecedores carregados: ${fornSnap.size} (${porCodigo.size} com empresa)\n`);

    // 2) Carregar PJs de ContasAPagar
    const pjSnap = await db.collection('ContasAPagar').where('tipo_entidade','==','Fornecedor Interno - PJ').get();
    console.log(`PJs em ContasAPagar: ${pjSnap.size}\n`);

    // 3) Carregar CLTs
    const cltSnap = await db.collection('CustosFolha').get();
    console.log(`CLTs em CustosFolha: ${cltSnap.size}\n`);

    // 4) Consolidar PJs por (comp × codForn) — ANTES (sentinela) e DEPOIS (empresa real)
    const gruposAntes = new Map(); // comp_codForn → { empresa: 'PJ', total }
    const gruposDepois = new Map(); // comp_codForn → { empresa: real, total }

    pjSnap.forEach(d => {
        const data = d.data()||{};
        const codForn = data.codigo_fornecedor!=null?String(data.codigo_fornecedor):d.id;
        const comp = folhaNormalizarCompetenciaPJ(data.competencia_ref, data.data_vencimento);
        const chave = `${comp}_${codForn}`;
        const fatura = Number(data.valor_original)||0;

        // ANTES (sentinela 'PJ')
        if (!gruposAntes.has(chave)) gruposAntes.set(chave, { empresa: 'PJ', SERVICOS_PRESTADOS_Valor: 0, nome: data.entidade||data.favorecido||'', comp });
        gruposAntes.get(chave).SERVICOS_PRESTADOS_Valor += fatura;

        // DEPOIS (empresa real)
        const empReal = folhaPjResolverEmpresa(codForn, data, caches);
        if (!gruposDepois.has(chave)) gruposDepois.set(chave, { empresa: empReal, SERVICOS_PRESTADOS_Valor: 0, nome: data.entidade||data.favorecido||'', comp });
        gruposDepois.get(chave).SERVICOS_PRESTADOS_Valor += fatura;
    });

    // 5) Listar PJs com empresa resolvida
    console.log('═'.repeat(90));
    console.log('PJs CONSOLIDADOS COM EMPRESA REAL');
    console.log('═'.repeat(90));
    const porEmpresa = new Map();
    gruposDepois.forEach((g, chave) => {
        const emp = g.empresa;
        if (!porEmpresa.has(emp)) porEmpresa.set(emp, []);
        porEmpresa.get(emp).push(g);
    });
    [...porEmpresa.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([emp, pjs]) => {
        const total = pjs.reduce((s,p) => s + p.SERVICOS_PRESTADOS_Valor, 0);
        console.log(`\n  ${emp}: ${pjs.length} PJ×comp, total faturas ${fmt(total)}`);
        pjs.slice(0,3).forEach(p => console.log(`    ${p.nome} / ${p.comp}: ${fmt(p.SERVICOS_PRESTADOS_Valor)}`));
        if (pjs.length > 3) console.log(`    ... +${pjs.length-3} mais`);
    });

    // 6) Calcular totais GLOBAIS (CLT + PJ) — ANTES e DEPOIS
    let totalGlobalAntes = 0, totalGlobalDepois = 0;
    let totalCLT = 0;

    cltSnap.forEach(d => {
        const t = calc(d.data());
        totalCLT += t.total;
    });

    let totalPJAntes = 0, totalPJDepois = 0;
    gruposAntes.forEach(g => { totalPJAntes += calc(g).total; });
    gruposDepois.forEach(g => { totalPJDepois += calc(g).total; });

    totalGlobalAntes = totalCLT + totalPJAntes;
    totalGlobalDepois = totalCLT + totalPJDepois;

    console.log('\n' + '═'.repeat(90));
    console.log('PROVA: TOTAL GLOBAL NÃO MUDA');
    console.log('═'.repeat(90));
    console.log(`  CLT total:              ${fmt(totalCLT)}`);
    console.log(`  PJ total (ANTES='PJ'):  ${fmt(totalPJAntes)}`);
    console.log(`  PJ total (DEPOIS=real): ${fmt(totalPJDepois)}`);
    console.log(`  GLOBAL ANTES:           ${fmt(totalGlobalAntes)}`);
    console.log(`  GLOBAL DEPOIS:          ${fmt(totalGlobalDepois)}`);
    console.log(`  Diferença:              ${fmt(totalGlobalDepois - totalGlobalAntes)} ${Math.abs(totalGlobalDepois - totalGlobalAntes) < 0.01 ? '✓ IDÊNTICO' : '✗ DIVERGE'}`);

    // 7) Verificar por empresa: (a) empresas COM PJ mudam, (b) empresas SEM PJ não mudam
    console.log('\n' + '═'.repeat(90));
    console.log('IMPACTO POR EMPRESA (custo com PJs embutidos vs sentinela)');
    console.log('═'.repeat(90));

    // CLT por empresa
    const cltPorEmp = new Map();
    cltSnap.forEach(d => {
        const data = d.data();
        const emp = folhaEmpresaCanonica(data.empresa_atribuida || '') || 'Sem empresa';
        cltPorEmp.set(emp, (cltPorEmp.get(emp)||0) + calc(data).total);
    });

    // PJ por empresa ANTES (tudo em 'PJ' → normalizado para 'SOULAN CONSULTORIA')
    const pjPorEmpAntes = new Map();
    gruposAntes.forEach(g => {
        const emp = folhaEmpresaCanonica(g.empresa);
        pjPorEmpAntes.set(emp, (pjPorEmpAntes.get(emp)||0) + calc(g).total);
    });

    // PJ por empresa DEPOIS (real)
    const pjPorEmpDepois = new Map();
    gruposDepois.forEach(g => {
        const emp = g.empresa;
        pjPorEmpDepois.set(emp, (pjPorEmpDepois.get(emp)||0) + calc(g).total);
    });

    const allEmps = new Set([...cltPorEmp.keys(), ...pjPorEmpAntes.keys(), ...pjPorEmpDepois.keys()]);
    console.log(`\n  ${'Empresa'.padEnd(25)} ${'CLT'.padStart(14)} ${'PJ antes'.padStart(14)} ${'PJ depois'.padStart(14)} ${'Total antes'.padStart(16)} ${'Total depois'.padStart(16)} ${'Diff'.padStart(14)}`);
    console.log('  ' + '-'.repeat(115));
    [...allEmps].sort().forEach(emp => {
        const clt = cltPorEmp.get(emp)||0;
        const pjA = pjPorEmpAntes.get(emp)||0;
        const pjD = pjPorEmpDepois.get(emp)||0;
        const totalA = clt + pjA;
        const totalD = clt + pjD;
        const diff = totalD - totalA;
        if (Math.abs(diff) > 0.01 || pjA > 0 || pjD > 0) {
            console.log(`  ${emp.padEnd(25)} ${fmt(clt).padStart(14)} ${fmt(pjA).padStart(14)} ${fmt(pjD).padStart(14)} ${fmt(totalA).padStart(16)} ${fmt(totalD).padStart(16)} ${fmt(diff).padStart(14)}`);
        }
    });

    try { require('fs').unlinkSync('adc_tmp.json'); } catch(_) {}
    process.exit(0);
}

main().catch(err => { console.error('ERRO:', err); try { require('fs').unlinkSync('adc_tmp.json'); } catch(_) {} process.exit(1); });
