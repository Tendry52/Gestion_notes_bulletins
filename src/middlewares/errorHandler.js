// Middleware de gestion centralisée des erreurs
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Erreur interne du serveur';

  // Corps JSON mal formé ou trop volumineux (erreurs de body-parser)
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Corps de requête JSON invalide';
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Corps de requête trop volumineux';
  }

  // Erreur de validation Mongoose
  if (err.name === 'ValidationError' && err.errors) {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((val) => val.message)
      .join(', ');
  }

  // Identifiant / type invalide côté Mongoose
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Valeur invalide pour le champ "${err.path}"`;
  }

  // Doublon (index unique) : email ou nom de matière déjà utilisé
  if (err.code === 11000) {
    statusCode = 409;
    const champ = Object.keys(err.keyValue || {})[0] || 'valeur';
    message = `La valeur du champ "${champ}" existe déjà`;
  }

  if (statusCode >= 500) {
    if (process.env.NODE_ENV !== 'test') console.error(err);
    // On ne divulgue pas les détails internes en production
    if (process.env.NODE_ENV === 'production') message = 'Erreur interne du serveur';
  }

  res.status(statusCode).json({
    succes: false,
    message,
    ...(process.env.NODE_ENV === 'development' && statusCode >= 500 && { stack: err.stack }),
  });
};

const notFound = (req, res, next) => {
  const error = new Error(`Route non trouvée : ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

module.exports = { errorHandler, notFound };
