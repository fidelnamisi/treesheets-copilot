
import { ipcMain, dialog, app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../store.js';
import { Workspace } from '../../src/shared/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Define IPC channel names as constants
export const IPC_CHANNELS = {
    GET_WORKSPACES: 'get-workspaces',
    ADD_WORKSPACE: 'add-workspace',
    REMOVE_WORKSPACE: 'remove-workspace',
    SELECT_DIRECTORY: 'select-directory',
    GET_LAST_ACTIVE_WORKSPACE: 'get-last-active-workspace',
    set_LAST_ACTIVE_WORKSPACE: 'set-last-active-workspace',
    SAVE_WORKSPACE_STATE: 'save-workspace-state',
    LOAD_WORKSPACE_STATE: 'load-workspace-state'
};

const WORKSPACES_DIR = path.join(app.getPath('userData'), 'workspaces');

// Helper to ensure workspaces directory exists
const ensureWorkspacesDir = async () => {
    try {
        await fs.access(WORKSPACES_DIR);
    } catch {
        await fs.mkdir(WORKSPACES_DIR, { recursive: true });
    }
};

export const registerWorkspaceHandlers = () => {
    ensureWorkspacesDir();

    // Get all workspaces (Read JSONs)
    ipcMain.handle(IPC_CHANNELS.GET_WORKSPACES, async () => {
        try {
            await ensureWorkspacesDir();
            const files = await fs.readdir(WORKSPACES_DIR);
            const jsonFiles = files.filter(f => f.endsWith('.json'));

            const workspaces: Workspace[] = [];
            for (const file of jsonFiles) {
                try {
                    const content = await fs.readFile(path.join(WORKSPACES_DIR, file), 'utf-8');
                    const ws = JSON.parse(content);
                    workspaces.push(ws);
                } catch (e) {
                    console.error(`Error reading workspace file ${file}:`, e);
                }
            }
            // Sort by createdAt desc
            return workspaces.sort((a, b) => b.createdAt - a.createdAt);
        } catch (error) {
            console.error('Failed to get workspaces:', error);
            return [];
        }
    });

    // Add a new workspace
    ipcMain.handle(IPC_CHANNELS.ADD_WORKSPACE, async (_, workspaceData: { name: string, path: string }) => {
        const newWorkspace: Workspace = {
            id: uuidv4(),
            name: workspaceData.name,
            path: workspaceData.path,
            createdAt: Date.now(),
            selectedFilePaths: [],
            chatSessions: []
        };

        const filePath = path.join(WORKSPACES_DIR, `${newWorkspace.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(newWorkspace, null, 2));

        return newWorkspace;
    });

    // Remove a workspace
    ipcMain.handle(IPC_CHANNELS.REMOVE_WORKSPACE, async (_, id: string) => {
        const filePath = path.join(WORKSPACES_DIR, `${id}.json`);
        try {
            await fs.unlink(filePath);

            // Handle last active
            const lastActive = store.get('lastActiveWorkspaceId');
            if (lastActive === id) {
                store.delete('lastActiveWorkspaceId' as any);
            }

            return true;
        } catch (error) {
            console.error(`Failed to remove workspace ${id}:`, error);
            return false;
        }
    });

    // Save workspace state (selected files, chat history)
    ipcMain.handle(IPC_CHANNELS.SAVE_WORKSPACE_STATE, async (_, { id, state }: { id: string, state: Partial<Workspace> }) => {
        const filePath = path.join(WORKSPACES_DIR, `${id}.json`);
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const ws: Workspace = JSON.parse(content);

            const updatedWs = { ...ws, ...state };
            await fs.writeFile(filePath, JSON.stringify(updatedWs, null, 2));
            return true;
        } catch (error) {
            console.error(`Failed to save workspace state for ${id}:`, error);
            return false;
        }
    });

    // Explicit load workspace (though getWorkspaces loads all, this is good for refresh)
    ipcMain.handle(IPC_CHANNELS.LOAD_WORKSPACE_STATE, async (_, id: string) => {
        const filePath = path.join(WORKSPACES_DIR, `${id}.json`);
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            console.error(`Failed to load workspace ${id}:`, error);
            return null;
        }
    });

    // Select directory dialog
    ipcMain.handle(IPC_CHANNELS.SELECT_DIRECTORY, async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory']
        });

        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }

        const dirPath = result.filePaths[0];
        const name = path.basename(dirPath);

        return { path: dirPath, name };
    });

    // Get/Set last active workspace
    ipcMain.handle(IPC_CHANNELS.GET_LAST_ACTIVE_WORKSPACE, () => {
        return store.get('lastActiveWorkspaceId');
    });

    ipcMain.handle(IPC_CHANNELS.set_LAST_ACTIVE_WORKSPACE, (_, id: string) => {
        store.set('lastActiveWorkspaceId', id);
    });
};
