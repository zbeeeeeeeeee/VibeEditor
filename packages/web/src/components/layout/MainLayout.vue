<template>
  <div
    class="main-layout"
    :class="{ 'drag-over': isDraggingFolder }"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <Toolbar
      :env="fs.env"
      :workspace-mode="store.workspaceMode"
      @open-folder="handleOpenFolder"
      @connect-server="handleConnectServer"
      @open-local-file="fs.openLocalFile"
      @save="fs.saveCurrentFile"
      @new-file="store.newUntitled"
      @new-folder="fs.createFolder"
      @edit-cut="handleEditAction('cut')"
      @edit-copy="handleEditAction('copy')"
      @edit-paste="handleEditAction('paste')"
      @edit-undo="handleEditAction('undo')"
      @edit-redo="handleEditAction('redo')"
      @edit-find="handleEditAction('find')"
      @edit-replace="handleEditAction('replace')"
      @toggle-agent="showAgent = !showAgent"
      @toggle-sidebar="toggleSidebar"
      @show-about="showAboutDialog = true"
      :sidebar-collapsed="sidebarCollapsed"
    />
    <div class="main-content">
      <ActivityBar
        :items="topActivityItems"
        :bottom-items="bottomActivityItems"
        :active-id="activeActivity"
        @select="onActivitySelect"
      >
        <template v-slot:bottom>
          <SettingDropdown />
        </template>
      </ActivityBar>
      <div v-if="!sidebarCollapsed" class="sidebar" :style="{ width: sidebarWidth + 'px' }">
        <template v-if="activeActivity === 'explorer'">
          <SideBar
            :title="activeActivityTitle"
            :sections="sidebarSections"
          >
            <template v-slot:explorer>
              <FileTree
                :nodes="store.fileTreeNodes"
                :workspace-root="store.workspaceRoot"
                :workspace-mode="store.workspaceMode"
                :loading="fs.isLoading"
                :expanded-dirs="expandedDirs"
                :loading-dirs="loadingDirs"
                :dir-children="dirChildren"
                :renaming-path="renamingPath"
                :creating-in-dir="creatingInDir"
                :creating-node-key="creatingNodeKey"
                @select-file="fs.openAndReadFile"
                @expand-dir="handleExpandDir"
                @delete-file="fs.deleteFile"
                @contextmenu="handleContextMenu"
                @confirm-rename="handleConfirmRename"
                @confirm-create="handleConfirmCreate"
                @cancel-create="handleCancelCreate"
              />
            </template>
          </SideBar>
        </template>
        <template v-else-if="activeActivity === 'search'">
          <SearchPanel
            :client="fs.client"
            @open-file="fs.openAndReadFile"
          />
        </template>
        <template v-else>
          <SideBar
            :title="activeActivityTitle"
            :sections="sidebarSections"
          />
        </template>
      </div>
      <div v-if="!sidebarCollapsed" class="resize-handle" @mousedown="startSidebarResize"></div>
      <div class="editor-area">
        <div class="tabs-bar">
          <div
            v-for="tab in store.tabs"
            :key="tab.id"
            class="tab"
            :class="{ active: tab.id === store.activeTabId }"
            @click="store.setActiveTab(tab.id)"
          >
            <span class="tab-name">{{ tab.name }}</span>
            <span v-if="tab.isDirty" class="tab-dirty">*</span>
            <span class="tab-close" @click.stop="store.closeTab(tab.id)">x</span>
          </div>
        </div>
        <div class="editor-container">
          <ImageViewer
            v-if="store.activeTab && store.activeTab.viewMode === 'image'"
            :key="store.activeTab.id"
            :src="store.activeTab.content"
            :filename="store.activeTab.name"
          />
          <MonacoEditor
            v-else-if="store.activeTab && store.activeTab.viewMode === 'code'"
            :key="store.activeTab.id"
            :content="store.activeTab.content"
            :language="store.activeTab.language"
            @content-change="(c: string) => store.updateContent(store.activeTab!.id, c)"
          />
          <DocxViewer
            v-else-if="store.activeTab && store.activeTab.viewMode === 'docx'"
            :content="store.activeTab.content"
            :file-name="store.activeTab.name"
          />
          <ExcelViewer
            v-else-if="store.activeTab && store.activeTab.viewMode === 'excel'"
            :content="store.activeTab.content"
            :file-name="store.activeTab.name"
          />
          <PptxViewer
            v-else-if="store.activeTab && store.activeTab.viewMode === 'pptx'"
            :content="store.activeTab.content"
            :file-name="store.activeTab.name"
          />
          <PdfViewer
            v-else-if="store.activeTab && store.activeTab.viewMode === 'pdf'"
            :content="store.activeTab.content"
            :file-name="store.activeTab.name"
          />
          <HtmlViewer
            v-else-if="store.activeTab && store.activeTab.viewMode === 'html'"
            :key="store.activeTab.id"
            :content="store.activeTab.content"
            :language="store.activeTab.language"
            @content-change="(c: string) => store.updateContent(store.activeTab!.id, c)"
          />
          <MarkdownViewer
            v-else-if="store.activeTab && store.activeTab.viewMode === 'markdown'"
            :key="store.activeTab.id"
            :content="store.activeTab.content"
            :language="store.activeTab.language"
            @content-change="(c: string) => store.updateContent(store.activeTab!.id, c)"
          />
          <div v-else class="editor-placeholder">
            <div class="placeholder-content">
              <p class="placeholder-title">{{ $t('placeholder.title') }}</p>
              <p class="placeholder-hint">{{ $t('placeholder.hint') }}</p>
              <div v-if="store.fileTreeNodes.length === 0" class="placeholder-actions">
                <button class="placeholder-btn" @click="fs.openFolderDialog">{{ $t('placeholder.openFolder') }}</button>
                <button
                  v-if="fs.env === 'browser' || fs.env === 'server'"
                  class="placeholder-btn"
                  @click="fs.connectToServer"
                >
                  {{ $t('placeholder.browseServer') }}
                </button>
                <button
                  v-if="fs.env === 'browser'"
                  class="placeholder-btn"
                  @click="fs.openLocalFile"
                >
                  {{ $t('placeholder.openFile') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="showAgent" class="agent-resize-handle" @mousedown="startAgentResize"></div>
      <div v-if="showAgent" class="agent-sidebar" :style="{ width: agentWidth + 'px' }">
        <AgentPanel :file-client="fs.client" @apply-edits="handleApplyEdits" @undo-edits="undoLastEdits" />
      </div>
    </div>
    <StatusBar
      :active-tab="store.activeTab"
      :workspace-mode="store.workspaceMode"
    />
    <SaveDialog
      v-if="showSaveDialog"
      :client="fs.client"
      :default-name="saveDialogDefaultName"
      :workspace-root="store.workspaceRoot"
      @confirm="onSaveDialogConfirm"
      @cancel="onSaveDialogCancel"
    />
    <AboutDialog :visible="showAboutDialog" @close="showAboutDialog = false" />
    <div v-if="isDraggingFolder" class="drop-overlay">
      <div class="drop-message">
        <span class="drop-title">{{ $t('dragOverlay.title') }}</span>
        <span class="drop-subtitle">{{ $t('dragOverlay.subtitle') }}</span>
      </div>
    </div>
    <div v-if="fs.showUndoNotification" class="undo-notification">
      <span class="undo-text">{{ $t('undoNotification.deleted') }} {{ fs.lastDeleted?.path }}</span>
      <button class="undo-btn" @click="fs.undoDelete()">{{ $t('undoNotification.undo') }}</button>
      <button class="undo-dismiss" @click="fs.showUndoNotification = false">✕</button>
    </div>
    <template v-if="fs.env === 'electron' && !isMaximized">
      <div class="resize-handle resize-n" @mousedown="startResize('n' as ResizeEdge, $event)"></div>
      <div class="resize-handle resize-s" @mousedown="startResize('s' as ResizeEdge, $event)"></div>
      <div class="resize-handle resize-e" @mousedown="startResize('e' as ResizeEdge, $event)"></div>
      <div class="resize-handle resize-w" @mousedown="startResize('w' as ResizeEdge, $event)"></div>
      <div class="resize-handle resize-ne" @mousedown="startResize('ne' as ResizeEdge, $event)"></div>
      <div class="resize-handle resize-nw" @mousedown="startResize('nw' as ResizeEdge, $event)"></div>
      <div class="resize-handle resize-se" @mousedown="startResize('se' as ResizeEdge, $event)"></div>
      <div class="resize-handle resize-sw" @mousedown="startResize('sw' as ResizeEdge, $event)"></div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useEditorStore } from '../../stores/editor';
import { useFileSystem } from '../../composables/useFileSystem';
import { getEditorInstance } from '../../services/editorInstance';
import type { ParsedEdit } from '../../services/editParser';
import { useWindowResize } from '../../composables/useWindowResize';
import type { ResizeEdge } from '../../composables/useWindowResize';
import { useFileTreeContextMenu } from '../../composables/useFileTreeContextMenu';
import Toolbar from '../toolbar/Toolbar.vue';
import ActivityBar from './ActivityBar.vue';
import type { ActivityItem } from './ActivityBar.vue';
import SideBar from './SideBar.vue';
import type { SideBarSection } from './SideBar.vue';
import FileTree from '../file-tree/FileTree.vue';
import SearchPanel from '../SearchPanel.vue';
import MonacoEditor from '../editor/MonacoEditor.vue';
import ImageViewer from '../editor/ImageViewer.vue';
import DocxViewer from '../editor/DocxViewer.vue';
import ExcelViewer from '../editor/ExcelViewer.vue';
import PptxViewer from '../editor/PptxViewer.vue';
import PdfViewer from '../editor/PdfViewer.vue';
import HtmlViewer from '../editor/HtmlViewer.vue';
import MarkdownViewer from '../editor/MarkdownViewer.vue';
import AgentPanel from '../agent/AgentPanel.vue';
import SettingDropdown from '../settings/SettingDropdown.vue';
import SaveDialog from '../SaveDialog.vue';
import StatusBar from '../StatusBar.vue';
import AboutDialog from './AboutDialog.vue';

const store = useEditorStore();
const fs = reactive(useFileSystem());
const { t } = useI18n();

// ===== 布局状态 =====
const showAgent = ref(false);
const sidebarWidth = ref(260);
const sidebarCollapsed = ref(false);
const sidebarSavedWidth = ref(260);
const agentWidth = ref(350);
const activeActivity = ref('explorer');
const isDraggingFolder = ref(false);
// Drag events fire as the cursor moves across child elements, so count depth.
let dragDepth = 0;

const { renamingPath, creatingInDir, creatingNodeKey, handleContextMenu, handleConfirmRename, handleConfirmCreate, handleCancelCreate } = useFileTreeContextMenu(fs, store, t, { clearDirState, handleExpandDir });

const isMaximized = ref(false);
const { startResize, isResizing: isWindowResizing } = useWindowResize();

// ===== 活动栏配置 =====
const topActivityItems = computed<ActivityItem[]>(() => [
  { id: 'explorer', label: t('activityBar.explorer'), icon: '🗋' },
  { id: 'search', label: t('activityBar.search'), icon: '🔍' },
]);

const bottomActivityItems = computed<ActivityItem[]>(() => []);

const activityItems = computed<ActivityItem[]>(() => [...topActivityItems.value, ...bottomActivityItems.value]);

const activeActivityTitle = ref(t('sidebar.explorer'));

const sidebarSections = ref<SideBarSection[]>([
  { id: 'explorer', label: t('sidebar.explorer'), count: 0 },
]);

/** 活动栏切换：点击同一项 → 折叠侧边栏；不同项 → 切换内容 */
function onActivitySelect(id: string) {
  if (activeActivity.value === id && !sidebarCollapsed.value) {
    toggleSidebar();
    return;
  }
  activeActivity.value = id;
  const allItems = activityItems.value;
  const item = allItems.find(i => i.id === id);
  if (item) {
    activeActivityTitle.value = item.label.replace(/\s*\(.*/, '').toUpperCase();
  }
  if (sidebarCollapsed.value) {
    toggleSidebar();
  }
  if (id === 'explorer') {
    sidebarSections.value = [
      { id: 'explorer', label: t('sidebar.explorer'), count: store.fileTreeNodes.length },
    ];
  } else if (id === 'search') {
    sidebarSections.value = [
      { id: 'search', label: t('sidebar.search'), count: undefined },
    ];
  } else {
    sidebarSections.value = [
      { id: 'placeholder', label: t('sidebar.comingSoon'), count: undefined },
    ];
  }
}

// ===== 文件树展开/加载状态 =====
const expandedDirs = ref(new Set<string>());
const loadingDirs = ref(new Set<string>());
const dirChildren = ref<Record<string, any[]>>({});
let isResizingSidebar = false;
let isResizingAgent = false;

// ===== 另存为对话框状态 =====
const showSaveDialog = ref(false);
const saveDialogDefaultName = ref('');
const showAboutDialog = ref(false);
let saveDialogResolver: ((value: string | null) => void) | null = null;

// ===== Agent 编辑快照（用于撤销） =====
const editSnapshots = ref<Map<string, string>>(new Map());
const lastEditedFiles = ref<string[]>([]);

/** 撤销 Agent 最近一次的所有编辑 */
async function undoLastEdits() {
  if (lastEditedFiles.value.length === 0) return;

  for (const filePath of lastEditedFiles.value) {
    const original = editSnapshots.value.get(filePath);
    if (original !== undefined) {
      try {
        await fs.client.writeFile(filePath, original);
        const tab = store.tabs.find(t => t.path === filePath);
        if (tab) {
          store.updateContent(tab.id, original);
          store.saveTab(tab.id);
        }
      } catch (e: any) {
        console.error('Failed to undo edit for', filePath, e);
      }
    }
  }

  editSnapshots.value.clear();
  lastEditedFiles.value = [];
}

/** 切换侧边栏折叠状态 */
function toggleSidebar() {
  if (sidebarCollapsed.value) {
    sidebarWidth.value = sidebarSavedWidth.value;
    sidebarCollapsed.value = false;
  } else {
    sidebarSavedWidth.value = sidebarWidth.value;
    sidebarWidth.value = 0;
    sidebarCollapsed.value = true;
  }
}

/** 注册到 useFileSystem 的"另存为"处理器（返回 Promise 等待用户选择路径） */
function handleSaveFileAs(): Promise<string | null> {
  return new Promise((resolve) => {
    saveDialogResolver = resolve;
    saveDialogDefaultName.value = store.activeTab?.name || 'untitled';
    showSaveDialog.value = true;
  });
}

function onSaveDialogConfirm(path: string) {
  showSaveDialog.value = false;
  saveDialogResolver?.(path);
  saveDialogResolver = null;
}

function onSaveDialogCancel() {
  showSaveDialog.value = false;
  saveDialogResolver?.(null);
  saveDialogResolver = null;
}

/** 处理工具栏编辑操作（撤销/重做/查找/替换/剪切/复制/粘贴） */
function handleEditAction(action: string) {
  const editor = getEditorInstance();
  if (!editor) return;
  editor.focus();
  switch (action) {
    case 'undo':
      editor.trigger('keyboard', 'undo', null);
      break;
    case 'redo':
      editor.trigger('keyboard', 'redo', null);
      break;
    case 'find':
      editor.getAction('actions.find')?.run();
      break;
    case 'replace':
      editor.getAction('editor.action.startFindReplaceAction')?.run();
      break;
    case 'cut': {
      const sel = editor.getSelection();
      if (sel && !sel.isEmpty()) {
        const model = editor.getModel();
        if (model) {
          const text = model.getValueInRange(sel);
          navigator.clipboard.writeText(text).then(() => {
            editor.executeEdits('cut', [{ range: sel, text: '' }]);
          }).catch(() => {});
        }
      }
      break;
    }
    case 'copy': {
      const sel = editor.getSelection();
      if (sel && !sel.isEmpty()) {
        const model = editor.getModel();
        if (model) {
          const text = model.getValueInRange(sel);
          navigator.clipboard.writeText(text).catch(() => {});
        }
      }
      break;
    }
    case 'paste': {
      navigator.clipboard.readText().then((text) => {
        if (text) {
          editor.executeEdits('paste', [{ range: editor.getSelection()!, text }]);
        }
      }).catch(() => {});
      break;
    }
  }
}

// 注册回调到 useFileSystem
fs.setSaveAsHandler(handleSaveFileAs);
fs.setOnAfterSave(handleAfterSave);

// 文件树节点数量变化时更新侧边栏计数
watch(() => store.fileTreeNodes.length, (count) => {
  if (activeActivity.value === 'explorer' && sidebarSections.value[0]) {
    sidebarSections.value = [
      { id: 'explorer', label: t('sidebar.explorer'), count },
    ];
  }
});

/**
 * 文件保存后的回调：刷新所有已展开目录的内容
 *
 * 并行重载根目录和所有已展开的子目录，保持文件树 UI 与磁盘同步。
 */
async function handleAfterSave(_savePath: string) {
  const dirsToReload = ['.', ...expandedDirs.value];
  const results = await Promise.all(
    dirsToReload.map(async (dir) => {
      try {
        const entries = await fs.readDirForPath(dir);
        const displayRoot = dir.startsWith('__root__') ? dir.slice(8) : dir;
        const resolved = entries.map((e: any) => ({ ...e, path: displayRoot.replace(/\/$/, '') + '/' + e.path }));
        return { dir, entries: resolved };
      } catch {
        return { dir, entries: null };
      }
    })
  );

  if (store.workspaceRoots.length > 0) {
    await fs.loadDirectory('.');
  } else {
    const rootResult = results.find(r => r.dir === '.');
    if (rootResult?.entries) {
      store.fileTreeNodes = rootResult.entries;
    }
  }

  const updates: Record<string, any[]> = { ...dirChildren.value };
  for (const { dir, entries } of results) {
    if (entries && dir !== '.') updates[dir] = entries;
  }
  dirChildren.value = updates;
  loadingDirs.value = new Set();
}

/** 清空所有文件树展开/缓存状态 */
function clearDirState() {
  expandedDirs.value = new Set();
  loadingDirs.value = new Set();
  dirChildren.value = {};
}

/** 打开文件夹并重置文件树状态 */
async function handleOpenFolder() {
  clearDirState();
  await fs.openFolderDialog();
}

/** 连接到服务端并重置文件树状态 */
async function handleConnectServer() {
  clearDirState();
  await fs.connectToServer();
}

function isFileDrag(dataTransfer: DataTransfer | null): boolean {
  return Boolean(dataTransfer && Array.from(dataTransfer.types).includes('Files'));
}

function resetDragState() {
  dragDepth = 0;
  isDraggingFolder.value = false;
}

function handleDragEnter(e: DragEvent) {
  if (!isFileDrag(e.dataTransfer)) return;
  e.preventDefault();
  dragDepth += 1;
  isDraggingFolder.value = true;
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
}

function handleDragOver(e: DragEvent) {
  if (!isFileDrag(e.dataTransfer)) return;
  e.preventDefault();
  isDraggingFolder.value = true;
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
}

function handleDragLeave(e: DragEvent) {
  if (!isDraggingFolder.value) return;
  e.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) isDraggingFolder.value = false;
}

async function handleDrop(e: DragEvent) {
  if (!isFileDrag(e.dataTransfer)) return;
  e.preventDefault();
  const dataTransfer = e.dataTransfer;
  resetDragState();

  const opened = await fs.openDroppedFolder(dataTransfer);
  if (!opened) return;

  activeActivity.value = 'explorer';
  activeActivityTitle.value = t('sidebar.explorer');
  sidebarSections.value = [
    { id: 'explorer', label: t('sidebar.explorer'), count: store.fileTreeNodes.length },
  ];
  if (sidebarCollapsed.value) toggleSidebar();
}

/**
 * 展开/折叠目录（懒加载）
 *
 * 首次展开时异步加载子节点，已加载的直接切换折叠状态。
 */
async function handleExpandDir(dirPath: string) {
  const s = new Set(expandedDirs.value);
  if (s.has(dirPath)) {
    s.delete(dirPath);
    expandedDirs.value = s;
    return;
  }
  s.add(dirPath);
  expandedDirs.value = s;

  loadingDirs.value = new Set([...loadingDirs.value, dirPath]);
  try {
    const entries = await fs.readDirForPath(dirPath);
    // 多工作区：子条目路径拼接完整前缀（去除 __root__ 后拼接），保证 resolveClient 能匹配
    const displayRoot = dirPath.startsWith('__root__') ? dirPath.slice(8) : dirPath;
    const resolved = entries.map((e: any) => ({ ...e, path: displayRoot.replace(/\/$/, '') + '/' + e.path }));
    dirChildren.value = { ...dirChildren.value, [dirPath]: resolved };
  } catch { /* 忽略读取失败 */ }
  loadingDirs.value = new Set([...loadingDirs.value].filter(d => d !== dirPath));
}

onMounted(async () => {
  if (window.electronAPI) {
    isMaximized.value = await window.electronAPI.isMaximized();
    window.electronAPI.onMaximizeChange((max: boolean) => {
      isMaximized.value = max;
    });

    window.electronAPI.onMenuAction((action: string) => {
      switch (action) {
        case 'new-file':
          store.newUntitled();
          break;
        case 'new-folder':
          fs.createFolder();
          break;
        case 'open-folder':
          handleOpenFolder();
          break;
        case 'connect-server':
          handleConnectServer();
          break;
        case 'open-local-file':
          fs.openLocalFile();
          break;
        case 'save':
          fs.saveCurrentFile();
          break;
        case 'edit-cut':
        case 'edit-copy':
        case 'edit-paste':
        case 'edit-undo':
        case 'edit-redo':
        case 'edit-find':
        case 'edit-replace':
          handleEditAction(action.replace('edit-', ''));
          break;
      }
    });
  }
});

/** 侧边栏（文件树）宽度拖拽 */
function startSidebarResize(e: MouseEvent) {
  e.preventDefault();
  isResizingSidebar = true;
  const startX = e.clientX;
  const startWidth = sidebarWidth.value;

  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  const onMove = (ev: MouseEvent) => {
    if (!isResizingSidebar) return;
    sidebarWidth.value = Math.max(200, Math.min(500, startWidth + (ev.clientX - startX)));
  };

  const onUp = () => {
    isResizingSidebar = false;
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

/** Agent 面板宽度拖拽（向左拖拽拉宽面板） */
function startAgentResize(e: MouseEvent) {
  e.preventDefault();
  isResizingAgent = true;
  const startX = e.clientX;
  const startWidth = agentWidth.value;

  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  const onMove = (ev: MouseEvent) => {
    if (!isResizingAgent) return;
    agentWidth.value = Math.max(200, Math.min(600, startWidth - (ev.clientX - startX)));
  };

  const onUp = () => {
    isResizingAgent = false;
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

/**
 * 应用 Agent 生成的编辑操作
 *
 * 对每个编辑：
 * 1. 解析文件路径（LLM 生成相对路径，需拼接 workspaceRoot）
 * 2. 备份原内容（供撤销使用）
 * 3. 写入新内容
 * 4. 更新已打开的标签页或自动打开新标签
 * 5. 刷新文件树
 */
async function handleApplyEdits(edits: ParsedEdit[]) {
  editSnapshots.value.clear();
  lastEditedFiles.value = [];

  for (const edit of edits) {
    try {
      // LLM 基于文件树生成相对路径（如 packages/web/src/App.vue）
      // 仅当 workspaceRoot 为真实绝对路径时才作为前缀拼接
      const root = store.workspaceRoot;
      const isRealPath = root && (root.startsWith('/') || /^[A-Z]:[\\/]/i.test(root));
      const resolvedPath = edit.path.startsWith('/') || edit.path.includes(':')
        ? edit.path
        : isRealPath
          ? root.replace(/[\/\\]?$/, '/') + edit.path
          : edit.path;

      // 备份原始内容
      try {
        const original = await fs.client.readFile(resolvedPath);
        editSnapshots.value.set(resolvedPath, original);
      } catch {
        // 新文件，无需备份
      }
      lastEditedFiles.value.push(resolvedPath);

      await fs.client.writeFile(resolvedPath, edit.content);

      // 更新已打开的标签页：精确匹配 + 后缀模糊匹配
      let tab = store.tabs.find(t => t.path === resolvedPath);
      if (!tab) tab = store.tabs.find(t => t.path.endsWith('/' + edit.path) || t.path.endsWith('\\' + edit.path));
      if (!tab && resolvedPath === edit.path) tab = store.tabs.find(t => t.path.endsWith(edit.path));
      if (tab) {
        store.updateContent(tab.id, edit.content);
        store.saveTab(tab.id);
      } else {
        // 文件未打开，自动打开并标记为已保存
        store.openFile(resolvedPath, edit.content);
        store.saveTab(store.activeTabId!);
      }

      // 刷新文件树以反映变化
      if (store.fileTreeNodes.length > 0) {
        fs.loadDirectory('.').catch(() => {});
      }
    } catch (e: any) {
      fs.error = `Edit failed: ${edit.path} - ${e.message}`;
    }
  }
}
</script>

<style scoped>
.main-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
}
.main-layout.drag-over {
  position: relative;
}
.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.sidebar {
  background: var(--bg-secondary);
  overflow-y: auto;
  flex-shrink: 0;
}
.resize-handle {
  width: 4px;
  cursor: col-resize;
  background: var(--border-color);
  flex-shrink: 0;
}
.resize-handle:hover {
  background: var(--accent-color);
}
.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.tabs-bar {
  display: flex;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
  overflow-x: auto;
  flex-shrink: 0;
}
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  border-right: 1px solid var(--border-color);
  white-space: nowrap;
  user-select: none;
}
.tab.active {
  background: var(--bg-primary);
  color: var(--text-primary);
}
.tab:hover {
  background: var(--bg-hover);
}
.tab-dirty {
  color: var(--accent-color);
}
.tab-close {
  font-size: 12px;
  opacity: 0.6;
}
.tab-close:hover {
  opacity: 1;
  color: #f44747;
}
.editor-container {
  flex: 1;
  overflow: hidden;
}
.editor-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.placeholder-content {
  text-align: center;
}
.placeholder-title {
  font-size: 28px;
  font-weight: 300;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.placeholder-hint {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 24px;
}
.placeholder-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
}
.placeholder-btn {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
}
.placeholder-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent-color);
}
.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.28);
}
.drop-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 280px;
  padding: 22px 30px;
  border: 1px dashed var(--accent-color);
  border-radius: 8px;
  background: rgba(30, 30, 30, 0.94);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.38);
}
.drop-title {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 600;
}
.drop-subtitle {
  color: var(--text-secondary);
  font-size: 13px;
}
.agent-resize-handle {
  width: 4px;
  cursor: col-resize;
  background: var(--border-color);
  flex-shrink: 0;
}
.agent-resize-handle:hover {
  background: var(--accent-color);
}
.agent-sidebar {
  flex-shrink: 0;
  border-left: 1px solid var(--border-color);
}
.undo-notification {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--accent-color);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 1001;
  font-size: 13px;
}
.undo-text {
  color: var(--text-primary);
}
.undo-btn {
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
  border: none;
  border-radius: 4px;
  background: var(--accent-color);
  color: #fff;
}
.undo-btn:hover {
  opacity: 0.9;
}
.undo-dismiss {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
}
.undo-dismiss:hover {
  color: var(--text-primary);
}
.resize-handle {
  position: fixed;
  z-index: 9999;
}
.resize-n {
  top: 0; left: 0; right: 0; height: 4px;
  cursor: ns-resize;
}
.resize-s {
  bottom: 0; left: 0; right: 0; height: 4px;
  cursor: ns-resize;
}
.resize-e {
  top: 0; right: 0; bottom: 0; width: 4px;
  cursor: ew-resize;
}
.resize-w {
  top: 0; left: 0; bottom: 0; width: 4px;
  cursor: ew-resize;
}
.resize-ne {
  top: 0; right: 0; width: 8px; height: 8px;
  cursor: nesw-resize;
}
.resize-nw {
  top: 0; left: 0; width: 8px; height: 8px;
  cursor: nwse-resize;
}
.resize-se {
  bottom: 0; right: 0; width: 8px; height: 8px;
  cursor: nwse-resize;
}
.resize-sw {
  bottom: 0; left: 0; width: 8px; height: 8px;
  cursor: nesw-resize;
}
</style>
