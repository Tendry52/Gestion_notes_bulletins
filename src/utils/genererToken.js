const jwt = require('jsonwebtoken');

// "tv" = version des jetons de l'utilisateur : change à chaque changement de mot de passe
const genererToken = (id, role, tokenVersion = 0) => {
  return jwt.sign({ id, role, tv: tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

module.exports = genererToken;
