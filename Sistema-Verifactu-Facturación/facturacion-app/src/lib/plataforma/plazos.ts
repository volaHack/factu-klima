/** Plazos del 420 (ATC) y del 130 (AEAT): del 1 al 20 del mes siguiente al trimestre; el 4T hasta el 30 de enero. */
export function proximoPlazo(hoy: Date): { anio: number; trimestre: 1 | 2 | 3 | 4; limite: string; dias: number } {
  const y = hoy.getUTCFullYear();
  const dia = hoy.toISOString().slice(0, 10);
  const candidatos: { anio: number; trimestre: 1 | 2 | 3 | 4; limite: string }[] = [
    { anio: y - 1, trimestre: 4, limite: `${y}-01-30` },
    { anio: y, trimestre: 1, limite: `${y}-04-20` },
    { anio: y, trimestre: 2, limite: `${y}-07-20` },
    { anio: y, trimestre: 3, limite: `${y}-10-20` },
    { anio: y, trimestre: 4, limite: `${y + 1}-01-30` },
  ];
  const p = candidatos.find(c => c.limite >= dia)!;
  const dias = Math.round((Date.parse(`${p.limite}T00:00:00Z`) - Date.parse(`${dia}T00:00:00Z`)) / 86400000);
  return { ...p, dias };
}
