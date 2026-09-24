/**
 * Validación de NIF/NIE/CIF español
 * Según algoritmo oficial de la AEAT
 */

export type NifType = 'NIF' | 'NIE' | 'CIF' | 'UNKNOWN';

// Tabla de control para NIF/NIE
const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

// Qué tipo de entidad indica la primera letra del NIF de una persona
// jurídica (Orden EHA/451/2008). `letter` es la tabla del control en letra.
const CIF_CONTROL: Record<string, { type: string; letter: string }> = {
  A: { type: 'sociedad anónima', letter: 'JABCDEFGHI' },
  B: { type: 'sociedad de responsabilidad limitada', letter: 'JABCDEFGHI' },
  C: { type: 'sociedad colectiva', letter: 'JABCDEFGHI' },
  D: { type: 'sociedad comanditaria', letter: 'JABCDEFGHI' },
  E: { type: 'comunidad de bienes o herencia yacente', letter: 'JABCDEFGHI' },
  F: { type: 'sociedad cooperativa', letter: 'JABCDEFGHI' },
  G: { type: 'asociación o fundación', letter: 'JABCDEFGHI' },
  H: { type: 'comunidad de propietarios', letter: 'JABCDEFGHI' },
  J: { type: 'sociedad civil', letter: 'JABCDEFGHI' },
  N: { type: 'entidad extranjera', letter: 'JABCDEFGHI' },
  P: { type: 'corporación local', letter: 'JABCDEFGHI' },
  Q: { type: 'organismo público', letter: 'JABCDEFGHI' },
  R: { type: 'congregación o institución religiosa', letter: 'JABCDEFGHI' },
  S: { type: 'órgano de la Administración', letter: 'JABCDEFGHI' },
  U: { type: 'unión temporal de empresas', letter: 'JABCDEFGHI' },
  V: { type: 'otro tipo de entidad', letter: 'JABCDEFGHI' },
  W: { type: 'establecimiento permanente de no residente', letter: 'JABCDEFGHI' },
};

/** Qué tipo de entidad indica un NIF de persona jurídica («B…» → sociedad limitada). */
export function tipoDeEntidad(nif: string): string | null {
  const clean = nif.toUpperCase().replace(/[\s\-\.]/g, '');
  if (detectNifType(clean) !== 'CIF') return null;
  return CIF_CONTROL[clean[0]]?.type ?? null;
}

/** Entidades cuyo control es siempre letra: públicas, religiosas, extranjeras y establecimientos permanentes. */
const CIF_SOLO_LETRA = 'PQRSNW';
/** Entidades cuyo control es siempre cifra: sociedades anónimas y limitadas, comunidades. */
const CIF_SOLO_CIFRA = 'ABEH';

/**
 * Detecta el tipo de documento: NIF, NIE o CIF
 */
export function detectNifType(nif: string): NifType {
  const clean = nif.toUpperCase().trim();

  if (/^\d{8}[A-Z]$/.test(clean)) return 'NIF';
  // K (menores de 14), L (residentes que salen) y M (extranjeros sin NIE):
  // personas físicas con NIF especial; la letra se calcula como en el DNI.
  if (/^[KLM]\d{7}[A-Z]$/.test(clean)) return 'NIF';
  if (/^[XYZ]\d{7}[A-Z]$/.test(clean)) return 'NIE';
  if (/^[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-Z]$/.test(clean)) return 'CIF';

  return 'UNKNOWN';
}

/**
 * Valida el dígito de control de un NIF o NIE
 */
function validateNifChecksum(value: string): boolean {
  const especial = value.match(/^[KLM](\d{7})([A-Z])$/);
  if (especial) return NIF_LETTERS[parseInt(especial[1], 10) % 23] === especial[2];

  const match = value.match(/^([XYZ])?(\d{7,8})([A-Z])$/);
  if (!match) return false;

  const [, prefix, digits, letter] = match;
  // Sin prefijo tienen que ser 8 cifras; con X/Y/Z, 7.
  if (!prefix && digits.length !== 8) return false;
  if (prefix && digits.length !== 7) return false;
  const prefixMap: Record<string, string> = { X: '0', Y: '1', Z: '2' };
  const numericPrefix = prefix ? prefixMap[prefix] : '';
  const num = parseInt(numericPrefix + digits, 10);

  return NIF_LETTERS[num % 23] === letter;
}

/**
 * Valida el dígito de control de un CIF
 */
function validateCifChecksum(value: string): boolean {
  const match = value.match(/^([ABCDEFGHJKLMNPQRSUVW])(\d{7})([0-9A-Z])$/)
  if (!match) return false;

  const [, type, digits, control] = match;
  if (!CIF_CONTROL[type]) return false;

  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const digit = parseInt(digits[i], 10);
    const pos = i % 2;

    if (pos === 0) {
      // Posiciones pares: multiplicar por 2
      const doubled = digit * 2;
      sum += doubled >= 10 ? Math.floor(doubled / 10) + (doubled % 10) : doubled;
    } else {
      // Posiciones impares: suma directa
      sum += digit;
    }
  }

  const unitDigit = (10 - (sum % 10)) % 10;
  // El control es UNA cifra o UNA letra concretas, no cualquiera de la
  // tabla: antes se aceptaba cualquier letra de «JABCDEFGHI», así que un
  // CIF con el control mal puesto pasaba por bueno.
  const letraBuena = CIF_CONTROL[type].letter[unitDigit];
  const cifraBuena = String(unitDigit);

  // Unas entidades llevan siempre letra de control, otras siempre cifra,
  // y el resto cualquiera de las dos (Orden EHA/451/2008).
  if (CIF_SOLO_LETRA.includes(type)) return control === letraBuena;
  if (CIF_SOLO_CIFRA.includes(type)) return control === cifraBuena;
  return control === letraBuena || control === cifraBuena;
}

/**
 * Valida un NIF/NIE/CIF español
 *
 * @param nif El documento a validar (con o sin espacios/guiones)
 * @returns true si es válido, false en caso contrario
 */
export function isValidNif(nif: string): boolean {
  const clean = nif.toUpperCase().replace(/[\s\-\.]/g, '');
  const type = detectNifType(clean);

  switch (type) {
    case 'NIF':
    case 'NIE':
      return validateNifChecksum(clean);
    case 'CIF':
      return validateCifChecksum(clean);
    default:
      return false;
  }
}

/**
 * Formatea un NIF para presentación: "12345678Z" o "12.345.678-Z"
 */
export function formatNif(nif: string): string {
  const clean = nif.toUpperCase().replace(/[\s\-\.]/g, '');
  if (clean.length === 9) {
    return `${clean.slice(0, 8)}-${clean.slice(8)}`;
  }
  return clean;
}

/**
 * Error details para NIF inválido
 */
export function getNifErrorDetails(nif: string): {
  valid: boolean;
  type: NifType;
  message: string;
} {
  const type = detectNifType(nif);

  if (type === 'UNKNOWN') {
    return {
      valid: false,
      type,
      message: 'Formato no reconocido. Usa NIF (8 dígitos + letra), NIE (X/Y/Z + 7 dígitos + letra) o CIF (letra + 7 dígitos + letra/número).',
    };
  }

  const valid = isValidNif(nif);
  if (!valid) {
    return {
      valid: false,
      type,
      message: `${type} válida falló el dígito de control. Revisa que sea correcto.`,
    };
  }

  return { valid: true, type, message: '' };
}
