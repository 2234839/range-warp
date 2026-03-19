/**
 * getText 用户直觉测试套件
 *
 * 核心原则：视觉上看到几个换行就是几个换行
 *
 * 测试路径: tsx src/__tests__/gettext.test.ts
 */
import { JSDOM } from 'jsdom';
import { DOMRangeAdapter } from '../core/adapters/DOMRangeAdapter.js';
import { getUnicodeStringLength } from '../core/utils.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
});
global.window = dom.window as any;
global.document = dom.window.document as any;
global.HTMLElement = dom.window.HTMLElement as any;
global.Element = dom.window.Element as any;
global.Node = dom.window.Node as any;
global.Text = dom.window.Text as any;
global.Range = dom.window.Range as any;
global.NodeFilter = dom.window.NodeFilter as any;

let passed = 0;
let failed = 0;

/**
 * 创建 adapter 并获取文本
 */
function createAndTest(html: string): DOMRangeAdapter {
  const container = dom.window.document.createElement('div');
  container.innerHTML = html;
  return new DOMRangeAdapter({ container });
}

/**
 * 断言 getText 结果
 */
function assertGetText(
  label: string,
  html: string,
  start: number,
  end: number,
  expected: string,
) {
  const adapter = createAndTest(html);
  const actual = adapter.getText(start, end);
  if (actual === expected) {
    console.log(`  \u2705 ${label}`);
    passed++;
  } else {
    console.log(`  \u274c ${label}`);
    console.log(`     HTML:    ${html}`);
    console.log(`     Range:   [${start}, ${end}]`);
    console.log(`     Expected: ${JSON.stringify(expected)}`);
    console.log(`     Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

/**
 * 断言 getDocumentLength
 */
function assertLength(
  label: string,
  html: string,
  expected: number,
) {
  const adapter = createAndTest(html);
  const actual = adapter.getDocumentLength();
  if (actual === expected) {
    console.log(`  \u2705 ${label}`);
    passed++;
  } else {
    console.log(`  \u274c ${label}`);
    console.log(`     HTML:    ${html}`);
    console.log(`     Expected: ${expected}`);
    console.log(`     Actual:   ${actual}`);
    failed++;
  }
}

/**
 * 同时断言 documentLength 和全文 getText
 */
function assertFullText(
  label: string,
  html: string,
  expectedText: string,
) {
  const adapter = createAndTest(html);
  const len = adapter.getDocumentLength();
  const text = adapter.getText(0, len);

  if (text === expectedText && len === getUnicodeStringLength(expectedText)) {
    console.log(`  \u2705 ${label}`);
    passed++;
  } else {
    console.log(`  \u274c ${label}`);
    console.log(`     HTML:      ${html}`);
    console.log(`     Expected:  len=${expectedText.length} ${JSON.stringify(expectedText)}`);
    console.log(`     Actual:    len=${len} ${JSON.stringify(text)}`);
    failed++;
  }
}

console.log('=== 1. 基础单段落 ===');
console.log('视觉: 用户看到一行文本，末尾有一个换行');

assertFullText('1.1 简单文本', '<p>Hello</p>', 'Hello\n');
assertFullText('1.2 带样式文本', '<p><strong>bold</strong> text</p>', 'bold text\n');
assertFullText('1.3 多层嵌套样式', '<p><em><strong>deep</strong></em></p>', 'deep\n');

console.log('\n=== 2. 空段落 ===');
console.log('视觉: 用户看到一个空行');

assertFullText('2.1 空段落', '<p></p>', '\n');
assertFullText('2.2 空段落之间', '<p>A</p><p></p><p>B</p>', 'A\n\nB\n');

console.log('\n=== 3. 多段落 ===');
console.log('视觉: 每段一行，段间一个换行');

assertFullText('3.1 两段', '<p>first</p><p>second</p>', 'first\nsecond\n');
assertFullText('3.2 三段', '<p>A</p><p>B</p><p>C</p>', 'A\nB\nC\n');
assertFullText('3.3 中文段落', '<p>你好</p><p>世界</p>', '\u4f60\u597d\n\u4e16\u754c\n');

console.log('\n=== 4. br 换行 ===');
console.log('视觉: br 就是一个换行，和回车一样');

assertFullText('4.1 单个 br', 'Hello<br>World', 'Hello\nWorld');
assertFullText('4.2 段落内 br', '<p>Hello<br>World</p>', 'Hello\nWorld\n');
assertFullText('4.3 多个 br', '<p>A<br>B<br>C</p>', 'A\nB\nC\n');
assertFullText('4.4 空段落(br)', '<p><br></p>', '\n');
assertFullText('4.5 两个 br 的空段落', '<p><br><br></p>', '\n\n');

console.log('\n=== 5. 段落间插入空行 ===');
console.log('视觉: 段落之间加一个空段落就是一个空行');

assertFullText('5.1 段落+空br+段落', '<p>abc</p><p><br></p><p>def</p>', 'abc\n\ndef\n');
assertFullText('5.2 段落+两个空br+段落', '<p>abc</p><p><br></p><p><br></p><p>def</p>', 'abc\n\n\ndef\n');

console.log('\n=== 6. 嵌套块结构 ===');
console.log('视觉: 容器块不产生额外换行');

assertFullText('6.1 div 包含 p', '<div><p>content</p></div>', 'content\n');
assertFullText('6.2 div 包含多 p', '<div><p>A</p><p>B</p></div>', 'A\nB\n');
assertFullText('6.3 section 嵌套 div 嵌套 p', '<section><div><p>deep</p></div></section>', 'deep\n');

console.log('\n=== 7. 标题和列表 ===');
console.log('视觉: 每个块级元素占一行');

assertFullText('7.1 h1 + p', '<h1>Title</h1><p>Body</p>', 'Title\nBody\n');
assertFullText('7.2 列表', '<ul><li>item1</li><li>item2</li></ul>', 'item1\nitem2\n');
assertFullText('7.3 blockquote', '<blockquote>quote</blockquote><p>text</p>', 'quote\ntext\n');

console.log('\n=== 8. 子范围提取 ===');
console.log('原则: 按位置精确切片，换行符占一个位置');

const cases8 = dom.window.document.createElement('div');
cases8.innerHTML = '<p>Hello<br>World</p>';

assertGetText('8.1 取 "Hello"', '<p>Hello<br>World</p>', 0, 5, 'Hello');
assertGetText('8.2 取换行', '<p>Hello<br>World</p>', 5, 6, '\n');
assertGetText('8.3 取 "World"', '<p>Hello<br>World</p>', 6, 11, 'World');
assertGetText('8.4 取 "ell"', '<p>Hello<br>World</p>', 1, 4, 'ell');

const cases8b = dom.window.document.createElement('div');
cases8b.innerHTML = '<p>First</p><p>Second</p>';

assertGetText('8.5 两段取第一段', '<p>First</p><p>Second</p>', 0, 6, 'First\n');
assertGetText('8.6 两段取换行', '<p>First</p><p>Second</p>', 5, 6, '\n');
assertGetText('8.7 两段取第二段', '<p>First</p><p>Second</p>', 6, 13, 'Second\n');

console.log('\n=== 9. 混合文本和样式 ===');
console.log('视觉: 样式不影响文本内容和换行');

assertFullText('9.1 跨段带样式', '<p><strong>A</strong></p><p><em>B</em></p>', 'A\nB\n');
assertFullText('9.2 段内带样式+br', '<p><strong>Hello</strong><br><em>World</em></p>', 'Hello\nWorld\n');

console.log('\n=== 10. 文档长度 ===');
console.log('原则: length = 文本字符数 + 换行符数');

assertLength('10.1 "Hello" = 6 (5 + 1\\n)', '<p>Hello</p>', 6);
assertLength('10.2 "A\\nB" = 4 (2 + 2\\n)', '<p>A</p><p>B</p>', 4);
assertLength('10.3 空段落 = 1 (\\n)', '<p></p>', 1);
assertLength('10.4 br 段落 = 1 (\\n)', '<p><br></p>', 1);
assertLength('10.5 段内 br = 12 (5 + 1\\n + 5 + 1\\n)', '<p>Hello<br>World</p>', 12);

console.log('\n=== 11. Unicode 字符 ===');
console.log('原则: emoji 等多码点字符按逻辑字符计数');

assertFullText('11.1 emoji', '<p>\u{1f600}</p>', '\u{1f600}\n');
assertLength('11.2 emoji 长度 = 2 (1 emoji + 1\\n)', '<p>\u{1f600}</p>', 2);
assertGetText('11.3 取 emoji', '<p>\u{1f600}abc</p>', 0, 1, '\u{1f600}');
assertGetText('11.4 emoji 后文本', '<p>\u{1f600}abc</p>', 1, 4, 'abc');

/* 输出汇总 */
console.log('\n' + '='.repeat(50));
console.log(`\u2705 通过: ${passed}`);
console.log(`\u274c 失败: ${failed}`);
console.log(`\u{1f4c8} 通过率: ${passed + failed > 0 ? ((passed / (passed + failed)) * 100).toFixed(1) : 0}%`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
