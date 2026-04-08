const admin = require('firebase-admin');

// Tenta inicializar com credenciais padrão do ambiente (GCP/Firebase)
try {
  admin.initializeApp({
    projectId: 'centra-fin'
  });
  console.log("Firebase Admin inicializado com projectId: centra-fin");
} catch (e) {
  console.error("Falha ao inicializar Firebase Admin:", e.message);
  process.exit(1);
}

const db = admin.firestore();

async function listarELimpar() {
  try {
    const collections = await db.listCollections();
    console.log(`Encontradas ${collections.length} coleções.`);
    
    for (const col of collections) {
      console.log(`- Coleção encontrada: "${col.id}"`);
      
      if (col.id.includes("Faturamento") || col.id.includes("Contas a receber") || col.id === "Lancamentos") {
        console.log(`  Limpando documentos da coleção "${col.id}"...`);
        const snapshot = await col.get();
        console.log(`  Total: ${snapshot.size} documentos.`);
        
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        
        await batch.commit();
        console.log(`  Sucesso: Coleção "${col.id}" limpa.`);
      }
    }
  } catch (err) {
    console.error("Erro ao listar coleções:", err.message);
    console.log("DICA: Talvez faltem permissões de Admin ou Credenciais ADM no ambiente.");
  }
}

listarELimpar().then(() => process.exit(0));
