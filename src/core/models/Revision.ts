/**
 * Revision - 修订数据模型
 *
 * 核心职责：管理文档中的修订标记（插入/删除）
 *
 * 业务规则（accept/reject 的语义）：
 *   新增修订（INSERT）- 标记一段文本为"新插入的"
 *     · 接受（确认）：保留文本，解包修订标记
 *     · 拒绝：移除文本（撤销新增）
 *
 *   删除修订（DELETE）- 标记一段文本为"待删除的"
 *     · 接受（确认）：移除文本（执行删除）
 *     · 拒绝：保留文本，解包修订标记（撤销删除）
 *
 * 设计原则：
 * - 使用 DOM 元素包裹实现修订的持久化（元数据存储在 data-* 属性中）
 * - 动态计算位置，支持编辑后自动跟随
 * - 同一 revision ID 可对应多个 DOM 元素（跨块拆分场景）
 */

import type { IRangeAdapter } from '../adapters/IRangeAdapter';
import { getElementPosition } from '../utils';
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
   *
   * 支持跨块修订：同一 revision ID 可对应多个元素，
   * 合并所有元素的范围为一个 Range
   *
   * @returns Range 实例
   */
  getRange(): Range | null {
    const container = this._adapter.getContainer();
    const selector = this._getSelector();
    const elements = container.querySelectorAll(selector);

    if (elements.length === 0) return null;

    let minStart = Infinity;
    let maxEnd = 0;

    for (const element of Array.from(elements)) {
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
   * 获取修订标记的文本内容
   * @returns 文本内容
   */
  getText(): string {
    const range = this.getRange();
    return range ? range.getText() : '';
  }

  /** 构建本修订的 CSS 选择器 */
  private _getSelector(): string {
    return `[data-revision-id="${this.metadata.id}"]`;
  }

  /**
   * 接受修订（确认修订意图）
   *
   * 业务规则:
   * - 新增接受 → 保留文本，解包标记
   * - 删除接受 → 移除文本，跨块时合并段落
   */
  accept(): void {
    this._resolve(true);
  }

  /**
   * 拒绝修订（撤销修订）
   *
   * 业务规则:
   * - 新增拒绝 → 移除文本，跨块时合并段落
   * - 删除拒绝 → 保留文本，解包标记
   */
  reject(): void {
    this._resolve(false);
  }

  /**
   * 统一的修订解决逻辑
   *
   * textRemoved 判定: (DELETE 且接受) 或 (INSERT 且拒绝)
   * 即: 操作确认了修订的删除意图，或撤销了修订的新增意图
   */
  private _resolve(isAccept: boolean): void {
    const selector = this._getSelector();
    const textRemoved = (this.metadata.type === RevisionType.DELETE) === isAccept;

    if (textRemoved) {
      const affectedBlocks = this._getAffectedBlocks(selector);
      this._adapter.removeElementsBySelector(selector, false);
      if (affectedBlocks.length > 1) {
        this._adapter.mergeBlocks(affectedBlocks);
      }
    } else {
      this._adapter.removeElementsBySelector(selector, true);
    }
  }

  /**
   * 获取包含修订元素的块级元素（container 的直接子元素）
   */
  private _getAffectedBlocks(selector: string): Element[] {
    const container = this._adapter.getContainer();
    const elements = container.querySelectorAll(selector);
    const blockSet = new Set<Element>();

    for (const el of Array.from(elements)) {
      let parent: Element | null = el.parentElement;
      while (parent && parent !== container) {
        if (parent.parentElement === container) {
          blockSet.add(parent);
          break;
        }
        parent = parent.parentElement;
      }
    }

    return Array.from(blockSet);
  }

  /**
   * 创建修订 DOM 元素
   * @param metadata 修订元数据
   * @returns DOM 元素
   */
  static createElement(metadata: RevisionMetadata): HTMLElement {
    const span = document.createElement('span');
    span.className = metadata.type === RevisionType.INSERT
      ? REVISION_INSERT_CLASS
      : REVISION_DELETE_CLASS;
    this.setCommonAttributes(span, metadata);
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
      for (const [key, value] of Object.entries(metadata.customData)) {
        element.setAttribute(`data-revision-${key}`, String(value));
      }
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
   *
   * 同一 revision ID 可能对应多个 DOM 元素（跨块修订），
   * 每个 ID 只返回一个 Revision 实例
   *
   * @param adapter 适配器实例
   * @returns 修订数组
   */
  static findAll(adapter: IRangeAdapter): Revision[] {
    const container = adapter.getContainer();
    const elements = container.querySelectorAll(
      `.${REVISION_INSERT_CLASS}, .${REVISION_DELETE_CLASS}`
    );
    const seenIds = new Set<string>();
    const revisions: Revision[] = [];

    for (const element of Array.from(elements)) {
      const id = element.getAttribute('data-revision-id');
      if (!id || seenIds.has(id)) continue;
      const revision = Revision.fromElement(element, adapter);
      if (revision) {
        seenIds.add(id);
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
    const container = adapter.getContainer();
    const elements = container.querySelectorAll(
      `.${REVISION_INSERT_CLASS}, .${REVISION_DELETE_CLASS}`
    );

    /* 单次遍历：按 ID 分组并计算范围边界，避免 N+1 查询 */
    const idRanges = new Map<string, { minStart: number; maxEnd: number; sampleElement: Element }>();

    for (const element of Array.from(elements)) {
      const id = element.getAttribute('data-revision-id');
      if (!id) continue;

      const pos = getElementPosition(element, container);
      if (!pos) continue;

      const existing = idRanges.get(id);
      if (existing) {
        existing.minStart = Math.min(existing.minStart, pos.start);
        existing.maxEnd = Math.max(existing.maxEnd, pos.end);
      } else {
        idRanges.set(id, { minStart: pos.start, maxEnd: pos.end, sampleElement: element });
      }
    }

    /* 仅创建与目标范围重叠的 Revision 对象 */
    const result: Revision[] = [];
    for (const [, info] of idRanges) {
      if (info.minStart < end && info.maxEnd > start) {
        const revision = Revision.fromElement(info.sampleElement, adapter);
        if (revision) {
          result.push(revision);
        }
      }
    }

    return result;
  }
}

export default Revision;
