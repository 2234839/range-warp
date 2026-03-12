/**
 * 编辑器组件共享工具
 *
 * 提取 EditorCore 和 RangeWrap 之间的重复逻辑：
 * - 选区位置计算
 * - 格式状态常量
 * - 剪贴板格式化祖先恢复
 */

import type { Ref, ShallowRef } from 'vue';
import type { Editor as EditorType } from '../core/index';
import { getUnicodeStringLength } from '../core/utils';
import { BLOCK_TAG_NAMES } from '../core/adapters/DOMRangeAdapter';

/** 选区上下文（适用于原生模式和 iframe 模式） */
export interface SelectionContext {
  ownerWindow: Window;
  container: HTMLElement | null;
}

/** 格式状态的类型定义 */
export interface FormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  highlight: boolean;
}

/** 空格式状态（重置时使用） */
export const EMPTY_FORMAT_STATE: FormatState = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  highlight: false,
};

/** 样式名称到格式状态键的映射 */
export const STYLE_KEYS: Record<string, keyof FormatState> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strikethrough: 'strikethrough',
  highlight: 'highlight',
};

/** 工具栏按钮配置 */
export interface ToolbarButtonConfig {
  /** 样式名称 */
  style: string;
  /** 按钮标题 */
  title: string;
  /** 按钮显示的图标标签 */
  label: string;
  /** 图标额外 CSS 类（如 font-bold、italic） */
  iconClass: string;
  /** 是否使用包裹标签（如 strong、em、u、s） */
  wrapTag?: string;
  /** 分隔线（在此按钮前插入分隔线） */
  divider?: boolean;
}

/** 默认工具栏按钮列表 */
export const TOOLBAR_BUTTONS: ToolbarButtonConfig[] = [
  { style: 'bold', title: '加粗', label: 'B', iconClass: 'font-bold', wrapTag: 'strong' },
  { style: 'italic', title: '斜体', label: 'I', iconClass: 'italic', wrapTag: 'em' },
  { style: 'underline', title: '下划线', label: 'U', iconClass: 'underline', wrapTag: 'u' },
  { style: 'strikethrough', title: '删除线', label: 'S', iconClass: 'line-through', wrapTag: 's' },
  { style: 'highlight', title: '高亮', label: 'H', iconClass: '', divider: true },
];

/** 编辑器 composable 基础选项（原生模式和 UEditor Plus 模式共享） */
export interface BaseEditorOptions {
  /** contenteditable 容器 ref */
  containerRef: { value: HTMLElement | null };
  /** 当前用户名 */
  currentUser: string;
  /** 内容变化回调 */
  onContentChange?: (html: string) => void;
  /** 编辑器获得焦点 */
  onFocus?: () => void;
  /** 编辑器失去焦点 */
  onBlur?: () => void;
  /** 选区变化 */
  onSelectionChange?: () => void;
  /** 复制/剪切事件 */
  onCopyCut?: (event: ClipboardEvent) => void;
}

/** 编辑器 composable 统一接口 */
export interface EditorComposable {
  /** 编辑器实例（shallowRef 避免深层响应式解包类实例） */
  editor: ShallowRef<EditorType | null>;
  /** 选区上下文（window + container） */
  selectionContext: Ref<SelectionContext>;
  /** 是否正在加载（原生模式始终为 false） */
  loading: Ref<boolean>;
  /** 是否就绪（原生模式始终为 true） */
  ready: Ref<boolean>;
  /** 是否加载出错（原生模式始终为 false） */
  error: Ref<boolean>;
  /** 初始化编辑器 */
  init(initialContent?: string): void;
  /** 销毁编辑器 */
  destroy(): void;
  /** 获取 HTML 内容 */
  getHTML(): string;
  /** 设置 HTML 内容 */
  setHTML(html: string): void;
}

/**
 * 计算原生选区在容器内的 Unicode 字符位置
 *
 * 通过 preRange 计算选区起始位置，加上选区文本长度得到结束位置
 *
 * @param container 编辑器容器元素
 * @param ownerWindow 容器所属的 window 对象（iframe 场景传入 iframe.contentWindow）
 * @returns { start, end } 或 null（无有效选区时）
 */
export function getSelectionPosition(
  container: HTMLElement,
  ownerWindow: Window = window,
): { start: number; end: number } | null {
  const selection = ownerWindow.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const preRange = range.cloneRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(range.startContainer, range.startOffset);

  const start = getUnicodeStringLength(preRange.toString());
  const end = start + getUnicodeStringLength(range.toString());

  return { start, end };
}

/**
 * 从选区的 commonAncestor 向上查找格式化祖先元素（内联样式标签）
 *
 * range.cloneContents() 在选区完全在单个文本节点内时不会包含父级格式化标签（如 strong/em/u/s），
 * 需要手动恢复这些格式化上下文，否则复制会丢失加粗、斜体等样式。
 *
 * 支持任意内联元素（strong/em/u/s/sub/sup/span/a 等），不限于预定义的样式集。
 *
 * @param nonCopyableSelector 不可复制容器的 CSS 选择器，匹配时跳过但继续向上
 */
export function getFormattingAncestors(
  range: Range,
  container: HTMLElement,
  nonCopyableSelector: string,
): Element[] {
  const common = range.commonAncestorContainer;
  let node: Node | null = common.nodeType === Node.ELEMENT_NODE ? common : common.parentElement;
  const ancestors: Element[] = [];

  while (node && node !== container) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      if (BLOCK_TAG_NAMES.has(element.tagName.toLowerCase())) break;
      if (nonCopyableSelector && element.matches(nonCopyableSelector)) {
        node = node.parentElement;
        continue;
      }
      ancestors.push(element);
    }
    node = node.parentElement;
  }
  return ancestors;
}

/**
 * 用格式化祖先标签包裹 HTML，仅添加 cloneContents 未包含的标签
 *
 * 按从内到外的顺序（与 DOM 嵌套层级一致）逐层包裹，
 * 每层检查当前 HTML 是否已以该标签开头，避免双重包裹。
 * 保留祖先元素的属性（如 style、href、class 等）。
 */
export function wrapWithMissingFormatting(html: string, ancestors: Element[]): string {
  let result = html;
  for (const ancestor of ancestors) {
    const tag = ancestor.tagName.toLowerCase();
    const currentTag = result.match(/^<(\w+)/)?.[1]?.toLowerCase();
    if (currentTag !== tag) {
      const attributes = serializeAttributes(ancestor);
      result = `<${tag}${attributes}>${result}</${tag}>`;
    }
  }
  return result;
}

/**
 * 序列化元素的所有属性为 HTML 属性字符串
 *
 * 转义属性值中的特殊字符，确保生成的 HTML 格式正确
 */
function serializeAttributes(element: Element): string {
  let attrs = '';
  for (const attr of Array.from(element.attributes)) {
    /** 转义 " 和 & 防止属性值破坏 HTML 结构 */
    const escaped = attr.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    attrs += ` ${attr.name}="${escaped}"`;
  }
  return attrs;
}
