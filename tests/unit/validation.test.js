const {
  estObjectId,
  exigerChaine,
  exigerNombre,
  exigerValeurParmi,
  exigerDate,
  garderChamps,
  lirePagination,
  lireParamChaine,
  regexExacte,
} = require('../../src/utils/validation');

describe('validation', () => {
  test('estObjectId', () => {
    expect(estObjectId('507f1f77bcf86cd799439011')).toBe(true);
    expect(estObjectId('123')).toBe(false);
    expect(estObjectId({ $ne: null })).toBe(false);
    expect(estObjectId(undefined)).toBe(false);
  });

  test('exigerChaine nettoie, refuse les non-textes et les longueurs hors bornes', () => {
    expect(exigerChaine('  Maths  ', 'nom')).toBe('Maths');
    expect(() => exigerChaine('', 'nom')).toThrow(/obligatoire/);
    expect(() => exigerChaine({ $gt: '' }, 'email')).toThrow(/texte/);
    expect(() => exigerChaine('abc', 'mdp', { min: 8 })).toThrow(/au moins 8/);
    expect(() => exigerChaine('a'.repeat(11), 'nom', { max: 10 })).toThrow(/dépasser 10/);
  });

  test('exigerNombre accepte nombres et chaînes numériques, refuse le reste', () => {
    expect(exigerNombre(15.5, 'v', { min: 0, max: 20 })).toBe(15.5);
    expect(exigerNombre('12', 'v', { min: 0, max: 20 })).toBe(12);
    expect(() => exigerNombre(21, 'v', { min: 0, max: 20 })).toThrow(/compris entre/);
    expect(() => exigerNombre(-1, 'v', { min: 0, max: 20 })).toThrow();
    expect(() => exigerNombre('abc', 'v')).toThrow(/nombre/);
    expect(() => exigerNombre(NaN, 'v')).toThrow();
    expect(() => exigerNombre('', 'v')).toThrow();
    expect(() => exigerNombre(null, 'v')).toThrow();
  });

  test('exigerValeurParmi', () => {
    expect(exigerValeurParmi('tp', 'type', ['tp', 'examen'])).toBe('tp');
    expect(() => exigerValeurParmi('admin', 'role', ['eleve', 'enseignant'])).toThrow();
  });

  test('exigerDate', () => {
    expect(exigerDate('2026-05-01', 'date')).toBeInstanceOf(Date);
    expect(() => exigerDate('pas une date', 'date')).toThrow(/date valide/);
    expect(() => exigerDate({}, 'date')).toThrow();
  });

  test('garderChamps ne conserve que les champs autorisés', () => {
    expect(garderChamps({ valeur: 1, eleve: 'x', role: 'admin' }, ['valeur'])).toEqual({ valeur: 1 });
    expect(garderChamps(undefined, ['valeur'])).toEqual({});
  });

  test('lirePagination borne page et limite', () => {
    expect(lirePagination({})).toEqual({ page: 1, limite: 50, skip: 0 });
    expect(lirePagination({ page: '3', limite: '10' })).toEqual({ page: 3, limite: 10, skip: 20 });
    expect(lirePagination({ page: '-4', limite: '99999' }, { limiteMax: 200 })).toEqual({ page: 1, limite: 200, skip: 0 });
    expect(lirePagination({ page: 'abc', limite: 'x' }).limite).toBe(50);
  });

  test('lireParamChaine refuse les objets (?x[$ne]=1)', () => {
    expect(lireParamChaine(undefined, 'x')).toBeUndefined();
    expect(lireParamChaine(' abc ', 'x')).toBe('abc');
    expect(() => lireParamChaine({ $ne: '1' }, 'x')).toThrow();
    expect(() => lireParamChaine(['a', 'b'], 'x')).toThrow();
  });

  test('regexExacte échappe les caractères spéciaux et ignore la casse', () => {
    const re = regexExacte('L2-IDEV (A)');
    expect(re.test('l2-idev (a)')).toBe(true);
    expect(re.test('L2-IDEV (A) bis')).toBe(false);
    expect(regexExacte('.*').test('abc')).toBe(false);
  });
});
