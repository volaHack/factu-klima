# Implementación: Sistema de Onboarding y Validación Fiscal Verifactu

**Fecha**: 31 de julio de 2026  
**Estado**: ✅ Completado y compilado exitosamente  
**Build**: 17 rutas (4 dinámicas, 13 estáticas)

---

## Resumen de cambios

Se ha implementado un **sistema profesional de onboarding y validación fiscal** que prepara la aplicación para operación bajo Verifactu. El sistema sigue las mejores prácticas de software de facturación integrado (Odoo, Facturisa, Gestiona Facturación).

### Tres componentes principales

#### 1. Validador de NIF español (`src/lib/validation/nif.ts`)

Implementa el algoritmo oficial de la AEAT:

- **NIF**: 8 dígitos + letra de control (tabla oficial)
- **NIE**: X/Y/Z + 7 dígitos + letra de control (migrantes)
- **CIF**: Letra tipología + 7 dígitos + letra/número de control (empresas)

**Funciones exportadas**:
- `isValidNif(nif: string): boolean`
- `detectNifType(nif: string): NifType`
- `getNifErrorDetails(nif: string): { valid, type, message }`
- `formatNif(nif: string): string`

Ejemplo de uso:

```typescript
import { isValidNif } from '@/lib/validation/nif';

if (isValidNif('12345678Z')) {
  // Válido según dígito de control oficial
}
```

#### 2. Modal de primeros pasos (`src/components/onboarding/FirstStepsModal.tsx`)

**Flujo de 2 pasos**:

**Paso 1**: NIF + razón social
- Valida NIF en tiempo real contra dígito de control
- Muestra ✓ o ✗ con mensaje específico
- Razón social obligatoria (máx 100 caracteres)

**Paso 2**: Dirección fiscal + régimen IVA
- Dirección obligatoria (máx 200 caracteres)
- IVA por defecto (aplica a nuevos productos)
- Aviso sobre certificado FNMT (próxima fase)

**Props**:
```typescript
interface FirstStepsModalProps {
  onClose: () => void;
  onComplete: (data: FirstStepsData) => void;
  isDismissible?: boolean;
}
```

#### 3. Validación en storage (`src/lib/storage.ts`)

Dos nuevas funciones públicas:

**`getOnboardingStatus(): Promise<OnboardingStatus>`**

Valida que estén completos: NIF, razón social, dirección fiscal.

```typescript
const status = await getOnboardingStatus();
// {
//   isComplete: true/false,
//   missingFields: string[],  // ['NIF', 'razón social', ...]
//   message: string
// }
```

**`completeOnboarding(data): Promise<void>`**

Persiste los datos del onboarding en company_settings:

```typescript
await completeOnboarding({
  nif: '12345678Z',
  businessName: 'Mi Empresa S.L.',
  address: 'Calle Principal 123',
  ivaTaxRate: '21'
});
```

---

## Integración en el flujo

### Dashboard (`src/app/dashboard/page.tsx`)

- Al cargar, valida `getOnboardingStatus()`
- Si no está completo: muestra `<FirstStepsModal>` superpuesto
- Usuario puede descartar (X) pero emisión quedará bloqueada
- Al completar: modal se cierra y dashboard se recarga

### Bloqueo de emisión

**Tres puntos de control**:

1. **Nueva factura** (`src/app/facturas/nueva/page.tsx`):
   ```typescript
   if (status === InvoiceStatus.EMITIDA) {
     const obStatus = await getOnboardingStatus();
     if (!obStatus.isComplete) {
       error('Completa los primeros pasos', obStatus.message);
       return;
     }
   }
   ```

2. **Editar factura** (`src/app/facturas/[id]/editar/page.tsx`): Misma validación

3. **Detalle factura** (`src/app/facturas/[id]/page.tsx`): Validación en handleIssue

Si falta cualquier dato, el usuario ve:

```
❌ Completa los primeros pasos
Faltan datos críticos: NIF, razón social, dirección fiscal...
```

---

## Protecciones legales

### Base de datos (Postgres triggers)

Los datos fiscales están protegidos en `fn_settings_guard()`:

```sql
-- No se puede cambiar NIF si hay facturas emitidas
IF NEW.nif <> OLD.nif AND EXISTS (
  SELECT 1 FROM invoices WHERE user_id = NEW.user_id AND status = 'emitida'
) THEN RAISE EXCEPTION 'ANTIFRAUDE: NIF locked after first emission';
```

### Aplicación (React)

El modal y las validaciones garantizan que:
1. El usuario complete datos antes de emitir
2. No hay caminos alternativos para saltarse la validación
3. Errores son claros y accionables

---

## Diagrama de flujo

```
Login
  ↓
Dashboard carga
  ↓
getOnboardingStatus() → isComplete?
  ├─ NO → Mostrar FirstStepsModal
  │        ├─ Usuario completa Paso 1 (NIF + razón social)
  │        ├─ Usuario completa Paso 2 (dirección + IVA)
  │        └─ completeOnboarding() → settings saved → modal cierra
  │
  └─ SÍ → Dashboard funcional normalmente
            ├─ Usuario intenta emitir factura
            ├─ getOnboardingStatus() ✓
            └─ issueInvoice() procede
```

---

## Próximas fases (no implementadas aún)

### Fase 2: Integración AEAT

Cuando el usuario obtiene certificado FNMT:

1. Upload de certificado en settings
2. En cada emisión: envío telemático a AEAT
3. Almacenamiento de ticket de AEAT en invoice_events
4. Reintento si falla (AEAT rechaza validación)

### Fase 3: Firma digital

Cuando FNMT está configurado:

1. Cada factura se firma con certificado digital
2. Se genera documento .xml de Verifactu
3. Se almacena hash de firma en invoice_events

---

## Testing (instrucciones)

### Test 1: Onboarding incompleto

1. Limpiar IndexedDB en DevTools
2. Hacer login
3. ✓ Debe aparecer FirstStepsModal
4. Hacer click en X → debe ser descarable
5. Intentar emitir factura → ❌ "Completa los primeros pasos"

### Test 2: NIF inválido

1. En modal, escribir "123456789" (dígito incorrecto)
2. ✓ Debe aparecer: "NIF válida falló el dígito de control"

### Test 3: Completar onboarding

1. Escribir "12345678Z" (NIF de prueba)
2. Razón social: "Test Empresa S.L."
3. Dirección: "Calle Principal 123"
4. Siguiente → Paso 2
5. Completar → Modal cierra
6. ✓ Dashboard recarga

### Test 4: Emisión con datos completos

1. Crear factura borrador
2. Emitir → ✓ Procede sin bloqueos
3. ✓ Factura sellada con SHA-256

---

## Archivos modificados

### Nuevos
- `src/lib/validation/nif.ts` (+154 líneas)
- `src/components/onboarding/FirstStepsModal.tsx` (+261 líneas)
- `supabase/VERIFACTU_ONBOARDING.md` (documentación)
- `IMPLEMENTACION_VERIFACTU.md` (este archivo)

### Actualizados
- `src/lib/storage.ts`: +60 líneas (getOnboardingStatus, completeOnboarding)
- `src/app/dashboard/page.tsx`: +30 líneas (modal + validación)
- `src/app/facturas/nueva/page.tsx`: +10 líneas (validación bloqueo)
- `src/app/facturas/[id]/editar/page.tsx`: +10 líneas (validación bloqueo)
- `src/app/facturas/[id]/page.tsx`: +15 líneas (validación bloqueo)

### Build
✅ **TypeScript**: 0 errores  
✅ **Next.js**: 17 rutas (4 dinámicas, 13 estáticas)  
✅ **Turbopack**: Compilación en 10.5s

---

## Cómo usar en producción

1. **Ejecutar migración antifraude**:
   ```sql
   -- Supabase SQL Editor
   COPY-PASTE: supabase/migration_002_antifraude.sql
   ```

2. **Variables de entorno** (ya en .env.example):
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```

3. **Desplegar**:
   ```bash
   git push origin main
   # CI/CD: npm run build → deploy
   ```

4. **Usuarios verán** en primer login:
   - Modal de primeros pasos
   - Validación de NIF en tiempo real
   - Bloqueo de emisión si falta completar

---

## Notas de cumplimiento

✅ **Está listo para Verifactu en MVP**:
- Validación de NIF/CIF/NIE (dígito de control)
- Datos inmutables después de primera emisión
- Huellas SHA-256 encadenadas
- Audit log de intentos de manipulación
- Bloqueo de emisión sin datos críticos

❌ **No está incluido (futura fase)**:
- Envío telemático a AEAT
- Firma digital con certificado FNMT
- Validación contra registro de empresas
- Respuesta de aceptación/rechazo de AEAT

---

## Contacto

Para preguntas sobre la implementación:
- Ver `supabase/LEEME_ANTIFRAUDE.md` (seguridad)
- Ver `supabase/VERIFACTU_ONBOARDING.md` (onboarding)
- Ver comentarios en código (desarrollo)
