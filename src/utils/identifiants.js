const crypto = require('crypto');

const DOMAINE_MATIERES = 'matieres.local';
const DOMAINE_ELEVES = 'eleves.local';

// "Base de données" -> "base-de-donnees"
const slugifier = (texte, defaut = 'matiere') =>
  texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || defaut;

// Identifiant de connexion proposé pour une matière : "base-de-donnees@matieres.local"
const identifiantPourMatiere = (nomMatiere, suffixe = '') =>
  `${slugifier(nomMatiere)}${suffixe ? `-${suffixe}` : ''}@${DOMAINE_MATIERES}`;

// Identifiant de connexion proposé pour un élève : "faly.andriamanana@eleves.local"
const identifiantPourEleve = (prenom, nom, suffixe = '') =>
  `${slugifier(prenom, 'eleve')}.${slugifier(nom, 'eleve')}${suffixe ? `-${suffixe}` : ''}@${DOMAINE_ELEVES}`;

// Mot de passe aléatoire lisible (sans caractères ambigus 0/O, 1/l/I), 12 caractères
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const genererMotDePasse = (longueur = 12) => {
  const octets = crypto.randomBytes(longueur);
  return Array.from(octets, (o) => ALPHABET[o % ALPHABET.length]).join('');
};

module.exports = {
  DOMAINE_MATIERES,
  DOMAINE_ELEVES,
  slugifier,
  identifiantPourMatiere,
  identifiantPourEleve,
  genererMotDePasse,
};
