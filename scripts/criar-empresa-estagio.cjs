#!/usr/bin/env node
/**
 * OS-CP-PACOTE-ONDAS-01 / FRENTE 3 (Onda 3)
 * Cria a empresa ESTAGIO em /Base_Empresas, por decisao do diretor (2026-09-29).
 *
 * MOTIVO: o diretor declarou 4 empresas alocaveis (NEAT, SOULAN ADM,
 * SOULAN CONSULTORIA, ESTAGIO) e so 3 existiam no cadastro. Sem esta, o seletor
 * obrigatorio de empresa da importacao nao consegue oferecer as 4.
 *
 * DRY-RUN POR PADRAO. Aplica so com --apply, e apenas DEPOIS de o diretor conferir
 * a lista do dry-run (regra da secao 7 da constituicao).
 *
 * NUNCA APAGA NADA. Cria um documento novo; se o documento ja existir, ABSTEM-SE
 * (nao sobrescreve cadastro existente, que pode ter campos que este script nao
 * conhece).
 *
 * BACKUP: grava o estado ANTERIOR da colecao inteira em
 * scripts/backup-empresa-estagio-<stamp>.json, que o `firebase.json` e o
 * `.gitignore` ja excluem (dado real em pasta servida pelo Hosting ja causou
 * incidente registrado).
 *
 * USO:
 *   GOOGLE_APPLICATION_CREDENTIALS=<adc.json> node scripts/criar-empresa-estagio.cjs
 *   GOOGLE_APPLICATION_CREDENTIALS=<adc.json> node scripts/criar-empresa-estagio.cjs --apply
 */
const fs = require('fs');
const path = require('path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const APPLY = process.argv.includes('--apply');
const COLECAO = 'Base_Empresas';
const DOC_ID = 'ESTAGIO';            // sem acento, como os demais ids do cadastro
const NOME = 'ESTÁGIO';              // rotulo exibido, com acento
const ESPERADAS = ['NEAT', 'SOULAN ADM', 'SOULAN CONSULTORIA', 'ESTÁGIO'];

initializeApp({ credential: applicationDefault(), projectId: 'centra-fin' });
const db = getFirestore();

const rotulo = (v) => String(v.nome_fantasia || v.nome || '').trim();

(async () => {
  console.log(`\n=== ${APPLY ? 'APLICANDO' : 'DRY-RUN (nada sera gravado)'} ===`);

  const snap = await db.collection(COLECAO).get();
  const atual = snap.docs.map((d) => ({ _id: d.id, ...d.data() }));

  console.log(`\nESTADO ATUAL de /${COLECAO} (${atual.length} docs):`);
  for (const d of atual) {
    const r = rotulo(d);
    const valida = !!String(d.nome || '').trim();
    console.log(`  id=${d._id.padEnd(24)} rotulo=${JSON.stringify(r).padEnd(26)} ` +
      `${valida ? 'entra no seletor' : 'FORA do seletor (sem campo nome)'}`);
  }

  const jaExiste = atual.find((d) => d._id === DOC_ID
    || String(d.nome || '').trim().toUpperCase() === NOME.toUpperCase());
  if (jaExiste) {
    console.log(`\nABSTENDO-SE: ja existe documento para ${NOME} (id=${jaExiste._id}). ` +
      `Nada a fazer, e este script NAO sobrescreve cadastro existente.`);
    process.exit(0);
  }

  console.log(`\nO QUE SERIA CRIADO, 1 documento:`);
  const payload = {
    nome: NOME,
    data_cadastro: '<serverTimestamp>',
    criado_por: 'OS-CP-PACOTE-ONDAS-01 (decisao do diretor 2026-09-29)',
  };
  console.log(`  /${COLECAO}/${DOC_ID}`);
  console.log(`  ${JSON.stringify(payload, null, 2).split('\n').join('\n  ')}`);

  console.log(`\nDEPOIS, o seletor da importacao ofereceria (so quem tem campo 'nome'):`);
  const depois = atual.filter((d) => String(d.nome || '').trim()).map(rotulo).concat([NOME])
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  for (const n of depois) console.log(`  - ${n}`);
  const faltando = ESPERADAS.filter((e) => !depois.some((d) => d.toUpperCase() === e.toUpperCase()));
  console.log(faltando.length
    ? `\nATENCAO: continuariam faltando: ${faltando.join(', ')}`
    : `\nOK: as 4 empresas que o diretor declarou ficam disponiveis.`);

  if (!APPLY) {
    console.log(`\nDRY-RUN concluido. NADA foi gravado. Rode com --apply depois da conferencia.`);
    process.exit(0);
  }

  // BACKUP do estado anterior, fora da pasta servida pelo Hosting.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const arqBackup = path.join(__dirname, `backup-empresa-estagio-${stamp}.json`);
  fs.writeFileSync(arqBackup, JSON.stringify({ colecao: COLECAO, capturado_em: stamp, docs: atual }, null, 2));
  console.log(`\nbackup do estado anterior: ${arqBackup}`);

  // Pre-condicao reconferida IMEDIATAMENTE antes de gravar (a base pode ter
  // mudado entre o dry-run e o apply). Nao sendo verdadeira, abstem-se.
  const ref = db.collection(COLECAO).doc(DOC_ID);
  const cheque = await ref.get();
  if (cheque.exists) {
    console.log(`ABSTENDO-SE: o documento ${DOC_ID} passou a existir desde o dry-run. Nada gravado.`);
    process.exit(0);
  }
  await ref.create({
    nome: NOME,
    data_cadastro: FieldValue.serverTimestamp(),
    criado_por: 'OS-CP-PACOTE-ONDAS-01 (decisao do diretor 2026-09-29)',
  });
  console.log(`CRIADO: /${COLECAO}/${DOC_ID} com nome="${NOME}".`);

  const conf = await db.collection(COLECAO).get();
  const validos = conf.docs.map((d) => ({ _id: d.id, ...d.data() }))
    .filter((d) => String(d.nome || '').trim()).map(rotulo)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  console.log(`\nCONFERENCIA pos-escrita, ${conf.size} docs na colecao, ${validos.length} no seletor:`);
  for (const n of validos) console.log(`  - ${n}`);
  process.exit(0);
})().catch((e) => { console.error('ERRO:', e && e.message ? e.message : e); process.exit(1); });
