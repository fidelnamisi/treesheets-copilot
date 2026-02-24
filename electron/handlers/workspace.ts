
import { ipcMain, dialog, app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../store.js';
import { Workspace } from '../../src/shared/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Define IPC channel names as constants
export const IPC_CHANNELS = {
    GET_WORKSPACES: 'get-workspaces',
    CREATE_WORKSPACE: 'create-workspace',
    OPEN_WORKSPACE: 'open-workspace',
    REMOVE_WORKSPACE: 'remove-workspace',
    GET_LAST_ACTIVE_WORKSPACE: 'get-last-active-workspace',
    set_LAST_ACTIVE_WORKSPACE: 'set-last-active-workspace',
    SAVE_WORKSPACE_STATE: 'save-workspace-state',
    LOAD_WORKSPACE_STATE: 'load-workspace-state'
};

export const registerWorkspaceHandlers = () => {
    // Get all tracked workspaces (Read from recentWorkspaces)
    ipcMain.handle(IPC_CHANNELS.GET_WORKSPACES, async () => {
        const recentPaths = store.get('recentWorkspaces') || [];
        const workspaces: Workspace[] = [];
        const validPaths: string[] = [];

        for (const filePath of recentPaths) {
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                const ws = JSON.parse(content);
                workspaces.push(ws);
                validPaths.push(filePath);
            } catch (e) {
                console.error(`Error reading workspace file ${filePath}:`, e);
            }
        }

        // Clean up invalid paths
        if (validPaths.length !== recentPaths.length) {
            store.set('recentWorkspaces', validPaths);
        }

        // Sort by createdAt desc
        return workspaces.sort((a, b) => b.createdAt - a.createdAt);
    });

    // Create a new workspace file natively dialog
    ipcMain.handle(IPC_CHANNELS.CREATE_WORKSPACE, async () => {
        const result = await dialog.showSaveDialog({
            title: 'Create New Workspace',
            defaultPath: 'New Workspace.tscopilotworkspace',
            filters: [{ name: 'TreeSheets Copilot Workspace', extensions: ['tscopilotworkspace'] }]
        });

        if (result.canceled || !result.filePath) {
            return null;
        }

        const filePath = result.filePath;
        const name = path.basename(filePath, '.tscopilotworkspace');

        const newWorkspace: Workspace = {
            id: filePath,
            name: name,
            path: filePath,
            createdAt: Date.now(),
            selectedFilePaths: [],
            chatSessions: [],
            referencedFiles: []
        };

        await fs.writeFile(filePath, JSON.stringify(newWorkspace, null, 2));

        const recentPaths = store.get('recentWorkspaces') || [];
        if (!recentPaths.includes(filePath)) {
            store.set('recentWorkspaces', [filePath, ...recentPaths]);
        }

        return newWorkspace;
    });

    // Open existing workspace
    ipcMain.handle(IPC_CHANNELS.OPEN_WORKSPACE, async () => {
        const result = await dialog.showOpenDialog({
            title: 'Open Workspace',
            properties: ['openFile'],
            filters: [{ name: 'TreeSheets Copilot Workspace', extensions: ['tscopilotworkspace'] }]
        });

        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }

        const filePath = result.filePaths[0];

        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const loadedWorkspace = JSON.parse(content);
            const recentPaths = store.get('recentWorkspaces') || [];
            if (!recentPaths.includes(filePath)) {
                store.set('recentWorkspaces', [filePath, ...recentPaths]);
            }
            return loadedWorkspace;
        } catch (error) {
            console.error('Failed to parse workspace file:', error);
            return null;
        }
    });

    // Remove a workspace merely from recents
    ipcMain.handle(IPC_CHANNELS.REMOVE_WORKSPACE, async (_, id: string) => {
        const recentPaths = store.get('recentWorkspaces') || [];
        const newPaths = recentPaths.filter(p => p !== id);
        store.set('recentWorkspaces', newPaths);

        // Handle last active
        const lastActive = store.get('lastActiveWorkspaceId');
        if (lastActive === id) {
            store.delete('lastActiveWorkspaceId' as any);
        }

        return true;
    });

    // Save workspace state (selected files, chat history)
    ipcMain.handle(IPC_CHANNELS.SAVE_WORKSPACE_STATE, async (_, { id, state }: { id: string, state: Partial<Workspace> }) => {
        const filePath = id; // Since id is now the absolute filePath
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

    // Explicit load workspace
    ipcMain.handle(IPC_CHANNELS.LOAD_WORKSPACE_STATE, async (_, id: string) => {
        const filePath = id; // id is the filePath
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            console.error(`Failed to load workspace ${id}:`, error);
            return null;
        }
    });

    // Get/Set last active workspace
    ipcMain.handle(IPC_CHANNELS.GET_LAST_ACTIVE_WORKSPACE, () => {
        return store.get('lastActiveWorkspaceId');
    });

    ipcMain.handle(IPC_CHANNELS.set_LAST_ACTIVE_WORKSPACE, (_, id: string) => {
        store.set('lastActiveWorkspaceId', id);
    });
};
