/**
 * Revision 测试
 *
 * 测试路径: tsx src/__tests__/revision.test.ts
 *
 * 测试覆盖:
 * 1. 新增修订 - 创建、接受、拒绝
 * 2. 删除修订 - 创建、接受、拒绝
 * 3. 接受/拒绝修订的正确性验证
 * 4. 新增与删除修订互不嵌套
 * 5. 带样式文本的修订（样式修订）
 * 6. 通过范围 API 接受/拒绝修订（支持拆分）
 * 7. 查询修订
 * 8. 边界情况与混合操作
 */

import { JSDOM } from 'jsdom';
import { DOMRangeAdapter } from '../core/adapters/DOMRangeAdapter.js';
import { RevisionService } from '../core/services/RevisionService.js';
import { Range } from '../core/models/Range.js';

/** JSDOM 环境初始化 */
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
});
global.window = dom.window as any;
global.document = dom.window.document;
global.Node = dom.window.Node;
global.Text = dom.window.Text;
global.Element = dom.window.Element;
global.NodeFilter = dom.window.NodeFilter;

/* ==================== 测试基础设施 ==================== */

let totalPassed = 0;
let totalFailed = 0;
const allFailures: string[] = [];

/** 运行单个测试 */
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
  }
}

/** 断言并输出失败原因 */
function assert(condition: boolean, message: string): boolean {
  if (!condition) {
    console.log(`     → ${message}`);
  }
  return condition;
}

/**
 * 创建测试环境
 * @param html 初始 HTML 内容
 */
function createEnv(html: string) {
  const container = document.createElement('div');
  container.innerHTML = html;
  const adapter = new DOMRangeAdapter({ container });
  const service = new RevisionService(adapter);
  const createRange = (start: number, end: number) =>
    new Range({ start, end, adapter });
  return { container, adapter, service, createRange };
}

/* ==================== 1. 新增修订 ==================== */

console.log('\n=== 1. 新增修订 ===');

test('1.1 创建新增修订 - DOM 结构正确', () => {
  const { container, service, createRange } = createEnv('Hello World');
  service.createInsert({ range: createRange(0, 5), author: 'test' });

  const span = container.querySelector('.revision-insert');
  return (
    assert(!!span, 'revision-insert 元素不存在') &&
    assert(span!.textContent === 'Hello', `内容错误: "${span!.textContent}"`) &&
    assert(
      span!.getAttribute('data-revision-type') === 'insert',
      'data-revision-type 错误'
    )
  );
});

test('1.2 创建新增修订 - 文本仍然可见', () => {
  const { adapter, service, createRange } = createEnv('Hello World');
  service.createInsert({ range: createRange(0, 5), author: 'test' });

  return assert(
    adapter.getText(0, 11) === 'Hello World',
    `文本不可见: "${adapter.getText(0, 11)}"`
  );
});

test('1.3 创建新增修订 - metadata 正确', () => {
  const { service, createRange } = createEnv('Hello World');
  const revision = service.createInsert({
    range: createRange(0, 5),
    author: 'Alice',
    comment: '新增文本',
  });

  return (
    assert(revision.metadata.type === 'insert', `类型错误: ${revision.metadata.type}`) &&
    assert(revision.metadata.author === 'Alice', `作者错误: ${revision.metadata.author}`) &&
    assert(
      revision.metadata.comment === '新增文本',
      `注释错误: ${revision.metadata.comment}`
    ) &&
    assert(revision.getText() === 'Hello', `getText 错误: "${revision.getText()}"`)
  );
});

test('1.4 创建多个独立新增修订', () => {
  const { service, createRange } = createEnv('Hello World');
  service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.createInsert({ range: createRange(6, 11), author: 'test' });

  const revisions = service.getAll();
  return (
    assert(revisions.length === 2, `修订数量错误: ${revisions.length}`) &&
    assert(revisions[0].getText() === 'Hello', `第一个内容错误`) &&
    assert(revisions[1].getText() === 'World', `第二个内容错误`)
  );
});

test('1.5 创建多个相邻新增修订 - 自动合并', () => {
  const { container, service, createRange } = createEnv('Hello World');
  service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.createInsert({ range: createRange(5, 11), author: 'test' });

  const revisions = service.getAll();
  return (
    assert(revisions.length === 1, `修订数量错误: ${revisions.length}`) &&
    assert(
      container.textContent === 'Hello World',
      `全文错误: "${container.textContent}"`
    )
  );
});

/* ==================== 2. 删除修订 ==================== */

console.log('\n=== 2. 删除修订 ===');

test('2.1 创建删除修订 - DOM 结构正确', () => {
  const { container, service, createRange } = createEnv('Hello World');
  service.createDelete({ range: createRange(6, 11), author: 'test' });

  const span = container.querySelector('.revision-delete');
  return (
    assert(!!span, 'revision-delete 元素不存在') &&
    assert(
      span!.textContent === 'World',
      `内容错误: "${span!.textContent}"`
    ) &&
    assert(
      span!.getAttribute('data-revision-type') === 'delete',
      'data-revision-type 错误'
    )
  );
});

test('2.2 创建删除修订 - 文本仍然存在于 DOM', () => {
  const { adapter, service, createRange } = createEnv('Hello World');
  service.createDelete({ range: createRange(6, 11), author: 'test' });

  return assert(
    adapter.getText(0, 11) === 'Hello World',
    `文本被意外删除: "${adapter.getText(0, 11)}"`
  );
});

test('2.3 创建删除修订 - metadata 正确', () => {
  const { service, createRange } = createEnv('Hello World');
  const revision = service.createDelete({
    range: createRange(6, 11),
    author: 'Bob',
    comment: '删除操作',
  });

  return (
    assert(revision.metadata.type === 'delete', `类型错误: ${revision.metadata.type}`) &&
    assert(revision.metadata.author === 'Bob', `作者错误: ${revision.metadata.author}`) &&
    assert(revision.getText() === 'World', `getText 错误: "${revision.getText()}"`)
  );
});

test('2.4 创建多个独立删除修订', () => {
  const { service, createRange } = createEnv('Hello World');
  service.createDelete({ range: createRange(0, 5), author: 'test' });
  service.createDelete({ range: createRange(6, 11), author: 'test' });

  const revisions = service.getAll();
  return (
    assert(revisions.length === 2, `修订数量错误: ${revisions.length}`) &&
    assert(revisions[0].getText() === 'Hello', `第一个内容错误`) &&
    assert(revisions[1].getText() === 'World', `第二个内容错误`)
  );
});

/* ==================== 3. 接受/拒绝修订 ==================== */

console.log('\n=== 3. 接受新增修订 ===');

test('3.1 接受新增修订 - 内容保留，标记移除', () => {
  const { container, service, createRange } = createEnv('Hello World');
  const revision = service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.accept(revision);

  return (
    assert(!container.querySelector('.revision-insert'), '修订标记未移除') &&
    assert(
      container.textContent === 'Hello World',
      `内容错误: "${container.textContent}"`
    )
  );
});

test('3.2 接受新增修订 - 修订列表更新', () => {
  const { service, createRange } = createEnv('Hello World');
  const revision = service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.accept(revision);

  return assert(
    service.getAll().length === 0,
    `修订列表不为空，数量: ${service.getAll().length}`
  );
});

test('3.3 接受多个新增修订', () => {
  const { container, service, createRange } = createEnv('Hello World');
  const r1 = service.createInsert({ range: createRange(0, 5), author: 'test' });
  const r2 = service.createInsert({ range: createRange(6, 11), author: 'test' });
  service.accept(r1);
  service.accept(r2);

  return (
    assert(!container.querySelector('.revision-insert'), '修订标记未全部移除') &&
    assert(
      container.textContent === 'Hello World',
      `内容错误: "${container.textContent}"`
    ) &&
    assert(service.getAll().length === 0, '修订列表不为空')
  );
});

console.log('\n=== 4. 拒绝新增修订 ===');

test('4.1 拒绝新增修订 - 内容被删除', () => {
  const { container, service, createRange } = createEnv('Hello World');
  const revision = service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.reject(revision);

  return assert(
    container.textContent === ' World',
    `内容错误: "${container.textContent}"`
  );
});

test('4.2 拒绝新增修订 - 修订列表更新', () => {
  const { service, createRange } = createEnv('Hello World');
  const revision = service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.reject(revision);

  return assert(
    service.getAll().length === 0,
    `修订列表不为空，数量: ${service.getAll().length}`
  );
});

test('4.3 拒绝新增修订 - 无残留修订元素', () => {
  const { container, service, createRange } = createEnv('Hello World');
  const revision = service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.reject(revision);

  return assert(
    !container.querySelector('[data-revision-id]'),
    '仍有残留的修订元素'
  );
});

console.log('\n=== 5. 接受删除修订 ===');

test('5.1 接受删除修订 - 内容永久删除', () => {
  const { container, service, createRange } = createEnv('Hello World');
  const revision = service.createDelete({ range: createRange(6, 11), author: 'test' });
  service.accept(revision);

  return assert(
    container.textContent === 'Hello ',
    `内容错误: "${container.textContent}"`
  );
});

test('5.2 接受删除修订 - 修订列表更新', () => {
  const { service, createRange } = createEnv('Hello World');
  const revision = service.createDelete({ range: createRange(6, 11), author: 'test' });
  service.accept(revision);

  return assert(service.getAll().length === 0, `修订列表不为空`);
});

test('5.3 接受多个删除修订', () => {
  const { container, service, createRange } = createEnv('Hello World');
  const r1 = service.createDelete({ range: createRange(0, 5), author: 'test' });
  const r2 = service.createDelete({ range: createRange(6, 11), author: 'test' });
  service.accept(r1);
  service.accept(r2);

  return (
    assert(container.textContent === ' ', `内容应为空格: "${container.textContent}"`) &&
    assert(service.getAll().length === 0, '修订列表不为空')
  );
});

console.log('\n=== 6. 拒绝删除修订 ===');

test('6.1 拒绝删除修订 - 内容恢复', () => {
  const { container, service, createRange } = createEnv('Hello World');
  const revision = service.createDelete({ range: createRange(6, 11), author: 'test' });
  service.reject(revision);

  return assert(
    container.textContent === 'Hello World',
    `内容错误: "${container.textContent}"`
  );
});

test('6.2 拒绝删除修订 - 修订标记完全移除', () => {
  const { container, service, createRange } = createEnv('Hello World');
  const revision = service.createDelete({ range: createRange(6, 11), author: 'test' });
  service.reject(revision);

  return (
    assert(!container.querySelector('.revision-delete'), 'revision-delete 未移除') &&
    assert(
      !container.querySelector('[data-revision-id]'),
      '仍有残留修订属性'
    )
  );
});

test('6.3 拒绝删除修订 - 修订列表更新', () => {
  const { service, createRange } = createEnv('Hello World');
  const revision = service.createDelete({ range: createRange(6, 11), author: 'test' });
  service.reject(revision);

  return assert(service.getAll().length === 0, `修订列表不为空`);
});

/* ==================== 7. 新增与删除修订互不嵌套 ==================== */

console.log('\n=== 7. 新增与删除修订互不嵌套 ===');

test('7.1 同区域新增后删除 - 不产生嵌套', () => {
  const { container, service, createRange } = createEnv('Hello');

  service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.createDelete({ range: createRange(0, 5), author: 'test' });

  const insertInsideDelete = container.querySelector(
    '.revision-delete .revision-insert'
  );
  const deleteInsideInsert = container.querySelector(
    '.revision-insert .revision-delete'
  );

  return (
    assert(!insertInsideDelete, '新增修订嵌套在删除修订中') &&
    assert(!deleteInsideInsert, '删除修订嵌套在新增修订中')
  );
});

test('7.2 删除后新增 - 不产生嵌套', () => {
  const { container, service, createRange } = createEnv('Hello');

  service.createDelete({ range: createRange(0, 5), author: 'test' });
  service.createInsert({ range: createRange(0, 5), author: 'test' });

  const insertInsideDelete = container.querySelector(
    '.revision-delete .revision-insert'
  );
  const deleteInsideInsert = container.querySelector(
    '.revision-insert .revision-delete'
  );

  return (
    assert(!insertInsideDelete, '新增修订嵌套在删除修订中') &&
    assert(!deleteInsideInsert, '删除修订嵌套在新增修订中')
  );
});

test('7.3 相邻区域的新增和删除 - 独立存在', () => {
  const { container, service, createRange } = createEnv('Hello World');

  service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.createDelete({ range: createRange(6, 11), author: 'test' });

  const revisions = service.getAll();
  return (
    assert(revisions.length === 2, `修订数量错误: ${revisions.length}`) &&
    assert(!container.querySelector('.revision-insert .revision-delete'), '存在嵌套') &&
    assert(!container.querySelector('.revision-delete .revision-insert'), '存在嵌套')
  );
});

test('7.4 新增后部分删除 - 保留非重叠部分', () => {
  /* insert [0,3]=abc, delete [1,3]=bc → "a" 保持 insert, "bc" 变为 delete */
  const { service, createRange } = createEnv('abcd');

  service.createInsert({ range: createRange(0, 3), author: 'test' });
  service.createDelete({ range: createRange(1, 3), author: 'test' });

  const revisions = service.getAll();
  const inserts = revisions.filter(r => r.metadata.type === 'insert');
  const deletes = revisions.filter(r => r.metadata.type === 'delete');
  return (
    assert(revisions.length === 2, `修订数量错误: ${revisions.length}`) &&
    assert(inserts.length === 1 && inserts[0].getText() === 'a', `insert 修订内容错误: "${inserts[0]?.getText()}"`) &&
    assert(deletes.length === 1 && deletes[0].getText() === 'bc', `delete 修订内容错误: "${deletes[0]?.getText()}"`)
  );
});

test('7.5 删除后部分新增 - 保留非重叠部分', () => {
  /* delete [0,3]=abc, insert [1,3]=bc → "a" 保持 delete, "bc" 变为 insert */
  const { service, createRange } = createEnv('abcd');

  service.createDelete({ range: createRange(0, 3), author: 'test' });
  service.createInsert({ range: createRange(1, 3), author: 'test' });

  const revisions = service.getAll();
  const inserts = revisions.filter(r => r.metadata.type === 'insert');
  const deletes = revisions.filter(r => r.metadata.type === 'delete');
  return (
    assert(revisions.length === 2, `修订数量错误: ${revisions.length}`) &&
    assert(inserts.length === 1 && inserts[0].getText() === 'bc', `insert 修订内容错误: "${inserts[0]?.getText()}"`) &&
    assert(deletes.length === 1 && deletes[0].getText() === 'a', `delete 修订内容错误: "${deletes[0]?.getText()}"`)
  );
});

test('7.6 新增后中间删除 - 保留前后部分', () => {
  /* insert [0,4]=abcd, delete [1,3]=bc → "a"+"d" 保持 insert, "bc" 变为 delete */
  const { service, createRange } = createEnv('abcd');

  service.createInsert({ range: createRange(0, 4), author: 'test' });
  service.createDelete({ range: createRange(1, 3), author: 'test' });

  const revisions = service.getAll();
  const inserts = revisions.filter(r => r.metadata.type === 'insert');
  const deletes = revisions.filter(r => r.metadata.type === 'delete');
  return (
    assert(inserts.length === 2, `新增修订数量错误: ${inserts.length}`) &&
    assert(deletes.length === 1, `删除修订数量错误: ${deletes.length}`) &&
    assert(deletes[0].getText() === 'bc', `删除修订内容错误: "${deletes[0].getText()}"`)
  );
});

test('7.7 删除后中间新增 - 保留前后部分', () => {
  /* delete [0,4]=abcd, insert [1,3]=bc → "a"+"d" 保持 delete, "bc" 变为 insert */
  const { service, createRange } = createEnv('abcd');

  service.createDelete({ range: createRange(0, 4), author: 'test' });
  service.createInsert({ range: createRange(1, 3), author: 'test' });

  const revisions = service.getAll();
  const deletes = revisions.filter(r => r.metadata.type === 'delete');
  const inserts = revisions.filter(r => r.metadata.type === 'insert');
  return (
    assert(deletes.length === 2, `删除修订数量错误: ${deletes.length}`) &&
    assert(inserts.length === 1, `新增修订数量错误: ${inserts.length}`) &&
    assert(inserts[0].getText() === 'bc', `新增修订内容错误: "${inserts[0].getText()}"`)
  );
});

/* ==================== 8. 带样式文本的修订 ==================== */

console.log('\n=== 8. 带样式文本的修订 ===');

test('8.1 对加粗文本创建新增修订 - 样式保留', () => {
  const { container, service, createRange } = createEnv('<strong>Hello</strong> World');
  service.createInsert({ range: createRange(0, 5), author: 'test' });

  const insertSpan = container.querySelector('.revision-insert');
  const strong = insertSpan?.querySelector('strong');
  return (
    assert(!!strong, '加粗标记丢失') &&
    assert(strong!.textContent === 'Hello', `加粗内容错误: "${strong!.textContent}"`)
  );
});

test('8.2 接受带样式的新增修订 - 样式保留', () => {
  const { container, service, createRange } = createEnv('<strong>Hello</strong> World');

  const revision = service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.accept(revision);

  const strong = container.querySelector('strong');
  return (
    assert(!!strong, '加粗标记丢失') &&
    assert(strong!.textContent === 'Hello', `加粗内容错误: "${strong!.textContent}"`) &&
    assert(!container.querySelector('.revision-insert'), '修订标记未移除')
  );
});

test('8.3 拒绝带样式的新增修订 - 内容删除', () => {
  const { container, service, createRange } = createEnv('<strong>Hello</strong> World');

  const revision = service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.reject(revision);

  return assert(
    container.textContent === ' World',
    `内容错误: "${container.textContent}"`
  );
});

test('8.4 对加粗文本创建删除修订 - 样式保留', () => {
  const { container, service, createRange } = createEnv('<strong>Hello</strong> World');
  service.createDelete({ range: createRange(0, 5), author: 'test' });

  const deleteSpan = container.querySelector('.revision-delete');
  const strong = deleteSpan?.querySelector('strong');
  return (
    assert(!!deleteSpan, 'revision-delete 元素不存在') &&
    assert(!!strong, '加粗标记丢失') &&
    assert(strong!.textContent === 'Hello', `加粗内容错误: "${strong!.textContent}"`)
  );
});

test('8.5 拒绝带样式的删除修订 - 样式恢复', () => {
  const { container, service, createRange } = createEnv('<strong>Hello</strong> World');

  const revision = service.createDelete({ range: createRange(0, 5), author: 'test' });
  service.reject(revision);

  const strong = container.querySelector('strong');
  return (
    assert(!!strong, '加粗标记未恢复') &&
    assert(strong!.textContent === 'Hello', `加粗内容错误: "${strong!.textContent}"`)
  );
});

test('8.6 接受带样式的删除修订 - 内容永久删除', () => {
  const { container, service, createRange } = createEnv('<strong>Hello</strong> World');

  const revision = service.createDelete({ range: createRange(0, 5), author: 'test' });
  service.accept(revision);

  return assert(
    container.textContent === ' World',
    `内容错误: "${container.textContent}"`
  );
});

test('8.7 对嵌套样式文本创建新增修订', () => {
  const { container, service, createRange } = createEnv('<strong><em>Hello</em></strong> World');
  service.createInsert({ range: createRange(0, 5), author: 'test' });

  const insertSpan = container.querySelector('.revision-insert');
  const em = insertSpan?.querySelector('em');
  const strong = insertSpan?.querySelector('strong');
  return (
    assert(!!em, 'em 标记丢失') &&
    assert(!!strong, 'strong 标记丢失') &&
    assert(
      container.textContent === 'Hello World',
      `全文错误: "${container.textContent}"`
    )
  );
});

/* ==================== 9. 通过范围 API 接受/拒绝修订 ==================== */

console.log('\n=== 9. 通过范围 API 接受/拒绝修订 ===');

test('9.1 acceptInRange - 范围完全包含所有修订', () => {
  const { service, createRange } = createEnv('Hello World');
  service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.createInsert({ range: createRange(6, 11), author: 'test' });

  service.acceptInRange(0, 11);

  return assert(
    service.getAll().length === 0,
    `修订列表不为空，数量: ${service.getAll().length}`
  );
});

test('9.2 acceptInRange - 只接受部分修订', () => {
  const { service, createRange } = createEnv('Hello World');
  service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.createInsert({ range: createRange(6, 11), author: 'test' });

  service.acceptInRange(0, 5);

  const remaining = service.getAll();
  return (
    assert(remaining.length === 1, `应剩余1个修订，实际: ${remaining.length}`) &&
    assert(remaining[0].getText() === 'World', `剩余修订内容错误: "${remaining[0].getText()}"`)
  );
});

test('9.3 rejectInRange - 范围完全包含所有修订', () => {
  const { container, service, createRange } = createEnv('Hello World');
  service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.createInsert({ range: createRange(6, 11), author: 'test' });

  service.rejectInRange(0, 11);

  return (
    assert(service.getAll().length === 0, `修订列表不为空`) &&
    assert(container.textContent === ' ', `内容应为空格: "${container.textContent}"`)
  );
});

test('9.4 rejectInRange - 只拒绝部分修订', () => {
  const { container, service, createRange } = createEnv('Hello World');
  service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.createInsert({ range: createRange(6, 11), author: 'test' });

  service.rejectInRange(0, 5);

  const remaining = service.getAll();
  return (
    assert(remaining.length === 1, `应剩余1个修订，实际: ${remaining.length}`) &&
    assert(
      container.textContent === ' World',
      `内容应为 " World": "${container.textContent}"`
    )
  );
});

test('9.5 acceptAll / rejectAll - 批量操作', () => {
  const { container, service, createRange } = createEnv('AB');

  service.createInsert({ range: createRange(0, 1), author: 'test' });
  service.createInsert({ range: createRange(1, 2), author: 'test' });

  const acceptCount = service.acceptAll();
  assert(acceptCount === 1, `acceptAll 数量错误: ${acceptCount}`);
  assert(service.getAll().length === 0, 'acceptAll 后修订列表不为空');
  assert(
    container.textContent === 'AB',
    `acceptAll 后内容错误: "${container.textContent}"`
  );

  /* 重新创建修订测试 rejectAll */
  service.createInsert({ range: createRange(0, 1), author: 'test' });
  service.createInsert({ range: createRange(1, 2), author: 'test' });

  const rejectCount = service.rejectAll();
  return (
    assert(rejectCount === 1, `rejectAll 数量错误: ${rejectCount}`) &&
    assert(service.getAll().length === 0, 'rejectAll 后修订列表不为空') &&
    assert(container.textContent === '', `内容应为空: "${container.textContent}"`)
  );
});

test('9.6 部分接受修订 - 拆分修订范围', () => {
  /* 创建一个覆盖全部文本的新增修订，然后只接受前半部分 */
  const { service, createRange } = createEnv('Hello World');
  service.createInsert({ range: createRange(0, 11), author: 'test' });

  service.acceptInRange(0, 5);

  const remaining = service.getAll();
  return (
    assert(remaining.length === 1, `应剩余1个修订，实际: ${remaining.length}`) &&
    assert(
      remaining[0].getText() === ' World',
      `剩余修订内容错误: "${remaining[0].getText()}"`)
  );
});

test('9.7 部分拒绝修订 - 拆分修订范围', () => {
  /* 创建一个覆盖全部文本的新增修订，然后只拒绝前半部分 */
  const { service, createRange } = createEnv('Hello World');
  service.createInsert({ range: createRange(0, 11), author: 'test' });

  service.rejectInRange(0, 5);

  const remaining = service.getAll();
  return (
    assert(remaining.length === 1, `应剩余1个修订，实际: ${remaining.length}`) &&
    assert(
      remaining[0].getText() === ' World',
      `剩余修订内容错误: "${remaining[0].getText()}"`)
  );
});

/* ==================== 10. 查询修订 ==================== */

console.log('\n=== 10. 查询修订 ===');

test('10.1 query 按类型过滤', () => {
  const { service, createRange } = createEnv('Hello World');
  service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.createDelete({ range: createRange(6, 11), author: 'test' });

  const inserts = service.query({ type: 'insert' });
  const deletes = service.query({ type: 'delete' });

  return (
    assert(inserts.length === 1, `新增修订数量错误: ${inserts.length}`) &&
    assert(deletes.length === 1, `删除修订数量错误: ${deletes.length}`)
  );
});

test('10.2 query 按作者过滤', () => {
  const { service, createRange } = createEnv('Hello World');
  service.createInsert({ range: createRange(0, 5), author: 'Alice' });
  service.createInsert({ range: createRange(6, 11), author: 'Bob' });

  const aliceRevisions = service.query({ author: 'Alice' });
  const bobRevisions = service.query({ author: 'Bob' });

  return (
    assert(aliceRevisions.length === 1, `Alice 修订数量错误: ${aliceRevisions.length}`) &&
    assert(bobRevisions.length === 1, `Bob 修订数量错误: ${bobRevisions.length}`)
  );
});

test('10.3 getById 查找修订', () => {
  const { service, createRange } = createEnv('Hello');
  const revision = service.createInsert({ range: createRange(0, 5), author: 'test' });
  const found = service.getById(revision.metadata.id);

  return (
    assert(!!found, '未找到修订') &&
    assert(found!.metadata.id === revision.metadata.id, 'ID 不匹配')
  );
});

test('10.4 queryInRange 查询范围内修订', () => {
  const { service, createRange } = createEnv('Hello World');
  service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.createInsert({ range: createRange(6, 11), author: 'test' });

  const inRange = service.queryInRange(3, 8);
  /* 应该找到两个修订（都与 [3, 8] 重叠） */
  return assert(
    inRange.length === 2,
    `范围内修订数量错误: ${inRange.length}`
  );
});

test('10.5 queryInRange 无重叠范围', () => {
  const { service, createRange } = createEnv('Hello World');
  service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.createInsert({ range: createRange(6, 11), author: 'test' });

  const inRange = service.queryInRange(5, 6);
  /* [5, 6] 是空格位置，不与任何修订重叠 */
  return assert(
    inRange.length === 0,
    `不应找到修订，实际: ${inRange.length}`
  );
});

/* ==================== 11. 边界情况与混合操作 ==================== */

console.log('\n=== 11. 边界情况与混合操作 ===');

test('11.1 空范围创建新增修订 - 不创建元素', () => {
  const { container, service, createRange } = createEnv('Hello');
  service.createInsert({ range: createRange(2, 2), author: 'test' });

  return assert(
    !container.querySelector('.revision-insert'),
    '空范围不应创建修订元素'
  );
});

test('11.2 连续操作：新增 → 接受 → 新增 → 拒绝', () => {
  const { container, service, createRange } = createEnv('AB');

  const r1 = service.createInsert({ range: createRange(0, 1), author: 'test' });
  service.accept(r1);

  const r2 = service.createInsert({ range: createRange(1, 2), author: 'test' });
  service.reject(r2);

  return (
    assert(container.textContent === 'A', `内容应为 "A": "${container.textContent}"`) &&
    assert(service.getAll().length === 0, '修订列表不为空')
  );
});

test('11.3 混合修订全部接受 - 新增保留、删除移除', () => {
  const { container, service, createRange } = createEnv('Hello World');
  service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.createDelete({ range: createRange(6, 11), author: 'test' });

  service.acceptAll();

  return assert(
    container.textContent === 'Hello ',
    `内容应为 "Hello ": "${container.textContent}"`
  );
});

test('11.4 混合修订全部拒绝 - 新增删除、删除恢复', () => {
  const { container, service, createRange } = createEnv('Hello World');
  service.createInsert({ range: createRange(0, 5), author: 'test' });
  service.createDelete({ range: createRange(6, 11), author: 'test' });

  service.rejectAll();

  return assert(
    container.textContent === ' World',
    `内容应为 " World": "${container.textContent}"`
  );
});

test('11.5 对删除修订中的文本创建新增修订', () => {
  const { container, service, createRange } = createEnv('Hello');

  service.createDelete({ range: createRange(0, 5), author: 'test' });
  service.createInsert({ range: createRange(0, 5), author: 'test' });

  /* 新增和删除不应嵌套 */
  const nested = container.querySelector(
    '.revision-insert .revision-delete, .revision-delete .revision-insert'
  );
  return assert(!nested, '新增和删除修订产生了嵌套');
});

test('11.6 acceptById / rejectById', () => {
  const { container, service, createRange } = createEnv('Hello World');
  const r1 = service.createInsert({ range: createRange(0, 5), author: 'test' });
  const r2 = service.createInsert({ range: createRange(6, 11), author: 'test' });

  service.acceptById(r1.metadata.id);
  service.rejectById(r2.metadata.id);

  return (
    assert(!container.querySelector('.revision-insert'), '修订标记未移除') &&
    assert(container.textContent === 'Hello ', `内容错误: "${container.textContent}"`) &&
    assert(service.getAll().length === 0, '修订列表不为空')
  );
});

/* ==================== 12. 同类型修订不产生自身嵌套 ==================== */

console.log('\n=== 12. 同类型修订不产生自身嵌套 ===');

test('12.1 同区域新增后新增 - 新修订覆盖旧修订', () => {
  const { container, service, createRange } = createEnv('Hello');

  service.createInsert({ range: createRange(0, 5), author: 'Alice' });
  service.createInsert({ range: createRange(0, 5), author: 'Bob' });

  const revisions = service.getAll();
  /* 旧修订被完全覆盖，只剩新修订 */
  return (
    assert(revisions.length === 1, `修订数量错误: ${revisions.length}`) &&
    assert(revisions[0].metadata.author === 'Bob', `应为 Bob 的修订`) &&
    assert(!container.querySelector('.revision-insert .revision-insert'), '产生了嵌套')
  );
});

test('12.2 同区域删除后删除 - 新修订覆盖旧修订', () => {
  const { container, service, createRange } = createEnv('Hello');

  service.createDelete({ range: createRange(0, 5), author: 'Alice' });
  service.createDelete({ range: createRange(0, 5), author: 'Bob' });

  const revisions = service.getAll();
  return (
    assert(revisions.length === 1, `修订数量错误: ${revisions.length}`) &&
    assert(revisions[0].metadata.author === 'Bob', `应为 Bob 的修订`) &&
    assert(!container.querySelector('.revision-delete .revision-delete'), '产生了嵌套')
  );
});

test('12.3 新增后部分新增 - 相邻同类型自动合并', () => {
  /* insert(A) [0,4]=abcd, insert(B) [1,3]=bc → mergeAdjacent: true 时全部合并为一个 */
  const { container, service, createRange } = createEnv('abcd');

  service.createInsert({ range: createRange(0, 4), author: 'Alice' });
  service.createInsert({ range: createRange(1, 3), author: 'Bob' });

  const revisions = service.getAll();
  return (
    assert(!container.querySelector('.revision-insert .revision-insert'), '产生了嵌套') &&
    assert(revisions.length === 1, `修订数量错误: ${revisions.length}`) &&
    assert(revisions[0].getText() === 'abcd', `修订内容错误: "${revisions[0]?.getText()}"`)
  );
});

test('12.4 删除后部分删除 - 相邻同类型自动合并', () => {
  /* delete(A) [0,4]=abcd, delete(B) [1,3]=bc → mergeAdjacent: true 时全部合并为一个 */
  const { container, service, createRange } = createEnv('abcd');

  service.createDelete({ range: createRange(0, 4), author: 'Alice' });
  service.createDelete({ range: createRange(1, 3), author: 'Bob' });

  const revisions = service.getAll();
  return (
    assert(!container.querySelector('.revision-delete .revision-delete'), '产生了嵌套') &&
    assert(revisions.length === 1, `修订数量错误: ${revisions.length}`) &&
    assert(revisions[0].getText() === 'abcd', `修订内容错误: "${revisions[0]?.getText()}"`)
  );
});

test('12.5 新增后中间新增 - 相邻同类型自动合并', () => {
  /* insert(A) [0,4]=abcd, insert(B) [1,3]=bc → mergeAdjacent: true 时全部合并为一个 */
  const { container, service, createRange } = createEnv('abcd');

  service.createInsert({ range: createRange(0, 4), author: 'Alice' });
  service.createInsert({ range: createRange(1, 3), author: 'Bob' });

  const revisions = service.getAll();
  return (
    assert(!container.querySelector('.revision-insert .revision-insert'), '产生了嵌套') &&
    assert(revisions.length === 1, `修订数量错误: ${revisions.length}`) &&
    assert(revisions[0].getText() === 'abcd', `修订内容错误: "${revisions[0]?.getText()}"`)
  );
});

/* ==================== 13. 跨段落修订 ==================== */

console.log('\n=== 13. 跨段落修订 ===');

test('13.1 跨段落新增修订 - 正确拆分', () => {
  const { container, service, createRange } = createEnv('<p>Hello</p><p>World</p>');

  service.createInsert({ range: createRange(2, 8), author: 'test' });

  const insertSpans = container.querySelectorAll('.revision-insert');
  const allIds = new Set<string>();
  for (const span of Array.from(insertSpans)) {
    allIds.add(span.getAttribute('data-revision-id')!);
  }

  /* 应该有两个修订元素（每段一个），共享同一个 revision ID */
  return (
    assert(insertSpans.length === 2, `修订元素数量错误: ${insertSpans.length}`) &&
    assert(allIds.size === 1, `修订 ID 不统一`) &&
    assert(container.textContent === 'HelloWorld', `文本内容错误: "${container.textContent}"`)
  );
});

test('13.2 跨段落删除修订 - 正确拆分', () => {
  const { container, service, createRange } = createEnv('<p>Hello</p><p>World</p>');

  service.createDelete({ range: createRange(2, 8), author: 'test' });

  const deleteSpans = container.querySelectorAll('.revision-delete');
  const allIds = new Set<string>();
  for (const span of Array.from(deleteSpans)) {
    allIds.add(span.getAttribute('data-revision-id')!);
  }

  return (
    assert(deleteSpans.length === 2, `修订元素数量错误: ${deleteSpans.length}`) &&
    assert(allIds.size === 1, `修订 ID 不统一`) &&
    assert(container.textContent === 'HelloWorld', `文本内容错误: "${container.textContent}"`)
  );
});

test('13.3 跨段落修订的接受 - 全部移除', () => {
  const { container, service, createRange } = createEnv('<p>Hello</p><p>World</p>');

  const revision = service.createInsert({ range: createRange(2, 8), author: 'test' });
  service.accept(revision);

  return (
    assert(!container.querySelector('.revision-insert'), '修订标记未移除') &&
    assert(container.textContent === 'HelloWorld', `文本内容错误: "${container.textContent}"`)
  );
});

test('13.4 跨段落修订的拒绝 - 内容删除', () => {
  const { container, service, createRange } = createEnv('<p>Hello</p><p>World</p>');

  const revision = service.createInsert({ range: createRange(2, 8), author: 'test' });
  service.reject(revision);

  return (
    assert(!container.querySelector('.revision-insert'), '修订标记未移除') &&
    assert(container.textContent === 'Held', `文本内容错误: "${container.textContent}"`)
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
