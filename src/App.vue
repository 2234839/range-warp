<script setup lang="ts">
  import { ref, watch, computed } from 'vue';
  import { useStorage, useDebounceFn } from '@vueuse/core';
  import EditorCore from './components/EditorCore.vue';
  import DomTreePanel from './components/DomTreePanel.vue';
  import diff from 'fast-diff';
  import { getUnicodeStringLength, findElementByPath, getElementPosition } from './core/utils';

  /** 编辑器模式 */
  type EditorMode = 'native' | 'ueditor-plus';
  const editorMode = useStorage<EditorMode>('range-warp-editor-mode', 'native', localStorage);

  /** EditorCore 组件引用 */
  const editorCoreRef = ref<InstanceType<typeof EditorCore> | null>(null);

  /** 编辑器内容 - 使用 localStorage 持久化 */
  const editorContent = useStorage<string>('range-warp-editor-content', '', localStorage);

  /** 统一的 Editor 实例 */
  const editor = computed(() => editorCoreRef.value?.editor ?? null);

  /**
   * DOM 树节点点击 → 通过元素路径在编辑器中选中对应 range
   */
  function handleTreeSelect(elementIndex: number) {
    const ec = editorCoreRef.value;
    if (!ec || !editor.value) return;

    const container = ec.container;
    if (!container) return;

    const element = findElementByPath(container, elementIndex);
    if (!element) return;

    const pos = getElementPosition(element, container);
    if (!pos) return;

    editor.value.createRange(pos.start, pos.end).select();
  }

  /** 保存状态 */
  const saveStatus = ref<'idle' | 'saved'>('idle');

  /** 防抖保存函数（500ms） */
  const debouncedSave = useDebounceFn(() => {
    saveStatus.value = 'saved';
    setTimeout(() => { saveStatus.value = 'idle'; }, 2000);
  }, 500);

  /** 保存状态文本 */
  const saveStatusText = computed(() => saveStatus.value === 'saved' ? '已保存' : '');

  /** 触发保存 */
  const triggerSave = () => debouncedSave();

  /** 当前激活的 Tab */
  const activeTab = ref<'info' | 'bookmarks' | 'revisions'>('info');

  /** Tab 配置 */
  const tabs: ReadonlyArray<{ key: typeof activeTab.value; label: string }> = [
    { key: 'info', label: '信息' },
    { key: 'bookmarks', label: '书签' },
    { key: 'revisions', label: '修订' },
  ];

  /** 当前选中的文本范围 */
  const selectedRange = computed(() => {
    return editorCoreRef.value?.persistentSelection || { start: 0, end: 0, text: '' };
  });

  /** 是否有选中文本 */
  const hasSelection = computed(() => selectedRange.value.start !== selectedRange.value.end);

  /** 书签列表 */
  const bookmarks = ref<Array<{ id: string; name: string; createTime: number }>>([]);

  /** 修订列表 */
  const revisions = ref<Array<{ id: string; type: 'insert' | 'delete'; author: string; createTime: number; text: string }>>([]);

  /** 比较功能：新文本输入 */
  const comparisonText = ref('');

  /** 是否显示比较输入框 */
  const showComparisonInput = ref(false);

  /** 选中的原始文本 */
  const selectedOriginalText = computed(() => selectedRange.value.text);

  /** 刷新书签列表 */
  const refreshBookmarks = () => {
    if (!editor.value) return;
    const bookmarkList = editor.value.getAllBookmarks();
    bookmarks.value = bookmarkList.map((bm) => ({
      id: bm.metadata.id,
      name: bm.metadata.name,
      createTime: bm.metadata.createTime,
    }));
  };

  /** 刷新修订列表 */
  const refreshRevisions = () => {
    if (!editor.value) return;
    const revisionList = editor.value.getAllRevisions();
    revisions.value = revisionList.map((rev) => ({
      id: rev.metadata.id,
      type: rev.metadata.type,
      author: rev.metadata.author,
      createTime: rev.metadata.createTime,
      text: rev.getText(),
    }));
  };

  /** 创建书签 */
  function createBookmark() {
    if (!editor.value || !hasSelection.value) return;

    const { start, end } = selectedRange.value;

    editor.value.createBookmark({
      name: `书签 ${bookmarks.value.length + 1}`,
      start,
      end,
    });

    refreshBookmarks();
  }

  /** 跳转到书签 */
  function gotoBookmark(id: string) {
    if (!editor.value) return;
    editor.value.gotoBookmark(id);
  }

  /** 删除书签 */
  function deleteBookmark(id: string) {
    if (!editor.value) return;
    editor.value.deleteBookmark(id);
    refreshBookmarks();
  }

  /** 创建修订 */
  function createRevision(type: 'insert' | 'delete') {
    if (!editor.value || !hasSelection.value) return;

    const { start, end } = selectedRange.value;
    const range = editor.value.createRange(start, end);

    const options = {
      range,
      author: 'current-user',
      comment: `手动标记的${type === 'insert' ? '插入' : '删除'}修订`,
    };

    type === 'insert'
      ? editor.value.revisions.createInsert(options)
      : editor.value.revisions.createDelete(options);

    refreshRevisions();
  }

  /** 切换比较输入框 */
  function toggleComparisonInput() {
    showComparisonInput.value = !showComparisonInput.value;
    if (showComparisonInput.value) {
      comparisonText.value = selectedOriginalText.value;
    }
  }

  /** 比较并创建修订 */
  function compareAndCreateRevisions() {
    if (!editor.value || !hasSelection.value) return;
    if (!comparisonText.value.trim()) return;

    const originalText = selectedOriginalText.value;
    const newText = comparisonText.value;

    // 使用 fast-diff 进行文本对比
    const diffResult = diff(originalText, newText);

    const { start } = selectedRange.value;
    let currentPosition = start;

    // 构建操作列表并计算位置
    const operations: Array<{ type: number; text: string; position: number }> = [];
    for (const [type, text] of diffResult) {
      operations.push({
        type,
        text,
        position: currentPosition,
      });
      if (type === diff.EQUAL || type === diff.DELETE) {
        currentPosition += getUnicodeStringLength(text);
      }
    }

    // 从后往前执行，避免位置偏移
    for (const { type, text, position } of [...operations].reverse()) {

      if (type === diff.EQUAL) {
        // 相同部分，无需处理
        continue;
      }

      const endPos = position + getUnicodeStringLength(text);

      if (type === diff.INSERT) {
        // 插入操作：使用 Range 的 insertText
        const range = editor.value!.createRange(position, position);
        range.insertText(text);
        // 创建插入修订
        const newRange = editor.value!.createRange(position, endPos);
        editor.value!.revisions.createInsert({
          range: newRange,
          author: 'current-user',
          comment: '通过对比生成的插入修订',
        });
      } else if (type === diff.DELETE) {
        // 删除操作：创建删除修订
        const range = editor.value!.createRange(position, endPos);
        editor.value!.revisions.createDelete({
          range,
          author: 'current-user',
          comment: '通过对比生成的删除修订',
        });
      }
    }

    // 清空输入框并隐藏
    comparisonText.value = '';
    showComparisonInput.value = false;

    // 刷新修订列表
    refreshRevisions();
  }

  /** 解决所有修订 */
  function resolveAllRevisions(isAccept: boolean) {
    if (!editor.value) return;
    isAccept ? editor.value.revisions.acceptAll() : editor.value.revisions.rejectAll();
    refreshRevisions();
  }

  /** 解决单个修订 */
  function resolveRevision(id: string, isAccept: boolean) {
    if (!editor.value) return;
    isAccept ? editor.value.revisions.acceptById(id) : editor.value.revisions.rejectById(id);
    refreshRevisions();
  }

  /** 编辑器初始化完成后刷新数据 */
  watch(
    () => editor.value,
    (ed) => {
      if (ed) {
        refreshBookmarks();
        refreshRevisions();
      }
    },
    { immediate: true }
  );

  /**
   * UEditor Plus 就绪后，将内容同步到新编辑器
   */
  watch(() => editorCoreRef.value?.ready, (isReady) => {
    if (isReady && editorContent.value) {
      editorCoreRef.value?.setHTML(editorContent.value);
    }
  });

  /** 监听标签切换，刷新对应数据 */
  watch(activeTab, (newTab) => {
    if (!editor.value) return;

    if (newTab === 'bookmarks') {
      refreshBookmarks();
    } else if (newTab === 'revisions') {
      refreshRevisions();
    }
  });
</script>

<template>
  <div class="h-screen flex flex-col bg-gray-100">
    <!-- 主要内容区域 -->
    <main class="flex-1 p-2 min-h-0">
      <div class="flex gap-2 h-full">
        <!-- 左侧：DOM 树面板 -->
        <div class="w-72 shrink-0 bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col min-h-0">
          <div class="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">DOM 树</h2>
          </div>
          <DomTreePanel :html="editorContent" @select="handleTreeSelect" />
          <!-- 保存状态 -->
          <div class="px-4 py-2 border-t border-gray-200 text-xs flex items-center justify-between">
            <span v-if="saveStatusText" class="flex items-center gap-1 text-green-600">
              <span class="inline-block w-2 h-2 bg-green-600 rounded-full"></span>
              {{ saveStatusText }}
            </span>
            <span v-else class="text-gray-400">就绪</span>
          </div>
        </div>

        <!-- 中间：富文本编辑器 -->
        <div class="flex-1 min-w-0 flex flex-col gap-2">
          <!-- 编辑器（:key 确保模式切换时重建组件） -->
          <EditorCore :key="editorMode" ref="editorCoreRef" v-model:mode="editorMode" :model-value="editorContent"
            @update:model-value="(html) => { editorContent = html; triggerSave(); }" />
        </div>

        <!-- 右侧：信息面板 -->
        <div class="w-72 shrink-0 bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col min-h-0">
            <!-- Tab 标签 -->
            <div class="flex border-b border-gray-200">
              <button v-for="tab in tabs" :key="tab.key" @click="activeTab = tab.key"
                :class="['flex-1 px-4 py-2 text-sm font-medium transition-colors', activeTab === tab.key ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-900']">
                {{ tab.label }}
              </button>
            </div>

            <!-- Tab 内容 -->
            <div class="flex-1 overflow-hidden flex flex-col">
              <!-- 信息面板 -->
              <div v-if="activeTab === 'info'" class="p-4 space-y-3 overflow-auto">
                <!-- 选区信息 -->
                <div v-if="hasSelection">
                  <div class="text-sm">
                    <span class="text-gray-600">起始位置:</span>
                    <span class="ml-2 font-mono">{{ selectedRange.start }}</span>
                  </div>

                  <div class="text-sm">
                    <span class="text-gray-600">结束位置:</span>
                    <span class="ml-2 font-mono">{{ selectedRange.end }}</span>
                  </div>

                  <div class="text-sm">
                    <span class="text-gray-600">长度:</span>
                    <span class="ml-2 font-mono">{{ selectedRange.end - selectedRange.start }}</span>
                  </div>

                  <div class="text-sm">
                    <span class="text-gray-600">选中内容:</span>
                    <div class="mt-1 p-2 bg-gray-50 rounded border border-gray-200 font-mono text-xs break-all">
                      "{{ selectedRange.text }}"
                    </div>
                  </div>
                </div>

                <div v-else class="text-sm text-gray-500 text-center py-8">
                  请在编辑器中选择文本
                </div>
              </div>

              <!-- 书签面板 -->
              <div v-else-if="activeTab === 'bookmarks'" class="p-4">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-sm font-semibold">书签列表</h3>
                  <button @click="createBookmark" :disabled="!hasSelection"
                    class="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed">
                    + 添加书签
                  </button>
                </div>
                <div class="space-y-2 max-h-96 overflow-auto">
                  <div v-if="bookmarks.length === 0" class="text-sm text-gray-500 text-center py-8">
                    暂无书签
                  </div>
                  <div v-for="bookmark in bookmarks" :key="bookmark.id"
                    class="p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                    <div class="flex items-center justify-between mb-1">
                      <span class="font-medium text-yellow-800">{{ bookmark.name }}</span>
                      <div class="flex gap-1">
                        <button @click="gotoBookmark(bookmark.id)"
                          class="px-2 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600">
                          跳转
                        </button>
                        <button @click="deleteBookmark(bookmark.id)"
                          class="px-2 py-0.5 bg-red-500 text-white rounded text-xs hover:bg-red-600">
                          删除
                        </button>
                      </div>
                    </div>
                    <div class="text-xs text-gray-600">
                      {{ new Date(bookmark.createTime).toLocaleString() }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- 修订面板 -->
              <div v-else-if="activeTab === 'revisions'" class="p-4">
                <!-- 比较并创建修订 -->
                <div class="mb-3 pb-3 border-b border-gray-200">
                  <div class="flex items-center justify-between mb-2">
                    <h3 class="text-sm font-semibold">对比创建修订</h3>
                    <button @click="toggleComparisonInput" :disabled="!hasSelection"
                      class="px-2 py-1 bg-purple-500 text-white rounded text-xs hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed">
                      {{ showComparisonInput ? '收起' : '展开' }}
                    </button>
                  </div>
                  <div v-if="showComparisonInput" class="space-y-2">
                    <div class="text-xs text-gray-600">
                      原文: "{{ selectedOriginalText }}"
                    </div>
                    <textarea v-model="comparisonText" placeholder="输入修改后的文本，系统将自动对比并生成修订..."
                      class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                      rows="3"></textarea>
                    <div class="flex gap-1">
                      <button @click="compareAndCreateRevisions" :disabled="!comparisonText.trim()"
                        class="flex-1 px-2 py-1 bg-purple-500 text-white rounded text-xs hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed">
                        对比并创建修订
                      </button>
                      <button @click="showComparisonInput = false; comparisonText = ''"
                        class="px-2 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400">
                        取消
                      </button>
                    </div>
                  </div>
                </div>

                <!-- 快速创建修订 -->
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-sm font-semibold">快速标记</h3>
                  <div class="flex gap-1">
                    <button @click="createRevision('insert')" :disabled="!hasSelection"
                      class="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed">
                      + 插入修订
                    </button>
                    <button @click="createRevision('delete')" :disabled="!hasSelection"
                      class="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed">
                      + 删除修订
                    </button>
                  </div>
                </div>

                <!-- 批量操作 -->
                <div class="flex items-center justify-between mb-3 border-t border-gray-200 pt-3">
                  <span class="text-xs text-gray-600">批量操作</span>
                  <div class="flex gap-1">
                    <button @click="resolveAllRevisions(true)" :disabled="revisions.length === 0"
                      class="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed">
                      全部接受
                    </button>
                    <button @click="resolveAllRevisions(false)" :disabled="revisions.length === 0"
                      class="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed">
                      全部拒绝
                    </button>
                  </div>
                </div>
                <div class="space-y-2 max-h-96 overflow-auto">
                  <div v-if="revisions.length === 0" class="text-sm text-gray-500 text-center py-8">
                    暂无修订
                  </div>
                  <div v-for="revision in revisions" :key="revision.id" :class="[
                      'p-2 border rounded text-sm',
                      revision.type === 'insert' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                    ]">
                    <div class="flex items-center justify-between mb-1">
                      <span :class="['font-medium', revision.type === 'insert' ? 'text-green-800' : 'text-red-800']">
                        {{ revision.type === 'insert' ? '插入' : '删除' }}
                      </span>
                      <div class="flex gap-1">
                        <button @click="resolveRevision(revision.id, true)"
                          class="px-2 py-0.5 bg-green-500 text-white rounded text-xs hover:bg-green-600">
                          接受
                        </button>
                        <button @click="resolveRevision(revision.id, false)"
                          class="px-2 py-0.5 bg-red-500 text-white rounded text-xs hover:bg-red-600">
                          拒绝
                        </button>
                      </div>
                    </div>
                    <div class="text-xs text-gray-600 mb-1">
                      {{ revision.author }} · {{ new Date(revision.createTime).toLocaleString() }}
                    </div>
                    <div class="text-xs font-mono bg-gray-100 p-1 rounded">
                      "{{ revision.text }}"
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
    </main>

    <!-- 底部 -->
    <footer class="bg-gray-800 text-white px-4 py-2 flex items-center justify-between text-xs">
      <span class="opacity-60">RangeWrap - 基于 DOM Range API 的富文本编辑器</span>
      <router-link to="/demo"
        class="text-blue-400 no-underline hover:text-blue-300 transition-colors">
        查看组件库演示
      </router-link>
    </footer>
  </div>
</template>
