/** Lo mínimo que se mira de un error de Supabase. */
export interface FalloEscritura {
  message?: string;
  code?: string;
  details?: string;
}

/**
 * Escribe y, si la base de datos dice que le falta una columna (migración
 * sin aplicar), la quita y lo vuelve a intentar, UNA a UNA.
 *
 * Antes, si faltaba cualquiera de las columnas nuevas, se reintentaba sin
 * TODAS ellas: una columna `almacenes` sin crear hacía que tampoco se
 * guardaran las categorías, el IVA configurable ni las tarifas, y sin avisar.
 */
export async function escribirQuitandoColumnasQueFaltan(
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  escribir: (payload: Record<string, any>) => PromiseLike<{ error?: FalloEscritura | null } | null | undefined>,
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  payload: Record<string, any>,
): Promise<{ error: FalloEscritura | null; quitadas: string[] }> {
  const quitadas: string[] = [];
  let actual = { ...payload };
  for (let intento = 0; intento < 12; intento++) {
    const res = await escribir(actual);
    const error = res?.error ?? null;
    if (!error) return { error: null, quitadas };
    const texto = `${error.message ?? ''} ${(error as { details?: string }).details ?? ''}`;
    // PostgREST: «Could not find the 'almacenes' column of 'company_settings'…»;
    // Postgres: «column "almacenes" of relation "company_settings" does not exist».
    const m = /'([a-z_0-9]+)' column|column "([a-z_0-9]+)"/i.exec(texto);
    const columna = m?.[1] ?? m?.[2];
    if (!columna || !(columna in actual)) return { error, quitadas };
    quitadas.push(columna);
    const { [columna]: _fuera, ...resto } = actual;
    void _fuera;
    actual = resto;
  }
  return { error: { message: 'Demasiadas columnas sin crear en company_settings.' } as FalloEscritura, quitadas };
}
