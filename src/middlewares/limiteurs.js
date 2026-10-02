const rateLimit = require('express-rate-limit');

const messageLimite = (texte) => ({ succes: false, message: texte });

// Pendant les tests automatisés, les limiteurs sont inactifs sauf si RATE_LIMIT_TEST=1
const ignorerEnTest = () => process.env.NODE_ENV === 'test' && !process.env.RATE_LIMIT_TEST;

// Anti force brute : seules les connexions ÉCHOUÉES comptent
const limiteurConnexion = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: () => Number(process.env.RATE_LIMIT_MAX) || 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: ignorerEnTest,
  message: messageLimite('Trop de tentatives de connexion. Réessayez dans 15 minutes.'),
});

module.exports = { limiteurConnexion };
