<script setup lang="ts">
  import { ref, useTemplateRef } from 'vue';
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
  });

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
    }
  }
</script>

<template>
  <div class="editor-container">
    <!-- 工具栏 -->
    <div class="toolbar">
      <button @click="applyFormat('bold')" :class="{ active: formatState.bold }" title="加粗">
        <strong>B</strong>
      </button>
      <button @click="applyFormat('italic')" :class="{ active: formatState.italic }" title="斜体">
        <em>I</em>
      </button>
      <button
        @click="applyFormat('underline')"
        :class="{ active: formatState.underline }"
        title="下划线">
        <u>U</u>
      </button>
      <button
        @click="applyFormat('strikethrough')"
        :class="{ active: formatState.strikethrough }"
        title="删除线">
        <s>S</s>
      </button>
      <div class="separator"></div>
      <button @click="run()" title="高亮测试">高亮</button>
      <button @click="copyHTML()" title="复制HTML内容">复制HTML</button>
    </div>

    <!-- 编辑区域 -->
    <div
      contenteditable="true"
      ref="editDiv"
      @mouseup="handleSelectionChange"
      @keyup="handleSelectionChange"
      class="editor-content">
      测试文本 测试中
    </div>
  </div>
</template>
<style lang="css" scoped>
  .editor-container {
    border: 1px solid #ccc;
    border-radius: 4px;
    overflow: hidden;
    font-family: Arial, sans-serif;
  }

  .toolbar {
    display: flex;
    align-items: center;
    padding: 8px;
    background-color: #f5f5f5;
    border-bottom: 1px solid #ddd;
    gap: 4px;
  }

  .toolbar button {
    padding: 6px 12px;
    border: 1px solid #ccc;
    background-color: #fff;
    border-radius: 3px;
    cursor: pointer;
    font-size: 14px;
    min-width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .toolbar button:hover {
    background-color: #e9e9e9;
    border-color: #999;
  }

  .toolbar button.active {
    background-color: #007bff;
    color: white;
    border-color: #0056b3;
  }

  .toolbar button.active:hover {
    background-color: #0056b3;
  }

  .separator {
    width: 1px;
    height: 24px;
    background-color: #ccc;
    margin: 0 8px;
  }

  .editor-content {
    padding: 12px;
    min-height: 200px;
    outline: none;
    line-height: 1.5;
    font-size: 14px;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .editor-content:focus {
    background-color: #fafafa;
  }

  /* 文本格式样式 */
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

  /* 高亮样式 - 确保与其他格式兼容 */
  :deep(.highlight) {
    background-color: yellow;
    padding: 1px 2px;
    border-radius: 2px;
    display: inline;
  }

  /* 确保格式化标签内的文本也能被高亮 */
  :deep(strong .highlight),
  :deep(em .highlight),
  :deep(u .highlight),
  :deep(s .highlight) {
    background-color: inherit;
    background-image: linear-gradient(rgba(255, 255, 0, 0.3), rgba(255, 255, 0, 0.3));
    border-radius: 2px;
    padding: 1px 2px;
  }

  /* 高亮文本的格式化样式 */
  :deep(.highlight strong),
  :deep(.highlight em),
  :deep(.highlight u),
  :deep(.highlight s) {
    background-color: inherit;
  }

  /* 选中文本的样式 */
  .editor-content::selection {
    background-color: #b3d4fc;
  }
</style>
