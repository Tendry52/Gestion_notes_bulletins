# Projet Back-End

Projet N°22: Gestion de notes et bulletins

ANDRIANIHASINAVALONA Tendry Irina : N°23
RALISON Andriniaina Stephano Michel : N°23

## 📝 Description

API REST qui permet de gérer les matières et les notes des élèves, de **calculer automatiquement** les moyennes par matière et la moyenne générale, et de **générer un bulletin** par élève (avec mention et rang dans la classe). L'accès est sécurisé par authentification JWT avec trois rôles aux droits distincts : **admin**, **enseignant** et **élève**.


## ⚙️ Technologies

Node.js ≥ 18 · Express 4 · MongoDB + Mongoose 8 · JWT · bcryptjs · helmet · express-rate-limit · Jest + Supertest (tests)

## 🚀 Installation et lancement

```bash
npm install
cp .env.example .env        # puis renseignez les valeurs (voir ci-dessous)
npm run seed                # (optionnel) données de démonstration
npm run dev                 # ou : npm start
```

Ouvrez ensuite <http://localhost:5000>.

### Configuration (`.env`)

| Variable | Rôle |
|---|---|
| `MONGO_URI` | Adresse de la base MongoDB (**obligatoire**) |
| `JWT_SECRET` | Clé de signature des tokens, 16 caractères minimum (**obligatoire**). Générez-en une : `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |

Le serveur refuse de démarrer si `MONGO_URI` ou `JWT_SECRET` manque ou est trop faible.

### Données de démonstration

- Admin : `admin@demo.mg` — mot de passe `Admin12345`
- Matières (comptes enseignants) : `mathematiques@matieres.local`, `algorithmique@matieres.local`, `base-de-donnees@matieres.local`, `reseaux@matieres.local`, `anglais@matieres.local` — mot de passe `Matiere12345`
- Élèves : `eleve1@demo.mg` … `eleve6@demo.mg` — mot de passe `Eleve12345`
