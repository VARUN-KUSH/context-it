"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
electron_1.app.setName('context-it');
const isDev = process.env.NODE_ENV === 'development';
// __dirname is dist-electron/ at runtime; assets/ sits one level up
const iconPath = path_1.default.join(__dirname, '../assets/icon.png');
function getStartURL() {
    if (isDev) {
        return { kind: 'url', value: 'http://localhost:5173' };
    }
    if (electron_1.app.isPackaged) {
        // Packaged .app — frontend lives in Resources/frontend-dist via extraResources
        return {
            kind: 'file',
            value: path_1.default.join(process.resourcesPath, 'frontend-dist', 'index.html'),
        };
    }
    // start:prod — compiled but not packaged; __dirname is desktop/dist-electron/
    return {
        kind: 'file',
        value: path_1.default.resolve(__dirname, '../../frontend/dist/index.html'),
    };
}
function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        titleBarStyle: 'hiddenInset',
        icon: iconPath,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    const start = getStartURL();
    if (start.kind === 'url') {
        win.loadURL(start.value);
        win.webContents.openDevTools();
    }
    else {
        win.loadFile(start.value);
    }
    return win;
}
function buildMenu(win) {
    const template = [
        {
            label: electron_1.app.name,
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
                    click: () => electron_1.shell.openExternal('https://github.com'),
                },
            ],
        },
    ];
    electron_1.Menu.setApplicationMenu(electron_1.Menu.buildFromTemplate(template));
}
electron_1.app.whenReady().then(() => {
    // Set dock icon explicitly — required in dev mode since electron-builder
    // only injects the icon at package time
    if (process.platform === 'darwin') {
        electron_1.app.dock.setIcon(electron_1.nativeImage.createFromPath(iconPath));
    }
    const win = createWindow();
    buildMenu(win);
    // Re-create window on macOS dock click when no windows are open
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            const w = createWindow();
            buildMenu(w);
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
