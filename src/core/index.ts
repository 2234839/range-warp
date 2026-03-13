/**
 * Range-Warp 核心模块导出
 *
 * 架构说明：
 * 1. 适配器层：IRangeAdapter 接口 + DOMRangeAdapter 实现
 * 2. 模型层：Range, Bookmark, Revision
 * 3. 服务层：StyleService, BookmarkService, RevisionService
 * 4. 应用层：Editor
 */

// 适配器层
export { DOMRangeAdapter, registerContainerConfig, BLOCK_TAG_NAMES, getNonCopyableSelector } from './adapters/DOMRangeAdapter';
export type { DOMRangeAdapterOptions } from './adapters/DOMRangeAdapter';
export type { IRangeAdapter, ContainerTagConfig, WrapOptions } from './adapters/IRangeAdapter';

// 模型层
export { Range } from './models/Range';
export type { RangeOptions } from './models/Range';

export { Bookmark } from './models/Bookmark';
export type { BookmarkOptions, BookmarkMetadata } from './models/Bookmark';

export { Revision, RevisionType } from './models/Revision';
export type { RevisionOptions, RevisionMetadata } from './models/Revision';

// 服务层
export { StyleService } from './services/StyleService';

export { BookmarkService } from './services/BookmarkService';
export type { CreateBookmarkOptions, QueryBookmarkOptions } from './services/BookmarkService';

export { RevisionService } from './services/RevisionService';
export type { CreateRevisionOptions, QueryRevisionOptions } from './services/RevisionService';

// 应用层
export { Editor } from './Editor';
export type { EditorOptions, SetTextOptions } from './Editor';
