/**
 * DOMRangeAdapter 综合测试套件
 */
import { JSDOM } from 'jsdom';
import { DOMRangeAdapter, registerContainerConfig } from '../core/adapters/DOMRangeAdapter.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
});

global.window = dom.window as any;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.Text = dom.window.Text;
global.Range = dom.window.Range;
global.NodeFilter = dom.window.NodeFilter;

/* 注册标准样式配置 */
registerContainerConfig('bold', { tagName: 'strong', display: 'inline' });
registerContainerConfig('italic', { tagName: 'em', display: 'inline' });
registerContainerConfig('underline', { tagName: 'u', display: 'inline' });
registerContainerConfig('strikethrough', { tagName: 's', display: 'inline' });
registerContainerConfig('highlight', { tagName: 'mark', display: 'inline' });

/* 注册 mergeAdjacent 测试配置 */
registerContainerConfig('test-merge-yes', {
  tagName: 'span', attributeSelector: '.test-merge-yes',
  idAttribute: 'data-test-id', mergeAdjacent: true,
});
registerContainerConfig('test-merge-no', {
  tagName: 'span', attributeSelector: '.test-merge-no',
  idAttribute: 'data-test-id',
});

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
    console.log(`   错误: ${error.message}`);
    return false;
  }
}

// 测试用例定义
const testCases: TestCase[] = [
  // ==================== 基础样式操作 ====================
  {
    name: 'Test 1.1',
    initialHTML: '12345',
    operation: (adapter, start, end) => adapter.applyConfig(start, end, 'bold'),
    start: 1,
    end: 4,
    expectedHTML: '1<strong>234</strong>5',
    description: '对 "234" 应用加粗'
  },

  {
    name: 'Test 1.2',
    initialHTML: '12345',
    operation: (adapter, start, end) => adapter.removeConfig(start, end, 'bold'),
    start: 0,
    end: 0,
    expectedHTML: '12345',
    description: '移除不存在的样式'
  },

  // ==================== 标签分割和部分移除 ====================
  {
    name: 'Test 2.1',
    initialHTML: '<strong>12345</strong>',
    operation: (adapter, start, end) => adapter.removeConfig(start, end, 'bold'),
    start: 1,
    end: 4,
    expectedHTML: '<strong>1</strong>234<strong>5</strong>',
    description: '部分移除样式 (核心测试)'
  },

  {
    name: 'Test 2.2',
    initialHTML: '<strong>12345</strong>',
    operation: (adapter, start, end) => adapter.removeConfig(start, end, 'bold'),
    start: 0,
    end: 3,
    expectedHTML: '123<strong>45</strong>',
    description: '从开头部分移除样式'
  },

  {
    name: 'Test 2.3',
    initialHTML: '<strong>12345</strong>',
    operation: (adapter, start, end) => adapter.removeConfig(start, end, 'bold'),
    start: 2,
    end: 5,
    expectedHTML: '<strong>12</strong>345',
    description: '移除到结尾的样式'
  },

  // ==================== 规范化操作 ====================
  {
    name: 'Test 3.1',
    initialHTML: '<strong><strong>text</strong></strong>',
    operation: (adapter, start, end) => adapter.normalize(start, end),
    start: 0,
    end: 4,
    expectedHTML: '<strong>text</strong>',
    description: '移除冗余的嵌套标签'
  },

  {
    name: 'Test 3.1.1',
    initialHTML: '<strong><strong><strong>text</strong></strong></strong>',
    operation: (adapter, start, end) => adapter.normalize(start, end),
    start: 0,
    end: 4,
    expectedHTML: '<strong>text</strong>',
    description: '三层嵌套标签应展平为一层'
  },

  {
    name: 'Test 3.2',
    initialHTML: '<strong>12</strong><strong>34</strong>',
    operation: (adapter, start, end) => adapter.normalize(start, end),
    start: 0,
    end: 4,
    expectedHTML: '<strong>1234</strong>',
    description: '相邻的相同标签应该合并为一个'
  },

  {
    name: 'Test 3.3',
    initialHTML: '<strong></strong>',
    operation: (adapter, start, end) => adapter.normalize(start, end),
    start: 0,
    end: 0,
    expectedHTML: '',
    description: '移除空标签'
  },

  {
    name: 'Test 3.4',
    initialHTML: '<strong><em>text</em></strong>',
    operation: (adapter, start, end) => adapter.normalize(start, end),
    start: 0,
    end: 4,
    expectedHTML: '<strong><em>text</em></strong>',
    description: '不同标签的嵌套应该保留'
  },

  {
    name: 'Test 4.1',
    initialHTML: '<strong>a</strong>b<strong>c</strong>d<strong>e</strong>',
    operation: (adapter, start, end) => adapter.normalize(start, end),
    start: 0,
    end: 5,
    expectedHTML: '<strong>a</strong>b<strong>c</strong>d<strong>e</strong>',
    description: '不连续的相同标签不应该合并'
  },

  // ==================== 嵌套样式 ====================
  {
    name: 'Test 5.1',
    initialHTML: '1234',
    operation: (adapter, start, end) => {
      adapter.applyConfig(0, 4, 'bold');
      adapter.applyConfig(1, 3, 'italic');
    },
    start: 0,
    end: 0,
    expectedHTML: '<strong>1<em>23</em>4</strong>',
    description: '嵌套样式应用'
  },

  // ==================== 文本操作 ====================
  {
    name: 'Test 6.1',
    initialHTML: '12345',
    operation: (adapter, start, end) => adapter.insertText(2, 'abc'),
    start: 0,
    end: 0,
    expectedHTML: '12abc345',
    description: '在位置 2 插入文本'
  },

  {
    name: 'Test 6.2',
    initialHTML: '12345',
    operation: (adapter, start, end) => adapter.delete(1, 4),
    start: 0,
    end: 0,
    expectedHTML: '15',
    description: '删除位置 1-4 的文本'
  },

  {
    name: 'Test 6.3',
    initialHTML: '12345',
    operation: (adapter, start, end) => adapter.replaceText(1, 4, 'abc'),
    start: 0,
    end: 0,
    expectedHTML: '1abc5',
    description: '替换文本'
  },

  // ==================== 多样式组合 ====================
  {
    name: 'Test 7.1',
    initialHTML: '1234',
    operation: (adapter, start, end) => {
      adapter.applyConfig(0, 3, 'bold');
      adapter.applyConfig(1, 4, 'italic');
    },
    start: 0,
    end: 0,
    expectedHTML: '<strong>1</strong><em><strong>23</strong>4</em>',
    description: '两个重叠的样式操作'
  },

  {
    name: 'Test 7.2',
    initialHTML: '1234',
    operation: (adapter, start, end) => {
      adapter.applyConfig(0, 4, 'bold');
      adapter.applyConfig(0, 4, 'italic');
    },
    start: 0,
    end: 0,
    expectedHTML: '<strong><em>1234</em></strong>',
    description: '对同一范围应用多种样式'
  },

  {
    name: 'Test 7.3',
    initialHTML: '<strong><em>1234</em></strong>',
    operation: (adapter, start, end) => adapter.removeConfig(0, 4, 'bold'),
    start: 0,
    end: 4,
    expectedHTML: '<em>1234</em>',
    description: '移除外层样式，保留内层样式'
  },

  // ==================== 边界情况 ====================
  {
    name: 'Test 8.1',
    initialHTML: '',
    operation: (adapter, start, end) => adapter.insertText(0, 'text'),
    start: 0,
    end: 0,
    expectedHTML: 'text',
    description: '在空文档中插入文本'
  },

  {
    name: 'Test 8.2',
    initialHTML: 'text',
    operation: (adapter, start, end) => adapter.applyConfig(0, 4, 'bold'),
    start: 0,
    end: 4,
    expectedHTML: '<strong>text</strong>',
    description: '对全部文本应用样式'
  },

  {
    name: 'Test 8.3',
    initialHTML: '<strong>text</strong>',
    operation: (adapter, start, end) => adapter.removeConfig(0, 4, 'bold'),
    start: 0,
    end: 4,
    expectedHTML: 'text',
    description: '移除全部样式'
  },

  {
    name: 'Test 8.4',
    initialHTML: 'ab',
    operation: (adapter, start, end) => adapter.applyConfig(0, 1, 'bold'),
    start: 0,
    end: 1,
    expectedHTML: '<strong>a</strong>b',
    description: '对单个字符应用样式'
  },

  {
    name: 'Test 8.5',
    initialHTML: '<strong>a</strong>',
    operation: (adapter, start, end) => adapter.applyConfig(0, 1, 'italic'),
    start: 0,
    end: 1,
    expectedHTML: '<strong><em>a</em></strong>',
    description: '对已有样式文本应用新样式'
  },

  // ==================== 复杂嵌套 ====================
  {
    name: 'Test 9.1',
    initialHTML: '<strong><em><u>text</u></em></strong>',
    operation: (adapter, start, end) => adapter.removeConfig(0, 4, 'italic'),
    start: 0,
    end: 4,
    expectedHTML: '<strong><u>text</u></strong>',
    description: '从三层嵌套中移除中间层'
  },

  {
    name: 'Test 9.2',
    initialHTML: 'text',
    operation: (adapter, start, end) => {
      adapter.applyConfig(0, 4, 'bold');
      adapter.applyConfig(0, 4, 'italic');
      adapter.applyConfig(0, 4, 'underline');
    },
    start: 0,
    end: 0,
    expectedHTML: '<strong><em><u>text</u></em></strong>',
    description: '应用三种样式'
  },

  // ==================== 文本编辑 ====================
  {
    name: 'Test 10.1',
    initialHTML: '<strong>123</strong>',
    operation: (adapter, start, end) => adapter.insertText(3, '4'),
    start: 0,
    end: 0,
    expectedHTML: '<strong>1234</strong>',
    description: '在样式文本末尾插入 (自然继承容器)'
  },

  {
    name: 'Test 10.2',
    initialHTML: '<strong>234</strong>',
    operation: (adapter, start, end) => adapter.insertText(0, '1'),
    start: 0,
    end: 0,
    expectedHTML: '<strong>1234</strong>',
    description: '在样式文本前面插入 (自然继承容器)'
  },

  {
    name: 'Test 10.3',
    initialHTML: '<strong>14</strong>',
    operation: (adapter, start, end) => adapter.insertText(1, '23'),
    start: 0,
    end: 0,
    expectedHTML: '<strong>1234</strong>',
    description: '在样式文本中间插入'
  },

  {
    name: 'Test 10.4',
    initialHTML: '<strong>12345</strong>',
    operation: (adapter, start, end) => adapter.delete(1, 4),
    start: 0,
    end: 0,
    expectedHTML: '<strong>15</strong>',
    description: '删除样式文本的中间部分'
  },

  // ==================== 换行处理 ====================
  {
    name: 'Test 11.1',
    initialHTML: 'line1<br>line2',
    operation: (adapter, start, end) => adapter.applyConfig(0, 5, 'bold'),
    start: 0,
    end: 5,
    expectedHTML: '<strong>line1</strong><br>line2',
    description: '对包含换行的文本应用样式'
  },

  {
    name: 'Test 11.2',
    initialHTML: '<strong>line1</strong><br><strong>line2</strong>',
    operation: (adapter, start, end) => adapter.applyConfig(0, 11, 'italic'),
    start: 0,
    end: 11,
    expectedHTML: '<em><strong>line1</strong></em><br><em><strong>line2</strong></em>',
    description: '跨换行应用样式（<br> 贡献虚拟 \\n，总长 11）'
  },

  // ==================== Unicode/Emoji ====================
  {
    name: 'Test 12.1',
    initialHTML: '1😀2',
    operation: (adapter, start, end) => adapter.applyConfig(1, 2, 'bold'),
    start: 0,
    end: 3,
    expectedHTML: '1<strong>😀</strong>2',
    description: '对 emoji 应用样式'
  },

  {
    name: 'Test 12.2',
    initialHTML: '这是一段测试文本',
    operation: (adapter, start, end) => adapter.applyConfig(2, 6, 'bold'),
    start: 0,
    end: 8,
    expectedHTML: '这是<strong>一段测试</strong>文本',
    description: '对中文文本应用样式'
  },

  // ==================== 连续操作 ====================
  {
    name: 'Test 13.1',
    initialHTML: '1234',
    operation: (adapter, start, end) => {
      adapter.applyConfig(start, end, 'bold');
      adapter.applyConfig(start, end, 'italic');
      adapter.applyConfig(start, end, 'underline');
    },
    start: 1,
    end: 3,
    expectedHTML: '1<strong><em><u>23</u></em></strong>4',
    description: '连续应用三种样式'
  },

  {
    name: 'Test 13.2',
    initialHTML: '1234',
    operation: (adapter, start, end) => {
      adapter.applyConfig(start, end, 'bold');
      adapter.removeConfig(start, end, 'bold');
    },
    start: 1,
    end: 3,
    expectedHTML: '1234',
    description: '应用样式后立即移除'
  },

  {
    name: 'Test 13.3',
    initialHTML: '1234',
    operation: (adapter, start, end) => {
      adapter.applyConfig(0, 3, 'bold');
      adapter.applyConfig(2, 4, 'italic');
    },
    start: 0,
    end: 0,
    expectedHTML: '<strong>12</strong><em><strong>3</strong>4</em>',
    description: '两个重叠的样式操作'
  },

  // ==================== 复杂DOM结构场景 ====================
  {
    name: 'Test 14.1',
    initialHTML: '<strong>a</strong>b<strong>c</strong>',
    operation: (adapter, start, end) => adapter.applyConfig(0, 3, 'italic'),
    start: 0,
    end: 3,
    expectedHTML: '<em><strong>a</strong>b<strong>c</strong></em>',
    description: '对跨多个节点的文本应用样式'
  },

  {
    name: 'Test 14.2',
    initialHTML: '12<strong>34</strong>56',
    operation: (adapter, start, end) => adapter.applyConfig(1, 5, 'italic'),
    start: 0,
    end: 0,
    expectedHTML: '1<em>2<strong>34</strong>5</em>6',
    description: '样式跨越已有样式边界'
  },

  // ==================== 段落和块级元素场景 ====================
  {
    name: 'Test 15.1',
    initialHTML: '<p>123</p><p>456</p>',
    operation: (adapter, start, end) => adapter.applyConfig(2, 5, 'bold'),
    start: 0,
    end: 0,
    expectedHTML: '<p>12<strong>3</strong></p><p><strong>4</strong>56</p>',
    description: '跨段落操作（虚拟 \\n 在位置 3，"3\\n4" = 位置 2-5）'
  },

  {
    name: 'Test 15.2',
    initialHTML: '<div>123</div><div>456</div>',
    operation: (adapter, start, end) => adapter.applyConfig(2, 5, 'italic'),
    start: 0,
    end: 0,
    expectedHTML: '<div>12<em>3</em></div><div><em>4</em>56</div>',
    description: '跨 div 块级元素操作（虚拟 \\n 在位置 3，"3\\n4" = 位置 2-5）'
  },

  // ==================== 复杂样式移除场景 ====================
  {
    name: 'Test 16.1',
    initialHTML: '<strong>1234</strong>',
    operation: (adapter, start, end) => adapter.removeConfig(0, 4, 'bold'),
    start: 0,
    end: 4,
    expectedHTML: '1234',
    description: '完全移除样式'
  },

  {
    name: 'Test 16.2',
    initialHTML: '<strong><em>1234</em></strong>',
    operation: (adapter, start, end) => adapter.removeConfig(1, 3, 'bold'),
    start: 0,
    end: 4,
    expectedHTML: '<strong><em>1</em></strong><em>23</em><strong><em>4</em></strong>',
    description: '部分移除外层样式，保留内层样式，前段和后段保留外层样式'
  },

  // ==================== 真实用户场景 ====================
  {
    name: 'Test 17.1',
    initialHTML: '这是一段测试文本',
    operation: (adapter, start, end) => adapter.applyConfig(2, 6, 'bold'),
    start: 0,
    end: 8,
    expectedHTML: '这是<strong>一段测试</strong>文本',
    description: '中文文本样式应用'
  },

  {
    name: 'Test 17.2',
    initialHTML: 'Hello World',
    operation: (adapter, start, end) => adapter.applyConfig(6, 11, 'italic'),
    start: 0,
    end: 11,
    expectedHTML: 'Hello <em>World</em>',
    description: '英文单词样式应用'
  },

  // ==================== 错误处理 ====================
  {
    name: 'Test 18.1',
    initialHTML: '1234',
    operation: (adapter, start, end) => adapter.applyConfig(10, 15, 'bold'),
    start: 0,
    end: 0,
    expectedHTML: '1234',
    description: '超出范围的样式应用应该不报错'
  },

  {
    name: 'Test 18.2',
    initialHTML: '1234',
    operation: (adapter, start, end) => adapter.applyConfig(3, 1, 'italic'),
    start: 0,
    end: 0,
    expectedHTML: '1<em>23</em>4',
    description: '反向范围 (start > end) 应该自动纠正'
  },

  // ==================== 链接操作 ====================
  {
    name: 'Test 19.1',
    initialHTML: '<a href="#">link</a>',
    operation: (adapter, start, end) => adapter.applyConfig(0, 4, 'bold'),
    start: 0,
    end: 4,
    expectedHTML: '<a href="#"><strong>link</strong></a>',
    description: '在链接内应用样式'
  },

  {
    name: 'Test 19.2',
    initialHTML: 'text',
    operation: (adapter, start, end) => adapter.insertText(2, '<a href="#">link</a>'),
    start: 0,
    end: 0,
    expectedHTML: 'te&lt;a href="#"&gt;link&lt;/a&gt;xt',
    description: '插入文本 (HTML会被转义)'
  },

  // ==================== 性能测试 ====================
  {
    name: 'Test 20.1',
    initialHTML: 'a'.repeat(100) + '中间' + 'b'.repeat(100),
    operation: (adapter, start, end) => adapter.applyConfig(99, 101, 'bold'),
    start: 0,
    end: 0,
    expectedHTML: 'a'.repeat(99) + '<strong>a中</strong>' + '间' + 'b'.repeat(100),
    description: '长文本中的样式操作 (202字符)'
  },

  {
    name: 'Test 20.2',
    initialHTML: Array.from({ length: 50 }, (_, i) => `<strong>${i}</strong>`).join(''),
    operation: (adapter, start, end) => adapter.normalize(0, 50),
    start: 0,
    end: 0,
    expectedHTML: '<strong>' + Array.from({ length: 50 }, (_, i) => i).join('') + '</strong>',
    description: '大量相邻标签的规范化 (50个标签会合并为1个)'
  },

  // ==================== 深层嵌套 ====================
  {
    name: 'Test 21.1',
    initialHTML: '<strong><em><u><s>text</s></u></em></strong>',
    operation: (adapter, start, end) => adapter.removeConfig(start, end, 'underline'),
    start: 0,
    end: 4,
    expectedHTML: '<strong><em><s>text</s></em></strong>',
    description: '从四层嵌套中移除第三层'
  },

  {
    name: 'Test 21.2',
    initialHTML: '<strong>1234</strong>',
    operation: (adapter, start, end) => {
      adapter.removeConfig(0, 4, 'bold');
      adapter.applyConfig(0, 4, 'italic');
    },
    start: 0,
    end: 0,
    expectedHTML: '<em>1234</em>',
    description: '移除样式后立即应用其他样式'
  },

  // ==================== 真实编辑场景 ====================
  {
    name: 'Test 22.1',
    initialHTML: '',
    operation: (adapter, start, end) => {
      adapter.insertText(0, 'H');
      adapter.applyConfig(0, 1, 'bold');
      adapter.insertText(1, 'e');
      adapter.insertText(2, 'l');
      adapter.insertText(3, 'l');
      adapter.insertText(4, 'o');
    },
    start: 0,
    end: 0,
    expectedHTML: '<strong>Hello</strong>',
    description: '模拟开启样式后逐字输入'
  },

  {
    name: 'Test 22.2',
    initialHTML: '<strong>123456</strong>',
    operation: (adapter, start, end) => {
      adapter.insertText(3, '-');
    },
    start: 0,
    end: 0,
    expectedHTML: '<strong>123-456</strong>',
    description: '在样式文本中间插入内容'
  },

  // ==================== 查找和替换场景 ====================
  {
    name: 'Test 23.1',
    initialHTML: 'test test test',
    operation: (adapter, start, end) => {
      const matches = adapter.findText('test');
      matches.forEach(({ start: s, end: e }) => {
        adapter.applyConfig(s, e, 'bold');
      });
    },
    start: 0,
    end: 0,
    expectedHTML: '<strong>test</strong> <strong>test</strong> <strong>test</strong>',
    description: '查找并格式化所有匹配项'
  },

  {
    name: 'Test 23.2',
    initialHTML: 'replace this part',
    operation: (adapter, start, end) => adapter.replaceText(8, 12, 'TEXT'),
    start: 0,
    end: 0,
    expectedHTML: 'replace TEXT part',
    description: '查找并替换文本'
  },

  // ==================== 反复操作后的规范化 ====================
  {
    name: 'Test 24.1',
    initialHTML: '12345',
    operation: (adapter) => {
      adapter.applyConfig(0, 5, 'bold');
      adapter.removeConfig(1, 4, 'bold');
      adapter.applyConfig(0, 5, 'bold');
    },
    start: 0,
    end: 0,
    expectedHTML: '<strong>12345</strong>',
    description: '反复添加移除容器后应规范化'
  },
  {
    name: 'Test 24.2',
    initialHTML: 'abcde',
    operation: (adapter) => {
      // 多次拆分后重新应用
      adapter.applyConfig(0, 5, 'italic');
      adapter.removeConfig(2, 3, 'italic');
      adapter.removeConfig(0, 1, 'italic');
      adapter.applyConfig(0, 5, 'italic');
    },
    start: 0,
    end: 0,
    expectedHTML: '<em>abcde</em>',
    description: '多次拆分后重新应用容器应合并'
  },
  {
    name: 'Test 24.3',
    initialHTML: '12345',
    operation: (adapter) => {
      // 添加两种容器，移除一种，再添加回来
      adapter.applyConfig(0, 5, 'bold');
      adapter.applyConfig(0, 5, 'italic');
      adapter.removeConfig(0, 5, 'bold');
      adapter.applyConfig(0, 5, 'bold');
    },
    start: 0,
    end: 0,
    expectedHTML: '<em><strong>12345</strong></em>',
    description: '多层容器反复操作后应规范化'
  },
  {
    name: 'Test 24.4',
    initialHTML: 'hello world',
    operation: (adapter) => {
      // 部分移除后重新应用全部
      adapter.applyConfig(0, 11, 'bold');
      adapter.removeConfig(5, 6, 'bold');
      adapter.applyConfig(0, 11, 'bold');
    },
    start: 0,
    end: 0,
    expectedHTML: '<strong>hello world</strong>',
    description: '移除空格处容器后重新应用应合并'
  },

  // ==================== mergeAdjacent 容器合并 ====================
  {
    name: 'Test 25.1',
    initialHTML: '<span class="test-merge-yes" data-test-id="id-1">ab</span><span class="test-merge-yes" data-test-id="id-2">cd</span><span class="test-merge-yes" data-test-id="id-3">ef</span>',
    operation: (adapter, start, end) => adapter.normalize(start, end),
    start: 0,
    end: 6,
    expectedHTML: '<span class="test-merge-yes" data-test-id="id-1">abcdef</span>',
    description: 'mergeAdjacent: true 时，不同 ID 的相邻容器应合并（保留第一个 ID）'
  },
  {
    name: 'Test 25.2',
    initialHTML: '<span class="test-merge-no" data-test-id="id-1">ab</span><span class="test-merge-no" data-test-id="id-2">cd</span>',
    operation: (adapter, start, end) => adapter.normalize(start, end),
    start: 0,
    end: 4,
    expectedHTML: '<span class="test-merge-no" data-test-id="id-1">ab</span><span class="test-merge-no" data-test-id="id-2">cd</span>',
    description: 'mergeAdjacent: false (默认) 时，不同 ID 的相邻容器不应合并'
  },
  {
    name: 'Test 25.3',
    initialHTML: '<span class="test-merge-no" data-test-id="id-1">ab</span><span class="test-merge-no" data-test-id="id-1">cd</span>',
    operation: (adapter, start, end) => adapter.normalize(start, end),
    start: 0,
    end: 4,
    expectedHTML: '<span class="test-merge-no" data-test-id="id-1">abcd</span>',
    description: 'mergeAdjacent: false 时，相同 ID 的相邻容器仍应合并'
  },
  {
    name: 'Test 25.4',
    initialHTML: '<span class="test-merge-yes" data-test-id="id-1">ab</span>x<span class="test-merge-yes" data-test-id="id-2">cd</span>',
    operation: (adapter, start, end) => adapter.normalize(start, end),
    start: 0,
    end: 5,
    expectedHTML: '<span class="test-merge-yes" data-test-id="id-1">ab</span>x<span class="test-merge-yes" data-test-id="id-2">cd</span>',
    description: 'mergeAdjacent: true 时，不连续的容器不应合并'
  },
];

// 运行测试
console.log('🧪 开始运行 DOMRangeAdapter 测试...\n');
console.log('📋 运行测试用例...\n');

let passCount = 0;
let failCount = 0;
const failedTests: string[] = [];

const startTime = Date.now();

for (const testCase of testCases) {
  const passed = runTest(testCase);
  if (passed) {
    passCount++;
    console.log(`✅ PASS: ${testCase.name}`);
  } else {
    failCount++;
    failedTests.push(testCase.name);
  }
}

const endTime = Date.now();
const duration = ((endTime - startTime) / 1000).toFixed(2);

console.log('\n' + '='.repeat(60));
console.log('📊 测试结果汇总');
console.log('='.repeat(60));
console.log(`✅ 通过: ${passCount}`);
console.log(`❌ 失败: ${failCount}`);
console.log(`📈 通过率: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);
console.log(`⏱️  耗时: ${duration}秒`);
console.log('='.repeat(60));

if (failedTests.length > 0) {
  console.log('\n❌ 失败的测试:');
  failedTests.forEach(name => console.log(`   - ${name}`));
}

process.exit(failCount > 0 ? 1 : 0);
