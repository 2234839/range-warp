/**
 * 跨块级元素修订测试
 *
 * 测试路径: tsx src/__tests__/cross-block-revision.test.ts
 *
 * 测试覆盖:
 * 1. 跨块创建新增修订 - 布局不破坏
 * 2. 跨块创建删除修订 - 布局不破坏
 * 3. 跨块修订的 getRange 正确
 * 4. 跨块修订的 accept 正确
 * 5. 跨块修订的 reject 正确
 * 6. 跨块部分选中（块内部分文本）
 */

import { JSDOM } from 'jsdom';
import { DOMRangeAdapter } from '../core/adapters/DOMRangeAdapter.js';
import { RevisionService } from '../core/services/RevisionService.js';
import { Range } from '../core/models/Range.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' });
global.window = dom.window as any;
global.document = dom.window.document;
global.Node = dom.window.Node;
global.NodeFilter = dom.window.NodeFilter;

let totalPassed = 0;
let totalFailed = 0;
const allFailures: string[] = [];

function test(name: string, fn: () => boolean) {
  try {
    const result = fn();
    if (result) {
      totalPassed++;
      console.log(`  ✅ ${name}`);
    } else {
      totalFailed++;
      allFailures.push(name);
      console.log(`  ❌ ${name}`);
    }
  } catch (e) {
    totalFailed++;
    allFailures.push(name);
    console.log(`  ❌ ${name}`);
    console.log(`     💥 异常: ${(e as Error).message}`);
    console.log(`     堆栈: ${(e as Error).stack}`);
  }
}

function assert(condition: boolean, message: string): boolean {
  if (!condition) {
    console.log(`     → ${message}`);
  }
  return condition;
}

function createEnv(html: string) {
  const container = document.createElement('div');
  container.innerHTML = html;
  const adapter = new DOMRangeAdapter({ container });
  const service = new RevisionService(adapter);
  const createRange = (start: number, end: number) => new Range({ start, end, adapter });
  return { container, adapter, service, createRange };
}

/* ==================== 1. 跨块新增修订 ==================== */

console.log('\n=== 1. 跨块新增修订 ===');

test('1.1 跨块新增修订 - 块布局不破坏', () => {
  const { container, service, createRange } = createEnv(
    '<div>123</div><div>456</div><div>789</div>'
  );
  /* 选中 "3" 和 "4" (位置 2-4) */
  service.createInsert({ range: createRange(2, 4), author: 'test' });

  const divs = container.querySelectorAll(':scope > div');
  return (
    assert(divs.length === 3, `块数量应为3，实际: ${divs.length}`) &&
    assert(divs[0].textContent === '123', `第1块内容错误: "${divs[0].textContent}"`) &&
    assert(divs[1].textContent === '456', `第2块内容错误: "${divs[1].textContent}"`) &&
    assert(divs[2].textContent === '789', `第3块内容错误: "${divs[2].textContent}"`)
  );
});

test('1.2 跨块新增修订 - 修订标记在块内', () => {
  const { container, service, createRange } = createEnv(
    '<div>123</div><div>456</div><div>789</div>'
  );
  service.createInsert({ range: createRange(2, 4), author: 'test' });

  const revisionSpans = container.querySelectorAll('.revision-insert');
  return (
    assert(revisionSpans.length === 2, `修订标记数量应为2，实际: ${revisionSpans.length}`) &&
    assert(revisionSpans[0].textContent === '3', `第1个标记内容错误: "${revisionSpans[0].textContent}"`) &&
    assert(revisionSpans[1].textContent === '4', `第2个标记内容错误: "${revisionSpans[1].textContent}"`) &&
    /* 确认标记在块内，不在块外 */
    assert(
      revisionSpans[0].closest('div') === container.children[0],
      '第1个标记不在第1块内'
    ) &&
    assert(
      revisionSpans[1].closest('div') === container.children[1],
      '第2个标记不在第2块内'
    )
  );
});

test('1.3 跨块新增修订 - 无嵌套', () => {
  const { container, service, createRange } = createEnv(
    '<div>123</div><div>456</div><div>789</div>'
  );
  service.createInsert({ range: createRange(2, 4), author: 'test' });

  /* 检查修订 span 内没有嵌套的修订 span */
  const nested = container.querySelector('.revision-insert .revision-insert');
  return assert(!nested, '存在嵌套的修订标记');
});

test('1.4 跨块新增修订 - 同一 revision ID', () => {
  const { container, service, createRange } = createEnv(
    '<div>123</div><div>456</div><div>789</div>'
  );
  service.createInsert({ range: createRange(2, 4), author: 'test' });

  const revisionSpans = container.querySelectorAll('.revision-insert');
  const ids = Array.from(revisionSpans).map(el => el.getAttribute('data-revision-id'));
  return assert(
    ids[0] === ids[1] && ids.length === 2,
    `两个标记的 revision ID 应相同: "${ids[0]}" vs "${ids[1]}"`
  );
});

/* ==================== 2. 跨块删除修订 ==================== */

console.log('\n=== 2. 跨块删除修订 ===');

test('2.1 跨块删除修订 - 块布局不破坏', () => {
  const { container, service, createRange } = createEnv(
    '<div>123</div><div>456</div><div>789</div>'
  );
  service.createDelete({ range: createRange(2, 4), author: 'test' });

  const divs = container.querySelectorAll(':scope > div');
  return (
    assert(divs.length === 3, `块数量应为3，实际: ${divs.length}`) &&
    assert(divs[0].textContent === '123', `第1块内容错误: "${divs[0].textContent}"`) &&
    assert(divs[1].textContent === '456', `第2块内容错误: "${divs[1].textContent}"`) &&
    assert(divs[2].textContent === '789', `第3块内容错误: "${divs[2].textContent}"`)
  );
});

test('2.2 跨块删除修订 - 标记在块内', () => {
  const { container, service, createRange } = createEnv(
    '<div>123</div><div>456</div><div>789</div>'
  );
  service.createDelete({ range: createRange(2, 4), author: 'test' });

  const revisionSpans = container.querySelectorAll('.revision-delete');
  return (
    assert(revisionSpans.length === 2, `修订标记数量应为2，实际: ${revisionSpans.length}`) &&
    assert(revisionSpans[0].textContent === '3', `第1个标记内容错误: "${revisionSpans[0].textContent}"`) &&
    assert(revisionSpans[1].textContent === '4', `第2个标记内容错误: "${revisionSpans[1].textContent}"`)
  );
});

/* ==================== 3. 跨块修订的 getRange ==================== */

console.log('\n=== 3. 跨块修订的 getRange ===');

test('3.1 跨块修订 - getRange 合并范围', () => {
  const { service, createRange } = createEnv(
    '<div>123</div><div>456</div><div>789</div>'
  );
  const revision = service.createInsert({ range: createRange(2, 4), author: 'test' });

  const range = revision.getRange();
  return (
    assert(!!range, 'getRange 返回 null') &&
    assert(range!.start === 2, `start 应为2: ${range!.start}`) &&
    assert(range!.end === 4, `end 应为4: ${range!.end}`)
  );
});

test('3.2 跨块修订 - getText 合并内容', () => {
  const { service, createRange } = createEnv(
    '<div>123</div><div>456</div><div>789</div>'
  );
  const revision = service.createInsert({ range: createRange(2, 4), author: 'test' });

  return assert(
    revision.getText() === '34',
    `getText 应为 "34": "${revision.getText()}"`
  );
});

/* ==================== 4. 跨块修订的 accept ==================== */

console.log('\n=== 4. 跨块修订的 accept ===');

test('4.1 跨块新增修订 accept - 标记全部移除', () => {
  const { container, service, createRange } = createEnv(
    '<div>123</div><div>456</div><div>789</div>'
  );
  const revision = service.createInsert({ range: createRange(2, 4), author: 'test' });
  service.accept(revision);

  return (
    assert(!container.querySelector('.revision-insert'), '修订标记未移除') &&
    assert(container.querySelectorAll(':scope > div').length === 3, '块布局被破坏')
  );
});

test('4.2 跨块删除修订 accept - 内容全部删除', () => {
  const { container, service, createRange } = createEnv(
    '<div>123</div><div>456</div><div>789</div>'
  );
  const revision = service.createDelete({ range: createRange(2, 4), author: 'test' });
  service.accept(revision);

  return (
    assert(!container.querySelector('.revision-delete'), '修订标记未移除') &&
    assert(container.textContent === '1256789', `内容错误: "${container.textContent}"`)
  );
});

/* ==================== 5. 跨块修订的 reject ==================== */

console.log('\n=== 5. 跨块修订的 reject ===');

test('5.1 跨块新增修订 reject - 内容全部删除', () => {
  const { container, service, createRange } = createEnv(
    '<div>123</div><div>456</div><div>789</div>'
  );
  const revision = service.createInsert({ range: createRange(2, 4), author: 'test' });
  service.reject(revision);

  return (
    assert(!container.querySelector('.revision-insert'), '修订标记未移除') &&
    assert(container.textContent === '1256789', `内容错误: "${container.textContent}"`)
  );
});

test('5.2 跨块删除修订 reject - 内容恢复', () => {
  const { container, service, createRange } = createEnv(
    '<div>123</div><div>456</div><div>789</div>'
  );
  const revision = service.createDelete({ range: createRange(2, 4), author: 'test' });
  service.reject(revision);

  return (
    assert(!container.querySelector('.revision-delete'), '修订标记未移除') &&
    assert(container.querySelectorAll(':scope > div').length === 3, '块布局被破坏') &&
    assert(container.textContent === '123456789', `内容错误: "${container.textContent}"`)
  );
});

/* ==================== 6. 跨块全部选中 ==================== */

console.log('\n=== 6. 跨块全部选中 ===');

test('6.1 整块选中的新增修订', () => {
  const { container, service, createRange } = createEnv(
    '<div>12</div><div>34</div><div>56</div>'
  );
  /* 选中全部 "123456" */
  const revision = service.createInsert({ range: createRange(0, 6), author: 'test' });

  const divs = container.querySelectorAll(':scope > div');
  const revisionSpans = container.querySelectorAll('.revision-insert');
  return (
    assert(divs.length === 3, `块数量应为3: ${divs.length}`) &&
    assert(revisionSpans.length === 3, `标记数量应为3: ${revisionSpans.length}`) &&
    assert(revision.getText() === '123456', `getText 错误: "${revision.getText()}"`)
  );
});

test('6.2 整块选中的新增修订 - accept', () => {
  const { container, service, createRange } = createEnv(
    '<div>12</div><div>34</div><div>56</div>'
  );
  const revision = service.createInsert({ range: createRange(0, 6), author: 'test' });
  service.accept(revision);

  return (
    assert(!container.querySelector('.revision-insert'), '标记未移除') &&
    assert(container.querySelectorAll(':scope > div').length === 3, '块布局被破坏') &&
    assert(container.textContent === '123456', `内容错误: "${container.textContent}"`)
  );
});

test('6.3 整块选中的新增修订 - reject', () => {
  const { container, service, createRange } = createEnv(
    '<div>12</div><div>34</div><div>56</div>'
  );
  const revision = service.createInsert({ range: createRange(0, 6), author: 'test' });
  service.reject(revision);

  return (
    assert(!container.querySelector('.revision-insert'), '标记未移除') &&
    assert(container.textContent === '', `内容应为空: "${container.textContent}"`)
  );
});

/* ==================== 7. 边界情况 ==================== */

console.log('\n=== 7. 边界情况 ===');

test('7.1 纯行内文本（无块元素）- 不走跨块逻辑', () => {
  const { container, service, createRange } = createEnv('Hello World');
  service.createInsert({ range: createRange(0, 5), author: 'test' });

  const revisionSpans = container.querySelectorAll('.revision-insert');
  return (
    assert(revisionSpans.length === 1, `标记数量应为1: ${revisionSpans.length}`) &&
    assert(revisionSpans[0].textContent === 'Hello', `内容错误: "${revisionSpans[0].textContent}"`)
  );
});

test('7.2 跨块内部分选中', () => {
  const { container, service, createRange } = createEnv(
    '<div>1234</div><div>5678</div>'
  );
  /* 选中 "2345" (位置 1-5)，跨过块边界 */
  service.createInsert({ range: createRange(1, 5), author: 'test' });

  const divs = container.querySelectorAll(':scope > div');
  const revisionSpans = container.querySelectorAll('.revision-insert');
  return (
    assert(divs.length === 2, `块数量应为2: ${divs.length}`) &&
    assert(revisionSpans.length === 2, `标记数量应为2: ${revisionSpans.length}`) &&
    assert(revisionSpans[0].textContent === '234', `第1个标记错误: "${revisionSpans[0].textContent}"`) &&
    assert(revisionSpans[1].textContent === '5', `第2个标记错误: "${revisionSpans[1].textContent}"`) &&
    assert(divs[0].textContent === '1234', `第1块全文错误: "${divs[0].textContent}"`) &&
    assert(divs[1].textContent === '5678', `第2块全文错误: "${divs[1].textContent}"`)
  );
});

/* ==================== 8. 跨块修订解决后的段落合并 ==================== */

console.log('\n=== 8. 跨块修订解决后的段落合并 ===');

test('8.1 跨块新增修订拒绝 - 段落合并', () => {
  const { container, service, createRange } = createEnv(
    '<div>ABC</div><div>DEF</div>'
  );
  /* 选中 "CDE" 跨越两个段落 (位置 2-5) */
  const revision = service.createInsert({ range: createRange(2, 5), author: 'test' });
  service.reject(revision);

  const divs = container.querySelectorAll(':scope > div');
  return (
    assert(divs.length === 1, `应合并为1个段落: ${divs.length}`) &&
    assert(divs[0].textContent === 'ABF', `合并后内容错误: "${divs[0].textContent}"`)
  );
});

test('8.2 跨块删除修订接受 - 段落合并', () => {
  const { container, service, createRange } = createEnv(
    '<div>ABC</div><div>DEF</div>'
  );
  /* 选中 "CDE" 跨越两个段落 */
  const revision = service.createDelete({ range: createRange(2, 5), author: 'test' });
  service.accept(revision);

  const divs = container.querySelectorAll(':scope > div');
  return (
    assert(divs.length === 1, `应合并为1个段落: ${divs.length}`) &&
    assert(divs[0].textContent === 'ABF', `合并后内容错误: "${divs[0].textContent}"`)
  );
});

test('8.3 跨块新增修订接受 - 不合并', () => {
  const { container, service, createRange } = createEnv(
    '<div>ABC</div><div>DEF</div>'
  );
  const revision = service.createInsert({ range: createRange(2, 5), author: 'test' });
  service.accept(revision);

  const divs = container.querySelectorAll(':scope > div');
  return (
    assert(divs.length === 2, `段落数量应为2: ${divs.length}`) &&
    assert(divs[0].textContent === 'ABC', `第1段错误: "${divs[0].textContent}"`) &&
    assert(divs[1].textContent === 'DEF', `第2段错误: "${divs[1].textContent}"`)
  );
});

test('8.4 跨块删除修订拒绝 - 不合并', () => {
  const { container, service, createRange } = createEnv(
    '<div>ABC</div><div>DEF</div>'
  );
  const revision = service.createDelete({ range: createRange(2, 5), author: 'test' });
  service.reject(revision);

  const divs = container.querySelectorAll(':scope > div');
  return (
    assert(divs.length === 2, `段落数量应为2: ${divs.length}`) &&
    assert(divs[0].textContent === 'ABC', `第1段错误: "${divs[0].textContent}"`) &&
    assert(divs[1].textContent === 'DEF', `第2段错误: "${divs[1].textContent}"`)
  );
});

test('8.5 跨块新增修订拒绝 - 全选三段', () => {
  const { container, service, createRange } = createEnv(
    '<div>AA</div><div>BB</div><div>CC</div>'
  );
  /* 全选 "AABBCC" */
  const revision = service.createInsert({ range: createRange(0, 6), author: 'test' });
  service.reject(revision);

  return assert(
    container.children.length === 0,
    `全选拒绝后应为空: children 数量 ${container.children.length}`
  );
});

test('8.6 跨块删除修订接受 - 全选三段', () => {
  const { container, service, createRange } = createEnv(
    '<div>AA</div><div>BB</div><div>CC</div>'
  );
  const revision = service.createDelete({ range: createRange(0, 6), author: 'test' });
  service.accept(revision);

  return assert(
    container.children.length === 0,
    `全选接受后应为空: children 数量 ${container.children.length}`
  );
});

test('8.7 非跨块修订 - 不合并', () => {
  const { container, service, createRange } = createEnv(
    '<div>ABC</div><div>DEF</div>'
  );
  /* 只在第一段内创建修订 */
  const revision = service.createInsert({ range: createRange(0, 2), author: 'test' });
  service.reject(revision);

  const divs = container.querySelectorAll(':scope > div');
  return (
    assert(divs.length === 2, `段落数量应为2: ${divs.length}`) &&
    assert(divs[0].textContent === 'C', `第1段错误: "${divs[0].textContent}"`) &&
    assert(divs[1].textContent === 'DEF', `第2段错误: "${divs[1].textContent}"`)
  );
});

test('8.8 跨块新增修订拒绝 - 部分选中', () => {
  const { container, service, createRange } = createEnv(
    '<div>1234</div><div>5678</div>'
  );
  /* 选中 "345" (位置 2-5) */
  const revision = service.createInsert({ range: createRange(2, 5), author: 'test' });
  service.reject(revision);

  const divs = container.querySelectorAll(':scope > div');
  return (
    assert(divs.length === 1, `应合并为1个段落: ${divs.length}`) &&
    assert(divs[0].textContent === '12678', `合并后内容错误: "${divs[0].textContent}"`)
  );
});

/* ==================== 9. 部分接受/拒绝跨块修订 ==================== */

console.log('\n=== 9. 部分接受/拒绝跨块修订 ===');

test('9.1 跨块删除修订部分接受 - 跨块范围 → 合并段落', () => {
  const { container, service, createRange } = createEnv(
    '<div>ABC</div><div>DEF</div>'
  );
  /* 删除修订覆盖 "BCDE" (位置 1-5) */
  service.createDelete({ range: createRange(1, 5), author: 'test' });
  /* 部分接受 "CD" (位置 2-4) → 删除 CD，保留 B 和 E */
  service.acceptInRange(2, 4);

  const divs = container.querySelectorAll(':scope > div');
  return (
    assert(divs.length === 1, `应合并为1个段落: ${divs.length}`) &&
    assert(divs[0].textContent === 'ABEF', `内容错误: "${divs[0].textContent}"`)
  );
});

test('9.2 跨块新增修订部分拒绝 - 跨块范围 → 合并段落', () => {
  const { container, service, createRange } = createEnv(
    '<div>ABC</div><div>DEF</div>'
  );
  /* 新增修订覆盖 "BCDE" (位置 1-5) */
  service.createInsert({ range: createRange(1, 5), author: 'test' });
  /* 部分拒绝 "CD" (位置 2-4) → 删除 CD，保留 B 和 E */
  service.rejectInRange(2, 4);

  const divs = container.querySelectorAll(':scope > div');
  return (
    assert(divs.length === 1, `应合并为1个段落: ${divs.length}`) &&
    assert(divs[0].textContent === 'ABEF', `内容错误: "${divs[0].textContent}"`)
  );
});

test('9.3 跨块删除修订部分接受 - 非跨块范围 → 不合并', () => {
  const { container, service, createRange } = createEnv(
    '<div>ABC</div><div>DEF</div>'
  );
  /* 删除修订覆盖 "BCDE" (位置 1-5) */
  service.createDelete({ range: createRange(1, 5), author: 'test' });
  /* 部分接受 "B" (位置 1-2) → 删除 B，保留 CDE */
  service.acceptInRange(1, 2);

  const divs = container.querySelectorAll(':scope > div');
  return (
    assert(divs.length === 2, `段落数量应为2: ${divs.length}`) &&
    assert(container.textContent === 'ACDEF', `内容错误: "${container.textContent}"`)
  );
});

test('9.4 跨块删除修订接受 - 最后一个块被清空 → 继续合并下一块', () => {
  const { container, service, createRange } = createEnv(
    '<div>AB</div><div>CD</div><div>EF</div>'
  );
  /* 删除修订覆盖 "BCD" (位置 1-4), 跨块1和块2 */
  const revision = service.createDelete({ range: createRange(1, 4), author: 'test' });
  service.accept(revision);

  const divs = container.querySelectorAll(':scope > div');
  return (
    assert(divs.length === 1, `应合并为1个段落: ${divs.length}`) &&
    assert(divs[0].textContent === 'AEF', `内容错误: "${divs[0].textContent}"`)
  );
});

test('9.5 跨块新增修订拒绝 - 最后一个块被清空 → 继续合并下一块', () => {
  const { container, service, createRange } = createEnv(
    '<div>AB</div><div>CD</div><div>EF</div>'
  );
  /* 新增修订覆盖 "BCD" (位置 1-4), 跨块1和块2 */
  const revision = service.createInsert({ range: createRange(1, 4), author: 'test' });
  service.reject(revision);

  const divs = container.querySelectorAll(':scope > div');
  return (
    assert(divs.length === 1, `应合并为1个段落: ${divs.length}`) &&
    assert(divs[0].textContent === 'AEF', `内容错误: "${divs[0].textContent}"`)
  );
});

test('9.6 跨块删除修订部分接受 - 最后一个块被清空 → 继续合并下一块', () => {
  const { container, service, createRange } = createEnv(
    '<div>AB</div><div>CD</div><div>EF</div>'
  );
  /* 删除修订覆盖 "ABCD" (位置 0-4) */
  service.createDelete({ range: createRange(0, 4), author: 'test' });
  /* 部分接受 "BCD" (位置 1-4) → 删除 BCD，保留 A */
  service.acceptInRange(1, 4);

  const divs = container.querySelectorAll(':scope > div');
  return (
    assert(divs.length === 1, `应合并为1个段落: ${divs.length}`) &&
    assert(divs[0].textContent === 'AEF', `内容错误: "${divs[0].textContent}"`)
  );
});

/* ==================== 结果汇总 ==================== */

console.log(`\n${'='.repeat(50)}`);
console.log(`总计: ${totalPassed + totalFailed} 个测试`);
console.log(`通过: ${totalPassed} ✅  失败: ${totalFailed} ❌`);
if (allFailures.length > 0) {
  console.log('\n失败列表:');
  for (const name of allFailures) {
    console.log(`  - ${name}`);
  }
}

process.exit(totalFailed === 0 ? 0 : 1);
