const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema(
  {
    eleve: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, "L'élève est obligatoire"],
    },
    matiere: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Matiere',
      required: [true, 'La matière est obligatoire'],
    },
    valeur: {
      type: Number,
      required: [true, 'La valeur de la note est obligatoire'],
      min: [0, 'La note ne peut pas être négative'],
      max: [20, 'La note ne peut pas dépasser 20'],
    },
    type: {
      type: String,
      enum: {
        values: ['devoir', 'examen', 'controle', 'tp'],
        message: 'Le type de note doit être : devoir, examen, controle ou tp',
      },
      default: 'devoir',
    },
    coefficientNote: {
      type: Number,
      default: 1,
      min: [1, 'Le coefficient de la note doit être au moins 1'],
      max: [20, 'Le coefficient de la note ne peut pas dépasser 20'],
    },
    dateEvaluation: {
      type: Date,
      default: Date.now,
    },
    ajouteePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// Accélère les requêtes fréquentes : notes d'un élève, notes d'une matière
noteSchema.index({ eleve: 1, matiere: 1 });
noteSchema.index({ matiere: 1 });

module.exports = mongoose.model('Note', noteSchema);
