
// Preload script for the renderer process.

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    getWorkspaces: () => ipcRenderer.invoke('get-workspaces'),
    createWorkspace: () => ipcRenderer.invoke('create-workspace'),
    openWorkspace: () => ipcRenderer.invoke('open-workspace'),
    removeWorkspace: (id: string) => ipcRenderer.invoke('remove-workspace', id),
    getLastActiveWorkspace: () => ipcRenderer.invoke('get-last-active-workspace'),
    setLastActiveWorkspace: (id: string) => ipcRenderer.invoke('set-last-active-workspace', id),
    scanWorkspaceFiles: (paths: string[]) => ipcRenderer.invoke('scan-workspace-files', paths),
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

    // Model Management
    getModels: () => ipcRenderer.invoke('get-models'),
    saveModel: (model: any) => ipcRenderer.invoke('save-model', model),
    deleteModel: (id: string) => ipcRenderer.invoke('delete-model', id),
    setActiveModel: (id: string) => ipcRenderer.invoke('set-active-model', id),
    getActiveModel: () => ipcRenderer.invoke('get-active-model'),

    // File Ops
    importFile: () => ipcRenderer.invoke('import-file'),
    openFileNative: (filePath: string) => ipcRenderer.invoke('open-file-native', filePath),
    exportChat: (data: { title: string; content: string }) => ipcRenderer.invoke('export-chat', data),
    deleteFile: (filePath: string) => ipcRenderer.invoke('delete-file', filePath),
});
