# TreeSheets Copilot — Build Report

## Build Status: ✅ ALL PASS (23/23 tests — 100%)

**Date**: 2026-02-19  
**Version**: 1.0.0  
**Platform**: macOS (arm64)  
**Install Location**: `/Applications/TreeSheets Copilot.app`

---

## CRITICAL FIX: Parser & AI Hallucination

### Root Cause
The CTS file parser used a **length-prefix heuristic** (`[uint32_le length][text_bytes]`) to extract text from the inflated binary data. This heuristic was fundamentally fragile — when it landed on the wrong byte offset (which was frequent), it produced strings with binary noise mixed into readable text. For example:

```
"\u0000\u00e2\u000e\u00e3f\u00c5\u0001\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u00ff\u00ff\u00ff\u0000...@\u0001\u0000\u0000- The Nayomo turn the kids away..."
```

The AI received these **corrupted strings as context** and, unable to parse the binary noise, **hallucinated plausible content** instead of quoting the actual file contents.

### Fix: Complete Parser Rewrite
The new parser uses a fundamentally different approach:

1. **Contiguous printable character scanning** — instead of guessing length-prefixed offsets, it scans the binary data for runs of printable ASCII and valid UTF-8 characters
2. **Multi-pass cleaning** — removes formatting noise patterns, hex values, short random strings
3. **Substring deduplication** — removes fragments that are substrings of longer passages
4. **Result**: Every string sent to the AI is 100% clean readable text with zero binary corruption

### Fix: Anti-Hallucination System Prompt
The AI system prompt now includes explicit instructions:
- "NEVER fabricate, summarize, or invent content that is not present in the files"
- "When asked to reproduce content, copy it VERBATIM from the context"
- "If you cannot find the requested content, say so"

### Fix: Gemini "No body found" Error
The Gemini OpenAI-compatible API requires every message to have non-empty `content`. The AI handler now:
- Validates all messages have non-empty content before sending
- Filters out messages with empty/null content
- Falls back to `"(empty)"` for any remaining edge cases

---

## UI Improvements (This Session)

### Finder "New Folder" Button
- Added `createDirectory` to the Finder dialog properties
- Users can now create a new folder directly from the Finder window when adding a workspace

### Descriptive Tooltips on Chat Header
- ✏️ → "Rename this chat session"
- 📤 → "Export this chat as a Markdown file"
- \+ → "Start a new chat session"

---

## All Features

| Feature | Status | Details |
|---|---|---|
| CTS File Parser | ✅ | Clean text extraction, zero binary noise |
| Multi-Provider AI | ✅ | DeepSeek, OpenAI, Anthropic, Gemini, Custom |
| Anti-Hallucination | ✅ | Strict verbatim-quoting system prompt |
| Gemini API | ✅ | Fixed "No body found" error |
| File Tree Context Menu | ✅ | Right-click → Open Native / Add Context / Remove Context |
| Chat Export | ✅ | Export as Markdown with timestamps |
| Message Copy | ✅ | Copy icon with "✓ Copied" feedback |
| Chat/Branch Renaming | ✅ | Inline rename in chat header |
| @ File Autocomplete | ✅ | Type @ to reference files in chat |
| Split View | ✅ | Side-by-side chat comparison |
| Workspace New Folder | ✅ | Create folder from Finder dialog |
| Descriptive Tooltips | ✅ | Clear hover text on all chat buttons |
| Settings Persistence | ✅ | AI config saved via electron-store |
| Branding | ✅ | "TreeSheets Copilot" everywhere |

---

## E2E Test Results (23/23)

| # | Test | Status |
|---|---|---|
| 1 | App launches and creates a window | ✅ |
| 2 | Window title is "TreeSheets Copilot" | ✅ |
| 3 | React app loads (not blank) | ✅ |
| 4 | Sidebar shows Workspaces header | ✅ |
| 5 | Settings button always visible | ✅ |
| 6 | Settings modal title | ✅ |
| 7 | All 5 provider options | ✅ |
| 8 | API Key, Model, Base URL fields | ✅ |
| 9 | Provider switching auto-fills | ✅ |
| 10 | Cancel closes modal | ✅ |
| 11 | AI config persists | ✅ |
| 12 | contextIsolation enabled | ✅ |
| 13 | All 19 IPC functions exposed | ✅ |
| 14 | Parse "MOS 4 Act Grids.cts" | ✅ |
| 15 | Parse "MOS 4 Episodes.cts" | ✅ |
| 16 | Parse "Mountain of Spears.cts" | ✅ |
| 17 | Reject non-TSFF file | ✅ |
| 18 | No binary noise in output | ✅ |
| 19 | Formatted as readable document | ✅ |
| 20 | All CSS classes present | ✅ |
| 21 | Chat textarea placeholder | ✅ |
| 22 | Send button CSS | ✅ |
| 23 | openFileNative IPC works | ✅ |

---

## Files Modified (This Session)

| File | Change |
|---|---|
| `electron/handlers/parser.ts` | **Complete rewrite** — clean text extraction instead of fragile length-prefix heuristic |
| `electron/handlers/ai.ts` | Anti-hallucination prompt, Gemini fix, empty-message validation |
| `electron/handlers/workspace.ts` | Added `createDirectory` to Finder dialog |
| `src/App.tsx` | Descriptive tooltips on chat header buttons |

## Build Artifacts

- **App**: `/Applications/TreeSheets Copilot.app`
- **DMG**: `out/make/TreeSheets Copilot-1.0.0-arm64.dmg`
