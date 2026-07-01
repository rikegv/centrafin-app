/**
 * test-firestore-rules.cjs — F0-04
 *
 * Suíte mínima de testes de firestore.rules, rodando contra o Firebase Emulator
 * (Firestore) local — nunca toca o projeto real `centra-fin`.
 *
 * Pré-requisito: emulador rodando (`firebase emulators:start --only firestore`).
 *
 * Casos cobertos (mínimo exigido pelo DoD do CLAUDE.md):
 *   1. Admin escreve em Lancamentos — deve suceder.
 *   2. Perfil "consulta" é bloqueado na escrita em Lancamentos — deve falhar.
 *   3. hasMenu('contas_receber') libera leitura de Lancamentos — deve suceder.
 *   4. Usuário sem o menu correspondente é negado na leitura — deve falhar.
 *
 * Uso: node scripts/test-firestore-rules.cjs
 * Saída: exit 0 = todos os casos passaram. exit 1 = algum caso falhou.
 */

const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc } = require('firebase/firestore');

const RULES_PATH = path.join(process.cwd(), 'firestore.rules');
const PROJECT_ID = 'centrafin-rules-test'; // isolado do projeto real "centra-fin"

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`  OK   - ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL - ${name}`);
    console.log(`         ${e.message}`);
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

  // Seed de dados de apoio (bypassando as regras — só para preparar o cenário)
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'Usuarios', 'admin@teste.com'), {
      perfil: 'master',
      menus_permitidos: [],
    });
    await setDoc(doc(db, 'Usuarios', 'consulta@teste.com'), {
      perfil: 'consulta',
      menus_permitidos: ['contas_receber'],
    });
    await setDoc(doc(db, 'Usuarios', 'comCR@teste.com'), {
      perfil: 'comum',
      menus_permitidos: ['contas_receber'],
    });
    await setDoc(doc(db, 'Usuarios', 'semMenu@teste.com'), {
      perfil: 'comum',
      menus_permitidos: [],
    });
    await setDoc(doc(db, 'Lancamentos', 'doc1'), {
      valor: 1000,
      descricao: 'lancamento de teste',
    });
  });

  console.log('\nRodando testes de firestore.rules (emulador local)...\n');

  await check('Admin escreve em Lancamentos (deve suceder)', async () => {
    const ctx = testEnv.authenticatedContext('admin@teste.com', {
      email: 'admin@teste.com',
    });
    const db = ctx.firestore();
    await assertSucceeds(
      setDoc(doc(db, 'Lancamentos', 'doc-admin'), { valor: 500 })
    );
  });

  await check('Perfil consulta é BLOQUEADO na escrita em Lancamentos (deve falhar)', async () => {
    const ctx = testEnv.authenticatedContext('consulta@teste.com', {
      email: 'consulta@teste.com',
    });
    const db = ctx.firestore();
    await assertFails(
      setDoc(doc(db, 'Lancamentos', 'doc-consulta'), { valor: 999 })
    );
  });

  await check("hasMenu('contas_receber') libera leitura de Lancamentos (deve suceder)", async () => {
    const ctx = testEnv.authenticatedContext('comCR@teste.com', {
      email: 'comCR@teste.com',
    });
    const db = ctx.firestore();
    await assertSucceeds(getDoc(doc(db, 'Lancamentos', 'doc1')));
  });

  await check('Usuário sem o menu é NEGADO na leitura de Lancamentos (deve falhar)', async () => {
    const ctx = testEnv.authenticatedContext('semMenu@teste.com', {
      email: 'semMenu@teste.com',
    });
    const db = ctx.firestore();
    await assertFails(getDoc(doc(db, 'Lancamentos', 'doc1')));
  });

  await testEnv.cleanup();

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('ERRO ao rodar suite:', e);
  process.exit(1);
});
