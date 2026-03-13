/**
 * StyleService - 样式管理服务
 *
 * 核心职责：管理行内样式的注册、应用、移除和查询
 * 设计原则：
 * - 行内样式（bold/italic 等）是业务概念，由服务层定义
 * - 通过适配器原语（applyConfig/removeConfig/queryConfigs）执行 DOM 操作
 * - 与 BookmarkService/RevisionService 一致的服务模式
 */

import type { IRangeAdapter } from '../adapters/IRangeAdapter';

/** 行内样式配置定义 */
interface StyleDefinition {
  /** 标签名 */
  tagName: string;
  /** 中文标签 */
  label: string;
}

/** 内置行内样式 */
const INLINE_STYLES: Record<string, StyleDefinition> = {
  bold: { tagName: 'strong', label: '粗体' },
  italic: { tagName: 'em', label: '斜体' },
  underline: { tagName: 'u', label: '下划线' },
  strikethrough: { tagName: 's', label: '删除线' },
  highlight: { tagName: 'mark', label: '高亮' },
};

/** 所有内置样式名 */
const SUPPORTED_STYLE_NAMES = new Set(Object.keys(INLINE_STYLES));

export class StyleService {
  private readonly _adapter: IRangeAdapter;

  constructor(adapter: IRangeAdapter) {
    this._adapter = adapter;
    this._registerBuiltInStyles();
  }

  /** 注册内置样式配置 */
  private _registerBuiltInStyles(): void {
    for (const [name, { tagName, label }] of Object.entries(INLINE_STYLES)) {
      this._adapter.registerContainerConfig(name, { tagName, label, display: 'inline' });
    }
  }

  /** 对指定范围应用样式 */
  setStyle(start: number, end: number, style: string): void {
    if (!SUPPORTED_STYLE_NAMES.has(style)) return;
    this._adapter.applyConfig(start, end, style);
  }

  /** 移除指定范围的样式 */
  removeStyle(start: number, end: number, style: string): void {
    if (!SUPPORTED_STYLE_NAMES.has(style)) return;
    this._adapter.removeConfig(start, end, style);
  }

  /** 查询范围内存在的样式 */
  getStylesInRange(start: number, end: number): Set<string> {
    const all = this._adapter.queryConfigs(start, end);
    const result = new Set<string>();
    for (const name of all) {
      if (SUPPORTED_STYLE_NAMES.has(name)) {
        result.add(name);
      }
    }
    return result;
  }

  /** 获取格式化状态 */
  getFormatState(start: number, end: number): {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough: boolean;
    highlight: boolean;
  } {
    const styleMap = this.getStylesInRange(start, end);
    return {
      bold: styleMap.has('bold'),
      italic: styleMap.has('italic'),
      underline: styleMap.has('underline'),
      strikethrough: styleMap.has('strikethrough'),
      highlight: styleMap.has('highlight'),
    };
  }
}
