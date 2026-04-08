const project_id = "centra-fin";

const dados = {
  Base_Fornecedores: ["Telefonica Brasil", "MBR Gestao", "Nadvi Consultoria", "Carvalho Assessoria", "Exato Digital", "Creditas", "Enel", "Claro", "R8 Consultoria"],
  Base_Clientes: ["Bunge Alimentos", "Raia Drogasil", "Sonova", "Arcellormittal", "Puma Sports", "Seara", "Mauser", "TechnipFMC", "Eaton"],
  Base_Categorias: ["Infraestrutura", "Salários", "Diretoria", "Viagens e Eventos", "Sistemas", "Contabilidade", "Impostos", "Auxílio Educação"],
  Base_Empresas: ["SELLAN", "SOULAN", "NEAT", "SOULAN ADM", "SOULAN CONS", "CENTRAL"],
  Base_Areas: ["Comercial", "R&S", "Diretoria", "Marketing", "Gente e Cultura", "Suprimentos", "Estratégia", "Vendas Internas"],
  Base_Responsaveis: ["Edilaine", "Nadjane", "Marcelo", "Fernanda", "Medeiros", "Tais", "Rejane", "Alberto", "Flavio", "Nicolas", "Adriana"]
};

// Usa a API REST do Firestore para salvar os documentos.
// O método PATCH garante que, se o documento (ID = nome) já existir, ele será atualizado e não duplicado.
async function insertDocument(collection, id) {
  const url = `https://firestore.googleapis.com/v1/projects/${project_id}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}?updateMask.fieldPaths=nome&updateMask.fieldPaths=data_cadastro`;
  const payload = {
    fields: {
      nome: { stringValue: id },
      data_cadastro: { timestampValue: new Date().toISOString() }
    }
  };
  const response = await fetch(url, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

async function run() {
  console.log("Iniciando importação de Dados Base para o Firestore...");
  let successCount = 0;
  for (const [colecao, itens] of Object.entries(dados)) {
    console.log(`\n📦 Processando Coleção: ${colecao}`);
    for (const item of itens) {
      const nomeLimpo = item.trim();
      try {
        await insertDocument(colecao, nomeLimpo);
        console.log(`  ✅ Salvo: ${nomeLimpo}`);
        successCount++;
      } catch (e) {
        console.error(`  ❌ Erro em ${nomeLimpo}:`, e.message);
      }
    }
  }
  console.log(`\n🏁 Concluído! ${successCount} itens foram processados com sucesso.`);
}

run();
