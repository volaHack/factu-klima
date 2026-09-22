-- ============================================================
-- MIGRACIÓN 044: que ningún documento pueda repetir número
--
-- Facturas, albaranes, devoluciones y abonos ya tenían su índice único
-- por (usuario, serie, número): es lo que impide que dos dispositivos
-- creen el mismo documento en una carrera, y lo que convierte una
-- colisión en un error controlado que el cliente reintenta con el
-- siguiente número libre.
--
-- Órdenes de trabajo y traspasos se quedaron sin él. Hoy no duele
-- porque las dos tablas están vacías, y por eso es el momento de
-- ponerlo: con datos dentro habría que limpiarlos primero.
--
-- Las dos numeran por usuario y sin serie, así que el índice va por
-- (user_id, número).
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_ordenes_trabajo_user_numero
  ON public.ordenes_trabajo (user_id, numero);

CREATE UNIQUE INDEX IF NOT EXISTS uq_traspasos_user_number
  ON public.traspasos (user_id, number);
