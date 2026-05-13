/**
 * =============================================================================
 *  CentraFin AI Assistant — Cloud Function (Node.js 20)
 *  Arquivo: ai_assistant/index.js
 *
 *  SEGURANÇA:
 *  - Requer Firebase ID Token válido em todas as requisições.
 *  - O LLM NUNCA recebe registros brutos do Firestore.
 *  - Toda matemática é executada aqui via funções do core_rules (versão Node).
 *  - A chave da API do LLM fica apenas no servidor (variável de ambiente).
 *
 *  DEPLOY:
 *    firebase deploy --only functions
 *
 *  VARIÁVEIS DE AMBIENTE NECESSÁRIAS:
 *    OPENAI_API_KEY  OU  ANTHROPIC_API_KEY
 *    LLM_PROVIDER = "openai" | "anthropic"
 * =============================================================================
 */

const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { defineSecret } = require("firebase-functions/params");

// Inicializa Firebase Admin
initializeApp();

// Segredos — nunca no código-fonte
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// ─────────────────────────────────────────────────────────────────
//  CORE RULES — Versão Node.js (espelho fiel do core_rules.js)
//  Regra de ouro: esta seção deve permanecer sincronizada com
//  o arquivo core_rules.js do cliente.
// ─────────────────────────────────────────────────────────────────

function parseMoedaCRF(val) {
  if (typeof val === "number" && isFinite(val)) return val;
  if (val === null || val === undefined) return 0;
  let s = String(val).trim();
  if (s === "" || s === "-") return 0;
  s = s.replace(/[R$\s]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    s = lastComma > lastDot
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (lastComma !== -1) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function calcularFaturamentoReal(descricaoContrato, _valorFatura, valorTaxa) {
  const desc = String(descricaoContrato || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toUpperCase();
  const taxa = Number(valorTaxa) || 0;
  const grupo1 = ["TEMPORARIO", "ESTAGIO", "TERCEIROS", "FOPAG", "CONSULTORIA", "RPO"];
  const grupo2 = ["TREINAMENTO", "PROCESSAMENTO DE PPA", "SUBSCRIPTION", "HR METRICS",
    "INTEGRACAO", "UNIDADES", "DEVOLUTIVA", "ASSESSMENT", "HOTMART"];
  if (grupo1.some(g => desc.includes(g))) return taxa;
  if (grupo2.some(g => desc.includes(g))) return taxa * 0.55;
  return 0;
}

function obterValorLiquido(data) {
  if (!data) return 0;
  const brutoCru = data["Vl. Líquido"] ?? data["Vl Líquido"] ?? data["Valor Líquido"] ?? null;
  if (brutoCru !== null && brutoCru !== "") {
    const bruto = parseMoedaCRF(brutoCru);
    const desconto = parseMoedaCRF(data["Valor Descto."] || data["valor_desconto"] || 0);
    return Number((bruto - desconto).toFixed(2));
  }
  return parseMoedaCRF(data["valor_liquido"]);
}

function obterFaturamentoReal(data) {
  const manualRaw = data?.faturamento_real_manual;
  if (manualRaw !== undefined && manualRaw !== null && manualRaw !== "") {
    return parseMoedaCRF(manualRaw);
  }
  const desc = data?.descricao_contrato || data?.["Descrição Do Contrato"]
    || data?.["Tipo de Serviço"] || data?.tipo_servico || "";
  const vFatura = parseMoedaCRF(data?.valor_fatura || data?.["Valor Fatura"] || 0);
  const vTaxa = parseMoedaCRF(data?.taxa || data?.["Taxa"] || data?.["Vl. Taxa"] || 0);
  return calcularFaturamentoReal(desc, vFatura, vTaxa);
}

function calcularEmpresaAtribuida(tipoServico) {
  const desc = String(tipoServico || "").toUpperCase();
  if (desc.includes("TEMPORARIO")) return "SOULAN CONSULTORIA";
  if (desc.includes("ESTAGIO")) return "ESTÁGIO";
  const adm = ["TERCEIROS", "FOPAG", "CONSULTORIA", "RPO"];
  if (adm.some(k => desc.includes(k))) return "SOULAN ADM";
  const neat = ["TREINAMENTO", "PROCESSAMENTO DE PPA", "SUBSCRIPTION",
    "HR METRICS", "INTEGRAÇÃO", "UNIDADES", "DEVOLUTIVA", "HOTMART", "ASSESSMENT"];
  if (neat.some(k => desc.includes(k))) return "NEAT";
  return "";
}

function obterStatusReal(data, hojeData = new Date()) {
  hojeData.setHours(0, 0, 0, 0);
  const sRaw = String(data?.status || data?.Status || data?.["Situação"] || "").toUpperCase();
  const baixaRawStr = String(data?.data_baixa || data?.["Dt Baixa"] || "").toUpperCase();
  if (sRaw.includes("CANC") || baixaRawStr.includes("CANC")) return "Cancelada";
  if (sRaw.includes("DESMEMBR")) return "DESMEMBRADO";
  if (sRaw.includes("PREJUÍZO") || sRaw.includes("PREJUIZO")) return "PREJUÍZO";
  if (sRaw.includes("PROTESTO")) return "PROTESTO";
  if (sRaw.includes("PAGO") || sRaw.includes("RECEBIDO") || sRaw.includes("BAIXADO")) return "RECEBIDO";
  const baixaRaw = data?.data_baixa || data?.["Dt Baixa"];
  if (baixaRaw && String(baixaRaw).trim() !== "" && String(baixaRaw).trim() !== "-") return "RECEBIDO";
  return "A VENCER";
}

// ─────────────────────────────────────────────────────────────────
//  TOOL SCHEMA — definição das ferramentas disponíveis ao LLM
// ─────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function",
    function: {
      name: "consultarFaturamento",
      description:
        "Consulta dados AGREGADOS de faturamento. Nunca retorna registros individuais. " +
        "Retorna totais calculados pelo core_rules (bruto, liquido, realizado).",
      parameters: {
        type: "object",
        properties: {
          tipo_faturamento: {
            type: "string",
            enum: ["bruto", "liquido", "realizado"],
          },
          mes: { type: "integer", minimum: 1, maximum: 12 },
          ano: { type: "integer", minimum: 2020, maximum: 2030 },
          empresa: {
            type: "string",
            enum: ["SOULAN CONSULTORIA", "SOULAN ADM", "ESTAGIO", "NEAT", "TODAS"],
          },
          periodo: {
            type: "string",
            enum: ["mes", "trimestre", "semestre", "ano"],
          },
          agrupar_por: {
            type: "string",
            enum: ["empresa", "servico", "mes", "nenhum"],
          },
        },
        required: ["empresa", "ano"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultarStatusNotas",
      description:
        "Consulta distribuição de notas por status (A Vencer, Vencido, Recebido, Cancelada). " +
        "Use para perguntas sobre inadimplência e notas em aberto.",
      parameters: {
        type: "object",
        properties: {
          mes: { type: "integer", minimum: 1, maximum: 12 },
          ano: { type: "integer", minimum: 2020, maximum: 2030 },
          empresa: {
            type: "string",
            enum: ["SOULAN CONSULTORIA", "SOULAN ADM", "ESTAGIO", "NEAT", "TODAS"],
          },
          status: {
            type: "string",
            enum: ["A VENCER", "VENCIDO", "RECEBIDO", "Cancelada", "TODOS"],
          },
        },
        required: ["ano"],
      },
    },
  },
];

const SYSTEM_PROMPT = `Você é o CFO virtual do CentraFin, um assistente de inteligência financeira
executivo e preciso. Você responde em português brasileiro, de forma concisa e profissional.

REGRAS ABSOLUTAS:
1. Você NUNCA inventa valores financeiros. Se não tiver dados suficientes, solicite esclarecimentos.
2. Você SEMPRE usa as ferramentas disponíveis para obter dados reais do sistema.
3. Você formata valores monetários no padrão brasileiro: R$ 1.234.567,89.
4. Você NUNCA menciona detalhes técnicos de banco de dados, Firebase ou implementação.
5. Quando não entender a empresa ou período, pergunte antes de consultar.

CONTEXTO DO SISTEMA:
- Empresas do grupo: SOULAN CONSULTORIA (Temporário), SOULAN ADM (Terceiros/FOPAG/Consultoria/RPO), ESTÁGIO, NEAT (Treinamento/Assessment/Subscription).
- Tipos de faturamento: Bruto (valor NF), Líquido (Bruto - Descontos), Realizado (regra 100%/55% por serviço).
- Serviços Grupo A (100% da Taxa = Realizado): Temporário, Estágio, Terceiros, FOPAG, Consultoria, RPO.
- Serviços Grupo B (55% da Taxa = Realizado): Treinamento, Assessment, Subscription, HR Metrics, Hotmart.`;

// ─────────────────────────────────────────────────────────────────
//  EXECUTOR DE FERRAMENTAS — acessa Firestore e agrega dados
//  O LLM nunca recebe registros individuais — apenas totais.
// ─────────────────────────────────────────────────────────────────

async function executarConsultarFaturamento(params) {
  const db = getFirestore();
  const { empresa, ano, mes, periodo, tipo_faturamento, agrupar_por } = params;
  const hoje = new Date();

  // Determinar range de meses
  let meses = [];
  if (mes) {
    const qtd = periodo === "trimestre" ? 3 : periodo === "semestre" ? 6 : 1;
    for (let i = 0; i < qtd; i++) meses.push(mes + i > 12 ? mes + i - 12 : mes + i);
  } else {
    // Ano inteiro
    meses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  }

  // Consulta Firestore — apenas metadados, sem dados sensíveis individuais
  let query = db.collection("lancamentos").where("ano_emissao", "==", ano);
  if (mes) query = query.where("mes_emissao", "in", meses.slice(0, 10)); // Firestore limit
  const snapshot = await query.get();

  // Agregação local — NUNCA enviada ao LLM bruta
  const totais = { bruto: 0, liquido: 0, realizado: 0, count: 0 };
  const porEmpresa = {};
  const porServico = {};
  const porMes = {};

  snapshot.forEach(doc => {
    const d = doc.data();
    const statusReal = obterStatusReal(d, hoje);

    // Excluir cancelados e desmembrados (igual ao core do dashboard)
    if (statusReal === "Cancelada" || statusReal === "DESMEMBRADO") return;

    const empresaAtrib = calcularEmpresaAtribuida(d.tipo_servico || d.descricao_contrato || "");

    // Filtrar por empresa
    if (empresa !== "TODAS") {
      const empresaNorm = empresa === "ESTAGIO" ? "ESTÁGIO" : empresa;
      if (empresaAtrib !== empresaNorm) return;
    }

    const vBruto = parseMoedaCRF(d["Vl. Líquido"] || d.valor_fatura || 0);
    const vLiquido = obterValorLiquido(d);
    const vRealizado = obterFaturamentoReal(d);
    const mesDoc = d.mes_emissao || (d.data_emissao ? new Date(d.data_emissao).getMonth() + 1 : null);

    totais.bruto += vBruto;
    totais.liquido += vLiquido;
    totais.realizado += vRealizado;
    totais.count++;

    if (agrupar_por === "empresa") {
      if (!porEmpresa[empresaAtrib]) porEmpresa[empresaAtrib] = { bruto: 0, liquido: 0, realizado: 0 };
      porEmpresa[empresaAtrib].bruto += vBruto;
      porEmpresa[empresaAtrib].liquido += vLiquido;
      porEmpresa[empresaAtrib].realizado += vRealizado;
    }

    if (agrupar_por === "servico") {
      const srv = (d.tipo_servico || "OUTROS").toUpperCase().split(" ")[0];
      if (!porServico[srv]) porServico[srv] = { bruto: 0, liquido: 0, realizado: 0 };
      porServico[srv].bruto += vBruto;
      porServico[srv].liquido += vLiquido;
      porServico[srv].realizado += vRealizado;
    }

    if (agrupar_por === "mes" && mesDoc) {
      if (!porMes[mesDoc]) porMes[mesDoc] = { bruto: 0, liquido: 0, realizado: 0 };
      porMes[mesDoc].bruto += vBruto;
      porMes[mesDoc].liquido += vLiquido;
      porMes[mesDoc].realizado += vRealizado;
    }
  });

  // Resultado — apenas totais, nunca registros individuais
  const resultado = {
    periodo: { ano, mes: mes || null, meses_consultados: meses },
    empresa: empresa,
    total_notas: totais.count,
    valores: {}
  };

  if (!tipo_faturamento || tipo_faturamento === "bruto") resultado.valores.bruto = totais.bruto;
  if (!tipo_faturamento || tipo_faturamento === "liquido") resultado.valores.liquido = totais.liquido;
  if (!tipo_faturamento || tipo_faturamento === "realizado") resultado.valores.realizado = totais.realizado;

  if (agrupar_por === "empresa" && Object.keys(porEmpresa).length) resultado.por_empresa = porEmpresa;
  if (agrupar_por === "servico" && Object.keys(porServico).length) resultado.por_servico = porServico;
  if (agrupar_por === "mes" && Object.keys(porMes).length) resultado.por_mes = porMes;

  return resultado;
}

async function executarConsultarStatusNotas(params) {
  const db = getFirestore();
  const { ano, mes, empresa, status } = params;
  const hoje = new Date();

  let query = db.collection("lancamentos").where("ano_emissao", "==", ano);
  if (mes) query = query.where("mes_emissao", "==", mes);
  const snapshot = await query.get();

  const contagem = { "A VENCER": 0, "VENCIDO": 0, "RECEBIDO": 0, "Cancelada": 0, "OUTROS": 0 };
  const valores = { "A VENCER": 0, "VENCIDO": 0, "RECEBIDO": 0, "Cancelada": 0, "OUTROS": 0 };

  snapshot.forEach(doc => {
    const d = doc.data();
    const empresaAtrib = calcularEmpresaAtribuida(d.tipo_servico || "");
    if (empresa && empresa !== "TODAS") {
      const empresaNorm = empresa === "ESTAGIO" ? "ESTÁGIO" : empresa;
      if (empresaAtrib !== empresaNorm) return;
    }
    const statusReal = obterStatusReal(d, hoje);
    const chave = contagem.hasOwnProperty(statusReal) ? statusReal : "OUTROS";
    contagem[chave]++;
    valores[chave] += parseMoedaCRF(d["Vl. Líquido"] || d.valor_fatura || 0);
  });

  if (status && status !== "TODOS") {
    return { status, contagem: contagem[status] || 0, valor: valores[status] || 0 };
  }
  return { distribuicao_contagem: contagem, distribuicao_valores: valores };
}

// ─────────────────────────────────────────────────────────────────
//  MIDDLEWARE — verificação de autenticação Firebase
// ─────────────────────────────────────────────────────────────────

async function verificarAutenticacao(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Token de autenticação não fornecido.");
  }
  const idToken = authHeader.split("Bearer ")[1];
  const decodedToken = await getAuth().verifyIdToken(idToken);
  return decodedToken;
}

// ─────────────────────────────────────────────────────────────────
//  INTEGRAÇÕES COM LLM
// ─────────────────────────────────────────────────────────────────

async function chamarOpenAI(apiKey, mensagens, tools) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: mensagens,
      tools,
      tool_choice: "auto",
      temperature: 0.2,
      max_tokens: 1024,
    }),
  });
  if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
  return response.json();
}

async function chamarAnthropic(apiKey, mensagens, tools) {
  // Separar system message do histórico
  const systemMsg = mensagens.find(m => m.role === "system")?.content || "";
  const histMsg = mensagens.filter(m => m.role !== "system");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      system: systemMsg,
      messages: histMsg,
      tools: tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      })),
      max_tokens: 1024,
      temperature: 0.2,
    }),
  });
  if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);
  return response.json();
}

// ─────────────────────────────────────────────────────────────────
//  CLOUD FUNCTION PRINCIPAL
// ─────────────────────────────────────────────────────────────────

exports.centrafin_ai_chat = onRequest(
  {
    secrets: [OPENAI_API_KEY, ANTHROPIC_API_KEY],
    cors: ["https://centrafin-app.web.app", "http://localhost:5000"],
    region: "southamerica-east1",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (req, res) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Origin", req.headers.origin || "*");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Método não permitido." });
      return;
    }

    // ① Verificar autenticação
    let usuario;
    try {
      usuario = await verificarAutenticacao(req);
    } catch (err) {
      console.error("[Auth]", err.message);
      res.status(401).json({ error: "Não autorizado: " + err.message });
      return;
    }

    const { prompt, historico = [] } = req.body;
    if (!prompt || typeof prompt !== "string" || prompt.length > 2000) {
      res.status(400).json({ error: "Prompt inválido." });
      return;
    }

    console.log(`[Chat] user=${usuario.uid} prompt="${prompt.slice(0, 80)}..."`);

    const provider = process.env.LLM_PROVIDER || "openai";
    const apiKey = provider === "anthropic"
      ? ANTHROPIC_API_KEY.value()
      : OPENAI_API_KEY.value();

    // ② Montar mensagens — SEM dados do banco
    const mensagens = [
      { role: "system", content: SYSTEM_PROMPT },
      ...historico.slice(-8), // máx. 8 turns de contexto
      { role: "user", content: prompt },
    ];

    try {
      // ③ Chamar LLM (primeira passagem — pode retornar tool_call)
      let resposta = provider === "anthropic"
        ? await chamarAnthropic(apiKey, mensagens, TOOLS)
        : await chamarOpenAI(apiKey, mensagens, TOOLS);

      // ④ Processar tool calls
      let textoFinal = null;
      const MAX_ITERATIONS = 3;
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        // OpenAI format
        if (resposta.choices) {
          const choice = resposta.choices[0];
          if (choice.finish_reason === "tool_calls" || choice.message?.tool_calls?.length) {
            const toolCalls = choice.message.tool_calls;
            const toolResults = [];

            for (const tc of toolCalls) {
              const fnName = tc.function.name;
              const fnArgs = JSON.parse(tc.function.arguments);
              console.log(`[Tool] ${fnName}`, JSON.stringify(fnArgs));

              let resultado;
              if (fnName === "consultarFaturamento") resultado = await executarConsultarFaturamento(fnArgs);
              else if (fnName === "consultarStatusNotas") resultado = await executarConsultarStatusNotas(fnArgs);
              else resultado = { error: "Ferramenta desconhecida." };

              toolResults.push({
                role: "tool",
                tool_call_id: tc.id,
                content: JSON.stringify(resultado),
              });
            }

            // Adicionar resultado da ferramenta e pedir resposta final
            mensagens.push(choice.message);
            mensagens.push(...toolResults);
            resposta = await chamarOpenAI(apiKey, mensagens, TOOLS);
            continue;
          }
          textoFinal = choice.message?.content;
          break;
        }

        // Anthropic format
        if (resposta.content) {
          const toolUseBlocks = resposta.content.filter(b => b.type === "tool_use");
          if (toolUseBlocks.length > 0) {
            const toolResults = [];
            for (const block of toolUseBlocks) {
              let resultado;
              if (block.name === "consultarFaturamento") resultado = await executarConsultarFaturamento(block.input);
              else if (block.name === "consultarStatusNotas") resultado = await executarConsultarStatusNotas(block.input);
              else resultado = { error: "Ferramenta desconhecida." };
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(resultado) });
            }
            mensagens.push({ role: "assistant", content: resposta.content });
            mensagens.push({ role: "user", content: toolResults });
            resposta = await chamarAnthropic(apiKey, mensagens, TOOLS);
            continue;
          }
          textoFinal = resposta.content.find(b => b.type === "text")?.text;
          break;
        }
        break;
      }

      if (!textoFinal) {
        textoFinal = "Não consegui processar sua solicitação. Por favor, tente reformular.";
      }

      res.status(200).json({
        resposta: textoFinal,
        usuario: usuario.email,
      });

    } catch (err) {
      console.error("[Chat Error]", err);
      res.status(500).json({ error: "Erro interno. Tente novamente em instantes." });
    }
  }
);
