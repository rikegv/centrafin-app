/**
 * test-sistema-aprovacoes.cjs
 * Auditoria do Sistema de Aprovacoes em Dois Niveis (feature/sistema-aprovacoes).
 * Pré-requisito: firebase emulators:start --only firestore
 * Uso: node scripts/test-sistema-aprovacoes.cjs
 */

'use strict';
const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const { doc, setDoc, addDoc, updateDoc, deleteDoc, collection } = require('firebase/firestore');

const RULES_PATH = path.join(process.cwd(), 'firestore.rules');
const PROJECT_ID = 'centrafin-aprov-test';

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
    console.error('ERRO: firestore.rules nao encontrado.');
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

  // Seed — bypassando regras para preparar estado inicial
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db,'Usuarios','super@t.com'),    {perfil:'super_admin',email:'super@t.com',menus_permitidos:[]});
    await setDoc(doc(db,'Usuarios','master@t.com'),   {perfil:'master',email:'master@t.com',menus_permitidos:[]});
    await setDoc(doc(db,'Usuarios','consulta@t.com'), {perfil:'consulta',email:'consulta@t.com',menus_permitidos:['aprovacoes']});
    await setDoc(doc(db,'Usuarios','comum@t.com'),    {perfil:'comum',email:'comum@t.com',menus_permitidos:['dashboard_master']});
    await setDoc(doc(db,'CP_SolicitacoesAprovacao','sol-01'), {tipo_operacao:'CREATE',status:'Pendente',solicitado_por_email:'master@t.com'});
    await setDoc(doc(db,'CP_SolicitacoesAprovacao','sol-02'), {tipo_operacao:'DELETE',status:'Pendente',solicitado_por_email:'master@t.com'});
    await setDoc(doc(db,'Lancamentos','lanc-01'),     {valor:100});
    await setDoc(doc(db,'MetasFinanceiras','meta-01'),{total:1000});
    await setDoc(doc(db,'Base_Empresas','emp-01'),    {nome_fantasia:'X'});
    await setDoc(doc(db,'CustosFolha','cf-01'),       {valor:300});
    await setDoc(doc(db,'ContasAPagar','cap-01'),     {valor:200});
  });

  console.log('');
  console.log('=== TESTES: Sistema de Aprovacoes em Dois Niveis ===');
  console.log('');
  console.log('--- G1: CREATE em CP_SolicitacoesAprovacao ---');

  await check('[G1-1] master cria sol. com email correto e status Pendente [suceder]', async () => {
    const ctx = testEnv.authenticatedContext('master@t.com', {email:'master@t.com'});
    await assertSucceeds(addDoc(collection(ctx.firestore(),'CP_SolicitacoesAprovacao'), {
      tipo_operacao:'CREATE', colecao_alvo:'Fornecedores', status:'Pendente',
      solicitado_por:'Master', solicitado_por_email:'master@t.com',
    }));
  });

  await check('[G1-2] master NAO cria sol. com email de outro usuario [falhar]', async () => {
    const ctx = testEnv.authenticatedContext('master@t.com', {email:'master@t.com'});
    await assertFails(addDoc(collection(ctx.firestore(),'CP_SolicitacoesAprovacao'), {
      tipo_operacao:'CREATE', colecao_alvo:'Fornecedores', status:'Pendente',
      solicitado_por:'Outro', solicitado_por_email:'outro@t.com',
    }));
  });

  await check('[G1-3] master NAO cria sol. com status != Pendente [falhar]', async () => {
    const ctx = testEnv.authenticatedContext('master@t.com', {email:'master@t.com'});
    await assertFails(addDoc(collection(ctx.firestore(),'CP_SolicitacoesAprovacao'), {
      tipo_operacao:'CREATE', colecao_alvo:'Fornecedores', status:'Aprovado',
      solicitado_por:'Master', solicitado_por_email:'master@t.com',
    }));
  });

  console.log('--- G2: UPDATE/DELETE master (deve bloquear) ---');

  await check('[G2-1] master NAO faz update/aprovar em CP_SolicitacoesAprovacao [falhar]', async () => {
    const ctx = testEnv.authenticatedContext('master@t.com', {email:'master@t.com'});
    await assertFails(updateDoc(doc(ctx.firestore(),'CP_SolicitacoesAprovacao','sol-01'), {status:'Aprovado'}));
  });

  await check('[G2-2] master NAO faz delete em CP_SolicitacoesAprovacao [falhar]', async () => {
    const ctx = testEnv.authenticatedContext('master@t.com', {email:'master@t.com'});
    await assertFails(deleteDoc(doc(ctx.firestore(),'CP_SolicitacoesAprovacao','sol-01')));
  });

  console.log('--- G3: super_admin em CP_SolicitacoesAprovacao ---');

  await check('[G3-1] super_admin cria solicitacao [suceder]', async () => {
    const ctx = testEnv.authenticatedContext('super@t.com', {email:'super@t.com'});
    await assertSucceeds(addDoc(collection(ctx.firestore(),'CP_SolicitacoesAprovacao'), {
      tipo_operacao:'UPDATE', colecao_alvo:'Fornecedores', status:'Pendente',
      solicitado_por:'Super', solicitado_por_email:'super@t.com',
    }));
  });

  await check('[G3-2] super_admin faz update/aprovar [suceder]', async () => {
    const ctx = testEnv.authenticatedContext('super@t.com', {email:'super@t.com'});
    await assertSucceeds(updateDoc(doc(ctx.firestore(),'CP_SolicitacoesAprovacao','sol-01'), {
      status:'Aprovado', aprovado_por_email:'super@t.com',
    }));
  });

  await check('[G3-3] super_admin faz delete [suceder]', async () => {
    const ctx = testEnv.authenticatedContext('super@t.com', {email:'super@t.com'});
    await assertSucceeds(deleteDoc(doc(ctx.firestore(),'CP_SolicitacoesAprovacao','sol-02')));
  });

  console.log('--- G4: consulta e comum sem menu ---');

  await check('[G4-1] consulta NAO cria sol. (isConsulta bloqueia) [falhar]', async () => {
    const ctx = testEnv.authenticatedContext('consulta@t.com', {email:'consulta@t.com'});
    await assertFails(addDoc(collection(ctx.firestore(),'CP_SolicitacoesAprovacao'), {
      tipo_operacao:'CREATE', status:'Pendente',
      solicitado_por_email:'consulta@t.com',
    }));
  });

  await check('[G4-2] comum sem menu NAO cria sol. [falhar]', async () => {
    const ctx = testEnv.authenticatedContext('comum@t.com', {email:'comum@t.com'});
    await assertFails(addDoc(collection(ctx.firestore(),'CP_SolicitacoesAprovacao'), {
      tipo_operacao:'CREATE', status:'Pendente',
      solicitado_por_email:'comum@t.com',
    }));
  });

  console.log('--- G5: colecoes reais inalteradas ---');

  await check('[G5-1] master escreve em Lancamentos (isAdmin OK) [suceder]', async () => {
    const ctx = testEnv.authenticatedContext('master@t.com', {email:'master@t.com'});
    await assertSucceeds(setDoc(doc(ctx.firestore(),'Lancamentos','lanc-m2'), {valor:500}));
  });

  await check('[G5-2] master escreve em MetasFinanceiras (isAdmin OK) [suceder]', async () => {
    const ctx = testEnv.authenticatedContext('master@t.com', {email:'master@t.com'});
    await assertSucceeds(setDoc(doc(ctx.firestore(),'MetasFinanceiras','meta-m2'), {total:9999}));
  });

  await check('[G5-3] master escreve em Base_Empresas (isAdmin OK) [suceder]', async () => {
    const ctx = testEnv.authenticatedContext('master@t.com', {email:'master@t.com'});
    await assertSucceeds(setDoc(doc(ctx.firestore(),'Base_Empresas','emp-m2'), {nome_fantasia:'X'}));
  });

  await check('[G5-4] master escreve em CustosFolha (isAdmin OK) [suceder]', async () => {
    const ctx = testEnv.authenticatedContext('master@t.com', {email:'master@t.com'});
    await assertSucceeds(setDoc(doc(ctx.firestore(),'CustosFolha','cf-m2'), {valor:777}));
  });

  // NOTA: hasMenu() em firestore.rules retorna true para 'master' e 'super_admin'
  // incondicionalmente — portanto master CONSEGUE escrever em ContasAPagar mesmo sem
  // o menu explicitamente listado. Isso e o comportamento PRE-EXISTENTE (nao mudou
  // nesta feature). O teste abaixo verifica que a rule de ContasAPagar nao foi
  // alterada para bloquear master, o que seria regressao.
  await check('[G5-5] master CONSEGUE escrever em ContasAPagar (hasMenu inclui master) [suceder]', async () => {
    const ctx = testEnv.authenticatedContext('master@t.com', {email:'master@t.com'});
    await assertSucceeds(setDoc(doc(ctx.firestore(),'ContasAPagar','cap-m2'), {valor:500}));
  });

  await testEnv.cleanup();

  console.log('');
  console.log('=== Resultado: ' + passed + ' passaram, ' + failed + ' falharam. ===');
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('ERRO fatal:', e);
  process.exit(1);
});
