/**
 * removeConfig 真实用户操作模拟测试
 *
 * 测试路径: tsx src/__tests__/remove-config-realistic.test.ts
 *
 * 模拟真实编辑器操作流程，测试取消样式在各种复杂嵌套下的行为：
 * - 步骤式操作：打字 → 加样式 → 创建书签 → 创建修订 → 取消样式
 * - 跨段落 + 多层嵌套
 * - 多个语义容器覆盖重叠范围
 * - RevisionService 的 accept/reject + 样式移除
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
  const styleService = new StyleService(adapter);
  const bookmarkService = new BookmarkService(adapter);
  const revisionService = new RevisionService(adapter);
  return { container, adapter, styleService, bookmarkService, revisionService };
}

/* ==================== 1. 基础操作流：加粗 → 加斜 → 取消加粗 ==================== */

{
  const { container, styleService } = createEnv('Hello World');
  styleService.setStyle(0, 11, 'bold');
  styleService.setStyle(0, 11, 'italic');

  console.log(`  [1.0 before] ${container.innerHTML}`);
  styleService.removeStyle(0, 11, 'bold');
  console.log(`  [1.0 after] ${container.innerHTML}`);

  assert(container.querySelector('strong') === null, '1.1 取消加粗后 strong 不存在');
  assert(container.querySelector('em') !== null, '1.2 取消加粗后 em 保留');
}

/* ==================== 2. 加粗 → 书签 → 取消加粗 ==================== */

{
  const { container, adapter, styleService, bookmarkService } = createEnv('Hello World');
  styleService.setStyle(0, 5, 'bold');
  bookmarkService.create({ name: 'test', range: new Range({ start: 0, end: 5, adapter }) });

  console.log(`  [2.0 before] ${container.innerHTML}`);
  styleService.removeStyle(0, 5, 'bold');
  console.log(`  [2.0 after] ${container.innerHTML}`);

  assert(container.querySelector('strong') === null, '2.1 取消加粗后 strong 不存在');
  assert(container.querySelector('.bookmark') !== null, '2.2 取消加粗后 bookmark 保留');
}

/* ==================== 3. 加粗 → 书签 → 取消书签 ==================== */

{
  const { container, adapter, styleService, bookmarkService } = createEnv('Hello World');
  styleService.setStyle(0, 5, 'bold');
  const bm = bookmarkService.create({ name: 'test', range: new Range({ start: 0, end: 5, adapter }) });

  console.log(`  [3.0 before] ${container.innerHTML}`);
  bookmarkService.delete(bm);
  console.log(`  [3.0 after] ${container.innerHTML}`);

  assert(container.querySelector('.bookmark') === null, '3.1 删除书签后 bookmark 不存在');
  assert(container.querySelector('strong') !== null, '3.2 删除书签后 strong 保留');
}

/* ==================== 4. 加粗 → 加斜 → 书签 → 取消加粗 ==================== */

{
  const { container, adapter, styleService, bookmarkService } = createEnv('Hello World');
  styleService.setStyle(0, 5, 'bold');
  styleService.setStyle(0, 5, 'italic');
  bookmarkService.create({ name: 'test', range: new Range({ start: 0, end: 5, adapter }) });

  console.log(`  [4.0 before] ${container.innerHTML}`);
  styleService.removeStyle(0, 5, 'bold');
  console.log(`  [4.0 after] ${container.innerHTML}`);

  assert(container.querySelector('strong') === null, '4.1 取消加粗后 strong 不存在');
  assert(container.querySelector('em') !== null, '4.2 取消加粗后 em 保留');
  assert(container.querySelector('.bookmark') !== null, '4.3 取消加粗后 bookmark 保留');
}

/* ==================== 5. 加粗 → 修订 → 取消加粗 ==================== */

{
  const { container, adapter, styleService, revisionService } = createEnv('Hello World');
  styleService.setStyle(0, 5, 'bold');
  revisionService.createInsert({
    range: new Range({ start: 0, end: 5, adapter }),
    author: 'test',
  });

  console.log(`  [5.0 before] ${container.innerHTML}`);
  styleService.removeStyle(0, 5, 'bold');
  console.log(`  [5.0 after] ${container.innerHTML}`);

  assert(container.querySelector('strong') === null, '5.1 取消加粗后 strong 不存在');
  assert(container.querySelector('.revision-insert') !== null, '5.2 取消加粗后 revision 保留');
}

/* ==================== 6. 加粗 → 修订 → 取消修订 ==================== */

{
  const { container, adapter, styleService, revisionService } = createEnv('Hello World');
  styleService.setStyle(0, 5, 'bold');
  const rev = revisionService.createInsert({
    range: new Range({ start: 0, end: 5, adapter }),
    author: 'test',
  });

  console.log(`  [6.0 before] ${container.innerHTML}`);
  revisionService.accept(rev);
  console.log(`  [6.0 after] ${container.innerHTML}`);

  assert(container.querySelector('.revision-insert') === null, '6.1 接受修订后 revision 不存在');
  assert(container.querySelector('strong') !== null, '6.2 接受修订后 strong 保留');
}

/* ==================== 7. 加粗 → 书签 → 修订 → 取消加粗 ==================== */

{
  const { container, adapter, styleService, bookmarkService, revisionService } = createEnv('Hello World');
  styleService.setStyle(0, 5, 'bold');
  bookmarkService.create({ name: 'bm1', range: new Range({ start: 0, end: 5, adapter }) });
  revisionService.createInsert({
    range: new Range({ start: 0, end: 5, adapter }),
    author: 'test',
  });

  console.log(`  [7.0 before] ${container.innerHTML}`);
  styleService.removeStyle(0, 5, 'bold');
  console.log(`  [7.0 after] ${container.innerHTML}`);

  assert(container.querySelector('strong') === null, '7.1 取消加粗后 strong 不存在');
  assert(container.querySelector('.bookmark') !== null, '7.2 取消加粗后 bookmark 保留');
  assert(container.querySelector('.revision-insert') !== null, '7.3 取消加粗后 revision 保留');
}

/* ==================== 8. 跨段落加粗 → 取消 ==================== */

{
  const { container, adapter, styleService, bookmarkService } = createEnv('<p>Hello</p><p>World</p>');
  styleService.setStyle(0, 11, 'bold');
  bookmarkService.create({ name: 'bm', range: new Range({ start: 0, end: 11, adapter }) });

  console.log(`  [8.0 before] ${container.innerHTML}`);
  styleService.removeStyle(0, 11, 'bold');
  console.log(`  [8.0 after] ${container.innerHTML}`);

  assert(container.querySelectorAll('strong').length === 0, '8.1 跨段落取消加粗后所有 strong 不存在');
  /* 跨段落书签应拆分为多个 span */
  assert(container.querySelectorAll('.bookmark').length >= 1, '8.2 跨段落取消加粗后 bookmark 保留');
}

/* ==================== 9. 部分范围加粗 → 取消 ==================== */

{
  const { container, adapter, styleService, bookmarkService } = createEnv('Hello World');
  styleService.setStyle(0, 5, 'bold');
  styleService.setStyle(0, 5, 'italic');
  bookmarkService.create({ name: 'bm', range: new Range({ start: 0, end: 5, adapter }) });

  /* 只取消前 3 个字符的加粗 */
  console.log(`  [9.0 before] ${container.innerHTML}`);
  styleService.removeStyle(0, 3, 'bold');
  console.log(`  [9.0 after] ${container.innerHTML}`);

  /* bold 可能被部分保留或完全保留在 [3,5] */
  assert(container.querySelector('.bookmark') !== null, '9.1 部分取消加粗后 bookmark 保留');
  assert(container.textContent?.includes('Hello'), '9.2 文本 Hello 保留');
}

/* ==================== 10. 多个书签重叠 + 样式移除 ==================== */

{
  const { container, adapter, styleService, bookmarkService } = createEnv('Hello World');
  styleService.setStyle(0, 11, 'bold');
  bookmarkService.create({ name: 'bm1', range: new Range({ start: 0, end: 5, adapter }) });
  bookmarkService.create({ name: 'bm2', range: new Range({ start: 6, end: 11, adapter }) });

  console.log(`  [10.0 before] ${container.innerHTML}`);
  styleService.removeStyle(0, 11, 'bold');
  console.log(`  [10.0 after] ${container.innerHTML}`);

  assert(container.querySelector('strong') === null, '10.1 取消加粗后 strong 不存在');
  assert(container.querySelectorAll('.bookmark').length >= 2, '10.2 两个 bookmark 都保留');
}

/* ==================== 11. 修订 accept 后样式保留 ==================== */

{
  const { container, adapter, styleService, revisionService } = createEnv('Hello World');
  styleService.setStyle(0, 5, 'bold');
  styleService.setStyle(0, 5, 'italic');
  const rev = revisionService.createInsert({
    range: new Range({ start: 0, end: 5, adapter }),
    author: 'test',
  });

  console.log(`  [11.0 before] ${container.innerHTML}`);
  revisionService.accept(rev);
  console.log(`  [11.0 after] ${container.innerHTML}`);

  assert(container.querySelector('.revision-insert') === null, '11.1 接受修订后 revision 不存在');
  assert(container.querySelector('strong') !== null, '11.2 接受修订后 strong 保留');
  assert(container.querySelector('em') !== null, '11.3 接受修订后 em 保留');
}

/* ==================== 12. 修订 reject 后样式保留 ==================== */

{
  const { container, adapter, styleService, revisionService } = createEnv('Hello World');
  styleService.setStyle(0, 5, 'bold');
  const rev = revisionService.createInsert({
    range: new Range({ start: 0, end: 5, adapter }),
    author: 'test',
  });

  console.log(`  [12.0 before] ${container.innerHTML}`);
  revisionService.reject(rev);
  console.log(`  [12.0 after] ${container.innerHTML}`);

  assert(container.querySelector('.revision-insert') === null, '12.1 拒绝修订后 revision 不存在');
  /* reject insert = 移除文本，strong 可能被移除或变空 */
  console.log(`  [12.0] final html: ${container.innerHTML}`);
}

/* ==================== 13. 复杂嵌套：bold > bookmark > italic > revision ==================== */

{
  const { container, adapter, styleService, bookmarkService, revisionService } = createEnv('Hello World');
  styleService.setStyle(0, 5, 'bold');
  bookmarkService.create({ name: 'bm1', range: new Range({ start: 0, end: 5, adapter }) });
  styleService.setStyle(0, 5, 'italic');
  revisionService.createInsert({
    range: new Range({ start: 0, end: 5, adapter }),
    author: 'test',
  });

  console.log(`  [13.0 before] ${container.innerHTML}`);

  /* 逐步取消样式 */
  styleService.removeStyle(0, 5, 'italic');
  console.log(`  [13.1 after remove italic] ${container.innerHTML}`);
  assert(container.querySelector('em') === null, '13.1 移除 italic 后 em 不存在');
  assert(container.querySelector('strong') !== null, '13.2 移除 italic 后 strong 保留');
  assert(container.querySelector('.bookmark') !== null, '13.3 移除 italic 后 bookmark 保留');
  assert(container.querySelector('.revision-insert') !== null, '13.4 移除 italic 后 revision 保留');

  styleService.removeStyle(0, 5, 'bold');
  console.log(`  [13.2 after remove bold] ${container.innerHTML}`);
  assert(container.querySelector('strong') === null, '13.5 移除 bold 后 strong 不存在');
  assert(container.querySelector('.bookmark') !== null, '13.6 移除 bold 后 bookmark 保留');
  assert(container.querySelector('.revision-insert') !== null, '13.7 移除 bold 后 revision 保留');
}

/* ==================== 14. queryConfigs 验证移除结果 ==================== */

{
  const { container: _container, adapter, styleService, bookmarkService } = createEnv('Hello World');
  styleService.setStyle(0, 5, 'bold');
  styleService.setStyle(0, 5, 'italic');
  styleService.setStyle(0, 5, 'underline');
  bookmarkService.create({ name: 'bm', range: new Range({ start: 0, end: 5, adapter }) });

  /* 移除 italic */
  styleService.removeStyle(0, 5, 'italic');

  const configs = adapter.queryConfigs(0, 5);
  console.log(`  [14.0] configs: ${[...configs].join(', ')}`);
  assert(configs.has('bold'), '14.1 queryConfigs 包含 bold');
  assert(!configs.has('italic'), '14.2 queryConfigs 不包含 italic');
  assert(configs.has('underline'), '14.3 queryConfigs 包含 underline');
  assert(configs.has('bookmark'), '14.4 queryConfigs 包含 bookmark');
}

/* ==================== 结果 ==================== */

console.log('\n' + '='.repeat(60));
console.log('📊 removeConfig 真实操作模拟测试结果');
console.log('='.repeat(60));
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log(`📈 通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
