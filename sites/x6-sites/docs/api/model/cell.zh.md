---
title: 元素
order: 0
redirect_from:
  - /zh/docs
  - /zh/docs/api
  - /zh/docs/api/model
---

Cell 是 [Node](/zh/docs/api/model/node) 和 [Edge](/zh/docs/api/model/edge) 的基类，包含节点和边的通用属性和方法定义，如属性样式、可见性、业务数据等，并且在实例化、样式定制、默认选项、自定义选项等方面具有相同的行为。

## 属性

| 选项     | 类型                            | 默认值 | 必选 | 描述                                                                 |
|----------|---------------------------------|--------|:----:|--------------------------------------------------------------------|
| id       | string                          |        |      | 节点/边的唯一标识，推荐使用具备业务意义的 ID，默认使用自动生成的 UUID。 |
| markup   | Markup                          |        |      | 节点/边的 SVG/HTML 片段。                                             |
| attrs    | Attr.CellAttrs                  |        |      | 节点/边属性样式。                                                     |
| shape    | string                          |        |      | 渲染节点/边的图形。节点对应的默认值为 `rect`，边对应的默认值为 `edge`。 |
| view     | string                          |        |      | 渲染节点/边的视图。                                                   |
| zIndex   | number                          |        |      | 节点/边在画布中的层级，默认根据节点/边添加顺序自动确定。               |
| visible  | boolean                         | `true` |      | 节点/边是否可见。                                                     |
| parent   | string                          |        |      | 父节点。                                                              |
| children | string[]                        |        |      | 子节点/边。                                                           |
| tools    | ToolItem \| ToolItem[] \| Tools |        |      | 工具选项。                                                            |
| data     | any                             |        |      | 节点/边关联的业务数据。                                               |

### id

`id` 是节点/边的唯一标识，推荐使用具备业务意义的 ID，默认使用自动生成的 UUID。

### markup

`markup` 指定了渲染节点/边时使用的 SVG/HTML 片段，使用 JSON 格式描述。例如内置节点 `Shape.Rect` 的 `markup` 定义如下：

```ts
{
  markup: [
    {
      tagName: 'rect',
      selector: 'body',
    },
    {
      tagName: 'text',
      selector: 'label',
    },
  ],
}
```

表示该节点内部包含 `<rect>` 和 `<text>` 两个 SVG 元素，渲染到页面之后，节点对应的 SVG 元素看起来像下面这样。

```html
<g
  data-cell-id="c2e1dd06-15c6-43a4-987a-712a664b8f85"
  class="x6-cell x6-node"
  transform="translate(40,40)"
>
  <rect
    fill="#fff"
    stroke="#000"
    stroke-width="2"
    fill-opacity="0.5"
    width="100"
    height="40"
  ></rect>
  <text
    font-size="14"
    xml:space="preserve"
    fill="#333"
    text-anchor="middle"
    font-family="Arial, helvetica, sans-serif"
    transform="matrix(1,0,0,1,50,20)"
  >
    <tspan dy="0.3em" class="v-line">rect</tspan>
  </text>
</g>
```

通过上面的介绍，我们大致了解了 `Markup` 的结构，下面我们将详细介绍 `Markup` 定义。

```ts
interface Markup {
  tagName: string
  ns?: string
  selector?: string
  groupSelector?: string | string[]
  attrs?: { [key: string]: string | number }
  style?: { [key: string]: string | number }
  className?: string | string[]
  textContent?: string
  children?: Markup[]
}
```

| 选项          | 类型             | 默认值                         | 必选 | 描述                                                               |
|---------------|------------------|--------------------------------|:----:|------------------------------------------------------------------|
| tagName       | string           |                                |  ✓   | SVG/HTML 元素标签名。                                               |
| ns            | string           | `"http://www.w3.org/2000/svg"` |      | SVG/HTML 元素命名空间。                                             |
| selector      | string           | -                              |      | 该元素的选择器（唯一），通过选择器来定位该元素或为该元素指定属性样式。 |
| groupSelector | string           | -                              |      | 该元素的群组选择器，可以同时为该群组对应的多个元素指定样式。         |
| attrs         | Attr.SimpleAttrs | -                              |      | 该元素的默认属性键值对。                                            |
| style         | KeyValue         | -                              |      | 该元素的行内样式键值对。                                            |
| className     | string           | -                              |      | 该元素的 CSS 样式名。                                               |
| textContent   | string           | -                              |      | 该元素的文本内容。                                                  |
| children      | Markup[]         | -                              |      | 嵌套的子元素。                                                      |

#### tagName

通过 `tagName` 指定需要创建哪种 SVG/HTML 元素。

#### ns

该元素的命名空间。需要与 `tagName` 指定的的元素类型对应，默认使用 SVG 元素命名空间 `"http://www.w3.org/2000/svg"`。

- SVG 元素命名空间为 `"http://www.w3.org/2000/svg"`
- HTML 元素的命名空间为 `"http://www.w3.org/1999/xhtml"`

#### selector

该元素的唯一选择器，通过选择器为该元素指定[属性样式](https://developer.mozilla.org/zh-CN/docs/Web/SVG/Tutorial/Fills_and_Strokes)。例如，为内置节点 `Shape.Rect` 指定 `<rect>` 和 `<text>` 元素的属性样式：

```ts
const rect = new Shape.Rect({
  x: 40,
  y: 40,
  width: 100,
  height: 40,
  attrs: {
    // 指定 rect 元素的样式
    body: {
      stroke: '#000', // 边框颜色
      fill: '#fff', // 填充颜色
    },
    // 指定 text 元素的样式
    label: {
      text: 'rect', // 文字
      fill: '#333', // 文字颜色
    },
  },
})
```

#### groupSelector

该元素的群组选择器，通过群组选择器可以为该群组关联的多个元素指定样式。例如，下面 Markup 中两个 `<rect>` 具备相同的 `groupSelector` 值 `group1`：

```ts
{
  markup: [
    {
      tagName: 'rect',
      selector: 'body',
      groupSelector: 'group1',
    },
    {
      tagName: 'rect',
      selector: 'wrap',
      groupSelector: 'group1',
    },
    {
      tagName: 'text',
      selector: 'label',
    },
  ],
}
```

创建节点时，我们可以像下面这样来指定群组样式：

```ts
new SomeNode({
  attrs: {
    group1: {
      fill: '#2ECC71',
    },
  },
})
```

#### attrs

该元素的默认属性键值对，通常用于定义那些不变的通用属性，这些默认属性也可以在实例化节点时被覆盖。需要注意的是 `markup` 中的 `attrs` 属性只支持原生的 SVG 属性，也就是说 X6 的[自定义属性]()在这里不可用。

例如，我们为内置节点 `Shape.Rect` 的 `<rect>` 和 `<text>` 元素指定了如下默认属性：

```js
{
  markup: [
    {
      tagName: 'rect',
      selector: 'body',
      attrs: {
        fill: '#fff',
        stroke: '#000',
        strokeWidth: 2,
      }
    },
    {
      tagName: 'text',
      selector: 'label',
      attrs: {
        fill: '#333',
        textAnchor: 'middle',
        textVerticalAnchor: 'middle',
      }
    },
  ],
}
```

#### style

该元素的行内样式键值对。

#### className

该元素的 CSS 样式名。

#### textContent

该元素的文本内容。

#### children

嵌套的子元素。

### attrs

属性选项 `attrs` 是一个复杂对象，该对象的 Key 是节点 Markup 定义中元素的选择器([selector](#selector))，对应的值是应用到该 SVG 元素的 [SVG 属性值](https://developer.mozilla.org/zh-CN/docs/Web/SVG/Attribute)(如 [fill](https://developer.mozilla.org/zh-CN/docs/Web/SVG/Attribute/fill) 和 [stroke](https://developer.mozilla.org/zh-CN/docs/Web/SVG/Attribute/stroke))，如果你对 SVG 属性还不熟悉，可以参考 MDN 提供的[填充和边框](https://developer.mozilla.org/zh-CN/docs/Web/SVG/Tutorial/Fills_and_Strokes)入门教程。

例如，内置节点 `Shape.Rect` 的 Markup 定义了 `body`(代表 `<rect>` 元素) 和 `label`(代表 `<text>` 元素) 两个选择器，我们可以像下面这样为该节点中的元素指定属性样式：

```ts
const rect = new Shape.Rect({
  x: 40,
  y: 40,
  width: 100,
  height: 40,
  attrs: {
    body: {
      fill: '#2ECC71',
      stroke: '#000',
    },
    label: {
      text: 'rect',
      fill: '#333',
      fontSize: 13,
    },
  },
})
```

节点渲染到画布后的 DOM 结构看起来像下面这样：

```html
<g
  data-cell-id="3ee1452c-6d75-478d-af22-88e03c6d513b"
  class="x6-cell x6-node"
  transform="translate(40,40)"
>
  <rect
    fill="#2ECC71"
    stroke="#000"
    stroke-width="2"
    width="100"
    height="40"
  ></rect>
  <text
    font-size="13"
    xml:space="preserve"
    fill="#333"
    text-anchor="middle"
    font-family="Arial, helvetica, sans-serif"
    transform="matrix(1,0,0,1,50,20)"
  >
    <tspan dy="0.3em" class="v-line"> rect </tspan>
  </text>
</g>
```

另外，我们还可以使用 CSS 选择器来指定节点样式，这样我们就不用记住预定义的选择器名称，只需要根据渲染后的 DOM 结构来定义样式即可。使用 CSS 选择器时需要注意，指定的 CSS 选择器可能选中多个元素，这时对应的属性样式将同时应用到多个元素上。

```ts
const rect = new Shape.Rect({
  x: 40,
  y: 40,
  width: 100,
  height: 40,
  attrs: {
    rect: {
      // 使用 rect 这个 css 选择器替代预定义的 body 选择器
      fill: '#2ECC71',
      stroke: '#000',
    },
    text: {
      // 使用 text 这个 css 选择器替代预定义的 label 选择器
      text: 'rect',
      fill: '#333',
      fontSize: 13,
    },
  },
})
```

值得一提的是，支持使用[小驼峰(camelCase)格式](https://zh.wikipedia.org/zh-cn/%E9%A7%9D%E5%B3%B0%E5%BC%8F%E5%A4%A7%E5%B0%8F%E5%AF%AB)的属性名，如 `fontSize`，这就避免了 `font-size` 这种属性名作为对象 Key 时需要加引号的麻烦。

除了标准的 [SVG 属性](https://developer.mozilla.org/zh-CN/docs/Web/SVG/Attribute)，我们在 X6 中还定义了一系列特殊属性，详情请参考[特殊属性](/zh/docs/api/model/attrs)和[自定义属性](/zh/docs/api/model/cell/#自定义属性)。另外，我们还可以使用 [CSS](https://developer.mozilla.org/en-US/docs/Web/CSS) 来定制样式，节点和边渲染到画布后分别有 `x6-node` 和 `x6-edge` 两个样式名，默认的样式定义[参考这里](https://github.com/antvis/X6/blob/master/packages/x6/src/style/index.less)。例如，我们可以像下面这样来指定节点中 `<rect>` 元素的样式：

```css
.x6-node rect {
  fill: #2ecc71;
  stroke: #000;
}
```

创建节点/边后，我们可以调用实例上的 `attr()` 方法来修改节点属性样式。看下面代码，通过 `/` 分割的路径修改样式，`label` 选择器对应到 `<text>` 元素，`text` 则是该元素的属性名，`hello` 是新的属性值。

```ts
rect.attr('label/text', 'hello')

// 等同于
rect.attr('label', {
  text: 'hello',
})

// 等同于
rect.attr({
  label: {
    text: 'hello',
  },
})
```

当传入的属性值为 `null` 时可以移除该属性。

```ts
rect.attr('label/text', null)
```

### shape

节点/边的图形，图形类似 MVC 模式中的 Model，决定了节点/边的结构化数据。该选项通常在使用 `graph.addNode` 和 `graph.addEdge` 两个方法添加节点和边时使用。

```ts
const rect = graph.addNode({
  shape: 'rect',
  x: 100,
  y: 200,
  width: 80,
  height: 40,
  label: 'rect',
})

const circle = graph.addNode({
  shape: 'circle',
  x: 280,
  y: 200,
  width: 60,
  height: 60,
  label: 'circle',
})

const edge = graph.addEdge({
  shape: 'edge',
  source: rect,
  target: circle,
})
```

在 X6 内部实现中，我们通过 `shape` 指定的图形找到对应的构造函数来初始化节点/边，并将其添加到画布。

该选项的默认值为：

- `graph.addNode` 方法中 `shape` 的默认值为 `rect`
- `graph.addEdge` 方法中 `shape` 的默认值为 `edge`

同时，我们在 X6 中内置了一系列节点和边。

| 构造函数       | shape 名称 | 描述                                           |
|----------------|------------|----------------------------------------------|
| Shape.Rect     | rect       | 矩形。                                          |
| Shape.Circle   | circle     | 圆形。                                          |
| Shape.Ellipse  | ellipse    | 椭圆。                                          |
| Shape.Polygon  | polygon    | 多边形。                                        |
| Shape.Polyline | polyline   | 多段线。                                        |
| Shape.Path     | path       | 路径。                                          |
| Shape.Image    | image      | 图片。                                          |
| Shape.HTML     | html       | HTML 节点，使用 `foreignObject` 渲染 HTML 片段。 |

### view

指定渲染节点/边所使用的视图，视图的概念与 MVC 模式中的 View 一致，一般情况下不需要设置 view 字段，默认使用 X6 内置视图。

### zIndex

节点/边在画布中的层级，默认根据节点/边添加顺序自动确定。节点/边渲染到画布后可以通过 `cell.getZIndex()` 和 `cell.setZIndex(z: number)` 来获取或设置 `zIndex` 的值，也可以调用 `cell.toFront()` 和 `cell.toBack()` 来将其移到最顶层或最底层。

### visible

节点/边是否可见，默认可见。

### parent

父节点 ID。

### children

子节点/边的 ID 数组。

### tools

节点/边的小工具。小工具可以增强节点/边的交互能力，我们分别为节点和边提供了以下内置工具：

节点

- [button](/zh/docs/api/registry/node-tool#button) 在指定位置处渲染一个按钮，支持自定义按钮的点击交互。
- [button-remove](/zh/docs/api/registry/node-tool#button-remove) 在指定的位置处，渲染一个删除按钮，点击时删除对应的节点。
- [boundary](/zh/docs/api/registry/node-tool#boundary) 根据节点的包围盒渲染一个包围节点的矩形。注意，该工具仅仅渲染一个矩形，不带任何交互。
- [node-editor](/zh/docs/api/registry/node-tool#node-editor) 提供节点上文本编辑功能。

边

- [vertices](/zh/docs/api/registry/edge-tool#vertices) 路径点工具，在路径点位置渲染一个小圆点，拖动小圆点修改路径点位置，双击小圆点删除路径点，在边上单击添加路径点。
- [segments](/zh/docs/api/registry/edge-tool#segments) 线段工具。在边的每条线段的中心渲染一个工具条，可以拖动工具条调整线段两端的路径点的位置。
- [boundary](/zh/docs/api/registry/edge-tool#boundary) 根据边的包围盒渲染一个包围边的矩形。注意，该工具仅仅渲染一个矩形，不带任何交互。
- [button](/zh/docs/api/registry/edge-tool#button) 在指定位置处渲染一个按钮，支持自定义按钮的点击交互。
- [button-remove](/zh/docs/api/registry/edge-tool#button-remove) 在指定的位置处，渲染一个删除按钮，点击时删除对应的边。
- [source-arrowhead-和-target-arrowhead](/zh/docs/api/registry/edge-tool#source-arrowhead-和-target-arrowhead) 在边的起点或终点渲染一个图形(默认是箭头)，拖动该图形来修改边的起点或终点。
- [edge-editor](/zh/docs/api/registry/edge-tool#edge-editor) 提供边上文本编辑功能

可以指定单个工具：

```ts
graph.addNode({
  x: 40,
  y: 40,
  width: 100,
  height: 40,
  tools: 'button-remove', // or { name: 'button-remove' }
})
```

同时，可以像下面这样指定工具的参数选项：

```ts
graph.addNode({
  x: 40,
  y: 40,
  width: 100,
  height: 40,
  tools: {
    name: 'button-remove',
    args: {
      x: 10, // 按钮的 x 坐标，相对于节点的左上角
      y: 10, // 按钮的 y 坐标，相对于节点的左上角
    },
  },
})
```

也可以同时指定多个小工具：

```ts
graph.addNode({
  x: 40,
  y: 40,
  width: 100,
  height: 40,
  tools: [
    'button-remove',
    {
      name: 'boundary',
      args: {
        padding: 5,
      },
    },
  ],
})
```

### data

与节点/边关联的业务数据。例如，我们在实际使用时通常会将某些业务数据存在节点/边的 `data` 上。

```ts
const rect = new Shape.Rect({
  x: 40,
  y: 40,
  width: 100,
  height: 40,
  data: {
    bizID: 125,
    date: '20200630',
    price: 89.0,
  },
})
```

## 方法

### 通用

#### get shape

获取节点/边的图形，返回注册到 X6 的图形的名称。

```ts
if (node.shape === 'rect') {
  // do something if the node is a 'rect' node.
}
```

#### get view

获取节点/边的视图，返回注册到 X6 的视图的名称。

```ts
if (node.view === 'rect') {
  // do something if the node is a 'rect' view.
}
```

#### isNode()

```ts
isNode(): boolean
```

检测实例是不是 [Node](/zh/docs/api/model/node) 实例，如果是 [Node](/zh/docs/api/model/node) 实例则返回 `true`，否则返回 `false`。所有继承自 [Node](/zh/docs/api/model/node) 的节点都返回 `true`。

```ts
if (cell.isNode()) {
  // do something if the cell is a node.
}
```

#### isEdge()

```ts
isEdge(): boolean
```

检测实例是不是 [Edge](/zh/docs/api/model/edge) 实例，如果是 [Edge](/zh/docs/api/model/edge) 实例则返回 `true`，否则返回 `false`。所有继承自 [Edge](/zh/docs/api/model/edge) 的边都返回 `true`。

```ts
if (cell.isEdge()) {
  // do something if the cell is an edge.
}
```

#### toJSON(...)

```ts
toJSON(options?: Cell.ToJSONOptions): Object
```

将节点/边的结构化数据转换为 JSON 数据，以便做持久化存储（通常我们通过调用 `graph.toJSON` 来导出整个画布的数据）。

| 选项         | 类型    | 默认值  | 必选 | 描述                                    |
|--------------|---------|---------|:----:|---------------------------------------|
| options.diff | boolean | `false` |      | 是否返回与默认值相比具有差异的那些数据（还是会导出整个画布的数据）。 |

- 当 `options.diff` 为 `false` 时，返回完整数据。
- 当 `options.diff` 为 `true` 时，返回差异数据（剔除属性的默认值）。

#### clone(...)

```ts
clone(options?: Cell.CloneOptions): Cell | Node | Edge | { [id:string]: Node | Edge }
```

克隆节点/边。

| 选项         | 类型    | 默认值  | 必选 | 描述                                                |
|--------------|---------|---------|:----:|---------------------------------------------------|
| options.deep | boolean | `false` |      | 是否克隆子孙节点和边，默认为 `false` 表示只克隆自身。 |

- 当 `options.deep` 为 `false` 时，返回通克隆创建的新节点/边。
- 当 `options.deep` 为 `true` 时，返回一个对象，对象的 Key 是被克隆节点/边的 ID，对象的 Value 是克隆出来的节点/边。

#### on(...)

```ts
on(name: string, handler: Events.Handler, context?: any): this
```

监听事件。

| 选项    | 类型           | 默认值 | 必选 | 描述                  |
|---------|----------------|--------|:----:|---------------------|
| name    | string         |        |  ✓   | 事件名称。             |
| handler | Events.Handler |        |  ✓   | 回调函数。             |
| context | any            |        |      | 回调函数的调用上下文。 |

#### once(...)

```ts
once(name: string, handler: Events.Handler, context?: any): this
```

监听一次事件，当事件被触发后自动删除该监听。

| 选项    | 类型           | 默认值 | 必选 | 描述                  |
|---------|----------------|--------|:----:|---------------------|
| name    | string         |        |  ✓   | 事件名称。             |
| handler | Events.Handler |        |  ✓   | 回调函数。             |
| context | any            |        |      | 回调函数的调用上下文。 |

#### off(...)

```ts
/**
 * 删除所有事件监听。
 */
off(): this

/**
 * 删除指定 name 的所有事件监听。
 */
off(name: string): this

/**
 * 删除指定 handler 对应的事件监听。
 */
off(name: null, handler: Events.Handler): this

/**
 * 删除指定 name 和 handler 的事件监听。
 */
off(name: string, handler: Events.Handler, context?: any): this
```

删除事件监听。

#### trigger(...)

```ts
trigger(name: string, ...args?: any[]): boolean | Promise<boolean>
```

触发事件。

| 选项    | 类型   | 默认值 | 必选 | 描述                |
|---------|--------|--------|:----:|-------------------|
| name    | string |        |  ✓   | 事件名称。           |
| ...args | any[]  |        |      | 传给回调函数的参数。 |

- 当回调函数都是同步函数时，只要某个回调函数返回 `false` 时就返回 `false`，否则返回 `true`。
- 当回调函数中存在异步函数时，按照同步回调的判断逻辑，返回 `Promise<boolean>`。

#### dispose()

```ts
dispose(): void
```

销毁并从父节点中移除节点/边。

### 元素结构 markup

指定了渲染节点/边时使用的 SVG/HTML 结构，使用 [JSON 格式描述](#markup)，通常在定义节点/边时通过 [`config`]() 方法将其设置为所有实例共享。当修改 `markup` 时，将触发 `change:markup` 事件和画布重绘。

#### get markup

获取 `markup`。

```ts
const markup = cell.markup
```

#### set markup

设置 `markup`，并触发 `change:markup` 事件和画布重绘。

```ts
cell.markup = markup
```

#### getMarkup()

```ts
getMarkup(): Markup
```

获取 `markup`。

```ts
const markup = cell.getMarkup()
```

#### setMarkup(...)

```ts
setMarkup(markup: Markup, options?: Cell.SetOptions): this
```

设置 `markup`。默认情况触发 `change:markup` 事件和画布重绘，当 `options.silent` 为 `true` 时不触发 `change:markup` 事件和画布重绘。

| 名称             | 类型              | 必选 | 默认值  | 描述                                               |
|------------------|-------------------|:----:|---------|----------------------------------------------------|
| markup           | [Markup](#markup) |  ✓   |         |                                                    |
| options.silent   | boolean           |      | `false` | 为 `true` 时不触发 `change:markup` 事件和画布重绘。 |
| options...others | object            |      |         | 其他自定义键值对，可以在事件回调中使用。             |

#### removeMarkup(...)

```ts
removeMarkup(options?: Cell.SetOptions): this
```

删除 `markup`。默认情况触发 `change:markup` 事件和画布重绘，当 `options.silent` 为 `true` 时不触发 `change:markup` 事件和画布重绘。

| 名称             | 类型    | 必选 | 默认值  | 描述                                               |
|------------------|---------|------|---------|--------------------------------------------------|
| options.silent   | boolean |      | `false` | 为 `true` 时不触发 `change:markup` 事件和画布重绘。 |
| options...others | object  |      |         | 其他自定义键值对，可以在事件回调中使用。             |

### 元素属性 attrs

属性 `attrs` 是一个[复杂对象](#attrs-1)，当修改 `attrs` 时，将触发 `change:attrs` 事件和画布重绘。

#### get attrs

获取属性。

```ts
const atts = cell.attrs
```

#### set attrs

设置属性，并触发 `change:attrs` 事件和画布重绘。

```ts
cell.atts = attrs
```

#### getAttrs()

```ts
getAttrs(): Attr.CellAttrs
```

获取属性。

```ts
const atts = cell.getAttrs()
```

#### setAttrs(...)

```ts
setAttrs(attrs: Attr.CellAttrs, options?: Cell.SetAttrOptions): this
```

设置属性，默认情况触发 `change:attrs` 事件和画布重绘。

| 名称              | 类型                                | 必选 | 默认值  | 描述                                                                                   |
|-------------------|-------------------------------------|:----:|---------|----------------------------------------------------------------------------------------|
| attrs             | Attr.CellAttrs \| null \| undefined |  ✓   |         |                                                                                        |
| options.overwrite | boolean                             |      | `false` | 为 `true` 时替换现有属性，否则根据 `options.deep` 选项进行深度或浅度 merge。             |
| options.deep      | boolean                             |      | `true`  | 当 `options.overwrite` 为 `false` 时有效， 为 `true` 时进行深度 merge，否则进行浅 merge。 |
| options.silent    | boolean                             |      | `false` | 为 `true` 时不触发 `change:attrs` 事件和画布重绘。                                      |
| options...others  | object                              |      |         | 其他自定义键值对，可以在事件回调中使用。                                                 |

默认情况，指定的属性将与旧属性进行[深度 merge](https://www.lodashjs.com/docs/latest#_mergeobject-sources)：

```ts
console.log(cell.getAttrs())
// {
//   body: { fill: '#ffffff' },
//   label: { fill: '#333333' },
// }

cell.setAttrs({
  body: { fill: '#f5f5f5' },
  label: { text: 'My Label' },
})

console.log(cell.getAttrs())
// {
//   body: { fill: '#f5f5f5' },
//   label: { fill: '#333333', text: 'My Label' },
// }
```

当 `options.deep` 为 `false` 时，进行浅 merge：

```ts
console.log(cell.getAttrs())
// {
//   body: { fill: '#ffffff' },
//   label: { fill: '#333333' },
// }

cell.setAttrs({ label: { text: 'My Label' } }, { deep: false })

console.log(cell.getAttrs())
// {
//   body: { fill: '#ffffff' },
//   label: { text: 'My Label' },
// }
```

当 `options.overwrite` 为 `true` 时，直接替换旧属性：

```ts
console.log(cell.getAttrs())
// {
//   body: { fill: '#ffffff' },
//   label: { fill: '#333333' },
// }

cell.setAttrs({ label: { text: 'My Label' } }, { overwrite: true })

console.log(cell.getAttrs())
// {
//   label: { text: 'My Label' },
// }
```

#### replaceAttrs(...)

```ts
replaceAttrs(attrs: Attr.CellAttrs, options: Cell.SetOptions = {}): this
```

用给定的属性替换原有属性，相当于调用 `setAttrs(attrs, { ...options, overwrite: true })`。

| 名称             | 类型                                | 必选 | 默认值  | 描述                                              |
|------------------|-------------------------------------|:----:|---------|---------------------------------------------------|
| attrs            | Attr.CellAttrs \| null \| undefined |  ✓   |         |                                                   |
| options.silent   | boolean                             |      | `false` | 为 `true` 时不触发 `change:attrs` 事件和画布重绘。 |
| options...others | object                              |      |         | 其他自定义键值对，可以在事件回调中使用。            |

#### updateAttrs(...)

```ts
updateAttrs(attrs: Attr.CellAttrs, options: Cell.SetOptions = {}): this
```

使用浅 merge 更新属性，相当于调用 `setAttrs(attrs, { ...options, deep: false })`。

| 名称             | 类型                                | 必选 | 默认值  | 描述                                              |
|------------------|-------------------------------------|:----:|---------|---------------------------------------------------|
| attrs            | Attr.CellAttrs \| null \| undefined |  ✓   |         |                                                   |
| options.silent   | boolean                             |      | `false` | 为 `true` 时不触发 `change:attrs` 事件和画布重绘。 |
| options...others | object                              |      |         | 其他自定义键值对，可以在事件回调中使用。            |

#### removeAttrs(...)

```ts
removeAttrs(options?: Cell.SetOptions): this
```

删除属性。

| 名称             | 类型    | 必选 | 默认值  | 描述                                              |
|------------------|---------|:----:|---------|-------------------------------------------------|
| options.silent   | boolean |      | `false` | 为 `true` 时不触发 `change:attrs` 事件和画布重绘。 |
| options...others | object  |      |         | 其他自定义键值对，可以在事件回调中使用。            |

#### getAttrByPath(...)

```ts
getAttrByPath<T>(path?: string | string[]): T
```

根据属性路径获取属性值。

| 名称 | 类型               | 必选 | 默认值 | 描述                                                                                                                                   |
|------|--------------------|:----:|--------|--------------------------------------------------------------------------------------------------------------------------------------|
| path | string \| string[] |      |        | 属性路径。当 `path` 为 `string` 类型时，路径是以 `\` 分割的字符串。 当 `path` 为 `string[]` 类型时，路径是属性对象路径上的 Key 构成的数组。 |

某节点的属性值如下：

```ts
console.log(cell.getAttrs())
// {
//   body: { fill: '#ffffff' },
//   label: { fill: '#333333' },
// }
```

当路径为空时返回全部属性：

```ts
console.log(cell.getAttrByPath())
// {
//   body: { fill: '#ffffff' },
//   label: { fill: '#333333' },
// }
```

通过字符串路径获取属性值：

```ts
console.log(cell.getAttrByPath('body'))
// { fill: '#ffffff' }

console.log(cell.getAttrByPath('body/fill'))
// '#ffffff'

console.log(cell.getAttrByPath('unkonwn'))
// undefined

console.log(cell.getAttrByPath('body/unkonwn'))
// undefined
```

通过属性对象的 Key 数组构成的路径获取属性值：

```ts
console.log(cell.getAttrByPath(['body']))
// { fill: '#ffffff' }

console.log(cell.getAttrByPath(['body', 'fill']))
// '#ffffff'

console.log(cell.getAttrByPath(['unkonwn']))
// undefined

console.log(cell.getAttrByPath(['body', 'unkonwn']))
// undefined
```

#### setAttrByPath(...)

```ts
setAttrByPath(path: string | string[], value: Attr.ComplexAttrValue, options?: Cell.SetOptions): this
```

根据属性路径设置属性值。

| 名称             | 类型                  | 必选 | 默认值  | 描述                                                                                                                                   |
|------------------|-----------------------|:----:|---------|--------------------------------------------------------------------------------------------------------------------------------------|
| path             | string \| string[]    |  ✓   |         | 属性路径。 当 `path` 为 `string` 类型时，路径是以 `\` 分割的字符串。当 `path` 为 `string[]` 类型时，路径是属性对象路径上的 Key 构成的数组。 |
| value            | Attr.ComplexAttrValue |  ✓   |         | 新属性值。                                                                                                                              |
| options.silent   | boolean               |      | `false` | 为 `true` 时不触发 `change:attrs` 事件和画布重绘。                                                                                      |
| options...others | object                |      |         | 其他自定义键值对，可以在事件回调中使用。                                                                                                 |

某节点的初始属性值如下：

```ts
console.log(cell.getAttrs())
// {
//   body: { fill: '#ffffff' },
//   label: { fill: '#333333' },
// }
```

通过字符串路径设置属性值：

```ts
cell.setAttrByPath('body', { stroke: '#000000' }) // 替换 body 属性值
console.log(cell.getAttrs())
// {
//   body: { stroke: '#000000' },
//   label: { fill: '#333333' },
// }

cell.setAttrByPath('body/fill', '#f5f5f5') // 设置 body.fill 属性值
console.log(cell.getAttrs())
// {
//   body: { stroke: '#000000', fill: '#f5f5f5' },
//   label: { fill: '#333333' },
// }
```

或者通过属性对象的 Key 数组构成的路径设置属性值：

```ts
cell.setAttrByPath(['body'], { stroke: '#000000' }) // 替换 body 属性值
console.log(cell.getAttrs())
// {
//   body: { stroke: '#000000' },
//   label: { fill: '#333333' },
// }

cell.setAttrByPath(['body', 'fill'], '#f5f5f5') // 设置 body.fill 属性值
console.log(cell.getAttrs())
// {
//   body: { stroke: '#000000', fill: '#f5f5f5' },
//   label: { fill: '#333333' },
// }
```

#### removeAttrByPath(...)

```ts
removeAttrByPath(path: string | string[], options?: Cell.SetOption ): this
```

删除指定路径的属性值。

| 名称             | 类型               | 必选 | 默认值  | 描述                                                                                                                                    |
|------------------|--------------------|:----:|---------|---------------------------------------------------------------------------------------------------------------------------------------|
| path             | string \| string[] |  ✓   |         | 属性路径。 当 `path` 为 `string` 类型时，路径是以 `\` 分割的字符串。 当 `path` 为 `string[]` 类型时，路径是属性对象路径上的 Key 构成的数组。 |
| options.silent   | boolean            |      | `false` | 为 `true` 时不触发 `change:attrs` 事件和画布重绘。                                                                                       |
| options...others | object             |      |         | 其他自定义键值对，可以在事件回调中使用。                                                                                                  |

某节点的初始属性值如下：

```ts
console.log(cell.getAttrs())
// {
//   body: { fill: '#ffffff' },
//   label: { fill: '#333333' },
// }
```

通过字符串路径删除属性值：

```ts
cell.removeAttrByPath('body/fill')
console.log(cell.getAttrs())
// {
//   body: { },
//   label: { fill: '#333333' },
// }

cell.removeAttrByPath('body')
console.log(cell.getAttrs())
// {
//   label: { fill: '#333333' },
// }
```

或者通过属性对象的 Key 数组构成的路径删除属性值：

```ts
cell.removeAttrByPath(['body', 'fill'])
console.log(cell.getAttrs())
// {
//   body: { },
//   label: { fill: '#333333' },
// }

cell.removeAttrByPath(['body'])
console.log(cell.getAttrs())
// {
//   label: { fill: '#333333' },
// }
```

#### attr(...)

```ts
/**
 * 获取属性。
 */
attr(): Cell.CellAttrs

/**
 * 获取指定路径上的属性值。
 */
attr<T>(path: string | string[]): T

/**
 * 设置指定路径上的属性值。
 */
attr(path: string | string[], value: Attr.ComplexAttrValue | null, options?: Cell.SetOptions): this

/**
 * 设置属性值，传入的属性与旧属性进行深度 merge。
 */
attr(attrs: Attr.CellAttrs, options?: Cell.SetOptions): this
```

该方法是 [`getAttrByPath`](#getattrbypath)、[`setAttrByPath`](#setattrbypath) 和 [`setAttrs`](#setattrs) 三个方法的整合，提供了上面四种函数签名，是一个非常实用的方法。

获取全部属性值：

```ts
console.log(cell.attr())
// {
//   body: { fill: '#ffffff' },
//   label: { fill: '#333333' },
// }
```

获取指定路径上的属性值：

```ts
console.log(cell.attr('body/fill'))
// '#ffffff'
```

设置指定路径上的属性值：

```ts
cell.attr('body/fill', '#f5f5f5')
console.log(cell.attr())
// {
//   body: { fill: '#f5f5f5' },
//   label: { fill: '#333333' },
// }
```

通过属性对象设置属性值，与就属性对象进行[深度 merge](https://www.lodashjs.com/docs/latest#_mergeobject-sources)。

```ts
cell.attr({
  body: { stroke: '#000000' },
  label: { fill: 'blue', text: 'my lable' },
})
console.log(cell.attr())
// {
//   body: { fill: '#f5f5f5', stroke: '#000000' },
//   label: { fill: 'blue', text: 'my lable' },
// }
```

### 层级 zIndex

`zIndex` 是节点/边在画布中的层级，默认根据节点/边添加顺序自动确定。当修改 `zIndex` 时，将触发 `change:zIndex` 事件和画布重绘。

#### get zIndex

获取 `zIndex`。

```ts
const z = cell.zIndex
```

#### set zIndex

设置 `zIndex`，触发 `change:zIndex` 事件和画布重绘。

```ts
cell.zIndex = 2
```

#### getZIndex()

```ts
getZIndex(): number
```

获取 `zIndex`。

```ts
const z = cell.getZIndex()
```

#### setZIndex(...)

```ts
setZIndex(zIndex: number, options?: Cell.SetOptions): this
```

设置 `zIndex`。默认情况触发 `change:zIndex` 事件和画布重绘，当 `options.silent` 为 `true` 时不触发 `change:zIndex` 事件和画布重绘。

| 名称             | 类型    | 必选 | 默认值  | 描述                                               |
|------------------|---------|:----:|---------|----------------------------------------------------|
| zIndex           | number  |  ✓   |         |                                                    |
| options.silent   | boolean |      | `false` | 为 `true` 时不触发 `change:zIndex` 事件和画布重绘。 |
| options...others | object  |      |         | 其他自定义键值对，可以在事件回调中使用。             |

#### removeZIndex(...)

```ts
removeZIndex(options?: Cell.SetOptions): this
```

删除 `zIndex`。默认情况触发 `change:zIndex` 事件和画布重绘，当 `options.silent` 为 `true` 时不触发 `change:zIndex` 事件和画布重绘。

| 名称             | 类型    | 必选 | 默认值  | 描述                                               |
|------------------|---------|------|---------|--------------------------------------------------|
| options.silent   | boolean |      | `false` | 为 `true` 时不触发 `change:zIndex` 事件和画布重绘。 |
| options...others | object  |      |         | 其他自定义键值对，可以在事件回调中使用。             |

#### toFront(...)

```ts
toFront(options?: Cell.ToFrontOptions): this
```

将节点/边移到最顶层。

| 名称             | 类型    | 必选 | 默认值  | 描述                                               |
|------------------|---------|------|---------|--------------------------------------------------|
| options.deep     | boolean |      | `false` | 为 `true` 时同时更新所有子节点/边的层级。           |
| options.silent   | boolean |      | `false` | 为 `true` 时不触发 `change:zIndex` 事件和画布重绘。 |
| options...others | object  |      |         | 其他自定义键值对，可以在事件回调中使用。             |

#### toBack(...)

```ts
toBack(options?: Cell.ToBackOptions): this
```

将节点/边移到最底层。

| 名称             | 类型    | 必选 | 默认值  | 描述                                               |
|------------------|---------|------|---------|--------------------------------------------------|
| options.deep     | boolean |      | `false` | 为 `true` 时同时更新所有子节点/边的层级。           |
| options.silent   | boolean |      | `false` | 为 `true` 时不触发 `change:zIndex` 事件和画布重绘。 |
| options...others | object  |      |         | 其他自定义键值对，可以在事件回调中使用。             |

默认情况，更新 `zIndex` 时，触发 `change:zIndex` 事件和画布重绘：

```ts
cell.toBack()
```

当 `options.deep` 为 `true` 时，同时更新所有子节点/边的层级。：

```ts
cell.toBack({ deep: true })
```

### 可见性 Visible

#### get visible

返回节点/边是否可见。

```ts
if (cell.visible) {
  // do something
}
```

#### set visible

设置节点/边是否可见，并触发 `change:visible` 事件和画布重绘。

#### show(...)

```ts
show(options?: Cell.SetOptions): this
```

显示节点/边。

| 名称             | 类型    | 必选 | 默认值  | 描述                                                |
|------------------|---------|:----:|---------|---------------------------------------------------|
| options.silent   | boolean |      | `false` | 为 `true` 时不触发 `change:visible` 事件和画布重绘。 |
| options...others | object  |      |         | 其他自定义键值对，可以在事件回调中使用。              |

#### hide(...)

```ts
hide(options?: Cell.SetOptions): this
```

隐藏节点/边。

| 名称             | 类型    | 必选 | 默认值  | 描述                                                |
|------------------|---------|:----:|---------|---------------------------------------------------|
| options.silent   | boolean |      | `false` | 为 `true` 时不触发 `change:visible` 事件和画布重绘。 |
| options...others | object  |      |         | 其他自定义键值对，可以在事件回调中使用。              |

:::info{title=提示}
X6 2.x 是通过在节点标签上增加 `display: none` 来实现元素隐藏。
:::

#### isVisible()

```ts
isVisible(): boolean
```

返回节点/边是否可见。

#### setVisible(...)

```ts
setVisible(visible: boolean, options?: Cell.SetOptions): this
```

设置节点/边的可见性。默认情况触发 `change:visible` 事件和画布重绘，当 `options.silent` 为 `true` 时不触发 `change:visible` 事件和画布重绘。

| 名称             | 类型    | 必选 | 默认值  | 描述                                                |
|------------------|---------|:----:|---------|-----------------------------------------------------|
| visible          | boolean |  ✓   |         |                                                     |
| options.silent   | boolean |      | `false` | 为 `true` 时不触发 `change:visible` 事件和画布重绘。 |
| options...others | object  |      |         | 其他自定义键值对，可以在事件回调中使用。              |

#### toggleVisible(...)

```ts
toggleVisible(options?: Cell.SetOptions): this
```

切换节点/边的可见性。默认情况触发 `change:visible` 事件和画布重绘，当 `options.silent` 为 `true` 时不触发 `change:visible` 事件和画布重绘。

| 名称             | 类型    | 必选 | 默认值  | 描述                                                |
|------------------|---------|:----:|---------|---------------------------------------------------|
| options.silent   | boolean |      | `false` | 为 `true` 时不触发 `change:visible` 事件和画布重绘。 |
| options...others | object  |      |         | 其他自定义键值对，可以在事件回调中使用。              |

### 业务数据 Data

与节点/边关联的业务数据。例如，我们在实际使用时通常会将某些业务数据存在节点/边的 data 上。

```ts
const rect = new Shape.Rect({
  x: 40,
  y: 40,
  width: 100,
  height: 40,
  data: {
    bizID: 125,
    date: '20200630',
    price: 89.0,
  },
})
```

#### get data

获取关联的数据。

#### set data

设置关联的数据，并触发 `change:data` 事件和画布重绘。

#### getData()

```ts
getData(): any
```

获取关联的数据。

#### setData(...)

```ts
setData(data: any, options?: Cell.SetDataOptions): this
```

设置关联的业务数据。默认情况触发 `change:data` 事件和画布重绘，当 `options.silent` 为 `true` 时不触发 `change:data` 事件和画布重绘。

| 名称              | 类型    | 必选 | 默认值  | 描述                                                                                   |
|-------------------|---------|:----:|---------|----------------------------------------------------------------------------------------|
| data              | any     |  ✓   |         |                                                                                        |
| options.overwrite | boolean |      | `false` | 为 `true` 时替换现有值，否则根据 `options.deep` 选项进行深度或浅度 merge。               |
| options.deep      | boolean |      | `true`  | 当 `options.overwrite` 为 `false` 时有效， 为 `true` 时进行深度 merge，否则进行浅 merge。 |
| options.silent    | boolean |      | `false` | 为 `true` 时不触发 `change:data` 事件和画布重绘。                                       |
| options...others  | object  |      |         | 其他自定义键值对，可以在事件回调中使用。                                                 |

默认与原数据进行[深度 merge](https://www.lodashjs.com/docs/latest#_mergeobject-sources)，并触发 `change:data` 事件和画布重绘：

```ts
cell.setData(data)
```

当 `options.overwrite` 为 `true` 时，替换旧数据：

```ts
cell.setData(data, { overwrite: true })
```

当 `options.deep` 为 `false` 时，与原数据进行浅 merge：

```ts
cell.setData(data, { deep: false })
```

:::info{title=提示}
`setData` 方法是通过浅比较来判断数据是否有更新，从而决定是否触发节点重绘。
:::

```ts
const obj = { name: 'x6', star: true }
node.setData(obj) // 此时会触发节点重绘

obj.star = false
node.setData(obj) // 注意，此时不会进行深比较，判定对象未发生修改，不会触发节点重绘

node.setData({
  ...obj,
  star: false,
}) // 此时会触发节点重绘
```

#### replaceData(...)

```ts
replaceData(data: any, options: Cell.SetOptions = {}): this
```

用指定的数据替换原数据，相当于调用 `setData(data, { ...options, overwrite: true })`。

| 名称             | 类型    | 必选 | 默认值  | 描述                                             |
|------------------|---------|:----:|---------|--------------------------------------------------|
| data             | any     |  ✓   |         |                                                  |
| options.silent   | boolean |      | `false` | 为 `true` 时不触发 `change:data` 事件和画布重绘。 |
| options...others | object  |      |         | 其他自定义键值对，可以在事件回调中使用。           |

#### updateData(...)

```ts
updateData(data: any, options: Cell.SetOptions = {}): this
```

通过浅 merge 来更新数据，相当于调用 `setData(data, { ...options, deep: false })`。

| 名称             | 类型    | 必选 | 默认值  | 描述                                             |
|------------------|---------|:----:|---------|--------------------------------------------------|
| data             | any     |  ✓   |         |                                                  |
| options.silent   | boolean |      | `false` | 为 `true` 时不触发 `change:data` 事件和画布重绘。 |
| options...others | object  |      |         | 其他自定义键值对，可以在事件回调中使用。           |

#### removeData(...)

```ts
removeData(options: Cell.SetOptions): this
```

删除数据。默认情况触发 `change:data` 事件和画布重绘，当 `options.silent` 为 `true` 时不触发 `change:data` 事件和画布重绘。

| 名称             | 类型    | 必选 | 默认值  | 描述                                             |
|------------------|---------|------|---------|------------------------------------------------|
| options.silent   | boolean |      | `false` | 为 `true` 时不触发 `change:data` 事件和画布重绘。 |
| options...others | object  |      |         | 其他自定义键值对，可以在事件回调中使用。           |

### 父子关系 Parent/Children

#### get parent

获取父节点。

#### getParent()

```ts
getParent(): Cell | null
```

获取父节点。当父节点存在是返回父节点，否则返回 `null`。

#### setParent(...)

```ts
setParent(parent: Cell | null, options?: Cell.SetOptions): this
```

设置父节点。

| 名称             | 类型         | 必选 | 默认值  | 描述                                                |
|------------------|--------------|:----:|---------|---------------------------------------------------|
| parent           | Cell \| null |  ✓   |         | 父节点或 `null`，当 `parent` 为 `null` 时删除父节点。 |
| options.silent   | boolean      |      | `false` | 为 `true` 时不触发 `change:parent` 事件和画布重绘。  |
| options...others | object       |      |         | 其他自定义键值对，可以在事件回调中使用。              |

#### getParentId()

```ts
getParentId(): string | undefined
```

获取父节点的 ID。父节点存在是返回父节点的 ID，否则返回 `undefined`。

#### hasParent()

```ts
hasParent(): boolean
```

检查节点/边是否有父节点。

#### get children

获取所有子节点/边。

#### getChildren()

```ts
getChildren(): Cell[] | null
```

获取所有子节点/边。

#### setChildren()

```ts
setChildren(children: Cell[] | null, options?: Cell.SetOptions)
```

设置子节点/边。

| 名称             | 类型           | 必选 | 默认值  | 描述                                                            |
|------------------|----------------|:----:|---------|---------------------------------------------------------------|
| children         | Cell[] \| null |  ✓   |         | 子节点/边数组或 `null`，当 `children` 为 `null` 时清空子节点/边。 |
| options.silent   | boolean        |      | `false` | 为 `true` 时不触发 `change:children` 事件和画布重绘。            |
| options...others | object         |      |         | 其他自定义键值对，可以在事件回调中使用。                          |

#### isParentOf(...)

```ts
isParentOf(child: Cell | null): boolean
```

返回当前节点是否是指定 Cell 的父节点。

| 名称  | 类型         | 必选 | 默认值 | 描述 |
|-------|--------------|:----:|--------|------|
| child | Cell \| null |  ✓   |        |      |

#### isChildOf(...)

```ts
isChildOf(parent: Cell | null): boolean
```

返回当前节点/边是否是指定节点的的子节点/边。

| 名称   | 类型         | 必选 | 默认值 | 描述 |
|--------|--------------|:----:|--------|------|
| parent | Cell \| null |  ✓   |        |      |

#### eachChild(...)

```ts
eachChild(iterator: (child: Cell, index: number, children: Cell[]) => void, context?: any): this
```

遍历子节点。

| 名称     | 类型                                                   | 必选 | 默认值 | 描述                    |
|----------|--------------------------------------------------------|:----:|--------|-----------------------|
| iterator | (child: Cell, index: number, children: Cell[]) => void |  ✓   |        | 迭代器函数。             |
| context  | any                                                    |      |        | 迭代器函数的执行上下文。 |

#### filterChild(...)

```ts
filterChild(iterator: (child: Cell, index: number, children: Cell[]) => boolean, context?: any): Cell[]
```

过滤子节点。

| 名称     | 类型                                                      | 必选 | 默认值 | 描述                    |
|----------|-----------------------------------------------------------|:----:|--------|-----------------------|
| iterator | (child: Cell, index: number, children: Cell[]) => boolean |  ✓   |        | 过滤器函数。             |
| context  | any                                                       |      |        | 过滤器函数的执行上下文。 |

#### getChildCount()

```ts
getChildCount(): number
```

获取子节点/边的数量。

#### getChildIndex(...)

```ts
getChildIndex(child: Cell): number
```

获取子节点/边的索引。

| 名称  | 类型 | 必选 | 默认值 | 描述 |
|-------|------|:----:|--------|------|
| child | Cell |  ✓   |        |      |

#### getChildAt(...)

```ts
getChildAt(index: number): Cell | null
```

获取指定索引位置的子节点/边。

| 名称  | 类型   | 必选 | 默认值 | 描述      |
|-------|--------|:----:|--------|---------|
| index | number |  ✓   |        | 索引位置。 |

#### getAncestors(...)

```ts
getAncestors(options?: { deep?: boolean }): Cell[]
```

获取所有祖先节点。

| 名称         | 类型    | 必选 | 默认值 | 描述                                                                 |
|--------------|---------|:----:|--------|--------------------------------------------------------------------|
| options.deep | boolean |      | `true` | 默认递归获取所有祖先节点，设置为 `false` 时只返回当前节点/边的父节点。 |

#### getDescendants(...)

```ts
getDescendants(options?: Cell.GetDescendantsOptions): Cell[]
```

获取所有子孙节点。

| 名称                 | 类型    | 必选 | 默认值  | 描述                                                                 |
|----------------------|---------|:----:|---------|--------------------------------------------------------------------|
| options.deep         | boolean |      | `true`  | 默认递归获取所有子孙节点，设置为 `false` 时只返回当前节点孩子节点/边。 |
| options.breadthFirst | boolean |      | `false` | 默认使用深度优先算法，设置为 `true` 时使用广度优先搜索算法。           |

返回子孙节点/边的数组。

#### isDescendantOf(...)

```ts
isDescendantOf(ancestor: Cell | null, options?: { deep?: boolean }): boolean
```

返回当前节点/边是否是指定节点的子孙节点/边。

| 名称         | 类型         | 必选 | 默认值 | 描述                                                                      |
|--------------|--------------|:----:|--------|-------------------------------------------------------------------------|
| ancestor     | Cell \| null |  ✓   |        | 指定节点。                                                                 |
| options.deep | boolean      |      | `true` | 默认递归判断指定节点的所有子孙节点/边，设置为 `false` 时只判断孩子节点/边。 |

#### isAncestorOf(...)

```ts
isAncestorOf(descendant: Cell | null, options?: { deep?: boolean }): boolean
```

返回当前节点是否是指定节点/边的祖先节点。

| 名称         | 类型         | 必选 | 默认值 | 描述                                                                      |
|--------------|--------------|:----:|--------|-------------------------------------------------------------------------|
| descendant   | Cell \| null |  ✓   |        | 指定节点/边。                                                              |
| options.deep | boolean      |      | `true` | 默认递归判断指定节点的所有子孙节点/边，设置为 `false` 时只判断孩子节点/边。 |

#### getCommonAncestor(...)

```ts
getCommonAncestor(...cells: (Cell | null | undefined)[]): Cell | null
```

获取给定节点/边的共同祖先节点。

| 名称     | 类型                          | 必选 | 默认值 | 描述         |
|----------|-------------------------------|:----:|--------|------------|
| ...cells | (Cell \| null \| undefined)[] |  ✓   |        | 指定节点/边。 |

#### addChild(...)

```ts
addChild(child: Cell, options?: Cell.SetOptions): this
```

将指定的节点/边添加到当前节点的子节点的末尾。

| 名称             | 类型    | 必选 | 默认值  | 描述                                                 |
|------------------|---------|:----:|---------|----------------------------------------------------|
| child            | Cell    |  ✓   |         | 指定的节点/边。                                       |
| options.silent   | boolean |      | `false` | 为 `true` 时不触发 `change:children` 事件和画布重绘。 |
| options...others | object  |      |         | 其他自定义键值对，可以在事件回调中使用。               |

#### removeChild(...)

```ts
removeChild(child: Cell, options?: Cell.RemoveOptions): Cell | null
```

移除指定的子节点/边。

| 名称             | 类型    | 必选 | 默认值  | 描述                                                          |
|------------------|---------|:----:|---------|-------------------------------------------------------------|
| child            | Cell    |  ✓   |         | 指定的节点/边。                                                |
| options.deep     | boolean |      | `true`  | 默认递归移除所有子节点/边，设置为 `false` 时只移除当前节点/边。 |
| options.silent   | boolean |      | `false` | 为 `true` 时不触发 `change:children` 事件和画布重绘。          |
| options...others | object  |      |         | 其他自定义键值对，可以在事件回调中使用。                        |

#### remove(...)

```ts
remove(options?: Cell.RemoveOptions): this
```

先将当前节点/边从父节点，然后将其从画布中移除。

### 节点和边的属性 Properties

上面介绍的 `markup`、`attrs`、`zIndex`、`data` 等基础选项，以及节点的 `size`、 `position`、`angle`、`ports` 等选项，还有边的 `source`、`target`、`labels` 等选项，还有创建节点/边时提供的那些额外的键值对，我们都称为属性(Property)。

```ts
const rect = new Shape.Rect({
  x: 30,
  y: 30,
  width: 100,
  height: 40,
  attrs: {...},
  data: {...},
  zIndex: 10,
  sale: {...},
  product: {
    id: '1234',
    name: 'apple',
    price: 3.99,
  },
})
```

例如，上面代码中的 `attrs`、`data`、`zIndex` 都是标准的属性，其中 `x` 和 `y` 是一对[自定义选项](#自定义选项)，节点初始化时被转换为了 `position` 属性，同样 `width` 和 `height` 也是一对[自定义选项](#自定义选项)，节点初始化时被转换为了 `size` 属性，最后剩余的 `sale` 和 `product` 两个对象是非标准的属性。

上面介绍了一些标准属性以及操作（`get`/`set`）这些标准属性的方法，下面再介绍几个比较通用的方法，这些方法对标准和非标准属性都适用。

#### getProp(...)

获取指定的属性值。

```ts
getProp<T>(key: string, defaultValue?: T): T
```

| 名称         | 类型   | 必选 | 默认值 | 描述                                     |
|--------------|--------|:----:|--------|----------------------------------------|
| key          | string |  ✓   |        | 属性名称。                                |
| defaultValue | T      |      | -      | 默认值，当指定的属性不存在时返回该默认值。 |

```ts
// 获取标准属性
const zIndex = rect.getProp<number>('zIndex')
const position = rect.getProp<{ x: number; y: number }>('position')

// 获取非标准属性
const product = rect.getProp('product')
```

#### setProp(...)

设置指定的属性，默认情况触发对应的 `change:xxx` 事件和画布重绘，当 `options.silent` 为 `true` 时不触发。

```ts
// 设置指定的属性
setProp(key: string, value: any, options?: Cell.SetOptions): this
// 批量设置属性，提供的属性与原属性进行深度 merge。注意使用这种方式会触发 propHooks 的调用
setProp(props: Partial<Properties>, options?: Cell.SetOptions): this
```

| 名称             | 类型                  | 必选 | 默认值  | 描述                                                                                                |
|------------------|-----------------------|:----:|---------|---------------------------------------------------------------------------------------------------|
| key              | string                |  ✓   |         | 属性名称。                                                                                           |
| value            | any                   |  ✓   |         | 属性值。                                                                                             |
| props            | `Partial<Properties>` |  ✓   |         | 属性键值对，将与现有属性进行[深度 merge](https://www.lodashjs.com/docs/latest#_mergeobject-sources)。 |
| options.silent   | boolean               |      | `false` | 为 `true` 时不触发 `change:markup` 事件和画布重绘。                                                  |
| options...others | object                |      |         | 其他自定义键值对，可以在事件回调中使用。                                                              |

```ts
// 设置单个属性：
rect.setProp('size', { width: 100, height: 30 })
rect.setProp('zIndex', 10)

// 同时设置多个属性
rect.setProp({
  size: {
    width: 100,
    height: 30,
  },
  zIndex: 10,
})
```

#### removeProp(...)

删除指定路径的属性。默认情况触发对应的 `change:xxx` 事件和画布重绘，当 `options.silent` 为 `true` 时不触发。

```ts
removeProp(path: string | string[], options?: Cell.SetOptions): this
```

| 名称             | 类型               | 必选 | 默认值  | 描述                                               |
|------------------|--------------------|:----:|---------|--------------------------------------------------|
| path             | string \| string[] |  ✓   |         | 属性路径。                                          |
| options.silent   | boolean            |      | `false` | 为 `true` 时不触发 `change:markup` 事件和画布重绘。 |
| options...others | object             |      |         | 其他自定义键值对，可以在事件回调中使用。             |

```ts
rect.removeProp('zIndex')
rect.removeProp('product/id')
```

#### prop(...)

该方法是上面几个方法的整合，提供了上面四种函数签名，是一个非常实用的方法。

```ts
prop(): Properties // 获取所有属性。
prop<T>(path: string | string[]): T // 获取指定路径的属性值。
prop(path: string | string[], value: any, options?: Cell.SetOptions): this // 设置指定路径的属性值，与路径上的现有属性进行深度 merge。
prop(props: Partial<Properties>, options?: Cell.SetOptions): this // 设置属性，与现有属性进行深度 merge。
```

```ts
// 获取属性：
rect.prop()
rect.prop('zIndex')
rect.prop('product/price')

// 设置属性：
rect.prop('zIndex', 10)
rect.prop('product/price', 5.99)
rect.prop({
  product: {
    id: '234',
    name: 'banana',
    price: 3.99,
  },
})
```

#### hasChanged(...)

```ts
hasChanged(key: string | undefined | null): boolean
```

返回指定的属性或所有属性是否已经改变。

| 名称 | 类型                        | 必选 | 默认值 | 描述                           |
|------|-----------------------------|:----:|--------|------------------------------|
| key  | string \| undefined \| null |      |        | 属性名。缺省时表示检查所有属性。 |

#### previous(...)

```ts
previous<T>(name: string): T | undefined
```

当指定的属性发生改变后，获取改变前的属性值。

| 名称 | 类型   | 必选 | 默认值 | 描述    |
|------|--------|:----:|--------|-------|
| key  | string |  ✓   |        | 属性名。 |

### 工具集 Tools

#### addTools(...)

```ts
addTools(
  items: Cell.ToolItem | Cell.ToolItem[],
  options?: Cell.AddToolOptions,
): this
addTools(
  items: Cell.ToolItem | Cell.ToolItem[],
  name: string,
  options?: Cell.AddToolOptions,
): this
```

添加小工具。

| 名称             | 类型                             | 必选 | 默认值  | 描述                                                                                                                                  |
|------------------|----------------------------------|:----:|---------|-------------------------------------------------------------------------------------------------------------------------------------|
| items            | Cell.ToolItem \| Cell.ToolItem[] |      |         | [NodeTool](/zh/docs/api/registry/node-tool#presets) 或 [EdgeTool](/zh/docs/api/registry/edge-tool#presets) 中定义的小工具。            |
| name             | string                           |      | `null`  | 定义该组工具的别称，可以作为`hasTools(name)`的参数                                                                                     |
| options.reset    | boolean                          |      | `false` | 是否清空工具集，默认向工具集追加小工具。                                                                                                |
| options.local    | boolean                          |      | `false` | 工具是否渲染到节点/边的容器中，默认为 `false`，所有工具会渲染在 `x6-graph-svg-decorator` 下面，只有在 `options.reset` 为 `true` 为时生效 |
| options.silent   | boolean                          |      | `false` | 为 `true` 时不触发 `change:tools` 事件和小工具重绘。                                                                                   |
| options...others | object                           |      |         | 其他自定义键值对，可以在事件回调中使用。                                                                                                |

#### getTools()

```ts
getTools(): Cell.Tools | null
```

获取工具集。

#### removeTools(...)

```ts
removeTools(options?: Cell.SetOptions): this
```

删除所有工具。

| 名称             | 类型    | 必选 | 默认值  | 描述                                                |
|------------------|---------|:----:|---------|---------------------------------------------------|
| options.silent   | boolean |      | `false` | 为 `true` 时不触发 `change:tools` 事件和小工具重绘。 |
| options...others | object  |      |         | 其他自定义键值对，可以在事件回调中使用。              |

#### hasTool(...)

```ts
hasTool(name: string): boolean
```

是否包含指定名称的工具。

#### removeTool(...)

```ts
removeTool(name: string, options?: Cell.SetOptions): this
removeTool(index: number, options?: Cell.SetOptions): this
```

删除指定名称的工具。

| 名称             | 类型             | 必选 | 默认值  | 描述                                                |
|------------------|------------------|:----:|---------|---------------------------------------------------|
| nameOrIndex      | string \| number |  ✓   |         | 工具名称或索引。                                     |
| options.silent   | boolean          |      | `false` | 为 `true` 时不触发 `change:tools` 事件和小工具重绘。 |
| options...others | object           |      |         | 其他自定义键值对，可以在事件回调中使用。              |

### 动画 Transition

#### transition(...)

```ts
transition(
  path: string | string[],
  target: Animation.TargetValue,
  options: Animation.StartOptions = {},
  delim: string = '/',
): () => void
```

将指定路径 `path` 上对应的属性值通过平滑动画的形式过渡到 `target` 指定的目标值，并返回 `stop` 方法，调用该方法时立即停止该动画。

| 名称                | 类型                                         | 必选 | 默认值  | 描述                               |
|---------------------|----------------------------------------------|:----:|---------|----------------------------------|
| path                | string \| string[]                           |  ✓   |         | 路径。                              |
| target              | any                                          |  ✓   |         | 目标属性值。                        |
| options.delay       | number                                       |      | `10`    | 动画延迟多久后开始，单位毫秒。       |
| options.duration    | number                                       |      | `100`   | 动画时长，单位毫秒。                 |
| options.timing      | Timing.Names \| (t: number) => number        |      |         | 定时函数。                          |
| options.interp      | \<T\>(from: T, to: T) => (time: number) => T |      |         | 插值函数。                          |
| options.start       | (args: Animation.CallbackArgs) => void       |      |         | 动画开始执行时的回调函数。          |
| options.progress    | (args: Animation.ProgressArgs) => void       |      |         | 动画执行过程中的回调函数。          |
| options.complete    | (args: Animation.CallbackArgs) => void       |      |         | 动画执行完成时的回调函数。          |
| options.stop        | (args: Animation.CallbackArgs) => void       |      |         | 动画被停止时的回调函数。            |
| options.finish      | (args: Animation.CallbackArgs) => void       |      |         | 动画执行完成或被停止时的回调函数。  |
| options.jumpedToEnd | boolean                                      |      | `false` | 手动停止动画时，是否立即将动画完成。 |
| delim               | string                                       |      | `/`     | 字符串路径分隔符。                  |

我们在 `Timing` 命名空间中提供了一些定时函数。可以使用内置的定时函数名，或提供一个具有 `(t: number) => number` 签名的函数。内置的定时函数如下：

- linear
- quad
- cubic
- inout
- exponential
- bounce
- easeInSine
- easeOutSine
- easeInOutSine
- easeInQuad
- easeOutQuad
- easeInOutQuad
- easeInCubic
- easeOutCubic
- easeInOutCubic
- easeInQuart
- easeOutQuart
- easeInOutQuart
- easeInQuint
- easeOutQuint
- easeInOutQuint
- easeInExpo
- easeOutExpo
- easeInOutExpo
- easeInCirc
- easeOutCirc
- easeInOutCirc
- easeInBack
- easeOutBack
- easeInOutBack
- easeInElastic
- easeOutElastic
- easeInOutElastic
- easeInBounce
- easeOutBounce
- easeInOutBounce

我们在 `Interp` 命名空间上内置了一些插值函数，通常我们可以通过路径上的属性值来自动确定使用哪种插值函数。内置的插值函数如下：

- number - 数字插值函数。
- object - `{ [key: string]: number }` 对象插值函数。
- unit - 数字+单位字符串插值函数，如 `10px`。支持的单位有：`px, em, cm, mm, in, pt, pc, %`。
- color - 16 进制颜色插值函数。

```ts
import { Timing, Interp } from '@antv/x6'

rect.transition('attrs/label/font-size', '1em', {
  interp: Interp.unit,
  timing: 'bounce', // Timing.bounce
})
```

#### stopTransition(...)

```ts
stopTransition(
  path: string | string[],
  options?: Animation.StopOptions<T>,
  delim: string = '/',
): this
```

停止与指定路径 `path` 对应的动画。

| 名称                | 类型                                   | 必选 | 默认值  | 描述                               |
|---------------------|----------------------------------------|:----:|---------|----------------------------------|
| path                | string \| string[]                     |  ✓   |         | 路径。                              |
| options.jumpedToEnd | boolean                                |      | `false` | 手动停止动画时，是否立即将动画完成。 |
| options.complete    | (args: Animation.CallbackArgs) => void |      |         | 动画执行完成时的回调函数。          |
| options.stop        | (args: Animation.CallbackArgs) => void |      |         | 动画被停止时的回调函数。            |
| options.finish      | (args: Animation.CallbackArgs) => void |      |         | 动画执行完成或被停止时的回调函数。  |
| delim               | string                                 |      | `/`     | 字符串路径分隔符。                  |

```ts
rect.stopTransition('attrs/label/font-size')
```

#### getTransitions()

```ts
getTransitions(): string[]
```

获取所有活跃的动画，返回活跃动画的路径。

```ts
// 停止所有动画
rect.getTransitions().forEach((path) => rect.stopTransition(path))
```

## config(...)

```ts
config<C extends Cell.Config = Cell.Config>(presets: C): void
```

设置节点/边的选项默认值。

| 名称              | 类型                   | 必选 | 默认值 | 描述                                                                                           |
|-------------------|------------------------|:----:|--------|----------------------------------------------------------------------------------------------|
| options.propHooks | Cell.PropHooks\<M, C\> |      |        | 自定义选项。                                                                                    |
| options.attrHooks | Attr.Definitions       |      |        | 自定义属性键值对。Key 是自定义属性的属性名，Value 是自定义属性对象（包含属性检查、应用属性等方法）。 |
| options...others  | object                 |      |        | 其他选项，节点/边的属性（Properties）。                                                            |

### 选项默认值

该方法对自定义节点/边非常友好，方便我们为我们的节点/边设置一些预设选项。例如，我们在定义矩形节点时，为其指定了默认 Markup、默认大小和默认样式。

```ts
Shape.Rect.config({
  width: 80,
  height: 40,
  markup: ...,
  attrs: ...,
})
```

我们创建矩形的代码就可以非常简单：

```ts
const rect = graph.addNode({
  x: 100,
  y: 100,
  attrs: {
    label: {
      text: 'rect',
    },
  },
})
```

每次调用 `config(presets)` 都是与当前预设值进行[深度 merge](https://www.lodashjs.com/docs/latest#_mergeobject-sources)，例如下面代码分别将矩形的边框默认颜色修改为红色和将默认文本颜色修改为蓝色，最终效果是两者的叠加：

```ts
// 只修改边框的默认颜色
Shape.Rect.config({
  attrs: {
    body: {
      stroke: 'red',
    },
  },
})

// 只修改默认文本颜色
Shape.Rect.config({
  attrs: {
    label: {
      fill: 'blue',
      // 覆盖上面定义的 red
      stroke: '#000',
    },
  },
})
```

### 自定义选项

创建矩形时我们可以使用 `label` 来设置矩形的标签文本：

```ts
const rect = graph.addNode({
  x: 100,
  y: 100,
  label: 'rect',
})
```

而我们并没有为矩形定义 `label` 这个选项，那这个 `label` 是怎么应用到 `attrs/label/text` 上的呢？这就用到了 `propHooks` 钩子，我们可以定义 `propHooks` 钩子来消费这些非标准的选项。

看下面 `label` 选项钩子的实现细节：

```ts
Shape.Rect.config({
  // 通过钩子将 label 应用到 'attrs/text/text' 属性上
  propHooks(metadata) {
    const { label, ...others } = metadata
    if (label) {
      ObjectExt.setByPath(others, 'attrs/text/text', label)
    }
    return others
  },
})
```

通过 `propHooks` 钩子，我们很容易就扩展出一些自定义的选项。例如，我们可以将某些样式定义为节点的选项，这样不仅可以减少嵌套，而且使创建节点的代码语义性更强。

看下面的代码，为矩形定义 `rx` 和 `ry` 自定义选项：

```ts
Shape.Rect.config({
  propHooks: {
    rx(metadata) {
      const { rx, ...others } = metadata
      if (rx != null) {
        ObjectExt.setByPath(others, 'attrs/body/rx', rx)
      }
      return others
    },
    ry(metadata) {
      const { ry, ...others } = metadata
      if (ry != null) {
        ObjectExt.setByPath(others, 'attrs/body/ry', ry)
      }
      return others
    },
  },
})
```

这样，我们就可以很方便添加圆角矩形：

```ts
const rect = graph.addNode({
  x: 100,
  y: 100,
  rx: 5,
  ry: 10,
  label: 'rect',
})
```

### 自定义属性

自定义属性是指那些非标准的 SVG/HTML 属性，如系统内置的 `refWidth`、`refHeight`、`sourceMarker`、`targetMarker` 等属性。这些属性都是全局共享的，我们可以通过 `attrHooks` 钩子来为节点/边定义**独享**的自定义属性。

例如：

```ts
import { Shape, Color } from '@antv/x6'

Shape.Rect.config({
  attrHooks: {
    fill: {
      set(val) {
        return Color.invert(val) // 自动反转填充色
      },
    },
    theme: {
      set(val) {
        // 同时设置填充色和边框色
        return {
          fill: val,
          stroke: Color.invert(val),
        }
      },
    },
  },
})
```

我们可以这样来使用上面定义的 `fill` 和 `theme` 属性：

```ts
const rect = graph.addNode({
  x: 100,
  y: 100,
  rx: 5,
  ry: 10,
  label: 'rect',
  attrs: {
    body: {
      theme: '#f5f5f5',
    },
    label: {
      fill: '#fff',
    },
  },
})
```

## 静态方法

### customId

我们在 Cell 基类上提供了一个静态方法 `customId` 来快速实现自定义节点/边ID。

```ts
customId(metadata: Cell.Metadata): string
```

例如：

```ts
import { Cell } from '@antv/x6'

let sid = 0
Cell.customId = ({ shape }) => {
  return `${shape}_${sid++}`
}
```