/**
 * 游戏引擎
 */

class GameEngine {
  constructor() {
    this.currentProject = null;
    this.currentChapter = null;
    this.currentScene = null;
    this.currentElementIndex = 0;
    this.currentChoices = [];
    this.selectedChoiceIndex = -1;
    this.isWaitingForChoice = false;
    this.isGenerating = false;
    this.gameState = 'menu'; // 'menu', 'playing', 'paused'
    this.autoMode = false;
    this.skipMode = false;
    this.keyboardHandler = null;
    this.projectManager = window.projectManager; // 引用全局项目管理器
    
    // GalGame专用状态
    this.gameVariables = {}; // 游戏变量系统
    this.chapterHistory = []; // 章节历史记录
    this.saveData = {}; // 存档数据
    this.characterLibrary = new Map(); // 角色库
    this.assetLibrary = new Map(); // 资源库
    
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupKeyboardControls();
    this.initializeVariableSystem();
  }

  /**
   * 初始化变量系统
   */
  initializeVariableSystem() {
    this.gameVariables = {};
    this.chapterHistory = [];
  }

  /**
   * 加载项目
   */
  async loadProject(projectPath) {
    try {
      // 支持两种结构：编辑器结构(project.json) 或 旧结构(metadata.json)
      let meta = null;
      const projectJson = `${projectPath}/project.json`;
      const metadataJson = `${projectPath}/metadata.json`;
      if (await window.electronAPI.fs.exists(projectJson)) {
        meta = await window.electronAPI.fs.readJson(projectJson);
      } else if (await window.electronAPI.fs.exists(metadataJson)) {
        meta = await window.electronAPI.fs.readJson(metadataJson);
      } else {
        throw new Error('未找到项目配置（缺少 project.json 或 metadata.json）');
      }
      this.currentProject = meta || {};
      this.currentProject.path = projectPath;

      // 加载角色库
      await this.loadCharacterLibrary(projectPath);
      
      // 加载资源库
      await this.loadAssetLibrary(projectPath);

      console.log('项目加载完成:', this.currentProject.name);
      return true;
    } catch (error) {
      console.error('加载项目失败:', error);
      return false;
    }
  }

  /**
   * 读取编辑器结构的 GalGame 项目
   * 期望结构：
   * - project.json（包含 chapters: 数组或对象，settings.initialVariables 可选）
   * - chapters/<chapterId>/content.json（包含 { title, elements: [...] }）
   */
  async loadGalGameProject(projectPath) {
    try {
      console.log('Loading GalGame project:', projectPath);
      const projectFile = `${projectPath}/project.json`;
      if (!(await window.electronAPI.fsExists?.(projectFile) || await window.electronAPI.fs?.exists(projectFile))) {
        throw new Error('项目文件不存在');
      }
      const projectData = await (window.electronAPI.fsReadJson?.(projectFile) || window.electronAPI.fs.readJson(projectFile));
        this.currentProject = { path: projectPath, ...projectData, _chapterMap: {} };

      // 初始化变量
      this.gameVariables = { ...(projectData.settings?.initialVariables || {}) };

      // 解析 chapters 列表
      let chapterIds = [];
      if (Array.isArray(projectData.chapters)) {
          chapterIds = projectData.chapters.map(c => {
            if (typeof c === 'string') return c;
            if (c && typeof c === 'object') {
              const id = c.id || c.key || c.name;
              const dir = c.dir || c.folder || c.path || c.realId || c.directory;
              if (id && dir) this.currentProject._chapterMap[id] = dir;
              return id;
            }
            return null;
          }).filter(Boolean);
      } else if (projectData.chapters && typeof projectData.chapters === 'object') {
          chapterIds = Object.keys(projectData.chapters).map(id => {
            const v = projectData.chapters[id];
            if (typeof v === 'string') {
              this.currentProject._chapterMap[id] = v;
            } else if (v && typeof v === 'object') {
              const dir = v.dir || v.folder || v.path || v.realId || v.directory;
              if (dir) this.currentProject._chapterMap[id] = dir;
            }
            return id;
          });
      }
      // 记录章节顺序（用于下一章推断和调试）
      this.currentProject._chapterOrder = chapterIds;

      // 选择启动章节
      let startId = projectData.info?.startChapter || projectData.settings?.startChapter || null;
      if (!startId) {
        startId = await this.findFirstChapterId(projectPath, chapterIds);
      }
      if (!startId) {
        throw new Error('未找到有效的章节文件');
      }

      const ok = await this.loadChapter(startId);
      if (!ok) throw new Error('无法加载起始章节');
      this.gameState = 'playing';
      return { success: true };
    } catch (error) {
      console.error('Failed to load GalGame project:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 基于编辑器结构加载章节：chapters/<id>/content.json
   */
  async loadChapter(chapterId) {
    try {
      if (!this.currentProject?.path) throw new Error('项目数据不完整');
      let folder = this.currentProject?._chapterMap?.[chapterId] || chapterId;
      let base = `${this.currentProject.path}/chapters/${folder}`;
      let baseExists = await (window.electronAPI.fsExists?.(base) || window.electronAPI.fs?.exists(base));
      if (!baseExists) {
        // 扫描匹配
        const chaptersDir = `${this.currentProject.path}/chapters`;
        try {
          const entries = await (window.electronAPI.fsReaddir?.(chaptersDir) || window.electronAPI.fs?.readdir(chaptersDir)) || [];
          for (const name of entries) {
            const full = `${chaptersDir}/${name}`;
            const cjson = `${full}/content.json`;
            const mjson = `${full}/metadata.json`;
            try {
              if (await (window.electronAPI.fsExists?.(cjson) || window.electronAPI.fs?.exists(cjson))) {
                const c = await (window.electronAPI.fsReadJson?.(cjson) || window.electronAPI.fs.readJson(cjson));
                const cid = c.id || c.chapterId || c.title;
                if (cid && `${cid}`.toLowerCase() === `${chapterId}`.toLowerCase()) { base = full; folder = name; break; }
              }
            } catch {}
            try {
              if (await (window.electronAPI.fsExists?.(mjson) || window.electronAPI.fs?.exists(mjson))) {
                const m = await (window.electronAPI.fsReadJson?.(mjson) || window.electronAPI.fs.readJson(mjson));
                const mid = m.id || m.chapterId || m.title;
                if (mid && `${mid}`.toLowerCase() === `${chapterId}`.toLowerCase()) { base = full; folder = name; break; }
              }
            } catch {}
          }
        } catch {}
      }
      const jsonPath = `${base}/content.json`;
      const exists = await (window.electronAPI.fsExists?.(jsonPath) || window.electronAPI.fs?.exists(jsonPath));
      if (!exists) {
        // 回退尝试 <id>.json
        const alt = `${base}/${chapterId}.json`;
        const altExists = await (window.electronAPI.fsExists?.(alt) || window.electronAPI.fs?.exists(alt));
        if (!altExists) {
          // 再回退 legacy
          const legacyOk = await this.loadChapterFromLegacy(chapterId);
          if (!legacyOk) throw new Error('章节内容文件不存在');
          return true;
        }
        const data = await (window.electronAPI.fsReadJson?.(alt) || window.electronAPI.fs.readJson(alt));
        this.currentChapter = { id: chapterId, title: data.title || chapterId, ...data };
      } else {
        const data = await (window.electronAPI.fsReadJson?.(jsonPath) || window.electronAPI.fs.readJson(jsonPath));
        this.currentChapter = { id: chapterId, title: data.title || chapterId, ...data };
      }

      // 标准化：确保 elements 为数组（兼容多种保存格式）
      // 1) 顶层 elements
      if (Array.isArray(this.currentChapter.elements)) {
        // 已存在，直接使用
      // 2) content.elements
      } else if (this.currentChapter.content && Array.isArray(this.currentChapter.content.elements)) {
        this.currentChapter.elements = this.currentChapter.content.elements;
      // 3) 顶层 scenes 数组：扁平化为 elements
      } else if (Array.isArray(this.currentChapter.scenes)) {
        this.currentChapter.elements = this.currentChapter.scenes
          .flatMap(scene => Array.isArray(scene?.elements) ? scene.elements : []);
        this.currentScene = this.currentChapter.scenes[0] || null;
      // 4) content.scenes 数组：扁平化为 elements
      } else if (this.currentChapter.content && Array.isArray(this.currentChapter.content.scenes)) {
        this.currentChapter.elements = this.currentChapter.content.scenes
          .flatMap(scene => Array.isArray(scene?.elements) ? scene.elements : []);
        this.currentScene = this.currentChapter.content.scenes[0] || null;
      } else {
        this.currentChapter.elements = [];
      }
      this.currentElementIndex = 0;
      console.log('章节加载成功:', this.currentChapter.title || chapterId, '元素数:', this.currentChapter.elements.length);
      // 章节级资源应用（背景/音乐），兼容多种字段（含 content.sceneProperties）
      try {
        const bg = this.currentChapter.background
          || this.currentChapter.content?.background
          || this.currentChapter.content?.backgroundImage
          || this.currentChapter.content?.sceneProperties?.backgroundImage
          || this.currentChapter.sceneProperties?.backgroundImage;
        if (bg) {
          const base = this.currentProject?.path || '';
          let resolvedUrl = bg;
          if (typeof bg === 'string') {
            const isHttp = bg.startsWith('http://') || bg.startsWith('https://');
            const isFile = bg.startsWith('file://');
            const isData = bg.startsWith('data:');
            if (!isHttp && !isFile && !isData) {
              if (bg.startsWith('assets/')) {
                const fullPath = base ? `${base}/${bg}` : bg;
                resolvedUrl = (window.PathUtils && typeof window.PathUtils.toFileUrl === 'function' && base)
                  ? window.PathUtils.toFileUrl(fullPath)
                  : fullPath;
              } else if (base) {
                const fullPath = `${base}/${bg}`;
                resolvedUrl = (window.PathUtils && typeof window.PathUtils.toFileUrl === 'function')
                  ? window.PathUtils.toFileUrl(fullPath)
                  : fullPath;
              }
            }
          }
          // 优先走 setBackgroundImage 做预加载与淡入
          console.log('[GameEngine] 应用章节背景:', bg, '->', resolvedUrl);
          this.setBackgroundImage(resolvedUrl);
        }
      } catch (e) { console.warn('应用章节背景失败:', e); }
      try {
        const music = this.currentChapter.music
          || this.currentChapter.content?.music
          || this.currentChapter.content?.backgroundMusic
          || this.currentChapter.content?.sceneProperties?.backgroundMusic
          || this.currentChapter.sceneProperties?.backgroundMusic;
        // 若 music 为空/未提供，则保持上一曲继续播放（不做任何处理）
        if (music && typeof this.playBackgroundMusic === 'function') {
          const base = this.currentProject?.path || '';
          const musicPath = base ? `${base}/${music}` : music;
          console.log('[GameEngine] 应用章节音乐:', music, '->', musicPath);
          this.playBackgroundMusic(musicPath);
        } else {
          // 按需隐藏可视化器
          try { this._musicVisualizer && this._musicVisualizer.stop && this._musicVisualizer.stop(); } catch {}
        }
      } catch (e) { console.warn('应用章节音乐失败:', e); }
      return true;
    } catch (error) {
      console.error('加载章节失败:', error);
      return false;
    }
  }

  /** 寻找首章：优先已知列表，其次扫描目录 */
  async findFirstChapterId(projectPath, knownIds = []) {
    if (knownIds && knownIds.length > 0) {
      // 优先 start / 01 / 第一个
      const pref = knownIds.find(id => /^(start|chapter_?0*1|0*1)$/i.test(id)) || knownIds[0];
      return pref;
    }
    try {
      const dir = `${projectPath}/chapters`;
      const files = await (window.electronAPI.fsReaddir?.(dir) || window.electronAPI.fs?.readdir(dir));
      const ids = (files || []).filter(name => !name.startsWith('.'));
      if (ids.length === 0) return null;
      const preferred = ids.find(id => /^(start|chapter_?0*1|0*1)$/i.test(id));
      return preferred || ids[0];
    } catch (e) {
      return null;
    }
  }

  /**
   * 加载角色库
   */
  async loadCharacterLibrary(projectPath) {
    try {
      // 优先子目录：characters/characters.json；其次回退到项目根 characters.json
      const fs = window.electronAPI.fs;
      const tryFiles = [
        `${projectPath}/characters/characters.json`,
        `${projectPath}/characters.json`
      ];
      for (const p of tryFiles) {
        try {
          if (await fs.exists(p)) {
            const data = await fs.readJson(p);
            // 兼容 { characters: {name: {...}} } 或直接 { name: {...} }
            const dict = data.characters || data;
            this.characterLibrary = new Map(Object.entries(dict || {}));
            return;
          }
        } catch {}
      }
    } catch (error) {
      console.warn('加载角色库失败:', error);
      this.characterLibrary = new Map();
    }
  }

  /**
   * 加载资源库
   */
  async loadAssetLibrary(projectPath) {
    try {
      const assetsPath = `${projectPath}/assets.json`;
      if (await window.electronAPI.fs.exists(assetsPath)) {
        const assetsData = await window.electronAPI.fs.readJson(assetsPath);
        this.assetLibrary = new Map(Object.entries(assetsData.assets || {}));
      }
    } catch (error) {
      console.warn('加载资源库失败:', error);
      this.assetLibrary = new Map();
    }
  }

  // 旧版章节读取（保留以便必要时参考，但不再使用基于 scenes 的结构）
  async loadChapterFromLegacy(chapterId) {
    try {
      const chapterPath = `${this.currentProject.path}/chapters/${chapterId}`;
      const contentPath = `${chapterPath}/content.md`;
      if (!(await window.electronAPI.fs.exists(contentPath))) {
        throw new Error('legacy 章节不存在');
      }
      const mdContent = await window.electronAPI.fs.readFile(contentPath, 'utf-8');
      const content = this.convertMarkdownToScenes(mdContent);
      this.currentChapter = { id: chapterId, title: chapterId, elements: content?.scenes?.[0]?.elements || [] };
      this.currentElementIndex = 0;
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 将Markdown内容转换为场景格式
   */
  convertMarkdownToScenes(mdContent) {
    return {
      scenes: [{
        id: 'scene_1',
        name: '场景1',
        elements: [{
          type: 'text',
          content: mdContent,
          timestamp: 0
        }],
        background: '',
        music: '',
        effects: []
      }]
    };
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 返回主页按钮
    const backBtn = document.getElementById('back-to-main-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => this.exitGame());
    }

    // 游戏设置按钮（主界面与游戏内各有一个同ID，全部绑定）
    document.querySelectorAll('#game-settings-btn').forEach(btn => {
      btn.addEventListener('click', () => window.electronAPI?.openSettings?.());
    });

    // 音乐按钮：切换当前 BGM 播放/暂停
    const musicBtn = document.getElementById('game-music-btn');
    if (musicBtn) musicBtn.addEventListener('click', () => this.toggleBackgroundMusic());

    // HUD 控件（CUSTOM / SKIP）暂时禁用：对应 DOM 不存在时跳过事件绑定
    // 如果未来恢复按钮，只需去掉本段的判断和 index.html 的隐藏样式
  }

  /**
   * 设置键盘控制
   */
  setupKeyboardControls() {
    this.keyboardHandler = (e) => {
      if (this.gameState !== 'playing') return;

      switch (e.key) {
        case ' ': // 空格键
          e.preventDefault();
          e.stopPropagation(); // 阻止事件传播
          console.log('空格键按下 - 当前状态:', {
            isWaitingForChoice: this.isWaitingForChoice,
            isGenerating: this.isGenerating,
            typing: document.getElementById('dialogue-text')?.dataset.typing
          });
          
          if (this.isWaitingForChoice) {
            // 正在等待选择时，空格确认当前高亮选项
            this.selectCurrentChoice();
          } else if (!this.isGenerating) {
            const dialogueText = document.getElementById('dialogue-text');
            // 禁止在打字机进行时用空格跳过
            if (dialogueText && dialogueText.dataset.typing === 'true') {
              console.log('打字机进行中，空格无效');
              return;
            }
            // 非打字状态：不再使用空格推进
            console.log('空格被禁用为推进键');
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          if (this.isWaitingForChoice) {
            this.navigateChoices(-1);
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          if (this.isWaitingForChoice) {
            this.navigateChoices(1);
          }
          break;

        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          if (this.isWaitingForChoice) {
            this.selectCurrentChoice();
          }
          break;

        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          this.pauseGame();
          break;
      }
    };

    // 使用捕获模式，确保事件被优先处理
    document.addEventListener('keydown', this.keyboardHandler, true);
  }

  /**
   * 启动游戏
   * @param {string} projectId - 项目ID
   */
  async startGame(projectId) {
    try {
      // 切换到游戏界面
      this.switchToGameScreen();

      // 加载项目：若提供了 projectId，则通过 ProjectManager 加载；
      // 否则使用此前已通过 loadProject/loadGalGameProject 设置的 currentProject。
      if (projectId) {
        this.currentProject = await window.projectManager.loadProject(projectId);
      } else if (!this.currentProject) {
        throw new Error('未加载项目');
      }
      
      if (!this.currentProject) {
        throw new Error('项目加载失败');
      }

      // 本地播放禁用时间线/知识库/检查点：直接按 GalGame 项目章节启动
      try {
        const root = this.currentProject.path || this.currentProject.projectPath || this.currentProject.projectDir;
        const pj = root ? `${root}/project.json` : null;
        if (pj && (await (window.electronAPI.fsExists?.(pj) || window.electronAPI.fs?.exists(pj)))) {
          const res = await this.loadGalGameProject(root);
          if (res?.success) {
            await this.startChapter();
          }
        }
      } catch {}

      // 更新游戏状态
      this.gameState = 'playing';

      Utils.showNotification(`开始游戏：${this.currentProject.name}`, 'success');

    } catch (error) {
      console.error('启动游戏失败:', error);
      Utils.showNotification('启动游戏失败', 'error');
      this.exitGame();
    }
  }

  /**
   * 加载当前检查点
   */
  async loadCurrentCheckpoint() {
    try {
      if (!this.currentProject.currentTimeline) {
        throw new Error('没有可用的时间线数据');
      }

      this.currentTimeline = this.currentProject.currentTimeline;
      
      // 设置背景：若检查点缓存了背景图则直接显示，否则使用默认主题背景
      if (this.currentTimeline.content.backgroundUrl) {
        console.log('加载背景图片:', this.currentTimeline.content.backgroundUrl);
        // 检查是否是本地资源路径
        let backgroundPath = this.currentTimeline.content.backgroundUrl;
        if (backgroundPath.startsWith('assets/')) {
          // 转换为项目资源路径
          const filename = backgroundPath.replace('assets/', '');
          console.log('转换资源文件名:', filename);
          backgroundPath = await this.projectManager.getAssetPath(this.currentProject, filename);
          console.log('获取完整路径:', backgroundPath);
          // 使用PathUtils转换为file://协议路径
          backgroundPath = window.PathUtils.toFileUrl(backgroundPath);
          console.log('转换file://路径:', backgroundPath);
        }
        this.setBackgroundImage(backgroundPath);
      } else {
        console.log('没有背景图片，使用默认背景');
        this.setDefaultBackground();
      }
      await this.displayContent(this.currentTimeline.content);

  // 首帧不调用图片API，避免浪费；仅当后续继续时再生成

    } catch (error) {
      console.error('加载检查点失败:', error);
      Utils.showNotification('加载游戏进度失败', 'error');
    }
  }

  /**
   * 显示内容
   * @param {Object} content - 内容对象
   */
  async displayContent(content) {
    const dialogueText = document.getElementById('dialogue-text');
  const nameplate = document.getElementById('nameplate') || document.getElementById('character-name');
    const choicesContainer = document.getElementById('choices-container');
    const spaceHint = document.getElementById('space-hint');
    const choiceHint = document.getElementById('choice-hint');

    if (!dialogueText || !choicesContainer) {
      throw new Error('游戏UI元素未找到');
    }

    // 清空之前的内容
    choicesContainer.innerHTML = '';
    this.currentChoices = [];
    this.selectedChoiceIndex = -1;

    // 显示角色名牌（若有）
    if (nameplate) {
      if (content.speaker) {
        nameplate.classList.remove('hidden');
        nameplate.textContent = content.speaker;
      } else {
        nameplate.classList.add('hidden');
      }
    }

    // 显示对话内容（打字机效果）
    await this.typewriterEffect(dialogueText, content.dialogue || '无内容');

    // 显示选择项
    if (content.choices && content.choices.length > 0) {
      this.currentChoices = content.choices;
      this.displayChoices(content.choices);
      this.isWaitingForChoice = true;
      
      // 更新提示
      spaceHint.classList.add('hidden');
      choiceHint.classList.remove('hidden');
    } else {
      this.isWaitingForChoice = false;
      spaceHint.classList.remove('hidden');
      choiceHint.classList.add('hidden');
    }
  }

  /**
   * 打字机效果显示文本
   * @param {HTMLElement} element - 目标元素
   * @param {string} text - 要显示的文本
   */
  async typewriterEffect(element, text) {
  element.textContent = '';
  element.style.opacity = '1';
  element.dataset.fullText = text;
  element.dataset.typing = 'true';

  const speed = this.skipMode ? 0 : 50; // 毫秒，跳过时为0
    let i = 0;

    return new Promise((resolve) => {
      const timer = setInterval(() => {
        // 检查是否被中断（用户按空格键跳过）
        if (element.dataset.typing === 'false') {
          clearInterval(timer);
          resolve();
          return;
        }
        
        if (i < text.length) {
          element.textContent += text.charAt(i);
          i++;
        } else {
          clearInterval(timer);
          element.dataset.typing = 'false';
          // 自动模式：文本结束后根据状态继续
          if (this.autoMode && !this.isWaitingForChoice) {
            setTimeout(() => { if (this.autoMode && !this.isGenerating) this.continueStory(); }, 700);
          }
          resolve();
        }
      }, speed);
    });
  }

  /**
   * 显示选择项
   * @param {Array} choices - 选择项数组
   */
  displayChoices(choices) {
    const container = document.getElementById('choices-container');
    container.classList.remove('hidden');

    choices.forEach((choice, index) => {
      const choiceDiv = document.createElement('div');
      choiceDiv.className = 'choice-option';
      choiceDiv.textContent = choice.text;
      choiceDiv.setAttribute('data-choice-id', choice.id);
      choiceDiv.setAttribute('data-choice-index', index);

      // 点击事件
      choiceDiv.addEventListener('click', () => {
        this.selectChoice(index);
      });

      // 鼠标悬停事件
      choiceDiv.addEventListener('mouseenter', () => {
        this.highlightChoice(index);
      });

      container.appendChild(choiceDiv);
    });

    // 不预先高亮任何选项，只有键盘或鼠标操作时才高亮
    this.selectedChoiceIndex = -1;
  }

  /**
   * 导航选择项
   * @param {number} direction - 方向（-1上，1下）
   */
  navigateChoices(direction) {
    if (!this.isWaitingForChoice || this.currentChoices.length === 0) return;

    const newIndex = this.selectedChoiceIndex + direction;
    
    if (newIndex >= 0 && newIndex < this.currentChoices.length) {
      this.highlightChoice(newIndex);
    }
  }

  /**
   * 高亮选择项
   * @param {number} index - 选择项索引
   */
  highlightChoice(index) {
    this.selectedChoiceIndex = index;

    const choices = document.querySelectorAll('.choice-option');
    choices.forEach((choice, i) => {
      if (i === index) {
        choice.classList.add('selected');
      } else {
        choice.classList.remove('selected');
      }
    });
  }

  /**
   * 选择当前高亮的选择项
   */
  selectCurrentChoice() {
    if (this.selectedChoiceIndex >= 0) {
      this.selectChoice(this.selectedChoiceIndex);
    }
  }

  /**
   * 选择特定选择项
   * @param {number} index - 选择项索引
   */
  async selectChoice(index) {
    if (!this.isWaitingForChoice || 
        index < 0 || 
        index >= this.currentChoices.length ||
        this.isGenerating) {
      return;
    }

    const selectedChoice = this.currentChoices[index];
    
    try {
      // 隐藏选择项
      this.hideChoices();
      this.isWaitingForChoice = false;

      // 根据选择行为执行相应操作
      if (selectedChoice.action === 'continue') {
        await this.playNextElement();
      } else if (selectedChoice.action === 'end') {
        this.endGame();
      } else {
        // 其他自定义行为
        await this.handleCustomAction(selectedChoice);
      }

    } catch (error) {
      console.error('处理选择失败:', error);
      Utils.showNotification('处理选择失败', 'error');
      this.isWaitingForChoice = true;
      this.displayChoices(this.currentChoices);
    }
  }

  /**
   * 隐藏选择项
   */
  hideChoices() {
    const container = document.getElementById('choices-container');
    const spaceHint = document.getElementById('space-hint');
    const choiceHint = document.getElementById('choice-hint');

    container.classList.add('hidden');
    if (choiceHint) choiceHint.classList.add('hidden');
  }

  /**
   * 继续故事（无选择时）
   */
  async continueStory() {
  if (this.isWaitingForChoice || this.isGenerating) return;
    // 在 GalGame 模式下，继续故事即为进入下一个章节元素
    try {
      await this.playNextElement();
    } catch (error) {
      console.error('继续故事失败:', error);
      Utils.showNotification('继续故事失败', 'error');
    }
  }

  /**
   * 播放下一个元素
   */
  async playNextElement() {
    if (!this.currentChapter || !this.currentChapter.elements) {
      console.log('没有可播放的章节元素');
      return;
    }

    const elements = this.currentChapter.elements;
    if (this.currentElementIndex >= elements.length) {
      // 当前章节播放完毕
      console.log('章节播放完毕');
      this.showChapterComplete();
      return;
    }

    const element = elements[this.currentElementIndex];
    console.log('[GameEngine] playNextElement -> index:', this.currentElementIndex, 'type:', element?.type, 'keys:', Object.keys(element || {}));
    await this.playElement(element);
    this.currentElementIndex++;
  }

  /**
   * 播放单个元素
   */
  async playElement(element) {
    console.log('[GameEngine] playElement:', element?.type, element);
    switch (element.type) {
      case 'text':
        await this.playTextElement(element);
        break;
      case 'dialogue':
        await this.playDialogueElement(element);
        break;
      case 'choice':
        await this.playChoiceElement(element);
        break;
      case 'background':
        await this.playBackgroundElement(element);
        break;
      case 'music':
        await this.playMusicElement(element);
        break;
      case 'effect':
        await this.playEffectElement(element);
        break;
      default:
        console.warn('未知元素类型:', element.type);
    }
  }

  /**
   * 播放文本元素
   */
  async playTextElement(element) {
    const dialogueText = document.getElementById('dialogue-text');
    const dialogueBox = document.getElementById('dialogue-box');
    const nameplate = document.getElementById('nameplate') || document.getElementById('character-name');

    // 显示对话框并隐藏选择
    if (dialogueBox) dialogueBox.style.display = 'block';
    const choicesContainer = document.getElementById('choices-container');
    if (choicesContainer) choicesContainer.classList.add('hidden');
    // 名牌：如果 text 元素也附带角色，则展示
    if (nameplate) {
      const who = element.character || element.speaker || '';
      if (who) {
        nameplate.textContent = who;
        nameplate.classList.remove('hidden');
      } else {
        nameplate.textContent = '';
        nameplate.classList.add('hidden');
      }
    }

    if (dialogueText) {
      await this.typeText(dialogueText, element.content || element.text || '');
      // 文本结束后若下一项是选择，自动展示；或章节有顶层 choices 字段
      const next = this.currentChapter?.elements?.[this.currentElementIndex + 1];
      if (next && next.type === 'choice' && Array.isArray(next.choices) && next.choices.length > 0) {
        this.currentChoices = next.choices;
        this.isWaitingForChoice = true;
        this.showChoices(this.currentChoices);
        // 消费掉 choice 元素
        this.currentElementIndex++;
      } else if (Array.isArray(this.currentChapter?.choices) && this.currentChapter.choices.length > 0) {
        this.currentChoices = this.currentChapter.choices;
        this.isWaitingForChoice = true;
        this.showChoices(this.currentChoices);
      }
    }
  }

  /**
   * 播放对话元素
   */
  async playDialogueElement(element) {
    const dialogueText = document.getElementById('dialogue-text');
    const dialogueBox = document.getElementById('dialogue-box');
    const nameplate = document.getElementById('nameplate') || document.getElementById('character-name');

    // 显示对话框并隐藏选择
    if (dialogueBox) dialogueBox.style.display = 'block';
    const choicesContainer = document.getElementById('choices-container');
    if (choicesContainer) choicesContainer.classList.add('hidden');

    // 设置角色名牌
    if (nameplate) {
      if (element.character || element.speaker) {
        const who = element.character || element.speaker;
        nameplate.textContent = who;
        nameplate.classList.remove('hidden');
        // 如果有角色库信息，应用角色样式
        const character = this.characterLibrary.get(who);
        if (character && character.avatar) {
          this.setCharacterSprite(character.avatar);
        }
      } else {
        nameplate.textContent = '';
        nameplate.classList.add('hidden');
      }
    }
    
    if (dialogueText) {
      await this.typeText(dialogueText, element.content || element.text || '');
      // 对话结束后若下一项是选择，自动展示；或章节有顶层 choices 字段
      const next = this.currentChapter?.elements?.[this.currentElementIndex + 1];
      if (next && next.type === 'choice' && Array.isArray(next.choices) && next.choices.length > 0) {
        this.currentChoices = next.choices;
        this.isWaitingForChoice = true;
        this.showChoices(this.currentChoices);
        // 消费掉 choice 元素
        this.currentElementIndex++;
      } else if (Array.isArray(this.currentChapter?.choices) && this.currentChapter.choices.length > 0) {
        this.currentChoices = this.currentChapter.choices;
        this.isWaitingForChoice = true;
        this.showChoices(this.currentChoices);
      }
    }
  }

  /**
   * 播放选择元素
   */
  async playChoiceElement(element) {
    this.currentChoices = element.choices || [];
    this.isWaitingForChoice = true;
    this.showChoices(this.currentChoices);
  }

  /**
   * 播放背景元素
   */
  async playBackgroundElement(element) {
    if (element.src || element.path) {
      this.setBackground(element.src || element.path);
    }
  }

  /**
   * 播放音乐元素
   */
  async playMusicElement(element) {
    if (element.src || element.path) {
      this.playBackgroundMusic(element.src || element.path);
    }
  }

  /**
   * 播放效果元素
   */
  async playEffectElement(element) {
    // 播放视觉或音效
    console.log('播放效果:', element);
  }

  /**
   * 播放下一个场景
   */
  async playNextScene() {
    if (!this.currentChapter || !this.currentChapter.content || !this.currentChapter.content.scenes) {
      console.log('没有更多场景');
      return;
    }

    const scenes = this.currentChapter.content.scenes;
    const currentSceneIndex = scenes.findIndex(scene => scene.id === this.currentScene.id);
    
    if (currentSceneIndex + 1 < scenes.length) {
      this.currentScene = scenes[currentSceneIndex + 1];
      this.currentElementIndex = 0;
      
      // 设置场景背景和音乐
      if (this.currentScene.background) {
        this.setBackground(this.currentScene.background);
      }
      if (this.currentScene.music) {
        this.playBackgroundMusic(this.currentScene.music);
      }
      
      await this.playNextElement();
    } else {
      console.log('章节播放完毕');
      this.showChapterComplete();
    }
  }

  /**
   * 开始播放章节
   */
  async startChapter() {
    if (!this.currentChapter || !this.currentChapter.elements) {
      console.error('没有可播放的章节');
      return;
    }

    this.gameState = 'playing';
    this.currentElementIndex = 0;
    // 保险：切换到游戏界面并确保遮罩不挡住
    this.switchToGameScreen();
    this.hideLoadingOverlay();
  // 不再使用空格推进，默认隐藏空格提示
  const spaceHint = document.getElementById('space-hint');
  if (spaceHint) spaceHint.classList.add('hidden');
    
    // 设置章节背景和音乐（如果有，兼容多种字段，含 sceneProperties）
    const bg = this.currentChapter.background
      || this.currentChapter.content?.background
      || this.currentChapter.content?.backgroundImage
      || this.currentChapter.content?.sceneProperties?.backgroundImage
      || this.currentChapter.sceneProperties?.backgroundImage;
    if (bg) {
      const base = this.currentProject?.path || '';
      let resolvedUrl = bg;
      if (typeof bg === 'string') {
        const isHttp = bg.startsWith('http://') || bg.startsWith('https://');
        const isFile = bg.startsWith('file://');
        const isData = bg.startsWith('data:');
        if (!isHttp && !isFile && !isData) {
          if (bg.startsWith('assets/')) {
            const fullPath = base ? `${base}/${bg}` : bg;
            resolvedUrl = (window.PathUtils && typeof window.PathUtils.toFileUrl === 'function' && base)
              ? window.PathUtils.toFileUrl(fullPath)
              : fullPath;
          } else if (base) {
            const fullPath = `${base}/${bg}`;
            resolvedUrl = (window.PathUtils && typeof window.PathUtils.toFileUrl === 'function')
              ? window.PathUtils.toFileUrl(fullPath)
              : fullPath;
          }
        }
      }
      console.log('[GameEngine] startChapter 背景:', bg, '->', resolvedUrl);
      this.setBackgroundImage(resolvedUrl);
    }
    // 注意：章节音乐已在 loadChapter 阶段应用，避免此处重复触发导致音频中断错误
    // 若本章节无音乐，确保可视化器隐藏
    try {
      const hasMusic = !!(this.currentChapter?.music
        || this.currentChapter?.content?.music
        || this.currentChapter?.content?.backgroundMusic
        || this.currentChapter?.content?.sceneProperties?.backgroundMusic
        || this.currentChapter?.sceneProperties?.backgroundMusic);
      if (!hasMusic && this._musicVisualizer && this._musicVisualizer.stop) this._musicVisualizer.stop();
    } catch {}
    
    await this.playNextElement();
  }

  /**
   * 显示章节完成
   */
  showChapterComplete() {
    const dialogueText = document.getElementById('dialogue-text');
    const characterName = document.getElementById('character-name');
    
    if (characterName) characterName.textContent = '';
    if (dialogueText) {
      dialogueText.innerHTML = '<p style="text-align: center; font-style: italic;">章节完成</p>';
    }
    
    // 显示继续选项或返回菜单
    this.currentChoices = [
      { text: '返回主菜单', action: 'menu' },
      { text: '下一章节', action: 'next_chapter' }
    ];
    this.showChoices(this.currentChoices);
  }

  /**
   * 生成下一段内容（保持兼容性）
   * @param {string} userChoice - 用户选择
   */
  async generateNextContent(userChoice) {
    // AIGC 功能在播放器中禁用；改为推进到下一个章节元素
    console.log('[GameEngine] generateNextContent 已禁用，fallback 到 playNextElement');
    if (this.isGenerating) return;
    try {
      await this.playNextElement();
    } catch (e) {
      console.warn('fallback 到 playNextElement 失败:', e);
    }
    return;
    
    this.showLoadingOverlay('正在生成故事内容...', '文本生成中', retryGeneration, abortController);

    try {
      // 获取当前知识库
  const knowledgeBase = this.currentProject.knowledgeBase || this.currentTimeline.knowledgeBase || {};

      // 构建上下文
      const context = {
        projectName: this.currentProject.name,
        projectStyle: this.currentProject.style,
        currentContent: this.currentTimeline.content.dialogue,
        knowledgeBase: knowledgeBase,
        characters: this.currentProject.characters
      };

      // 生成新内容 - 传递 AbortController 信号
      const aiResponse = await window.aiService.generateStoryContent(
        context,
        knowledgeBase,
        userChoice,
        abortController.signal
      );

      // 更新知识库
      const updatedKnowledgeBase = window.aiService.applyKnowledgeUpdates(
        knowledgeBase,
        aiResponse.knowledgeUpdates
      );
      // 持久化知识库
      this.currentProject.knowledgeBase = updatedKnowledgeBase;
      await window.projectManager.writeKnowledgeBase(this.currentProject, updatedKnowledgeBase);

      // 角色库更新
      if (aiResponse.charactersDelta) {
        const updatedCharacters = window.aiService.applyCharacterUpdates(this.currentProject.characters, aiResponse.charactersDelta);
        this.currentProject.characters = updatedCharacters;
        await window.projectManager.writeCharacters(this.currentProject, updatedCharacters);
      }

      // 图像生成：生成时应用背景高斯模糊与实时日志
      let backgroundUrl = null;
      let imagePromise = null;
      let filename = null; // 在外部定义filename变量
      const bgEl = document.getElementById('game-background');
      if (bgEl) {
        bgEl.style.filter = 'blur(12px) brightness(0.85)';
      }
      if (aiResponse.imagePrompt) {
        this.updateLoadingStage('图像生成中');
        // 若之前无背景，联动首页卡片占位状态（通过事件广播）
        const hadBg = !!this.currentTimeline.content.backgroundUrl;
        
        // 生成唯一文件名
        const timestamp = Date.now();
        filename = `background_${timestamp}.png`;

        imagePromise = window.aiService.generateImage(aiResponse.imagePrompt, {
          projectId: this.currentProject.id,
          filename: filename,
          signal: abortController.signal, // 传递中断信号
          onProgress: (progress) => {
            if (progress) {
              this.updateLoadingStage(progress.stage);
              if (!hadBg) {
                window.dispatchEvent(new CustomEvent('image-progress', { 
                  detail: { 
                    projectId: this.currentProject.id, 
                    stage: progress.stage, 
                    done: false, 
                    percent: progress.percent 
                  } 
                }));
              }
            }
          }
        })
          .then(localPath => { 
            backgroundUrl = localPath; // 保存本地相对路径
            return localPath; 
          })
          .catch(err => { 
            console.warn('图像生成失败:', err); 
            return null; 
          });
      }

      // 创建新的时间线节点（先不包含backgroundUrl）
      const newTimeline = {
        id: Utils.generateId(),
        timestamp: Date.now(),
        content: {
          dialogue: aiResponse.dialogue,
          choices: aiResponse.choices || [],
          imagePrompt: aiResponse.imagePrompt,
          knowledgeUpdates: aiResponse.knowledgeUpdates || {},
          chapterSummary: aiResponse.chapterSummary,
          backgroundUrl: backgroundUrl, // 初始为null
          userChoice: userChoice // 保存用户的选择
        },
        knowledgeBase: updatedKnowledgeBase,
        isCheckpoint: true
      };

      // 等待图像完成后，更新backgroundUrl并重新保存
      if (imagePromise) {
        const localPath = await imagePromise;
        if (localPath) {
          // 更新时间线节点的背景URL
          backgroundUrl = `assets/${filename}`; // 存储相对路径
          newTimeline.content.backgroundUrl = backgroundUrl;
          console.log('更新时间线背景URL:', backgroundUrl);
          
          // 使用本地文件路径设置背景 - 使用路径工具
          const fullLocalPath = `${this.currentProject.path}/${localPath}`;
          const fileUrl = window.PathUtils.toFileUrl(fullLocalPath);
          this.setBackgroundImage(fileUrl);
          // 广播完成，更新封面（传递本地路径用于封面显示）
          window.dispatchEvent(new CustomEvent('image-progress', { 
            detail: { 
              projectId: this.currentProject.id, 
              stage: '完成', 
              done: true, 
              url: `file://${fullLocalPath}` 
            } 
          }));
        }
      }

      // 保存时间线节点（在图像处理完成后）
      await window.projectManager.saveTimelineNode(newTimeline);

      // 更新当前状态
      this.currentTimeline = newTimeline;
      this.currentProject.currentTimeline = newTimeline;

      // 更新时间线管理器
      window.timeline.addNode(newTimeline);
      this.hideLoadingOverlay();
      if (bgEl) bgEl.style.filter = '';
      await this.displayContent(newTimeline.content);

    } catch (error) {
      console.error('生成内容失败:', error);
      
      // 检查是否是用户主动中断
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        console.log('用户中断了内容生成');
        this.isGenerating = false;
        return; // 不显示错误，因为是用户主动中断
      }
      
      Utils.showNotification('生成内容失败，请稍后重试', 'error');
      this.hideLoadingOverlay();
      
      // 恢复之前的状态
      if (this.currentChoices.length > 0) {
        this.isWaitingForChoice = true;
        this.displayChoices(this.currentChoices);
      }
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * 生成背景图像
   * @param {string} prompt - 图像提示词
   */
  async generateBackgroundImage(prompt) {
    try {
      const currentProject = window.projectManager.getCurrentProject();
      if (!currentProject) {
        throw new Error('没有当前项目');
      }

      // 生成唯一文件名
      const timestamp = Date.now();
      const filename = `background_${timestamp}.png`;

      const localPath = await window.aiService.generateImage(prompt, {
        projectId: currentProject.id,
        filename: filename,
        onProgress: (progress) => {
          // 可以在这里更新加载进度UI
          console.log(`背景图生成进度: ${progress.stage} - ${progress.percent}%`);
        }
      });

      // 使用本地路径设置背景 - 使用路径工具
      const fullLocalPath = `${currentProject.path}/${localPath}`;
      const fileUrl = window.PathUtils.toFileUrl(fullLocalPath);
      this.setBackgroundImage(fileUrl);
      
      // 返回本地路径供保存到时间线
      return localPath;
    } catch (error) {
      console.warn('生成背景图像失败:', error);
      // 设置默认背景
      this.setDefaultBackground();
      return null;
    }
  }

  /**
   * 设置背景图像
   * @param {string} imageUrl - 图像URL
   */
  setBackgroundImage(imageUrl) {
    const background = document.getElementById('game-background');
    if (background && imageUrl) {
  // 不清空当前背景，轻微降不透明度作为加载提示
  background.style.opacity = '0.6';
      
      // 创建图像对象预加载
      const img = new Image();
      img.onload = () => {
        // 图像加载完成后再替换背景，避免空白
        const safeUrl = String(imageUrl).replace(/"/g, '\\"');
        background.style.backgroundImage = `url("${safeUrl}")`;
        background.style.opacity = '0';
        setTimeout(() => {
          background.style.transition = 'opacity 0.8s ease';
          background.style.opacity = '1';
        }, 20);
      };
      
      img.onerror = () => {
  // 加载失败，保持当前背景
        console.warn('背景图像加载失败:', imageUrl);
        background.style.opacity = '1';
      };
      
      // 开始加载图像
      img.src = imageUrl;
    }
  }

  /**
   * 设置默认背景
   */
  setDefaultBackground() {
    const background = document.getElementById('game-background');
    if (background) {
  // 设置主题渐变背景作为默认
  background.style.backgroundImage = 'var(--gradient-primary)';
    }
  }

  /**
   * 显示加载覆盖层
   * @param {string} text - 加载文本
   * @param {string} stage - 当前阶段
   */
  showLoadingOverlay(text, stage, onRetry = null, abortController = null) {
    // 使用科幻霓虹加载器
    if (window.Loader) {
      window.Loader.show(onRetry, abortController);
      window.Loader.setProgress(0);
      window.Loader.setStage(stage || '准备中');
    }
    // 场景转场
    const trans = document.getElementById('scene-transition');
    if (trans) { trans.classList.remove('hidden'); trans.classList.add('active'); setTimeout(()=>trans.classList.remove('active'), 400); }
  }

  /**
   * 更新加载阶段
   * @param {string} stage - 新阶段
   */
  updateLoadingStage(stage) {
    // 可在不同阶段更新大致进度（示例：文本阶段30%，图像阶段80%）
    if (window.Loader) {
  const p = stage && stage.includes('下载') ? 90 : (stage && stage.includes('图像') ? 80 : 30);
      window.Loader.setProgress(p);
  window.Loader.setStage(stage || '处理中');
    }
  }

  /**
   * 隐藏加载覆盖层
   */
  hideLoadingOverlay() {
    if (window.Loader) {
      window.Loader.setProgress(100);
      window.Loader.hide();
    }
  const trans = document.getElementById('scene-transition');
  if (trans) { setTimeout(()=>trans.classList.add('hidden'), 450); }
  }

  /**
   * 处理自定义动作
   * @param {Object} choice - 选择对象
   */
  async handleCustomAction(choice) {
    // 这里可以处理其他类型的选择，如：
    // - 查看物品
    // - 角色互动
    // - 场景切换等
    
    console.log('处理自定义动作:', choice);
    
    // GalGame 默认行为：推进到下一个元素
    await this.playNextElement();
  }

  /**
   * 暂停游戏
   */
  pauseGame() {
    this.gameState = 'paused';
    // 可以显示暂停菜单
    Utils.showNotification('游戏已暂停，按ESC继续', 'info', 2000);
    
    setTimeout(() => {
      if (this.gameState === 'paused') {
        this.gameState = 'playing';
      }
    }, 2000);
  }

  /**
   * 结束游戏
   */
  endGame() {
    this.gameState = 'menu';
    Utils.showNotification('游戏结束', 'info');
    this.exitGame();
  }

  /**
   * 退出游戏回到主菜单
   */
  exitGame() {
    // 清理游戏状态
    this.gameState = 'menu';
    this.currentProject = null;
    this.currentTimeline = null;
    this.currentChoices = [];
    this.selectedChoiceIndex = -1;
    this.isWaitingForChoice = false;
    this.isGenerating = false;

    // 隐藏加载界面
    this.hideLoadingOverlay();

  // 隐藏时间线面板（本地播放已禁用，存在时再调用）
  try { window.timeline && window.timeline.hide && window.timeline.hide(); } catch {}

    // 切换到主界面
    this.switchToMainScreen();

    // 重新加载项目列表
    window.projectManager.loadProjects().then(() => {
      if (window.renderProjectsList) {
        window.renderProjectsList();
      }
    });
  }

  /**
   * 切换到游戏界面
   */
  switchToGameScreen() {
    const mainScreen = document.getElementById('main-screen');
    const gameScreen = document.getElementById('game-screen');

    if (mainScreen) mainScreen.classList.remove('active');
    if (gameScreen) gameScreen.classList.add('active');
  }

  /**
   * 切换到主界面
   */
  switchToMainScreen() {
    const mainScreen = document.getElementById('main-screen');
    const gameScreen = document.getElementById('game-screen');

    if (gameScreen) gameScreen.classList.remove('active');
    if (mainScreen) mainScreen.classList.add('active');
  }

  /**
   * 检查游戏是否活跃
   */
  isGameActive() {
    return this.gameState === 'playing';
  }

  /**
   * 获取游戏状态
   */
  getGameState() {
    return {
      state: this.gameState,
      project: this.currentProject?.name || null,
      isGenerating: this.isGenerating,
      isWaitingForChoice: this.isWaitingForChoice,
      choicesCount: this.currentChoices.length,
      currentChapter: this.currentChapter?.id || null,
      variables: { ...this.gameVariables }
    };
  }

  // ========================================
  // GalGame 专用功能
  // ========================================

  

  /**
   * 显示章节内容
   * @param {Object} chapter - 章节数据
   */
  displayChapter(chapter) {
    // 设置背景
    if (chapter.content.backgroundImage) {
      this.setBackground(chapter.content.backgroundImage);
    }
    
    // 设置背景音乐
    if (chapter.content.backgroundMusic) {
      this.setBackgroundMusic(chapter.content.backgroundMusic);
    }
    
    // 显示主文本
    this.displayText(chapter.content.mainText);
    
    // 显示选择选项
    if (chapter.content.choices && chapter.content.choices.length > 0) {
      this.displayChoices(chapter.content.choices);
    }
  }

  /**
   * 显示文本
   * @param {string} text - 文本内容
   */
  displayText(text) {
    const gameText = document.getElementById('game-text');
    if (gameText) {
      gameText.textContent = text;
      gameText.classList.add('visible');
    }
  }

  /**
   * 显示选择选项
   * @param {Array} choices - 选择选项数组
   */
  displayChoices(choices) {
    const choicesContainer = document.getElementById('choices-container');
    if (!choicesContainer) return;
    
    // 清空现有选项
    choicesContainer.innerHTML = '';
    
    // 过滤符合条件的选项
    const availableChoices = choices.filter(choice => 
      this.checkChoiceConditions(choice)
    );
    
    if (availableChoices.length === 0) {
      // 如果没有可用选项，自动跳转到默认章节
      const defaultChoice = choices.find(c => c.targetChapter);
      if (defaultChoice) {
        setTimeout(() => this.selectChoice(defaultChoice), 1000);
      }
      return;
    }
    
    availableChoices.forEach((choice, index) => {
      const choiceElement = document.createElement('div');
      choiceElement.className = 'choice-option';
      choiceElement.textContent = choice.text;
      choiceElement.addEventListener('click', () => this.selectChoice(choice));
      
      choicesContainer.appendChild(choiceElement);
    });
    
    choicesContainer.style.display = 'block';
    this.isWaitingForChoice = true;
  }

  /**
   * 检查选择选项的条件
   * @param {Object} choice - 选择选项
   */
  checkChoiceConditions(choice) {
    // 如果没有条件，默认显示
    if (!choice.conditions || choice.conditions.length === 0) {
      return true;
    }
    
    // 检查所有条件（AND逻辑）
    return choice.conditions.every(condition => 
      this.evaluateCondition(condition.variable, condition.operator, condition.value)
    );
  }

  /**
   * 评估条件表达式
   * @param {string} variable - 变量名
   * @param {string} operator - 操作符
   * @param {any} value - 比较值
   */
  evaluateCondition(variable, operator, value) {
    const varValue = this.gameVariables[variable];
    
    switch (operator) {
      case '==':
        return varValue == value;
      case '!=':
        return varValue != value;
      case '>':
        return Number(varValue) > Number(value);
      case '<':
        return Number(varValue) < Number(value);
      case '>=':
        return Number(varValue) >= Number(value);
      case '<=':
        return Number(varValue) <= Number(value);
      case 'contains':
        return String(varValue).includes(String(value));
      default:
        return false;
    }
  }

  /**
   * 选择选项
   * @param {Object} choice - 选择的选项
   */
  async selectChoice(choice) {
    if (!this.isWaitingForChoice) return;
    
    this.isWaitingForChoice = false;
    
    // 隐藏选择界面
    const choicesContainer = document.getElementById('choices-container');
    if (choicesContainer) {
      choicesContainer.style.display = 'none';
    }
    
    // 应用变量操作
    if (choice.variables) {
      this.applyVariableOperations(choice.variables);
    }
    
    // 确定跳转目标
    let targetChapter = choice.targetChapter;
    
    // 检查条件跳转
    if (choice.conditionalTargets && choice.conditionalTargets.length > 0) {
      for (const condition of choice.conditionalTargets) {
        if (this.evaluateCondition(condition.variable, condition.operator, condition.value)) {
          targetChapter = condition.targetChapter;
          break;
        }
      }
    }
    
    // 跳转到目标章节
    if (targetChapter) {
      await this.loadChapter(targetChapter);
    } else {
      console.warn('No target chapter specified for choice');
    }
  }

  /**
   * 应用变量操作
   * @param {Object} variables - 变量操作对象
   */
  applyVariableOperations(variables) {
    Object.entries(variables).forEach(([key, value]) => {
      // 支持不同的操作类型
      if (typeof value === 'string' && value.startsWith('+')) {
        // 增量操作：+5
        const increment = Number(value.substring(1));
        this.gameVariables[key] = (Number(this.gameVariables[key]) || 0) + increment;
      } else if (typeof value === 'string' && value.startsWith('-')) {
        // 减量操作：-3
        const decrement = Number(value.substring(1));
        this.gameVariables[key] = (Number(this.gameVariables[key]) || 0) - decrement;
      } else {
        // 直接赋值
        this.gameVariables[key] = value;
      }
    });
    
    console.log('Variables updated:', this.gameVariables);
  }

  /**
   * 设置背景
   * @param {string} imagePath - 背景图片路径
   */
  setBackground(imagePath) {
    const fullPath = `${this.currentProject.path}/${imagePath}`;
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
      gameContainer.style.backgroundImage = `url("${fullPath}")`;
      gameContainer.style.backgroundSize = 'cover';
      gameContainer.style.backgroundPosition = 'center';
    }
  }

  /**
   * 设置背景音乐
   * @param {string} musicPath - 背景音乐路径
   */
  setBackgroundMusic(musicPath) {
    // 兼容旧接口：委托到播放函数
    this.playBackgroundMusic(musicPath);
  }

  /**
   * 播放背景音乐（循环）
   */
  playBackgroundMusic(musicPath) {
    try {
      if (!this._bgmAudio) {
        const audio = document.createElement('audio');
        audio.id = 'bgm-audio';
        audio.loop = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        this._bgmAudio = audio;
        // 初始化可视化器（使用原有实现）
        try {
          if (!this._musicVisualizer && window.MusicVisualizer) {
            console.log('[GameEngine] 正在实例化 MusicVisualizer');
            this._musicVisualizer = new window.MusicVisualizer();
          }
        } catch {}
      }
      // 去抖：短时间多次调用只保留最后一次
      if (this._bgmDebounceTimer) clearTimeout(this._bgmDebounceTimer);
      let src = musicPath || '';
      // 统一规范化：
      // - http/https/data: 直用
      // - file:// 直用
      // - 绝对路径(C:\ 或 /xxx)：转 file://
      // - 相对路径：与项目根拼接后转 file://
      if (src) {
        const isHttp = /^https?:\/\//i.test(src);
        const isFile = /^file:\/\//i.test(src);
        const isData = /^data:/i.test(src);
        const isWinAbs = /^[a-zA-Z]:[\\\//]/.test(src);
        const isPosixAbs = src.startsWith('/');
        if (!isHttp && !isFile && !isData) {
          let abs = src;
          if (!(isWinAbs || isPosixAbs)) {
            const base = this.currentProject?.path || '';
            abs = base ? `${base}/${src}` : src;
          }
          src = (window.PathUtils && typeof window.PathUtils.toFileUrl === 'function') ? window.PathUtils.toFileUrl(abs) : abs;
        }
      }

      // 规范化对比：同源不重复设置
      const sameAsCurrent = (this._bgmAudio.src === src);
      this._bgmDebounceTimer = setTimeout(() => {
        try {
          if (sameAsCurrent) {
            if (this._bgmAudio.paused) {
              const p0 = this._bgmAudio.play();
              if (p0 && typeof p0.catch === 'function') p0.catch(() => {});
            }
          } else {
            // 仅当源变化时才切换，降低中断概率
            this._bgmAudio.pause();
            this._bgmAudio.src = src;
            const p = this._bgmAudio.play();
            if (p && typeof p.catch === 'function') {
              p.catch(err => console.warn('背景音乐播放被阻止或失败:', err));
            }
          }
          console.log('Background music playing:', src);
          const musicBtn = document.getElementById('game-music-btn');
          if (musicBtn) musicBtn.classList.add('playing');
          try { this._musicVisualizer && this._musicVisualizer.start && this._musicVisualizer.start(); } catch {}
        } catch (inner) {
          console.warn('设置背景音乐失败:', inner);
          try { this._musicVisualizer && this._musicVisualizer.stop && this._musicVisualizer.stop(); } catch {}
        }
      }, 60);
    } catch (e) {
      console.warn('播放背景音乐失败:', e);
    }
  }

  /**
   * 切换背景音乐播放/暂停
   */
  toggleBackgroundMusic() {
    try {
      if (!this._bgmAudio) return;
      const btn = document.getElementById('game-music-btn');
      if (this._bgmAudio.paused) {
        const p = this._bgmAudio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
        if (btn) btn.classList.add('playing');
        try { this._musicVisualizer && this._musicVisualizer.start && this._musicVisualizer.start(); } catch {}
      } else {
        this._bgmAudio.pause();
        if (btn) btn.classList.remove('playing');
        try { this._musicVisualizer && this._musicVisualizer.stop && this._musicVisualizer.stop(); } catch {}
      }
    } catch {}
  }

  /**
   * 保存游戏状态
   */
  async saveGameState(slotId = 'autosave') {
    const saveData = {
      timestamp: new Date().toISOString(),
      projectPath: this.currentProject.path,
      currentChapter: this.currentChapter.id,
      variables: { ...this.gameVariables },
      history: [...this.chapterHistory]
    };
    
    try {
      const saveDir = await window.electronAPI.appGetPath('userData');
      const savePath = `${saveDir}/saves/${slotId}.json`;
      
      await window.electronAPI.fsWriteJson(savePath, saveData);
      
      console.log('Game saved:', slotId);
      return { success: true };
    } catch (error) {
      console.error('Failed to save game:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 加载游戏状态
   */
  async loadGameState(slotId = 'autosave') {
    try {
      const saveDir = await window.electronAPI.appGetPath('userData');
      const savePath = `${saveDir}/saves/${slotId}.json`;
      
      const exists = await window.electronAPI.fsExists(savePath);
      if (!exists) {
        throw new Error('存档文件不存在');
      }
      
      const saveData = await window.electronAPI.fsReadJson(savePath);
      
      // 恢复游戏状态
      this.gameVariables = { ...saveData.variables };
      this.chapterHistory = [...saveData.history];
      
      // 加载项目和章节
      await this.loadGalGameProject(saveData.projectPath);
      await this.loadChapter(saveData.currentChapter);
      
      console.log('Game loaded:', slotId);
      return { success: true };
    } catch (error) {
      console.error('Failed to load game:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取变量值
   * @param {string} varName - 变量名
   */
  getVariable(varName) {
    return this.gameVariables[varName];
  }

  /**
   * 设置变量值
   * @param {string} varName - 变量名
   * @param {any} value - 变量值
   */
  setVariable(varName, value) {
    this.gameVariables[varName] = value;
  }

  /**
   * 文字打字机效果
   */
  async typeText(element, text, speed = 50) {
    return new Promise((resolve) => {
      element.innerHTML = '';
      element.dataset.typing = 'true';
      
      let index = 0;
      const timer = setInterval(() => {
        if (index < text.length) {
          element.innerHTML += text[index];
          index++;
        } else {
          clearInterval(timer);
          element.dataset.typing = 'false';
          resolve();
        }
      }, speed);
    });
  }

  /**
   * 设置背景图片
   */
  setBackground(imagePath) {
    const background = document.getElementById('game-background');
    if (background) {
      background.style.backgroundImage = `url(${imagePath})`;
    }
  }

  /**
   * 设置角色立绘
   */
  setCharacterSprite(imagePath) {
    let characterSprite = document.getElementById('character-sprite');
    if (!characterSprite) {
      characterSprite = document.createElement('div');
      characterSprite.id = 'character-sprite';
      characterSprite.className = 'character-sprite';
      
      const gameScreen = document.getElementById('game-screen');
      if (gameScreen) {
        gameScreen.appendChild(characterSprite);
      }
    }
    
    if (imagePath) {
      characterSprite.style.backgroundImage = `url(${imagePath})`;
      characterSprite.style.display = 'block';
    } else {
      characterSprite.style.display = 'none';
    }
  }

  /**
   * 显示选择项
   */
  showChoices(choices) {
    const choicesContainer = document.getElementById('choices-container');
    if (!choicesContainer) return;
    
    choicesContainer.innerHTML = '';
    
    choices.forEach((choice, index) => {
      const choiceBtn = document.createElement('div');
      choiceBtn.className = 'choice-option';
      choiceBtn.textContent = choice.text || choice.label || `选项 ${index + 1}`;
      choiceBtn.addEventListener('click', () => this.selectChoice(index));
      choicesContainer.appendChild(choiceBtn);
    });
    
    choicesContainer.classList.remove('hidden');
    const spaceHint = document.getElementById('space-hint');
    const choiceHint = document.getElementById('choice-hint');
    if (spaceHint) spaceHint.classList.add('hidden');
    if (choiceHint) choiceHint.classList.remove('hidden');
  }

  /**
   * 选择选项
   */
  async selectChoice(index) {
    if (index < 0 || index >= this.currentChoices.length) return;
    
    const choice = this.currentChoices[index];
    // 隐藏选择并恢复空格提示
    this.hideChoices();
    
    this.isWaitingForChoice = false;
    
    // 记录选择到游戏历史
    this.addToHistory({
      type: 'choice',
      choice: choice,
      timestamp: Date.now(),
      chapter: this.currentChapter?.id,
      scene: this.currentScene?.id,
      elementIndex: this.currentElementIndex
    });
    
    // 处理选择的动作
    await this.handleChoiceAction(choice.action);
  }

  /**
   * 处理选择动作
   */
  async handleChoiceAction(action) {
    // 兼容旧格式（字符串）和新格式（对象）
    if (typeof action === 'string') {
      // 旧格式兼容性
      switch (action) {
        case 'menu':
          this.exitGame();
          break;
        case 'next_chapter':
          await this.loadNextChapter();
          break;
        case 'continue':
        default:
          await this.playNextElement();
          break;
      }
    } else if (typeof action === 'object' && action.type) {
      // 新格式处理
      switch (action.type) {
        case 'continue':
          await this.playNextElement();
          break;
        case 'jump_to_chapter':
        case 'jump':
        case 'goto':
        case 'go_to_chapter':
          if (action.target) {
            await this.jumpToChapter(action.target);
          } else if (action.chapter || action.chapterId || action.to) {
            await this.jumpToChapter(action.chapter || action.chapterId || action.to);
          }
          break;
        case 'jump_to_scene':
          if (action.target && action.chapter) {
            await this.jumpToScene(action.chapter, action.target);
          }
          break;
        case 'set_variable':
          if (action.variable && action.value !== undefined) {
            this.setVariable(action.variable, action.value);
            await this.playNextElement();
          }
          break;
        case 'conditional_jump':
          await this.handleConditionalJump(action);
          break;
        case 'menu':
          this.exitGame();
          break;
        case 'end_game':
          this.showGameComplete();
          break;
        case 'save_game':
          await this.saveGame(action.slot || 'auto');
          await this.playNextElement();
          break;
        case 'load_game':
          await this.loadGame(action.slot);
          break;
        default:
          console.warn('未知的动作类型:', action.type);
          await this.playNextElement();
          break;
      }
    } else {
      // 默认继续播放
      await this.playNextElement();
    }
  }

  /**
   * 加载下一章节
   */
  async loadNextChapter() {
    if (!this.currentProject || !this.currentChapter) return;
    // 优先根据 _chapterOrder 推断下一章
    const order = Array.isArray(this.currentProject._chapterOrder) ? this.currentProject._chapterOrder : null;
    let nextId = null;
    if (order && order.length > 0) {
      const idx = order.indexOf(this.currentChapter.id);
      if (idx >= 0 && idx + 1 < order.length) {
        nextId = order[idx + 1];
      }
    }
    // 回退：按目录枚举顺序（字母序）
    if (!nextId) {
      try {
        const dir = `${this.currentProject.path}/chapters`;
        const items = await (window.electronAPI.fsReaddir?.(dir) || window.electronAPI.fs?.readdir(dir));
        const ids = (items || []).filter(n => !n.startsWith('.')).sort();
        const idx = ids.indexOf(this.currentChapter.id);
        if (idx >= 0 && idx + 1 < ids.length) {
          nextId = ids[idx + 1];
        }
      } catch {}
    }
    if (nextId) {
      if (await this.loadChapter(nextId)) {
        await this.startChapter();
      }
    } else {
      // 没有下一章，视为游戏完成
      this.showGameComplete();
    }
  }

  /**
   * 跳转到指定章节
   */
  async jumpToChapter(chapterId) {
    try {
      console.log('跳转到章节:', chapterId);
      
      if (await this.loadChapter(chapterId)) {
        await this.startChapter();
        
        // 记录章节跳转
        this.addToHistory({
          type: 'chapter_jump',
          from: this.currentChapter?.id,
          to: chapterId,
          timestamp: Date.now()
        });
      } else {
        console.error('无法加载章节:', chapterId);
      }
    } catch (error) {
      console.error('跳转章节失败:', error);
    }
  }

  /**
   * 跳转到指定场景
   */
  async jumpToScene(chapterId, sceneId) {
    try {
      console.log('跳转到场景:', chapterId, sceneId);
      
      // 如果需要切换章节
      if (chapterId !== this.currentChapter?.id) {
        await this.loadChapter(chapterId);
      }
      
      // 查找目标场景
      const scenes = this.currentChapter?.scenes || [];
      const targetScene = scenes.find(scene => scene.id === sceneId);
      
      if (targetScene) {
        this.currentScene = targetScene;
        this.currentElementIndex = 0;
        await this.startChapter();
        
        // 记录场景跳转
        this.addToHistory({
          type: 'scene_jump',
          chapter: chapterId,
          scene: sceneId,
          timestamp: Date.now()
        });
      } else {
        console.error('无法找到场景:', sceneId);
      }
    } catch (error) {
      console.error('跳转场景失败:', error);
    }
  }

  /**
   * 处理条件跳转
   */
  async handleConditionalJump(action) {
    const { condition, trueAction, falseAction } = action;
    
    let conditionMet = false;
    
    if (condition.type === 'variable_equals') {
      const value = this.getVariable(condition.variable);
      conditionMet = (value === condition.value);
    } else if (condition.type === 'variable_greater') {
      const value = this.getVariable(condition.variable);
      conditionMet = (value > condition.value);
    } else if (condition.type === 'variable_less') {
      const value = this.getVariable(condition.variable);
      conditionMet = (value < condition.value);
    }
    
    const actionToExecute = conditionMet ? trueAction : falseAction;
    if (actionToExecute) {
      await this.handleChoiceAction(actionToExecute);
    } else {
      await this.playNextElement();
    }
  }

  /**
   * 设置游戏变量
   */
  setVariable(name, value) {
    this.gameVariables[name] = value;
    console.log(`设置变量: ${name} = ${value}`);
    
    // 触发变量变化事件
    this.onVariableChange(name, value);
  }

  /**
   * 获取游戏变量
   */
  getVariable(name, defaultValue = null) {
    return this.gameVariables.hasOwnProperty(name) ? this.gameVariables[name] : defaultValue;
  }

  /**
   * 变量变化回调
   */
  onVariableChange(name, value) {
    // 可以在这里添加变量变化的响应逻辑
    console.log(`变量变化: ${name} -> ${value}`);
  }

  /**
   * 添加历史记录
   */
  addToHistory(entry) {
    this.chapterHistory.push(entry);
    
    // 限制历史记录长度
    if (this.chapterHistory.length > 1000) {
      this.chapterHistory.shift();
    }
  }

  /**
   * 保存游戏
   */
  async saveGame(slot = 'auto') {
    try {
      const saveData = {
        timestamp: Date.now(),
        project: this.currentProject?.name || 'Unknown',
        chapter: this.currentChapter?.id,
        scene: this.currentScene?.id,
        elementIndex: this.currentElementIndex,
        variables: { ...this.gameVariables },
        history: [...this.chapterHistory]
      };
      
      this.saveSlots.set(slot, saveData);
      
      // 如果有本地存储API，也保存到本地
      if (window.electronAPI && window.electronAPI.storage) {
        await window.electronAPI.storage.set(`save_${slot}`, saveData);
      }
      
      console.log('游戏已保存到槽位:', slot);
      return true;
    } catch (error) {
      console.error('保存游戏失败:', error);
      return false;
    }
  }

  /**
   * 加载游戏
   */
  async loadGame(slot) {
    try {
      let saveData = this.saveSlots.get(slot);
      
      // 如果内存中没有，尝试从本地存储加载
      if (!saveData && window.electronAPI && window.electronAPI.storage) {
        saveData = await window.electronAPI.storage.get(`save_${slot}`);
      }
      
      if (!saveData) {
        console.error('找不到存档:', slot);
        return false;
      }
      // 本地播放不使用时间线/知识库，优先采用 GalGame 项目（project.json）驱动
      if (this.currentProject?.path) {
        const projectJson = `${this.currentProject.path}/project.json`;
        try {
          const exists = await (window.electronAPI.fsExists?.(projectJson) || window.electronAPI.fs?.exists(projectJson));
          if (exists) {
            const res = await this.loadGalGameProject(this.currentProject.path);
            if (res?.success) {
              await this.startChapter();
              this.gameState = 'playing';
              return;
            }
          }
        } catch {}
      }
      
  // 跳过知识库/时间线流程
        this.currentElementIndex = saveData.elementIndex || 0;
      // 不加载检查点；改为提示并等待后续指令
      
      console.log('游戏已从槽位加载:', slot);
      return true;
    } catch (error) {
      console.error('加载游戏失败:', error);
      return false;
    }
  }

  /**
   * 显示游戏完成
   */
  showGameComplete() {
    const dialogueText = document.getElementById('dialogue-text');
    const characterName = document.getElementById('character-name');
    
    if (characterName) characterName.textContent = '';
    if (dialogueText) {
      dialogueText.innerHTML = '<p style="text-align: center; font-size: 24px;">游戏完成！</p>';
    }
    
    setTimeout(() => {
      this.exitGame();
    }, 3000);
  }

  /**
   * 销毁游戏引擎
   */
  destroy() {
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler, true);
    }
    
    this.exitGame();
  }
}

// 创建全局游戏引擎实例
window.gameEngine = new GameEngine();
