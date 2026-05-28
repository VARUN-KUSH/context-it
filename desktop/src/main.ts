import { app, BrowserWindow, Menu, nativeImage, shell, session } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import path from 'path'

app.setName('context-it')

const isDev = process.env.NODE_ENV === 'development'

// __dirname is dist-electron/ at runtime; assets/ sits one level up
const iconPath = path.join(__dirname, '../assets/icon.png')

function getStartURL(): { kind: 'url'; value: string } | { kind: 'file'; value: string } {
  if (isDev) {
    return { kind: 'url', value: 'http://localhost:5173' }
  }
  if (app.isPackaged) {
    // Packaged .app — frontend lives in Resources/frontend-dist via extraResources
    return {
      kind: 'file',
      value: path.join(process.resourcesPath, 'frontend-dist', 'index.html'),
    }
  }
  // start:prod — compiled but not packaged; __dirname is desktop/dist-electron/
  return {
    kind: 'file',
    value: path.resolve(__dirname, '../../frontend/dist/index.html'),
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const start = getStartURL()
  if (start.kind === 'url') {
    win.loadURL(start.value)
    win.webContents.openDevTools()
  } else {
    win.loadFile(start.value)
  }

  return win
}

function buildMenu(win: BrowserWindow): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: 'CmdOrCtrl+,', enabled: false },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { role: 'close', accelerator: 'CmdOrCtrl+W' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => win.webContents.reload(),
        },
        {
          label: 'Force Reload',
          accelerator: 'Shift+CmdOrCtrl+R',
          click: () => win.webContents.reloadIgnoringCache(),
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'Alt+CmdOrCtrl+I',
          click: () => win.webContents.toggleDevTools(),
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      role: 'window',
      submenu: [
        { role: 'minimize', accelerator: 'CmdOrCtrl+M' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: () => shell.openExternal('https://github.com'),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  // Inject ngrok-skip-browser-warning on every request/websocket so ngrok
  // never shows its interstitial HTML page instead of returning JSON/WS data.
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (details.url.includes('ngrok')) {
      details.requestHeaders['ngrok-skip-browser-warning'] = 'true'
    }
    callback({ requestHeaders: details.requestHeaders })
  })

  // Set dock icon explicitly — required in dev mode since electron-builder
  // only injects the icon at package time
  if (process.platform === 'darwin') {
    app.dock.setIcon(nativeImage.createFromPath(iconPath))
  }

  const win = createWindow()
  buildMenu(win)

  // Re-create window on macOS dock click when no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow()
      buildMenu(w)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
