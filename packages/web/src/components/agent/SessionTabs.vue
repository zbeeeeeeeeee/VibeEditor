<template>
  <div class="session-tabs-wrapper">
    <n-tabs
      v-model:value="activeValue"
      type="card"
      :closable="sessions.length > 1"
      addable
      tab-style="min-width: 60px; max-width: 150px; user-select: none;"
      class="session-tabs"
      @close="handleClose"
      @add="$emit('add')"
    >
      <n-tab-pane
        v-for="s in sessions"
        :key="s.id"
        :name="s.id"
        display-directive="show"
      >
        <template #tab>
          <n-text
            class="session-tab-name"
            :title="s.name"
            :depth="s.id === activeValue ? 1 : 3"
          >{{ s.name }}</n-text>
        </template>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NTabs, NTabPane, NText } from 'naive-ui';
import type { AgentSession } from '../../stores/sessions';

const props = defineProps<{
  sessions: AgentSession[];
  activeId: string | null;
}>();

const emit = defineEmits<{
  'select': [id: string];
  'close': [id: string];
  'add': [];
}>();

const activeValue = computed({
  get: () => props.activeId ?? undefined,
  set: (val) => { if (val) emit('select', val); },
});

function handleClose(name: string) {
  emit('close', name);
}
</script>

<style scoped>
.session-tabs-wrapper {
  flex-shrink: 0;
}
.session-tabs :deep(.n-tabs-pane-wrapper) {
  display: none;
}
.session-tabs :deep(.n-tabs-nav) {
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
}
.session-tabs :deep(.n-tabs-tab) {
  background: transparent;
  border-right: 1px solid var(--border-color);
}
.session-tabs :deep(.n-tabs-tab--active) {
  background: var(--bg-secondary);
}
.session-tabs :deep(.n-tabs-tab:hover) {
  background: var(--bg-hover);
}
.session-tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  font-size: 12px;
}
</style>
