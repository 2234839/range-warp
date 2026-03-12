/**
 * Range - 文本选区的抽象表示
 *
 * 核心职责：封装文档中一段连续的文本区域
 * 设计原则：
 * - 基于字符下标，从 0 开始
 * - 使用文档绝对下标，不依赖编辑器原生选区 API
 * - 通过适配器实现跨编辑器兼容
 */

import type { IRangeAdapter, WrapOptions } from '../adapters/IRangeAdapter';

export interface RangeOptions {
  /** 起始字符下标 */
  start: number;
  /** 结束字符下标 */
  end: number;
  /** 适配器实例 */
  adapter: IRangeAdapter;
}

export class Range {
  /** 起始字符下标 */
  readonly start: number;
  /** 结束字符下标 */
  readonly end: number;
  /** 适配器实例 */
  private readonly _adapter: IRangeAdapter;

  constructor(options: RangeOptions) {
    this.start = options.start;
    this.end = options.end;
    this._adapter = options.adapter;
  }

  /**
   * 获取选区内的文本内容
   * @returns 文本内容
   */
  getText(): string {
    return this._adapter.getText(this.start, this.end);
  }

  /**
   * 获取选区长度
   * @returns 字符数
   */
  get length(): number {
    return this.end - this.start;
  }

  /**
   * 检查选区是否为空
   * @returns 是否为空
   */
  isEmpty(): boolean {
    return this.start === this.end;
  }

  /**
   * 在选区起始位置插入文本
   * @param text 要插入的文本
   */
  insertText(text: string): void {
    this._adapter.insertText(this.start, text);
  }

  /**
   * 删除选区内的文本
   */
  delete(): void {
    this._adapter.delete(this.start, this.end);
  }

  /**
   * 替换选区内的文本
   * @param text 新文本内容
   */
  replaceText(text: string): void {
    this._adapter.replaceText(this.start, this.end, text);
  }

  /**
   * 对选区应用样式
   * @param style 样式类型（如 'bold', 'italic'）
   */
  setStyle(style: string): void {
    this._adapter.setStyle(this.start, this.end, style);
  }

  /**
   * 移除选区的样式
   * @param style 样式类型
   */
  removeStyle(style: string): void {
    this._adapter.removeStyle(this.start, this.end, style);
  }

  /**
   * 用 DOM 元素包裹选区
   * @param elementCreator 元素创建函数
   * @param options 包裹选项
   */
  wrapElement(elementCreator: () => Element, options?: WrapOptions): void {
    this._adapter.wrapElement(this.start, this.end, elementCreator, options);
  }

  /**
   * 移除元素的包裹
   * @param tagName 标签名
   */
  unwrapElement(tagName: string): void {
    this._adapter.unwrapElement(this.start, this.end, tagName);
  }

  /**
   * 高亮显示选区
   */
  select(): void {
    this._adapter.select(this.start, this.end);
  }

  /**
   * 检查选区是否包含特定样式
   * @param style 样式类型
   * @returns 是否包含
   */
  hasStyle(style: string): boolean {
    return this._adapter.getStylesInRange(this.start, this.end).has(style);
  }

  /**
   * 创建新的选区
   * @param start 新的起始位置
   * @param end 新的结束位置
   * @returns 新的 Range 实例
   */
  createSubRange(start: number, end: number): Range {
    return new Range({
      start: this.start + start,
      end: this.start + end,
      adapter: this._adapter,
    });
  }

  /**
   * 检查是否与另一个选区重叠
   * @param other 另一个选区
   * @returns 是否重叠
   */
  overlaps(other: Range): boolean {
    return this.start < other.end && this.end > other.start;
  }

  /**
   * 检查是否包含另一个选区
   * @param other 另一个选区
   * @returns 是否包含
   */
  contains(other: Range): boolean {
    return this.start <= other.start && this.end >= other.end;
  }

  /**
   * 转换为字符串表示
   * @returns 字符串
   */
  toString(): string {
    return `Range(${this.start}, ${this.end})`;
  }
}

export default Range;
