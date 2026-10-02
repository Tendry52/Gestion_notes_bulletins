const { calculerAge } = require('../../src/utils/age');

describe('calculerAge', () => {
  const le = (iso) => new Date(`${iso}T12:00:00Z`);

  test('âge en années entières, avant et après l’anniversaire', () => {
    expect(calculerAge('2004-03-12', le('2026-03-11'))).toBe(21); // veille de l'anniversaire
    expect(calculerAge('2004-03-12', le('2026-03-12'))).toBe(22); // jour de l'anniversaire
    expect(calculerAge('2004-03-12', le('2026-12-31'))).toBe(22);
    expect(calculerAge('2004-12-31', le('2026-01-01'))).toBe(21);
  });

  test('né un 29 février, et jour de naissance', () => {
    expect(calculerAge('2004-02-29', le('2026-02-28'))).toBe(21);
    expect(calculerAge('2004-02-29', le('2026-03-01'))).toBe(22);
    expect(calculerAge('2026-05-01', le('2026-05-01'))).toBe(0);
  });

  test('sans date de naissance : null', () => {
    expect(calculerAge(undefined)).toBeNull();
    expect(calculerAge(null)).toBeNull();
  });
});
