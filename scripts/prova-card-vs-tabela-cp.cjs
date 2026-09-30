#!/usr/bin/env node
/**
 * PROVA: clicar num card de natureza e somar a TABELA tem que fechar com o CARD.
 * Pedido do diretor em 2026-09-30. SOMENTE LEITURA, nao escreve nada.
 *
 * As DUAS funcoes sao EXTRAIDAS do proprio `gerenciador_contas_pagar_desktop/code.html`:
 * `aplicarFiltrosCP` (o que a tabela mostra) e `atualizarKPIs` (o que o card soma).
 * Nada aqui reimplementa a regra; o que este script faz e simular o clique, ou seja,
 * colocar o filtro de Tipo no mesmo conjunto que o card coloca, e comparar.
 *
 * Tambem prova o outro lado: SEM card ativo, a tabela continua mostrando cancelado.
 *
 * USO: node scripts/prova-card-vs-tabela-cp.cjs --dados <caminho/dados.json>
 */
const fs = require('fs');
const path = require('path');

const iDados = process.argv.indexOf('--dados');
const CAMINHO = iDados >= 0 ? process.argv[iDados + 1] : null;
if (!CAMINHO || !fs.existsSync(CAMINHO)) {
  console.error('ERRO: passe --dados <caminho do snapshot json>. O snapshot mora FORA do repo.');
  process.exit(1);
}
const regs = JSON.parse(fs.readFileSync(CAMINHO, 'utf8'));
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gerenciador_contas_pagar_desktop', 'code.html'), 'utf8');

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const cent = (n) => Math.round(n * 100);

function extrair(nome) {
  const i = SRC.indexOf(`function ${nome}(`);
  if (i < 0) throw new Error(`nao achei ${nome}`);
  let j = SRC.indexOf('{', i), n = 0, fim = -1;
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') n++;
    else if (SRC[k] === '}') { n--; if (!n) { fim = k + 1; break; } }
  }
  return SRC.slice(i, fim);
}
// O mapa card -> valores do filtro sai do PROPRIO codigo, nao de uma copia aqui:
// se alguem mudar os valores de um card, esta prova acompanha.
function extrairKpiFiltroMap() {
  const i = SRC.indexOf('const _KPI_FILTRO_MAP = {');
  const j = SRC.indexOf('};', i);
  return new Function(SRC.slice(i, j + 2) + '\nreturn _KPI_FILTRO_MAP;')();
}
// Extrai o texto de uma declaracao `const NOME = ...;` de uma linha.
// Necessario porque `_cpCardNaturezaAtivoKey` depende de `_CARDS_NATUREZA`, e na
// primeira versao desta prova eu esqueci de injetar essa constante: a funcao lancou
// ReferenceError, a falha aberta do codigo devolveu '' e o resultado PARECEU "nao ha
// cancelado a excluir" quando na verdade o harness estava quebrado. Lição: ao extrair
// uma funcao real, extrair TODAS as dependencias dela, e nunca confiar num caminho de
// falha silencioso para dizer que o comportamento esta certo.
// Aceita declaracao de UMA ou VARIAS linhas: varre do `const NOME =` ate a primeira
// linha que termina em `;`. `_cpNormTarifa` quebrou a versao anterior, que so pegava
// uma linha, porque a arrow dele ocupa duas.
function extrairConstLinha(nome) {
  const marca = `const ${nome} =`;
  const i = SRC.indexOf(marca);
  if (i < 0) throw new Error(`nao achei a const ${nome}`);
  const linhas = SRC.slice(i).split('\n');
  const out = [];
  for (const l of linhas) {
    out.push(l);
    if (/;\s*$/.test(l)) return out.join('\n').trim();
    if (out.length > 30) break;
  }
  throw new Error(`nao achei o fim da const ${nome}`);
}

const ANO = new Date().getFullYear();
const LIMIAR = `${ANO}-01-01`;
const MAP = extrairKpiFiltroMap();
const CARDS = [
  ['interno', 'kpi-interno', 'Custo Fornecedor Interno'],
  ['externo', 'kpi-externo', 'Custo Fornecedor Externo'],
  ['cliente', 'kpi-cliente', 'Custo Cliente'],
  ['sem_class', 'kpi-sem-class', 'Sem Classificacao'],
];

// ── Ambiente minimo para as duas funcoes reais rodarem ──────────────────────
// Cada <select> e um objeto com `options`; `getMultiValues`/`setMultiValues` e
// `isMultiAll` sao EXTRAIDOS do codigo tambem, para o contrato de leitura do filtro
// ser o do sistema e nao o meu.
function montarAmbiente(valoresTipo) {
  const selects = {};
  // O contrato REAL de `getMultiValues` le `sel.selectedOptions` (nao `options`
  // filtrado), entao o select falso expoe exatamente isso. Espelhar o contrato e o
  // que faz esta prova valer: stub com contrato diferente testaria outra coisa.
  const mkSel = (id, valores) => {
    const opts = (valores || []).map(v => ({ value: v, selected: true }));
    selects[id] = { id, options: opts, selectedOptions: opts };
  };
  // Só o filtro de Tipo recebe valores; todos os outros ficam em "Todos".
  for (const id of ['cp-filtro-status', 'cp-filtro-favorecido', 'cp-filtro-despesa',
    'cp-filtro-empresa', 'cp-filtro-cc', 'cp-filtro-classificacao', 'cp-filtro-grupo']) mkSel(id, ['Todos']);
  mkSel('cp-filtro-tipo', valoresTipo && valoresTipo.length ? valoresTipo : ['Todos']);

  const escrito = {};
  const document = {
    getElementById: (id) => selects[id] || ({
      set textContent(v) { escrito[id] = v; }, get textContent() { return escrito[id]; },
      setAttribute() {},
    }),
  };
  return { document, escrito, selects };
}

function rodar(valoresTipo) {
  const { document, escrito } = montarAmbiente(valoresTipo);
  const comum = extrair('hojeISO') + '\n' + extrair('statusVisual') + '\n'
    + extrair('getMultiValues') + '\n' + extrair('isMultiAll') + '\n'
    + extrair('_cpChaveFiltro') + '\n' + extrair('_cpMesmoConjunto') + '\n'
    + extrairConstLinha('_CARDS_NATUREZA') + '\n'
    + extrair('_cpCardNaturezaAtivoKey') + '\n'
    // Dependencias da regra de tarifa, que virou fonte unica em 2026-09-30 e passou
    // a ser consumida TAMBEM pela tabela. Esquecer de injetar aqui foi o segundo
    // tropeco do mesmo tipo nesta OS; a diferenca e que este estourou ReferenceError
    // alto, porque nao cai dentro de nenhum try/catch.
    + extrairConstLinha('_cpNormTarifa') + '\n'
    + extrair('_cpEhTarifaOuComissao') + '\n'
    + extrair('_cpNormalizarBusca') + '\n';

  // TABELA: aplicarFiltrosCP com stubs neutros para o que nao interessa a esta prova
  // (grupo resolvido vazio, sem termo de busca, sem periodo, blob de busca vazio).
  const filtrados = new Function(
    'document', 'registros', 'CP_LIMIAR_ANO', '_cpPeriodoComitado', '_cpTermoBusca',
    '_cpBlobBusca', '_cpEmpresaDeReg', '_cpGrupoDeReg', 'MAP_CLASS_FILTRO', '_KPI_FILTRO_MAP',
    comum + extrair('aplicarFiltrosCP') + '\nreturn aplicarFiltrosCP(registros);'
  )(document, regs, LIMIAR, { ini: '', fim: '' }, '', new Map(),
    (r) => String(r.empresa || ''), () => ({ grupo: '', conta: '', estado: 'x' }),
    { OPEX: new Set(['Fornecedor Interno', 'Fornecedor Externo']), Cliente: new Set(['Cliente']) }, MAP);

  // CARD: atualizarKPIs sobre o MESMO universo completo (o card nao depende do
  // filtro de Tipo; ele parte de tudo e separa por natureza internamente).
  const amb2 = montarAmbiente(['Todos']);
  // `_cpEhTarifaOuComissao` saiu de DENTRO de `atualizarKPIs` quando virou fonte
  // unica, entao o sandbox do card precisa dela injetada tambem. Mesma funcao que a
  // tabela usa: e isso que garante que os dois lados aplicam a MESMA regra.
  new Function('document', 'fmtBRL', 'CP_LIMIAR_ANO', '_cpPeriodoComitado',
    extrairConstLinha('_cpNormTarifa') + '\n' + extrair('_cpEhTarifaOuComissao') + '\n'
    + extrair('hojeISO') + '\n' + extrair('statusVisual') + '\n' + extrair('atualizarKPIs')
    + '\nreturn atualizarKPIs;'
  )(amb2.document, { format: (n) => Number(n).toFixed(2) }, LIMIAR, { ini: '', fim: '' })(regs);

  return { filtrados, cards: amb2.escrito };
}

// ── A PROVA ────────────────────────────────────────────────────────────────
console.log(`\ndocs no snapshot: ${regs.length}`);
let falhas = 0;

console.log(`\n===== (1) CLICAR NO CARD: somar a tabela tem que fechar com o card =====`);
for (const [key, idCard, rotulo] of CARDS) {
  const conf = MAP[key];
  const { filtrados, cards } = rodar(conf.valores);
  // MUDOU em 2026-09-30, e a mudanca e o ponto: desde que o clique num card tambem
  // esconde tarifa, a soma da TABELA CRUA tem que fechar com o card, sem nenhum
  // desconto feito por este script. A versao anterior descontava a tarifa "de forma
  // declarada" e por isso fechava; o tester mostrou que isso respondia a pergunta
  // errada, porque o diretor soma a COLUNA e nao a coluna menos alguma coisa.
  // Continua valendo o corte de ano, que vive dentro do card e nao no filtro.
  const noRecorte = filtrados.filter(r => String(r.data_vencimento || '') >= LIMIAR);
  const semTarifa = noRecorte;   // sem desconto: a tabela ja nao traz tarifa
  const somaTabela = semTarifa.reduce((s, r) => s + (Number(r.valor_original) || 0), 0);
  const valorCard = Number(String(cards[idCard] ?? '0'));
  const ok = cent(somaTabela) === cent(valorCard);
  if (!ok) falhas++;
  const cancNaTabela = semTarifa.filter(r => /^cancel/i.test(String(r.status || '').trim())).length;
  console.log(`  ${ok ? 'FECHA  ' : '*FALHA*'} ${rotulo.padEnd(26)} card=${brl(valorCard).padStart(18)} tabela=${brl(somaTabela).padStart(18)} linhas=${String(semTarifa.length).padStart(6)} cancelados_exibidos=${cancNaTabela}`);
  if (cancNaTabela > 0) { falhas++; console.log(`      *** a tabela ainda exibe ${cancNaTabela} cancelado(s) com o card ativo`); }
}

console.log(`\n===== (2) SEM card ativo: a tabela CONTINUA mostrando cancelado =====`);
{
  const { filtrados } = rodar(['Todos']);
  const canc = filtrados.filter(r => /^cancel/i.test(String(r.status || '').trim()));
  const ok = canc.length > 0;
  if (!ok) falhas++;
  console.log(`  ${ok ? 'OK     ' : '*FALHA*'} filtro em "Todos": ${filtrados.length} linhas, ${canc.length} cancelado(s) exibido(s)`);
  console.log(`  (esperado: os cancelados APARECEM, porque a exclusao vale so com card de natureza ativo)`);
}

console.log(`\n===== (3) Filtro de Tipo MANUAL igual ao do card: mesmo comportamento =====`);
{
  // Colocar o filtro de Tipo exatamente no conjunto do card Cliente, "a mao", tem
  // que dar o MESMO resultado do clique: e a mesma condicao que acende o card.
  const { filtrados } = rodar(['Cliente']);
  const canc = filtrados.filter(r => /^cancel/i.test(String(r.status || '').trim())).length;
  console.log(`  filtro Tipo = ["Cliente"] a mao: ${filtrados.length} linhas, ${canc} cancelado(s)`);
  console.log(`  (coerente por desenho: a condicao e DERIVADA do filtro, entao card aceso e`);
  console.log(`   tabela filtrada andam sempre juntos, sem estado guardado para dessincronizar)`);
}

console.log(`\n===== VEREDITO: ${falhas === 0 ? 'PASSA' : falhas + ' FALHA(S)'} =====`);
process.exit(falhas === 0 ? 0 : 1);
