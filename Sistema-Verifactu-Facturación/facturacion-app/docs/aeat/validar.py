"""
Valida un sobre SOAP de Veri*Factu contra el esquema oficial de la AEAT.

    python docs/aeat/validar.py sobre.xml [otro.xml ...]

Hace falta lxml (`pip install lxml`). No es una dependencia del proyecto:
esto se ejecuta a mano cuando se toca el generador de XML, no en cada
compilación. Un validador de XSD de verdad no existe en JavaScript sin
arrastrar media biblioteca, y no compensa meterlo en el build para algo
que se comprueba cuatro veces al año.

Acepta el sobre SOAP entero: saca el cuerpo y valida lo de dentro, que es
lo que cubre el esquema.
"""

import sys
from pathlib import Path

try:
    from lxml import etree
except ImportError:
    sys.exit('Falta lxml. Instálalo con: pip install lxml')

AQUI = Path(__file__).parent
CUERPO_SOAP = '{http://schemas.xmlsoap.org/soap/envelope/}Body'


def validar(esquema, ruta):
    documento = etree.parse(str(ruta))
    raiz = documento.getroot()

    # Si viene el sobre entero, se valida lo que va dentro del Body.
    cuerpo = raiz.find(CUERPO_SOAP)
    peticion = cuerpo[0] if cuerpo is not None and len(cuerpo) else raiz

    if esquema.validate(peticion):
        print(f'OK    {ruta.name}')
        return True

    print(f'FALLA {ruta.name}')
    for error in esquema.error_log:
        print(f'      línea {error.line}: {error.message}')
    return False


def main(argumentos):
    if not argumentos:
        sys.exit(__doc__)

    esquema = etree.XMLSchema(etree.parse(str(AQUI / 'esquemas' / 'SuministroLR.xsd')))
    fallos = sum(not validar(esquema, Path(a)) for a in argumentos)

    print()
    print('Todos validan.' if fallos == 0 else f'{fallos} no validan.')
    return 1 if fallos else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
