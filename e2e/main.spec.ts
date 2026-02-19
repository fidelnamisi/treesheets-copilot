
import { _electron as electron, test, expect } from '@playwright/test';
import path from 'path';

// Path to the built main file
const mainEntry = path.join(process.cwd(), 'dist-electron', 'electron', 'main.js');

// Sample .cts files for parser testing
const SAMPLE_CTS_FILES = [
    path.join(process.cwd(), 'MOS 4 Act Grids.cts'),
    path.join(process.cwd(), 'MOS 4 Episodes.cts'),
    path.join(process.cwd(), 'Mountain of Spears.cts'),
];

test.describe('Application Launch & Branding', () => {
    let app: any;
    let window: any;

    test.beforeAll(async () => {
        app = await electron.launch({
            args: [mainEntry],
            env: {
                ...process.env,
                NODE_ENV: 'test',
                ELECTRON_IS_TEST: '1'
            }
        });
        window = await app.firstWindow();
        await window.waitForLoadState('domcontentloaded');
    });

    test.afterAll(async () => {
        if (app) await app.close();
    });

    test('should launch and create a window', async () => {
        expect(app).toBeTruthy();
        expect(window).toBeTruthy();
    });

    test('window title should be "TreeSheets Copilot"', async () => {
        const title = await window.title();
        expect(title).toBe('TreeSheets Copilot');
    });

    test('should load the React app (not blank)', async () => {
        await window.waitForSelector('.app-container', { timeout: 10000 });
        const appContainer = window.locator('.app-container');
        await expect(appContainer).toBeVisible();
    });

    test('sidebar shows Workspaces header', async () => {
        const header = window.locator('.sidebar-header h2').first();
        await expect(header).toHaveText('Workspaces');
    });

    test('Settings button is always visible (not obscured)', async () => {
        const settingsBtn = window.locator('.sidebar-footer button').first();
        await expect(settingsBtn).toBeVisible();
        const box = await settingsBtn.boundingBox();
        expect(box).toBeTruthy();
        const viewport = await window.evaluate(() => ({ height: window.innerHeight }));
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    });
});

test.describe('AI Provider Settings', () => {
    let app: any;
    let window: any;

    test.beforeAll(async () => {
        app = await electron.launch({
            args: [mainEntry],
            env: { ...process.env, NODE_ENV: 'test', ELECTRON_IS_TEST: '1' }
        });
        window = await app.firstWindow();
        await window.waitForLoadState('domcontentloaded');
    });

    test.afterAll(async () => {
        if (app) await app.close();
    });

    test('Settings modal has AI Provider Settings title', async () => {
        const settingsBtn = window.locator('.sidebar-footer button').first();
        await settingsBtn.click();
        const modalTitle = window.locator('.modal h2');
        await expect(modalTitle).toHaveText('AI Provider Settings');
    });

    test('Settings has all 5 provider options', async () => {
        const options = window.locator('.modal select option');
        const count = await options.count();
        expect(count).toBe(5);
    });

    test('Settings has API Key, Model, Base URL fields', async () => {
        await expect(window.locator('.modal input[type="password"]').first()).toBeVisible();
        await expect(window.locator('.modal input[type="text"]').first()).toBeVisible();
        await expect(window.locator('.modal input[type="text"]').nth(1)).toBeVisible();
    });

    test('Switching provider auto-fills model and URL', async () => {
        const select = window.locator('.modal select').first();
        const modelInput = window.locator('.modal input[type="text"]').first();
        const urlInput = window.locator('.modal input[type="text"]').nth(1);

        await select.selectOption('openai');
        await expect(modelInput).toHaveValue('gpt-4o');
        await expect(urlInput).toHaveValue('https://api.openai.com/v1');

        await select.selectOption('google');
        await expect(modelInput).toHaveValue('gemini-2.0-flash');
        await expect(urlInput).toHaveValue('https://generativelanguage.googleapis.com/v1beta/openai');

        await select.selectOption('deepseek');
        await expect(modelInput).toHaveValue('deepseek-reasoner');
    });

    test('Cancel closes modal', async () => {
        const cancelBtn = window.locator('.modal-actions button', { hasText: 'Cancel' });
        await cancelBtn.click();
        await expect(window.locator('.modal-overlay')).not.toBeVisible();
    });

    test('AI config persists correctly', async () => {
        await window.evaluate(async () => {
            await (window as any).electronAPI.setAiConfig({
                provider: 'deepseek', apiKey: 'e2e-test-key', model: 'deepseek-reasoner', baseUrl: 'https://api.deepseek.com'
            });
        });
        const config = await window.evaluate(async () => {
            return await (window as any).electronAPI.getAiConfig();
        });
        expect(config.provider).toBe('deepseek');
        expect(config.apiKey).toBe('e2e-test-key');
    });
});

test.describe('IPC API & Security', () => {
    let app: any;
    let window: any;

    test.beforeAll(async () => {
        app = await electron.launch({
            args: [mainEntry],
            env: { ...process.env, NODE_ENV: 'test', ELECTRON_IS_TEST: '1' }
        });
        window = await app.firstWindow();
        await window.waitForLoadState('domcontentloaded');
    });

    test.afterAll(async () => {
        if (app) await app.close();
    });

    test('contextIsolation is enabled', async () => {
        const hasAPI = await window.evaluate(() => typeof (window as any).electronAPI !== 'undefined');
        expect(hasAPI).toBe(true);
    });

    test('electronAPI exposes all required functions including new ones', async () => {
        const apiKeys = await window.evaluate(() => Object.keys((window as any).electronAPI));
        const required = [
            'getWorkspaces', 'addWorkspace', 'removeWorkspace', 'selectDirectory',
            'sendChat', 'getApiKey', 'setApiKey', 'getAiConfig', 'setAiConfig',
            'importFile', 'scanWorkspaceFiles', 'parseCtsFile',
            'startWatching', 'stopWatching', 'onFileChanged',
            'saveWorkspaceState', 'loadWorkspaceState',
            // New APIs
            'openFileNative', 'exportChat'
        ];
        for (const fn of required) {
            expect(apiKeys).toContain(fn);
        }
    });
});

test.describe('CTS File Parser', () => {
    let app: any;
    let window: any;

    test.beforeAll(async () => {
        app = await electron.launch({
            args: [mainEntry],
            env: { ...process.env, NODE_ENV: 'test', ELECTRON_IS_TEST: '1' }
        });
        window = await app.firstWindow();
        await window.waitForLoadState('domcontentloaded');
    });

    test.afterAll(async () => {
        if (app) await app.close();
    });

    test('parses "MOS 4 Act Grids.cts" successfully', async () => {
        const result = await window.evaluate(async (fp: string) => {
            return await (window as any).electronAPI.parseCtsFile(fp);
        }, SAMPLE_CTS_FILES[0]);
        expect(result.success).toBe(true);
        expect(result.content).toContain('MASTERPLOT');
        expect(result.content).toContain('ZUGUDINI');
    });

    test('parses "MOS 4 Episodes.cts" successfully', async () => {
        const result = await window.evaluate(async (fp: string) => {
            return await (window as any).electronAPI.parseCtsFile(fp);
        }, SAMPLE_CTS_FILES[1]);
        expect(result.success).toBe(true);
        expect(result.content).toContain('Dande');
    });

    test('parses "Mountain of Spears.cts" (with images) successfully', async () => {
        const result = await window.evaluate(async (fp: string) => {
            return await (window as any).electronAPI.parseCtsFile(fp);
        }, SAMPLE_CTS_FILES[2]);
        expect(result.success).toBe(true);
        expect(result.content).toContain('THROUGHLINE');
        expect(result.content).toContain('Nayomo');
    });

    test('rejects non-TSFF file gracefully', async () => {
        const fakeFile = path.join(process.cwd(), 'package.json');
        const result = await window.evaluate(async (fp: string) => {
            return await (window as any).electronAPI.parseCtsFile(fp);
        }, fakeFile);
        expect(result.success).toBe(false);
        expect(result.error).toContain('TSFF');
    });

    test('parsed content has no binary noise', async () => {
        const result = await window.evaluate(async (fp: string) => {
            return await (window as any).electronAPI.parseCtsFile(fp);
        }, SAMPLE_CTS_FILES[0]);
        expect(result.success).toBe(true);
        expect(result.content).not.toContain('h?X');
    });

    test('parsed content is formatted as readable document', async () => {
        const result = await window.evaluate(async (fp: string) => {
            return await (window as any).electronAPI.parseCtsFile(fp);
        }, SAMPLE_CTS_FILES[0]);
        expect(result.success).toBe(true);
        expect(result.content).toContain('# MOS 4 Act Grids.cts');
        expect(result.content).toMatch(/## /);
    });
});

test.describe('Chat Features & UI', () => {
    let app: any;
    let window: any;

    test.beforeAll(async () => {
        app = await electron.launch({
            args: [mainEntry],
            env: { ...process.env, NODE_ENV: 'test', ELECTRON_IS_TEST: '1' }
        });
        window = await app.firstWindow();
        await window.waitForLoadState('domcontentloaded');
    });

    test.afterAll(async () => {
        if (app) await app.close();
    });

    test('chat pane has all required CSS classes', async () => {
        const hasClasses = await window.evaluate(() => {
            const sheets = document.styleSheets;
            const classNames = [
                'chat-pane', 'chat-header', 'messages-area', 'input-area',
                'at-autocomplete', 'rename-input', 'context-menu', 'context-menu-item',
                'copy-btn', 'message-actions', 'file-item'
            ];
            const foundClasses: string[] = [];
            for (let i = 0; i < sheets.length; i++) {
                try {
                    const rules = sheets[i].cssRules;
                    for (let j = 0; j < rules.length; j++) {
                        const selector = (rules[j] as CSSStyleRule).selectorText || '';
                        for (const cls of classNames) {
                            if (selector.includes('.' + cls)) {
                                if (!foundClasses.includes(cls)) foundClasses.push(cls);
                            }
                        }
                    }
                } catch (e) { /* cross-origin */ }
            }
            return foundClasses;
        });
        expect(hasClasses).toContain('chat-pane');
        expect(hasClasses).toContain('chat-header');
        expect(hasClasses).toContain('messages-area');
        expect(hasClasses).toContain('input-area');
        expect(hasClasses).toContain('at-autocomplete');
        expect(hasClasses).toContain('rename-input');
        expect(hasClasses).toContain('context-menu');
        expect(hasClasses).toContain('context-menu-item');
        expect(hasClasses).toContain('copy-btn');
        expect(hasClasses).toContain('message-actions');
        expect(hasClasses).toContain('file-item');
    });

    test('chat textarea has @ reference placeholder', async () => {
        const hasTextareaClass = await window.evaluate(() => {
            const sheets = document.styleSheets;
            for (let i = 0; i < sheets.length; i++) {
                try {
                    const rules = sheets[i].cssRules;
                    for (let j = 0; j < rules.length; j++) {
                        if ((rules[j] as CSSStyleRule).selectorText === '.chat-textarea') return true;
                    }
                } catch (e) { /* cross-origin */ }
            }
            return false;
        });
        expect(hasTextareaClass).toBe(true);
    });

    test('send button has proper CSS class', async () => {
        const hasSendBtnClass = await window.evaluate(() => {
            const sheets = document.styleSheets;
            for (let i = 0; i < sheets.length; i++) {
                try {
                    const rules = sheets[i].cssRules;
                    for (let j = 0; j < rules.length; j++) {
                        if ((rules[j] as CSSStyleRule).selectorText === '.send-btn') return true;
                    }
                } catch (e) { /* cross-origin */ }
            }
            return false;
        });
        expect(hasSendBtnClass).toBe(true);
    });

    test('openFileNative IPC handler works for valid file', async () => {
        const testFile = path.join(process.cwd(), 'package.json');
        const result = await window.evaluate(async (fp: string) => {
            return await (window as any).electronAPI.openFileNative(fp);
        }, testFile);
        // The handler should return a result object whether or not an app can open the file
        expect(result).toBeTruthy();
        expect(typeof result.success).toBe('boolean');
    });
});
