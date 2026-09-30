/**
 * test-rules-pacote-ondas.cjs
 * OS-CP-PACOTE-ONDAS-01 (Onda 4) — Grupos de Despesa em 3 níveis.
 *
 * Valida as tres colecoes NOVAS de firestore.rules (CP_Grupos_Contas,
 * CP_Contas_Despesa, CP_Tipos_Despesa) e faz REGRESSAO nas colecoes vizinhas
 * que a mudanca poderia ter quebrado (ContasAPagar, AreasContasPagar,
 * CP_Base_Despesas).
 *
 * Contrato esperado das tres colecoes novas (padrao BASE DE REFERENCIA,
 * identico a AreasContasPagar / CP_Gestores):
 *   allow read:  request.auth != null
 *   allow write: request.auth != null && isAdmin() && !isConsulta()
 *
 * Pre-requisito: emulador do Firestore rodando na porta 8080
 *   firebase emulators:start --only firestore
 * Uso: node scripts/test-rules-pacote-ondas.cjs
 * Saida: exit 0 = todos passaram. exit 1 = algum falhou.
 *
 * Molde: scripts/test-firestore-rules.cjs (mesma forma de subir o ambiente,
 * mesmo estilo de assercao e de saida).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc } = require('firebase/firestore');

const RULES_PATH = path.join(process.cwd(), 'firestore.rules');
const PROJECT_ID = 'centrafin-ondas-test'; // isolado do projeto real "centra-fin"

// As tres colecoes novas da Onda 4. O contrato e o MESMO para as tres, entao a
// bateria de 5 casos roda em laco — evita 15 blocos copiados e divergentes.
const COLECOES_NOVAS = [
  'CP_Grupos_Contas',
  'CP_Contas_Despesa',
  'CP_Tipos_Despesa',
];

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log('  OK   - ' + name);
    passed++;
  } catch (e) {
    console.log('  FAIL - ' + name);
    console.log('         ' + e.message);
    failed++;
  }
}

async function main() {
  if (!fs.existsSync(RULES_PATH)) {
    console.error('ERRO: firestore.rules nao encontrado na pasta atual.');
    process.exit(1);
  }

  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  // Seed de apoio (bypassando as regras — só prepara o cenário).
  // Sem dado pessoal: e-mails sinteticos de teste, nenhum CPF/telefone.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    // --- usuarios ---
    await setDoc(doc(db, 'Usuarios', 'master@t.com'), {
      perfil: 'master', menus_permitidos: [],
    });
    await setDoc(doc(db, 'Usuarios', 'super@t.com'), {
      perfil: 'super_admin', menus_permitidos: [],
    });
    // Comum SEM menu nenhum: prova que a leitura das bases de referencia e
    // aberta a qualquer autenticado, e que a escrita e negada.
    await setDoc(doc(db, 'Usuarios', 'comum@t.com'), {
      perfil: 'comum', menus_permitidos: [],
    });
    // Consulta COM o menu operacional: prova que isConsulta() vence o menu.
    await setDoc(doc(db, 'Usuarios', 'consulta@t.com'), {
      perfil: 'consulta', menus_permitidos: ['gerenciador_contas_pagar', 'contas_pagar'],
    });
    // Operacionais das colecoes de regressao.
    await setDoc(doc(db, 'Usuarios', 'gerCP@t.com'), {
      perfil: 'comum', menus_permitidos: ['gerenciador_contas_pagar'],
    });
    await setDoc(doc(db, 'Usuarios', 'cpLegado@t.com'), {
      perfil: 'comum', menus_permitidos: ['contas_pagar'],
    });

    // --- docs existentes para os casos de LEITURA ---
    for (const col of COLECOES_NOVAS) {
      await setDoc(doc(db, col, 'seed-01'), { nome: 'Seed', ordem: 1 });
    }
    await setDoc(doc(db, 'ContasAPagar', 'cap-seed'), { valor: 200 });
    await setDoc(doc(db, 'AreasContasPagar', 'area-seed'), { nome: 'TI' });
    await setDoc(doc(db, 'CP_Base_Despesas', 'desp-seed'), { despesa: 'ALUGUEL' });
    await setDoc(doc(db, 'Metadados', 'CP_Catalogo_Categorias'), { tipos: [] });
  });

  const ctxDe = (email) =>
    testEnv.authenticatedContext(email, { email }).firestore();
  const ctxAnon = () => testEnv.unauthenticatedContext().firestore();

  console.log('');
  console.log('=== OS-CP-PACOTE-ONDAS-01 / Onda 4 — testes de firestore.rules ===');
  console.log('');

  // ------------------------------------------------------------------
  // BLOCO A — as tres colecoes NOVAS (5 casos cada)
  // ------------------------------------------------------------------
  for (const col of COLECOES_NOVAS) {
    console.log('--- ' + col + ' (colecao nova) ---');

    await check('[' + col + '-1a] admin (master) LE [suceder]', async () => {
      await assertSucceeds(getDoc(doc(ctxDe('master@t.com'), col, 'seed-01')));
    });

    await check('[' + col + '-1b] admin (master) ESCREVE [suceder]', async () => {
      await assertSucceeds(
        setDoc(doc(ctxDe('master@t.com'), col, 'novo-master'), { nome: 'Grupo A' })
      );
    });

    await check('[' + col + '-1c] admin (super_admin) ESCREVE [suceder]', async () => {
      await assertSucceeds(
        setDoc(doc(ctxDe('super@t.com'), col, 'novo-super'), { nome: 'Grupo B' })
      );
    });

    await check('[' + col + '-2] autenticado comum SEM menu nenhum LE [suceder]', async () => {
      await assertSucceeds(getDoc(doc(ctxDe('comum@t.com'), col, 'seed-01')));
    });

    await check('[' + col + '-3] autenticado comum ESCREVE [falhar]', async () => {
      await assertFails(
        setDoc(doc(ctxDe('comum@t.com'), col, 'nao-devia'), { nome: 'X' })
      );
    });

    await check('[' + col + '-4] perfil consulta ESCREVE [falhar]', async () => {
      await assertFails(
        setDoc(doc(ctxDe('consulta@t.com'), col, 'nao-devia-2'), { nome: 'Y' })
      );
    });

    await check('[' + col + '-5a] NAO autenticado LE [falhar]', async () => {
      await assertFails(getDoc(doc(ctxAnon(), col, 'seed-01')));
    });

    await check('[' + col + '-5b] NAO autenticado ESCREVE [falhar]', async () => {
      await assertFails(setDoc(doc(ctxAnon(), col, 'anon'), { nome: 'Z' }));
    });

    console.log('');
  }

  // ------------------------------------------------------------------
  // BLOCO B — REGRESSAO: o que ja funcionava continua igual.
  // O molde test-firestore-rules.cjs cobre Lancamentos (admin escreve,
  // consulta bloqueado, hasMenu le, sem-menu negado), entao NAO duplico
  // Lancamentos aqui. Cubro as tres colecoes pedidas no briefing, que o
  // molde nao cobre.
  // ------------------------------------------------------------------
  console.log('--- REGRESSAO: ContasAPagar ---');

  await check('[REG-CAP-1] hasMenu(contas_pagar) LE ContasAPagar [suceder]', async () => {
    await assertSucceeds(getDoc(doc(ctxDe('cpLegado@t.com'), 'ContasAPagar', 'cap-seed')));
  });

  await check('[REG-CAP-2] hasMenu(gerenciador_contas_pagar) ESCREVE ContasAPagar [suceder]', async () => {
    await assertSucceeds(
      setDoc(doc(ctxDe('gerCP@t.com'), 'ContasAPagar', 'cap-gercp'), { valor: 1 })
    );
  });

  await check('[REG-CAP-3] comum SEM menu LE ContasAPagar [falhar]', async () => {
    await assertFails(getDoc(doc(ctxDe('comum@t.com'), 'ContasAPagar', 'cap-seed')));
  });

  await check('[REG-CAP-4] consulta COM o menu ESCREVE ContasAPagar [falhar]', async () => {
    await assertFails(
      setDoc(doc(ctxDe('consulta@t.com'), 'ContasAPagar', 'cap-consulta'), { valor: 1 })
    );
  });

  console.log('');
  console.log('--- REGRESSAO: AreasContasPagar ---');

  await check('[REG-AREA-1] autenticado comum LE AreasContasPagar [suceder]', async () => {
    await assertSucceeds(getDoc(doc(ctxDe('comum@t.com'), 'AreasContasPagar', 'area-seed')));
  });

  await check('[REG-AREA-2] admin ESCREVE AreasContasPagar [suceder]', async () => {
    await assertSucceeds(
      setDoc(doc(ctxDe('master@t.com'), 'AreasContasPagar', 'area-nova'), { nome: 'RH' })
    );
  });

  await check('[REG-AREA-3] comum ESCREVE AreasContasPagar [falhar]', async () => {
    await assertFails(
      setDoc(doc(ctxDe('comum@t.com'), 'AreasContasPagar', 'area-x'), { nome: 'X' })
    );
  });

  console.log('');
  console.log('--- REGRESSAO: CP_Base_Despesas ---');

  await check('[REG-DESP-1] hasMenu(gerenciador_contas_pagar) LE CP_Base_Despesas [suceder]', async () => {
    await assertSucceeds(getDoc(doc(ctxDe('gerCP@t.com'), 'CP_Base_Despesas', 'desp-seed')));
  });

  await check('[REG-DESP-2] hasMenu(gerenciador_contas_pagar) ESCREVE CP_Base_Despesas [suceder]', async () => {
    await assertSucceeds(
      setDoc(doc(ctxDe('gerCP@t.com'), 'CP_Base_Despesas', 'desp-nova'), { despesa: 'AGUA' })
    );
  });

  await check('[REG-DESP-3] comum SEM menu LE CP_Base_Despesas [falhar]', async () => {
    await assertFails(getDoc(doc(ctxDe('comum@t.com'), 'CP_Base_Despesas', 'desp-seed')));
  });

  await check('[REG-DESP-4] consulta COM o menu ESCREVE CP_Base_Despesas [falhar]', async () => {
    await assertFails(
      setDoc(doc(ctxDe('consulta@t.com'), 'CP_Base_Despesas', 'desp-c'), { despesa: 'X' })
    );
  });

  console.log('');
  console.log('--- Metadados: o doc de catalogo da Onda 4 ja esta coberto? ---');

  await check('[META-1] hasMenu(gerenciador_contas_pagar) ESCREVE Metadados/CP_Catalogo_Categorias [suceder]', async () => {
    await assertSucceeds(
      setDoc(doc(ctxDe('gerCP@t.com'), 'Metadados', 'CP_Catalogo_Categorias'), { tipos: ['A'] })
    );
  });

  await check('[META-2] admin ESCREVE Metadados/CP_Catalogo_Categorias [suceder]', async () => {
    await assertSucceeds(
      setDoc(doc(ctxDe('master@t.com'), 'Metadados', 'CP_Catalogo_Categorias'), { tipos: ['B'] })
    );
  });

  await check('[META-3] autenticado comum LE Metadados/CP_Catalogo_Categorias [suceder]', async () => {
    await assertSucceeds(getDoc(doc(ctxDe('comum@t.com'), 'Metadados', 'CP_Catalogo_Categorias')));
  });

  await check('[META-4] comum SEM menu ESCREVE Metadados [falhar]', async () => {
    await assertFails(
      setDoc(doc(ctxDe('comum@t.com'), 'Metadados', 'CP_Catalogo_Categorias'), { tipos: [] })
    );
  });

  await testEnv.cleanup();

  console.log('');
  console.log('Resultado: ' + passed + ' passaram, ' + failed + ' falharam. (total ' + (passed + failed) + ')');
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('ERRO ao rodar suite:', e);
  process.exit(1);
});
