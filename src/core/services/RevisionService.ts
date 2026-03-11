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
import { Range } from '../models/Range';
import { Revision, RevisionType, type RevisionMetadata } from '../models/Revision';

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
      id: this.generateId(),
      type,
      author,
      createTime: Date.now(),
      comment,
      customData,
    };

    const createElement =
      type === RevisionType.INSERT
        ? () => Revision.createInsertElement(range, metadata)
        : () => Revision.createDeleteElement(range, metadata);

    range.wrapElement(createElement);

    const revision = new Revision({ metadata, adapter: this._adapter });
    this.refresh();

    return revision;
  }

  /**
   * 查询修订
   * @param options 查询选项
   * @returns 修订数组
   */
  query(options?: QueryRevisionOptions): Revision[] {
    let revisions = [...this._revisions];

    if (options) {
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
   * 接受修订
   * @param revision 修订实例
   */
  accept(revision: Revision): void {
    revision.accept();
    this.refresh();
  }

  /**
   * 根据ID接受修订
   * @param id 修订ID
   */
  acceptById(id: string): void {
    const revision = this.getById(id);
    if (revision) {
      this.accept(revision);
    }
  }

  /**
   * 批量接受指定范围内的修订
   * @param start 起始位置
   * @param end 结束位置
   * @returns 接受的修订数量
   */
  acceptInRange(start: number, end: number): number {
    const revisions = this.queryInRange(start, end);
    for (const revision of revisions) {
      this.accept(revision);
    }
    return revisions.length;
  }

  /**
   * 批量接受所有修订
   * @returns 接受的修订数量
   */
  acceptAll(): number {
    const revisions = this.query();
    for (const revision of revisions) {
      this.accept(revision);
    }
    return revisions.length;
  }

  /**
   * 拒绝修订
   * @param revision 修订实例
   */
  reject(revision: Revision): void {
    revision.reject();
    this.refresh();
  }

  /**
   * 根据ID拒绝修订
   * @param id 修订ID
   */
  rejectById(id: string): void {
    const revision = this.getById(id);
    if (revision) {
      this.reject(revision);
    }
  }

  /**
   * 批量拒绝指定范围内的修订
   * @param start 起始位置
   * @param end 结束位置
   * @returns 拒绝的修订数量
   */
  rejectInRange(start: number, end: number): number {
    const revisions = this.queryInRange(start, end);
    for (const revision of revisions) {
      this.reject(revision);
    }
    return revisions.length;
  }

  /**
   * 批量拒绝所有修订
   * @returns 拒绝的修订数量
   */
  rejectAll(): number {
    const revisions = this.query();
    for (const revision of revisions) {
      this.reject(revision);
    }
    return revisions.length;
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

  /**
   * 生成唯一ID
   * @returns ID 字符串
   */
  private generateId(): string {
    return `rev-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

export default RevisionService;
