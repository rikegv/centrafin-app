/**
 * backfill_custo_total.cjs
 * ────────────────────────────────────────────────────────────────────────────
 * Popula os campos custo_total, total_vencimentos, total_encargos,
 * total_beneficios_pago, total_descontos_bnf e total_salario_bruto em todos
 * os documentos de CustosFolha que ainda nao possuem ou estao divergentes.
 *
 * USO:
 *   node scripts/backfill_custo_total.cjs           # dry-run (so mostra)
 *   node scripts/backfill_custo_total.cjs --apply   # executa writes
 *
 * Conecta via ADC do Firebase CLI (refresh_token de firebase-tools.json).
 * ────────────────────────────────────────────────────────────────────────────
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ═══════════════════════════════════════════════════════════════════════════
// 1. AUTENTICACAO — monta ADC temporario a partir do Firebase CLI
// ═══════════════════════════════════════════════════════════════════════════
const FIREBASE_CONFIG_PATH = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');

function getRefreshToken() {
    if (!fs.existsSync(FIREBASE_CONFIG_PATH)) {
        throw new Error('firebase-tools.json nao encontrado. Execute "firebase login" primeiro.');
    }
    const cfg = JSON.parse(fs.readFileSync(FIREBASE_CONFIG_PATH, 'utf8'));
    const token = cfg.tokens && cfg.tokens.refresh_token;
    if (!token) throw new Error('refresh_token nao encontrado em firebase-tools.json');
    return token;
}

function setupADC() {
    const refreshToken = getRefreshToken();
    const adcPayload = {
        type: 'authorized_user',
        client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
        client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
        refresh_token: refreshToken,
    };
    const tmpPath = path.join(os.tmpdir(), `adc_backfill_${Date.now()}.json`);
    fs.writeFileSync(tmpPath, JSON.stringify(adcPayload));
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath;
    return tmpPath;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. CLASSIFICADORES — replica logica de calcularTotais do code.html
// ═══════════════════════════════════════════════════════════════════════════

function _hasToken(key, token) {
    return new RegExp(`(^|_)${token}(_|$)`).test(key);
}

function isDescFolhaInfo(k) {
    const key = String(k || '').toUpperCase();
    if (key.endsWith('_QTDE')) return false;
    if (key.startsWith('BASE_')) return false;
    if (_hasToken(key, 'INSS') && !key.includes('PATRONAL')) return true;
    if (_hasToken(key, 'IRRF') || _hasToken(key, 'IR_RETIDO')) return true;
    if (key.includes('SINDIC')) return true;
    if (_hasToken(key, 'CONTRIBUICAO_ASSISTENCIAL')) return true;
    if (_hasToken(key, 'MULTA_ART_480_CLT')) return true;
    if (_hasToken(key, 'HORAS_NAO_COMPENSADAS')) return true;
    if (key.startsWith('DESC_EMPRESTIMO_CONSIGNADO')) return true;
    return false;
}

function isEncargo(k) {
    const key = String(k || '').toUpperCase();
    if (key.endsWith('_QTDE')) return false;
    if (key.startsWith('BASE_')) return false;
    if (key.startsWith('DESC_') || key.startsWith('DESCTO_')) return false;
    if (key.includes('DESCONTO')) return false;
    if (key.includes('PRO_LABORE') || key.includes('PROLABORE')) return false;
    if (_hasToken(key, 'IRRF') || _hasToken(key, 'IR_RETIDO')) return false;
    if (key.includes('SINDIC')) return false;
    if (_hasToken(key, 'CONTRIBUICAO_ASSISTENCIAL')) return false;
    if (_hasToken(key, 'INSS_RETIDO')) return false;
    if (_hasToken(key, 'INSS') && !key.includes('PATRONAL')) return false;
    const tokens = ['INSS_PATRONAL', 'FGTS', 'TERCEIROS', 'RAT', 'FAP', 'SISTEMA_S'];
    return tokens.some(t => _hasToken(key, t));
}

const SET_BNF_PAGO = new Set([
    'VALE_TRANSPORTE_Valor', 'VALE_REFEICAO_Valor',
    'ASSISTENCIA_MEDICA_Valor', 'ASSISTENCIA_ODONTOLOGICA_Valor',
    'VALE_ALIMENTACAO_Valor',
]);

const SET_BNF_DESC = new Set([
    'SEGURO_DE_VIDA_Valor', 'DESCTO_DE_VALE_TRANSPORTE_Valor',
    'DEVOLUCAO_DE_VR_NAO_UTILIZADO_Valor',
    'DESCTO_DE_VALE_REFEICAO_Valor',
    'DESCTO_DE_ASSISTENCIA_MEDICA_Valor',
]);

function isBnfDesc(k) {
    if (SET_BNF_DESC.has(k)) return true;
    const key = String(k || '').toUpperCase();
    if (key.endsWith('_QTDE')) return false;
    if (key.startsWith('BASE_')) return false;
    const ehDesconto = key.startsWith('DESC_') || key.startsWith('DESCTO_') || key.includes('DESCONTO');
    if (ehDesconto && key.includes('ODONTOL')) return true;
    return false;
}

function isVencimento(k) {
    const key = String(k || '').toUpperCase();
    if (key.endsWith('_QTDE')) return false;
    if (key === 'SALARIO_CADASTRAL') return false;
    const ehProLabore = key.includes('PRO_LABORE') || key.includes('PROLABORE');
    if (ehProLabore) {
        if (key.startsWith('DESC_') || key.startsWith('DESCTO_')) return false;
        if (key.includes('DESCONTO')) return false;
        if (key.startsWith('BASE_')) return false;
        return true;
    }
    if (key.includes('INSS') || key.includes('IRRF') || key.includes('DESCONTO') ||
        key.includes('EDUCACAO') || key.includes('FGTS') || key.includes('BASE_')) {
        return false;
    }
    const keywords = [
        'SALARIO', 'PRO_LABORE', 'DSR', 'CRECHE',
        'COMISSAO', 'BANCO_DE_HORAS', 'ARREDONDAMENTO', 'REEMBOLSO',
        'AVISO_PREVIO', 'FERIAS', '1_3', 'EMPRESTIMO_SALDO_NEGATIVO',
        '13O', 'AJUDA_DE_CUSTO', 'RESCISAO', 'HORA_EXTRA',
        'PARTICIPACAO', 'LUCRO',
        'BONUS', 'PREMIO', 'PREMIACAO', 'GRATIFICACAO',
        'SERVICOS_PRESTADOS',
        'BOLSA_AUXILIO',
    ];
    return keywords.some(word => key.includes(word));
}

function isSalarioBrutoKey(k) {
    const key = String(k || '')
        .normalize('NFD').replace(/[\u0300-\u036f\s_]/g, '')
        .toUpperCase();
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

function calcularTotais(reg) {
    let vencimentos = 0, encargos = 0, beneficios = 0, descontosBnf = 0, salarioBruto = 0;
    const usarSomenteTXT = (reg && reg._has_benef_txt === true);
    for (const k of Object.keys(reg || {})) {
        const raw = reg[k];
        if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
        if (isDescFolhaInfo(k))    { continue; }
        if (isEncargo(k))          { encargos += raw; continue; }
        if (k.startsWith('Bnf_'))     { beneficios += raw; continue; }
        if (k.startsWith('BnfDesc_')) { descontosBnf += raw; continue; }
        if (!usarSomenteTXT && SET_BNF_PAGO.has(k)) { beneficios += raw; continue; }
        if (!usarSomenteTXT && isBnfDesc(k)) { descontosBnf += raw; continue; }
        if (isVencimento(k))       {
            vencimentos += raw;
            if (isSalarioBrutoKey(k)) salarioBruto += raw;
            continue;
        }
    }
    const total = vencimentos + encargos + beneficios - descontosBnf;
    return { vencimentos, encargos, beneficios, descontosBnf, total, salarioBruto };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. ENRIQUECIMENTO COM BENEFICIOS (replica enriquecerCltComBeneficios)
// ═══════════════════════════════════════════════════════════════════════════

function enriquecerCltComBeneficios(reg, beneficiosMap) {
    if (!reg || reg.is_pj) return reg;
    const matriculaRaw = reg.matricula || reg.codigo || reg.chapa || '';
    const matriculaSafe = String(matriculaRaw).trim().toUpperCase().replace(/^0+/, '');
    const compRef = String(reg.competencia_ref || '').trim();
    if (!matriculaSafe || !compRef) return reg;

    const chave = `${compRef}_${matriculaSafe}`;
    const benefTXT = beneficiosMap.get(chave);

    if (benefTXT) {
        reg.Bnf_VT  = Number(benefTXT.vt_pago)  || 0;
        reg.Bnf_VR  = Number(benefTXT.vr_pago)  || 0;
        reg.Bnf_VA  = Number(benefTXT.va_pago)  || 0;
        reg.Bnf_MED = Number(benefTXT.med_pago) || 0;
        reg.Bnf_Odonto = Number(benefTXT.odonto_pago) || 0;
        reg.BnfDesc_VT  = Number(benefTXT.desconto_vt)  || 0;
        reg.BnfDesc_VR  = Number(benefTXT.desconto_vr)  || 0;
        reg.BnfDesc_VA  = Number(benefTXT.desconto_va)  || 0;
        reg.BnfDesc_MED = Number(benefTXT.desconto_med) || 0;
        reg.BnfDesc_Odonto = Number(benefTXT.desconto_odonto) || 0;
        reg._has_benef_txt = true;
    }
    return reg;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
    const applyMode = process.argv.includes('--apply');
    console.log(`\n=== backfill_custo_total ===`);
    console.log(`Modo: ${applyMode ? 'APPLY (writes reais)' : 'DRY-RUN (sem writes)'}\n`);

    const adcTmpPath = setupADC();
    try {
        const admin = require('firebase-admin');
        if (!admin.apps.length) {
            admin.initializeApp({ projectId: 'centra-fin' });
        }
        const firestore = admin.firestore();

        // Carregar CP_Beneficios_PJ para enriquecimento
        console.log('[1/4] Carregando CP_Beneficios_PJ...');
        const benefSnap = await firestore.collection('CP_Beneficios_PJ').get();
        const beneficiosMap = new Map();
        benefSnap.forEach(d => {
            const data = d.data() || {};
            const comp = String(data.competencia || '').trim();
            const matricula = String(data.fil_codigo || '').trim().replace(/^0+/, '');
            if (!comp || !matricula) return;
            const chave = `${comp}_${matricula}`;
            beneficiosMap.set(chave, {
                vt_pago:        Number(data.valor_vt  || 0),
                vr_pago:        Number(data.valor_vr  || 0),
                va_pago:        Number(data.valor_va  || 0),
                med_pago:       Number(data.valor_med || 0),
                odonto_pago:    Number(data.valor_odonto || 0),
                desconto_vt:    Number(data.desconto_vt  || 0),
                desconto_vr:    Number(data.desconto_vr  || 0),
                desconto_va:    Number(data.desconto_va  || 0),
                desconto_med:   Number(data.desconto_med || 0),
                desconto_odonto: Number(data.desconto_odonto || 0),
            });
        });
        console.log(`   -> ${beneficiosMap.size} registros de beneficios carregados`);

        // Carregar CustosFolha
        console.log('[2/4] Carregando CustosFolha...');
        const folhaSnap = await firestore.collection('CustosFolha').get();
        console.log(`   -> ${folhaSnap.size} documentos carregados`);

        // Processar
        console.log('[3/4] Calculando totais...');
        const updates = [];
        let skipped = 0;

        folhaSnap.forEach(d => {
            const reg = { ...d.data() };
            const docId = d.id;

            // Enriquecer com beneficios
            enriquecerCltComBeneficios(reg, beneficiosMap);

            // Calcular totais
            const t = calcularTotais(reg);

            // Dirty-check
            const diff = (a, b) => Math.abs((a || 0) - (b || 0)) >= 0.01;
            if (!diff(reg.custo_total, t.total) &&
                !diff(reg.total_vencimentos, t.vencimentos) &&
                !diff(reg.total_encargos, t.encargos) &&
                !diff(reg.total_beneficios_pago, t.beneficios) &&
                !diff(reg.total_descontos_bnf, t.descontosBnf) &&
                !diff(reg.total_salario_bruto, t.salarioBruto)) {
                skipped++;
                return;
            }

            updates.push({
                docId,
                data: {
                    custo_total: t.total,
                    total_vencimentos: t.vencimentos,
                    total_encargos: t.encargos,
                    total_beneficios_pago: t.beneficios,
                    total_descontos_bnf: t.descontosBnf,
                    total_salario_bruto: t.salarioBruto,
                },
            });
        });

        console.log(`\n   Resultados:`);
        console.log(`     Total docs:    ${folhaSnap.size}`);
        console.log(`     A atualizar:   ${updates.length}`);
        console.log(`     Ja corretos:   ${skipped}`);

        if (!applyMode) {
            if (updates.length > 0) {
                console.log(`\n   Primeiros 5 exemplos:`);
                for (const u of updates.slice(0, 5)) {
                    console.log(`     ${u.docId}: custo_total=${u.data.custo_total.toFixed(2)}`);
                }
            }
            console.log(`\n[DRY-RUN] Nenhuma escrita realizada. Use --apply para gravar.\n`);
            return;
        }

        // Gravar em batches de 500
        console.log('[4/4] Gravando em batches de 500...');
        let written = 0;
        for (let i = 0; i < updates.length; i += 500) {
            const batch = firestore.batch();
            const chunk = updates.slice(i, i + 500);
            for (const { docId, data } of chunk) {
                batch.update(firestore.collection('CustosFolha').doc(docId), data);
            }
            await batch.commit();
            written += chunk.length;
            console.log(`   -> Batch ${Math.ceil((i + 1) / 500)}: ${written}/${updates.length} gravados`);
        }

        console.log(`\n[APPLY] ${written} documentos atualizados com sucesso.\n`);
    } finally {
        // Limpar ADC temporario
        try { fs.unlinkSync(adcTmpPath); } catch (_) {}
    }
}

main().catch(err => {
    console.error('\nERRO FATAL:', err.message || err);
    process.exit(1);
});
