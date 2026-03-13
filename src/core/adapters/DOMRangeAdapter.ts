/**
 * DOM Range 适配器实现
 *
 * 测试路径: tsx src/__tests__/adapter.test.ts
 *
 * 核心职责：基于原生 DOM Range API 实现 IRangeAdapter 接口
 * 设计原则：
 * - 直接使用浏览器 DOM Range API，不依赖任何富文本编辑器
 * - 支持 Unicode 字符下标计算 (使用 for...of 处理 emoji 等多码点字符)
 * - 提供准确的文本位置定位能力
 */

import type { IRangeAdapter, WrapOptions, ContainerTagConfig } from './IRangeAdapter';
import { getUnicodeStringLength, getUtf16Offset, getUtf16Slice } from '../utils';

/** 容器到标签的映射配置（由上层服务通过 registerContainerConfig 动态注册） */
const CONTAINER_CONFIGS: Record<string, ContainerTagConfig> = {};

/** 缓存的选择器字符串 */
let _cachedStyleSelector = '';
let _cachedTagToConfigName: Map<string, string> | null = null;

function _invalidateConfigCache(): void {
  _cachedStyleSelector = '';
  _cachedTagToConfigName = null;
}

/**
 * 注册容器配置
 */
export function registerContainerConfig(name: string, config: ContainerTagConfig): void {
  CONTAINER_CONFIGS[name] = config;
  _invalidateConfigCache();
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
 * 判断规则：
 * 1. 配置名不同 → 不同类型
 * 2. 配置名相同 + 无 idAttribute → 同类型（如样式标签）
 * 3. 配置名相同 + 有 idAttribute + mergeAdjacent 为 true → 同类型（忽略 ID 差异）
 * 4. 配置名相同 + 有 idAttribute + mergeAdjacent 为 false → 按 ID 区分
 */
function isSameContainerType(elem1: Element, elem2: Element): boolean {
  const name1 = getConfigNameForElement(elem1);
  const name2 = getConfigNameForElement(elem2);
  if (name1 === undefined || name1 !== name2) return false;

  const config = CONTAINER_CONFIGS[name1];
  if (!config) return false;

  /* mergeAdjacent 为 true 时，忽略 ID 差异直接合并 */
  if (config.mergeAdjacent) return true;

  /* 带 idAttribute 的容器按 ID 区分，不同 ID 的不算同类型 */
  const idAttr = config.idAttribute;
  if (idAttr) {
    const id1 = elem1.getAttribute(idAttr);
    const id2 = elem2.getAttribute(idAttr);
    if (id1 && id2) return id1 === id2;
  }

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

/** 构建纯样式标签选择器（不含 attributeSelector 的配置，如 bold、italic） */
function buildStyleSelector(): string {
  if (!_cachedStyleSelector) {
    _cachedStyleSelector = Object.values(CONTAINER_CONFIGS)
      .filter(config => !config.attributeSelector)
      .map(configToSelector)
      .join(',');
  }
  return _cachedStyleSelector;
}

/** 构建标签名到配置名的映射（如 'strong' → 'bold'） */
function buildTagToConfigName(): Map<string, string> {
  if (!_cachedTagToConfigName) {
    _cachedTagToConfigName = new Map();
    for (const [name, config] of Object.entries(CONTAINER_CONFIGS)) {
      if (!config.attributeSelector) {
        _cachedTagToConfigName.set(config.tagName.toLowerCase(), name);
      }
    }
  }
  return _cachedTagToConfigName;
}

/** extract + insert 包裹：从 range 中提取内容放入 wrapper，再插回原位 */
function wrapRangeContents(range: globalThis.Range, wrapper: Element): void {
  const extracted = range.extractContents();
  wrapper.appendChild(extracted);
  range.insertNode(wrapper);
}

/** 解包元素：将元素的子节点提升到父级（替代元素自身） */
function unwrapChildNodes(element: Element): void {
  const parent = element.parentNode;
  if (!parent) return;
  const fragment = element.ownerDocument.createDocumentFragment();
  while (element.firstChild) {
    fragment.appendChild(element.firstChild);
  }
  parent.replaceChild(fragment, element);
}

/**
 * 查找文本节点的直接样式祖先元素（不越过 outerBoundary）
 * @returns 样式祖先元素或 null
 */
function findDirectStyledParent(node: Node, outerBoundary: Element): Element | null {
  let current: Node | null = node.parentNode;
  while (current && current !== outerBoundary) {
    if (isElementNode(current) && isSupportedStyleElement(current)) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

/** 块级元素标签名集合 */
export const BLOCK_TAG_NAMES = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'li', 'blockquote', 'pre', 'td', 'th', 'ul', 'ol',
  'table', 'tr', 'thead', 'tbody', 'section', 'article',
  'header', 'footer', 'nav', 'main', 'aside', 'figure', 'figcaption',
]);

/** 获取不可复制容器的 CSS 选择器 */
export function getNonCopyableSelector(): string {
  return Object.values(CONTAINER_CONFIGS)
    .filter(config => config.copyable === false)
    .map(configToSelector)
    .join(',');
}

/** 块级元素选择器（不含 br，用于收集块级元素和段落合并） */
const BLOCK_ELEMENT_SELECTOR = [...BLOCK_TAG_NAMES].join(', ');


/** 类型守卫：判断节点是否为元素节点（兼容跨 iframe 场景） */
function isElementNode(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

/**
 * 注入到容器 document 中的核心样式（书签、修订、文本格式、高亮）
 *
 * 当容器在 iframe 中时，主文档的 CSS 不会穿透，需要手动注入
 */
const INJECTABLE_STYLES = `
.bookmark {
  background-color: #fef3c7;
  border-bottom: 2px solid #f59e0b;
  padding: 2px 4px;
  border-radius: 2px;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;
}
.bookmark:hover {
  background-color: #fde68a;
  border-bottom-color: #d97706;
}
.revision-insert {
  background-color: #dcfce7;
  border-bottom: 2px solid #22c55e;
  padding: 2px 4px;
  border-radius: 2px;
  transition: background-color 0.2s;
}
.revision-insert:hover {
  background-color: #bbf7d0;
}
.revision-delete {
  background-color: #fee2e2;
  text-decoration: line-through;
  padding: 2px 4px;
  border-radius: 2px;
  transition: background-color 0.2s;
}
.revision-delete:hover {
  background-color: #fecaca;
}
.highlight {
  background-color: #fef08a;
  padding: 2px 4px;
  border-radius: 2px;
}
`;

export interface DOMRangeAdapterOptions {
  /** 编辑器容器元素 */
  container: HTMLElement;
  /** 容器所属的 window 对象（iframe 场景传入 iframe.contentWindow） */
  ownerWindow?: Window;
}

export class DOMRangeAdapter implements IRangeAdapter {
  /** 编辑器容器元素 */
  private readonly _container: HTMLElement;
  /** 容器所属的 window 对象 */
  private readonly _ownerWindow: Window;
  /** 容器所属的 document 对象（支持 iframe 场景） */
  private readonly _doc: Document;

  constructor(options: DOMRangeAdapterOptions) {
    this._container = options.container;
    this._ownerWindow = options.ownerWindow ?? window;
    this._doc = this._ownerWindow.document;

    /** iframe 场景下注入样式到容器所属的 document */
    if (this._doc !== document) {
      const style = this._doc.createElement('style');
      style.textContent = INJECTABLE_STYLES;
      this._doc.head.appendChild(style);
    }
  }

  /**
   * 获取容器元素
   */
  getContainer(): HTMLElement {
    return this._container;
  }

  /**
   * 根据已注册的容器配置创建元素
   */
  createConfigElement(configName: string, attrs?: Record<string, string>): Element {
    const config = getTagConfig(configName);
    if (!config) {
      throw new Error(`Unknown config: ${configName}`);
    }

    const element = this._doc.createElement(config.tagName);
    if (config.attributeSelector?.startsWith('.')) {
      element.className = config.attributeSelector.slice(1);
    }

    for (const [key, value] of Object.entries(attrs ?? {})) {
      element.setAttribute(key, value);
    }

    return element;
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
   * @param start 起始字符下标（相对于根元素内的文本，包含虚拟 \n）
   * @param end 结束字符下标
   * @param allowEndBoundary 是否在末尾边界时回退到最后一个节点
   */
  private createRangeInRoot(root: Element, start: number, end: number, allowEndBoundary: boolean): Range | null {
    start = Math.max(0, start);
    end = Math.max(start, end);

    const { snapshot } = this._buildTextNodeData();
    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;
    let lastNode: Text | null = null;

    for (const { node, nodeStart, nodeEnd } of snapshot) {
      lastNode = node;

      if (!startNode && start < nodeEnd) {
        startNode = node;
        startOffset = getUtf16Offset(node.textContent || '', start - nodeStart);
      }

      if (!endNode && end <= nodeEnd) {
        endNode = node;
        endOffset = getUtf16Offset(node.textContent || '', end - nodeStart);
      }

      if (startNode && endNode) break;
    }

    /** 虚拟 \n 位置落在文本节点间隙中：映射到最近的文本节点 */
    if (!startNode && snapshot.length > 0) {
      for (let i = snapshot.length - 1; i >= 0; i--) {
        const { node, nodeEnd } = snapshot[i];
        if (nodeEnd <= start) {
          startNode = node;
          startOffset = (node.textContent || '').length;
          break;
        }
      }
      /** 没找到前一个节点，取第一个节点的开头 */
      if (!startNode) {
        startNode = snapshot[0].node;
        startOffset = 0;
      }
    }

    if (!endNode && snapshot.length > 0) {
      for (let i = snapshot.length - 1; i >= 0; i--) {
        const { node, nodeEnd } = snapshot[i];
        if (nodeEnd <= end) {
          endNode = node;
          endOffset = (node.textContent || '').length;
          break;
        }
      }
      if (!endNode) {
        endNode = snapshot[0].node;
        endOffset = 0;
      }
    }

    /** 处理边界情况：位置在文档末尾 */
    if (allowEndBoundary && lastNode && (!startNode || !endNode)) {
      const lastOffset = (lastNode.textContent || '').length;
      if (!startNode) { startNode = lastNode; startOffset = lastOffset; }
      if (!endNode) { endNode = lastNode; endOffset = lastOffset; }
    }

    if (!startNode || !endNode) return null;

    const range = this._doc.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    return range;
  }

  // ==================== IRangeAdapter 接口实现 ====================

  getText(start: number, end: number): string {
    const snapshot = this._buildSnapshot();
    const parts: string[] = [];
    let prevEnd = 0;

    for (const { node, nodeStart, nodeEnd } of snapshot) {
      if (nodeStart >= end) break;
      if (nodeEnd <= start) {
        prevEnd = nodeEnd;
        continue;
      }

      /** 在文本节点间隙处插入虚拟换行 */
      if (nodeStart > prevEnd && nodeStart < end) {
        const breakStart = Math.max(prevEnd, start);
        const breakEnd = Math.min(nodeStart, end);
        const breakCount = breakEnd - breakStart;
        if (breakCount > 0) {
          parts.push('\n'.repeat(breakCount));
        }
      }

      const overlapStart = Math.max(nodeStart, start) - nodeStart;
      const overlapEnd = Math.min(nodeEnd, end) - nodeStart;
      parts.push(getUtf16Slice(node.textContent || '', overlapStart, overlapEnd));

      prevEnd = nodeEnd;
    }

    /** 处理末尾的虚拟换行（如最后一个块结束后的 \n） */
    if (prevEnd < end) {
      const breakCount = Math.min(end - prevEnd, end - start);
      if (breakCount > 0) {
        parts.push('\n'.repeat(breakCount));
      }
    }

    return parts.join('');
  }

  insertText(position: number, text: string): void {
    // 处理空容器的情况
    if (this._container.childNodes.length === 0) {
      this._container.appendChild(this._doc.createTextNode(text));
      return;
    }

    // 在正确的 DOM 位置插入文本，文本自然被包含在所在位置的容器中
    const range = this.createDOMRange(position, position);
    if (!range) {
      this._container.appendChild(this._doc.createTextNode(text));
      return;
    }

    range.insertNode(this._doc.createTextNode(text));
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
    const textNode = this._doc.createTextNode(text);
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

  applyConfig(start: number, end: number, configName: string): void {
    const config = getTagConfig(configName);
    if (!config) return;

    // 标准化选区
    [start, end] = this.normalizeRange(start, end);

    // 对于 inline 样式，检查是否跨段落或跨换行
    if (config.display === 'inline' || !config.display) {
      const { snapshot, index, brIndex } = this._buildTextNodeData();

      /** 检测是否有块级元素或范围内的 <br> 换行 */
      const hasBlocks = this._collectBlocksInRange(start, end, index, brIndex).length > 0;
      const hasBR = [...brIndex.values()].some(pos => pos > start && pos < end);
      if (hasBlocks || hasBR) {
        this._applyStyleAcrossBlocksWithData(start, end, config, snapshot, index);
        return;
      }
    }

    this.wrapElement(start, end, () => this._doc.createElement(config.tagName));
  }

  /**
   * 收集范围内的块级元素
   */
  private _collectBlocksInRange(
    start: number, end: number,
    index: Map<Text, { start: number; end: number }>,
    brIndex: Map<Element, number>,
  ): Element[] {
    const result: Element[] = [];
    const allElements = this._container.querySelectorAll(BLOCK_ELEMENT_SELECTOR);
    for (const elem of allElements) {
      const pos = this._getPositionFromIndex(elem, index, brIndex);
      if (!pos) continue;

      if (pos.start < end && pos.end > start) {
        result.push(elem);
      }
    }
    return result;
  }

  /**
   * 使用预构建的文本数据应用跨段落样式
   *
   * 对范围内每个重叠文本节点：
   * - 若文本在已有样式元素中且该元素完全被 [start, end) 包含 → 包裹该样式元素（保持正确嵌套顺序）
   * - 否则 → extract 指定文本范围并包裹
   */
  private _applyStyleAcrossBlocksWithData(
    start: number, end: number, config: ContainerTagConfig,
    snapshot: Array<{ node: Text; nodeStart: number; nodeEnd: number }>,
    index: Map<Text, { start: number; end: number }>,
  ): void {
    for (const { node, nodeStart, nodeEnd } of snapshot) {
      if (nodeStart >= end) break;
      if (nodeEnd <= start) continue;

      const overlapStart = Math.max(nodeStart, start);
      const overlapEnd = Math.min(nodeEnd, end);

      if (overlapStart < overlapEnd) {
        const offsetStart = overlapStart - nodeStart;
        const offsetEnd = overlapEnd - nodeStart;

        const newElement = this._doc.createElement(config.tagName);

        /** 查找文本节点的最外层样式祖先 */
        let outermostStyleParent: Element | null = null;
        let currentParent: Node | null = node.parentNode;

        while (currentParent && currentParent !== this._container) {
          if (isElementNode(currentParent) && isSupportedStyleElement(currentParent)) {
            outermostStyleParent = currentParent;
          }
          currentParent = currentParent.parentNode;
        }

        /** 样式祖先完全包含在 [start, end) 中时，直接包裹该元素 */
        if (outermostStyleParent) {
          const parent = outermostStyleParent.parentNode;
          if (parent) {
            const pos = this._getPositionFromIndex(outermostStyleParent, index);
            if (pos && start <= pos.start && end >= pos.end) {
              const nextSibling = outermostStyleParent.nextSibling;
              parent.removeChild(outermostStyleParent);
              newElement.appendChild(outermostStyleParent);
              if (nextSibling) {
                parent.insertBefore(newElement, nextSibling);
              } else {
                parent.appendChild(newElement);
              }
              continue;
            }
          }
        }

        /** 部分重叠：extract 文本范围并包裹 */
        const localRange = this._doc.createRange();
        const text = node.textContent || '';
        localRange.setStart(node, getUtf16Offset(text, offsetStart));
        localRange.setEnd(node, getUtf16Offset(text, offsetEnd));
        wrapRangeContents(localRange, newElement);
      }
    }

    this.normalize(start, end);
  }

  /**
   * 获取范围内的所有块级元素
   * @param start 起始位置
   * @param end 结束位置
   * @returns 块级元素数组
   */
  getBlockElementsInRange(start: number, end: number): Element[] {
    const { index, brIndex } = this._buildTextNodeData();
    return this._collectBlocksInRange(start, end, index, brIndex);
  }

  removeConfig(start: number, end: number, configName: string): void {
    const config = getTagConfig(configName);
    if (!config) return;

    // 标准化选区
    [start, end] = this.normalizeRange(start, end);

    // 构建选择器
    const selector = configToSelector(config);

    this.unwrapElement(start, end, selector, configName);
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
    const config = configName ? CONTAINER_CONFIGS[configName] : undefined;
    const crossBlock = config?.crossBlock;

    if (crossBlock === 'split') {
      const blockElements = this.getBlockElementsInRange(start, end);
      if (blockElements.length > 0) {
        this.wrapAcrossBlocks(start, end, elementCreator, config?.wrapEmpty ?? false);
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
      const wrapIndex = this._buildIndex();

      const fullyContainedElements: Element[] = [];
      let coveredStart = Infinity;
      let coveredEnd = 0;

      for (const elem of allContainerElements) {
        /* 跳过与新元素同类型的容器（normalize 会合并冗余嵌套） */
        if (isSameContainerType(elem, newElement)) continue;

        const pos = this._getPositionFromIndex(elem, wrapIndex);
        if (!pos || !(pos.start < end && pos.end > start)) continue;

        if (start <= pos.start && end >= pos.end) {
          fullyContainedElements.push(elem);
          coveredStart = Math.min(coveredStart, pos.start);
          coveredEnd = Math.max(coveredEnd, pos.end);
        }
      }

      if (fullyContainedElements.length > 0 && coveredStart <= start && coveredEnd >= end) {
        /* 提取最外层元素：如果元素的祖先也在集合中，则它不是最外层 */
        const elementSet = new Set(fullyContainedElements);
        const outermost = fullyContainedElements.filter(elem => {
          let parent = elem.parentElement;
          while (parent) {
            if (elementSet.has(parent)) return false;
            parent = parent.parentElement;
          }
          return true;
        });
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
   * @param wrapEmpty 是否同时包裹范围内无文本内容的空块元素
   */
  private wrapAcrossBlocks(start: number, end: number, elementCreator: () => Element, wrapEmpty: boolean): void {
    const snapshot = this._buildSnapshot();

    /** 1. 包裹文本节点 */
    for (const { node, nodeStart, nodeEnd } of snapshot) {
      if (nodeStart >= end) break;
      if (nodeEnd <= start) continue;

      const overlapStart = Math.max(nodeStart, start);
      const overlapEnd = Math.min(nodeEnd, end);

      if (overlapStart < overlapEnd) {
        const localRange = this._doc.createRange();
        const text = node.textContent || '';
        localRange.setStart(node, getUtf16Offset(text, overlapStart - nodeStart));
        localRange.setEnd(node, getUtf16Offset(text, overlapEnd - nodeStart));

        const element = elementCreator();
        wrapRangeContents(localRange, element);
      }
    }

    /**
     * 2. 包裹范围内的空块元素
     *
     * 空块（无文本内容的段落）不会出现在文本快照中，
     * 但视觉上属于选中范围的一部分，需要一并包裹使容器覆盖完整
     *
     * 通用处理：检测所有与 DOM Range 相交的块级元素，
     * 对其中没有文本内容的块，将其子节点包裹到容器元素中
     */
    if (!wrapEmpty) return;

    const range = this.createDOMRange(start, end);
    if (!range) return;

    const containerSelector = buildContainerSelector();
    /** 只处理容器型块级元素（能包含子元素），不处理 br 等 void 叶子元素 */
    const blockContainerSelector = [...BLOCK_TAG_NAMES].join(', ');
    for (const block of this._container.querySelectorAll(blockContainerSelector)) {
      if (!range.intersectsNode(block)) continue;

      /** 有文本内容的块已被步骤 1 处理，跳过 */
      if (block.textContent !== '') continue;

      /** 包裹空块内的所有子元素（通用，不限定标签类型） */
      const children = [...block.children];
      for (const child of children) {
        if (child.closest(containerSelector)) continue;
        const element = elementCreator();
        block.replaceChild(element, child);
        element.appendChild(child);
      }

      /** 完全无子节点的空块，插入 br 以保持视觉占位 */
      if (children.length === 0) {
        const element = elementCreator();
        element.appendChild(this._doc.createElement('br'));
        block.appendChild(element);
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
    const index = this._buildIndex();

    for (const element of allTagElements) {
      if (!this._container.contains(element)) continue;
      if (style && !isSupportedStyleElement(element, style)) continue;

      const pos = this._getPositionFromIndex(element, index);
      if (!pos) continue;

      if (pos.start < end && pos.end > start) {
        if (start <= pos.start && end >= pos.end) {
          /* 完全包含：移除标签但保留子元素 */
          unwrapChildNodes(element);
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
      element.replaceWith(this._doc.createTextNode(element.textContent || ''));
    }
  }

  /**
   * 检查元素是否有嵌套的样式元素
   * @param element 元素
   * @returns 是否有嵌套样式
   */
  private hasNestedStyleElements(element: Element): boolean {
    const walker = this._doc.createTreeWalker(
      element,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node === element) return NodeFilter.FILTER_SKIP;
          return isElementNode(node) && isSupportedStyleElement(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
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
    const fragment = this._doc.createDocumentFragment();
    const elementLength = getUnicodeStringLength(element.textContent || '');
    const removeFromStart = removeStart === 0;
    const removeToEnd = removeEnd === elementLength;

    // 前段 (保留样式)
    if (!removeFromStart) {
      const beforeElement = element.cloneNode(false);
      const beforeRange = this.createRangeInRoot(element, 0, removeStart, false);
      if (beforeRange) {
        const beforeContent = beforeRange.cloneContents();
        beforeElement.appendChild(beforeContent);
        fragment.appendChild(beforeElement);
      }
    }

    // 中段 (移除样式 - 纯文本)
    const middleRange = this.createRangeInRoot(element, removeStart, removeEnd, false);
    if (middleRange) {
      const middleText = middleRange.toString();
      if (middleText) {
        fragment.appendChild(this._doc.createTextNode(middleText));
      }
    }

    // 后段 (保留样式)
    if (!removeToEnd) {
      const afterElement = element.cloneNode(false);
      const afterRange = this.createRangeInRoot(element, removeEnd, elementLength, false);
      if (afterRange) {
        const afterContent = afterRange.cloneContents();
        afterElement.appendChild(afterContent);
        fragment.appendChild(afterElement);
      }
    }

    return fragment;
  }

  /**
   * 处理元素以移除部分样式，保留内部样式
   * @param element 要处理的元素
   * @param removeStart 要移除的起始偏移（相对于元素）
   * @param removeEnd 要移除的结束偏移（相对于元素）
   * @returns 处理后的 DocumentFragment
   */
  private processElementForStyleRemoval(element: Element, removeStart: number, removeEnd: number): DocumentFragment {
    const fragment = this._doc.createDocumentFragment();
    const removeFromStart = removeStart === 0;
    const removeToEnd = removeEnd === getUnicodeStringLength(element.textContent || '');

    const textNodes = this.getTextNodesWithPositions(element);

    /**
     * 将文本附加到容器中，保留内部样式父元素
     */
    const appendWithStyle = (container: Node, node: Text, text: string) => {
      const styledParent = findDirectStyledParent(node, element);
      if (styledParent) {
        const cloned = styledParent.cloneNode(false);
        cloned.textContent = text;
        container.appendChild(cloned);
      } else {
        container.appendChild(this._doc.createTextNode(text));
      }
    };

    // 第一段：移除起始位置之前（保留外层样式和内部样式）
    if (!removeFromStart) {
      const beforeWrapper = element.cloneNode(false);
      for (const { node, nodeStart, nodeEnd } of textNodes) {
        if (nodeEnd <= removeStart) {
          appendWithStyle(beforeWrapper, node, node.textContent || '');
        } else if (nodeStart < removeStart) {
          const utf16End = getUtf16Offset(node.textContent || '', removeStart - nodeStart);
          appendWithStyle(beforeWrapper, node, (node.textContent || '').slice(0, utf16End));
        }
      }
      fragment.appendChild(beforeWrapper);
    }

    // 第二段：移除范围内的内容（移除外层样式，保留内部样式）
    for (const { node, nodeStart, nodeEnd } of textNodes) {
      if (nodeStart >= removeStart && nodeEnd <= removeEnd) {
        appendWithStyle(fragment, node, node.textContent || '');
      } else if (nodeStart < removeEnd && nodeEnd > removeStart) {
        const text = node.textContent || '';
        const unicodeLen = getUnicodeStringLength(text);
        const startInNode = Math.max(0, removeStart - nodeStart);
        const endInNode = Math.min(unicodeLen, removeEnd - nodeStart);
        appendWithStyle(fragment, node, getUtf16Slice(text, startInNode, endInNode));
      }
    }

    // 第三段：移除结束位置之后（保留外层样式和内部样式）
    if (!removeToEnd) {
      const afterWrapper = element.cloneNode(false);
      for (const { node, nodeStart, nodeEnd } of textNodes) {
        if (nodeStart >= removeEnd) {
          appendWithStyle(afterWrapper, node, node.textContent || '');
        } else if (nodeEnd > removeEnd) {
          const utf16Start = getUtf16Offset(node.textContent || '', removeEnd - nodeStart);
          appendWithStyle(afterWrapper, node, (node.textContent || '').slice(utf16Start));
        }
      }
      fragment.appendChild(afterWrapper);
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

    const walker = this._doc.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node;
    /* TreeWalker(NodeFilter.SHOW_TEXT) 保证只返回文本节点，但 TS 类型声明为 Node | null，
     * 这里用 as Text 声明实际类型，避免每次迭代都进行冗余的运行时 nodeType 检查 */
    while ((node = walker.nextNode() as Text)) {
      const text = node.textContent || '';
      const textLength = getUnicodeStringLength(text);
      if (textLength > 0) {
        result.push({
          node,
          nodeStart: currentPos,
          nodeEnd: currentPos + textLength
        });
        currentPos += textLength;
      }
    }

    return result;
  }

  /**
   * 递归遍历 DOM 收集文本节点数据
   *
   * 位置系统包含块边界虚拟 \n：每个叶子块（不含块级子元素的块级元素）
   * 在其文本内容之后贡献一个虚拟 \n，<br> 标签在其位置处贡献一个虚拟 \n
   *
   * 参考 Quill Delta 和浏览器 innerText 的设计
   */
  private _buildTextNodeData(): {
    snapshot: Array<{ node: Text; nodeStart: number; nodeEnd: number }>;
    index: Map<Text, { start: number; end: number }>;
    totalLength: number;
    /** <br> 元素到其虚拟 \n 位置的映射 */
    brIndex: Map<Element, number>;
  } {
    const snapshot: Array<{ node: Text; nodeStart: number; nodeEnd: number }> = [];
    const index = new Map<Text, { start: number; end: number }>();
    const brIndex = new Map<Element, number>();
    const ctx = { pos: 0 };

    /**
     * 递归处理元素的子节点
     * @returns 处理过程中的状态信息
     */
    const walk = (element: Element): {
      addedBreak: boolean;
      /** 是否包含文本内容 */
      hasTextContent: boolean;
      /** 是否包含 <br> 元素 */
      hasBr: boolean;
    } => {
      let addedBreak = false;
      let hasTextContent = false;
      let hasBr = false;

      for (const child of element.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const textNode = child as Text;
          const len = getUnicodeStringLength(textNode.textContent || '');
          if (len > 0) {
            hasTextContent = true;
            index.set(textNode, { start: ctx.pos, end: ctx.pos + len });
            snapshot.push({ node: textNode, nodeStart: ctx.pos, nodeEnd: ctx.pos + len });
          }
          ctx.pos += len;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child as Element;
          const tag = el.tagName.toLowerCase();

          if (tag === 'br') {
            hasBr = true;
            brIndex.set(el, ctx.pos);
            ctx.pos += 1;
            addedBreak = true;
          } else if (BLOCK_TAG_NAMES.has(tag)) {
            const result = walk(el);
            /**
             * 叶子块（不包含块级子元素）在内容后添加虚拟 \n
             * 外层容器块（如 div 包含 p）不添加，避免重复
             *
             * 特殊情况：叶子块仅含 <br> 且无文本内容时（如 <p><br></p>），
             * <br> 已经贡献了该行的 \n，不再追加尾部 \n
             */
            const hasBlockChild = [...el.children].some(c => BLOCK_TAG_NAMES.has(c.tagName.toLowerCase()));
            if (!hasBlockChild && !(result.hasBr && !result.hasTextContent)) {
              ctx.pos += 1;
              addedBreak = true;
            }
          } else {
            /**
             * 行内元素（如 strong、em、span）：递归处理后传播 hasTextContent/hasBr
             * 否则当文本在行内元素内时，父级无法正确判断是否有文本内容
             */
            const result = walk(el);
            hasTextContent = hasTextContent || result.hasTextContent;
            hasBr = hasBr || result.hasBr;
          }
        }
      }

      return { addedBreak, hasTextContent, hasBr };
    };

    walk(this._container);
    return { snapshot, index, totalLength: ctx.pos, brIndex };
  }

  private _buildSnapshot(): Array<{ node: Text; nodeStart: number; nodeEnd: number }> {
    return this._buildTextNodeData().snapshot;
  }

  private _buildIndex(): Map<Text, { start: number; end: number }> {
    return this._buildTextNodeData().index;
  }

  /**
   * 从文本节点索引和 <br> 索引计算元素位置
   *
   * 遍历元素内所有文本节点和 <br> 元素，利用索引映射计算总位置范围
   * 对于只包含 <br> 而无文本节点的元素（如 <span><br></span>），
   * 通过 brIndex 精确查找 <br> 的虚拟 \n 位置
   */
  private _getPositionFromIndex(
    element: Element,
    index: Map<Text, { start: number; end: number }>,
    brIndex?: Map<Element, number>,
  ): { start: number; end: number } | null {
    let min = Infinity, max = 0;
    const walker = this._doc.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node;

    while ((node = walker.nextNode())) {
      if (isElementNode(node)) {
        if (node.tagName.toLowerCase() === 'br' && brIndex) {
          const brPos = brIndex.get(node);
          if (brPos !== undefined) {
            min = Math.min(min, brPos);
            max = Math.max(max, brPos + 1);
          }
        }
        continue;
      }

      /* NodeFilter.SHOW_TEXT 保证返回文本节点，as Text 声明实际类型 */
      const textNode = node as Text;
      const p = index.get(textNode);
      if (p) { min = Math.min(min, p.start); max = Math.max(max, p.end); }
    }

    return min === Infinity ? null : { start: min, end: max };
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
        unwrapChildNodes(element);
        continue;
      }

      /**
       * 移除真正为空的容器（无子节点）
       * 使用 childNodes.length 而非 textContent === ''，
       * 因为包含 <br> 等非文本子节点的容器不应被视为空容器
       */
      if (element.childNodes.length === 0) {
        const configName = getConfigNameForElement(element);
        const config = configName ? CONTAINER_CONFIGS[configName] : undefined;
        if (config?.removeEmpty !== false) {
          element.remove();
        }
      }
    }

    /* 合并相邻的相同标签 */
    this.mergeAdjacentSameTags(start, end, selector);
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
    /** 一次遍历构建位置索引，替代每个元素都创建 DOM Range */
    const index = this._buildIndex();

    for (const element of allElements) {
      if (processedTags.has(element)) continue;

      const pos = this._getPositionFromIndex(element, index);
      if (!pos) continue;

      /* 只处理与操作范围有交集的标签 */
      if (pos.end <= start || pos.start >= end) continue;

      let mergeTarget = element;

      /* 向后合并所有相邻的同类型标签 */
      let candidate: Node | null = mergeTarget.nextSibling;
      while (candidate) {
        if (!isElementNode(candidate)) break;
        const nextElem = candidate;
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
        if (!isElementNode(candidate)) break;
        const prevElem = candidate;
        if (!isSameContainerType(mergeTarget, prevElem)) break;

        while (mergeTarget.firstChild) {
          prevElem.appendChild(mergeTarget.firstChild);
        }
        processedTags.add(mergeTarget);
        candidate = prevElem.previousSibling;
        mergeTarget.remove();
        mergeTarget = prevElem;
      }
    }
  }

  select(start: number, end: number): void {
    const range = this.createDOMRange(start, end);
    if (!range) return;

    const selection = this._ownerWindow.getSelection();
    if (!selection) return;

    selection.removeAllRanges();
    selection.addRange(range);
  }

  getDocumentLength(): number {
    return this._buildTextNodeData().totalLength;
  }

  findText(searchText: string): Array<{ start: number; end: number }> {
    if (!searchText) return [];

    const searchUtf16Len = searchText.length;
    const searchUnicodeLen = getUnicodeStringLength(searchText);
    const matches: Array<{ start: number; end: number }> = [];
    const snapshot = this._buildSnapshot();

    for (const { node, nodeStart } of snapshot) {
      const text = node.textContent || '';
      let utf16Pos = 0;
      let unicodePos = 0;

      while (utf16Pos <= text.length - searchUtf16Len) {
        const found = text.indexOf(searchText, utf16Pos);
        if (found === -1) break;

        /* 将 utf16Pos 到 found 之间的 UTF-16 偏移转为 Unicode 字符数 */
        for (let i = utf16Pos; i < found; ) {
          const cp = text.codePointAt(i)!;
          i += cp > 0xFFFF ? 2 : 1;
          unicodePos++;
        }

        matches.push({ start: nodeStart + unicodePos, end: nodeStart + unicodePos + searchUnicodeLen });
        utf16Pos = found + searchUtf16Len;
        unicodePos += searchUnicodeLen;
      }
    }

    return matches;
  }

  queryConfigs(start: number, end: number): Set<string> {
    const result = new Set<string>();
    const selector = buildStyleSelector();
    const tagToConfig = buildTagToConfigName();
    const index = this._buildIndex();

    const elements = this._container.querySelectorAll(selector);
    for (const element of elements) {
      const pos = this._getPositionFromIndex(element, index);
      if (pos && pos.start < end && pos.end > start) {
        const configName = tagToConfig.get(element.tagName.toLowerCase());
        if (configName) {
          result.add(configName);
        }
      }
    }

    return result;
  }

  removeElementsBySelector(selector: string, keepChildren: boolean): void {
    const elements = this._container.querySelectorAll(selector);

    for (const element of elements) {
      if (keepChildren) {
        unwrapChildNodes(element);
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

    for (const el of sorted.slice(1)) {
      const children = [...el.childNodes];
      for (const child of children) {
        target.appendChild(child);
      }
      el.remove();
    }

    /* 合并后如果目标块为空，也移除 */
    if (!target.textContent?.trim()) {
      target.remove();
    }

    this._container.normalize();
  }

  /**
   * 修复跨块容器的非连续分片
   *
   * 遍历所有注册了 splitRepair 且 idAttribute 的容器配置，
   * 按 ID 分组后检测非连续性，根据策略执行 fill-gaps 或 keep-largest
   */
  repairSplitContainers(): void {
    for (const config of Object.values(CONTAINER_CONFIGS)) {
      if (!config.idAttribute || config.splitRepair === 'none' || !config.splitRepair) continue;

      const selector = configToSelector(config);
      const elements = this._container.querySelectorAll(selector);

      /* 按 idAttribute 值分组 */
      const groups = new Map<string, Element[]>();
      for (const element of elements) {
        const id = element.getAttribute(config.idAttribute);
        if (!id) continue;

        let group = groups.get(id);
        if (!group) {
          group = [];
          groups.set(id, group);
        }
        group.push(element);
      }

      /* 只处理多元素组 */
      for (const [id, groupElements] of groups) {
        if (groupElements.length < 2) continue;

        /* 按文档位置排序 */
        groupElements.sort((a, b) => {
          const pos = a.compareDocumentPosition(b);
          if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
          if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
          return 0;
        });

        if (this._hasGaps(groupElements)) {
          if (config.splitRepair === 'fill-gaps') {
            this._fillGaps(groupElements, config, id);
          } else if (config.splitRepair === 'keep-largest') {
            this._keepLargest(groupElements);
          }
        }
      }
    }
  }

  /**
   * 计算同组元素的逻辑范围（min/max 字符位置）
   */
  private _getGroupBounds(elements: Element[]): { min: number; max: number } | null {
    const index = this._buildIndex();
    let min = Infinity, max = 0;
    for (const element of elements) {
      const pos = this._getPositionFromIndex(element, index);
      if (!pos) continue;
      min = Math.min(min, pos.start);
      max = Math.max(max, pos.end);
    }
    return min === Infinity ? null : { min, max };
  }

  /**
   * 检测同组元素之间是否存在文本间隙
   */
  private _hasGaps(elements: Element[]): boolean {
    if (elements.length < 2) return false;

    const bounds = this._getGroupBounds(elements);
    if (!bounds) return false;

    /* 计算元素覆盖的总文本长度 */
    let coveredLength = 0;
    for (const element of elements) {
      coveredLength += getUnicodeStringLength(element.textContent || '');
    }

    /* 范围内的总文本长度大于已覆盖的长度 → 存在间隙 */
    /* bounds 由文本节点索引计算，bounds.max - bounds.min 即为范围内的字符总数，无需创建 DOM Range */
    return (bounds.max - bounds.min) > coveredLength;
  }

  /**
   * 填充间隙：将逻辑范围内未包裹的文本节点包裹为同类型元素
   */
  private _fillGaps(elements: Element[], config: ContainerTagConfig, id: string): void {
    const { snapshot, index } = this._buildTextNodeData();

    /* 从索引计算逻辑范围 */
    let minPos = Infinity, maxPos = 0;
    for (const element of elements) {
      const pos = this._getPositionFromIndex(element, index);
      if (!pos) continue;
      minPos = Math.min(minPos, pos.start);
      maxPos = Math.max(maxPos, pos.end);
    }
    if (minPos === Infinity || minPos >= maxPos) return;

    const idAttr = config.idAttribute!;
    const newElements: Element[] = [];

    for (const { node, nodeStart, nodeEnd } of snapshot) {
      if (nodeStart >= maxPos) break;
      if (nodeEnd <= minPos) continue;

      /* 检查是否已在同 ID 容器内 */
      let parent: Element | null = node.parentElement;
      let alreadyWrapped = false;
      while (parent && parent !== this._container) {
        if (parent.getAttribute(idAttr) === id) {
          alreadyWrapped = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (alreadyWrapped) continue;

      /* 计算交集 */
      const overlapStart = Math.max(nodeStart, minPos);
      const overlapEnd = Math.min(nodeEnd, maxPos);

      if (overlapStart < overlapEnd) {
        const text = node.textContent || '';
        const localRange = this._doc.createRange();
        localRange.setStart(node, getUtf16Offset(text, overlapStart - nodeStart));
        localRange.setEnd(node, getUtf16Offset(text, overlapEnd - nodeStart));

        const wrapper = this._doc.createElement(config.tagName);
        if (config.attributeSelector) {
          const className = config.attributeSelector.replace(/^\./, '');
          wrapper.className = className;
        }
        wrapper.setAttribute(idAttr, id);

        wrapRangeContents(localRange, wrapper);
        newElements.push(wrapper);
      }
    }

    /* 对新创建的包裹元素执行 normalize */
    if (newElements.length > 0) {
      this.normalize(minPos, maxPos);
    }
  }

  /**
   * 只保留最大的分片，移除其余（保留文本内容）
   *
   * @param elements 同一 ID 的所有分片元素
   */
  private _keepLargest(elements: Element[]): void {
    /* 按文本长度降序排序 */
    const sorted = [...elements].sort((a, b) =>
      getUnicodeStringLength(b.textContent || '') - getUnicodeStringLength(a.textContent || '')
    );

    /* 保留最大的，移除其余 */
    for (const el of sorted.slice(1)) {
      unwrapChildNodes(el);
    }

    this._container.normalize();
  }

  /**
   * 清洗 HTML：移除不可复制容器的包裹标签，保留其文本内容和内部子容器
   *
   * 用于剪贴板清洗，避免书签/修订等语义容器被复制到外部后影响包裹范围
   *
   * @param html 待清洗的 HTML 字符串
   * @returns 清洗后的 HTML 字符串
   */
  sanitizeHTML(html: string): string {
    const temp = this._doc.createElement('div');
    temp.innerHTML = html;

    const selector = getNonCopyableSelector();
    if (selector) {
      const elements = temp.querySelectorAll(selector);
      for (const el of elements) {
        unwrapChildNodes(el);
      }
    }

    temp.normalize();
    return temp.innerHTML;
  }

  querySelectorAll(selector: string): Element[] {
    return [...this._container.querySelectorAll(selector)];
  }

  getElementPosition(element: Element): { start: number; end: number } | null {
    const { index, brIndex } = this._buildTextNodeData();
    return this._getPositionFromIndex(element, index, brIndex);
  }

  /**
   * 将原生 DOM Range 转换为虚拟位置（包含块边界的虚拟 \n）
   *
   * 与 Range.toString() 不同，此方法返回的位置与 getText/getDocumentLength 一致，
   * 正确计入每个叶子块末尾和 <br> 的虚拟换行符
   */
  getDOMRangePosition(range: Range): { start: number; end: number } | null {
    const { index, brIndex } = this._buildTextNodeData();
    const start = this._nodeOffsetToPosition(range.startContainer, range.startOffset, index, brIndex);
    const end = this._nodeOffsetToPosition(range.endContainer, range.endOffset, index, brIndex);
    if (start === null || end === null) return null;
    return { start, end };
  }

  /**
   * 将 DOM 节点 + 偏移量转换为虚拟位置
   */
  private _nodeOffsetToPosition(
    node: Node,
    offset: number,
    index: Map<Text, { start: number; end: number }>,
    brIndex: Map<Element, number>,
  ): number | null {
    if (node.nodeType === Node.TEXT_NODE) {
      const pos = index.get(node as Text);
      if (!pos) return null;
      const textOffset = getUnicodeStringLength((node.textContent || '').slice(0, offset));
      return pos.start + textOffset;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      /** <br> 元素本身就是换行符的位置 */
      if (el.tagName.toLowerCase() === 'br') {
        const brPos = brIndex.get(el);
        return brPos !== undefined ? brPos : null;
      }

      /**
       * 元素节点 + offset：offset 指向第 offset 个子节点之前
       * 找到该子节点之前最近的文本位置
       */
      const children = [...el.childNodes];
      let bestPos: number | null = null;

      for (let i = 0; i < offset && i < children.length; i++) {
        const child = children[i];
        if (child.nodeType === Node.TEXT_NODE) {
          const p = index.get(child as Text);
          if (p) bestPos = Math.max(bestPos ?? 0, p.end);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const childEl = child as Element;
          if (childEl.tagName.toLowerCase() === 'br') {
            const brPos = brIndex.get(childEl);
            if (brPos !== undefined) bestPos = Math.max(bestPos ?? 0, brPos + 1);
          } else {
            const childPos = this._nodeOffsetToPosition(child, (child.childNodes as NodeListOf<ChildNode>).length, index, brIndex);
            if (childPos !== null) bestPos = Math.max(bestPos ?? 0, childPos);
          }
        }
      }

      return bestPos;
    }

    return null;
  }

  registerContainerConfig(name: string, config: ContainerTagConfig): void {
    registerContainerConfig(name, config);
  }
}