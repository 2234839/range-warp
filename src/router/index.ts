import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '../App.vue'
import ComponentDemo from '../views/ComponentDemo.vue'

/**
 * 路由配置
 */
const routes = [
  {
    path: '/',
    name: 'home',
    component: HomePage,
    meta: {
      title: 'RangeWrap 调试页面'
    }
  },
  {
    path: '/demo',
    name: 'demo',
    component: ComponentDemo,
    meta: {
      title: '组件库演示'
    }
  }
]

/**
 * 创建路由实例
 */
const router = createRouter({
  history: createWebHistory(),
  routes
})

/**
 * 路由守卫 - 设置页面标题
 */
router.beforeEach((to, from, next) => {
  if (to.meta?.title) {
    document.title = to.meta.title as string
  }
  next()
})

export default router