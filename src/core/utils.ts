/**
 * 共享工具函数
 */

/**
 * 生成唯一 ID
 * @param prefix ID 前缀（如 'bm'、'rev'）
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 获取 Unicode 字符长度（使用 for...of 遍历代理对）
 * 正确处理 emoji 等多码点字符
 */
export function getUnicodeStringLength(str: string): number {
  let count = 0;
  for (const _ of str) count++;
  return count;
}

/**
 * 根据 Unicode 索引获取 UTF-16 偏移量
 * 用于将 Unicode 字符位置转换为 DOM Range 所需的 UTF-16 code unit 偏移
 */
export function getUtf16Offset(str: string, unicodeIndex: number): number {
  let utf16Offset = 0;
  for (const char of str) {
    if (unicodeIndex <= 0) break;
    utf16Offset += char.length;
    unicodeIndex--;
  }
  return utf16Offset;
}

/**
 * 按 Unicode 下标切片字符串
 */
export function getUtf16Slice(str: string, start: number, end: number): string {
  let result = '';
  let index = 0;
  for (const char of str) {
    if (index >= end) break;
    if (index >= start) result += char;
    index++;
  }
  return result;
}

/**
 * 计算元素在容器内的文本位置范围（基于 Unicode 字符下标）
 *
 * 同时被 Bookmark、Revision、DOMRangeAdapter 三处复用，
 * 避免 calculateElementOffset 的重复实现
 *
 * @param element 目标元素
 * @param container 容器元素
 * @returns { start, end } 或 null（element 不在 container 内时）
 */
export function getElementPosition(element: Element, container: Element): { start: number; end: number } | null {
  try {
    const doc = element.ownerDocument;
    const elemRange = doc.createRange();
    elemRange.selectNodeContents(element);
    const preRange = doc.createRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(elemRange.startContainer, elemRange.startOffset);

    const start = getUnicodeStringLength(preRange.toString());
    const end = start + getUnicodeStringLength(elemRange.toString());

    return { start, end };
  } catch {
    return null;
  }
}

/**
 * 根据 depth-first 遍历索引在容器中查找元素
 * 兼容主文档和 iframe 文档场景
 */
export function findElementByPath(container: Element, targetIndex: number): Element | null {
  let current = -1;
  const doc = container.ownerDocument;
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    current++;
    if (current === targetIndex) return node as Element;
  }
  return null;
}
