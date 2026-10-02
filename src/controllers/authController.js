const bcrypt = require('bcryptjs');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const genererToken = require('../utils/genererToken');
const AppError = require('../utils/AppError');
const { exigerChaine } = require('../utils/validation');

// Hash factice : permet de faire le même travail que pour un vrai compte lorsque l'email
// n'existe pas, afin de ne pas révéler par le temps de réponse quels emails sont inscrits.
const HASH_FACTICE = bcrypt.hashSync('mot-de-passe-factice', 10);

const reponseUtilisateur = (utilisateur) => ({
  id: utilisateur._id,
  nom: utilisateur.nom,
  prenom: utilisateur.prenom,
  email: utilisateur.email,
  role: utilisateur.role,
  classe: utilisateur.classe,
  token: genererToken(utilisateur._id, utilisateur.role, utilisateur.tokenVersion),
});

// @desc    Connexion d'un utilisateur
// @route   POST /api/auth/connexion
// @access  Public
const connecter = asyncHandler(async (req, res) => {
  const corps = req.body || {};

  // Toujours des chaînes : empêche l'injection d'opérateurs MongoDB ({ "$ne": null })
  if (typeof corps.email !== 'string' || typeof corps.motDePasse !== 'string' || !corps.email || !corps.motDePasse) {
    throw new AppError("L'email et le mot de passe sont obligatoires (texte)", 400);
  }

  const email = corps.email.trim().toLowerCase();
  const utilisateur = await User.findOne({ email }).select('+motDePasse');

  const motDePasseValide = utilisateur
    ? await utilisateur.comparerMotDePasse(corps.motDePasse)
    : (await bcrypt.compare(corps.motDePasse, HASH_FACTICE), false);

  if (!utilisateur || !motDePasseValide) {
    throw new AppError('Email ou mot de passe incorrect', 401);
  }

  res.status(200).json({ succes: true, donnees: reponseUtilisateur(utilisateur) });
});

// @desc    Récupérer le profil de l'utilisateur connecté
// @route   GET /api/auth/profil
// @access  Privé
const obtenirProfil = asyncHandler(async (req, res) => {
  res.status(200).json({ succes: true, donnees: req.utilisateur });
});

// @desc    Changer son mot de passe (exige l'ancien)
// @route   PUT /api/auth/mot-de-passe
// @access  Privé
const changerMotDePasse = asyncHandler(async (req, res) => {
  const corps = req.body || {};
  if (typeof corps.ancienMotDePasse !== 'string' || !corps.ancienMotDePasse) {
    throw new AppError("Le champ \"ancienMotDePasse\" est obligatoire (texte)", 400);
  }
  const nouveau = exigerChaine(corps.nouveauMotDePasse, 'nouveauMotDePasse', { min: 8, max: 72 });

  const utilisateur = await User.findById(req.utilisateur._id).select('+motDePasse');
  if (!(await utilisateur.comparerMotDePasse(corps.ancienMotDePasse))) {
    throw new AppError('Ancien mot de passe incorrect', 400);
  }
  if (corps.ancienMotDePasse === nouveau) {
    throw new AppError("Le nouveau mot de passe doit être différent de l'ancien", 400);
  }

  utilisateur.motDePasse = nouveau; // haché par le hook pre('save')
  await utilisateur.save(); // incrémente tokenVersion : les autres sessions ouvertes sont déconnectées
  // Nouveau jeton pour que la session courante continue
  res.status(200).json({
    succes: true,
    message: 'Mot de passe modifié',
    donnees: { token: genererToken(utilisateur._id, utilisateur.role, utilisateur.tokenVersion) },
  });
});

module.exports = { connecter, obtenirProfil, changerMotDePasse };
