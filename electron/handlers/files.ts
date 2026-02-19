
import { ipcMain } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import fg from 'fast-glob';

// Define the file structure for the UI
export interface WorkspaceFile {
    name: string;
    path: string;
    relativePath: string;
    lastModified: number;
    size: number;
}

export const IPC_CHANNELS_FILES = {
    SCAN_WORKSPACE_FILES: 'scan-workspace-files',
};

export const registerFileHandlers = () => {
    // Scan workspace directory for .cts files
    ipcMain.handle(IPC_CHANNELS_FILES.SCAN_WORKSPACE_FILES, async (_, workspacePath: string) => {
        try {
            // Find all .cts files recursively
            // Using fast-glob which returns forward slashes even on Windows, 
            // but we might want OS specific for display? Usually forward slash relative paths are fine for keys.
            const entries = await fg(['**/*.cts'], {
                cwd: workspacePath,
                stats: true,
                absolute: true,
                ignore: ['**/node_modules/**']
            });

            const files: WorkspaceFile[] = entries.map((entry: any) => ({
                name: entry.name,
                path: entry.path, // Absolute path
                relativePath: path.relative(workspacePath, entry.path),
                lastModified: entry.stats?.mtimeMs || 0,
                size: entry.stats?.size || 0
            }));

            // Sort by name for now
            return files.sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            console.error('Error scanning workspace files:', error);
            return [];
        }
    });

    ipcMain.handle('import-file', async (event, workspacePath: string) => {
        const { dialog } = await import('electron');
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'TreeSheets Files', extensions: ['cts'] }]
        });

        if (result.canceled || result.filePaths.length === 0) {
            return false;
        }

        const sourcePath = result.filePaths[0];
        const fileName = path.basename(sourcePath);
        const destPath = path.join(workspacePath, fileName);

        try {
            await fs.copyFile(sourcePath, destPath);
            return true;
        } catch (error) {
            console.error('Failed to import file:', error);
            return false;
        }
    });

    // Open file in native application
    ipcMain.handle('open-file-native', async (_, filePath: string) => {
        const { shell } = await import('electron');
        try {
            const errorMsg = await shell.openPath(filePath);
            if (errorMsg) {
                console.error('Failed to open file natively:', errorMsg);
                return { success: false, error: errorMsg };
            }
            return { success: true };
        } catch (error: any) {
            console.error('Failed to open file natively:', error);
            return { success: false, error: error.message };
        }
    });

    // Export chat session as markdown
    ipcMain.handle('export-chat', async (_, data: { title: string; content: string }) => {
        const { dialog } = await import('electron');
        const safeName = data.title.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'chat-export';
        const result = await dialog.showSaveDialog({
            defaultPath: `${safeName}.md`,
            filters: [
                { name: 'Markdown', extensions: ['md'] },
                { name: 'Text', extensions: ['txt'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (result.canceled || !result.filePath) {
            return { success: false };
        }

        try {
            await fs.writeFile(result.filePath, data.content, 'utf-8');
            return { success: true, path: result.filePath };
        } catch (error: any) {
            console.error('Failed to export chat:', error);
            return { success: false, error: error.message };
        }
    });
};
