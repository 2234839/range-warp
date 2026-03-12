/**
 * 编辑器组件共享工具
 *
 * 提取 EditorCore 和 RangeWrap 之间的重复逻辑：
 * - 选区位置计算
 * - 格式状态常量
 */

import type { Ref, ShallowRef } from 'vue';
import type { Editor as EditorType } from '../core/index';
import { getUnicodeStringLength } from '../core/utils';

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

/** 编辑器 composable 统一接口 */
export interface EditorComposable {
  /** 编辑器实例（shallowRef 避免深层响应式解包类实例） */
  editor: ShallowRef<EditorType | null>;
  /** 选区上下文（window + container） */
  selectionContext: Ref<{ ownerWindow: Window; container: HTMLElement | null }>;
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
