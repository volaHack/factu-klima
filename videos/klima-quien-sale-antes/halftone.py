"""Recortes de semitono para el collage: cada captura del programa (collage/<id>.png, a 3×) pasa a blanco y negro
impreso, como un recorte de periódico. Se reduce primero al doble del ancho con el que sale en pantalla (ANCHO, el
mismo `w` que su sitio en collage.js) para que la trama se vea igual en todas: puntos de unos 6 px en el vídeo.
Los grises planos se vuelven puntos en trama a 45°, lo oscuro (la letra) queda tinta maciza para que se siga leyendo
y el blanco queda papel limpio. Sale collage/ht/<id>.png.
Uso: python halftone.py"""
import os

import numpy as np
from PIL import Image
from scipy.ndimage import grey_closing, maximum_filter, uniform_filter

HERE = os.path.dirname(os.path.abspath(__file__))
PAPER, INK = np.array([244, 238, 223]), np.array([30, 26, 23])
CELL = 12.0           # celda de la trama en píxeles de la salida (al doble de pantalla: ≈ 6 px en el vídeo)
ANCHO = {"tpv": 420, "presupuesto": 390, "fe": 560, "recordatorios": 330, "empresas": 330, "asistente": 330}


def halftone(rgb):
    g = (rgb @ np.array([.299, .587, .114])) / 255.0
    g = np.clip((g - .06) / .9, 0, 1) ** 1.15                       # algo más de contraste, como al fotocopiar
    h, w = g.shape
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = (x + y) / np.sqrt(2), (y - x) / np.sqrt(2)
    cu, cv = np.mod(u, CELL) - CELL / 2, np.mod(v, CELL) - CELL / 2
    # la trama sale solo del tono de fondo (paneles, botones): un cierre morfológico borra la letra antes de medirlo,
    # así no le crecen puntos encima, y la letra lleva un filo de papel limpio, como un calado de imprenta
    base = grey_closing(g, size=(17, 17))
    dark = uniform_filter(1 - base, size=int(CELL))                  # tono medio de cada celda
    rad = CELL / 2 * np.sqrt(np.clip(dark, 0, 1)) * 1.32
    dots = np.clip(rad - np.hypot(cu, cv) + .5, 0, 1) * (dark > .035)
    solid = np.clip((.68 - g) / .16, 0, 1)                           # la letra y los trazos, macizos (también la gris)
    dots *= 1 - maximum_filter(solid, size=7)                        # y con un filo de papel limpio alrededor
    ink = np.maximum(dots, solid)[..., None]
    return (PAPER * (1 - ink) + INK * ink).astype(np.uint8)


if __name__ == "__main__":
    os.makedirs(os.path.join(HERE, "collage", "ht"), exist_ok=True)
    for k, w in ANCHO.items():
        im = Image.open(os.path.join(HERE, "collage", k + ".png")).convert("RGB")
        im = im.resize((2 * w, round(2 * w * im.height / im.width)), Image.LANCZOS)
        out = os.path.join(HERE, "collage", "ht", k + ".png")
        Image.fromarray(halftone(np.asarray(im).astype(np.float32))).save(out, optimize=True)
        print(k, im.width, "×", im.height)
