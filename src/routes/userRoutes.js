const express = require('express');
const {
  listerEleves,
  creerEleve,
  modifierEleve,
  supprimerEleve,
  reinitialiserAccesEleve,
} = require('../controllers/userController');
const { proteger, autoriser } = require('../middlewares/auth');
const validerId = require('../middlewares/validerId');

const router = express.Router();

// Lecture : enseignant (fiche réduite) et admin (fiche complète).
// Création / modification / suppression / accès : administrateur seul.
router
  .route('/eleves')
  .get(proteger, autoriser('enseignant', 'admin'), listerEleves)
  .post(proteger, autoriser('admin'), creerEleve);

router
  .route('/eleves/:id')
  .put(proteger, autoriser('admin'), validerId('id'), modifierEleve)
  .delete(proteger, autoriser('admin'), validerId('id'), supprimerEleve);

router.post('/eleves/:id/acces', proteger, autoriser('admin'), validerId('id'), reinitialiserAccesEleve);

module.exports = router;
