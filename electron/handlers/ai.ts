
import { ipcMain } from 'electron';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { store } from '../store.js';
import { ChatMessage } from '../../src/shared/types.js';

export const IPC_CHANNELS_AI = {
    SEND_CHAT: 'send-chat',
    GET_API_KEY: 'get-api-key',
    SET_API_KEY: 'set-api-key',
    GET_MODEL: 'get-model',
    SET_MODEL: 'set-model',
    GET_AI_CONFIG: 'get-ai-config',
    SET_AI_CONFIG: 'set-ai-config',
    GET_MODELS: 'get-models',
    SAVE_MODEL: 'save-model',
    DELETE_MODEL: 'delete-model',
    SET_ACTIVE_MODEL: 'set-active-model',
    GET_ACTIVE_MODEL: 'get-active-model',
};


// Removed natively implemented Gemini client in favor of the OpenAI compatibility layer

export const registerAiHandlers = () => {
    // --- Legacy API Key handlers (kept for backward compat) ---
    ipcMain.handle(IPC_CHANNELS_AI.GET_API_KEY, () => {
        return store.get('aiApiKey') || store.get('openAiApiKey');
    });

    ipcMain.handle(IPC_CHANNELS_AI.SET_API_KEY, (_, key: string) => {
        store.set('aiApiKey', key);
        return true;
    });

    // --- Full AI Config handlers ---
    ipcMain.handle(IPC_CHANNELS_AI.GET_AI_CONFIG, () => {
        return {
            provider: store.get('aiProvider') || 'deepseek',
            apiKey: store.get('aiApiKey') || store.get('openAiApiKey') || '',
            model: store.get('aiModel') || store.get('modelName') || 'deepseek-reasoner',
            baseUrl: store.get('aiBaseUrl') || 'https://api.deepseek.com'
        };
    });

    ipcMain.handle(IPC_CHANNELS_AI.SET_AI_CONFIG, (_, config: { provider: string; apiKey: string; model: string; baseUrl: string }) => {
        store.set('aiProvider', config.provider);
        store.set('aiApiKey', config.apiKey);
        store.set('aiModel', config.model);
        store.set('aiBaseUrl', config.baseUrl);
        return true;
    });

    // Model Management List APIs
    ipcMain.handle(IPC_CHANNELS_AI.GET_MODELS, () => {
        return store.get('models') || [];
    });

    ipcMain.handle(IPC_CHANNELS_AI.SAVE_MODEL, (_, model: any) => {
        const models = store.get('models') || [];
        const existingIndex = models.findIndex((m: any) => m.id === model.id);
        if (existingIndex >= 0) {
            models[existingIndex] = model;
        } else {
            models.push(model);
        }
        store.set('models', models);
        // If this is the only model, auto-select it
        if (!store.get('activeModelId')) {
            store.set('activeModelId', model.id);
        }
        return true;
    });

    ipcMain.handle(IPC_CHANNELS_AI.DELETE_MODEL, (_, id: string) => {
        const models = store.get('models') || [];
        const newModels = models.filter((m: any) => m.id !== id);
        store.set('models', newModels);
        if (store.get('activeModelId') === id && newModels.length > 0) {
            store.set('activeModelId', newModels[0].id);
        } else if (newModels.length === 0) {
            store.delete('activeModelId');
        }
        return true;
    });

    ipcMain.handle(IPC_CHANNELS_AI.SET_ACTIVE_MODEL, (_, id: string) => {
        store.set('activeModelId', id);
        return true;
    });

    ipcMain.handle(IPC_CHANNELS_AI.GET_ACTIVE_MODEL, () => {
        const id = store.get('activeModelId');
        if (!id) return null;
        const models = store.get('models') || [];
        return models.find((m: any) => m.id === id) || null;
    });

    // Model Legacy Management
    ipcMain.handle(IPC_CHANNELS_AI.GET_MODEL, () => {
        return store.get('aiModel') || store.get('modelName') || 'deepseek-reasoner';
    });

    ipcMain.handle(IPC_CHANNELS_AI.SET_MODEL, (_, model: string) => {
        store.set('aiModel', model);
        return true;
    });

    // Chat Logic
    ipcMain.handle(IPC_CHANNELS_AI.SEND_CHAT, async (_, args: { messages: ChatMessage[], context: string }) => {
        const { messages, context } = args;

        let apiKey: string = '';
        let model: string = '';
        let baseUrl: string = '';
        let provider: string = '';

        const activeModelId = store.get('activeModelId');
        const models = store.get('models') || [];
        const activeModel = models.find((m: any) => m.id === activeModelId);

        if (activeModel) {
            apiKey = activeModel.apiKey;
            model = activeModel.model;
            baseUrl = activeModel.baseUrl;
            provider = activeModel.provider;
        } else {
            apiKey = (store.get('aiApiKey') || store.get('openAiApiKey')) as string;
            model = (store.get('aiModel') || store.get('modelName') || 'deepseek-reasoner') as string;
            baseUrl = (store.get('aiBaseUrl') || 'https://api.deepseek.com') as string;
            provider = (store.get('aiProvider') || 'deepseek') as string;
        }

        if (!apiKey) {
            return {
                success: false,
                error: 'API Key not set. Please configure it in Settings.'
            };
        }

        // Build the system prompt
        const hasContext = context && context.trim().length > 0;

        let systemPrompt = `You are a helpful AI assistant specialized in analyzing TreeSheets (.cts) files.`;

        if (hasContext) {
            systemPrompt += `

IMPORTANT INSTRUCTIONS:
1. You are given the EXACT content of one or more TreeSheets files below.
2. Each file's content is delimited by "--- File: [filename] ---".
3. When asked about file content, you MUST quote ONLY the text that actually appears in the provided content below.
4. NEVER fabricate, summarize, or invent content that is not present in the files.
5. If asked to reproduce content, copy it VERBATIM from the context — do not paraphrase or reorganize.
6. If you cannot find the requested content in the context, say "I cannot find that content in the provided file(s)."

FILE CONTENT:
${context}`;
        } else {
            systemPrompt += `\n\nNo file content is currently loaded. Ask the user to select files in the sidebar to add them as context.`;
        }

        // Format messages
        const formattedMessages = messages
            .filter(msg => msg.content && msg.content.trim().length > 0)
            .map((msg: ChatMessage) => ({
                role: msg.role as string,
                content: msg.content
            }));

        try {
            if (provider === 'anthropic') {
                // Ignore user-provided base URL if it's just the official Anthropic domain, 
                // so the SDK can correctly append /v1/messages without double-appending.
                let anthropicBaseUrl: string | undefined = baseUrl && baseUrl.length > 5 ? baseUrl as string : undefined;
                if (anthropicBaseUrl && anthropicBaseUrl.includes('api.anthropic.com')) {
                    anthropicBaseUrl = undefined;
                }

                // ===== Use native Anthropic API with Prompt Caching =====
                const client = new Anthropic({
                    apiKey: apiKey as string,
                    baseURL: anthropicBaseUrl
                });

                const anthropicSystemBase = `You are a helpful AI assistant specialized in analyzing TreeSheets (.cts) files.`;
                const anthropicSystemContext = hasContext
                    ? `\n\nIMPORTANT INSTRUCTIONS:\n1. You are given the EXACT content of one or more TreeSheets files below.\n2. Each file's content is delimited by "--- File: [filename] ---".\n3. When asked about file content, you MUST quote ONLY the text that actually appears in the provided content below.\n4. NEVER fabricate, summarize, or invent content that is not present in the files.\n5. If asked to reproduce content, copy it VERBATIM from the context — do not paraphrase or reorganize.\n6. If you cannot find the requested content in the context, say "I cannot find that content in the provided file(s)."\n\nFILE CONTENT:\n${context}`
                    : `\n\nNo file content is currently loaded. Ask the user to select files in the sidebar to add them as context.`;

                // Split system prompt to cache the heavy context block
                const anthropicSystem: any[] = [
                    { type: 'text', text: anthropicSystemBase },
                    {
                        type: 'text',
                        text: anthropicSystemContext,
                        cache_control: { type: 'ephemeral' } // Caching Context ~90% savings
                    }
                ];

                console.log(`[AI] Sending to Anthropic (${baseUrl || 'native'}) model=${model}, messages=${formattedMessages.length}`);

                const completion = await client.messages.create({
                    model: model as string,
                    max_tokens: 4096,
                    system: anthropicSystem,
                    messages: formattedMessages.map(m => ({
                        role: m.role as 'user' | 'assistant',
                        content: m.content || '(empty)'
                    })),
                }, {
                    headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' }
                });

                // Console output for caching verification
                const cacheCreateTokens = (completion.usage as any)?.cache_creation_input_tokens || 0;
                const cacheReadTokens = (completion.usage as any)?.cache_read_input_tokens || 0;
                console.log(`[Anthropic Cache] Creation: ${cacheCreateTokens}, Read: ${cacheReadTokens} (Cache hits save ~90% input cost)`);

                const replyBlock = completion.content[0];
                const reply = replyBlock?.type === 'text' ? replyBlock.text : '';

                if (!reply) {
                    return { success: false, error: 'AI returned an empty response. Please try again.' };
                }
                return { success: true, content: reply };

            } else {
                // ===== Use OpenAI SDK for all other providers (DeepSeek, OpenAI, Gemini) =====
                const client = new OpenAI({
                    apiKey: apiKey as string,
                    baseURL: baseUrl as string
                });

                const finalMessages = [
                    { role: 'system' as const, content: systemPrompt },
                    ...formattedMessages.map(m => ({
                        role: m.role as 'user' | 'assistant',
                        content: m.content || '(empty)'
                    }))
                ];

                console.log(`[AI] Sending to ${provider} (${baseUrl}) model=${model}, messages=${finalMessages.length}`);

                const completion = await client.chat.completions.create({
                    messages: finalMessages,
                    model: model as string,
                });

                const reply = completion.choices?.[0]?.message?.content;

                if (!reply) {
                    return {
                        success: false,
                        error: 'AI returned an empty response. Please try again.'
                    };
                }

                return { success: true, content: reply };
            }

        } catch (error: any) {
            console.error(`[AI] ${provider} API Error:`, error);

            let errorMsg = error.message || 'Failed to communicate with AI provider.';

            if (error.status === 401) {
                errorMsg = `Authentication failed. Please check your ${provider} API key in Settings.`;
            } else if (error.status === 404) {
                errorMsg = `Endpoint or Model not found (404). If using a custom URL, verify it. Model: "${model}". Error details: ${error.message}`;

                if (provider === 'anthropic' && error.message.includes('not_found_error')) {
                    try {
                        let anthropicBaseUrl: string | undefined = baseUrl && baseUrl.length > 5 ? baseUrl as string : undefined;
                        if (anthropicBaseUrl && anthropicBaseUrl.includes('api.anthropic.com')) {
                            anthropicBaseUrl = undefined;
                        }
                        const testClient = new Anthropic({ apiKey: apiKey as string, baseURL: anthropicBaseUrl });
                        const modelsList = await testClient.models.list();
                        const available = modelsList.data.map((m: any) => m.id).join('\\n- ');
                        errorMsg = `Anthropic Error: Model "${model}" was not found (it might be retired, or restricted from your billing tier).\\n\\nHere are the EXACT models your API key has access to:\\n- ${available}\\n\\nPlease update your Model Name in Settings to one of those!`;
                    } catch (e) {
                        console.error('Failed to auto-fetch Anthropic models:', e);
                    }
                }
            } else if (error.status === 400 || error.status === 403) {
                errorMsg = `API Error from ${provider}: ${error.message}. Check that model "${model}" is valid.`;
            } else if (error.code === 'ECONNREFUSED') {
                errorMsg = `Cannot connect to ${baseUrl}. Please check the Base URL in Settings.`;
            }

            return { success: false, error: errorMsg };
        }
    });
};
