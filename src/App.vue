<script setup lang="ts">
  import { ref, watch, onMounted } from 'vue';
  import EditorCore from './components/EditorCore.vue';

  /** EditorCore 组件引用 */
  const editorRef = ref<InstanceType<typeof EditorCore> | null>(null);

  /** 当前激活的 Tab */
  const activeTab = ref<'info' | 'bookmarks' | 'revisions'>('info');

  /** 当前选中的文本范围 */
  const selectedRange = ref({
    start: 0,
    end: 0,
    text: '',
  });

  /** 编辑器 HTML 内容 */
  const editorHTML = ref('');

  /** 书签列表 */
  const bookmarks = ref<Array<{ id: string; name: string; createTime: number }>>([]);

  /** 修订列表 */
  const revisions = ref<Array<{ id: string; type: 'insert' | 'delete'; author: string; createTime: number; text: string }>>([]);

  /** 处理编辑器选择变化 */
  const handleSelectionChange = (start: number, end: number, text: string) => {
    selectedRange.value = { start, end, text };
    // 同时更新 HTML 展示
    if (editorRef.value) {
      editorHTML.value = editorRef.value.getHTML();
    }
  };

  /** 刷新书签列表 */
  const refreshBookmarks = () => {
    if (!editorRef.value?.editor) return;
    const bookmarkList = editorRef.value.editor.getAllBookmarks();
    bookmarks.value = bookmarkList.map((bm) => ({
      id: bm.metadata.id,
      name: bm.metadata.name,
      createTime: bm.metadata.createTime,
    }));
  };

  /** 刷新修订列表 */
  const refreshRevisions = () => {
    if (!editorRef.value?.editor) return;
    const revisionList = editorRef.value.editor.getAllRevisions();
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
    if (!editorRef.value?.editor || selectedRange.value.start === selectedRange.value.end) return;

    const { start, end } = selectedRange.value;

    editorRef.value.editor.createBookmark({
      name: `书签 ${bookmarks.value.length + 1}`,
      start,
      end,
    });

    refreshBookmarks();
  }

  /** 跳转到书签 */
  function gotoBookmark(id: string) {
    if (!editorRef.value?.editor) return;
    editorRef.value.editor.gotoBookmark(id);
  }

  /** 删除书签 */
  function deleteBookmark(id: string) {
    if (!editorRef.value?.editor) return;
    editorRef.value.editor.deleteBookmark(id);
    refreshBookmarks();
  }

  /** 创建插入修订 */
  function createInsertRevision() {
    if (!editorRef.value?.editor || selectedRange.value.start === selectedRange.value.end) return;

    const { start, end } = selectedRange.value;

    // 创建插入修订，将选中文本标记为插入内容
    const range = editorRef.value.editor.createRange(start, end);
    editorRef.value.editor.revisions.createInsert({
      range,
      author: 'current-user',
      comment: '手动标记的插入修订',
    });

    refreshRevisions();
  }

  /** 创建删除修订 */
  function createDeleteRevision() {
    if (!editorRef.value?.editor || selectedRange.value.start === selectedRange.value.end) return;

    const { start, end } = selectedRange.value;

    // 创建删除修订，将选中文本标记为待删除内容
    const range = editorRef.value.editor.createRange(start, end);
    editorRef.value.editor.revisions.createDelete({
      range,
      author: 'current-user',
      comment: '手动标记的删除修订',
    });

    refreshRevisions();
  }

  /** 接受所有修订 */
  function acceptAllRevisions() {
    if (!editorRef.value?.editor) return;
    editorRef.value.editor.revisions.acceptAll();
    refreshRevisions();
  }

  /** 拒绝所有修订 */
  function rejectAllRevisions() {
    if (!editorRef.value?.editor) return;
    editorRef.value.editor.revisions.rejectAll();
    refreshRevisions();
  }

  /** 接受修订 */
  function acceptRevision(id: string) {
    if (!editorRef.value?.editor) return;
    editorRef.value.editor.revisions.acceptById(id);
    refreshRevisions();
  }

  /** 拒绝修订 */
  function rejectRevision(id: string) {
    if (!editorRef.value?.editor) return;
    editorRef.value.editor.revisions.rejectById(id);
    refreshRevisions();
  }

  /** 监听编辑器初始化 */
  onMounted(() => {
    // 等待编辑器初始化完成后刷新数据
    watch(
      () => editorRef.value?.editor,
      (editor) => {
        if (editor) {
          refreshBookmarks();
          refreshRevisions();
        }
      },
      { immediate: true }
    );
  });

  /** 监听标签切换，刷新对应数据 */
  watch(activeTab, (newTab) => {
    if (!editorRef.value?.editor) return;

    if (newTab === 'bookmarks') {
      refreshBookmarks();
    } else if (newTab === 'revisions') {
      refreshRevisions();
    }
  });
</script>

<template>
  <div class="min-h-screen flex flex-col bg-gray-50">
    <!-- 主要内容区域 -->
    <main class="flex-1 py-3 px-4">
      <div class="max-w-7xl mx-auto">
        <div class="flex gap-1">
          <!-- 左侧：富文本编辑器 -->
          <EditorCore
            ref="editorRef"
            @selection-change="handleSelectionChange"
            @update:model-value="(html) => editorHTML = html" />

          <!-- 右侧：信息面板 -->
          <div class="w-80 bg-white rounded-lg border border-gray-300 shadow-sm flex flex-col">
            <!-- Tab 标签 -->
            <div class="flex border-b border-gray-200">
              <button
                @click="activeTab = 'info'"
                :class="['flex-1 px-4 py-2 text-sm font-medium transition-colors', activeTab === 'info' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-900']">
                信息
              </button>
              <button
                @click="activeTab = 'bookmarks'"
                :class="['flex-1 px-4 py-2 text-sm font-medium transition-colors', activeTab === 'bookmarks' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-900']">
                书签
              </button>
              <button
                @click="activeTab = 'revisions'"
                :class="['flex-1 px-4 py-2 text-sm font-medium transition-colors', activeTab === 'revisions' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-900']">
                修订
              </button>
            </div>

            <!-- Tab 内容 -->
            <div class="flex-1 overflow-hidden flex flex-col">
              <!-- 信息面板 -->
              <div v-if="activeTab === 'info'" class="p-4 space-y-3 overflow-auto">
                <!-- 选区信息 -->
                <div v-if="selectedRange.start !== selectedRange.end">
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

                <!-- HTML 源码展示 -->
                <div class="pt-2 border-t border-gray-200">
                  <h3 class="text-sm font-semibold mb-2">HTML 源码</h3>
                  <div class="max-h-48 overflow-auto bg-gray-900 rounded p-3">
                    <pre class="text-xs text-gray-300 font-mono whitespace-pre-wrap break-all">{{ editorHTML || '(空内容)' }}</pre>
                  </div>
                </div>
              </div>

              <!-- 书签面板 -->
              <div v-else-if="activeTab === 'bookmarks'" class="p-4">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-sm font-semibold">书签列表</h3>
                  <button
                    @click="createBookmark"
                    :disabled="selectedRange.start === selectedRange.end"
                    class="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed">
                    + 添加书签
                  </button>
                </div>
                <div class="space-y-2 max-h-96 overflow-auto">
                  <div v-if="bookmarks.length === 0" class="text-sm text-gray-500 text-center py-8">
                    暂无书签
                  </div>
                  <div
                    v-for="bookmark in bookmarks"
                    :key="bookmark.id"
                    class="p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                    <div class="flex items-center justify-between mb-1">
                      <span class="font-medium text-yellow-800">{{ bookmark.name }}</span>
                      <div class="flex gap-1">
                        <button
                          @click="gotoBookmark(bookmark.id)"
                          class="px-2 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600">
                          跳转
                        </button>
                        <button
                          @click="deleteBookmark(bookmark.id)"
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
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-sm font-semibold">修订列表</h3>
                  <div class="flex gap-1">
                    <button
                      @click="createInsertRevision"
                      :disabled="selectedRange.start === selectedRange.end"
                      class="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed">
                      + 插入修订
                    </button>
                    <button
                      @click="createDeleteRevision"
                      :disabled="selectedRange.start === selectedRange.end"
                      class="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed">
                      + 删除修订
                    </button>
                  </div>
                </div>
                <div class="flex items-center justify-between mb-3 border-t border-gray-200 pt-3">
                  <span class="text-xs text-gray-600">批量操作</span>
                  <div class="flex gap-1">
                    <button
                      @click="acceptAllRevisions"
                      :disabled="revisions.length === 0"
                      class="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed">
                      全部接受
                    </button>
                    <button
                      @click="rejectAllRevisions"
                      :disabled="revisions.length === 0"
                      class="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed">
                      全部拒绝
                    </button>
                  </div>
                </div>
                <div class="space-y-2 max-h-96 overflow-auto">
                  <div v-if="revisions.length === 0" class="text-sm text-gray-500 text-center py-8">
                    暂无修订
                  </div>
                  <div
                    v-for="revision in revisions"
                    :key="revision.id"
                    :class="[
                      'p-2 border rounded text-sm',
                      revision.type === 'insert' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                    ]">
                    <div class="flex items-center justify-between mb-1">
                      <span :class="['font-medium', revision.type === 'insert' ? 'text-green-800' : 'text-red-800']">
                        {{ revision.type === 'insert' ? '插入' : '删除' }}
                      </span>
                      <div class="flex gap-1">
                        <button
                          @click="acceptRevision(revision.id)"
                          class="px-2 py-0.5 bg-green-500 text-white rounded text-xs hover:bg-green-600">
                          接受
                        </button>
                        <button
                          @click="rejectRevision(revision.id)"
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
      </div>
    </main>

    <!-- 底部 -->
    <footer class="bg-gray-800 text-white py-6 px-4 mt-auto">
      <div class="max-w-6xl mx-auto text-center">
        <p class="mb-4">
          <router-link
            to="/demo"
            class="inline-flex items-center gap-2 text-blue-400 no-underline py-2 px-4 border border-blue-400 rounded-lg transition-all duration-300 bg-blue-400/10 hover:bg-blue-400 hover:text-white hover:-translate-y-0.5 hover:shadow-lg">
            📦 查看组件库演示
          </router-link>
        </p>
        <p class="text-sm opacity-80">
          RangeWrap © 2024 | 基于 DOM Range API 的富文本编辑器
        </p>
        <p class="text-xs opacity-60 mt-2">
          架构：适配器模式 + 依赖倒置原则
        </p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
  /* 滚动条样式 */
  ::-webkit-scrollbar {
    width: 8px;
  }

  ::-webkit-scrollbar-track {
    background: #f3f4f6;
  }

  ::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 9999px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: #9ca3af;
  }
</style>
