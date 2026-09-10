# La documentación oficial de la AEAT, y sólo la oficial

Todo lo que hay en `src/lib/verifactu/` sale de estos ficheros y de los
documentos que se citan abajo. No de blogs, no de foros, no de tutoriales:
cuando algo de Veri*Factu no cuadra, la única fuente que sirve es la que
publica quien va a validar las facturas.

Los esquemas están aquí copiados a propósito, no enlazados. Un enlace se
cae, cambia de sitio o se actualiza sin avisar, y entonces nadie puede
saber contra qué versión se escribió el código.

## Qué hay en `esquemas/`

| Fichero | Qué es |
|---|---|
| `SistemaFacturacion.wsdl` | El servicio. De aquí salen las direcciones de pruebas y de producción. |
| `SuministroLR.xsd` | El envío: cabecera y hasta 1000 registros. |
| `SuministroInformacion.xsd` | Los registros de alta y de anulación, campo a campo y en su orden. |
| `RespuestaSuministro.xsd` | Lo que contesta la AEAT. |

Descargados de
`https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/informacion-tecnica.html`
el 10 de septiembre de 2026.

## Los otros dos documentos que mandan

- **La huella** — «Detalle de las especificaciones técnicas para generación
  de la huella o hash de los registros de facturación», v0.1.2 del
  27/08/2024. Sus tres ejemplos resueltos están copiados literalmente en
  `src/lib/verifactu/huella.test.ts` y también dentro de la migración 038,
  que se niega a instalarse si la base de datos no los reproduce.

- **Las listas de códigos** — «Diseños de registro de facturación» v1.0
  (`DsRegistroVeriFactu.xlsx`), hoja «6)Listas». De ahí salen los códigos
  de impuesto (L1), tipo de factura (L2), clave de régimen (L8A y L8B),
  calificación de la operación (L9) y causa de exención (L10) que usa
  `src/lib/verifactu/mapeo.ts`.

## Comprobar que el XML sigue valiendo

Las pruebas de `registroXml.test.ts` comprueban el orden de los campos y
los espacios de nombres, que es lo que se rompe al tocar el generador.
Pero la comprobación de verdad es validar contra el esquema, y eso pide un
validador de XSD que no existe en el ecosistema de JavaScript sin arrastrar
media biblioteca.

Se hace a mano, con Python, cuando se toque el generador:

```bash
python docs/aeat/validar.py sobre.xml
```

La última vez que se hizo (10/09/2026) se validaron once formas distintas
—primer registro, encadenado, exenta intracomunitaria, simplificada sin
cliente, rectificativa, varios tipos de IVA, IGIC, anulación primera,
anulación encadenada, lote mixto de alta y anulación, y envío con
representante— y las once pasaron el esquema oficial.
