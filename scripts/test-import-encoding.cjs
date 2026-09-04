/**
 * OS-IMPORT-ENCODING-01 — teste funcional do detector de encoding.
 * Extrai o código REAL de produção dos HTMLs (sem reescrever nada) e roda
 * contra os arquivos reais do ERP + fixture Windows-1252 fiel.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
// TXT reais do ERP, no desktop do diretor (fora do repo — dado de produção).
const BASES = process.env.CP_BASES_DIR
  || 'C:/Users/Henrique/Desktop/bases de importação sistema/Contas a Pagar';

// ── Extrator: puxa declarações nomeadas do fonte de produção ──────────────
function fatiarBloco(src, inicio) {
  const abre = src.indexOf('{', inicio);
  let d = 0;
  for (let i = abre; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(inicio, i + 1); }
  }
  throw new Error('bloco não fechado em ' + inicio);
}
function pegarFuncao(src, nome) {
  const re = new RegExp(`(?:^|\\n)\\s*(?:async\\s+)?function\\s+${nome}\\s*\\(`, 'm');
  const m = re.exec(src);
  if (!m) throw new Error('função não encontrada: ' + nome);
  const ini = m.index + (m[0].startsWith('\n') ? 1 : 0);
  return fatiarBloco(src, ini);
}
function pegarConst(src, nome) {
  const re = new RegExp(`(?:^|\\n)(\\s*const\\s+${nome}\\s*=\\s*[^\\n]+)`, 'm');
  const m = re.exec(src);
  if (!m) throw new Error('const não encontrada: ' + nome);
  return m[1];
}

const gcpHtml = fs.readFileSync(path.join(REPO, 'gerenciador_contas_pagar_desktop/code.html'), 'utf8');

const CONSTS = ['RE_CP_CLIENTE', 'RE_CP_IGNORAR', 'RE_CP_DATA', 'RE_CP_VALOR', 'RE_CP_SITUACAO', 'RE_CP_TITULO_ORD'];
const FUNCS = ['cpLerTextoAutoEncoding', 'cpParsearTXT', 'cpParseCodigo', 'cpDataBRtoISO',
               'cpParseValorBR', 'cpNormalizarSituacao', 'cpNormalizarTexto'];

let bundle = '';
for (const c of CONSTS) bundle += pegarConst(gcpHtml, c) + '\n';
for (const f of FUNCS) bundle += pegarFuncao(gcpHtml, f) + '\n';
bundle += '\nmodule.exports = { cpLerTextoAutoEncoding, cpParsearTXT };\n';

const mod = { exports: {} };
new Function('module', 'exports', 'TextDecoder', bundle)(mod, mod.exports, TextDecoder);
const { cpLerTextoAutoEncoding, cpParsearTXT } = mod.exports;
console.log('✓ Extraído do fonte de produção:', FUNCS.join(', '));

// Blob-like mínimo: o detector só usa .arrayBuffer()
const comoArquivo = (buf) => ({ arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });

// As 17 categorias que estavam corrompidas em produção (forma CORRETA).
const CATEGORIAS_ALVO = [
  'ANÚNCIOS E PUBLICAÇÕES', 'ASSESSORIA CONTÁBIL', 'ASSISTÊNCIA MÉDICA/ODONTOLÓGIC',
  'CONTRIBUIÇÕES A SINDICATOS', 'EVENTOS E PROMOÇÕES', 'EXAMES MÉDICOS',
  'FÉRIAS LÍQUIDAS A PAGAR', 'OUTROS SERVIÇOS PROFISSIONAIS', 'PRÊMIOS/GRATIFICAÇÕES',
  'RELATÓRIO DE DESPESAS', 'RESCISÕES A PAGAR', 'SALÁRIO LÍQUIDO A PAGAR',
  'SERVIÇOS DE MANUTENÇÃO', 'TARIFAS E COMISSÕES BANCÁRIAS', 'TAXAS DE LICENÇA E FUNCIONAMEN',
  'VALE REFEIÇÃO', 'VALE TRANSPORTE',
];

function listarTxt(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listarTxt(p));
    else if (e.name.toLowerCase().endsWith('.txt')) out.push(p);
  }
  return out;
}

(async () => {
  if (!fs.existsSync(BASES)) {
    console.error('Pasta de bases nao encontrada:', BASES);
    console.error('Este teste exige os TXT reais do ERP. Defina CP_BASES_DIR se estiverem em outro caminho.');
    process.exit(2);
  }
  let falhas = 0;
  const arquivos = listarTxt(BASES).filter(p => fs.statSync(p).size > 0);

  // ══ TESTE (b) — arquivos UTF-8 reais continuam funcionando ═══════════════
  console.log('\n══ TESTE (b) — REGRESSÃO: arquivos UTF-8 reais do ERP ══');
  let totalLancB = 0;
  for (const p of arquivos) {
    const buf = fs.readFileSync(p);
    const { texto, encoding } = await cpLerTextoAutoEncoding(comoArquivo(buf));
    // Referência: o comportamento ANTIGO (f.text() === TextDecoder utf-8 não-fatal)
    const antigo = new TextDecoder('utf-8').decode(buf);
    const igualAoAntigo = texto === antigo;
    const temFFFD = texto.includes('\uFFFD');
    const { lancamentos } = cpParsearTXT(texto);
    totalLancB += lancamentos.length;
    const ok = encoding === 'UTF-8' && igualAoAntigo && !temFFFD;
    if (!ok) falhas++;
    console.log(`  ${ok ? 'PASS' : 'FALHA'} | ${encoding.padEnd(12)} | idêntico ao f.text(): ${igualAoAntigo} | U+FFFD: ${temFFFD} | ${String(lancamentos.length).padStart(5)} lanç. | ${path.basename(p)}`);
  }
  console.log(`  → ${arquivos.length} arquivos, ${totalLancB} lançamentos. Saída BYTE-IDÊNTICA ao comportamento antigo.`);

  // ══ TESTE (a) — fixture Windows-1252 fiel ════════════════════════════════
  // Reencoda um arquivo REAL do ERP para cp1252: os bytes ficam idênticos ao
  // que o ERP passou a emitir a partir de jun/2026.
  console.log('\n══ TESTE (a) — Windows-1252 (fixture reencodado de arquivo real) ══');
  const origem = arquivos.find(p => path.basename(p) === 'MAIO TODAS AS EMPRESAS.txt');
  if (!origem) throw new Error('fixture base não encontrado');
  const bufUtf8 = fs.readFileSync(origem);
  const textoOriginal = bufUtf8.toString('utf8');

  // cp1252 encoder (subset Latin-1, suficiente para PT-BR do ERP)
  const cp1252 = Buffer.from(textoOriginal.split('').map(ch => {
    const c = ch.codePointAt(0);
    return c <= 0xFF ? c : 0x3F; // '?' para o que não couber
  }));
  // fixture vive só em memória — nada de lixo binário no repositório.

  // Prova de que o fixture é mesmo inválido em UTF-8
  let ehInvalidoUtf8 = false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(cp1252); } catch { ehInvalidoUtf8 = true; }

  const antesFix = new TextDecoder('utf-8').decode(cp1252);          // comportamento ANTIGO
  const { texto: depoisFix, encoding: encFix } = await cpLerTextoAutoEncoding(comoArquivo(cp1252));

  const fffdAntes = (antesFix.match(/\uFFFD/g) || []).length;
  const fffdDepois = (depoisFix.match(/\uFFFD/g) || []).length;
  const roundTripOk = depoisFix === textoOriginal;

  console.log(`  fixture: ${path.basename(origem)} reencodado → ${cp1252.length} bytes`);
  console.log(`  bytes inválidos para UTF-8 estrito: ${ehInvalidoUtf8}`);
  console.log(`  encoding detectado: ${encFix}`);
  console.log(`  U+FFFD ANTES da correção (f.text()): ${fffdAntes}`);
  console.log(`  U+FFFD DEPOIS da correção:           ${fffdDepois}`);
  console.log(`  round-trip idêntico ao texto original: ${roundTripOk}`);
  if (!(ehInvalidoUtf8 && encFix === 'Windows-1252' && fffdAntes > 0 && fffdDepois === 0 && roundTripOk)) falhas++;

  const parseAntes = cpParsearTXT(antesFix);
  const parseDepois = cpParsearTXT(depoisFix);
  console.log(`  lançamentos: antes ${parseAntes.lancamentos.length} · depois ${parseDepois.lancamentos.length}`);
  console.log(`  transferências descartadas: antes ${parseAntes.stats.transferenciasIgnoradas} · depois ${parseDepois.stats.transferenciasIgnoradas}`);

  // ══ TESTE (c) — as 17 categorias ═════════════════════════════════════════
  console.log('\n══ TESTE (c) — as 17 categorias que estavam quebradas ══');
  const catsAntes = new Set(parseAntes.lancamentos.map(l => l.despesa));
  const catsDepois = new Set(parseDepois.lancamentos.map(l => l.despesa));
  const achar = (set, alvo) => [...set].find(c => c.toUpperCase().startsWith(alvo.toUpperCase().slice(0, 18)));
  let encontradas = 0, corretas = 0;
  for (const alvo of CATEGORIAS_ALVO) {
    const dA = achar(catsAntes, alvo);
    const dD = achar(catsDepois, alvo);
    if (!dD) { console.log(`  --   (ausente neste arquivo) ${alvo}`); continue; }
    encontradas++;
    const limpo = !dD.includes('\uFFFD');
    if (limpo) corretas++; else falhas++;
    const antesTxt = dA ? dA : '(n/a)';
    console.log(`  ${limpo ? 'PASS' : 'FALHA'} | antes: ${antesTxt.padEnd(32)} → depois: ${dD}`);
  }
  console.log(`  → ${corretas}/${encontradas} categorias presentes no arquivo saíram com acento correto.`);
  // Guarda anti-vacuidade: se o arquivo não contém as categorias, o teste
  // não provou nada e NÃO pode passar.
  if (encontradas < 10) {
    console.log(`  ❌ TESTE VAZIO: só ${encontradas} das 17 categorias existem neste arquivo — assertiva não prova nada.`);
    falhas++;
  }

  const totalFFFDDepois = [...catsDepois].filter(c => c.includes('\uFFFD')).length;
  console.log(`  → categorias com U+FFFD após a correção: ${totalFFFDDepois}`);
  if (totalFFFDDepois > 0) falhas++;

  console.log('\n' + (falhas === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${falhas} FALHA(S)`));
  process.exit(falhas === 0 ? 0 : 1);
})();
