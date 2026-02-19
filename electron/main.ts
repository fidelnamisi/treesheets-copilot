
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { registerWorkspaceHandlers } from './handlers/workspace.js'; // Use .js extension for ESM imports
import { registerFileHandlers } from './handlers/files.js';
import { registerParserHandlers } from './handlers/parser.js';
import { registerWatcherHandlers, setWatcherMainWindow } from './handlers/watcher.js';
import { registerAiHandlers } from './handlers/ai.js';

// store is initialized on import

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit();
}

// Register handlers
registerWorkspaceHandlers();
registerFileHandlers();
registerParserHandlers();
registerWatcherHandlers();
registerAiHandlers();

const createWindow = () => {
    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'TreeSheets Copilot',
        webPreferences: {
            preload: path.join(__dirname, '..', 'preload.cjs'),
            // In production, we should disable nodeIntegration, but for now we might leave it off by default (good).
            // If we need IPC, we'll use contextBridge in preload.
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    setWatcherMainWindow(mainWindow);

    // Determine if we are in development or production
    const isDev = !app.isPackaged && !process.env.ELECTRON_IS_TEST;
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        // Path adjusted for dist-electron/electron/main.js -> ../../dist/index.html
        mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
    }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
