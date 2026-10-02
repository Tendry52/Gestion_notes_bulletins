const express = require('express');
const {
  creerMatiere,
  listerMatieres,
  obtenirMatiere,
  modifierMatiere,
  supprimerMatiere,
  reinitialiserAcces,
} = require('../controllers/matiereController');
const { proteger, autoriser } = require('../middlewares/auth');
const validerId = require('../middlewares/validerId');

const router = express.Router();

// Lecture : tout utilisateur connecté. Création / modification / suppression : administrateur seul.
router
  .route('/')
  .get(proteger, listerMatieres)
  .post(proteger, autoriser('admin'), creerMatiere);

router
  .route('/:id')
  .get(proteger, validerId('id'), obtenirMatiere)
  .put(proteger, autoriser('admin'), validerId('id'), modifierMatiere)
  .delete(proteger, autoriser('admin'), validerId('id'), supprimerMatiere);

// Génère (ou fixe) un nouveau mot de passe pour le compte de la matière
router.post('/:id/acces', proteger, autoriser('admin'), validerId('id'), reinitialiserAcces);

module.exports = router;
