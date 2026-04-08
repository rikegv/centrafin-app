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

const nomesParaTentar = [
  "Contas a receber - Faturamento",
  "Contas a Receber - Faturamento",
  "Contas a receber-Faturamento",
  "Contas a Receber-Faturamento",
  "Contas a receber / Faturamento",
  "Contas a Receber / Faturamento",
  "Contas a receber",
  "Faturamento",
  "faturamento",
  "Lancamentos"
];

async function varrerColecoes() {
  console.log("Iniciando varredura de coleções possíveis...");
  for (const nome of nomesParaTentar) {
    try {
      const querySnapshot = await getDocs(collection(db, nome));
      const total = querySnapshot.size;
      console.log(`Coleção "${nome}": ${total} documentos.`);
      
      if (total > 0) {
        console.log(`Limpando "${nome}"...`);
        const promises = querySnapshot.docs.map(d => deleteDoc(doc(db, nome, d.id)));
        await Promise.all(promises);
        console.log(`Sucesso: ${total} documentos removidos de "${nome}".`);
      }
    } catch (e) {
      // Provavelmente coleção não existe ou erro de permissão
    }
  }
  console.log("Varredura finalizada.");
}

varrerColecoes().then(() => process.exit(0));
