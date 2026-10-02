const mongoose = require('mongoose');

// Une classe est créée par l'administrateur et regroupe les matières qui y sont enseignées.
// Les enseignants d'une classe sont donc les responsables de ces matières.
// Les élèves y sont rattachés par le nom de la classe (champ "classe" de l'élève).
const classeSchema = new mongoose.Schema(
  {
    nom: {
      type: String,
      required: [true, 'Le nom de la classe est obligatoire'],
      trim: true,
      unique: true,
      maxlength: [50, 'Le nom de la classe ne doit pas dépasser 50 caractères'],
    },
    matieres: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Matiere' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Classe', classeSchema);
