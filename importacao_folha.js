/**
 * MOTOR DE LIMPEZA E FUSÃO — CUSTO DE FOLHA (CentraFin)
 *
 * Módulo ES puro, sem efeitos colaterais. Depende apenas do global
 * `window.XLSX` (xlsx@0.18.5 carregado via CDN no HTML da página).
 *
 * Exportações principais:
 *   - lerArquivoExcel(file)          -> Promise<any[][]>
 *   - processarRelatorioFolha(aoa)   -> Array<ObjetoFuncionario>
 *   - processarRelatorioBeneficios(aoa) -> Array<ObjetoFuncionario>
 *   - unificarBases(folha, bnf, cfg) -> Array<ObjetoFuncionario unificado>
 *
 * Contrato do ObjetoFuncionario (após fusão):
 *   { nome, cpf, centro_custo, competencia, origem: {folha, beneficios},
 *     [SALARIO_Valor], [SALARIO_Qtde], [INSS_Valor], ..., Bnf_VT, Bnf_VR, ... }
 */

// ──────────────────────────────────────────────────────────────────────────────
// UTILIDADES DE SANITIZAÇÃO
// ──────────────────────────────────────────────────────────────────────────────

/** Remove tudo que não for dígito. Ex.: "123.456.789-00" -> "12345678900" */
export function sanitizarCPF(valor) {
    return String(valor || '').replace(/\D/g, '');
}

/** CPF minimamente válido: 11 dígitos e não é sequência de um único número. */
export function cpfPareceValido(cpfLimpo) {
    if (!cpfLimpo || cpfLimpo.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cpfLimpo)) return false;
    return true;
}

/**
 * Converte valores brasileiros ("1.234,56") ou anglicizados ("1234.56")
 * para Number. Aceita também números já parseados. Strings vazias -> 0.
 */
export function parseNumeroBR(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    let s = String(v).trim();
    if (!s) return 0;

    // Remove símbolos (R$, espaço, etc.), preservando dígitos, vírgula, ponto e sinal.
    s = s.replace(/[^\d,.\-]/g, '');

    const negativo = s.startsWith('-');
    if (negativo) s = s.slice(1);

    let n;
    if (s.includes(',')) {
        // Formato BR: pontos são milhar, vírgula é decimal.
        n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    } else {
        n = parseFloat(s);
    }
    if (!isFinite(n)) return 0;
    return negativo ? -n : n;
}

/**
 * Gera uma chave estável a partir do nome do evento da Folha.
 *   "I.N.S.S. Patronal" -> "INSS_PATRONAL"
 *   "Salário"           -> "SALARIO"
 *   "FGTS"              -> "FGTS"
 */
export function slugEvento(str) {
    return String(str || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\./g, '')
        .replace(/[^\w\s]/g, ' ')
        .trim()
        .replace(/\s+/g, '_')
        .toUpperCase();
}

function normalizarCelula(v) {
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase();
}

// ──────────────────────────────────────────────────────────────────────────────
// LEITURA DE ARQUIVO (FileReader + XLSX)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Lê um File (xlsx/xls/csv) e retorna um Array-Of-Arrays cru (sem skip de linhas).
 * Requer window.XLSX disponível globalmente.
 */
export function lerArquivoExcel(file) {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.XLSX) {
            reject(new Error('Biblioteca XLSX não carregada. Inclua xlsx.full.min.js no HTML.'));
            return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo.'));
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                const wb = window.XLSX.read(data, { type: 'array', cellDates: false });
                const nomePrimeira = wb.SheetNames[0];
                const ws = wb.Sheets[nomePrimeira];
                const aoa = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
                resolve(aoa);
            } catch (err) { reject(err); }
        };
        reader.readAsArrayBuffer(file);
    });
}

// ──────────────────────────────────────────────────────────────────────────────
// PARSER BASE 1 — RELATÓRIO DE FOLHA + ENCARGOS (cabeçalho duplo sujo)
// ──────────────────────────────────────────────────────────────────────────────

/** Rótulos fixos (identificação do funcionário) que podem aparecer no sub-header. */
const ROTULOS_FIXOS = {
    CODIGO: ['CODIGO', 'COD', 'MATRICULA'],
    NOME: ['NOME', 'NOME FUNCIONARIO', 'FUNCIONARIO'],
    CPF: ['CPF'],
    FUNCAO: ['FUNCAO', 'CARGO'],
    CENTRO_CUSTO: ['CENTRO DE CUSTO', 'CENTRO CUSTO', 'CCUSTO', 'CC'],
    DEPARTAMENTO: ['DEPARTAMENTO', 'DEPTO', 'SETOR'],
    ADMISSAO: ['ADMISSAO', 'DATA ADMISSAO'],
    SALARIO_BASE: ['SALARIO BASE', 'SALARIO'],
};

function classificarColunaFixa(textoNormalizado) {
    for (const chave of Object.keys(ROTULOS_FIXOS)) {
        if (ROTULOS_FIXOS[chave].includes(textoNormalizado)) return chave;
    }
    return null;
}

/**
 * Processa o relatório "sujo" de Folha + Encargos.
 *
 * Estratégia:
 *   1) Varre linhas procurando o SUB-CABEÇALHO — linha que contém simultaneamente
 *      células com "CODIGO" e "NOME" (rótulos fixos do relatório).
 *   2) A linha IMEDIATAMENTE ANTERIOR ao sub-cabeçalho contém os NOMES DE EVENTOS
 *      (Salário, I.N.S.S., FGTS...). Um mesmo evento costuma rotular 2 colunas
 *      (Qtde + Valor) — então fazemos "carry-forward" do último texto não vazio.
 *   3) Monta o mapa de colunas: cada índice vira um rótulo fixo (CPF, NOME, ...)
 *      ou uma chave composta (`EVENTO_Qtde`, `EVENTO_Valor`).
 *   4) A partir da linha sub-cabeçalho+1, processa até o fim da planilha,
 *      ignorando linhas sem CPF, linhas de totalizador e repetições de cabeçalho.
 */
export function processarRelatorioFolha(dadosBrutos) {
    if (!Array.isArray(dadosBrutos) || dadosBrutos.length === 0) {
        throw new Error('Planilha de Folha vazia ou em formato inválido.');
    }

    // 1) Localizar sub-cabeçalho.
    let idxSub = -1;
    for (let i = 0; i < dadosBrutos.length; i++) {
        const row = dadosBrutos[i].map(normalizarCelula);
        const temCodigo = row.some(c => c === 'CODIGO' || c === 'COD' || c === 'MATRICULA');
        const temNome = row.some(c => c === 'NOME' || c === 'FUNCIONARIO');
        if (temCodigo && temNome) { idxSub = i; break; }
    }
    if (idxSub === -1) {
        throw new Error('Sub-cabeçalho não encontrado (esperado linha com "Código" e "Nome").');
    }
    if (idxSub === 0) {
        throw new Error('Sub-cabeçalho é a primeira linha — não há linha de eventos acima.');
    }

    const linhaEventos = dadosBrutos[idxSub - 1];
    const linhaSub = dadosBrutos[idxSub];
    const maxCols = Math.max(linhaSub.length, linhaEventos.length);

    // 2) Carry-forward dos nomes de evento.
    const eventosPorColuna = new Array(maxCols).fill('');
    let atual = '';
    for (let c = 0; c < maxCols; c++) {
        const t = String(linhaEventos[c] || '').trim();
        if (t) atual = t;
        eventosPorColuna[c] = atual;
    }

    // 3) Construção do mapa { indiceColuna -> chaveDestino }
    const mapaColunas = {};
    for (let c = 0; c < maxCols; c++) {
        const subTxt = normalizarCelula(linhaSub[c]);
        if (!subTxt) continue;

        const rotuloFixo = classificarColunaFixa(subTxt);
        if (rotuloFixo) { mapaColunas[c] = { tipo: 'fixo', chave: rotuloFixo }; continue; }

        if (subTxt === 'QTDE' || subTxt === 'QUANTIDADE' || subTxt === 'QT') {
            const evt = slugEvento(eventosPorColuna[c]);
            if (evt) mapaColunas[c] = { tipo: 'evento', chave: `${evt}_Qtde` };
            continue;
        }
        if (subTxt === 'VALOR' || subTxt === 'VLR' || subTxt === 'VL') {
            const evt = slugEvento(eventosPorColuna[c]);
            if (evt) mapaColunas[c] = { tipo: 'evento', chave: `${evt}_Valor` };
            continue;
        }
        // Coluna com um único rótulo (ex.: "Salário Base" direto no sub-cabeçalho).
        // Só tratamos se o evento não estiver classificado acima.
        const slug = slugEvento(linhaSub[c]);
        if (slug) mapaColunas[c] = { tipo: 'evento', chave: `${slug}_Valor` };
    }

    // 4) Descobre o índice da coluna de CPF (obrigatório para o filtro de linhas).
    const idxCPF = Object.keys(mapaColunas).find(k => mapaColunas[k].chave === 'CPF');
    if (idxCPF === undefined) {
        throw new Error('Coluna CPF não encontrada no sub-cabeçalho da Folha.');
    }

    // 5) Itera sobre as linhas de dados.
    const saida = [];
    for (let i = idxSub + 1; i < dadosBrutos.length; i++) {
        const row = dadosBrutos[i];
        if (!row || row.every(c => c === null || c === undefined || String(c).trim() === '')) continue;

        const cpfBruto = row[idxCPF];
        const cpfLimpo = sanitizarCPF(cpfBruto);
        if (!cpfLimpo) continue; // linha sem CPF -> ignora

        // Descarta qualquer linha de totalizador (presente em várias colunas).
        const linhaNorm = row.map(normalizarCelula).join(' | ');
        if (/\bTOTAL\b|\bTOTAIS\b|\bSUBTOTAL\b/.test(linhaNorm)) continue;
        // Re-impressões de cabeçalho no meio do relatório.
        if (linhaNorm.includes('CODIGO') && linhaNorm.includes('NOME')) continue;

        const obj = { cpf: cpfLimpo, _origem: 'folha' };
        for (const colStr of Object.keys(mapaColunas)) {
            const col = Number(colStr);
            const { tipo, chave } = mapaColunas[col];
            const bruto = row[col];

            if (tipo === 'fixo') {
                if (chave === 'CPF') continue; // já tratado
                obj[chave.toLowerCase()] = String(bruto || '').trim();
            } else {
                obj[chave] = parseNumeroBR(bruto);
            }
        }
        saida.push(obj);
    }

    return saida;
}

// ──────────────────────────────────────────────────────────────────────────────
// PARSER BASE 2 — RELATÓRIO DE BENEFÍCIOS (cabeçalho padrão)
// ──────────────────────────────────────────────────────────────────────────────

/** Mapa de rótulos aceitos -> chave destino no objeto. */
const MAPA_COLUNAS_BENEFICIOS = [
    { match: ['FIL-CODIGO', 'FILIAL', 'FIL CODIGO', 'COD FILIAL'], chave: 'filial' },
    { match: ['CODIGO', 'MATRICULA'], chave: 'codigo' },
    { match: ['NOME', 'FUNCIONARIO', 'NOME FUNCIONARIO'], chave: 'nome' },
    { match: ['CPF'], chave: 'cpf' },
    { match: ['CENTRO DE CUSTO', 'CENTRO CUSTO', 'CC'], chave: 'centro_custo' },
    { match: ['SALARIO BASE', 'SALARIO'], chave: 'salario_base' },
    { match: ['BNF VT', 'VT', 'VALE TRANSPORTE'], chave: 'Bnf_VT' },
    { match: ['BNF VR', 'VR', 'VALE REFEICAO'], chave: 'Bnf_VR' },
    { match: ['BNF VA', 'VA', 'VALE ALIMENTACAO'], chave: 'Bnf_VA' },
    { match: ['BNF PLANO SAUDE', 'PLANO DE SAUDE', 'PLANO SAUDE', 'ASSIST MEDICA'], chave: 'Bnf_PlanoSaude' },
    { match: ['BNF ODONTO', 'ODONTO', 'PLANO ODONTO'], chave: 'Bnf_Odonto' },
    { match: ['BNF SEGURO', 'SEGURO DE VIDA', 'SEGURO'], chave: 'Bnf_Seguro' },
];

const CAMPOS_NUMERICOS_BENEFICIOS = new Set([
    'salario_base', 'Bnf_VT', 'Bnf_VR', 'Bnf_VA', 'Bnf_PlanoSaude', 'Bnf_Odonto', 'Bnf_Seguro'
]);

function classificarColunaBeneficio(textoNormalizado) {
    for (const def of MAPA_COLUNAS_BENEFICIOS) {
        if (def.match.includes(textoNormalizado)) return def.chave;
    }
    return null;
}

/**
 * Processa o relatório padrão de Benefícios. Localiza a linha de cabeçalho
 * procurando a coexistência das colunas CPF + ao menos um "Bnf" / "Salário".
 */
export function processarRelatorioBeneficios(dadosBrutos) {
    if (!Array.isArray(dadosBrutos) || dadosBrutos.length === 0) {
        throw new Error('Planilha de Benefícios vazia ou em formato inválido.');
    }

    let idxHeader = -1;
    for (let i = 0; i < dadosBrutos.length; i++) {
        const row = dadosBrutos[i].map(normalizarCelula);
        const temCPF = row.includes('CPF');
        const temBnfOuSalario = row.some(c => c.startsWith('BNF ') || c === 'SALARIO BASE' || c === 'SALARIO');
        const temNome = row.some(c => c === 'NOME' || c === 'FUNCIONARIO' || c === 'NOME FUNCIONARIO');
        if (temCPF && temNome && temBnfOuSalario) { idxHeader = i; break; }
    }
    if (idxHeader === -1) {
        throw new Error('Cabeçalho de Benefícios não encontrado (CPF + Nome + Bnf/Salário).');
    }

    const header = dadosBrutos[idxHeader];
    const mapaColunas = {};
    header.forEach((celula, c) => {
        const chave = classificarColunaBeneficio(normalizarCelula(celula));
        if (chave) mapaColunas[c] = chave;
    });

    const idxCPF = Object.keys(mapaColunas).find(k => mapaColunas[k] === 'cpf');
    if (idxCPF === undefined) {
        throw new Error('Coluna CPF não localizada no cabeçalho de Benefícios.');
    }

    const saida = [];
    for (let i = idxHeader + 1; i < dadosBrutos.length; i++) {
        const row = dadosBrutos[i];
        if (!row || row.every(c => c === null || c === undefined || String(c).trim() === '')) continue;

        const cpfLimpo = sanitizarCPF(row[idxCPF]);
        if (!cpfLimpo) continue;

        const linhaNorm = row.map(normalizarCelula).join(' | ');
        if (/\bTOTAL\b|\bTOTAIS\b|\bSUBTOTAL\b/.test(linhaNorm)) continue;

        const obj = { cpf: cpfLimpo, _origem: 'beneficios' };
        for (const colStr of Object.keys(mapaColunas)) {
            const col = Number(colStr);
            const chave = mapaColunas[col];
            const bruto = row[col];
            if (chave === 'cpf') continue;
            if (CAMPOS_NUMERICOS_BENEFICIOS.has(chave)) {
                obj[chave] = parseNumeroBR(bruto);
            } else {
                obj[chave] = String(bruto || '').trim();
            }
        }
        saida.push(obj);
    }
    return saida;
}

// ──────────────────────────────────────────────────────────────────────────────
// MOTOR DE FUSÃO
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Unifica Folha + Benefícios indexando por CPF limpo.
 *
 * @param {Array<Object>} arrayFolha        Saída de processarRelatorioFolha
 * @param {Array<Object>} arrayBeneficios   Saída de processarRelatorioBeneficios
 * @param {Object} [cfg]
 * @param {string} [cfg.competencia]        Competência "MM/AAAA" digitada no front.
 * @param {string} [cfg.empresa]            Empresa atribuída (opcional).
 * @returns {Array<Object>}                 Lista flat pronta para Firestore.
 */
export function unificarBases(arrayFolha, arrayBeneficios, cfg = {}) {
    const { competencia = '', empresa = '' } = cfg;
    const mapa = new Map();

    const registrarOrigem = (obj, chave) => {
        if (!obj._origens) obj._origens = { folha: false, beneficios: false };
        obj._origens[chave] = true;
    };

    // 1) Popular com Folha.
    for (const reg of (arrayFolha || [])) {
        if (!reg || !reg.cpf) continue;
        const { _origem, ...resto } = reg;
        const destino = { cpf: reg.cpf, ...resto };
        registrarOrigem(destino, 'folha');
        mapa.set(reg.cpf, destino);
    }

    // 2) Merge com Benefícios.
    for (const reg of (arrayBeneficios || [])) {
        if (!reg || !reg.cpf) continue;
        const { _origem, ...resto } = reg;
        const existente = mapa.get(reg.cpf);
        if (existente) {
            // Benefícios não sobrescreve nome/centro_custo já vindos da Folha;
            // demais chaves (Bnf_*, salario_base) entram normalmente.
            for (const k of Object.keys(resto)) {
                if ((k === 'nome' || k === 'centro_custo') && existente[k]) continue;
                existente[k] = resto[k];
            }
            registrarOrigem(existente, 'beneficios');
        } else {
            const novo = { cpf: reg.cpf, ...resto };
            registrarOrigem(novo, 'beneficios');
            mapa.set(reg.cpf, novo);
        }
    }

    // 3) Consolida em array flat e anexa metadados solicitados no front.
    const saida = [];
    for (const reg of mapa.values()) {
        if (!cpfPareceValido(reg.cpf)) continue; // descarta CPFs malformados
        reg.competencia = competencia;
        if (empresa) reg.empresa_atribuida = empresa;
        reg.tipo = 'custo_folha';
        saida.push(reg);
    }
    return saida;
}

// ──────────────────────────────────────────────────────────────────────────────
// ORQUESTRADOR (esqueleto de integração com a futura UI)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Esqueleto do fluxo de importação. A UI (página HTML futura) deve chamar
 * este método passando os dois <input type="file"> e a competência.
 *
 * @returns {Promise<{ unificado: Array, diagnostico: Object }>}
 */
export async function importarCustoFolha({ fileFolha, fileBeneficios, competencia, empresa }) {
    if (!fileFolha) throw new Error('Planilha de Folha não selecionada.');
    if (!fileBeneficios) throw new Error('Planilha de Benefícios não selecionada.');
    if (!competencia || !/^\d{2}\/\d{4}$/.test(competencia)) {
        throw new Error('Competência inválida. Formato esperado: MM/AAAA.');
    }

    const [aoaFolha, aoaBnf] = await Promise.all([
        lerArquivoExcel(fileFolha),
        lerArquivoExcel(fileBeneficios),
    ]);

    const folha = processarRelatorioFolha(aoaFolha);
    const beneficios = processarRelatorioBeneficios(aoaBnf);
    const unificado = unificarBases(folha, beneficios, { competencia, empresa });

    const diagnostico = {
        totalFolha: folha.length,
        totalBeneficios: beneficios.length,
        totalUnificado: unificado.length,
        somenteFolha: unificado.filter(u => u._origens && u._origens.folha && !u._origens.beneficios).length,
        somenteBeneficios: unificado.filter(u => u._origens && !u._origens.folha && u._origens.beneficios).length,
        ambas: unificado.filter(u => u._origens && u._origens.folha && u._origens.beneficios).length,
    };

    return { unificado, diagnostico };
}
