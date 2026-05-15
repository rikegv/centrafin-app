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

/**
 * Normaliza CPF para 11 dígitos. Auditoria 2026-04-27: o Excel costuma comer
 * o zero à esquerda quando a coluna é numérica (ex.: "01234567890" vira o
 * número 1234567890 com 10 dígitos), o que antes derrubava o registro do
 * headcount. O padStart blinda esse caso.
 *
 * Regras:
 *   - 0 dígitos          → '' (linha sem CPF — caller decide o que fazer)
 *   - 1..10 dígitos      → preenche zeros à esquerda até 11
 *   - 11 dígitos         → mantém
 *   - 12+ dígitos        → primeiros 11 (defensivo, não deve acontecer)
 */
export function normalizarCPF(valor) {
    const digitos = String(valor || '').replace(/\D/g, '');
    if (!digitos) return '';
    if (digitos.length === 11) return digitos;
    if (digitos.length < 11) return digitos.padStart(11, '0');
    return digitos.slice(0, 11);
}

/** Alias retrocompatível — não use em código novo. */
export const sanitizarCPF = normalizarCPF;

/**
 * Centro de Custo "sujo": null, undefined, vazio, "." ou "-" (após trim).
 * Esses valores chegam com frequência da exportação do sistema de RH e não
 * podem ir para o Firestore — viram pendência tratada no Modal de Quarentena
 * (motor de sanitização ETL, auditoria 2026-05-14).
 */
export function centroCustoEhSujo(valor) {
    if (valor === null || valor === undefined) return true;
    const s = String(valor).trim();
    if (!s) return true;
    if (s === '.' || s === '-') return true;
    return false;
}

/**
 * CPF minimamente válido: 11 dígitos. Sequência repetida (000.000.000-00,
 * 111.111.111-11 etc.) ainda costuma aparecer em planilhas reais como
 * "placeholder" de funcionário sem CPF cadastrado — DEIXAMOS PASSAR para
 * não furar o headcount. A unicidade no Firestore é por docId auto, não
 * por CPF, então um sequencial repetido não quebra nada.
 */
export function cpfPareceValido(cpfLimpo) {
    return !!cpfLimpo && cpfLimpo.length === 11;
}

/**
 * Converte valores brasileiros ("1.234,56"), anglicizados ("1,234.56") ou
 * puros ("1234.56" / "1234,56") para Number. Aceita também números já parseados.
 *
 * Regra: o ÚLTIMO separador (ponto ou vírgula) é o decimal; separadores anteriores
 * são tratados como agrupadores de milhar e descartados. Isso blinda o parser
 * contra planilhas que o Excel exporta com format-code en-US mesmo em ambiente
 * pt-BR (ex.: "2,912.28" chegava como 2.91228 no parser antigo, resultando em
 * valores 1000× menores na folha).
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

    const ultPonto   = s.lastIndexOf('.');
    const ultVirgula = s.lastIndexOf(',');
    let numStr;
    if (ultPonto !== -1 && ultVirgula !== -1) {
        // Tem os dois: o ÚLTIMO a aparecer é o decimal.
        if (ultPonto > ultVirgula) {
            // Decimal é ponto (en-US) — descarta vírgulas (milhar).
            numStr = s.replace(/,/g, '');
        } else {
            // Decimal é vírgula (pt-BR) — descarta pontos (milhar), troca vírgula por ponto.
            numStr = s.replace(/\./g, '').replace(',', '.');
        }
    } else if (ultVirgula !== -1) {
        // Só vírgula — decimal BR ("1234,56").
        numStr = s.replace(',', '.');
    } else if (ultPonto !== -1) {
        // Só ponto — AMBÍGUO (pode ser decimal "2.91" ou milhar "2.912").
        // Desambiguação: se há mais de um ponto, todos são milhar; se há exatamente
        // um com 3 dígitos depois e sem outros separadores, tratamos como MILHAR
        // (convenção pt-BR: 2.912 = 2912). Caso contrário, é decimal.
        const qtdePontos = (s.match(/\./g) || []).length;
        const depois = s.length - ultPonto - 1;
        if (qtdePontos >= 2 || depois === 3) {
            numStr = s.replace(/\./g, '');
        } else {
            numStr = s; // decimal
        }
    } else {
        numStr = s; // só dígitos
    }

    const n = parseFloat(numStr);
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

/**
 * Slug determin\u00edstico de cargo/fun\u00e7\u00e3o para compor a Chave Composta de
 * unicidade do colaborador (CPF + Cargo). Auditoria 2026-04-28: o usu\u00e1rio
 * detectou que promo\u00e7\u00f5es no meio do m\u00eas (Estagi\u00e1rio \u2192 Efetivo) compartilham
 * o mesmo CPF mas representam DOIS contratos distintos com custos pr\u00f3prios.
 * O dedup por CPF puro estava esmagando o primeiro contrato.
 *
 * Regras:
 *   - Vazio / null     \u2192 'SEM_CARGO'
 *   - Acentos          \u2192 removidos
 *   - Caixa            \u2192 UPPERCASE
 *   - N\u00e3o-alfanum\u00e9rico \u2192 '_'
 *   - 80+ chars        \u2192 corte defensivo
 */
export function slugCargo(valor) {
    const slug = String(valor || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80);
    return slug || 'SEM_CARGO';
}

/** Chave Composta de unicidade do contrato: CPF + CargoSlug. */
export function chaveContrato(cpf, cargo) {
    return `${cpf}::${slugCargo(cargo)}`;
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

/** Rótulos fixos (identificação do funcionário) que podem aparecer no sub-header.
 *  Auditoria 2026-04-28: DEMISSAO/DESLIGAMENTO/RESCISAO entraram aqui para que
 *  o ETL pare de jogar essas colunas no parseNumeroBR (que zerava as datas) e
 *  passe a guardá-las como STRING preservando o valor original. Necessário
 *  para a regra cronológica antigo→novo no modal de Movimentações. */
const ROTULOS_FIXOS = {
    CODIGO: ['CODIGO', 'COD', 'MATRICULA'],
    NOME: ['NOME', 'NOME FUNCIONARIO', 'FUNCIONARIO'],
    CPF: ['CPF'],
    FUNCAO: ['FUNCAO', 'CARGO'],
    CENTRO_CUSTO: ['CENTRO DE CUSTO', 'CENTRO CUSTO', 'CCUSTO', 'CC'],
    DEPARTAMENTO: ['DEPARTAMENTO', 'DEPTO', 'SETOR'],
    ADMISSAO: ['ADMISSAO', 'DATA ADMISSAO', 'DT ADMISSAO', 'DATA DE ADMISSAO'],
    DEMISSAO: ['DEMISSAO', 'DATA DEMISSAO', 'DT DEMISSAO', 'DATA DE DEMISSAO',
               'DESLIGAMENTO', 'DATA DESLIGAMENTO', 'DT DESLIGAMENTO',
               'DATA DE DESLIGAMENTO', 'DATA RESCISAO', 'DT RESCISAO'],
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
    let totalLinhas = 0, descartadasVazias = 0, descartadasSemCPF = 0,
        descartadasTotalizador = 0, descartadasCabecalho = 0;
    for (let i = idxSub + 1; i < dadosBrutos.length; i++) {
        totalLinhas++;
        const row = dadosBrutos[i];
        if (!row || row.every(c => c === null || c === undefined || String(c).trim() === '')) {
            descartadasVazias++;
            continue;
        }

        const cpfBruto = row[idxCPF];
        const cpfLimpo = normalizarCPF(cpfBruto);
        if (!cpfLimpo) {
            // Linha sem dígitos no CPF — quase sempre totalizador ou separador.
            // Logamos pra auditoria caso seja um colaborador real perdido.
            descartadasSemCPF++;
            continue;
        }

        // Descarta qualquer linha de totalizador (presente em várias colunas).
        const linhaNorm = row.map(normalizarCelula).join(' | ');
        if (/\bTOTAL\b|\bTOTAIS\b|\bSUBTOTAL\b/.test(linhaNorm)) {
            descartadasTotalizador++;
            continue;
        }
        // Re-impressões de cabeçalho no meio do relatório.
        if (linhaNorm.includes('CODIGO') && linhaNorm.includes('NOME')) {
            descartadasCabecalho++;
            continue;
        }

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

    console.log('[ETL Folha] Linhas processadas:', {
        totalLinhas,
        aceitas: saida.length,
        descartadasVazias,
        descartadasSemCPF,
        descartadasTotalizador,
        descartadasCabecalho,
    });
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
    let totalLinhas = 0, descartadasVazias = 0, descartadasSemCPF = 0,
        descartadasTotalizador = 0;
    for (let i = idxHeader + 1; i < dadosBrutos.length; i++) {
        totalLinhas++;
        const row = dadosBrutos[i];
        if (!row || row.every(c => c === null || c === undefined || String(c).trim() === '')) {
            descartadasVazias++;
            continue;
        }

        const cpfLimpo = normalizarCPF(row[idxCPF]);
        if (!cpfLimpo) { descartadasSemCPF++; continue; }

        const linhaNorm = row.map(normalizarCelula).join(' | ');
        if (/\bTOTAL\b|\bTOTAIS\b|\bSUBTOTAL\b/.test(linhaNorm)) {
            descartadasTotalizador++;
            continue;
        }

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
    console.log('[ETL Benefícios] Linhas processadas:', {
        totalLinhas,
        aceitas: saida.length,
        descartadasVazias,
        descartadasSemCPF,
        descartadasTotalizador,
    });
    return saida;
}

// ──────────────────────────────────────────────────────────────────────────────
// MOTOR DE FUSÃO
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Campos de benefícios que devem existir em TODO registro consolidado, mesmo
 * quando a planilha de Benefícios não foi enviada ou quando o CPF da Folha
 * não tem correspondência no Bnf. Auditoria 2026-04-28: o usuário pediu que
 * importações parciais (apenas Folha) preencham VR/VA/VT/Plano/Odonto/Seguro
 * com 0 — assim Diretores que só aparecem na Folha não inflam custo total
 * com NaN nem ficam de fora do dashboard. salario_base também entra aqui:
 * a Folha tem o salário no bucket SALARIO_*_Valor (vencimentos), e o
 * salario_base extraído da Bnf é só para conferência cruzada.
 */
export const CAMPOS_BENEFICIOS_ZERAVEIS = Object.freeze([
    'Bnf_VT', 'Bnf_VR', 'Bnf_VA',
    'Bnf_PlanoSaude', 'Bnf_Odonto', 'Bnf_Seguro',
    'salario_base',
]);

/**
 * Unifica Folha + Benefícios indexando por CHAVE COMPOSTA: CPF + Cargo.
 *
 * Auditoria 2026-04-28: promoções/mudanças de cargo no meio do mês criam
 * múltiplas linhas na Folha com o mesmo CPF, mas com `funcao` distinta. A
 * lógica anterior (`mapa.set(cpf, ...)`) sobrescrevia silenciosamente o
 * primeiro contrato (ex.: Estagiário) ao processar o segundo (ex.: Efetivo),
 * derrubando o headcount real e o custo total. Agora cada `(cpf, cargo)`
 * é um registro próprio.
 *
 * Estratégia para Benefícios (que tipicamente NÃO traz `funcao`):
 *   1) Se houver match exato `cpf::cargoSlug`, merge ali.
 *   2) Caso contrário, anexa ao PRIMEIRO contrato com mesmo CPF (preserva o
 *      total de benefícios — não duplica para todos os cargos).
 *   3) Se não houver match algum (CPF só na planilha de Bnf), cria entrada
 *      nova com cargo derivado do próprio Bnf (ou SEM_CARGO).
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
    const cpfParaChaves = new Map(); // cpf -> [chave1, chave2, ...] (ordem de inserção)

    const registrarOrigem = (obj, chave) => {
        if (!obj._origens) obj._origens = { folha: false, beneficios: false };
        obj._origens[chave] = true;
    };

    const indexarChave = (cpf, chave) => {
        if (!cpfParaChaves.has(cpf)) cpfParaChaves.set(cpf, []);
        const lista = cpfParaChaves.get(cpf);
        if (!lista.includes(chave)) lista.push(chave);
    };

    // 1) Popular com Folha — chave = cpf::cargoSlug.
    let contratosColapsados = 0; // mesmo cpf+cargo aparecendo 2x na mesma planilha
    for (const reg of (arrayFolha || [])) {
        if (!reg || !reg.cpf) continue;
        const { _origem, ...resto } = reg;
        const chave = chaveContrato(reg.cpf, reg.funcao);

        const existente = mapa.get(chave);
        if (existente) {
            // Caso defensivo: mesma combinação cpf+cargo na mesma planilha.
            // Mantemos o comportamento histórico (overwrite) para não inflar
            // valores via duplicação acidental — só logamos pra auditoria.
            contratosColapsados++;
            for (const k of Object.keys(resto)) existente[k] = resto[k];
            registrarOrigem(existente, 'folha');
        } else {
            const destino = { cpf: reg.cpf, ...resto };
            registrarOrigem(destino, 'folha');
            mapa.set(chave, destino);
            indexarChave(reg.cpf, chave);
        }
    }
    if (contratosColapsados > 0) {
        console.warn(`[ETL Folha] ${contratosColapsados} linha(s) com mesmo cpf+cargo foram colapsadas (overwrite). Verifique a planilha se isso não for esperado.`);
    }

    // 2) Merge com Benefícios — match por cpf+cargo, fallback no 1º cpf.
    let bnfMatchExato = 0, bnfMatchPorCpf = 0, bnfNovo = 0;
    for (const reg of (arrayBeneficios || [])) {
        if (!reg || !reg.cpf) continue;
        const { _origem, ...resto } = reg;
        const chaveExata = chaveContrato(reg.cpf, reg.funcao);

        let chaveAlvo;
        if (mapa.has(chaveExata)) {
            chaveAlvo = chaveExata;
            bnfMatchExato++;
        } else {
            const candidatas = cpfParaChaves.get(reg.cpf);
            if (candidatas && candidatas.length > 0) {
                chaveAlvo = candidatas[0];
                bnfMatchPorCpf++;
            } else {
                chaveAlvo = chaveExata;
                bnfNovo++;
            }
        }

        const existente = mapa.get(chaveAlvo);
        if (existente) {
            // Benefícios não sobrescreve nome/centro_custo/funcao já vindos da Folha.
            for (const k of Object.keys(resto)) {
                if ((k === 'nome' || k === 'centro_custo' || k === 'funcao') && existente[k]) continue;
                existente[k] = resto[k];
            }
            registrarOrigem(existente, 'beneficios');
        } else {
            const novo = { cpf: reg.cpf, ...resto };
            registrarOrigem(novo, 'beneficios');
            mapa.set(chaveAlvo, novo);
            indexarChave(reg.cpf, chaveAlvo);
        }
    }
    console.log('[ETL Bnf] Match:', { exatoCpfCargo: bnfMatchExato, fallbackCpf: bnfMatchPorCpf, novosRegistros: bnfNovo });

    // 3) Consolida em array flat e anexa metadados solicitados no front.
    // Auditoria 2026-04-27: NÃO descartamos mais por CPF malformado — o
    // headcount tem que refletir QUEM apareceu na planilha. CPFs com problema
    // são logados pra investigação manual, mas o registro vai pro Firestore.
    //
    // Auditoria 2026-04-28 (Left Join): garantimos que TODO registro consolidado
    // tenha os campos de benefícios zerados quando faltarem. Importações de
    // apenas Folha (Diretores etc.) deixam de quebrar o cálculo de Custo Total
    // por undefined/NaN, e a UI dashboarda 0 explicitamente em vez de "—".
    const saida = [];
    let cpfsMalformados = 0;
    for (const reg of mapa.values()) {
        // Normalização final defensiva da chave composta cpf+cargo.
        // Auditoria 2026-04-28: a regressão do KPI Headcount apontou risco de
        // contagem dupla quando uma planilha trazia o mesmo CPF com formatações
        // diferentes ou quando funcao chegava como undefined/null/whitespace.
        // Aplicamos normalizarCPF (só dígitos, padded a 11) e String(funcao).trim()
        // ANTES de o registro sair do ETL — garante que dashboard e Firestore
        // recebam sempre cpf+cargo em formato canônico.
        reg.cpf = normalizarCPF(reg.cpf);
        reg.funcao = String(reg.funcao || '').trim();
        if (!cpfPareceValido(reg.cpf)) {
            cpfsMalformados++;
            console.warn('[ETL Folha] CPF malformado mantido no headcount:',
                JSON.stringify({ cpf: reg.cpf, nome: reg.nome || '(sem nome)' }));
        }
        for (const campo of CAMPOS_BENEFICIOS_ZERAVEIS) {
            if (typeof reg[campo] !== 'number' || !Number.isFinite(reg[campo])) {
                reg[campo] = 0;
            }
        }
        // Motor de Quarentena (auditoria 2026-05-14): sinaliza registros com
        // centro_custo "sujo" (null/""/"./"-") para o passo de lookback + modal
        // de tratamento. Não bloqueia o ETL — apenas marca; a UI decide o que
        // fazer antes de gravar no Firestore.
        if (centroCustoEhSujo(reg.centro_custo)) {
            reg.pendente_tratamento = true;
            reg.centro_custo = '';
        } else {
            reg.pendente_tratamento = false;
            reg.centro_custo = String(reg.centro_custo).trim();
        }
        reg.competencia = competencia;
        if (empresa) reg.empresa_atribuida = empresa;
        reg.tipo = 'custo_folha';
        saida.push(reg);
    }
    if (cpfsMalformados > 0) {
        console.warn(`[ETL Folha] ${cpfsMalformados} colaborador(es) com CPF malformado entraram no headcount. Verifique a planilha original.`);
    }
    return saida;
}

// ──────────────────────────────────────────────────────────────────────────────
// ORQUESTRADOR (esqueleto de integração com a futura UI)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Orquestra o fluxo completo de importação. Auditoria 2026-04-28: a planilha
 * de Benefícios passou a ser OPCIONAL — quando ausente, o sistema processa
 * só a Folha e zera os campos de benefícios em todos os registros (Diretores
 * que não aparecem no Bnf agora entram corretamente sem quebrar o cálculo
 * de Custo Total). Folha continua sendo OBRIGATÓRIA.
 *
 * @param {Object} cfg
 * @param {File}     cfg.fileFolha       Planilha de Folha + Encargos (obrigatória).
 * @param {File?}    cfg.fileBeneficios  Planilha de Benefícios (opcional).
 * @param {string}   cfg.competencia     "MM/AAAA".
 * @param {string?}  cfg.empresa         Empresa atribuída.
 * @returns {Promise<{ unificado: Array, diagnostico: Object }>}
 */
export async function importarCustoFolha({ fileFolha, fileBeneficios, competencia, empresa }) {
    if (!fileFolha) throw new Error('Planilha de Folha não selecionada.');
    if (!competencia || !/^\d{2}\/\d{4}$/.test(competencia)) {
        throw new Error('Competência inválida. Formato esperado: MM/AAAA.');
    }
    const temBeneficios = !!fileBeneficios;

    const [aoaFolha, aoaBnf] = await Promise.all([
        lerArquivoExcel(fileFolha),
        temBeneficios ? lerArquivoExcel(fileBeneficios) : Promise.resolve(null),
    ]);

    const folha = processarRelatorioFolha(aoaFolha);
    const beneficios = temBeneficios ? processarRelatorioBeneficios(aoaBnf) : [];
    const unificado = unificarBases(folha, beneficios, { competencia, empresa });

    // Diagnóstico enriquecido: o campo `comBeneficiosVinculados` é o que a UI
    // mostra na mensagem de sucesso. Quando o Bnf não foi enviado, fica em 0.
    const comBeneficiosVinculados = unificado.filter(u =>
        u._origens && u._origens.folha && u._origens.beneficios
    ).length;
    const diagnostico = {
        totalFolha: folha.length,
        totalBeneficios: beneficios.length,
        totalUnificado: unificado.length,
        somenteFolha: unificado.filter(u => u._origens && u._origens.folha && !u._origens.beneficios).length,
        somenteBeneficios: unificado.filter(u => u._origens && !u._origens.folha && u._origens.beneficios).length,
        ambas: comBeneficiosVinculados,
        comBeneficiosVinculados,
        beneficiosImportado: temBeneficios,
        pendentesTratamento: unificado.filter(u => u.pendente_tratamento).length,
    };

    return { unificado, diagnostico };
}
