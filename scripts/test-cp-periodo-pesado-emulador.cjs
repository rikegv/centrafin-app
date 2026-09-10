/**
 * test-cp-count-emulador.cjs
 * -----------------------------------------------------------------------
 * Valida getCountFromServer contra o Firebase Emulator LOCAL (nunca aponta
 * pro projeto real centra-fin). Cobre os itens 17 e 20 do checklist do
 * arquiteto (OS-CP-FILTROS-BASE-COMPLETA-01):
 *   - O emulador local suporta agregacao COUNT? (o engenheiro nao conseguiu
 *     validar isso -- prioridade maxima do testador).
 *   - Falha de permissao na contagem (usuario sem o menu) degrada sem
 *     travar: cai no caminho de erro do try/catch do handler real.
 *   - Perfil consulta com o menu consegue contar (leitura), sem abrir
 *     acesso de ESCRITA nova.
 *
 * Usa @firebase/rules-unit-testing (initializeTestEnvironment) com as
 * firestore.rules REAIS do repo, isolado no projectId de teste.
 */
const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const { doc, setDoc, collection, query, where, getCountFromServer } = require('firebase/firestore');

const RULES_PATH = path.join('C:/Users/Henrique/Desktop/centrafin-app', 'firestore.rules');
const PROJECT_ID = 'centrafin-rules-test';

let ok = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); console.log('  OK   - ' + name); ok++; }
  catch (e) { console.log('  FAIL - ' + name); console.log('         ' + e.message); fail++; }
}

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'Usuarios', 'comMenu@teste.com'), {
      perfil: 'comum', menus_permitidos: { gerenciador_contas_pagar: true },
    });
    await setDoc(doc(db, 'Usuarios', 'semMenu@teste.com'), {
      perfil: 'comum', menus_permitidos: {},
    });
    await setDoc(doc(db, 'Usuarios', 'consulta@teste.com'), {
      perfil: 'consulta', menus_permitidos: { gerenciador_contas_pagar: true },
    });
    for (let i = 0; i < 23; i++) {
      await setDoc(doc(db, 'ContasAPagar', 'CP-' + i), {
        fornecedor: 'Fornecedor Teste', valor: 100 + i,
        data_vencimento: '2026-0' + (1 + (i % 9)) + '-15',
        status: 'pendente',
      });
    }
  });

  console.log('\nRodando testes de getCountFromServer contra o emulador local...\n');

  await check('Emulador local SUPORTA getCountFromServer (agregacao) -- usuario com hasMenu', async () => {
    const ctx = testEnv.authenticatedContext('comMenu@teste.com', { email: 'comMenu@teste.com' });
    const db = ctx.firestore();
    const snap = await getCountFromServer(collection(db, 'ContasAPagar'));
    if (snap.data().count !== 23) throw new Error('Esperava count=23, obtive ' + snap.data().count);
  });

  await check('getCountFromServer respeita constraints where (mesmo padrao de _cpConstraintsRange)', async () => {
    const ctx = testEnv.authenticatedContext('comMenu@teste.com', { email: 'comMenu@teste.com' });
    const db = ctx.firestore();
    const q = query(collection(db, 'ContasAPagar'), where('data_vencimento', '>=', '2026-03-01'), where('data_vencimento', '<=', '2026-03-31'));
    const snap = await getCountFromServer(q);
    // i%9+1 === 3 -> i in {2, 11, 20} dentro de 0..22
    if (snap.data().count !== 3) throw new Error('Esperava count=3 para Mar/2026, obtive ' + snap.data().count);
  });

  await check('Perfil CONSULTA (com o menu) consegue contar -- leitura normal, nao abre escrita nova', async () => {
    const ctx = testEnv.authenticatedContext('consulta@teste.com', { email: 'consulta@teste.com' });
    const db = ctx.firestore();
    const snap = await getCountFromServer(collection(db, 'ContasAPagar'));
    if (snap.data().count !== 23) throw new Error('Esperava count=23, obtive ' + snap.data().count);
    // Confirma que a mesma sessao NAO pode escrever (defesa em profundidade
    // do perfil consulta) -- contar nao abriu nenhum acesso novo.
    await assertFails(setDoc(doc(db, 'ContasAPagar', 'CP-novo-consulta'), { valor: 1 }));
  });

  await check('Usuario SEM o menu: getCountFromServer FALHA com permission-denied (nao trava, e o caminho de erro do handler real)', async () => {
    const ctx = testEnv.authenticatedContext('semMenu@teste.com', { email: 'semMenu@teste.com' });
    const db = ctx.firestore();
    let caiuNoCatch = false;
    let codigo = null;
    try {
      await getCountFromServer(collection(db, 'ContasAPagar'));
    } catch (err) {
      caiuNoCatch = true;
      codigo = err.code || err.message;
    }
    if (!caiuNoCatch) throw new Error('getCountFromServer deveria ter rejeitado (permission-denied) e nao rejeitou');
    console.log('         (degradacao confirmada -- codigo do erro: ' + codigo + ')');
  });

  await testEnv.cleanup();
  console.log('\nResultado: ' + ok + ' passaram, ' + fail + ' falharam.\n');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('ERRO ao rodar suite:', e); process.exit(1); });
