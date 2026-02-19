
// Preload script for the renderer process.

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    getWorkspaces: () => ipcRenderer.invoke('get-workspaces'),
    addWorkspace: (data: any) => ipcRenderer.invoke('add-workspace', data),
    removeWorkspace: (id: string) => ipcRenderer.invoke('remove-workspace', id),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    getLastActiveWorkspace: () => ipcRenderer.invoke('get-last-active-workspace'),
    setLastActiveWorkspace: (id: string) => ipcRenderer.invoke('set-last-active-workspace', id),
    scanWorkspaceFiles: (path: string) => ipcRenderer.invoke('scan-workspace-files', path),
    parseCtsFile: (path: string) => ipcRenderer.invoke('parse-cts-file', path),
    startWatching: (path: string) => ipcRenderer.invoke('start-watching', path),
    stopWatching: () => ipcRenderer.invoke('stop-watching'),
    onFileChanged: (callback: (data: { type: 'add' | 'change' | 'unlink', path: string }) => void) => {
        const subscription = (_: any, data: any) => callback(data);
        ipcRenderer.on('file-changed', subscription);
        return () => ipcRenderer.removeListener('file-changed', subscription);
    },
    saveWorkspaceState: (id: string, state: any) => ipcRenderer.invoke('save-workspace-state', { id, state }),
    loadWorkspaceState: (id: string) => ipcRenderer.invoke('load-workspace-state', id),
    // AI
    sendChat: (messages: any[], context: string) => ipcRenderer.invoke('send-chat', { messages, context }),
    getApiKey: () => ipcRenderer.invoke('get-api-key'),
    setApiKey: (key: string) => ipcRenderer.invoke('set-api-key', key),
    getAiConfig: () => ipcRenderer.invoke('get-ai-config'),
    setAiConfig: (config: { provider: string; apiKey: string; model: string; baseUrl: string }) => ipcRenderer.invoke('set-ai-config', config),

    // File Ops
    importFile: (workspacePath: string) => ipcRenderer.invoke('import-file', workspacePath),
    openFileNative: (filePath: string) => ipcRenderer.invoke('open-file-native', filePath),
    exportChat: (data: { title: string; content: string }) => ipcRenderer.invoke('export-chat', data),
});
