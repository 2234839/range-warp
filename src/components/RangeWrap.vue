<script setup lang="ts">
  import { ref, useTemplateRef, onMounted } from 'vue';

  const editDiv = useTemplateRef('editDiv');

  /** 当前选中的文本格式状态 */
  const formatState = ref({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
  });

  onMounted(() => {
    run();
    updateFormatState();
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

  /** 清除现有高亮 - 直接解包所有高亮元素 */
  function clearHighlights() {
    if (!editDiv.value) return;

    // 直接找到所有高亮元素并解包
    const highlights = Array.from(editDiv.value.querySelectorAll('.highlight'));

    // 从后往前处理，避免位置变化问题
    for (const highlight of highlights.reverse()) {
      const parent = highlight.parentNode;
      if (parent) {
        const childNodes = Array.from(highlight.childNodes);
        for (const child of childNodes) {
          parent.insertBefore(child, highlight);
        }
        parent.removeChild(highlight);
      }
    }

    // 合并相邻的文本节点
    editDiv.value.normalize();
  }

  /** 更智能的高亮方法 - 使用新的抽象架构 */
  function highlightTextAdvanced() {
    if (!editDiv.value) return;

    const keyword = '测试';

    // 使用新的通用高亮函数
    highlightTextByText(keyword);
  }

  /** 通用的文本替换方法 - 核心抽象函数 */
  function replaceTextWithElement(start: number, end: number, elementCreator: () => Node): void {
    // 获取所有文本节点
    const textNodes = getAllTextNodes();

    // 找到起始和结束节点
    let currentPos = 0;
    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;

    for (const node of textNodes) {
      const text = node.textContent || '';
      const nodeEnd = currentPos + text.length;

      if (!startNode && start < nodeEnd) {
        startNode = node;
        startOffset = start - currentPos;
      }

      if (!endNode && end <= nodeEnd) {
        endNode = node;
        endOffset = end - currentPos;
        break;
      }

      currentPos = nodeEnd;
    }

    if (startNode && endNode) {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);

      // 提取范围内的内容（包括所有HTML标签和文本）
      const extractedContent = range.extractContents();

      // 创建新元素并插入提取的内容
      const newElement = elementCreator();
      newElement.appendChild(extractedContent);

      // 将新元素插入到原位置
      range.insertNode(newElement);

      // 检查并清理空的子元素
      cleanupEmptyChildElements(newElement);
    }
  }

  /** 清理元素中的空子元素 */
  function cleanupEmptyChildElements(element: Node): void {
    if (!(element instanceof Element)) return;
    // 查找所有空的子元素
    const emptyElements = Array.from(element.children).filter(
      (child) => child.textContent?.trim() === '' && child.childNodes.length === 0,
    );

    // 从后往前删除空元素
    for (const emptyElement of emptyElements.reverse()) {
      emptyElement.remove();
    }
  }

  /** 通用的文本范围格式化函数 - 基于核心抽象方法 */
  function formatTextRange(start: number, end: number, tagName: string): void {
    replaceTextWithElement(start, end, () => {
      return document.createElement(tagName);
    });
  }

  /** 获取所有文本节点 - 包括高亮标签内的文本 */
  function getAllTextNodes(): Text[] {
    const walker = document.createTreeWalker(editDiv.value!, NodeFilter.SHOW_TEXT, null);

    const textNodes: Text[] = [];
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }
    return textNodes;
  }

  /** 查找文本中所有匹配项的位置 */
  function findTextOccurrences(
    searchText: string,
    sourceText?: string,
  ): Array<{ start: number; end: number }> {
    const text =
      sourceText ||
      getAllTextNodes()
        .map((n) => n.textContent || '')
        .join('');
    const regex = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }
    return matches;
  }

  /** 通用的文本高亮函数 - 接受一个字符串参数 */
  function highlightTextByText(searchText: string): void {
    // 首先清除现有高亮
    clearHighlights();

    // 查找所有匹配项的位置
    const matches = findTextOccurrences(searchText);

    // 从后往前处理，避免位置偏移
    for (const { start, end } of matches) {
      replaceTextWithElement(start, end, () => {
        const highlightSpan = document.createElement('span');
        highlightSpan.className = 'highlight';
        return highlightSpan;
      });
    }
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
    const isFormatted = checkSelectionHasFormat(start, end, tagName);

    if (isFormatted) {
      // 如果已有格式，则取消格式 - 基于文本位置
      unwrapElementsByTag(start, end, tagName);
    } else {
      // 如果没有格式，则添加格式 - 基于文本位置
      formatTextRange(start, end, tagName);
    }

    // 使用 setTimeout 异步更新格式状态，避免循环调用
    setTimeout(() => {
      updateFormatState();
    }, 0);
  }

  /** 通用的解包方法 - 基于文本位置，处理格式标签的移除 */
  function unwrapElementsByTag(start: number, end: number, tagName: string): void {
    if (!editDiv.value) return;

    // 查找编辑器中所有的目标标签
    const allTagElements = Array.from(editDiv.value.querySelectorAll(tagName));

    // 对每个标签检查是否与选区相交
    for (const element of allTagElements) {
      // 计算元素在全文中的位置范围
      const elementRange = document.createRange();
      elementRange.selectNodeContents(element);

      try {
        const preRange = document.createRange();
        preRange.selectNodeContents(editDiv.value);
        preRange.setEnd(elementRange.startContainer, elementRange.startOffset);
        const elementStart = preRange.toString().length;
        const elementEnd = elementStart + elementRange.toString().length;

        // 检查元素是否与选区相交
        if (elementStart < end && elementEnd > start) {
          handleElementIntersection(element, start, end, elementStart, elementEnd);
        }
      } catch (e) {
        // 如果范围计算失败，跳过这个元素
        continue;
      }
    }
  }

  /** 处理单个格式标签与选区的相交情况 */
  function handleElementIntersection(
    element: Element,
    selectionStart: number,
    selectionEnd: number,
    elementStart: number,
    elementEnd: number
  ): void {
    const textContent = element.textContent || '';
    if (textContent.trim() === '') return;

    // 情况1: 选区完全包含元素 -> 完全移除标签
    if (selectionStart <= elementStart && selectionEnd >= elementEnd) {
      // 创建新范围包含整个元素
      const fullRange = document.createRange();
      fullRange.selectNode(element);

      // 提取内容并插入纯文本
      const contents = fullRange.extractContents();
      const textNode = document.createTextNode(contents.textContent || '');
      fullRange.insertNode(textNode);

      return;
    }

    // 情况2: 选区部分重叠元素 -> 需要分割处理
    handlePartialOverlap(element, selectionStart, selectionEnd, elementStart, elementEnd);
  }

  /** 处理部分重叠的情况 */
  function handlePartialOverlap(
    element: Element,
    selectionStart: number,
    selectionEnd: number,
    elementStart: number,
    elementEnd: number
  ): void {
    // 创建范围包含整个元素
    const elementRange = document.createRange();
    elementRange.selectNode(element);

    // 提取所有内容
    const extractedContents = elementRange.extractContents();

    // 创建新的文档片段来重构内容
    const fragment = document.createDocumentFragment();
    let currentPos = elementStart;

    // 遍历提取的内容，重建没有格式标签的部分
    const extractedWalker = document.createTreeWalker(extractedContents, NodeFilter.SHOW_ALL, null);
    let node;
    while (node = extractedWalker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        const nodeEnd = currentPos + text.length;

        if (nodeEnd <= selectionStart || currentPos >= selectionEnd) {
          // 完全在选区外，保持原样（需要重新添加格式标签）
          const formattedElement = document.createElement(element.tagName.toLowerCase());
          formattedElement.appendChild(node.cloneNode(true));
          fragment.appendChild(formattedElement);
        } else {
          // 与选区相交，需要分割处理
          const beforeText = text.substring(0, Math.max(0, selectionStart - currentPos));
          const selectedText = text.substring(
            Math.max(0, selectionStart - currentPos),
            Math.min(text.length, selectionEnd - currentPos)
          );
          const afterText = text.substring(Math.min(text.length, selectionEnd - currentPos));

          if (beforeText) {
            const formattedElement = document.createElement(element.tagName.toLowerCase());
            formattedElement.appendChild(document.createTextNode(beforeText));
            fragment.appendChild(formattedElement);
          }
          if (selectedText) {
            // 选中的部分变成纯文本（不添加格式标签）
            fragment.appendChild(document.createTextNode(selectedText));
          }
          if (afterText) {
            const formattedElement = document.createElement(element.tagName.toLowerCase());
            formattedElement.appendChild(document.createTextNode(afterText));
            fragment.appendChild(formattedElement);
          }
        }
        currentPos = nodeEnd;
      } else if (node.nodeType === Node.ELEMENT_NODE && node !== element) {
        // 对于嵌套的元素节点，直接添加其文本内容（不保留嵌套格式）
        const text = node.textContent || '';
        if (text.trim()) {
          fragment.appendChild(document.createTextNode(text));
        }
      }
    }

    // 将重构的内容插入原位置
    elementRange.insertNode(fragment);
  }

  /** 创建基于文本位置的精确范围 */
  function createRangeFromTextPositions(
    start: number,
    end: number,
    textNodes: Text[],
  ): Range | null {
    if (!editDiv.value) return null;

    let currentPos = 0;
    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;

    // 找到起始和结束节点
    for (const node of textNodes) {
      const text = node.textContent || '';
      const nodeEnd = currentPos + text.length;

      if (!startNode && start < nodeEnd) {
        startNode = node;
        startOffset = start - currentPos;
      }

      if (!endNode && end <= nodeEnd) {
        endNode = node;
        endOffset = end - currentPos;
        break;
      }

      currentPos = nodeEnd;
    }

    if (startNode && endNode) {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      return range;
    }

    return null;
  }

  
  /** 检查指定文本范围内是否包含指定格式的标签 */
  function checkSelectionHasFormat(start: number, end: number, tagName: string): boolean {
    // 直接在编辑器中查找指定范围内的所有格式标签
    const allElements = editDiv.value?.querySelectorAll(tagName);
    if (!allElements || allElements.length === 0) return false;

    // 获取所有文本节点用于位置计算
    const textNodes = getAllTextNodes();

    for (const element of Array.from(allElements)) {
      // 计算元素在文本中的位置范围
      const elementRange = document.createRange();
      elementRange.selectNodeContents(element);

      try {
        const preRange = document.createRange();
        preRange.selectNodeContents(editDiv.value!);
        preRange.setEnd(elementRange.startContainer, elementRange.startOffset);
        const elementStart = preRange.toString().length;
        const elementEnd = elementStart + elementRange.toString().length;

        // 检查元素是否与选区有交集
        if (elementStart < end && elementEnd > start) {
          return true;
        }
      } catch (e) {
        // 如果范围计算失败，跳过这个元素
        continue;
      }
    }

    return false;
  }

  /** 递归检查内容中是否包含指定标签 */
  function hasTagInContents(node: Node, tagName: string): boolean {
    // 使用TreeWalker递归查找指定标签
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (element) => {
        if ((element as Element).tagName.toLowerCase() === tagName.toLowerCase()) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP; // 继续查找子节点
      },
    });

    // 如果找到任何一个匹配的标签就返回true
    return walker.nextNode() !== null;
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
