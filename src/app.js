const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { errorHandler, notFound } = require('./middlewares/errorHandler');

const authRoutes = require('./routes/authRoutes');
const matiereRoutes = require('./routes/matiereRoutes');
const noteRoutes = require('./routes/noteRoutes');
const bulletinRoutes = require('./routes/bulletinRoutes');
const userRoutes = require('./routes/userRoutes');
const classeRoutes = require('./routes/classeRoutes');

// CORS : origines explicites via CORS_ORIGIN ; sinon ouvert en développement, fermé en production
const optionsCors = () => {
  if (process.env.CORS_ORIGIN) {
    return { origin: process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean) };
  }
  return { origin: process.env.NODE_ENV !== 'production' };
};

const creerApp = () => {
  const app = express();

  // Derrière un reverse-proxy (Render, Nginx...), permet de lire la vraie IP du client
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          // Évite que certains navigateurs forcent le HTTPS sur http://localhost
          'upgrade-insecure-requests': null,
        },
      },
    })
  );
  app.use(cors(optionsCors()));
  app.use(express.json({ limit: '10kb' }));

  // Sert le frontend minimaliste (bonus)
  app.use(express.static(path.join(__dirname, '..', 'frontend')));

  // Routes de l'API
  app.use('/api/auth', authRoutes);
  app.use('/api/matieres', matiereRoutes);
  app.use('/api/classes', classeRoutes);
  app.use('/api/notes', noteRoutes);
  app.use('/api/bulletins', bulletinRoutes);
  app.use('/api/users', userRoutes);

  app.get('/api', (req, res) => {
    res.json({ message: 'API Gestion des Notes et Bulletins Scolaires - INFO-321' });
  });

  app.get('/api/sante', (req, res) => {
    res.json({ succes: true, statut: 'ok' });
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = creerApp();
