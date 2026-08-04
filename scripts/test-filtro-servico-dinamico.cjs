/**
 * test-filtro-servico-dinamico.cjs
 * ------------------------------------------------------------------
 * Teste de validação READ-ONLY (OS-FILTRO-SERVICO-DINAMICO-01) — testador-auditor.
 *
 * Princípio: NÃO reimplementa a lógica de negócio à mão. Em vez disso, EXTRAI o
 * código-fonte real de contas_a_receber_desktop/code.html (obterTipoServicoBruto,
 * normTipoServico, a linha do fTipoNormSet, a linha do bateTipo e o corpo da IIFE
 * popularFiltroTipoServico) e executa esse texto literal via vm, contra os 9.513
 * documentos REAIS da coleção Lancamentos. O que este script prova é sobre o
 * código que vai a produção, não sobre uma reescrita paralela.
 *
 * Também extrai a versão ANTERIOR (git show HEAD) das mesmas peças, para o
 * comparativo ANTES x DEPOIS.
 *
 * NÃO FAZ NENHUMA ESCRITA NO FIRESTORE (só .get()).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const REPO_ROOT = path.resolve(__dirname, '..');
const FILE = path.join(REPO_ROOT, 'contas_a_receber_desktop', 'code.html');
const PROJECT_ID = 'centra-fin';
const COLLECTION = 'Lancamentos';

// ---------------------------------------------------------------------------
// 1) Extração de blocos de código REAIS (brace-matching, sem reescrever nada)
// ---------------------------------------------------------------------------
function extractFunctionBlock(src, startMarker) {
  const idx = src.indexOf(startMarker);
  if (idx === -1) throw new Error('Marcador não encontrado: ' + startMarker);
  const braceStart = src.indexOf('{', idx);
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(idx, i + 1);
    }
  }
  throw new Error('Chaves desbalanceadas para: ' + startMarker);
}

function extractIIFE(src, startMarker) {
  // startMarker inclui o "(function ... () {" -- extrai o corpo balanceado e
  // devolve já fechado como chamada auto-invocada "(function(){...})();"
  const idx = src.indexOf(startMarker);
  if (idx === -1) throw new Error('Marcador não encontrado: ' + startMarker);
  const braceStart = src.indexOf('{', idx);
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        const bodyEnd = i + 1;
        // confere que logo em seguida está ")();" (convenção de IIFE do arquivo)
        const tail = src.slice(bodyEnd, bodyEnd + 6).replace(/\s+/g, '');
        if (!tail.startsWith(')();')) throw new Error('IIFE não fecha com )(); como esperado, achei: ' + tail);
        return src.slice(idx, bodyEnd) + ')();';
      }
    }
  }
  throw new Error('Chaves desbalanceadas para IIFE: ' + startMarker);
}

function extractLine(src, marker) {
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error('Linha não encontrada: ' + marker);
  const lineStart = src.lastIndexOf('\n', idx) + 1;
  const lineEnd = src.indexOf('\n', idx);
  return src.slice(lineStart, lineEnd).trim();
}

function extractConstArrowBlock(src, marker) {
  // Para "const x = (id) => { ... };" -- brace-match e inclui o ';' final.
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error('Marcador não encontrado: ' + marker);
  const braceStart = src.indexOf('{', idx);
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(idx, i + 1) + ';'; }
  }
  throw new Error('Chaves desbalanceadas para: ' + marker);
}

const srcNew = fs.readFileSync(FILE, 'utf8');
const srcHead = execSync('git show HEAD:contas_a_receber_desktop/code.html', { cwd: REPO_ROOT, maxBuffer: 1024 * 1024 * 50 }).toString('utf8');

// --- peças NOVAS (código atual, não commitado) ---
const src_obterTipoServicoBruto = extractFunctionBlock(srcNew, 'function obterTipoServicoBruto(d)');
const src_normTipoServico = extractFunctionBlock(srcNew, 'function normTipoServico(s)');
const src_fTipoNormSetLine = extractLine(srcNew, 'const fTipoNormSet = new Set(fTipoArr.map(normTipoServico));');
const src_bateTipoLine = extractLine(srcNew, 'let bateTipo = fTipoArr.includes("Todos") || fTipoNormSet.has(normTipoServico(tipoServico));');
const src_popularIIFE = extractIIFE(srcNew, '(function popularFiltroTipoServico() {');
const src_getMultiValues = extractConstArrowBlock(srcNew, 'const getMultiValues = (id) => {');

// Options hardcoded NOVAS no HTML (deve sobrar só "Todos")
const selBlockNew = srcNew.slice(srcNew.indexOf('id="filtro-tipo-servico"'), srcNew.indexOf('</select>', srcNew.indexOf('id="filtro-tipo-servico"')));
const optsHardcodedNew = [...selBlockNew.matchAll(/<option value="([^"]+)"/g)].map(m => m[1]);

// --- peças ANTIGAS (git HEAD, antes da OS) ---
const src_tipoServicoLineOld = extractLine(srcHead, "const tipoServico = String(data['descricao']");
const src_normLineOld = extractLine(srcHead, 'const norm = (s) => String(s || "").toLowerCase().normalize("NFD")');
const src_bateTipoLineOld = extractLine(srcHead, 'let bateTipo = fTipoArr.includes("Todos") || fTipoArr.some(tipo => norm(tipoServico).includes(norm(tipo)));');
const selBlockOld = srcHead.slice(srcHead.indexOf('id="filtro-tipo-servico"'), srcHead.indexOf('</select>', srcHead.indexOf('id="filtro-tipo-servico"')));
const optsHardcodedOld = [...selBlockOld.matchAll(/<option value="([^"]+)"/g)].map(m => m[1]).filter(v => v !== 'Todos');

console.log('=== PEÇAS EXTRAÍDAS (prova de que não houve reimplementação manual) ===');
console.log('--- obterTipoServicoBruto (NOVO) ---\n' + src_obterTipoServicoBruto + '\n');
console.log('--- normTipoServico (NOVO) ---\n' + src_normTipoServico + '\n');
console.log('--- linha fTipoNormSet (NOVO) ---\n' + src_fTipoNormSetLine);
console.log('--- linha bateTipo (NOVO) ---\n' + src_bateTipoLine + '\n');
console.log('--- options hardcoded no HTML (NOVO, deve ser só "Todos") ---', optsHardcodedNew);
console.log('--- tipoServico (ANTIGO / git HEAD) ---\n' + src_tipoServicoLineOld);
console.log('--- norm (ANTIGO / git HEAD) ---\n' + src_normLineOld);
console.log('--- bateTipo (ANTIGO / git HEAD) ---\n' + src_bateTipoLineOld);
console.log('--- options hardcoded (ANTIGO, 10 esperadas) ---', optsHardcodedOld, '\n');

// ---------------------------------------------------------------------------
// 2) Sandbox DOM mínimo para rodar a IIFE popularFiltroTipoServico literalmente
// ---------------------------------------------------------------------------
function parseOptionsFromHtml(html) {
  return [...html.matchAll(/<option value="([^"]*)"([^>]*)>/g)].map(m => ({
    value: m[1],
    selected: /\bselected\b/.test(m[2]),
  }));
}

function makeSelectMock(initialHtml) {
  let optionsArr = parseOptionsFromHtml(initialHtml);
  return {
    get options() { return optionsArr; },
    get selectedOptions() { return optionsArr.filter(o => o.selected); },
    set innerHTML(html) { optionsArr = parseOptionsFromHtml(html); },
    get innerHTML() { return optionsArr.map(o => '<option value="' + o.value + '"' + (o.selected ? ' selected' : '') + '>' + o.value + '</option>').join(''); },
    dispatchEvent() {},
    querySelector() { return null; },
  };
}

// ---------------------------------------------------------------------------
// 3) Buscar os 9.513 documentos reais (READ-ONLY)
// ---------------------------------------------------------------------------
initializeApp({ projectId: PROJECT_ID, credential: applicationDefault() });
const db = getFirestore();

(async () => {
  const snap = await db.collection(COLLECTION).get();
  const docs = snap.docs.map(d => d.data());
  console.log('Total de documentos lidos em ' + COLLECTION + ': ' + docs.length + '\n');

  const selMock = makeSelectMock('<option value="Todos" selected class="font-bold border-b pb-1 mb-1">Todos os Serviços</option>');
  const context = {
    document: { getElementById: (id) => (id === 'filtro-tipo-servico' ? selMock : null) },
    console,
    Event: function (type) { this.type = type; },
    todasAsNotas: docs,
  };
  vm.createContext(context);

  const combinedScript = [
    src_getMultiValues,
    src_obterTipoServicoBruto,
    src_normTipoServico,
    src_popularIIFE,
  ].join('\n\n');

  vm.runInContext(combinedScript, context, { filename: 'popularFiltroTipoServico-extraido.js' });

  // context.obterTipoServicoBruto / context.normTipoServico agora são as funções
  // REAIS extraídas do arquivo, chamáveis fora da vm com dados reais.
  const obterTipoServicoBruto = context.obterTipoServicoBruto;
  const normTipoServico = context.normTipoServico;

  const finalOptions = selMock.options.filter(o => o.value !== 'Todos').map(o => o.value);

  // bateTipo real (extraído) — compilado como função reutilizável.
  const bateTipoFor = new Function('fTipoArr', 'tipoServico', 'normTipoServico',
    src_fTipoNormSetLine + '\n' + src_bateTipoLine + '\nreturn bateTipo;');

  console.log('=== LISTA FINAL DE OPTIONS (ordem exibida no filtro, alfabética pt-BR) ===');
  console.log('Total de options dinâmicas geradas: ' + finalOptions.length + '\n');

  let somaContagens = 0;
  let semTipo = 0;
  const linhasRelatorio = [];
  for (const label of finalOptions) {
    let count = 0;
    for (const d of docs) {
      const bruto = obterTipoServicoBruto(d);
      if (bateTipoFor([label], bruto, normTipoServico)) count++;
    }
    somaContagens += count;
    linhasRelatorio.push({ label, count });
  }
  for (const d of docs) {
    const bruto = String(obterTipoServicoBruto(d) || '').replace(/\s+/g, ' ').trim();
    if (!bruto || bruto === '-') semTipo++;
  }

  linhasRelatorio.forEach(({ label, count }) => {
    console.log('  ' + String(count).padStart(6) + '  ' + label);
  });
  console.log('\n  Docs SEM tipo de serviço (vazio ou "-"): ' + semTipo);
  console.log('  Soma das contagens das options + sem-tipo: ' + (somaContagens + semTipo));
  console.log('  Total real de documentos               : ' + docs.length);
  console.log('  BATE (nenhuma nota some / conta em dobro)?: ' + ((somaContagens + semTipo) === docs.length ? 'SIM' : 'NÃO — DIVERGÊNCIA') + '\n');

  // ---------------------------------------------------------------------------
  // 4) Casos de aceite específicos ditados pelo diretor
  // ---------------------------------------------------------------------------
  console.log('=== CASOS DE ACEITE ===');

  const apareceram = ['TERCEIROS', 'FOPAG', 'INTEGRACAO', 'DEVOLUTIVA', 'TREINAMENTO DE PPA'];
  apareceram.forEach(k => {
    const achou = finalOptions.some(o => normTipoServico(o) === normTipoServico(k));
    console.log('  (i) "' + k + '" aparece agora no filtro? ' + (achou ? 'SIM' : 'NÃO — FALHOU'));
  });

  const sumiu = !finalOptions.some(o => normTipoServico(o) === normTipoServico('PROCESSAMENTO DE PPA'));
  console.log('  (ii) "PROCESSAMENTO DE PPA" sumiu (sem nota real)? ' + (sumiu ? 'SIM' : 'NÃO — FALHOU (ainda aparece)'));

  const estagioOptions = finalOptions.filter(o => normTipoServico(o) === normTipoServico('ESTAGIO'));
  const estagioCount = linhasRelatorio.find(l => normTipoServico(l.label) === normTipoServico('ESTAGIO'));
  console.log('  (iii) ESTAGIO/ESTÁGIO produzem UMA única option? ' + (estagioOptions.length === 1 ? 'SIM' : 'NÃO — FALHOU (' + estagioOptions.length + ' options)') + ' — option="' + estagioOptions[0] + '", notas=' + (estagioCount ? estagioCount.count : 'N/A') + ' (esperado 47)');

  const treinamentoCount = linhasRelatorio.find(l => normTipoServico(l.label) === normTipoServico('TREINAMENTO') && normTipoServico(l.label) !== normTipoServico('TREINAMENTO DE PPA'));
  console.log('  (iv) Selecionar TREINAMENTO retorna exatamente 228 (não 229)? label="' + (treinamentoCount ? treinamentoCount.label : 'N/A') + '" contagem=' + (treinamentoCount ? treinamentoCount.count : 'N/A') + ' -> ' + (treinamentoCount && treinamentoCount.count === 228 ? 'SIM' : 'NÃO — FALHOU'));

  console.log('  (v) Soma options + sem-tipo == total (9513)? ' + ((somaContagens + semTipo) === docs.length ? 'SIM' : 'NÃO — FALHOU') + ' (' + (somaContagens + semTipo) + ' vs ' + docs.length + ')\n');

  // ---------------------------------------------------------------------------
  // 5) Comparativo ANTES (substring, 10 fixas) x AGORA (exato, dinâmico)
  // ---------------------------------------------------------------------------
  console.log('=== COMPARATIVO ANTES x AGORA (universo de notas ALCANÇÁVEL pelo filtro) ===');

  const oldObterTipo = new Function('data', 'return ' + src_tipoServicoLineOld.replace(/^const tipoServico = /, '').replace(/;$/, '') + ';');
  const oldNorm = new Function('s', 'return (' + src_normLineOld.replace(/^const norm = /, '').replace(/;$/, '') + ')(s);');
  const oldBateTipoFor = new Function('fTipoArr', 'tipoServico', 'norm', src_bateTipoLineOld + '\nreturn bateTipo;');

  let alcancavelAntes = 0;
  let alcancavelAgora = 0;
  for (const d of docs) {
    const tipoOld = oldObterTipo(d);
    if (oldBateTipoFor(optsHardcodedOld, tipoOld, oldNorm)) alcancavelAntes++;

    const tipoNew = obterTipoServicoBruto(d);
    if (bateTipoFor(finalOptions, tipoNew, normTipoServico)) alcancavelAgora++;
  }
  console.log('  ANTES (10 options fixas, substring, campo "descricao" primeiro): ' + alcancavelAntes + ' de ' + docs.length + ' notas alcançáveis');
  console.log('  AGORA (options dinâmicas, casamento exato, campo canônico)     : ' + alcancavelAgora + ' de ' + docs.length + ' notas alcançáveis');
  console.log('  Diferença: +' + (alcancavelAgora - alcancavelAntes) + ' notas agora alcançáveis por algum filtro específico\n');

  console.log('=== FIM DO TESTE ===');
  process.exit(0);
})().catch(e => { console.error('ERRO NO TESTE:', e); process.exit(1); });
