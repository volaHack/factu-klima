-- Una empresa INVENTADA para probar la restauración (ningún dato real).
-- Cuenta A: la que se copia. Cuenta B: otra empresa en la misma base, que
-- NO debe colarse en la copia de A.
\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set B '''bbbbbbbb-0000-4000-8000-000000000002'''

INSERT INTO company_settings (id, user_id, business_name, nif, igic_enabled, invoice_series, stripe_customer_id, iva_rates, igic_rates, series_documentos)
VALUES ('c0000000-0000-4000-8000-00000000000a', :A, 'Distribuciones Prueba S.L.', 'B00000000', true, 'F', 'cus_NO_DEBE_SALIR', '{21,10,4}', '{7,3,0}', '{"albaran_venta":{"serie":"ALB","nextNumber":3}}'),
       ('c0000000-0000-4000-8000-00000000000b', :B, 'Otra Empresa S.L.', 'B11111111', false, 'F', null, '{21}', '{7}', null);
INSERT INTO verifactu_config (user_id, activo, entorno, envio_automatico) VALUES (:A, true, 'pruebas', true);
INSERT INTO clients (id, user_id, nif, business_name, trade_name, city, default_discounts, precios_especiales) VALUES
 ('10000000-0000-4000-8000-000000000001', :A, 'B12345674', 'Bar Pepe S.L.', 'Bar Pepe', 'Arrecife', '{5,0,0}', '[{"productId":"20000000-0000-4000-8000-000000000001","precio":0.45}]'),
 ('10000000-0000-4000-8000-000000000002', :A, '12345678Z', 'Juana Pérez', null, 'Tías', '{0,0,0}', null);
INSERT INTO products (id, user_id, ref, name, unit_price, default_tax_rate, unit, active, stock_quantity) VALUES
 ('20000000-0000-4000-8000-000000000001', :A, 'AG-1', 'Agua 1,5 L', 0.50, 7, 'ud', true, 240),
 ('20000000-0000-4000-8000-000000000002', :A, 'AC-5', 'Aceite 5 L «virgen»', 24.95, 3, 'ud', true, 12);
INSERT INTO perfiles_trabajo (id, user_id, nombre, rol, pin_hash, pin_sal, activo) VALUES ('30000000-0000-4000-8000-000000000001', :A, 'Caja 1', 'cajero', 'HASH_NO_DEBE_SALIR', 'SAL', true);

-- Facturas: tres emitidas (selladas) y un borrador; la 2 se anula después.
INSERT INTO invoices (id, user_id, number, series, client_id, client_name, client_nif, issue_date, due_date, status, subtotal, total_tax, total, tipo, sentido, issuer_nif, sealed_at, impuesto, paid_amount, payment_record_ids, datos_extras) VALUES
 ('40000000-0000-4000-8000-000000000001', :A, 'F-2026-0001', 'F', '10000000-0000-4000-8000-000000000001', 'Bar Pepe', 'B12345674', '2026-10-01', '2026-10-31', 'pagada', 100.00, 7.00, 107.00, 'factura', 'venta', 'B00000000', '2026-10-01 09:00:00+00', 'IGIC', 107.00, '["50000000-0000-4000-8000-000000000001"]', '{}'),
 ('40000000-0000-4000-8000-000000000002', :A, 'F-2026-0002', 'F', '10000000-0000-4000-8000-000000000002', 'Juana Pérez', '12345678Z', '2026-10-02', '2026-11-01', 'anulada', 49.90, 1.50, 51.40, 'factura', 'venta', 'B00000000', '2026-10-02 10:30:00+00', 'IGIC', 0, '[]', '{}'),
 ('40000000-0000-4000-8000-000000000003', :A, 'F-2026-0003', 'F', '10000000-0000-4000-8000-000000000001', 'Bar Pepe', 'B12345674', '2026-10-20', '2026-11-19', 'pendiente', 1234.56, 86.42, 1320.98, 'factura', 'venta', 'B00000000', '2026-10-20 18:45:12+00', 'IGIC', 0, '[]', '{"custom_1":"Pedido 77"}'),
 ('40000000-0000-4000-8000-000000000004', :A, 'F-2026-0004', 'F', '10000000-0000-4000-8000-000000000001', 'Bar Pepe', 'B12345674', '2026-10-24', '2026-11-23', 'borrador', 10.00, 0.70, 10.70, 'factura', 'venta', 'B00000000', null, null, 0, '[]', '{}');
UPDATE invoices SET cancelled_at = '2026-10-05 08:00:00+00', cancel_reason = 'Error en el cliente' WHERE id = '40000000-0000-4000-8000-000000000002';
INSERT INTO invoice_line_items (id, invoice_id, product_id, product_name, product_ref, quantity, unit_price, unit, tax_rate, discount_percent, subtotal, tax_amount, total, sort_order) VALUES
 ('41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Agua 1,5 L', 'AG-1', 200, 0.50, 'ud', 7, 0, 100.00, 7.00, 107.00, 0),
 ('41000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Aceite 5 L «virgen»', 'AC-5', 2, 24.95, 'ud', 3, 0, 49.90, 1.50, 51.40, 0),
 ('41000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Agua 1,5 L', 'AG-1', 2469.12, 0.50, 'ud', 7, 0, 1234.56, 86.42, 1320.98, 0),
 ('41000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'Agua 1,5 L', 'AG-1', 20, 0.50, 'ud', 7, 0, 10.00, 0.70, 10.70, 0);
INSERT INTO invoice_tax_breakdown (id, invoice_id, rate, base_amount, tax_amount) VALUES
 ('42000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 7, 100.00, 7.00),
 ('42000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 3, 49.90, 1.50),
 ('42000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', 7, 1234.56, 86.42),
 ('42000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', 7, 10.00, 0.70);

-- La cadena Veri*Factu, calculada con las MISMAS funciones que producción:
-- alta 1, alta 2, alta 3 y la anulación de la 2.
DO $$
DECLARE
  a uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  prev text := NULL; h text; i int := 0; marca text; f record;
BEGIN
  FOR f IN SELECT * FROM invoices WHERE user_id = a AND sealed_at IS NOT NULL ORDER BY sealed_at LOOP
    i := i + 1;
    marca := to_char(f.sealed_at AT TIME ZONE 'Atlantic/Canary', 'YYYY-MM-DD"T"HH24:MI:SS') || '+01:00';
    h := public.verifactu_huella(public.verifactu_cadena_alta(f.issuer_nif, f.number, f.issue_date, 'F1', f.total_tax, f.total, prev, marca));
    INSERT INTO verifactu_registros (user_id, invoice_id, tipo_registro, indice, primer_registro, huella, huella_anterior, id_emisor, num_serie, fecha_expedicion, tipo_factura, cuota_total, importe_total, fecha_hora_huso, estado, intentos, entorno)
    VALUES (a, f.id, 'alta', i, prev IS NULL, h, prev, f.issuer_nif, f.number, f.issue_date, 'F1', f.total_tax, f.total, marca, CASE WHEN i = 1 THEN 'aceptado' ELSE 'pendiente' END, CASE WHEN i = 1 THEN 1 ELSE 0 END, CASE WHEN i = 1 THEN 'pruebas' END);
    UPDATE invoices SET verifactu_hash = h, chain_index = i WHERE id = f.id;
    prev := h;
  END LOOP;
  SELECT * INTO f FROM invoices WHERE id = '40000000-0000-4000-8000-000000000002';
  i := i + 1;
  marca := '2026-10-05T09:00:00+01:00';
  h := public.verifactu_huella(public.verifactu_cadena_anulacion(f.issuer_nif, f.number, f.issue_date, prev, marca));
  INSERT INTO verifactu_registros (user_id, invoice_id, tipo_registro, indice, primer_registro, huella, huella_anterior, id_emisor, num_serie, fecha_expedicion, fecha_hora_huso, estado, intentos)
  VALUES (a, f.id, 'anulacion', i, false, h, prev, f.issuer_nif, f.number, f.issue_date, marca, 'pendiente', 0);
END $$;

INSERT INTO invoice_events (id, user_id, invoice_id, invoice_number, event_type, severity, detail, occurred_at) VALUES
 (1, :A, '40000000-0000-4000-8000-000000000001', 'F-2026-0001', 'INVOICE_SEALED', 'info', 'Sellada', '2026-10-01 09:00:00+00'),
 (2, :A, '40000000-0000-4000-8000-000000000002', 'F-2026-0002', 'INVOICE_CANCELLED', 'warning', 'Error en el cliente', '2026-10-05 08:00:00+00');
INSERT INTO cobros_pagos (id, user_id, tipo, series, number, fecha, contraparte_nombre, payment_method, importe_total, desglose) VALUES
 ('50000000-0000-4000-8000-000000000001', :A, 'cobro', 'COB', 'COB-2026-0001', '2026-10-03', 'Bar Pepe', 'transferencia', 107.00, '[{"invoiceId":"40000000-0000-4000-8000-000000000001","importe":107}]');
INSERT INTO albaranes (id, user_id, number, series, client_id, client_name, issue_date, status, subtotal, total_tax, total) VALUES
 ('60000000-0000-4000-8000-000000000001', :A, 'ALB-2026-0002', 'ALB', '10000000-0000-4000-8000-000000000001', 'Bar Pepe', '2026-10-22', 'expedido', 50.00, 3.50, 53.50);
INSERT INTO albaran_line_items (id, albaran_id, product_id, product_name, quantity, unit_price, tax_rate, subtotal, tax_amount, total, sort_order, cajas, units_per_package) VALUES
 ('61000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Agua 1,5 L', 100, 0.50, 7, 50.00, 3.50, 53.50, 0, 4, 24);
INSERT INTO historico_documentos (id, user_id, origen, tipo, serie, numero, fecha, codigo_tercero, total, bases, pasa_a) VALUES
 ('70000000-0000-4000-8000-000000000001', :A, 'isecan', 'factura_venta', 'A', '000123', '2019-03-14', '0042', 321.10, '[{"tipo":7,"base":300.09}]', '{albaran_venta}');

-- Cuenta B (otra empresa): no puede aparecer en la copia de A.
INSERT INTO invoices (id, user_id, number, series, client_name, issue_date, status, total_tax, total, tipo, sentido, issuer_nif, sealed_at) VALUES
 ('4bbbbbbb-0000-4000-8000-000000000001', :B, 'F-2026-0001', 'F', 'Cliente de B', '2026-10-01', 'emitida', 21, 121, 'factura', 'venta', 'B11111111', '2026-10-01 10:00:00+00');
INSERT INTO invoice_line_items (id, invoice_id, product_name, quantity, unit_price, tax_rate, subtotal, tax_amount, total) VALUES
 ('4bbbbbbb-1000-4000-8000-000000000001', '4bbbbbbb-0000-4000-8000-000000000001', 'Cosa de B', 1, 100, 21, 100, 21, 121);
