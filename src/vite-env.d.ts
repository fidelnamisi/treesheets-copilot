
/// <reference types="vite/client" />

interface AiConfigData {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl: string;
}

interface ElectronAPI {
    getWorkspaces: () => Promise<import('./shared/types').Workspace[]>;
    addWorkspace: (data: any) => Promise<import('./shared/types').Workspace>;
    removeWorkspace: (id: string) => Promise<import('./shared/types').Workspace[]>;
    selectDirectory: () => Promise<{ path: string; name: string } | null>;
    getLastActiveWorkspace: () => Promise<string | undefined>;
    setLastActiveWorkspace: (id: string) => Promise<void>;
    scanWorkspaceFiles: (path: string) => Promise<{ name: string; path: string; relativePath: string; lastModified: number; size: number }[]>;
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
    // File Ops
    importFile: (workspacePath: string) => Promise<boolean>;
    openFileNative: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    exportChat: (data: { title: string; content: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
}

interface Window {
    electronAPI: ElectronAPI;
}
