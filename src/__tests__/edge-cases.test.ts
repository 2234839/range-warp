/**
 * 边界场景测试 — 专注于容易出 bug 的边界条件
 *
 * 测试路径: tsx src/__tests__/edge-cases.test.ts
 *
 * 覆盖场景:
 * 1. 连续相邻样式标签合并（normalize 核心逻辑）
 * 2. 样式覆盖（已有样式上应用新样式）
 * 3. 跨段落样式应用（块边界处理）
 * 4. 多种样式交叉（同一范围多个样式）
 * 5. 空范围操作
 * 6. 文档边界操作（起始/末尾）
 * 7. 全选后操作
 * 8. normalize 后冗余嵌套清理
 * 9. 分片容器修复
 * 10. 部分样式移除（拆分逻辑）
 */
import { JSDOM } from 'jsdom';
import { DOMRangeAdapter, registerContainerConfig } from '../core/adapters/DOMRangeAdapter.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' });
global.window = dom.window as any;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.Text = dom.window.Text;
global.Range = dom.window.Range;
global.NodeFilter = dom.window.NodeFilter;

function normalizeHTML(html: string): string {
  return html.replace(/\s+/g, '').replace(/>\s+</g, '><');
}

interface TestCase {
  name: string;
  initialHTML: string;
  operation: (adapter: DOMRangeAdapter, start: number, end: number) => void;
  start: number;
  end: number;
  expectedHTML: string;
  description: string;
}

function runTest(testCase: TestCase): boolean {
  const container = dom.window.document.createElement('div');
  container.innerHTML = testCase.initialHTML;
  const adapter = new DOMRangeAdapter({ container });

  try {
    testCase.operation(adapter, testCase.start, testCase.end);
    const actualHTML = normalizeHTML(container.innerHTML);
    const expectedHTML = normalizeHTML(testCase.expectedHTML);
    const passed = actualHTML === expectedHTML;

    if (!passed) {
      console.log(`❌ FAIL: ${testCase.name}`);
      console.log(`   ${testCase.description}`);
      console.log(`   预期: ${expectedHTML}`);
      console.log(`   实际: ${actualHTML}`);
    }
    return passed;
  } catch (error: any) {
    console.log(`❌ FAIL: ${testCase.name}`);
    console.log(`   ${testCase.description}`);
    console.log(`   错误: ${error.message}\n${error.stack}`);
    return false;
  }
}

// ==================== 测试用例 ====================

const testCases: TestCase[] = [
  // ==================== 1. 连续相邻样式标签合并 ====================
  {
    name: '1.1 相邻相同标签合并（手动构造碎片化 DOM）',
    initialHTML: '<strong>a</strong><strong>b</strong><strong>c</strong>',
    operation: (adapter, start, end) => adapter.normalize(start, end),
    start: 0,
    end: 3,
    expectedHTML: '<strong>abc</strong>',
    description: '三个相邻 strong 应合并为一个',
  },
  {
    name: '1.2 不同标签不合并',
    initialHTML: '<strong>a</strong><em>b</em><strong>c</strong>',
    operation: (adapter, start, end) => adapter.normalize(start, end),
    start: 0,
    end: 3,
    expectedHTML: '<strong>a</strong><em>b</em><strong>c</strong>',
    description: '不同类型的标签不应合并',
  },
  {
    name: '1.3 文本节点分隔的相同标签不合并',
    initialHTML: '<strong>a</strong>x<strong>b</strong>',
    operation: (adapter, start, end) => adapter.normalize(start, end),
    start: 0,
    end: 3,
    expectedHTML: '<strong>a</strong>x<strong>b</strong>',
    description: '文本节点分隔的相邻标签不应合并（只合并紧邻兄弟）',
  },

  // ==================== 2. 冗余嵌套清理 ====================
  {
    name: '2.1 嵌套的相同标签应合并',
    initialHTML: '<strong><strong>bold</strong></strong>',
    operation: (adapter, start, end) => adapter.normalize(start, end),
    start: 0,
    end: 4,
    expectedHTML: '<strong>bold</strong>',
    description: '冗余嵌套的 strong 应被合并',
  },
  {
    name: '2.2 嵌套的不同标签保留',
    initialHTML: '<strong><em>bold-italic</em></strong>',
    operation: (adapter, start, end) => adapter.normalize(start, end),
    start: 0,
    end: 11,
    expectedHTML: '<strong><em>bold-italic</em></strong>',
    description: '不同类型的嵌套标签应保留',
  },
  {
    name: '2.3 多层冗余嵌套',
    initialHTML: '<strong><strong><strong>deep</strong></strong></strong>',
    operation: (adapter, start, end) => adapter.normalize(start, end),
    start: 0,
    end: 4,
    expectedHTML: '<strong>deep</strong>',
    description: '三层嵌套的 strong 应合并为一个',
  },
  {
    name: '2.4 空标签移除',
    initialHTML: '<strong>text</strong><strong></strong><em>more</em>',
    operation: (adapter, start, end) => adapter.normalize(start, end),
    start: 0,
    end: 8,
    expectedHTML: '<strong>text</strong><em>more</em>',
    description: '空的样式标签应被移除',
  },

  // ==================== 3. 样式覆盖 ====================
  {
    name: '3.1 加粗文本上再加斜体',
    initialHTML: '<strong>hello</strong>',
    operation: (adapter, start, end) => {
      adapter.setStyle(0, 5, 'italic');
    },
    start: 0,
    end: 5,
    expectedHTML: '<strong><em>hello</em></strong>',
    description: 'setStyle 默认 nest 模式，新样式嵌套在已有样式内部',
  },
  {
    name: '3.2 部分覆盖加粗',
    initialHTML: '<strong>hello world</strong>',
    operation: (adapter, start, end) => {
      adapter.setStyle(0, 5, 'italic');
    },
    start: 0,
    end: 5,
    expectedHTML: '<strong><em>hello</em>world</strong>',
    description: 'nest 模式下斜体嵌套在加粗内部',
  },

  // ==================== 4. 样式移除 ====================
  {
    name: '4.1 完全移除样式',
    initialHTML: '<strong>hello</strong>',
    operation: (adapter, start, end) => {
      adapter.removeStyle(0, 5, 'bold');
    },
    start: 0,
    end: 5,
    expectedHTML: 'hello',
    description: '完全移除加粗样式',
  },
  {
    name: '4.2 部分移除样式',
    initialHTML: '<strong>hello</strong>',
    operation: (adapter, start, end) => {
      adapter.removeStyle(0, 3, 'bold');
    },
    start: 0,
    end: 3,
    expectedHTML: 'hel<strong>lo</strong>',
    description: '只移除前半部分的加粗样式',
  },
  {
    name: '4.3 移除不存在的样式不应改变 DOM',
    initialHTML: '<strong>hello</strong>',
    operation: (adapter, start, end) => {
      adapter.removeStyle(0, 5, 'italic');
    },
    start: 0,
    end: 5,
    expectedHTML: '<strong>hello</strong>',
    description: '移除不存在的样式不应改变 DOM',
  },

  // ==================== 5. 多种样式交叉 ====================
  {
    name: '5.1 加粗+斜体交叉区域',
    initialHTML: '<strong><em>bold-italic</em></strong>',
    operation: (adapter, start, end) => {
      adapter.removeStyle(0, 11, 'bold');
    },
    start: 0,
    end: 11,
    expectedHTML: '<em>bold-italic</em>',
    description: '移除加粗后保留斜体',
  },
  {
    name: '5.2 加粗+斜体部分区域移除',
    initialHTML: '<strong><em>abc</em><em>def</em></strong>',
    operation: (adapter, start, end) => {
      adapter.removeStyle(0, 3, 'bold');
    },
    start: 0,
    end: 3,
    expectedHTML: '<em>abc</em><strong><em>def</em></strong>',
    description: '部分区域移除外层加粗，保留内层斜体',
  },

  // ==================== 6. 空范围和边界 ====================
  {
    name: '6.1 空范围应用样式不应改变 DOM',
    initialHTML: 'hello',
    operation: (adapter, start, end) => {
      adapter.setStyle(0, 0, 'bold');
    },
    start: 0,
    end: 0,
    expectedHTML: 'hello',
    description: '空范围不应应用任何样式',
  },
  {
    name: '6.2 起始位置应用样式',
    initialHTML: 'hello world',
    operation: (adapter, start, end) => {
      adapter.setStyle(0, 1, 'bold');
    },
    start: 0,
    end: 1,
    expectedHTML: '<strong>h</strong>elloworld',
    description: '在文档起始位置应用样式',
  },
  {
    name: '6.3 末尾位置应用样式',
    initialHTML: 'hello world',
    operation: (adapter, start, end) => {
      adapter.setStyle(10, 11, 'bold');
    },
    start: 10,
    end: 11,
    expectedHTML: 'hello worl<strong>d</strong>',
    description: '在文档末尾位置应用样式',
  },
  {
    name: '6.4 全选后应用样式',
    initialHTML: 'hello world',
    operation: (adapter, start, end) => {
      adapter.setStyle(0, 11, 'bold');
    },
    start: 0,
    end: 11,
    expectedHTML: '<strong>hello world</strong>',
    description: '全选后应用样式应包裹整个文本',
  },

  // ==================== 7. 跨段落样式 ====================
  {
    name: '7.1 跨段落应用样式',
    initialHTML: 'line1<div>line2</div>line3',
    operation: (adapter, start, end) => {
      adapter.setStyle(0, 18, 'bold');
    },
    start: 0,
    end: 18,
    expectedHTML: '<strong>line1</strong><div><strong>line2</strong></div><strong>line3</strong>',
    description: '跨段落应用样式应在每个块内分别包裹',
  },

  // ==================== 8. 文本操作 + 样式 ====================
  {
    name: '8.1 插入文本后位置不变',
    initialHTML: 'ab',
    operation: (adapter, start, end) => {
      adapter.insertText(1, 'x');
      const text = adapter.getText(0, adapter.getDocumentLength());
      if (text !== 'axb') throw new Error(`Expected "axb", got "${text}"`);
    },
    start: 0,
    end: 2,
    expectedHTML: 'axb',
    description: '在中间插入文本',
  },
  {
    name: '8.2 删除文本',
    initialHTML: 'abc',
    operation: (adapter, start, end) => {
      adapter.delete(1, 2);
    },
    start: 1,
    end: 2,
    expectedHTML: 'ac',
    description: '删除中间字符',
  },
  {
    name: '8.3 替换文本',
    initialHTML: 'abc',
    operation: (adapter, start, end) => {
      adapter.replaceText(0, 3, 'xyz');
    },
    start: 0,
    end: 3,
    expectedHTML: 'xyz',
    description: '替换全部文本',
  },

  // ==================== 9. 带样式的文本操作 ====================
  {
    name: '9.1 删除带样式的文本',
    initialHTML: '<strong>a</strong>b<strong>c</strong>',
    operation: (adapter, start, end) => {
      adapter.delete(1, 2);
    },
    start: 1,
    end: 2,
    expectedHTML: '<strong>a</strong><strong>c</strong>',
    description: 'delete 是底层操作，不自动合并相邻同标签',
  },
  {
    name: '9.2 删除样式文本（跨样式边界）',
    initialHTML: '<strong>a</strong><em>b</em>',
    operation: (adapter, start, end) => {
      adapter.delete(0, 2);
    },
    start: 0,
    end: 2,
    expectedHTML: '<strong></strong><em></em>',
    description: 'delete 删除文本但保留空元素容器',
  },
  {
    name: '9.3 替换带样式的文本',
    initialHTML: '<strong>hello</strong>',
    operation: (adapter, start, end) => {
      adapter.replaceText(0, 3, 'hi');
    },
    start: 0,
    end: 3,
    expectedHTML: '<strong>hilo</strong>',
    description: 'replaceText 在折叠位置插入，strong 标签保留',
  },

  // ==================== 10. getStylesInRange ====================
  {
    name: '10.1 无样式范围返回空集合',
    initialHTML: 'hello',
    operation: (adapter, start, end) => {
      const styles = adapter.getStylesInRange(0, 5);
      if (styles.size !== 0) throw new Error(`Expected empty set, got ${[...styles]}`);
    },
    start: 0,
    end: 5,
    expectedHTML: 'hello',
    description: '无样式的文本范围应返回空集合',
  },
  {
    name: '10.2 加粗范围返回 bold',
    initialHTML: '<strong>hello</strong>',
    operation: (adapter, start, end) => {
      const styles = adapter.getStylesInRange(0, 5);
      if (!styles.has('bold')) throw new Error(`Expected bold in set, got ${[...styles]}`);
    },
    start: 0,
    end: 5,
    expectedHTML: '<strong>hello</strong>',
    description: '加粗范围应返回 bold',
  },
  {
    name: '10.3 多种样式范围返回多个',
    initialHTML: '<strong><em>hi</em></strong>',
    operation: (adapter, start, end) => {
      const styles = adapter.getStylesInRange(0, 2);
      if (!styles.has('bold') || !styles.has('italic')) throw new Error(`Expected bold+italic, got ${[...styles]}`);
    },
    start: 0,
    end: 2,
    expectedHTML: '<strong><em>hi</em></strong>',
    description: '加粗+斜体范围应返回两个样式',
  },
  {
    name: '10.4 部分样式范围只返回匹配的样式',
    initialHTML: '<strong>a</strong><em>b</em>',
    operation: (adapter, start, end) => {
      const styles = adapter.getStylesInRange(0, 1);
      if (!styles.has('bold')) throw new Error(`Expected bold, got ${[...styles]}`);
      if (styles.has('italic')) throw new Error(`Should not have italic, got ${[...styles]}`);
    },
    start: 0,
    end: 1,
    expectedHTML: '<strong>a</strong><em>b</em>',
    description: '只有加粗的部分不应包含斜体',
  },

  // ==================== 11. findText ====================
  {
    name: '11.1 查找简单文本',
    initialHTML: 'hello world hello',
    operation: (adapter, start, end) => {
      const results = adapter.findText('hello');
      if (results.length !== 2) throw new Error(`Expected 2 matches, got ${results.length}`);
      if (results[0].start !== 0 || results[0].end !== 5) throw new Error(`First match wrong: ${JSON.stringify(results[0])}`);
      if (results[1].start !== 12 || results[1].end !== 17) throw new Error(`Second match wrong: ${JSON.stringify(results[1])}`);
    },
    start: 0,
    end: 17,
    expectedHTML: 'hello world hello',
    description: '查找两处匹配的文本',
  },
  {
    name: '11.2 查找不存在的文本',
    initialHTML: 'hello',
    operation: (adapter, start, end) => {
      const results = adapter.findText('xyz');
      if (results.length !== 0) throw new Error(`Expected 0 matches, got ${results.length}`);
    },
    start: 0,
    end: 5,
    expectedHTML: 'hello',
    description: '查找不存在的文本应返回空数组',
  },
  {
    name: '11.3 空搜索文本',
    initialHTML: 'hello',
    operation: (adapter, start, end) => {
      const results = adapter.findText('');
      if (results.length !== 0) throw new Error(`Expected 0 matches for empty string`);
    },
    start: 0,
    end: 5,
    expectedHTML: 'hello',
    description: '搜索空字符串应返回空数组',
  },

  // ==================== 12. wrapElement nest 模式 ====================
  {
    name: '12.1 nest 模式嵌套',
    initialHTML: '<em>text</em>',
    operation: (adapter, start, end) => {
      adapter.wrapElement(0, 4, () => {
        const el = document.createElement('strong');
        el.className = 'wrap-test';
        return el;
      }, { mode: 'nest' });
    },
    start: 0,
    end: 4,
    expectedHTML: '<em><strong class="wrap-test">text</strong></em>',
    description: 'nest 模式应在已有元素内嵌套',
  },

  // ==================== 13. 分片容器修复 ====================
  {
    name: '13.1 fill-gaps 修复分片容器',
    initialHTML: '<div><span class="frag" data-frag-id="1">a</span><span class="frag" data-frag-id="1">c</span></div>',
    operation: (adapter, start, end) => {
      adapter.repairSplitContainers();
    },
    start: 0,
    end: 3,
    expectedHTML: '<div><span class="frag" data-frag-id="1">a</span><span class="frag" data-frag-id="1">c</span></div>',
    description: '分片容器间隙应有 b 介于之间被包裹',
  },

  // ==================== 14. 样式反复切换 ====================
  {
    name: '14.1 反复应用和移除样式',
    initialHTML: 'hello',
    operation: (adapter, start, end) => {
      adapter.setStyle(0, 5, 'bold');
      adapter.normalize(0, 5);
      adapter.removeStyle(0, 5, 'bold');
    },
    start: 0,
    end: 5,
    expectedHTML: 'hello',
    description: '应用加粗后再移除应恢复原文本',
  },
  {
    name: '14.2 切换不同样式',
    initialHTML: 'hello',
    operation: (adapter, start, end) => {
      adapter.setStyle(0, 5, 'bold');
      adapter.removeStyle(0, 5, 'bold');
      adapter.setStyle(0, 5, 'italic');
    },
    start: 0,
    end: 5,
    expectedHTML: '<em>hello</em>',
    description: '从加粗切换到斜体',
  },

  // ==================== 15. 块元素和 BR ====================
  {
    name: '15.1 getBlockElementsInRange 识别 div',
    initialHTML: 'a<div>bc</div>d',
    operation: (adapter, start, end) => {
      const blocks = adapter.getBlockElementsInRange(0, 4);
      if (blocks.length !== 1) throw new Error(`Expected 1 block, got ${blocks.length}`);
      if (blocks[0].tagName.toLowerCase() !== 'div') throw new Error(`Expected div, got ${blocks[0].tagName}`);
    },
    start: 0,
    end: 4,
    expectedHTML: 'a<div>bc</div>d',
    description: '应正确识别块级元素',
  },
  {
    name: '15.2 跨块应用样式保留块结构',
    initialHTML: 'a<div>b</div>c',
    operation: (adapter, start, end) => {
      adapter.setStyle(0, 5, 'bold');
    },
    start: 0,
    end: 5,
    expectedHTML: '<strong>a</strong><div><strong>b</strong></div><strong>c</strong>',
    description: '跨块应用样式后块结构应保留',
  },

  // ==================== 16. 嵌套样式部分移除（processElementForStyleRemoval 修复验证） ====================
  {
    name: '16.1 嵌套 em+strong 全量移除外层',
    initialHTML: '<strong><em>abcd</em></strong>',
    operation: (adapter, start, end) => {
      adapter.removeStyle(0, 4, 'bold');
    },
    start: 0,
    end: 4,
    expectedHTML: '<em>abcd</em>',
    description: '完全移除外层 strong，保留内层 em',
  },
  {
    name: '16.2 嵌套 em+strong 移除中间部分',
    initialHTML: '<strong><em>abcd</em></strong>',
    operation: (adapter, start, end) => {
      adapter.removeStyle(1, 3, 'bold');
    },
    start: 0,
    end: 4,
    expectedHTML: '<strong><em>a</em></strong><em>bc</em><strong><em>d</em></strong>',
    description: '移除中间的 bold，前段和后段保留 strong 和 em',
  },
  {
    name: '16.3 三层嵌套移除最外层',
    initialHTML: '<strong><em><u>text</u></em></strong>',
    operation: (adapter, start, end) => {
      adapter.removeStyle(0, 4, 'bold');
    },
    start: 0,
    end: 4,
    expectedHTML: '<em><u>text</u></em>',
    description: '三层嵌套，移除最外层 strong，保留 em 和 u',
  },
  {
    name: '16.4 三层嵌套移除中间层',
    initialHTML: '<strong><em><u>text</u></em></strong>',
    operation: (adapter, start, end) => {
      adapter.removeStyle(0, 4, 'italic');
    },
    start: 0,
    end: 4,
    expectedHTML: '<strong><u>text</u></strong>',
    description: '三层嵌套，移除中间 em，保留 strong 和 u',
  },

  // ==================== 17. 移除样式后 normalize ====================
  {
    name: '17.1 部分移除后相邻相同标签',
    initialHTML: '<em>a</em><em>b</em>',
    operation: (adapter, start, end) => {
      adapter.removeStyle(0, 1, 'bold');
      adapter.normalize(0, 4);
    },
    start: 0,
    end: 2,
    expectedHTML: '<em>ab</em>',
    description: 'normalize 应合并相邻相同标签',
  },

  // ==================== 18. setStyle 多次叠加 ====================
  {
    name: '18.1 三种样式叠加',
    initialHTML: 'hello',
    operation: (adapter, start, end) => {
      adapter.setStyle(0, 5, 'bold');
      adapter.setStyle(0, 5, 'italic');
      adapter.setStyle(0, 5, 'underline');
    },
    start: 0,
    end: 5,
    expectedHTML: '<strong><em><u>hello</u></em></strong>',
    description: '叠加三种样式应产生三层嵌套',
  },
  {
    name: '18.2 部分区域叠加样式',
    initialHTML: 'abcde',
    operation: (adapter, start, end) => {
      adapter.setStyle(0, 5, 'bold');
      adapter.setStyle(0, 3, 'italic');
    },
    start: 0,
    end: 5,
    expectedHTML: '<strong><em>abc</em>de</strong>',
    description: '部分区域叠加 italic',
  },

  // ==================== 19. 中文和特殊字符 ====================
  {
    name: '19.1 中文文本样式',
    initialHTML: '你好世界',
    operation: (adapter, start, end) => {
      adapter.setStyle(0, 2, 'bold');
    },
    start: 0,
    end: 4,
    expectedHTML: '<strong>你好</strong>世界',
    description: '中文文本加粗前两个字',
  },
  {
    name: '19.2 中文部分移除样式',
    initialHTML: '<strong>你好世界</strong>',
    operation: (adapter, start, end) => {
      adapter.removeStyle(2, 4, 'bold');
    },
    start: 0,
    end: 4,
    expectedHTML: '<strong>你好</strong>世界',
    description: '中文文本移除后半部分加粗',
  },
  {
    name: '19.3 混合中英文查找',
    initialHTML: 'hello你好world',
    operation: (adapter, start, end) => {
      const results = adapter.findText('你好');
      if (results.length !== 1) throw new Error(`Expected 1 match, got ${results.length}`);
      if (results[0].start !== 5 || results[0].end !== 7) throw new Error(`Wrong position: ${JSON.stringify(results[0])}`);
    },
    start: 0,
    end: 12,
    expectedHTML: 'hello你好world',
    description: '在混合文本中查找中文',
  },

  // ==================== 20. 空元素和空白文本 ====================
  {
    name: '20.1 空容器设置样式',
    initialHTML: '<div></div>',
    operation: (adapter, start, end) => {
      adapter.setStyle(0, 0, 'bold');
    },
    start: 0,
    end: 0,
    expectedHTML: '<div></div>',
    description: '空容器不应受样式影响',
  },
  {
    name: '20.2 只有空标签的容器',
    initialHTML: '<strong></strong>',
    operation: (adapter, start, end) => {
      adapter.removeStyle(0, 0, 'bold');
    },
    start: 0,
    end: 0,
    expectedHTML: '',
    description: '空标签在 removeStyle 后应被清理',
  },

  // ==================== 21. 多次连续操作的一致性 ====================
  {
    name: '21.1 连续设置不同样式然后全部移除',
    initialHTML: 'test',
    operation: (adapter, start, end) => {
      adapter.setStyle(0, 4, 'bold');
      adapter.setStyle(0, 4, 'italic');
      adapter.setStyle(0, 4, 'underline');
      adapter.removeStyle(0, 4, 'bold');
      adapter.removeStyle(0, 4, 'italic');
      adapter.removeStyle(0, 4, 'underline');
    },
    start: 0,
    end: 4,
    expectedHTML: 'test',
    description: '叠加三种样式后全部移除应恢复原文本',
  },
  {
    name: '21.2 交叉设置和移除',
    initialHTML: 'abcdef',
    operation: (adapter, start, end) => {
      adapter.setStyle(0, 6, 'bold');
      adapter.removeStyle(2, 4, 'bold');
      adapter.setStyle(2, 4, 'italic');
    },
    start: 0,
    end: 6,
    expectedHTML: '<strong>ab</strong><em>cd</em><strong>ef</strong>',
    description: '全加粗后中间改斜体',
  },
];

// ==================== 执行测试 ====================

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  if (runTest(testCase)) {
    passed++;
  } else {
    failed++;
  }
}

console.log(`\n============================================================`);
console.log(`📊 边界场景测试结果`);
console.log(`============================================================`);
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log(`📈 通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
console.log(`============================================================\n`);
