
import { useState, useEffect, useRef } from 'react';
import type { Workspace, ChatSession, ChatMessage, CustomModel } from './shared/types';
import './App.css';

function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | undefined>();
  const [files, setFiles] = useState<{ name: string; path: string; relativePath: string; lastModified: number; size: number }[]>([]);

  // State for multiple selected files
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  // Prevent sync override wipe when switching workspaces
  const isLoadingWorkspaceRef = useRef<string | null>(null);

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
  const [models, setModels] = useState<CustomModel[]>([]);
  const [activeModelId, setActiveModelId] = useState<string>('');
  const [editingModel, setEditingModel] = useState<CustomModel | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; filePath: string; fileName: string } | null>(null);

  // Provider presets (mirrored from types for UI use)
  const providerPresets: Record<string, { label: string; baseUrl: string; defaultModel: string; placeholder: string }> = {
    deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-reasoner', placeholder: 'sk-...' },
    openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o', placeholder: 'sk-...' },
    anthropic: { label: 'Anthropic', baseUrl: 'https://api.anthropic.com', defaultModel: 'claude-3-5-haiku-latest', placeholder: 'sk-ant-...' },
    google: { label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', defaultModel: 'gemini-2.0-flash', placeholder: 'AIzaSy...' },
    custom: { label: 'Custom (OpenAI-compatible)', baseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3', placeholder: 'API key...' },
  };
  const primaryEndRef = useRef<HTMLDivElement>(null);
  const secondaryEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadWorkspaces();
    loadModels();
  }, []);

  const loadModels = async () => {
    const loadedModels = await window.electronAPI.getModels();
    setModels(loadedModels);
    const active = await window.electronAPI.getActiveModel();
    if (active) setActiveModelId(active.id);
  };

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
      isLoadingWorkspaceRef.current = activeWorkspaceId;
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
          loadFiles(ws.referencedFiles || []);
          isLoadingWorkspaceRef.current = null;
        })();

        // File watching is disabled for arbitrary referenced files list right now, since they can be scattered across the drive.
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
    if (activeWorkspaceId && isLoadingWorkspaceRef.current !== activeWorkspaceId) {
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

  const loadFiles = async (filePaths: string[]) => {
    try {
      const workspaceFiles = await window.electronAPI.scanWorkspaceFiles(filePaths);
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
    if (!activeModelId && models.length === 0) {
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

    // Live refresh context files
    const freshContextPromises = selectedFiles.map(async (path) => {
      const file = files.find(f => f.path === path);
      try {
        const res = await window.electronAPI.parseCtsFile(path);
        const c = (res.success && res.content !== undefined) ? res.content : (filesContent[path] || '');
        return `--- File: ${file?.name} ---\n${c}\n`;
      } catch (e) {
        return `--- File: ${file?.name} ---\n[Error reading file]\n`;
      }
    });

    const loadedContexts = await Promise.all(freshContextPromises);
    const activeContext = loadedContexts.join('\n');

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

  const deleteSession = (sessionId: string) => {
    if (confirm('Are you sure you want to delete this chat branch completely?')) {
      setChatSessions(prev => prev.filter(s => s.id !== sessionId));
      if (primarySessionId === sessionId) setPrimarySessionId(null);
      if (secondarySessionId === sessionId) setSecondarySessionId(null);
    }
  };

  const handleImportFile = async () => {
    if (!activeWorkspaceId) return;
    const ws = workspaces.find(w => w.id === activeWorkspaceId);
    if (!ws) return;

    const filePaths = await window.electronAPI.importFile();
    if (filePaths && filePaths.length > 0) {
      const activeWs = { ...ws, referencedFiles: [...(ws.referencedFiles || []), ...filePaths] };
      setWorkspaces(prev => prev.map(w => w.id === ws.id ? activeWs : w));
      await window.electronAPI.saveWorkspaceState(ws.id, { referencedFiles: activeWs.referencedFiles });
      loadFiles(activeWs.referencedFiles || []);
    }
  };

  const handleAddWorkspace = async () => {
    try {
      const newWs = await window.electronAPI.createWorkspace();
      if (!newWs) return;

      await loadWorkspaces();
      setActiveWorkspaceId(newWs.id);
      window.electronAPI.setLastActiveWorkspace(newWs.id);
    } catch (error) {
      console.error('Failed to add workspace:', error);
    }
  };

  const handleOpenWorkspace = async () => {
    try {
      const openedWs = await window.electronAPI.openWorkspace();
      if (!openedWs) return;

      await loadWorkspaces();
      setActiveWorkspaceId(openedWs.id);
      window.electronAPI.setLastActiveWorkspace(openedWs.id);
    } catch (error) {
      console.error('Failed to open workspace:', error);
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
          <div className="modal settings-modal" style={{ maxWidth: '600px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>AI Models</h2>
              <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
            </div>

            {!editingModel ? (
              <>
                <div className="model-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                  {models.length === 0 && <div style={{ color: '#aaa' }}>No models added yet.</div>}
                  {models.map(m => (
                    <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#333', padding: '0.5rem 1rem', borderRadius: '4px' }}>
                      <div>
                        <strong>{m.name}</strong> <span style={{ fontSize: '0.8rem', color: '#aaa', marginLeft: '0.5rem' }}>({providerPresets[m.provider]?.label || m.provider})</span>
                        <div style={{ fontSize: '0.8rem', color: '#888' }}>{m.model}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }} onClick={() => setEditingModel(m)}>Edit</button>
                        <button style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem', background: '#d32f2f' }}
                          onClick={async () => {
                            if (confirm('Delete model?')) {
                              await window.electronAPI.deleteModel(m.id);
                              loadModels();
                            }
                          }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="primary" onClick={() => setEditingModel({ id: crypto.randomUUID(), name: 'New Model', provider: 'deepseek', apiKey: '', model: 'deepseek-reasoner', baseUrl: 'https://api.deepseek.com' as any })}>+ Add Model</button>
              </>
            ) : (
              <div className="model-editor">
                <div className="form-group">
                  <label>Model Name (alias)</label>
                  <input type="text" value={editingModel.name} onChange={e => setEditingModel({ ...editingModel, name: e.target.value })} placeholder="e.g. My Llama3" />
                </div>
                <div className="form-group">
                  <label>Provider API Type</label>
                  <select
                    value={editingModel.provider}
                    onChange={(e) => {
                      const p = e.target.value as any;
                      const preset = providerPresets[p];
                      if (preset) {
                        setEditingModel({ ...editingModel, provider: p, baseUrl: preset.baseUrl, model: preset.defaultModel });
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
                    value={editingModel.apiKey}
                    onChange={(e) => setEditingModel({ ...editingModel, apiKey: e.target.value })}
                    placeholder={providerPresets[editingModel.provider]?.placeholder || 'API key...'}
                  />
                </div>
                <div className="form-group">
                  <label>Model Name</label>
                  <input
                    type="text"
                    value={editingModel.model}
                    onChange={(e) => setEditingModel({ ...editingModel, model: e.target.value })}
                    placeholder="e.g. gpt-4, gemini-2.0-flash..."
                  />
                </div>
                <div className="form-group">
                  <label>Base URL</label>
                  <input
                    type="text"
                    value={editingModel.baseUrl}
                    onChange={(e) => setEditingModel({ ...editingModel, baseUrl: e.target.value })}
                    placeholder="https://api.example.com/v1"
                  />
                </div>
                <div className="modal-actions" style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditingModel(null)}>Cancel</button>
                  <button className="primary" onClick={async () => {
                    await window.electronAPI.saveModel(editingModel);
                    await window.electronAPI.setActiveModel(editingModel.id);
                    setActiveModelId(editingModel.id);
                    setEditingModel(null);
                    loadModels();
                  }}>Save Model</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sidebar - Workspace & Files */}
      <div className="sidebar">
        <div className="sidebar-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
          <h2>Workspaces</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleAddWorkspace} className="add-btn" style={{ fontSize: '0.9rem', border: '1px solid #444', borderRadius: '4px', padding: '0.2rem 0.5rem' }}>New Workspace</button>
            <button onClick={handleOpenWorkspace} className="add-btn" style={{ fontSize: '0.9rem', border: '1px solid #444', borderRadius: '4px', padding: '0.2rem 0.5rem' }}>Open Workspace</button>
          </div>
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
              <button onClick={handleImportFile} className="add-btn" title="Add File(s)">+</button>
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
          <button onClick={() => {
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
          <div className="context-menu-item" style={{ color: '#ff4d4f' }} onClick={async () => {
            const pathToRemove = contextMenu.filePath;
            setContextMenu(null);
            if (confirm('Are you sure you want to remove this file from the workspace reference?')) {
              setSelectedFiles(prev => prev.filter(p => p !== pathToRemove));
              if (activeWorkspaceId) {
                const ws = workspaces.find(w => w.id === activeWorkspaceId);
                if (ws) {
                  const newRefs = (ws.referencedFiles || []).filter(p => p !== pathToRemove);
                  const activeWs = { ...ws, referencedFiles: newRefs };
                  setWorkspaces(prev => prev.map(w => w.id === ws.id ? activeWs : w));
                  await window.electronAPI.saveWorkspaceState(ws.id, { referencedFiles: newRefs });
                  loadFiles(newRefs);
                }
              }
            }
          }}>
            ✕ Remove from Workspace
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
              onDeleteSession={deleteSession}
              contextFiles={files.filter(f => selectedFiles.includes(f.path))}
              onExportChat={() => handleExportChat(primarySessionId)}
              models={models}
              activeModelId={activeModelId}
              onModelChange={async (id: string) => {
                setActiveModelId(id);
                await window.electronAPI.setActiveModel(id);
              }}
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
              onDeleteSession={deleteSession}
              contextFiles={files.filter(f => selectedFiles.includes(f.path))}
              onExportChat={() => handleExportChat(secondarySessionId)}
              models={models}
              activeModelId={activeModelId}
              onModelChange={async (id: string) => {
                setActiveModelId(id);
                await window.electronAPI.setActiveModel(id);
              }}
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
  onRenameSession, onDeleteSession, contextFiles, onExportChat, models, activeModelId, onModelChange
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
          <button onClick={startRenaming} className="chat-header-btn" title="Rename Chat Branch">✏️</button>
        )}
        {sessionId && messages.length > 0 && (
          <button onClick={onExportChat} className="chat-header-btn" title="Export Chat to Markdown">📤</button>
        )}
        {sessionId && (
          <button onClick={() => onDeleteSession(sessionId)} className="chat-header-btn" title="Delete Chat Branch" style={{ color: '#ff4d4f' }}>🗑️</button>
        )}
        <button onClick={onCreateSession} className="chat-header-btn" title="New Chat Branch">+</button>
      </div>

      {contextFiles && contextFiles.length > 0 && (
        <div className="context-files-bar" style={{ display: 'flex', gap: '0.5rem', background: '#252526', padding: '0.4rem 0.8rem', borderBottom: '1px solid #333', overflowX: 'auto', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: '#888', marginRight: '0.2rem', flexShrink: 0 }}>Context:</span>
          {contextFiles.map((file: any) => (
            <span key={file.path} style={{ background: '#007acc', color: 'white', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
              {file.name}
            </span>
          ))}
        </div>
      )}

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
        <div className="input-row" style={{ alignItems: 'flex-start' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <select
              className="model-select"
              value={activeModelId || ''}
              onChange={(e) => onModelChange(e.target.value)}
              style={{
                padding: '0.4rem', borderRadius: '4px', background: '#333',
                color: '#fff', border: '1px solid #444', fontSize: '0.8rem',
                width: '120px'
              }}
            >
              <option value="" disabled>Select Model</option>
              {models?.map((m: any) => <option key={m.id} value={m.id} title={m.name}>{m.name.length > 15 ? m.name.substring(0, 15) + '...' : m.name}</option>)}
            </select>
            <button
              onClick={() => onSendMessage(inputValue)}
              disabled={isSending}
              className="send-btn"
              style={{ height: '100%', minHeight: '40px' }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
