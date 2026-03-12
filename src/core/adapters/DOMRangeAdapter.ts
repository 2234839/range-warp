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

import type { IRangeAdapter, WrapOptions } from './IRangeAdapter';
import { getElementPosition as getElementPositionShared, getUnicodeStringLength, getUtf16Offset, getUtf16Slice } from '../utils';

/**
 * 容器标签配置
 *
 * 参考 ProseMirror 的 MarkSpec 设计:
 * - 配置只描述容器是什么（tagName、attributeSelector）
 * - 包裹行为由调用方的 WrapOptions 决定，而非容器自身配置
 */
export interface ContainerTagConfig {
  /** 标签名 */
  tagName: string;
  /** 可选的属性选择器 (用于区分不同类型的同标签) */
  attributeSelector?: string;
  /** 显示类型: inline(行内), block(块级), inline-block(混合) */
  display?: 'inline' | 'block' | 'inline-block';
  /**
   * 跨块级元素时的处理策略
   * 'wrap' (默认): 把跨块内容全部包裹进一个容器（可能破坏块布局）
   * 'split': 按块拆分，每个块内单独包裹（保持块布局）
   */
  crossBlock?: 'wrap' | 'split';
}

/** 容器到标签的映射配置（支持动态注册） */
const CONTAINER_CONFIGS: Record<string, ContainerTagConfig> = {
  bold: { tagName: 'strong', display: 'inline' },
  italic: { tagName: 'em', display: 'inline' },
  underline: { tagName: 'u', display: 'inline' },
  strikethrough: { tagName: 's', display: 'inline' },
  highlight: { tagName: 'mark', display: 'inline' },
};

/**
 * 注册容器配置
 */
export function registerContainerConfig(name: string, config: ContainerTagConfig): void {
  CONTAINER_CONFIGS[name] = config;
}

/**
 * 根据容器名称获取标签配置
 */
function getTagConfig(name: string): ContainerTagConfig | undefined {
  return CONTAINER_CONFIGS[name];
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

    if (element.tagName.toLowerCase() !== config.tagName.toLowerCase()) {
      return false;
    }

    if (config.attributeSelector) {
      return element.matches(config.attributeSelector);
    }

    return true;
  }

  return getConfigNameForElement(element) !== undefined;
}

/**
 * 获取元素所属的容器配置名
 * @param element DOM 元素
 * @returns 容器配置名，如果不属于任何配置则返回 undefined
 */
function getConfigNameForElement(element: Element): string | undefined {
  for (const [name, config] of Object.entries(CONTAINER_CONFIGS)) {
    if (element.tagName.toLowerCase() !== config.tagName.toLowerCase()) continue;
    if (config.attributeSelector && !element.matches(config.attributeSelector)) continue;
    return name;
  }
  return undefined;
}

/**
 * 检查两个元素是否属于相同的容器配置（同类型容器）
 *
 * 对于样式标签（bold、italic 等），相同配置名即为同类型，normalize 时合并冗余嵌套。
 * 对于修订和书签，它们各自有唯一 ID（data-revision-id / data-bookmark-id），
 * 不同 ID 代表不同语义实体，不应被合并。
 */
function isSameContainerType(elem1: Element, elem2: Element): boolean {
  const name1 = getConfigNameForElement(elem1);
  const name2 = getConfigNameForElement(elem2);
  if (name1 === undefined || name1 !== name2) return false;

  /* 修订和书签按 ID 区分，不同 ID 的不算同类型 */
  const id1 = elem1.getAttribute('data-revision-id') ?? elem1.getAttribute('data-bookmark-id');
  const id2 = elem2.getAttribute('data-revision-id') ?? elem2.getAttribute('data-bookmark-id');
  if (id1 && id2) return id1 === id2;

  return true;
}

/** 单个容器配置转为 CSS 选择器 */
function configToSelector(config: ContainerTagConfig): string {
  return config.attributeSelector
    ? `${config.tagName}${config.attributeSelector}`
    : config.tagName;
}

/** 构建所有已注册容器的 CSS 选择器（逗号分隔） */
function buildContainerSelector(): string {
  return Object.values(CONTAINER_CONFIGS).map(configToSelector).join(',');
}

/** extract + insert 包裹：从 range 中提取内容放入 wrapper，再插回原位 */
function wrapRangeContents(range: globalThis.Range, wrapper: Element): void {
  const extracted = range.extractContents();
  wrapper.appendChild(extracted);
  range.insertNode(wrapper);
}

/** 块级元素选择器（缓存为模块级常量，避免重复构建） */
const BLOCK_SELECTOR = 'p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th, br';

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
   * 根据文本位置创建 DOM Range
   *
   * 一次 TreeWalker 遍历同时完成：
   * 1. 计算文档长度（用于边界检查）
   * 2. 定位 start/end 对应的文本节点和偏移量
   *
   * @param start 起始字符下标
   * @param end 结束字符下标
   * @returns DOM Range 或 null
   */
  private createDOMRange(start: number, end: number): Range | null {
    return this.createRangeInRoot(this._container, start, end, true);
  }

  /**
   * 在指定根元素内创建 DOM Range
   * @param root 根元素
   * @param start 起始字符下标（相对于根元素内的文本）
   * @param end 结束字符下标
   * @param allowEndBoundary 是否在末尾边界时回退到最后一个节点
   */
  private createRangeInRoot(root: Element, start: number, end: number, allowEndBoundary: boolean): Range | null {
    start = Math.max(0, start);
    end = Math.max(start, end);

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      null
    );

    let currentPos = 0;
    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;
    let lastNode: Text | null = null;

    let node;
    while ((node = walker.nextNode())) {
      const textNode = node as Text;
      const text = textNode.textContent || '';
      const textLength = getUnicodeStringLength(text);
      const nodeEnd = currentPos + textLength;

      if (!startNode && start < nodeEnd) {
        startNode = textNode;
        startOffset = getUtf16Offset(text, start - currentPos);
      }

      if (!endNode && end <= nodeEnd) {
        endNode = textNode;
        endOffset = getUtf16Offset(text, end - currentPos);
      }

      currentPos = nodeEnd;
      lastNode = textNode;

      if (startNode && endNode) break;
    }

    /* 处理边界情况：位置在文档末尾 */
    if (allowEndBoundary && lastNode && (!startNode || !endNode)) {
      const lastOffset = (lastNode.textContent || '').length;
      if (!startNode) { startNode = lastNode; startOffset = lastOffset; }
      if (!endNode) { endNode = lastNode; endOffset = lastOffset; }
    }

    if (!startNode || !endNode) return null;

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    return range;
  }

  /**
   * 获取包含换行符的文本内容
   * @returns 文本内容
   */
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
        this.applyStyleAcrossBlocks(start, end, config);
        return;
      }
    }

    this.wrapElement(start, end, () => document.createElement(config.tagName));
  }

  /**
   * 计算元素在容器中的文本位置范围
   * @param element DOM 元素
   * @returns { start, end } 或 null（如果无法计算）
   */
  private getElementPosition(element: Element): { start: number; end: number } | null {
    return getElementPositionShared(element, this._container);
  }

  /**
   * 获取范围内的所有块级元素
   * @param start 起始位置
   * @param end 结束位置
   * @returns 块级元素数组
   */
  getBlockElementsInRange(start: number, end: number): Element[] {
    const blockElements: Element[] = [];
    const allElements = this._container.querySelectorAll(BLOCK_SELECTOR);

    for (const elem of allElements) {
      const pos = this.getElementPosition(elem);
      if (!pos) continue;

      if (elem.tagName.toLowerCase() === 'br') {
        /* BR 是零宽度块边界，使用包含式检查 */
        if (pos.start >= start && pos.start < end) {
          blockElements.push(elem);
        }
      } else {
        if (pos.start < end && pos.end > start) {
          blockElements.push(elem);
        }
      }
    }

    return blockElements;
  }

  /**
   * 跨段落应用样式
   * @param start 起始位置
   * @param end 结束位置
   * @param config 样式配置
   */
  private applyStyleAcrossBlocks(start: number, end: number, config: ContainerTagConfig): void {
    const snapshot = this.getTextNodesWithPositions(this._container);

    for (const { node, nodeStart, nodeEnd } of snapshot) {
      /* 检查此文本节点是否在范围内 */
      if (nodeStart >= end) break;
      if (nodeEnd <= start) continue;

      // 计算在此节点中的有效范围
      const overlapStart = Math.max(nodeStart, start);
      const overlapEnd = Math.min(nodeEnd, end);

      if (overlapStart < overlapEnd) {
        // 转换为文本节点内的偏移
        const offsetStart = overlapStart - nodeStart;
        const offsetEnd = overlapEnd - nodeStart;

        /* 找到最外层样式父元素（如果有） */
        let outermostStyleParent: Element | null = null;
        let currentParent: Node | null = node.parentNode;

        while (currentParent && currentParent !== this._container) {
          if (currentParent.nodeType === Node.ELEMENT_NODE && isSupportedStyleElement(currentParent as Element)) {
            outermostStyleParent = currentParent as Element;
          }
          currentParent = currentParent.parentNode;
        }

        /* 创建局部范围和新元素 */
        const localRange = document.createRange();
        const text = node.textContent || '';
        localRange.setStart(node, getUtf16Offset(text, offsetStart));
        localRange.setEnd(node, getUtf16Offset(text, offsetEnd));

        const newElement = document.createElement(config.tagName);

        /* 如果最外层样式父元素被范围完全包含，则将其包裹进新元素 */
        let wrapped = false;
        if (outermostStyleParent) {
          const parent = outermostStyleParent.parentNode;
          if (parent) {
            const pos = this.getElementPosition(outermostStyleParent);
            if (pos && start <= pos.start && end >= pos.end) {
              const nextSibling = outermostStyleParent.nextSibling;
              parent.removeChild(outermostStyleParent);
              newElement.appendChild(outermostStyleParent);
              if (nextSibling) {
                parent.insertBefore(newElement, nextSibling);
              } else {
                parent.appendChild(newElement);
              }
              wrapped = true;
            }
          }
        }
        if (!wrapped) {
          wrapRangeContents(localRange, newElement);
        }
      }
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
    const selector = configToSelector(config);

    this.unwrapElement(start, end, selector, style);
    this.normalize(start, end);
  }

  wrapElement(start: number, end: number, elementCreator: () => Element, options?: WrapOptions): void {
    /*
     * 先创建探测元素以判断容器类型（仅用于 getConfigNameForElement），
     * 若非跨块拆分模式，该元素直接复用为实际包裹容器
     */
    const newElement = elementCreator();

    /*
     * 跨块检测：根据容器配置的 crossBlock 策略决定处理方式
     * 'split': 按块拆分，每个块内单独包裹（保持块布局）
     * 'wrap' (默认): 把所有内容包裹进一个容器
     */
    const configName = getConfigNameForElement(newElement);
    const crossBlock = configName ? CONTAINER_CONFIGS[configName]?.crossBlock : undefined;

    if (crossBlock === 'split') {
      const blockElements = this.getBlockElementsInRange(start, end);
      if (blockElements.length > 0) {
        this.wrapAcrossBlocks(start, end, elementCreator);
        this.normalize(start, end);
        return;
      }
    }

    const range = this.createDOMRange(start, end);
    if (!range) {
      return;
    }

    const mode = options?.mode ?? 'nest';

    if (mode === 'wrap') {
      /* wrap 模式：检查是否有完全包含的已有容器，整体包裹优于逐段 extract */
      const allContainerElements = this._container.querySelectorAll(buildContainerSelector());

      const fullyContainedElements: Element[] = [];
      let coveredStart = Infinity;
      let coveredEnd = 0;

      for (const elem of allContainerElements) {
        /* 跳过与新元素同类型的容器（normalize 会合并冗余嵌套） */
        if (isSameContainerType(elem, newElement)) continue;

        const pos = this.getElementPosition(elem);
        if (!pos || !(pos.start < end && pos.end > start)) continue;

        if (start <= pos.start && end >= pos.end) {
          fullyContainedElements.push(elem);
          coveredStart = Math.min(coveredStart, pos.start);
          coveredEnd = Math.max(coveredEnd, pos.end);
        }
      }

      if (fullyContainedElements.length > 0 && coveredStart <= start && coveredEnd >= end) {
        /* 提取最外层元素：被其他元素包含的不是最外层 */
        const nested = new Set<Element>();
        for (const elem of fullyContainedElements) {
          for (const other of fullyContainedElements) {
            if (elem !== other && other.contains(elem)) {
              nested.add(elem);
              break;
            }
          }
        }
        const outermost = fullyContainedElements.filter(elem => !nested.has(elem));
        if (this.areConsecutiveSiblings(outermost)) {
          this.moveElementsToWrapper(outermost, newElement);
          this.normalize(start, end);
          return;
        }
      }
    }

    /* nest 模式 或 wrap 模式 fallback：直接 extract + insert */
    wrapRangeContents(range, newElement);

    this.normalize(start, end);
  }

  /**
   * 跨块级元素包裹
   *
   * 先快照所有文本节点及位置，然后对每个重叠的文本节点
   * 创建局部 range 进行 extract + insert，保持块布局不变
   *
   * @param start 起始位置
   * @param end 结束位置
   * @param elementCreator 元素创建函数
   */
  private wrapAcrossBlocks(start: number, end: number, elementCreator: () => Element): void {
    const snapshot = this.getTextNodesWithPositions(this._container);

    /* 遍历快照，对范围内的文本节点创建包裹 */
    for (const { node, nodeStart, nodeEnd } of snapshot) {
      if (nodeStart >= end) break;
      if (nodeEnd <= start) continue;

      const overlapStart = Math.max(nodeStart, start);
      const overlapEnd = Math.min(nodeEnd, end);

      if (overlapStart < overlapEnd) {
        const localRange = document.createRange();
        const text = node.textContent || '';
        localRange.setStart(node, getUtf16Offset(text, overlapStart - nodeStart));
        localRange.setEnd(node, getUtf16Offset(text, overlapEnd - nodeStart));

        const element = elementCreator();
        wrapRangeContents(localRange, element);
      }
    }
  }

  /**
   * 检查元素列表是否是连续兄弟节点
   */
  private areConsecutiveSiblings(elements: Element[]): boolean {
    for (let i = 0; i < elements.length - 1; i++) {
      if (elements[i].nextSibling !== elements[i + 1]) {
        return false;
      }
    }
    return true;
  }

  /**
   * 将元素列表移动到包裹容器中
   */
  private moveElementsToWrapper(elements: Element[], wrapper: Element): void {
    if (elements.length === 0) return;

    const parent = elements[0].parentNode;
    if (!parent) return;

    const nextSibling = elements[elements.length - 1].nextSibling;

    for (const elem of elements) {
      wrapper.appendChild(elem);
    }

    if (nextSibling) {
      parent.insertBefore(wrapper, nextSibling);
    } else {
      parent.appendChild(wrapper);
    }
  }

  unwrapElement(start: number, end: number, selector: string, style?: string): void {
    // 如果指定了样式名称,检查是否支持
    if (style && !getTagConfig(style)) {
      return;
    }

    const allTagElements = this._container.querySelectorAll(selector);

    for (const element of allTagElements) {
      if (!this._container.contains(element)) continue;
      if (style && !isSupportedStyleElement(element, style)) continue;

      const pos = this.getElementPosition(element);
      if (!pos) continue;

      if (pos.start < end && pos.end > start) {
        if (start <= pos.start && end >= pos.end) {
          /* 完全包含：移除标签但保留子元素 */
          const parent = element.parentNode;
          if (parent) {
            while (element.firstChild) {
              parent.insertBefore(element.firstChild, element);
            }
            element.remove();
          }
        } else {
          this.splitElement(element, pos.start, start, end);
        }
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
   * @param removeStart 要移除样式的起始位置
   * @param removeEnd 要移除样式的结束位置
   */
  private splitElement(
    element: Element,
    elementStart: number,
    removeStart: number,
    removeEnd: number
  ): void {
    const parent = element.parentNode;
    if (!parent) return;

    const offsetStart = Math.max(0, removeStart - elementStart);
    const offsetEnd = Math.min(getUnicodeStringLength(element.textContent || ''), removeEnd - elementStart);

    const hasNestedStyles = this.hasNestedStyleElements(element);
    const result = hasNestedStyles
      ? this.processElementForStyleRemoval(element, offsetStart, offsetEnd)
      : this.processSimpleElementRemoval(element, offsetStart, offsetEnd);

    if (result.hasChildNodes()) {
      element.replaceWith(result);
    } else {
      element.replaceWith(document.createTextNode(element.textContent || ''));
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
    const elementLength = getUnicodeStringLength(element.textContent || '');
    const removeFromStart = removeStart === 0;
    const removeToEnd = removeEnd === elementLength;

    // 前段 (保留样式)
    if (!removeFromStart) {
      const beforeElement = element.cloneNode(false);
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
      const afterElement = element.cloneNode(false);
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
    return this.createRangeInRoot(element, start, end, false);
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
    const removeToEnd = removeEnd === getUnicodeStringLength(element.textContent || '');

    // 获取元素的所有文本节点及其位置
    const textNodes = this.getTextNodesWithPositions(element);

    // 第一段：移除起始位置之前（移除所有样式，包括内部样式）
    if (!removeFromStart) {
      for (const { node, nodeStart, nodeEnd } of textNodes) {
        if (nodeEnd <= removeStart) {
          const text = node.textContent || '';
          fragment.appendChild(document.createTextNode(text));
        } else if (nodeStart < removeStart) {
          const text = node.textContent || '';
          const utf16End = getUtf16Offset(text, removeStart - nodeStart);
          fragment.appendChild(document.createTextNode(text.slice(0, utf16End)));
        }
      }
    }

    // 第二段：移除范围内的内容（移除外层样式，保留内部样式）
    for (const { node, nodeStart, nodeEnd } of textNodes) {
      if (nodeStart >= removeStart && nodeEnd <= removeEnd) {
        fragment.appendChild(node.cloneNode(true));
      } else if (nodeStart < removeEnd && nodeEnd > removeStart) {
        const text = node.textContent || '';
        const unicodeLen = getUnicodeStringLength(text);
        const startInNode = Math.max(0, removeStart - nodeStart);
        const endInNode = Math.min(unicodeLen, removeEnd - nodeStart);
        const middleText = getUtf16Slice(text, startInNode, endInNode);

        let currentParent: Node | null = node.parentNode;
        let hasStyledParent = false;
        while (currentParent && currentParent !== element) {
          if (currentParent.nodeType === Node.ELEMENT_NODE) {
            if (isSupportedStyleElement(currentParent as Element)) {
              hasStyledParent = true;
              break;
            }
          }
          currentParent = currentParent.parentNode;
        }

        if (hasStyledParent && node.parentNode) {
          const clonedParent = node.parentNode.cloneNode(false);
          clonedParent.textContent = middleText;
          fragment.appendChild(clonedParent);
        } else {
          fragment.appendChild(document.createTextNode(middleText));
        }
      }
    }

    // 第三段：移除结束位置之后（移除所有样式，包括内部样式）
    if (!removeToEnd) {
      for (const { node, nodeStart, nodeEnd } of textNodes) {
        if (nodeStart >= removeEnd) {
          const text = node.textContent || '';
          fragment.appendChild(document.createTextNode(text));
        } else if (nodeEnd > removeEnd) {
          const text = node.textContent || '';
          const utf16Start = getUtf16Offset(text, removeEnd - nodeStart);
          fragment.appendChild(document.createTextNode(text.slice(utf16Start)));
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
      const textLength = getUnicodeStringLength(text);
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

  normalize(start: number, end: number): void {
    const selector = buildContainerSelector();

    /*
     * 原生 normalize 递归合并所有后代中的相邻 Text 节点并移除空 Text 节点
     * extractContents 可能在元素之间留下空文本节点，导致相邻同类标签无法合并
     */
    this._container.normalize();

    /* 单次遍历同时处理：冗余嵌套合并 + 空标签移除 */
    const allElements = this._container.querySelectorAll(selector);
    for (const element of allElements) {
      const parent = element.parentElement;
      if (parent && isSupportedStyleElement(parent) &&
          isSameContainerType(element, parent)) {
        this.mergeRedundantTags(element, parent);
        continue;
      }

      if (element.textContent === '') {
        element.remove();
      }
    }

    /* 合并相邻的相同标签 */
    this.mergeAdjacentSameTags(start, end, selector);
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
   *
   * 对于与操作范围有交集的标签，同时向前和向后合并相邻的同类型标签，
   * 确保不会产生碎片化的 DOM 结构（如 <strong>a</strong><strong>b</strong><strong>c</strong>）
   *
   * @param start 起始位置
   * @param end 结束位置
   */
  private mergeAdjacentSameTags(start: number, end: number, selector: string): void {
    const allElements = this._container.querySelectorAll(selector);
    const processedTags = new Set<Element>();

    for (const element of allElements) {
      if (processedTags.has(element)) continue;

      const pos = this.getElementPosition(element);
      if (!pos) continue;

      /* 只处理与操作范围有交集的标签 */
      if (pos.end <= start || pos.start >= end) continue;

      let mergeTarget = element;

      /* 向后合并所有相邻的同类型标签 */
      let candidate: Node | null = mergeTarget.nextSibling;
      while (candidate) {
        if (candidate.nodeType !== Node.ELEMENT_NODE) break;
        const nextElem = candidate as Element;
        if (!isSameContainerType(mergeTarget, nextElem)) break;

        while (nextElem.firstChild) {
          mergeTarget.appendChild(nextElem.firstChild);
        }
        processedTags.add(nextElem);
        candidate = nextElem.nextSibling;
        nextElem.remove();
      }

      /* 向前合并所有相邻的同类型标签 */
      candidate = mergeTarget.previousSibling;
      while (candidate) {
        if (candidate.nodeType !== Node.ELEMENT_NODE) break;
        const prevElem = candidate as Element;
        if (!isSameContainerType(mergeTarget, prevElem)) break;

        while (mergeTarget.firstChild) {
          prevElem.appendChild(mergeTarget.firstChild);
        }
        processedTags.add(mergeTarget);
        const emptied = mergeTarget;
        candidate = prevElem.previousSibling;
        mergeTarget = prevElem;
        emptied.remove();
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
    /*
     * 使用与 createDOMRange 一致的位置计算方式（不包含换行符），
     * 确保 findText / setStyle / insertText 等操作的位置系统一致
     */
    let length = 0;
    const walker = document.createTreeWalker(
      this._container,
      NodeFilter.SHOW_TEXT,
      null
    );
    let node;
    while ((node = walker.nextNode())) {
      length += getUnicodeStringLength(node.textContent || '');
    }
    return length;
  }

  findText(searchText: string): Array<{ start: number; end: number }> {
    if (!searchText) return [];

    const searchUnicodeLen = getUnicodeStringLength(searchText);
    const matches: Array<{ start: number; end: number }> = [];
    const snapshot = this.getTextNodesWithPositions(this._container);

    for (const { node, nodeStart } of snapshot) {
      const text = node.textContent || '';
      const unicodeLen = getUnicodeStringLength(text);
      let searchIndex = 0;

      while (searchIndex <= unicodeLen - searchUnicodeLen) {
        const candidate = getUtf16Slice(text, searchIndex, searchIndex + searchUnicodeLen);
        if (candidate === searchText) {
          matches.push({ start: nodeStart + searchIndex, end: nodeStart + searchIndex + searchUnicodeLen });
          searchIndex += searchUnicodeLen;
        } else {
          searchIndex++;
        }
      }
    }

    return matches;
  }

  hasStyle(start: number, end: number, tagName: string): boolean {
    const allElements = this._container.querySelectorAll(tagName);

    for (const element of allElements) {
      const pos = this.getElementPosition(element);
      if (pos && pos.start < end && pos.end > start) {
        return true;
      }
    }

    return false;
  }

  removeElementsBySelector(selector: string, keepChildren: boolean): void {
    const elements = this._container.querySelectorAll(selector);

    for (const element of elements) {
      if (keepChildren) {
        const parent = element.parentNode;
        if (!parent) continue;

        while (element.firstChild) {
          parent.insertBefore(element.firstChild, element);
        }
        element.remove();
      } else {
        element.remove();
      }
    }

    /* keepChildren 时子节点被提升，可能产生相邻 Text 碎片；直接移除不会 */
    if (keepChildren) {
      this._container.normalize();
    }
  }

  mergeBlocks(blockElements: Element[]): void {
    if (blockElements.length < 2) return;

    /* 按文档顺序排序 */
    const sorted = [...blockElements].sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    /* 最后一个块被清空时，将下一个兄弟块也纳入合并 */
    const lastBlock = sorted[sorted.length - 1];
    if (!lastBlock.textContent?.trim()) {
      const nextBlock = lastBlock.nextElementSibling;
      if (nextBlock && nextBlock.parentElement === this._container) {
        sorted.push(nextBlock);
      }
    }

    const target = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const children = Array.from(sorted[i].childNodes);
      for (const child of children) {
        target.appendChild(child);
      }
      sorted[i].remove();
    }

    /* 合并后如果目标块为空，也移除 */
    if (!target.textContent?.trim()) {
      target.remove();
    }

    this._container.normalize();
  }
}