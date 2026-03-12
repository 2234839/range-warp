/**
 * BookmarkService - 书签管理服务
 *
 * 核心职责：提供书签的创建、查询、删除等管理功能
 * 设计原则：
 * - 封装书签操作的复杂逻辑
 * - 提供便捷的 API 给上层使用
 * - 维护书签列表状态
 */

import type { IRangeAdapter } from '../adapters/IRangeAdapter';
import { registerContainerConfig } from '../adapters/DOMRangeAdapter.js';
import { Range } from '../models/Range';
import { Bookmark, type BookmarkMetadata } from '../models/Bookmark';
import { generateId } from '../utils';

/** 注册书签容器配置（使适配器能识别书签元素并支持跨块拆分） */
registerContainerConfig('bookmark', {
  tagName: 'span',
  attributeSelector: '.bookmark',
  display: 'inline',
  crossBlock: 'split',
});

export interface CreateBookmarkOptions {
  /** 书签名称 */
  name: string;
  /** 书签范围 */
  range: Range;
  /** 创建者 */
  author?: string;
  /** 自定义数据 */
  customData?: Record<string, any>;
}

export interface QueryBookmarkOptions {
  /** 按名称过滤 */
  name?: string;
  /** 按作者过滤 */
  author?: string;
  /** 按时间范围过滤 */
  timeRange?: {
    start: number;
    end: number;
  };
}

export class BookmarkService {
  /** 适配器实例 */
  private readonly _adapter: IRangeAdapter;
  /** 书签列表缓存 */
  private _bookmarks: Bookmark[] = [];

  constructor(adapter: IRangeAdapter) {
    this._adapter = adapter;
    this.refresh();
  }

  /**
   * 创建书签
   * @param options 创建选项
   * @returns Bookmark 实例
   */
  create(options: CreateBookmarkOptions): Bookmark {
    const { name, range, author, customData } = options;

    const metadata: BookmarkMetadata = {
      id: generateId('bm'),
      name,
      createTime: Date.now(),
      author,
      customData,
    };

    range.wrapElement(() => Bookmark.createElement(metadata), { mode: 'wrap' });

    const bookmark = new Bookmark({ metadata, adapter: this._adapter });
    this.refresh();

    return bookmark;
  }

  /**
   * 查询书签
   * @param options 查询选项
   * @returns 书签数组
   */
  query(options?: QueryBookmarkOptions): Bookmark[] {
    let bookmarks = [...this._bookmarks];

    if (options) {
      if (options.name) {
        bookmarks = bookmarks.filter((b) => b.metadata.name === options.name);
      }
      if (options.author) {
        bookmarks = bookmarks.filter((b) => b.metadata.author === options.author);
      }
      if (options.timeRange) {
        const { start, end } = options.timeRange;
        bookmarks = bookmarks.filter(
          (b) => b.metadata.createTime >= start && b.metadata.createTime <= end
        );
      }
    }

    return bookmarks;
  }

  /**
   * 根据ID获取书签
   * @param id 书签ID
   * @returns Bookmark 实例或 null
   */
  getById(id: string): Bookmark | null {
    return Bookmark.findById(id, this._adapter);
  }

  /**
   * 删除书签
   * @param bookmark 书签实例
   */
  delete(bookmark: Bookmark): void {
    bookmark.remove();
    this.refresh();
  }

  /**
   * 根据ID删除书签
   * @param id 书签ID
   */
  deleteById(id: string): void {
    const bookmark = this.getById(id);
    if (bookmark) {
      this.delete(bookmark);
    }
  }

  /**
   * 删除所有书签
   */
  deleteAll(): void {
    const bookmarks = this.query();
    for (const bookmark of bookmarks) {
      bookmark.remove();
    }
    this.refresh();
  }

  /**
   * 刷新书签列表
   */
  refresh(): void {
    this._bookmarks = Bookmark.findAll(this._adapter);
  }

  /**
   * 获取所有书签
   * @returns 书签数组
   */
  getAll(): Bookmark[] {
    return [...this._bookmarks];
  }

  /**
   * 跳转到指定书签
   * @param id 书签ID
   */
  goto(id: string): void {
    const bookmark = this.getById(id);
    if (bookmark) {
      bookmark.goto();
    }
  }

}

export default BookmarkService;
