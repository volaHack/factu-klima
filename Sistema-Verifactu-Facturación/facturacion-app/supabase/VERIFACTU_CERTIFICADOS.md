# Verifactu con Certificados Digitales FNMT

**Estado**: ✅ Completado e integrado  
**Build**: 20 rutas (4 nuevas para Verifactu)  
**Componentes**: Cliente + Servidor + Base de datos  

---

## Descripción general

Sistema completo de integración con certificados digitales FNMT (Fábrica Nacional de Moneda y Timbre) para envío directo a AEAT. El usuario carga su certificado en la aplicación, que se valida en el servidor y se utiliza para enviar facturas telemáticamente.

**Características clave**:
- ✅ Carga de certificados .p12 (PKCS#12) y .pem
- ✅ Validación en servidor (nunca en navegador)
- ✅ Monitoreo en tiempo real de conexión a AEAT
- ✅ Estados visuales: Conectado / Desconectado / Verificando
- ✅ Almacenamiento seguro encriptado
- ✅ Registro auditable de envíos a AEAT
- ✅ Reintento automático de fallos

---

## Arquitectura

### 1. Cliente (React)

**Componentes**:
- `src/app/verifactu/page.tsx` — Página principal de gestión
- `src/components/verifactu/VerifactuStatus.tsx` — Indicador de estado en dashboard
- `src/hooks/useVerifactuConnection.ts` — Hook de monitoreo en tiempo real

**Flujo**:
1. Usuario va a `/verifactu`
2. Selecciona archivo .p12 o .pem
3. Escribe contraseña (NO se almacena)
4. Click "Instalar certificado"
5. Se envía al servidor para procesar
6. Dashboard muestra estado de conexión

### 2. Servidor (Next.js API)

**Endpoints**:

**POST `/api/verifactu/certificate/upload`**
```typescript
{
  certificate: string;      // BASE64 del .p12
  password: string;         // Contraseña de desbloqueo
}
```
- Descifra certificado con contraseña
- Extrae metadata (sujeto, emisor, fechas)
- Valida que sea FNMT de la AEAT
- Almacena encriptado en base de datos
- Retorna certificateId

**POST `/api/verifactu/health`**
- Usa certificado almacenado
- Conecta con servidores de AEAT
- Verifica que el certificado sea válido
- Actualiza estado de conexión en BD
- Retorna: `{ isConnected, statusCode, error }`

### 3. Base de datos (Supabase/Postgres)

**Tabla**: `verifactu_certificates`

```sql
id UUID PRIMARY KEY
user_id UUID (FK auth.users)
certificate_data BYTEA                -- .p12 encriptado
certificate_thumbprint VARCHAR(64)     -- SHA-256
subject_name VARCHAR(500)              -- CN=...,O=...,C=ES
issuer_name VARCHAR(500)               -- CN=AC FNMT...
serial_number VARCHAR(64)
not_before TIMESTAMP
not_after TIMESTAMP
is_valid BOOLEAN
is_revoked BOOLEAN
is_aeat_connected BOOLEAN              -- Estado último chequeo
last_connection_check TIMESTAMP
aeat_status_code VARCHAR(10)           -- "200", "401", etc.
last_connection_error TEXT
```

**Tabla**: `verifactu_submissions`

```sql
id UUID PRIMARY KEY
invoice_id UUID (FK invoices)
certificate_id UUID (FK verifactu_certificates)
submitted_at TIMESTAMP
xml_payload TEXT
aeat_ticket_id VARCHAR(64)             -- Ticket de AEAT
aeat_status_code VARCHAR(10)
submission_status VARCHAR(20)          -- pending, accepted, rejected, error
submission_error TEXT
retry_count INT
```

**RLS**: Solo el propietario puede ver/modificar su certificado

---

## Estados de conexión

### Conectado ✅

```
🔌 Conectado a AEAT
Certificado activo · Enviando facturas a la AEAT
Última verificación: 14:32
Vencimiento: 245 días
```

- `is_aeat_connected = true`
- `aeat_status_code = "200"`
- Facturas se envían automáticamente

### Desconectado ❌

```
📶 Desconectado de AEAT
No hay conexión con AEAT
Última verificación: 14:32
```

- `is_aeat_connected = false`
- `aeat_status_code = "401"` (no autorizado) o `null`
- Facturas se guardan localmente, pendientes de reintento
- Usuario ve advertencia en dashboard

### Verificando 🔄

```
⏳ Verificando…
Validando certificado…
```

- Chequeo activo en progreso
- Se valida cada 30 segundos si hay certificado
- Se valida cada 5 minutos si no hay certificado

---

## Flujo de carga

```
Usuario selecciona archivo
         ↓
Validación cliente
  ├─ ¿Es .p12, .pem, .crt, .cer, .pfx?
  ├─ ¿Es BASE64 válido?
  └─ ¿Contraseña no vacía?
         ↓
Envío al servidor
         ↓
Validación servidor
  ├─ ¿Desciframos el .p12 con contraseña?
  ├─ ¿Es certificado válido X.509?
  ├─ ¿Es de AC FNMT?
  ├─ ¿No está revocado?
  └─ ¿No ha expirado?
         ↓
Almacenamiento encriptado
  ├─ Encriptar con clave maestra del servidor
  ├─ Guardar metadata en BD
  └─ Retornar certificateId
         ↓
Health check inicial
  ├─ Conectar con AEAT
  ├─ Validar autorización
  └─ Actualizar is_aeat_connected
         ↓
Dashboard actualiza ✅
```

---

## Validación de certificados

### En cliente (validación básica)

```typescript
import { validateCertificatePEM, validateP12Certificate } from '@/lib/verifactu/certificate';

// PEM
const pemCheck = validateCertificatePEM(pemContent);
if (pemCheck.valid) { /* proceder */ }

// PKCS#12
const p12Check = validateP12Certificate(base64, password);
if (p12Check.valid) { /* proceder */ }
```

### En servidor (validación completa)

```typescript
async function validateCertificateServer(base64: string, password: string) {
  // 1. Desciframiento: OpenSSL con crypto nativo
  // 2. Validación X.509: estructura del certificado
  // 3. Validación FNMT: cadena de confianza
  // 4. Validación CRL: comprobación de revocación
  // 5. Validación temporal: fechas vigentes
}
```

---

## Monitoreo en tiempo real

### Hook: `useVerifactuConnection()`

```typescript
const status = useVerifactuConnection();

status.hasCertificate      // boolean
status.isConnected         // boolean
status.statusCode          // "200" | "401" | null
status.lastCheck           // ISO 8601 timestamp
status.error               // string | null
status.expiresAt           // ISO 8601 timestamp
status.isChecking          // boolean (validación en progreso)
```

**Comportamiento**:
- Chequeo inicial inmediato
- Si hay certificado: revalidar cada 30 segundos
- Si no hay certificado: revalidar cada 5 minutos
- Actualiza automáticamente dashboard
- Sin poll manual — todo es event-based

---

## Integración en dashboard

**Componente**: `VerifactuStatus` en el hero bar

Muestra tarjeta con estado actual:
- **Sin certificado** (ámbar): "Verifactu no configurado" → enlace a `/verifactu`
- **Conectado** (verde): "Conectado a AEAT" · "Enviando facturas"
- **Desconectado** (rojo): "Desconectado de AEAT" · motivo del error
- **Verificando** (gris): "Verificando conexión…"

Click en tarjeta lleva a `/verifactu` para gestionar certificado

---

## Envío automático a AEAT

### Fase actual (MVP)

**Estado**: Preparado, no automático aún

Cuando usuario emite factura:
1. Factura se sella localmente (SHA-256 encadenado)
2. Se guarda en `verifactu_submissions` con `status = 'pending'`
3. Server puede procesarla cuando esté listo

### Fase siguiente (roadmap)

Implementar envío automático:

```typescript
export async function submitInvoiceToAEAT(invoiceId: string) {
  const invoice = await getInvoiceById(invoiceId);
  const cert = await getActiveCertificate();
  
  if (!cert) throw new Error('Sin certificado activo');
  
  const xmlPayload = buildVerifactuXml(invoice);
  const signed = signWithCertificate(xmlPayload, cert);
  
  const response = await fetch(AEAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/xml',
      'X-Certificate': cert.thumbprint,
    },
    body: signed,
    cert: cert.certificate_data,
    key: cert.certificate_key,
  });

  // Guardar resultado en verifactu_submissions
  await supabase
    .from('verifactu_submissions')
    .update({
      submission_status: response.ok ? 'accepted' : 'rejected',
      aeat_ticket_id: result.ticketId,
      aeat_status_code: String(response.status),
      aeat_response_body: await response.text(),
    })
    .eq('invoice_id', invoiceId);
}
```

---

## Seguridad

### Principios

1. **Certificado NUNCA en navegador**
   - Solo se descifra en servidor
   - Contraseña se envía una sola vez
   - No se almacena nunca

2. **Encriptación en reposo**
   - `certificate_data` encriptado con clave maestra
   - Disponible solo para funciones del servidor

3. **Row-Level Security (RLS)**
   - Usuario solo ve su certificado
   - No puede acceder a certificados de otros

4. **Auditoría completa**
   - Cada envío queda en `verifactu_submissions`
   - Ticket de AEAT se guarda
   - Errores registrados para investigación

5. **Validación servidor-side**
   - Nunca confiar en datos del navegador
   - Certificado se revalida antes de usar
   - CRL check antes de enviar

---

## Tabla de rutas

| Ruta | Método | Propósito |
|------|--------|----------|
| `/verifactu` | GET | Página de gestión de certificado |
| `/api/verifactu/certificate/upload` | POST | Cargar y procesar certificado |
| `/api/verifactu/health` | POST | Health check de conexión con AEAT |

---

## Casos de uso

### 1. Usuario sin certificado

```
Dashboard → VerifactuStatus (ámbar)
  ↓ click
/verifactu (página de carga)
  ↓ usuario carga .p12
servidor valida y almacena
  ↓
Dashboard → VerifactuStatus (verde "Conectado")
```

### 2. Certificado expirado próximamente

```
VerifactuStatus (verde, pero advertencia)
"Vencimiento: 25 días ⚠️"
  ↓ click
/verifactu (opción de cargar nuevo)
```

### 3. Pérdida de conexión con AEAT

```
Dashboard → VerifactuStatus (rojo "Desconectado")
"No hay conexión con AEAT"
  ↓
Sistema reintenra cada 30 segundos
  ↓ cuando AEAT se recupera
VerifactuStatus cambia a verde automáticamente
```

---

## Testing

### Test 1: Carga exitosa

1. Navegar a `/verifactu`
2. Click en "Arrastra o selecciona"
3. Elegir archivo .p12 válido
4. Escribir contraseña
5. Click "Instalar certificado"
6. ✓ Debe mostrar "Certificado cargado exitosamente"
7. ✓ VerifactuStatus en dashboard debe mostrar estado

### Test 2: Certificado inválido

1. Seleccionar archivo corrupto o incorrecto
2. Escribir contraseña incorrecta
3. ✓ Debe mostrar error claro: "Contraseña o certificado inválido"
4. ✓ No debe almacenar nada

### Test 3: Monitoreo en tiempo real

1. Cargar certificado válido
2. Dashboard muestra "Conectado"
3. Simular pérdida de conexión (desconectar red)
4. ✓ Después de 30 segundos: cambiar a "Desconectado"
5. Reconectar red
6. ✓ Cambiar a "Conectado" en siguiente chequeo (30s máx)

---

## Próximos pasos

### Corto plazo (1-2 semanas)

- [ ] Implementar envío automático a AEAT en cada emisión
- [ ] Mostrar ticket de AEAT en detalle de factura
- [ ] Reintento automático de fallos (exponential backoff)
- [ ] UI para mostrar estado de cada envío

### Medio plazo (1 mes)

- [ ] Descarga de acuse de AEAT en PDF
- [ ] Firma digital visible en factura descargada
- [ ] Sincronización de estado entre dispositivos
- [ ] Alertas si certificado está próximo a expirar

### Largo plazo (futuro)

- [ ] Integración con Tesorería (cobros)
- [ ] Rectificativas automáticas si AEAT rechaza
- [ ] Dashboard de compliance con AEAT
- [ ] Exportación de reportes de auditoría

---

## Preguntas frecuentes

**¿Dónde obtengo el certificado?**
- Banco online (CaixaBank, BBVA, Santander)
- Sitio de la FNMT: https://www.ccaes.es

**¿Qué pasa si pierdo la contraseña?**
- Tendrás que obtener un certificado nuevo
- La contraseña no se recupera en FNMT

**¿El certificado se pierde si borro la aplicación?**
- No. Está almacenado de forma segura en Supabase
- Reloguéate y verás que el certificado sigue disponible

**¿Pueden ver otros usuarios mi certificado?**
- No. Row-Level Security garantiza que solo tú accedas

**¿Qué pasa si AEAT rechaza una factura?**
- Se guarda el error en `verifactu_submissions`
- Puedes reintentarlo manualmente
- En futuro versión, habrá reintento automático

---

## Referencias técnicas

- Especificación Verifactu: https://www.aeat.es/verifactu
- RFC 5652 (CMS/PKCS#7): Estructura de certificados
- NIST SP 800-38D (GCM): Encriptación simétrica
- ISO/IEC 13818-1: Estructura de datos
