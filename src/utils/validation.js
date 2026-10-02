const AppError = require('./AppError');

const REGEX_OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const estObjectId = (valeur) => typeof valeur === 'string' && REGEX_OBJECT_ID.test(valeur);

// Chaîne obligatoire, nettoyée (trim) et bornée en longueur
const exigerChaine = (valeur, nomChamp, { min = 1, max = 200 } = {}) => {
  if (typeof valeur !== 'string') {
    throw new AppError(`Le champ "${nomChamp}" est obligatoire et doit être du texte`, 400);
  }
  const nettoyee = valeur.trim();
  if (nettoyee.length < min) {
    throw new AppError(
      min === 1 ? `Le champ "${nomChamp}" est obligatoire` : `Le champ "${nomChamp}" doit contenir au moins ${min} caractères`,
      400
    );
  }
  if (nettoyee.length > max) {
    throw new AppError(`Le champ "${nomChamp}" ne doit pas dépasser ${max} caractères`, 400);
  }
  return nettoyee;
};

// Nombre fini (accepte aussi "15.5" envoyé sous forme de chaîne), borné
const exigerNombre = (valeur, nomChamp, { min = -Infinity, max = Infinity } = {}) => {
  const nombre = typeof valeur === 'string' && valeur.trim() !== '' ? Number(valeur) : valeur;
  if (typeof nombre !== 'number' || !Number.isFinite(nombre)) {
    throw new AppError(`Le champ "${nomChamp}" doit être un nombre`, 400);
  }
  if (nombre < min || nombre > max) {
    throw new AppError(`Le champ "${nomChamp}" doit être compris entre ${min} et ${max}`, 400);
  }
  return nombre;
};

const exigerObjectId = (valeur, nomChamp) => {
  if (!estObjectId(valeur)) {
    throw new AppError(`Le champ "${nomChamp}" doit être un identifiant valide`, 400);
  }
  return valeur;
};

const exigerValeurParmi = (valeur, nomChamp, valeursAutorisees) => {
  if (typeof valeur !== 'string' || !valeursAutorisees.includes(valeur)) {
    throw new AppError(`Le champ "${nomChamp}" doit valoir : ${valeursAutorisees.join(', ')}`, 400);
  }
  return valeur;
};

const exigerDate = (valeur, nomChamp) => {
  const date = new Date(valeur);
  if ((typeof valeur !== 'string' && typeof valeur !== 'number') || Number.isNaN(date.getTime())) {
    throw new AppError(`Le champ "${nomChamp}" doit être une date valide`, 400);
  }
  return date;
};

// Ne garde que les clés autorisées (protège contre l'injection de champs / mass assignment)
const garderChamps = (objet, champsAutorises) => {
  const resultat = {};
  champsAutorises.forEach((champ) => {
    if (objet && objet[champ] !== undefined) resultat[champ] = objet[champ];
  });
  return resultat;
};

// Lit ?page=&limite= avec des bornes de sécurité
const lirePagination = (query, { limiteParDefaut = 50, limiteMax = 200 } = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limite = Math.min(Math.max(parseInt(query.limite, 10) || limiteParDefaut, 1), limiteMax);
  return { page, limite, skip: (page - 1) * limite };
};

const construirePagination = ({ page, limite }, total) => ({
  page,
  limite,
  total,
  pages: Math.max(Math.ceil(total / limite), 1),
});

const echapperRegex = (texte) => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Filtre texte insensible à la casse, exact (ex : nom de matière, classe)
const regexExacte = (texte) => new RegExp(`^${echapperRegex(texte)}$`, 'i');

// Un paramètre d'URL doit être une simple chaîne (jamais un objet type ?x[$ne]=1)
const lireParamChaine = (valeur, nomChamp) => {
  if (valeur === undefined) return undefined;
  if (typeof valeur !== 'string') {
    throw new AppError(`Le paramètre "${nomChamp}" est invalide`, 400);
  }
  return valeur.trim();
};

module.exports = {
  estObjectId,
  exigerChaine,
  exigerNombre,
  exigerObjectId,
  exigerValeurParmi,
  exigerDate,
  garderChamps,
  lirePagination,
  construirePagination,
  echapperRegex,
  regexExacte,
  lireParamChaine,
};
