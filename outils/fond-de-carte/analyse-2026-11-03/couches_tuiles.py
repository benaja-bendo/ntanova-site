"""
Décomposition par couche de huit tuiles réelles d'une build PMTiles de Protomaps (protobuf MVT lu à la main) : ce qui pèse dans une tuile.

On lit l'en-tête et les répertoires, puis huit tuiles, traitées en mémoire. Rien n'est enregistré sur le disque.

Usage : python3 -I couches_tuiles.py <url-pmtiles>
"""
import bisect
import gzip
import json
import math
import statistics
import struct
import sys
import urllib.request

URL = sys.argv[1]
OCTETS_LUS = 0


def lire(debut, longueur):
    global OCTETS_LUS
    requete = urllib.request.Request(
        URL,
        headers={
            "Range": f"bytes={debut}-{debut + longueur - 1}",
            "User-Agent": "ntanova-mesure-poids/1.0 (lecture des repertoires, aucune tuile)",
        },
    )
    with urllib.request.urlopen(requete, timeout=120) as reponse:
        donnees = reponse.read()
    OCTETS_LUS += len(donnees)
    return donnees


# --- En-tête -------------------------------------------------------------------------------------------------------
brut = lire(0, 127)
assert brut[:7] == b"PMTiles" and brut[7] == 3, "pas un PMTiles v3"
(racine_off, racine_len, meta_off, meta_len, feuilles_off, feuilles_len, tuiles_off, tuiles_len,
 adressees, entrees, contenus) = struct.unpack("<11Q", brut[8:96])
clusterise, comp_interne, comp_tuiles, type_tuiles, zmin, zmax = struct.unpack("<6B", brut[96:102])
print(f"PMTiles v3 : {tuiles_len / 1e9:.1f} Go de tuiles, z{zmin}-z{zmax}, {entrees:,} entrées, "
      f"{contenus:,} contenus distincts, compression interne={comp_interne} tuiles={comp_tuiles}")
assert comp_interne in (1, 2), "compression des répertoires non gérée"


def decompresser(donnees):
    return gzip.decompress(donnees) if comp_interne == 2 else donnees


# --- Répertoires ---------------------------------------------------------------------------------------------------
class Repertoire:
    __slots__ = ("ids", "runs", "offs", "lens")

    def __init__(self, donnees):
        tampon = decompresser(donnees)
        pos = 0

        def varint():
            nonlocal pos
            decalage = 0
            valeur = 0
            while True:
                octet = tampon[pos]
                pos += 1
                valeur |= (octet & 0x7F) << decalage
                if octet < 0x80:
                    return valeur
                decalage += 7

        n = varint()
        self.ids = []
        dernier = 0
        for _ in range(n):
            dernier += varint()
            self.ids.append(dernier)
        self.runs = [varint() for _ in range(n)]
        self.lens = [varint() for _ in range(n)]
        self.offs = []
        for i in range(n):
            v = varint()
            if v == 0 and i > 0:
                self.offs.append(self.offs[i - 1] + self.lens[i - 1])
            else:
                self.offs.append(v - 1)

    def chercher(self, tuile_id):
        i = bisect.bisect_right(self.ids, tuile_id) - 1
        if i < 0:
            return None
        if self.runs[i] == 0 or tuile_id - self.ids[i] < self.runs[i]:
            return (self.runs[i], self.offs[i], self.lens[i])
        return None


RACINE = Repertoire(lire(racine_off, racine_len))
CACHE_FEUILLES = {}


def resoudre(tuile_id):
    """(offset, longueur) de la tuile, ou None si elle n'existe pas dans l'archive."""
    repertoire = RACINE
    for _ in range(4):
        entree = repertoire.chercher(tuile_id)
        if entree is None:
            return None
        run, off, longueur = entree
        if run > 0:
            return (off, longueur)
        cle = off
        if cle not in CACHE_FEUILLES:
            CACHE_FEUILLES[cle] = Repertoire(lire(feuilles_off + off, longueur))
        repertoire = CACHE_FEUILLES[cle]
    return None


# --- Géométrie des tuiles ------------------------------------------------------------------------------------------
def pivoter(n, x, y, rx, ry):
    if ry == 0:
        if rx == 1:
            x = n - 1 - x
            y = n - 1 - y
        x, y = y, x
    return x, y


def zxy_vers_id(z, x, y):
    acc = ((1 << (2 * z)) - 1) // 3
    n = 1 << z
    d = 0
    s = n // 2
    tx, ty = x, y
    while s > 0:
        rx = 1 if (tx & s) > 0 else 0
        ry = 1 if (ty & s) > 0 else 0
        d += s * s * ((3 * rx) ^ ry)
        tx, ty = pivoter(s, tx, ty, rx, ry)
        s //= 2
    return acc + d


def lonlat_vers_tuile(lon, lat, z):
    n = 1 << z
    x = int((lon + 180.0) / 360.0 * n)
    r = math.radians(lat)
    y = int((1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0 * n)
    return max(0, min(n - 1, x)), max(0, min(n - 1, y))


# Vérification de l'ordre de Hilbert sur les quatre tuiles du zoom 1 (valeurs de la spécification).
assert [zxy_vers_id(1, 0, 0), zxy_vers_id(1, 0, 1), zxy_vers_id(1, 1, 1), zxy_vers_id(1, 1, 0)] == [1, 2, 3, 4]
assert zxy_vers_id(0, 0, 0) == 0


def fenetre(ouest, sud, est, nord, z):
    x0, y1 = lonlat_vers_tuile(ouest, sud, z)
    x1, y0 = lonlat_vers_tuile(est, nord, z)
    return [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]


def mesurer(nom, boite, zooms):
    ouest, sud, est, nord = boite
    print(f"\n=== {nom}  (ouest {ouest}, sud {sud}, est {est}, nord {nord}) ===")
    print(f"{'zoom':>4} {'tuiles':>7} {'présentes':>9} {'distinctes':>10} {'Mo (distinct)':>13} "
          f"{'médiane Ko':>10} {'p90 Ko':>8} {'max Ko':>8}")
    total_distinct = 0
    total_tuiles = 0
    for z in zooms:
        tuiles = fenetre(ouest, sud, est, nord, z)
        vues = {}
        presentes = 0
        for x, y in tuiles:
            r = resoudre(zxy_vers_id(z, x, y))
            if r is None:
                continue
            presentes += 1
            vues[r[0]] = r[1]
        tailles = sorted(vues.values())
        octets = sum(tailles)
        total_distinct += octets
        total_tuiles += len(tuiles)
        if tailles:
            med = statistics.median(tailles) / 1024
            p90 = tailles[min(len(tailles) - 1, int(len(tailles) * 0.9))] / 1024
            mx = tailles[-1] / 1024
        else:
            med = p90 = mx = 0
        print(f"{z:>4} {len(tuiles):>7} {presentes:>9} {len(vues):>10} {octets / 1e6:>13.2f} "
              f"{med:>10.1f} {p90:>8.1f} {mx:>8.1f}")
    print(f"TOTAL {nom} : {total_distinct / 1e6:.1f} Mo d'archive (tuiles distinctes), {total_tuiles:,} tuiles adressées")
    return total_distinct


def centre_3x3(nom, lon, lat, zooms):
    """Le poids d'un bloc de 3 × 3 tuiles autour d'un point : le premier affichage d'une carte centrée ici
    (avec un téléphone de 360 px et des tuiles de 512 px, on demande 2 à 6 tuiles ; 9 est le pire cas)."""
    print(f"\n--- Bloc de 3×3 tuiles autour de {nom} ({lon}, {lat}) : Ko par zoom (pire cas) et 4 tuiles centrales ---")
    print(f"{'zoom':>4} {'9 tuiles Ko':>12} {'centrale Ko':>12} {'4 proches Ko':>13}")
    for z in zooms:
        cx, cy = lonlat_vers_tuile(lon, lat, z)
        n = 1 << z
        somme9 = 0
        centrale = 0
        tailles = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                x, y = cx + dx, cy + dy
                if not (0 <= x < n and 0 <= y < n):
                    continue
                r = resoudre(zxy_vers_id(z, x, y))
                taille = r[1] if r else 0
                somme9 += taille
                tailles.append(((dx, dy), taille))
                if dx == 0 and dy == 0:
                    centrale = taille
        quatre = sorted((t for _, t in tailles), reverse=True)[:4]
        print(f"{z:>4} {somme9 / 1024:>12.1f} {centrale / 1024:>12.1f} {sum(quatre) / 1024:>13.1f}")


# --- Décomposition d'une tuile par couche (protobuf MVT lu à la main) ------------------------------------------------
def lire_varint(buf, p):
    decalage = 0
    valeur = 0
    while True:
        octet = buf[p]
        p += 1
        valeur |= (octet & 0x7F) << decalage
        if octet < 0x80:
            return valeur, p
        decalage += 7


def sauter(buf, p, fil):
    if fil == 0:
        _, p = lire_varint(buf, p)
        return p
    if fil == 1:
        return p + 8
    if fil == 5:
        return p + 4
    raise ValueError("fil inattendu")


def couches_de(mvt):
    sortie = []
    p = 0
    while p < len(mvt):
        etiquette, p = lire_varint(mvt, p)
        champ, fil = etiquette >> 3, etiquette & 7
        if fil == 2:
            longueur, p = lire_varint(mvt, p)
            contenu = mvt[p:p + longueur]
            p += longueur
            if champ == 3:
                q = 0
                nom = "?"
                n_objets = 0
                while q < len(contenu):
                    e, q = lire_varint(contenu, q)
                    c, f = e >> 3, e & 7
                    if f == 2:
                        l, q = lire_varint(contenu, q)
                        if c == 1:
                            nom = contenu[q:q + l].decode()
                        if c == 2:
                            n_objets += 1
                        q += l
                    else:
                        q = sauter(contenu, q, f)
                sortie.append((nom, len(contenu), n_objets, len(gzip.compress(contenu, 6))))
        else:
            p = sauter(mvt, p, fil)
    return sortie


def tuile(z, x, y):
    r = resoudre(zxy_vers_id(z, x, y))
    if not r:
        return None, 0
    off, longueur = r
    brut = lire(tuiles_off + off, longueur)
    return (gzip.decompress(brut) if comp_tuiles == 2 else brut), longueur


def decrire(nom, lon, lat, z):
    x, y = lonlat_vers_tuile(lon, lat, z)
    mvt, comprime = tuile(z, x, y)
    if mvt is None:
        print(f"\n{nom} z{z}/{x}/{y} : absente")
        return
    couches = sorted(couches_de(mvt), key=lambda c: -c[3])
    total = sum(c[3] for c in couches)
    print(f"\n{nom} z{z}/{x}/{y} : {comprime / 1024:.1f} Ko dans l'archive ({len(mvt) / 1024:.1f} Ko décompressés)")
    for n, brut, nb, gz in couches:
        print(f"   {n:<16} {nb:>6} objets  {brut / 1024:>7.1f} Ko bruts  ~{gz / 1024:>6.1f} Ko comprimés seuls ({100 * gz / total:>4.0f} % de la somme)")


decrire("Pointe-Noire, centre", 11.8503297, -4.7975373, 15)
decrire("Pointe-Noire, centre", 11.8503297, -4.7975373, 14)
decrire("Pointe-Noire, centre", 11.8503297, -4.7975373, 12)
decrire("Brazzaville, centre", 15.2712256, -4.2694407, 15)
decrire("Lumumba, centre", 11.8641, -4.8068, 15)
decrire("Tié-Tié, centre", 11.9342, -4.7929, 15)
decrire("Pointe-Noire (pays)", 11.8503297, -4.7975373, 6)
decrire("Pointe-Noire (pays)", 11.8503297, -4.7975373, 8)
print(f"\nOctets lus : {OCTETS_LUS / 1e6:.2f} Mo (répertoires + 8 tuiles décrites)")
