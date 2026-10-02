// Remplit la base avec des données de démonstration.
//   npm run seed            → ajoute les données manquantes (ne supprime rien)
//   npm run seed -- --reset → vide d'abord les collections users / matieres / classes / notes
require('../src/config/env');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const { identifiantPourMatiere } = require('../src/utils/identifiants');
const Matiere = require('../src/models/Matiere');
const Note = require('../src/models/Note');
const Classe = require('../src/models/Classe');

const MOT_DE_PASSE_ADMIN = 'Admin12345';
const MOT_DE_PASSE_MATIERE = 'Matiere12345';
const MOT_DE_PASSE_ELEVE = 'Eleve12345';

// [nom, coefficient] — chaque matière a son propre compte de connexion (comme créé par l'admin)
const MATIERES = [
  ['Mathématiques', 4],
  ['Algorithmique', 3],
  ['Base de données', 3],
  ['Réseaux', 2],
  ['Anglais', 1],
];

const CLASSE = 'L2-IDEV';

// Notes par élève : une liste par matière (dans l'ordre de MATIERES), format [valeur, type, coefficient]
const ELEVES = [
  { nom: 'Andriamanana', prenom: 'Faly', email: 'eleve1@demo.mg', notes: [[[16, 'devoir', 1], [17, 'examen', 2]], [[15, 'tp', 1], [16, 'examen', 2]], [[14, 'controle', 1], [15, 'examen', 2]], [[17, 'tp', 1]], [[18, 'controle', 1]]] },
  { nom: 'Rasoanaivo', prenom: 'Lala', email: 'eleve2@demo.mg', notes: [[[12, 'devoir', 1], [13, 'examen', 2]], [[14, 'tp', 1], [12, 'examen', 2]], [[11, 'controle', 1], [13, 'examen', 2]], [[12, 'tp', 1]], [[15, 'controle', 1]]] },
  { nom: 'Randria', prenom: 'Hery', email: 'eleve3@demo.mg', notes: [[[9, 'devoir', 1], [8, 'examen', 2]], [[10, 'tp', 1], [9, 'examen', 2]], [[11, 'controle', 1], [8, 'examen', 2]], [[10, 'tp', 1]], [[12, 'controle', 1]]] },
  { nom: 'Ravelo', prenom: 'Miora', email: 'eleve4@demo.mg', notes: [[[18, 'devoir', 1], [19, 'examen', 2]], [[17, 'tp', 1], [18, 'examen', 2]], [[16, 'controle', 1], [17, 'examen', 2]], [[15, 'tp', 1]], [[16, 'controle', 1]]] },
  { nom: 'Rakotomalala', prenom: 'Tiana', email: 'eleve5@demo.mg', notes: [[[13, 'devoir', 1], [12, 'examen', 2]], [[11, 'tp', 1], [13, 'examen', 2]], [[12, 'controle', 1], [12, 'examen', 2]], [[13, 'tp', 1]], [[10, 'controle', 1]]] },
  { nom: 'Razafy', prenom: 'Koto', email: 'eleve6@demo.mg', notes: [] }, // élève sans note : sert à tester le bulletin vide
];

// Fiches des élèves (même ordre que ELEVES) : informations saisies par l'admin
const FICHES = [
  { dateNaissance: '2004-03-12', adresse: 'Lot II A 45 Ankadifotsy, Antananarivo', telephone: '034 12 345 67', tuteur: 'Mme Andriamanana — 034 12 345 68' },
  { dateNaissance: '2005-07-25', adresse: 'Lot 12 Ambohimanarina, Antananarivo', telephone: '033 22 456 78', tuteur: 'M. Rasoanaivo — 033 22 456 79' },
  { dateNaissance: '2003-11-02', adresse: '8 rue Rainandriamampandry, Antananarivo', telephone: '032 33 567 89', tuteur: 'Mme Randria — 032 33 567 90' },
  { dateNaissance: '2004-09-18', adresse: 'Lot IVG 7 Ivandry, Antananarivo', telephone: '034 44 678 90', tuteur: 'M. Ravelo — 034 44 678 91' },
  { dateNaissance: '2005-01-30', adresse: 'Lot 3 Analamahitsy, Antananarivo', telephone: '033 55 789 01', tuteur: 'Mme Rakotomalala — 033 55 789 02' },
  { dateNaissance: '2004-05-09', adresse: 'Lot VK 21 Ambatonakanga, Antananarivo', telephone: '032 66 890 12', tuteur: 'M. Razafy — 032 66 890 13' },
];

const trouverOuCreerUtilisateur = async (donnees) => {
  const existant = await User.findOne({ email: donnees.email });
  return existant || User.create(donnees);
};

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI manquant : copiez .env.example vers .env');
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    throw new Error('Refus de lancer le seed en production (ajoutez --force si c\'est voulu).');
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });

  if (process.argv.includes('--reset')) {
    await Promise.all([Note.deleteMany({}), Matiere.deleteMany({}), Classe.deleteMany({}), User.deleteMany({})]);
    console.log('Collections vidées (--reset).');
  }

  await trouverOuCreerUtilisateur({
    nom: 'Administrateur',
    prenom: 'Démo',
    email: 'admin@demo.mg',
    role: 'admin',
    motDePasse: MOT_DE_PASSE_ADMIN,
  });

  const matieres = [];
  const acces = [];
  for (const [nom, coefficient] of MATIERES) {
    let matiere = await Matiere.findOne({ nom });
    if (!matiere) {
      const email = identifiantPourMatiere(nom);
      const compte = await trouverOuCreerUtilisateur({
        nom,
        prenom: 'Enseignant',
        email,
        role: 'enseignant',
        motDePasse: MOT_DE_PASSE_MATIERE,
      });
      matiere = await Matiere.create({ nom, coefficient, enseignant: compte._id });
    }
    matieres.push(matiere);
    acces.push(identifiantPourMatiere(nom));
  }

  // La classe de démonstration, avec toutes les matières (donc tous les enseignants)
  await Classe.findOneAndUpdate(
    { nom: CLASSE },
    { $setOnInsert: { nom: CLASSE }, $addToSet: { matieres: { $each: matieres.map((m) => m._id) } } },
    { upsert: true }
  );

  let notesCreees = 0;
  for (const [i, e] of ELEVES.entries()) {
    const eleve = await trouverOuCreerUtilisateur({
      ...FICHES[i],
      nom: e.nom,
      prenom: e.prenom,
      email: e.email,
      role: 'eleve',
      classe: CLASSE,
      motDePasse: MOT_DE_PASSE_ELEVE,
    });
    if (await Note.exists({ eleve: eleve._id })) continue; // ne pas dupliquer les notes

    for (let i = 0; i < e.notes.length; i += 1) {
      for (const [valeur, type, coefficientNote] of e.notes[i]) {
        await Note.create({
          eleve: eleve._id,
          matiere: matieres[i]._id,
          valeur,
          type,
          coefficientNote,
          ajouteePar: matieres[i].enseignant,
        });
        notesCreees += 1;
      }
    }
  }

  console.log('\nDonnées de démonstration prêtes ✔');
  console.log(`  1 admin, ${matieres.length} matières (1 compte par matière), 1 classe (${CLASSE}), ${ELEVES.length} élèves, ${notesCreees} notes créées\n`);
  console.log('Comptes de démonstration :');
  console.log(`  Admin       : admin@demo.mg   (mot de passe : ${MOT_DE_PASSE_ADMIN})`);
  console.log(`  Matières    : ${acces.join(', ')}   (mot de passe : ${MOT_DE_PASSE_MATIERE})`);
  console.log(`  Élèves      : eleve1@demo.mg ... eleve6@demo.mg (mot de passe : ${MOT_DE_PASSE_ELEVE})`);
  console.log('  ⚠ Comptes de démo uniquement : ne les utilisez pas en production.\n');
};

main()
  .catch((erreur) => {
    console.error(`Erreur : ${erreur.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
