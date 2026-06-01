<template>
  <div class="agent-panel">
    <!-- 思考进度条 —— 处理时在面板最上方滚动 -->
    <div v-if="agent.isProcessing.value" class="thinking-progress">
      <div class="thinking-progress-bar"></div>
    </div>

    <!-- 无提供商时的引导页面 -->
    <div v-if="providerSettings.providers.value.length === 0" class="agent-guide">
      <div class="guide-icon">&#9881;</div>
      <div class="guide-title">{{ $t('agent.guideTitle') }}</div>
      <div class="guide-desc">
        {{ $t('agent.guideDesc1') }}<br />
        {{ $t('agent.guideDesc2') }}
      </div>
      <button class="guide-cta" @click="showSettings = true">{{ $t('agent.addProvider') }}</button>
    </div>

    <!-- 有提供商时显示正常的聊天界面 -->
    <template v-if="providerSettings.providers.value.length > 0">
      <!-- 消息列表 -->
      <div class="agent-messages" ref="messagesContainer">
        <div v-if="agent.messages.value.length === 0" class="agent-empty">
          {{ $t('agent.emptyChat') }}
        </div>
        <div
          v-for="msg in agent.messages.value"
          :key="msg.id"
          class="agent-message"
          :class="'msg-' + msg.role"
        >
          <div class="msg-role">{{ msg.role }}</div>

          <!-- 思考过程 —— 可折叠，与最终结果有视觉区分 -->
          <div v-if="msg.thinking" class="msg-thinking">
            <div class="thinking-header" @click="toggleThinking(msg.id)">
              <span class="thinking-indicator">&#9881; {{ $t('agent.reasoning') }}</span>
              <span class="thinking-toggle">{{ expandedThinking[msg.id] ? '&#9650;' : '&#9660;' }}</span>
            </div>
            <div v-if="expandedThinking[msg.id]" class="thinking-body">
              <div class="thinking-content" v-html="renderMarkdown(msg.thinking)"></div>
            </div>
          </div>

          <!-- 思考→结果分隔线 -->
          <div v-if="msg.thinking && msg.content" class="thinking-separator">
            <span class="separator-line"></span>
            <span class="separator-label">{{ $t('agent.response') }}</span>
            <span class="separator-line"></span>
          </div>

          <div class="msg-content" v-html="renderMarkdown(msg.content)"></div>
          <div v-if="msg.editOperations && msg.editOperations.length > 0" class="edit-summary">
            {{ msg.editOperations.length }}{{ $t('agent.filesModified') }}
            <span v-for="e in msg.editOperations" :key="e.path" class="edit-file">{{ e.path }}</span>
            <button class="undo-btn" @click="emit('undo-edits')">{{ $t('agent.undo') }}</button>
          </div>
        </div>

        <!-- 处理中指示：正在思考时显示动画，执行工具时显示工具状态 -->
        <div v-if="agent.isProcessing.value" class="agent-loading">
          <template v-if="agent.thinkingActive.value">
            <span class="thinking-pulse"></span> {{ $t('agent.thinking') }}
          </template>
          <template v-else-if="agent.toolStatus.value">
            {{ agent.toolStatus.value }}
          </template>
        </div>
      </div>

      <!-- 输入区域拖拽手柄 -->
      <div class="input-resize-handle" @mousedown="startInputResize"></div>

      <!-- 输入区域 -->
      <div class="agent-input-area" :style="{ height: inputHeight + 'px' }">
        <textarea
          v-model="input"
          class="agent-input"
          :placeholder="$t('agent.askAgent')"
          rows="2"
          @keydown.enter.exact.prevent="send"
          @keydown.ctrl.enter.prevent="send"
          @keydown.meta.enter.prevent="send"
        ></textarea>
        <button class="agent-send-btn" @click="send" :disabled="!input.trim() || agent.isProcessing.value">
          {{ $t('agent.send') }}
        </button>
      </div>

      <!-- 提供商选择 + 模式切换 -->
      <div class="agent-footer">
        <div class="footer-left">
          <ProviderSelect
            :providers="providerSettings.providers.value"
            :activeId="providerSettings.activeId.value"
            @select="providerSettings.setActive($event)"
          />
          <button class="settings-btn" :title="$t('agent.providerSettings')" @click="showSettings = true">&#9881;</button>
        </div>
        <ModeSelector v-model="agent.config.value.mode" />
      </div>
    </template>

    <!-- 设置对话框 -->
    <SettingsDialog :visible="showSettings" @close="showSettings = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, onUnmounted } from 'vue';
import { useAgent } from '../../composables/useAgent';
import { useProviderSettings } from '../../composables/useProviderSettings';
import { useEditorStore } from '../../stores/editor';
import { renderMarkdown } from '../../services/markdown';
import type { FileServiceClient } from '../../services/fileService';
import type { ParsedEdit } from '../../services/editParser';
import SettingsDialog from './SettingsDialog.vue';
import ModeSelector from './ModeSelector.vue';
import ProviderSelect from './ProviderSelect.vue';

const props = defineProps<{
  fileClient?: FileServiceClient | null;
}>();

const emit = defineEmits<{
  'apply-edits': [edits: ParsedEdit[]]
  'undo-edits': []
}>();

const agent = useAgent();
const providerSettings = useProviderSettings();
const editorStore = useEditorStore();
const input = ref('');
const messagesContainer = ref<HTMLElement>();
const showSettings = ref(false);
const inputHeight = ref(90);
let isResizingInput = false;

// 思考内容展开/折叠状态
const expandedThinking = reactive<Record<string, boolean>>({});

function toggleThinking(msgId: string) {
  expandedThinking[msgId] = !expandedThinking[msgId];
}

// ===== 自动滚动控制 =====
const userScrolledUp = ref(false);
let scrollRafId = 0;
let observer: MutationObserver | null = null;

function isNearBottom(): boolean {
  const el = messagesContainer.value;
  if (!el) return false;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 50;
}

function scrollToBottom() {
  const el = messagesContainer.value;
  if (el) el.scrollTop = el.scrollHeight;
}

function scheduleScroll(force = false) {
  cancelAnimationFrame(scrollRafId);
  scrollRafId = requestAnimationFrame(() => {
    if (force || !userScrolledUp.value) {
      scrollToBottom();
    }
  });
}

function onMessagesScroll() {
  userScrolledUp.value = !isNearBottom();
}

function setupObserver() {
  const el = messagesContainer.value;
  if (!el) return;
  observer = new MutationObserver(() => {
    scheduleScroll(false);
  });
  observer.observe(el, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

async function send() {
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  userScrolledUp.value = false;

  const activeFilePath = editorStore.activeTab?.path;

  const streamPromise = agent.streamMessage(
    text,
    providerSettings.activeProvider.value,
    () => scheduleScroll(false),
    activeFilePath,
    props.fileClient
  );

  await nextTick();
  scrollToBottom();

  await streamPromise;

  if (agent.lastEdits.value.length > 0) {
    emit('apply-edits', [...agent.lastEdits.value]);
    agent.lastEdits.value = [];
  }

  scheduleScroll(true);
}

function startInputResize(e: MouseEvent) {
  e.preventDefault();
  isResizingInput = true;
  const startY = e.clientY;
  const startHeight = inputHeight.value;

  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';

  const onMove = (ev: MouseEvent) => {
    if (!isResizingInput) return;
    inputHeight.value = Math.max(60, Math.min(320, startHeight - (ev.clientY - startY)));
  };

  const onUp = () => {
    isResizingInput = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', onUp, true);
    window.removeEventListener('blur', onUp);
  };

  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('mouseup', onUp, true);
  window.addEventListener('blur', onUp);
}

onMounted(() => {
  messagesContainer.value?.addEventListener('scroll', onMessagesScroll);
  setupObserver();
});

onUnmounted(() => {
  cancelAnimationFrame(scrollRafId);
  observer?.disconnect();
  messagesContainer.value?.removeEventListener('scroll', onMessagesScroll);
});
</script>

<style scoped>
.agent-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary);
  position: relative;
  overflow: hidden;
}

/* ===== 思考进度条 ===== */
.thinking-progress {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 10;
  overflow: hidden;
  background: transparent;
}

.thinking-progress-bar {
  width: 40%;
  height: 100%;
  background: linear-gradient(90deg, transparent, var(--accent-color), transparent);
  animation: progress-scroll 1.2s ease-in-out infinite;
  border-radius: 2px;
}

@keyframes progress-scroll {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(350%);
  }
}

/* ===== 思考内容区域 ===== */
.msg-thinking {
  margin-bottom: 4px;
  border: 1px solid var(--agent-thinking-border);
  border-radius: 4px;
  background: var(--agent-thinking-surface);
  overflow: hidden;
}

.thinking-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  font-size: 11px;
  color: var(--agent-thinking-title);
  cursor: pointer;
  user-select: none;
}
.thinking-header:hover {
  background: rgba(255, 200, 50, 0.08);
}

.thinking-indicator {
  font-weight: 500;
}

.thinking-toggle {
  font-size: 9px;
  opacity: 0.6;
}

.thinking-body {
  padding: 4px 10px 8px;
  border-top: 1px solid var(--agent-divider);
}

.thinking-content {
  font-size: 12px;
  line-height: 1.5;
  color: var(--agent-thinking-text);
  white-space: pre-wrap;
  word-break: break-word;
}

/* ===== 思考 → 结果分隔线 ===== */
.thinking-separator {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0;
}

.separator-line {
  flex: 1;
  height: 1px;
  background: var(--agent-divider);
}

.separator-label {
  font-size: 10px;
  text-transform: uppercase;
  color: var(--text-secondary);
  letter-spacing: 1px;
  white-space: nowrap;
}

/* ===== 处理中指示 ===== */
.agent-loading {
  color: var(--text-secondary);
  font-size: 12px;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.thinking-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-color);
  animation: pulse-dot 1s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}

/* ===== Footer ===== */
.agent-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-top: 1px solid var(--border-color);
  gap: 8px;
  flex-shrink: 0;
}
.footer-left {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.settings-btn {
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 3px;
  line-height: 1;
  flex-shrink: 0;
}
.settings-btn:hover {
  color: var(--text-primary);
  border-color: var(--accent-color);
}
.agent-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.agent-empty {
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
  padding: 40px 0;
}
.agent-message {
  margin-bottom: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 13px;
}
.msg-user {
  background: var(--bg-tertiary);
}
.msg-assistant {
  background: var(--agent-msg-assistant-bg);
}
.msg-system {
  background: var(--agent-msg-system-bg);
}
.msg-role {
  font-size: 10px;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.msg-content {
  line-height: 1.5;
}
.msg-content :deep(p) {
  margin: 4px 0;
}
.msg-content :deep(h1) {
  font-size: 16px;
  font-weight: 600;
  margin: 8px 0 4px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 4px;
}
.msg-content :deep(h2) {
  font-size: 14px;
  font-weight: 600;
  margin: 8px 0 4px;
}
.msg-content :deep(h3) {
  font-size: 13px;
  font-weight: 600;
  margin: 6px 0 2px;
}
.msg-content :deep(pre) {
  background: var(--agent-code-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 8px 10px;
  margin: 6px 0;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.4;
}
.msg-content :deep(code) {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
}
.msg-content :deep(:not(pre) > code) {
  background: var(--bg-tertiary);
  padding: 1px 4px;
  border-radius: 3px;
  color: var(--agent-code-accent);
}
.msg-content :deep(strong) {
  font-weight: 600;
  color: var(--text-primary);
}
.msg-content :deep(em) {
  font-style: italic;
}
.msg-content :deep(ul),
.msg-content :deep(ol) {
  margin: 4px 0;
  padding-left: 20px;
}
.msg-content :deep(li) {
  margin: 2px 0;
}
.msg-content :deep(a) {
  color: var(--accent-color);
  text-decoration: none;
}
.msg-content :deep(a:hover) {
  text-decoration: underline;
}
.msg-content :deep(blockquote) {
  border-left: 3px solid var(--accent-color);
  margin: 6px 0;
  padding: 4px 10px;
  color: var(--text-secondary);
  background: var(--agent-blockquote-bg);
}
.msg-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 8px 0;
}
.edit-summary {
  margin-top: 8px;
  padding: 6px 8px;
  background: var(--agent-edit-surface);
  border: 1px solid var(--agent-edit-border);
  border-radius: 4px;
  font-size: 11px;
  color: var(--agent-edit-text);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.edit-file {
  background: var(--agent-edit-badge);
  padding: 1px 6px;
  border-radius: 3px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 10px;
}
.undo-btn {
  margin-left: auto;
  background: var(--agent-undo-surface);
  border: 1px solid var(--agent-undo-border);
  color: var(--agent-undo-text);
  padding: 2px 8px;
  font-size: 10px;
  cursor: pointer;
  border-radius: 3px;
  white-space: nowrap;
}
.undo-btn:hover {
  background: var(--agent-undo-border);
}
.agent-input-area {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
  overflow: hidden;
}
.input-resize-handle {
  height: 3px;
  cursor: row-resize;
  background: var(--border-color);
  flex-shrink: 0;
  transition: background 0.15s;
}
.input-resize-handle:hover {
  background: var(--accent-color);
}
.agent-input {
  flex: 1;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 6px 8px;
  font-size: 13px;
  resize: none;
  border-radius: 4px;
  font-family: inherit;
}
.agent-input:focus {
  outline: none;
  border-color: var(--accent-color);
}
.agent-send-btn {
  background: var(--accent-color);
  border: none;
  color: #fff;
  padding: 6px 14px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
  align-self: flex-end;
}
.agent-send-btn:hover {
  background: var(--accent-hover);
}
.agent-send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ---- 无提供商引导页 ---- */
.agent-guide {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 32px 24px;
}
.guide-icon {
  font-size: 40px;
  color: var(--text-secondary);
  opacity: 0.35;
  margin-bottom: 14px;
}
.guide-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 6px;
}
.guide-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 22px;
  line-height: 1.5;
}
.guide-cta {
  background: var(--accent-color);
  color: #fff;
  border: none;
  padding: 8px 24px;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  margin-bottom: 8px;
}
.guide-cta:hover {
  background: var(--accent-hover);
}
</style>
