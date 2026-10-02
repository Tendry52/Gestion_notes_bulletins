const express = require('express');
const { connecter, obtenirProfil, changerMotDePasse } = require('../controllers/authController');
const { proteger } = require('../middlewares/auth');
const { limiteurConnexion } = require('../middlewares/limiteurs');

const router = express.Router();

// Pas d'inscription publique : les comptes sont créés par l'administrateur (élèves, et enseignants avec leur matière)
router.post('/connexion', limiteurConnexion, connecter);
router.get('/profil', proteger, obtenirProfil);
// Les échecs (ancien mot de passe faux) comptent dans le limiteur anti force brute
router.put('/mot-de-passe', proteger, limiteurConnexion, changerMotDePasse);

module.exports = router;
