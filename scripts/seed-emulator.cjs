// scripts/seed-emulator.cjs
// Popula o Firebase Emulator com dados de teste para validacao visual
// do Sistema de Aprovacoes em Dois Niveis.
// Uso: node scripts/seed-emulator.cjs

const AUTH_URL = 'http://localhost:9099';
const FIRESTORE_URL = 'http://localhost:8080';
const PROJECT_ID = 'centra-fin';

async function criarUsuarioAuth(email, password) {
    const res = await fetch(`${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    const data = await res.json();
    if (data.error) {
        if (data.error.message === 'EMAIL_EXISTS') {
            console.log(`  Auth: ${email} já existe (OK)`);
            return data;
        }
        throw new Error(`Auth error for ${email}: ${data.error.message}`);
    }
    console.log(`  Auth: ${email} criado (uid: ${data.localId})`);
    return data;
}

async function criarDocFirestore(colecao, docId, campos) {
    const fields = {};
    for (const [k, v] of Object.entries(campos)) {
        if (v === null) fields[k] = { nullValue: null };
        else if (typeof v === 'number') fields[k] = { doubleValue: v };
        else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
        else if (Array.isArray(v)) fields[k] = { arrayValue: { values: v.map(i => ({ stringValue: String(i) })) } };
        else if (typeof v === 'object') {
            // Map value
            const mapFields = {};
            for (const [mk, mv] of Object.entries(v)) {
                if (typeof mv === 'string') mapFields[mk] = { stringValue: mv };
                else if (typeof mv === 'boolean') mapFields[mk] = { booleanValue: mv };
            }
            fields[k] = { mapValue: { fields: mapFields } };
        }
        else fields[k] = { stringValue: String(v) };
    }

    const url = `${FIRESTORE_URL}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${colecao}/${docId}`;
    const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer owner' },
        body: JSON.stringify({ fields })
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Firestore error: ${colecao}/${docId} — ${txt}`);
    }
    console.log(`  Firestore: ${colecao}/${docId} criado`);
}

async function main() {
    console.log('\n=== Seed do Emulador — Sistema de Aprovacoes ===\n');

    // 1. Criar usuarios Auth
    console.log('1. Criando usuarios Auth...');
    await criarUsuarioAuth('master@teste.com', 'teste123');
    await criarUsuarioAuth('superadmin@teste.com', 'teste123');

    // 2. Criar docs de usuario no Firestore (perfis)
    console.log('\n2. Criando perfis de usuario...');
    await criarDocFirestore('Usuarios', 'master@teste.com', {
        nome: 'Master Teste',
        email: 'master@teste.com',
        perfil: 'master',
        ativo: true,
        is_online: false,
        menus_permitidos: {
            contas_receber: 'true',
            gerenciador_contas_pagar: 'true',
            custo_folha: 'true',
            metas: 'true',
            aprovacoes: 'true',
            dashboard_master: 'true'
        }
    });
    await criarDocFirestore('Usuarios', 'superadmin@teste.com', {
        nome: 'SuperAdmin Teste',
        email: 'superadmin@teste.com',
        perfil: 'super_admin',
        ativo: true,
        is_online: false,
        menus_permitidos: {}
    });

    // 3. Criar lancamentos de exemplo (CRF — Lancamentos)
    console.log('\n3. Criando lancamentos de exemplo (CRF)...');
    await criarDocFirestore('Lancamentos', 'LANC-001', {
        numero_nota: '12345',
        cnpj: '12.345.678/0001-90',
        cliente: 'Cliente Exemplo Ltda',
        descricao_contrato: 'Contrato de Prestacao de Servico',
        valor: 15000.00,
        data_emissao: '2026-06-01',
        data_vencimento: '2026-07-01',
        status: 'ABERTO',
        empresa: 'Soulan'
    });
    await criarDocFirestore('Lancamentos', 'LANC-002', {
        numero_nota: '12346',
        cnpj: '98.765.432/0001-10',
        cliente: 'Empresa Beta S.A.',
        descricao_contrato: 'Consultoria RH',
        valor: 8500.50,
        data_emissao: '2026-06-15',
        data_vencimento: '2026-07-15',
        status: 'ABERTO',
        empresa: 'Soulan'
    });
    await criarDocFirestore('Lancamentos', 'LANC-003', {
        numero_nota: '12347',
        cnpj: '11.222.333/0001-44',
        cliente: 'Gamma Servicos',
        descricao_contrato: 'Estagio Integrado',
        valor: 3200.00,
        data_emissao: '2026-05-20',
        data_vencimento: '2026-06-20',
        status: 'RECEBIDO',
        empresa: 'Soulan'
    });

    // 4. Criar faturas de exemplo (CP — ContasAPagar)
    console.log('\n4. Criando faturas de exemplo (CP)...');
    await criarDocFirestore('ContasAPagar', 'CP-001', {
        fornecedor: 'Fornecedor Alpha',
        codigo_fornecedor: '1001',
        despesa: 'Aluguel Escritorio',
        valor: 12000.00,
        data_vencimento: '2026-07-10',
        data_pagamento: '',
        status: 'ABERTO',
        centro_custo: 'Administrativo',
        competencia_ref: '2026-07'
    });

    // 5. Criar meta de exemplo (Metas)
    console.log('\n5. Criando meta de exemplo...');
    await criarDocFirestore('MetasFinanceiras', 'META-001', {
        ano: '2026',
        produto: 'Temporario',
        total: 500000,
        total_bruto: 600000,
        atualizadoEm: new Date().toISOString()
    });

    // 6. Criar empresas de exemplo (Base_Empresas)
    console.log('\n6. Criando empresas de exemplo...');
    await criarDocFirestore('Base_Empresas', 'EMP-001', {
        nome_fantasia: 'Soulan'
    });
    await criarDocFirestore('Base_Empresas', 'EMP-002', {
        nome_fantasia: 'Soulan Temporarios'
    });

    console.log('\n=== Seed concluido! ===');
    console.log('\nCredenciais de teste:');
    console.log('  Master:     master@teste.com / teste123');
    console.log('  SuperAdmin: superadmin@teste.com / teste123');
    console.log('\nAcesse: http://localhost:5000/login.html');
    console.log('Emulator UI: http://localhost:4000\n');
}

main().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
