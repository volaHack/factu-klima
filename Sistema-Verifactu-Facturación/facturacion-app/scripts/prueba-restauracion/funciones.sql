-- Las funciones de la huella Veri*Factu, copiadas de producción
-- (pg_get_functiondef, migración 038). Las mismas que sellan las facturas.
CREATE OR REPLACE FUNCTION public.verifactu_fecha(p_fecha date) RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$
  SELECT to_char(p_fecha, 'DD-MM-YYYY');
$function$;
CREATE OR REPLACE FUNCTION public.verifactu_importe(p_valor numeric) RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$
  SELECT to_char(ROUND(COALESCE(p_valor, 0), 2), 'FM9999999999990.00');
$function$;
CREATE OR REPLACE FUNCTION public.verifactu_huella(p_cadena text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$
  SELECT upper(encode(sha256(convert_to(p_cadena, 'UTF8')), 'hex'));
$function$;
CREATE OR REPLACE FUNCTION public.verifactu_cadena_alta(p_id_emisor text, p_num_serie text, p_fecha date, p_tipo_factura text, p_cuota_total numeric, p_importe_total numeric, p_huella_anterior text, p_marca_tiempo text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$
  SELECT 'IDEmisorFactura='          || btrim(COALESCE(p_id_emisor, ''))
      || '&NumSerieFactura='         || btrim(COALESCE(p_num_serie, ''))
      || '&FechaExpedicionFactura='  || public.verifactu_fecha(p_fecha)
      || '&TipoFactura='             || btrim(COALESCE(p_tipo_factura, ''))
      || '&CuotaTotal='              || public.verifactu_importe(p_cuota_total)
      || '&ImporteTotal='            || public.verifactu_importe(p_importe_total)
      || '&Huella='                  || btrim(COALESCE(p_huella_anterior, ''))
      || '&FechaHoraHusoGenRegistro='|| btrim(COALESCE(p_marca_tiempo, ''));
$function$;
CREATE OR REPLACE FUNCTION public.verifactu_cadena_anulacion(p_id_emisor text, p_num_serie text, p_fecha date, p_huella_anterior text, p_marca_tiempo text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$
  SELECT 'IDEmisorFacturaAnulada='          || btrim(COALESCE(p_id_emisor, ''))
      || '&NumSerieFacturaAnulada='         || btrim(COALESCE(p_num_serie, ''))
      || '&FechaExpedicionFacturaAnulada='  || public.verifactu_fecha(p_fecha)
      || '&Huella='                         || btrim(COALESCE(p_huella_anterior, ''))
      || '&FechaHoraHusoGenRegistro='       || btrim(COALESCE(p_marca_tiempo, ''));
$function$;
