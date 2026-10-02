const { slugifier, identifiantPourMatiere, identifiantPourEleve, genererMotDePasse } = require('../../src/utils/identifiants');

describe('identifiants de matière', () => {
  test('slugifier retire accents, ponctuation et espaces superflus', () => {
    expect(slugifier('Base de données')).toBe('base-de-donnees');
    expect(slugifier('  Réseaux & Systèmes !! ')).toBe('reseaux-systemes');
    expect(slugifier('???')).toBe('matiere');
  });

  test('identifiantPourMatiere ajoute le domaine et un suffixe éventuel', () => {
    expect(identifiantPourMatiere('Anglais')).toBe('anglais@matieres.local');
    expect(identifiantPourMatiere('Anglais', '2')).toBe('anglais-2@matieres.local');
  });

  test('genererMotDePasse : longueur demandée, sans caractères ambigus, différent à chaque appel', () => {
    const mdp = genererMotDePasse();
    expect(mdp).toHaveLength(12);
    expect(mdp).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
    expect(genererMotDePasse(20)).toHaveLength(20);
    expect(genererMotDePasse()).not.toBe(mdp);
  });
});

describe('identifiants d’élève', () => {
  test('prenom.nom@eleves.local, sans accents ni espaces, avec suffixe éventuel', () => {
    expect(identifiantPourEleve('Faly', 'Andriamanana')).toBe('faly.andriamanana@eleves.local');
    expect(identifiantPourEleve('Hérisoa Marie', "N'Diaye")).toBe('herisoa-marie.n-diaye@eleves.local');
    expect(identifiantPourEleve('Faly', 'Andriamanana', '2')).toBe('faly.andriamanana-2@eleves.local');
    expect(identifiantPourEleve('???', '!!!')).toBe('eleve.eleve@eleves.local');
  });
});
