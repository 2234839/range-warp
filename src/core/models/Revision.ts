/**
 * Revision - 修订数据模型
 *
 * 核心职责：管理文档中的修订标记（插入/删除）
 * 设计原则：
 * - 使用 DOM 元素包裹实现修订的持久化
 * - 动态计算位置，支持编辑后自动跟随
 * - 提供接受/拒绝修订的核心功能
 */

import type { IRangeAdapter } from '../adapters/IRangeAdapter';
import { Range } from './Range';

/** 修订类型 */
export const RevisionType = {
  /** 插入修订 */
  INSERT: 'insert',
  /** 删除修订 */
  DELETE: 'delete',
} as const;

/** 修订类型值 */
export type RevisionType = typeof RevisionType[keyof typeof RevisionType];

/** 修订元数据接口 */
export interface RevisionMetadata {
  /** 修订唯一标识 */
  id: string;
  /** 修订类型 */
  type: RevisionType;
  /** 作者 */
  author: string;
  /** 创建时间 */
  createTime: number;
  /** 修订说明 */
  comment?: string;
  /** 自定义数据 */
  customData?: Record<string, any>;
}

/** 修订选项 */
export interface RevisionOptions {
  /** 修订元数据 */
  metadata: RevisionMetadata;
  /** 适配器实例 */
  adapter: IRangeAdapter;
}

/** 插入修订元素类名 */
const REVISION_INSERT_CLASS = 'revision-insert';
/** 删除修订元素类名 */
const REVISION_DELETE_CLASS = 'revision-delete';

export class Revision {
  /** 修订元数据 */
  readonly metadata: RevisionMetadata;
  /** 适配器实例 */
  private readonly _adapter: IRangeAdapter;

  constructor(options: RevisionOptions) {
    this.metadata = options.metadata;
    this._adapter = options.adapter;
  }

  /**
   * 获取修订的 Range 对象
   * @returns Range 实例
   */
  getRange(): Range | null {
    const container = this._adapter.getContainer();
    const selector = this.metadata.type === RevisionType.INSERT
      ? `.${REVISION_INSERT_CLASS}`
      : `.${REVISION_DELETE_CLASS}`;
    const element = container.querySelector(`${selector}[data-revision-id="${this.metadata.id}"]`);

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
   * 获取修订标记的文本内容
   * @returns 文本内容
   */
  getText(): string {
    const range = this.getRange();
    return range ? range.getText() : '';
  }

  /**
   * 接受修订
   * - 插入修订：移除修订标记，保留内容
   * - 删除修订：彻底删除内容
   */
  accept(): void {
    const range = this.getRange();
    if (!range) return;

    if (this.metadata.type === RevisionType.INSERT) {
      // 插入修订：移除修订标记，保留内容
      range.unwrapElement('span');
    } else {
      // 删除修订：彻底删除内容
      range.delete();
    }
  }

  /**
   * 拒绝修订
   * - 插入修订：删除插入的内容
   * - 删除修订：恢复被删除的内容
   */
  reject(): void {
    const range = this.getRange();
    if (!range) return;

    if (this.metadata.type === RevisionType.INSERT) {
      // 插入修订：删除插入的内容
      range.delete();
    } else {
      // 删除修订：恢复被删除的内容（移除修订标记）
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
   * 创建插入修订 DOM 元素
   * @param range Range 对象
   * @param metadata 修订元数据
   * @returns DOM 元素
   */
  static createInsertElement(range: Range, metadata: RevisionMetadata): HTMLElement {
    const span = document.createElement('span');
    span.className = REVISION_INSERT_CLASS;
    this.setCommonAttributes(span, metadata);
    return span;
  }

  /**
   * 创建删除修订 DOM 元素
   * @param range Range 对象
   * @param metadata 修订元数据
   * @returns DOM 元素
   */
  static createDeleteElement(range: Range, metadata: RevisionMetadata): HTMLElement {
    const span = document.createElement('span');
    span.className = REVISION_DELETE_CLASS;
    this.setCommonAttributes(span, metadata);

    // 删除修订使用 <del> 标签包裹内容
    const del = document.createElement('del');
    span.appendChild(del);

    return span;
  }

  /**
   * 设置通用属性
   * @param element DOM 元素
   * @param metadata 修订元数据
   */
  private static setCommonAttributes(element: HTMLElement, metadata: RevisionMetadata): void {
    element.setAttribute('data-revision-id', metadata.id);
    element.setAttribute('data-revision-type', metadata.type);
    element.setAttribute('data-revision-author', metadata.author);
    element.setAttribute('data-revision-time', metadata.createTime.toString());

    if (metadata.comment) {
      element.setAttribute('data-revision-comment', metadata.comment);
    }

    if (metadata.customData) {
      Object.entries(metadata.customData).forEach(([key, value]) => {
        element.setAttribute(`data-revision-${key}`, String(value));
      });
    }
  }

  /**
   * 从 DOM 元素创建修订对象
   * @param element DOM 元素
   * @param adapter 适配器实例
   * @returns Revision 实例
   */
  static fromElement(element: Element, adapter: IRangeAdapter): Revision | null {
    const revisionId = element.getAttribute('data-revision-id');
    if (!revisionId) return null;

    const typeStr = element.getAttribute('data-revision-type');
    if (!typeStr) return null;

    const metadata: RevisionMetadata = {
      id: revisionId,
      type: typeStr === RevisionType.INSERT ? RevisionType.INSERT : RevisionType.DELETE,
      author: element.getAttribute('data-revision-author') || '',
      createTime: Number(element.getAttribute('data-revision-time')) || Date.now(),
      comment: element.getAttribute('data-revision-comment') || undefined,
    };

    return new Revision({ metadata, adapter });
  }

  /**
   * 查询所有修订
   * @param adapter 适配器实例
   * @returns 修订数组
   */
  static findAll(adapter: IRangeAdapter): Revision[] {
    const container = adapter.getContainer();
    const insertElements = container.querySelectorAll(`.${REVISION_INSERT_CLASS}`);
    const deleteElements = container.querySelectorAll(`.${REVISION_DELETE_CLASS}`);
    const revisions: Revision[] = [];

    for (const element of Array.from(insertElements)) {
      const revision = Revision.fromElement(element, adapter);
      if (revision) {
        revisions.push(revision);
      }
    }

    for (const element of Array.from(deleteElements)) {
      const revision = Revision.fromElement(element, adapter);
      if (revision) {
        revisions.push(revision);
      }
    }

    return revisions;
  }

  /**
   * 根据ID查找修订
   * @param id 修订ID
   * @param adapter 适配器实例
   * @returns Revision 实例或 null
   */
  static findById(id: string, adapter: IRangeAdapter): Revision | null {
    const container = adapter.getContainer();
    const element = container.querySelector(`[data-revision-id="${id}"]`);

    if (!element) return null;

    return Revision.fromElement(element, adapter);
  }

  /**
   * 查询指定范围内的修订
   * @param start 起始位置
   * @param end 结束位置
   * @param adapter 适配器实例
   * @returns 修订数组
   */
  static findInRange(start: number, end: number, adapter: IRangeAdapter): Revision[] {
    const all = Revision.findAll(adapter);
    const result: Revision[] = [];

    for (const revision of all) {
      const range = revision.getRange();
      if (range && range.start < end && range.end > start) {
        result.push(revision);
      }
    }

    return result;
  }
}

export default Revision;
