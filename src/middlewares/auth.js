const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const User = require('../models/User');

// Vérifie la présence et la validité du token JWT, puis charge l'utilisateur
const proteger = asyncHandler(async (req, res, next) => {
  const entete = req.headers.authorization || '';
  const [schema, token] = entete.split(' ');

  if (schema !== 'Bearer' || !token) {
    throw new AppError('Non autorisé : token manquant', 401);
  }

  let decode;
  try {
    decode = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Non autorisé : session expirée, veuillez vous reconnecter'
        : 'Non autorisé : token invalide';
    throw new AppError(message, 401);
  }

  // Le rôle est relu en base : un changement de rôle est pris en compte immédiatement
  const utilisateur = await User.findById(decode.id);
  if (!utilisateur) {
    throw new AppError('Non autorisé : utilisateur introuvable', 401);
  }

  // Jeton émis avant un changement / une réinitialisation de mot de passe : refusé
  if ((decode.tv || 0) !== (utilisateur.tokenVersion || 0)) {
    throw new AppError('Non autorisé : mot de passe modifié, veuillez vous reconnecter', 401);
  }

  req.utilisateur = utilisateur;
  next();
});

// Vérifie que l'utilisateur a l'un des rôles autorisés
const autoriser = (...rolesAutorises) => (req, res, next) => {
  if (!rolesAutorises.includes(req.utilisateur.role)) {
    throw new AppError(
      `Accès refusé : le rôle "${req.utilisateur.role}" n'est pas autorisé pour cette action`,
      403
    );
  }
  next();
};

module.exports = { proteger, autoriser };
