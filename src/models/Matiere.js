const mongoose = require('mongoose');

const matiereSchema = new mongoose.Schema(
  {
    nom: {
      type: String,
      required: [true, 'Le nom de la matière est obligatoire'],
      trim: true,
      unique: true,
      maxlength: [100, 'Le nom de la matière ne doit pas dépasser 100 caractères'],
    },
    coefficient: {
      type: Number,
      required: [true, 'Le coefficient est obligatoire'],
      min: [1, 'Le coefficient doit être au moins 1'],
      max: [20, 'Le coefficient ne peut pas dépasser 20'],
      default: 1,
    },
    enseignant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, "L'enseignant responsable est obligatoire"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Matiere', matiereSchema);
