# Listados fiscales — diseño y estado

Módulo de modelos fiscales oficiales (`/listados-fiscales`). Este documento
recoge **lo que se comprobó en las fuentes oficiales** antes de programar
nada, y el estado real de cada modelo. Se mantiene aquí para que la
siguiente tanda de trabajo no tenga que volver a investigarlo.

Fecha de la investigación: 4 de septiembre de 2026.

---

## 1. Vías de presentación verificadas

El encargo pedía «generar el fichero» de siete modelos. Al ir a los
diseños oficiales resulta que **no todos tienen uno**. Esto es lo que se
comprobó, modelo por modelo, en las sedes de los organismos (no en blogs):

| Modelo | Organismo | ¿Diseño de registro público? | Fuente |
|---|---|---|---|
| **347** | AEAT | **Sí** — ejercicio 2025 y siguientes, Orden HAC/1431/2025 | [347.pdf](https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_300_399/archivos/347.pdf) |
| **303** | AEAT | **Sí** — ejercicio 2026 y siguientes (xlsx, act. 28/01/26) | [Diseños 300-399](https://sede.agenciatributaria.gob.es/Sede/ayuda/disenos-registro/modelos-300-399.html) |
| **130** | AEAT | **No** — no figura en el índice de diseños de registro | [Diseños 100-199](https://sede.agenciatributaria.gob.es/Sede/ayuda/disenos-registro/modelos-100-199.html) |
| **131** | AEAT | **No** — ídem | ídem |
| **420** | ATC | **No** — presentación por Sede o programa de ayuda de la ATC | [Trámite 4015](https://sede.gobiernodecanarias.org/sede/tramites/4015) |
| **415** | ATC | **No** — el fichero `.dec` lo genera el programa de ayuda de la ATC; su diseño no se publica como especificación abierta | [Trámite 4010](https://sede.gobiernodecanarias.org/sede/tramites/4010) |
| **425** | ATC | **No** — presentación por la Sede de la ATC | [ATC](https://www3.gobiernodecanarias.org/tributos/atc/) |

**Consecuencia, y es la decisión de diseño más importante del módulo:**
para 130, 131, 415, 420 y 425 **no se inventa un formato de fichero**. Se
implementa cálculo, validación, vista previa y exportación de los datos, y
se documenta que la presentación es manual. Un fichero inventado que se
presenta ante Hacienda se lo come el que lo presenta, no el que lo generó.

### Trampa del 347: el diseño de 2010 no vale

Buscando «diseño de registro 347» sale primero
`347_2010_TIPOSV1.0.pdf`. **Está obsoleto.** Diferencias con el vigente:

- En el de 2010 los importes eran numéricos sin signo. En el vigente cada
  importe lleva **una posición de signo delante** (`N` si es negativo,
  espacio si no).
- En el de 2010 las posiciones 134-500 del registro de declarado iban en
  blanco. En el vigente están **los importes por trimestre** (136-151,
  168-183, 200-215, 232-247) y el NIF de operador comunitario (264-280).

El generador implementa el vigente. Los tests
(`src/lib/fiscal/aeat/modelo347.test.ts`) comprueban posición a posición
contra el PDF oficial.

---

## 2. Qué hay implementado hoy

| Pieza | Estado |
|---|---|
| Arquitectura `FiscalEngine` (tipos, registro de modelos) | Hecho — `src/lib/fiscal/tipos.ts` |
| `FiscalDataService` (lee datos reales vía `storage.ts`) | Hecho |
| Modelo 347: cálculo, validación, vista previa, **fichero oficial** | Hecho, con 46 tests |
| Pantalla `/listados-fiscales` (tarjetas de los 7 modelos) | Hecho |
| Pantalla `/listados-fiscales/347` | Hecho |
| Entrada en el menú lateral | Hecho |
| Modelos 303, 130, 131, 420, 415, 425 | **Pendientes** |
| Historial de generaciones | **Pendiente** |

Los modelos pendientes aparecen en el panel con su tarjeta y el botón
desactivado, diciendo que no están implementados. No se enseña un
resultado inventado para rellenar la tarjeta.

---

## 3. Huecos de datos encontrados en la base de datos

Esto se inspeccionó antes de tocar nada (punto 19 del encargo) y **limita
lo que se puede calcular hoy**, con independencia de cuánto código se
escriba:

1. **No hay facturas recibidas ni gastos.** `invoices` tiene 49 filas, las
   49 con `sentido = 'venta'`; `gastos` tiene 0 filas. Todo el lado de
   soportado/deducible del 303 y del 420 sale a cero mientras eso siga
   así. El cálculo está bien; los datos no existen.

2. **`gastos` no clasifica fiscalmente.** Tiene `tax_rate` y `tax_amount`,
   pero no si la cuota es **deducible**, ni el tipo de operación
   (importación, inversión del sujeto pasivo, bien de inversión, no
   sujeta, exenta). El punto 5 del encargo exige distinguirlas: hacen
   falta columnas nuevas antes de poder hacer un 420 o un 303 correcto.

3. **`company_settings` no guarda el régimen de IRPF** ni el epígrafe de
   IAE. El punto 9 pide comprobar si el 130 o el 131 le corresponden al
   usuario antes de enseñarlo como pendiente: hoy no hay dónde mirarlo.

4. **`invoice_tax_breakdown.rate` es `INTEGER`.** No puede representar
   tipos no enteros. Para IVA/IGIC actuales vale, pero es una limitación
   real a tener presente.

5. **IVA vs IGIC es un interruptor de empresa** (`company_settings.igic_enabled`),
   no un campo por factura. Es correcto —un negocio tributa en uno u
   otro por sus entregas— y el panel lo usa para marcar qué modelos le
   aplican. El tenant activo tiene `igic_enabled = true` (canario).

---

## 4. Orden sugerido para continuar

1. Migración con las columnas del punto 3 (deducibilidad y tipo de
   operación en `gastos`, régimen de IRPF en `company_settings`) y la
   tabla `fiscal_generaciones` del historial.
2. Modelo 420 (es el que de verdad le aplica al tenant activo): cálculo
   de IGIC repercutido y soportado por tipo, liquidación y vista previa.
3. Modelo 303 con su generador, que sí tiene diseño publicado.
4. Modelos 415 y 425 sobre los datos del 420.
5. Modelos 130 y 131, una vez exista el régimen de IRPF.
6. Historial de generaciones y redescarga.
