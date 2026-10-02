const Matiere = require('../models/Matiere');
const Note = require('../models/Note');
const User = require('../models/User');
const Classe = require('../models/Classe');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { identifiantPourMatiere } = require('../utils/identifiants');
const { choisirIdentifiant, lireMotDePasseOuGenerer } = require('../utils/comptes');
const {
  exigerChaine,
  exigerNombre,
  garderChamps,
  lirePagination,
  construirePagination,
  echapperRegex,
  regexExacte,
  lireParamChaine,
} = require('../utils/validation');

const CHAMPS_MODIFIABLES = ['nom', 'coefficient'];

// Refuse un nom déjà pris (sans tenir compte de la casse : "Maths" = "maths")
const verifierNomDisponible = async (nom, idIgnore) => {
  const filtre = { nom: regexExacte(nom) };
  if (idIgnore) filtre._id = { $ne: idIgnore };
  if (await Matiere.exists(filtre)) {
    throw new AppError(`Une matière nommée "${nom}" existe déjà`, 409);
  }
};

// @desc    Créer une matière ET son compte de connexion (identifiant + mot de passe).
//          Le mot de passe en clair n'est renvoyé qu'ici : l'admin le transmet à l'enseignant.
//          Corps : { nom, coefficient?, identifiant?, motDePasse?, enseignantNom?, enseignantPrenom? }
// @route   POST /api/matieres
// @access  Privé (admin)
const creerMatiere = asyncHandler(async (req, res) => {
  const corps = req.body || {};
  const nom = exigerChaine(corps.nom, 'nom', { max: 100 });
  const coefficient =
    corps.coefficient === undefined ? 1 : exigerNombre(corps.coefficient, 'coefficient', { min: 1, max: 20 });
  const nomEnseignant =
    corps.enseignantNom === undefined ? nom : exigerChaine(corps.enseignantNom, 'enseignantNom', { max: 100 });
  const prenomEnseignant =
    corps.enseignantPrenom === undefined ? 'Enseignant' : exigerChaine(corps.enseignantPrenom, 'enseignantPrenom', { max: 100 });
  const motDePasse = lireMotDePasseOuGenerer(corps.motDePasse);

  await verifierNomDisponible(nom);
  const identifiant = await choisirIdentifiant((suffixe) => identifiantPourMatiere(nom, suffixe), corps.identifiant);

  const enseignant = await User.create({
    nom: nomEnseignant,
    prenom: prenomEnseignant,
    email: identifiant,
    motDePasse,
    role: 'enseignant',
  });

  let matiere;
  try {
    matiere = await Matiere.create({ nom, coefficient, enseignant: enseignant._id });
  } catch (erreur) {
    await enseignant.deleteOne(); // pas de compte orphelin si la matière n'a pas pu être créée
    throw erreur;
  }

  res.status(201).json({
    succes: true,
    message: "Matière créée. Transmettez ces identifiants à l'enseignant : le mot de passe ne sera plus affichable.",
    donnees: matiere,
    acces: { identifiant, motDePasse },
  });
});

// @desc    Lister les matières (?recherche=&page=&limite=)
// @route   GET /api/matieres
// @access  Privé
const listerMatieres = asyncHandler(async (req, res) => {
  const champsEnseignant = req.utilisateur.role === 'admin' ? 'nom prenom email' : 'nom prenom';
  const filtre = {};
  const recherche = lireParamChaine(req.query.recherche, 'recherche');
  if (recherche) filtre.nom = new RegExp(echapperRegex(recherche), 'i');

  const pagination = lirePagination(req.query, { limiteParDefaut: 100, limiteMax: 200 });

  const [total, matieres] = await Promise.all([
    Matiere.countDocuments(filtre),
    Matiere.find(filtre)
      .populate('enseignant', champsEnseignant)
      .sort({ nom: 1 })
      .skip(pagination.skip)
      .limit(pagination.limite),
  ]);

  res.status(200).json({
    succes: true,
    resultats: matieres.length,
    pagination: construirePagination(pagination, total),
    donnees: matieres,
  });
});

// @desc    Obtenir une matière
// @route   GET /api/matieres/:id
// @access  Privé
const obtenirMatiere = asyncHandler(async (req, res) => {
  const champsEnseignant = req.utilisateur.role === 'admin' ? 'nom prenom email' : 'nom prenom';
  const matiere = await Matiere.findById(req.params.id).populate('enseignant', champsEnseignant);
  if (!matiere) throw new AppError('Matière introuvable', 404);
  res.status(200).json({ succes: true, donnees: matiere });
});

// @desc    Modifier une matière (nom, coefficient) — réservé à l'administrateur
// @route   PUT /api/matieres/:id
// @access  Privé (admin)
const modifierMatiere = asyncHandler(async (req, res) => {
  const matiere = await Matiere.findById(req.params.id);
  if (!matiere) throw new AppError('Matière introuvable', 404);

  // Seuls les champs autorisés sont pris en compte (impossible de changer l'enseignant, etc.)
  const champs = garderChamps(req.body, CHAMPS_MODIFIABLES);
  if (!Object.keys(champs).length) {
    throw new AppError('Aucune modification fournie (champs modifiables : nom, coefficient)', 400);
  }
  if (champs.nom !== undefined) {
    champs.nom = exigerChaine(champs.nom, 'nom', { max: 100 });
    await verifierNomDisponible(champs.nom, matiere._id);
  }
  if (champs.coefficient !== undefined) {
    champs.coefficient = exigerNombre(champs.coefficient, 'coefficient', { min: 1, max: 20 });
  }

  matiere.set(champs);
  await matiere.save();
  res.status(200).json({ succes: true, donnees: matiere });
});

// @desc    Supprimer une matière, toutes ses notes, son retrait des classes, et son compte enseignant
//          (sauf si ce compte est aussi responsable d'une autre matière)
// @route   DELETE /api/matieres/:id
// @access  Privé (admin)
const supprimerMatiere = asyncHandler(async (req, res) => {
  const matiere = await Matiere.findById(req.params.id);
  if (!matiere) throw new AppError('Matière introuvable', 404);

  const { deletedCount } = await Note.deleteMany({ matiere: matiere._id });
  await matiere.deleteOne();
  await Classe.updateMany({ matieres: matiere._id }, { $pull: { matieres: matiere._id } });

  let compteSupprime = false;
  const autresMatieres = await Matiere.exists({ enseignant: matiere.enseignant });
  if (!autresMatieres) {
    const { deletedCount: n } = await User.deleteOne({ _id: matiere.enseignant, role: 'enseignant' });
    compteSupprime = n > 0;
  }

  res.status(200).json({
    succes: true,
    message: `Matière supprimée (${deletedCount} note(s) associée(s) supprimée(s))`,
    notesSupprimees: deletedCount,
    compteEnseignantSupprime: compteSupprime,
  });
});

// @desc    Nouveau mot de passe pour le compte d'une matière (oubli, départ de l'enseignant...)
//          Corps facultatif : { motDePasse } — sinon un mot de passe est généré.
// @route   POST /api/matieres/:id/acces
// @access  Privé (admin)
const reinitialiserAcces = asyncHandler(async (req, res) => {
  const matiere = await Matiere.findById(req.params.id);
  if (!matiere) throw new AppError('Matière introuvable', 404);

  const enseignant = await User.findOne({ _id: matiere.enseignant, role: 'enseignant' });
  if (!enseignant) throw new AppError("Le compte de cette matière n'existe plus", 404);

  const motDePasse = lireMotDePasseOuGenerer((req.body || {}).motDePasse);
  enseignant.motDePasse = motDePasse; // haché par le hook pre('save')
  await enseignant.save();

  res.status(200).json({
    succes: true,
    message: 'Mot de passe réinitialisé. Transmettez-le à l\'enseignant : il ne sera plus affichable.',
    acces: { identifiant: enseignant.email, motDePasse },
  });
});

module.exports = { creerMatiere, listerMatieres, obtenirMatiere, modifierMatiere, supprimerMatiere, reinitialiserAcces };
