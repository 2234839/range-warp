<script setup lang="ts">
  import { ref, watch, onMounted, computed } from 'vue';
  import { useStorage, useDebounceFn, useIntervalFn } from '@vueuse/core';
  import EditorCore from './components/EditorCore.vue';
  import diff from 'fast-diff';
  import Prism from 'prismjs';
  import 'prismjs/themes/prism-tomorrow.css';
  import 'prismjs/components/prism-markup';
  import { html as formatHTML } from 'js-beautify';

  /** EditorCore 组件引用 */
  const editorRef = ref<InstanceType<typeof EditorCore> | null>(null);

  /** 编辑器内容 - 使用 localStorage 持久化 */
  const editorContent = useStorage<string>('range-warp-editor-content', '', localStorage);

  /** 格式化后的 HTML（使用 js-beautify） */
  const formattedHTML = computed(() => {
    if (!editorContent.value) return '';

    try {
      return formatHTML(editorContent.value, {
        indent_size: 2,
        wrap_line_length: 0,
        // 将默认的 inline 标签设为空数组，这样所有标签都会换行和缩进
        inline: [],
        // 不排除任何标签的格式化
        unformatted: [],
        end_with_newline: false,
        indent_inner_html: true,
        indent_body_inner_html: true,
      });
    } catch (e) {
      console.error('HTML 格式化失败:', e);
      return editorContent.value;
    }
  });

  /** 高亮后的 HTML（使用 Prism 语法高亮） */
  const highlightedHTML = computed(() => {
    if (!formattedHTML.value) return '<span class="text-gray-500">(空内容)</span>';
    return Prism.highlight(formattedHTML.value, Prism.languages.markup, 'markup');
  });

  /** 保存状态：'idle' | 'saving' | 'saved' */
  const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle');

  /** 倒计时（毫秒） */
  const saveCountdown = ref(0);

  /** 节流保存函数（500ms） */
  const debouncedSave = useDebounceFn(() => {
    saveStatus.value = 'saving';

    setTimeout(() => {
      saveStatus.value = 'saved';
      setTimeout(() => {
        saveStatus.value = 'idle';
      }, 2000);
    }, 100);
  }, 500);

  /** 启动倒计时 */
  const { pause } = useIntervalFn(
    () => {
      if (saveCountdown.value > 0) {
        saveCountdown.value -= 100;
      } else {
        pause();
      }
    },
    100,
    { immediate: true }
  );

  /** 保存状态文本 */
  const saveStatusText = computed(() => {
    if (saveStatus.value === 'saving') return '保存中...';
    if (saveStatus.value === 'saved') return '已保存';
    if (saveCountdown.value > 0) return `${Math.ceil(saveCountdown.value / 1000)}秒后保存`;
    return '';
  });

  /** 触发保存 */
  const triggerSave = () => {
    debouncedSave();
    saveCountdown.value = 500;
  };

  /** 当前激活的 Tab */
  const activeTab = ref<'info' | 'bookmarks' | 'revisions'>('info');

  /** 当前选中的文本范围 - 使用编辑器内部的持久化选区 */
  const selectedRange = computed(() => editorRef.value?.currentSelection || { start: 0, end: 0, text: '' });

  /** 编辑器实例（便捷访问） */
  const editor = computed(() => editorRef.value?.editor);

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
    if (!editor.value || selectedRange.value.start === selectedRange.value.end) return;

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

  /** 创建插入修订 */
  function createInsertRevision() {
    if (!editor.value || selectedRange.value.start === selectedRange.value.end) return;

    const { start, end } = selectedRange.value;

    // 创建插入修订，将选中文本标记为插入内容
    const range = editor.value.createRange(start, end);
    editor.value.revisions.createInsert({
      range,
      author: 'current-user',
      comment: '手动标记的插入修订',
    });

    refreshRevisions();
  }

  /** 创建删除修订 */
  function createDeleteRevision() {
    if (!editor.value || selectedRange.value.start === selectedRange.value.end) return;

    const { start, end } = selectedRange.value;

    // 创建删除修订，将选中文本标记为待删除内容
    const range = editor.value.createRange(start, end);
    editor.value.revisions.createDelete({
      range,
      author: 'current-user',
      comment: '手动标记的删除修订',
    });

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
    if (!editor.value || selectedRange.value.start === selectedRange.value.end) return;
    if (!comparisonText.value.trim()) return;

    const originalText = selectedOriginalText.value;
    const newText = comparisonText.value;

    // 使用 fast-diff 进行文本对比
    const diffResult = diff(originalText, newText);

    const { start } = selectedRange.value;
    let currentPosition = start;

    /** Unicode 字符长度 */
    const strLen = (s: string) => { let n = 0; for (const _ of s) n++; return n; };

    // 构建操作列表并计算位置
    const operations: Array<{ type: number; text: string; position: number }> = [];
    for (const [type, text] of diffResult) {
      operations.push({
        type,
        text,
        position: currentPosition,
      });
      if (type === diff.EQUAL || type === diff.DELETE) {
        currentPosition += strLen(text);
      }
    }

    // 从后往前执行，避免位置偏移
    for (let i = operations.length - 1; i >= 0; i--) {
      const operation = operations[i];
      const { type, text, position } = operation;

      if (type === diff.EQUAL) {
        // 相同部分，无需处理
        continue;
      }

      const endPos = position + strLen(text);

      if (type === diff.INSERT) {
        // 插入操作：使用 Range 的 insertText
        const range = editor.value!.createRange(position, position);
        range.insertText(text);
        // 创建插入修订
        const newRange = editor.value!.createRange(position, position + strLen(text));
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

  /** 接受所有修订 */
  function acceptAllRevisions() {
    if (!editor.value) return;
    editor.value.revisions.acceptAll();
    refreshRevisions();
  }

  /** 拒绝所有修订 */
  function rejectAllRevisions() {
    if (!editor.value) return;
    editor.value.revisions.rejectAll();
    refreshRevisions();
  }

  /** 接受修订 */
  function acceptRevision(id: string) {
    if (!editor.value) return;
    editor.value.revisions.acceptById(id);
    refreshRevisions();
  }

  /** 拒绝修订 */
  function rejectRevision(id: string) {
    if (!editor.value) return;
    editor.value.revisions.rejectById(id);
    refreshRevisions();
  }

  /** 监听编辑器初始化 */
  onMounted(() => {
    // 等待编辑器初始化完成后刷新数据
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
  <div class="min-h-screen flex flex-col bg-gray-50">
    <!-- 主要内容区域 -->
    <main class="flex-1 py-3 px-4">
      <div class="max-w-7xl mx-auto">
        <div class="flex gap-1">
          <!-- 左侧：HTML 源码面板 -->
          <div class="w-80 bg-white rounded-lg border border-gray-300 shadow-sm flex flex-col">
            <div class="p-3 border-b border-gray-200">
              <h2 class="text-sm font-semibold text-gray-800">HTML 源码</h2>
            </div>
            <div class="flex-1 overflow-auto">
              <pre class="language-html h-full m-0! text-sm!"><code class="text-xs block p-3" v-html="highlightedHTML"></code></pre>
            </div>
            <!-- 保存状态 -->
            <div class="px-4 py-2 border-t border-gray-200 text-xs flex items-center justify-between">
              <span v-if="saveStatusText" :class="[
                  'flex items-center gap-1',
                  saveStatus === 'saving' ? 'text-blue-600' : saveStatus === 'saved' ? 'text-green-600' : 'text-gray-600'
                ]">
                <span v-if="saveStatus === 'saving'"
                  class="inline-block w-2 h-2 bg-blue-600 rounded-full animate-pulse">
                </span>
                <span v-else-if="saveStatus === 'saved'" class="inline-block w-2 h-2 bg-green-600 rounded-full">
                </span>
                {{ saveStatusText }}
              </span>
              <span v-else class="text-gray-400">就绪</span>
            </div>
          </div>

          <!-- 中间：富文本编辑器 -->
          <EditorCore ref="editorRef" :model-value="editorContent"
            @update:model-value="(html) => { editorContent = html; triggerSave(); }" />

          <!-- 右侧：信息面板 -->
          <div class="w-80 bg-white rounded-lg border border-gray-300 shadow-sm flex flex-col">
            <!-- Tab 标签 -->
            <div class="flex border-b border-gray-200">
              <button @click="activeTab = 'info'"
                :class="['flex-1 px-4 py-2 text-sm font-medium transition-colors', activeTab === 'info' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-900']">
                信息
              </button>
              <button @click="activeTab = 'bookmarks'"
                :class="['flex-1 px-4 py-2 text-sm font-medium transition-colors', activeTab === 'bookmarks' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-900']">
                书签
              </button>
              <button @click="activeTab = 'revisions'"
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
              </div>

              <!-- 书签面板 -->
              <div v-else-if="activeTab === 'bookmarks'" class="p-4">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-sm font-semibold">书签列表</h3>
                  <button @click="createBookmark" :disabled="selectedRange.start === selectedRange.end"
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
                    <button @click="toggleComparisonInput" :disabled="selectedRange.start === selectedRange.end"
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
                    <button @click="createInsertRevision" :disabled="selectedRange.start === selectedRange.end"
                      class="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed">
                      + 插入修订
                    </button>
                    <button @click="createDeleteRevision" :disabled="selectedRange.start === selectedRange.end"
                      class="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed">
                      + 删除修订
                    </button>
                  </div>
                </div>

                <!-- 批量操作 -->
                <div class="flex items-center justify-between mb-3 border-t border-gray-200 pt-3">
                  <span class="text-xs text-gray-600">批量操作</span>
                  <div class="flex gap-1">
                    <button @click="acceptAllRevisions" :disabled="revisions.length === 0"
                      class="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed">
                      全部接受
                    </button>
                    <button @click="rejectAllRevisions" :disabled="revisions.length === 0"
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
                        <button @click="acceptRevision(revision.id)"
                          class="px-2 py-0.5 bg-green-500 text-white rounded text-xs hover:bg-green-600">
                          接受
                        </button>
                        <button @click="rejectRevision(revision.id)"
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
          <router-link to="/demo"
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
