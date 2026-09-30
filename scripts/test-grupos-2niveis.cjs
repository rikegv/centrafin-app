#!/usr/bin/env node
/**
 * test-grupos-2niveis.cjs — SUITE DO TESTER INDEPENDENTE (OS-CP-GRUPOS-2NIVEIS-01)
 *
 * Prova a migracao da estrutura contabil de 3 niveis (Grupo -> Conta -> Tipo) para
 * 2 niveis (Grupo -> Tipo). O tester NAO e o autor do codigo: esta suite nasce do
 * REQUISITO, e todo caso extrai a FUNCAO REAL do arquivo, nunca reimplementa a
 * logica num script paralelo (reimplementar codificaria a mesma suposicao do autor).
 *
 * BASE FIXADA em 6732932. NUNCA usar HEAD como base: HEAD anda, e uma base movel
 * ja produziu tres vereditos errados nesta fabrica.
 *
 *   node scripts/test-grupos-2niveis.cjs            # roda contra o working tree (head)
 *   node scripts/test-grupos-2niveis.cjs --head     # idem
 *   node scripts/test-grupos-2niveis.cjs --base     # roda contra 6732932 (deve REPROVAR)
 *
 * O modo --base existe para provar que a suite DISCRIMINA: se ela passa nos dois
 * lados, ela nao esta medindo a mudanca, esta medindo nada.
 *
 * Requer jsdom. Como o projeto nao o tem em package.json (e nao cabe ao tester
 * mexer nas dependencias de producao), a suite procura o modulo em NODE_PATH ou
 * na pasta apontada por --jsdom=<caminho>. Sem jsdom, a suite ABORTA: ela NAO
 * devolve "passou" sem ter provado a camada que o operador toca.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE_COMMIT = '6732932';
const RAIZ = path.resolve(__dirname, '..');
const ARQ_MASTER = 'master.html';
const ARQ_CP = 'gerenciador_contas_pagar_desktop/code.html';

const args = process.argv.slice(2);
const MODO = args.includes('--base') ? 'base' : 'head';
const argJsdom = (args.find(a => a.startsWith('--jsdom=')) || '').slice(8);

// ─────────────────────────────────────────────────────────────────────────────
// Infra de teste
// ─────────────────────────────────────────────────────────────────────────────
const resultados = [];
let grupoAtual = '';

function GRUPO(nome) { grupoAtual = nome; console.log(`\n${'─'.repeat(78)}\n${nome}\n${'─'.repeat(78)}`); }

// nivel: 'bloqueante' (padrao) ou 'ressalva'. Ressalva e desvio de padrao que a
// frente HERDOU e nao introduziu, provado como pre-existente contra a base fixa.
// Ela aparece no relatorio SEMPRE (nao se silencia teste para obter verde), mas
// nao reprova a frente: quem decide o que fazer com ela e o diretor.
function caso(nome, fn, nivel) {
    let ok = false, detalhe = '';
    try {
        const r = fn();
        ok = r === true || r === undefined;
        if (typeof r === 'string') { ok = false; detalhe = r; }
        if (r && typeof r === 'object' && 'ok' in r) { ok = !!r.ok; detalhe = r.detalhe || ''; }
    } catch (e) {
        ok = false;
        detalhe = (e && e.__abort) ? `ABORTOU: ${e.message}` : `EXCECAO: ${e && e.message}`;
        // Extrator implausivel ABORTA a suite: recorte vazio devolvido em silencio
        // produz veredito errado com cara de veredito. No modo --base (que existe so
        // para provar que a suite discrimina) o abort vira falha e a corrida segue,
        // porque ali o recorte vazio E o resultado esperado.
        if (e && e.__abort && MODO === 'head') { registrar(nome, false, detalhe); imprimirResumo(); process.exit(3); }
    }
    registrar(nome, ok, detalhe, nivel);
}

function registrar(nome, ok, detalhe, nivel) {
    const n = nivel || 'bloqueante';
    resultados.push({ grupo: grupoAtual, nome, ok, detalhe, nivel: n });
    const rot = ok ? 'PASSOU ' : (n === 'ressalva' ? 'RESSALVA' : 'FALHOU ');
    console.log(`  ${rot} ${nome}${detalhe ? `\n            ${detalhe.replace(/\n/g, '\n            ')}` : ''}`);
}

function abortar(msg) { const e = new Error(msg); e.__abort = true; throw e; }

function assert(cond, msg) { if (!cond) return msg || 'condicao falsa'; return true; }

function eq(a, b, rotulo) {
    const sa = JSON.stringify(a), sb = JSON.stringify(b);
    if (sa !== sb) return `${rotulo || ''} esperado ${sb}, obtido ${sa}`;
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitura de fonte: head = working tree, base = git show 6732932:<arquivo>
// ─────────────────────────────────────────────────────────────────────────────
function lerFonte(arquivoRel) {
    let txt;
    if (MODO === 'head') {
        txt = fs.readFileSync(path.join(RAIZ, arquivoRel), 'utf8');
    } else {
        txt = execFileSync('git', ['show', `${BASE_COMMIT}:${arquivoRel}`], {
            cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
        });
    }
    if (!txt || txt.length < 10000) abortar(`fonte de ${arquivoRel} (${MODO}) veio com ${txt ? txt.length : 0} bytes, implausivel`);
    return txt;
}

// Fatia por MARCADOR (nao por numero de linha: numero de linha muda a cada commit).
function fatiar(src, marcadorIni, marcadorFim, incluirFim, rotulo) {
    const i = src.indexOf(marcadorIni);
    if (i < 0) abortar(`marcador inicial de ${rotulo} nao encontrado: ${marcadorIni}`);
    const j = src.indexOf(marcadorFim, i + marcadorIni.length);
    if (j < 0) abortar(`marcador final de ${rotulo} nao encontrado: ${marcadorFim}`);
    const trecho = src.slice(i, incluirFim ? j + marcadorFim.length : j);
    if (trecho.length < 200) abortar(`recorte de ${rotulo} veio com ${trecho.length} bytes, implausivel`);
    return trecho;
}

// Contador ingenuo de chaves, usado SO em funcoes curtas sem chave dentro de string.
function extrairFuncaoSimples(src, nome, rotulo) {
    const re = new RegExp(`function\\s+${nome}\\s*\\(`);
    const m = re.exec(src);
    if (!m) abortar(`funcao ${nome} nao encontrada (${rotulo})`);
    // Pula a lista de PARAMETROS antes de procurar o corpo: parametro
    // desestruturado (`function f({ a, b })`) tem chave, e comecar a contar ali
    // faz o extrator devolver so a assinatura, um recorte vazio em silencio.
    let p = src.indexOf('(', m.index), np = 0, fimParams = -1;
    for (let k = p; k < src.length; k++) {
        if (src[k] === '(') np++;
        else if (src[k] === ')') { np--; if (np === 0) { fimParams = k; break; } }
    }
    if (fimParams < 0) abortar(`parametros de ${nome} nao fecham (${rotulo})`);
    let i = src.indexOf('{', fimParams);
    if (i < 0) abortar(`corpo de ${nome} nao encontrado`);
    let n = 0, fim = -1;
    for (let k = i; k < src.length; k++) {
        if (src[k] === '{') n++;
        else if (src[k] === '}') { n--; if (n === 0) { fim = k; break; } }
    }
    if (fim < 0) abortar(`chaves de ${nome} nao fecham`);
    return src.slice(m.index, fim + 1);
}

// Recorta o literal de objeto que comeca no primeiro "{" depois de `desde`.
function objetoLiteral(src, desde) {
    const i = src.indexOf('{', desde);
    if (i < 0) abortar('literal de objeto nao encontrado');
    let n = 0;
    for (let k = i; k < src.length; k++) {
        if (src[k] === '{') n++;
        else if (src[k] === '}') { n--; if (n === 0) return src.slice(i, k + 1); }
    }
    abortar('literal de objeto nao fecha');
}

// Chaves de PRIMEIRO NIVEL do literal. Nao vale varrer com /(\w+)\s*:/ : isso
// captura `conta.nome` de dentro de um ternario e inventa um campo que nunca
// existiu, o que faria a suite acusar perda de dado que nao houve.
function chavesTopo(lit, rotulo) {
    const corpo = lit.slice(1, -1).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const partes = [];
    let atual = '', d = 0, str = null;
    for (const ch of corpo) {
        if (str) { atual += ch; if (ch === str) str = null; continue; }
        if (ch === "'" || ch === '"' || ch === '`') { str = ch; atual += ch; continue; }
        if ('{(['.includes(ch)) d++;
        if ('})]'.includes(ch)) d--;
        if (ch === ',' && d === 0) { partes.push(atual); atual = ''; continue; }
        atual += ch;
    }
    if (atual.trim()) partes.push(atual);
    const chaves = partes.map(p => (p.trim().match(/^(\w+)/) || [])[1]).filter(Boolean);
    if (!chaves.length) abortar(`nenhuma chave extraida de ${rotulo}, recorte implausivel`);
    return [...new Set(chaves)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Classificacao codigo VIVO x COMENTARIO (para a varredura de residuo)
// ─────────────────────────────────────────────────────────────────────────────
function faixasComentario(src) {
    const faixas = [];
    const push = (re) => { let m; const r = new RegExp(re.source, re.flags); while ((m = r.exec(src))) faixas.push([m.index, m.index + m[0].length]); };
    push(/<!--[\s\S]*?-->/g);
    push(/\/\*[\s\S]*?\*\//g);
    push(/\/\/[^\n]*/g);
    return faixas;
}
function dentroDeComentario(faixas, idx) { return faixas.some(([a, b]) => idx >= a && idx < b); }

function ocorrencias(src, token) {
    const faixas = faixasComentario(src);
    const linhas = src.split('\n');
    const offsets = []; let acc = 0;
    for (const l of linhas) { offsets.push(acc); acc += l.length + 1; }
    const achados = [];
    let i = 0;
    while ((i = src.indexOf(token, i)) >= 0) {
        let li = 0; while (li + 1 < offsets.length && offsets[li + 1] <= i) li++;
        const linha = linhas[li];
        const emComent = dentroDeComentario(faixas, i);
        // Rede de seguranca contra o "//" de uma URL dentro de string: se a linha
        // tem http, nao confiamos na classificacao de comentario de linha.
        const suspeitoURL = /https?:\/\//.test(linha);
        achados.push({ linha: li + 1, texto: linha.trim(), comentario: emComent && !suspeitoURL });
        i += token.length;
    }
    return achados;
}

// ─────────────────────────────────────────────────────────────────────────────
// FONTES
// ─────────────────────────────────────────────────────────────────────────────
const SRC_MASTER = lerFonte(ARQ_MASTER);
const SRC_CP = lerFonte(ARQ_CP);

// Bloco JS do cadastro de Grupos, em master.html
const IDX_FIM_BLOCO = (() => {
    const j = SRC_MASTER.indexOf('// ── Excluir em massa');
    if (j < 0) abortar('marcador de fim do bloco de Grupos (Excluir em massa) nao encontrado em master.html');
    return j;
})();
const BLOCO_JS_MASTER = (() => {
    const i = SRC_MASTER.indexOf("const GD_COL_GRUPOS = 'CP_Grupos_Contas';");
    if (i < 0) abortar('marcador inicial do bloco de Grupos nao encontrado em master.html');
    const k = SRC_MASTER.lastIndexOf('gdRenderTudo();', IDX_FIM_BLOCO);
    if (k < 0 || k < i) abortar('fim do bloco de Grupos (gdRenderTudo()) nao encontrado');
    const t = SRC_MASTER.slice(i, k + 'gdRenderTudo();'.length);
    if (t.length < 3000) abortar(`bloco JS de Grupos veio com ${t.length} bytes, implausivel`);
    return t;
})();

// Bloco HTML da aba de Grupos, em master.html
const BLOCO_HTML_GRUPOS = fatiar(SRC_MASTER, '<div id="aba-regras-grupos"', '<!-- /aba-regras-grupos -->', true, 'aba de Grupos');

// Regiao de resolucao no Gerenciador
const REGIAO_CP = fatiar(SRC_CP, 'let _cpGruposMap = new Map();', '// FRENTE B (OS-CP-COLUNAS-CLIENTE-01)', false, 'resolucao de grupo no CP');
const FN_CHAVE_FILTRO = extrairFuncaoSimples(SRC_CP, '_cpChaveFiltro', ARQ_CP);

console.log(`\n=== test-grupos-2niveis.cjs  |  modo=${MODO}  |  base fixada=${BASE_COMMIT} ===`);
console.log(`master.html: ${SRC_MASTER.length} bytes | bloco JS Grupos: ${BLOCO_JS_MASTER.length} bytes | aba HTML: ${BLOCO_HTML_GRUPOS.length} bytes`);
console.log(`code.html:   ${SRC_CP.length} bytes | regiao de resolucao: ${REGIAO_CP.length} bytes`);

// ─────────────────────────────────────────────────────────────────────────────
// SANDBOX 1: a cadeia de resolucao REAL do Gerenciador
// ─────────────────────────────────────────────────────────────────────────────
function montarResolvedor() {
    const vm = require('vm');
    const listeners = [];
    const ctx = {
        console,
        collection: (_db, nome) => ({ __col: nome }),
        db: {},
        onSnapshot: (ref, cb) => { listeners.push({ col: ref.__col, cb }); },
        _cpPopularFiltroGrupo: () => {},
        __T: {},
    };
    vm.createContext(ctx);
    const script = [
        FN_CHAVE_FILTRO,
        REGIAO_CP,
        `__T.inscrever = inscreverGruposDespesa;`,
        `__T.resolver = _cpGrupoDeReg;`,
        `__T.chave = _cpChaveFiltro;`,
        `__T.carregado = () => _cpGruposCarregados;`,
    ].join('\n\n');
    vm.runInContext(script, ctx, { filename: 'resolucao-cp.js' });
    ctx.__T.inscrever();
    if (!listeners.length) abortar('nenhum listener capturado na regiao de resolucao do CP');
    ctx.__T.alimentar = (col, docs) => {
        const alvo = listeners.filter(l => l.col === col);
        if (!alvo.length) abortar(`listener de ${col} nao existe nesta versao (${MODO})`);
        const snap = { forEach: (fn) => docs.forEach(d => fn({ id: d.id, data: () => d.data })) };
        alvo.forEach(l => l.cb(snap));
    };
    ctx.__T.colecoes = listeners.map(l => l.col);
    return ctx.__T;
}

// ─────────────────────────────────────────────────────────────────────────────
// SANDBOX 2: o bloco REAL do cadastro, dentro de um DOM real (jsdom)
// ─────────────────────────────────────────────────────────────────────────────
function carregarJsdom() {
    const candidatos = [];
    if (argJsdom) candidatos.push(argJsdom);
    if (process.env.JSDOM_PATH) candidatos.push(process.env.JSDOM_PATH);
    candidatos.push('jsdom');
    for (const c of candidatos) {
        try { return require(c); } catch (_) { /* proximo */ }
    }
    abortar('jsdom nao encontrado. Rode com --jsdom=<caminho para o modulo jsdom>. A suite NAO passa sem provar a camada do operador.');
}

function montarCadastro() {
    const { JSDOM } = carregarJsdom();
    // Documento REAL: master.html inteiro, com os <script> removidos para que nada
    // alem do bloco sob teste execute. Assim, todo id da pagina existe de verdade,
    // e um getElementById orfao e orfao MESMO, nao artefato do recorte.
    const htmlSemScripts = SRC_MASTER.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const dom = new JSDOM(htmlSemScripts, { runScripts: 'outside-only', pretendToBeVisual: true });
    const win = dom.window;

    const chamadas = { setDoc: [], addDoc: [], updateDoc: [], deleteDoc: [], batchSet: [], commits: 0, toasts: [] };
    const listeners = [];

    win.db = {};
    win.collection = (_db, nome) => ({ __col: nome });
    win.doc = (...a) => {
        if (a.length === 3) return { __doc: `${a[1]}/${a[2]}` };
        if (a.length === 2) return { __doc: String(a[1]) };
        return { __doc: a.map(String).join('/') };
    };
    win.onSnapshot = (ref, cb) => { listeners.push({ chave: ref.__col || ref.__doc, cb }); };
    win.setDoc = async (ref, data, opts) => { chamadas.setDoc.push({ ref: ref.__doc, data, opts }); };
    win.addDoc = async (ref, data) => { chamadas.addDoc.push({ col: ref.__col, data }); };
    win.updateDoc = async (ref, data) => { chamadas.updateDoc.push({ ref: ref.__doc, data }); };
    win.deleteDoc = async (ref) => { chamadas.deleteDoc.push({ ref: ref.__doc }); };
    win.writeBatch = () => ({
        set: (ref, data, opts) => chamadas.batchSet.push({ ref: ref.__doc, data, opts }),
        commit: async () => { chamadas.commits++; },
    });
    win.serverTimestamp = () => '__TS__';
    win.usuarioLogadoNome = 'TESTE';
    win.fornMToast = (msg, tipo) => { chamadas.toasts.push({ msg, tipo }); };
    if (typeof win.requestAnimationFrame !== 'function') win.requestAnimationFrame = (f) => setTimeout(f, 0);

    // Helpers REAIS de master.html (nao stub, nao reimplementacao).
    const helpers = [
        extrairFuncaoSimples(SRC_MASTER, 'escapeHTMLm', ARQ_MASTER),
        extrairFuncaoSimples(SRC_MASTER, 'getMultiValues', ARQ_MASTER),
        extrairFuncaoSimples(SRC_MASTER, 'isMultiAll', ARQ_MASTER),
        extrairFuncaoSimples(SRC_MASTER, 'setMultiValues', ARQ_MASTER),
    ].join('\n');

    const epilogo = `
    ;window.__T = {
        opcoesGrupos: (typeof gdOpcoesGrupos === 'function' ? gdOpcoesGrupos : null),
        opcoesContas: (typeof gdOpcoesContas === 'function' ? gdOpcoesContas : null),
        repopular: gdRepopularSelects,
        renderTudo: gdRenderTudo,
        renderTipos: gdRenderTipos,
        renderGrupos: gdRenderGrupos,
        gravarVinculo: (typeof gdGravarVinculo === 'function' ? gdGravarVinculo : null),
        chave: gdChave,
    };`;

    // Carrega o componente REAL do design system. Sem ele, a prova pararia nos
    // <option> (o dado) e nunca chegaria na lista que o operador VE (o pill e o
    // rotulo renderizado), que e exatamente onde nasceu o caso das 295 opcoes
    // "[object Object]".
    let erroComponente = null;
    try {
        const cm = fs.readFileSync(path.join(RAIZ, 'assets/checkbox_multi.js'), 'utf8');
        if (cm.length < 1000) abortar(`checkbox_multi.js veio com ${cm.length} bytes, implausivel`);
        win.eval(cm);
    } catch (e) { erroComponente = e; }

    let erroEval = null;
    try {
        win.eval(`(function(){\n${helpers}\n${BLOCO_JS_MASTER}\n${epilogo}\n}).call(window);`);
    } catch (e) {
        erroEval = e;
    }

    const alimentar = (chave, docs) => {
        const alvo = listeners.filter(l => l.chave === chave);
        if (!alvo.length) abortar(`listener de ${chave} nao existe nesta versao (${MODO})`);
        const snap = {
            forEach: (fn) => docs.forEach(d => fn({ id: d.id, data: () => d.data })),
            exists: () => true,
            data: () => docs,
        };
        alvo.forEach(l => l.cb(snap));
    };
    const alimentarDoc = (chave, obj) => {
        const alvo = listeners.filter(l => l.chave === chave);
        if (!alvo.length) abortar(`listener do doc ${chave} nao existe nesta versao (${MODO})`);
        alvo.forEach(l => l.cb({ exists: () => true, data: () => obj }));
    };

    return { dom, win, doc: win.document, chamadas, listeners, alimentar, alimentarDoc, erroEval, erroComponente };
}

// ═════════════════════════════════════════════════════════════════════════════
// GRUPO A — A CADEIA DE RESOLUCAO, COM A FUNCAO REAL
// ═════════════════════════════════════════════════════════════════════════════
GRUPO('A. CADEIA DE RESOLUCAO (_cpGrupoDeReg REAL, extraida de ' + ARQ_CP + ')');

const R = montarResolvedor();

// Semeia via os listeners REAIS (prova tambem o mapeamento do snapshot).
function semearResolvedor() {
    R.alimentar('CP_Grupos_Contas', [
        { id: 'G_BEN', data: { nome: 'Benefícios', bucket_dre: null, ordem: 0 } },
        { id: 'G_PES', data: { nome: 'Pessoal', bucket_dre: null, ordem: 1 } },
    ]);
    const tipos = [
        { id: 'vale-transporte', data: { tipo_norm: 'VALE TRANSPORTE', grupo_id: 'G_BEN', conta_id: 'C1' } },
        { id: 'estagio-acento', data: { tipo_norm: 'ESTÁGIO', grupo_id: 'G_PES', conta_id: 'C1' } },
        { id: 'sem-vinculo', data: { tipo_norm: 'TIPO SEM VINCULO', grupo_id: null, conta_id: null } },
        { id: 'grupo-orfao', data: { tipo_norm: 'TIPO ORFAO', grupo_id: 'G_QUE_NAO_EXISTE', conta_id: 'C_QUE_NAO_EXISTE' } },
    ];
    R.alimentar('CP_Tipos_Despesa', tipos);
    if (R.colecoes.includes('CP_Contas_Despesa')) {
        // Versao base (3 niveis): sem isto ela nem resolve, e o teste mediria o vazio.
        R.alimentar('CP_Contas_Despesa', [
            { id: 'C1', data: { nome: 'Conta 1', grupo_id: 'G_BEN' } },
        ]);
    }
}

caso('A0. antes de qualquer snapshot, categoria preenchida devolve estado "carregando"', () => {
    const r = R.resolver({ categoria: 'VALE TRANSPORTE' });
    return eq(r.estado, 'carregando', 'estado:') === true ? assert(r.grupo === '', 'grupo deveria vir vazio') : eq(r.estado, 'carregando', 'estado:');
});

semearResolvedor();

caso('A1. tipo vinculado a grupo existente devolve o NOME do grupo, estado "ok"', () => {
    const r = R.resolver({ categoria: 'VALE TRANSPORTE' });
    const e1 = eq(r.estado, 'ok', 'estado:'); if (e1 !== true) return e1;
    return eq(r.grupo, 'Benefícios', 'grupo:');
});

caso('A2. tipo com vinculo de grupo_id nulo devolve vazio, estado "sem_vinculo"', () => {
    const r = R.resolver({ categoria: 'TIPO SEM VINCULO' });
    const e1 = eq(r.estado, 'sem_vinculo', 'estado:'); if (e1 !== true) return e1;
    return eq(r.grupo, '', 'grupo:');
});

caso('A3. tipo ausente do mapa devolve vazio, estado "sem_vinculo"', () => {
    const r = R.resolver({ categoria: 'CATEGORIA QUE NINGUEM CADASTROU' });
    return eq(r.estado, 'sem_vinculo', 'estado:');
});

caso('A4. vinculo apontando para grupo_id INEXISTENTE devolve vazio, estado "grupo_orfao" (nao estoura, nao devolve nome errado)', () => {
    const r = R.resolver({ categoria: 'TIPO ORFAO' });
    const e1 = eq(r.estado, 'grupo_orfao', 'estado:'); if (e1 !== true) return e1;
    return eq(r.grupo, '', 'grupo:');
});

caso('A5. lancamento sem categoria devolve estado "sem_despesa"', () => {
    const a = R.resolver({});
    const b = R.resolver({ categoria: '   ' });
    const c = R.resolver(null);
    const e1 = eq(a.estado, 'sem_despesa', 'reg vazio:'); if (e1 !== true) return e1;
    const e2 = eq(b.estado, 'sem_despesa', 'categoria em branco:'); if (e2 !== true) return e2;
    return eq(c.estado, 'sem_despesa', 'reg null:');
});

caso('A6. ACENTO PRESERVADO: "ESTAGIO" (sem acento) NAO casa com o vinculo de "ESTÁGIO"', () => {
    const comAcento = R.resolver({ categoria: 'ESTÁGIO' });
    const semAcento = R.resolver({ categoria: 'ESTAGIO' });
    const e1 = eq(comAcento.estado, 'ok', 'com acento:'); if (e1 !== true) return e1;
    const e2 = eq(comAcento.grupo, 'Pessoal', 'com acento grupo:'); if (e2 !== true) return e2;
    if (semAcento.estado === 'ok') return `INCIDENTE 2026-06-19: "ESTAGIO" sem acento casou e devolveu "${semAcento.grupo}"`;
    return eq(semAcento.estado, 'sem_vinculo', 'sem acento:');
});

caso('A7. CAIXA e ESPACO INTERNO colapsados: "vale  transporte", "VALE TRANSPORTE" e "  Vale Transporte " casam com o mesmo vinculo', () => {
    const variantes = ['vale  transporte', 'VALE TRANSPORTE', '  Vale Transporte ', 'Vale   Transporte'];
    const fora = variantes.filter(v => R.resolver({ categoria: v }).grupo !== 'Benefícios');
    return assert(fora.length === 0, `nao casaram: ${JSON.stringify(fora)}`);
});

caso('A8. o retorno NAO tem mais a propriedade "conta", em NENHUM dos estados', () => {
    const amostras = [
        R.resolver({ categoria: 'VALE TRANSPORTE' }),
        R.resolver({ categoria: 'TIPO SEM VINCULO' }),
        R.resolver({ categoria: 'TIPO ORFAO' }),
        R.resolver({}),
    ];
    const comConta = amostras.filter(r => Object.prototype.hasOwnProperty.call(r, 'conta'));
    return assert(comConta.length === 0, `${comConta.length} retorno(s) ainda expoem .conta: ${JSON.stringify(amostras)}`);
});

caso('A9. o estado "conta_orfa" nao existe mais na cadeia', () => {
    return assert(!/conta_orfa/.test(REGIAO_CP.replace(/\/\/[^\n]*/g, '')), 'estado conta_orfa ainda vivo na regiao de resolucao');
});

caso('A10. NENHUM consumidor de _cpGrupoDeReg le ".conta"', () => {
    const semComent = SRC_CP.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const maus = [];
    const re = /_cpGrupoDeReg\s*\([^)]*\)/g;
    let m;
    while ((m = re.exec(semComent))) {
        const janela = semComent.slice(m.index, m.index + 600);
        if (/\.conta\b/.test(janela)) maus.push(janela.slice(0, 120).replace(/\s+/g, ' '));
    }
    if (/\bg\.conta\b|\bgRes\.conta\b/.test(semComent)) maus.push('leitura direta g.conta / gRes.conta');
    return assert(maus.length === 0, `consumidores lendo .conta: ${JSON.stringify(maus)}`);
});

caso('A11. o listener NAO assina mais CP_Contas_Despesa', () => {
    return assert(!R.colecoes.includes('CP_Contas_Despesa'), `colecoes assinadas: ${JSON.stringify(R.colecoes)}`);
});

// ═════════════════════════════════════════════════════════════════════════════
// GRUPO B — A CAMADA QUE O OPERADOR TOCA (master.html, aba Grupos de Contas)
// ═════════════════════════════════════════════════════════════════════════════
GRUPO('B. CAMADA DO OPERADOR (master.html, aba Grupos de Contas)');

// B1 — ids referenciados pelo bloco x ids existentes no HTML (estatico)
const IDS_NO_HTML = new Set();
{
    const re = /\bid="([^"]+)"/g; let m;
    while ((m = re.exec(SRC_MASTER))) IDS_NO_HTML.add(m[1]);
    if (IDS_NO_HTML.size < 50) abortar(`so ${IDS_NO_HTML.size} ids encontrados em master.html, recorte implausivel`);
}
const IDS_REFERENCIADOS = (() => {
    const re = /getElementById\(\s*'([^']+)'\s*\)/g; const out = []; let m;
    while ((m = re.exec(BLOCO_JS_MASTER))) out.push(m[1]);
    const re2 = /getElementById\(\s*"([^"]+)"\s*\)/g;
    while ((m = re2.exec(BLOCO_JS_MASTER))) out.push(m[1]);
    if (!out.length) abortar('nenhum getElementById encontrado no bloco de Grupos, extrator implausivel');
    return [...new Set(out)];
})();

caso(`B1. RISCO 1: nenhum getElementById do bloco de Grupos aponta para id inexistente (${IDS_REFERENCIADOS.length} ids referenciados)`, () => {
    const orfaos = IDS_REFERENCIADOS.filter(id => !IDS_NO_HTML.has(id));
    return assert(orfaos.length === 0,
        `getElementById orfao(s): ${JSON.stringify(orfaos)}. Seguido de .addEventListener, cada um lanca TypeError e MATA o modulo inteiro de master.html.`);
});

const cad = montarCadastro();

caso('B2. o bloco de Grupos executa INTEIRO num DOM real, sem lancar (prova viva do risco 1)', () => {
    if (cad.erroEval) return `o bloco lancou: ${cad.erroEval && cad.erroEval.message}\n${String(cad.erroEval && cad.erroEval.stack || '').split('\n').slice(0, 4).join('\n')}`;
    return true;
});

caso('B3. o bloco registrou os listeners de Firestore esperados (e nenhum de CP_Contas_Despesa)', () => {
    const chaves = cad.listeners.map(l => l.chave);
    if (!chaves.includes('CP_Grupos_Contas')) return `faltou listener de CP_Grupos_Contas. Capturados: ${JSON.stringify(chaves)}`;
    if (!chaves.includes('CP_Tipos_Despesa')) return `faltou listener de CP_Tipos_Despesa. Capturados: ${JSON.stringify(chaves)}`;
    return assert(!chaves.includes('CP_Contas_Despesa'), `ainda assina CP_Contas_Despesa: ${JSON.stringify(chaves)}`);
});

// Semeia o cadastro pelos listeners REAIS
const GRUPOS_SEED = [
    { id: 'G_BEN', data: { nome: 'Benefícios', nome_norm: 'BENEFÍCIOS', bucket_dre: null, ordem: 0 } },
    { id: 'G_OCU', data: { nome: 'Ocupação', nome_norm: 'OCUPAÇÃO', bucket_dre: null, ordem: 1 } },
    { id: 'G_PES', data: { nome: 'Pessoal', nome_norm: 'PESSOAL', bucket_dre: null, ordem: 2 } },
];
const CATALOGO_SEED = {
    total_docs: 1000,
    itens: [
        { tipo: 'VALE TRANSPORTE', tipo_norm: 'VALE TRANSPORTE', slug: 'vale-transporte', docs: 500 },
        { tipo: 'ESTÁGIO', tipo_norm: 'ESTÁGIO', slug: 'estagio', docs: 300 },
        { tipo: 'ALUGUEL', tipo_norm: 'ALUGUEL', slug: 'aluguel', docs: 200 },
    ],
};
try {
    cad.alimentar('CP_Grupos_Contas', GRUPOS_SEED);
    cad.alimentar('CP_Tipos_Despesa', [
        { id: 'vale-transporte', data: { tipo: 'VALE TRANSPORTE', tipo_norm: 'VALE TRANSPORTE', grupo_id: 'G_BEN' } },
    ]);
    cad.alimentarDoc('Metadados/CP_Catalogo_Categorias', CATALOGO_SEED);
} catch (e) {
    if (e.__abort) { registrar('B-SEED. alimentar os listeners do cadastro', false, e.message); imprimirResumo(); process.exit(3); }
    throw e;
}

caso('B4. o seletor de vinculo em massa e "tipos-despesa-grupo-massa" e existe no HTML', () => {
    const el = cad.doc.getElementById('tipos-despesa-grupo-massa');
    if (!el) return 'elemento tipos-despesa-grupo-massa nao existe no HTML';
    const antigo = cad.doc.getElementById('tipos-despesa-conta-massa');
    return assert(!antigo, 'o seletor antigo tipos-despesa-conta-massa ainda existe no HTML');
});

caso('B5. o populador REAL (gdRepopularSelects/gdOpcoesGrupos) enche o seletor de massa com GRUPOS', () => {
    const el = cad.doc.getElementById('tipos-despesa-grupo-massa');
    if (!el) return 'seletor de massa ausente';
    const opts = [...el.options];
    if (opts.length === 0) abortar('seletor de massa veio com ZERO options apos o populador real; extrator/semeadura implausivel');
    if (opts.length !== GRUPOS_SEED.length) return `esperado ${GRUPOS_SEED.length} options, obtido ${opts.length}`;
    const esperado = GRUPOS_SEED.map(g => ({ value: g.id, text: g.data.nome }))
        .sort((a, b) => a.text.localeCompare(b.text, 'pt-BR'));
    const obtido = opts.map(o => ({ value: o.value, text: o.textContent }));
    return eq(obtido, esperado, 'options do seletor de massa:');
});

caso('B6. NENHUMA option do seletor de massa e "[object Object]" nem carrega o rotulo antigo "Conta (Grupo)"', () => {
    const el = cad.doc.getElementById('tipos-despesa-grupo-massa');
    if (!el) return 'seletor de massa ausente';
    const opts = [...el.options];
    if (!opts.length) abortar('zero options, extrator implausivel');
    const ruins = opts.filter(o => o.value === '[object Object]' || o.textContent === '[object Object]'
        || /\(sem grupo\)/.test(o.textContent) || /\(.+\)$/.test(o.textContent.trim()));
    return assert(ruins.length === 0, `options suspeitas: ${JSON.stringify(ruins.map(o => ({ v: o.value, t: o.textContent })))}`);
});

caso('B6b. O QUE O OPERADOR VE: a lista renderizada pelo componente REAL (checkbox_multi.js) traz os nomes dos grupos, sem "[object Object]"', () => {
    if (cad.erroComponente) return `checkbox_multi.js nao carregou: ${cad.erroComponente.message}`;
    if (!cad.win.CentraCheckboxMulti) return 'CentraCheckboxMulti nao ficou disponivel no window apos carregar o componente';
    const el = cad.doc.getElementById('tipos-despesa-grupo-massa');
    if (!el) return 'seletor de massa ausente';
    cad.win.CentraCheckboxMulti.upgrade(el);
    // O componente esconde o <select> e monta trigger + panel. Com data-cb-portal
    // o panel vive no <body>, entao a lista so aparece depois do clique: e assim
    // que o operador a ve, e e assim que ela precisa ser conferida.
    const wrap = cad.doc.querySelector('[data-cb-multi-for="tipos-despesa-grupo-massa"]');
    if (!wrap) return 'o componente nao montou o wrapper do seletor de massa';
    const trigger = wrap.querySelector('.cb-multi-trigger');
    if (!trigger) return 'o componente nao montou o trigger do seletor de massa';
    trigger.dispatchEvent(new cad.win.MouseEvent('click', { bubbles: true }));
    const painel = [...cad.doc.querySelectorAll('.cb-multi-panel')].find(p => !p.classList.contains('hidden'));
    if (!painel) abortar('nenhum panel do componente abriu apos o clique; extrator implausivel');
    const rotulos = [...painel.querySelectorAll('label')]
        .map(n => (n.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!rotulos.length) abortar('o panel aberto nao tem NENHUMA opcao; extrator implausivel');
    const ruins = rotulos.filter(t => /\[object Object\]/.test(t) || /\(sem grupo\)/.test(t));
    if (ruins.length) return `rotulos visiveis corrompidos: ${JSON.stringify(ruins)}`;
    const nomes = GRUPOS_SEED.map(g => g.data.nome);
    const faltando = nomes.filter(n => !rotulos.some(t => t.includes(n)));
    console.log(`            rotulos visiveis: ${JSON.stringify(rotulos.slice(0, 8))}`);
    return assert(faltando.length === 0, `grupos que o operador NAO ve na lista: ${JSON.stringify(faltando)}`);
});

caso('B7. a tabela de vinculo renderizou linhas de verdade (nao ficou muda)', () => {
    const linhas = [...cad.doc.querySelectorAll('#tipos-despesa-corpo tr')];
    if (linhas.length === 0) abortar('tabela de vinculo renderizou ZERO linhas; extrator/semeadura implausivel');
    return eq(linhas.length, CATALOGO_SEED.itens.length, 'linhas renderizadas:');
});

caso('B8. numero de <th> do cabecalho == numero de <td> por linha (coluna removida nao desalinhou a tabela)', () => {
    const ths = [...cad.doc.querySelectorAll('#tipos-despesa-corpo')][0]
        ? [...cad.doc.querySelectorAll('#aba-regras-grupos table thead tr th')] : [];
    if (!ths.length) abortar('nenhum <th> encontrado na tabela de vinculo, extrator implausivel');
    const linhas = [...cad.doc.querySelectorAll('#tipos-despesa-corpo tr')];
    if (!linhas.length) abortar('nenhuma linha renderizada, extrator implausivel');
    const contagens = [...new Set(linhas.map(tr => tr.querySelectorAll('td').length))];
    if (contagens.length !== 1) return `linhas com numero de <td> diferente entre si: ${JSON.stringify(contagens)}`;
    return assert(contagens[0] === ths.length, `${ths.length} <th> no cabecalho x ${contagens[0]} <td> por linha`);
});

caso('B9. o render EMITE as classes que o listener delegado ESCUTA (.gd-tipo-grupo e .gd-tipo-check)', () => {
    const escutadas = [...new Set([...BLOCO_JS_MASTER.matchAll(/closest\(\s*'\.(gd-[a-z-]+)'\s*\)/g)].map(m => m[1])
        .concat([...BLOCO_JS_MASTER.matchAll(/querySelectorAll\(\s*'\.(gd-[a-z-]+)'\s*\)/g)].map(m => m[1])))];
    if (!escutadas.length) abortar('nenhuma classe gd-* escutada encontrada, extrator implausivel');
    const faltando = escutadas.filter(c => cad.doc.querySelectorAll('.' + c).length === 0);
    return assert(faltando.length === 0,
        `o listener escuta ${JSON.stringify(escutadas)} mas o render NAO emitiu ${JSON.stringify(faltando)}. A tela fica MUDA, sem erro no console.`);
});

caso('B10. o render nao emite classe gd-* ORFA (emitida e nao escutada por ninguem)', () => {
    const emitidas = [...new Set([...BLOCO_JS_MASTER.matchAll(/class="(gd-[a-z-]+)/g)].map(m => m[1]))];
    if (!emitidas.length) abortar('nenhuma classe gd-* emitida encontrada, extrator implausivel');
    const escutadas = new Set([...BLOCO_JS_MASTER.matchAll(/'\.(gd-[a-z-]+)'/g)].map(m => m[1]));
    const orfas = emitidas.filter(c => !escutadas.has(c));
    return assert(orfas.length === 0, `classes emitidas e nunca escutadas: ${JSON.stringify(orfas)}`);
});

caso('B11. cada data-gd-* que o handler procura e de fato EMITIDO por algum render', () => {
    const procurados = [...new Set([...BLOCO_JS_MASTER.matchAll(/closest\(\s*'\[(data-gd-[a-z-]+)\]'\s*\)/g)].map(m => m[1]))];
    if (!procurados.length) abortar('nenhum data-gd-* procurado, extrator implausivel');
    const emitidos = new Set([...BLOCO_JS_MASTER.matchAll(/(data-gd-[a-z-]+)="/g)].map(m => m[1]));
    const orfaos = procurados.filter(a => !emitidos.has(a));
    return assert(orfaos.length === 0, `handlers procurando atributo que nenhum render emite: ${JSON.stringify(orfaos)}`);
});

caso('B12. o select do vinculo por LINHA e populado com GRUPOS (value = id, texto = nome), mais a opcao vazia "nao informado"', () => {
    const sel = cad.doc.querySelector('#tipos-despesa-corpo .gd-tipo-grupo');
    if (!sel) return 'nenhum select .gd-tipo-grupo na linha renderizada';
    const opts = [...sel.options];
    if (opts.length <= 1) abortar(`select de linha veio com ${opts.length} option(s); extrator implausivel`);
    if (opts[0].value !== '') return `primeira option deveria ser a vazia, veio value="${opts[0].value}"`;
    if (opts[0].textContent !== 'não informado') return `marcador de vazio deveria ser "não informado", veio "${opts[0].textContent}"`;
    const esperado = GRUPOS_SEED.map(g => ({ value: g.id, text: g.data.nome })).sort((a, b) => a.text.localeCompare(b.text, 'pt-BR'));
    return eq(opts.slice(1).map(o => ({ value: o.value, text: o.textContent })), esperado, 'options do select de linha:');
});

caso('B13. o vinculo ja gravado vem pre-selecionado na linha correta', () => {
    const sels = [...cad.doc.querySelectorAll('#tipos-despesa-corpo .gd-tipo-grupo')];
    if (!sels.length) abortar('nenhum select de linha, extrator implausivel');
    const vt = sels.find(s => s.getAttribute('data-tipo-norm') === 'VALE TRANSPORTE');
    if (!vt) return 'linha de VALE TRANSPORTE nao encontrada';
    const e1 = eq(vt.value, 'G_BEN', 'valor selecionado em VALE TRANSPORTE:'); if (e1 !== true) return e1;
    const al = sels.find(s => s.getAttribute('data-tipo-norm') === 'ALUGUEL');
    return assert(al && al.value === '', `ALUGUEL (sem vinculo) deveria vir vazio, veio "${al && al.value}"`);
});

// ═════════════════════════════════════════════════════════════════════════════
// GRUPO C — AS GRAVACOES
// ═════════════════════════════════════════════════════════════════════════════
GRUPO('C. GRAVACOES EM CP_Tipos_Despesa');

caso('C1. vinculo INDIVIDUAL: mudar o select da linha grava grupo_id/grupo_nome e NENHUM conta_id/conta_nome', () => {
    cad.chamadas.setDoc.length = 0;
    const sel = [...cad.doc.querySelectorAll('#tipos-despesa-corpo .gd-tipo-grupo')]
        .find(s => s.getAttribute('data-tipo-norm') === 'ALUGUEL');
    if (!sel) return 'select da linha de ALUGUEL nao encontrado';
    sel.value = 'G_OCU';
    sel.dispatchEvent(new cad.win.Event('change', { bubbles: true }));
    if (!cad.chamadas.setDoc.length) return 'o change na linha NAO disparou setDoc (handler nao casou com a classe do render)';
    const c = cad.chamadas.setDoc[cad.chamadas.setDoc.length - 1];
    const campos = Object.keys(c.data).sort();
    if (c.data.grupo_id !== 'G_OCU') return `grupo_id gravado = ${JSON.stringify(c.data.grupo_id)}`;
    if (c.data.grupo_nome !== 'Ocupação') return `grupo_nome gravado = ${JSON.stringify(c.data.grupo_nome)}`;
    if ('conta_id' in c.data || 'conta_nome' in c.data) return `ainda grava campo de conta: ${JSON.stringify(campos)}`;
    if (c.ref !== 'CP_Tipos_Despesa/aluguel') return `docId deveria ser o slug determinístico, veio ${c.ref}`;
    return true;
});

caso('C2. vinculo INDIVIDUAL usa SOBRESCRITA TOTAL (setDoc SEM { merge: true })', () => {
    const c = cad.chamadas.setDoc[cad.chamadas.setDoc.length - 1];
    if (!c) return 'nenhuma chamada de setDoc capturada';
    return assert(c.opts === undefined, `setDoc recebeu options: ${JSON.stringify(c.opts)} (merge deixaria conta_id legado pendurado)`);
});

caso('C3. vinculo em MASSA grava grupo_id/grupo_nome, sem conta_*, com sobrescrita total', () => {
    cad.chamadas.batchSet.length = 0;
    const checks = [...cad.doc.querySelectorAll('#tipos-despesa-corpo .gd-tipo-check')];
    if (!checks.length) abortar('nenhum checkbox .gd-tipo-check renderizado, extrator implausivel');
    checks.forEach(cb => { cb.checked = true; cb.dispatchEvent(new cad.win.Event('change', { bubbles: true })); });
    const selM = cad.doc.getElementById('tipos-despesa-grupo-massa');
    if (!selM) return 'seletor de massa ausente';
    [...selM.options].forEach(o => { o.selected = (o.value === 'G_PES'); });
    const btn = cad.doc.getElementById('btn-tipos-despesa-vincular-massa');
    if (!btn) return 'botao de vinculo em massa ausente';
    btn.dispatchEvent(new cad.win.Event('click', { bubbles: true }));
    // O handler e async; o batch.set e sincrono antes do primeiro await do commit.
    if (!cad.chamadas.batchSet.length) return 'o clique em massa NAO produziu nenhum batch.set';
    const ruins = cad.chamadas.batchSet.filter(s => s.opts !== undefined || 'conta_id' in s.data || 'conta_nome' in s.data
        || s.data.grupo_id !== 'G_PES' || s.data.grupo_nome !== 'Pessoal');
    return assert(ruins.length === 0, `gravacoes em massa fora do contrato: ${JSON.stringify(ruins.slice(0, 2))}`);
});

caso('C4. individual e massa gravam EXATAMENTE o mesmo conjunto de campos (sobrescrita total de um nao apaga campo que o outro grava)', () => {
    const ind = cad.chamadas.setDoc[cad.chamadas.setDoc.length - 1];
    const mas = cad.chamadas.batchSet[0];
    if (!ind || !mas) return 'faltou capturar uma das duas gravacoes';
    return eq(Object.keys(mas.data).sort(), Object.keys(ind.data).sort(), 'campos massa x individual:');
});

caso('C5. ENUMERACAO COMPLETA dos escritores de CP_Tipos_Despesa no repositorio', () => {
    const arquivos = execFileSync('git', ['ls-files'], { cwd: RAIZ, encoding: 'utf8' })
        .split('\n').map(s => s.trim()).filter(Boolean)
        .filter(f => /\.(html|js|cjs|mjs|rules)$/i.test(f));
    if (arquivos.length < 10) abortar(`git ls-files devolveu ${arquivos.length} arquivos, implausivel`);
    const escritores = [];
    for (const f of arquivos) {
        let txt; try { txt = fs.readFileSync(path.join(RAIZ, f), 'utf8'); } catch (_) { continue; }
        if (!/CP_Tipos_Despesa|GD_COL_TIPOS/.test(txt)) continue;
        // Linha REAL do arquivo (nada de contar linha em texto ja despido de
        // comentario: o numero sai deslocado e o relatorio aponta para o lugar errado).
        const faixas = faixasComentario(txt);
        const linhas = txt.split('\n');
        let off = 0;
        linhas.forEach((l, i) => {
            const ini = off; off += l.length + 1;
            if (!/(CP_Tipos_Despesa|GD_COL_TIPOS)/.test(l)) return;
            if (dentroDeComentario(faixas, ini + l.search(/\S/))) return;
            if (/\b(setDoc|addDoc|updateDoc|deleteDoc|\.set\(|\.update\(|\.delete\()/.test(l)) {
                escritores.push(`${f}:${i + 1}  ${l.trim().slice(0, 90)}`);
            }
        });
    }
    const esperados = 2; // gdGravarVinculo + batch do vinculo em massa, ambos em master.html
    const foraDoMaster = escritores.filter(e => !e.startsWith('master.html:'));
    let det = `escritores encontrados (${escritores.length}):\n  ` + escritores.join('\n  ');
    if (foraDoMaster.length) return `${det}\nHA ESCRITOR FORA de master.html: ${JSON.stringify(foraDoMaster)}`;
    if (escritores.length !== esperados) return `${det}\nesperava ${esperados} escritores, achou ${escritores.length}`;
    console.log('            ' + det.replace(/\n/g, '\n            '));
    return true;
});

caso('C6. o seed do catalogo NAO escreve em CP_Tipos_Despesa (o catalogo e outra coisa)', () => {
    const p = path.join(RAIZ, 'scripts/seed-catalogo-categorias-cp.cjs');
    if (!fs.existsSync(p)) return 'script de seed nao encontrado';
    const txt = fs.readFileSync(p, 'utf8');
    const semComent = txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '').replace(/\*[^\n]*/g, '');
    return assert(!/CP_Tipos_Despesa/.test(semComent), 'o seed referencia CP_Tipos_Despesa em codigo vivo');
});

caso('C7. DESVINCULAR (option vazia) grava grupo_id/grupo_nome nulos, sem deixar residuo', () => {
    cad.chamadas.setDoc.length = 0;
    const sel = [...cad.doc.querySelectorAll('#tipos-despesa-corpo .gd-tipo-grupo')]
        .find(s => s.getAttribute('data-tipo-norm') === 'VALE TRANSPORTE');
    if (!sel) return 'select da linha de VALE TRANSPORTE nao encontrado';
    sel.value = '';
    sel.dispatchEvent(new cad.win.Event('change', { bubbles: true }));
    const c = cad.chamadas.setDoc[cad.chamadas.setDoc.length - 1];
    if (!c) return 'desvincular nao disparou setDoc';
    if (c.data.grupo_id !== null) return `grupo_id deveria ser null, veio ${JSON.stringify(c.data.grupo_id)}`;
    if (c.data.grupo_nome !== null) return `grupo_nome deveria ser null, veio ${JSON.stringify(c.data.grupo_nome)}`;
    return assert(c.opts === undefined, 'desvincular com merge deixaria o vinculo antigo pendurado');
});

caso('C8. a SOBRESCRITA TOTAL nao apaga nenhum campo que a versao de 6732932 gravava, alem de conta_id/conta_nome', () => {
    const baseSrc = execFileSync('git', ['show', `${BASE_COMMIT}:${ARQ_MASTER}`], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const fnBase = extrairFuncaoSimples(baseSrc, 'gdGravarVinculo', `${BASE_COMMIT}:${ARQ_MASTER}`);
    const camposBase = chavesTopo(objetoLiteral(fnBase, fnBase.indexOf('setDoc')), `gdGravarVinculo@${BASE_COMMIT}`);
    if (camposBase.length < 4) abortar(`extraiu so ${camposBase.length} campos da gravacao de base, implausivel`);
    const ind = cad.chamadas.setDoc[cad.chamadas.setDoc.length - 1];
    if (!ind) return 'nenhuma gravacao capturada';
    const camposHead = new Set(Object.keys(ind.data));
    const perdidos = camposBase.filter(c => !camposHead.has(c) && !['conta_id', 'conta_nome'].includes(c));
    console.log(`            base(${BASE_COMMIT}): ${JSON.stringify(camposBase)}\n            head: ${JSON.stringify([...camposHead])}`);
    return assert(perdidos.length === 0, `a sobrescrita total apaga campo(s) que a base gravava: ${JSON.stringify(perdidos)}`);
});

// ═════════════════════════════════════════════════════════════════════════════
// GRUPO D — A TRAVA DE EXCLUSAO
// ═════════════════════════════════════════════════════════════════════════════
GRUPO('D. TRAVA DE EXCLUSAO DE GRUPO');

caso('D1. o contador EXIBIDO no card e o contador que ARMA a trava sao a MESMA expressao', () => {
    const re = /\[\.\.\._gdTipos\.values\(\)\]\.filter\(t\s*=>\s*t\.grupo_id\s*===\s*id\)\.length/g;
    const achados = BLOCO_JS_MASTER.match(re) || [];
    if (achados.length < 2) {
        // Extrai as duas expressoes reais para o relatorio.
        const todas = [...BLOCO_JS_MASTER.matchAll(/const\s+n\w+\s*=\s*([^\n;]+);/g)].map(m => m[1].trim());
        return `esperava a MESMA expressao de contagem nos dois pontos (exibicao e trava). Expressoes de contagem achadas: ${JSON.stringify(todas)}`;
    }
    return assert([...new Set(achados)].length === 1, `expressoes divergentes: ${JSON.stringify([...new Set(achados)])}`);
});

caso('D2. o card do grupo mostra o numero de TIPOS vinculados (e nao fala mais em conta)', () => {
    const lista = cad.doc.getElementById('lista-grupos-despesa');
    if (!lista) return 'lista-grupos-despesa ausente';
    const cards = [...lista.querySelectorAll('[data-gd-excluir-grupo]')];
    if (!cards.length) abortar('nenhum card de grupo renderizado, extrator implausivel');
    const txt = lista.textContent;
    if (/conta\(s\)/i.test(txt)) return `o card ainda exibe contagem de conta: ${txt.replace(/\s+/g, ' ').slice(0, 160)}`;
    return assert(/tipo\(s\) de despesa/.test(txt), `card nao exibe contagem de tipos: ${txt.replace(/\s+/g, ' ').slice(0, 160)}`);
});

caso('D3. excluir grupo COM tipos vinculados e BLOQUEADO (deleteDoc nao e chamado, e o operador e avisado)', () => {
    cad.chamadas.deleteDoc.length = 0;
    cad.chamadas.toasts.length = 0;
    // Estado: G_PES recebeu todos os tipos no vinculo em massa; realimenta o listener
    // para o mapa refletir isso, exatamente como o Firestore faria.
    cad.alimentar('CP_Tipos_Despesa', CATALOGO_SEED.itens.map(it => ({
        id: it.slug, data: { tipo: it.tipo, tipo_norm: it.tipo_norm, grupo_id: 'G_PES', grupo_nome: 'Pessoal' },
    })));
    const btn = cad.doc.querySelector('[data-gd-excluir-grupo="G_PES"]');
    if (!btn) return 'botao de excluir do grupo G_PES nao encontrado';
    btn.dispatchEvent(new cad.win.Event('click', { bubbles: true }));
    btn.dispatchEvent(new cad.win.Event('click', { bubbles: true })); // 2o clique: nem armado deveria estar
    if (cad.chamadas.deleteDoc.length) return `DELETOU um grupo com filhos: ${JSON.stringify(cad.chamadas.deleteDoc)}`;
    const aviso = cad.chamadas.toasts.map(t => t.msg).join(' | ');
    return assert(/tipo\(s\) de despesa/.test(aviso), `nenhum aviso claro ao operador. Toasts: ${JSON.stringify(cad.chamadas.toasts)}`);
});

caso('D4. excluir grupo SEM filhos exige DOIS cliques e so entao deleta', () => {
    cad.chamadas.deleteDoc.length = 0;
    const btn = cad.doc.querySelector('[data-gd-excluir-grupo="G_BEN"]');
    if (!btn) return 'botao de excluir do grupo G_BEN nao encontrado';
    btn.dispatchEvent(new cad.win.Event('click', { bubbles: true }));
    if (cad.chamadas.deleteDoc.length) return 'deletou no PRIMEIRO clique, sem confirmacao';
    const btn2 = cad.doc.querySelector('[data-gd-excluir-grupo="G_BEN"]'); // o render recria o no
    btn2.dispatchEvent(new cad.win.Event('click', { bubbles: true }));
    if (!cad.chamadas.deleteDoc.length) return 'o segundo clique nao consumou a exclusao';
    return eq(cad.chamadas.deleteDoc[0].ref, 'CP_Grupos_Contas/G_BEN', 'doc excluido:');
});

caso('D5. nao sobrou NENHUM handler de editar/excluir CONTA', () => {
    const semComent = BLOCO_JS_MASTER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const maus = ['data-gd-editar-conta', 'data-gd-excluir-conta', 'gdCancelarEdicaoConta', '_gdEditContaId', 'gdRenderContas', 'gdOpcoesContas']
        .filter(t => semComent.includes(t));
    return assert(maus.length === 0, `handlers/funcoes de conta ainda vivos: ${JSON.stringify(maus)}`);
});

// ═════════════════════════════════════════════════════════════════════════════
// GRUPO E — VARREDURA DE RESIDUO
// ═════════════════════════════════════════════════════════════════════════════
GRUPO('E. VARREDURA DE RESIDUO (comentario e aceitavel, codigo vivo nao)');

const TOKENS_RESIDUO = [
    'CP_Contas_Despesa', 'conta_id', 'conta_nome', '_gdContas', '_cpContasMap',
    'gdOpcoesContas', 'gdRenderContas', 'conta-despesa', 'gd-tipo-conta', 'tipos-despesa-conta-massa',
];
for (const arq of [ARQ_MASTER, ARQ_CP]) {
    const src = arq === ARQ_MASTER ? SRC_MASTER : SRC_CP;
    caso(`E. ${arq}: nenhum residuo VIVO dos ${TOKENS_RESIDUO.length} tokens do nivel "Conta"`, () => {
        const vivos = [];
        const emComent = [];
        for (const t of TOKENS_RESIDUO) {
            for (const o of ocorrencias(src, t)) {
                (o.comentario ? emComent : vivos).push(`${arq}:${o.linha} [${t}] ${o.texto.slice(0, 90)}`);
            }
        }
        if (emComent.length) console.log(`            (${emComent.length} ocorrencia(s) em COMENTARIO, aceitavel)`);
        return assert(vivos.length === 0, `residuo VIVO:\n  ${vivos.join('\n  ')}`);
    });
}

caso('E. firestore.rules: estado do match de CP_Contas_Despesa (fora do escopo desta rodada, mas registrado)', () => {
    const p = path.join(RAIZ, 'firestore.rules');
    const txt = fs.readFileSync(p, 'utf8');
    const tem = /match\s+\/CP_Contas_Despesa\//.test(txt);
    if (tem) return 'firestore.rules ainda tem match /CP_Contas_Despesa/ (colecao que nao existe mais). Pendente do agente seguranca, nao e veredito desta suite.';
    return true;
});

// ═════════════════════════════════════════════════════════════════════════════
// GRUPO F — TEXTO DE INTERFACE
// ═════════════════════════════════════════════════════════════════════════════
GRUPO('F. TEXTO DE INTERFACE (regras permanentes do diretor)');

caso('F1. TRAVESSAO (em dash U+2014) PROIBIDO no HTML da aba de Grupos', () => {
    const hits = [...BLOCO_HTML_GRUPOS.matchAll(/[—]/g)].map(m =>
        BLOCO_HTML_GRUPOS.slice(Math.max(0, m.index - 50), m.index + 50).replace(/\s+/g, ' '));
    return assert(hits.length === 0, `travessao encontrado: ${JSON.stringify(hits)}`);
});

caso('F2. TRAVESSAO (em dash U+2014) PROIBIDO nas strings de UI do bloco JS de Grupos', () => {
    const semComent = BLOCO_JS_MASTER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const hits = [...semComent.matchAll(/[—]/g)].map(m => semComent.slice(Math.max(0, m.index - 60), m.index + 60).replace(/\s+/g, ' '));
    return assert(hits.length === 0, `travessao em string de UI: ${JSON.stringify(hits)}`);
});

caso('F3. TRAVESSAO (em dash U+2014) PROIBIDO na celula de Grupo do Gerenciador', () => {
    const i = SRC_CP.indexOf('FRENTE 4: Grupo de Contas, resolvido em runtime');
    if (i < 0) abortar('celula da coluna Grupo nao encontrada no Gerenciador');
    const trecho = SRC_CP.slice(i, i + 900);
    const semComent = trecho.replace(/\/\/[^\n]*/g, '');
    return assert(!/[—]/.test(semComent), 'travessao na celula da coluna Grupo');
});

caso('F4. celula/valor vazio usa "nao informado" (com acento), nunca glifo', () => {
    const sel = cad.doc.querySelector('#tipos-despesa-corpo .gd-tipo-grupo');
    if (!sel) return 'select de linha ausente';
    const vazia = [...sel.options][0];
    return eq(vazia.textContent, 'não informado', 'marcador de vazio:');
});

caso('F5. titulos das secoes e cabecalhos de coluna em Title Case, sem sobra do nivel removido', () => {
    const titulos = [...BLOCO_HTML_GRUPOS.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map(m => m[1].trim())
        .concat([...BLOCO_HTML_GRUPOS.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map(m => m[1].trim()).filter(Boolean));
    if (!titulos.length) abortar('nenhum titulo/cabecalho extraido da aba, extrator implausivel');
    const comConta = titulos.filter(t => /\bconta(s)?\b/i.test(t) && !/Grupos de Contas/i.test(t));
    if (comConta.length) return `titulo ainda nomeia o nivel removido: ${JSON.stringify(comConta)}`;
    const naoTitleCase = titulos.filter(t => {
        const palavras = t.replace(/^\d+\.\s*/, '').split(/\s+/).filter(Boolean);
        const minusculasOk = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'para', 'com', 'no', 'na']);
        return palavras.some((p, i) => {
            const limpa = p.replace(/[^\wÀ-ÿ]/g, '');
            if (!limpa) return false;
            if (i > 0 && minusculasOk.has(limpa.toLowerCase())) return false;
            return limpa[0] !== limpa[0].toLocaleUpperCase('pt-BR');
        });
    });
    console.log(`            titulos/cabecalhos: ${JSON.stringify(titulos)}`);
    return assert(naoTitleCase.length === 0, `fora de Title Case: ${JSON.stringify(naoTitleCase)}`);
});

// ═════════════════════════════════════════════════════════════════════════════
// GRUPO G — CONFORMIDADE DE PADRAO (regras permanentes que a frente encosta)
// ═════════════════════════════════════════════════════════════════════════════
GRUPO('G. CONFORMIDADE DE PADRAO NOS ELEMENTOS TOCADOS');

caso('G1. o select por linha (.gd-tipo-grupo) usa <select> CRU do navegador', () => {
    const sel = cad.doc.querySelector('#tipos-despesa-corpo .gd-tipo-grupo');
    if (!sel) return 'select de linha ausente';
    const temComponente = sel.hasAttribute('data-checkbox-multi');
    return assert(temComponente,
        'o select de vinculo por linha e <select> cru (sem data-checkbox-multi). CLAUDE.md secao 5: nenhum seletor usa o <select> cru, e a regra vale "para o que for tocado". Este elemento FOI tocado (classe gd-tipo-conta -> gd-tipo-grupo). G1b abaixo classifica se e regressao ou heranca.');
}, 'ressalva');

caso('G1b. CLASSIFICACAO do gap G1: ja era assim em 6732932 (pre-existente) ou nasceu nesta frente?', () => {
    const baseSrc = execFileSync('git', ['show', `${BASE_COMMIT}:${ARQ_MASTER}`], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const i = baseSrc.indexOf('class="gd-tipo-conta');
    if (i < 0) abortar(`select por linha nao encontrado em ${BASE_COMMIT}, extrator implausivel`);
    const trechoBase = baseSrc.slice(i - 200, i + 300);
    const baseEraCru = !/data-checkbox-multi/.test(trechoBase);
    console.log(`            em ${BASE_COMMIT} o select por linha ${baseEraCru ? 'JA ERA cru' : 'usava o componente'}`);
    return assert(baseEraCru, 'REGRESSAO: em 6732932 o select por linha usava o componente e esta frente o rebaixou para <select> cru');
});

caso('G2. o select de massa usa o componente do design system', () => {
    const sel = cad.doc.getElementById('tipos-despesa-grupo-massa');
    if (!sel) return 'seletor de massa ausente';
    return assert(sel.hasAttribute('data-checkbox-multi'), 'seletor de massa sem data-checkbox-multi');
});

caso('G3. ESTADO VAZIO: catalogo sem itens e cadastro sem grupos nao quebra a tela, e o operador ve a mensagem certa', () => {
    cad.alimentarDoc('Metadados/CP_Catalogo_Categorias', { total_docs: 0, itens: [] });
    const vazio = cad.doc.getElementById('tipos-despesa-vazio');
    if (!vazio) return 'elemento de estado vazio ausente';
    if (vazio.classList.contains('hidden')) return 'com catalogo vazio, a mensagem de vazio continuou escondida';
    const corpo = cad.doc.getElementById('tipos-despesa-corpo');
    if (corpo.querySelectorAll('tr').length !== 0) return 'corpo deveria ficar sem linhas';
    cad.alimentar('CP_Grupos_Contas', []);
    const lista = cad.doc.getElementById('lista-grupos-despesa');
    const txt = (lista.textContent || '').replace(/\s+/g, ' ').trim();
    if (!/Nenhum grupo cadastrado/.test(txt)) return `mensagem de lista vazia inesperada: "${txt.slice(0, 120)}"`;
    if (/conta/i.test(txt)) return `mensagem de vazio ainda fala em conta: "${txt}"`;
    const saude = cad.doc.getElementById('tipos-despesa-saude');
    console.log(`            saude: "${(saude && saude.textContent || '').trim()}" | vazio: "${txt}"`);
    return true;
});

// ═════════════════════════════════════════════════════════════════════════════
function imprimirResumo() {
    const total = resultados.length;
    const falhas = resultados.filter(r => !r.ok);
    const bloqueantes = falhas.filter(r => r.nivel !== 'ressalva');
    const ressalvas = falhas.filter(r => r.nivel === 'ressalva');
    console.log(`\n${'═'.repeat(78)}`);
    console.log(`RESUMO  |  modo=${MODO}  |  base fixada=${BASE_COMMIT}`);
    console.log(`casos: ${total}  |  passaram: ${total - falhas.length}  |  gaps bloqueantes: ${bloqueantes.length}  |  ressalvas: ${ressalvas.length}`);
    if (bloqueantes.length) {
        console.log('\nGAPS BLOQUEANTES:');
        bloqueantes.forEach((f, i) => console.log(`  ${i + 1}. [${f.grupo.split('.')[0]}] ${f.nome}\n     ${f.detalhe.replace(/\n/g, '\n     ')}`));
    }
    if (ressalvas.length) {
        console.log('\nRESSALVAS (desvio de padrao PRE-EXISTENTE, nao introduzido por esta frente; decisao do diretor):');
        ressalvas.forEach((f, i) => console.log(`  ${i + 1}. [${f.grupo.split('.')[0]}] ${f.nome}\n     ${f.detalhe.replace(/\n/g, '\n     ')}`));
    }
    console.log(`\nVEREDITO: ${bloqueantes.length === 0 ? 'LIBERADO' : 'REPROVADO'}${ressalvas.length ? ` (com ${ressalvas.length} ressalva)` : ''}`);
    console.log('═'.repeat(78));
    return bloqueantes.length;
}

const nFalhas = imprimirResumo();
process.exit(nFalhas === 0 ? 0 : 1);
