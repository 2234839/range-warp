/**
 * Range 适配器接口定义
 *
 * 核心职责：统一不同编辑器的文本操作 API
 * 设计原则：依赖倒置 - 上层业务逻辑依赖此抽象接口，而非具体实现
 */
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
   * 对指定范围内的文本应用样式
   * @param start 起始字符下标
   * @param end 结束字符下标
   * @param style 样式类型（如 'bold', 'italic'）
   */
  setStyle(start: number, end: number, style: string): void;

  /**
   * 移除指定范围内的样式
   * @param start 起始字符下标
   * @param end 结束字符下标
   * @param style 样式类型
   */
  removeStyle(start: number, end: number, style: string): void;

  /**
   * 用 DOM 元素包裹指定范围的文本
   * @param start 起始字符下标
   * @param end 结束字符下标
   * @param elementCreator 元素创建函数
   */
  wrapElement(start: number, end: number, elementCreator: () => Element): void;

  /**
   * 移除指定范围的元素包裹，保留文本内容
   * @param start 起始字符下标
   * @param end 结束字符下标
   * @param selector CSS 选择器 (可以是标签名或带属性的选择器)
   * @param style 可选的样式名称,用于精确匹配
   */
  unwrapElement(start: number, end: number, selector: string, style?: string): void;

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
   * 查找文本在文档中的所有位置
   * @param searchText 要查找的文本
   * @returns 匹配位置数组
   */
  findText(searchText: string): Array<{ start: number; end: number }>;

  /**
   * 检查指定范围是否包含特定样式的元素
   * @param start 起始字符下标
   * @param end 结束字符下标
   * @param tagName 标签名
   * @returns 是否包含
   */
  hasStyle(start: number, end: number, tagName: string): boolean;

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
}
