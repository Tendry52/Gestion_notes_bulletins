const User = require('../models/User');
const Note = require('../models/Note');
const Classe = require('../models/Classe');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { identifiantPourEleve } = require('../utils/identifiants');
const { choisirIdentifiant, lireIdentifiant, lireMotDePasseOuGenerer } = require('../utils/comptes');
const { calculerAge } = require('../utils/age');
const {
  exigerChaine,
  exigerDate,
  garderChamps,
  lirePagination,
  construirePagination,
  regexExacte,
  lireParamChaine,
} = require('../utils/validation');

const CHAMPS_MODIFIABLES = ['nom', 'prenom', 'classe', 'dateNaissance', 'adresse', 'telephone', 'tuteur', 'identifiant'];
const REGEX_TELEPHONE = /^[0-9 +().-]{6,30}$/;

// L'admin voit toute la fiche ; l'enseignant seulement ce qui sert à noter (jamais adresse, téléphone, identifiant...)
const CHAMPS_ADMIN = 'nom prenom email classe dateNaissance adresse telephone tuteur createdAt';
const CHAMPS_ENSEIGNANT = 'nom prenom classe';

const formaterEleve = (eleve) => {
  const objet = eleve.toJSON ? eleve.toJSON() : eleve;
  return { ...objet, age: calculerAge(objet.dateNaissance) };
};

// Une valeur vide ('' ou null) efface un champ facultatif
const estVide = (valeur) => valeur === '' || valeur === null;

const lireClasse = async (valeur) => {
  const nom = exigerChaine(valeur, 'classe', { max: 50 });
  const classe = await Classe.findOne({ nom: regexExacte(nom) });
  if (!classe) {
    throw new AppError(`La classe "${nom}" n'existe pas : créez-la d'abord (onglet « Classes »)`, 400);
  }
  return classe.nom; // nom officiel
};

const lireDateNaissance = (valeur) => {
  const date = exigerDate(valeur, 'dateNaissance');
  if (date > new Date()) throw new AppError('La date de naissance ne peut pas être dans le futur', 400);
  if (date.getUTCFullYear() < 1900) throw new AppError('La date de naissance est invalide', 400);
  return date;
};

const lireTelephone = (valeur) => {
  const telephone = exigerChaine(valeur, 'telephone', { max: 30 });
  if (!REGEX_TELEPHONE.test(telephone)) {
    throw new AppError('Le téléphone ne doit contenir que des chiffres, espaces, +, -, ( ) et .', 400);
  }
  return telephone;
};

// Champs facultatifs d'une fiche élève, validés. Retourne { definis, effaces }.
const lireFacultatifs = (corps) => {
  const definis = {};
  const effaces = [];
  const lecteurs = {
    dateNaissance: lireDateNaissance,
    adresse: (v) => exigerChaine(v, 'adresse', { max: 200 }),
    telephone: lireTelephone,
    tuteur: (v) => exigerChaine(v, 'tuteur', { max: 150 }),
  };
  Object.entries(lecteurs).forEach(([champ, lire]) => {
    if (corps[champ] === undefined) return;
    if (estVide(corps[champ])) effaces.push(champ);
    else definis[champ] = lire(corps[champ]);
  });
  return { definis, effaces };
};

const trouverEleve = async (id) => {
  const eleve = await User.findOne({ _id: id, role: 'eleve' });
  if (!eleve) throw new AppError('Élève introuvable', 404);
  return eleve;
};

// @desc    Lister les élèves (?classe=&page=&limite=). Fiche complète pour l'admin, réduite pour l'enseignant.
// @route   GET /api/users/eleves
// @access  Privé (enseignant, admin)
const listerEleves = asyncHandler(async (req, res) => {
  const estAdmin = req.utilisateur.role === 'admin';
  const filtre = { role: 'eleve' };
  const classe = lireParamChaine(req.query.classe, 'classe');
  if (classe) filtre.classe = regexExacte(classe);

  const pagination = lirePagination(req.query, { limiteParDefaut: 100, limiteMax: 500 });

  const [total, eleves] = await Promise.all([
    User.countDocuments(filtre),
    User.find(filtre)
      .select(estAdmin ? CHAMPS_ADMIN : CHAMPS_ENSEIGNANT)
      .sort({ nom: 1, prenom: 1 })
      .skip(pagination.skip)
      .limit(pagination.limite),
  ]);

  res.status(200).json({
    succes: true,
    resultats: eleves.length,
    pagination: construirePagination(pagination, total),
    donnees: estAdmin ? eleves.map(formaterEleve) : eleves,
  });
});

// @desc    Ajouter un élève ET son compte de connexion (identifiant + mot de passe).
//          Le mot de passe en clair n'est renvoyé qu'ici : l'admin le transmet à l'élève.
//          Corps : { nom, prenom, classe, dateNaissance?, adresse?, telephone?, tuteur?, identifiant?, motDePasse? }
// @route   POST /api/users/eleves
// @access  Privé (admin)
const creerEleve = asyncHandler(async (req, res) => {
  const corps = req.body || {};
  const nom = exigerChaine(corps.nom, 'nom', { max: 100 });
  const prenom = exigerChaine(corps.prenom, 'prenom', { max: 100 });
  const classe = await lireClasse(corps.classe);
  const { definis } = lireFacultatifs(corps);
  const motDePasse = lireMotDePasseOuGenerer(corps.motDePasse);
  const identifiant = await choisirIdentifiant((suffixe) => identifiantPourEleve(prenom, nom, suffixe), corps.identifiant);

  const eleve = await User.create({ nom, prenom, classe, email: identifiant, motDePasse, role: 'eleve', ...definis });

  res.status(201).json({
    succes: true,
    message: "Élève ajouté. Transmettez ces identifiants à l'élève : le mot de passe ne sera plus affichable.",
    donnees: formaterEleve(eleve),
    acces: { identifiant, motDePasse },
  });
});

// @desc    Modifier la fiche d'un élève (nom, prénom, classe, informations personnelles, identifiant)
// @route   PUT /api/users/eleves/:id
// @access  Privé (admin)
const modifierEleve = asyncHandler(async (req, res) => {
  const eleve = await trouverEleve(req.params.id);

  // Seuls les champs prévus sont pris en compte (le rôle, le mot de passe... sont intouchables ici)
  const corps = garderChamps(req.body, CHAMPS_MODIFIABLES);
  if (!Object.keys(corps).length) {
    throw new AppError(`Aucune modification fournie (champs modifiables : ${CHAMPS_MODIFIABLES.join(', ')})`, 400);
  }

  if (corps.nom !== undefined) eleve.nom = exigerChaine(corps.nom, 'nom', { max: 100 });
  if (corps.prenom !== undefined) eleve.prenom = exigerChaine(corps.prenom, 'prenom', { max: 100 });
  if (corps.classe !== undefined) eleve.classe = await lireClasse(corps.classe);
  if (corps.identifiant !== undefined) {
    const identifiant = lireIdentifiant(corps.identifiant);
    if (identifiant !== eleve.email) {
      if (await User.exists({ email: identifiant, _id: { $ne: eleve._id } })) {
        throw new AppError(`L'identifiant "${identifiant}" est déjà utilisé`, 409);
      }
      eleve.email = identifiant;
    }
  }
  const { definis, effaces } = lireFacultatifs(corps);
  eleve.set(definis);
  effaces.forEach((champ) => {
    eleve[champ] = undefined;
  });

  await eleve.save();
  res.status(200).json({ succes: true, donnees: formaterEleve(eleve) });
});

// @desc    Supprimer un élève, son compte et toutes ses notes
// @route   DELETE /api/users/eleves/:id
// @access  Privé (admin)
const supprimerEleve = asyncHandler(async (req, res) => {
  const eleve = await trouverEleve(req.params.id);
  const { deletedCount } = await Note.deleteMany({ eleve: eleve._id });
  await eleve.deleteOne();

  res.status(200).json({
    succes: true,
    message: `Élève supprimé (${deletedCount} note(s) supprimée(s))`,
    notesSupprimees: deletedCount,
  });
});

// @desc    Nouveau mot de passe pour un élève (oubli...). Corps facultatif : { motDePasse } — sinon généré.
//          Ses sessions ouvertes sont déconnectées.
// @route   POST /api/users/eleves/:id/acces
// @access  Privé (admin)
const reinitialiserAccesEleve = asyncHandler(async (req, res) => {
  const eleve = await trouverEleve(req.params.id);
  const motDePasse = lireMotDePasseOuGenerer((req.body || {}).motDePasse);
  eleve.motDePasse = motDePasse; // haché par le hook pre('save')
  await eleve.save();

  res.status(200).json({
    succes: true,
    message: "Mot de passe réinitialisé. Transmettez-le à l'élève : il ne sera plus affichable.",
    acces: { identifiant: eleve.email, motDePasse },
  });
});

module.exports = { listerEleves, creerEleve, modifierEleve, supprimerEleve, reinitialiserAccesEleve };
