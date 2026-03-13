/**
 * Editor - 编辑器业务逻辑层
 *
 * 核心职责：提供高级编辑功能和业务能力
 * 设计原则：
 * - 封装复杂的编辑操作
 * - 整合书签、修订等功能
 * - 提供简洁的 API 给 UI 层使用
 */

import type { IRangeAdapter, TextIndex } from './adapters/IRangeAdapter';
import { Range } from './models/Range';
import { BookmarkService, type CreateBookmarkOptions } from './services/BookmarkService';
import { RevisionService } from './services/RevisionService';
import { StyleService } from './services/StyleService';
import { getUnicodeStringLength } from './utils';

export interface EditorOptions {
  /** 适配器实例 */
  adapter: IRangeAdapter;
  /** 当前用户名 */
  currentUser?: string;
}

export interface SetTextOptions {
  /** 是否创建修订 */
  asRevision?: boolean;
  /** 修订作者 */
  revisionAuthor?: string;
  /** 修订说明 */
  revisionComment?: string;
}

export class Editor {
  /** 适配器实例 */
  private readonly _adapter: IRangeAdapter;
  /** 当前用户名 */
  readonly currentUser: string;
  /** 书签服务 */
  readonly bookmarks: BookmarkService;
  /** 修订服务 */
  readonly revisions: RevisionService;
  /** 样式服务 */
  readonly styles: StyleService;

  constructor(options: EditorOptions) {
    this._adapter = options.adapter;
    this.currentUser = options.currentUser || 'anonymous';
    this.styles = new StyleService(this._adapter);
    this.bookmarks = new BookmarkService(this._adapter);
    this.revisions = new RevisionService(this._adapter);
  }

  /**
   * 获取文档总长度
   * @returns 字符数
   */
  getDocumentLength(): number {
    return this._adapter.getDocumentLength();
  }

  /**
   * 创建 Range 对象
   * @param start 起始位置
   * @param end 结束位置
   * @returns Range 实例
   */
  createRange(start: number, end: number): Range {
    return new Range({ start, end, adapter: this._adapter });
  }

  /**
   * 查找文本
   * @param searchText 要查找的文本
   * @returns 匹配位置数组
   */
  findText(searchText: string): Array<{ start: number; end: number }> {
    return this._adapter.findText(searchText);
  }

  /**
   * 智能文本替换（自动创建修订）
   * @param searchText 要查找的文本
   * @param replaceText 替换文本
   * @param options 替换选项
   * @returns 替换数量
   */
  setText(searchText: string, replaceText: string, options: SetTextOptions = {}): number {
    const { asRevision = false, revisionAuthor, revisionComment } = options;

    const matches = this.findText(searchText);
    if (matches.length === 0) return 0;

    // 从后往前替换，避免位置偏移
    for (let i = matches.length - 1; i >= 0; i--) {
      const { start, end } = matches[i];
      const range = this.createRange(start, end);

      if (asRevision) {
        /* 标记旧文本为删除修订（保留原文，视觉上标记删除） */
        this.revisions.createDelete({
          range,
          author: revisionAuthor || this.currentUser,
          comment: revisionComment,
        });

        /* 插入新文本并包裹为插入修订 */
        const newLength = getUnicodeStringLength(replaceText);
        if (newLength > 0) {
          const insertAt = this.createRange(end, end);
          insertAt.insertText(replaceText);

          const insertRange = this.createRange(end, end + newLength);
          this.revisions.createInsert({
            range: insertRange,
            author: revisionAuthor || this.currentUser,
            comment: revisionComment,
          });
        }
      } else {
        range.replaceText(replaceText);
      }
    }

    return matches.length;
  }

  /**
   * 批量接受指定范围内的修订
   * @param start 起始位置
   * @param end 结束位置
   * @returns 接受的修订数量
   */
  acceptRevisionsInRange(start: number, end: number): number {
    return this.revisions.acceptInRange(start, end);
  }

  /**
   * 批量拒绝指定范围内的修订
   * @param start 起始位置
   * @param end 结束位置
   * @returns 拒绝的修订数量
   */
  rejectRevisionsInRange(start: number, end: number): number {
    return this.revisions.rejectInRange(start, end);
  }

  /**
   * 获取指定范围内的修订
   * @param start 起始位置
   * @param end 结束位置
   * @returns 修订数组
   */
  getRevisionsInRange(start: number, end: number) {
    return this.revisions.queryInRange(start, end);
  }

  /**
   * 获取所有修订
   * @returns 修订数组
   */
  getAllRevisions() {
    return this.revisions.getAll();
  }

  /**
   * 创建书签
   * @param options 书签选项
   * @returns Bookmark 实例
   */
  createBookmark(options: Omit<CreateBookmarkOptions, 'range'> & { start: number; end: number }) {
    const range = this.createRange(options.start, options.end);
    return this.bookmarks.create({
      ...options,
      range,
    });
  }

  /**
   * 获取所有书签
   * @returns 书签数组
   */
  getAllBookmarks() {
    return this.bookmarks.getAll();
  }

  /**
   * 根据ID获取书签
   * @param id 书签ID
   * @returns Bookmark 实例或 null
   */
  getBookmarkById(id: string) {
    return this.bookmarks.getById(id);
  }

  /**
   * 删除书签
   * @param id 书签ID
   */
  deleteBookmark(id: string) {
    this.bookmarks.deleteById(id);
  }

  /**
   * 跳转到书签
   * @param id 书签ID
   */
  gotoBookmark(id: string) {
    this.bookmarks.goto(id);
  }

  /**
   * 应用样式
   */
  applyStyle(start: number, end: number, style: string): void {
    this.styles.setStyle(start, end, style);
  }

  /**
   * 移除样式（仅限内置样式：bold/italic/underline 等）
   */
  removeStyle(start: number, end: number, style: string): void {
    this.styles.removeStyle(start, end, style);
  }

  /**
   * 移除已注册容器的包裹（适用于所有已注册的容器类型）
   *
   * 与 removeStyle 不同，此方法不限制容器类型，
   * 可移除任何通过 registerContainerConfig 注册的容器（包括 bookmark、revision 等）
   */
  removeContainer(start: number, end: number, configName: string): void {
    this._adapter.removeConfig(start, end, configName);
  }

  /**
   * 获取指定范围内的格式状态
   */
  getFormatState(start: number, end: number): {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough: boolean;
    highlight: boolean;
  } {
    return this.styles.getFormatState(start, end);
  }

  /**
   * 获取文本
   * @param start 起始位置
   * @param end 结束位置
   * @returns 文本内容
   */
  getText(start: number, end: number): string {
    return this._adapter.getText(start, end);
  }

  /**
   * 刷新内部状态
   */
  refresh(): void {
    this.bookmarks.refresh();
    this.revisions.refresh();
  }

  /**
   * 修复跨块容器的非连续分片
   */
  repairSplitContainers(): void {
    this._adapter.repairSplitContainers();
    this.bookmarks.refresh();
  }

  /**
   * 清洗 HTML：移除不可复制容器的包裹标签，保留文本和内部子容器
   *
   * @param html 待清洗的 HTML 字符串
   * @returns 清洗后的 HTML 字符串
   */
  sanitizeHTML(html: string): string {
    return this._adapter.sanitizeHTML(html);
  }

  /**
   * 获取编辑器 HTML 内容
   * @returns HTML 字符串
   */
  getHTML(): string {
    return this._adapter.getContainer().innerHTML;
  }

  /**
   * 设置编辑器 HTML 内容
   * @param html HTML 字符串
   */
  setHTML(html: string): void {
    this._adapter.getContainer().innerHTML = html;
    this.refresh();
  }

  /**
   * 从原生 DOM Range 创建 Range 实例（位置包含虚拟 \n）
   */
  createRangeFromDOM(domRange: globalThis.Range, prebuiltIndex?: TextIndex): Range | null {
    const pos = this._adapter.getDOMRangePosition(domRange, prebuiltIndex);
    if (!pos) return null;
    return this.createRange(pos.start, pos.end);
  }

  /**
   * 获取元素在文档中的虚拟位置范围（包含块边界 \n）
   */
  getElementPosition(element: Element, prebuiltIndex?: TextIndex): { start: number; end: number } | null {
    return this._adapter.getElementPosition(element, prebuiltIndex);
  }

  /**
   * 构建文本节点索引（一次性 O(N) 遍历）
   *
   * 批量调用 getElementPosition / createRangeFromDOM 时传入可避免 O(N²) 开销。
   * DOM 结构变化后需重新构建。
   */
  buildIndex(): TextIndex {
    return this._adapter.buildIndex();
  }

  /**
   * 获取所有已注册的容器配置
   */
  getRegisteredConfigs(): Array<{ name: string; selector: string; idAttribute?: string; label?: string }> {
    return this._adapter.getRegisteredConfigs();
  }

  /**
   * 在编辑器容器内查询匹配选择器的元素
   */
  querySelectorAll(selector: string): Element[] {
    return this._adapter.querySelectorAll(selector);
  }
}
