"""La cadena del anuncio: cinco facturas encadenadas con SHA-256 de verdad, con el mismo esquema y la misma preimagen
que la cinta de la web (lib/cintaHero.ts): huella = SHA-256(num | fecha | total con dos decimales | huella anterior),
y la primera parte de la semilla a cero. Las huellas que salen en pantalla no se inventan: salen de aquí.

También calcula las dos variantes que enseña el vídeo:
  · el céntimo: la última factura con un céntimo más (1.210,01 €) → una huella completamente distinta;
  · el cero: a una factura vieja se le quita un cero (2.420,00 € → 242,00 €) → su huella cambia y, desde ahí,
    la «anterior» que guarda cada factura siguiente ya no coincide: la cadena se rompe.
Escribe chain.json. Uso: python3 cadena.py"""
import hashlib
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
IVA = .21
CERO = "0" * 64

# de la más antigua a la más nueva (datos inventados)
FACTURAS = [
    ("FAC-2026/0145", "2026-10-15", "09:14", "Taller Ortiz", 240.00),
    ("FAC-2026/0146", "2026-10-15", "12:37", "Frutas Lola", 2000.00),
    ("FAC-2026/0147", "2026-10-16", "10:05", "Papelería Sol", 86.50),
    ("FAC-2026/0148", "2026-10-16", "16:48", "Clínica Mar", 455.00),
    ("FAC-2026/0149", "2026-10-19", "10:42", "Grupo Ribera SL", 1000.00),
]


def total(base): return round(base * (1 + IVA) + 1e-9, 2)
def sha(num, fecha, tot, ant): return hashlib.sha256(f"{num}|{fecha}|{tot:.2f}|{ant}".encode()).hexdigest()


def cadena(totales):
    out, ant = [], CERO
    for (num, fecha, hora, cliente, _), tot in zip(FACTURAS, totales):
        h = sha(num, fecha, tot, ant)
        out.append({"num": num, "fecha": fecha, "hora": hora, "cliente": cliente, "total": tot, "anterior": ant, "huella": h})
        ant = h
    return out


buena = cadena([total(f[4]) for f in FACTURAS])
# el céntimo: la última factura con 1.210,01 €
ult = buena[-1]
centimo = sha(ult["num"], ult["fecha"], ult["total"] + .01, ult["anterior"])
# el cero: a la segunda (índice 1) se le quita un cero; las siguientes conservan la «anterior» que guardaron
TOCADA = 1
tocada_total = round(buena[TOCADA]["total"] / 10, 2)
tocada_huella = sha(buena[TOCADA]["num"], buena[TOCADA]["fecha"], tocada_total, buena[TOCADA]["anterior"])
assert tocada_huella != buena[TOCADA + 1]["anterior"]
json.dump({"cadena": buena, "centimo": {"total": round(ult["total"] + .01, 2), "huella": centimo},
           "tocada": {"i": TOCADA, "total": tocada_total, "huella": tocada_huella}},
          open(os.path.join(HERE, "chain.json"), "w"), ensure_ascii=False, indent=1)
for r in buena: print(r["num"], f'{r["total"]:>8.2f}', r["huella"][:16], "…")
print("céntimo:", ult["huella"][:16], "→", centimo[:16])
print("cero:", f'{buena[TOCADA]["total"]:.2f} → {tocada_total:.2f}', buena[TOCADA]["huella"][:16], "→", tocada_huella[:16])
