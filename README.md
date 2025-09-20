# ArtiMeow AI GalGame Maker

ArtiMeow 是一个“编辑器 + 播放器”的视觉小说/GalGame 创作与发行套件：
- 编辑器：用于编写章节、管理角色与资源、配置项目并一键打包。
- 播放器：独立运行的游戏客户端，按项目的章节内容进行确定性播放，不包含 AIGC 逻辑。

## 顶层结构
- `lib/editor/`：创作编辑器（桌面端 Electron 应用）
- `lib/player/`：独立播放器（随项目一起分发的运行时）

## 先决条件

在开始之前，请先安装 Node.js 的最新 LTS 版本（建议从 https://nodejs.org/ 下载）。安装完成后可在终端运行以下命令确认：

```powershell
node -v
npm -v
```

确保 node 输出为最新的 LTS 版本号（例如 v18.x 或更高，视发布时间而定）。

## 快速开始（编辑器）
1) 安装依赖

```powershell
cd lib/editor
npm install
```

2) 启动编辑器开发模式

```powershell
npm run dev
```

3) 打包你的项目
- 在编辑器中打开项目，使用“打包发布”。
- 打包过程会：
  - 复制你的项目与播放器运行时
  - 生成 `package.json` 与 `game-config.json`
  - 执行 `npm install` 与 `npm run dist`
  - 在输出目录生成可分发产物

若你只想本地验证播放器：

```powershell
cd lib/player
npm install
npm run dev
```

## 图片生成配置
- 打开“设置 → 图片AI”，填写兼容 OpenAI Images API 的 `Base URL`、`API Key` 与 `模型`。
- 相关字段在 UI 中的元素 ID 为：`image-image-base-url`、`image-image-api-key`、`image-image-model`。
- 生成图片时会从返回 JSON 中读取 `images[0].url`（或 `b64_json`）并保存到当前项目的 `assets/images`。

## 播放器行为说明
- UI：对话框、角色名牌、选项展示，空格不快进，文字播放完后自动显示选项。
- 场景属性：背景与音乐按章节 `sceneProperties.*` 应用；若未指定音乐则延续上一首。
- 音乐按钮：切换当前 BGM 播放/暂停；音频面板入口已隐藏。
- 设置按钮：可打开设置窗口。
- 窗口标题：显示当前项目名；首页右下角显示 “Made with ArtiMeow AI GalGame Maker”。

## 反馈
- 发现问题或有功能建议，欢迎提交Issues。
