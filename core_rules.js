/* ==========================================================================
 *  core_rules.js  —  FONTE ÚNICA DA VERDADE para o módulo de Faturamento.
 *
 *  Carregado via <script src="../core_rules.js"> ANTES dos módulos do
 *  Gerenciador (contas_a_receber_desktop) e do Dashboard Master
 *  (dashboard_master_desktop). As funções abaixo são declaradas no escopo
 *  global do script — portanto acessíveis tanto como identifiers livres
 *  dentro de <script type="module"> quanto como `window.xxx`.
 *
 *  REGRA DE OURO: NUNCA duplique nenhuma destas funções localmente nos
 *  módulos. Se precisar de uma variação, crie um helper específico ali e
 *  chame estas funções como base. O algoritmo é único.
 * ========================================================================== */

/* ---------------- Parsers numéricos / de data ---------------- */

// Parser de moeda format-aware (BR / US / Number).
// "1.234,56" → 1234.56  |  "1,234.56" → 1234.56  |  "1234,56" → 1234.56  |  "1234.56" → 1234.56
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
      // BR: "1.234,56" — pontos são milhar, vírgula é decimal.
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // US: "1,234.56" — vírgulas são milhar.
      s = s.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

// "YYYY-MM-DD" local SEM round-trip por UTC. Aceita Timestamp/Date/serial Excel/string BR/ISO.
function extrairISOLocal(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  try {
    const pad = (n) => String(n).padStart(2, '0');
    if (raw && typeof raw.toDate === 'function') {
      const d = raw.toDate();
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    if (raw instanceof Date) {
      return `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`;
    }
    if (typeof raw === 'number') {
      const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    const s = String(raw).trim();
    const mBR = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (mBR) return `${mBR[3]}-${mBR[2]}-${mBR[1]}`;
    const mISO = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (mISO) return `${mISO[1]}-${mISO[2]}-${mISO[3]}`;
    return '';
  } catch (e) { return ''; }
}

// Date local construído sem round-trip por UTC. Devolve null se não conseguir parsear.
function parseDataLocal(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw && typeof raw.toDate === 'function') return raw.toDate();
  if (raw instanceof Date) return raw;
  if (typeof raw === 'number') {
    const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = String(raw).trim();
  if (s === '' || s === '-') return null;
  if (s.includes('/')) {
    const p = s.split(' ')[0].split('/');
    if (p.length === 3) {
      return new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10));
    }
  }
  const mISO = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mISO) return new Date(parseInt(mISO[1], 10), parseInt(mISO[2], 10) - 1, parseInt(mISO[3], 10));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/* ---------------- Regras de negócio ---------------- */

// Empresa atribuída a partir do tipo de serviço (descrição do contrato).
// REGRA: ASSESSMENT pertence à NEAT (Visão Thomas), não a SOULAN ADM.
function calcularEmpresaAtribuida(tipoServico) {
  // NFD strip + UPPER mata o bug de acento — auditoria 2026-06-19. Antes só
  // fazia .toUpperCase(), então `"ESTÁGIO".includes("ESTAGIO")` era FALSE e a
  // nota voltava com empresa "" (sumindo de toda visão — origem do vazamento
  // dos ~R$141,59 em Soulan). Espelha o normalizador de `calcularFaturamentoReal`.
  // IMPORTANTE: como o input vem sem acento, as keywords TAMBÉM são sem acento
  // (ex.: "INTEGRACAO", não "INTEGRAÇÃO").
  const desc = String(tipoServico || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  if (desc.includes("TEMPORARIO")) return "SOULAN CONSULTORIA";
  if (desc.includes("ESTAGIO")) return "ESTÁGIO";
  const adm = ["TERCEIROS", "FOPAG", "CONSULTORIA", "RPO"];
  if (adm.some(k => desc.includes(k))) return "SOULAN ADM";
  const neat = ["TREINAMENTO", "PROCESSAMENTO DE PPA", "SUBSCRIPTION", "HR METRICS", "INTEGRACAO", "UNIDADES", "DEVOLUTIVA", "HOTMART", "ASSESSMENT"];
  if (neat.some(k => desc.includes(k))) return "NEAT";
  return "";
}

// Faturamento Real puro: 100% Taxa (Grupo A) / 55% Taxa (Grupo B) / fallback 0.
// NFD strip + trim + UPPER mata o bug de acento ("ESTÁGIO" → "ESTAGIO").
// `valorFatura` mantido na assinatura por compatibilidade — NÃO entra na conta.
function calcularFaturamentoReal(descricaoContrato, valorFatura, valorTaxa) {
  const desc = String(descricaoContrato || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .trim().toUpperCase();
  const taxa = Number(valorTaxa) || 0;
  const grupo1 = ["TEMPORARIO", "ESTAGIO", "TERCEIROS", "FOPAG", "CONSULTORIA", "RPO"];
  const grupo2 = ["TREINAMENTO", "PROCESSAMENTO DE PPA", "SUBSCRIPTION", "HR METRICS", "INTEGRACAO", "UNIDADES", "DEVOLUTIVA", "ASSESSMENT", "HOTMART"];
  if (grupo1.some(g => desc.includes(g))) return taxa;
  if (grupo2.some(g => desc.includes(g))) return taxa * 0.55;
  return 0;
}

// Valor Líquido = "Vl. Líquido" (raw) − "Valor Descto." (raw); fallback p/ snapshot.
function obterValorLiquido(data) {
  if (!data) return 0;
  const brutoCru = data['Vl. Líquido'] !== undefined ? data['Vl. Líquido']
    : (data['Vl Líquido'] !== undefined ? data['Vl Líquido']
      : (data['Valor Líquido'] !== undefined ? data['Valor Líquido'] : null));
  if (brutoCru !== null && brutoCru !== '') {
    const bruto = parseMoedaCRF(brutoCru);
    const desconto = parseMoedaCRF(data['Valor Descto.'] || data['valor_desconto'] || data['Desconto']);
    return Number((bruto - desconto).toFixed(2));
  }
  return parseMoedaCRF(data['valor_liquido']);
}

// Faturamento Real efetivo da nota: honra override manual `faturamento_real_manual`,
// senão recalcula via `calcularFaturamentoReal` com a Taxa.
function obterFaturamentoReal(data) {
  const manualRaw = data && data.faturamento_real_manual;
  if (manualRaw !== undefined && manualRaw !== null && manualRaw !== '') {
    return parseMoedaCRF(manualRaw);
  }
  const desc = (data && (data.descricao_contrato || data['Descrição Do Contrato'] || data['Tipo de Serviço'] || data.tipo_servico || data.descricao)) || '';
  const vFatura = parseMoedaCRF(data && (data.valor_fatura || data['Valor Fatura'] || data.valor));
  const vTaxa = parseMoedaCRF(data && (data.taxa || data['Taxa'] || data['Valor Taxa'] || data['Vl. Taxa'] || 0));
  return calcularFaturamentoReal(desc, vFatura, vTaxa);
}

// Postpor uma data para o próximo dia útil quando ela cair em sábado ou domingo.
// Não considera feriados — apenas fins de semana, conforme spec do parcelamento.
// Domingo (getDay()===0) → +1 dia (Segunda). Sábado (getDay()===6) → +2 dias (Segunda).
function obterProximoDiaUtil(data) {
  if (!(data instanceof Date) || isNaN(data.getTime())) return null;
  const d = new Date(data.getTime());
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  if (dow === 0) d.setDate(d.getDate() + 1);
  else if (dow === 6) d.setDate(d.getDate() + 2);
  return d;
}

// Status canônico (Cancelada / DESMEMBRADO / PREJUÍZO / PROTESTO / RECEBIDO / VENCIDO / A VENCER).
// Interceptações ABSOLUTAS de cancelado/desmembrado/prejuízo/protesto antes da checagem de baixa.
function obterStatusReal(data, hojeData) {
  if (!hojeData) hojeData = new Date();
  if (typeof hojeData.setHours === 'function') hojeData.setHours(0, 0, 0, 0);
  const sRaw = String(data['status'] || data['Status'] || data['Situação'] || '').toUpperCase();
  const baixaRawStr = String(data['data_baixa'] || data['Dt Baixa'] || data['data_recebimento'] || '').toUpperCase();
  // Blob de TODOS os campos de status + baixa. O `status` (app) pode estar defasado
  // ("RECEBIDO") enquanto o `Status` (ERP) carrega a verdade ("Cancelada"); por isso
  // varremos todos atrás de "CANC"/"DESMEMBR", e não só o primeiro campo não-vazio —
  // senão o cancelamento vaza para os KPIs quando a baixa é uma data válida.
  const statusBlob = [data['status'], data['Status'], data['Situação'], data['data_baixa'], data['Dt Baixa'], data['data_recebimento']]
    .map(v => String(v == null ? '' : v).toUpperCase()).join(' | ');

  if (statusBlob.includes("CANC")) return "Cancelada";
  // DESMEMBRADO: nota original que foi parcelada — sai de TODOS os KPIs (igual a Cancelada),
  // pois o faturamento real agora vive nas parcelas-filhas para evitar duplicidade.
  if (statusBlob.includes("DESMEMBR")) return "DESMEMBRADO";
  if (sRaw.includes("PREJUÍZO") || sRaw.includes("PREJUIZO")) return "PREJUÍZO";
  if (sRaw.includes("PROTESTO")) return "PROTESTO";
  if (sRaw.includes("PAGO") || sRaw.includes("RECEBIDO") || sRaw.includes("BAIXADO")) return "RECEBIDO";

  const baixaRaw = data['data_baixa'] || data['Dt Baixa'] || data['data_recebimento'];
  if (baixaRaw && String(baixaRaw).trim() !== "" && String(baixaRaw).trim() !== "-") {
    return "RECEBIDO";
  }

  const vencRaw = data['vencimento'] || data['Dt Vecto  '] || data['Dt Vecto'] || "";
  const dVenc = parseDataLocal(vencRaw);
  if (dVenc && !isNaN(dVenc.getTime())) {
    dVenc.setHours(0, 0, 0, 0);
    if (dVenc < hojeData) return "VENCIDO";
    return "A VENCER";
  }

  if (sRaw.includes("VENCIDO") || sRaw.includes("ATRASADO")) return "VENCIDO";
  return "A VENCER";
}

/* -------- Custo de Folha — funções compartilhadas (Fonte Única) ------- */

// Normaliza competência PJ para formato canônico "YYYY-MM".
// CP grava "MM/YYYY"; Folha usa "YYYY-MM". Fallback: data_vencimento "YYYY-MM-DD".
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

// Normalização canônica de nome de empresa.
// "SOULAN CONSULTORIA 3" → "SOULAN CONSULTORIA" (regra diretoria).
// Sentinela "PJ" → "SOULAN CONSULTORIA" (fallback anti-sentinela).
function folhaEmpresaCanonica(empresaRaw) {
    var emp = String(empresaRaw || '').trim();
    if (!emp) return emp;
    var cmp = emp.toUpperCase().replace(/\s+/g, ' ').trim();
    if (cmp === 'SOULAN CONSULTORIA 3') return 'SOULAN CONSULTORIA';
    if (cmp === 'PJ') return 'SOULAN CONSULTORIA';
    return emp;
}

// Resolve a empresa REAL de um PJ via lookup em Fornecedores.
// caches = { porCodigo: Map, porDoc: Map, porNome: Map }
// Cascata: (1) código fornecedor → (2) CNPJ/CPF → (3) nome → (4) empresa do lançamento.
function folhaPjResolverEmpresa(codForn, dataLanc, caches) {
    var _norm = function(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim(); };
    var _digitos = function(s) { return String(s || '').replace(/\D/g, ''); };
    var emp = '';
    if (codForn != null && caches.porCodigo && caches.porCodigo.has(String(codForn))) {
        emp = caches.porCodigo.get(String(codForn));
    }
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

/* -------- Custo de Folha — classificação e cálculo (Fonte Única) ------ */
// Extraído do Gerenciador (custo_folha_desktop) sem alteração de lógica.
// Ambos os módulos (Gerenciador e Dashboard) importam daqui.

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
        key.includes('EDUCACAO') || key.includes('FGTS') || key.includes('BASE_')) {
        return false;
    }
    var keywords = [
        'SALARIO', 'PRO_LABORE', 'DSR', 'CRECHE',
        'COMISSAO', 'BANCO_DE_HORAS', 'ARREDONDAMENTO', 'REEMBOLSO',
        'AVISO_PREVIO', 'FERIAS', '1_3', 'EMPRESTIMO_SALDO_NEGATIVO',
        '13O', 'AJUDA_DE_CUSTO', 'RESCISAO', 'HORA_EXTRA',
        'PARTICIPACAO', 'LUCRO',
        'BONUS', 'PREMIO', 'PREMIACAO', 'GRATIFICACAO',
        'SERVICOS_PRESTADOS',
        'BOLSA_AUXILIO',
        'DIFERENCA',
    ];
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
    var tokens = ['INSS_PATRONAL', 'FGTS', 'TERCEIROS', 'RAT', 'FAP', 'SISTEMA_S'];
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

var FOLHA_CUSTO_SET_BNF_PAGO = new Set([
    'VALE_TRANSPORTE_Valor', 'VALE_REFEICAO_Valor',
    'ASSISTENCIA_MEDICA_Valor', 'ASSISTENCIA_ODONTOLOGICA_Valor',
    'VALE_ALIMENTACAO_Valor',
]);

var FOLHA_CUSTO_SET_BNF_DESC = new Set([
    'SEGURO_DE_VIDA_Valor', 'DESCTO_DE_VALE_TRANSPORTE_Valor',
    'DEVOLUCAO_DE_VR_NAO_UTILIZADO_Valor',
    'DESCTO_DE_VALE_REFEICAO_Valor',
    'DESCTO_DE_ASSISTENCIA_MEDICA_Valor',
]);

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
    var key = String(k || '')
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

// Motor central de cálculo de custo de folha. Retorna os 5 buckets contábeis.
// NÃO altera o registro (reg) — a injeção volátil de total_beneficios_* é
// responsabilidade do chamador, se necessário.
function folhaCustoCalcularTotais(reg) {
    var vencimentos = 0, encargos = 0, beneficios = 0, descontosBnf = 0, salarioBruto = 0;
    var usarSomenteTXT = (reg && reg._has_benef_txt === true);
    var keys = Object.keys(reg || {});
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var raw = reg[k];
        if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
        if (folhaCustoIsDescFolhaInfo(k))    { continue; }
        if (folhaCustoIsEncargo(k))          { encargos += raw; continue; }
        if (k.startsWith('Bnf_'))            { beneficios += raw; continue; }
        if (k.startsWith('BnfDesc_'))        { descontosBnf += raw; continue; }
        if (!usarSomenteTXT && FOLHA_CUSTO_SET_BNF_PAGO.has(k)) { beneficios += raw; continue; }
        if (!usarSomenteTXT && folhaCustoIsBnfDesc(k))          { descontosBnf += raw; continue; }
        if (folhaCustoIsVencimento(k)) {
            vencimentos += raw;
            if (folhaCustoIsSalarioBrutoKey(k)) salarioBruto += raw;
            continue;
        }
    }
    var total = vencimentos + encargos + beneficios - descontosBnf;
    return { vencimentos: vencimentos, encargos: encargos, beneficios: beneficios, descontosBnf: descontosBnf, total: total, salarioBruto: salarioBruto };
}

/* ---------------- Compat com window.* (Master legado) ---------------- */

// As `function name(){}` acima já criam binding global E propriedade em `window`.
// Os aliases abaixo cobrem o nome usado pelo código legado do Master.
window.parseMoedaCRF = parseMoedaCRF;
window.extrairISOLocal = extrairISOLocal;
window.parseDataLocal = parseDataLocal;
window.calcularEmpresaAtribuida = calcularEmpresaAtribuida;
window.calcularFaturamentoReal = calcularFaturamentoReal;
window.obterValorLiquido = obterValorLiquido;
window.obterFaturamentoReal = obterFaturamentoReal;
window.obterStatusReal = obterStatusReal;

// Aliases legados do Master — apontam p/ as funções canônicas.
// Permite remover paulatinamente os usos sem quebrar nada.
window.calcEmpresaExcel = calcularEmpresaAtribuida;
window.obterValorLiquidoMaster = obterValorLiquido;
window.obterFaturamentoRealMaster = obterFaturamentoReal;
window.calcularFaturamentoRealMaster = calcularFaturamentoReal;
// `extrairNum` no Master era um parser de moeda — agora aponta direto para o canônico.
window.extrairNum = parseMoedaCRF;

// Custo de Folha — funções compartilhadas
window.folhaNormalizarCompetenciaPJ = folhaNormalizarCompetenciaPJ;
window.folhaEmpresaCanonica = folhaEmpresaCanonica;
window.folhaPjResolverEmpresa = folhaPjResolverEmpresa;
window.folhaCustoIsVencimento = folhaCustoIsVencimento;
window.folhaCustoIsEncargo = folhaCustoIsEncargo;
window.folhaCustoIsDescFolhaInfo = folhaCustoIsDescFolhaInfo;
window.folhaCustoIsBnfDesc = folhaCustoIsBnfDesc;
window.folhaCustoIsSalarioBrutoKey = folhaCustoIsSalarioBrutoKey;
window.folhaCustoCalcularTotais = folhaCustoCalcularTotais;
window.FOLHA_CUSTO_SET_BNF_PAGO = FOLHA_CUSTO_SET_BNF_PAGO;
window.FOLHA_CUSTO_SET_BNF_DESC = FOLHA_CUSTO_SET_BNF_DESC;

// Bag formal — referência canônica para quem prefere acessar via objeto.
window.CoreRules = {
  parseMoedaCRF: parseMoedaCRF,
  extrairISOLocal: extrairISOLocal,
  parseDataLocal: parseDataLocal,
  calcularEmpresaAtribuida: calcularEmpresaAtribuida,
  calcularFaturamentoReal: calcularFaturamentoReal,
  obterValorLiquido: obterValorLiquido,
  obterFaturamentoReal: obterFaturamentoReal,
  obterStatusReal: obterStatusReal,
  folhaCustoIsVencimento: folhaCustoIsVencimento,
  folhaCustoIsEncargo: folhaCustoIsEncargo,
  folhaCustoIsDescFolhaInfo: folhaCustoIsDescFolhaInfo,
  folhaCustoIsBnfDesc: folhaCustoIsBnfDesc,
  folhaCustoIsSalarioBrutoKey: folhaCustoIsSalarioBrutoKey,
  folhaCustoCalcularTotais: folhaCustoCalcularTotais,
  FOLHA_CUSTO_SET_BNF_PAGO: FOLHA_CUSTO_SET_BNF_PAGO,
  FOLHA_CUSTO_SET_BNF_DESC: FOLHA_CUSTO_SET_BNF_DESC
};
