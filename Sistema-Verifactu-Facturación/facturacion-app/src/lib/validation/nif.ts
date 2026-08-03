/**
 * Validación de NIF/NIE/CIF español
 * Según algoritmo oficial de la AEAT
 */

export type NifType = 'NIF' | 'NIE' | 'CIF' | 'UNKNOWN';

// Tabla de control para NIF/NIE
const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

// Letras permitidas para CIF según tipo
const CIF_CONTROL: Record<string, { type: string; letter: string }> = {
  A: { type: 'Sociedades anónimas', letter: 'JABCDEFGHI' },
  B: { type: 'Sociedades limitadas', letter: 'JABCDEFGHI' },
  C: { type: 'Sociedades generales', letter: 'JABCDEFGHI' },
  D: { type: 'Comunidades de bienes', letter: 'JABCDEFGHI' },
  E: { type: 'Comunidades de propietarios', letter: 'JABCDEFGHI' },
  F: { type: 'Corporaciones locales', letter: 'JABCDEFGHI' },
  G: { type: 'Establecimientos públicos', letter: 'JABCDEFGHI' },
  H: { type: 'Comunidades de bienes', letter: 'JABCDEFGHI' },
  J: { type: 'Civiles', letter: 'JABCDEFGHI' },
  N: { type: 'Extranjeros', letter: 'JABCDEFGHI' },
  P: { type: 'Corporación ENTES públicos', letter: 'JABCDEFGHI' },
  Q: { type: 'Otros no definidos', letter: 'JABCDEFGHI' },
  R: { type: 'Congreso de Diputados', letter: 'JABCDEFGHI' },
  S: { type: 'Consejo de Ministros', letter: 'JABCDEFGHI' },
  U: { type: 'Órganos constitucionales', letter: 'JABCDEFGHI' },
  V: { type: 'Otros tipo no residente', letter: 'JABCDEFGHI' },
  W: { type: 'Establecimientos permanentes', letter: 'JABCDEFGHI' },
};

/**
 * Detecta el tipo de documento: NIF, NIE o CIF
 */
export function detectNifType(nif: string): NifType {
  const clean = nif.toUpperCase().trim();

  if (/^\d{8}[A-Z]$/.test(clean)) return 'NIF';
  if (/^[XYZ]\d{7}[A-Z]$/.test(clean)) return 'NIE';
  if (/^[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-Z]$/.test(clean)) return 'CIF';

  return 'UNKNOWN';
}

/**
 * Valida el dígito de control de un NIF o NIE
 */
function validateNifChecksum(value: string): boolean {
  const match = value.match(/^([XYZ])?(\d{7,8})([A-Z])$/);
  if (!match) return false;

  const [, prefix, digits, letter] = match;
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
  const controlLetter = CIF_CONTROL[type].letter;
  const validControl =
    (control === String(unitDigit)) || (controlLetter.includes(control));

  return validControl;
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
