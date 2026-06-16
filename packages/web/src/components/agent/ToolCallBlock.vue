<template>
  <n-collapse :default-expanded-names="block.completed ? [block.id] : []" class="tool-call-collapse">
    <n-collapse-item :name="block.id" arrow-placement="right">
      <template #header>
        <div class="tool-header">
          <n-spin v-if="!block.completed" :size="14" />
          <n-tag
            v-else
            :type="tagType"
            :bordered="false"
            size="small"
          >{{ block.toolType }}</n-tag>
          <span v-if="block.toolLabel" class="tool-label">{{ block.toolLabel }}</span>
        </div>
      </template>
      <div v-if="block.content" class="tool-result">
        <pre>{{ block.content }}</pre>
      </div>
    </n-collapse-item>
  </n-collapse>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NCollapse, NCollapseItem, NTag, NSpin } from 'naive-ui';
import type { ToolCallBlock } from '../../services/chat-protocol';

const props = defineProps<{
  block: ToolCallBlock;
}>();

const categoryTagMap: Record<string, 'info' | 'success' | 'warning' | 'error' | 'default'> = {
  file: 'info',
  shell: 'warning',
  search: 'default',
  mcp: 'info',
  delegate: 'error',
};

const tagType = computed(() => categoryTagMap[props.block.toolCategory || ''] || 'success');
</script>

<style scoped>
.tool-call-collapse :deep(.n-collapse-item__header) {
  font-size: 12px;
  padding: 4px 0;
}
.tool-header {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tool-label {
  color: var(--text-secondary);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}
.tool-result {
  border-left: 3px solid rgba(78, 201, 176, 0.3);
  background: rgba(78, 201, 176, 0.04);
  border-radius: 0 4px 4px 0;
  max-height: 600px;
  overflow-y: auto;
}
.tool-result pre {
  margin: 0;
  padding: 6px 10px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Consolas', 'Courier New', monospace;
}
</style>
