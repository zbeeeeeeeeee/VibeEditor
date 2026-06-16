<template>
  <div class="response-block" style="border: 1px solid #569cd6; padding: 8px; margin: 4px 0;">
    <div style="font-size: 10px; color: #569cd6; margin-bottom: 4px;">
      [DEBUG] ResponseBlock | completed={{ block.completed }} | contentLen={{ block.content?.length || 0 }}
    </div>
    <div class="response-content" v-html="renderedContent"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, onUpdated } from 'vue';
import type { ResponseBlock } from '../../services/chat-protocol';
import { renderMarkdown } from '../../services/markdown';

const props = defineProps<{
  block: ResponseBlock;
}>();

const renderedContent = computed(() => {
  try {
    return renderMarkdown(props.block.content);
  } catch (e) {
    return `<pre style="color:red">MARKDOWN ERROR: ${String(e)}</pre>`;
  }
});

watch(() => props.block.content, (val) => {
  console.log('[ResponseBlock] content changed:', val?.length, 'chars, first 50:', val?.slice(0, 50));
}, { immediate: true });

onMounted(() => {
  console.log('[ResponseBlock] mounted, content:', props.block.content?.length, 'chars');
});

onUpdated(() => {
  console.log('[ResponseBlock] updated, content:', props.block.content?.length, 'chars');
});
</script>

<style scoped>
.response-block {
  background: var(--bg-secondary);
}
.response-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
}
</style>
