const User = require('../models/User');
const Note = require('../models/Note');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { regexExacte, exigerChaine } = require('../utils/validation');
const { calculerBulletin, calculerMention, calculerRang, calculerStatsClasse } = require('../services/bulletinService');

// Charge les élèves d'une classe (insensible à la casse) et calcule les statistiques de la classe
const statsDeLaClasse = async (classe) => {
  const eleves = await User.find({ role: 'eleve', classe: regexExacte(classe) })
    .select('nom prenom classe')
    .sort({ nom: 1, prenom: 1 });
  const notesClasse = await Note.find({ eleve: { $in: eleves.map((e) => e._id) } }).populate('matiere');

  const notesParEleve = new Map();
  notesClasse.forEach((note) => {
    const cle = note.eleve.toString();
    if (!notesParEleve.has(cle)) notesParEleve.set(cle, []);
    notesParEleve.get(cle).push(note);
  });

  return { eleves, ...calculerStatsClasse(notesParEleve) };
};

// @desc    Générer le bulletin d'un élève (avec rang et moyennes de la classe)
// @route   GET /api/bulletins/:eleveId
// @access  Privé (enseignant, ou l'élève lui-même)
const genererBulletin = asyncHandler(async (req, res) => {
  const { eleveId } = req.params;

  // Un élève ne peut consulter que son propre bulletin
  if (req.utilisateur.role === 'eleve' && req.utilisateur._id.toString() !== eleveId) {
    throw new AppError('Accès refusé : vous ne pouvez consulter que votre propre bulletin', 403);
  }

  const eleve = await User.findOne({ _id: eleveId, role: 'eleve' });
  if (!eleve) throw new AppError('Élève introuvable', 404);

  const notes = await Note.find({ eleve: eleve._id }).populate('matiere');
  const { matieres, moyenneGenerale, mention } = calculerBulletin(notes);

  const stats = moyenneGenerale !== null && eleve.classe ? await statsDeLaClasse(eleve.classe) : null;
  const classement = stats ? calculerRang(stats.moyennesParEleve, eleve._id) : null;
  const matieresDuBulletin = stats
    ? matieres.map((m) => ({ ...m, moyenneClasse: stats.moyennesMatieres.get(m.matiereId.toString()) ?? null }))
    : matieres;

  res.status(200).json({
    succes: true,
    donnees: {
      eleve: { id: eleve._id, nom: eleve.nom, prenom: eleve.prenom, classe: eleve.classe },
      matieres: matieresDuBulletin,
      moyenneGenerale,
      mention,
      rang: classement ? classement.rang : null,
      effectif: classement ? classement.effectif : null,
      moyenneClasse: stats ? stats.moyenneClasse : null,
      ...(moyenneGenerale === null && { message: 'Aucune note enregistrée pour cet élève.' }),
      dateGeneration: new Date(),
    },
  });
});

// @desc    Classement d'une classe : moyenne, mention et rang de chaque élève
// @route   GET /api/bulletins/classe/:classe
// @access  Privé (enseignant)
const classementClasse = asyncHandler(async (req, res) => {
  const classe = exigerChaine(req.params.classe, 'classe', { max: 50 });
  const stats = await statsDeLaClasse(classe);
  if (!stats.eleves.length) throw new AppError('Classe introuvable (aucun élève inscrit)', 404);

  const lignes = stats.eleves
    .map((eleve) => {
      const moyenne = stats.moyennesParEleve.get(eleve._id.toString()) ?? null;
      const classement = moyenne !== null ? calculerRang(stats.moyennesParEleve, eleve._id) : null;
      return {
        id: eleve._id,
        nom: eleve.nom,
        prenom: eleve.prenom,
        moyenneGenerale: moyenne,
        mention: calculerMention(moyenne),
        rang: classement ? classement.rang : null,
      };
    })
    // Classés par rang ; les élèves sans note à la fin (ordre alphabétique conservé)
    .sort((a, b) => (a.rang === null) - (b.rang === null) || (a.rang ?? 0) - (b.rang ?? 0));

  res.status(200).json({
    succes: true,
    donnees: {
      classe: stats.eleves[0].classe,
      effectif: stats.eleves.length,
      effectifNotes: stats.moyennesParEleve.size,
      moyenneClasse: stats.moyenneClasse,
      eleves: lignes,
    },
  });
});

module.exports = { genererBulletin, classementClasse };
