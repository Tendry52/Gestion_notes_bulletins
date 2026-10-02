const API_URL = '/api';

// --- Session ---
const lireJSON = (texte) => {
  try {
    return JSON.parse(texte);
  } catch {
    return null;
  }
};

let token = localStorage.getItem('token') || null;
let utilisateur = lireJSON(localStorage.getItem('utilisateur'));
let mesMatieres = []; // matières dont l'enseignant connecté est responsable
let toutesMatieres = []; // toutes les matières
let elevesConnus = []; // tous les élèves (enseignant)
let notesGestion = []; // notes actuellement affichées dans « Notes par élève »
let notesEleve = []; // notes de l'élève connecté
let classesApi = []; // classes visibles : toutes (admin) ou celles où l'enseignant intervient

const $ = (id) => document.getElementById(id);

// --- Utilitaires ---

// Échappe le texte avant de l'injecter dans du HTML (protège contre le XSS)
function esc(valeur) {
  return String(valeur ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Formate un nombre à la française avec 2 décimales (ex : 14,67)
function fmt(nombre) {
  if (nombre === null || nombre === undefined) return '-';
  return Number(nombre).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Lit un nombre saisi (accepte la virgule décimale)
function lireNombre(texte) {
  if (texte === null) return null;
  const nombre = Number(String(texte).trim().replace(',', '.'));
  return String(texte).trim() === '' || !Number.isFinite(nombre) ? NaN : nombre;
}

let minuterieNotification = null;
function notifier(message, type = 'succes') {
  const zone = $('notification');
  zone.textContent = message;
  zone.className = `notification ${type}`;
  clearTimeout(minuterieNotification);
  minuterieNotification = setTimeout(() => zone.classList.add('cachee'), 4500);
}

// Désactive le bouton d'envoi pendant l'appel pour éviter les doubles soumissions
async function pendant(bouton, action) {
  if (bouton) bouton.disabled = true;
  try {
    return await action();
  } finally {
    if (bouton) bouton.disabled = false;
  }
}

// Dates : on envoie midi (heure locale) pour que le jour affiché reste le même quel que soit le fuseau
const aujourdhui = () => new Date().toLocaleDateString('sv-SE'); // format AAAA-MM-JJ
const dateVersInput = (valeur) => new Date(valeur).toLocaleDateString('sv-SE');
const inputVersDate = (texte) => new Date(`${texte}T12:00:00`).toISOString();
const dateFr = (valeur) => new Date(valeur).toLocaleDateString('fr-FR');

const OPTIONS_TYPE = [
  { valeur: 'devoir', libelle: 'Devoir' },
  { valeur: 'controle', libelle: 'Contrôle' },
  { valeur: 'examen', libelle: 'Examen' },
  { valeur: 'tp', libelle: 'TP' },
];

// --- Fenêtre de saisie générique (remplace les prompt() du navigateur) ---
let actionDialogue = null;

function ouvrirDialogue({ titre, champs, texteValider = 'Enregistrer', onValider }) {
  $('dialogueTitre').textContent = titre;
  $('dialogueErreur').textContent = '';
  $('dialogueValider').textContent = texteValider;
  $('dialogueChamps').innerHTML = champs
    .map((c) => {
      const id = `dlg_${c.nom}`;
      if (c.type === 'cases') {
        const cochees = c.valeur || [];
        const cases = c.options
          .map(
            (o) => `<label class="case"><input type="checkbox" name="${id}" value="${esc(o.valeur)}"${cochees.includes(o.valeur) ? ' checked' : ''} /> ${esc(o.libelle)}</label>`
          )
          .join('');
        return `<fieldset class="cases"><legend>${esc(c.libelle)}</legend>${cases || '<span class="aide">Aucun choix disponible</span>'}</fieldset>`;
      }
      const saisie =
        c.type === 'select'
          ? `<select id="${id}">${c.options
              .map((o) => `<option value="${esc(o.valeur)}"${o.valeur === c.valeur ? ' selected' : ''}>${esc(o.libelle)}</option>`)
              .join('')}</select>`
          : `<input id="${id}" type="${esc(c.type || 'text')}" value="${esc(c.valeur ?? '')}"
              ${c.min !== undefined ? `min="${esc(c.min)}"` : ''} ${c.max !== undefined ? `max="${esc(c.max)}"` : ''}
              ${c.step ? `step="${esc(c.step)}"` : ''} ${c.maxlength ? `maxlength="${esc(c.maxlength)}"` : ''}
              ${c.autocomplete ? `autocomplete="${esc(c.autocomplete)}"` : ''} ${c.facultatif ? '' : 'required'} />`;
      return `<label class="champ">${esc(c.libelle)}${saisie}</label>`;
    })
    .join('');

  actionDialogue = async () => {
    const valeurs = {};
    champs.forEach((c) => {
      valeurs[c.nom] =
        c.type === 'cases'
          ? [...document.querySelectorAll(`#dialogueChamps input[name="dlg_${c.nom}"]:checked`)].map((i) => i.value)
          : $(`dlg_${c.nom}`).value;
    });
    await onValider(valeurs);
  };

  const dlg = $('dialogue');
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
  const premier = dlg.querySelector('input, select');
  if (premier) premier.focus();
}

function fermerDialogue() {
  const dlg = $('dialogue');
  if (typeof dlg.close === 'function') dlg.close();
  else dlg.removeAttribute('open');
  actionDialogue = null;
}

$('formDialogue').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!actionDialogue) return;
  await pendant($('dialogueValider'), async () => {
    try {
      await actionDialogue();
      fermerDialogue();
    } catch (err) {
      $('dialogueErreur').textContent = err.message;
    }
  });
});
$('dialogueAnnuler').addEventListener('click', fermerDialogue);

async function appelApi(endpoint, methode = 'GET', corps = null) {
  const options = { method: methode, headers: { 'Content-Type': 'application/json' } };
  if (token) options.headers['Authorization'] = `Bearer ${token}`;
  if (corps) options.body = JSON.stringify(corps);

  let reponse;
  try {
    reponse = await fetch(`${API_URL}${endpoint}`, options);
  } catch {
    throw new Error('Impossible de contacter le serveur. Vérifiez votre connexion.');
  }

  let donnees = null;
  try {
    donnees = await reponse.json();
  } catch {
    /* réponse sans JSON */
  }

  if (!reponse.ok) {
    // Token expiré ou invalide : on renvoie l'utilisateur vers la connexion
    if (reponse.status === 401 && token && !endpoint.startsWith('/auth/')) {
      deconnecter('Session expirée, veuillez vous reconnecter.');
    }
    throw new Error((donnees && donnees.message) || `Erreur ${reponse.status}`);
  }
  return donnees;
}

// --- Gestion de l'affichage selon le rôle ---
function majAffichage() {
  const connecte = Boolean(token && utilisateur);
  $('sectionAuth').classList.toggle('cachee', connecte);
  $('infoUtilisateur').classList.toggle('cachee', !connecte);
  $('sectionBulletin').classList.add('cachee');
  // Aucune donnée d'un utilisateur précédent ne doit rester dans la page
  $('contenuBulletin').innerHTML = '';
  $('resultatClassement').innerHTML = '';
  $('listeNotesGestion').innerHTML = '';
  signatureLot = '';

  const estAdmin = connecte && utilisateur.role === 'admin';
  const estEnseignant = connecte && utilisateur.role === 'enseignant';
  const estEleve = connecte && utilisateur.role === 'eleve';
  $('sectionGestion').classList.toggle('cachee', !(estAdmin || estEnseignant));
  $('sectionEleve').classList.toggle('cachee', !estEleve);

  if (!connecte) return;

  $('nomUtilisateur').textContent = `${utilisateur.prenom} ${utilisateur.nom} (${utilisateur.role})`;
  if (estAdmin || estEnseignant) {
    configurerEspaceGestion();
    chargerDonneesGestion();
  } else {
    chargerMesNotes();
  }
}

function ouvrirSession(donnees) {
  token = donnees.token;
  utilisateur = donnees;
  localStorage.setItem('token', token);
  localStorage.setItem('utilisateur', JSON.stringify(utilisateur));
  $('messageAuth').textContent = '';
  majAffichage();
}

function deconnecter(message = '') {
  token = null;
  utilisateur = null;
  mesMatieres = [];
  matieresAdmin = [];
  classesApi = [];
  elevesConnus = [];
  localStorage.removeItem('token');
  localStorage.removeItem('utilisateur');
  majAffichage();
  $('messageAuth').textContent = message;
}

// --- Connexion ---
$('formConnexion').addEventListener('submit', async (e) => {
  e.preventDefault();
  const bouton = e.submitter || e.target.querySelector('button[type=submit]');
  await pendant(bouton, async () => {
    try {
      const reponse = await appelApi('/auth/connexion', 'POST', {
        email: $('connexionEmail').value,
        motDePasse: $('connexionMotDePasse').value,
      });
      $('connexionMotDePasse').value = '';
      ouvrirSession(reponse.donnees);
    } catch (err) {
      $('messageAuth').textContent = err.message;
    }
  });
});

$('btnDeconnexion').addEventListener('click', () => deconnecter());

$('btnMotDePasse').addEventListener('click', () => {
  ouvrirDialogue({
    titre: 'Changer mon mot de passe',
    champs: [
      { nom: 'ancien', libelle: 'Mot de passe actuel', type: 'password', autocomplete: 'current-password', maxlength: 72 },
      { nom: 'nouveau', libelle: 'Nouveau mot de passe (8 caractères min.)', type: 'password', autocomplete: 'new-password', maxlength: 72 },
      { nom: 'confirmation', libelle: 'Confirmer le nouveau mot de passe', type: 'password', autocomplete: 'new-password', maxlength: 72 },
    ],
    onValider: async (v) => {
      if (v.nouveau.length < 8) throw new Error('Le nouveau mot de passe doit contenir au moins 8 caractères');
      if (v.nouveau !== v.confirmation) throw new Error('La confirmation ne correspond pas au nouveau mot de passe');
      const rep = await appelApi('/auth/mot-de-passe', 'PUT', { ancienMotDePasse: v.ancien, nouveauMotDePasse: v.nouveau });
      // Les autres sessions sont déconnectées par le serveur : on garde la session courante avec le nouveau jeton
      if (rep.donnees && rep.donnees.token) {
        token = rep.donnees.token;
        utilisateur.token = token;
        localStorage.setItem('token', token);
        localStorage.setItem('utilisateur', JSON.stringify(utilisateur));
      }
      notifier('Mot de passe modifié');
    },
  });
});

// --- ESPACE DE GESTION (enseignant et administrateur) ---

// Sous-onglets : Saisie (enseignant) / Matières / Classes (admin) / Notes par élève / Classe & bulletins
function activerPanneau(id) {
  document.querySelectorAll('.sous-onglet').forEach((b) => b.classList.toggle('actif', b.dataset.panneau === id));
  document.querySelectorAll('#sectionGestion .panneau').forEach((p) => p.classList.toggle('cachee', p.id !== id));
  if (id === 'panneauNotes' && $('gestionEleveSelect').value) chargerNotesGestion();
  if (id === 'panneauClasse') rendreInfoClasse();
}

document.querySelectorAll('.sous-onglet').forEach((btn) => {
  btn.addEventListener('click', () => activerPanneau(btn.dataset.panneau));
});

// Affiche les onglets du rôle connecté
function configurerEspaceGestion() {
  const role = utilisateur.role;
  $('titreGestion').textContent = role === 'admin' ? 'Espace Administrateur' : 'Espace Enseignant';
  document.querySelectorAll('.sous-onglet').forEach((b) => {
    b.classList.toggle('cachee', !b.dataset.roles.split(' ').includes(role));
  });
  $('blocAdminMatieres').classList.toggle('cachee', role !== 'admin');
  $('blocListeMatieres').classList.toggle('cachee', role === 'admin');
  activerPanneau(role === 'admin' ? 'panneauMatieres' : 'panneauSaisie');
}

const nomComplet = (el) => `${el.prenom} ${el.nom}`;
const memeClasse = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const classeParNom = (nom) => (nom ? classesApi.find((c) => memeClasse(c.nom, nom)) : undefined);
const comparerNoms = (a, b) => a.localeCompare(b, 'fr', { numeric: true });

// Élèves de la classe active (ou tous si « Toutes les classes »)
function elevesFiltres() {
  const classe = $('classeActive').value;
  return classe ? elevesConnus.filter((el) => memeClasse(el.classe, classe)) : elevesConnus;
}

// Remplit « Classe active ».
//  - Admin : toutes les classes créées (+ celles d'élèves antérieures aux classes) et « Toutes les classes ».
//  - Enseignant auquel l'admin a attribué des classes : uniquement les siennes.
//  - Enseignant sans classe attribuée : comme avant (classes déduites des élèves).
function rendreClasses() {
  const estAdmin = utilisateur.role === 'admin';
  const restreint = !estAdmin && classesApi.length > 0;
  const noms = new Map(); // minuscule -> libellé d'origine
  const ajouter = (nom) => {
    const propre = String(nom || '').trim();
    if (propre && !noms.has(propre.toLowerCase())) noms.set(propre.toLowerCase(), propre);
  };
  classesApi.forEach((c) => ajouter(c.nom));
  if (!restreint) elevesConnus.forEach((el) => ajouter(el.classe));

  const liste = [...noms.values()].sort(comparerNoms);
  const select = $('classeActive');
  const precedente = select.value;
  select.innerHTML =
    (restreint ? '' : '<option value="">Toutes les classes</option>') +
    liste.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  select.value = liste.find((c) => memeClasse(c, precedente)) || (restreint && liste.length ? liste[0] : '');

  const sansClasse = utilisateur.role === 'enseignant' && classesApi.length === 0;
  $('avisClasses').textContent = sansClasse
    ? "Aucune classe ne vous est attribuée pour le moment : l'administrateur doit ajouter votre matière à vos classes."
    : '';
  $('avisClasses').classList.toggle('cachee', !sansClasse);
}

// Informations de la classe active : effectif, matières et enseignants
function rendreInfoClasse() {
  const zone = $('infoClasse');
  const classe = classeParNom($('classeActive').value);
  if (!classe) {
    zone.classList.add('cachee');
    zone.innerHTML = '';
    return;
  }
  const estAdmin = utilisateur.role === 'admin';
  zone.classList.remove('cachee');
  zone.innerHTML = `
    <h3>Classe ${esc(classe.nom)} — ${esc(classe.effectif)} élève(s)</h3>
    ${
      classe.matieres.length
        ? `<table>
            <thead><tr><th>Matière</th><th>Coef.</th><th>Enseignant</th>${estAdmin ? '<th>Identifiant de connexion</th>' : ''}</tr></thead>
            <tbody>
              ${classe.matieres
                .map((m) => {
                  const ens = m.enseignant;
                  const nom = ens ? (ens._id === utilisateur.id ? '<strong>Vous</strong>' : `${esc(ens.prenom)} ${esc(ens.nom)}`) : '-';
                  return `<tr><td>${esc(m.nom)}</td><td>${esc(m.coefficient)}</td><td>${nom}</td>${estAdmin ? `<td>${esc(ens ? ens.email : '-')}</td>` : ''}</tr>`;
                })
                .join('')}
            </tbody>
          </table>`
        : "<p class=\"aide\">Aucune matière n'est encore rattachée à cette classe.</p>"
    }`;
}

function rendreSelectEleves() {
  const eleves = elevesFiltres();
  const options = eleves.length
    ? eleves.map((el) => `<option value="${esc(el._id)}">${esc(nomComplet(el))}${el.classe ? ` (${esc(el.classe)})` : ''}</option>`).join('')
    : '<option value="">Aucun élève</option>';

  ['noteEleve', 'bulletinEleveSelect', 'gestionEleveSelect'].forEach((id) => {
    const select = $(id);
    const precedent = select.value; // on conserve la sélection lors d'un rechargement
    select.innerHTML = options;
    if (precedent && [...select.options].some((o) => o.value === precedent)) select.value = precedent;
  });
}

// Tableau de saisie rapide : une ligne par élève de la classe active
let signatureLot = '';
function rendreLot(forcer = false) {
  const eleves = elevesFiltres();
  const signature = eleves.map((el) => el._id).join(',');
  if (!forcer && signature === signatureLot) return; // évite d'effacer les notes en cours de saisie
  signatureLot = signature;
  $('lotEleves').innerHTML = eleves.length
    ? `<table class="table-saisie">
        <thead><tr><th>Élève</th><th>Classe</th><th>Note /20</th></tr></thead>
        <tbody>
          ${eleves
            .map(
              (el) => `<tr>
                <td>${esc(el.nom)} ${esc(el.prenom)}</td><td>${esc(el.classe || '-')}</td>
                <td><input type="number" min="0" max="20" step="any" data-eleve="${esc(el._id)}" data-nom="${esc(nomComplet(el))}" aria-label="Note de ${esc(nomComplet(el))}" /></td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
      <p class="aide">${eleves.length} élève(s) — maximum 100 notes par envoi (au-delà, les envois sont découpés automatiquement).</p>`
    : '<p>Aucun élève dans cette classe.</p>';
}

// Matières de l'enseignant qui sont enseignées dans la classe active (toutes les siennes si la classe n'est pas gérée)
function matieresPourClasse() {
  const classe = classeParNom($('classeActive').value);
  if (!classe) return mesMatieres;
  return mesMatieres.filter((m) => classe.matieres.some((cm) => cm._id === m._id));
}

function rendreSelectsMatieres() {
  const disponibles = matieresPourClasse();
  const vide = $('classeActive').value && mesMatieres.length
    ? "Vos matières ne sont pas enseignées dans cette classe"
    : "Aucune matière ne vous est attribuée";
  const optionsMiennes = disponibles.length
    ? disponibles.map((m) => `<option value="${esc(m._id)}">${esc(m.nom)} (coef ${esc(m.coefficient)})</option>`).join('')
    : `<option value="">${vide}</option>`;
  ['noteMatiere', 'lotMatiere'].forEach((id) => {
    const select = $(id);
    const precedente = select.value;
    select.innerHTML = optionsMiennes;
    if (precedente && disponibles.some((m) => m._id === precedente)) select.value = precedente;
  });

  const filtre = $('gestionMatiereSelect');
  const precedent = filtre.value;
  filtre.innerHTML =
    '<option value="">Toutes les matières</option>' +
    toutesMatieres.map((m) => `<option value="${esc(m._id)}">${esc(m.nom)}</option>`).join('');
  if (precedent && toutesMatieres.some((m) => m._id === precedent)) filtre.value = precedent;
}

function rendreListeMatieres(matieres) {
  const div = $('listeMatieres');
  if (!matieres.length) {
    div.innerHTML = '<p>Aucune matière pour le moment.</p>';
    return;
  }
  div.innerHTML = `
    <table>
      <thead><tr><th>Matière</th><th>Coef.</th><th>Responsable</th></tr></thead>
      <tbody>
        ${matieres
          .map((m) => {
            const estMienne = m.enseignant && m.enseignant._id === utilisateur.id;
            const responsable = m.enseignant ? `${esc(m.enseignant.prenom)} ${esc(m.enseignant.nom)}` : '-';
            return `<tr><td>${esc(m.nom)}</td><td>${esc(m.coefficient)}</td><td>${estMienne ? '<strong>Vous</strong>' : responsable}</td></tr>`;
          })
          .join('')}
      </tbody>
    </table>`;
}

// Charge tout ce dont l'espace de gestion a besoin : matières, classes, élèves
async function chargerDonneesGestion() {
  try {
    const repMatieres = await appelApi('/matieres?limite=200');
    const repClasses = await appelApi('/classes');
    const repEleves = await appelApi('/users/eleves?limite=500');
    if (!utilisateur) return; // déconnecté pendant le chargement

    const estAdmin = utilisateur.role === 'admin';
    toutesMatieres = repMatieres.donnees;
    mesMatieres = estAdmin ? [] : toutesMatieres.filter((m) => m.enseignant && m.enseignant._id === utilisateur.id);
    matieresAdmin = estAdmin ? toutesMatieres : [];
    classesApi = repClasses.donnees;
    elevesConnus = repEleves.donnees;

    if (estAdmin) {
      rendreListeMatieresAdmin();
      rendreListeClasses();
      rendreCasesMatieres();
      rendreSelectClassesEleve();
    } else {
      rendreListeMatieres(toutesMatieres);
    }
    rendreClasses();
    rendreSelectsMatieres();
    rendreSelectEleves();
    rendreLot();
    rendreInfoClasse();
    if (estAdmin) rendreListeElevesAdmin();
  } catch (err) {
    notifier(err.message, 'erreur');
  }
}

// Changer de classe active met à jour toutes les listes d'élèves
$('classeActive').addEventListener('change', () => {
  rendreSelectsMatieres(); // seules les matières enseignées dans cette classe sont proposées
  rendreSelectEleves();
  rendreLot(true);
  rendreInfoClasse();
  if (utilisateur.role === 'admin') rendreListeElevesAdmin();
  $('listeNotesGestion').innerHTML = '';
  $('resultatClassement').innerHTML = '';
});

// Dates par défaut = aujourd'hui
const initialiserDates = () => {
  if (!$('lotDate').value) $('lotDate').value = aujourdhui();
  if (!$('noteDate').value) $('noteDate').value = aujourdhui();
};
initialiserDates();

// --- ESPACE ADMINISTRATEUR : matières et accès ---
let matieresAdmin = [];

function afficherAcces(libelle, acces) {
  $('accesMatiere').textContent = libelle;
  $('accesIdentifiant').value = acces.identifiant;
  $('accesMotDePasse').value = acces.motDePasse;
  const dlg = $('dialogueAcces');
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
}

function fermerAcces() {
  // Le mot de passe en clair ne doit pas rester dans la page
  $('accesMotDePasse').value = '';
  $('accesIdentifiant').value = '';
  const dlg = $('dialogueAcces');
  if (typeof dlg.close === 'function') dlg.close();
  else dlg.removeAttribute('open');
}

$('accesFermer').addEventListener('click', fermerAcces);
$('dialogueAcces').addEventListener('cancel', fermerAcces);
$('accesCopier').addEventListener('click', async () => {
  const texte = `Identifiant : ${$('accesIdentifiant').value}\nMot de passe : ${$('accesMotDePasse').value}`;
  try {
    await navigator.clipboard.writeText(texte);
    notifier('Identifiants copiés');
  } catch {
    notifier('Copie impossible : sélectionnez le texte manuellement', 'erreur');
  }
});

function rendreListeMatieresAdmin() {
  const div = $('listeMatieresAdmin');
  if (!matieresAdmin.length) {
    div.innerHTML = '<p>Aucune matière pour le moment.</p>';
    return;
  }
  div.innerHTML = `
    <table>
      <thead><tr><th>Matière</th><th>Coef.</th><th>Identifiant de connexion</th><th>Actions</th></tr></thead>
      <tbody>
        ${matieresAdmin
          .map(
            (m) => `<tr>
              <td>${esc(m.nom)}</td><td>${esc(m.coefficient)}</td>
              <td>${esc(m.enseignant ? m.enseignant.email : '-')}</td>
              <td>
                <button type="button" class="btn-petit" data-action="modifier-matiere" data-id="${esc(m._id)}">Modifier</button>
                <button type="button" class="btn-petit" data-action="reinitialiser-acces" data-id="${esc(m._id)}">Nouveau mot de passe</button>
                <button type="button" class="btn-petit btn-danger" data-action="supprimer-matiere" data-id="${esc(m._id)}">Supprimer</button>
              </td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

$('formMatiere').addEventListener('submit', async (e) => {
  e.preventDefault();
  const coefficient = lireNombre($('matiereCoefficient').value);
  if (Number.isNaN(coefficient)) return notifier('Coefficient invalide', 'erreur');
  const corps = { nom: $('matiereNom').value, coefficient };
  if ($('matiereIdentifiant').value.trim()) corps.identifiant = $('matiereIdentifiant').value;
  await pendant(e.submitter, async () => {
    try {
      const rep = await appelApi('/matieres', 'POST', corps);
      $('matiereNom').value = '';
      $('matiereIdentifiant').value = '';
      await chargerDonneesGestion();
      afficherAcces(rep.donnees.nom, rep.acces);
    } catch (err) {
      notifier(err.message, 'erreur');
    }
  });
});

// Modifier / réinitialiser l'accès / supprimer (délégation d'événements sur la liste)
$('listeMatieresAdmin').addEventListener('click', async (e) => {
  const bouton = e.target.closest('button[data-action]');
  if (!bouton) return;
  const matiere = matieresAdmin.find((m) => m._id === bouton.dataset.id);
  if (!matiere) return;

  if (bouton.dataset.action === 'modifier-matiere') {
    ouvrirDialogue({
      titre: `Modifier la matière « ${matiere.nom} »`,
      champs: [
        { nom: 'nom', libelle: 'Nom', valeur: matiere.nom, maxlength: 100 },
        { nom: 'coefficient', libelle: 'Coefficient (1 à 20)', type: 'number', valeur: matiere.coefficient, min: 1, max: 20, step: 'any' },
      ],
      onValider: async (v) => {
        const coefficient = lireNombre(v.coefficient);
        if (Number.isNaN(coefficient)) throw new Error('Coefficient invalide');
        await appelApi(`/matieres/${matiere._id}`, 'PUT', { nom: v.nom, coefficient });
        notifier('Matière modifiée');
        await chargerDonneesGestion();
      },
    });
  } else if (bouton.dataset.action === 'reinitialiser-acces') {
    if (!confirm(`Générer un nouveau mot de passe pour « ${matiere.nom} » ?\nL'ancien ne fonctionnera plus.`)) return;
    try {
      const rep = await appelApi(`/matieres/${matiere._id}/acces`, 'POST', {});
      afficherAcces(matiere.nom, rep.acces);
    } catch (err) {
      notifier(err.message, 'erreur');
    }
  } else if (bouton.dataset.action === 'supprimer-matiere') {
    const ok = confirm(
      `Supprimer la matière "${matiere.nom}" ?\nToutes ses notes et le compte de connexion de l'enseignant seront supprimés définitivement.`
    );
    if (!ok) return;
    try {
      const rep = await appelApi(`/matieres/${matiere._id}`, 'DELETE');
      notifier(rep.message);
      await chargerDonneesGestion();
    } catch (err) {
      notifier(err.message, 'erreur');
    }
  }
});

// --- ESPACE ADMINISTRATEUR : classes (et leurs enseignants, via les matières) ---
const libelleMatiereAdmin = (m) => `${m.nom} — ${m.enseignant ? m.enseignant.email : 'sans compte'}`;

// Cases à cocher des matières du formulaire de création (les cases déjà cochées sont conservées)
function rendreCasesMatieres() {
  const div = $('classeMatieres');
  const cochees = new Set([...div.querySelectorAll('input:checked')].map((i) => i.value));
  div.innerHTML = matieresAdmin.length
    ? matieresAdmin
        .map(
          (m) => `<label class="case"><input type="checkbox" value="${esc(m._id)}"${cochees.has(m._id) ? ' checked' : ''} />
            ${esc(m.nom)} <span class="aide">— ${esc(m.enseignant ? m.enseignant.email : 'sans compte')}</span></label>`
        )
        .join('')
    : '<p class="aide">Créez d\'abord des matières (onglet « Matières »).</p>';
}

function rendreListeClasses() {
  const div = $('listeClasses');
  if (!classesApi.length) {
    div.innerHTML = '<p>Aucune classe pour le moment.</p>';
    return;
  }
  div.innerHTML = `
    <table>
      <thead><tr><th>Classe</th><th>Élèves</th><th>Matières et enseignants</th><th>Actions</th></tr></thead>
      <tbody>
        ${classesApi
          .map(
            (c) => `<tr>
              <td>${esc(c.nom)}</td>
              <td>${esc(c.effectif)}</td>
              <td>${
                c.matieres.length
                  ? `<ul class="liste-simple">${c.matieres
                      .map((m) => `<li>${esc(m.nom)} — <span class="aide">${esc(m.enseignant ? m.enseignant.email : 'sans compte')}</span></li>`)
                      .join('')}</ul>`
                  : '<span class="aide">Aucune matière</span>'
              }</td>
              <td>
                <button type="button" class="btn-petit" data-action="modifier-classe" data-id="${esc(c._id)}">Modifier</button>
                <button type="button" class="btn-petit btn-danger" data-action="supprimer-classe" data-id="${esc(c._id)}">Supprimer</button>
              </td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

$('formClasse').addEventListener('submit', async (e) => {
  e.preventDefault();
  const matieres = [...$('classeMatieres').querySelectorAll('input:checked')].map((i) => i.value);
  await pendant(e.submitter, async () => {
    try {
      await appelApi('/classes', 'POST', { nom: $('classeNom').value, matieres });
      $('classeNom').value = '';
      $('classeMatieres').querySelectorAll('input').forEach((i) => {
        i.checked = false;
      });
      notifier('Classe créée');
      await chargerDonneesGestion();
    } catch (err) {
      notifier(err.message, 'erreur');
    }
  });
});

$('listeClasses').addEventListener('click', async (e) => {
  const bouton = e.target.closest('button[data-action]');
  if (!bouton) return;
  const classe = classesApi.find((c) => c._id === bouton.dataset.id);
  if (!classe) return;

  if (bouton.dataset.action === 'modifier-classe') {
    ouvrirDialogue({
      titre: `Modifier la classe « ${classe.nom} »`,
      champs: [
        { nom: 'nom', libelle: 'Nom de la classe', valeur: classe.nom, maxlength: 50 },
        {
          nom: 'matieres',
          libelle: 'Matières enseignées dans cette classe',
          type: 'cases',
          valeur: classe.matieres.map((m) => m._id),
          options: matieresAdmin.map((m) => ({ valeur: m._id, libelle: libelleMatiereAdmin(m) })),
        },
      ],
      onValider: async (v) => {
        await appelApi(`/classes/${classe._id}`, 'PUT', { nom: v.nom, matieres: v.matieres });
        notifier('Classe modifiée');
        await chargerDonneesGestion();
      },
    });
  } else if (bouton.dataset.action === 'supprimer-classe') {
    if (!confirm(`Supprimer la classe "${classe.nom}" ?\nElle doit être vide (aucun élève inscrit).`)) return;
    try {
      await appelApi(`/classes/${classe._id}`, 'DELETE');
      notifier('Classe supprimée');
      await chargerDonneesGestion();
    } catch (err) {
      notifier(err.message, 'erreur');
    }
  }
});

// --- ESPACE ADMINISTRATEUR : élèves (fiche, identifiant, mot de passe) ---
function rendreSelectClassesEleve() {
  const select = $('eleveClasse');
  const precedente = select.value;
  select.innerHTML = classesApi.length
    ? '<option value="">Choisir une classe…</option>' + classesApi.map((c) => `<option value="${esc(c.nom)}">${esc(c.nom)}</option>`).join('')
    : "<option value=\"\">Créez d'abord une classe</option>";
  if (classesApi.some((c) => c.nom === precedente)) select.value = precedente;
}

const dateNaissanceVersInput = (valeur) => (valeur ? String(valeur).slice(0, 10) : '');
const ligneCoordonnee = (libelle, valeur) => (valeur ? `<div><span class="aide">${libelle}</span> ${esc(valeur)}</div>` : '');

function rendreListeElevesAdmin() {
  const eleves = elevesFiltres();
  const classe = $('classeActive').value;
  $('resumeEleves').textContent = `${eleves.length} élève(s)${classe ? ` — classe ${classe}` : ' — toutes les classes'}`;
  const div = $('listeElevesAdmin');
  if (!eleves.length) {
    div.innerHTML = '<p>Aucun élève pour cette sélection.</p>';
    return;
  }
  div.innerHTML = `
    <table>
      <thead><tr><th>Élève</th><th>Classe</th><th>Âge</th><th>Identifiant</th><th>Coordonnées</th><th>Actions</th></tr></thead>
      <tbody>
        ${eleves
          .map((el) => {
            const coordonnees =
              ligneCoordonnee('Tél.', el.telephone) + ligneCoordonnee('Adresse', el.adresse) + ligneCoordonnee('Tuteur', el.tuteur);
            return `<tr>
              <td>${esc(el.nom)} ${esc(el.prenom)}</td>
              <td>${esc(el.classe || '-')}</td>
              <td>${el.age === null || el.age === undefined ? '-' : `${esc(el.age)} ans`}</td>
              <td class="notes-detail">${esc(el.email)}</td>
              <td class="notes-detail">${coordonnees || '<span class="aide">—</span>'}</td>
              <td>
                <button type="button" class="btn-petit" data-action="modifier-eleve" data-id="${esc(el._id)}">Modifier</button>
                <button type="button" class="btn-petit" data-action="reinitialiser-acces-eleve" data-id="${esc(el._id)}">Nouveau mot de passe</button>
                <button type="button" class="btn-petit btn-danger" data-action="supprimer-eleve" data-id="${esc(el._id)}">Supprimer</button>
              </td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>`;
}

$('formEleve').addEventListener('submit', async (e) => {
  e.preventDefault();
  const corps = { nom: $('eleveNom').value, prenom: $('elevePrenom').value, classe: $('eleveClasse').value };
  if (!corps.classe) return notifier("Choisissez une classe (créez-la d'abord si besoin)", 'erreur');
  // Les champs facultatifs vides ne sont pas envoyés
  [['dateNaissance', 'eleveNaissance'], ['adresse', 'eleveAdresse'], ['telephone', 'eleveTelephone'], ['tuteur', 'eleveTuteur'], ['identifiant', 'eleveIdentifiant']].forEach(
    ([champ, id]) => {
      if ($(id).value.trim()) corps[champ] = $(id).value;
    }
  );

  await pendant(e.submitter, async () => {
    try {
      const rep = await appelApi('/users/eleves', 'POST', corps);
      ['eleveNom', 'elevePrenom', 'eleveNaissance', 'eleveAdresse', 'eleveTelephone', 'eleveTuteur', 'eleveIdentifiant'].forEach((id) => {
        $(id).value = '';
      });
      await chargerDonneesGestion();
      // On affiche la classe de l'élève ajouté, pour le voir dans la liste (la classe reste choisie pour enchaîner les saisies)
      const select = $('classeActive');
      if ([...select.options].some((o) => o.value === rep.donnees.classe)) {
        select.value = rep.donnees.classe;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      afficherAcces(`${rep.donnees.prenom} ${rep.donnees.nom}`, rep.acces);
    } catch (err) {
      notifier(err.message, 'erreur');
    }
  });
});

$('listeElevesAdmin').addEventListener('click', async (e) => {
  const bouton = e.target.closest('button[data-action]');
  if (!bouton) return;
  const eleve = elevesConnus.find((el) => el._id === bouton.dataset.id);
  if (!eleve) return;
  const identite = `${eleve.prenom} ${eleve.nom}`;

  if (bouton.dataset.action === 'modifier-eleve') {
    const classes = classesApi.map((c) => c.nom);
    if (eleve.classe && !classes.some((c) => memeClasse(c, eleve.classe))) classes.unshift(eleve.classe); // classe d'avant les classes
    const initial = {
      nom: eleve.nom,
      prenom: eleve.prenom,
      classe: eleve.classe || '',
      dateNaissance: dateNaissanceVersInput(eleve.dateNaissance),
      adresse: eleve.adresse || '',
      telephone: eleve.telephone || '',
      tuteur: eleve.tuteur || '',
      identifiant: eleve.email,
    };
    ouvrirDialogue({
      titre: `Fiche de ${identite}`,
      champs: [
        { nom: 'nom', libelle: 'Nom', valeur: initial.nom, maxlength: 100 },
        { nom: 'prenom', libelle: 'Prénom', valeur: initial.prenom, maxlength: 100 },
        { nom: 'classe', libelle: 'Classe', type: 'select', valeur: initial.classe, options: classes.map((c) => ({ valeur: c, libelle: c })) },
        { nom: 'dateNaissance', libelle: 'Date de naissance', type: 'date', valeur: initial.dateNaissance, facultatif: true },
        { nom: 'adresse', libelle: 'Adresse', valeur: initial.adresse, maxlength: 200, facultatif: true },
        { nom: 'telephone', libelle: 'Téléphone', type: 'tel', valeur: initial.telephone, maxlength: 30, facultatif: true },
        { nom: 'tuteur', libelle: 'Parent / tuteur', valeur: initial.tuteur, maxlength: 150, facultatif: true },
        { nom: 'identifiant', libelle: 'Identifiant de connexion (email)', type: 'email', valeur: initial.identifiant, maxlength: 254 },
      ],
      onValider: async (v) => {
        // On n'envoie que ce qui a changé (une classe d'avant les classes ne bloque donc pas les autres modifications)
        const corps = {};
        Object.keys(initial).forEach((champ) => {
          if (v[champ] !== initial[champ]) corps[champ] = v[champ];
        });
        if (!Object.keys(corps).length) {
          notifier('Aucune modification');
          return;
        }
        await appelApi(`/users/eleves/${eleve._id}`, 'PUT', corps);
        notifier('Fiche modifiée');
        await chargerDonneesGestion();
      },
    });
  } else if (bouton.dataset.action === 'reinitialiser-acces-eleve') {
    if (!confirm(`Générer un nouveau mot de passe pour ${identite} ?\nL'ancien ne fonctionnera plus et sa session en cours sera fermée.`)) return;
    try {
      const rep = await appelApi(`/users/eleves/${eleve._id}/acces`, 'POST', {});
      afficherAcces(identite, rep.acces);
    } catch (err) {
      notifier(err.message, 'erreur');
    }
  } else if (bouton.dataset.action === 'supprimer-eleve') {
    if (!confirm(`Supprimer ${identite} ?\nSon compte et toutes ses notes seront supprimés définitivement.`)) return;
    try {
      const rep = await appelApi(`/users/eleves/${eleve._id}`, 'DELETE');
      notifier(rep.message);
      await chargerDonneesGestion();
    } catch (err) {
      notifier(err.message, 'erreur');
    }
  }
});

// --- Saisie rapide (toute la classe) ---
$('formLot').addEventListener('submit', async (e) => {
  e.preventDefault();
  const matiere = $('lotMatiere').value;
  if (!matiere) return notifier("Sélectionnez une matière (créez-en une d'abord)", 'erreur');

  const lignes = [...document.querySelectorAll('#lotEleves input[data-eleve]')]
    .filter((champ) => champ.value.trim() !== '')
    .map((champ) => ({ champ, eleve: champ.dataset.eleve, nom: champ.dataset.nom, valeur: lireNombre(champ.value) }));
  if (!lignes.length) return notifier('Aucune note saisie', 'erreur');

  const invalide = lignes.find((l) => Number.isNaN(l.valeur) || l.valeur < 0 || l.valeur > 20);
  if (invalide) {
    invalide.champ.focus();
    return notifier(`Note invalide pour ${invalide.nom} (0 à 20)`, 'erreur');
  }

  const commun = {
    matiere,
    type: $('lotType').value,
    coefficientNote: lireNombre($('lotCoefficient').value) || 1,
    dateEvaluation: inputVersDate($('lotDate').value),
  };

  await pendant($('btnEnregistrerLot'), async () => {
    try {
      let enregistrees = 0;
      for (let i = 0; i < lignes.length; i += 100) {
        const lot = lignes.slice(i, i + 100);
        await appelApi('/notes/lot', 'POST', { ...commun, notes: lot.map((l) => ({ eleve: l.eleve, valeur: l.valeur })) });
        lot.forEach((l) => {
          l.champ.value = '';
        });
        enregistrees += lot.length;
      }
      notifier(`${enregistrees} note(s) enregistrée(s)`);
      if ($('gestionEleveSelect').value && $('listeNotesGestion').innerHTML.trim()) chargerNotesGestion();
    } catch (err) {
      notifier(err.message, 'erreur');
    }
  });
});

// --- Note individuelle ---
$('formNote').addEventListener('submit', async (e) => {
  e.preventDefault();
  const corps = {
    eleve: $('noteEleve').value,
    matiere: $('noteMatiere').value,
    valeur: lireNombre($('noteValeur').value),
    type: $('noteType').value,
    coefficientNote: lireNombre($('noteCoefficient').value) || 1,
    dateEvaluation: inputVersDate($('noteDate').value),
  };
  if (!corps.eleve) return notifier('Aucun élève sélectionné', 'erreur');
  if (!corps.matiere) return notifier("Sélectionnez une matière (créez-en une d'abord)", 'erreur');
  if (Number.isNaN(corps.valeur)) return notifier('Note invalide', 'erreur');

  await pendant(e.submitter, async () => {
    try {
      await appelApi('/notes', 'POST', corps);
      $('noteValeur').value = '';
      notifier('Note ajoutée avec succès');
      if ($('gestionEleveSelect').value === corps.eleve && $('listeNotesGestion').innerHTML.trim()) {
        chargerNotesGestion();
      }
    } catch (err) {
      notifier(err.message, 'erreur');
    }
  });
});

// --- Notes par élève (consultation / modification / suppression) ---
async function chargerNotesGestion() {
  const eleveId = $('gestionEleveSelect').value;
  const div = $('listeNotesGestion');
  if (!eleveId) {
    div.innerHTML = '<p>Sélectionnez un élève.</p>';
    return;
  }
  try {
    const matiere = $('gestionMatiereSelect').value;
    const rep = await appelApi(
      `/notes?eleve=${encodeURIComponent(eleveId)}${matiere ? `&matiere=${encodeURIComponent(matiere)}` : ''}&limite=200`
    );
    notesGestion = rep.donnees;
    if (!notesGestion.length) {
      div.innerHTML = "<p>Aucune note pour cette sélection.</p>";
      return;
    }
    // L'administrateur consulte seulement : pas de colonne d'actions
    const lectureSeule = utilisateur.role === 'admin';
    div.innerHTML = `
      <table>
        <thead><tr><th>Matière</th><th>Note</th><th>Type</th><th>Coef.</th><th>Date</th>${lectureSeule ? '' : '<th>Actions</th>'}</tr></thead>
        <tbody>
          ${notesGestion
            .map((n) => {
              const modifiable = n.matiere && mesMatieres.some((m) => m._id === n.matiere._id);
              const actions = modifiable
                ? `<button type="button" class="btn-petit" data-action="modifier-note" data-id="${esc(n._id)}">Modifier</button>
                   <button type="button" class="btn-petit btn-danger" data-action="supprimer-note" data-id="${esc(n._id)}">Supprimer</button>`
                : '<span class="aide">—</span>';
              return `<tr>
                <td>${esc(n.matiere ? n.matiere.nom : '-')}</td>
                <td>${esc(n.valeur)}/20</td>
                <td>${esc(n.type)}</td>
                <td>${esc(n.coefficientNote)}</td>
                <td>${dateFr(n.dateEvaluation)}</td>
                ${lectureSeule ? '' : `<td>${actions}</td>`}
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>`;
  } catch (err) {
    notifier(err.message, 'erreur');
  }
}

$('gestionEleveSelect').addEventListener('change', chargerNotesGestion);
$('gestionMatiereSelect').addEventListener('change', chargerNotesGestion);

$('listeNotesGestion').addEventListener('click', async (e) => {
  const bouton = e.target.closest('button[data-action]');
  if (!bouton) return;
  const note = notesGestion.find((n) => n._id === bouton.dataset.id);
  if (!note) return;

  if (bouton.dataset.action === 'modifier-note') {
    ouvrirDialogue({
      titre: `Modifier la note — ${note.matiere ? note.matiere.nom : ''}`,
      champs: [
        { nom: 'valeur', libelle: 'Note (sur 20)', type: 'number', valeur: note.valeur, min: 0, max: 20, step: 'any' },
        { nom: 'type', libelle: 'Type', type: 'select', valeur: note.type, options: OPTIONS_TYPE },
        { nom: 'coefficientNote', libelle: "Coefficient de l'évaluation", type: 'number', valeur: note.coefficientNote, min: 1, max: 20, step: 'any' },
        { nom: 'dateEvaluation', libelle: "Date de l'évaluation", type: 'date', valeur: dateVersInput(note.dateEvaluation) },
      ],
      onValider: async (v) => {
        const valeur = lireNombre(v.valeur);
        const coefficientNote = lireNombre(v.coefficientNote);
        if (Number.isNaN(valeur)) throw new Error('Note invalide');
        if (Number.isNaN(coefficientNote)) throw new Error('Coefficient invalide');
        if (!v.dateEvaluation) throw new Error('Date invalide');
        await appelApi(`/notes/${note._id}`, 'PUT', {
          valeur,
          type: v.type,
          coefficientNote,
          dateEvaluation: inputVersDate(v.dateEvaluation),
        });
        notifier('Note modifiée');
        chargerNotesGestion();
      },
    });
  } else if (bouton.dataset.action === 'supprimer-note') {
    if (!confirm('Supprimer définitivement cette note ?')) return;
    try {
      await appelApi(`/notes/${note._id}`, 'DELETE');
      notifier('Note supprimée');
      chargerNotesGestion();
    } catch (err) {
      notifier(err.message, 'erreur');
    }
  }
});

// --- Classement de la classe ---
$('btnClassement').addEventListener('click', async () => {
  const classe = $('classeActive').value;
  if (!classe) return notifier('Choisissez d\'abord une classe dans « Classe active »', 'erreur');
  await pendant($('btnClassement'), async () => {
    try {
      const rep = await appelApi(`/bulletins/classe/${encodeURIComponent(classe)}`);
      const c = rep.donnees;
      const estAdmin = utilisateur.role === 'admin';
      $('resultatClassement').innerHTML = `
        <p class="resume-classe">Classe ${esc(c.classe)} — ${esc(c.effectif)} élève(s), ${esc(c.effectifNotes)} avec notes —
          moyenne de la classe : ${fmt(c.moyenneClasse)}/20</p>
        <table>
          <thead><tr><th>Rang</th><th>Élève</th>${estAdmin ? '<th>Email</th>' : ''}<th>Moyenne</th><th>Mention</th><th>Bulletin</th></tr></thead>
          <tbody>
            ${c.eleves
              .map(
                (el) => `<tr>
                  <td>${el.rang === null ? '-' : esc(el.rang)}</td>
                  <td>${esc(el.nom)} ${esc(el.prenom)}</td>
                  ${estAdmin ? `<td class="notes-detail">${esc((elevesConnus.find((e) => e._id === el.id) || {}).email || '-')}</td>` : ''}
                  <td class="nombre">${el.moyenneGenerale === null ? '<span class="aide">aucune note</span>' : `${fmt(el.moyenneGenerale)}/20`}</td>
                  <td>${esc(el.mention || '-')}</td>
                  <td><button type="button" class="btn-petit" data-eleve="${esc(el.id)}">Voir</button></td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>`;
    } catch (err) {
      notifier(err.message, 'erreur');
    }
  });
});

$('resultatClassement').addEventListener('click', (e) => {
  const bouton = e.target.closest('button[data-eleve]');
  if (bouton) afficherBulletin(bouton.dataset.eleve);
});

$('btnVoirBulletin').addEventListener('click', async () => {
  const eleveId = $('bulletinEleveSelect').value;
  if (!eleveId) return notifier('Aucun élève sélectionné', 'erreur');
  await afficherBulletin(eleveId);
});

// --- ESPACE ÉLÈVE ---
function rendreNotesEleve() {
  const div = $('listeNotesEleve');
  const filtre = $('filtreMatiereEleve').value;
  const notes = filtre ? notesEleve.filter((n) => n.matiere && n.matiere._id === filtre) : notesEleve;
  if (!notes.length) {
    div.innerHTML = '<p>Aucune note pour le moment.</p>';
    return;
  }
  div.innerHTML = `
    <table>
      <thead><tr><th>Matière</th><th>Note</th><th>Type</th><th>Coef.</th><th>Date</th></tr></thead>
      <tbody>
        ${notes
          .map(
            (n) => `<tr>
              <td>${esc(n.matiere ? n.matiere.nom : '-')}</td>
              <td>${esc(n.valeur)}/20</td>
              <td>${esc(n.type)}</td>
              <td>${esc(n.coefficientNote)}</td>
              <td>${dateFr(n.dateEvaluation)}</td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

async function chargerMesNotes() {
  try {
    const reponse = await appelApi('/notes?limite=200');
    notesEleve = reponse.donnees;

    // Liste des matières présentes dans les notes de l'élève, pour le filtre
    const matieres = new Map();
    notesEleve.forEach((n) => {
      if (n.matiere) matieres.set(n.matiere._id, n.matiere.nom);
    });
    const filtre = $('filtreMatiereEleve');
    const precedent = filtre.value;
    filtre.innerHTML =
      '<option value="">Toutes les matières</option>' +
      [...matieres.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'fr'))
        .map(([id, nom]) => `<option value="${esc(id)}">${esc(nom)}</option>`)
        .join('');
    if (precedent && matieres.has(precedent)) filtre.value = precedent;

    rendreNotesEleve();
  } catch (err) {
    notifier(err.message, 'erreur');
  }
}

$('filtreMatiereEleve').addEventListener('change', rendreNotesEleve);
$('btnMonBulletin').addEventListener('click', () => afficherBulletin(utilisateur.id));

// --- BULLETIN ---
const detailNotes = (notes) =>
  notes.map((n) => `${esc(n.valeur)}${n.coefficientNote > 1 ? ` (×${esc(n.coefficientNote)})` : ''}`).join(' ; ');

async function afficherBulletin(eleveId) {
  try {
    const reponse = await appelApi(`/bulletins/${encodeURIComponent(eleveId)}`);
    const b = reponse.donnees;
    const enTete = `<h3>${esc(b.eleve.prenom)} ${esc(b.eleve.nom)}${b.eleve.classe ? ` — ${esc(b.eleve.classe)}` : ''}</h3>`;

    if (b.moyenneGenerale === null) {
      $('contenuBulletin').innerHTML = `${enTete}<p>${esc(b.message || 'Aucune note enregistrée.')}</p>`;
    } else {
      const avecClasse = b.moyenneClasse !== null && b.moyenneClasse !== undefined;
      $('contenuBulletin').innerHTML = `
        ${enTete}
        <table>
          <thead><tr><th>Matière</th><th>Coef.</th><th>Notes</th><th>Moyenne</th>${avecClasse ? '<th>Moy. classe</th>' : ''}</tr></thead>
          <tbody>
            ${b.matieres
              .map(
                (m) => `<tr>
                  <td>${esc(m.matiere)}</td><td>${esc(m.coefficient)}</td>
                  <td class="notes-detail">${detailNotes(m.notes)}</td>
                  <td class="nombre">${fmt(m.moyenneMatiere)}/20</td>
                  ${avecClasse ? `<td class="nombre">${m.moyenneClasse === null || m.moyenneClasse === undefined ? '-' : `${fmt(m.moyenneClasse)}/20`}</td>` : ''}
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
        <p class="moyenne-generale">Moyenne générale : ${fmt(b.moyenneGenerale)}/20</p>
        <p class="mention">Mention : ${esc(b.mention)}</p>
        ${b.rang ? `<p class="rang">Rang dans la classe : ${esc(b.rang)} / ${esc(b.effectif)}${avecClasse ? ` — moyenne de la classe : ${fmt(b.moyenneClasse)}/20` : ''}</p>` : ''}
        <p class="aide">Édité le ${dateFr(b.dateGeneration)}</p>`;
    }
    $('sectionBulletin').classList.remove('cachee');
    $('sectionBulletin').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    notifier(err.message, 'erreur');
  }
}

$('btnFermerBulletin').addEventListener('click', () => $('sectionBulletin').classList.add('cachee'));
$('btnImprimerBulletin').addEventListener('click', () => window.print());

majAffichage();
