# Sistema de Onboarding y Validación Fiscal

## Visión general

El sistema está preparado para trabajar bajo **Verifactu** (regulación española de facturas electrónicas), aunque no entra en colisión con software que se integre directamente con la AEAT. Los requisitos legales se implementan en dos capas:

1. **Validación de integridad** (base de datos — migration_002_antifraude.sql)
2. **Datos fiscales obligatorios** (aplicación — FirstStepsModal + onboarding validation)

---

## Primeros pasos (Onboarding)

### ¿Qué se valida?

Cuando un usuario abre el dashboard por primera vez, se le pide completar **tres datos críticos** que son inmutables:

- **NIF / CIF / NIE**: Validado con el algoritmo oficial de dígito de control español
- **Razón social**: Nombre legal de la empresa registrada en Hacienda
- **Dirección fiscal**: Domicilio del negocio

Estos datos **nunca pueden cambiar** una vez se emite la primera factura. En la base de datos, están protegidos por una cláusula de "no puede cambiar si hay facturas emitidas":

```sql
fn_settings_guard() → bloquea NIF y counter si hay invoices.sealed = true
```

### Modal de primeros pasos

**Archivo**: `src/components/onboarding/FirstStepsModal.tsx`

El modal aparece automáticamente en el dashboard si:
- El usuario no ha completado la secuencia
- Se puede descartar (clickeando la X), pero la emisión de facturas quedará bloqueada

**Flujo**:
1. Paso 1: NIF + razón social (con validación en tiempo real)
2. Paso 2: Dirección fiscal + régimen IVA por defecto
3. Guardar: llama `completeOnboarding()` en storage

### Validación de NIF

**Archivo**: `src/lib/validation/nif.ts`

Valida:
- **NIF** (8 dígitos + letra): 12345678Z
- **NIE** (X/Y/Z + 7 dígitos + letra): X1234567L
- **CIF** (letra + 7 dígitos + letra/número): B12345678 o A12345680

Usa la tabla oficial de la AEAT: `NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE'`

Ejemplo de uso:

```typescript
import { isValidNif, getNifErrorDetails } from '@/lib/validation/nif';

const error = getNifErrorDetails('12345678Z');
if (error.valid) {
  // Proceder
} else {
  console.log(error.message); // "NIF válida falló el dígito de control..."
}
```

---

## Bloqueo de emisión sin datos críticos

Cuando un usuario intenta emitir una factura **sin completar los primeros pasos**, recibe un error claro:

```
Completa los primeros pasos
Faltan datos críticos: NIF, razón social, dirección fiscal...
```

**Puntos donde se valida**:
1. Nueva factura → botón "Emitir" en `src/app/facturas/nueva/page.tsx`
2. Editar factura → botón "Emitir" en `src/app/facturas/[id]/editar/page.tsx`
3. Detalle factura → botón "Emitir" en `src/app/facturas/[id]/page.tsx`

Código genérico:

```typescript
const obStatus = await getOnboardingStatus();
if (!obStatus.isComplete) {
  showError('Completa los primeros pasos', obStatus.message);
  return;
}
```

---

## Próxima fase: Integración AEAT

Una vez que el usuario obtiene un certificado digital cualificado (FNMT), el sistema está preparado para:

1. **Envío automático a AEAT**: Cada factura emitida puede enviarse telemáticamente (requiere configuración de certificado)
2. **Respuesta de aceptación/rechazo**: Supabase almacena el ticket de AEAT y el estado de la respuesta
3. **Reintento fallido**: Si AEAT rechaza la factura, el sistema guarda el error y permite reenvíar

### Variables de entorno necesarias

```bash
# Para desarrollo local (nunca en .env.local)
FNMT_CERTIFICATE_PATH=/path/to/cert.pem
FNMT_CERTIFICATE_PASSWORD=password

# O en .env.production (hosting)
# (Preferiblemente, almacenados en un secrets manager)
```

### Llamada a AEAT (pseudocódigo para futura implementación)

```typescript
export async function submitToAEAT(invoiceId: string): Promise<AEATResponse> {
  const invoice = await getInvoiceById(invoiceId);
  const certificate = await loadFNMTCertificate();
  
  const xmlPayload = buildVerifactuXml(invoice);
  const signed = signWithCertificate(xmlPayload, certificate);
  
  const response = await fetch('https://www.aeat.es/verifactu/api/..', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/xml',
      'X-Certificate': certificate.public,
    },
    body: signed,
  });

  const result = await response.json();
  
  // Guardar respuesta en Supabase
  await supabase.from('invoice_events').insert({
    invoice_id: invoiceId,
    event_type: 'AEAT_SUBMITTED',
    details: { ticket_id: result.ticketId, status: result.status },
  });

  return result;
}
```

---

## Almacenamiento de datos fiscales

**Tabla**: `company_settings`

| Campo | Tipo | Restricción |
|-------|------|------------|
| `nif` | VARCHAR | NO PUEDE CAMBIAR después de primera emisión |
| `businessName` | VARCHAR | NO PUEDE CAMBIAR después de primera emisión |
| `address` | VARCHAR | Modificable |
| `nextInvoiceNumber` | INT | SOLO PUEDE INCREMENTAR (fn_settings_guard) |

**Por qué es importante**:
- Hacienda verifica que el NIF del remitente sea consistente en toda la serie
- La razón social que figura en la AEAT debe coincidir exactamente
- Cambiar estos datos invalidaría todas las huellas SHA-256 anteriores

---

## Checklist legal para lanzar

- [x] NIF validado al nivel de dígito de control
- [x] Datos fiscales bloqueados después de primera emisión
- [x] Huellas SHA-256 encadenadas (inmutables)
- [x] Audit log de intentos de manipulación
- [x] Antidatado imposible
- [ ] **AEAT integration** (requiere certificado FNMT — futura fase)
- [ ] **Firma digital cualificada** (requiere certificado — futura fase)

---

## Referencia de funciones

### `getOnboardingStatus(): Promise<OnboardingStatus>`

Devuelve si el onboarding está completo:

```typescript
{
  isComplete: boolean,
  missingFields: string[],  // ['NIF', 'razón social', ...]
  message: string  // Mensaje para mostrar al usuario
}
```

### `completeOnboarding(data: FirstStepsData): Promise<void>`

Persiste los datos del onboarding:

```typescript
await completeOnboarding({
  nif: '12345678Z',
  businessName: 'Mi Empresa S.L.',
  address: 'Calle Principal 123',
  ivaTaxRate: '21',  // string, será interpretado como TaxRate
});
```

### `isValidNif(nif: string): boolean`

Valida el NIF/NIE/CIF:

```typescript
if (isValidNif('12345678Z')) {
  // Válido según dígito de control
}
```

---

## Cómo se ve en el navegador

### Dashboard (primera vez)

1. Usuario hace login
2. Dashboard carga
3. Se detecta `onboardingStatus.isComplete === false`
4. Aparece modal modal superpuesto (FirstStepsModal)
5. Usuario completa los 2 pasos
6. Modal se cierra
7. Dashboard se recarga con los datos nuevos

### Intento de emitir sin onboarding

1. Usuario hace click en "Emitir factura"
2. Sistema valida `getOnboardingStatus()`
3. Si no está completo: `showError('Completa los primeros pasos', ...)`
4. Usuario vuelve al dashboard, ve el modal, y lo completa

---

## Limitaciones actuales (MVP)

Este sistema implementa la **validación de datos y la integridad de registros**, pero **no incluye**:

- ❌ Envío telemático a AEAT (requiere certificado FNMT)
- ❌ Firma digital cualificada (requiere certificado FNMT)
- ❌ Respuesta de aceptación/rechazo de AEAT
- ❌ Validación contra registro de empresas (sólo dígito de control local)

**¿Qué sí incluye?**:

- ✅ Validación de NIF/CIF/NIE
- ✅ Datos inmutables después de primera emisión
- ✅ Huellas SHA-256 encadenadas
- ✅ Audit log de manipulaciones intentadas
- ✅ Bloqueo de emisión si faltan datos críticos
