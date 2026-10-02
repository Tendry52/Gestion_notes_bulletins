const express = require('express');
const {
  creerNote,
  creerNotesLot,
  listerNotes,
  obtenirNote,
  modifierNote,
  supprimerNote,
} = require('../controllers/noteController');
const { proteger, autoriser } = require('../middlewares/auth');
const validerId = require('../middlewares/validerId');

const router = express.Router();

router.post('/lot', proteger, autoriser('enseignant'), creerNotesLot);

router
  .route('/')
  .get(proteger, listerNotes)
  .post(proteger, autoriser('enseignant'), creerNote);

router
  .route('/:id')
  .get(proteger, validerId('id'), obtenirNote)
  .put(proteger, autoriser('enseignant'), validerId('id'), modifierNote)
  .delete(proteger, autoriser('enseignant'), validerId('id'), supprimerNote);

module.exports = router;
