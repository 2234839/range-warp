# Range-Warp

> 基于 DOM Range API 的富文本编辑器框架，实现编辑器无关的书签和修订功能

## ✨ 特性

- 🎯 **编辑器无关**: 核心逻辑不依赖任何特定的富文本编辑器
- 📍 **精确定位**: 基于 Unicode 字符下标，支持准确的文本位置计算
- 🔖 **书签系统**: 完整的书签管理功能（创建、查询、跳转、删除）
- ✏️ **修订系统**: 支持插入/删除修订，可接受/拒绝修订
- 🏗️ **分层架构**: 采用依赖倒置原则和适配器模式
- 🎨 **样式可定制**: 通过 CSS 自定义书签和修订的样式

## 🚀 快速开始

### 安装

```bash
# 克隆项目
git clone https://github.com/your-username/range-warp.git
cd range-warp

# 安装依赖
pnpm install
```

### 运行

```bash
# 开发模式
pnpm dev

# 构建
pnpm build
```

## 📖 使用示例

```vue
<script setup>
import { ref, onMounted } from 'vue';
import { Editor, DOMRangeAdapter } from '@/core';

const editorContainer = ref(null);
let editor = null;

onMounted(() => {
  const adapter = new DOMRangeAdapter({
    container: editorContainer.value
  });

  editor = new Editor({
    adapter,
    currentUser: '张三'
  });
});

function createBookmark() {
  editor.createBookmark({
    name: '我的书签',
    start: 0,
    end: 10
  });
}
</script>

<template>
  <div ref="editorContainer" contenteditable="true"></div>
  <button @click="createBookmark">创建书签</button>
</template>
```

## 🏗️ 架构设计

本项目采用**四层架构**，遵循**依赖倒置原则**：

```
应用层 (Editor)
    ↓
服务层 (BookmarkService, RevisionService)
    ↓
模型层 (Range, Bookmark, Revision)
    ↓
适配器层 (IRangeAdapter, DOMRangeAdapter)
```

### 核心特性

1. **DOM 元素包裹**: 书签和修订直接包裹在 DOM 元素中，自动跟随用户编辑
2. **Unicode 支持**: 完整支持 Unicode 字符的下标计算
3. **编辑器无关**: 通过适配器模式支持任意 contenteditable 编辑器

详细的架构说明请查看 [ARCHITECTURE.md](./ARCHITECTURE.md)

## 📦 核心模块

### 适配器层
- `IRangeAdapter`: 统一接口定义
- `DOMRangeAdapter`: 基于 DOM Range API 的实现

### 模型层
- `Range`: 文本选区抽象
- `Bookmark`: 书签数据模型
- `Revision`: 修订数据模型

### 服务层
- `BookmarkService`: 书签管理服务
- `RevisionService`: 修订管理服务

### 应用层
- `Editor`: 业务逻辑封装

## 🎨 样式系统

核心样式定义在 `src/core/styles.css`，包含：
- 书签样式
- 插入修订样式
- 删除修订样式
- 文本格式样式

## 🔧 开发指南

### 类型检查

```bash
pnpm tsc --noEmit
```

### 代码规范

- 使用 TypeScript 进行类型检查
- 遵循 ESLint 规范
- 使用 JSDoc 注释

## 📚 参考资料

- [DOM Range 规范](https://dom.spec.whatwg.org/#ranges)
- [ContentEditable 规范](https://w3c.github.io/editing/)
- [Peritext - CRDT 算法](https://www.inkandswitch.com/peritext/)

## 📄 许可证

MIT License

---

**项目背景**: 此仓库用于探索 Range 对象在可编辑元素中的应用，实现富文本编辑器的高亮、加粗、书签和修订等功能。