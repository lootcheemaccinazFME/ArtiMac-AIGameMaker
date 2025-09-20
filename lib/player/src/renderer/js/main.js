/**
 * 游戏主界面逻辑 - ArtiMeow AI GalGame Maker Player
 */

try { window.electronAPI?.playerLog?.('info', 'Renderer script loaded'); } catch {}

class GameApp {
  constructor() {
    this.currentScreen = 'main';
    this.gameConfig = null;
    this.currentProject = null;
    this.debugMode = false;
    this.debugPanel = null;
    // 先尽早绑定标题栏控制（委托式），确保在任何覆盖层出现时仍能响应窗口控制
    try { this.setupTitleBarEventsEarly(); } catch (e) { console.warn('早期绑定标题栏事件失败:', e); }
    this.init();
  }

  /**
   * 早期委托绑定标题栏按钮（保证尽早响应）
   */
  setupTitleBarEventsEarly() {
    if (this._titlebarDelegatedBound) return;
    this._titlebarDelegatedBound = true;
    // 使用 document 级别的委托以便在控件尚未渲染或被覆盖层影响时仍能捕获点击
    document.addEventListener('click', (e) => {
      const target = e.target;
      const btn = target.closest && target.closest('#minimize-btn, #maximize-btn, #close-btn');
      if (!btn) return;
      try {
        if (btn.id === 'minimize-btn') {
          window.electronAPI?.window?.minimize();
        } else if (btn.id === 'maximize-btn') {
          window.electronAPI?.window?.maximize();
        } else if (btn.id === 'close-btn') {
          window.electronAPI?.window?.close();
        }
      } catch (err) {
        console.warn('早期标题栏事件处理失败:', err);
      }
    }, true); // useCapture=true 优先捕获
  }

  async init() {
    console.log('ArtiMeow AI GalGame Maker Player initializing...');
    try { await window.electronAPI?.playerLog?.('info', 'Renderer init start'); } catch {}
    
    // 等待所有服务初始化
    await this.waitForServices();
    try { await window.electronAPI?.playerLog?.('debug', 'waitForServices done'); } catch {}
    
    // 检查是否为调试模式
    await this.checkDebugMode();
  try { await window.electronAPI?.playerLog?.('debug', 'checkDebugMode done'); } catch {}
    
    // 加载游戏配置
    await this.loadGameConfig();
  try { await window.electronAPI?.playerLog?.('debug', 'loadGameConfig done'); } catch {}
    
    // 加载并应用设置
    await this.loadAndApplySettings();
    
    // 设置事件监听器
    this.setupEventListeners();
    
    // 初始化调试功能
    this.initDebugFeatures();

  // 根据 distinfo 设置尝试加载自定义 About 页面
  try { await this.applyPublishSettingsAndAbout(); } catch (e) { console.warn('发布设置应用失败:', e?.message||e) }

    console.log('ArtiMeow AI GalGame Maker Player initialized successfully');
    try { await window.electronAPI?.playerLog?.('info', 'Renderer init finished'); } catch {}
  }

  async applyPublishSettingsAndAbout() {
    try {
      try { await window.electronAPI?.playerLog?.('info', 'applyPublishSettingsAndAbout: start'); } catch {}
      console.log('[Player][About] applyPublishSettingsAndAbout: start');
  // 依据当前页面路径定位到 src/renderer/custom
      const url = new URL(window.location.href);
      let filePath = url.pathname; // /C:/.../src/renderer/index.html (Windows)
      try { filePath = decodeURIComponent(filePath) } catch {}
      // 去掉末尾 index.html，得到 renderer 目录
      const baseDir = filePath.replace(/\\/g,'/').replace(/\/index\.html$/,'');
      try { await window.electronAPI?.playerLog?.('debug', { baseDir }); } catch {}

      const normalizeFsPath = (p) => {
        let s = (p||'').replace(/\\/g,'/');
        // /C:/path -> C:/path
        if (/^\/[A-Za-z]:\//.test(s)) s = s.slice(1);
        return s;
      }
      const toFileUrl = (p) => {
        const s = normalizeFsPath(p);
        return 'file:///' + s;
      }
    // 新路径：优先从 distinfo/files 读取设置与文件
  let settingsPath = normalizeFsPath(`${baseDir}/distinfo/settings.json`);
      let aboutMode = 'builtin';
      try {
        const hasSettings = await (window.electronAPI.fsExists?.(settingsPath) || window.electronAPI.fs?.exists?.(settingsPath));
        try { await window.electronAPI?.playerLog?.('debug', { settingsPath, hasSettings }); } catch {}
        if (hasSettings) {
          const json = await (window.electronAPI.fsReadJson?.(settingsPath) || window.electronAPI.fs?.readJson?.(settingsPath));
          try { await window.electronAPI?.playerLog?.('debug', { settingsJson: json }); } catch {}
          if (json && typeof json.aboutMode === 'string') aboutMode = json.aboutMode;
        }
      } catch {}

      // 补充：若未找到，尝试 game-data/distinfo（GalGame 打包器布局）
      let filesDir = normalizeFsPath(`${baseDir}/distinfo/files`);
      const fallbackSettings = normalizeFsPath(`${baseDir}/../game-data/distinfo/settings.json`);
      const fallbackFiles = normalizeFsPath(`${baseDir}/../game-data/distinfo/files`);
      try {
        const hasPrimary = await (window.electronAPI.fsExists?.(settingsPath) || window.electronAPI.fs?.exists?.(settingsPath));
        const hasFallback = await (window.electronAPI.fsExists?.(fallbackSettings) || window.electronAPI.fs?.exists?.(fallbackSettings));
        if (!hasPrimary && hasFallback) {
          settingsPath = fallbackSettings;
          filesDir = fallbackFiles;
          // 重新读取 fallback 的 settings.json 以刷新 aboutMode
          try {
            const json = await (window.electronAPI.fsReadJson?.(settingsPath) || window.electronAPI.fs?.readJson?.(settingsPath));
            if (json && typeof json.aboutMode === 'string') aboutMode = json.aboutMode;
          } catch {}
          try { await window.electronAPI?.playerLog?.('debug', { switchedToFallbackDistinfo: true, settingsPath, filesDir, aboutMode }); } catch {}
        }
      } catch {}

      // 再补充一次：如果仍未命中，并且有当前项目路径（调试/预览模式），从项目根查找 distinfo
      try {
        const hasAfterFallback = await (window.electronAPI.fsExists?.(settingsPath) || window.electronAPI.fs?.exists?.(settingsPath));
        if (!hasAfterFallback) {
          const projectRoot = this?.currentProject?.projectPath || this?.currentProject?.projectDir || this?.currentProject?.path || null;
          if (projectRoot) {
            const pr = normalizeFsPath(projectRoot);
            const prSettings = normalizeFsPath(`${pr}/distinfo/settings.json`);
            const prFiles = normalizeFsPath(`${pr}/distinfo/files`);
            const hasPr = await (window.electronAPI.fsExists?.(prSettings) || window.electronAPI.fs?.exists?.(prSettings));
            try { await window.electronAPI?.playerLog?.('debug', { projectRoot: pr, prSettings, hasPr }); } catch {}
            if (hasPr) {
              settingsPath = prSettings; filesDir = prFiles;
              // 重新读取项目 settings.json 刷新 aboutMode
              try {
                const json = await (window.electronAPI.fsReadJson?.(settingsPath) || window.electronAPI.fs?.readJson?.(settingsPath));
                if (json && typeof json.aboutMode === 'string') aboutMode = json.aboutMode;
              } catch {}
              try { await window.electronAPI?.playerLog?.('debug', { switchedToProjectDistinfo: true, settingsPath, filesDir, aboutMode }); } catch {}
            }
          } else {
            try { await window.electronAPI?.playerLog?.('debug', 'No currentProject; skip projectRoot distinfo'); } catch {}
          }
        }
      } catch {}
      const customDir = normalizeFsPath(`${baseDir}/custom`); // 兼容旧版路径
      const aboutHtmlDist = normalizeFsPath(`${filesDir}/about.html`);
      const aboutCssDist = normalizeFsPath(`${filesDir}/about.css`);
      const licenseDist = normalizeFsPath(`${filesDir}/LICENSE`);
      const aboutHtmlCompat = normalizeFsPath(`${customDir}/about.html`);
      const aboutCssCompat = normalizeFsPath(`${customDir}/about.css`);
      const licenseCompat = normalizeFsPath(`${customDir}/LICENSE`);

      const choose = async (p1, p2) => {
        const exists = async (p)=> (await (window.electronAPI.fsExists?.(p) || window.electronAPI.fs?.exists?.(p)))
        if (await exists(p1)) return p1
        if (await exists(p2)) return p2
        return null
      }

      if (aboutMode !== 'custom') {
        try { await window.electronAPI?.playerLog?.('info', `aboutMode=${aboutMode}, skip custom about`); } catch {}
        // 内置模式：不注入自定义 about
        return;
      }

  const aboutHtml = await choose(aboutHtmlDist, aboutHtmlCompat);
  try { await window.electronAPI?.playerLog?.('debug', { aboutHtml }); } catch {}
  console.log('[Player][About] aboutHtml:', aboutHtml);
      if (!aboutHtml) return;
      const aboutCss = await choose(aboutCssDist, aboutCssCompat);
  try { await window.electronAPI?.playerLog?.('debug', { aboutCss }); } catch {}
  console.log('[Player][About] aboutCss:', aboutCss);
      const licensePath = await choose(licenseDist, licenseCompat);
  try { await window.electronAPI?.playerLog?.('debug', { licensePath }); } catch {}
  console.log('[Player][About] licensePath:', licensePath);

      // 动态插入 CSS（如果存在）
      if (aboutCss) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = toFileUrl(aboutCss);
        document.head.appendChild(link);
      }

      // 替换 About 模态内容为 iframe 加载自定义 about.html
      const modal = document.getElementById('about-modal');
  if (!modal) { try { await window.electronAPI?.playerLog?.('warn', 'about-modal not found'); } catch {} ; console.warn('[Player][About] about-modal not found'); return; }
  const body = modal.querySelector('.modal-body');
  if (!body) { try { await window.electronAPI?.playerLog?.('warn', 'about-modal body not found'); } catch {}; console.warn('[Player][About] about-modal body not found'); return; }
      body.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.style.width = '100%';
    iframe.style.height = '60vh';
      iframe.style.border = '1px solid rgba(255,255,255,0.15)';
    iframe.src = toFileUrl(aboutHtml);
  body.appendChild(iframe);
  try { await window.electronAPI?.playerLog?.('info', 'Custom about injected via iframe'); } catch {}
  console.log('[Player][About] Custom about injected via iframe');

      // 如果存在 LICENSE，将其内容追加到模态底部
      if (licensePath) {
        const text = await (window.electronAPI.fsReadFile?.(licensePath, 'utf8') || window.electronAPI.fs?.readFile?.(licensePath, 'utf8'));
        const wrap = document.createElement('div');
        wrap.style.marginTop = '12px';
        wrap.innerHTML = '<h4>许可证</h4>';
        const pre = document.createElement('pre');
        pre.textContent = text || '';
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.maxHeight = '25vh';
        pre.style.overflow = 'auto';
        pre.style.background = 'rgba(255,255,255,0.04)';
        pre.style.padding = '8px';
        pre.style.borderRadius = '8px';
        wrap.appendChild(pre);
        body.appendChild(wrap);
        try { await window.electronAPI?.playerLog?.('info', 'License appended in about'); } catch {}
        console.log('[Player][About] License appended in about');
      }
    } catch (e) {
      console.warn('加载自定义 About 失败:', e?.message||e);
      try { await window.electronAPI?.playerLog?.('error', `applyPublishSettingsAndAbout error: ${e?.message||e}`); } catch {}
      console.warn('[Player][About] applyPublishSettingsAndAbout error:', e?.message || e);
    }
  }

  /**
   * 检查是否为调试模式
   */
  async checkDebugMode() {
    try {
      if (window.electronAPI && window.electronAPI.playerGetDebugProject) {
        const debugProject = await window.electronAPI.playerGetDebugProject();
        if (debugProject) {
          this.debugMode = true;
          console.log('Debug mode activated:', debugProject);
          await this.loadDebugProject(debugProject);
        }
      }
    } catch (error) {
      console.log('Not in debug mode:', error);
    }
  }

  /**
   * 加载游戏配置
   */
  async loadGameConfig() {
    try {
      // 首先尝试自动加载内嵌项目（打包后的独立应用）
      await this.tryLoadEmbeddedProject();
      
      this.gameConfig = {
        projectId: 'current',
        version: '1.0.0',
        name: 'ArtiMeow AI GalGame Maker'
      };
      
      console.log('Game config loaded:', this.gameConfig);
    } catch (error) {
      console.error('Failed to load game config:', error);
    }
  }

  /**
   * 尝试加载内嵌项目（打包后的独立应用）
   */
  async tryLoadEmbeddedProject() {
    try {
      await window.electronAPI?.playerLog?.('info', 'tryLoadEmbeddedProject start');
      // 在打包后的应用中，项目文件位于应用根目录（与 app.asar 同级）
      let appPath = null;
      try { appPath = await window.electronAPI.appGetPath?.('exe'); } catch {}
      // 退化方案：使用 getAppPath（player preload 提供）
      if (!appPath && window.electronAPI?.getAppPath) {
        try { appPath = await window.electronAPI.getAppPath(); } catch {}
      }
      try { await window.electronAPI?.playerLog?.('debug', 'Resolved appPath', { appPath }); } catch {}
      // 推断根目录：exe 的目录 或 appPath 本身
      let rootDir = '.';
      if (typeof appPath === 'string' && appPath) {
        const idx = appPath.lastIndexOf('\\');
        const idx2 = appPath.lastIndexOf('/');
        const cut = Math.max(idx, idx2);
      let projectJsonPath = `${rootDir}/project.json`;
      }
      let projectJsonPath = `${rootDir}/project.json`;
      try { await window.electronAPI?.playerLog?.('debug', 'Probing project.json', { rootDir, projectJsonPath }); } catch {}
      
      // 检查是否存在项目文件
      let projectExists = false;
      if (window.electronAPI?.fsExists) {
        projectExists = await window.electronAPI.fsExists(projectJsonPath);
      } else if (window.electronAPI?.fs?.exists) {
        projectExists = await window.electronAPI.fs.exists(projectJsonPath);
      }
      try { await window.electronAPI?.playerLog?.('info', `Embedded project exists=${projectExists}`, { projectJsonPath }); } catch {}
      
      // 若 exe 根目录未找到，再尝试 app.asar 内部
      if (!projectExists && window.electronAPI?.getAppPath) {
        try {
          const appAsarPath = await window.electronAPI.getAppPath();
          if (typeof appAsarPath === 'string' && appAsarPath) {
            const asarProjectPath = `${appAsarPath.replace(/\\/g,'/')}/project.json`;
            await window.electronAPI?.playerLog?.('debug', 'Probing asar project.json', { appAsarPath, asarProjectPath });
            const existsInAsar = await window.electronAPI.fsExists(asarProjectPath);
            await window.electronAPI?.playerLog?.('info', `Asar embedded project exists=${existsInAsar}`, { asarProjectPath });
            if (existsInAsar) {
              projectExists = true;
              projectJsonPath = asarProjectPath;
              rootDir = appAsarPath;
            }
          }
        } catch (e) {
          await window.electronAPI?.playerLog?.('warn', 'Asar probe failed', { error: e?.message });
        }
      }

      if (projectExists) {
        console.log('Found embedded project, loading automatically...');
        try { await window.electronAPI?.playerLog?.('info', 'Embedded project found; loading...'); } catch {}
        // 加载项目数据
        let projectData = null;
        if (window.electronAPI?.fsReadJson) {
          projectData = await window.electronAPI.fsReadJson(projectJsonPath);
        } else if (window.electronAPI?.fs?.readJson) {
          projectData = await window.electronAPI.fs.readJson(projectJsonPath);
        }
        try { await window.electronAPI?.playerLog?.('debug', 'project.json loaded', { hasData: !!projectData, keys: projectData ? Object.keys(projectData) : [] }); } catch {}
        
        if (projectData) {
          this.currentProject = {
            ...projectData,
            path: rootDir,
            projectPath: rootDir,
            isEmbedded: true
          };
          try { await window.electronAPI?.playerLog?.('debug', 'currentProject set', { name: this.currentProject.name, path: this.currentProject.path }); } catch {}
          
          // 更新游戏配置
          if (projectData.name) {
            this.gameConfig = {
              projectId: projectData.id || 'embedded',
              version: projectData.version || '1.0.0',
              name: projectData.name
            };
            try { await window.electronAPI?.playerLog?.('debug', 'gameConfig updated from embedded project', this.gameConfig); } catch {}
          }
          
          // 更新UI显示项目信息
          this.updateProjectInfo();
          console.log('Embedded project loaded:', projectData.name);
          try { await window.electronAPI?.playerLog?.('info', 'Embedded project loaded'); } catch {}

          // 仅在调试模式下自动开始嵌入项目（便于开发预览）。打包/发布时不要自动加载资源。
          if (this.debugMode) {
            try {
              if (window.gameEngine && typeof window.gameEngine.loadGalGameProject === 'function') {
                try { await window.electronAPI?.playerLog?.('info', 'Auto starting embedded GalGame (debugMode)...'); } catch {}
                // 让引擎也持有当前项目上下文
                const projectRoot = rootDir;
                try { window.gameEngine.currentProject = { ...(this.currentProject || {}), path: projectRoot }; } catch {}
                this.showGameScreen();
                const res = await window.gameEngine.loadGalGameProject(projectRoot);
                if (!(res?.success)) {
                  throw new Error(res?.error || '无法加载内嵌项目');
                }
              }
            } catch (e) {
              console.warn('自动启动游戏失败（调试模式）：', e?.message || e);
              try { await window.electronAPI?.playerLog?.('error', 'Auto start failed (debugMode)', { error: e?.message || String(e) }); } catch {}
            }
          } else {
            try { await window.electronAPI?.playerLog?.('info', 'Embedded project detected; skipping auto-load in production'); } catch {}
            console.log('Embedded project detected; skipping auto-load in production.');
            // 不调用 loadGalGameProject，等待用户点击“开始游戏”来加载资源
          }
        }
      }
    } catch (error) {
      console.log('No embedded project found or failed to load:', error.message);
      try { await window.electronAPI?.playerLog?.('warn', 'No embedded project or load failed', { error: error?.message }); } catch {}
    }
  }

  /**
   * 等待所有服务初始化
   */
  async waitForServices() {
    let attempts = 0;
    while (!window.gameEngine && attempts < 50) {
      await this.sleep(100);
      attempts++;
    }

    if (!window.gameEngine) {
      console.warn('Game engine not available after waiting');
    }

    console.log('Services initialized');
  }

  /**
   * 睡眠函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 标题栏按钮事件
    this.setupTitleBarEvents();
    
    // 游戏控制按钮
    this.setupGameControlEvents();
    
    // 键盘和模态框事件
    this.setupKeyboardAndModalEvents();
    
    // 调试相关事件监听
    this.setupDebugEventListeners();

    // 监听主进程菜单“关于”动作（如果有绑定）
    try {
      if (window.electronAPI?.onMenuAction) {
        window.electronAPI.onMenuAction((evt) => {
          // 简易处理：显示关于模态框
          const modal = document.getElementById('about-modal');
          if (modal) modal.classList.add('active');
        });
      }
    } catch {}
  }

  // 供 HTML 按钮调用
  closeAboutModal() {
    const modal = document.getElementById('about-modal');
    if (modal) modal.classList.remove('active');
  }

  /**
   * 设置标题栏事件
   */
  setupTitleBarEvents() {
    const minimizeBtn = document.getElementById('minimize-btn');
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        window.electronAPI?.window?.minimize();
      });
    }

    const maximizeBtn = document.getElementById('maximize-btn');
    if (maximizeBtn) {
      maximizeBtn.addEventListener('click', () => {
        window.electronAPI?.window?.maximize();
      });
    }

    const closeBtn = document.getElementById('close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        window.electronAPI?.window?.close();
      });
    }
  }

  /**
   * 设置游戏控制事件
   */
  setupGameControlEvents() {
    // 开始游戏按钮
    const startGameBtn = document.getElementById('start-game-btn');
    if (startGameBtn) {
      startGameBtn.addEventListener('click', async () => {
        await this.startGame();
      });
    }

    // 读取存档按钮
    const loadGameBtn = document.getElementById('load-game-btn');
    if (loadGameBtn) {
      loadGameBtn.addEventListener('click', () => {
        this.loadGame();
      });
    }

    // 游戏设置按钮
    const gameSettingsBtn = document.getElementById('game-settings-btn');
    if (gameSettingsBtn) {
      gameSettingsBtn.addEventListener('click', () => {
        if (window.electronAPI?.openSettings) {
          window.electronAPI.openSettings();
        }
      });
    }
  }

  /**
   * 设置键盘和模态框事件
   */
  setupKeyboardAndModalEvents() {
    // 键盘事件
    document.addEventListener('keydown', (e) => {
      this.handleKeyPress(e);
    });

    // 模态框外点击关闭
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.closeAllModals();
      }
    });
  }

  /**
   * 开始游戏
   */
  async startGame() {
    if (!window.gameEngine) {
      console.error('Game engine not initialized');
      return;
    }
    
    try {
      // 如果有当前项目，使用它；否则提示选择项目
      if (this.currentProject) {
        // currentProject 来自 IPC 或内嵌项目，包含 projectPath 指向项目根目录
        const projectRoot = this.currentProject.projectPath || this.currentProject.projectDir || this.currentProject.path || '.';
        
        console.log('Starting game with project:', projectRoot);
        
        if (this.currentProject.isEmbedded) {
          // 内嵌项目：直接使用游戏引擎的 GalGame 加载器
          this.showGameScreen();
          const result = await window.gameEngine.loadGalGameProject(projectRoot);
          if (result?.success) {
            await window.gameEngine.startChapter();
            console.log('Embedded game started successfully');
          } else {
            throw new Error(result?.error || '无法加载内嵌项目');
          }
        } else {
          // 调试模式项目：使用标准加载流程
          await window.gameEngine.loadProject(projectRoot);
          window.gameEngine.switchToGameScreen();
          await window.gameEngine.startGame();
        }
      } else {
        // 没有项目，尝试打开项目选择对话框
        if (window.electronAPI?.dialog?.showOpenDialog) {
          const projectPath = await window.electronAPI.dialog.showOpenDialog({
            title: '选择游戏项目',
            filters: [
              { name: 'ArtiMeow项目', extensions: ['agm'] },
              { name: '所有文件', extensions: ['*'] }
            ],
            properties: ['openFile']
          });
          
          if (projectPath && projectPath.length > 0) {
            await this.loadProject(projectPath[0]);
            await this.startGame(); // 递归调用，现在有项目了
          } else {
            console.log('用户取消了项目选择');
          }
        } else {
          // 如果没有对话框API，显示提示
          alert('没有找到可加载的游戏项目');
        }
      }
    } catch (error) {
      console.error('启动游戏失败:', error);
      alert('启动游戏失败: ' + error.message);
    }
  }

  /**
   * 加载项目
   */
  async loadProject(projectPath) {
    try {
      console.log('Loading project from:', projectPath);
      
      if (window.electronAPI && window.electronAPI.playerLoadProject) {
        this.currentProject = await window.electronAPI.playerLoadProject(projectPath);
      } else {
        // 备用方案：如果没有IPC，尝试直接读取
        this.currentProject = await this.loadProjectDirect(projectPath);
      }
      
      if (this.currentProject) {
        // 更新UI显示项目信息
        this.updateProjectInfo();
        console.log('Project loaded successfully:', this.currentProject.name);
      } else {
        throw new Error('项目加载失败');
      }
    } catch (error) {
      console.error('Failed to load project:', error);
      throw error;
    }
  }

  /**
   * 加载调试项目
   */
  async loadDebugProject(input) {
    try {
      if (!window.gameEngine) {
        console.error('Game engine not available');
        return;
      }

      // 解析传入参数：可能是对象（来自主进程）或字符串路径
      let projectRoot = null;
      if (typeof input === 'string') {
        projectRoot = input;
      } else if (input && typeof input === 'object') {
        this.currentProject = input; // 先缓存以便 UI 显示
        projectRoot = input.projectPath || input.projectDir || input.path || null;
      }

      if (!projectRoot) {
        throw new Error('无法确定调试项目路径');
      }

      console.log('Loading debug project from root:', projectRoot);

      // 切换到游戏界面
      this.showGameScreen();

      // 直接使用项目根目录（不要附加 /data）
      const result = await window.gameEngine.loadGalGameProject(projectRoot);
      if (result?.success) {
        this.currentProject = { ...(this.currentProject || {}), path: projectRoot };
        this.updateProjectInfo();
        // 加载成功后立即开始播放起始章节
        await window.gameEngine.startChapter();
        console.log('Debug project loaded successfully');
        this.sendDebugResponse('project-loaded', { success: true });
      } else {
        const err = result?.error || '未知错误';
        console.error('Failed to load debug project:', err);
        this.sendDebugResponse('project-loaded', { success: false, error: err });
      }
    } catch (error) {
      console.error('Failed to load debug project:', error);
      this.sendDebugResponse('project-loaded', { success: false, error: error.message });
    }
  }

  /**
   * 直接加载项目（备用方案）
   */
  async loadProjectDirect(projectPath) {
    // 这里应该实现直接文件读取逻辑
    // 暂时返回一个示例项目
    return {
      name: '示例项目',
      description: '这是一个示例项目',
      chapters: [{
        id: 'chapter1',
        title: '第一章',
        scenes: [{
          id: 'scene1',
          elements: [
            { type: 'text', content: '欢迎来到ArtiMeow GalGame!' }
          ]
        }]
      }],
      characters: {},
      assets: {}
    };
  }

  /**
   * 更新项目信息显示
   */
  updateProjectInfo() {
    if (!this.currentProject) return;
    
    const projectName = document.getElementById('project-name');
    const projectDescription = document.getElementById('project-description');
    const titlebar = document.getElementById('game-title');
    const madeWith = document.getElementById('made-with');
    
    if (projectName) {
      projectName.textContent = this.currentProject.name || '未知项目';
    }
    
    if (projectDescription) {
      projectDescription.textContent = this.currentProject.description || '暂无描述';
    }

    const nameText = this.currentProject.name || 'ArtiMeow GalGame Player';
    document.title = nameText;
    if (titlebar) titlebar.textContent = nameText;
    if (window.electronAPI?.window?.setTitle) {
      try { window.electronAPI.window.setTitle(nameText); } catch {}
    }
    if (madeWith) {
      madeWith.textContent = 'Made with ArtiMeow AI GalGame Maker';
    }
  }

  /**
   * 读取存档
   */
  loadGame() {
    console.log('Load game functionality not implemented yet');
  }

  /**
   * 处理键盘事件
   */
  handleKeyPress(e) {
    // ESC 键返回主菜单
    if (e.key === 'Escape') {
      if (window.gameEngine?.isGameActive()) {
        window.gameEngine.switchToMainScreen();
      }
    }
  }

  /**
   * 关闭所有模态框
   */
  closeAllModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
      modal.style.display = 'none';
    });
  }

  /**
   * 加载并应用设置
   */
  async loadAndApplySettings() {
    try {
      let settings = null;
      
      if (window.electronAPI?.getSettings) {
        settings = await window.electronAPI.getSettings();
      } else {
        const storedSettings = localStorage.getItem('artimeow-settings');
        if (storedSettings) {
          settings = JSON.parse(storedSettings);
        }
      }
      
      if (settings) {
        this.applySettingsToMainWindow(settings);
      }
    } catch (error) {
      console.warn('Failed to load settings, using defaults:', error);
    }
  }

  /**
   * 应用设置到主窗口
   */
  applySettingsToMainWindow(settings) {
    try {
      if (settings.theme) {
        if (settings.theme.mode) {
          this.applyThemeMode(settings.theme.mode);
        }
        if (settings.theme.color) {
          this.applyThemeColor(settings.theme.color);
        }
      }
      console.log('Settings applied');
    } catch (error) {
      console.error('Failed to apply settings:', error);
    }
  }

  /**
   * 应用主题模式
   */
  applyThemeMode(mode) {
    document.body.setAttribute('data-theme', mode);
  }

  /**
   * 应用主题颜色
   */
  applyThemeColor(color) {
    const root = document.documentElement;
    root.style.setProperty('--primary-color', color);
  }

  // 旧版 loadDebugProject(projectPath) 合并至上方方法

  /**
   * 初始化调试功能
   */
  initDebugFeatures() {
    // 仅在显式调试模式下启用调试面板
    if (this.debugMode) {
      this.debugPanel = new DebugPanel(this);
    }
    
    // 监听编辑器命令
    if (window.electronAPI?.onEditorCommand) {
      window.electronAPI.onEditorCommand((command, data) => {
        this.handleEditorCommand(command, data);
      });
    }
    
    // 监听调试命令
    if (window.electronAPI?.onDebugCommand) {
      window.electronAPI.onDebugCommand((command, data) => {
        this.handleDebugCommand(command, data);
      });
    }
  }
  
  /**
   * 创建调试切换按钮
   */
  createDebugToggleButton() {
    // 移除“bug”按钮，不再创建调试切换入口
    return;
  }
  
  /**
   * 切换调试面板
   */
  toggleDebugPanel() {
    const panel = document.getElementById('debug-panel');
    if (panel) {
      panel.classList.toggle('active');
      
      const btn = document.getElementById('debug-toggle-btn');
      if (btn) {
        btn.classList.toggle('active', panel.classList.contains('active'));
      }
    }
  }
  
  /**
   * 设置调试事件监听器
   */
  setupDebugEventListeners() {
    // 调试面板关闭按钮
    const debugClose = document.getElementById('debug-close');
    if (debugClose) {
      debugClose.addEventListener('click', () => {
        this.toggleDebugPanel();
      });
    }
    
    // 调试选项卡切换
    const debugTabs = document.querySelectorAll('.debug-tab');
    debugTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchDebugTab(tab.dataset.tab);
      });
    });
  }
  
  /**
   * 切换调试选项卡
   */
  switchDebugTab(tabName) {
    // 切换选项卡激活状态
    document.querySelectorAll('.debug-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    // 切换内容面板
    document.querySelectorAll('.debug-tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `debug-${tabName}`);
    });
  }
  
  /**
   * 处理编辑器命令
   */
  handleEditorCommand(command, data) {
    console.log('Received editor command:', command, data);
    
    switch (command) {
      case 'load-project':
        this.loadDebugProject(data.projectPath || data);
        break;
      case 'jump-to-chapter':
        if (window.gameEngine) {
          window.gameEngine.jumpToChapter(data.chapterId);
        }
        break;
      case 'set-variable':
        if (window.gameEngine) {
          window.gameEngine.setVariable(data.name, data.value);
          this.debugPanel?.updateVariablesList();
        }
        break;
    }
  }
  
  /**
   * 处理调试命令
   */
  handleDebugCommand(command, data) {
    console.log('Received debug command:', command, data);
    
    switch (command) {
      case 'get-game-state':
        this.sendDebugResponse('game-state', this.getGameStateForDebug());
        break;
      case 'set-debug-mode':
        this.setDebugMode(data.enabled);
        break;
    }
  }
  
  /**
   * 设置调试模式
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    
    // 显示或隐藏调试按钮
    const debugBtn = document.getElementById('debug-toggle-btn');
    if (debugBtn) {
      debugBtn.style.display = enabled ? 'flex' : 'none';
    }
    
    // 更新编辑器连接状态
    if (this.debugPanel) {
      this.debugPanel.updateEditorConnectionStatus(enabled);
    }
  }
  
  /**
   * 获取游戏状态用于调试
   */
  getGameStateForDebug() {
    if (!window.gameEngine) {
      return { variables: {}, currentChapter: null };
    }
    return {
      variables: { ...(window.gameEngine.gameVariables || {}) },
      currentChapter: window.gameEngine.currentChapter
    };
  }
  
  /**
   * 发送调试响应
   */
  sendDebugResponse(event, data) {
    if (window.electronAPI?.playerToEditor) {
      window.electronAPI.playerToEditor(event, data);
    }
  }
  
  /**
   * 显示游戏界面
   */
  showGameScreen() {
    document.getElementById('main-screen')?.classList.remove('active');
    document.getElementById('game-screen')?.classList.add('active');
    this.currentScreen = 'game';
  }
}

/**
 * 调试面板类
 */
class DebugPanel {
  constructor(app) {
    this.app = app;
    this.init();
  }
  
  init() {
    this.setupVariableControls();
    this.setupChapterControls();
    this.setupEditorControls();
  }
  
  setupVariableControls() {
    const addBtn = document.getElementById('add-variable-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const nameInput = document.getElementById('var-name-input');
        const valueInput = document.getElementById('var-value-input');
        
        if (nameInput?.value.trim() && valueInput?.value.trim()) {
          this.addOrUpdateVariable(nameInput.value.trim(), valueInput.value.trim());
          nameInput.value = '';
          valueInput.value = '';
        }
      });
    }
    
    const clearBtn = document.getElementById('clear-variables-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearAllVariables();
      });
    }
    
    this.updateVariablesList();
  }
  
  setupChapterControls() {
    const jumpBtn = document.getElementById('jump-chapter-btn');
    if (jumpBtn) {
      jumpBtn.addEventListener('click', () => {
        const chapterInput = document.getElementById('chapter-id-input');
        if (chapterInput?.value.trim()) {
          this.jumpToChapter(chapterInput.value.trim());
          chapterInput.value = '';
        }
      });
    }
    
    const reloadBtn = document.getElementById('reload-project-btn');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', () => {
        this.reloadProject();
      });
    }
    
    this.updateChaptersList();
  }
  
  setupEditorControls() {
    const syncBtn = document.getElementById('sync-to-editor-btn');
    if (syncBtn) {
      syncBtn.addEventListener('click', () => {
        this.syncStateToEditor();
      });
    }
    
    const requestBtn = document.getElementById('request-chapter-btn');
    if (requestBtn) {
      requestBtn.addEventListener('click', () => {
        this.requestChapterData();
      });
    }
    
    const clearLogBtn = document.getElementById('clear-log-btn');
    if (clearLogBtn) {
      clearLogBtn.addEventListener('click', () => {
        this.clearDebugLog();
      });
    }
  }
  
  addOrUpdateVariable(name, value) {
    if (window.gameEngine) {
      let parsedValue = value;
      if (!isNaN(value)) {
        parsedValue = Number(value);
      } else if (value === 'true' || value === 'false') {
        parsedValue = value === 'true';
      }
      
      window.gameEngine.setVariable(name, parsedValue);
      this.updateVariablesList();
      this.addDebugLog(`设置变量 ${name} = ${parsedValue}`, 'success');
    }
  }
  
  clearAllVariables() {
    if (window.gameEngine) {
      window.gameEngine.gameVariables = {};
      this.updateVariablesList();
      this.addDebugLog('已清空所有变量', 'warning');
    }
  }
  
  updateVariablesList() {
    const container = document.getElementById('variables-list');
    if (!container) return;
    
    if (!window.gameEngine) {
      container.innerHTML = '<p class="no-variables">游戏引擎未初始化</p>';
      return;
    }
    
    const variables = window.gameEngine.gameVariables || {};
    if (Object.keys(variables).length === 0) {
      container.innerHTML = '<p class="no-variables">暂无变量</p>';
      return;
    }
    
    container.innerHTML = '';
    Object.entries(variables).forEach(([name, value]) => {
      const item = document.createElement('div');
      item.className = 'variable-item';
      item.innerHTML = `
        <span class="variable-name">${name}</span>
        <span class="variable-value">${JSON.stringify(value)}</span>
      `;
      container.appendChild(item);
    });
  }
  
  jumpToChapter(chapterId) {
    if (window.gameEngine) {
      window.gameEngine.jumpToChapter(chapterId);
      this.updateCurrentChapter();
      this.addDebugLog(`跳转到章节: ${chapterId}`, 'success');
    }
  }
  
  reloadProject() {
    if (window.gameEngine && this.app.currentProject) {
      window.gameEngine.loadGalGameProject(this.app.currentProject.path);
      this.addDebugLog('重载项目', 'success');
    }
  }
  
  async updateChaptersList() {
    const container = document.getElementById('chapters-list');
    if (!container) return;
    
    if (!window.gameEngine?.currentProject) {
      container.innerHTML = '<p class="no-chapters">项目未加载</p>';
      return;
    }
    // 优先使用 _chapterOrder
    let ids = Array.isArray(window.gameEngine.currentProject._chapterOrder)
      ? [...window.gameEngine.currentProject._chapterOrder]
      : [];
    // 回退：project.json 的 chapters 对象键
    if (ids.length === 0 && window.gameEngine.currentProject.chapters && typeof window.gameEngine.currentProject.chapters === 'object' && !Array.isArray(window.gameEngine.currentProject.chapters)) {
      ids = Object.keys(window.gameEngine.currentProject.chapters);
    }
    // 回退：从目录读取
    if (ids.length === 0) {
      try {
        const dir = `${window.gameEngine.currentProject.path}/chapters`;
        const items = await window.electronAPI.fsReaddir(dir);
        ids = (items || []).filter(n => !n.startsWith('.')).sort();
      } catch {}
    }
    if (!ids || ids.length === 0) {
      container.innerHTML = '<p class="no-chapters">暂无章节</p>';
      return;
    }
    container.innerHTML = '';
    for (const id of ids) {
      const item = document.createElement('div');
      item.className = 'chapter-item';
      const title = window.gameEngine.currentProject.chapters?.[id]?.title || id;
      item.innerHTML = `
        <span class="chapter-name">${title}</span>
        <span class="chapter-id">${id}</span>
      `;
      item.addEventListener('click', () => this.jumpToChapter(id));
      container.appendChild(item);
    }
  }
  
  updateCurrentChapter() {
    const element = document.getElementById('current-chapter-id');
    if (element && window.gameEngine) {
      element.textContent = window.gameEngine.currentChapter?.id || window.gameEngine.currentChapter || '未选择';
    }
  }
  
  syncStateToEditor() {
    const gameState = this.app.getGameStateForDebug();
    this.app.sendDebugResponse('sync-game-state', gameState);
    this.addDebugLog('已同步状态到编辑器', 'success');
  }
  
  requestChapterData() {
    this.app.sendDebugResponse('request-chapter-data', {});
    this.addDebugLog('已请求章节数据', 'success');
  }
  
  updateEditorConnectionStatus(connected) {
    const element = document.getElementById('editor-connection-status');
    if (element) {
      element.textContent = connected ? '已连接' : '未连接';
      element.className = connected ? 'status-connected' : 'status-disconnected';
    }
  }
  
  addDebugLog(message, type = 'info') {
    const container = document.getElementById('debug-log-content');
    if (!container) return;
    
    const item = document.createElement('p');
    item.className = `log-item ${type}`;
    const timestamp = new Date().toLocaleTimeString();
    item.textContent = `[${timestamp}] ${message}`;
    
    container.appendChild(item);
    container.scrollTop = container.scrollHeight;
  }
  
  clearDebugLog() {
    const container = document.getElementById('debug-log-content');
    if (container) {
      container.innerHTML = '<p class="log-item">调试面板已初始化</p>';
    }
  }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  window.app = new GameApp();
});
