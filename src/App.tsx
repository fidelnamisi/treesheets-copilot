
import { useState, useEffect, useRef } from 'react';
import type { Workspace, ChatSession, ChatMessage } from './shared/types';
import './App.css';

function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | undefined>();
  const [files, setFiles] = useState<{ name: string; path: string; relativePath: string; lastModified: number; size: number }[]>([]);

  // State for multiple selected files
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  // Store content of each file individually
  // Store content of each file individually
  const [filesContent, setFilesContent] = useState<Record<string, string>>({});

  // Chat State
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [primarySessionId, setPrimarySessionId] = useState<string | null>(null);
  const [secondarySessionId, setSecondarySessionId] = useState<string | null>(null); // For split view
  const [isSplitView, setIsSplitView] = useState(false);

  // Input State (Global or Per-Session? User requested persistent bottom input. 
  // But with split view, do we send to both? Usually split view implies comparing histories.
  // The user says "each with independent ... persistent bottom input".
  // Let's attach input state to the VIEW, not the session, but target the active session in that view.
  const [primaryInput, setPrimaryInput] = useState('');
  const [secondaryInput, setSecondaryInput] = useState('');
  const [isSendingPrimary, setIsSendingPrimary] = useState(false);
  const [isSendingSecondary, setIsSendingSecondary] = useState(false);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [settingsProvider, setSettingsProvider] = useState('deepseek');
  const [settingsApiKey, setSettingsApiKey] = useState('');
  const [settingsModel, setSettingsModel] = useState('deepseek-reasoner');
  const [settingsBaseUrl, setSettingsBaseUrl] = useState('https://api.deepseek.com');

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; filePath: string; fileName: string } | null>(null);

  // Provider presets (mirrored from types for UI use)
  const providerPresets: Record<string, { label: string; baseUrl: string; defaultModel: string; placeholder: string }> = {
    deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-reasoner', placeholder: 'sk-...' },
    openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o', placeholder: 'sk-...' },
    anthropic: { label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-sonnet-4-20250514', placeholder: 'sk-ant-...' },
    google: { label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', defaultModel: 'gemini-2.0-flash', placeholder: 'AIzaSy...' },
    custom: { label: 'Custom (OpenAI-compatible)', baseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3', placeholder: 'API key...' },
  };
  const primaryEndRef = useRef<HTMLDivElement>(null);
  const secondaryEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  // Scroll to bottom
  useEffect(() => {
    primaryEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [primarySessionId, chatSessions, isSendingPrimary]);

  useEffect(() => {
    secondaryEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [secondarySessionId, chatSessions, isSendingSecondary]);

  // Load Workspace State
  useEffect(() => {
    if (activeWorkspaceId) {
      const ws = workspaces.find(w => w.id === activeWorkspaceId);
      if (ws) {
        (async () => {
          const savedState = await window.electronAPI.loadWorkspaceState(ws.id);
          if (savedState) {
            if (savedState.selectedFilePaths) setSelectedFiles(savedState.selectedFilePaths);
            if (savedState.chatSessions) setChatSessions(savedState.chatSessions);
            if (savedState.lastActiveSessionId) {
              // If the saved ID is valid, use it
              if (savedState.chatSessions.some((s: ChatSession) => s.id === savedState.lastActiveSessionId)) {
                setPrimarySessionId(savedState.lastActiveSessionId);
              }
            }
          }
          loadFiles(ws.path);
          window.electronAPI.startWatching(ws.path);
        })();

        const unsubscribe = window.electronAPI.onFileChanged((data) => {
          console.log('File changed:', data);
          loadFiles(ws.path);
          if (data.type === 'change' && selectedFiles.includes(data.path)) {
            loadFileContent(data.path);
          }
        });

        return () => {
          window.electronAPI.stopWatching();
          unsubscribe();
        };
      }
    } else {
      setFiles([]);
      setSelectedFiles([]);
      setFilesContent({});
      setChatSessions([]);
      setPrimarySessionId(null);
      setSecondarySessionId(null);
      setIsSplitView(false);
    }
  }, [activeWorkspaceId]);

  // Load Content
  useEffect(() => {
    selectedFiles.forEach(path => {
      if (!filesContent[path]) {
        loadFileContent(path);
      }
    });
  }, [selectedFiles]);

  // Save State
  useEffect(() => {
    if (activeWorkspaceId) {
      window.electronAPI.saveWorkspaceState(activeWorkspaceId, {
        selectedFilePaths: selectedFiles,
        chatSessions: chatSessions,
        lastActiveSessionId: primarySessionId || undefined
      });
    }
  }, [selectedFiles, chatSessions, primarySessionId, activeWorkspaceId]);

  const createNewSession = (originData?: { parentId: string, messages: ChatMessage[], branchPointId: string }) => {
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: originData ? `Branch from ${chatSessions.find(s => s.id === originData.parentId)?.title}` : `Chat ${chatSessions.length + 1}`,
      messages: originData ? [...originData.messages] : [],
      createdAt: Date.now(),
      lastModified: Date.now(),
      parentId: originData?.parentId,
      branchPointMessageId: originData?.branchPointId
    };
    setChatSessions(prev => [...prev, newSession]);
    return newSession;
  };

  const handleBranchFromMessage = (sessionId: string, messageId: string) => {
    const session = chatSessions.find(s => s.id === sessionId);
    if (!session) return;

    const msgIndex = session.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const historyToKeep = session.messages.slice(0, msgIndex + 1);
    const newSession = createNewSession({
      parentId: sessionId,
      messages: historyToKeep,
      branchPointId: messageId
    });

    // Auto-switch to new branch
    if (sessionId === primarySessionId) setPrimarySessionId(newSession.id);
    else setSecondarySessionId(newSession.id);
  };

  const loadFileContent = async (path: string) => {
    try {
      const result = await window.electronAPI.parseCtsFile(path);
      if (result.success && result.content !== undefined) {
        setFilesContent(prev => ({ ...prev, [path]: result.content! }));
      } else {
        setFilesContent(prev => ({ ...prev, [path]: `Error parsing file: ${result.error}` }));
      }
    } catch (error) {
      setFilesContent(prev => ({ ...prev, [path]: 'Failed to load file content.' }));
    } finally {
      // Done
    }
  };

  const loadFiles = async (path: string) => {
    try {
      const workspaceFiles = await window.electronAPI.scanWorkspaceFiles(path);
      setFiles(workspaceFiles);
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  };

  const loadWorkspaces = async () => {
    try {
      const data = await window.electronAPI.getWorkspaces();
      setWorkspaces(data);
      const lastActive = await window.electronAPI.getLastActiveWorkspace();
      if (lastActive) setActiveWorkspaceId(lastActive);
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    }
  };

  const sendMessage = async (sessionId: string, content: string, setSending: (v: boolean) => void, setInput: (v: string) => void) => {
    if (!content.trim()) return;

    // Check Key
    const storedKey = await window.electronAPI.getApiKey();
    if (!storedKey) {
      setShowSettings(true);
      return;
    }

    let targetSessionId = sessionId;
    if (!targetSessionId) {
      const s = createNewSession();
      targetSessionId = s.id;
      setPrimarySessionId(s.id); // Default to primary if creating generic
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content,
      timestamp: Date.now()
    };

    const session = chatSessions.find(s => s.id === targetSessionId);
    const currentMsgs = session ? session.messages : [];
    const newMessages = [...currentMsgs, userMsg];

    // Update local state immediately
    updateSessionMessages(targetSessionId, newMessages);
    setInput('');
    setSending(true);

    const activeContext = selectedFiles.map(path => {
      const file = files.find(f => f.path === path);
      const c = filesContent[path] || '';
      return `--- File: ${file?.name} ---\n${c}\n`;
    }).join('\n');

    try {
      const response = await window.electronAPI.sendChat(newMessages, activeContext);
      if (response.success && response.content) {
        const aiMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.content,
          timestamp: Date.now()
        };
        updateSessionMessages(targetSessionId, [...newMessages, aiMsg]);
      } else {
        alert(`Error: ${response.error}`);
      }
    } catch (err) {
      alert('Failed to send.');
    } finally {
      setSending(false);
    }
  };

  const updateSessionMessages = (sessionId: string, msgs: ChatMessage[]) => {
    setChatSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: msgs, lastModified: Date.now() } : s));
  };

  const renameSession = (sessionId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    setChatSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: newTitle.trim() } : s));
  };

  const handleImportFile = async () => {
    if (!activeWorkspaceId) return;
    const ws = workspaces.find(w => w.id === activeWorkspaceId);
    if (!ws) return;

    const success = await window.electronAPI.importFile(ws.path);
    if (success) {
      loadFiles(ws.path);
    }
  };

  const handleAddWorkspace = async () => {
    try {
      const dir = await window.electronAPI.selectDirectory();
      if (!dir) return;

      if (workspaces.some(w => w.path === dir.path)) {
        alert('Workspace already exists for this directory.');
        return;
      }

      await window.electronAPI.addWorkspace({
        name: dir.name,
        path: dir.path
      });
      await loadWorkspaces();
    } catch (error) {
      console.error('Failed to add workspace:', error);
    }
  };

  const handleFileContextMenu = (e: React.MouseEvent, filePath: string, fileName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, filePath, fileName });
  };

  const handleOpenFileNative = async () => {
    if (!contextMenu) return;
    await window.electronAPI.openFileNative(contextMenu.filePath);
    setContextMenu(null);
  };

  const handleExportChat = async (sessionId: string | null) => {
    if (!sessionId) return;
    const session = chatSessions.find(s => s.id === sessionId);
    if (!session) return;

    let md = `# ${session.title}\n\n`;
    md += `Exported: ${new Date().toLocaleString()}\n\n---\n\n`;
    for (const msg of session.messages) {
      const role = msg.role === 'user' ? '**USER**' : '**ASSISTANT**';
      const time = new Date(msg.timestamp).toLocaleString();
      md += `### ${role} — ${time}\n\n${msg.content}\n\n---\n\n`;
    }

    await window.electronAPI.exportChat({ title: session.title, content: md });
  };

  return (
    <div className="app-container" onClick={() => setContextMenu(null)}>
      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>AI Provider Settings</h2>
            <div className="form-group">
              <label>Provider</label>
              <select
                value={settingsProvider}
                onChange={(e) => {
                  const p = e.target.value;
                  setSettingsProvider(p);
                  const preset = providerPresets[p];
                  if (preset) {
                    setSettingsBaseUrl(preset.baseUrl);
                    setSettingsModel(preset.defaultModel);
                  }
                }}
              >
                {Object.entries(providerPresets).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>API Key</label>
              <input
                type="password"
                value={settingsApiKey}
                onChange={(e) => setSettingsApiKey(e.target.value)}
                placeholder={providerPresets[settingsProvider]?.placeholder || 'API key...'}
              />
            </div>
            <div className="form-group">
              <label>Model</label>
              <input
                type="text"
                value={settingsModel}
                onChange={(e) => setSettingsModel(e.target.value)}
                placeholder="Model name"
              />
            </div>
            <div className="form-group">
              <label>Base URL</label>
              <input
                type="text"
                value={settingsBaseUrl}
                onChange={(e) => setSettingsBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
              />
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowSettings(false)}>Cancel</button>
              <button className="primary" onClick={async () => {
                await window.electronAPI.setAiConfig({
                  provider: settingsProvider,
                  apiKey: settingsApiKey,
                  model: settingsModel,
                  baseUrl: settingsBaseUrl
                });
                setShowSettings(false);
              }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar - Workspace & Files */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>Workspaces</h2>
          <button onClick={handleAddWorkspace} className="add-btn">+</button>
        </div>
        <ul className="workspace-list">
          {workspaces.map(ws => (
            <li key={ws.id} className={`workspace-item ${activeWorkspaceId === ws.id ? 'active' : ''}`} onClick={() => {
              setActiveWorkspaceId(ws.id);
              window.electronAPI.setLastActiveWorkspace(ws.id);
              setSelectedFiles([]);
              setFilesContent({});
              setChatSessions([]);
              setPrimarySessionId(null);
            }}>
              <div className="workspace-info">
                <span className="workspace-name">{ws.name}</span>
              </div>
              <button className="remove-btn" onClick={async (e) => {
                e.stopPropagation();
                if (confirm('Remove workspace?')) {
                  await window.electronAPI.removeWorkspace(ws.id);
                  if (activeWorkspaceId === ws.id) setActiveWorkspaceId(undefined);
                  loadWorkspaces();
                }
              }}>×</button>
            </li>
          ))}
        </ul>

        {activeWorkspaceId && (
          <div className="files-section">
            <div className="sidebar-header">
              <h3>Files</h3>
              <button onClick={handleImportFile} className="add-btn" title="Import .cts file">Import</button>
            </div>
            <div className="file-list-scroll">
              {files.map(file => (
                <div
                  key={file.path}
                  className={`file-item ${selectedFiles.includes(file.path) ? 'selected-context' : ''}`}
                  onClick={() => {
                    setSelectedFiles(prev => prev.includes(file.path) ? prev.filter(p => p !== file.path) : [...prev, file.path]);
                  }}
                  onContextMenu={(e) => handleFileContextMenu(e, file.path, file.name)}
                >
                  <span className="file-icon">📄</span>
                  <span className="file-name">{file.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="sidebar-footer">
          <button onClick={async () => {
            const config = await window.electronAPI.getAiConfig();
            setSettingsProvider(config.provider || 'deepseek');
            setSettingsApiKey(config.apiKey || '');
            setSettingsModel(config.model || 'deepseek-reasoner');
            setSettingsBaseUrl(config.baseUrl || 'https://api.deepseek.com');
            setShowSettings(true);
          }} >⚙️ Settings</button>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-item" onClick={handleOpenFileNative}>
            🔗 Open in Native App
          </div>
          <div className="context-menu-item" onClick={() => {
            setSelectedFiles(prev => prev.includes(contextMenu.filePath) ? prev : [...prev, contextMenu.filePath]);
            setContextMenu(null);
          }}>
            📎 Add to Context
          </div>
          <div className="context-menu-item" onClick={() => {
            setSelectedFiles(prev => prev.filter(p => p !== contextMenu.filePath));
            setContextMenu(null);
          }}>
            ✕ Remove from Context
          </div>
        </div>
      )}

      {/* Main Content - Split Chat View */}
      <div className="main-content" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Top Bar for Split View Toggle */}
        {activeWorkspaceId && (
          <div className="view-controls" style={{ padding: '0.5rem', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'flex-end', gap: '1rem', background: '#1e1e1e' }}>
            <button
              onClick={() => setIsSplitView(!isSplitView)}
              style={{ background: isSplitView ? '#007acc' : '#333', color: 'white', border: 'none', padding: '0.3rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}
            >
              {isSplitView ? 'Single View' : 'Split View'}
            </button>
          </div>
        )}

        <div className="chat-panes" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Primary Pane */}
          {activeWorkspaceId ? (
            <ChatPane
              sessionId={primarySessionId}
              onChangeSession={setPrimarySessionId}
              sessions={chatSessions}
              onCreateSession={() => { const s = createNewSession(); setPrimarySessionId(s.id); }}
              messages={chatSessions.find(s => s.id === primarySessionId)?.messages || []}
              onSendMessage={(content: string) => sendMessage(primarySessionId!, content, setIsSendingPrimary, setPrimaryInput)}
              inputValue={primaryInput}
              onInputChange={setPrimaryInput}
              isSending={isSendingPrimary}
              endRef={primaryEndRef}
              contextCount={selectedFiles.length}
              onBranch={(msgId: string) => handleBranchFromMessage(primarySessionId!, msgId)}
              onRenameSession={renameSession}
              contextFiles={files.filter(f => selectedFiles.includes(f.path))}
              onExportChat={() => handleExportChat(primarySessionId)}
            />
          ) : (
            <div className="empty-state">Select a workspace</div>
          )}

          {/* Secondary Pane */}
          {activeWorkspaceId && isSplitView && (
            <div style={{ width: '1px', background: '#333' }}></div>
          )}

          {activeWorkspaceId && isSplitView && (
            <ChatPane
              sessionId={secondarySessionId}
              onChangeSession={setSecondarySessionId}
              sessions={chatSessions}
              onCreateSession={() => { const s = createNewSession(); setSecondarySessionId(s.id); }}
              messages={chatSessions.find(s => s.id === secondarySessionId)?.messages || []}
              onSendMessage={(content: string) => sendMessage(secondarySessionId!, content, setIsSendingSecondary, setSecondaryInput)}
              inputValue={secondaryInput}
              onInputChange={setSecondaryInput}
              isSending={isSendingSecondary}
              endRef={secondaryEndRef}
              contextCount={selectedFiles.length}
              onBranch={(msgId: string) => handleBranchFromMessage(secondarySessionId!, msgId)}
              onRenameSession={renameSession}
              contextFiles={files.filter(f => selectedFiles.includes(f.path))}
              onExportChat={() => handleExportChat(secondarySessionId)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Sub-component for Chat Pane with rename, @-autocomplete, export and copy support
const ChatPane = ({
  sessionId, onChangeSession, sessions, onCreateSession,
  messages, onSendMessage, inputValue, onInputChange, isSending, endRef, contextCount, onBranch,
  onRenameSession, contextFiles, onExportChat
}: any) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showAtMenu, setShowAtMenu] = useState(false);
  const [atFilter, setAtFilter] = useState('');
  const [atMenuIndex, setAtMenuIndex] = useState(0);
  const [atTriggerPos, setAtTriggerPos] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const currentSession = sessions.find((s: any) => s.id === sessionId);

  const startRenaming = () => {
    if (!currentSession) return;
    setRenameValue(currentSession.title);
    setIsRenaming(true);
    setTimeout(() => renameInputRef.current?.focus(), 50);
  };

  const commitRename = () => {
    if (sessionId && renameValue.trim()) {
      onRenameSession(sessionId, renameValue);
    }
    setIsRenaming(false);
  };

  // @ autocomplete logic
  const filteredFiles = (contextFiles || []).filter((f: any) =>
    f.name.toLowerCase().includes(atFilter.toLowerCase())
  );

  const handleInputChange = (val: string) => {
    onInputChange(val);

    // Check for @ trigger
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = val.substring(0, cursorPos);
    const lastAt = textBeforeCursor.lastIndexOf('@');

    if (lastAt >= 0) {
      // Check that there's no space between @ and cursor (allowing partial file name)
      const afterAt = textBeforeCursor.substring(lastAt + 1);
      if (!afterAt.includes(' ') && !afterAt.includes('\n')) {
        setShowAtMenu(true);
        setAtFilter(afterAt);
        setAtTriggerPos(lastAt);
        setAtMenuIndex(0);
        return;
      }
    }
    setShowAtMenu(false);
    setAtTriggerPos(-1);
  };

  const insertFileRef = (fileName: string) => {
    if (atTriggerPos < 0) return;
    const before = inputValue.substring(0, atTriggerPos);
    const textarea = textareaRef.current;
    const cursorPos = textarea ? textarea.selectionStart : inputValue.length;
    const after = inputValue.substring(cursorPos);
    const newVal = before + '@' + fileName + ' ' + after;
    onInputChange(newVal);
    setShowAtMenu(false);
    setAtTriggerPos(-1);
    // Return focus to textarea
    setTimeout(() => {
      textareaRef.current?.focus();
      const newCursorPos = before.length + 1 + fileName.length + 1;
      textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
    }, 30);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showAtMenu && filteredFiles.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAtMenuIndex(prev => Math.min(prev + 1, filteredFiles.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAtMenuIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertFileRef(filteredFiles[atMenuIndex].name);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAtMenu(false);
        return;
      }
    }

    // Normal enter = send
    if (e.key === 'Enter' && !e.shiftKey && !showAtMenu) {
      e.preventDefault();
      onSendMessage(inputValue);
    }
  };

  return (
    <div className="chat-pane">
      <div className="chat-header">
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setIsRenaming(false);
            }}
          />
        ) : (
          <select
            value={sessionId || ''}
            onChange={(e) => onChangeSession(e.target.value)}
            className="chat-select"
          >
            <option value="" disabled>Select Chat...</option>
            {sessions.map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        )}
        {sessionId && !isRenaming && (
          <button onClick={startRenaming} className="chat-header-btn" title="Rename this chat session">✏️</button>
        )}
        {sessionId && messages.length > 0 && (
          <button onClick={onExportChat} className="chat-header-btn" title="Export this chat as a Markdown file">📤</button>
        )}
        <button onClick={onCreateSession} className="chat-header-btn" title="Start a new chat session">+</button>
      </div>

      <div className="messages-area">
        {messages.length === 0 && <div className="empty-chat">No messages. Context: {contextCount} files. Type @ to reference a file.</div>}
        {messages.map((msg: any) => (
          <div key={msg.id} className="message-container">
            <div className={`message-bubble ${msg.role}`}>
              <div className="message-meta">
                <span>{msg.role.toUpperCase()}</span>
                <button onClick={() => onBranch(msg.id)} className="branch-btn" title="Branch from here">⑂ Branch</button>
              </div>
              <div className="message-text">{msg.content}</div>
              <div className="message-actions">
                <button
                  className={`copy-btn ${copiedId === msg.id ? 'copied' : ''}`}
                  title="Copy message"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(msg.content);
                      setCopiedId(msg.id);
                      setTimeout(() => setCopiedId(null), 2000);
                    } catch { /* fallback */ }
                  }}
                >{copiedId === msg.id ? '✓ Copied' : '📋'}</button>
              </div>
            </div>
          </div>
        ))}
        {isSending && <div className="thinking-indicator">AI is thinking...</div>}
        <div ref={endRef} />
      </div>

      <div className="input-area">
        <div className="input-row">
          <div className="textarea-wrapper">
            {showAtMenu && filteredFiles.length > 0 && (
              <div className="at-autocomplete">
                {filteredFiles.map((f: any, i: number) => (
                  <div
                    key={f.path}
                    className={`at-item ${i === atMenuIndex ? 'active' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); insertFileRef(f.name); }}
                  >
                    📄 {f.name}
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... Use @ to reference files"
              className="chat-textarea"
            />
          </div>
          <button
            onClick={() => onSendMessage(inputValue)}
            disabled={isSending}
            className="send-btn"
          >Send</button>
        </div>
      </div>
    </div>
  );
};

export default App;
