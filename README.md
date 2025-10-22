# Vue 组件库

一个基于 Vue 3 + TypeScript 的现代化组件库，包含基础UI组件和富文本编辑器组件。

## 功能特性

### 基础组件

- **BaseButton**: 功能完整的按钮组件
  - 支持多种尺寸（small/medium/large）
  - 支持多种风格（primary/secondary/outline/text）
  - 支持激活状态和禁用状态
  - 完全可定制的样式

- **BaseInput**: 功能丰富的输入框组件
  - 支持多种输入类型（text/number/email/password等）
  - 支持多种尺寸
  - 内置清除按钮功能
  - 完整的表单验证支持

### 业务组件

- **RangeForm**: 文本范围操作表单
  - 精确控制文本起始和结束位置
  - 支持多种文本格式操作
  - 实时格式预览
  - 完整的表单验证

- **RangeWrap**: 富文本编辑器
  - 支持选中文本格式化（加粗、斜体、下划线、删除线）
  - 基于位置的精确文本操作
  - 关键词高亮功能
  - HTML内容复制
  - 实时格式状态检测

## 快速开始

### 安装依赖

```bash
npm install
# 或
pnpm install
```

### 开发环境

```bash
npm run dev
# 或
pnpm dev
```

### 构建项目

```bash
npm run build
# 或
pnpm build
```

## 使用方法

### 全局安装

```typescript
import { createApp } from 'vue'
import { installComponents } from './components'

const app = createApp(App)
app.use({ install: installComponents })
```

### 按需导入

```typescript
import { BaseButton, BaseInput, RangeForm, RangeWrap } from './components'

export default {
  components: {
    BaseButton,
    BaseInput,
    RangeForm,
    RangeWrap
  }
}
```

### 组件示例

#### BaseButton

```vue
<template>
  <!-- 不同尺寸 -->
  <BaseButton size="small">小按钮</BaseButton>
  <BaseButton size="medium">中按钮</BaseButton>
  <BaseButton size="large">大按钮</BaseButton>

  <!-- 不同风格 -->
  <BaseButton variant="primary">主要按钮</BaseButton>
  <BaseButton variant="secondary">次要按钮</BaseButton>
  <BaseButton variant="outline">轮廓按钮</BaseButton>
  <BaseButton variant="text">文本按钮</BaseButton>

  <!-- 不同状态 -->
  <BaseButton active>激活按钮</BaseButton>
  <BaseButton disabled>禁用按钮</BaseButton>
</template>
```

#### BaseInput

```vue
<template>
  <!-- 基础用法 -->
  <BaseInput v-model="value" placeholder="请输入内容" />

  <!-- 带清除按钮 -->
  <BaseInput v-model="value" clearable @clear="handleClear" />

  <!-- 数字输入 -->
  <BaseInput v-model.number="numberValue" type="number" :min="0" :max="100" />

  <!-- 不同尺寸 -->
  <BaseInput v-model="value" size="large" />
</template>
```

#### RangeForm

```vue
<template>
  <RangeForm
    :start="0"
    :end="10"
    default-format="bold"
    @confirm="handleConfirm"
    @cancel="handleCancel"
  />
</template>

<script setup lang="ts">
const handleConfirm = (start: number, end: number, format: string) => {
  console.log(`应用格式 ${format} 到位置 ${start}-${end}`)
}

const handleCancel = () => {
  console.log('取消操作')
}
</script>
```

#### RangeWrap

```vue
<template>
  <RangeWrap />
</template>
```

## 技术栈

- **Vue 3**: 使用 Composition API
- **TypeScript**: 完整的类型支持
- **Vite**: 现代化构建工具
- **CSS**: 使用 scoped CSS 和 CSS 变量

## 项目结构

```
src/
├── components/           # 组件库
│   ├── BaseButton.vue   # 基础按钮组件
│   ├── BaseInput.vue    # 基础输入框组件
│   ├── RangeForm.vue    # 范围操作表单组件
│   ├── RangeWrap.vue    # 富文本编辑器组件
│   └── index.ts         # 组件库统一导出
├── views/              # 页面组件
│   └── ComponentDemo.vue # 组件演示页面
├── utils/              # 工具函数
│   └── richTextEditor.ts # 富文本编辑器工具
└── App.vue             # 应用根组件
```

## 开发说明

### 组件设计原则

1. **一致性**: 所有组件遵循统一的设计规范和API设计
2. **可访问性**: 支持键盘导航和屏幕阅读器
3. **可定制性**: 提供丰富的配置选项
4. **类型安全**: 完整的TypeScript类型定义
5. **性能优化**: 避免不必要的重渲染

### 代码规范

- 使用 TypeScript 进行类型检查
- 使用 JSDoc 注释提供组件文档
- 遵循 Vue 3 Composition API 最佳实践
- 使用 scoped CSS 避免样式冲突

## 浏览器支持

- Chrome (推荐)
- Firefox
- Safari
- Edge

## 许可证

MIT License 
