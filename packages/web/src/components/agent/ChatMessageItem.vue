<template>
  <!-- 用户消息：右对齐气泡 -->
  <div v-if="message.role === 'user'" class="user-msg-row">
    <n-card size="small" class="user-msg-card">
      <div v-html="renderMarkdown(message.content)"></div>
    </n-card>
  </div>

  <!-- 助手消息：按 blocks 顺序渲染，在时间轴容器内 -->
  <div v-else-if="message.role === 'assistant'" class="assistant-timeline">
    <!-- 有 blocks 时的正常渲染 -->
    <template v-if="message.blocks && message.blocks.length > 0">
      <div
        v-for="block in message.blocks"
        :key="block.id"
        class="block-wrapper"
        :class="`block-${block.type}`"
      >
        <component :is="blockRenderers[block.type]" :block="block" @undo="$emit('undo-edits')" />
      </div>
    </template>

    <!-- 无 blocks：回退到旧版渲染（兼容旧持久化会话） -->
    <template v-else>
      <div v-if="message.content" class="block-wrapper block-response">
        <ResponseBlock
          :block="{ id: message.id + '_content', type: 'response', content: message.content, timestamp: message.timestamp, completed: true }"
        />
      </div>
    </template>

    <!-- 编辑摘要 -->
    <div v-if="message.editOperations && message.editOperations.length > 0" class="block-wrapper block-edit_summary">
      <EditSummary
        :block="{ id: message.id + '_edits', type: 'edit_summary', edits: message.editOperations, timestamp: message.timestamp, completed: true }"
        @undo="$emit('undo-edits')"
      />
    </div>
  </div>

  <!-- 系统消息（错误等） -->
  <div v-else-if="message.role === 'system'" class="system-msg-row">
    <n-card size="small" class="system-msg-card">
      <div v-html="renderMarkdown(message.content)"></div>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import { watch } from 'vue';
import { NCard } from 'naive-ui';
import type { ChatMessage } from '../../services/chat-protocol';
import { renderMarkdown } from '../../services/markdown';
import ResponseBlock from './ResponseBlock.vue';
import ThinkingBlock from './ThinkingBlock.vue';
import ToolCallBlock from './ToolCallBlock.vue';
import EditSummary from './EditSummary.vue';

const props = defineProps<{
  message: ChatMessage;
}>();

watch(() => props.message.blocks, (blocks) => {
  if (blocks && blocks.length > 0) {
    console.log('[ChatMessageItem] blocks changed:', blocks.length, 'types:', blocks.map(b => `${b.type}(${(b as any).content?.length || 0}c, completed=${b.completed})`));
  }
}, { deep: true, immediate: true });

defineEmits<{
  'undo-edits': [];
}>();

/**
 * Block Renderer 注册表
 * 新增 Block 类型时只需在此注册对应的渲染组件
 */
const blockRenderers: Record<string, Component> = {
  response: ResponseBlock,
  thinking: ThinkingBlock,
  tool_call: ToolCallBlock,
  edit_summary: EditSummary,
};
</script>

<style scoped>
/* 用户消息 */
.user-msg-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}
.user-msg-card {
  max-width: 80%;
  border-radius: 12px 12px 4px 12px;
  background: var(--bg-tertiary);
}
.user-msg-card :deep(p) { margin: 4px 0; font-size: 13px; line-height: 1.5; }
.user-msg-card :deep(pre) { background: #0d1117; border-radius: 4px; padding: 6px 10px; margin: 4px 0; overflow-x: auto; font-size: 12px; }
.user-msg-card :deep(code) { font-family: 'Consolas', 'Courier New', monospace; font-size: 12px; }
.user-msg-card :deep(:not(pre) > code) { background: rgba(255,255,255,0.08); padding: 1px 4px; border-radius: 3px; color: var(--agent-code-accent); }

/* 助手消息时间轴 */
.assistant-timeline {
  position: relative;
  padding-left: 16px;
  margin-bottom: 16px;
  border-left: 2px solid var(--border-color);
}
.block-wrapper { margin-bottom: 8px; }
.block-wrapper:last-child { margin-bottom: 0; }

/* 系统消息 */
.system-msg-row { margin-bottom: 16px; }
.system-msg-card {
  border-left: 3px solid #f44747;
  background: rgba(244, 71, 71, 0.06);
}
.system-msg-card :deep(p) { margin: 4px 0; font-size: 13px; }
</style>
