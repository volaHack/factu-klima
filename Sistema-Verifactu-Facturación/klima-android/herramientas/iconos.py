"""
Iconos y pantalla de arranque de la app de Android, a partir del icono de
la web (facturacion-app/public/icon-512.png), para que sean el mismo.

    python herramientas/iconos.py

El icono de la web ya es cuadrado y a sangre (es «maskable»): Android lo
recorta en círculo o en gota según el fabricante, así que se usa tal cual.
"""

from pathlib import Path
from PIL import Image

AQUI = Path(__file__).resolve().parent.parent
ORIGEN = AQUI.parent / 'facturacion-app' / 'public' / 'icon-512.png'
RES = AQUI / 'app' / 'src' / 'main' / 'res'

TAMANOS = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}

icono = Image.open(ORIGEN).convert('RGBA')
for densidad, lado in TAMANOS.items():
    carpeta = RES / f'mipmap-{densidad}'
    carpeta.mkdir(parents=True, exist_ok=True)
    icono.resize((lado, lado), Image.LANCZOS).save(carpeta / 'ic_launcher.png', optimize=True)

# Pantalla de arranque: el icono con esquinas redondeadas sobre el fondo de
# la marca. Chrome la pinta mientras carga la web.
lado = 288
redondo = icono.resize((lado, lado), Image.LANCZOS)
mascara = Image.new('L', (lado, lado), 0)
from PIL import ImageDraw
ImageDraw.Draw(mascara).rounded_rectangle((0, 0, lado, lado), radius=lado // 4, fill=255)
redondo.putalpha(mascara)
(RES / 'drawable').mkdir(parents=True, exist_ok=True)
redondo.save(RES / 'drawable' / 'splash.png', optimize=True)

print('Iconos y splash generados en', RES)
