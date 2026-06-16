import { ref } from 'vue';
import { createAgentService } from '../services/agentService';
import type { AgentConfig, StreamEvent } from '../services/agentService';
import type { ProviderConfig } from './useLLMSettings';
import type { ParsedEdit } from '../services/editParser';
import type { AgentContext, ChatMessage, MessageBlock } from '../services/chat-protocol';
import { useEditorStore } from '../stores/editor';
import { getEditorInstance } from '../services/editorInstance';
import { webAgentLog } from '../services/logger';

// 从 chat-protocol 重导出，方便其他模块从单一入口导入
export type { AgentContext, ChatMessage, MessageBlock } from '../services/chat-protocol';

function collectFileTreePaths(entries: any[], basePath: string): string[] {
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const full = basePath ? `${basePath}/${entry.name}` : entry.name;
    paths.push(full);
  }
  return paths;
}

function buildAgentContext(activeFilePath?: string): AgentContext {
  const store = useEditorStore();
  const editor = getEditorInstance();

  const openFiles = store.tabs.map(tab => ({
    path: tab.path,
    content: tab.content,
  }));

  const fileTree = collectFileTreePaths(store.fileTreeNodes, '');

  let cursorPosition: AgentContext['cursorPosition'];
  let selection: AgentContext['selection'];

  if (editor) {
    const file = activeFilePath || '';
    const pos = editor.getPosition();
    if (pos) {
      cursorPosition = { file, line: pos.lineNumber, column: pos.column };
    }
    const sel = editor.getSelection();
    if (sel && !sel.isEmpty()) {
      const model = editor.getModel();
      const text = model ? model.getValueInRange(sel) : '';
      selection = {
        file,
        text,
        startLine: sel.startLineNumber,
        endLine: sel.endLineNumber,
      };
    }
  }

  return { openFiles, fileTree, cursorPosition, selection, conversationHistory: [] };
}

export function useAgent(sessionId?: string) {
  const messages = ref<ChatMessage[]>([]);
  const isProcessing = ref(false);
  const config = ref<AgentConfig>({ mode: 'build' });
  const service = createAgentService();
  const lastEdits = ref<ParsedEdit[]>([]);
  const toolStatus = ref<string>('');
  const thinkingActive = ref(false);
  let activeAbortController: AbortController | null = null;

  function buildRequestConfig(provider?: ProviderConfig | null): AgentConfig {
    return {
      ...config.value,
      providerId: provider?.id || undefined,
    };
  }

  function extractEdits(msg: ChatMessage) {
    if (config.value.mode === 'build') {
      if (msg.edits && msg.edits.length > 0) {
        msg.editOperations = msg.edits;
        lastEdits.value = msg.edits;
      }
    }
  }

  async function sendMessage(content: string, provider?: ProviderConfig | null, activeFilePath?: string) {
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    messages.value.push(userMsg);
    isProcessing.value = true;
    toolStatus.value = '';

    try {
      const ctx = buildAgentContext(activeFilePath);
      const response = await service.sendMessage(content, {
        ...ctx,
        conversationHistory: messages.value.slice(0, -1),
        sessionId,
      }, buildRequestConfig(provider));

      const msg: ChatMessage = { ...response };
      extractEdits(msg);
      messages.value.push(msg);
    } catch (e: any) {
      messages.value.push({
        id: `msg_err_${Date.now()}`,
        role: 'system',
        content: `Error: ${e.message}`,
        timestamp: Date.now(),
      });
    } finally {
      isProcessing.value = false;
    }
  }

  async function streamMessage(
    content: string,
    provider?: ProviderConfig | null,
    onChunk?: () => void,
    activeFilePath?: string
  ) {
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    messages.value.push(userMsg);

    lastEdits.value = [];
    toolStatus.value = '';
    thinkingActive.value = false;

    const assistantMsgId = `msg_${Date.now() + 1}`;
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    messages.value.push(assistantMsg);

    isProcessing.value = true;

    // Cancel any previous in-flight stream
    if (activeAbortController) {
      activeAbortController.abort();
    }
    activeAbortController = new AbortController();
    const signal = activeAbortController.signal;

    // 流式过程中按顺序构建 blocks
    let currentBlock: MessageBlock | null = null;
    let blockIdCounter = 0;
    const nextBlockId = () => `blk_${assistantMsgId}_${blockIdCounter++}`;

    function finishBlock() {
      if (currentBlock) {
        // 先刷新内容缓冲，确保内容写入正确的 block
        flushContentNow();
        currentBlock.completed = true;
        currentBlock = null;
      }
    }

    function ensureBlock(type: 'thinking' | 'response' | 'tool_call', toolType?: string, toolLabel?: string) {
      if (currentBlock && currentBlock.type === type && !currentBlock.completed) return;
      webAgentLog.info(`ensureBlock: switching to ${type}, prevBlock=${currentBlock?.type || 'null'}, bufferLen=${contentBuffer.length}`);
      finishBlock();
      currentBlock = {
        id: nextBlockId(),
        type,
        content: '',
        toolType,
        toolLabel,
        completed: false,
        timestamp: Date.now(),
      } as MessageBlock;
      const msg = messages.value.find(m => m.id === assistantMsgId);
      if (msg) {
        if (!msg.blocks) msg.blocks = [];
        msg.blocks.push(currentBlock);
        webAgentLog.info(`ensureBlock: pushed ${type} block, blocks.length=${msg.blocks.length}`);
      }
    }

    // 内容缓冲：每 50ms 刷新一次，减少响应式更新和 markdown 渲染频率
    const contentBuffer: string[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const FLUSH_INTERVAL = 50;

    function flushContent() {
      webAgentLog.info(`flushContent: bufferLen=${contentBuffer.length}, currentBlock=${currentBlock?.type || 'null'}`);
      if (contentBuffer.length === 0) return;
      const text = contentBuffer.join('');
      contentBuffer.length = 0;
      if (currentBlock) {
        currentBlock.content += text;
        webAgentLog.info(`flushContent: wrote ${text.length} chars to ${currentBlock.type}, total=${(currentBlock as any).content?.length || 0}`);
      }
      if (onChunk) onChunk();
    }

    /** 同步刷新缓冲（不清除 timer），用于 block 切换前保存内容 */
    function flushContentNow() {
      if (contentBuffer.length === 0) return;
      const text = contentBuffer.join('');
      contentBuffer.length = 0;
      webAgentLog.info(`flushContentNow: wrote ${text.length} chars to ${(currentBlock as any)?.type || 'null'}, total=${(currentBlock as any)?.content?.length || 0}`);
      if (currentBlock) {
        currentBlock.content += text;
      }
    }

    function scheduleFlush() {
      if (flushTimer) return;
      webAgentLog.info('scheduleFlush: setting 50ms timer');
      flushTimer = setTimeout(() => { flushTimer = null; flushContent(); }, FLUSH_INTERVAL);
    }

    try {
      const store = useEditorStore();
      const ctx = buildAgentContext(activeFilePath);
      const history = messages.value.slice(0, -1).filter(m => m.id !== assistantMsgId);

      const streamCtx = {
        ...ctx,
        conversationHistory: history,
        workspaceRoot: store.workspaceRoot || undefined,
        workspaceId: store.activeWorkspaceId || undefined,
        sessionId,
      };
      const response = await service.streamMessage(
        content,
        streamCtx,
        buildRequestConfig(provider),
        (type: 'thinking' | 'content', text: string) => {
          const msg = messages.value.find(m => m.id === assistantMsgId);
          if (!msg) return;
          if (type === 'thinking') {
            thinkingActive.value = true;
            ensureBlock('thinking');
            currentBlock!.content += text;
            msg.thinking = (msg.thinking || '') + text;
          } else {
            if (thinkingActive.value) {
              thinkingActive.value = false;
              webAgentLog.info('onChunk: thinking -> content transition');
            }
            // Ensure we have a response block before buffering
            if (!currentBlock || currentBlock.type !== 'response') {
              ensureBlock('response');
            }
            // Buffer content and flush at controlled intervals
            contentBuffer.push(text);
            scheduleFlush();
            msg.content += text;
          }
          if (onChunk) onChunk();
        },
        (event: StreamEvent) => {
          if (event.type === 'tool_start') {
            // 跳过 MCP 初始化事件（🔌 开头的非真实工具调用）
            const toolMsg = event.message || '';
            if (toolMsg.startsWith('🔌')) return;
            toolStatus.value = toolMsg;
            const match = toolMsg.match(/^🔍\s*(\S+):?\s*(.*)/);
            const toolType = match ? match[1] : (event.message || 'tool');
            const toolLabel = match ? match[2] : '';
            finishBlock();
            currentBlock = {
              id: nextBlockId(),
              type: 'tool_call',
              content: '',
              toolType,
              toolLabel,
              completed: false,
              timestamp: Date.now(),
            } as MessageBlock;
            const msg = messages.value.find(m => m.id === assistantMsgId);
            if (msg) {
              if (!msg.blocks) msg.blocks = [];
              msg.blocks.push(currentBlock);
            }
          } else if (event.type === 'tool_end') {
            toolStatus.value = '';
            finishBlock();
          } else if (event.type === 'tool_result') {
            // Append tool result content to the active tool_call block
            const resultText = event.content || event.message || '';
            if (currentBlock && currentBlock.type === 'tool_call') {
              currentBlock.content += resultText;
            } else {
              ensureBlock('tool_call', event.message || 'tool', '');
              currentBlock!.content = resultText;
            }
          } else if (event.type === 'thinking_start') {
            thinkingActive.value = true;
          } else if (event.type === 'thinking_end') {
            thinkingActive.value = false;
          }
        },
        { signal }
      );

      const msg = messages.value.find(m => m.id === assistantMsgId);
      if (msg) {
        if (response.edits && response.edits.length > 0) {
          msg.edits = response.edits;
        }
        extractEdits(msg);
      }
    } catch (e: any) {
      webAgentLog.error(`streamMessage error: ${e.name} ${e.message}`, { name: e.name, message: e.message });
      if (e.name === 'AbortError') {
        const msg = messages.value.find(m => m.id === assistantMsgId);
        if (msg) {
          msg.content += '\n\n*[已取消]*';
        }
      } else {
        const msg = messages.value.find(m => m.id === assistantMsgId);
        if (msg) {
          msg.role = 'system';
          msg.content = `Error: ${e.message}`;
        }
      }
    } finally {
      webAgentLog.info(`finally: flushTimer=${!!flushTimer}, currentBlock=${(currentBlock as any)?.type || 'null'}, bufferLen=${contentBuffer.length}, blocksCount=${messages.value.find(m => m.id === assistantMsgId)?.blocks?.length || 0}`);
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      flushContent();
      activeAbortController = null;
      finishBlock();
      const msg = messages.value.find(m => m.id === assistantMsgId);
      if (msg) {
        msg.timestamp = Date.now();
        webAgentLog.info(`finally done: blocks.length=${msg.blocks?.length || 0}, blocks=${msg.blocks?.map(b => `${b.type}(len=${(b as any).content?.length || 0}, completed=${b.completed})`).join(', ')}`);
      }
      thinkingActive.value = false;
      isProcessing.value = false;
    }
  }

  function cancelStream() {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    isProcessing.value = false;
  }

  function clearMessages() {
    messages.value = [];
    lastEdits.value = [];
    toolStatus.value = '';
    thinkingActive.value = false;
  }

  function restoreMessages(msgs: ChatMessage[]) {
    messages.value = msgs;
  }

  function setMode(mode: AgentConfig['mode']) {
    config.value.mode = mode;
  }

  return { messages, isProcessing, config, lastEdits, toolStatus, thinkingActive, sendMessage, streamMessage, cancelStream, clearMessages, restoreMessages, setMode };
}
