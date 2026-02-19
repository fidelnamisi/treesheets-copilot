
import { ipcMain } from 'electron';
import OpenAI from 'openai';
import { store } from '../store.js';
import { ChatMessage } from '../../src/shared/types.js';

export const IPC_CHANNELS_AI = {
    SEND_CHAT: 'send-chat',
    GET_API_KEY: 'get-api-key',
    SET_API_KEY: 'set-api-key',
    GET_MODEL: 'get-model',
    SET_MODEL: 'set-model',
    GET_AI_CONFIG: 'get-ai-config',
    SET_AI_CONFIG: 'set-ai-config'
};

/**
 * Call Google Gemini using its native REST API (not the OpenAI compatibility layer).
 * This is more reliable and supports all Gemini features.
 */
async function callGeminiNative(
    apiKey: string,
    model: string,
    systemPrompt: string,
    messages: { role: string; content: string }[]
): Promise<{ success: boolean; content?: string; error?: string }> {
    // Gemini API: POST /v1beta/models/{model}:generateContent?key={key}
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Convert OpenAI-style messages to Gemini format
    // Gemini uses "user" and "model" roles (not "assistant")
    const contents = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content || '(empty)' }]
    }));

    const body: any = {
        contents,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
        }
    };

    // Add system instruction if provided
    if (systemPrompt && systemPrompt.trim()) {
        body.systemInstruction = {
            parts: [{ text: systemPrompt }]
        };
    }

    console.log(`[AI] Calling Gemini native API: model=${model}, messages=${contents.length}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        let errorMsg = `Gemini API error (${response.status})`;

        try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.error?.message) {
                errorMsg = errorJson.error.message;
            }
        } catch {
            if (errorText) errorMsg += `: ${errorText.substring(0, 200)}`;
        }

        if (response.status === 400) {
            errorMsg = `Bad request to Gemini: ${errorMsg}. Try a different model name (e.g. gemini-2.0-flash).`;
        } else if (response.status === 403 || response.status === 401) {
            errorMsg = `Gemini authentication failed. Check your API key in Settings.`;
        } else if (response.status === 404) {
            errorMsg = `Gemini model "${model}" not found. Check the model name in Settings.`;
        }

        return { success: false, error: errorMsg };
    }

    const data = await response.json();

    // Extract text from Gemini response
    const candidate = data.candidates?.[0];
    if (!candidate) {
        return { success: false, error: 'Gemini returned no candidates.' };
    }

    const text = candidate.content?.parts?.map((p: any) => p.text || '').join('') || '';
    if (!text.trim()) {
        const finishReason = candidate.finishReason;
        if (finishReason === 'SAFETY') {
            return { success: false, error: 'Gemini blocked the response due to safety filters.' };
        }
        return { success: false, error: 'Gemini returned an empty response.' };
    }

    return { success: true, content: text };
}

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

    // Model Management
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
        const apiKey = store.get('aiApiKey') || store.get('openAiApiKey');
        const model = store.get('aiModel') || store.get('modelName') || 'deepseek-reasoner';
        const baseUrl = store.get('aiBaseUrl') || 'https://api.deepseek.com';
        const provider = store.get('aiProvider') || 'deepseek';

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
            // ===== Google Gemini: Use native REST API =====
            const isGemini = provider === 'google' ||
                (baseUrl as string).includes('generativelanguage.googleapis.com');

            if (isGemini) {
                console.log(`[AI] Using Gemini native API (model=${model})`);
                return await callGeminiNative(
                    apiKey as string,
                    model as string,
                    systemPrompt,
                    formattedMessages
                );
            }

            // ===== All other providers: Use OpenAI SDK =====
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

        } catch (error: any) {
            console.error(`[AI] ${provider} API Error:`, error);

            let errorMsg = error.message || 'Failed to communicate with AI provider.';

            if (error.status === 401) {
                errorMsg = `Authentication failed. Please check your ${provider} API key in Settings.`;
            } else if (error.status === 404) {
                errorMsg = `Model "${model}" not found. Please check the model name in Settings.`;
            } else if (error.status === 400) {
                errorMsg = `Bad request to ${provider}: ${error.message}. Check model name and API key.`;
            } else if (error.code === 'ECONNREFUSED') {
                errorMsg = `Cannot connect to ${baseUrl}. Please check the Base URL in Settings.`;
            }

            return { success: false, error: errorMsg };
        }
    });
};
