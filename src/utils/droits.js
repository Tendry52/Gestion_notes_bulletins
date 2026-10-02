const AppError = require('./AppError');
const Classe = require('../models/Classe');
const { regexExacte } = require('./validation');

// Seul l'enseignant responsable d'une matière peut gérer les notes qui lui sont rattachées.
// (L'administrateur n'a volontairement aucun droit d'écriture sur les notes.)
const verifierResponsableMatiere = (matiere, utilisateur) => {
  if (matiere.enseignant.toString() !== utilisateur._id.toString()) {
    throw new AppError(
      `Accès refusé : vous n'êtes pas l'enseignant responsable de la matière "${matiere.nom}"`,
      403
    );
  }
};

// Une matière ne peut être notée que pour des élèves d'une classe où elle est enseignée.
// Pas de restriction pour un élève sans classe, ni pour une classe que l'admin n'a pas (encore)
// créée : cela préserve les données antérieures aux classes.
// `eleves` : documents élèves avec au moins { nom, prenom, classe }.
const verifierMatiereEnseignee = async (eleves, matiere) => {
  const parClasse = new Map();
  eleves.forEach((eleve) => {
    const nom = String(eleve.classe || '').trim();
    if (!nom) return;
    const cle = nom.toLowerCase();
    if (!parClasse.has(cle)) parClasse.set(cle, { nom, eleve });
  });

  for (const { nom, eleve } of parClasse.values()) {
    // eslint-disable-next-line no-await-in-loop
    const classe = await Classe.findOne({ nom: regexExacte(nom) });
    if (classe && !classe.matieres.some((id) => id.equals(matiere._id))) {
      throw new AppError(
        `La matière "${matiere.nom}" n'est pas enseignée dans la classe "${classe.nom}" (élève concerné : ${eleve.prenom} ${eleve.nom}). ` +
          "Demandez à l'administrateur de l'ajouter à la classe.",
        403
      );
    }
  }
};

module.exports = { verifierResponsableMatiere, verifierMatiereEnseignee };
