// Évite d'avoir à répéter try/catch dans chaque contrôleur
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
