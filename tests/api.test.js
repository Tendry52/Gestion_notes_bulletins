const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Matiere = require('../src/models/Matiere');
const Note = require('../src/models/Note');
const Classe = require('../src/models/Classe');
const { connecterBaseDeTest, viderBase, deconnecterBaseDeTest } = require('./helpers/db');

const MDP = 'motdepasse123';
const ID_INCONNU = '507f1f77bcf86cd799439011';

// --- Petits utilitaires de test ---
// Par défaut, toute classe de test enseigne toutes les matières de test (et inversement) : les tests
// qui portent sur les classes créent explicitement leurs classes avec les matières voulues.
const assurerClasse = async (nom) => {
  const existante = await Classe.findOne({ nom: new RegExp(`^${nom}$`, 'i') });
  if (existante) return existante;
  const matieres = await Matiere.find().select('_id');
  return Classe.create({ nom, matieres: matieres.map((m) => m._id) });
};
let compteur = 0;
const inscrire = async (role, extra = {}) => {
  compteur += 1;
  const corps = {
    nom: `Nom${compteur}`,
    prenom: `Prenom${compteur}`,
    email: `user${compteur}@test.mg`,
    motDePasse: MDP,
    role,
    ...extra,
  };
  // Aucun compte ne s'auto-inscrit : on crée le compte en base (l'admin le fait via l'API), puis on se connecte.
  if (role === 'eleve' && corps.classe) corps.classe = (await assurerClasse(corps.classe)).nom;
  await User.create(corps);
  const connexion = await request(app).post('/api/auth/connexion').send({ email: corps.email, motDePasse: MDP });
  expect(connexion.status).toBe(200);
  return { ...connexion.body.donnees, jeton: connexion.body.donnees.token };
};
const inscrireAdmin = () => inscrire('admin');
const auth = (utilisateur) => ({ Authorization: `Bearer ${utilisateur.jeton}` });

// Matière rattachée directement à un enseignant existant (raccourci pour les tests de notes/bulletins).
// La création par l'admin, avec génération du compte, est testée dans « Matières ».
const creerMatiere = async (prof, nom = 'Mathématiques', coefficient = 3) => {
  const matiere = await Matiere.create({ nom, coefficient, enseignant: prof.id });
  await Classe.updateMany({}, { $addToSet: { matieres: matiere._id } });
  return { ...matiere.toJSON(), _id: matiere._id.toString() };
};
const creerNote = async (prof, eleve, matiere, valeur, extra = {}) => {
  const res = await request(app)
    .post('/api/notes')
    .set(auth(prof))
    .send({ eleve: eleve.id, matiere: matiere._id, valeur, ...extra });
  expect(res.status).toBe(201);
  return res.body.donnees;
};

beforeAll(connecterBaseDeTest);
beforeEach(viderBase);
afterAll(deconnecterBaseDeTest);

describe('Général', () => {
  test('GET /api/sante répond ok', async () => {
    const res = await request(app).get('/api/sante');
    expect(res.status).toBe(200);
    expect(res.body.statut).toBe('ok');
  });

  test('route inconnue → 404 JSON', async () => {
    const res = await request(app).get('/api/nimporte-quoi');
    expect(res.status).toBe(404);
    expect(res.body.succes).toBe(false);
  });

  test('JSON invalide → 400 propre', async () => {
    const res = await request(app)
      .post('/api/auth/connexion')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/JSON invalide/);
  });

  test('sert le frontend et envoie les en-têtes de sécurité (helmet)', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Gestion des Notes');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).not.toMatch(/upgrade-insecure-requests/);
  });
});

describe('Authentification', () => {
  test('un élève peut se connecter ; le mot de passe n’est jamais renvoyé', async () => {
    const eleve = await inscrire('eleve', { classe: 'L2-IDEV' });
    expect(eleve.role).toBe('eleve');
    expect(eleve.classe).toBe('L2-IDEV');
    expect(eleve.motDePasse).toBeUndefined();

    const res = await request(app).post('/api/auth/connexion').send({ email: `USER1@test.mg`, motDePasse: MDP });
    expect(res.status).toBe(200);
    expect(res.body.donnees.token).toBeTruthy();

    const profil = await request(app).get('/api/auth/profil').set(auth(eleve));
    expect(profil.status).toBe(200);
    expect(profil.body.donnees.email).toBe('user1@test.mg');
    expect(profil.body.donnees.motDePasse).toBeUndefined();
  });

  test('il n’existe plus d’inscription publique : aucun compte ne peut se créer seul', async () => {
    for (const role of [undefined, 'eleve', 'enseignant', 'admin']) {
      const res = await request(app)
        .post('/api/auth/inscription')
        .send({ nom: 'A', prenom: 'B', email: 'x@test.mg', motDePasse: MDP, classe: 'L2', role });
      expect(res.status).toBe(404);
    }
    expect(await User.countDocuments()).toBe(0);
  });

  test('connexion : mauvais mot de passe / email inconnu → 401 avec le même message', async () => {
    await inscrire('eleve');
    const a = await request(app).post('/api/auth/connexion').send({ email: 'user1@test.mg', motDePasse: 'mauvaismdp1' });
    const b = await request(app).post('/api/auth/connexion').send({ email: 'inconnu@test.mg', motDePasse: 'mauvaismdp1' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });

  test('injection NoSQL sur la connexion refusée', async () => {
    await inscrire('eleve');
    const res = await request(app).post('/api/auth/connexion').send({ email: { $ne: null }, motDePasse: { $ne: null } });
    expect(res.status).toBe(400);
  });

  test('accès sans token, avec faux token → 401', async () => {
    expect((await request(app).get('/api/matieres')).status).toBe(401);
    const faux = await request(app).get('/api/matieres').set('Authorization', 'Bearer abc.def.ghi');
    expect(faux.status).toBe(401);
  });

  test('limitation des tentatives de connexion ratées (429)', async () => {
    process.env.RATE_LIMIT_TEST = '1';
    process.env.RATE_LIMIT_MAX = '3';
    try {
      const statuts = [];
      for (let i = 0; i < 5; i += 1) {
        const res = await request(app).post('/api/auth/connexion').send({ email: 'x@test.mg', motDePasse: 'mauvaismdp1' });
        statuts.push(res.status);
      }
      expect(statuts.slice(0, 3)).toEqual([401, 401, 401]);
      expect(statuts[3]).toBe(429);
    } finally {
      delete process.env.RATE_LIMIT_TEST;
      delete process.env.RATE_LIMIT_MAX;
    }
  });
});

describe('Matières et rôle admin', () => {
  const creerViaApi = (admin, corps) => request(app).post('/api/matieres').set(auth(admin)).send(corps);

  test('seul l’admin crée une matière : élèves et enseignants reçoivent 403', async () => {
    const prof = await inscrire('enseignant');
    const eleve = await inscrire('eleve');
    for (const u of [prof, eleve]) {
      const res = await creerViaApi(u, { nom: 'Hack', coefficient: 1 });
      expect(res.status).toBe(403);
    }
    expect(await Matiere.countDocuments()).toBe(0);
    expect((await request(app).post('/api/matieres').send({ nom: 'X' })).status).toBe(401);
  });

  test('l’admin crée une matière + son compte ; l’enseignant se connecte avec ces identifiants', async () => {
    const admin = await inscrireAdmin();
    const res = await creerViaApi(admin, { nom: 'Base de données', coefficient: 3 });
    expect(res.status).toBe(201);
    const { identifiant, motDePasse } = res.body.acces;
    expect(identifiant).toBe('base-de-donnees@matieres.local');
    expect(motDePasse).toHaveLength(12);
    expect(res.body.donnees.coefficient).toBe(3);

    // Le mot de passe n'est jamais stocké en clair ni renvoyé ailleurs
    const compte = await User.findOne({ email: identifiant }).select('+motDePasse');
    expect(compte.role).toBe('enseignant');
    expect(compte.motDePasse).not.toBe(motDePasse);
    expect(res.body.donnees.enseignant).toBe(compte._id.toString());

    const connexion = await request(app).post('/api/auth/connexion').send({ email: identifiant, motDePasse });
    expect(connexion.status).toBe(200);
    expect(connexion.body.donnees.role).toBe('enseignant');
    const prof = { jeton: connexion.body.donnees.token, id: connexion.body.donnees.id };

    // Il peut noter dans SA matière
    const eleve = await inscrire('eleve');
    const note = await request(app)
      .post('/api/notes')
      .set(auth(prof))
      .send({ eleve: eleve.id, matiere: res.body.donnees._id, valeur: 15 });
    expect(note.status).toBe(201);
  });

  test('création : identifiant / mot de passe personnalisés, doublons, validations', async () => {
    const admin = await inscrireAdmin();

    const perso = await creerViaApi(admin, {
      nom: 'Anglais',
      identifiant: 'Anglais@Ecole.MG',
      motDePasse: 'MotDePasse-Solide1',
      enseignantNom: 'Rabe',
      enseignantPrenom: 'Marie',
    });
    expect(perso.status).toBe(201);
    expect(perso.body.acces).toEqual({ identifiant: 'anglais@ecole.mg', motDePasse: 'MotDePasse-Solide1' });
    expect(perso.body.donnees.coefficient).toBe(1);
    const compte = await User.findOne({ email: 'anglais@ecole.mg' });
    expect([compte.nom, compte.prenom]).toEqual(['Rabe', 'Marie']);

    // Nom déjà pris (insensible à la casse) ; identifiant déjà pris
    expect((await creerViaApi(admin, { nom: 'ANGLAIS' })).status).toBe(409);
    expect((await creerViaApi(admin, { nom: 'Autre', identifiant: 'anglais@ecole.mg' })).status).toBe(409);

    // Deux noms qui donnent le même identifiant automatique : le second est suffixé
    const a = await creerViaApi(admin, { nom: 'Réseaux' });
    const b = await creerViaApi(admin, { nom: 'Reseaux!' });
    expect(a.body.acces.identifiant).toBe('reseaux@matieres.local');
    expect(b.body.acces.identifiant).toBe('reseaux-2@matieres.local');

    // Validations (aucun compte orphelin ne doit rester après un refus)
    const avant = await User.countDocuments();
    expect((await creerViaApi(admin, { coefficient: 2 })).status).toBe(400);
    expect((await creerViaApi(admin, { nom: 'X', coefficient: 0 })).status).toBe(400);
    expect((await creerViaApi(admin, { nom: 'X', coefficient: 99 })).status).toBe(400);
    expect((await creerViaApi(admin, { nom: 'X', coefficient: 'abc' })).status).toBe(400);
    expect((await creerViaApi(admin, { nom: { $ne: 1 }, coefficient: 2 })).status).toBe(400);
    expect((await creerViaApi(admin, { nom: 'X', motDePasse: 'court' })).status).toBe(400);
    expect((await creerViaApi(admin, { nom: 'X', identifiant: 'pas-un-email' })).status).toBe(400);
    expect(await User.countDocuments()).toBe(avant);
  });

  test('lecture par tous, l’identifiant de connexion n’est visible que par l’admin', async () => {
    const admin = await inscrireAdmin();
    const eleve = await inscrire('eleve');
    const maths = (await creerViaApi(admin, { nom: 'Mathématiques', coefficient: 3 })).body.donnees;
    await creerViaApi(admin, { nom: 'Anglais', coefficient: 1 });

    const vueEleve = await request(app).get(`/api/matieres/${maths._id}`).set(auth(eleve));
    expect(vueEleve.status).toBe(200);
    expect(vueEleve.body.donnees.enseignant.email).toBeUndefined();

    const vueAdmin = await request(app).get(`/api/matieres/${maths._id}`).set(auth(admin));
    expect(vueAdmin.body.donnees.enseignant.email).toBe('mathematiques@matieres.local');
    const liste = await request(app).get('/api/matieres').set(auth(admin));
    expect(liste.body.donnees.every((m) => m.enseignant.email)).toBe(true);
    const listeEleve = await request(app).get('/api/matieres').set(auth(eleve));
    expect(listeEleve.body.donnees.every((m) => m.enseignant.email === undefined)).toBe(true);

    const recherche = await request(app).get('/api/matieres?recherche=angl').set(auth(eleve));
    expect(recherche.body.donnees.map((m) => m.nom)).toEqual(['Anglais']);
    expect((await request(app).get('/api/matieres?recherche[$ne]=x').set(auth(eleve))).status).toBe(400);
    expect((await request(app).get('/api/matieres/abc').set(auth(eleve))).status).toBe(400);
    expect((await request(app).get(`/api/matieres/${ID_INCONNU}`).set(auth(eleve))).status).toBe(404);
  });

  test('pagination', async () => {
    const admin = await inscrireAdmin();
    for (const nom of ['A', 'B', 'C']) await creerViaApi(admin, { nom });
    const res = await request(app).get('/api/matieres?limite=2&page=2').set(auth(admin));
    expect(res.body.donnees.map((m) => m.nom)).toEqual(['C']);
    expect(res.body.pagination).toEqual({ page: 2, limite: 2, total: 3, pages: 2 });
  });

  test('modification : admin seul, champs protégés', async () => {
    const admin = await inscrireAdmin();
    const prof = await inscrire('enseignant');
    const maths = await creerMatiere(prof);
    await creerMatiere(prof, 'Anglais', 1);
    const put = (u, corps, id = maths._id) => request(app).put(`/api/matieres/${id}`).set(auth(u)).send(corps);

    // Même l'enseignant responsable ne peut plus modifier sa matière
    expect((await put(prof, { coefficient: 5 })).status).toBe(403);

    // Le champ "enseignant" est ignoré (pas de prise de contrôle)
    const maj = await put(admin, { coefficient: 5, nom: 'Maths avancées', enseignant: admin.id });
    expect(maj.status).toBe(200);
    expect(maj.body.donnees.coefficient).toBe(5);
    expect(maj.body.donnees.nom).toBe('Maths avancées');
    expect(maj.body.donnees.enseignant).toBe(prof.id);

    expect((await put(admin, {})).status).toBe(400);
    expect((await put(admin, { coefficient: -2 })).status).toBe(400);
    expect((await put(admin, { nom: 'ANGLAIS' })).status).toBe(409);
    expect((await put(admin, { nom: 'MATHS AVANCÉES' })).status).toBe(200);
  });

  test('suppression : admin seul ; supprime les notes et le compte de la matière', async () => {
    const admin = await inscrireAdmin();
    const eleve = await inscrire('eleve');
    const cree = await creerViaApi(admin, { nom: 'Maths' });
    const { identifiant, motDePasse } = cree.body.acces;
    const prof = {
      jeton: (await request(app).post('/api/auth/connexion').send({ email: identifiant, motDePasse })).body.donnees.token,
    };
    const matiereId = cree.body.donnees._id;
    for (const valeur of [12, 14]) {
      await request(app).post('/api/notes').set(auth(prof)).send({ eleve: eleve.id, matiere: matiereId, valeur });
    }

    expect((await request(app).delete(`/api/matieres/${matiereId}`).set(auth(prof))).status).toBe(403);
    expect((await request(app).delete(`/api/matieres/${matiereId}`).set(auth(eleve))).status).toBe(403);

    const res = await request(app).delete(`/api/matieres/${matiereId}`).set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.notesSupprimees).toBe(2);
    expect(res.body.compteEnseignantSupprime).toBe(true);
    expect(await Note.countDocuments()).toBe(0);
    expect(await User.exists({ email: identifiant })).toBeNull();

    // L'ancien token de l'enseignant ne donne plus rien, et ses identifiants non plus
    expect((await request(app).get('/api/matieres').set(auth(prof))).status).toBe(401);
    expect((await request(app).post('/api/auth/connexion').send({ email: identifiant, motDePasse })).status).toBe(401);
    expect((await request(app).get(`/api/matieres/${matiereId}`).set(auth(admin))).status).toBe(404);
  });

  test('suppression : le compte est conservé s’il gère encore une autre matière', async () => {
    const admin = await inscrireAdmin();
    const prof = await inscrire('enseignant');
    const m1 = await creerMatiere(prof, 'M1');
    await creerMatiere(prof, 'M2');
    const res = await request(app).delete(`/api/matieres/${m1._id}`).set(auth(admin));
    expect(res.body.compteEnseignantSupprime).toBe(false);
    expect(await User.exists({ _id: prof.id })).toBeTruthy();
  });

  test('réinitialisation des accès : admin seul, ancien mot de passe invalidé', async () => {
    const admin = await inscrireAdmin();
    const cree = await creerViaApi(admin, { nom: 'Maths' });
    const { identifiant, motDePasse: ancien } = cree.body.acces;
    const id = cree.body.donnees._id;
    const prof = { jeton: (await request(app).post('/api/auth/connexion').send({ email: identifiant, motDePasse: ancien })).body.donnees.token };

    expect((await request(app).post(`/api/matieres/${id}/acces`).set(auth(prof))).status).toBe(403);
    expect((await request(app).post(`/api/matieres/${ID_INCONNU}/acces`).set(auth(admin))).status).toBe(404);
    expect((await request(app).post(`/api/matieres/${id}/acces`).set(auth(admin)).send({ motDePasse: 'court' })).status).toBe(400);

    const gen = await request(app).post(`/api/matieres/${id}/acces`).set(auth(admin)).send({});
    expect(gen.status).toBe(200);
    expect(gen.body.acces.identifiant).toBe(identifiant);
    const nouveau = gen.body.acces.motDePasse;
    expect(nouveau).not.toBe(ancien);
    expect((await request(app).post('/api/auth/connexion').send({ email: identifiant, motDePasse: ancien })).status).toBe(401);
    expect((await request(app).post('/api/auth/connexion').send({ email: identifiant, motDePasse: nouveau })).status).toBe(200);

    const fixe = await request(app).post(`/api/matieres/${id}/acces`).set(auth(admin)).send({ motDePasse: 'Choisi-Par-Admin1' });
    expect(fixe.body.acces.motDePasse).toBe('Choisi-Par-Admin1');
    expect((await request(app).post('/api/auth/connexion').send({ email: identifiant, motDePasse: 'Choisi-Par-Admin1' })).status).toBe(200);
  });

  test('l’admin ne peut modifier aucune note (ajout, lot, modification, suppression) mais peut consulter', async () => {
    const admin = await inscrireAdmin();
    const prof = await inscrire('enseignant');
    const eleve = await inscrire('eleve', { classe: 'L2' });
    const maths = await creerMatiere(prof);
    const note = await creerNote(prof, eleve, maths, 12);

    const attendu403 = [
      request(app).post('/api/notes').set(auth(admin)).send({ eleve: eleve.id, matiere: maths._id, valeur: 20 }),
      request(app).post('/api/notes/lot').set(auth(admin)).send({ matiere: maths._id, notes: [{ eleve: eleve.id, valeur: 20 }] }),
      request(app).put(`/api/notes/${note._id}`).set(auth(admin)).send({ valeur: 20 }),
      request(app).delete(`/api/notes/${note._id}`).set(auth(admin)),
    ];
    for (const res of await Promise.all(attendu403)) expect(res.status).toBe(403);
    expect((await Note.findById(note._id)).valeur).toBe(12);

    // Consultation seule : notes, élèves, bulletin, classement
    expect((await request(app).get(`/api/notes?eleve=${eleve.id}`).set(auth(admin))).body.donnees).toHaveLength(1);
    expect((await request(app).get('/api/users/eleves').set(auth(admin))).status).toBe(200);
    expect((await request(app).get(`/api/bulletins/${eleve.id}`).set(auth(admin))).status).toBe(200);
    expect((await request(app).get('/api/bulletins/classe/L2').set(auth(admin))).status).toBe(200);
  });

  test('l’enseignant ne peut toujours pas noter dans la matière d’un autre', async () => {
    const admin = await inscrireAdmin();
    const eleve = await inscrire('eleve');
    const maths = (await creerViaApi(admin, { nom: 'Maths' })).body.donnees;
    const autre = await inscrire('enseignant');
    const res = await request(app).post('/api/notes').set(auth(autre)).send({ eleve: eleve.id, matiere: maths._id, valeur: 10 });
    expect(res.status).toBe(403);
  });
});

describe('Notes (CRUD + droits)', () => {
  test('création valide, puis validations (valeur, type, coefficient, ids)', async () => {
    const prof = await inscrire('enseignant');
    const eleve = await inscrire('eleve');
    const maths = await creerMatiere(prof);
    const post = (corps) => request(app).post('/api/notes').set(auth(prof)).send(corps);
    const base = { eleve: eleve.id, matiere: maths._id, valeur: 15 };

    const ok = await post({ ...base, type: 'examen', coefficientNote: 2 });
    expect(ok.status).toBe(201);
    expect(ok.body.donnees.ajouteePar).toBe(prof.id);
    expect(ok.body.donnees.type).toBe('examen');

    expect((await post({ ...base, valeur: 21 })).status).toBe(400);
    expect((await post({ ...base, valeur: -1 })).status).toBe(400);
    expect((await post({ ...base, valeur: 'abc' })).status).toBe(400);
    expect((await post({ eleve: base.eleve, matiere: base.matiere })).status).toBe(400);
    expect((await post({ ...base, type: 'bidon' })).status).toBe(400);
    expect((await post({ ...base, coefficientNote: 0 })).status).toBe(400);
    expect((await post({ ...base, dateEvaluation: 'pas une date' })).status).toBe(400);
    expect((await post({ ...base, eleve: 'abc' })).status).toBe(400);
    expect((await post({ ...base, eleve: ID_INCONNU })).status).toBe(404);
    expect((await post({ ...base, matiere: ID_INCONNU })).status).toBe(404);
    // On ne peut pas noter un enseignant
    expect((await post({ ...base, eleve: prof.id })).status).toBe(404);
  });

  test('un élève ne peut pas créer, modifier ni supprimer de note', async () => {
    const prof = await inscrire('enseignant');
    const eleve = await inscrire('eleve');
    const maths = await creerMatiere(prof);
    const note = await creerNote(prof, eleve, maths, 10);

    expect((await request(app).post('/api/notes').set(auth(eleve)).send({ eleve: eleve.id, matiere: maths._id, valeur: 20 })).status).toBe(403);
    expect((await request(app).put(`/api/notes/${note._id}`).set(auth(eleve)).send({ valeur: 20 })).status).toBe(403);
    expect((await request(app).delete(`/api/notes/${note._id}`).set(auth(eleve))).status).toBe(403);
  });

  test('seul l’enseignant responsable de la matière peut noter, modifier, supprimer', async () => {
    const prof = await inscrire('enseignant');
    const autreProf = await inscrire('enseignant');
    const eleve = await inscrire('eleve');
    const maths = await creerMatiere(prof);
    const note = await creerNote(prof, eleve, maths, 10);

    const creation = await request(app).post('/api/notes').set(auth(autreProf)).send({ eleve: eleve.id, matiere: maths._id, valeur: 5 });
    expect(creation.status).toBe(403);
    expect((await request(app).put(`/api/notes/${note._id}`).set(auth(autreProf)).send({ valeur: 20 })).status).toBe(403);
    expect((await request(app).delete(`/api/notes/${note._id}`).set(auth(autreProf))).status).toBe(403);
  });

  test('modification : champs protégés (élève, matière, auteur) et validation', async () => {
    const prof = await inscrire('enseignant');
    const eleve = await inscrire('eleve');
    const autreEleve = await inscrire('eleve');
    const maths = await creerMatiere(prof);
    const anglais = await creerMatiere(prof, 'Anglais', 1);
    const note = await creerNote(prof, eleve, maths, 10);

    const maj = await request(app)
      .put(`/api/notes/${note._id}`)
      .set(auth(prof))
      .send({ valeur: 17.5, type: 'tp', eleve: autreEleve.id, matiere: anglais._id, ajouteePar: autreEleve.id });
    expect(maj.status).toBe(200);
    expect(maj.body.donnees.valeur).toBe(17.5);
    expect(maj.body.donnees.type).toBe('tp');
    expect(maj.body.donnees.eleve).toBe(eleve.id);
    expect(maj.body.donnees.matiere).toBe(maths._id);
    expect(maj.body.donnees.ajouteePar).toBe(prof.id);

    expect((await request(app).put(`/api/notes/${note._id}`).set(auth(prof)).send({ valeur: 25 })).status).toBe(400);
    expect((await request(app).put(`/api/notes/${note._id}`).set(auth(prof)).send({})).status).toBe(400);
    expect((await request(app).put(`/api/notes/${ID_INCONNU}`).set(auth(prof)).send({ valeur: 5 })).status).toBe(404);
  });

  test('suppression d’une note', async () => {
    const prof = await inscrire('enseignant');
    const eleve = await inscrire('eleve');
    const maths = await creerMatiere(prof);
    const note = await creerNote(prof, eleve, maths, 10);

    expect((await request(app).delete(`/api/notes/${note._id}`).set(auth(prof))).status).toBe(200);
    expect((await request(app).get(`/api/notes/${note._id}`).set(auth(prof))).status).toBe(404);
    expect((await request(app).delete(`/api/notes/${note._id}`).set(auth(prof))).status).toBe(404);
  });

  test('un élève ne voit que ses notes ; filtres et pagination pour l’enseignant', async () => {
    const prof = await inscrire('enseignant');
    const eleve1 = await inscrire('eleve');
    const eleve2 = await inscrire('eleve');
    const maths = await creerMatiere(prof);
    const anglais = await creerMatiere(prof, 'Anglais', 1);
    await creerNote(prof, eleve1, maths, 10);
    await creerNote(prof, eleve1, anglais, 12);
    const noteEleve2 = await creerNote(prof, eleve2, maths, 14);

    // Élève : uniquement ses notes, même s’il tente de filtrer sur un autre élève
    const miennes = await request(app).get(`/api/notes?eleve=${eleve2.id}`).set(auth(eleve1));
    expect(miennes.body.donnees).toHaveLength(2);
    miennes.body.donnees.forEach((n) => expect(n.eleve._id).toBe(eleve1.id));

    // Élève : ne peut pas lire la note d’un autre
    expect((await request(app).get(`/api/notes/${noteEleve2._id}`).set(auth(eleve1))).status).toBe(403);
    expect((await request(app).get(`/api/notes/${noteEleve2._id}`).set(auth(eleve2))).status).toBe(200);

    // Enseignant : voit tout, filtre par élève / matière
    expect((await request(app).get('/api/notes').set(auth(prof))).body.donnees).toHaveLength(3);
    expect((await request(app).get(`/api/notes?eleve=${eleve1.id}`).set(auth(prof))).body.donnees).toHaveLength(2);
    expect((await request(app).get(`/api/notes?matiere=${maths._id}`).set(auth(prof))).body.donnees).toHaveLength(2);
    const paginee = await request(app).get('/api/notes?limite=2').set(auth(prof));
    expect(paginee.body.donnees).toHaveLength(2);
    expect(paginee.body.pagination.total).toBe(3);

    // Filtres invalides / injection
    expect((await request(app).get('/api/notes?eleve=abc').set(auth(prof))).status).toBe(400);
    expect((await request(app).get('/api/notes?eleve[$ne]=x').set(auth(prof))).status).toBe(400);
    expect((await request(app).get('/api/notes?matiere[$gt]=').set(auth(prof))).status).toBe(400);
  });
});

describe('Utilisateurs', () => {
  test('liste des élèves : enseignant et admin seulement, filtre par classe', async () => {
    const prof = await inscrire('enseignant');
    const eleve = await inscrire('eleve', { classe: 'L2-IDEV' });
    await inscrire('eleve', { classe: 'L3-GL' });

    expect((await request(app).get('/api/users/eleves').set(auth(eleve))).status).toBe(403);
    expect((await request(app).get('/api/users/eleves')).status).toBe(401);

    const tous = await request(app).get('/api/users/eleves').set(auth(prof));
    expect(tous.body.donnees).toHaveLength(2);
    tous.body.donnees.forEach((e) => expect(e.motDePasse).toBeUndefined());

    const filtre = await request(app).get('/api/users/eleves?classe=l2-idev').set(auth(prof));
    expect(filtre.body.donnees).toHaveLength(1);
    expect((await request(app).get('/api/users/eleves?classe[$ne]=x').set(auth(prof))).status).toBe(400);
  });

  test('vie privée : l’enseignant ne reçoit ni identifiant, ni adresse, ni téléphone ; l’admin reçoit toute la fiche', async () => {
    const admin = await inscrireAdmin();
    const prof = await inscrire('enseignant');
    await inscrire('eleve', {
      classe: 'L2',
      dateNaissance: new Date('2004-03-12T00:00:00Z'),
      adresse: '12 rue des Fleurs',
      telephone: '034 12 345 67',
      tuteur: 'Mme Rakoto',
    });

    const [vueProf] = (await request(app).get('/api/users/eleves').set(auth(prof))).body.donnees;
    expect(Object.keys(vueProf).sort()).toEqual(['_id', 'classe', 'nom', 'prenom']);

    const [vueAdmin] = (await request(app).get('/api/users/eleves').set(auth(admin))).body.donnees;
    expect(vueAdmin).toMatchObject({ classe: 'L2', adresse: '12 rue des Fleurs', telephone: '034 12 345 67', tuteur: 'Mme Rakoto' });
    expect(vueAdmin.email).toMatch(/@test\.mg$/);
    expect(typeof vueAdmin.age).toBe('number');
    expect(vueAdmin.motDePasse).toBeUndefined();
    expect(vueAdmin.tokenVersion).toBeUndefined();
  });
});

describe('Bulletins', () => {
  test('calcule les moyennes par matière, la moyenne générale et la mention', async () => {
    const prof = await inscrire('enseignant');
    const eleve = await inscrire('eleve', { classe: 'L2-IDEV' });
    const maths = await creerMatiere(prof, 'Mathématiques', 3);
    const info = await creerMatiere(prof, 'Informatique', 2);

    await creerNote(prof, eleve, maths, 12, { coefficientNote: 1 });
    await creerNote(prof, eleve, maths, 16, { coefficientNote: 2 });
    await creerNote(prof, eleve, info, 10);

    const res = await request(app).get(`/api/bulletins/${eleve.id}`).set(auth(prof));
    expect(res.status).toBe(200);
    const b = res.body.donnees;
    expect(b.eleve.nom).toBe(eleve.nom);
    expect(b.matieres.map((m) => [m.matiere, m.moyenneMatiere])).toEqual([
      ['Informatique', 10],
      ['Mathématiques', 14.67],
    ]);
    expect(b.moyenneGenerale).toBe(12.8);
    expect(b.mention).toBe('Assez Bien');
    expect(b.rang).toBe(1);
    expect(b.effectif).toBe(1);
  });

  test('l’élève consulte son bulletin, mais pas celui d’un autre', async () => {
    const prof = await inscrire('enseignant');
    const eleve1 = await inscrire('eleve');
    const eleve2 = await inscrire('eleve');
    const maths = await creerMatiere(prof);
    await creerNote(prof, eleve1, maths, 18);

    const mien = await request(app).get(`/api/bulletins/${eleve1.id}`).set(auth(eleve1));
    expect(mien.status).toBe(200);
    expect(mien.body.donnees.mention).toBe('Très Bien');

    const autre = await request(app).get(`/api/bulletins/${eleve1.id}`).set(auth(eleve2));
    expect(autre.status).toBe(403);
  });

  test('élève sans note : pas de moyenne 0 ni de mention "Insuffisant"', async () => {
    const prof = await inscrire('enseignant');
    const eleve = await inscrire('eleve');
    const res = await request(app).get(`/api/bulletins/${eleve.id}`).set(auth(prof));
    expect(res.status).toBe(200);
    expect(res.body.donnees.moyenneGenerale).toBeNull();
    expect(res.body.donnees.mention).toBeNull();
    expect(res.body.donnees.matieres).toEqual([]);
    expect(res.body.donnees.message).toMatch(/Aucune note/);
  });

  test('classement dans la classe (ex æquo inclus), insensible à la casse de la classe', async () => {
    const prof = await inscrire('enseignant');
    const premier = await inscrire('eleve', { classe: 'L2-IDEV' });
    const second = await inscrire('eleve', { classe: 'l2-idev' });
    const exaequo = await inscrire('eleve', { classe: 'L2-IDEV' });
    const autreClasse = await inscrire('eleve', { classe: 'L3-GL' });
    const sansNote = await inscrire('eleve', { classe: 'L2-IDEV' });
    const maths = await creerMatiere(prof);

    await creerNote(prof, premier, maths, 18);
    await creerNote(prof, second, maths, 12);
    await creerNote(prof, exaequo, maths, 12);
    await creerNote(prof, autreClasse, maths, 20);

    const rang = async (eleve) =>
      (await request(app).get(`/api/bulletins/${eleve.id}`).set(auth(prof))).body.donnees;

    expect(await rang(premier)).toMatchObject({ rang: 1, effectif: 3 });
    expect(await rang(second)).toMatchObject({ rang: 2, effectif: 3 });
    expect(await rang(exaequo)).toMatchObject({ rang: 2, effectif: 3 });
    expect(await rang(autreClasse)).toMatchObject({ rang: 1, effectif: 1 });
    expect((await rang(sansNote)).rang).toBeNull();
  });

  test('élève sans classe : bulletin sans rang', async () => {
    const prof = await inscrire('enseignant');
    const eleve = await inscrire('eleve');
    const maths = await creerMatiere(prof);
    await creerNote(prof, eleve, maths, 11);
    const res = await request(app).get(`/api/bulletins/${eleve.id}`).set(auth(prof));
    expect(res.body.donnees.rang).toBeNull();
    expect(res.body.donnees.mention).toBe('Passable');
  });

  test('erreurs : identifiant invalide (400), élève inconnu (404), enseignant non noté (404), sans token (401)', async () => {
    const prof = await inscrire('enseignant');
    expect((await request(app).get('/api/bulletins/abc').set(auth(prof))).status).toBe(400);
    expect((await request(app).get(`/api/bulletins/${ID_INCONNU}`).set(auth(prof))).status).toBe(404);
    expect((await request(app).get(`/api/bulletins/${prof.id}`).set(auth(prof))).status).toBe(404);
    expect((await request(app).get(`/api/bulletins/${ID_INCONNU}`)).status).toBe(401);
  });

  test('le bulletin reflète les modifications et suppressions de notes', async () => {
    const prof = await inscrire('enseignant');
    const eleve = await inscrire('eleve');
    const maths = await creerMatiere(prof);
    const note = await creerNote(prof, eleve, maths, 10);

    await request(app).put(`/api/notes/${note._id}`).set(auth(prof)).send({ valeur: 16 });
    let b = (await request(app).get(`/api/bulletins/${eleve.id}`).set(auth(prof))).body.donnees;
    expect(b.moyenneGenerale).toBe(16);
    expect(b.mention).toBe('Très Bien');

    await request(app).delete(`/api/notes/${note._id}`).set(auth(prof));
    b = (await request(app).get(`/api/bulletins/${eleve.id}`).set(auth(prof))).body.donnees;
    expect(b.moyenneGenerale).toBeNull();
  });
});

describe('Notes en lot (POST /api/notes/lot)', () => {
  const lot = (prof, corps) => request(app).post('/api/notes/lot').set(auth(prof)).send(corps);

  test('enregistre la même évaluation pour plusieurs élèves', async () => {
    const prof = await inscrire('enseignant');
    const a = await inscrire('eleve', { classe: 'L2' });
    const b = await inscrire('eleve', { classe: 'L2' });
    const maths = await creerMatiere(prof);

    const res = await lot(prof, {
      matiere: maths._id,
      type: 'examen',
      coefficientNote: 2,
      dateEvaluation: '2026-02-01',
      notes: [{ eleve: a.id, valeur: 14 }, { eleve: b.id, valeur: '9.5' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.resultats).toBe(2);
    expect(res.body.donnees[0]).toMatchObject({ type: 'examen', coefficientNote: 2, ajouteePar: prof.id });

    const notes = await request(app).get('/api/notes').set(auth(prof));
    expect(notes.body.pagination.total).toBe(2);
    expect(notes.body.donnees.map((n) => n.valeur).sort((x, y) => x - y)).toEqual([9.5, 14]);
  });

  test('tout ou rien : une ligne invalide n’enregistre aucune note', async () => {
    const prof = await inscrire('enseignant');
    const a = await inscrire('eleve');
    const b = await inscrire('eleve');
    const maths = await creerMatiere(prof);

    const res = await lot(prof, { matiere: maths._id, notes: [{ eleve: a.id, valeur: 12 }, { eleve: b.id, valeur: 25 }] });
    expect(res.status).toBe(400);
    const inconnu = await lot(prof, { matiere: maths._id, notes: [{ eleve: a.id, valeur: 12 }, { eleve: ID_INCONNU, valeur: 10 }] });
    expect(inconnu.status).toBe(404);

    const notes = await request(app).get('/api/notes').set(auth(prof));
    expect(notes.body.pagination.total).toBe(0);
  });

  test('validations : liste vide, doublon, trop de lignes, enseignant non responsable, élève', async () => {
    const prof = await inscrire('enseignant');
    const autre = await inscrire('enseignant');
    const eleve = await inscrire('eleve');
    const maths = await creerMatiere(prof);

    expect((await lot(prof, { matiere: maths._id, notes: [] })).status).toBe(400);
    expect((await lot(prof, { matiere: maths._id })).status).toBe(400);
    expect((await lot(prof, { matiere: maths._id, notes: [{ eleve: eleve.id, valeur: 10 }, { eleve: eleve.id, valeur: 11 }] })).status).toBe(400);
    const trop = Array.from({ length: 101 }, () => ({ eleve: eleve.id, valeur: 10 }));
    expect((await lot(prof, { matiere: maths._id, notes: trop })).status).toBe(400);
    expect((await lot(prof, { matiere: maths._id, type: 'inconnu', notes: [{ eleve: eleve.id, valeur: 10 }] })).status).toBe(400);
    expect((await lot(autre, { matiere: maths._id, notes: [{ eleve: eleve.id, valeur: 10 }] })).status).toBe(403);
    expect((await lot(eleve, { matiere: maths._id, notes: [{ eleve: eleve.id, valeur: 10 }] })).status).toBe(403);
    expect((await lot(prof, { matiere: ID_INCONNU, notes: [{ eleve: eleve.id, valeur: 10 }] })).status).toBe(404);
    expect((await request(app).post('/api/notes/lot').send({})).status).toBe(401);
  });
});

describe('Classement de classe et moyennes de classe', () => {
  test('classement trié par rang, élèves sans note en dernier, moyenne de la classe', async () => {
    const prof = await inscrire('enseignant');
    const premier = await inscrire('eleve', { classe: 'L2-IDEV', nom: 'Zed' });
    const second = await inscrire('eleve', { classe: 'l2-idev', nom: 'Bob' });
    const sansNote = await inscrire('eleve', { classe: 'L2-IDEV', nom: 'Alice' });
    await inscrire('eleve', { classe: 'L3-GL' });
    const maths = await creerMatiere(prof, 'Maths', 2);
    const algo = await creerMatiere(prof, 'Algo', 1);

    await creerNote(prof, premier, maths, 18);
    await creerNote(prof, premier, algo, 16);
    await creerNote(prof, second, maths, 10);
    await creerNote(prof, second, algo, 12);

    const res = await request(app).get('/api/bulletins/classe/L2-IDEV').set(auth(prof));
    expect(res.status).toBe(200);
    const d = res.body.donnees;
    expect(d).toMatchObject({ effectif: 3, effectifNotes: 2 });
    expect(d.eleves.map((e) => e.id)).toEqual([premier.id, second.id, sansNote.id]);
    expect(d.eleves[0]).toMatchObject({ rang: 1, moyenneGenerale: 17.33, mention: 'Très Bien' });
    expect(d.eleves[1]).toMatchObject({ rang: 2, moyenneGenerale: 10.67, mention: 'Passable' });
    expect(d.eleves[2]).toMatchObject({ rang: null, moyenneGenerale: null, mention: null });
    expect(d.moyenneClasse).toBe(14);

    // insensible à la casse
    expect((await request(app).get('/api/bulletins/classe/l2-idev').set(auth(prof))).body.donnees.effectif).toBe(3);
  });

  test('le bulletin contient la moyenne de la classe (générale et par matière)', async () => {
    const prof = await inscrire('enseignant');
    const a = await inscrire('eleve', { classe: 'L2' });
    const b = await inscrire('eleve', { classe: 'L2' });
    const maths = await creerMatiere(prof, 'Maths', 1);
    await creerNote(prof, a, maths, 16);
    await creerNote(prof, b, maths, 10);

    const bulletin = (await request(app).get(`/api/bulletins/${a.id}`).set(auth(prof))).body.donnees;
    expect(bulletin.moyenneClasse).toBe(13);
    expect(bulletin.matieres[0].moyenneClasse).toBe(13);

    const sansClasse = await inscrire('eleve');
    await creerNote(prof, sansClasse, maths, 15);
    const b2 = (await request(app).get(`/api/bulletins/${sansClasse.id}`).set(auth(prof))).body.donnees;
    expect(b2.moyenneClasse).toBeNull();
    expect(b2.matieres[0].moyenneClasse).toBeUndefined();
  });

  test('droits et erreurs : élève refusé, classe inconnue, sans token', async () => {
    const prof = await inscrire('enseignant');
    const eleve = await inscrire('eleve', { classe: 'L2' });
    expect((await request(app).get('/api/bulletins/classe/L2').set(auth(eleve))).status).toBe(403);
    expect((await request(app).get('/api/bulletins/classe/INCONNUE').set(auth(prof))).status).toBe(404);
    expect((await request(app).get('/api/bulletins/classe/L2')).status).toBe(401);
  });
});

describe('Changement de mot de passe', () => {
  const changer = (u, corps) => request(app).put('/api/auth/mot-de-passe').set(auth(u)).send(corps);

  test('change le mot de passe : l’ancien ne marche plus, le nouveau oui', async () => {
    const eleve = await inscrire('eleve');
    const res = await changer(eleve, { ancienMotDePasse: MDP, nouveauMotDePasse: 'nouveauMdp456' });
    expect(res.status).toBe(200);

    const ancien = await request(app).post('/api/auth/connexion').send({ email: eleve.email, motDePasse: MDP });
    expect(ancien.status).toBe(401);
    const nouveau = await request(app).post('/api/auth/connexion').send({ email: eleve.email, motDePasse: 'nouveauMdp456' });
    expect(nouveau.status).toBe(200);
  });

  test('refuse : ancien faux, nouveau trop court ou identique, types invalides, sans token', async () => {
    const eleve = await inscrire('eleve');
    expect((await changer(eleve, { ancienMotDePasse: 'faux', nouveauMotDePasse: 'nouveauMdp456' })).status).toBe(400);
    expect((await changer(eleve, { ancienMotDePasse: MDP, nouveauMotDePasse: 'court' })).status).toBe(400);
    expect((await changer(eleve, { ancienMotDePasse: MDP, nouveauMotDePasse: MDP })).status).toBe(400);
    expect((await changer(eleve, { ancienMotDePasse: { $ne: null }, nouveauMotDePasse: 'nouveauMdp456' })).status).toBe(400);
    expect((await changer(eleve, {})).status).toBe(400);
    expect((await request(app).put('/api/auth/mot-de-passe').send({})).status).toBe(401);
    // le mot de passe n'a pas changé
    expect((await request(app).post('/api/auth/connexion').send({ email: eleve.email, motDePasse: MDP })).status).toBe(200);
  });
});

describe('Classes (gérées par l’admin)', () => {
  const creerClasseApi = (admin, corps) => request(app).post('/api/classes').set(auth(admin)).send(corps);

  test('création : matières (donc enseignants), doublon insensible à la casse, validations', async () => {
    const admin = await inscrireAdmin();
    const prof = await inscrire('enseignant');
    const maths = await creerMatiere(prof, 'Maths');

    const ok = await creerClasseApi(admin, { nom: ' L2-IDEV ', matieres: [maths._id, maths._id] });
    expect(ok.status).toBe(201);
    expect(ok.body.donnees).toMatchObject({ nom: 'L2-IDEV', effectif: 0 });
    expect(ok.body.donnees.matieres).toHaveLength(1); // doublon d'identifiant ignoré
    expect(ok.body.donnees.matieres[0].enseignant.email).toBe(prof.email); // l'admin voit l'identifiant

    expect((await creerClasseApi(admin, { nom: 'l2-idev' })).status).toBe(409);
    expect((await creerClasseApi(admin, {})).status).toBe(400);
    expect((await creerClasseApi(admin, { nom: { $ne: 1 } })).status).toBe(400);
    expect((await creerClasseApi(admin, { nom: 'X'.repeat(51) })).status).toBe(400);
    expect((await creerClasseApi(admin, { nom: 'B', matieres: 'maths' })).status).toBe(400);
    expect((await creerClasseApi(admin, { nom: 'B', matieres: ['abc'] })).status).toBe(400);
    expect((await creerClasseApi(admin, { nom: 'B', matieres: [ID_INCONNU] })).status).toBe(404);
    expect((await creerClasseApi(admin, { nom: 'Sans matière' })).status).toBe(201);
  });

  test('créer une classe adopte les élèves déjà inscrits sous ce nom (anciennes données) et aligne la casse', async () => {
    const admin = await inscrireAdmin();
    const ancien = await User.create({ nom: 'A', prenom: 'B', email: 'ancien@test.mg', motDePasse: MDP, role: 'eleve', classe: 'l2-idev' });
    const res = await creerClasseApi(admin, { nom: 'L2-IDEV' });
    expect(res.body.donnees.effectif).toBe(1);
    expect((await User.findById(ancien._id)).classe).toBe('L2-IDEV');
  });

  test('droits : seul l’admin crée / modifie / supprime ; plus aucune liste publique', async () => {
    const admin = await inscrireAdmin();
    const prof = await inscrire('enseignant');
    const eleve = await inscrire('eleve');
    const classe = (await creerClasseApi(admin, { nom: 'L2' })).body.donnees;

    for (const u of [prof, eleve]) {
      expect((await creerClasseApi(u, { nom: 'Hack' })).status).toBe(403);
      expect((await request(app).put(`/api/classes/${classe._id}`).set(auth(u)).send({ nom: 'Hack' })).status).toBe(403);
      expect((await request(app).delete(`/api/classes/${classe._id}`).set(auth(u))).status).toBe(403);
    }
    expect((await request(app).get('/api/classes').set(auth(eleve))).status).toBe(403);
    expect((await request(app).get('/api/classes')).status).toBe(401);
    expect((await request(app).get('/api/classes/abc').set(auth(admin))).status).toBe(400);
    expect((await request(app).get(`/api/classes/${ID_INCONNU}`).set(auth(admin))).status).toBe(404);

    expect((await request(app).get('/api/classes/noms')).status).toBe(401); // plus de liste publique
  });

  test('liste : l’admin voit toutes les classes (effectif, identifiants) ; l’enseignant seulement les siennes, sans identifiants', async () => {
    const admin = await inscrireAdmin();
    const profMaths = await inscrire('enseignant');
    const profAnglais = await inscrire('enseignant');
    const maths = await creerMatiere(profMaths, 'Maths');
    const anglais = await creerMatiere(profAnglais, 'Anglais');
    await creerClasseApi(admin, { nom: 'L2', matieres: [maths._id, anglais._id] });
    await creerClasseApi(admin, { nom: 'L3', matieres: [anglais._id] });
    await inscrire('eleve', { classe: 'l2' });
    await inscrire('eleve', { classe: 'L2' });

    const vueAdmin = (await request(app).get('/api/classes').set(auth(admin))).body.donnees;
    expect(vueAdmin.map((c) => [c.nom, c.effectif, c.matieres.length])).toEqual([['L2', 2, 2], ['L3', 0, 1]]);
    expect(vueAdmin[0].matieres.map((m) => m.enseignant.email).sort()).toEqual([profMaths.email, profAnglais.email].sort());

    const vueMaths = (await request(app).get('/api/classes').set(auth(profMaths))).body.donnees;
    expect(vueMaths.map((c) => c.nom)).toEqual(['L2']);
    expect(vueMaths[0].matieres[0].enseignant.email).toBeUndefined();
    expect(vueMaths[0].matieres[0].enseignant.nom).toBeTruthy();
    expect((await request(app).get('/api/classes').set(auth(profAnglais))).body.donnees.map((c) => c.nom)).toEqual(['L2', 'L3']);

    const l3 = vueAdmin[1];
    expect((await request(app).get(`/api/classes/${l3._id}`).set(auth(profMaths))).status).toBe(403);
    expect((await request(app).get(`/api/classes/${l3._id}`).set(auth(profAnglais))).status).toBe(200);
    expect((await request(app).get(`/api/classes/${l3._id}`).set(auth(admin))).body.donnees.nom).toBe('L3');
  });

  test('modification : le renommage suit les élèves, la liste de matières est remplacée', async () => {
    const admin = await inscrireAdmin();
    const prof = await inscrire('enseignant');
    const maths = await creerMatiere(prof, 'Maths');
    const algo = await creerMatiere(prof, 'Algo');
    const classe = (await creerClasseApi(admin, { nom: 'L2', matieres: [maths._id] })).body.donnees;
    await creerClasseApi(admin, { nom: 'L3' });
    const eleve = await inscrire('eleve', { classe: 'L2' });
    const put = (corps) => request(app).put(`/api/classes/${classe._id}`).set(auth(admin)).send(corps);

    const maj = await put({ nom: 'L2-IDEV', matieres: [algo._id], effectif: 99 });
    expect(maj.status).toBe(200);
    expect(maj.body.donnees).toMatchObject({ nom: 'L2-IDEV', effectif: 1 });
    expect(maj.body.donnees.matieres.map((m) => m.nom)).toEqual(['Algo']);
    expect((await User.findById(eleve.id)).classe).toBe('L2-IDEV');
    expect((await request(app).get('/api/bulletins/classe/L2-IDEV').set(auth(admin))).status).toBe(200);

    expect((await put({})).status).toBe(400);
    expect((await put({ nom: 'l3' })).status).toBe(409);
    expect((await put({ nom: 'L2-idev' })).status).toBe(200); // garder son nom (casse changée) reste possible
    expect((await put({ matieres: [ID_INCONNU] })).status).toBe(404);
    expect((await put({ matieres: [] })).body.donnees.matieres).toEqual([]);
  });

  test('suppression : refusée tant que des élèves y sont inscrits ; supprimer une matière la retire des classes', async () => {
    const admin = await inscrireAdmin();
    const cree = await request(app).post('/api/matieres').set(auth(admin)).send({ nom: 'Chimie' });
    const matiereId = cree.body.donnees._id;
    const classe = (await creerClasseApi(admin, { nom: 'L2', matieres: [matiereId] })).body.donnees;
    const eleve = await inscrire('eleve', { classe: 'L2' });

    const refus = await request(app).delete(`/api/classes/${classe._id}`).set(auth(admin));
    expect(refus.status).toBe(409);
    expect(refus.body.message).toMatch(/1 élève/);

    await request(app).delete(`/api/matieres/${matiereId}`).set(auth(admin));
    expect((await Classe.findById(classe._id)).matieres).toHaveLength(0);

    await User.deleteOne({ _id: eleve.id });
    expect((await request(app).delete(`/api/classes/${classe._id}`).set(auth(admin))).status).toBe(200);
    expect(await Classe.findById(classe._id)).toBeNull();
  });
});

describe('Élèves (gérés par l’admin)', () => {
  const creerEleveApi = (admin, corps) => request(app).post('/api/users/eleves').set(auth(admin)).send(corps);
  const preparer = async () => {
    const admin = await inscrireAdmin();
    await request(app).post('/api/classes').set(auth(admin)).send({ nom: 'L2-IDEV' });
    return admin;
  };
  const base = { nom: 'Andriamanana', prenom: 'Faly', classe: 'L2-IDEV' };

  test('création : fiche complète, identifiant et mot de passe générés, l’élève se connecte avec', async () => {
    const admin = await preparer();
    const res = await creerEleveApi(admin, {
      ...base,
      classe: 'l2-idev',
      dateNaissance: '2004-03-12',
      adresse: '  12 rue des Fleurs, Antananarivo ',
      telephone: '034 12 345 67',
      tuteur: 'Mme Rakoto',
    });
    expect(res.status).toBe(201);
    const { donnees, acces } = res.body;
    expect(donnees).toMatchObject({
      nom: 'Andriamanana', prenom: 'Faly', role: 'eleve',
      classe: 'L2-IDEV', // nom officiel de la classe
      adresse: '12 rue des Fleurs, Antananarivo',
      telephone: '034 12 345 67', tuteur: 'Mme Rakoto',
    });
    expect(donnees.age).toBeGreaterThanOrEqual(21);
    expect(donnees.motDePasse).toBeUndefined();
    expect(acces.identifiant).toBe('faly.andriamanana@eleves.local');
    expect(acces.motDePasse).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/);

    const connexion = await request(app).post('/api/auth/connexion').send({ email: acces.identifiant, motDePasse: acces.motDePasse });
    expect(connexion.status).toBe(200);
    expect(connexion.body.donnees).toMatchObject({ role: 'eleve', classe: 'L2-IDEV' });
    const mesNotes = await request(app).get('/api/notes').set('Authorization', `Bearer ${connexion.body.donnees.token}`);
    expect(mesNotes.status).toBe(200);

    // même nom : l'identifiant est suffixé
    const homonyme = await creerEleveApi(admin, base);
    expect(homonyme.body.acces.identifiant).toBe('faly.andriamanana-2@eleves.local');
  });

  test('création : identifiant et mot de passe choisis par l’admin, doublons, validations', async () => {
    const admin = await preparer();
    const choisi = await creerEleveApi(admin, { ...base, identifiant: 'Faly@Ecole.MG', motDePasse: 'Choisi-Par-Admin1' });
    expect(choisi.status).toBe(201);
    expect(choisi.body.acces).toEqual({ identifiant: 'faly@ecole.mg', motDePasse: 'Choisi-Par-Admin1' });
    expect((await request(app).post('/api/auth/connexion').send({ email: 'faly@ecole.mg', motDePasse: 'Choisi-Par-Admin1' })).status).toBe(200);

    expect((await creerEleveApi(admin, { ...base, identifiant: 'FALY@ecole.mg' })).status).toBe(409);
    expect((await creerEleveApi(admin, { ...base, identifiant: 'pas-un-email' })).status).toBe(400);
    expect((await creerEleveApi(admin, { ...base, motDePasse: 'court' })).status).toBe(400);

    for (const mauvais of [
      { nom: undefined }, { prenom: '' }, { classe: undefined }, { nom: { $ne: 1 } },
      { classe: 'L9-INCONNUE' }, { classe: { $ne: 1 } },
      { dateNaissance: 'pas une date' }, { dateNaissance: '2999-01-01' }, { dateNaissance: '1850-01-01' },
      { telephone: 'abc' }, { adresse: 'x'.repeat(201) }, { tuteur: 'x'.repeat(151) },
    ]) {
      const res = await creerEleveApi(admin, { ...base, ...mauvais });
      expect(res.status).toBe(400);
    }
    expect(await User.countDocuments({ role: 'eleve' })).toBe(1);
  });

  test('droits : seul l’admin crée, modifie, supprime, réinitialise ; le rôle ne peut pas être imposé', async () => {
    const admin = await preparer();
    const prof = await inscrire('enseignant');
    const eleve = await inscrire('eleve', { classe: 'L2-IDEV' });
    for (const u of [prof, eleve]) {
      expect((await creerEleveApi(u, base)).status).toBe(403);
      expect((await request(app).put(`/api/users/eleves/${eleve.id}`).set(auth(u)).send({ nom: 'X' })).status).toBe(403);
      expect((await request(app).delete(`/api/users/eleves/${eleve.id}`).set(auth(u))).status).toBe(403);
      expect((await request(app).post(`/api/users/eleves/${eleve.id}/acces`).set(auth(u))).status).toBe(403);
    }
    expect((await request(app).post('/api/users/eleves').send(base)).status).toBe(401);

    // L'admin ne peut fabriquer ni un enseignant ni un admin par cette route
    const res = await creerEleveApi(admin, { ...base, role: 'admin', email: 'x@x.mg' });
    expect(res.body.donnees.role).toBe('eleve');
    // Et les routes de modification ne touchent pas aux comptes d'autres rôles
    expect((await request(app).put(`/api/users/eleves/${prof.id}`).set(auth(admin)).send({ nom: 'X' })).status).toBe(404);
    expect((await request(app).delete(`/api/users/eleves/${prof.id}`).set(auth(admin))).status).toBe(404);
    expect((await request(app).post(`/api/users/eleves/${admin.id}/acces`).set(auth(admin))).status).toBe(404);
    expect((await request(app).put('/api/users/eleves/abc').set(auth(admin)).send({ nom: 'X' })).status).toBe(400);
  });

  test('modification : fiche, changement de classe, effacement des champs facultatifs, identifiant unique', async () => {
    const admin = await preparer();
    await request(app).post('/api/classes').set(auth(admin)).send({ nom: 'L3-GL' });
    const creation = await creerEleveApi(admin, { ...base, adresse: 'Ancienne adresse', telephone: '034 00 000 00', dateNaissance: '2004-03-12' });
    const cree = creation.body.donnees;
    const { identifiant: ancienId, motDePasse: mdpCree } = creation.body.acces;
    await creerEleveApi(admin, { nom: 'Autre', prenom: 'Eleve', classe: 'L2-IDEV', identifiant: 'autre@ecole.mg' });
    const put = (corps) => request(app).put(`/api/users/eleves/${cree._id}`).set(auth(admin)).send(corps);

    const maj = await put({ nom: 'Rakoto', classe: 'l3-gl', adresse: 'Nouvelle adresse', tuteur: 'M. Rakoto', role: 'admin', motDePasse: 'Hack12345' });
    expect(maj.status).toBe(200);
    expect(maj.body.donnees).toMatchObject({ nom: 'Rakoto', prenom: 'Faly', classe: 'L3-GL', adresse: 'Nouvelle adresse', tuteur: 'M. Rakoto', role: 'eleve' });
    // champs protégés : le rôle et le mot de passe n'ont pas changé
    const brut = await User.findById(cree._id).select('+motDePasse');
    expect(brut.role).toBe('eleve');
    expect(await brut.comparerMotDePasse('Hack12345')).toBe(false);

    const effacee = await put({ adresse: '', telephone: null, dateNaissance: '' });
    expect(effacee.status).toBe(200);
    expect(effacee.body.donnees.adresse).toBeUndefined();
    expect(effacee.body.donnees.telephone).toBeUndefined();
    expect(effacee.body.donnees.age).toBeNull();
    expect(effacee.body.donnees.tuteur).toBe('M. Rakoto');

    expect((await put({ identifiant: 'AUTRE@ecole.mg' })).status).toBe(409);
    const nouvelId = await put({ identifiant: 'rakoto@ecole.mg' });
    expect(nouvelId.status).toBe(200);
    // le nouvel identifiant fonctionne avec le même mot de passe ; l'ancien ne fonctionne plus
    expect((await request(app).post('/api/auth/connexion').send({ email: 'rakoto@ecole.mg', motDePasse: mdpCree })).status).toBe(200);
    expect((await request(app).post('/api/auth/connexion').send({ email: ancienId, motDePasse: mdpCree })).status).toBe(401);
    expect((await put({ identifiant: 'rakoto@ecole.mg' })).status).toBe(200); // garder le sien : possible

    expect((await put({})).status).toBe(400);
    expect((await put({ classe: 'INCONNUE' })).status).toBe(400);
    expect((await put({ nom: '' })).status).toBe(400);
    expect((await put({ dateNaissance: '2999-01-01' })).status).toBe(400);
    expect((await request(app).put(`/api/users/eleves/${ID_INCONNU}`).set(auth(admin)).send({ nom: 'X' })).status).toBe(404);
  });

  test('réinitialisation d’accès : nouveau mot de passe, l’ancienne session de l’élève est coupée', async () => {
    const admin = await preparer();
    const cree = await creerEleveApi(admin, base);
    const { identifiant, motDePasse } = cree.body.acces;
    const connexion = (mdp) => request(app).post('/api/auth/connexion').send({ email: identifiant, motDePasse: mdp });
    const eleve = { jeton: (await connexion(motDePasse)).body.donnees.token };
    const id = cree.body.donnees._id;
    expect((await request(app).get('/api/notes').set(auth(eleve))).status).toBe(200);

    expect((await request(app).post(`/api/users/eleves/${id}/acces`).set(auth(admin)).send({ motDePasse: 'court' })).status).toBe(400);
    const reset = await request(app).post(`/api/users/eleves/${id}/acces`).set(auth(admin)).send({});
    expect(reset.status).toBe(200);
    expect(reset.body.acces.identifiant).toBe(identifiant);
    expect((await request(app).get('/api/notes').set(auth(eleve))).status).toBe(401);
    expect((await connexion(motDePasse)).status).toBe(401);
    expect((await connexion(reset.body.acces.motDePasse)).status).toBe(200);
    expect((await request(app).post(`/api/users/eleves/${ID_INCONNU}/acces`).set(auth(admin))).status).toBe(404);
  });

  test('suppression : supprime l’élève, son compte et ses notes ; la classe redevient supprimable', async () => {
    const admin = await preparer();
    const prof = await inscrire('enseignant');
    const maths = await creerMatiere(prof);
    const classe = (await Classe.findOne({ nom: 'L2-IDEV' }))._id.toString();
    const cree = (await creerEleveApi(admin, base)).body;
    const autre = await inscrire('eleve', { classe: 'L2-IDEV' });
    await creerNote(prof, { id: cree.donnees._id }, maths, 12);
    await creerNote(prof, { id: cree.donnees._id }, maths, 14);
    await creerNote(prof, autre, maths, 10);

    const res = await request(app).delete(`/api/users/eleves/${cree.donnees._id}`).set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.notesSupprimees).toBe(2);
    expect(await Note.countDocuments()).toBe(1); // la note de l'autre élève est intacte
    expect((await request(app).post('/api/auth/connexion').send({ email: cree.acces.identifiant, motDePasse: cree.acces.motDePasse })).status).toBe(401);
    expect((await request(app).delete(`/api/users/eleves/${cree.donnees._id}`).set(auth(admin))).status).toBe(404);

    // La classe compte encore l'autre élève
    expect((await request(app).delete(`/api/classes/${classe}`).set(auth(admin))).status).toBe(409);
  });

  test('un élève ajouté par l’admin n’est noté que dans les matières de sa classe', async () => {
    const admin = await preparer();
    const prof = await inscrire('enseignant');
    const maths = await creerMatiere(prof, 'Maths'); // creerMatiere l'ajoute à toutes les classes existantes
    const sansMaths = (await request(app).post('/api/classes').set(auth(admin)).send({ nom: 'L3-GL' })).body.donnees;
    await request(app).put(`/api/classes/${sansMaths._id}`).set(auth(admin)).send({ matieres: [] });
    const a = (await creerEleveApi(admin, base)).body.donnees;
    const b = (await creerEleveApi(admin, { ...base, nom: 'Autre', classe: 'L3-GL' })).body.donnees;

    await creerNote(prof, { id: a._id }, maths, 15);
    const refus = await request(app).post('/api/notes').set(auth(prof)).send({ eleve: b._id, matiere: maths._id, valeur: 15 });
    expect(refus.status).toBe(403);
  });
});

describe('Notation limitée aux matières enseignées dans la classe', () => {
  test('note et lot refusés hors des classes de la matière ; tout ou rien ; élèves sans classe ou classe non créée libres', async () => {
    const admin = await inscrireAdmin();
    const profMaths = await inscrire('enseignant');
    const profAnglais = await inscrire('enseignant');
    const maths = await creerMatiere(profMaths, 'Maths');
    const anglais = await creerMatiere(profAnglais, 'Anglais');
    const classeA = (await request(app).post('/api/classes').set(auth(admin)).send({ nom: 'A', matieres: [maths._id, anglais._id] })).body.donnees;
    const classeB = (await request(app).post('/api/classes').set(auth(admin)).send({ nom: 'B', matieres: [anglais._id] })).body.donnees;
    const eleveA = await inscrire('eleve', { classe: 'A' });
    const eleveB = await inscrire('eleve', { classe: 'B' });
    const notesMaths = () => Note.countDocuments({ matiere: maths._id });

    await creerNote(profMaths, eleveA, maths, 14);

    const refus = await request(app).post('/api/notes').set(auth(profMaths)).send({ eleve: eleveB.id, matiere: maths._id, valeur: 10 });
    expect(refus.status).toBe(403);
    expect(refus.body.message).toMatch(/n'est pas enseignée dans la classe "B"/);

    const lot = () => request(app).post('/api/notes/lot').set(auth(profMaths)).send({
      matiere: maths._id,
      notes: [{ eleve: eleveA.id, valeur: 11 }, { eleve: eleveB.id, valeur: 12 }],
    });
    expect((await lot()).status).toBe(403);
    expect(await notesMaths()).toBe(1); // tout ou rien : la note de l'élève A du lot n'a pas été écrite

    // L'anglais est bien enseigné dans B
    await creerNote(profAnglais, eleveB, anglais, 13);

    // Élève sans classe, ou dans une classe que l'admin n'a pas créée (anciennes données) : pas de restriction
    const sansClasse = await inscrire('eleve');
    const ancien = await User.create({ nom: 'A', prenom: 'B', email: 'ancien@test.mg', motDePasse: MDP, role: 'eleve', classe: 'Ancienne' });
    await creerNote(profMaths, sansClasse, maths, 9);
    await creerNote(profMaths, { id: ancien._id.toString() }, maths, 8);

    // L'admin ajoute les maths à la classe B : le lot passe
    await request(app).put(`/api/classes/${classeB._id}`).set(auth(admin)).send({ matieres: [maths._id, anglais._id] });
    expect((await lot()).status).toBe(201);
    expect(classeA.nom).toBe('A');
  });
});

describe('Sessions et changement de mot de passe', () => {
  test('la réinitialisation d’accès par l’admin déconnecte les sessions ouvertes de l’enseignant', async () => {
    const admin = await inscrireAdmin();
    const cree = await request(app).post('/api/matieres').set(auth(admin)).send({ nom: 'Chimie' });
    const { identifiant, motDePasse } = cree.body.acces;
    const connexion = (mdp) => request(app).post('/api/auth/connexion').send({ email: identifiant, motDePasse: mdp });
    const prof = { jeton: (await connexion(motDePasse)).body.donnees.token };
    expect((await request(app).get('/api/classes').set(auth(prof))).status).toBe(200);

    const reset = await request(app).post(`/api/matieres/${cree.body.donnees._id}/acces`).set(auth(admin)).send({});
    const ancienneSession = await request(app).get('/api/classes').set(auth(prof));
    expect(ancienneSession.status).toBe(401);
    expect(ancienneSession.body.message).toMatch(/mot de passe modifié/);

    const nouvelle = { jeton: (await connexion(reset.body.acces.motDePasse)).body.donnees.token };
    expect((await request(app).get('/api/classes').set(auth(nouvelle))).status).toBe(200);
  });

  test('changer son mot de passe déconnecte les autres sessions mais renvoie un jeton valable pour la session courante', async () => {
    const eleve = await inscrire('eleve');
    const res = await request(app).put('/api/auth/mot-de-passe').set(auth(eleve)).send({ ancienMotDePasse: MDP, nouveauMotDePasse: 'nouveauMdp456' });
    expect(res.status).toBe(200);

    expect((await request(app).get('/api/auth/profil').set(auth(eleve))).status).toBe(401); // ancien jeton
    expect((await request(app).get('/api/auth/profil').set('Authorization', `Bearer ${res.body.donnees.token}`)).status).toBe(200);
  });
});
