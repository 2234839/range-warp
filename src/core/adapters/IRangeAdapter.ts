/**
 * 容器标签配置
 *
 * 参考 ProseMirror 的 MarkSpec 设计:
 * - 配置只描述容器是什么（tagName、attributeSelector）
 * - 包裹行为由调用方的 WrapOptions 决定，而非容器自身配置
 */
export interface ContainerTagConfig {
  /** 标签名 */
  tagName: string;
  /** 可选的属性选择器 (用于区分不同类型的同标签) */
  attributeSelector?: string;
  /** 中文标签（调试面板等展示用） */
  label?: string;
  /** 显示类型: inline(行内), block(块级), inline-block(混合) */
  display?: 'inline' | 'block' | 'inline-block';
  /**
   * 跨块级元素时的处理策略
   * 'wrap' (默认): 把跨块内容全部包裹进一个容器（可能破坏块布局）
   * 'split': 按块拆分，每个块内单独包裹（保持块布局）
   */
  crossBlock?: 'wrap' | 'split';
  /** 共享 ID 的属性名（用于分片关联和断裂修复） */
  idAttribute?: string;
  /**
   * 非连续分片的修复策略（仅 crossBlock: 'split' 且 idAttribute 存在时生效）
   * 'none': 不修复（默认）
   * 'fill-gaps': 填充间隙，将间隙内容包裹为同类型元素
   * 'keep-largest': 只保留文本最多的分片，移除其余
   */
  splitRepair?: 'none' | 'fill-gaps' | 'keep-largest';
  /**
   * 复制/剪切时是否保留该容器的包裹标签
   * false: 剪贴板 HTML 中移除该容器元素，但保留其文本内容和内部子容器
   * true (默认): 正常复制
   */
  copyable?: boolean;
  /**
   * 相邻的相同配置名容器是否自动合并
   * true: normalize 时将相邻的同配置名容器合并为一个（忽略 ID 差异）
   * false (默认): 仅在配置名和 ID 都相同时才合并
   */
  mergeAdjacent?: boolean;
  /**
   * normalize 时是否移除空标签
   * true (默认): normalize 时自动移除该类型的空容器元素
   * false: 保留空容器（适用于需要占位标记的场景，如空书签）
   */
  removeEmpty?: boolean;
  /**
   * 跨块包裹时是否同时包裹范围内的空块（无文本内容的块级元素）
   *
   * 当为 true 时，wrapAcrossBlocks 不仅包裹文本节点，
   * 还会检测范围内所有块级元素（如空段落、只含 <br> 的段落），
   * 将其子节点一并包裹，使容器在视觉上覆盖完整的选区（包括空行）
   *
   * false (默认): 仅包裹有文本内容的块
   */
  wrapEmpty?: boolean;
}

/**
 * 文本索引数据（预构建，用于批量元素定位避免重复遍历）
 *
 * 由 buildIndex() 构建，内部包含文本节点位置映射和虚拟换行符位置映射。
 * 批量调用 getElementPosition / getDOMRangePosition 时传入可避免 O(N²) 开销。
 */
export interface TextIndex {
  /** 文本节点 → 位置映射 */
  index: Map<Text, { start: number; end: number }>;
  /** <br> 元素 → 虚拟 \n 位置映射 */
  brIndex: Map<Element, number>;
  /** 文本节点快照（按文档顺序） */
  snapshot: Array<{ node: Text; nodeStart: number; nodeEnd: number }>;
  /** 文档总字符数 */
  totalLength: number;
}

/**
 * Range 适配器接口定义
 *
 * 核心职责：统一不同编辑器的文本操作 API
 * 设计原则：依赖倒置 - 上层业务逻辑依赖此抽象接口，而非具体实现
 */
/**
 * 包裹选项
 *
 * 参考 ProseMirror 的 AddMarkStep 设计:
 * - 新增 mark 时，先移除重叠的同类型 mark，再添加新的 → 天然合并
 * - 包裹行为由调用方决定，而非容器自身配置
 */
export interface WrapOptions {
  /**
   * 包裹模式
   * 'nest' (默认): 新元素嵌套在已有容器内，normalize 会合并冗余嵌套
   * 'wrap': 新元素包裹已有容器，将已有容器移入新容器内部
   */
  mode?: 'wrap' | 'nest';
}

export interface IRangeAdapter {
  /**
   * 获取指定范围内的文本内容
   * @param start 起始字符下标（基于文档绝对位置）
   * @param end 结束字符下标
   * @returns 文本内容
   */
  getText(start: number, end: number): string;

  /**
   * 在指定位置插入文本
   * @param position 插入位置字符下标
   * @param text 要插入的文本
   */
  insertText(position: number, text: string): void;

  /**
   * 删除指定范围内的文本
   * @param start 起始字符下标
   * @param end 结束字符下标
   */
  delete(start: number, end: number): void;

  /**
   * 替换指定范围内的文本
   * @param start 起始字符下标
   * @param end 结束字符下标
   * @param text 新文本内容
   */
  replaceText(start: number, end: number, text: string): void;

  /**
   * 使用已注册的容器配置包裹指定范围
   *
   * 根据配置名查找对应的 tagName 和跨块策略，执行包裹操作。
   * 适配器不关心配置的业务含义，只执行 DOM 包裹。
   *
   * @param start 起始字符下标
   * @param end 结束字符下标
   * @param configName 已注册的容器配置名（如 'bold', 'bookmark'）
   */
  applyConfig(start: number, end: number, configName: string): void;

  /**
   * 移除指定范围内匹配配置名的元素包裹，并规范化结构
   *
   * @param start 起始字符下标
   * @param end 结束字符下标
   * @param configName 已注册的容器配置名
   */
  removeConfig(start: number, end: number, configName: string): void;

  /**
   * 用 DOM 元素包裹指定范围的文本
   *
   * 参考 ProseMirror 的 AddMarkStep 设计:
   * - 默认 mode='nest': 新元素嵌套在已有容器内，通过 normalize 合并冗余嵌套
   * - mode='wrap': 新元素包裹已有容器（适用于修订、书签等需要外层包裹的场景）
   *
   * @param start 起始字符下标
   * @param end 结束字符下标
   * @param elementCreator 元素创建函数
   * @param options 包裹选项
   */
  wrapElement(start: number, end: number, elementCreator: () => Element, options?: WrapOptions): void;

  /**
   * 移除指定范围的元素包裹，保留文本内容
   * @param start 起始字符下标
   * @param end 结束字符下标
   * @param selector CSS 选择器 (可以是标签名或带属性的选择器)
   * @param style 可选的样式名称,用于精确匹配
   */
  unwrapElement(start: number, end: number, selector: string, configName?: string): void;

  /**
   * 高亮显示指定范围
   * @param start 起始字符下标
   * @param end 结束字符下标
   */
  select(start: number, end: number): void;

  /**
   * 获取文档总字符数
   * @returns 字符总数（基于 Unicode 字符）
   */
  getDocumentLength(): number;

  /**
   * 获取指定范围内的块级元素
   * @param start 起始字符下标
   * @param end 结束字符下标
   * @returns 块级元素数组
   */
  getBlockElementsInRange(start: number, end: number): Element[];

  /**
   * 查找文本在文档中的所有位置
   * @param searchText 要查找的文本
   * @returns 匹配位置数组
   */
  findText(searchText: string): Array<{ start: number; end: number }>;

  /**
   * 获取编辑器根元素
   * @returns HTMLElement
   */
  getContainer(): HTMLElement;

  /**
   * 规范化指定范围内的标签结构
   *
   * 规范化规则:
   * 1. 移除冗余的嵌套标签 (如 <strong><strong>text</strong></strong>)
   * 2. 合并相邻的相同标签
   * 3. 移除空标签
   *
   * @param start 起始字符下标
   * @param end 结束字符下标
   */
  normalize(start: number, end: number): void;

  /**
   * 移除匹配选择器的元素
   * @param selector CSS 选择器
   * @param keepChildren true=解包（保留子节点），false=删除整个元素及内容
   */
  removeElementsBySelector(selector: string, keepChildren: boolean): void;

  /**
   * 合并连续的块级元素
   *
   * 将传入的块级元素合并为一个：所有内容移入第一个块，其余块移除。
   * 用于跨块修订解决后（文本被移除）的段落结构清理。
   *
   * @param blockElements 需要合并的块级元素
   */
  mergeBlocks(blockElements: Element[]): void;

  /**
   * 修复跨块容器的非连续分片
   *
   * 根据 ContainerTagConfig.splitRepair 配置，
   * 处理共享同一 ID 但被间隙分隔的多个元素：
   * - 'fill-gaps': 包裹间隙内容
   * - 'keep-largest': 只保留最大的分片
   */
  repairSplitContainers(): void;

  /**
   * 清洗 HTML：移除 copyable=false 容器的包裹标签，保留文本和内部子容器
   *
   * 用于剪贴板清洗，避免书签/修订等语义容器被复制到外部
   *
   * @param html 待清洗的 HTML 字符串
   * @returns 清洗后的 HTML 字符串
   */
  sanitizeHTML(html: string): string;

  /**
   * 查询范围内所有已配置容器的配置名集合
   *
   * 查询所有通过 registerContainerConfig 注册的容器类型，
   * 包括行内样式（bold/italic 等）和语义容器（bookmark/revision 等）
   *
   * @param start 范围起始（Unicode 字符位置）
   * @param end 范围结束（Unicode 字符位置）
   * @returns 配置名集合（如 'bold', 'bookmark', 'revision-insert'）
   */
  queryConfigs(start: number, end: number): Set<string>;

  /**
   * 在编辑器容器内查询匹配选择器的元素
   *
   * 统一 DOM 查询入口，上层模型不再直接操作 container.querySelectorAll
   *
   * @param selector CSS 选择器
   * @returns 匹配的元素列表
   */
  querySelectorAll(selector: string): Element[];

  /**
   * 计算元素在文档中的文本位置范围（基于 Unicode 字符下标）
   *
   * 统一元素定位入口，上层模型不再直接使用原生 DOM Range API。
   * 批量调用时建议先 buildIndex() 再传入 prebuiltIndex 以避免 O(N²) 开销。
   *
   * @param element 目标元素
   * @param prebuiltIndex 可选的预构建索引（批量操作时传入以复用）
   * @returns { start, end } 或 null（element 不在容器内时）
   */
  getElementPosition(element: Element, prebuiltIndex?: TextIndex): { start: number; end: number } | null;

  /**
   * 将原生 DOM Range 转换为虚拟位置（包含块边界的虚拟 \n）
   *
   * 与 Range.toString() 不同，返回的位置与 getText/getDocumentLength 一致。
   * 批量调用时建议先 buildIndex() 再传入 prebuiltIndex 以避免 O(N²) 开销。
   *
   * @param range 原生 DOM Range
   * @param prebuiltIndex 可选的预构建索引（批量操作时传入以复用）
   * @returns { start, end } 或 null
   */
  getDOMRangePosition(range: globalThis.Range, prebuiltIndex?: TextIndex): { start: number; end: number } | null;

  /**
   * 构建文本节点索引（一次性 O(N) 遍历）
   *
   * 返回的索引可在批量 getElementPosition / getDOMRangePosition 调用中复用，
   * 将 N 次 O(N) 遍历优化为单次 O(N) 遍历。
   *
   * 注意：DOM 结构变化后需重新构建。
   */
  buildIndex(): TextIndex;

  /**
   * 注册容器标签配置
   *
   * 统一配置注册入口，上层服务不再直接导入具体适配器的 registerContainerConfig
   *
   * @param name 配置名称（如 'revision-insert', 'bookmark'）
   * @param config 容器标签配置
   */
  registerContainerConfig(name: string, config: ContainerTagConfig): void;

  /**
   * 根据已注册的容器配置创建元素
   *
   * 使用容器所属的 document 创建元素，自动设置 className 和附加属性。
   * 兼容主文档和 iframe 文档场景。
   *
   * @param configName 容器配置名称（如 'bookmark', 'revision-insert'）
   * @param attrs 附加属性键值对（如 data-bookmark-id, data-revision-author）
   * @returns 新创建的元素
   */
  createConfigElement(configName: string, attrs?: Record<string, string>): Element;

  /**
   * 获取所有已注册的容器配置
   *
   * 返回配置名和对应的 CSS 选择器，供调试面板等上层使用
   */
  getRegisteredConfigs(): Array<{ name: string; selector: string; idAttribute?: string; label?: string }>;

}
