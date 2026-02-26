#!/bin/bash
git add .
git commit -m "v0.2.1: Anthropic Prompt Caching & Workspace Architecture Refactor" \
-m "This major release overhauls the core logic layers for file referencing, interactive UI performance, and massive API cost-reductions.

1. Workspace & File Handling Enhancements:
- Re-architectured workspaces to store absolute path references rather than duplicating file copies, ensuring disk edits are instantly reflected.
- Upgraded the OS File Dialog to fully support multi-file selection (importing bulk arrays of .cts TreeSheets via Command/Shift click).
- Implemented Just-In-Time (JIT) parse loops before API execution: the payload now explicitly reads the fresh .cts bytes off disk the millisecond you hit 'Send'. Overwrites from the native TreeSheets app are instantly picked up.
- Locked down a horrific cache-wipe bug via 'useRef' that incorrectly crashed AI settings when toggling between two live workspaces.

2. UI & UX Refinements (Chat View):
- Fully migrated the active Model Selection Dropdown out from the global settings modal natively into the Chat input wrapper. On-the-fly model switching is now instant.
- Modified the 'Save Model' loop to automatically set newly edited/created models as the Active Model instead of silently dropping the switch. 
- Integrated a native 'Delete Chat' (🗑️) function to explicitly wipe branch states from memory on demand.
- Updated settings terminology from 'Underlying Model' to 'Model Name' for strict clarity.

3. Deep Anthropic Integration & Cost Optimization:
- Installed official '@anthropic-ai/sdk' to securely bypass the generic OpenAI compatibility wrapper when the provider is set to 'anthropic'.
- Hard-coded 'cache_control: { type: ephemeral }' exclusively into the system block housing the massive TreeSheets context files. Accompanied by the 'anthropic-beta: prompt-caching-2024-07-31' header, repeated contextual chats effectively drop input API billing overhead by ~90%.
- Included console logging metrics for 'cache_creation_input_tokens' and 'cache_read_input_tokens' allowing active DevOps monitoring of caching success hits locally.

4. Intelligent AI Diagnostics:
- Built a highly advanced 404 interceptor inside the AI electron handler. When Anthropic flags a 'Model Not Found / Retired' error, the payload securely pauses, executes a 'models.list()' ping using the active API Key, and injects the absolute valid list of legally accessible models natively into the Chat UI for the user to choose."

git push origin main
