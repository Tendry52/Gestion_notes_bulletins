const mongoose = require('mongoose');

let serveurMemoire = null;

// Utilise MONGO_URI_TEST si défini, sinon démarre un MongoDB en mémoire (téléchargé au 1er lancement)
const connecterBaseDeTest = async () => {
  let uri = process.env.MONGO_URI_TEST;
  if (!uri) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    serveurMemoire = await MongoMemoryServer.create();
    uri = serveurMemoire.getUri('gestion_notes_test');
  }
  await mongoose.connect(uri);
  // Force la création des index uniques avant les tests
  await Promise.all(Object.values(mongoose.models).map((modele) => modele.init()));
};

const viderBase = async () => {
  await Promise.all(Object.values(mongoose.models).map((modele) => modele.deleteMany({})));
};

const deconnecterBaseDeTest = async () => {
  await mongoose.connection.close();
  if (serveurMemoire) await serveurMemoire.stop();
};

module.exports = { connecterBaseDeTest, viderBase, deconnecterBaseDeTest };
