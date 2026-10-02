const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    nom: {
      type: String,
      required: [true, 'Le nom est obligatoire'],
      trim: true,
      maxlength: [100, 'Le nom ne doit pas dépasser 100 caractères'],
    },
    prenom: {
      type: String,
      required: [true, 'Le prénom est obligatoire'],
      trim: true,
      maxlength: [100, 'Le prénom ne doit pas dépasser 100 caractères'],
    },
    email: {
      type: String,
      required: [true, "L'email est obligatoire"],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [254, "L'email ne doit pas dépasser 254 caractères"],
      match: [/^\S+@\S+\.\S+$/, 'Email invalide'],
    },
    motDePasse: {
      type: String,
      required: [true, 'Le mot de passe est obligatoire'],
      minlength: [8, 'Le mot de passe doit contenir au moins 8 caractères'],
      select: false,
    },
    role: {
      type: String,
      enum: ['admin', 'enseignant', 'eleve'],
      required: [true, 'Le rôle est obligatoire'],
    },
    classe: {
      type: String,
      trim: true,
      maxlength: [50, 'La classe ne doit pas dépasser 50 caractères'],
      // Utile principalement pour les élèves ; doit correspondre à une classe créée par l'admin
    },
    // Informations personnelles de l'élève (saisies par l'admin, visibles de l'admin et de l'élève lui-même)
    dateNaissance: {
      type: Date,
    },
    adresse: {
      type: String,
      trim: true,
      maxlength: [200, "L'adresse ne doit pas dépasser 200 caractères"],
    },
    telephone: {
      type: String,
      trim: true,
      maxlength: [30, 'Le téléphone ne doit pas dépasser 30 caractères'],
    },
    tuteur: {
      type: String,
      trim: true,
      maxlength: [150, 'Le nom du tuteur ne doit pas dépasser 150 caractères'],
    },
    // Incrémenté à chaque changement de mot de passe : les anciens jetons deviennent invalides
    tokenVersion: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Hachage du mot de passe avant sauvegarde
userSchema.pre('save', async function (next) {
  if (!this.isModified('motDePasse')) return next();
  if (!this.isNew) this.tokenVersion = (this.tokenVersion || 0) + 1;
  const salt = await bcrypt.genSalt(10);
  this.motDePasse = await bcrypt.hash(this.motDePasse, salt);
  next();
});

// Comparaison du mot de passe fourni avec le hash stocké
userSchema.methods.comparerMotDePasse = async function (motDePasseSaisi) {
  return bcrypt.compare(motDePasseSaisi, this.motDePasse);
};

// Ne jamais renvoyer le hash ni le champ interne __v dans les réponses JSON
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.motDePasse;
    delete ret.__v;
    delete ret.tokenVersion;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
