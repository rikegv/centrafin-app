const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, deleteDoc, doc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyAHy6pN_agZ4DZDPDmJ580tUF4iTgX2siU",
  authDomain: "centra-fin.firebaseapp.com",
  projectId: "centra-fin",
  storageBucket: "centra-fin.firebasestorage.app",
  messagingSenderId: "666471089411",
  appId: "1:666471089411:web:4630f5b2ced70ceb981536",
  measurementId: "G-CJJX2T2HT8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function limparFaturamento() {
  const nomeColecao = "Contas a receber - Faturamento";
  console.log(`Buscando documentos na coleção: "${nomeColecao}"...`);
  try {
    const querySnapshot = await getDocs(collection(db, nomeColecao));
    const total = querySnapshot.size;
    
    if (total === 0) {
      console.log(`Nenhum documento encontrado na coleção "${nomeColecao}".`);
      return;
    }

    console.log(`Sucesso: ${total} documentos encontrados.`);
    
    for (const documento of querySnapshot.docs) {
      console.log(`Deletando ID: ${documento.id}`);
      await deleteDoc(doc(db, nomeColecao, documento.id));
    }

    console.log(`Limpeza da coleção "${nomeColecao}" concluída.`);
  } catch (error) {
    console.error("ERRO CRITICAL:", error.message);
  }
}

limparFaturamento().then(() => process.exit(0));
