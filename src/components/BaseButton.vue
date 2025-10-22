<script setup lang="ts">
  /** 按钮组件的基础属性 */
  interface Props {
    /** 按钮类型 */
    type?: 'button' | 'submit' | 'reset';
    /** 按钮尺寸 */
    size?: 'small' | 'medium' | 'large';
    /** 按钮变体 */
    variant?: 'primary' | 'secondary' | 'outline' | 'text';
    /** 是否禁用 */
    disabled?: boolean;
    /** 是否处于激活状态 */
    active?: boolean;
    /** 按钮标题 */
    title?: string;
    /** 最小宽度 */
    minWidth?: string;
  }

  /** 按钮组件的事件 */
  interface Emits {
    click: [event: MouseEvent];
  }

  const props = withDefaults(defineProps<Props>(), {
    type: 'button',
    size: 'medium',
    variant: 'secondary',
    disabled: false,
    active: false,
    minWidth: '32px'
  });

  defineEmits<Emits>();

  /** 根据尺寸获取高度 */
  const getHeightBySize = (size: string) => {
    switch (size) {
      case 'small':
        return '24px';
      case 'large':
        return '40px';
      default:
        return '32px';
    }
  };

  /** 根据尺寸获取内边距 */
  const getPaddingBySize = (size: string) => {
    switch (size) {
      case 'small':
        return '4px 8px';
      case 'large':
        return '8px 16px';
      default:
        return '6px 12px';
    }
  };
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :title="title"
    :class="[
      'base-button',
      `base-button--${size}`,
      `base-button--${variant}`,
      { 'base-button--active': active }
    ]"
    :style="{
      minHeight: getHeightBySize(size),
      minWidth: minWidth,
      padding: getPaddingBySize(size)
    }"
    @click="$emit('click', $event)">
    <slot />
  </button>
</template>

<style lang="css" scoped>
  .base-button {
    border: 1px solid #ccc;
    border-radius: 3px;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    font-family: inherit;
    box-sizing: border-box;
    background: none;
    outline: none;
  }

  .base-button:hover:not(:disabled) {
    background-color: #e9e9e9;
    border-color: #999;
  }

  .base-button:active:not(:disabled) {
    transform: translateY(1px);
  }

  .base-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* 尺寸变体 */
  .base-button--small {
    font-size: 12px;
  }

  .base-button--large {
    font-size: 16px;
  }

  /* 风格变体 */
  .base-button--primary {
    background-color: #007bff;
    color: white;
    border-color: #0056b3;
  }

  .base-button--primary:hover:not(:disabled) {
    background-color: #0056b3;
  }

  .base-button--secondary {
    background-color: #fff;
    color: #333;
    border-color: #ccc;
  }

  .base-button--outline {
    background-color: transparent;
    color: #007bff;
    border-color: #007bff;
  }

  .base-button--outline:hover:not(:disabled) {
    background-color: #007bff;
    color: white;
  }

  .base-button--text {
    background-color: transparent;
    color: #007bff;
    border-color: transparent;
    padding: 4px 8px !important;
  }

  .base-button--text:hover:not(:disabled) {
    background-color: rgba(0, 123, 255, 0.1);
  }

  /* 激活状态 */
  .base-button--active {
    background-color: #007bff;
    color: white;
    border-color: #0056b3;
  }

  .base-button--active:hover {
    background-color: #0056b3;
  }

  /* 焦点状态 */
  .base-button:focus-visible {
    outline: 2px solid #007bff;
    outline-offset: 2px;
  }
</style>