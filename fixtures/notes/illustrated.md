---
title: 图文与版式图鉴
description: 横图、竖图、长图、代码和表格，放在同一篇笔记里慢慢看。
tags: [图文, Markdown, 体验]
updated: 2026-09-12
---
# 图文与版式图鉴

这篇笔记把常见的文章版式放在一起。图片均为本机生成的原创山峦插图，可以点击放大；从工具栏的 Raw 入口可以看到完整 Markdown。

## 一张横图与两段文字

阅读一篇游记时，我们先遇到文字，再看到一张照片。图片应当跟随正文的宽度，图下的一段话则把注意力带回旅途。

![暮色中的山峦](../附件/blue-hour.png)

The mountains keep their distance. A small moon, a quiet ridge, and a line of blue make room for the next paragraph. 横图在舒适行宽下不会挤出纸面，全宽模式则能留下更多细节。

## 竖图与方图

### 竖版：把视线带向远方

![[附件/portrait.png|竖版山峦]]

竖图的高度明显大于宽度。灯箱先展示完整画面，再切换到原图尺寸查看。

### 方形：一页里的小停顿

![[附件/square.png|方形山峦]]

> [!NOTE] 图文之间
> 图片前后都要留出段落空间，横图和竖图保持各自的比例。

## 全景与超长图

### 横向全景

![横向全景](../附件/panorama.png)

原图宽 2400px；在灯箱选择「原图尺寸」后可以横向滚动。

### 一张很长的图

![超长山峦海报](../附件/long-poster.png)

这张 960 × 3200px 的长图用于观察原图滚动与覆层边界。关闭后应回到同一张图所在的位置。

## 小图、链接图片与缺失资源

这张 96 × 96px 小图保持原始比例：

![小幅山峦](../附件/small.png)

下面的图片本身也带有 Markdown 链接；点击图像仍可以在灯箱里查看：

[![带链接的山峦](../附件/blue-hour.png)](../附件/blue-hour.png)

缺失图片呈现可读的占位说明，不挤坏周围段落：

![一张尚未添加的插图](../附件/not-added.png)

## 宽表格与长代码行

| 观察编号 | 一月 | 二月 | 三月 | 四月 | 五月 | 六月 | 七月 | 八月 | 九月 | 十月 | 十一月 | 十二月 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 晨间光线 | 灰蓝 | 淡蓝 | 暖白 | 浅金 | 明亮 | 透白 | 炽白 | 浅金 | 暖白 | 淡蓝 | 灰蓝 | 银白 |
| 步行距离 | 3.2 km | 4.1 km | 5.4 km | 4.8 km | 6.0 km | 5.5 km | 3.8 km | 4.7 km | 6.2 km | 5.1 km | 4.0 km | 3.6 km |
| 留下的问题 | 留心树影 | 看见水面 | 听见鸟鸣 | 观察花期 | 记录夜风 | 寻找阴凉 | 等待降雨 | 留意云层 | 重访旧街 | 收集落叶 | 感受温差 | 回看笔记 |

```typescript
const observations = ["清晨的街道", "旧书店的窗", "河边的长椅", "山路上的云", "夜色里的灯", "回程的风", "Morning light through the window", "A line that stays with the reader", "Leave room for the next thought"];

function revisit(index: number) {
  return { index, observation: observations[index % observations.length], completed: false };
}
```

## 数学、图示与嵌入

有时一小段解释需要一个公式：$a^2+b^2=c^2$。

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$

```mermaid
flowchart LR
    A[看见一个细节] --> B[写下一段文字]
    B --> C[补上一张图片]
    C --> D[再次阅读]
    D --> A
```

![[01 思考的方法/渐进式总结#给未来一个入口]]

## 收起的补充与末尾章节

<details><summary>一条补充说明</summary><p>这段 HTML 在阅读模式下是普通的折叠说明，在 Raw 模式下则保持原始的尖括号和标签。</p></details>

- [x] 看过横图与竖图
- [x] 找到原图尺寸入口
- [ ] 下次再回来阅读

可以继续 [[06 阅读器体验/长文与多级目录|四十八次慢行]]，也可以回到 [[README|花园入口]]。
