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
| **303** | AEAT | **Sí** — v1.01, ejercicio 2026 y siguientes | [DR303e26v101.xlsx](https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_300_399/archivos_26/DR303e26v101.xlsx) |
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
| `FiscalCalculationService` (períodos, desgloses, deducibilidad) | Hecho |
| **Modelo 347** — cálculo, validación, vista previa, **fichero oficial** | Hecho |
| **Modelo 303** — cálculo, validación, vista previa, **fichero oficial** | Hecho |
| **Modelo 130** — cálculo acumulado, validación, casillas | Hecho |
| **Modelo 131** — liquidación con el rendimiento de módulos que aporta el usuario | Hecho |
| **Modelo 420** — IGIC repercutido/soportado, liquidación, CSV | Hecho |
| **Modelo 415** — operaciones con terceros IGIC, CSV | Hecho |
| **Modelo 425** — resumen anual desde los cuatro 420, CSV | Hecho |
| Panel con las 7 tarjetas y sus resúmenes reales | Hecho |
| Historial de generaciones con redescarga del fichero | Hecho |
| Migración 036 (clasificación fiscal de gastos, régimen IRPF, historial) | Hecho y **aplicada** |
| Tests | 93 en `src/lib/fiscal/` |

### Ficheros que se generan

| Modelo | Qué produce |
|---|---|
| 347 | Fichero oficial `.347`: registros de 500 posiciones, CRLF, ISO-8859-1 |
| 303 | Fichero oficial `.303`: formato etiquetado `<T3030EEEEPP0000>` + páginas 01 y 03, ISO-8859-1 |
| 130, 131 | CSV con las casillas para copiarlas en el formulario de la Sede |
| 420, 415, 425 | CSV con el detalle para cotejar y archivar |

Los CSV **no son ficheros de presentación**: los modelos de la ATC y los
pagos fraccionados no tienen diseño de registro público, y la pantalla lo
dice en un aviso fijo con enlace al trámite oficial.

## 3. Huecos de datos encontrados en la base de datos

Esto se inspeccionó antes de tocar nada (punto 19 del encargo) y **limita
lo que se puede calcular hoy**, con independencia de cuánto código se
escriba:

1. **No hay facturas recibidas ni gastos.** `invoices` tiene 49 filas, las
   49 con `sentido = 'venta'`; `gastos` tiene 0 filas. El cálculo del
   soportado/deducible del 303 y del 420 está hecho y probado, pero
   **saldrá a cero hasta que se registren gastos**. Es una limitación de
   datos, no de código.

2. ~~`gastos` no clasifica fiscalmente~~ → **resuelto** en la migración
   036: `deducible`, `tipo_operacion` y `cuota_deducible`. Falta exponer
   esos campos en el formulario de alta de gastos, que hoy sigue
   guardándolos con el valor por defecto.

3. ~~`company_settings` no guarda el régimen de IRPF~~ → **resuelto** en
   la 036: `regimen_irpf`, `epigrafe_iae`, `porcentaje_prorrata`. Falta
   exponerlos en Ajustes; mientras estén vacíos, el 130 y el 131 se
   niegan a validar en vez de adivinar el régimen.

4. **`invoice_tax_breakdown.rate` es `INTEGER`.** No puede representar
   tipos no enteros. Para IVA/IGIC actuales vale, pero es una limitación
   real a tener presente.

5. **No se distingue exenta de no sujeta.** El 420 las pide en casillas
   separadas y el programa no guarda ningún campo que lo diga
   (`tipoFacturaFiscal` es F1–F3/R1–R5). Se informa la base al 0 % junta
   y la pantalla avisa de que hay que repartirla a mano.

6. **IVA vs IGIC es un interruptor de empresa** (`company_settings.igic_enabled`),
   no un campo por factura. Es correcto —un negocio tributa en uno u
   otro por sus entregas— y el panel lo usa para marcar qué modelos le
   aplican. El tenant activo tiene `igic_enabled = true` (canario).

---

## 4. Qué falta

1. **Exponer los campos nuevos en la interfaz**: la clasificación fiscal
   en el formulario de gastos (deducible, tipo de operación, cuota
   deducible) y el régimen de IRPF en Ajustes. El motor ya los usa; hoy
   se guardan con el valor por defecto.
2. **Separar exenta de no sujeta** en las facturas, para poder repartir
   la base al 0 % del 420 sin intervención manual.
3. **Páginas 02, 04 y 05 del 303** (régimen simplificado, anexos): sólo
   hacen falta si algún usuario tributa en simplificado.
4. **Arrastre automático de compensaciones** entre trimestres del 420 y de
   los pagos fraccionados del 130: hoy se teclean, pudiendo salir del
   historial.
