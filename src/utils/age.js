// Âge en années entières à la date `maintenant` (null si pas de date de naissance).
// Calcul en UTC : les dates de naissance sont enregistrées à minuit UTC (AAAA-MM-JJ).
const calculerAge = (dateNaissance, maintenant = new Date()) => {
  if (!dateNaissance) return null;
  const naissance = new Date(dateNaissance);
  let age = maintenant.getUTCFullYear() - naissance.getUTCFullYear();
  const anniversairePasse =
    maintenant.getUTCMonth() > naissance.getUTCMonth() ||
    (maintenant.getUTCMonth() === naissance.getUTCMonth() && maintenant.getUTCDate() >= naissance.getUTCDate());
  if (!anniversairePasse) age -= 1;
  return age;
};

module.exports = { calculerAge };
