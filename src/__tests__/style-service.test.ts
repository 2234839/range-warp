/**
 * StyleService 单元测试
 *
 * 测试路径: tsx src/__tests__/style-service.test.ts
 *
 * 验证 StyleService 的样式管理功能：
 * - 注册内置样式配置
 * - setStyle / removeStyle 操作
 * - getFormatState 格式状态查询
 * - 错误输入处理
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

/* ==================== 1. 配置注册 ==================== */

{
  const { adapter, service } = createEnv('<p>Hello</p>');

  /* 1.1 StyleService 注册后 adapter 能识别样式配置 */
  const boldConfigured = adapter.queryConfigs(0, 5).has('bold');
  assert(!boldConfigured, '1.1 纯文本中查询 bold 应为 false');

  service.setStyle(0, 5, 'bold');
  const hasBold = adapter.queryConfigs(0, 5).has('bold');
  assert(hasBold, '1.2 setStyle 后 adapter 能查询到 bold');
}

/* ==================== 2. setStyle 基本操作 ==================== */

{
  const { container, service } = createEnv('Hello World');

  /* 2.1 应用粗体 */
  service.setStyle(0, 5, 'bold');
  assert(container.querySelector('strong') !== null, '2.1 setStyle bold 创建 strong 元素');
  assert(container.querySelector('strong')!.textContent === 'Hello', '2.2 strong 包含正确文本');
}

{
  const { container, service } = createEnv('Hello World');

  /* 2.2 应用斜体 */
  service.setStyle(0, 5, 'italic');
  assert(container.querySelector('em') !== null, '2.3 setStyle italic 创建 em 元素');
}

{
  const { container, service } = createEnv('Hello World');

  /* 2.3 应用下划线 */
  service.setStyle(0, 5, 'underline');
  assert(container.querySelector('u') !== null, '2.4 setStyle underline 创建 u 元素');
}

{
  const { container, service } = createEnv('Hello World');

  /* 2.4 应用删除线 */
  service.setStyle(0, 5, 'strikethrough');
  assert(container.querySelector('s') !== null, '2.5 setStyle strikethrough 创建 s 元素');
}

{
  const { container, service } = createEnv('Hello World');

  /* 2.5 应用高亮 */
  service.setStyle(0, 5, 'highlight');
  assert(container.querySelector('mark') !== null, '2.6 setStyle highlight 创建 mark 元素');
}

/* ==================== 3. removeStyle 基本操作 ==================== */

{
  const { container, service } = createEnv('<strong>Hello</strong> World');

  /* 3.1 移除粗体 */
  service.removeStyle(0, 5, 'bold');
  assert(container.querySelector('strong') === null, '3.1 removeStyle 移除 strong 元素');
  assert(container.textContent?.includes('Hello'), '3.2 移除后文本保留');
}

/* ==================== 4. 切换操作 ==================== */

{
  const { container, service } = createEnv('Hello World');

  /* 4.1 setStyle 后 removeStyle 恢复 */
  service.setStyle(0, 5, 'bold');
  assert(container.querySelector('strong') !== null, '4.1 应用 bold');
  service.removeStyle(0, 5, 'bold');
  assert(container.querySelector('strong') === null, '4.2 移除 bold');
}

/* ==================== 5. 多样式组合 ==================== */

{
  const { container, service } = createEnv('Hello World');

  /* 5.1 叠加多种样式 */
  service.setStyle(0, 5, 'bold');
  service.setStyle(0, 5, 'italic');
  assert(container.querySelector('strong em') !== null || container.querySelector('em strong') !== null,
    '5.1 叠加 bold + italic');
}

{
  const { container, service } = createEnv('<strong>Hello</strong> World');

  /* 5.2 已有粗体时应用斜体 */
  service.setStyle(0, 5, 'italic');
  assert(container.querySelector('em') !== null, '5.2 已有 bold 时添加 italic');
}

/* ==================== 6. 部分样式操作 ==================== */

{
  const { container, service } = createEnv('<strong>Hello World</strong>');

  /* 6.1 部分移除粗体 */
  service.removeStyle(0, 5, 'bold');
  assert(container.querySelector('strong') !== null, '6.1 部分移除保留剩余 strong');
  assert(container.textContent?.startsWith('Hello World'), '6.2 部分移除后文本完整');
}

/* ==================== 7. getStylesInRange ==================== */

{
  const { service } = createEnv('<strong>Hello</strong> World');

  /* 7.1 查询范围内的样式 */
  const styles = service.getStylesInRange(0, 5);
  assert(styles.has('bold'), '7.1 getStylesInRange 返回 bold');
  assert(!styles.has('italic'), '7.2 getStylesInRange 不返回 italic');

  const styles2 = service.getStylesInRange(6, 11);
  assert(!styles2.has('bold'), '7.3 非样式区域不返回 bold');
}

/* ==================== 8. getFormatState ==================== */

{
  const { service } = createEnv('<strong><em>Hello</em></strong> World');

  /* 8.1 多样式格式状态 */
  const state = service.getFormatState(0, 5);
  assert(state.bold === true, '8.1 formatState.bold 为 true');
  assert(state.italic === true, '8.2 formatState.italic 为 true');
  assert(state.underline === false, '8.3 formatState.underline 为 false');
}

{
  const { service } = createEnv('Hello World');

  /* 8.2 无样式格式状态 */
  const state = service.getFormatState(0, 5);
  assert(state.bold === false, '8.4 纯文本 bold 为 false');
  assert(state.italic === false, '8.5 纯文本 italic 为 false');
}

/* ==================== 9. 错误输入处理 ==================== */

{
  const { service } = createEnv('Hello');

  /* 9.1 不支持的样式名 */
  service.setStyle(0, 5, 'unknown-style');
  assert(true, '9.1 不支持的样式名不抛错');
}

{
  const { service } = createEnv('Hello');

  /* 9.2 移除不支持的样式名 */
  service.removeStyle(0, 5, 'unknown-style');
  assert(true, '9.2 移除不支持的样式名不抛错');
}

/* ==================== 10. 通过 Range 模型操作 ==================== */

{
  const { adapter, service } = createEnv('Hello World');
  const range = new Range({ start: 0, end: 5, adapter });

  /* 10.1 用 Range 位置应用样式 */
  service.setStyle(range.start, range.end, 'bold');
  assert(adapter.queryConfigs(0, 5).has('bold'), '10.1 通过 Range 位置应用样式');
}

/* ==================== 11. 跨段落样式 ==================== */

{
  const { container, service } = createEnv('<p>Hello</p><p>World</p>');

  /* 11.1 跨段落应用样式应分别包裹 */
  service.setStyle(0, 11, 'bold');
  const bolds = container.querySelectorAll('strong');
  assert(bolds.length === 2, '11.1 跨段落分别创建 strong 元素');
}

/* ==================== 12. getStylesInRange 过滤非样式配置 ==================== */

{
  /* 12.1 注册书签后，getStylesInRange 不应返回 bookmark */
  const { adapter } = createEnv('Hello');
  const bookmarkService = new BookmarkService(adapter);
  bookmarkService.create({ name: 'test', range: new Range({ start: 0, end: 5, adapter }) });

  const styles = adapter.queryConfigs(0, 5);
  assert(styles.has('bookmark'), '12.1 queryConfigs 包含 bookmark 配置');

  const styleService = new StyleService(adapter);
  const filteredStyles = styleService.getStylesInRange(0, 5);
  assert(!filteredStyles.has('bookmark'), '12.2 getStylesInRange 不包含 bookmark');
}

{
  /* 12.2 注册修订后，getStylesInRange 不应返回 revision */
  const { adapter } = createEnv('Hello');
  const revisionService = new RevisionService(adapter);
  revisionService.createDelete({
    range: new Range({ start: 0, end: 3, adapter }),
    author: 'test',
  });

  const styles = adapter.queryConfigs(0, 5);
  assert(styles.has('revision-delete'), '12.3 queryConfigs 包含 revision-delete');

  const styleService = new StyleService(adapter);
  const filteredStyles = styleService.getStylesInRange(0, 5);
  assert(!filteredStyles.has('revision-delete'), '12.4 getStylesInRange 不包含 revision');
}

{
  /* 12.3 混合配置时 getStylesInRange 只返回样式 */
  const { adapter } = createEnv('Hello World');
  const styleService = new StyleService(adapter);
  const bookmarkService = new BookmarkService(adapter);

  styleService.setStyle(0, 5, 'bold');
  bookmarkService.create({ name: 'test', range: new Range({ start: 0, end: 5, adapter }) });

  const all = adapter.queryConfigs(0, 5);
  assert(all.has('bold'), '12.5 queryConfigs 包含 bold');
  assert(all.has('bookmark'), '12.6 queryConfigs 包含 bookmark');

  const filtered = styleService.getStylesInRange(0, 5);
  assert(filtered.has('bold'), '12.7 getStylesInRange 包含 bold');
  assert(!filtered.has('bookmark'), '12.8 getStylesInRange 不包含 bookmark');
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
