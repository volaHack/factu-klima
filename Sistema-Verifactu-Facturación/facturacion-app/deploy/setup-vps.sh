#!/bin/bash
# =============================================================================
# setup-vps.sh — Configuración inicial del VPS de IONOS
# =============================================================================
# Ejecutar como root en el VPS recién creado.
# Uso: ssh root@IP_DEL_VPS 'bash -s' < deploy/setup-vps.sh
# =============================================================================

set -euo pipefail

DEPLOY_USER="deploy"
APP_DIR="/home/$DEPLOY_USER/facturacion-app"
DOMAIN="${1:-klimafacturas.com}"  # Pasar el dominio como argumento

echo "═══════════════════════════════════════════════════════"
echo "  Configuración del VPS de IONOS para facturación-app"
echo "═══════════════════════════════════════════════════════"

# ─── 1. Actualizar el sistema ─────────────────────────────
echo "→ Actualizando paquetes..."
apt update && apt upgrade -y

# ─── 2. Crear usuario de despliegue ──────────────────────
echo "→ Creando usuario '$DEPLOY_USER'..."
if ! id "$DEPLOY_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$DEPLOY_USER"
    mkdir -p /home/$DEPLOY_USER/.ssh
    chmod 700 /home/$DEPLOY_USER/.ssh
    touch /home/$DEPLOY_USER/.ssh/authorized_keys
    chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys
    chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh
    echo "  ⚠  IMPORTANTE: Añade tu clave pública SSH a:"
    echo "     /home/$DEPLOY_USER/.ssh/authorized_keys"
fi

# ─── 3. Instalar Node.js 22 LTS ─────────────────────────
echo "→ Instalando Node.js 22..."
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt install -y nodejs
fi
echo "  Node.js: $(node -v)"
echo "  npm:     $(npm -v)"

# ─── 4. Instalar PM2 ────────────────────────────────────
echo "→ Instalando PM2..."
npm install -g pm2
pm2 startup systemd -u $DEPLOY_USER --hp /home/$DEPLOY_USER

# ─── 5. Instalar Nginx ──────────────────────────────────
echo "→ Instalando Nginx..."
apt install -y nginx
systemctl enable nginx

# ─── 6. Instalar Certbot (SSL gratuito) ─────────────────
echo "→ Instalando Certbot..."
apt install -y certbot python3-certbot-nginx

# ─── 7. Configurar firewall ─────────────────────────────
echo "→ Configurando firewall (UFW)..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# ─── 8. Crear directorios de la app ─────────────────────
echo "→ Preparando directorios..."
mkdir -p $APP_DIR
mkdir -p /home/$DEPLOY_USER/logs
chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER

# ─── 9. Crear .env plantilla en el servidor ─────────────
if [ ! -f "$APP_DIR/.env" ]; then
    cat > "$APP_DIR/.env" << 'ENVEOF'
# ═══════════════════════════════════════════════════════
# Variables de entorno de PRODUCCIÓN
# Editar con: nano /home/deploy/facturacion-app/.env
# Después: pm2 reload facturacion-app --update-env
# ═══════════════════════════════════════════════════════

# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# --- Stripe ---
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# --- Verifactu ---
CERTIFICATE_ENCRYPTION_KEY=
AEAT_INTEGRATION_ENABLED=false

# --- IA ---
IA_BASE_URL=
IA_MODELO=
IA_API_KEY=
ENVEOF
    chown $DEPLOY_USER:$DEPLOY_USER "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"
    echo "  ⚠  IMPORTANTE: Edita $APP_DIR/.env con tus credenciales reales"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅ VPS configurado correctamente"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Próximos pasos:"
echo ""
echo "  1. Añade la clave pública SSH de GitHub Actions a:"
echo "     /home/$DEPLOY_USER/.ssh/authorized_keys"
echo ""
echo "  2. Copia la configuración de Nginx:"
echo "     Copiar el contenido de deploy/nginx-facturacion.conf a:"
echo "     /etc/nginx/sites-available/facturacion-app"
echo "     Sustituir TU_DOMINIO.es por tu dominio real"
echo "     sudo ln -s /etc/nginx/sites-available/facturacion-app /etc/nginx/sites-enabled/"
echo "     sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "  3. Genera el certificado SSL:"
echo "     sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo ""
echo "  4. Edita las variables de entorno:"
echo "     nano $APP_DIR/.env"
echo ""
echo "  5. Configura los secretos en GitHub:"
echo "     IONOS_HOST, IONOS_USER, IONOS_SSH_KEY, IONOS_SSH_PORT"
echo "     NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
echo ""
echo "  6. Haz push a main y el despliegue se ejecutará solo"
echo ""
