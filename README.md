# Range-Warp

> 基于 DOM Range API 的富文本编辑器框架，实现编辑器无关的书签、修订、样式等功能

## 特性

- **编辑器无关**: 核心逻辑不依赖任何特定的富文本编辑器，已验证原生 contenteditable 和 UEditor Plus
- **跨 iframe 支持**: 自动处理 iframe 内编辑器的样式注入、DOM 操作、选区管理
- **精确定位**: 基于 Unicode 字符下标，支持 emoji 等多码点字符的准确位置计算
- **书签系统**: 创建、查询、跳转、删除，跨块书签自动拆分和修复
- **修订系统**: 插入/删除修订，支持接受/拒绝、部分接受/拒绝、批量操作
- **容器配置系统**: 书签、修订等语义标记通过适配器的容器配置系统创建，确保跨文档兼容
- **文本格式**: 加粗、斜体、下划线、删除线、高亮，支持跨段落应用
- **分层架构**: 适配器层 + 模型层 + 服务层 + 应用层 + 集成层

## 快速开始

### 安装

```bash
git clone https://github.com/your-username/range-warp.git
cd range-warp
pnpm install
```

### 运行

```bash
pnpm dev
```

### 使用

```typescript
import { Editor, DOMRangeAdapter } from './core';

// 原生 contenteditable 编辑器
const adapter = new DOMRangeAdapter({
  container: document.getElementById('editor'),
});

// iframe 编辑器（如 UEditor Plus）
const adapter = new DOMRangeAdapter({
  container: iframeBodyElement,
  ownerWindow: iframe.contentWindow,
});

const editor = new Editor({ adapter, currentUser: '张三' });

// 创建书签
editor.createBookmark({ name: '重要段落', start: 0, end: 10 });

// 应用样式
editor.applyStyle(0, 10, 'bold');

// 创建修订
const range = editor.createRange(0, 10);
editor.revisions.createInsert({ range, author: '张三', comment: '补充内容' });

// 接受/拒绝修订
editor.revisions.acceptAll();
```

## 架构

```
集成层 (useNativeEditor, useUEditorPlus, ...)
    │ 创建 IRangeAdapter 实例
    ▼
应用层 (Editor)
    │ 统一的业务 API
    ▼
服务层 (BookmarkService, RevisionService)
    │ 书签/修订管理
    ▼
模型层 (Range, Bookmark, Revision)
    │ 数据模型
    ▼
适配器层 (IRangeAdapter, DOMRangeAdapter)
    │ DOM 操作抽象
    ▼
浏览器 DOM
```

详细的架构说明请查看 [ARCHITECTURE.md](./ARCHITECTURE.md)

## 跨编辑器集成

`DOMRangeAdapter` 只需要两个输入即可工作：

```typescript
new DOMRangeAdapter({
  container: HTMLElement,    // 编辑器的可编辑区域
  ownerWindow?: Window,      // iframe 场景传入 iframe.contentWindow
});
```

集成新编辑器只需创建一个 composable，封装编辑器特有的容器发现、生命周期管理和事件绑定。

## 测试

```bash
# 适配器测试（64 个用例）
pnpm tsx src/__tests__/adapter.test.ts

# 修订测试（62 个用例）
pnpm tsx src/__tests__/revision.test.ts

# 类型检查
pnpm tsc --noEmit
```

## 许可证

MIT License
