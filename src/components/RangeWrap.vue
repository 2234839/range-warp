<script setup lang="ts">
  import { ref, onMounted, onBeforeUnmount, useTemplateRef, readonly } from 'vue';
  import { useNativeEditor } from './useNativeEditor';
  import { EMPTY_FORMAT_STATE, STYLE_KEYS, TOOLBAR_BUTTONS, type FormatState } from './editor-utils';

  const editDiv = useTemplateRef('editDiv');


  /** 当前选中的文本格式状态 */
  const formatState = ref<FormatState>(EMPTY_FORMAT_STATE);

  /** 当前选中的文本范围 */
  const selectedRange = ref({
    start: 0,
    end: 0,
  });

  /** 当前选中的文本内容 */
  const selectedText = ref('');

  /** 组件事件定义 */
  interface Emits {
    selectionChange: [start: number, end: number];
    formatApply: [start: number, end: number, format: string];
  }

  const emit = defineEmits<Emits>();

  /** 原生编辑器 composable */
  const composable = useNativeEditor({
    containerRef: editDiv,
    currentUser: 'anonymous',
    onSelectionChange: () => {
      updateFormatState();
      updateSelectedRange();
    },
  });

  onMounted(() => {
    composable.init();
  });

  onBeforeUnmount(() => {
    composable.destroy();
  });

  /** 应用文本格式 - 支持切换状态 */
  function applyFormat(format: string, start?: number, end?: number) {
    const ed = composable.editor.value;
    if (!ed) return;

    const styleKey = STYLE_KEYS[format];
    if (!styleKey) return;

    /** 若未传入位置，从当前浏览器选区获取 */
    let rangeStart = start;
    let rangeEnd = end;
    if (rangeStart === undefined || rangeEnd === undefined) {
      const { ownerWindow } = composable.selectionContext.value;
      const selection = ownerWindow.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const rangeObj = ed.createRangeFromDOM(selection.getRangeAt(0));
      if (!rangeObj) return;
      rangeStart = rangeObj.start;
      rangeEnd = rangeObj.end;
    }

    if (formatState.value[styleKey]) {
      ed.removeStyle(rangeStart, rangeEnd, format);
    } else {
      ed.applyStyle(rangeStart, rangeEnd, format);
    }

    emit('formatApply', rangeStart, rangeEnd, format);
    setTimeout(updateFormatState, 0);
  }

  /** 更新格式状态 */
  function updateFormatState() {
    const ed = composable.editor.value;
    const { ownerWindow } = composable.selectionContext.value;
    if (!ed) return;

    const selection = ownerWindow.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.getRangeAt(0).collapsed) {
      formatState.value = EMPTY_FORMAT_STATE;
      return;
    }

    const rangeObj = ed.createRangeFromDOM(selection.getRangeAt(0));
    if (!rangeObj || rangeObj.start === rangeObj.end) {
      formatState.value = EMPTY_FORMAT_STATE;
      return;
    }

    formatState.value = ed.getFormatState(rangeObj.start, rangeObj.end);
  }

  /** 复制HTML内容 */
  function copyHTML() {
    navigator.clipboard.writeText(composable.getHTML());
  }

  /** 更新选中的文本范围 */
  function updateSelectedRange() {
    const ed = composable.editor.value;
    const { ownerWindow } = composable.selectionContext.value;
    if (!ed) return;

    const selection = ownerWindow.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.getRangeAt(0).collapsed) {
      selectedRange.value = { start: 0, end: 0 };
      selectedText.value = '';
      emit('selectionChange', 0, 0);
      return;
    }

    const rangeObj = ed.createRangeFromDOM(selection.getRangeAt(0));
    if (!rangeObj) return;

    selectedRange.value = { start: rangeObj.start, end: rangeObj.end };
    selectedText.value = rangeObj.getText();
    emit('selectionChange', rangeObj.start, rangeObj.end);
  }

  /** 暴露给父组件调用的方法 */
  defineExpose({
    applyFormat,
    selectedRange: readonly(selectedRange),
  });
</script>

<template>
  <div class="border border-gray-300 rounded-lg overflow-hidden font-sans bg-white shadow-sm">
    <!-- 工具栏 -->
    <div class="flex items-center p-2 bg-gray-50 border-b border-gray-200 gap-1">
      <template v-for="btn in TOOLBAR_BUTTONS" :key="btn.style">
        <div v-if="btn.divider" class="w-px h-6 bg-gray-300 mx-1"></div>
        <button
          @click="applyFormat(btn.style)"
          :class="[
            'p-2 border rounded text-sm min-w-[32px] h-8 flex items-center justify-center transition-all duration-200',
            btn.iconClass,
            formatState[STYLE_KEYS[btn.style]]
              ? 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400',
          ]"
          :title="btn.title">
          <component :is="btn.wrapTag" v-if="btn.wrapTag">{{ btn.label }}</component>
          <span v-else class="px-1 bg-yellow-200 rounded text-xs font-bold">{{ btn.label }}</span>
        </button>
      </template>

      <div class="w-px h-6 bg-gray-300 mx-1"></div>

      <!-- 功能按钮 -->
      <button
        @click="copyHTML()"
        class="p-2 border rounded text-sm bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400 min-w-[32px] h-8 flex items-center justify-center transition-all duration-200"
        title="复制HTML内容">
        📋
      </button>
    </div>

    <!-- 编辑区域 -->
    <div
      contenteditable="true"
      ref="editDiv"
      class="p-4 min-h-[200px] outline-none leading-relaxed text-sm whitespace-pre-wrap break-words focus:bg-gray-50/50">
      测试文本 测试中
    </div>

    <!-- 选中范围信息显示区域 -->
    <div
      v-if="selectedRange.start !== selectedRange.end"
      class="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
      选中: "{{ selectedText }}" ({{ selectedRange.start }}-{{ selectedRange.end }}, 长度: {{ selectedRange.end - selectedRange.start }}, Unicode长度: {{ Array.from(selectedText).length }})
    </div>
  </div>
</template>
<style scoped>
  /* 文本格式深度样式 */
  :deep(strong),
  :deep(b) {
    font-weight: bold;
  }

  :deep(em),
  :deep(i) {
    font-style: italic;
  }

  :deep(u) {
    text-decoration: underline;
  }

  :deep(s),
  :deep(strike) {
    text-decoration: line-through;
  }

  :deep(mark) {
    background-color: #fef08a;
    padding: 2px 4px;
    border-radius: 2px;
  }

  /* 焦点样式 */
  [contenteditable]:focus {
    outline: none;
  }

  /* 按钮焦点样式 */
  button:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }
</style>
