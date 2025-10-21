/**
 * 富文本编辑器核心工具函数
 * 提供基于文本位置的 DOM 操作功能
 */

/** 通用的文本替换方法 - 核心抽象函数 */
export function replaceTextWithElement(
  container: HTMLElement,
  start: number,
  end: number,
  elementCreator: () => Node,
): void {
  // 获取所有文本节点
  const textNodes = getAllTextNodes(container);

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
export function cleanupEmptyChildElements(element: Node): void {
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

/** 获取所有文本节点 - 包括高亮标签内的文本 */
export function getAllTextNodes(container: HTMLElement): Text[] {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);

  const textNodes: Text[] = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }
  return textNodes;
}

/** 查找文本中所有匹配项的位置 */
export function findTextOccurrences(
  container: HTMLElement,
  searchText: string,
  sourceText?: string,
): Array<{ start: number; end: number }> {
  const text =
    sourceText ||
    getAllTextNodes(container)
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

/** 通用的文本范围格式化函数 - 基于核心抽象方法 */
export function formatTextRange(
  container: HTMLElement,
  start: number,
  end: number,
  tagName: string,
): void {
  replaceTextWithElement(container, start, end, () => {
    return document.createElement(tagName);
  });
}

/** 创建基于文本位置的精确范围 */
export function createRangeFromTextPositions(
  _container: HTMLElement,
  start: number,
  end: number,
  textNodes: Text[],
): Range | null {
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

/** 通用的文本高亮函数 - 接受一个字符串参数 */
export function highlightTextByText(
  container: HTMLElement,
  searchText: string,
  highlightClassName: string = 'highlight',
): void {
  // 首先清除现有高亮
  clearHighlights(container, highlightClassName);

  // 查找所有匹配项的位置
  const matches = findTextOccurrences(container, searchText);

  // 从后往前处理，避免位置偏移
  for (const { start, end } of matches) {
    replaceTextWithElement(container, start, end, () => {
      const highlightSpan = document.createElement('span');
      highlightSpan.className = highlightClassName;
      return highlightSpan;
    });
  }
}

/** 清除现有高亮 - 直接解包所有高亮元素 */
export function clearHighlights(
  container: HTMLElement,
  highlightClassName: string = 'highlight',
): void {
  // 直接找到所有高亮元素并解包
  const highlights = Array.from(container.querySelectorAll(`.${highlightClassName}`));

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
  container.normalize();
}

/** 通用的解包方法 - 直接移除与选区相交的格式标签 */
export function unwrapElementsByTag(
  container: HTMLElement,
  start: number,
  end: number,
  tagName: string,
): void {
  // 查找编辑器中所有的目标标签
  const allTagElements = Array.from(container.querySelectorAll(tagName));

  // 对每个标签检查是否与选区相交
  for (const element of allTagElements) {
    // 计算元素在全文中的位置范围
    const elementRange = document.createRange();
    elementRange.selectNodeContents(element);

    try {
      const preRange = document.createRange();
      preRange.selectNodeContents(container);
      preRange.setEnd(elementRange.startContainer, elementRange.startOffset);
      const elementStart = preRange.toString().length;
      const elementEnd = elementStart + elementRange.toString().length;

      // 检查元素是否与选区相交
      if (elementStart < end && elementEnd > start) {
        // 如果有交集，直接移除整个标签，保留文本内容
        const fullRange = document.createRange();
        fullRange.selectNode(element);

        // 提取内容并插入纯文本节点
        const contents = fullRange.extractContents();
        const textNode = document.createTextNode(contents.textContent || '');
        fullRange.insertNode(textNode);
      }
    } catch (e) {
      // 如果范围计算失败，跳过这个元素
      continue;
    }
  }
}

/** 检查指定文本范围内是否包含指定格式的标签 */
export function checkSelectionHasFormat(
  container: HTMLElement,
  start: number,
  end: number,
  tagName: string,
): boolean {
  // 直接在编辑器中查找指定范围内的所有格式标签
  const allElements = container.querySelectorAll(tagName);
  if (!allElements || allElements.length === 0) return false;

  for (const element of Array.from(allElements)) {
    // 计算元素在文本中的位置范围
    const elementRange = document.createRange();
    elementRange.selectNodeContents(element);

    try {
      const preRange = document.createRange();
      preRange.selectNodeContents(container);
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