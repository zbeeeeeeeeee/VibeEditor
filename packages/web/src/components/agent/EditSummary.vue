<template>
  <n-space align="center" :wrap="true" :size="4">
    <n-text depth="3" class="edit-summary-label">
      {{ block.edits.length }}{{ $t('agent.filesModified') }}
    </n-text>
    <n-tag
      v-for="edit in block.edits"
      :key="edit.path"
      size="small"
      :bordered="false"
      class="edit-file-tag"
    >{{ edit.path }}</n-tag>
    <n-popconfirm @positive-click="$emit('undo')">
      <template #trigger>
        <n-button size="tiny" quaternary>{{ $t('agent.undo') }}</n-button>
      </template>
      {{ $t('agent.undoConfirm') }}
    </n-popconfirm>
  </n-space>
</template>

<script setup lang="ts">
import { NSpace, NText, NTag, NButton, NPopconfirm } from 'naive-ui';
import type { EditSummaryBlock } from '../../services/chat-protocol';

defineProps<{
  block: EditSummaryBlock;
}>();

defineEmits<{
  'undo': [];
}>();
</script>

<style scoped>
.edit-summary-label {
  font-size: 11px;
}
.edit-file-tag {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 10px;
}
</style>
