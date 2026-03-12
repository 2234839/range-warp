<script setup lang="ts">
  import { ref, onMounted, useTemplateRef, readonly } from 'vue';
  import { Editor, DOMRangeAdapter } from '../core/index';
  import type { Editor as EditorType } from '../core/index';
  import { EMPTY_FORMAT_STATE, STYLE_KEYS, getSelectionPosition } from './editor-utils';

  const editDiv = useTemplateRef('editDiv');

  /** Editor 实例 */
  const editor = ref<EditorType | null>(null);

  /** 当前选中的文本格式状态 */
  const formatState = ref({ ...EMPTY_FORMAT_STATE });

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

  /** 防止递归触发 */
  const isProcessing = ref(false);

  onMounted(() => {
    if (!editDiv.value) return;

    const adapter = new DOMRangeAdapter({
      container: editDiv.value,
    });

    editor.value = new Editor({
      adapter,
    });
  });

  /** 应用文本格式 - 支持切换状态 */
  function applyFormat(format: string, start?: number, end?: number) {
    if (!editor.value) return;

    const styleKey = STYLE_KEYS[format];
    if (!styleKey) return;

    /** 若未传入位置，从当前选区获取 */
    let rangeStart = start;
    let rangeEnd = end;
    if (rangeStart === undefined || rangeEnd === undefined) {
      if (!editDiv.value) return;
      const pos = getSelectionPosition(editDiv.value);
      if (!pos) return;
      rangeStart = pos.start;
      rangeEnd = pos.end;
    }

    if (formatState.value[styleKey]) {
      editor.value.removeStyle(rangeStart, rangeEnd, format);
    } else {
      editor.value.applyStyle(rangeStart, rangeEnd, format);
    }

    emit('formatApply', rangeStart, rangeEnd, format);
    setTimeout(updateFormatState, 0);
  }

  /** 更新格式状态 */
  function updateFormatState() {
    if (!editor.value || !editDiv.value) return;

    const pos = getSelectionPosition(editDiv.value);
    if (!pos || pos.start === pos.end) {
      formatState.value = { ...EMPTY_FORMAT_STATE };
      return;
    }

    formatState.value = editor.value.getFormatState(pos.start, pos.end);
  }

  /** 复制HTML内容 */
  function copyHTML() {
    if (!editDiv.value) return;

    const htmlContent = editDiv.value.innerHTML;

    navigator.clipboard.writeText(htmlContent);
  }

  /** 处理选择变化事件 */
  function handleSelectionChange() {
    if (!isProcessing.value) {
      updateFormatState();
      updateSelectedRange();
    }
  }

  /** 更新选中的文本范围 */
  function updateSelectedRange() {
    if (!editDiv.value) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.getRangeAt(0).collapsed) {
      selectedRange.value = { start: 0, end: 0 };
      selectedText.value = '';
      emit('selectionChange', 0, 0);
      return;
    }

    const pos = getSelectionPosition(editDiv.value);
    if (!pos) return;

    selectedRange.value = { start: pos.start, end: pos.end };
    selectedText.value = selection.getRangeAt(0).toString();
    emit('selectionChange', pos.start, pos.end);
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
      <!-- 格式化按钮组 -->
      <button
        @click="applyFormat('bold')"
        :class="[
          'p-2 border rounded text-sm font-bold min-w-[32px] h-8 flex items-center justify-center transition-all duration-200',
          formatState.bold
            ? 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600'
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400',
        ]"
        title="加粗">
        <strong>B</strong>
      </button>

      <button
        @click="applyFormat('italic')"
        :class="[
          'p-2 border rounded text-sm italic min-w-[32px] h-8 flex items-center justify-center transition-all duration-200',
          formatState.italic
            ? 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600'
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400',
        ]"
        title="斜体">
        <em>I</em>
      </button>

      <button
        @click="applyFormat('underline')"
        :class="[
          'p-2 border rounded text-sm underline min-w-[32px] h-8 flex items-center justify-center transition-all duration-200',
          formatState.underline
            ? 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600'
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400',
        ]"
        title="下划线">
        <u>U</u>
      </button>

      <button
        @click="applyFormat('strikethrough')"
        :class="[
          'p-2 border rounded text-sm line-through min-w-[32px] h-8 flex items-center justify-center transition-all duration-200',
          formatState.strikethrough
            ? 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600'
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400',
        ]"
        title="删除线">
        <s>S</s>
      </button>

      <!-- 分隔线 -->
      <div class="w-px h-6 bg-gray-300 mx-1"></div>

      <!-- 高亮按钮 -->
      <button
        @click="applyFormat('highlight')"
        :class="[
          'p-2 border rounded text-sm min-w-[32px] h-8 flex items-center justify-center transition-all duration-200',
          formatState.highlight
            ? 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600'
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400',
        ]"
        title="高亮">
        <span class="px-1 bg-yellow-200 rounded text-xs font-bold">H</span>
      </button>

      <!-- 分隔线 -->
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
      @mouseup="handleSelectionChange"
      @keyup="handleSelectionChange"
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
