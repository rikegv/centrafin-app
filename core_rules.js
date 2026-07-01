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

// Bag formal — referência canônica para quem prefere acessar via objeto.
window.CoreRules = {
  parseMoedaCRF: parseMoedaCRF,
  extrairISOLocal: extrairISOLocal,
  parseDataLocal: parseDataLocal,
  calcularEmpresaAtribuida: calcularEmpresaAtribuida,
  calcularFaturamentoReal: calcularFaturamentoReal,
  obterValorLiquido: obterValorLiquido,
  obterFaturamentoReal: obterFaturamentoReal,
  obterStatusReal: obterStatusReal
};
