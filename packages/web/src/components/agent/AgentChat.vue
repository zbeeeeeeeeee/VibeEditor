<template>
  <div class="agent-chat-messages" ref="messagesContainer" @scroll="onScroll">
    <n-empty
      v-if="messages.length === 0"
      :description="$t('agent.emptyChat')"
      class="chat-empty"
    />
    <template v-else>
      <ChatMessageItem
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
        @undo-edits="$emit('undo-edits')"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { NEmpty } from 'naive-ui';
import type { ChatMessage } from '../../services/chat-protocol';
import ChatMessageItem from './ChatMessageItem.vue';

defineProps<{
  messages: ChatMessage[];
}>();

defineEmits<{
  'undo-edits': [];
}>();

const messagesContainer = ref<HTMLElement>();
const userScrolledUp = ref(false);

let observer: MutationObserver | null = null;
let scrollRafId = 0;

// ===== 自动滚动 =====
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

function onScroll() {
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

/** 外部可调用的：强制滚动到底部 */
function forceScrollBottom() {
  userScrolledUp.value = false;
  nextTick(() => scrollToBottom());
}

defineExpose({ forceScrollBottom });

onMounted(() => {
  messagesContainer.value?.addEventListener('scroll', onScroll);
  setupObserver();
});

onUnmounted(() => {
  cancelAnimationFrame(scrollRafId);
  observer?.disconnect();
  messagesContainer.value?.removeEventListener('scroll', onScroll);
});
</script>

<style scoped>
.agent-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}
.chat-empty {
  margin-top: 60px;
}
</style>
