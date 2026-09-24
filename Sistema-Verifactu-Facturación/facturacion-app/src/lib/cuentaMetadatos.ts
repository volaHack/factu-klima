'use client';

/**
 * Listas pequeñas guardadas en los metadatos de la cuenta (Supabase Auth).
 *
 * Sirven para configuración que tiene que viajar entre dispositivos y no
 * justifica una tabla (ni esperar a que se aplique una migración): las
 * facturas recurrentes, los apuntes contables periódicos… Los metadatos van
 * dentro del token de sesión, así que cada lista lleva un tope y se guarda
 * en forma corta.
 */

import { createClient } from './supabase/client';

export async function leerDeCuenta<T>(campo: string): Promise<T[]> {
  const { data, error } = await createClient().auth.getUser();
  if (error) throw new Error(error.message);
  const valor = data.user?.user_metadata?.[campo];
  return Array.isArray(valor) ? (valor as T[]) : [];
}

export async function guardarEnCuenta<T>(campo: string, lista: T[], maximo: number): Promise<void> {
  if (lista.length > maximo) {
    throw new Error(`Como mucho ${maximo}. Borra alguno que ya no uses.`);
  }
  const { error } = await createClient().auth.updateUser({ data: { [campo]: lista.length ? lista : null } });
  if (error) throw new Error(error.message);
}
