<script setup lang="ts">
  import { ref, useTemplateRef, readonly } from 'vue';
  import {
    formatTextRange,
    highlightTextByText,
    unwrapElementsByTag,
    checkSelectionHasFormat,
  } from '../utils/richTextEditor';

  const editDiv = useTemplateRef('editDiv');

  /** 当前选中的文本格式状态 */
  const formatState = ref({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    highlight: false,
  });

  /** 当前选中的文本范围 */
  const selectedRange = ref({
    start: 0,
    end: 0
  });

  /** 组件事件定义 */
  interface Emits {
    selectionChange: [start: number, end: number];
    formatApply: [start: number, end: number, format: string];
  }

  const emit = defineEmits<Emits>();

  function run() {
    highlightText();
  }

  /** 防止递归触发 */
  const isProcessing = ref(false);

  /** 关键词高亮函数 - 保留现有格式并支持复杂嵌套 */
  function highlightText() {
    if (isProcessing.value || !editDiv.value) return;
    isProcessing.value = true;

    // 使用新的高级高亮方法
    highlightTextAdvanced();

    isProcessing.value = false;
  }

  /** 更智能的高亮方法 - 使用新的抽象架构 */
  function highlightTextAdvanced() {
    if (!editDiv.value) return;

    const keyword = '测试';

    // 使用新的通用高亮函数
    highlightTextByText(editDiv.value, keyword);
  }

  /** 应用文本格式 - 支持切换状态 - 基于文本位置 */
  function applyFormat(format: string) {
    if (!editDiv.value) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (range.collapsed) return;

    let tagName = '';
    switch (format) {
      case 'bold':
        tagName = 'strong';
        break;
      case 'italic':
        tagName = 'em';
        break;
      case 'underline':
        tagName = 'u';
        break;
      case 'strikethrough':
        tagName = 's';
        break;
      case 'highlight':
        tagName = 'mark';
        break;
      default:
        return;
    }

    // 计算选区的文本位置
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(editDiv.value);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const start = preSelectionRange.toString().length;

    const end = start + range.toString().length;

    // 检查选区内是否已存在对应的格式
    const isFormatted = checkSelectionHasFormat(editDiv.value, start, end, tagName);

    if (isFormatted) {
      // 如果已有格式，则取消格式 - 基于文本位置
      unwrapElementsByTag(editDiv.value, start, end, tagName);
    } else {
      // 如果没有格式，则添加格式 - 基于文本位置
      formatTextRange(editDiv.value, start, end, tagName);
    }

    // 触发格式应用事件
    emit('formatApply', start, end, format);

    // 使用 setTimeout 异步更新格式状态，避免循环调用
    setTimeout(() => {
      updateFormatState();
    }, 0);
  }

  /** 更新格式状态 */
  function updateFormatState() {
    if (!editDiv.value) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      // 重置所有状态
      formatState.value = {
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
      };
      return;
    }

    const range = selection.getRangeAt(0);
    const parentElement =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as Element)
        : range.commonAncestorContainer.parentElement;

    if (parentElement) {
      formatState.value = {
        bold: isNodeFormatted(parentElement, 'strong') || isNodeFormatted(parentElement, 'b'),
        italic: isNodeFormatted(parentElement, 'em') || isNodeFormatted(parentElement, 'i'),
        underline: isNodeFormatted(parentElement, 'u'),
        strikethrough:
          isNodeFormatted(parentElement, 's') || isNodeFormatted(parentElement, 'strike'),
        highlight: isNodeFormatted(parentElement, 'mark'),
      };
    }
  }

  /** 检查节点是否包含指定格式 */
  function isNodeFormatted(element: Element, tagName: string): boolean {
    return element.closest(tagName) !== null;
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
    if (!selection || selection.rangeCount === 0) {
      selectedRange.value = { start: 0, end: 0 };
      emit('selectionChange', 0, 0);
      return;
    }

    const range = selection.getRangeAt(0);
    if (range.collapsed) {
      selectedRange.value = { start: 0, end: 0 };
      emit('selectionChange', 0, 0);
      return;
    }

    // 计算选区的文本位置
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(editDiv.value);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const start = preSelectionRange.toString().length;
    const end = start + range.toString().length;

    selectedRange.value = { start, end };
    emit('selectionChange', start, end);
  }

  /** 应用文本格式 */
  function applyTextFormat(start: number, end: number, format: string) {
    if (!editDiv.value) return;

    try {
      let tagName = '';
      switch (format) {
        case 'bold':
          tagName = 'strong';
          break;
        case 'italic':
          tagName = 'em';
          break;
        case 'underline':
          tagName = 'u';
          break;
        case 'strikethrough':
          tagName = 's';
          break;
        case 'highlight':
          tagName = 'mark';
          break;
        default:
          return;
      }

      // 检查范围内是否已存在对应的格式
      const isFormatted = checkSelectionHasFormat(editDiv.value, start, end, tagName);

      if (isFormatted) {
        // 如果已有格式，则取消格式
        unwrapElementsByTag(editDiv.value, start, end, tagName);
      } else {
        // 如果没有格式，则添加格式
        formatTextRange(editDiv.value, start, end, tagName);
      }

      // 触发格式应用事件
      emit('formatApply', start, end, format);

      // 异步更新格式状态
      setTimeout(() => {
        updateFormatState();
      }, 0);
    } catch (error) {
      console.error('应用格式失败:', error);
    }
  }

/** 暴露给父组件调用的方法 */
defineExpose({
  applyTextFormat,
  selectedRange: readonly(selectedRange)
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
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400'
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
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400'
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
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400'
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
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400'
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
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400'
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
