const project_id = "centra-fin";
const collection = "Lancamentos";

async function run() {
  console.log("==================================================");
  console.log("🧹 INICIANDO FAXINA DA BASE DE DADOS");
  console.log(`Coleção Alvo: '${collection}'`);
  console.log("⚠️ AVISO: As outras coleções base (Fornecedores, Clientes, Categorias, etc) NÃO serão afetadas.");
  console.log("==================================================\n");

  let nextPageToken = "";
  let deletedCount = 0;

  try {
    do {
      let url = `https://firestore.googleapis.com/v1/projects/${project_id}/databases/(default)/documents/${collection}`;
      if (nextPageToken) {
        url += `?pageToken=${nextPageToken}`;
      }

      // 1. Busca os documentos
      const res = await fetch(url);
      if (!res.ok) {
        console.error("Erro ao listar documentos:", await res.text());
        break;
      }

      const data = await res.json();
      const docs = data.documents || [];

      if (docs.length === 0) {
          if (deletedCount === 0) {
              console.log("✅ A coleção já está vazia. Nenhum lançamento para deletar.");
          }
          break;
      }

      // 2. Deleta um por um usando a API REST
      for (const doc of docs) {
        const docName = doc.name; // Caminho completo: projects/centra-fin/databases/(default)/documents/Lancamentos/ID
        const deleteUrl = `https://firestore.googleapis.com/v1/${docName}`;
        
        const delRes = await fetch(deleteUrl, { method: 'DELETE' });
        if (delRes.ok) {
          deletedCount++;
          console.log(`  ✅ Deletado: ${docName.split('/').pop()}`);
        } else {
          console.error(`  ❌ Erro ao deletar ${docName}:`, await delRes.text());
        }
      }

      nextPageToken = data.nextPageToken;
    } while (nextPageToken);

    console.log(`\n🏁 Faxina concluída com sucesso!`);
    console.log(`Total de lançamentos fictícios deletados: ${deletedCount}`);

  } catch (error) {
    console.error("❌ Erro inesperado durante a rotina:", error);
  }
}

run();
