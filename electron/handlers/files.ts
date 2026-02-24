
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
    // Get details for referenced files
    ipcMain.handle(IPC_CHANNELS_FILES.SCAN_WORKSPACE_FILES, async (_, filePaths: string[]) => {
        try {
            const files: WorkspaceFile[] = [];
            for (const filePath of filePaths) {
                try {
                    const stats = await fs.stat(filePath);
                    files.push({
                        name: path.basename(filePath),
                        path: filePath,
                        relativePath: path.basename(filePath),
                        lastModified: stats.mtimeMs,
                        size: stats.size
                    });
                } catch (e) {
                    // Ignore missing files or log them
                    console.warn(`File not found: ${filePath}`);
                }
            }
            // Sort by name
            return files.sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            console.error('Error fetching file details:', error);
            return [];
        }
    });

    ipcMain.handle('import-file', async () => {
        const { dialog } = await import('electron');
        const result = await dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'TreeSheets Files', extensions: ['cts'] }]
        });

        if (result.canceled || result.filePaths.length === 0) {
            return [];
        }

        return result.filePaths;
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
