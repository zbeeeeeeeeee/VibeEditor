<template>
  <div class="chat-input-area" :style="{ height: inputHeight + 'px' }">
    <div class="input-resize-handle" @mousedown="startInputResize"></div>
    <div class="input-row">
      <n-input
        v-model:value="text"
        type="textarea"
        :placeholder="placeholder"
        :autosize="{ minRows: 2, maxRows: 8 }"
        class="chat-textarea"
        @keydown.enter.exact.prevent="handleSend"
        @keydown.ctrl.enter.prevent="handleSend"
        @keydown.meta.enter.prevent="handleSend"
      />
      <n-button
        v-if="isProcessing"
        type="error"
        @click="$emit('stop')"
        class="action-btn"
      >
        <template #icon><n-icon :component="StopCircleOutline" /></template>
        {{ $t('agent.stop') }}
      </n-button>
      <n-button
        v-else
        type="primary"
        :disabled="!text.trim()"
        @click="handleSend"
        class="action-btn"
      >
        <template #icon><n-icon :component="ArrowUpOutline" /></template>
        {{ $t('agent.send') }}
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { NInput, NButton, NIcon } from 'naive-ui';
import { ArrowUpOutline, StopCircleOutline } from '@vicons/ionicons5';

const props = defineProps<{
  isProcessing: boolean;
  placeholder: string;
}>();

const emit = defineEmits<{
  'send': [text: string];
  'stop': [];
}>();

const text = ref('');
const inputHeight = ref(90);
let isResizingInput = false;

function handleSend() {
  const content = text.value.trim();
  if (!content || props.isProcessing) return;
  emit('send', content);
  text.value = '';
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
    inputHeight.value = Math.max(70, Math.min(320, startHeight - (ev.clientY - startY)));
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
</script>

<style scoped>
.chat-input-area {
  display: flex;
  flex-direction: column;
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
.input-resize-handle:hover { background: var(--accent-color); }
.input-row {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-top: 1px solid var(--border-color);
  flex: 1;
  align-items: flex-end;
}
.chat-textarea {
  flex: 1;
}
.chat-textarea :deep(.n-input__textarea-el) {
  font-size: 13px;
  font-family: inherit;
}
.action-btn {
  flex-shrink: 0;
  align-self: flex-end;
}
</style>
