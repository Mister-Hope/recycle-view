import { recycleData } from "./recycle-data.js";
import { viewPortChange } from "./viewport-change-func.js";
import { transformRpx } from "./transformRpx.js";

const RECT_SIZE = 200;

function getValue(item, key) {
  if (!key) return item;
  if (typeof item[key] !== "undefined") return item[key];
  const keyItems = key.split(".");
  for (let i = 0; i < keyItems.length; i++) {
    item = item[keyItems[i]];
    if (typeof item === "undefined" || (typeof item === "object" && !item)) {
      return undefined;
    }
  }
  return item;
}

function getValues(item, keys) {
  if (Object.prototype.toString.call(keys) !== "[object Array]") {
    keys = [keys];
  }
  const vals = {};
  for (let i = 0; i < keys.length; i++) {
    vals[keys[i]] = getValue(item, keys[i]);
  }
  return vals;
}

function isArray(arr) {
  return Object.prototype.toString.call(arr) === "[object Array]";
}

function isSamePureValue(item1, item2) {
  if (typeof item1 !== typeof item2) return false;
  if (isArray(item1) && isArray(item2)) {
    if (item1.length !== item2.length) return false;
    for (let i = 0; i < item1.length; i++) {
      if (item1[i] !== item2[i]) return false;
    }
    return true;
  }
  return item1 === item2;
}

function isSameValue(item1, item2, keys) {
  if (!isArray(keys)) {
    keys = [keys];
  }
  for (let i = 0; i < keys.length; i++) {
    if (!isSamePureValue(getValue(item1, keys[i]), getValue(item2, keys[i])))
      return false;
  }
  return true;
}

export interface SizeInfo {
  width: number;
  height: number;
}

export type SizeGetter<T> = (item: T, index: number) => SizeInfo;

export interface RecycleContextOptions<T> {
  id: string;
  dataKey: string;
  page:
    | WechatMiniprogram.Component.Instance<
        Record<string, any>,
        Record<string, any>,
        Record<string, any>
      >
    | WechatMiniprogram.Page.Instance<Record<string, any>, Record<string, any>>;
  itemSize: SizeGetter<T> | SizeInfo;
  useInPage?: boolean;
  root?: WechatMiniprogram.Page.Instance<
    Record<string, any>,
    Record<string, any>
  >;
  placeholderClass?: string;
}

// eslint-disable-next-line no-complexity
export class RecycleContext<T> {
  id: string;
  dataKey: string;
  page:
    | WechatMiniprogram.Component.Instance<
        Record<string, any>,
        Record<string, any>,
        Record<string, any>
      >
    | WechatMiniprogram.Page.Instance<Record<string, any>, Record<string, any>>;

  comp:
    | WechatMiniprogram.Component.Instance<
        Record<string, any>,
        Record<string, any>,
        Record<string, any>
      >
    | undefined;

  itemSize: SizeGetter<T> | SizeInfo;

  itemSizeOpt: SizeGetter<T> | SizeInfo;

  useInPage: boolean;

  root:
    | WechatMiniprogram.Page.Instance<Record<string, any>, Record<string, any>>
    | undefined;

  placeholderClass: string | undefined;

  oldPageScroll?:
    | ((
        /** 页面滚动参数 */
        options: WechatMiniprogram.Page.IPageScrollOption,
      ) => void | Promise<void>)
    | undefined;

  isDataReady = false;

  constructor({
    id,
    dataKey,
    page,
    itemSize,
    useInPage,
    placeholderClass,
    root,
  }: RecycleContextOptions<T>) {
    if (!id || !dataKey || !page || !itemSize) {
      throw new Error("parameter id, dataKey, page, itemSize is required");
    }

    if (typeof itemSize !== "function" && typeof itemSize !== "object") {
      throw new Error(
        "parameter itemSize must be function or object with key width and height",
      );
    }

    if (
      typeof itemSize === "object" &&
      (!itemSize.width || !itemSize.height) &&
      (!itemSize.props || !itemSize.queryClass || !itemSize.dataKey)
    ) {
      throw new Error(
        "parameter itemSize must be function or object with key width and height",
      );
    }
    this.id = id;
    this.dataKey = dataKey;
    this.page = page;
    // 加root参数给useInPage单独使用
    this.root = root;
    this.placeholderClass = placeholderClass;
    page._recycleViewportChange = viewPortChange;
    this.comp = page.selectComponent("#" + id);
    this.itemSize = itemSize;
    this.itemSizeOpt = itemSize;
    // if (!this.comp) {
    // throw `<recycle-view> with id ${id} not found`
    // }
    this.useInPage = useInPage || false;

    if (this.comp) {
      this.comp.context = this;
      this.comp.setPage(page);
      this.comp.setUseInPage(this.useInPage);
    }

    if (this.useInPage && !this.root) {
      throw new Error("parameter root is required when useInPage is true");
    }

    if (this.useInPage) {
      this.oldPageScroll = this.root!.onPageScroll;

      // 重写onPageScroll事件
      this.root!.onPageScroll = (e) => {
        // this.checkComp();
        if (this.comp) {
          this.comp._scrollViewDidScroll({
            detail: {
              scrollLeft: 0,
              scrollTop: e.scrollTop,
            },
          });
        }
        this.oldPageScroll?.apply(this.root, [e]);
      };

      this.oldReachBottom = this.root!.onReachBottom;

      this.root!.onReachBottom = (e) => {
        if (this.comp) {
          this.comp.triggerEvent("scrolltolower", {});
        }
        this.oldReachBottom.apply(this.root, [e]);
      };
      this.oldPullDownRefresh = this.root!.onPullDownRefresh;

      this.root.onPullDownRefresh = (e) => {
        if (this.comp) {
          this.comp.triggerEvent("scrolltoupper", {});
        }

        this.oldPullDownRefresh.apply(this.root, [e]);
      };
    }
  }

  checkComp() {
    if (!this.comp) {
      this.comp = this.page.selectComponent("#" + this.id);
      if (this.comp) {
        this.comp.setUseInPage(this.useInPage);
        this.comp.context = this;
        this.comp.setPage(this.page);
      } else {
        throw new Error(
          "the recycle-view correspond to this context is detached, please create another RecycleContext",
        );
      }
    }
  }

  #forceRerender(id, cb) {
    this.isDataReady = true; // 首次调用说明数据已经ready了

    let allrect = null;
    let parentRect = null;
    let count = 0;

    const setPlaceholderImage = () => {
      if (!allrect || !parentRect) return;
      const svgRects = [];
      for (let i = 0; i < count; i++) {
        svgRects.push({
          left: allrect[i].left - parentRect.left,
          top: allrect[i].top - parentRect.top,
          width: allrect[i].width,
          height: allrect[i].height,
        });
      }
      this.comp!.setPlaceholderImage(svgRects, {
        width: parentRect.width,
        height: parentRect.height,
      });
    };

    const newcb = () => {
      if (cb) {
        cb();
      }
      // 计算placeholder, 只有在动态计算高度的时候才支持
      if (this.autoCalculateSize && this.placeholderClass) {
        const newQueryClass = [];

        this.placeholderClass.forEach((item) => {
          newQueryClass.push(`.${this.itemSizeOpt.queryClass} .` + item);
        });
        // newQueryClass.push(`.` + that.itemSizeOpt.queryClass)
        count = newQueryClass.length;
        this.page
          .createSelectorQuery()
          .selectAll(newQueryClass.join(","))
          .boundingClientRect((rect) => {
            if (rect.length < count) return;
            allrect = rect;
            setPlaceholderImage();
          })
          .exec();
        this.page
          .createSelectorQuery()
          .select("." + this.itemSizeOpt.queryClass)
          .boundingClientRect((rect) => {
            parentRect = rect;
            setPlaceholderImage();
          })
          .exec();
      }
    };

    if (
      Object.prototype.toString.call(this.itemSizeOpt) === "[object Object]" &&
      this.itemSizeOpt &&
      !this.itemSizeOpt.width
    ) {
      this._recalculateSizeByProp(recycleData[id].list, function (sizeData) {
        recycleData[id].sizeMap = sizeData.map;
        recycleData[id].sizeArray = sizeData.array;
        // 触发强制渲染
        this.comp.forceUpdate(newcb);
      });
      return;
    }
    const sizeData = this._recalculateSize(recycleData[id].list);
    recycleData[id].sizeMap = sizeData.map;
    // console.log('size is', sizeData.array, sizeData.map, 'totalHeight', sizeData.totalHeight)
    // console.log('sizeArray', sizeData.array)
    recycleData[id].sizeArray = sizeData.array;
    // 触发强制渲染
    this.comp.forceUpdate(cb);
  }

  _recalculateSizeByProp(list, cb) {
    const itemSize = this.itemSizeOpt;
    let propValueMap = this.propValueMap || [];
    const calcNewItems = [];
    const needCalcPropIndex = [];
    if (itemSize.cacheKey) {
      propValueMap = wx.getStorageSync(itemSize.cacheKey) || [];
      // eslint-disable-next-line no-console
      // console.log('[recycle-view] get itemSize from cache', propValueMap)
    }
    this.autoCalculateSize = true;
    const item2PropValueMap = [];
    for (let i = 0; i < list.length; i++) {
      let item2PropValueIndex = propValueMap.length;
      if (!propValueMap.length) {
        const val = getValues(list[i], itemSize.props);
        val.__index__ = i;
        propValueMap.push(val);
        calcNewItems.push(list[i]);
        needCalcPropIndex.push(item2PropValueIndex);
        item2PropValueMap.push({
          index: i,
          sizeIndex: item2PropValueIndex,
        });
        continue;
      }
      let found = false;
      for (let j = 0; j < propValueMap.length; j++) {
        if (isSameValue(propValueMap[j], list[i], itemSize.props)) {
          item2PropValueIndex = j;
          found = true;
          break;
        }
      }
      if (!found) {
        const val = getValues(list[i], itemSize.props);
        val.__index__ = i;
        propValueMap.push(val);
        calcNewItems.push(list[i]);
        needCalcPropIndex.push(item2PropValueIndex);
      }
      item2PropValueMap.push({
        index: i,
        sizeIndex: item2PropValueIndex,
      });
    }
    // this.item2PropValueMap = item2PropValueMap
    this.propValueMap = propValueMap;
    if (propValueMap.length > 10) {
      // eslint-disable-next-line no-console
      console.warn(
        "[recycle-view] get itemSize count exceed maximum of 10, now got",
        propValueMap,
      );
    }
    // console.log('itemsize', propValueMap, item2PropValueMap)
    // 预先渲染
    const that = this;
    function newItemSize(item, index) {
      const sizeIndex = item2PropValueMap[index];
      if (!sizeIndex) {
        // eslint-disable-next-line no-console
        console.error(
          "[recycle-view] auto calculate size array error, no map size found",
          item,
          index,
          item2PropValueMap,
        );
        throw new Error(
          "[recycle-view] auto calculate size array error, no map size found",
        );
      }
      const size = propValueMap[sizeIndex.sizeIndex];
      if (!size) {
        // eslint-disable-next-line no-console
        console.log(
          "[recycle-view] auto calculate size array error, no size found",
          item,
          index,
          sizeIndex,
          propValueMap,
        );
        throw new Error(
          "[recycle-view] auto calculate size array error, no size found",
        );
      }
      return {
        width: size.width,
        height: size.height,
      };
    }
    function sizeReady(rects) {
      rects.forEach((rect, index) => {
        const propValueIndex = needCalcPropIndex[index];
        propValueMap[propValueIndex].width = rect.width;
        propValueMap[propValueIndex].height = rect.height;
      });
      that.itemSize = newItemSize;
      const sizeData = that._recalculateSize(list);
      if (itemSize.cacheKey) {
        wx.setStorageSync(itemSize.cacheKey, propValueMap); // 把数据缓存起来
      }
      if (cb) {
        cb(sizeData);
      }
    }
    if (calcNewItems.length) {
      const obj = {};
      obj[itemSize.dataKey] = calcNewItems;
      this.page.setData(obj, () => {
        this.page
          .createSelectorQuery()
          .selectAll("." + itemSize.queryClass)
          .boundingClientRect((rects) => {
            sizeReady(rects);
          })
          .exec();
      });
    } else {
      that.itemSize = newItemSize;
      const sizeData = that._recalculateSize(list);
      if (cb) {
        cb(sizeData);
      }
    }
  }

  // 当before和after这2个slot发生变化的时候调用一下此接口
  _recalculateSize(list) {
    // 遍历所有的数据
    // 应该最多就千量级的, 遍历没有问题
    const sizeMap = {};
    const func = this.itemSize;
    const funcExist = typeof func === "function";
    const comp = this.comp;

    const compData = comp.data;
    let offsetLeft = 0;
    let offsetTop = 0;
    let line = 0;
    let column = 0;
    const sizeArray = [];
    const listLen = list.length;
    // 把整个页面拆分成200*200的很多个方格, 判断每个数据落在哪个方格上
    for (let i = 0; i < listLen; i++) {
      list[i].__index__ = i;
      let itemSize = {};
      // 获取到每一项的宽和高
      if (funcExist) {
        // 必须保证返回的每一行的高度一样
        itemSize = func && func.call(this, list[i], i);
      } else {
        itemSize = {
          width: func.width,
          height: func.height,
        };
      }
      itemSize = Object.assign({}, itemSize);
      sizeArray.push(itemSize);
      // 判断数据落到哪个方格上
      // 超过了宽度, 移动到下一行, 再根据高度判断是否需要移动到下一个方格
      if (offsetLeft + itemSize.width > compData.width) {
        column = 0;
        offsetLeft = itemSize.width;
        // Fixed issue #22
        if (sizeArray.length >= 2) {
          offsetTop += sizeArray[sizeArray.length - 2].height || 0; // 加上最后一个数据的高度
        } else {
          offsetTop += itemSize.height;
        }
        // offsetTop += sizeArray[sizeArray.length - 2].height // 加上最后一个数据的高度
        // 根据高度判断是否需要移动到下一个方格
        if (offsetTop >= RECT_SIZE * (line + 1)) {
          // fix: 当区块比较大时，会缺失块区域信息
          const lastIdx = i - 1;
          const lastLine = line;

          line += parseInt((offsetTop - RECT_SIZE * line) / RECT_SIZE, 10);

          for (let idx = lastLine; idx < line; idx++) {
            const key = `${idx}.${column}`;
            if (!sizeMap[key]) {
              sizeMap[key] = [];
            }
            sizeMap[key].push(lastIdx);
          }
        }

        // 新起一行的元素, beforeHeight是前一个元素的beforeHeight和height相加
        if (i === 0) {
          itemSize.beforeHeight = 0;
        } else {
          const prevItemSize = sizeArray[sizeArray.length - 2];
          itemSize.beforeHeight =
            prevItemSize.beforeHeight + prevItemSize.height;
        }
      } else {
        if (offsetLeft >= RECT_SIZE * (column + 1)) {
          column++;
        }
        offsetLeft += itemSize.width;
        if (i === 0) {
          itemSize.beforeHeight = 0;
        } else {
          // 同一行的元素, beforeHeight和前面一个元素的beforeHeight一样
          itemSize.beforeHeight = sizeArray[sizeArray.length - 2].beforeHeight;
        }
      }
      const key = `${line}.${column}`;
      if (!sizeMap[key]) {
        sizeMap[key] = [];
      }
      sizeMap[key].push(i);

      // fix: 当区块比较大时，会缺失块区域信息
      if (listLen - 1 === i && itemSize.height > RECT_SIZE) {
        const lastIdx = line;
        offsetTop += itemSize.height;
        line += parseInt((offsetTop - RECT_SIZE * line) / RECT_SIZE, 10);
        for (let idx = lastIdx; idx <= line; idx++) {
          const key = `${idx}.${column}`;
          if (!sizeMap[key]) {
            sizeMap[key] = [];
          }
          sizeMap[key].push(i);
        }
      }
    }
    // console.log('sizeMap', sizeMap)
    const obj = {
      array: sizeArray,
      map: sizeMap,
      totalHeight: sizeArray.length
        ? sizeArray[sizeArray.length - 1].beforeHeight +
          sizeArray[sizeArray.length - 1].height
        : 0,
    };
    comp.setItemSize(obj);
    return obj;
  }

  deleteList(beginIndex, count, cb) {
    this.checkComp();
    const id = this.id;
    if (!recycleData[id]) {
      return this;
    }
    recycleData[id].list.splice(beginIndex, count);
    this.#forceRerender(id, cb);
    return this;
  }
  updateList(beginIndex, list, cb) {
    this.checkComp();
    const id = this.id;
    if (!recycleData[id]) {
      return this;
    }
    const len = recycleData[id].list.length;
    for (let i = 0; i < list.length && beginIndex < len; i++) {
      recycleData[id].list[beginIndex++] = list[i];
    }
    this.#forceRerender(id, cb);
    return this;
  }

  update(...args) {
    this.updateList(...args);
  }

  splice(begin, deleteCount, appendList, cb) {
    this.checkComp();
    const id = this.id;
    const dataKey = this.dataKey;
    // begin是数组
    if (typeof begin === "object" && begin.length) {
      cb = deleteCount;
      appendList = begin;
    }
    if (typeof appendList === "function") {
      cb = appendList;
      appendList = [];
    }
    if (!recycleData[id]) {
      recycleData[id] = {
        key: dataKey,
        id,
        list: appendList || [],
        sizeMap: {},
        sizeArray: [],
      };
    } else {
      recycleData[id].dataKey = dataKey;
      const list = recycleData[id].list;
      if (appendList && appendList.length) {
        list.splice(begin, deleteCount, ...appendList);
      } else {
        list.splice(begin, deleteCount);
      }
    }
    this.#forceRerender(id, cb);
    return this;
  }

  append(list, cb) {
    this.checkComp();

    const id = this.id;
    const dataKey = this.dataKey;
    if (!recycleData[id]) {
      recycleData[id] = {
        key: dataKey,
        id,
        list,
        sizeMap: {},
        sizeArray: [],
      };
    } else {
      recycleData[id].dataKey = dataKey;
      recycleData[id].list = recycleData[id].list.concat(list);
    }
    this.#forceRerender(id, cb);

    return this;
  }

  destroy() {
    if (this.useInPage) {
      this.page.onPullDownRefresh = this.oldPullDownRefresh;
      this.page.onReachBottom = this.oldReachBottom;
      this.page.onPageScroll = this.oldPageScroll;
      this.oldPageScroll = this.oldReachBottom = this.oldPullDownRefresh = null;
    }
    this.page = null;
    this.comp = null;
    if (recycleData[this.id]) {
      delete recycleData[this.id];
    }
    return this;
  }

  // 重新更新下页面的数据
  forceUpdate(cb, reinitSlot) {
    this.checkComp();
    if (reinitSlot) {
      this.comp.reRender(() => {
        this.#forceRerender(this.id, cb);
      });
    } else {
      this.#forceRerender(this.id, cb);
    }
    return this;
  }

  getBoundingClientRect(index) {
    this.checkComp();
    if (!recycleData[this.id]) {
      return null;
    }
    const sizeArray = recycleData[this.id]!.sizeArray;
    if (!sizeArray || !sizeArray.length) {
      return null;
    }
    if (typeof index === "undefined") {
      const list = [];
      for (let i = 0; i < sizeArray.length; i++) {
        list.push({
          left: 0,
          top: sizeArray[i].beforeHeight,
          width: sizeArray[i].width,
          height: sizeArray[i].height,
        });
      }
      return list;
    }
    index = parseInt(index, 10);
    if (index >= sizeArray.length || index < 0) return null;
    return {
      left: 0,
      top: sizeArray[index].beforeHeight,
      width: sizeArray[index].width,
      height: sizeArray[index].height,
    };
  }
  getScrollTop() {
    this.checkComp();
    return this.comp!.currentScrollTop || 0;
  }

  // 将px转化为rpx
  transformRpx(str, addPxSuffix: boolean) {
    if (typeof str === "number") str += "rpx";
    return parseFloat(transformRpx(str, addPxSuffix));
  }

  getViewportItems(inViewportPx) {
    this.checkComp();
    const indexes = this.comp!.getIndexesInViewport(inViewportPx);
    if (indexes.length <= 0) return [];
    const viewportItems = [];
    const list = recycleData[this.id].list;
    for (let i = 0; i < indexes.length; i++) {
      viewportItems.push(list[indexes[i]]);
    }
    return viewportItems;
  }

  getTotalHeight() {
    this.checkComp();
    return this.comp!.getTotalHeight();
  }

  // 返回完整的列表数据
  getList() {
    if (!recycleData[this.id]) {
      return [];
    }
    return recycleData[this.id].list;
  }
}
