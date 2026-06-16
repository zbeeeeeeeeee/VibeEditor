<template>
  <div class="thinking-indicator" :class="{ completed: block.completed }">
    <n-spin v-if="!block.completed" :size="14" />
    <span class="thinking-label">{{ block.completed ? '💭 思考完成' : '💭 思考中...' }}</span>
  </div>
</template>

<script setup lang="ts">
import { NSpin } from 'naive-ui';
import type { ThinkingBlock } from '../../services/chat-protocol';

defineProps<{
  block: ThinkingBlock;
}>();
</script>

<style scoped>
.thinking-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
  color: #b8952e;
}
.thinking-indicator.completed {
  opacity: 0.5;
}
.thinking-label {
  font-weight: 500;
}
</style>
