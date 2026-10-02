// Crée le compte administrateur.
//   ADMIN_EMAIL=admin@ecole.mg ADMIN_MOT_DE_PASSE=... npm run admin
// (ou renseignez ces deux variables dans .env). Sans mot de passe, il est généré et affiché une fois.
require('../src/config/env');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const { genererMotDePasse } = require('../src/utils/identifiants');

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI manquant : copiez .env.example vers .env');
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) throw new Error('ADMIN_EMAIL manquant (ex : ADMIN_EMAIL=admin@ecole.mg npm run admin)');

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });

  if (await User.exists({ email })) throw new Error(`Un compte existe déjà avec l'email ${email}`);

  const motDePasse = process.env.ADMIN_MOT_DE_PASSE || genererMotDePasse(16);
  await User.create({ nom: 'Administrateur', prenom: 'Compte', email, motDePasse, role: 'admin' });

  console.log(`\nAdministrateur créé ✔  (${email})`);
  if (!process.env.ADMIN_MOT_DE_PASSE) console.log(`Mot de passe généré (notez-le, il ne sera plus affiché) : ${motDePasse}`);
  console.log('Pensez à retirer ADMIN_MOT_DE_PASSE de votre .env une fois le compte créé.\n');
};

main()
  .catch((erreur) => {
    console.error(`Erreur : ${erreur.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
