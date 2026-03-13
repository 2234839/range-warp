/**
 * 组件库统一导出文件
 * 提供所有基础组件的统一导入接口
 */

// 基础组件
export { default as BaseButton } from './BaseButton.vue';
export { default as BaseInput } from './BaseInput.vue';

// 业务组件
export { default as EditorCore } from './EditorCore.vue';
export { default as RangeForm } from './RangeForm.vue';
export { default as RangeWrap } from './RangeWrap.vue';

// Composable
export { useNativeEditor } from './useNativeEditor';
export { useUEditorPlus } from './useUEditorPlus';
export type { EditorComposable, SelectionContext } from './editor-utils';
