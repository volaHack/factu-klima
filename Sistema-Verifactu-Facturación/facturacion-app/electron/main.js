'use strict';

const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

function loadConfig() {
  const candidates = [
    path.join(process.resourcesPath || '', 'config.json'),
    path.join(__dirname, 'config.json'),
  ];
  for (const file of candidates) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      // Siguiente candidato
    }
  }
  return { appUrl: 'https://TU-URL-AQUI', mode: 'app' };
}

const config = loadConfig();
const mode = config.mode === 'tpv' ? 'tpv' : 'app';
const APP_URL = String(config.appUrl || 'https://TU-URL-AQUI').replace(/\/+$/, '');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Si el usuario intenta abrir la app dos veces, la segunda instancia se
  // cierra sola y esta ventana recupera el foco.
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// El TPV guarda su sesión aparte: el cajero sigue conectado sin
// compartir cookies con la app de facturación del mismo equipo.
if (mode === 'tpv') {
  app.setPath('userData', path.join(app.getPath('appData'), 'Klima TPV'));
}

let mainWindow = null;

// En modo TPV la ventana queda bloqueada al terminal: solo se permiten el
// login, el callback de autenticación y la propia pantalla de /tpv.
// Cualquier otra ruta (dashboard, facturas, clientes, ajustes…) se fuerza
// de vuelta a /tpv, así el cajero no puede salir del terminal.
function isTpvAllowedPath(pathname) {
  return (
    pathname === '/tpv' ||
    pathname === '/login' ||
    pathname.startsWith('/auth/')
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f2e7e0',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      additionalArguments: [`--klima-mode=${mode}`],
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow.webContents.closeDevTools();
  });

  // Sin ventanas emergentes ni ventanas hijas desde el contenido
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Sin ventanas emergentes ni navegación fuera del dominio de la app.
  // En modo TPV además se corta la navegación antes de que se pinte
  // cualquier pantalla no permitida (p. ej. el redireccionado del servidor
  // /login → /dashboard) y se salta directo a /tpv.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const target = new URL(url);
      const allowedHost = new URL(APP_URL).host;
      if (target.host && allowedHost && target.host !== allowedHost) {
        event.preventDefault();
        shell.openExternal(url);
        return;
      }
      if (mode === 'tpv' && target.host === allowedHost && !isTpvAllowedPath(target.pathname)) {
        event.preventDefault();
        mainWindow.loadURL(APP_URL + '/tpv');
      }
    } catch {
      event.preventDefault();
    }
  });

  // El TPV entra directo a /tpv tras iniciar sesión. Las navegaciones
  // internas de la SPA no disparan 'will-navigate', así que también se
  // vigilan estos eventos: cualquier ruta no permitida vuelve forzada
  // a /tpv.
  const handleNav = (_event, url) => {
    if (mode !== 'tpv') return;
    try {
      const pathname = new URL(url).pathname;
      if (!isTpvAllowedPath(pathname)) {
        mainWindow.loadURL(APP_URL + '/tpv');
      }
    } catch {
      // Ignorar URLs malformadas
    }
  };
  mainWindow.webContents.on('did-navigate', handleNav);
  mainWindow.webContents.on('did-navigate-in-page', handleNav);

  // Kiosk a pantalla completa en TPV; F11 alterna kiosk/pantalla completa.
  // F12 y Ctrl+Shift+I quedan bloqueados: sin herramientas de desarrollo.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      event.preventDefault();
      if (mode === 'tpv') {
        mainWindow.setKiosk(!mainWindow.isKiosk());
      } else {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
      }
      return;
    }
    if (input.key === 'F12' || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i')) {
      event.preventDefault();
    }
    // En modo TPV el cajero no puede volver/avanzar con el historial
    // (Alt+← / Alt+→): la única salida permitida es el propio login.
    if (mode === 'tpv' && input.alt && (input.key === 'Left' || input.key === 'Right')) {
      event.preventDefault();
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Se arranca siempre en /login, nunca en la raíz "/": desde que esa ruta
  // pasó a ser el landing público de marketing, cargar APP_URL a secas
  // enseñaría esa página de venta dentro de la app de escritorio en vez de
  // entrar a la cuenta. El propio servidor decide qué toca ver realmente:
  // si ya hay sesión (la cookie persiste entre reinicios porque esta
  // ventana usa la partición de sesión por defecto de Electron, no una
  // efímera), el proxy del servidor redirige /login → /dashboard solo;
  // si no hay sesión, o si el usuario cerró sesión, se queda en /login.
  // En modo TPV ese redireccionado a /dashboard se intercepta arriba en
  // 'will-navigate' y se entra directo a /tpv, sin pasar por el dashboard.
  mainWindow.loadURL(APP_URL + '/login');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
