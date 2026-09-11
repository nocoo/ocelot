---
description: 文字、代码与图示，在同一张纸面上各得其所。
tags: [Markdown, Obsidian, 排版]
---
# Markdown 排版实验室

这份笔记集中展示阅读器的常用内容格式。链接、附件与嵌入都来自同一个 Git 版本。

## Callout 与双链

> [!NOTE] 保留上下文
> 从 [[README|花园入口]] 出发，也可以直接走到 [[01 思考的方法/渐进式总结#一个例子|一个具体例子]]。

> [!WARNING] 一个尚待验证的想法
> 阅读器呈现笔记中的提醒，但不会执行脚本或打开外部追踪图片。

## 代码与表格

```typescript
type Reading = {
  path: string;
  revision: string;
};

function openNote(note: Reading): string {
  return `${note.path} @ ${note.revision.slice(0, 7)}`;
}
```

| 能力 | 示例 | 状态 |
| :--- | :--- | :---: |
| 中文与 English | 自然的混合排版 | ✓ |
| 相对路径 | `../附件/blue-hour.png` | ✓ |
| 数学公式 | 行内与独立公式 | ✓ |

- [x] 保留任务列表的阅读语义
- [x] 支持删除线与强调
- [ ] 在 Obsidian 中完成下一次修订

~~不再需要的旧结论~~，以及 **值得保留的新问题**。

## 公式

信息熵可以写为 $H(X)=-\sum_x p(x)\log_2 p(x)$。一组概率越接近均匀分布，不确定性就越高。

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

## 图示

```mermaid
flowchart LR
    A[发现一个问题] --> B[留下一条笔记]
    B --> C[建立一条链接]
    C --> D[在阅读中重访]
    D --> A
```

## 图片与嵌入

![[附件/blue-hour.png|暮色中的山峦]]

下方是一段来自另一个文档的嵌入：

![[01 思考的方法/渐进式总结#给未来一个入口]]

## 安全的 HTML

<details><summary>展开一条补充说明</summary><p>简单的语义 HTML 可以丰富表达。脚本、表单、嵌入网页与事件处理器不会进入阅读页面。</p></details>

回到 [[README]]。
