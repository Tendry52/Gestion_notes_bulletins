// Logique de calcul des moyennes et du bulletin.
// Ces fonctions sont "pures" (aucun accès à la base) : elles sont donc faciles à tester.

const arrondir = (nombre) => Math.round((nombre + Number.EPSILON) * 100) / 100;

// Mention selon la moyenne générale
const calculerMention = (moyenne) => {
  if (moyenne === null || moyenne === undefined) return null;
  if (moyenne >= 16) return 'Très Bien';
  if (moyenne >= 14) return 'Bien';
  if (moyenne >= 12) return 'Assez Bien';
  if (moyenne >= 10) return 'Passable';
  return 'Insuffisant';
};

// Moyenne d'une matière = moyenne des notes pondérée par le coefficient de chaque note.
// Retourne null s'il n'y a aucune note.
const calculerMoyenneMatiere = (notes) => {
  const totalCoef = notes.reduce((acc, n) => acc + n.coefficientNote, 0);
  if (!notes.length || totalCoef <= 0) return null;
  const totalPoints = notes.reduce((acc, n) => acc + n.valeur * n.coefficientNote, 0);
  return totalPoints / totalCoef;
};

// Regroupe des notes (dont la matière est "populate") et calcule tout le bulletin.
// Les notes dont la matière a été supprimée sont ignorées.
const calculerBulletin = (notes) => {
  const groupes = new Map();
  notes.forEach((note) => {
    if (!note.matiere) return;
    const id = note.matiere._id.toString();
    if (!groupes.has(id)) groupes.set(id, { matiere: note.matiere, notes: [] });
    groupes.get(id).notes.push(note);
  });

  let totalPoints = 0;
  let totalCoefficients = 0;

  const matieres = [...groupes.values()]
    .map(({ matiere, notes: notesMatiere }) => {
      const moyenneBrute = calculerMoyenneMatiere(notesMatiere);
      totalPoints += moyenneBrute * matiere.coefficient;
      totalCoefficients += matiere.coefficient;

      return {
        matiereId: matiere._id,
        matiere: matiere.nom,
        coefficient: matiere.coefficient,
        nombreNotes: notesMatiere.length,
        notes: notesMatiere
          .slice()
          .sort((a, b) => new Date(a.dateEvaluation) - new Date(b.dateEvaluation))
          .map((n) => ({
            id: n._id,
            valeur: n.valeur,
            type: n.type,
            coefficientNote: n.coefficientNote,
            dateEvaluation: n.dateEvaluation,
          })),
        moyenneMatiere: arrondir(moyenneBrute),
      };
    })
    .sort((a, b) => a.matiere.localeCompare(b.matiere, 'fr'));

  const moyenneGenerale = totalCoefficients > 0 ? arrondir(totalPoints / totalCoefficients) : null;

  return { matieres, moyenneGenerale, mention: calculerMention(moyenneGenerale) };
};

// Rang d'un élève à partir des moyennes générales de sa classe (Map id -> moyenne).
// Les ex æquo partagent le même rang. Retourne null si l'élève n'a pas de moyenne.
const calculerRang = (moyennesParEleve, eleveId) => {
  const id = eleveId.toString();
  if (!moyennesParEleve.has(id)) return null;
  const maMoyenne = moyennesParEleve.get(id);
  let meilleurs = 0;
  moyennesParEleve.forEach((moyenne) => {
    if (moyenne > maMoyenne) meilleurs += 1;
  });
  return { rang: meilleurs + 1, effectif: moyennesParEleve.size };
};

// Statistiques d'une classe à partir des notes de chaque élève (Map id élève -> notes).
// Seuls les élèves ayant au moins une note comptent. Retourne :
//  - moyennesParEleve : Map id -> moyenne générale
//  - moyennesMatieres : Map id matière -> moyenne de la classe dans cette matière
//  - moyenneClasse    : moyenne des moyennes générales (null si personne n'a de note)
const calculerStatsClasse = (notesParEleve) => {
  const moyennesParEleve = new Map();
  const cumuls = new Map();

  notesParEleve.forEach((notes, cle) => {
    const { matieres, moyenneGenerale } = calculerBulletin(notes);
    if (moyenneGenerale === null) return;
    moyennesParEleve.set(cle, moyenneGenerale);
    matieres.forEach((m) => {
      const id = m.matiereId.toString();
      const cumul = cumuls.get(id) || { somme: 0, nombre: 0 };
      cumul.somme += m.moyenneMatiere;
      cumul.nombre += 1;
      cumuls.set(id, cumul);
    });
  });

  const moyennesMatieres = new Map();
  cumuls.forEach((cumul, id) => moyennesMatieres.set(id, arrondir(cumul.somme / cumul.nombre)));

  let somme = 0;
  moyennesParEleve.forEach((moyenne) => {
    somme += moyenne;
  });
  const moyenneClasse = moyennesParEleve.size ? arrondir(somme / moyennesParEleve.size) : null;

  return { moyennesParEleve, moyennesMatieres, moyenneClasse };
};

module.exports = {
  arrondir,
  calculerMention,
  calculerMoyenneMatiere,
  calculerBulletin,
  calculerRang,
  calculerStatsClasse,
};
