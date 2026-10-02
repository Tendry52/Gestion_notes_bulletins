const express = require('express');
const { genererBulletin, classementClasse } = require('../controllers/bulletinController');
const { proteger, autoriser } = require('../middlewares/auth');
const validerId = require('../middlewares/validerId');

const router = express.Router();

router.get('/classe/:classe', proteger, autoriser('enseignant', 'admin'), classementClasse);
router.get('/:eleveId', proteger, validerId('eleveId'), genererBulletin);

module.exports = router;
