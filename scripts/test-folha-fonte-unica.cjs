/**
 * test-folha-fonte-unica.cjs
 * Prova numérica: compara o cálculo ANTIGO (dashboard) vs NOVO (core_rules)
 * com dados reais de produção. NÃO escreve nada.
 */
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

admin.initializeApp({ projectId: 'centra-fin' });
const db = getFirestore();

// ── NOVO: réplica exata das funções de core_rules.js ──
function _folhaCustoHasToken(key, token) {
    return new RegExp('(^|_)' + token + '(_|$)').test(key);
}
function folhaCustoIsVencimento(k) {
    var key = String(k || '').toUpperCase();
    if (key.endsWith('_QTDE')) return false;
    if (key === 'SALARIO_CADASTRAL') return false;
    var ehProLabore = key.includes('PRO_LABORE') || key.includes('PROLABORE');
    if (ehProLabore) {
        if (key.startsWith('DESC_') || key.startsWith('DESCTO_')) return false;
        if (key.includes('DESCONTO')) return false;
        if (key.startsWith('BASE_')) return false;
        return true;
    }
    if (key.includes('INSS') || key.includes('IRRF') || key.includes('DESCONTO') ||
        key.includes('EDUCACAO') || key.includes('FGTS') || key.includes('BASE_')) return false;
    var keywords = ['SALARIO','PRO_LABORE','DSR','CRECHE','COMISSAO','BANCO_DE_HORAS','ARREDONDAMENTO','REEMBOLSO','AVISO_PREVIO','FERIAS','1_3','EMPRESTIMO_SALDO_NEGATIVO','13O','AJUDA_DE_CUSTO','RESCISAO','HORA_EXTRA','PARTICIPACAO','LUCRO','BONUS','PREMIO','PREMIACAO','GRATIFICACAO','SERVICOS_PRESTADOS','BOLSA_AUXILIO','DIFERENCA'];
    return keywords.some(function(word) { return key.includes(word); });
}
function folhaCustoIsEncargo(k) {
    var key = String(k || '').toUpperCase();
    if (key.endsWith('_QTDE')) return false;
    if (key.startsWith('BASE_')) return false;
    if (key.startsWith('DESC_') || key.startsWith('DESCTO_')) return false;
    if (key.includes('DESCONTO')) return false;
    if (key.includes('PRO_LABORE') || key.includes('PROLABORE')) return false;
    if (_folhaCustoHasToken(key, 'IRRF') || _folhaCustoHasToken(key, 'IR_RETIDO')) return false;
    if (key.includes('SINDIC')) return false;
    if (_folhaCustoHasToken(key, 'CONTRIBUICAO_ASSISTENCIAL')) return false;
    if (_folhaCustoHasToken(key, 'INSS_RETIDO')) return false;
    if (_folhaCustoHasToken(key, 'INSS') && !key.includes('PATRONAL')) return false;
    var tokens = ['INSS_PATRONAL','FGTS','TERCEIROS','RAT','FAP','SISTEMA_S'];
    return tokens.some(function(t) { return _folhaCustoHasToken(key, t); });
}
function folhaCustoIsDescFolhaInfo(k) {
    var key = String(k || '').toUpperCase();
    if (key.endsWith('_QTDE')) return false;
    if (key.startsWith('BASE_')) return false;
    if (_folhaCustoHasToken(key, 'INSS') && !key.includes('PATRONAL')) return true;
    if (_folhaCustoHasToken(key, 'IRRF') || _folhaCustoHasToken(key, 'IR_RETIDO')) return true;
    if (key.includes('SINDIC')) return true;
    if (_folhaCustoHasToken(key, 'CONTRIBUICAO_ASSISTENCIAL')) return true;
    if (_folhaCustoHasToken(key, 'MULTA_ART_480_CLT')) return true;
    if (_folhaCustoHasToken(key, 'HORAS_NAO_COMPENSADAS')) return true;
    if (key.startsWith('DESC_EMPRESTIMO_CONSIGNADO')) return true;
    return false;
}
var FOLHA_CUSTO_SET_BNF_PAGO = new Set(['VALE_TRANSPORTE_Valor','VALE_REFEICAO_Valor','ASSISTENCIA_MEDICA_Valor','ASSISTENCIA_ODONTOLOGICA_Valor','VALE_ALIMENTACAO_Valor']);
var FOLHA_CUSTO_SET_BNF_DESC = new Set(['SEGURO_DE_VIDA_Valor','DESCTO_DE_VALE_TRANSPORTE_Valor','DEVOLUCAO_DE_VR_NAO_UTILIZADO_Valor','DESCTO_DE_VALE_REFEICAO_Valor','DESCTO_DE_ASSISTENCIA_MEDICA_Valor']);
function folhaCustoIsBnfDesc(k) {
    if (FOLHA_CUSTO_SET_BNF_DESC.has(k)) return true;
    var key = String(k || '').toUpperCase();
    if (key.endsWith('_QTDE')) return false;
    if (key.startsWith('BASE_')) return false;
    var ehDesconto = key.startsWith('DESC_') || key.startsWith('DESCTO_') || key.includes('DESCONTO');
    if (ehDesconto && key.includes('ODONTOL')) return true;
    return false;
}
function folhaCustoIsSalarioBrutoKey(k) {
    var key = String(k || '').normalize('NFD').replace(/[\u0300-\u036f\s_]/g, '').toUpperCase();
    if (!key) return false;
    if (key.startsWith('DESC') || key.startsWith('DESCTO')) return false;
    if (key.includes('DESCONTO')) return false;
    if (key.startsWith('BASE')) return false;
    if (key === 'SALARIOCADASTRAL') return false;
    if (key.includes('PROLABORE')) return true;
    if (key.includes('SERVICOSPRESTADOS')) return true;
    if (key.includes('BOLSAAUXILIO')) return true;
    if (key.includes('SALARIOBASE')) return true;
    if (key.includes('SALARIOFAMILIA')) return true;
    if (key.includes('SALARIOMATERNIDADE')) return true;
    if (key === 'SALARIO' || key === 'SALARIOVALOR') return true;
    return false;
}
function folhaCustoCalcularTotais(reg) {
    var vencimentos = 0, encargos = 0, beneficios = 0, descontosBnf = 0, salarioBruto = 0;
    var usarSomenteTXT = (reg && reg._has_benef_txt === true);
    var keys = Object.keys(reg || {});
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var raw = reg[k];
        if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
        if (folhaCustoIsDescFolhaInfo(k)) continue;
        if (folhaCustoIsEncargo(k)) { encargos += raw; continue; }
        if (k.startsWith('Bnf_')) { beneficios += raw; continue; }
        if (k.startsWith('BnfDesc_')) { descontosBnf += raw; continue; }
        if (!usarSomenteTXT && FOLHA_CUSTO_SET_BNF_PAGO.has(k)) { beneficios += raw; continue; }
        if (!usarSomenteTXT && folhaCustoIsBnfDesc(k)) { descontosBnf += raw; continue; }
        if (folhaCustoIsVencimento(k)) {
            vencimentos += raw;
            if (folhaCustoIsSalarioBrutoKey(k)) salarioBruto += raw;
            continue;
        }
    }
    var total = vencimentos + encargos + beneficios - descontosBnf;
    return { vencimentos, encargos, beneficios, descontosBnf, total, salarioBruto };
}

// ── ANTIGO (dashboard): réplica do código REMOVIDO ──
function _hasTokenOLD(key, token) { return new RegExp(`(^|_)${token}(_|$)`).test(key); }
function isVencimentoOLD(k) {
    const key = String(k || '').toUpperCase();
    if (key.endsWith('_QTDE')) return false;
    const ehProLabore = key.includes('PRO_LABORE') || key.includes('PROLABORE');
    if (ehProLabore) {
        if (key.startsWith('DESC_') || key.startsWith('DESCTO_')) return false;
        if (key.includes('DESCONTO')) return false;
        if (key.startsWith('BASE_')) return false;
        return true;
    }
    if (key.includes('INSS') || key.includes('IRRF') || key.includes('DESCONTO') || key.includes('EDUCACAO') || key.includes('FGTS') || key.includes('BASE_')) return false;
    const keywords = ['SALARIO','PRO_LABORE','DSR','CRECHE','COMISSAO','BANCO_DE_HORAS','ARREDONDAMENTO','REEMBOLSO','AVISO_PREVIO','FERIAS','1_3','EMPRESTIMO_SALDO_NEGATIVO','13O','AJUDA_DE_CUSTO','RESCISAO','HORA_EXTRA','PARTICIPACAO','LUCRO','BONUS','PREMIO','PREMIACAO','GRATIFICACAO','SERVICOS_PRESTADOS'];
    return keywords.some(word => key.includes(word));
}
function isEncargoOLD(k) {
    const key = String(k || '').toUpperCase();
    if (key.endsWith('_QTDE')) return false;
    if (key.startsWith('BASE_')) return false;
    if (key.startsWith('DESC_') || key.startsWith('DESCTO_')) return false;
    if (key.includes('DESCONTO')) return false;
    if (key.includes('PRO_LABORE') || key.includes('PROLABORE')) return false;
    if (_hasTokenOLD(key, 'IRRF') || _hasTokenOLD(key, 'IR_RETIDO')) return false;
    if (key.includes('SINDIC')) return false;
    if (_hasTokenOLD(key, 'CONTRIBUICAO_ASSISTENCIAL')) return false;
    if (_hasTokenOLD(key, 'INSS_RETIDO')) return false;
    if (_hasTokenOLD(key, 'INSS') && !key.includes('PATRONAL')) return false;
    const tokens = ['INSS_PATRONAL','FGTS','TERCEIROS','RAT','FAP','SISTEMA_S'];
    return tokens.some(t => _hasTokenOLD(key, t));
}
function isDescFolhaInfoOLD(k) {
    const key = String(k || '').toUpperCase();
    if (key.endsWith('_QTDE')) return false;
    if (key.startsWith('BASE_')) return false;
    if (_hasTokenOLD(key, 'INSS') && !key.includes('PATRONAL')) return true;
    if (_hasTokenOLD(key, 'IRRF') || _hasTokenOLD(key, 'IR_RETIDO')) return true;
    if (key.includes('SINDIC')) return true;
    if (_hasTokenOLD(key, 'CONTRIBUICAO_ASSISTENCIAL')) return true;
    return false;
}
function isBnfDescOLD(k) {
    if (FOLHA_CUSTO_SET_BNF_DESC.has(k)) return true;
    const key = String(k || '').toUpperCase();
    if (key.endsWith('_QTDE')) return false;
    if (key.startsWith('BASE_')) return false;
    const ehDesconto = key.startsWith('DESC_') || key.startsWith('DESCTO_') || key.includes('DESCONTO');
    if (ehDesconto && key.includes('ODONTOL')) return true;
    return false;
}
function calcularTotaisOLD(reg) {
    let vencimentos = 0, encargos = 0, beneficios = 0, descontosBnf = 0, salarioBruto = 0;
    // OLD: sem usarSomenteTXT
    for (const k of Object.keys(reg || {})) {
        const raw = reg[k];
        if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
        if (isDescFolhaInfoOLD(k)) continue;
        if (isEncargoOLD(k)) { encargos += raw; continue; }
        if (k.startsWith('Bnf_')) { beneficios += raw; continue; }
        if (FOLHA_CUSTO_SET_BNF_PAGO.has(k)) { beneficios += raw; continue; }
        if (isBnfDescOLD(k)) { descontosBnf += raw; continue; }
        if (isVencimentoOLD(k)) { vencimentos += raw; continue; }
    }
    const total = vencimentos + encargos + beneficios - descontosBnf;
    return { vencimentos, encargos, beneficios, descontosBnf, total, salarioBruto };
}

const fmt = (v) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
    console.log('Buscando dados de CustosFolha...\n');
    const snap = await db.collection('CustosFolha').get();
    console.log(`Total docs CustosFolha: ${snap.size}\n`);

    // Agrupar por empresa + competencia
    const porEmpComp = new Map();
    snap.forEach(d => {
        const data = d.data();
        const emp = data.empresa_atribuida || 'Sem empresa';
        const comp = data.competencia_ref || '???';
        const key = `${emp}__${comp}`;
        if (!porEmpComp.has(key)) porEmpComp.set(key, []);
        porEmpComp.get(key).push(data);
    });

    // Casos de teste solicitados pelo diretor
    const casosAlvo = [
        { empresa: 'SOULAN CONSULTORIA', competencia: '2026-06' },
        { empresa: 'SOULAN ADM', competencia: '2026-06' },
        { empresa: 'RAFUL', competencia: '2026-05' },
    ];

    console.log('═'.repeat(90));
    console.log('PROVA NUMÉRICA: GERENCIADOR (novo=core_rules) vs DASHBOARD ANTIGO vs DASHBOARD NOVO');
    console.log('═'.repeat(90));

    for (const caso of casosAlvo) {
        // Encontrar registros que batem
        const regs = [];
        porEmpComp.forEach((docs, key) => {
            if (key.includes(caso.empresa) && key.includes(caso.competencia)) {
                regs.push(...docs);
            }
        });

        if (regs.length === 0) {
            console.log(`\n${caso.empresa} / ${caso.competencia}: NENHUM REGISTRO ENCONTRADO`);
            continue;
        }

        let novoTotal = 0, novoVenc = 0, novoEnc = 0, novoBnf = 0, novoDesc = 0;
        let antigoTotal = 0, antigoVenc = 0, antigoEnc = 0, antigoBnf = 0, antigoDesc = 0;

        for (const reg of regs) {
            const tNovo = folhaCustoCalcularTotais(reg);
            novoTotal += tNovo.total;
            novoVenc += tNovo.vencimentos;
            novoEnc += tNovo.encargos;
            novoBnf += tNovo.beneficios;
            novoDesc += tNovo.descontosBnf;

            const tAntigo = calcularTotaisOLD(reg);
            antigoTotal += tAntigo.total;
            antigoVenc += tAntigo.vencimentos;
            antigoEnc += tAntigo.encargos;
            antigoBnf += tAntigo.beneficios;
            antigoDesc += tAntigo.descontosBnf;
        }

        const diff = novoTotal - antigoTotal;
        console.log(`\n${caso.empresa} / ${caso.competencia} (${regs.length} registros)`);
        console.log('-'.repeat(90));
        console.log(`  ${''.padEnd(20)} ${'Dash ANTIGO'.padStart(18)} ${'Fonte Única (novo)'.padStart(18)} ${'Diferença'.padStart(18)}`);
        console.log(`  ${'Vencimentos'.padEnd(20)} ${fmt(antigoVenc).padStart(18)} ${fmt(novoVenc).padStart(18)} ${fmt(novoVenc - antigoVenc).padStart(18)}`);
        console.log(`  ${'Encargos'.padEnd(20)} ${fmt(antigoEnc).padStart(18)} ${fmt(novoEnc).padStart(18)} ${fmt(novoEnc - antigoEnc).padStart(18)}`);
        console.log(`  ${'Benefícios'.padEnd(20)} ${fmt(antigoBnf).padStart(18)} ${fmt(novoBnf).padStart(18)} ${fmt(novoBnf - antigoBnf).padStart(18)}`);
        console.log(`  ${'Desc. Benefícios'.padEnd(20)} ${fmt(antigoDesc).padStart(18)} ${fmt(novoDesc).padStart(18)} ${fmt(novoDesc - antigoDesc).padStart(18)}`);
        console.log(`  ${'CUSTO TOTAL'.padEnd(20)} ${fmt(antigoTotal).padStart(18)} ${fmt(novoTotal).padStart(18)} ${fmt(diff).padStart(18)} ${diff !== 0 ? '← DIFERENÇA' : '✓ IGUAL'}`);
    }

    console.log('\n' + '═'.repeat(90));

    // Listar TODAS as divergências para dimensionar
    let totalDivergencias = 0;
    let somaAbsDiff = 0;
    porEmpComp.forEach((docs, key) => {
        let totalNovo = 0, totalAntigo = 0;
        for (const reg of docs) {
            totalNovo += folhaCustoCalcularTotais(reg).total;
            totalAntigo += calcularTotaisOLD(reg).total;
        }
        const diff = Math.abs(totalNovo - totalAntigo);
        if (diff > 0.01) {
            totalDivergencias++;
            somaAbsDiff += diff;
        }
    });
    console.log(`\nResumo: ${totalDivergencias} combinações empresa/competência com divergência > R$ 0,01`);
    console.log(`Soma absoluta das diferenças: ${fmt(somaAbsDiff)}`);
    console.log('═'.repeat(90));

    rm();
    process.exit(0);
}

function rm() { try { require('fs').unlinkSync('adc_tmp.json'); } catch(_) {} }

main().catch(err => { console.error('ERRO:', err.message); rm(); process.exit(1); });
