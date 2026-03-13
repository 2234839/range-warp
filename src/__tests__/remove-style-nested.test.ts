/**
 * removeStyle 嵌套场景测试
 *
 * 测试路径: tsx src/__tests__/remove-style-nested.test.ts
 *
 * 验证在嵌套容器场景下，移除某一个容器样式不会影响其他容器的包裹：
 * - 双层嵌套（strong > em）移除内层
 * - 双层嵌套（strong > em）移除外层
 * - 三层嵌套移除中间层
 * - 相邻兄弟容器移除其中一个
 * - 部分重叠嵌套移除
 * - 书签 + 样式嵌套移除样式
 * - 样式 + 修订嵌套移除样式
 */
import { JSDOM } from 'jsdom';
import { DOMRangeAdapter } from '../core/adapters/DOMRangeAdapter.js';
import { StyleService } from '../core/services/StyleService.js';
import { BookmarkService } from '../core/services/BookmarkService.js';
import { RevisionService } from '../core/services/RevisionService.js';
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
  const service = new StyleService(adapter);
  return { container, adapter, service };
}

/* ==================== 1. 双层嵌套：外 strong 内 em ==================== */

{
  const { container, service } = createEnv('<strong><em>Hello</em></strong> World');

  /* 1.1 移除内层 italic，外层 bold 应保留 */
  service.removeStyle(0, 5, 'italic');
  assert(container.querySelector('strong') !== null, '1.1 移除 italic 后 strong 保留');
  assert(container.querySelector('em') === null, '1.2 移除 italic 后 em 不存在');
  assert(container.querySelector('strong')!.textContent === 'Hello', '1.3 strong 文本正确');
}

{
  const { container, service } = createEnv('<strong><em>Hello</em></strong> World');

  /* 1.2 移除外层 bold，内层 italic 应保留 */
  service.removeStyle(0, 5, 'bold');
  assert(container.querySelector('em') !== null, '1.4 移除 bold 后 em 保留');
  assert(container.querySelector('strong') === null, '1.5 移除 bold 后 strong 不存在');
  assert(container.querySelector('em')!.textContent === 'Hello', '1.6 em 文本正确');
}

/* ==================== 2. 双层嵌套：外 em 内 strong ==================== */

{
  const { container, service } = createEnv('<em><strong>Hello</strong></em> World');

  /* 2.1 移除内层 bold，外层 italic 应保留 */
  service.removeStyle(0, 5, 'bold');
  assert(container.querySelector('em') !== null, '2.1 移除 bold 后 em 保留');
  assert(container.querySelector('strong') === null, '2.2 移除 bold 后 strong 不存在');
}

{
  const { container, service } = createEnv('<em><strong>Hello</strong></em> World');

  /* 2.2 移除外层 italic，内层 bold 应保留 */
  service.removeStyle(0, 5, 'italic');
  assert(container.querySelector('strong') !== null, '2.3 移除 italic 后 strong 保留');
  assert(container.querySelector('em') === null, '2.4 移除 italic 后 em 不存在');
}

/* ==================== 3. 三层嵌套 ==================== */

{
  const { container, service } = createEnv('<strong><em><u>Hello</u></em></strong>');

  /* 3.1 移除中间层 italic，上下层保留 */
  service.removeStyle(0, 5, 'italic');
  assert(container.querySelector('strong') !== null, '3.1 移除 italic 后 strong 保留');
  assert(container.querySelector('u') !== null, '3.2 移除 italic 后 u 保留');
  assert(container.querySelector('em') === null, '3.3 移除 italic 后 em 不存在');
}

{
  const { container, service } = createEnv('<strong><em><u>Hello</u></em></strong>');

  /* 3.2 移除最外层 bold，内两层保留 */
  service.removeStyle(0, 5, 'bold');
  assert(container.querySelector('em') !== null, '3.4 移除 bold 后 em 保留');
  assert(container.querySelector('u') !== null, '3.5 移除 bold 后 u 保留');
  assert(container.querySelector('strong') === null, '3.6 移除 bold 后 strong 不存在');
}

{
  const { container, service } = createEnv('<strong><em><u>Hello</u></em></strong>');

  /* 3.3 移除最内层 underline，外两层保留 */
  service.removeStyle(0, 5, 'underline');
  assert(container.querySelector('strong') !== null, '3.7 移除 underline 后 strong 保留');
  assert(container.querySelector('em') !== null, '3.8 移除 underline 后 em 保留');
  assert(container.querySelector('u') === null, '3.9 移除 underline 后 u 不存在');
}

/* ==================== 4. 部分重叠嵌套移除 ==================== */

{
  const { container, service } = createEnv('<strong><em>Hello World</em></strong>');

  /* 4.1 只移除前半部分 italic */
  service.removeStyle(0, 5, 'italic');
  assert(container.querySelector('strong') !== null, '4.1 部分移除 italic 后 strong 保留');
  /* strong 应该仍包含全部文本，em 被分割为两部分 */
  assert(container.querySelectorAll('em').length <= 1, '4.2 部分移除 italic 后 em 被分割');
  assert(container.textContent?.includes('Hello'), '4.3 文本 Hello 保留');
  assert(container.textContent?.includes('World'), '4.4 文本 World 保留');
}

{
  const { container, service } = createEnv('<strong><em>Hello World</em></strong>');

  /* 4.2 只移除外层 bold 的后半部分 */
  service.removeStyle(5, 11, 'bold');
  assert(container.querySelector('em') !== null, '4.5 部分移除 bold 后 em 保留');
  /* 文本完整 */
  assert(container.textContent?.includes('Hello'), '4.6 文本 Hello 保留');
  assert(container.textContent?.includes('World'), '4.7 文本 World 保留');
}

/* ==================== 5. 样式与书签嵌套 ==================== */

{
  const { container, adapter } = createEnv('Hello World');
  const styleService = new StyleService(adapter);
  const bookmarkService = new BookmarkService(adapter);

  /* 5.1 先应用 bold 再创建书签 */
  styleService.setStyle(0, 5, 'bold');
  bookmarkService.create({ name: 'test', range: new Range({ start: 0, end: 5, adapter }) });

  /* 移除 bold，书签应保留 */
  styleService.removeStyle(0, 5, 'bold');
  assert(container.querySelector('strong') === null, '5.1 移除 bold 后 strong 不存在');
  const bookmarkEl = container.querySelector('.bookmark');
  assert(bookmarkEl !== null, '5.2 移除 bold 后 bookmark 保留');
  assert(bookmarkEl!.textContent === 'Hello', '5.3 bookmark 文本正确');
}

/* ==================== 6. 样式与修订嵌套 ==================== */

{
  const { container, adapter } = createEnv('Hello World');
  const styleService = new StyleService(adapter);
  const revisionService = new RevisionService(adapter);

  /* 6.1 先应用 italic 再创建修订 */
  styleService.setStyle(0, 5, 'italic');
  revisionService.createDelete({
    range: new Range({ start: 0, end: 3, adapter }),
    author: 'test',
  });

  /* 移除 italic，修订应保留 */
  styleService.removeStyle(0, 5, 'italic');
  assert(container.querySelector('em') === null, '6.1 移除 italic 后 em 不存在');
  const revisionEl = container.querySelector('.revision-delete');
  assert(revisionEl !== null, '6.2 移除 italic 后 revision 保留');
}

/* ==================== 7. 相邻兄弟同类型标签 ==================== */

{
  const { container, service } = createEnv('<strong>Hello</strong><em>World</em>');

  /* 7.1 移除 bold，italic 不受影响 */
  service.removeStyle(0, 5, 'bold');
  assert(container.querySelector('strong') === null, '7.1 移除 bold 后 strong 不存在');
  assert(container.querySelector('em') !== null, '7.2 移除 bold 后 em 保留');
  assert(container.querySelector('em')!.textContent === 'World', '7.3 em 文本正确');
}

/* ==================== 8. 相邻异类型嵌套 ==================== */

{
  const { container, service } = createEnv('<strong>A</strong><em>B</em><u>C</u>');

  /* 8.1 移除中间的 italic，其他不受影响 */
  service.removeStyle(1, 2, 'italic');
  assert(container.querySelector('strong') !== null, '8.1 移除 italic 后 strong 保留');
  assert(container.querySelector('em') === null, '8.2 移除 italic 后 em 不存在');
  assert(container.querySelector('u') !== null, '8.3 移除 italic 后 u 保留');
}

/* ==================== 9. 同类型多层嵌套 ==================== */

{
  const { container, service } = createEnv('<strong><strong>Hello</strong></strong>');

  /* 9.1 移除 bold 应移除所有 strong 层级 */
  service.removeStyle(0, 5, 'bold');
  assert(container.querySelector('strong') === null, '9.1 双层嵌套 bold 全部移除');
  assert(container.textContent === 'Hello', '9.2 文本完整保留');
}

/* ==================== 10. 跨段落的嵌套样式移除 ==================== */

{
  const { container, service } = createEnv('<p><strong><em>Hello</em></strong></p><p><strong><em>World</em></strong></p>');

  /* 10.1 跨段落移除 italic，bold 保留 */
  service.removeStyle(0, 11, 'italic');
  assert(container.querySelectorAll('strong').length === 2, '10.1 跨段落移除 italic 后两个 strong 保留');
  assert(container.querySelectorAll('em').length === 0, '10.2 跨段落移除 italic 后所有 em 被移除');
}

{
  const { container, service } = createEnv('<p><strong><em>Hello</em></strong></p><p><strong><em>World</em></strong></p>');

  /* 10.2 跨段落移除 bold，italic 保留 */
  service.removeStyle(0, 11, 'bold');
  assert(container.querySelectorAll('em').length === 2, '10.3 跨段落移除 bold 后两个 em 保留');
  assert(container.querySelectorAll('strong').length === 0, '10.4 跨段落移除 bold 后所有 strong 被移除');
}

/* ==================== 11. 先应用再移除（toggle 验证） ==================== */

{
  const { container, service } = createEnv('Hello World');

  /* 11.1 应用 bold + italic，只移除 bold */
  service.setStyle(0, 11, 'bold');
  service.setStyle(0, 11, 'italic');
  service.removeStyle(0, 11, 'bold');
  assert(container.querySelector('strong') === null, '11.1 移除 bold 后 strong 不存在');
  assert(container.querySelector('em') !== null, '11.2 移除 bold 后 em 保留');
}

{
  const { container, service } = createEnv('Hello World');

  /* 11.2 应用 bold + italic + underline，移除 italic */
  service.setStyle(0, 11, 'bold');
  service.setStyle(0, 11, 'italic');
  service.setStyle(0, 11, 'underline');
  service.removeStyle(0, 11, 'italic');
  assert(container.querySelector('strong') !== null, '11.3 移除 italic 后 strong 保留');
  assert(container.querySelector('em') === null, '11.4 移除 italic 后 em 不存在');
  assert(container.querySelector('u') !== null, '11.5 移除 italic 后 u 保留');
}

/* ==================== 12. 混合语义容器 + 多样式嵌套 ==================== */

{
  const { container, adapter } = createEnv('Hello World');
  const styleService = new StyleService(adapter);
  const bookmarkService = new BookmarkService(adapter);

  /* 12.1 三样式 + 书签嵌套，移除其中一个样式 */
  styleService.setStyle(0, 5, 'bold');
  styleService.setStyle(0, 5, 'italic');
  styleService.setStyle(0, 5, 'underline');
  bookmarkService.create({ name: 'bm1', range: new Range({ start: 0, end: 5, adapter }) });

  /* 移除 bold */
  styleService.removeStyle(0, 5, 'bold');
  assert(container.querySelector('strong') === null, '12.1 移除 bold 后 strong 不存在');
  assert(container.querySelector('em') !== null, '12.2 移除 bold 后 em 保留');
  assert(container.querySelector('u') !== null, '12.3 移除 bold 后 u 保留');
  const bm = container.querySelector('.bookmark');
  assert(bm !== null, '12.4 移除 bold 后 bookmark 保留');
}

/* ==================== 结果 ==================== */

console.log('\n' + '='.repeat(60));
console.log('📊 removeStyle 嵌套场景测试结果');
console.log('='.repeat(60));
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log(`📈 通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
