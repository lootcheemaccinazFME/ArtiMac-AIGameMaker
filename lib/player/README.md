# ArtiMeow GalGame Player

独立发行用的 GalGame 播放器（运行时）。它按编辑器导出的项目结构进行确定性播放：不包含 AIGC，不读取时间线/知识库/检查点。

## 功能特点

- 按 `project.json` + `chapters/<id>/content.json` 播放，选择驱动章节跳转。
- 文本逐字显示，结束后自动展示选项；空格不快进。
- 背景/音乐来自章节 `sceneProperties`；未指定音乐时延续上一首。
- BGM 按钮：暂停/继续当前背景音乐；音频面板入口已隐藏。
- 设置按钮可用；窗口标题自动使用当前项目名。
- 首页右下角标注：Made with ArtiMeow AI GalGame Maker。
- `.text-area` 容器完全透明，不对内容施加模糊。

## 预期项目布局

```
project.json
chapters/
  <chapterId>/
    content.json
characters/characters.json
assets/**/*
```

## 本地运行

```powershell
cd lib/player
npm install
npm run dev
```

## 通过编辑器打包
- 在编辑器内选择“打包发布”，播放器与项目会一起生成可分发产物。

## 常用操作
- 空格：继续对话/确认选项
- 方向键：移动选择
- 回车：确认
- ESC：返回主页

## 许可证
- 许可证：B5-Software FOKPL 1.0-Permissive
- 作者：B5-Software
