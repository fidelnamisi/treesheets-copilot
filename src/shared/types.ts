export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    lastModified: number;
    parentId?: string;
    branchPointMessageId?: string;
}

export interface Workspace {
    id: string;
    name: string;
    path: string; // Absolute path to the .tscopilotworkspace file
    createdAt: number;
    selectedFilePaths: string[]; // Files currently active in context
    chatSessions: ChatSession[];
    lastActiveSessionId?: string;
    referencedFiles?: string[]; // Array of absolute paths to original files
}

export type AiProvider = 'deepseek' | 'openai' | 'anthropic' | 'google' | 'custom';

export interface AiProviderConfig {
    provider: AiProvider;
    apiKey: string;
    model: string;
    baseUrl: string;
}

// Provider presets with default base URLs and models
export const AI_PROVIDER_PRESETS: Record<AiProvider, { label: string; baseUrl: string; defaultModel: string; placeholder: string }> = {
    deepseek: {
        label: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        defaultModel: 'deepseek-reasoner',
        placeholder: 'sk-...'
    },
    openai: {
        label: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o',
        placeholder: 'sk-...'
    },
    anthropic: {
        label: 'Anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        defaultModel: 'claude-sonnet-4-20250514',
        placeholder: 'sk-ant-...'
    },
    google: {
        label: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        defaultModel: 'gemini-2.0-flash',
        placeholder: 'AIza...'
    },
    custom: {
        label: 'Custom (OpenAI-compatible)',
        baseUrl: 'http://localhost:11434/v1',
        defaultModel: 'llama3',
        placeholder: 'API key...'
    }
};

export interface CustomModel {
    id: string;
    name: string;
    provider: AiProvider;
    apiKey: string;
    model: string;
    baseUrl: string;
}

export interface AppStore {
    lastActiveWorkspaceId?: string;
    theme: 'light' | 'dark';

    // Multiple models tracking
    models?: CustomModel[];
    activeModelId?: string;

    // Workspace tracking
    recentWorkspaces?: string[];

    // Default/active AI Configuration (legacy mode support)
    aiProvider?: AiProvider;
    aiApiKey?: string;
    aiModel?: string;
    aiBaseUrl?: string;

    // Legacy (kept for migration)
    openAiApiKey?: string;
    modelName?: string;
}
