/**
 * 组件库统一导出文件
 * 提供所有基础组件的统一导入接口
 */

// 基础组件
export { default as BaseButton } from './BaseButton.vue';
export { default as BaseInput } from './BaseInput.vue';

// 布局组件
export { default as AppCard } from './AppCard.vue';

// 业务组件
export { default as RangeForm } from './RangeForm.vue';
export { default as RangeWrap } from './RangeWrap.vue';

// 组件类型定义
export type ButtonSize = 'small' | 'medium' | 'large';
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'text';
export type InputSize = 'small' | 'medium' | 'large';
export type InputType = 'text' | 'number' | 'email' | 'password' | 'tel' | 'url';
export type TextFormat = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'highlight';

/**
 * 组件安装方法
 * 用于在 Vue 应用中全局注册所有组件
 */
import type { App } from 'vue';
import BaseButton from './BaseButton.vue';
import BaseInput from './BaseInput.vue';
import RangeForm from './RangeForm.vue';
import RangeWrap from './RangeWrap.vue';

export interface ComponentInstaller {
  install(app: App): void;
}

/**
 * 全局安装所有组件
 * @param app Vue 应用实例
 */
export const installComponents = (app: App): void => {
  app.component('BaseButton', BaseButton);
  app.component('BaseInput', BaseInput);
  app.component('RangeForm', RangeForm);
  app.component('RangeWrap', RangeWrap);
};

/**
 * 创建组件安装器
 * @returns 包含 install 方法的对象
 */
export const createComponentInstaller = (): ComponentInstaller => ({
  install: installComponents
});

/**
 * 默认导出组件安装器
 * 支持 app.use(createComponentInstaller()) 方式安装
 */
export default createComponentInstaller();