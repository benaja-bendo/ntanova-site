import { afterEach, expect, it, vi } from 'vitest';
import { jourDuCongo, dateDeclareeValide } from '../../src/modele/date-declaration';
afterEach(() => vi.useRealTimers());
it('la date de déclaration suit le Congo même avant minuit UTC', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-04T23:30:00Z'));
  expect(jourDuCongo()).toBe('2026-11-05');
  expect(dateDeclareeValide('2026-11-05')).toBe(true);
  expect(dateDeclareeValide('2026-11-06')).toBe(false);
});
it('une date impossible n’est pas normalisée en une date autorisée', () => {
  expect(dateDeclareeValide('2026-02-30', '2026-11-04')).toBe(false);
});
