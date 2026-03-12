/**
 * 组件库统一导出文件
 * 提供所有基础组件的统一导入接口
 */

// 基础组件
export { default as BaseButton } from './BaseButton.vue';
export { default as BaseInput } from './BaseInput.vue';

// 业务组件
export { default as RangeForm } from './RangeForm.vue';
export { default as RangeWrap } from './RangeWrap.vue';

// 组件类型定义
export type ButtonSize = 'small' | 'medium' | 'large';
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'text';
export type InputSize = 'small' | 'medium' | 'large';
export type InputType = 'text' | 'number' | 'email' | 'password' | 'tel' | 'url';
export type TextFormat = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'highlight';
