const Note = require('../models/Note');
const User = require('../models/User');
const Matiere = require('../models/Matiere');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { verifierResponsableMatiere, verifierMatiereEnseignee } = require('../utils/droits');
const {
  exigerNombre,
  exigerObjectId,
  exigerValeurParmi,
  exigerDate,
  garderChamps,
  lirePagination,
  construirePagination,
  lireParamChaine,
} = require('../utils/validation');

const TYPES_NOTE = ['devoir', 'examen', 'controle', 'tp'];
const CHAMPS_MODIFIABLES = ['valeur', 'type', 'coefficientNote', 'dateEvaluation'];

// Valide les champs communs à la création et à la modification
const validerChampsNote = (champs) => {
  const valides = {};
  if (champs.valeur !== undefined) valides.valeur = exigerNombre(champs.valeur, 'valeur', { min: 0, max: 20 });
  if (champs.type !== undefined) valides.type = exigerValeurParmi(champs.type, 'type', TYPES_NOTE);
  if (champs.coefficientNote !== undefined) {
    valides.coefficientNote = exigerNombre(champs.coefficientNote, 'coefficientNote', { min: 1, max: 20 });
  }
  if (champs.dateEvaluation !== undefined) {
    valides.dateEvaluation = exigerDate(champs.dateEvaluation, 'dateEvaluation');
  }
  return valides;
};

const populerNote = (requete) =>
  requete.populate('matiere', 'nom coefficient enseignant').populate('eleve', 'nom prenom classe');

// @desc    Ajouter une note à un élève (dans une matière dont on est responsable)
// @route   POST /api/notes
// @access  Privé (enseignant responsable de la matière, enseignée dans la classe de l'élève)
const creerNote = asyncHandler(async (req, res) => {
  const corps = req.body || {};
  const eleveId = exigerObjectId(corps.eleve, 'eleve');
  const matiereId = exigerObjectId(corps.matiere, 'matiere');
  if (corps.valeur === undefined) throw new AppError('Le champ "valeur" est obligatoire', 400);
  const champs = validerChampsNote(garderChamps(corps, CHAMPS_MODIFIABLES));

  const eleve = await User.findOne({ _id: eleveId, role: 'eleve' });
  if (!eleve) throw new AppError('Élève introuvable', 404);

  const matiere = await Matiere.findById(matiereId);
  if (!matiere) throw new AppError('Matière introuvable', 404);
  verifierResponsableMatiere(matiere, req.utilisateur);
  await verifierMatiereEnseignee([eleve], matiere);

  const note = await Note.create({
    ...champs,
    eleve: eleve._id,
    matiere: matiere._id,
    ajouteePar: req.utilisateur._id,
  });

  res.status(201).json({ succes: true, donnees: note });
});

const MAX_NOTES_PAR_LOT = 100;

// @desc    Ajouter en une fois la même évaluation à plusieurs élèves (tout ou rien)
//          Corps : { matiere, type?, coefficientNote?, dateEvaluation?, notes: [{ eleve, valeur }, ...] }
// @route   POST /api/notes/lot
// @access  Privé (enseignant responsable de la matière)
const creerNotesLot = asyncHandler(async (req, res) => {
  const corps = req.body || {};
  const matiereId = exigerObjectId(corps.matiere, 'matiere');
  if (!Array.isArray(corps.notes) || !corps.notes.length) {
    throw new AppError('Le champ \"notes\" doit être une liste non vide de { eleve, valeur }', 400);
  }
  if (corps.notes.length > MAX_NOTES_PAR_LOT) {
    throw new AppError(`Un lot ne peut pas dépasser ${MAX_NOTES_PAR_LOT} notes`, 400);
  }
  const commun = validerChampsNote(garderChamps(corps, ['type', 'coefficientNote', 'dateEvaluation']));

  // Validation de toutes les lignes AVANT d'écrire quoi que ce soit
  const vus = new Set();
  const lignes = corps.notes.map((ligne, i) => {
    if (!ligne || typeof ligne !== 'object') {
      throw new AppError(`notes[${i}] doit être un objet { eleve, valeur }`, 400);
    }
    const eleve = exigerObjectId(ligne.eleve, `notes[${i}].eleve`);
    if (vus.has(eleve)) throw new AppError(`notes[${i}] : cet élève apparaît plusieurs fois dans le lot`, 400);
    vus.add(eleve);
    return { eleve, valeur: exigerNombre(ligne.valeur, `notes[${i}].valeur`, { min: 0, max: 20 }) };
  });

  const matiere = await Matiere.findById(matiereId);
  if (!matiere) throw new AppError('Matière introuvable', 404);
  verifierResponsableMatiere(matiere, req.utilisateur);

  const eleves = await User.find({ _id: { $in: [...vus] }, role: 'eleve' }).select('nom prenom classe');
  if (eleves.length !== vus.size) throw new AppError('Un ou plusieurs élèves sont introuvables', 404);
  await verifierMatiereEnseignee(eleves, matiere); // tout ou rien : rien n'est écrit si une classe ne suit pas la matière

  const notes = await Note.insertMany(
    lignes.map((ligne) => ({ ...commun, ...ligne, matiere: matiere._id, ajouteePar: req.utilisateur._id }))
  );

  res.status(201).json({
    succes: true,
    message: `${notes.length} note(s) enregistrée(s)`,
    resultats: notes.length,
    donnees: notes,
  });
});

// @desc    Lister les notes (?eleve=&matiere=&page=&limite=)
// @route   GET /api/notes
// @access  Privé (un élève ne voit que ses propres notes)
const listerNotes = asyncHandler(async (req, res) => {
  const filtre = {};

  if (req.utilisateur.role === 'eleve') {
    filtre.eleve = req.utilisateur._id;
  } else {
    const eleve = lireParamChaine(req.query.eleve, 'eleve');
    if (eleve) filtre.eleve = exigerObjectId(eleve, 'eleve');
  }

  const matiere = lireParamChaine(req.query.matiere, 'matiere');
  if (matiere) filtre.matiere = exigerObjectId(matiere, 'matiere');

  const pagination = lirePagination(req.query, { limiteParDefaut: 100, limiteMax: 200 });

  const [total, notes] = await Promise.all([
    Note.countDocuments(filtre),
    populerNote(
      Note.find(filtre).sort({ dateEvaluation: -1, createdAt: -1 }).skip(pagination.skip).limit(pagination.limite)
    ),
  ]);

  res.status(200).json({
    succes: true,
    resultats: notes.length,
    pagination: construirePagination(pagination, total),
    donnees: notes,
  });
});

// @desc    Obtenir une note
// @route   GET /api/notes/:id
// @access  Privé (un élève ne voit que ses propres notes)
const obtenirNote = asyncHandler(async (req, res) => {
  const note = await populerNote(Note.findById(req.params.id));
  if (!note) throw new AppError('Note introuvable', 404);

  if (req.utilisateur.role === 'eleve') {
    const idEleve = note.eleve && note.eleve._id ? note.eleve._id : note.eleve;
    if (!idEleve || idEleve.toString() !== req.utilisateur._id.toString()) {
      throw new AppError('Accès refusé : cette note ne vous appartient pas', 403);
    }
  }

  res.status(200).json({ succes: true, donnees: note });
});

// @desc    Modifier une note (valeur, type, coefficient, date)
// @route   PUT /api/notes/:id
// @access  Privé (enseignant responsable de la matière)
const modifierNote = asyncHandler(async (req, res) => {
  const note = await Note.findById(req.params.id);
  if (!note) throw new AppError('Note introuvable', 404);

  const matiere = await Matiere.findById(note.matiere);
  if (!matiere) throw new AppError('La matière associée à cette note n\'existe plus', 404);
  verifierResponsableMatiere(matiere, req.utilisateur);

  // Seuls ces champs sont modifiables : l'élève, la matière et l'auteur restent figés
  const champs = validerChampsNote(garderChamps(req.body, CHAMPS_MODIFIABLES));
  if (!Object.keys(champs).length) {
    throw new AppError(
      'Aucune modification fournie (champs modifiables : valeur, type, coefficientNote, dateEvaluation)',
      400
    );
  }

  note.set(champs);
  await note.save();
  res.status(200).json({ succes: true, donnees: note });
});

// @desc    Supprimer une note
// @route   DELETE /api/notes/:id
// @access  Privé (enseignant responsable de la matière)
const supprimerNote = asyncHandler(async (req, res) => {
  const note = await Note.findById(req.params.id);
  if (!note) throw new AppError('Note introuvable', 404);

  // Une note "orpheline" (matière disparue) peut être nettoyée par n'importe quel enseignant
  const matiere = await Matiere.findById(note.matiere);
  if (matiere) verifierResponsableMatiere(matiere, req.utilisateur);

  await note.deleteOne();
  res.status(200).json({ succes: true, message: 'Note supprimée' });
});

module.exports = { creerNote, creerNotesLot, listerNotes, obtenirNote, modifierNote, supprimerNote };
