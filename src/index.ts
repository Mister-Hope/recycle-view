/**
 * recycle-view 组件的 API 使用
 * 提供 wx.createRecycleContext 进行管理功能
 */
import { RecycleContext } from "./utils/recycle-context.js";

/**
 * @params options 参数是 object 对象，展开的结构如下
      id: recycle-view 的 id
      dataKey: recycle-item 的 wx:for 绑定的数据变量
      page: recycle-view 所在的页面或组件的实例
      itemSize: 函数或者是 object 对象，生成每个 recycle-item 的宽和高
 * @return RecycleContext 对象
 */
export const createRecycleContext = (options) => new RecycleContext(options);
