// Charge le fichier .env puis vérifie que la configuration minimale est présente.
require('dotenv').config({ quiet: true });

const verifierEnvironnement = () => {
  const manquantes = ['MONGO_URI', 'JWT_SECRET'].filter((cle) => !process.env[cle]);
  if (manquantes.length) {
    throw new Error(
      `Variables d'environnement manquantes : ${manquantes.join(', ')} (copiez .env.example vers .env)`
    );
  }
  if (process.env.JWT_SECRET.length < 16) {
    throw new Error('JWT_SECRET est trop court (16 caractères minimum, 32+ recommandés)');
  }
  if (process.env.NODE_ENV === 'production' && /remplacez|change_cette/i.test(process.env.JWT_SECRET)) {
    throw new Error('JWT_SECRET utilise encore la valeur par défaut : générez une vraie clé en production');
  }
};

module.exports = { verifierEnvironnement };
