import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mesurerPosition } from '../../src/app/relais/position';

type Succes = (p: GeolocationPosition) => void;
type Echec = (e: GeolocationPositionError) => void;

/** Un faux GPS piloté par le test : il appelle les rappels quand on le lui dit. */
function fauxGps() {
  const veilles: { succes: Succes; echec: Echec }[] = [];
  const ponctuelles: { succes: Succes; echec: Echec; options: PositionOptions | undefined }[] = [];
  const geo = {
    watchPosition: (succes: Succes, echec: Echec) => veilles.push({ succes, echec }) - 1,
    getCurrentPosition: (succes: Succes, echec: Echec, options?: PositionOptions) => {
      ponctuelles.push({ succes, echec, options });
    },
    clearWatch: vi.fn(),
  } as unknown as Geolocation;
  const position = (precision: number) =>
    ({
      coords: { latitude: -4.79, longitude: 11.93, accuracy: precision },
      timestamp: Date.now(),
    }) as GeolocationPosition;
  const erreur = (code: number) => ({ code, message: '' }) as GeolocationPositionError;
  return { geo, veilles, ponctuelles, position, erreur };
}

describe('la position devant l’entrée', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('ne s’arrête pas sur « position indisponible » passagère (macOS) et garde la mesure suivante', async () => {
    const gps = fauxGps();
    const { fin } = mesurerPosition(() => {}, gps.geo, 20_000);
    gps.veilles[0]?.echec(gps.erreur(2));
    gps.veilles[0]?.succes(gps.position(35));
    vi.advanceTimersByTime(20_000);
    await expect(fin).resolves.toMatchObject({ precisionM: 35 });
  });

  it('tente une mesure moins précise après une erreur', async () => {
    const gps = fauxGps();
    const { fin } = mesurerPosition(() => {}, gps.geo, 20_000);
    gps.veilles[0]?.echec(gps.erreur(2));
    expect(gps.ponctuelles[0]?.options?.enableHighAccuracy).toBe(false);
    gps.ponctuelles[0]?.succes(gps.position(60));
    vi.advanceTimersByTime(20_000);
    await expect(fin).resolves.toMatchObject({ precisionM: 60 });
  });

  it('garde la meilleure mesure et s’arrête dès 10 m', async () => {
    const gps = fauxGps();
    const vues: number[] = [];
    const { fin } = mesurerPosition((m) => vues.push(m.precisionM), gps.geo, 20_000);
    gps.veilles[0]?.succes(gps.position(40));
    gps.veilles[0]?.succes(gps.position(80));
    gps.veilles[0]?.succes(gps.position(8));
    await expect(fin).resolves.toMatchObject({ precisionM: 8 });
    expect(vues).toEqual([40, 8]);
  });

  it('s’arrête tout de suite si la position est refusée', async () => {
    const gps = fauxGps();
    const { fin } = mesurerPosition(() => {}, gps.geo, 20_000);
    gps.veilles[0]?.echec(gps.erreur(1));
    await expect(fin).rejects.toThrow('refusee');
  });

  it('dit « indisponible » si rien n’est venu à la fin du délai', async () => {
    const gps = fauxGps();
    const { fin } = mesurerPosition(() => {}, gps.geo, 20_000);
    gps.veilles[0]?.echec(gps.erreur(2));
    gps.ponctuelles[0]?.echec(gps.erreur(2));
    vi.advanceTimersByTime(20_000);
    await expect(fin).rejects.toThrow('indisponible');
  });

  it('dit « trop longue » si le GPS n’a rien répondu', async () => {
    const gps = fauxGps();
    const { fin } = mesurerPosition(() => {}, gps.geo, 20_000);
    vi.advanceTimersByTime(20_000);
    await expect(fin).rejects.toThrow('trop_longue');
  });
});
