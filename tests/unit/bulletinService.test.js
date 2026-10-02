const {
  arrondir,
  calculerMention,
  calculerMoyenneMatiere,
  calculerBulletin,
  calculerRang,
  calculerStatsClasse,
} = require('../../src/services/bulletinService');

const matiere = (id, nom, coefficient) => ({ _id: id, nom, coefficient });
const note = (m, valeur, coefficientNote = 1, dateEvaluation = '2026-01-10') => ({
  _id: `${m._id}-${valeur}-${coefficientNote}`,
  matiere: m,
  valeur,
  type: 'devoir',
  coefficientNote,
  dateEvaluation,
});

describe('calculerMention', () => {
  test.each([
    [20, 'Très Bien'],
    [16, 'Très Bien'],
    [15.99, 'Bien'],
    [14, 'Bien'],
    [13.99, 'Assez Bien'],
    [12, 'Assez Bien'],
    [11.99, 'Passable'],
    [10, 'Passable'],
    [9.99, 'Insuffisant'],
    [0, 'Insuffisant'],
  ])('moyenne %p → %s', (moyenne, mention) => {
    expect(calculerMention(moyenne)).toBe(mention);
  });

  test('pas de moyenne → pas de mention', () => {
    expect(calculerMention(null)).toBeNull();
  });
});

describe('arrondir', () => {
  test('arrondit à 2 décimales', () => {
    expect(arrondir(14.666666)).toBe(14.67);
    expect(arrondir(1.005)).toBe(1.01);
    expect(arrondir(12)).toBe(12);
  });
});

describe('calculerMoyenneMatiere', () => {
  test('moyenne pondérée par le coefficient de chaque note', () => {
    // (12×1 + 16×2) / 3 = 14.666...
    const notes = [{ valeur: 12, coefficientNote: 1 }, { valeur: 16, coefficientNote: 2 }];
    expect(calculerMoyenneMatiere(notes)).toBeCloseTo(14.6667, 4);
  });

  test('aucune note → null', () => {
    expect(calculerMoyenneMatiere([])).toBeNull();
  });
});

describe('calculerBulletin', () => {
  const maths = matiere('m1', 'Mathématiques', 3);
  const info = matiere('m2', 'Informatique', 2);

  test('moyennes par matière, moyenne générale pondérée et mention', () => {
    const notes = [note(maths, 12, 1), note(maths, 16, 2), note(info, 10, 1)];
    const bulletin = calculerBulletin(notes);

    expect(bulletin.matieres).toHaveLength(2);
    // Tri alphabétique : Informatique avant Mathématiques
    expect(bulletin.matieres[0].matiere).toBe('Informatique');
    expect(bulletin.matieres[0].moyenneMatiere).toBe(10);
    expect(bulletin.matieres[1].matiere).toBe('Mathématiques');
    expect(bulletin.matieres[1].moyenneMatiere).toBe(14.67);
    expect(bulletin.matieres[1].nombreNotes).toBe(2);

    // (14.6667×3 + 10×2) / 5 = 12.8
    expect(bulletin.moyenneGenerale).toBe(12.8);
    expect(bulletin.mention).toBe('Assez Bien');
  });

  test("la moyenne générale utilise les moyennes non arrondies (pas d'erreur cumulée)", () => {
    const m = matiere('m3', 'Algo', 1);
    const bulletin = calculerBulletin([note(m, 10, 1), note(m, 10, 1), note(m, 11, 1)]);
    expect(bulletin.moyenneGenerale).toBe(10.33);
  });

  test('une matière sans note ne compte pas dans la moyenne générale', () => {
    const bulletin = calculerBulletin([note(maths, 14, 1)]);
    expect(bulletin.matieres).toHaveLength(1);
    expect(bulletin.moyenneGenerale).toBe(14);
  });

  test('aucune note → moyenne et mention null (et non 0 / Insuffisant)', () => {
    const bulletin = calculerBulletin([]);
    expect(bulletin).toEqual({ matieres: [], moyenneGenerale: null, mention: null });
  });

  test('ignore les notes dont la matière a été supprimée', () => {
    const orpheline = { _id: 'x', matiere: null, valeur: 3, coefficientNote: 1 };
    const bulletin = calculerBulletin([orpheline, note(maths, 15, 1)]);
    expect(bulletin.moyenneGenerale).toBe(15);
  });

  test('trie les notes de chaque matière par date', () => {
    const bulletin = calculerBulletin([
      note(maths, 10, 1, '2026-03-01'),
      note(maths, 12, 1, '2026-01-01'),
    ]);
    expect(bulletin.matieres[0].notes.map((n) => n.valeur)).toEqual([12, 10]);
  });
});

describe('calculerRang', () => {
  test('classe les élèves par moyenne décroissante', () => {
    const moyennes = new Map([['a', 15], ['b', 12], ['c', 9]]);
    expect(calculerRang(moyennes, 'a')).toEqual({ rang: 1, effectif: 3 });
    expect(calculerRang(moyennes, 'b')).toEqual({ rang: 2, effectif: 3 });
    expect(calculerRang(moyennes, 'c')).toEqual({ rang: 3, effectif: 3 });
  });

  test('les ex æquo partagent le même rang', () => {
    const moyennes = new Map([['a', 14], ['b', 14], ['c', 10]]);
    expect(calculerRang(moyennes, 'a').rang).toBe(1);
    expect(calculerRang(moyennes, 'b').rang).toBe(1);
    expect(calculerRang(moyennes, 'c').rang).toBe(3);
  });

  test('élève absent du classement → null', () => {
    expect(calculerRang(new Map([['a', 10]]), 'zzz')).toBeNull();
  });
});

describe('calculerStatsClasse', () => {
  const maths = matiere('m1', 'Maths', 2);
  const algo = matiere('m2', 'Algo', 1);

  test('moyennes par élève, par matière et de la classe', () => {
    const notesParEleve = new Map([
      ['a', [note(maths, 18), note(algo, 16)]],
      ['b', [note(maths, 10), note(algo, 12)]],
      ['c', [note(maths, 14)]],
      ['sansNote', []],
    ]);
    const stats = calculerStatsClasse(notesParEleve);
    expect(stats.moyennesParEleve.get('a')).toBe(17.33);
    expect(stats.moyennesParEleve.get('b')).toBe(10.67);
    expect(stats.moyennesParEleve.get('c')).toBe(14);
    expect(stats.moyennesParEleve.has('sansNote')).toBe(false);
    expect(stats.moyennesMatieres.get('m1')).toBe(14); // (18 + 10 + 14) / 3
    expect(stats.moyennesMatieres.get('m2')).toBe(14); // (16 + 12) / 2
    expect(stats.moyenneClasse).toBe(14); // (17.33 + 10.67 + 14) / 3
  });

  test('classe sans aucune note → moyenne null', () => {
    const stats = calculerStatsClasse(new Map([['a', []]]));
    expect(stats.moyenneClasse).toBeNull();
    expect(stats.moyennesParEleve.size).toBe(0);
  });
});
