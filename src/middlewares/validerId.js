const AppError = require('../utils/AppError');
const { estObjectId } = require('../utils/validation');

// Vérifie que les paramètres de route indiqués sont des ObjectId MongoDB valides
const validerId = (...noms) => (req, res, next) => {
  for (const nom of noms) {
    if (!estObjectId(req.params[nom])) {
      return next(new AppError('Identifiant invalide', 400));
    }
  }
  next();
};

module.exports = validerId;
