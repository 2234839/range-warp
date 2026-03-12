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
import { getElementPosition } from '../utils';
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
   *
   * 支持跨块书签：同一 bookmark ID 可对应多个元素，
   * 合并所有元素的范围为一个 Range
   *
   * @returns Range 实例
   */
  getRange(): Range | null {
    const container = this._adapter.getContainer();
    const elements = container.querySelectorAll(`[data-bookmark-id="${this.metadata.id}"]`);

    if (elements.length === 0) return null;

    let minStart = Infinity;
    let maxEnd = 0;

    for (const element of elements) {
      const pos = getElementPosition(element, container);
      if (pos) {
        minStart = Math.min(minStart, pos.start);
        maxEnd = Math.max(maxEnd, pos.end);
      }
    }

    return new Range({
      start: minStart,
      end: maxEnd,
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
   * 删除书签（仅移除书签标记元素，保留文本内容）
   */
  remove(): void {
    const selector = `[data-bookmark-id="${this.metadata.id}"]`;
    this._adapter.removeElementsBySelector(selector, true);
  }

  /**
   * 创建书签 DOM 元素
   * @param metadata 书签元数据
   * @returns DOM 元素
   */
  static createElement(metadata: BookmarkMetadata): HTMLElement {
    const span = document.createElement('span');
    span.className = BOOKMARK_CLASS;
    span.setAttribute('data-bookmark-id', metadata.id);
    span.setAttribute('data-bookmark-name', metadata.name);
    span.setAttribute('data-bookmark-create-time', metadata.createTime.toString());

    if (metadata.author) {
      span.setAttribute('data-bookmark-author', metadata.author);
    }

    if (metadata.customData) {
      for (const [key, value] of Object.entries(metadata.customData)) {
        span.setAttribute(`data-bookmark-${key}`, String(value));
      }
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
   *
   * 同一 bookmark ID 可能对应多个 DOM 元素（跨块书签），
   * 每个 ID 只返回一个 Bookmark 实例
   *
   * @param adapter 适配器实例
   * @returns 书签数组
   */
  static findAll(adapter: IRangeAdapter): Bookmark[] {
    const container = adapter.getContainer();
    const elements = container.querySelectorAll(`.${BOOKMARK_CLASS}`);
    const seenIds = new Set<string>();
    const bookmarks: Bookmark[] = [];

    for (const element of elements) {
      const id = element.getAttribute('data-bookmark-id');
      if (!id || seenIds.has(id)) continue;
      const bookmark = Bookmark.fromElement(element, adapter);
      if (bookmark) {
        seenIds.add(id);
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
    const container = adapter.getContainer();
    const escapedName = name.replace(/"/g, '\\"');
    const elements = container.querySelectorAll(`[data-bookmark-name="${escapedName}"]`);
    const bookmarks: Bookmark[] = [];

    for (const element of elements) {
      const bookmark = Bookmark.fromElement(element, adapter);
      if (bookmark) {
        bookmarks.push(bookmark);
      }
    }

    return bookmarks;
  }
}

export default Bookmark;
