/**
 * RevisionService - 修订管理服务
 *
 * 核心职责：提供修订的创建、查询、接受、拒绝等管理功能
 * 设计原则：
 * - 封装修订操作的复杂逻辑
 * - 提供便捷的 API 给上层使用
 * - 支持批量操作
 */

import type { IRangeAdapter } from '../adapters/IRangeAdapter';
import { registerContainerConfig } from '../adapters/DOMRangeAdapter.js';
import { Range } from '../models/Range';
import { Revision, RevisionType, type RevisionMetadata } from '../models/Revision';
import { generateId } from '../utils';

/** 注册修订容器配置（使适配器能识别修订元素） */
registerContainerConfig('revision-insert', {
  tagName: 'span',
  attributeSelector: '.revision-insert',
  display: 'inline',
  crossBlock: 'split',
  idAttribute: 'data-revision-id',
  splitRepair: 'none',
  copyable: false,
});
registerContainerConfig('revision-delete', {
  tagName: 'span',
  attributeSelector: '.revision-delete',
  display: 'inline',
  crossBlock: 'split',
  idAttribute: 'data-revision-id',
  splitRepair: 'none',
  copyable: false,
});

export interface CreateRevisionOptions {
  /** 修订类型 */
  type: RevisionType;
  /** 修订范围 */
  range: Range;
  /** 作者 */
  author: string;
  /** 修订说明 */
  comment?: string;
  /** 自定义数据 */
  customData?: Record<string, any>;
}

export interface QueryRevisionOptions {
  /** 按类型过滤 */
  type?: RevisionType;
  /** 按作者过滤 */
  author?: string;
  /** 按时间范围过滤 */
  timeRange?: {
    start: number;
    end: number;
  };
}

export class RevisionService {
  /** 适配器实例 */
  private readonly _adapter: IRangeAdapter;
  /** 修订列表缓存 */
  private _revisions: Revision[] = [];

  constructor(adapter: IRangeAdapter) {
    this._adapter = adapter;
    this.refresh();
  }

  /**
   * 创建插入修订
   * @param options 创建选项
   * @returns Revision 实例
   */
  createInsert(options: Omit<CreateRevisionOptions, 'type'>): Revision {
    return this.create({ ...options, type: RevisionType.INSERT });
  }

  /**
   * 创建删除修订
   * @param options 创建选项
   * @returns Revision 实例
   */
  createDelete(options: Omit<CreateRevisionOptions, 'type'>): Revision {
    return this.create({ ...options, type: RevisionType.DELETE });
  }

  /**
   * 创建修订
   * @param options 创建选项
   * @returns Revision 实例
   */
  create(options: CreateRevisionOptions): Revision {
    const { type, range, author, comment, customData } = options;
    const metadata: RevisionMetadata = {
      id: generateId('rev'),
      type,
      author,
      createTime: Date.now(),
      comment,
      customData,
    };

    /* 空范围不创建修订 */
    if (range.isEmpty()) {
      return new Revision({ metadata, adapter: this._adapter });
    }

    /*
     * 参考 ProseMirror addMark: 添加新 mark 前先移除冲突的 mark
     * 新增/删除修订互斥：创建新修订前解包已有冲突修订，保留文本内容
     */
    this.removeConflictingRevisions(range.start, range.end);

    const revision = this._wrapRevision(range, metadata);
    this.refresh();
    return revision;
  }

  /**
   * 将修订包裹到指定范围（跳过冲突检测）
   *
   * 用于 create 和内部重建场景
   */
  private _wrapRevision(range: Range, metadata: RevisionMetadata): Revision {
    const createElement = () => Revision.createElement(metadata);
    range.wrapElement(createElement, { mode: 'wrap' });

    return new Revision({ metadata, adapter: this._adapter });
  }

  /**
   * 创建并包裹新修订（跳过冲突检测，用于内部重建）
   *
   * 统一 removeConflictingRevisions 和 _partialResolve 中的剩余部分重建逻辑
   */
  private _createAndWrapRevision(start: number, end: number, type: RevisionType, author: string): void {
    this._wrapRevision(
      new Range({ start, end, adapter: this._adapter }),
      { id: generateId('rev'), type, author, createTime: Date.now() },
    );
  }

  /**
   * 移除范围内与已有修订冲突的部分
   *
   * 参考 ProseMirror addMark: 添加新 mark 前先移除所有冲突的 mark（包括同类型）
   * 策略：完全移除冲突修订（保留文本），然后对非重叠部分重建同类型修订
   *
   * 例：insert 在 [0,3] 然后 delete 在 [1,3]
   *   → 完全移除 insert 修订，"a" 重建 insert，"bc" 交给新 delete
   *
   * 例：insert 在 [0,3] 然后 insert 在 [1,3]（同类型重叠）
   *   → 完全移除旧 insert 修订，"a" 重建旧 insert，"bc" 交给新 insert
   */
  private removeConflictingRevisions(start: number, end: number): void {
    const conflicting = this.queryInRange(start, end);

    for (const revision of conflicting) {
      const revRange = revision.getRange();
      if (!revRange) continue;

      const revStart = revRange.start;
      const revEnd = revRange.end;

      const overlapStart = Math.max(revStart, start);
      const overlapEnd = Math.min(revEnd, end);

      if (overlapStart >= overlapEnd) continue;

      const selector = `[data-revision-id="${revision.metadata.id}"]`;
      const conflictingType = revision.metadata.type;
      const author = revision.metadata.author;

      /* 完全移除冲突修订（保留文本内容） */
      this._adapter.removeElementsBySelector(selector, true);

      /* 对非重叠部分重建同类型修订（使用 _createAndWrapRevision 避免递归冲突检测） */
      if (revStart < overlapStart) {
        this._createAndWrapRevision(revStart, overlapStart, conflictingType, author);
      }
      if (overlapEnd < revEnd) {
        this._createAndWrapRevision(overlapEnd, revEnd, conflictingType, author);
      }
    }
  }

  /**
   * 查询修订
   * @param options 查询选项
   * @returns 修订数组
   */
  query(options?: QueryRevisionOptions): Revision[] {
    if (!options) return [...this._revisions];

    let revisions = [...this._revisions];
    if (options.type) {
      revisions = revisions.filter((r) => r.metadata.type === options.type);
    }
    if (options.author) {
      revisions = revisions.filter((r) => r.metadata.author === options.author);
    }
    if (options.timeRange) {
      const { start, end } = options.timeRange;
      revisions = revisions.filter(
        (r) => r.metadata.createTime >= start && r.metadata.createTime <= end
      );
    }

    return revisions;
  }

  /**
   * 查询指定范围内的修订
   * @param start 起始位置
   * @param end 结束位置
   * @returns 修订数组
   */
  queryInRange(start: number, end: number): Revision[] {
    return Revision.findInRange(start, end, this._adapter);
  }

  /**
   * 根据ID获取修订
   * @param id 修订ID
   * @returns Revision 实例或 null
   */
  getById(id: string): Revision | null {
    return Revision.findById(id, this._adapter);
  }

  /**
   * 解决单个修订
   * @param revision 修订实例
   * @param isAccept 是否接受
   */
  private _resolveOne(revision: Revision, isAccept: boolean): void {
    isAccept ? revision.accept() : revision.reject();
    this.refresh();
  }

  /**
   * 根据ID解决修订
   * @param id 修订ID
   * @param isAccept 是否接受
   */
  private _resolveById(id: string, isAccept: boolean): void {
    const revision = this.getById(id);
    if (revision) {
      this._resolveOne(revision, isAccept);
    }
  }

  /**
   * 接受修订
   * @param revision 修订实例
   */
  accept(revision: Revision): void {
    this._resolveOne(revision, true);
  }

  /**
   * 根据ID接受修订
   * @param id 修订ID
   */
  acceptById(id: string): void {
    this._resolveById(id, true);
  }

  /**
   * 统一的范围内修订解决
   * @param start 起始位置
   * @param end 结束位置
   * @param isAccept 是否接受
   * @returns 解决的修订数量
   */
  private _resolveInRange(start: number, end: number, isAccept: boolean): number {
    const revisions = this.queryInRange(start, end);
    /* 从后向前处理，避免前面的文本删除导致后面的修订位置偏移 */
    for (let i = revisions.length - 1; i >= 0; i--) {
      this._partialResolve(revisions[i], start, end, isAccept);
    }
    this.refresh();
    return revisions.length;
  }

  /**
   * 批量接受指定范围内的修订（支持部分接受，自动拆分修订范围）
   * @param start 起始位置
   * @param end 结束位置
   * @returns 接受的修订数量
   */
  acceptInRange(start: number, end: number): number {
    return this._resolveInRange(start, end, true);
  }

  /**
   * 部分解决修订
   *
   * 统一处理部分接受和部分拒绝的逻辑：
   * - 文本保留（INSERT 接受 / DELETE 拒绝）→ unwrapElement 拆分
   * - 文本移除（INSERT 拒绝 / DELETE 接受）→ 解包 → 删除内容 → 重建剩余修订
   */
  private _partialResolve(revision: Revision, rangeStart: number, rangeEnd: number, isAccept: boolean): void {
    const revRange = revision.getRange();
    if (!revRange) {
      isAccept ? revision.accept() : revision.reject();
      return;
    }

    const revStart = revRange.start;
    const revEnd = revRange.end;

    /* 完全包含：直接解决整个修订 */
    if (rangeStart <= revStart && rangeEnd >= revEnd) {
      isAccept ? revision.accept() : revision.reject();
      return;
    }

    const textRemoved = (revision.metadata.type === RevisionType.DELETE) === isAccept;
    const selector = `[data-revision-id="${revision.metadata.id}"]`;
    const author = revision.metadata.author;

    if (textRemoved) {
      /* 只删除修订范围与解决范围的重叠部分，避免误删非修订文本 */
      const overlapStart = Math.max(revStart, rangeStart);
      const overlapEnd = Math.min(revEnd, rangeEnd);

      /*
       * 记录受影响的块级元素（文本移除前获取）
       * 只保留容器直接子元素，与 Revision._getAffectedBlocks 保持一致
       */
      const container = this._adapter.getContainer();
      const affectedBlocks = this._adapter.getBlockElementsInRange(overlapStart, overlapEnd)
        .filter(block => block.parentElement === container);

      /* 解包全部修订标记，然后删除重叠区域的内容 */
      this._adapter.removeElementsBySelector(selector, true);
      this._adapter.delete(overlapStart, overlapEnd);

      /* 跨块文本移除后合并段落 */
      if (affectedBlocks.length > 1) {
        this._adapter.mergeBlocks(affectedBlocks);
      }

      /* 重建剩余修订 */
      const deleted = overlapEnd - overlapStart;

      if (overlapStart > revStart) {
        this._createAndWrapRevision(revStart, overlapStart, revision.metadata.type, author);
      }
      if (overlapEnd < revEnd) {
        this._createAndWrapRevision(overlapStart, revEnd - deleted, revision.metadata.type, author);
      }
    } else {
      /* 文本保留：用 unwrapElement 拆分重叠部分 */
      this._adapter.unwrapElement(rangeStart, rangeEnd, selector);
    }
  }

  /**
   * 批量解决所有修订
   * @param isAccept 是否接受
   * @returns 解决的修订数量
   */
  private _resolveAll(isAccept: boolean): number {
    const revisions = this.query();
    for (const revision of revisions) {
      isAccept ? revision.accept() : revision.reject();
    }
    this.refresh();
    return revisions.length;
  }

  /**
   * 批量接受所有修订
   * @returns 接受的修订数量
   */
  acceptAll(): number {
    return this._resolveAll(true);
  }

  /**
   * 拒绝修订
   * @param revision 修订实例
   */
  reject(revision: Revision): void {
    this._resolveOne(revision, false);
  }

  /**
   * 根据ID拒绝修订
   * @param id 修订ID
   */
  rejectById(id: string): void {
    this._resolveById(id, false);
  }

  /**
   * 批量拒绝指定范围内的修订（支持部分拒绝，自动拆分修订范围）
   * @param start 起始位置
   * @param end 结束位置
   * @returns 拒绝的修订数量
   */
  rejectInRange(start: number, end: number): number {
    return this._resolveInRange(start, end, false);
  }

  /**
   * 批量拒绝所有修订
   * @returns 拒绝的修订数量
   */
  rejectAll(): number {
    return this._resolveAll(false);
  }

  /**
   * 刷新修订列表
   */
  refresh(): void {
    this._revisions = Revision.findAll(this._adapter);
  }

  /**
   * 获取所有修订
   * @returns 修订数组
   */
  getAll(): Revision[] {
    return [...this._revisions];
  }

}

export default RevisionService;
