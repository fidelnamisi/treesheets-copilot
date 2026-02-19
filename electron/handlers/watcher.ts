import { ipcMain, BrowserWindow } from 'electron';
import * as chokidar from 'chokidar';
import path from 'path';

let watcher: chokidar.FSWatcher | null = null;
let mainWindow: BrowserWindow | null = null;

export const IPC_CHANNELS_WATCHER = {
    START_WATCHING: 'start-watching',
    STOP_WATCHING: 'stop-watching',
    FILE_CHANGED: 'file-changed'
};

export const setWatcherMainWindow = (win: BrowserWindow) => {
    mainWindow = win;
};

export const registerWatcherHandlers = () => {
    ipcMain.handle(IPC_CHANNELS_WATCHER.START_WATCHING, async (_, workspacePath: string) => {
        if (watcher) {
            await watcher.close();
        }

        // Watch for .cts files in the workspace directory
        watcher = chokidar.watch(path.join(workspacePath, '**/*.cts'), {
            ignoreInitial: true,
            persistent: true,
            awaitWriteFinish: {
                stabilityThreshold: 500, // Wait 500ms after write finishes
                pollInterval: 100
            }
        });

        watcher.on('add', (filePath: string) => {
            console.log(`File added: ${filePath}`);
            if (mainWindow) {
                mainWindow.webContents.send(IPC_CHANNELS_WATCHER.FILE_CHANGED, { type: 'add', path: filePath });
            }
        });

        watcher.on('change', (filePath: string) => {
            console.log(`File changed: ${filePath}`);
            if (mainWindow) {
                mainWindow.webContents.send(IPC_CHANNELS_WATCHER.FILE_CHANGED, { type: 'change', path: filePath });
            }
        });

        watcher.on('unlink', (filePath: string) => {
            console.log(`File removed: ${filePath}`);
            if (mainWindow) {
                mainWindow.webContents.send(IPC_CHANNELS_WATCHER.FILE_CHANGED, { type: 'unlink', path: filePath });
            }
        });

        return { success: true };
    });

    ipcMain.handle(IPC_CHANNELS_WATCHER.STOP_WATCHING, async () => {
        if (watcher) {
            await watcher.close();
            watcher = null;
        }
        return { success: true };
    });
};
