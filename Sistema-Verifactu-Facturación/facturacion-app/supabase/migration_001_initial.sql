-- ============================================================
-- MIGRACIÓN: Sistema de Facturación Multi-Sector
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- 1. Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. COMPANY_SETTINGS
CREATE TABLE IF NOT EXISTS company_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  nif TEXT NOT NULL,
  trade_name TEXT,
  sector TEXT DEFAULT 'alimentacion',
  accent_theme TEXT DEFAULT 'emerald',
  email TEXT,
  phone TEXT,
  website TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  province TEXT,
  invoice_series TEXT DEFAULT 'FAC',
  next_invoice_number INT DEFAULT 1,
  default_payment_days INT DEFAULT 30,
  default_payment_method TEXT DEFAULT 'transferencia',
  invoice_footer_text TEXT,
  iban TEXT,
  bank_name TEXT,
  verifactu_enabled BOOLEAN DEFAULT TRUE,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CLIENTS
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nif TEXT NOT NULL,
  business_name TEXT NOT NULL,
  trade_name TEXT,
  email TEXT,
  phone TEXT,
  contact_person TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  province TEXT,
  country TEXT DEFAULT 'España',
  payment_days INT DEFAULT 30,
  default_payment_method TEXT DEFAULT 'transferencia',
  notes TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PRODUCTS
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ref TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'otros',
  unit_price DECIMAL(12,4) NOT NULL DEFAULT 0,
  default_tax_rate INT DEFAULT 21,
  unit TEXT DEFAULT 'ud',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. INVOICES (cabecera)
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  series TEXT NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_nif TEXT,
  client_address TEXT,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  paid_date DATE,
  status TEXT NOT NULL DEFAULT 'borrador',
  subtotal DECIMAL(12,2) DEFAULT 0,
  total_discount DECIMAL(12,2) DEFAULT 0,
  total_tax DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  payment_method TEXT DEFAULT 'transferencia',
  notes TEXT,
  verifactu_hash TEXT,
  verifactu_qr_url TEXT,
  verifactu_timestamp TIMESTAMPTZ,
  verifactu_signature_status TEXT DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. INVOICE_LINE_ITEMS
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_ref TEXT,
  quantity DECIMAL(12,4) NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,4) NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'ud',
  tax_rate INT DEFAULT 21,
  discount_percent DECIMAL(5,2) DEFAULT 0,
  subtotal DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  sort_order INT DEFAULT 0
);

-- 7. INVOICE_TAX_BREAKDOWN
CREATE TABLE IF NOT EXISTS invoice_tax_breakdown (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  rate INT NOT NULL,
  base_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0
);

-- ÍNDICES
CREATE INDEX IF NOT EXISTS idx_settings_user ON company_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(user_id, active);
CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(user_id, active);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(user_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(user_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_line_items_invoice ON invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_tax_breakdown_invoice ON invoice_tax_breakdown(invoice_id);

-- RLS
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_tax_breakdown ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "settings_user_policy" ON company_settings
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "clients_user_policy" ON clients
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "products_user_policy" ON products
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "invoices_user_policy" ON invoices
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "line_items_user_policy" ON invoice_line_items
  FOR ALL TO authenticated
  USING (invoice_id IN (SELECT id FROM invoices WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (invoice_id IN (SELECT id FROM invoices WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "tax_breakdown_user_policy" ON invoice_tax_breakdown
  FOR ALL TO authenticated
  USING (invoice_id IN (SELECT id FROM invoices WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (invoice_id IN (SELECT id FROM invoices WHERE user_id = (SELECT auth.uid())));

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON company_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_line_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_tax_breakdown TO authenticated;

-- Trigger auto updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER SET search_path = '' AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_settings_updated BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tr_clients_updated BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tr_products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tr_invoices_updated BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
