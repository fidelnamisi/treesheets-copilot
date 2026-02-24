
/// <reference types="vite/client" />

interface AiConfigData {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl: string;
}

interface ElectronAPI {
    getWorkspaces: () => Promise<import('./shared/types').Workspace[]>;
    createWorkspace: () => Promise<import('./shared/types').Workspace | null>;
    openWorkspace: () => Promise<import('./shared/types').Workspace | null>;
    removeWorkspace: (id: string) => Promise<boolean>;
    getLastActiveWorkspace: () => Promise<string | undefined>;
    setLastActiveWorkspace: (id: string) => Promise<void>;
    scanWorkspaceFiles: (paths: string[]) => Promise<{ name: string; path: string; relativePath: string; lastModified: number; size: number }[]>;
    parseCtsFile: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>;
    startWatching: (path: string) => Promise<void>;
    stopWatching: () => Promise<void>;
    onFileChanged: (callback: (data: { type: 'add' | 'change' | 'unlink', path: string }) => void) => () => void;
    saveWorkspaceState: (id: string, state: any) => Promise<boolean>;
    loadWorkspaceState: (id: string) => Promise<any>;
    // AI
    sendChat: (messages: import('./shared/types').ChatMessage[], context: string) => Promise<{ success: boolean; content?: string; error?: string }>;
    getApiKey: () => Promise<string | undefined>;
    setApiKey: (key: string) => Promise<boolean>;
    getAiConfig: () => Promise<AiConfigData>;
    setAiConfig: (config: AiConfigData) => Promise<boolean>;
    // Models
    getModels: () => Promise<import('./shared/types').CustomModel[]>;
    saveModel: (model: import('./shared/types').CustomModel) => Promise<boolean>;
    deleteModel: (id: string) => Promise<boolean>;
    setActiveModel: (id: string) => Promise<boolean>;
    getActiveModel: () => Promise<import('./shared/types').CustomModel | null>;
    // File Ops
    importFile: () => Promise<string[]>;
    openFileNative: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    exportChat: (data: { title: string; content: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
    deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
}

interface Window {
    electronAPI: ElectronAPI;
}
