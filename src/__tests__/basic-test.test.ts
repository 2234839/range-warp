import { JSDOM } from 'jsdom';
import { DOMRangeAdapter, registerContainerConfig } from '../core/adapters/DOMRangeAdapter.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
});

global.window = dom.window as any;
global.document = dom.window.document;
global.Node = dom.window.Node;
global.Text = dom.window.Text;
global.Element = dom.window.Element;
global.NodeFilter = dom.window.NodeFilter;

/* 注册标准样式配置 */
registerContainerConfig('bold', { tagName: 'strong', display: 'inline' });
registerContainerConfig('italic', { tagName: 'em', display: 'inline' });
registerContainerConfig('underline', { tagName: 'u', display: 'inline' });
registerContainerConfig('strikethrough', { tagName: 's', display: 'inline' });
registerContainerConfig('highlight', { tagName: 'mark', display: 'inline' });

const container = dom.window.document.createElement('div');
container.innerHTML = '<strong>a</strong>b<strong>c</strong>';
const adapter = new DOMRangeAdapter({ container });

console.log('初始:', container.innerHTML);
adapter.applyConfig(0, 3, 'italic');
console.log('结果:', container.innerHTML);
console.log('预期: <em><strong>a</strong>b<strong>c</strong></em>');

const passed = container.innerHTML === '<em><strong>a</strong>b<strong>c</strong></em>';
console.log(passed ? '✅ 通过' : '❌ 失败');

process.exit(passed ? 0 : 1);
