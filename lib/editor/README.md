# ArtiMeow AI GalGame Maker - Editor

这是用于创作与打包 GalGame 的桌面编辑器（Electron）。编辑器负责：项目组织、章节/角色/资源管理、预览与一键打包分发。播放器仅随项目发布，不包含 AIGC 功能。

## 主要能力
- 项目结构：`project.json` + `chapters/<id>/content.json` + `characters/characters.json` + `assets/`。
- 编辑体验：章节编写、角色与设定管理、预览、右键菜单、快捷键等。
- 本地预览：按章节确定性播放；不依赖时间线/知识库。
- 打包发布：复制项目与播放器，生成配置，安装依赖并执行 `npm run dist`，输出分发包。
- 日志与诊断：打包过程全量日志流式输出到进度面板（可滚动、带时间戳）。

## 开发运行
```powershell
cd lib/editor
npm install
npm run dev
```

## 打包你的项目
- 在编辑器中打开项目 → 点击“打包发布”。
- 构建严格使用 npm：依赖安装使用 `npm install`；构建使用 `npm run dist`。
- 无 `package-lock.json` 时不会尝试 `npm ci`（避免 EUSAGE）。
- dist 校验：若构建后 dist 为空，会在 UI 提示查看日志。

## 打包输出
- Windows: NSIS 安装包（默认）。
- macOS: DMG。
- Linux: AppImage。
- 产物位于你选择的输出目录下的 `dist/`。

## 其他
- 角色库路径：优先使用 `characters/characters.json`。
- 首页/预览界面不显示时间线/知识库入口（本地播放不需要）。
- 遇到构建问题可在进度面板查看完整日志，并把日志反馈给我们。
