/**
 * Range 模型单元测试
 *
 * 测试路径: tsx src/__tests__/range.test.ts
 *
 * 验证 Range 模型的核心功能：
 * - 文本操作（insertText, delete, replaceText）
 * - 元素包裹（wrapElement, unwrapElement）
 * - 选区操作（select）
 * - 辅助方法（isEmpty, length, getText）
 */
import { JSDOM } from 'jsdom';
import { DOMRangeAdapter, registerContainerConfig } from '../core/adapters/DOMRangeAdapter.js';
import { Range } from '../core/models/Range.js';

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

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${testName}`);
    failed++;
  }
}

function createEnv(html: string) {
  const container = dom.window.document.createElement('div');
  container.innerHTML = html;
  const adapter = new DOMRangeAdapter({ container });
  return { container, adapter };
}

/* ==================== 1. 基本属性 ==================== */

{
  const { adapter } = createEnv('Hello World');

  /* 1.1 start 和 end 属性 */
  const range = new Range({ start: 0, end: 5, adapter });
  assert(range.start === 0, '1.1 start 属性正确');
  assert(range.end === 5, '1.2 end 属性正确');
}

{
  const { adapter } = createEnv('Hello World');

  /* 1.3 length 属性 */
  const range = new Range({ start: 2, end: 7, adapter });
  assert(range.length === 5, '1.3 length = end - start');
}

{
  const { adapter } = createEnv('Hello');

  /* 1.4 isEmpty 判断 */
  const empty = new Range({ start: 3, end: 3, adapter });
  const nonEmpty = new Range({ start: 0, end: 5, adapter });
  assert(empty.isEmpty() === true, '1.4 start === end 时为空');
  assert(nonEmpty.isEmpty() === false, '1.5 start !== end 时不为空');
}

/* ==================== 2. getText ==================== */

{
  const { adapter } = createEnv('Hello World');

  /* 2.1 获取范围内的文本 */
  const range = new Range({ start: 0, end: 5, adapter });
  assert(range.getText() === 'Hello', '2.1 getText 返回正确文本');
}

{
  const { adapter } = createEnv('Hello World');

  /* 2.2 获取全部文本 */
  const range = new Range({ start: 0, end: 11, adapter });
  assert(range.getText() === 'Hello World', '2.2 getText 全范围');
}

/* ==================== 3. insertText ==================== */

{
  const { adapter } = createEnv('Hello World');

  /* 3.1 在起始位置插入 */
  const range = new Range({ start: 0, end: 0, adapter });
  range.insertText('XX');
  assert(adapter.getText(0, 13) === 'XXHello World', '3.1 在开头插入文本');
}

{
  const { container: _container, adapter } = createEnv('Hello World');

  /* 3.2 在中间位置插入 */
  const range = new Range({ start: 5, end: 5, adapter });
  range.insertText(' ');
  assert(adapter.getText(5, 6) === ' ', '3.2 在中间位置插入');
}

/* ==================== 4. delete ==================== */

{
  const { adapter } = createEnv('Hello World');

  /* 4.1 删除部分文本 */
  const range = new Range({ start: 5, end: 11, adapter });
  range.delete();
  assert(adapter.getText(0, 5) === 'Hello', '4.1 删除后剩余文本正确');
  assert(adapter.getDocumentLength() === 5, '4.2 文档长度正确');
}

{
  const { adapter } = createEnv('Hello');

  /* 4.3 删除全部文本 */
  const range = new Range({ start: 0, end: 5, adapter });
  range.delete();
  assert(adapter.getDocumentLength() === 0, '4.3 删除全部后长度为 0');
}

/* ==================== 5. replaceText ==================== */

{
  const { adapter } = createEnv('Hello World');

  /* 5.1 替换部分文本 */
  const range = new Range({ start: 6, end: 11, adapter });
  range.replaceText('There');
  assert(adapter.getText(0, 11) === 'Hello There', '5.1 替换后文本正确');
}

{
  const { adapter } = createEnv('Hello');

  /* 5.2 替换为空（等同于删除） */
  const range = new Range({ start: 2, end: 5, adapter });
  range.replaceText('');
  assert(adapter.getText(0, 2) === 'He', '5.2 替换为空等于删除');
}

/* ==================== 6. wrapElement ==================== */

{
  const { container, adapter } = createEnv('Hello World');

  /* 6.1 包裹选区 */
  const range = new Range({ start: 0, end: 5, adapter });
  range.wrapElement(() => adapter.createConfigElement('bold'));
  assert(container.querySelector('strong') !== null, '6.1 wrapElement 创建包裹元素');
  assert(container.querySelector('strong')!.textContent === 'Hello', '6.2 包裹文本正确');
}

/* ==================== 7. unwrapElement ==================== */

{
  const { container, adapter } = createEnv('<strong>Hello</strong> World');

  /* 7.1 解包元素 */
  const range = new Range({ start: 0, end: 5, adapter });
  range.unwrapElement('strong');
  assert(container.querySelector('strong') === null, '7.1 unwrapElement 移除 strong');
  assert(container.textContent?.includes('Hello'), '7.2 解包后文本保留');
}

/* ==================== 8. toString ==================== */

{
  const { adapter } = createEnv('Hello World');

  /* 8.1 toString 表示 */
  const range = new Range({ start: 2, end: 7, adapter });
  assert(range.toString() === 'Range(2, 7)', '8.1 toString 格式正确');
}

/* ==================== 9. 多段落场景 ==================== */

{
  const { adapter } = createEnv('<p>Hello</p><p>World</p>');

  /* 9.1 跨段落文本 */
  const range = new Range({ start: 0, end: 11, adapter });
  assert(range.getText() === 'Hello\nWorld', '9.1 跨段落 getText 包含换行');

  /* 9.2 跨段落长度 */
  assert(range.length === 11, '9.2 跨段落 length 包含换行符');
}

/* ==================== 结果 ==================== */

console.log('\n' + '='.repeat(60));
console.log('📊 测试结果汇总');
console.log('='.repeat(60));
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log(`📈 通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
