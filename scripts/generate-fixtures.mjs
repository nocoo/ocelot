import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const root = new URL("../", import.meta.url);
const sha = (value) => createHash("sha1").update(value).digest("hex");
const blobSha = (bytes) => sha(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]));
const blobs = {};
function file(path, content, binary = false) {
  const bytes = binary ? content : Buffer.from(content);
  const hash = blobSha(bytes);
  blobs[hash] = bytes.toString("base64");
  return { path, sha: hash, size: bytes.length, mode: "100644", type: "blob" };
}

// A small original, deterministic landscape. No third-party or private imagery.
function landscape() {
  const width = 1200;
  const height = 480;
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = y / height;
      let color = [195 - t * 23, 216 - t * 23, 225 - t * 13];
      if (Math.hypot(x - 887, y - 113) < 37) color = [242, 240, 222];
      if (y > 235 - Math.sin(x / 145) * 65 - Math.cos(x / 73) * 20) color = [122, 154, 174];
      if (y > 322 - Math.sin(x / 220 + 2) * 73 - Math.cos(x / 140) * 20) color = [80, 118, 142];
      if (y > 410 - Math.sin(x / 310 + 1) * 68) color = [51, 84, 108];
      const offset = y * (width * 3 + 1) + 1 + x * 3;
      pixels.set(color.map(Math.round), offset);
    }
  }
  function chunk(type, data) {
    const name = Buffer.from(type);
    const input = Buffer.concat([name, data]);
    let crc = 0xffffffff;
    for (const byte of input) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, input, checksum]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const curated = [
  ["README.md", "README.md"],
  ["01 思考的方法/渐进式总结.md", "progressive.md"],
  ["02 观察与记录/城市里的蓝色.md", "blue.md"],
  ["03 The Reading Room/On paying attention.md", "attention.md"],
  ["04 工具与实践/Markdown 排版实验室.md", "laboratory.md"],
];
const entries = [];
for (const [path, source] of curated)
  entries.push(file(path, await readFile(new URL(`fixtures/notes/${source}`, root), "utf8")));
entries.push(file("附件/blue-hour.png", landscape(), true));
for (const [folder, titles] of [
  [
    "01 思考的方法",
    ["建立自己的问题清单", "把知识写成自己的语言", "一张笔记的生命周期", "链接比分类更有趣"],
  ],
  ["02 观察与记录", ["雨后的街道", "一杯咖啡的时间", "周末植物观察", "书店的一角"]],
  [
    "03 The Reading Room",
    [
      "A place to return to",
      "The art of a useful question",
      "Notes on slow reading",
      "Between the lines",
    ],
  ],
  ["04 工具与实践", ["Obsidian 阅读习惯", "双向链接使用指南", "给数字花园浇水", "我的每周回顾"]],
]) {
  for (const title of titles)
    entries.push(
      file(
        `${folder}/${title}.md`,
        `---\ntags: [笔记, 示例]\ndescription: 一则关于 ${title} 的练习。\n---\n# ${title}\n\n先留下一点观察，再慢慢找到自己的解释。\n\n## 一个小问题\n\n今天有什么细节值得带到明天？写下具体发生的事，通常比寻找一个漂亮的结论更有用。\n\n## 一条联系\n\n与 [[01 思考的方法/渐进式总结]] 一起阅读。也可以回到 [[README|花园入口]]，沿另一条小径继续探索。\n`,
      ),
    );
}
const topics = [
  "阅读札记",
  "设计观察",
  "自然记录",
  "技术摘录",
  "问题清单",
  "每周回顾",
  "城市漫游",
  "创作练习",
  "学习日志",
  "灵感片段",
  "生活切片",
  "实验记录",
];
for (let i = 0; i < 1152; i++) {
  const number = String(i + 1).padStart(4, "0");
  const topic = topics[i % topics.length];
  const title = `${topic} ${number}`;
  entries.push(
    file(
      `05 长期档案/${String(Math.floor(i / 96) + 1).padStart(2, "0")} 月/${topic}/${title}.md`,
      `---\ntags: [档案, ${topic}]\n---\n# ${title}\n\n这是第 ${i + 1} 则合成笔记，用来验证大型知识库的目录性能、搜索和按需读取。\n\n## 观察\n\n今天记录一件具体的事：一束落在书页上的光，一句值得再次思考的话，或者一个尚未找到答案的问题。\n\n## 思考\n\n${["好的工具让人回到问题本身。", "笔记的价值来自再次被使用。", "清楚地表达，比完整地收集更有用。", "一个准确的例子胜过十个模糊的概念。"][i % 4]}\n\n## 下一步\n\n沿着 [[01 思考的方法/渐进式总结|这条链接]] 继续，或返回 [[README|花园入口]]。\n`,
    ),
  );
}
entries.push(file(".obsidian/private.json", '{"synthetic":true}'));
entries.push(file("附件/unsupported.svg", '<svg xmlns="http://www.w3.org/2000/svg"/>'));

function revision(files, name) {
  const tree = sha(JSON.stringify(files));
  return { tree, commit: sha(`${name}:${tree}`), files };
}
const updatedEntries = entries.filter((entry) => entry.path !== "02 观察与记录/书店的一角.md");
const welcomeIndex = updatedEntries.findIndex((entry) => entry.path === "README.md");
updatedEntries[welcomeIndex] = file(
  "README.md",
  `${await readFile(new URL("fixtures/notes/README.md", root), "utf8")}\n## 一次新的重访\n\n花园在你阅读时又长出了一片新叶。这段文字来自第二个 Git 版本，只有应用更新后才会出现。\n`,
);
updatedEntries.push(
  file(
    "02 观察与记录/今天的新发现.md",
    "# 今天的新发现\n\n一次新的观察，为花园带来了一条新的小径。\n\n回到 [[README]]。\n",
  ),
);

const repositories = [
  {
    id: 101,
    owner: { login: "ocelot-demo" },
    name: "fieldnotes",
    default_branch: "main",
    private: true,
    description: "一座关于阅读、观察与思考的数字花园",
    revisions: [revision(entries, "first"), revision(updatedEntries, "second")],
  },
  {
    id: 102,
    owner: { login: "ocelot-demo" },
    name: "studio-notes",
    default_branch: "main",
    private: false,
    description: "Design decisions, working notes & small experiments",
    revisions: [
      revision(
        [
          file(
            "README.md",
            "---\ndescription: A working notebook for thoughtful interfaces.\ntags: [design, craft]\n---\n# A studio for small ideas\n\nDesign begins with paying attention. This public notebook collects observations about typography, color, motion, and the quiet decisions that make software feel considered.\n\n## Start with the reading experience\n\nA clear hierarchy helps the reader choose where to look. Generous margins and a comfortable measure help them stay.\n\nOpen [[Typography/Reading rhythm]] or [[Systems/Color and contrast]].\n",
          ),
          file(
            "Typography/Reading rhythm.md",
            "# Reading rhythm\n\nThe measure of a line shapes the pace of reading. Let the text set the rhythm, and let the interface follow.\n\n## Chinese and English\n\n中文和英文有不同的视觉密度。混合排版的任务，是给它们共同的呼吸空间。\n",
          ),
          file(
            "Systems/Color and contrast.md",
            "# Color and contrast\n\nUse a small number of surfaces with clear luminance steps. Reserve the accent for a decision, a current location, or an invitation.\n\nDisabled controls need their own semantic treatment. They should remain understandable while clearly indicating that an action is unavailable.\n",
          ),
        ],
        "studio",
      ),
    ],
  },
  {
    id: 103,
    owner: { login: "ocelot-demo" },
    name: "reading-room",
    default_branch: "notes/2026",
    private: true,
    description: "Books, marginalia, and ideas worth returning to",
    revisions: [
      revision(
        [
          file(
            "README.md",
            "# The reading room\n\nA personal collection of reading notes.\n\n## On the shelf\n\n- [[书架/如何阅读一本书]]\n- [[书架/A room of one's own]]\n",
          ),
          file(
            "书架/如何阅读一本书.md",
            "# 如何阅读一本书\n\n主动阅读从提出自己的问题开始。\n\n## 三个问题\n\n1. 作者在尝试回答什么？\n2. 这个论证如何成立？\n3. 它与我已经知道的内容有什么联系？\n",
          ),
          file(
            "书架/A room of one's own.md",
            "# A room of one's own\n\nA reading note about space, attention, and the conditions that make creative work possible.\n",
          ),
        ],
        "reading",
      ),
    ],
  },
];
await mkdir(new URL("fixtures/generated/", root), { recursive: true });
await writeFile(
  new URL("fixtures/generated/github.json", root),
  `${JSON.stringify({ repositories, blobs })}\n`,
);
console.log(
  `Generated ${entries.length} vault files, ${Object.keys(blobs).length} immutable blobs, and 3 repositories.`,
);
