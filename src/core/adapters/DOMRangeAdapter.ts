/**
 * DOM Range 适配器实现
 *
 * 测试路径: tsx src/__tests__/adapter.test.ts
 *
 * 核心职责：基于原生 DOM Range API 实现 IRangeAdapter 接口
 * 设计原则：
 * - 直接使用浏览器 DOM Range API，不依赖任何富文本编辑器
 * - 支持 Unicode 字符下标计算 (使用 Array.from 处理 emoji 等多码点字符)
 * - 提供准确的文本位置定位能力
 */

import type { IRangeAdapter } from './IRangeAdapter';

/**
 * 样式标签配置
 */
interface StyleTagConfig {
  /** 标签名 */
  tagName: string;
  /** 可选的属性选择器 (用于区分不同类型的同标签) */
  attributeSelector?: string;
  /** 显示类型: inline(行内), block(块级), inline-block(混合) */
  display?: 'inline' | 'block' | 'inline-block';
}

/** 样式到标签的映射配置 */
const STYLE_TAG_CONFIGS: Record<string, StyleTagConfig> = {
  bold: { tagName: 'strong', display: 'inline' },
  italic: { tagName: 'em', display: 'inline' },
  underline: { tagName: 'u', display: 'inline' },
  strikethrough: { tagName: 's', display: 'inline' },
  highlight: { tagName: 'mark', display: 'inline' },
  // 未来可以添加修订功能
  // insertion: { tagName: 'div', attributeSelector: '[data-type="insertion"]', display: 'block' },
  // deletion: { tagName: 'div', attributeSelector: '[data-type="deletion"]', display: 'block' },
  // bookmark: { tagName: 'span', attributeSelector: '[data-type="bookmark"]', display: 'inline-block' },
};

/**
 * 根据样式名称获取标签配置
 * @param style 样式名称
 * @returns 标签配置
 */
function getTagConfig(style: string): StyleTagConfig | undefined {
  return STYLE_TAG_CONFIGS[style];
}

/**
 * 检查元素是否是系统支持的样式标签
 * @param element DOM 元素
 * @param style 可选的样式名称,用于精确匹配
 * @returns 是否是支持的样式标签
 */
function isSupportedStyleElement(element: Element, style?: string): boolean {
  if (style) {
    const config = getTagConfig(style);
    if (!config) return false;

    // 检查标签名
    if (element.tagName.toLowerCase() !== config.tagName.toLowerCase()) {
      return false;
    }

    // 如果配置了属性选择器,还需要检查属性
    if (config.attributeSelector) {
      return element.matches(config.attributeSelector);
    }

    return true;
  }

  // 如果没有指定样式,检查是否匹配任意配置
  return Object.values(STYLE_TAG_CONFIGS).some(config => {
    if (element.tagName.toLowerCase() !== config.tagName.toLowerCase()) {
      return false;
    }
    if (config.attributeSelector) {
      return element.matches(config.attributeSelector);
    }
    return true;
  });
}

export interface DOMRangeAdapterOptions {
  /** 编辑器容器元素 */
  container: HTMLElement;
}

export class DOMRangeAdapter implements IRangeAdapter {
  /** 编辑器容器元素 */
  private readonly _container: HTMLElement;

  constructor(options: DOMRangeAdapterOptions) {
    this._container = options.container;
  }

  /**
   * 获取容器元素
   */
  getContainer(): HTMLElement {
    return this._container;
  }

  /**
   * 获取所有文本节点
   * @returns 文本节点数组
   */
  private getAllTextNodes(): Text[] {
    const walker = document.createTreeWalker(
      this._container,
      NodeFilter.SHOW_TEXT,
      null
    );
    const textNodes: Text[] = [];
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }
    return textNodes;
  }

  /**
   * 根据文本位置创建 DOM Range
   * @param start 起始字符下标
   * @param end 结束字符下标
   * @returns DOM Range 或 null
   */
  private createDOMRange(start: number, end: number): Range | null {
    // 限制范围在文档长度内
    const docLength = this.getDocumentLength();
    start = Math.max(0, Math.min(start, docLength));
    end = Math.max(start, Math.min(end, docLength));

    const textNodes = this.getAllTextNodes();
    let currentPos = 0;
    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;

    for (const node of textNodes) {
      const text = node.textContent || '';
      const textLength = this.getUnicodeStringLength(text);
      const nodeEnd = currentPos + textLength;

      // 找到起始节点
      if (!startNode && start < nodeEnd) {
        startNode = node;
        startOffset = this.getUtf16Offset(text, start - currentPos);
      }

      // 找到结束节点
      if (!endNode && end <= nodeEnd) {
        endNode = node;
        endOffset = this.getUtf16Offset(text, end - currentPos);
        break;
      }

      currentPos = nodeEnd;
    }

    // 处理边界情况：start 在最后一个文本节点的末尾
    if (!startNode && textNodes.length > 0) {
      const lastNode = textNodes[textNodes.length - 1];
      const lastText = lastNode.textContent || '';
      startNode = lastNode;
      startOffset = this.getUtf16Offset(lastText, this.getUnicodeStringLength(lastText));
    }
    // 处理边界情况：end 在最后一个文本节点的末尾
    if (!endNode && textNodes.length > 0) {
      const lastNode = textNodes[textNodes.length - 1];
      const lastText = lastNode.textContent || '';
      endNode = lastNode;
      endOffset = this.getUtf16Offset(lastText, this.getUnicodeStringLength(lastText));
    }

    if (!startNode || !endNode) return null;

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    return range;
  }

  /**
   * 获取 Unicode 字符长度
   * @param str 字符串
   * @returns 字符数
   */
  private getUnicodeStringLength(str: string): number {
    return Array.from(str).length;
  }

  /**
   * 根据 Unicode 索引获取 UTF-16 偏移量
   * @param str 字符串
   * @param unicodeIndex Unicode 索引
   * @returns UTF-16 偏移量
   */
  private getUtf16Offset(str: string, unicodeIndex: number): number {
    const chars = Array.from(str);
    return chars.slice(0, unicodeIndex).join('').length;
  }

  /**
   * 获取包含换行符的文本内容
   * @returns 文本内容
   */
  private getTextWithLineBreaks(): string {
    let text = '';
    const walker = document.createTreeWalker(
      this._container,
      NodeFilter.SHOW_ALL,
      null
    );

    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        if (element.tagName === 'BR') {
          text += '\n';
        } else if (
          ['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE'].includes(
            element.tagName
          )
        ) {
          if (
            element.parentNode === this._container &&
            element !== this._container.firstElementChild
          ) {
            text += '\n';
          } else if (
            element.previousElementSibling &&
            ['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE'].includes(
              element.previousElementSibling.tagName
            )
          ) {
            text += '\n';
          }
        }
      }
    }
    return text;
  }

  // ==================== IRangeAdapter 接口实现 ====================

  getText(start: number, end: number): string {
    const range = this.createDOMRange(start, end);
    return range ? range.toString() : '';
  }

  insertText(position: number, text: string): void {
    // 处理空容器的情况
    if (this._container.childNodes.length === 0) {
      this._container.appendChild(document.createTextNode(text));
      return;
    }

    // 在正确的 DOM 位置插入文本，文本自然被包含在所在位置的容器中
    const range = this.createDOMRange(position, position);
    if (!range) {
      this._container.appendChild(document.createTextNode(text));
      return;
    }

    range.insertNode(document.createTextNode(text));
  }

  /**
   * 在空容器中插入文本
   * @param position 插入位置
   * @param text 文本
   */
  delete(start: number, end: number): void {
    const range = this.createDOMRange(start, end);
    if (!range) return;

    range.deleteContents();
  }

  replaceText(start: number, end: number, text: string): void {
    const range = this.createDOMRange(start, end);
    if (!range) return;

    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
  }

  /**
   * 标准化选区范围,确保 start <= end
   * @param start 起始位置
   * @param end 结束位置
   * @returns 标准化后的 [start, end]
   */
  private normalizeRange(start: number, end: number): [number, number] {
    return start <= end ? [start, end] : [end, start];
  }

  setStyle(start: number, end: number, style: string): void {
    const config = getTagConfig(style);
    if (!config) return;

    // 标准化选区
    [start, end] = this.normalizeRange(start, end);

    // 对于 inline 样式，检查是否跨段落
    if (config.display === 'inline' || !config.display) {
      const blockElements = this.getBlockElementsInRange(start, end);
      if (blockElements.length > 0) {
        // 跨段落：为每个段落内分别应用样式
        this.applyStyleAcrossBlocks(start, end, config, style);
        return;
      }
    }

    this.wrapElement(start, end, () => {
      const element = document.createElement(config.tagName);
      // 如果有属性选择器,设置对应的属性
      if (config.attributeSelector) {
        const attrMatch = config.attributeSelector.match(/\[([^=]+)(?:="([^"]*)")?\]/);
        if (attrMatch) {
          element.setAttribute(attrMatch[1], attrMatch[2] || '');
        }
      }
      return element;
    });
  }

  /**
   * 获取范围内的所有块级元素
   * @param start 起始位置
   * @param end 结束位置
   * @returns 块级元素数组
   */
  private getBlockElementsInRange(start: number, end: number): Element[] {
    const blockElements: Element[] = [];
    const allElements = this._container.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th, br');

    for (const elem of Array.from(allElements)) {
      if (elem.tagName.toLowerCase() === 'br') {
        // <br> 是特殊的，总是被视为块级分隔符
        const range = document.createRange();
        range.setStart(elem, 0);
        const preRange = document.createRange();
        preRange.selectNodeContents(this._container);
        preRange.setEnd(range.startContainer, range.startOffset);

        const brPos = this.getUnicodeStringLength(preRange.toString());
        if (brPos >= start && brPos < end) {
          blockElements.push(elem);
        }
        continue;
      }

      const elemRange = document.createRange();
      elemRange.selectNodeContents(elem);

      const preRange = document.createRange();
      preRange.selectNodeContents(this._container);
      preRange.setEnd(elemRange.startContainer, elemRange.startOffset);

      const elemStart = this.getUnicodeStringLength(preRange.toString());
      const elemEnd = elemStart + this.getUnicodeStringLength(elemRange.toString());

      // 检查是否与范围重叠
      if (elemStart < end && elemEnd > start) {
        blockElements.push(elem);
      }
    }

    return blockElements;
  }

  /**
   * 跨段落应用样式
   * @param start 起始位置
   * @param end 结束位置
   * @param config 样式配置
   * @param _style 样式名称（未使用）
   */
  private applyStyleAcrossBlocks(start: number, end: number, config: StyleTagConfig, _style?: string): void {
    // 对于每个块级元素，在其内部应用样式
    let currentPos = 0;
    const textNodes = this.getAllTextNodes();

    for (let i = 0; i < textNodes.length; i++) {
      const node = textNodes[i];
      const text = node.textContent || '';
      const textLength = this.getUnicodeStringLength(text);
      const nodeStart = currentPos;
      const nodeEnd = currentPos + textLength;

      // 检查此文本节点是否在范围内
      if (nodeStart >= end) break;
      if (nodeEnd <= start) {
        currentPos = nodeEnd;
        continue;
      }

      // 计算在此节点中的有效范围
      const overlapStart = Math.max(nodeStart, start);
      const overlapEnd = Math.min(nodeEnd, end);

      if (overlapStart < overlapEnd) {
        // 转换为文本节点内的偏移
        const offsetStart = overlapStart - nodeStart;
        const offsetEnd = overlapEnd - nodeStart;

        // 检查此文本节点的父元素
        let currentParent: Node | null = node.parentNode;
        let styleParents: Element[] = [];

        while (currentParent && currentParent !== this._container) {
          if (currentParent.nodeType === Node.ELEMENT_NODE) {
            const elem = currentParent as Element;
            if (isSupportedStyleElement(elem)) {
              styleParents.push(elem);
            }
          }
          currentParent = currentParent.parentNode;
        }

        // 在此文本节点内应用样式
        const localRange = document.createRange();
        localRange.setStart(node, this.getUtf16Offset(text, offsetStart));
        localRange.setEnd(node, this.getUtf16Offset(text, offsetEnd));

        const newElement = document.createElement(config.tagName);

        if (styleParents.length === 0) {
          // 没有父样式，直接包裹
          const extracted = localRange.extractContents();
          newElement.appendChild(extracted);
          localRange.insertNode(newElement);
        } else {
          // 有父样式，需要将新样式包裹在父样式外层
          const outermostStyle = styleParents[styleParents.length - 1];
          const parent = outermostStyle.parentNode;
          if (!parent) {
            const extracted = localRange.extractContents();
            newElement.appendChild(extracted);
            localRange.insertNode(newElement);
          } else {
            // 计算样式元素的位置
            const elemRange = document.createRange();
            elemRange.selectNodeContents(outermostStyle);

            const preRange = document.createRange();
            preRange.selectNodeContents(this._container);
            preRange.setEnd(elemRange.startContainer, elemRange.startOffset);

            const elemStart = this.getUnicodeStringLength(preRange.toString());
            const elemEnd = elemStart + this.getUnicodeStringLength(elemRange.toString());

            // 检查是否完全包含
            if (start <= elemStart && end >= elemEnd) {
              // 新样式应该包裹整个旧样式元素
              const nextSibling = outermostStyle.nextSibling;
              parent.removeChild(outermostStyle);
              newElement.appendChild(outermostStyle);

              if (nextSibling) {
                parent.insertBefore(newElement, nextSibling);
              } else {
                parent.appendChild(newElement);
              }
            } else {
              // 部分重叠，使用常规方法
              const extracted = localRange.extractContents();
              newElement.appendChild(extracted);
              localRange.insertNode(newElement);
            }
          }
        }
      }

      currentPos = nodeEnd;
    }

    // 清理空标签和规范化
    this.normalize(start, end);
  }

  removeStyle(start: number, end: number, style: string): void {
    const config = getTagConfig(style);
    if (!config) return;

    // 标准化选区
    [start, end] = this.normalizeRange(start, end);

    // 构建选择器
    const selector = config.attributeSelector
      ? `${config.tagName}${config.attributeSelector}`
      : config.tagName;

    this.unwrapElement(start, end, selector, style);
  }

  wrapElement(start: number, end: number, elementCreator: () => Element): void {
    const range = this.createDOMRange(start, end);
    if (!range) {
      // 超出范围或无效范围，静默处理
      return;
    }

    const newElement = elementCreator();

    // 检查范围内是否有已有的样式元素
    const allStyleElements = Array.from(this._container.querySelectorAll(STYLE_TAG_CONFIGS.bold.tagName + ',' +
      STYLE_TAG_CONFIGS.italic.tagName + ',' + STYLE_TAG_CONFIGS.underline.tagName + ',' +
      STYLE_TAG_CONFIGS.strikethrough.tagName + ',' + STYLE_TAG_CONFIGS.highlight.tagName));

    let hasExistingStyle = false;
    for (const elem of allStyleElements) {
      const elemRange = document.createRange();
      elemRange.selectNodeContents(elem);

      try {
        const preRange = document.createRange();
        preRange.selectNodeContents(this._container);
        preRange.setEnd(elemRange.startContainer, elemRange.startOffset);

        const elemStart = this.getUnicodeStringLength(preRange.toString());
        const elemEnd = elemStart + this.getUnicodeStringLength(elemRange.toString());

        // 检查是否重叠（但不是完全包含）
        if (elemStart < end && elemEnd > start && !(start <= elemStart && end >= elemEnd)) {
          hasExistingStyle = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (hasExistingStyle) {
      // 有重叠的样式元素，需要智能处理
      this.wrapElementWithExistingStyles(start, end, newElement);
    } else {
      // 简单情况：直接包裹
      const extractedContent = range.extractContents();
      newElement.appendChild(extractedContent);
      range.insertNode(newElement);
    }

    // 清理空的样式标签
    this.normalize(start, end);
  }

  /**
   * 智能地包裹元素，处理与已有样式元素的复杂交互
   *
   * 核心策略：
   * 1. 用 extractContents + insertNode 来包裹
   * 2. 然后后处理调整嵌套关系
   *
   * @param start 起始位置
   * @param end 结束位置
   * @param newElement 要插入的新样式元素
   */
  private wrapElementWithExistingStyles(start: number, end: number, newElement: Element): void {
    const range = this.createDOMRange(start, end);
    if (!range) return;

    const extractedContent = range.extractContents();
    newElement.appendChild(extractedContent);
    range.insertNode(newElement);
  }

  /**
   * 获取元素内的所有文本节点
   * @param element 元素
   * @returns 文本节点数组
   */
  private getTextNodesInElement(element: Element): Text[] {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent && node.textContent.trim().length > 0) {
        textNodes.push(node as Text);
      }
    }

    return textNodes;
  }

  unwrapElement(start: number, end: number, selector: string, style?: string): void {
    // 如果指定了样式名称,检查是否支持
    if (style && !getTagConfig(style)) {
      return;
    }

    const allTagElements = Array.from(this._container.querySelectorAll(selector));

    for (const element of allTagElements) {
      // 如果指定了样式,检查元素是否匹配
      if (style && !isSupportedStyleElement(element, style)) {
        continue;
      }
      const elementRange = document.createRange();
      elementRange.selectNodeContents(element);

      try {
        const preRange = document.createRange();
        preRange.selectNodeContents(this._container);
        preRange.setEnd(elementRange.startContainer, elementRange.startOffset);

        const beforeText = preRange.toString();
        const elementText = elementRange.toString();
        const elementStart = this.getUnicodeStringLength(beforeText);
        const elementEnd = elementStart + this.getUnicodeStringLength(elementText);

        // 检查选区是否与当前元素重叠
        if (elementStart < end && elementEnd > start) {
          // 完全包含:移除整个标签,但保留子元素的样式
          if (start <= elementStart && end >= elementEnd) {
            const parent = element.parentNode;
            if (!parent) continue;

            // 获取所有子元素
            const children = Array.from(element.childNodes);
            const nextSibling = element.nextSibling;

            // 将所有子元素移到父级
            children.forEach(child => {
              parent.insertBefore(child, nextSibling);
            });

            // 移除当前元素
            element.remove();
          }
          // 部分重叠:需要分割标签
          else {
            this.splitElement(element, elementStart, elementEnd, start, end);
          }
        }
      } catch {
        continue;
      }
    }
  }

  /**
   * 分割元素以处理部分样式移除
   *
   * 基本思路:
   * 1. 创建移除范围的 Range
   * 2. 提取 Range 的内容
   * 3. 重建 DOM: 前段(保留样式) + 中段(纯文本) + 后段(保留样式)
   *
   * @param element 要分割的元素
   * @param elementStart 元素在文档中的起始位置
   * @param elementEnd 元素在文档中的结束位置
   * @param removeStart 要移除样式的起始位置
   * @param removeEnd 要移除样式的结束位置
   */
  private splitElement(
    element: Element,
    elementStart: number,
    elementEnd: number,
    removeStart: number,
    removeEnd: number
  ): void {
    const parent = element.parentNode;
    if (!parent) return;

    // 计算实际的移除范围
    const actualRemoveStart = Math.max(elementStart, removeStart);
    const actualRemoveEnd = Math.min(elementEnd, removeEnd);

    // 创建移除范围的 Range
    const removeRange = this.createDOMRange(actualRemoveStart, actualRemoveEnd);
    if (!removeRange) {
      // 回退:移除整个元素
      const text = element.textContent || '';
      element.replaceWith(document.createTextNode(text));
      return;
    }

    // 计算偏移量
    const offsetStart = actualRemoveStart - elementStart;
    const offsetEnd = actualRemoveEnd - elementStart;
    const elementLength = elementEnd - elementStart;

    // 检查是否有嵌套的样式元素
    const hasNestedStyles = this.hasNestedStyleElements(element);

    if (hasNestedStyles) {
      // 复杂情况：有嵌套样式，使用递归处理
      const result = this.processElementForStyleRemoval(element, offsetStart, offsetEnd);
      element.replaceWith(result);
    } else {
      // 简单情况：没有嵌套样式，使用原来的逻辑
      const result = this.processSimpleElementRemoval(element, offsetStart, offsetEnd);
      element.replaceWith(result);
    }
  }

  /**
   * 检查元素是否有嵌套的样式元素
   * @param element 元素
   * @returns 是否有嵌套样式
   */
  private hasNestedStyleElements(element: Element): boolean {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node === element) return NodeFilter.FILTER_SKIP;
          return isSupportedStyleElement(node as Element) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      }
    );

    return walker.nextNode() !== null;
  }

  /**
   * 处理简单元素的样式移除（没有嵌套样式）
   * @param element 元素
   * @param removeStart 移除起始偏移
   * @param removeEnd 移除结束偏移
   * @returns DocumentFragment
   */
  private processSimpleElementRemoval(element: Element, removeStart: number, removeEnd: number): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const elementLength = this.getUnicodeStringLength(element.textContent || '');
    const removeFromStart = removeStart === 0;
    const removeToEnd = removeEnd === elementLength;

    // 前段 (保留样式)
    if (!removeFromStart) {
      const beforeElement = element.cloneNode(false) as Element;
      const beforeRange = this.createDOMRangeInElement(element, 0, removeStart);
      if (beforeRange) {
        const beforeContent = beforeRange.cloneContents();
        beforeElement.appendChild(beforeContent);
        fragment.appendChild(beforeElement);
      }
    }

    // 中段 (移除样式 - 纯文本)
    const middleRange = this.createDOMRangeInElement(element, removeStart, removeEnd);
    if (middleRange) {
      const middleText = middleRange.toString();
      if (middleText) {
        fragment.appendChild(document.createTextNode(middleText));
      }
    }

    // 后段 (保留样式)
    if (!removeToEnd) {
      const afterElement = element.cloneNode(false) as Element;
      const afterRange = this.createDOMRangeInElement(element, removeEnd, elementLength);
      if (afterRange) {
        const afterContent = afterRange.cloneContents();
        afterElement.appendChild(afterContent);
        fragment.appendChild(afterElement);
      }
    }

    return fragment;
  }

  /**
   * 在元素内创建 Range
   * @param element 元素
   * @param start 起始偏移
   * @param end 结束偏移
   * @returns Range 或 null
   */
  private createDOMRangeInElement(element: Element, start: number, end: number): Range | null {
    try {
      const textNodes = this.getTextNodesInElement(element);
      let currentPos = 0;
      let startNode: Node | null = null;
      let startOffset = 0;
      let endNode: Node | null = null;
      let endOffset = 0;

      for (const node of textNodes) {
        const text = node.textContent || '';
        const textLength = this.getUnicodeStringLength(text);
        const nodeStart = currentPos;
        const nodeEnd = currentPos + textLength;

        // 查找起始点
        if (startNode === null && start >= nodeStart && start < nodeEnd) {
          startNode = node;
          startOffset = this.getUtf16Offset(text, start - nodeStart);
        }

        // 查找结束点
        if (end >= nodeStart && end <= nodeEnd) {
          endNode = node;
          endOffset = this.getUtf16Offset(text, end - nodeStart);
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
    } catch {
      // Ignore errors
    }

    return null;
  }

  /**
   * 处理元素以移除部分样式，保留内部样式
   * @param element 要处理的元素
   * @param removeStart 要移除的起始偏移（相对于元素）
   * @param removeEnd 要移除的结束偏移（相对于元素）
   * @returns 处理后的 DocumentFragment
   */
  private processElementForStyleRemoval(element: Element, removeStart: number, removeEnd: number): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const removeFromStart = removeStart === 0;
    const removeToEnd = removeEnd === this.getUnicodeStringLength(element.textContent || '');

    // 获取元素的所有文本节点及其位置
    const textNodes = this.getTextNodesWithPositions(element);

    // 第一段：移除起始位置之前（移除所有样式，包括内部样式）
    if (!removeFromStart) {
      for (const { node, nodeStart, nodeEnd } of textNodes) {
        if (nodeEnd <= removeStart) {
          // 完全在前段 - 只提取文本，不保留样式
          const text = node.textContent || '';
          fragment.appendChild(document.createTextNode(text));
        } else if (nodeStart < removeStart) {
          // 部分在前段
          const text = node.textContent || '';
          const beforeText = text.slice(0, removeStart - nodeStart);
          fragment.appendChild(document.createTextNode(beforeText));
        }
      }
    }

    // 第二段：移除范围内的内容（移除外层样式，保留内部样式）
    for (const { node, nodeStart, nodeEnd } of textNodes) {
      if (nodeStart >= removeStart && nodeEnd <= removeEnd) {
        // 完全在中段 - 添加整个节点（保留内部样式）
        fragment.appendChild(node.cloneNode(true));
      } else if (nodeStart < removeEnd && nodeEnd > removeStart) {
        // 部分在中段
        const text = node.textContent || '';
        const startInNode = Math.max(0, removeStart - nodeStart);
        const endInNode = Math.min(text.length, removeEnd - nodeStart);
        const middleText = text.slice(startInNode, endInNode);

        // 检查节点是否有父样式
        let currentParent: Node | null = node.parentNode;
        let hasStyledParent = false;
        while (currentParent && currentParent !== element) {
          if (currentParent.nodeType === Node.ELEMENT_NODE) {
            const elem = currentParent as Element;
            if (isSupportedStyleElement(elem)) {
              hasStyledParent = true;
              break;
            }
          }
          currentParent = currentParent.parentNode;
        }

        if (hasStyledParent) {
          // 保留内部样式
          const clonedParent = (node.parentNode as Element).cloneNode(false) as Element;
          clonedParent.textContent = middleText;
          fragment.appendChild(clonedParent);
        } else {
          // 纯文本
          fragment.appendChild(document.createTextNode(middleText));
        }
      }
    }

    // 第三段：移除结束位置之后（移除所有样式，包括内部样式）
    if (!removeToEnd) {
      for (const { node, nodeStart, nodeEnd } of textNodes) {
        if (nodeStart >= removeEnd) {
          // 完全在后段 - 只提取文本，不保留样式
          const text = node.textContent || '';
          fragment.appendChild(document.createTextNode(text));
        } else if (nodeEnd > removeEnd) {
          // 部分在后段
          const text = node.textContent || '';
          const afterText = text.slice(removeEnd - nodeStart);
          fragment.appendChild(document.createTextNode(afterText));
        }
      }
    }

    return fragment;
  }

  /**
   * 获取元素内所有文本节点及其相对位置
   * @param element 元素
   * @returns 文本节点及其位置信息
   */
  private getTextNodesWithPositions(element: Element): Array<{ node: Text; nodeStart: number; nodeEnd: number }> {
    const result: Array<{ node: Text; nodeStart: number; nodeEnd: number }> = [];
    let currentPos = 0;

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent || '';
      const textLength = this.getUnicodeStringLength(text);
      if (textLength > 0) {
        result.push({
          node: node as Text,
          nodeStart: currentPos,
          nodeEnd: currentPos + textLength
        });
        currentPos += textLength;
      }
    }

    return result;
  }

  /**
   * 递归移除匹配的样式标签
   * @param node 要处理的节点
   * @param tagName 要移除的标签名
   */
  private removeMatchingStyles(node: Node, tagName: string): void {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      // 检查是否是匹配的样式元素
      if (element.tagName === tagName && isSupportedStyleElement(element)) {
        // 将此元素的子节点提升到父级
        const parent = element.parentNode;
        if (parent) {
          while (element.firstChild) {
            parent.insertBefore(element.firstChild, element);
          }
          parent.removeChild(element);
        }
        return;
      }

      // 递归处理子节点
      const children = Array.from(element.childNodes);
      for (const child of children) {
        this.removeMatchingStyles(child, tagName);
      }
    } else if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      // 处理 DocumentFragment
      const children = Array.from(node.childNodes);
      for (const child of children) {
        this.removeMatchingStyles(child, tagName);
      }
    }
  }

  normalize(start: number, end: number): void {
    // 获取范围内所有系统支持的样式标签
    const selectors = Object.values(STYLE_TAG_CONFIGS).map(config => {
      return config.attributeSelector
        ? `${config.tagName}${config.attributeSelector}`
        : config.tagName;
    });

    const allElements = this._container.querySelectorAll(selectors.join(','));

    // 1. 移除冗余的嵌套标签
    for (const element of Array.from(allElements)) {
      if (!isSupportedStyleElement(element)) continue;

      const parent = element.parentElement;
      // 只有当子元素和父元素的标签名相同时才合并 (如 <strong><strong>text</strong></strong>)
      // 不同标签的嵌套是合法的 (如 <em><strong>text</strong></em>)
      if (parent && isSupportedStyleElement(parent) &&
          element.tagName === parent.tagName) {
        this.mergeRedundantTags(element, parent);
      }
    }

    // 2. 移除空标签 (移除所有空标签,不管是否在范围内)
    const emptyElements = this._container.querySelectorAll(selectors.join(','));
    for (const element of Array.from(emptyElements)) {
      if (!isSupportedStyleElement(element)) continue;

      // 检查是否为空：没有文本内容
      const isEmpty = element.textContent === '';
      if (isEmpty) {
        element.remove();
      }
    }

    // 3. 合并相邻的相同标签
    this.mergeAdjacentSameTags(start, end);

    // 4. 合并相邻的 Text 节点（消除拆分导致的碎片）
    this.mergeAdjacentTextNodes();
  }

  /**
   * 合并相邻的 Text 节点
   * 操作过程中反复拆分会导致一个容器内有多个 Text 节点
   * 需要将相邻的 Text 节点合并为一个
   */
  private mergeAdjacentTextNodes(): void {
    const merge = (parent: Node) => {
      let changed = true;
      while (changed) {
        changed = false;
        const children = Array.from(parent.childNodes);
        for (let i = 0; i < children.length - 1; i++) {
          const current = children[i];
          const next = children[i + 1];

          if (current.nodeType === Node.TEXT_NODE && next.nodeType === Node.TEXT_NODE) {
            current.textContent = (current.textContent || '') + (next.textContent || '');
            parent.removeChild(next);
            changed = true;
            break;
          }
        }
      }

      // 递归处理子元素
      for (const child of Array.from(parent.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          merge(child);
        }
      }
    };

    merge(this._container);
  }

  /**
   * 合并冗余的嵌套标签
   * @param child 子标签
   * @param parent 父标签
   */
  private mergeRedundantTags(child: Element, parent: Element): void {
    // 将子标签的内容提升到父级
    while (child.firstChild) {
      parent.insertBefore(child.firstChild, child);
    }
    // 移除空的子标签
    child.remove();
  }

  /**
   * 合并相邻的相同标签
   * @param start 起始位置
   * @param end 结束位置
   */
  private mergeAdjacentSameTags(start: number, end: number): void {
    const range = this.createDOMRange(start, end);
    if (!range) return;

    // 只获取系统支持的标签
    const selectors = Object.values(STYLE_TAG_CONFIGS).map(config => {
      return config.attributeSelector
        ? `${config.tagName}${config.attributeSelector}`
        : config.tagName;
    });

    const allElements = this._container.querySelectorAll(selectors.join(','));
    const processedTags = new Set<Element>();

    for (const element of Array.from(allElements)) {
      // 只处理系统支持的标签
      if (!isSupportedStyleElement(element)) continue;
      if (processedTags.has(element)) continue;

      // 检查元素是否在范围内
      const elementRange = document.createRange();
      elementRange.selectNodeContents(element);

      const preRange = document.createRange();
      preRange.selectNodeContents(this._container);
      preRange.setEnd(elementRange.startContainer, elementRange.startOffset);

      const elementStart = this.getUnicodeStringLength(preRange.toString());

      if (elementStart < start || elementStart > end) continue;

      // 只合并直接相邻的相同标签（中间没有任何内容，包括文本节点）
      let nextSibling = element.nextElementSibling;
      while (nextSibling && isSupportedStyleElement(nextSibling) &&
             nextSibling.tagName === element.tagName &&
             nextSibling.getAttribute('data-type') === element.getAttribute('data-type')) {
        // 检查是否真正相邻（中间没有其他节点）
        const hasContentBetween = this.hasNodesBetween(element, nextSibling);
        if (hasContentBetween) break;

        // 合并到当前元素
        while (nextSibling.firstChild) {
          element.appendChild(nextSibling.firstChild);
        }
        processedTags.add(nextSibling);
        const toRemove = nextSibling;
        nextSibling = nextSibling.nextElementSibling;
        toRemove.remove();
      }
    }
  }

  /**
   * 检查两个元素之间是否有其他节点
   * @param elem1 第一个元素
   * @param elem2 第二个元素
   * @returns 是否有其他节点
   */
  private hasNodesBetween(elem1: Element, elem2: Element): boolean {
    let current = elem1.nextSibling;
    while (current && current !== elem2) {
      return true; // 找到了中间的节点
    }
    return false; // 没有中间节点，它们直接相邻
  }

  select(start: number, end: number): void {
    const range = this.createDOMRange(start, end);
    if (!range) return;

    const selection = window.getSelection();
    if (!selection) return;

    selection.removeAllRanges();
    selection.addRange(range);
  }

  getDocumentLength(): number {
    return this.getUnicodeStringLength(this.getTextWithLineBreaks());
  }

  findText(searchText: string): Array<{ start: number; end: number }> {
    const text = this.getTextWithLineBreaks();
    const textChars = Array.from(text);
    const searchChars = Array.from(searchText);
    const matches: Array<{ start: number; end: number }> = [];

    for (let i = 0; i <= textChars.length - searchChars.length; i++) {
      let found = true;
      for (let j = 0; j < searchChars.length; j++) {
        if (textChars[i + j] !== searchChars[j]) {
          found = false;
          break;
        }
      }
      if (found) {
        matches.push({
          start: i,
          end: i + searchChars.length,
        });
      }
    }

    return matches;
  }

  hasStyle(start: number, end: number, tagName: string): boolean {
    const allElements = this._container.querySelectorAll(tagName);
    if (!allElements || allElements.length === 0) return false;

    for (const element of Array.from(allElements)) {
      const elementRange = document.createRange();
      elementRange.selectNodeContents(element);

      try {
        const preRange = document.createRange();
        preRange.selectNodeContents(this._container);
        preRange.setEnd(elementRange.startContainer, elementRange.startOffset);

        const beforeText = preRange.toString();
        const elementText = elementRange.toString();
        const elementStart = this.getUnicodeStringLength(beforeText);
        const elementEnd = elementStart + this.getUnicodeStringLength(elementText);

        if (elementStart < end && elementEnd > start) {
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;
  }
}