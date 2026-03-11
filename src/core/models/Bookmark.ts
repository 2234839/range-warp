/**
 * Bookmark - 书签数据模型
 *
 * 核心职责：管理文档中的书签标记
 * 设计原则：
 * - 使用 DOM 元素包裹文本实现持久化
 * - 动态计算位置，支持编辑后自动跟随
 * - 提供完整的书签生命周期管理
 */

import type { IRangeAdapter } from '../adapters/IRangeAdapter';
import { Range } from './Range';

/** 书签元数据接口 */
export interface BookmarkMetadata {
  /** 书签唯一标识 */
  id: string;
  /** 书签名称 */
  name: string;
  /** 创建时间 */
  createTime: number;
  /** 创建者 */
  author?: string;
  /** 额外的自定义数据 */
  customData?: Record<string, any>;
}

/** 书签选项 */
export interface BookmarkOptions {
  /** 书签元数据 */
  metadata: BookmarkMetadata;
  /** 适配器实例 */
  adapter: IRangeAdapter;
}

/** 书签元素类名 */
const BOOKMARK_CLASS = 'bookmark';

export class Bookmark {
  /** 书签元数据 */
  readonly metadata: BookmarkMetadata;
  /** 适配器实例 */
  private readonly _adapter: IRangeAdapter;

  constructor(options: BookmarkOptions) {
    this.metadata = options.metadata;
    this._adapter = options.adapter;
  }

  /**
   * 获取书签的 Range 对象
   * @returns Range 实例
   */
  getRange(): Range | null {
    const container = this._adapter.getContainer();
    const element = container.querySelector(`[data-bookmark-id="${this.metadata.id}"]`);

    if (!element) return null;

    const start = this.calculateElementOffset(element);
    const text = element.textContent || '';
    const end = start + this.getUnicodeStringLength(text);

    return new Range({
      start,
      end,
      adapter: this._adapter,
    });
  }

  /**
   * 获取书签标记的文本内容
   * @returns 文本内容
   */
  getText(): string {
    const range = this.getRange();
    return range ? range.getText() : '';
  }

  /**
   * 跳转到书签位置
   */
  goto(): void {
    const range = this.getRange();
    if (range) {
      range.select();
      this.scrollToView();
    }
  }

  /**
   * 滚动到书签可见区域
   */
  private scrollToView(): void {
    const container = this._adapter.getContainer();
    const element = container.querySelector(`[data-bookmark-id="${this.metadata.id}"]`);

    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /**
   * 删除书签
   */
  remove(): void {
    const range = this.getRange();
    if (range) {
      range.unwrapElement('span');
    }
  }

  /**
   * 计算元素在文档中的字符下标
   * @param element DOM 元素
   * @returns 字符下标
   */
  private calculateElementOffset(element: Element): number {
    const container = this._adapter.getContainer();
    const range = document.createRange();

    range.selectNodeContents(element);
    const preRange = document.createRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(range.startContainer, range.startOffset);

    return this.getUnicodeStringLength(preRange.toString());
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
   * 创建书签 DOM 元素
   * @param range Range 对象
   * @returns DOM 元素
   */
  static createElement(range: Range, metadata: BookmarkMetadata): HTMLElement {
    const span = document.createElement('span');
    span.className = BOOKMARK_CLASS;
    span.setAttribute('data-bookmark-id', metadata.id);
    span.setAttribute('data-bookmark-name', metadata.name);
    span.setAttribute('data-bookmark-create-time', metadata.createTime.toString());

    if (metadata.author) {
      span.setAttribute('data-bookmark-author', metadata.author);
    }

    if (metadata.customData) {
      Object.entries(metadata.customData).forEach(([key, value]) => {
        span.setAttribute(`data-bookmark-${key}`, String(value));
      });
    }

    return span;
  }

  /**
   * 从 DOM 元素创建书签对象
   * @param element DOM 元素
   * @param adapter 适配器实例
   * @returns Bookmark 实例
   */
  static fromElement(element: Element, adapter: IRangeAdapter): Bookmark | null {
    const bookmarkId = element.getAttribute('data-bookmark-id');
    if (!bookmarkId) return null;

    const metadata: BookmarkMetadata = {
      id: bookmarkId,
      name: element.getAttribute('data-bookmark-name') || '',
      createTime: Number(element.getAttribute('data-bookmark-create-time')) || Date.now(),
      author: element.getAttribute('data-bookmark-author') || undefined,
    };

    return new Bookmark({ metadata, adapter });
  }

  /**
   * 查询所有书签
   * @param adapter 适配器实例
   * @returns 书签数组
   */
  static findAll(adapter: IRangeAdapter): Bookmark[] {
    const container = adapter.getContainer();
    const elements = container.querySelectorAll(`.${BOOKMARK_CLASS}`);
    const bookmarks: Bookmark[] = [];

    for (const element of Array.from(elements)) {
      const bookmark = Bookmark.fromElement(element, adapter);
      if (bookmark) {
        bookmarks.push(bookmark);
      }
    }

    return bookmarks;
  }

  /**
   * 根据ID查找书签
   * @param id 书签ID
   * @param adapter 适配器实例
   * @returns Bookmark 实例或 null
   */
  static findById(id: string, adapter: IRangeAdapter): Bookmark | null {
    const container = adapter.getContainer();
    const element = container.querySelector(`[data-bookmark-id="${id}"]`);

    if (!element) return null;

    return Bookmark.fromElement(element, adapter);
  }

  /**
   * 根据名称查找书签
   * @param name 书签名称
   * @param adapter 适配器实例
   * @returns 书签数组
   */
  static findByName(name: string, adapter: IRangeAdapter): Bookmark[] {
    const all = Bookmark.findAll(adapter);
    return all.filter((bookmark) => bookmark.metadata.name === name);
  }
}

export default Bookmark;
