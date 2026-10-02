// Variables d'environnement utilisées pendant les tests (exécuté avant chaque fichier de test)
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'cle_secrete_uniquement_pour_les_tests_1234567890';
process.env.JWT_EXPIRES_IN = '1h';
