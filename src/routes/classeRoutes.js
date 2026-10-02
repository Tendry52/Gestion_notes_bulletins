const express = require('express');
const {
  creerClasse,
  listerClasses,
  obtenirClasse,
  modifierClasse,
  supprimerClasse,
} = require('../controllers/classeController');
const { proteger, autoriser } = require('../middlewares/auth');
const validerId = require('../middlewares/validerId');

const router = express.Router();

// Lecture : admin et enseignants. Création / modification / suppression : administrateur seul.
router
  .route('/')
  .get(proteger, autoriser('admin', 'enseignant'), listerClasses)
  .post(proteger, autoriser('admin'), creerClasse);

router
  .route('/:id')
  .get(proteger, autoriser('admin', 'enseignant'), validerId('id'), obtenirClasse)
  .put(proteger, autoriser('admin'), validerId('id'), modifierClasse)
  .delete(proteger, autoriser('admin'), validerId('id'), supprimerClasse);

module.exports = router;
