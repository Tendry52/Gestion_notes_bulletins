const Classe = require('../models/Classe');
const Matiere = require('../models/Matiere');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { exigerChaine, exigerObjectId, garderChamps, regexExacte } = require('../utils/validation');

const CHAMPS_MODIFIABLES = ['nom', 'matieres'];
const MAX_MATIERES_PAR_CLASSE = 100;

// Les identifiants de connexion des enseignants ne sont visibles que par l'admin
const champsEnseignant = (utilisateur) => (utilisateur.role === 'admin' ? 'nom prenom email' : 'nom prenom');

const populerClasses = (requete, utilisateur) =>
  requete.populate({
    path: 'matieres',
    select: 'nom coefficient enseignant',
    populate: { path: 'enseignant', select: champsEnseignant(utilisateur) },
  });

// Nombre d'élèves par classe (insensible à la casse) : { "l2-idev" => 6 }
const compterEffectifs = async () => {
  const eleves = await User.find({ role: 'eleve', classe: { $exists: true, $ne: '' } })
    .select('classe')
    .lean();
  const effectifs = new Map();
  eleves.forEach((e) => {
    const cle = String(e.classe).trim().toLowerCase();
    effectifs.set(cle, (effectifs.get(cle) || 0) + 1);
  });
  return effectifs;
};

const formaterClasse = (classe, effectifs) => ({
  _id: classe._id,
  nom: classe.nom,
  effectif: effectifs.get(classe.nom.toLowerCase()) || 0,
  matieres: classe.matieres
    .filter(Boolean)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    .map((m) => ({
      _id: m._id,
      nom: m.nom,
      coefficient: m.coefficient,
      enseignant: m.enseignant || null,
    })),
  createdAt: classe.createdAt,
});

const verifierNomDisponible = async (nom, idIgnore) => {
  const filtre = { nom: regexExacte(nom) };
  if (idIgnore) filtre._id = { $ne: idIgnore };
  if (await Classe.exists(filtre)) throw new AppError(`Une classe nommée "${nom}" existe déjà`, 409);
};

// Valide une liste d'identifiants de matières (sans doublon) et vérifie qu'elles existent toutes
const lireMatieres = async (valeur) => {
  if (valeur === undefined) return [];
  if (!Array.isArray(valeur)) throw new AppError('Le champ "matieres" doit être une liste d\'identifiants de matières', 400);
  if (valeur.length > MAX_MATIERES_PAR_CLASSE) {
    throw new AppError(`Une classe ne peut pas avoir plus de ${MAX_MATIERES_PAR_CLASSE} matières`, 400);
  }
  const ids = [...new Set(valeur.map((id, i) => exigerObjectId(id, `matieres[${i}]`)))];
  if (ids.length && (await Matiere.countDocuments({ _id: { $in: ids } })) !== ids.length) {
    throw new AppError('Une ou plusieurs matières sont introuvables', 404);
  }
  return ids;
};

// Noms de classes écrits comme les élèves les ont saisis (anciennes données) sont alignés sur le nom officiel
const aligner = (nom) => User.updateMany({ role: 'eleve', classe: regexExacte(nom) }, { $set: { classe: nom } });

const chargerClasseFormatee = async (id, utilisateur) => {
  const classe = await populerClasses(Classe.findById(id), utilisateur);
  return formaterClasse(classe, await compterEffectifs());
};

// @desc    Créer une classe avec ses matières (donc ses enseignants)
//          Corps : { nom, matieres?: [idMatiere, ...] }
// @route   POST /api/classes
// @access  Privé (admin)
const creerClasse = asyncHandler(async (req, res) => {
  const corps = req.body || {};
  const nom = exigerChaine(corps.nom, 'nom', { max: 50 });
  const matieres = await lireMatieres(corps.matieres);
  await verifierNomDisponible(nom);

  const classe = await Classe.create({ nom, matieres });
  await aligner(nom);
  res.status(201).json({ succes: true, donnees: await chargerClasseFormatee(classe._id, req.utilisateur) });
});

// @desc    Lister les classes avec effectif, matières et enseignants.
//          Admin : toutes. Enseignant : uniquement celles où il intervient (une de ses matières y est enseignée).
// @route   GET /api/classes
// @access  Privé (admin, enseignant)
const listerClasses = asyncHandler(async (req, res) => {
  const filtre = {};
  if (req.utilisateur.role === 'enseignant') {
    const siennes = await Matiere.find({ enseignant: req.utilisateur._id }).select('_id');
    filtre.matieres = { $in: siennes.map((m) => m._id) };
  }
  const [classes, effectifs] = await Promise.all([
    populerClasses(Classe.find(filtre), req.utilisateur),
    compterEffectifs(),
  ]);
  const donnees = classes
    .map((c) => formaterClasse(c, effectifs))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true }));
  res.status(200).json({ succes: true, resultats: donnees.length, donnees });
});

// @desc    Obtenir une classe
// @route   GET /api/classes/:id
// @access  Privé (admin ; enseignant qui y intervient)
const obtenirClasse = asyncHandler(async (req, res) => {
  const classe = await populerClasses(Classe.findById(req.params.id), req.utilisateur);
  if (!classe) throw new AppError('Classe introuvable', 404);

  if (req.utilisateur.role === 'enseignant') {
    const intervient = classe.matieres.some(
      (m) => m && m.enseignant && m.enseignant._id.toString() === req.utilisateur._id.toString()
    );
    if (!intervient) throw new AppError("Accès refusé : vous n'intervenez pas dans cette classe", 403);
  }
  res.status(200).json({ succes: true, donnees: formaterClasse(classe, await compterEffectifs()) });
});

// @desc    Modifier une classe : renommer (les élèves suivent) et/ou remplacer la liste de ses matières
// @route   PUT /api/classes/:id
// @access  Privé (admin)
const modifierClasse = asyncHandler(async (req, res) => {
  const classe = await Classe.findById(req.params.id);
  if (!classe) throw new AppError('Classe introuvable', 404);

  const champs = garderChamps(req.body, CHAMPS_MODIFIABLES);
  if (!Object.keys(champs).length) {
    throw new AppError('Aucune modification fournie (champs modifiables : nom, matieres)', 400);
  }

  const ancienNom = classe.nom;
  if (champs.nom !== undefined) {
    champs.nom = exigerChaine(champs.nom, 'nom', { max: 50 });
    await verifierNomDisponible(champs.nom, classe._id);
  }
  if (champs.matieres !== undefined) champs.matieres = await lireMatieres(champs.matieres);

  classe.set(champs);
  await classe.save();

  // Les élèves inscrits sous l'ancien nom suivent le renommage
  if (champs.nom !== undefined) {
    await User.updateMany({ role: 'eleve', classe: regexExacte(ancienNom) }, { $set: { classe: classe.nom } });
  }
  res.status(200).json({ succes: true, donnees: await chargerClasseFormatee(classe._id, req.utilisateur) });
});

// @desc    Supprimer une classe (refusé tant que des élèves y sont inscrits)
// @route   DELETE /api/classes/:id
// @access  Privé (admin)
const supprimerClasse = asyncHandler(async (req, res) => {
  const classe = await Classe.findById(req.params.id);
  if (!classe) throw new AppError('Classe introuvable', 404);

  const effectif = (await compterEffectifs()).get(classe.nom.toLowerCase()) || 0;
  if (effectif > 0) {
    throw new AppError(
      `La classe "${classe.nom}" compte ${effectif} élève(s) : elle ne peut pas être supprimée tant qu'elle n'est pas vide`,
      409
    );
  }
  await classe.deleteOne();
  res.status(200).json({ succes: true, message: 'Classe supprimée' });
});

module.exports = { creerClasse, listerClasses, obtenirClasse, modifierClasse, supprimerClasse };
