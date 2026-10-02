const { verifierEnvironnement } = require('./config/env');

try {
  verifierEnvironnement();
} catch (erreur) {
  console.error(`Configuration invalide : ${erreur.message}`);
  process.exit(1);
}

const mongoose = require('mongoose');
const app = require('./app');
const connecterDB = require('./config/db');

const PORT = process.env.PORT || 5000;

const demarrer = async () => {
  try {
    const conn = await connecterDB();
    console.log(`MongoDB connecté : ${conn.connection.host}`);
  } catch (erreur) {
    console.error(`Erreur de connexion à MongoDB : ${erreur.message}`);
    process.exit(1);
  }

  const User = require('./models/User');
  if (!(await User.exists({ role: 'admin' }))) {
    console.log('Info : aucun administrateur en base → créez-le avec `npm run admin` (ou `npm run seed` pour la démo).');
  }

  const serveur = app.listen(PORT, () => {
    console.log(`Serveur démarré : http://localhost:${PORT}`);
  });

  // Arrêt propre (Ctrl+C, redémarrage nodemon, hébergeur)
  const arreter = () => {
    serveur.close(async () => {
      await mongoose.connection.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', arreter);
  process.on('SIGTERM', arreter);
};

demarrer();
