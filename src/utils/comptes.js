const User = require('../models/User');
const AppError = require('./AppError');
const { genererMotDePasse } = require('./identifiants');
const { exigerChaine } = require('./validation');

const REGEX_EMAIL = /^\S+@\S+\.\S+$/;

// Identifiant de connexion saisi par l'admin : doit avoir la forme d'un email
const lireIdentifiant = (valeur) => {
  const identifiant = exigerChaine(valeur, 'identifiant', { max: 254 }).toLowerCase();
  if (!REGEX_EMAIL.test(identifiant)) throw new AppError("L'identifiant doit avoir la forme d'un email", 400);
  return identifiant;
};

// Identifiant de connexion d'un nouveau compte : celui fourni par l'admin (unique), sinon généré par
// `generer(suffixe)` — suffixé -2, -3... en cas de collision.
const choisirIdentifiant = async (generer, identifiantFourni) => {
  if (identifiantFourni !== undefined) {
    const identifiant = lireIdentifiant(identifiantFourni);
    if (await User.exists({ email: identifiant })) {
      throw new AppError(`L'identifiant "${identifiant}" est déjà utilisé`, 409);
    }
    return identifiant;
  }
  for (let i = 1; i <= 50; i += 1) {
    const candidat = generer(i === 1 ? '' : String(i));
    // eslint-disable-next-line no-await-in-loop
    if (!(await User.exists({ email: candidat }))) return candidat;
  }
  throw new AppError("Impossible de générer un identifiant unique, précisez le champ \"identifiant\"", 409);
};

// Mot de passe choisi par l'admin (8 à 72 caractères), sinon généré aléatoirement
const lireMotDePasseOuGenerer = (valeur) =>
  valeur === undefined ? genererMotDePasse() : exigerChaine(valeur, 'motDePasse', { min: 8, max: 72 });

module.exports = { REGEX_EMAIL, lireIdentifiant, choisirIdentifiant, lireMotDePasseOuGenerer };
