/**
 * DOM Range 适配器实现
 *
 * 核心职责：基于原生 DOM Range API 实现 IRangeAdapter 接口
 * 设计原则：
 * - 直接使用浏览器 DOM Range API，不依赖任何富文本编辑器
 * - 支持 Unicode 字符下标计算
 * - 提供准确的文本位置定位能力
 */

import type { IRangeAdapter } from './IRangeAdapter';

/** 样式到标签名的映射 */
const STYLE_TAG_MAP: Record<string, string> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strikethrough: 's',
  highlight: 'mark',
};

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

  /**
   * 清理元素中的空子元素
   * @param element 元素
   */
  private cleanupEmptyChildren(element: Node): void {
    if (!(element instanceof Element)) return;
    const emptyElements = Array.from(element.children).filter(
      (child) => child.textContent === '' && child.childNodes.length === 0
    );
    for (const emptyElement of emptyElements.reverse()) {
      emptyElement.remove();
    }
  }

  // ==================== IRangeAdapter 接口实现 ====================

  getText(start: number, end: number): string {
    const range = this.createDOMRange(start, end);
    return range ? range.toString() : '';
  }

  insertText(position: number, text: string): void {
    const range = this.createDOMRange(position, position);
    if (!range) return;

    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
  }

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

  setStyle(start: number, end: number, style: string): void {
    const tagName = STYLE_TAG_MAP[style];
    if (!tagName) return;

    this.wrapElement(start, end, () => document.createElement(tagName));
  }

  removeStyle(start: number, end: number, style: string): void {
    const tagName = STYLE_TAG_MAP[style];
    if (!tagName) return;

    this.unwrapElement(start, end, tagName);
  }

  wrapElement(start: number, end: number, elementCreator: () => Element): void {
    const range = this.createDOMRange(start, end);
    if (!range) {
      throw new Error(`无法创建范围: start=${start}, end=${end}`);
    }

    const extractedContent = range.extractContents();
    const newElement = elementCreator();
    newElement.appendChild(extractedContent);
    range.insertNode(newElement);

    this.cleanupEmptyChildren(newElement);
  }

  unwrapElement(start: number, end: number, tagName: string): void {
    const allTagElements = Array.from(this._container.querySelectorAll(tagName));

    for (const element of allTagElements) {
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
          const fullRange = document.createRange();
          fullRange.selectNode(element);

          const contents = fullRange.extractContents();
          const textNode = document.createTextNode(contents.textContent || '');
          fullRange.insertNode(textNode);
        }
      } catch {
        continue;
      }
    }
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

export default DOMRangeAdapter;
