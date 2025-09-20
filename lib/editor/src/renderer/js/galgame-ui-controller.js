/**
 * GalGame 前端界面控制器
 * 负责处理GalGame编辑器的所有前端交互
 */

class GalGameUIController {
    constructor() {
        this.currentScene = null; // 保留以兼容现有代码，但优先使用currentChapter
        this.currentChapter = null;
        // 缓存当前项目路径
        this.currentProjectPath = (window.app?.currentProject?.path) || (window.appManager?.currentProject?.path) || null;
        this.assetLibrary = new Map();
        this.characterLibrary = new Map();
        this.selectedElement = null;
        
        // 游戏预览相关
        this.previewScenes = [];
        this.currentSceneIndex = 0;
        this.currentElementIndex = 0;
        this.isAutoPlay = false;
        this.autoPlayInterval = null;
        
        // 自动保存相关
        this.autoSaveTimer = null;
        this.isDirty = false; // 标记是否有未保存的更改
        
        // 使用模块化组件
        this.chapterStateManager = window.chapterStateManager;
        this.timelineRenderer = window.timelineElementRenderer;
        
        this.init();
    }

    /**
     * 初始化GalGame界面控制器
     */
    init() {
        // 使用项目路径管理器
        if (window.projectPathManager) {
            this.currentProjectPath = window.projectPathManager.getCurrentProjectPath();
        }
        
        // 资源库由 AssetLibraryManager 自行按需延迟加载
        this.loadCharacterLibrary();
        this.initEventListeners();
        this.initDragAndDrop();
        // 初始刷新一次场景属性下拉框
        this.refreshBackgroundAndMusicSelects?.();
        console.log('GalGame界面控制器初始化完成');
    }    /**
     * 获取当前项目路径 - 统一的获取方法
     */
    // 重复的getCurrentProjectPath函数已删除，使用下面详细版本

    /**
     * 获取当前项目路径
     * @returns {string|null} 当前项目路径
     */
    getCurrentProjectPath() {
        // 优先使用项目路径管理器
        if (window.projectPathManager) {
            const path = window.projectPathManager.getCurrentProjectPath();
            if (path) {
                this.currentProjectPath = path;
                return path;
            }
        }
        
        console.log('[DEBUG] 开始获取项目路径...');
        
        // 优先使用缓存的路径
        if (this.currentProjectPath) {
            console.log('[DEBUG] 使用缓存路径:', this.currentProjectPath);
            return this.currentProjectPath;
        }
        
        console.log('[DEBUG] 缓存路径为空，尝试其他方式获取...');

        // 从全局app实例获取
        if (window.app && window.app.getCurrentProjectPath) {
            const path = window.app.getCurrentProjectPath();
            console.log('[DEBUG] 从window.app获取路径:', path);
            if (path) {
                this.currentProjectPath = path;
                return path;
            }
        } else {
            console.log('[DEBUG] window.app或getCurrentProjectPath方法不存在');
        }

        // 从appManager获取
        if (window.appManager && window.appManager.currentProject && window.appManager.currentProject.path) {
            this.currentProjectPath = window.appManager.currentProject.path;
            console.log('[DEBUG] 从window.appManager获取路径:', this.currentProjectPath);
            return this.currentProjectPath;
        } else {
            console.log('[DEBUG] window.appManager路径获取失败');
        }

        // 从其他可能的全局对象获取
        if (window.projectManager && window.projectManager.currentProject && window.projectManager.currentProject.path) {
            this.currentProjectPath = window.projectManager.currentProject.path;
            console.log('[DEBUG] 从window.projectManager获取路径:', this.currentProjectPath);
            return this.currentProjectPath;
        } else {
            console.log('[DEBUG] window.projectManager路径获取失败');
        }

        console.log('[DEBUG] 所有路径获取方式都失败，返回null');
        console.log('[DEBUG] 当前可用的全局对象:', {
            'window.app': !!window.app,
            'window.appManager': !!window.appManager,
            'window.projectManager': !!window.projectManager
        });
        
        return null;
    }

    /**
     * 更新当前项目路径
     * @param {string} path 项目路径
     */
    setCurrentProjectPath(path) {
        this.currentProjectPath = path;
    }

    /**
     * 检查是否有当前项目
     */
    ensureCurrentProject() {
        const projectPath = this.getCurrentProjectPath();
        if (!projectPath) {
            throw new Error('没有打开的项目');
        }
        return projectPath;
    }

    /**
     * 是否有已打开的项目（统一判定，供入口调用）
     */
    hasOpenProject() {
        try { return !!this.getCurrentProjectPath(); } catch { return false; }
    }

    /**
     * 初始化拖拽功能
     */
    initDragAndDrop() {
        // 基础拖拽功能实现
        const sceneTimeline = document.getElementById('scene-timeline');
        if (sceneTimeline) {
            sceneTimeline.addEventListener('dragover', (e) => {
                e.preventDefault();
            });
            
            sceneTimeline.addEventListener('drop', (e) => {
                e.preventDefault();
                const assetData = e.dataTransfer.getData('text/plain');
                if (assetData) {
                    try {
                        this.handleAssetDrop(JSON.parse(assetData));
                    } catch (error) {
                        console.error('处理拖拽资源失败:', error);
                    }
                }
            });
        }
    }

    /**
     * 处理资源拖拽
     */
    handleAssetDrop(assetData) {
        if (!assetData || !assetData.type) {
            return;
        }
        
        switch (assetData.type) {
            case 'image':
                this.addBackgroundElement(assetData.path);
                break;
            case 'audio':
                this.addMusicElement(assetData.path);
                break;
            default:
                console.log('未知的资源类型:', assetData.type);
        }
    }

    /**
     * 初始化事件监听器
     */
    initEventListeners() {
        // 工具栏按钮事件
        this.initToolbarEvents();
        
        // 场景编辑器事件
        this.initSceneEditorEvents();
        
        // 资源管理器事件  
        this.initAssetManagerEvents();
        
        // 角色管理器事件
        this.initCharacterPanelEvents();
        
        // AI助手事件
        this.initAIAssistantEvents();
        
        // 预览器事件
        this.initPreviewEvents();
        
        // 打包器事件
        this.initPackageEvents();
    }
    
    /**
     * 初始化工具栏事件
     */
    initToolbarEvents() {
        // 添加章节按钮
        const addChapterBtn = document.getElementById('add-chapter-btn');
        if (addChapterBtn) {
            // 为避免与 app.js 中的“新建章节”流程重复，这里不再绑定“创建新章节”模态
            // 统一保留 app.js 的 showInputModal("新建章节") 流程
        }
        
        // 添加背景按钮
        const setBackgroundBtn = document.getElementById('set-background-btn');
        if (setBackgroundBtn) {
            setBackgroundBtn.addEventListener('click', () => {
                this.addBackgroundElement();
            });
        }
        
        // 添加音乐按钮  
        const setMusicBtn = document.getElementById('set-music-btn');
        if (setMusicBtn) {
            setMusicBtn.addEventListener('click', () => {
                this.addMusicElement();
            });
        }
        
        // 导入背景按钮
        const importBackgroundBtn = document.getElementById('import-background-btn');
        if (importBackgroundBtn) {
            importBackgroundBtn.addEventListener('click', () => {
                this.importAsset('image');
            });
        }
        
        // 导入音乐按钮
        const importMusicBtn = document.getElementById('import-music-btn');
        if (importMusicBtn) {
            importMusicBtn.addEventListener('click', () => {
                this.importAsset('audio');
            });
        }
    }

    /**
     * 加载资源库
     */
    /**
     * 加载资源库 - 使用新的资源库管理器
     */
    async loadAssetLibrary() {
        try {
            if (this.assetLibraryManager) {
                // 使用新的资源库管理器
                await this.assetLibraryManager.loadAssetLibrary(this);
            } else {
                // 备用方案：使用原有逻辑
                await this.loadAssetLibraryLegacy();
            }
        } catch (error) {
            console.error('加载资源库失败:', error);
        }
    }

    /**
     * 备用的加载资源库方法
     */
    async loadAssetLibraryLegacy() {
        try {
            const projectPath = this.getCurrentProjectPath();
            if (!projectPath) {
                console.log('没有当前项目，跳过资源库加载');
                return;
            }

            // 清空现有资源库
            this.assetLibrary.clear();
            
            // 首先尝试从assets.json加载
            const assetsJsonPath = projectPath + '/assets.json';
            try {
                const assetsResult = await window.electronAPI.readFile(assetsJsonPath);
                if (!assetsResult.success) throw new Error(assetsResult.error || 'read assets.json failed');
                const parsed = JSON.parse(assetsResult.content);
                if (parsed && Array.isArray(parsed.assets)) {
                    // 新格式
                    parsed.assets.forEach(asset => {
                        const id = asset.id || `asset_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
                        this.assetLibrary.set(id, { id, ...asset });
                    });
                } else if (parsed && typeof parsed === 'object') {
                    // 旧格式：键值对
                    for (const [id, asset] of Object.entries(parsed)) {
                        const assetId = asset.id || id;
                        this.assetLibrary.set(assetId, { id: assetId, ...asset });
                    }
                }
                console.log(`从assets.json加载了${this.assetLibrary.size}个资源（兼容两种格式）`);
            } catch (error) {
                console.log('assets.json不存在，将扫描文件系统');
            }
            
            // 扫描资源文件系统以发现新资源
            const assetsPath = `${projectPath}/assets`;
            const assetFiles = await window.electronAPI.scanDirectory(assetsPath);
            
            // 加载每个资源文件的信息
            for (const filePath of assetFiles) {
                const stats = await window.electronAPI.getFileStats(filePath);
                const fileName = filePath.split('/').pop();
                const fileExtension = fileName.split('.').pop().toLowerCase();
                
                let assetType = 'file';
                if (
                    [
                        'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'tif', 'svg', 'ico', 'apng', 'avif', 'jfif', 'pjpeg', 'pjp', 'heic', 'heif'
                    ].includes(fileExtension)
                ) {
                    assetType = 'image';
                } else if (
                    [
                        'mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'alac', 'aiff', 'wma', 'opus', 'amr', 'mid', 'midi', 'au', 'ra'
                    ].includes(fileExtension)
                ) {
                    assetType = 'audio';
                } else if (
                    [
                        'mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v', '3gp', '3g2', 'mpeg', 'mpg', 'ts', 'mts', 'm2ts', 'vob', 'rm', 'rmvb'
                    ].includes(fileExtension)
                ) {
                    assetType = 'video';
                }
                // 去重：按 fullPath 或 path 判断
                let existingKey = null;
                for (const [id, a] of this.assetLibrary.entries()) {
                    const aFull = (a.fullPath || a.path || '').replace(/\\/g,'/');
                    const cur = filePath.replace(/\\/g,'/');
                    if (aFull && aFull === cur) { existingKey = id; break; }
                }
                const relativeFromAssets = filePath.includes('/assets/') ? filePath.substring(filePath.indexOf('/assets/') + 1) : filePath;
                const assetInfo = {
                    id: existingKey || `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: fileName,
                    path: relativeFromAssets,
                    fullPath: filePath,
                    type: assetType,
                    extension: fileExtension,
                    size: stats.size,
                    imported: null,
                    dateModified: stats.mtime,
                    category: this.getAssetCategory(assetType, fileName)
                };
                this.assetLibrary.set(assetInfo.id, assetInfo);
            }
            
            // 保存更新后的资源库到项目目录
            await this.saveAssetLibraryToProject();
            
            // 更新UI显示
            this.refreshAssetGrid();
            this.refreshBackgroundAndMusicSelects?.();
            console.log(`资源库加载完成，共${this.assetLibrary.size}个资源文件`);
            
        } catch (error) {
            console.error('加载资源库时发生错误:', error);
        }
    }

    /**
     * 加载角色库
     */
    async loadCharacterLibrary() {
        try {
            const projectPath = this.getCurrentProjectPath();
            if (!projectPath) {
                console.log('没有当前项目，跳过角色库加载');
                return;
            }

            // 清空现有角色库
            this.characterLibrary.clear();
            
            // 获取项目角色配置文件路径
            const charactersPath = projectPath + '/characters/characters.json';
            
            try {
                const charactersResult = await window.electronAPI.readFile(charactersPath);
                if (!charactersResult.success) throw new Error(charactersResult.error || 'read characters.json failed');
                const charactersData = JSON.parse(charactersResult.content);
                
                // 加载角色数据
                for (const [id, character] of Object.entries(charactersData)) {
                    this.characterLibrary.set(id, character);
                }
                
                console.log(`角色库加载完成，共${this.characterLibrary.size}个角色`);
                
            } catch (error) {
                console.log('角色配置文件不存在，创建默认配置');
                // 创建默认的角色配置文件
                await this.saveCharacterLibraryToProject();
            }
            
            const charactersFilePath = `${projectPath}/characters/characters.json`;
            
            // 尝试读取角色配置文件
            let charactersData = [];
            try {
                const fileResult = await window.electronAPI.readFile(charactersFilePath);
                if (!fileResult.success) throw new Error(fileResult.error || 'read characters.json failed');
                charactersData = JSON.parse(fileResult.content);
            } catch (fileError) {
                // 如果文件不存在，创建默认配置
                console.log('角色配置文件不存在，创建默认配置');
                charactersData = [];
                await window.electronAPI.writeFile(charactersFilePath, JSON.stringify(charactersData, null, 2));
            }
            
            // 加载角色数据到库中
            charactersData.forEach(character => {
                const characterId = character.id || `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                this.characterLibrary.set(characterId, {
                    id: characterId,
                    name: character.name || '未命名角色',
                    bio: character.bio || '',
                    avatar: character.avatar || '',
                    voice: character.voice || '',
                    personality: character.personality || [],
                    relationships: character.relationships || {},
                    customProps: character.customProps || {}
                });
            });
            
            // 更新UI显示
            this.refreshCharactersList();
            console.log(`角色库加载完成，共${this.characterLibrary.size}个角色`);
            // 广播角色变更事件，供下拉刷新
            document.dispatchEvent(new CustomEvent('characters-changed', { detail: { count: this.characterLibrary.size } }));
            
        } catch (error) {
            console.error('加载角色库时发生错误:', error);
        }
    }

    /**
     * 获取资源分类
     */
    getAssetCategory(assetType, fileName) {
        const name = fileName.toLowerCase();
        
        switch (assetType) {
            case 'image':
                if (name.includes('background') || name.includes('bg')) return 'background';
                if (name.includes('character') || name.includes('char')) return 'character';
                if (name.includes('ui') || name.includes('button')) return 'ui';
                return 'image';
            case 'audio':
                if (name.includes('bgm') || name.includes('music')) return 'bgm';
                if (name.includes('se') || name.includes('sound')) return 'sound';
                if (name.includes('voice')) return 'voice';
                return 'audio';
            case 'video':
                return 'video';
            default:
                return 'other';
        }
    }

    /**
     * 初始化场景编辑器事件
     */
    initSceneEditorEvents() {
        // 添加文本按钮
        const addTextBtn = document.getElementById('add-text-btn');
        if (addTextBtn) {
            addTextBtn.addEventListener('click', () => {
                this.addTextElement();
            });
        }

        // 添加选择按钮
        const addChoiceBtn = document.getElementById('add-choice-btn');
        if (addChoiceBtn) {
            addChoiceBtn.addEventListener('click', () => {
                this.addChoiceElement();
            });
        }

        // 设置背景按钮
        const setBackgroundBtn = document.getElementById('set-background-btn');
        if (setBackgroundBtn) {
            setBackgroundBtn.addEventListener('click', () => {
                this.showBackgroundSelector();
            });
        }

        // 场景属性下拉框联动（在后面统一绑定）

        // 设置音乐按钮
        const setMusicBtn = document.getElementById('set-music-btn');
        if (setMusicBtn) {
            setMusicBtn.addEventListener('click', () => {
                this.showMusicSelector();
            });
        }

        // 场景属性下拉框联动
        const bgSelect = document.getElementById('background-select');
        if (bgSelect) {
            bgSelect.addEventListener('change', (e) => {
                // 直接标记需要保存即可，避免递归触发
                this.isDirty = true;
                this.debounceAutoSave();
            });
        }
        const musicSelect = document.getElementById('music-select');
        if (musicSelect) {
            musicSelect.addEventListener('change', (e) => {
                this.isDirty = true;
                this.debounceAutoSave();
            });
        }
        // AI续写场景按钮
        const aiContinueBtn = document.getElementById('ai-continue-scene-btn');
        if (aiContinueBtn) {
            aiContinueBtn.addEventListener('click', () => {
                const aiTab = document.querySelector('[data-tab="ai"]');
                if (aiTab) aiTab.click();
                // 若 AI 助手内有续写子标签，尝试激活
                const continueSubTab = document.querySelector('[data-ai-subtab="continue"]');
                if (continueSubTab) continueSubTab.click();
            });
        }

        // AI生成图片按钮：改为直接生成并应用当前章节背景
        const aiGenerateImageBtn = document.getElementById('ai-generate-image-btn');
        if (aiGenerateImageBtn) {
            aiGenerateImageBtn.addEventListener('click', async () => {
                try {
                    const btn = aiGenerateImageBtn;
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...';
                    if (window.galGameAIAssistant?.generateBackgroundForCurrentChapter) {
                        await window.galGameAIAssistant.generateBackgroundForCurrentChapter();
                    }
                } catch (e) {
                    console.error('生成并应用背景失败:', e);
                } finally {
                    aiGenerateImageBtn.disabled = false;
                    aiGenerateImageBtn.innerHTML = '<i class="fas fa-image"></i> 生图并设为背景';
                }
            });
        }

        // 章节标题输入
        const chapterTitleInput = document.getElementById('chapter-title');
        if (chapterTitleInput) {
            chapterTitleInput.addEventListener('input', (e) => {
                this.updateChapterTitle(e.target.value);
            });
        }
    }

    /**
     * 切换AI模式
     */
    switchAIMode(mode) {
        console.log('切换AI模式:', mode);
        // 更新UI状态
        const modeButtons = document.querySelectorAll('.ai-mode-btn');
        modeButtons.forEach(btn => {
            if (btn.dataset.mode === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // 更新对应的面板显示
        this.currentAIMode = mode;
        this.updateAIModePanel(mode);
    }

    /**
     * 更新AI模式面板
     */
    updateAIModePanel(mode) {
        console.log('更新AI模式面板:', mode);
        
        // 获取AI内容区域
        const aiContentArea = document.querySelector('.ai-content-area');
        if (!aiContentArea) {
            console.warn('AI内容区域不存在');
            return;
        }

        // 清空现有内容
        aiContentArea.innerHTML = '';
        
        // 根据模式创建对应的面板
        let panelHTML = '';
        switch (mode) {
            case 'story':
                panelHTML = this.createStoryAIPanel();
                break;
            case 'character':
                panelHTML = this.createCharacterAIPanel();
                break;
            case 'dialogue':
                panelHTML = this.createDialogueAIPanel();
                break;
            case 'scene':
                panelHTML = this.createSceneAIPanel();
                break;
            default:
                panelHTML = this.createStoryAIPanel();
        }
        
        // 设置面板内容
        aiContentArea.innerHTML = panelHTML;
        
        // 绑定面板内的事件监听器
        this.bindAIPanelEvents(mode);
    }

    /**
     * 创建故事AI面板
     */
    createStoryAIPanel() {
        return `
            <div class="ai-panel story-panel">
                <div class="ai-panel-header">
                    <h3><i class="fas fa-book"></i> 故事创作助手</h3>
                </div>
                <div class="ai-panel-body">
                    <div class="input-group">
                        <label>故事情节描述:</label>
                        <textarea id="story-prompt" placeholder="描述你想要创作的故事情节，比如：主角在学校遇到了神秘的转学生..." rows="4"></textarea>
                    </div>
                    <div class="ai-options">
                        <label><input type="checkbox" id="keep-character-consistency"> 保持角色一致性</label>
                        <label><input type="checkbox" id="maintain-plot-continuity"> 维持情节连贯性</label>
                        <label><input type="checkbox" id="emotional-depth"> 增加情感深度</label>
                    </div>
                    <div class="ai-controls">
                        <button class="ai-generate-btn" data-type="story">
                            <i class="fas fa-magic"></i> 生成故事
                        </button>
                        <button class="ai-continue-btn" data-type="story">
                            <i class="fas fa-forward"></i> 续写当前场景
                        </button>
                    </div>
                </div>
                <div class="ai-result-area" style="display: none;">
                    <h4>AI生成结果:</h4>
                    <div class="ai-result-content"></div>
                    <div class="ai-result-actions">
                        <button class="accept-btn">采用</button>
                        <button class="regenerate-btn">重新生成</button>
                        <button class="edit-btn">编辑</button>
                        <button class="dismiss-btn">关闭</button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 创建角色AI面板
     */
    createCharacterAIPanel() {
        return `
            <div class="ai-panel character-panel">
                <div class="ai-panel-header">
                    <h3><i class="fas fa-user"></i> 角色创作助手</h3>
                </div>
                <div class="ai-panel-body">
                    <div class="input-group">
                        <label>角色名称:</label>
                        <input type="text" id="character-name-input" placeholder="角色名称" />
                    </div>
                    <div class="input-group">
                        <label>角色背景:</label>
                        <textarea id="character-background" placeholder="描述角色的背景、经历、性格特点..." rows="3"></textarea>
                    </div>
                    <div class="character-traits">
                        <label>性格特征:</label>
                        <input type="text" id="character-traits" placeholder="如: 温柔、坚强、神秘、活泼..." />
                    </div>
                    <div class="character-relationship">
                        <label>与主角关系:</label>
                        <select id="character-relationship">
                            <option value="friend">朋友</option>
                            <option value="lover">恋人</option>
                            <option value="family">家人</option>
                            <option value="rival">对手</option>
                            <option value="mentor">导师</option>
                            <option value="stranger">陌生人</option>
                        </select>
                    </div>
                    <div class="ai-controls">
                        <button class="ai-generate-btn" data-type="character">
                            <i class="fas fa-user-plus"></i> 生成角色
                        </button>
                        <button class="ai-enhance-btn" data-type="character">
                            <i class="fas fa-star"></i> 完善角色
                        </button>
                    </div>
                </div>
                <div class="ai-result-area" style="display: none;">
                    <h4>AI生成结果:</h4>
                    <div class="ai-result-content"></div>
                    <div class="ai-result-actions">
                        <button class="accept-btn">采用</button>
                        <button class="regenerate-btn">重新生成</button>
                        <button class="edit-btn">编辑</button>
                        <button class="dismiss-btn">关闭</button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 创建对话AI面板
     */
    createDialogueAIPanel() {
        // 获取角色列表用于选择
        const characterOptions = Array.from(this.characterLibrary.values())
            .map(char => `<option value="${char.id}">${char.name}</option>`)
            .join('');

        return `
            <div class="ai-panel dialogue-panel">
                <div class="ai-panel-header">
                    <h3><i class="fas fa-comments"></i> 对话创作助手</h3>
                </div>
                <div class="ai-panel-body">
                    <div class="input-group">
                        <label>选择角色:</label>
                        <select id="dialogue-character" class="character-select">
                            <option value="">请选择角色...</option>
                            ${characterOptions}
                        </select>
                    </div>
                    <div class="input-group">
                        <label>对话场景:</label>
                        <textarea id="dialogue-scene" placeholder="描述对话发生的场景和背景..." rows="3"></textarea>
                    </div>
                    <div class="input-group">
                        <label>对话主题:</label>
                        <input type="text" id="dialogue-topic" placeholder="这段对话主要讨论什么？" />
                    </div>
                    <div class="dialogue-options">
                        <label><input type="checkbox" id="emotional-expression"> 情感表达</label>
                        <label><input type="checkbox" id="personality-tone"> 个性化语调</label>
                        <label><input type="checkbox" id="plot-advancement"> 推进剧情</label>
                    </div>
                    <div class="ai-controls">
                        <button class="ai-generate-btn" data-type="dialogue">
                            <i class="fas fa-comment-dots"></i> 生成对话
                        </button>
                        <button class="ai-continue-btn" data-type="dialogue">
                            <i class="fas fa-reply"></i> 续接对话
                        </button>
                    </div>
                </div>
                <div class="ai-result-area" style="display: none;">
                    <h4>AI生成结果:</h4>
                    <div class="ai-result-content"></div>
                    <div class="ai-result-actions">
                        <button class="accept-btn">采用</button>
                        <button class="regenerate-btn">重新生成</button>
                        <button class="edit-btn">编辑</button>
                        <button class="dismiss-btn">关闭</button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 创建场景AI面板
     */
    createSceneAIPanel() {
        return `
            <div class="ai-panel scene-panel">
                <div class="ai-panel-header">
                    <h3><i class="fas fa-image"></i> 场景创作助手</h3>
                </div>
                <div class="ai-panel-body">
                    <div class="input-group">
                        <label>场景名称:</label>
                        <input type="text" id="scene-name-input" placeholder="场景名称" />
                    </div>
                    <div class="input-group">
                        <label>场景描述:</label>
                        <textarea id="scene-description" placeholder="描述场景的环境、氛围、细节..." rows="3"></textarea>
                    </div>
                    <div class="scene-atmosphere">
                        <label>场景氛围:</label>
                        <select id="scene-mood">
                            <option value="peaceful">宁静</option>
                            <option value="tense">紧张</option>
                            <option value="romantic">浪漫</option>
                            <option value="mysterious">神秘</option>
                            <option value="cheerful">欢快</option>
                            <option value="melancholic">忧郁</option>
                            <option value="dramatic">戏剧化</option>
                        </select>
                    </div>
                    <div class="scene-time">
                        <label>时间设定:</label>
                        <select id="scene-time">
                            <option value="morning">清晨</option>
                            <option value="noon">正午</option>
                            <option value="afternoon">下午</option>
                            <option value="evening">黄昏</option>
                            <option value="night">夜晚</option>
                            <option value="midnight">深夜</option>
                        </select>
                    </div>
                    <div class="ai-controls">
                        <button class="ai-generate-btn" data-type="scene">
                            <i class="fas fa-palette"></i> 生成场景
                        </button>
                        <button class="ai-enhance-btn" data-type="scene">
                            <i class="fas fa-magic"></i> 丰富描述
                        </button>
                    </div>
                </div>
                <div class="ai-result-area" style="display: none;">
                    <h4>AI生成结果:</h4>
                    <div class="ai-result-content"></div>
                    <div class="ai-result-actions">
                        <button class="accept-btn">采用</button>
                        <button class="regenerate-btn">重新生成</button>
                        <button class="edit-btn">编辑</button>
                        <button class="dismiss-btn">关闭</button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 绑定AI面板事件
     */
    bindAIPanelEvents(mode) {
        // 绑定生成按钮事件
        const generateBtns = document.querySelectorAll('.ai-generate-btn');
        generateBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                this.handleAIGeneration(type);
            });
        });

        // 绑定续写/增强按钮事件
        const continueBtns = document.querySelectorAll('.ai-continue-btn, .ai-enhance-btn');
        continueBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                this.handleAIEnhancement(type);
            });
        });

        // 绑定结果操作按钮事件
        const acceptBtns = document.querySelectorAll('.accept-btn');
        const regenerateBtns = document.querySelectorAll('.regenerate-btn');
        const editBtns = document.querySelectorAll('.edit-btn');
        const dismissBtns = document.querySelectorAll('.dismiss-btn');

        acceptBtns.forEach(btn => btn.addEventListener('click', () => this.acceptAIResult()));
        regenerateBtns.forEach(btn => btn.addEventListener('click', () => this.regenerateAIResult()));
        editBtns.forEach(btn => btn.addEventListener('click', () => this.editAIResult()));
        dismissBtns.forEach(btn => btn.addEventListener('click', () => this.dismissAIResult()));
    }

    /**
     * 初始化资源管理器事件
     */
    initAssetManagerEvents() {
        // 导入资源按钮交由资源管理器处理，避免重复触发
        // 此处不再绑定导入/新建文件夹事件，防止弹出两个文件选择框

        // 资源搜索
        const assetsSearch = document.getElementById('assets-search');
        if (assetsSearch) {
            assetsSearch.addEventListener('input', (e) => {
                this.searchAssets(e.target.value);
            });
        }

        // 资源分类切换
        const categories = document.querySelectorAll('.category');
        categories.forEach(category => {
            category.addEventListener('click', () => {
                this.switchAssetCategory(category.dataset.category);
                
                // 更新活动状态
                categories.forEach(c => c.classList.remove('active'));
                category.classList.add('active');
            });
        });
    }

    /**
     * 初始化角色面板事件
     */
    initCharacterPanelEvents() {
        // 添加角色按钮
        const addCharacterBtn = document.getElementById('panel-add-character-btn');
        if (addCharacterBtn) {
            addCharacterBtn.addEventListener('click', () => {
                this.showCharacterEditor();
            });
        }

        // 导入角色设定按钮
        const importCharacterBtn = document.getElementById('import-character-btn');
        if (importCharacterBtn) {
            importCharacterBtn.addEventListener('click', () => {
                this.importCharacterSettings();
            });
        }

        // 角色编辑器事件
        this.initCharacterEditorEvents();
    }

    /**
     * 初始化角色编辑器事件
     */
    initCharacterEditorEvents() {
        // 选择头像按钮
        const selectAvatarBtn = document.getElementById('select-avatar-btn');
        if (selectAvatarBtn) {
            selectAvatarBtn.addEventListener('click', () => {
                this.selectCharacterAvatar();
            });
        }

        // 保存角色按钮
        const saveCharacterBtn = document.getElementById('save-character-btn');
        if (saveCharacterBtn) {
            saveCharacterBtn.addEventListener('click', () => {
                this.saveCharacterFromPanel();
            });
        }

        // 删除角色按钮
        const deleteCharacterBtn = document.getElementById('delete-character-btn');
        if (deleteCharacterBtn) {
            deleteCharacterBtn.addEventListener('click', () => {
                this.deleteCharacterFromPanel();
            });
        }

        // 取消编辑按钮
        const cancelCharacterBtn = document.getElementById('cancel-character-edit-btn');
        if (cancelCharacterBtn) {
            cancelCharacterBtn.addEventListener('click', () => {
                this.hideCharacterEditor();
            });
        }
    }

    /**
     * 初始化AI助手事件
     */
    initAIAssistantEvents() {
        // AI模式切换
        const aiTabs = document.querySelectorAll('.ai-tab');
        aiTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchAIMode(tab.dataset.mode);
                
                // 更新活动状态
                aiTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // 切换内容面板
                const contents = document.querySelectorAll('.ai-mode-content');
                contents.forEach(c => c.classList.remove('active'));
                const targetContent = document.getElementById(`ai-${tab.dataset.mode}-mode`);
                if (targetContent) {
                    targetContent.classList.add('active');
                }

                // Agent 模式下隐藏全局结果区；其他模式显示
                const resultContainer = document.getElementById('ai-result-container');
                if (resultContainer) {
                    if (tab.dataset.mode === 'agent') {
                        resultContainer.style.display = 'none';
                    } else {
                        // 仅恢复容器可见性，不强制显示内容
                        resultContainer.style.display = '';
                    }
                }

                // 控制外层滚动与布局
                const aiContent = document.querySelector('.ai-content');
                if (aiContent) {
                    if (tab.dataset.mode === 'agent') {
                        aiContent.classList.add('agent-active');
                    } else {
                        aiContent.classList.remove('agent-active');
                    }
                }
            });
        });

        // AI生成按钮事件
        this.initAIGenerationEvents();

        // 初始化参与角色下拉框
        this.updateAIDialogueCharacters();

        // 监听项目与角色变化，刷新下拉
    document.addEventListener('project:loaded', () => this.updateAIDialogueCharacters());
        document.addEventListener('characters-changed', () => {
            this.updateAIDialogueCharacters();
            this.refreshAllCharacterSelectors();
        });

        // Agent 配置按钮：打开独立的 Agent 配置模态框
        const agentCfgBtn = document.getElementById('agent-config-btn');
        if (agentCfgBtn) {
            agentCfgBtn.addEventListener('click', async () => {
                try {
                    const modalId = 'agent-config-modal';
                    const modal = document.getElementById(modalId);
                    if (!modal) return;

                    // 预填现有值
                    const goalInput = modal.querySelector('#agent-goal-modal');
                    const delayInput = modal.querySelector('#agent-delay-modal');
                    const choicesInput = modal.querySelector('#agent-choices-per-step');
                    const imageSizeSelect = modal.querySelector('#agent-image-size');

                    // 从localStorage载入之前保存的配置
                    let savedConfig = {};
                    try {
                        savedConfig = JSON.parse(localStorage.getItem('agent-config') || '{}');
                    } catch {}

                    if (goalInput) goalInput.value = savedConfig.goal || '';
                    if (delayInput) delayInput.value = savedConfig.delay || '0';
                    if (choicesInput) choicesInput.value = savedConfig.choices || '2';
                    if (imageSizeSelect) imageSizeSelect.value = savedConfig.imageSize || (window.appManager?.settings?.ai?.image?.defaultSize) || '1920x1080';

                    // 打开模态框
                    window.appManager?.showModal?.(modalId);

                    // 绑定保存/取消
                    const onCancel = () => window.appManager?.closeModal?.(modalId);
                    const onSave = async () => {
                        // 保存配置到 localStorage 或直接应用
                        const goal = goalInput?.value?.trim() || '';
                        const delay = parseInt(delayInput?.value || '0', 10);
                        const choices = parseInt(choicesInput?.value || '2', 10);
                        const imageSize = imageSizeSelect?.value || (window.appManager?.settings?.ai?.image?.defaultSize) || '1920x1080';
                        
                        localStorage.setItem('agent-config', JSON.stringify({ goal, delay, choices, imageSize }));
                        window.appManager?.closeModal?.(modalId);
                        window.appManager?.showNotification?.('Agent配置已保存', 'success');
                    };

                    const cancelBtn = modal.querySelector('#agent-config-cancel');
                    const saveBtn = modal.querySelector('#agent-config-save');
                    cancelBtn?.addEventListener('click', onCancel, { once: true });
                    saveBtn?.addEventListener('click', onSave, { once: true });
                } catch (e) {
                    console.warn('打开Agent配置失败:', e?.message || e);
                }
            });
        }
    }

    /**
     * 初始化AI生成事件
     */
    initAIGenerationEvents() {
        // 生成对话
        const generateDialogueBtn = document.getElementById('generate-dialogue-btn');
        if (generateDialogueBtn) {
            generateDialogueBtn.addEventListener('click', () => {
                this.generateDialogue();
            });
        }

        // 续写剧情
        const generateStoryBtn = document.getElementById('generate-story-btn');
        if (generateStoryBtn) {
            generateStoryBtn.addEventListener('click', () => {
                if (window.galGameAIAssistant) {
                    window.galGameAIAssistant.generateStory();
                }
            });
        }

        // 生成图像
        const generateImageBtn = document.getElementById('generate-image-btn');
        if (generateImageBtn) {
            generateImageBtn.addEventListener('click', () => {
                if (window.galGameAIAssistant) {
                    window.galGameAIAssistant.generateImage();
                }
            });
        }

        // 启动Agent
        const startAgentBtn = document.getElementById('start-agent-btn');
        if (startAgentBtn) {
            startAgentBtn.addEventListener('click', () => {
                if (window.galGameAIAssistant) {
                    window.galGameAIAssistant.startAIAgent();
                }
            });
        }

        // AI结果处理
        this.initAIResultEvents();
    }

    /**
     * 初始化AI结果事件
     */
    initAIResultEvents() {
        // 接受AI结果
        const acceptBtn = document.getElementById('accept-ai-result-btn');
        if (acceptBtn) {
            acceptBtn.addEventListener('click', () => {
                // 优先使用新续写流程的接受
                if (window.galGameAIAssistant?.pendingChapter) {
                    window.galGameAIAssistant.acceptPendingChapter();
                    return;
                }
                // 退化为旧的插入到时间线逻辑
                if (window.galGameAIAssistant?.acceptAIResult) {
                    window.galGameAIAssistant.acceptAIResult();
                } else {
                    this.acceptAIResult();
                }
            });
        }

        // 重新生成
        const regenerateBtn = document.getElementById('regenerate-btn');
        if (regenerateBtn) {
            regenerateBtn.addEventListener('click', () => {
                // 根据上下文决定重试逻辑
                const aa = window.galGameAIAssistant;
                if (aa?.pendingChapter) {
                    aa.continueScene();
                    return;
                }
                const mode = aa?.getCurrentAIMode ? aa.getCurrentAIMode() : this.currentAIMode;
                switch (mode) {
                    case 'dialogue':
                        aa?.generateDialogue ? aa.generateDialogue() : this.generateDialogue();
                        break;
                    case 'story':
                        aa?.generateStory ? aa.generateStory() : this.generateStory();
                        break;
                    case 'image':
                        // 再次生成并尝试应用为背景
                        if (aa?.generateBackgroundForCurrentChapter) aa.generateBackgroundForCurrentChapter();
                        else aa?.generateImage ? aa.generateImage() : this.generateImage();
                        break;
                    default:
                        this.regenerateAIContent();
                }
            });
        }

        // 拒绝AI结果
        const rejectBtn = document.getElementById('reject-ai-result-btn');
        if (rejectBtn) {
            rejectBtn.addEventListener('click', () => {
                // 清空待处理章节并隐藏结果区
                if (window.galGameAIAssistant) {
                    window.galGameAIAssistant.pendingChapter = null;
                    if (typeof window.galGameAIAssistant.hideAIResult === 'function') {
                        window.galGameAIAssistant.hideAIResult();
                    }
                }
                this.rejectAIResult();
            });
        }
    }

    /**
     * 刷新 AI 助手 > 对话生成 > 参与角色 下拉框
     */
    async updateAIDialogueCharacters() {
        try {
            const select = document.getElementById('dialogue-characters');
            if (!select) return;

            // 读取当前项目角色文件
            const projectPath = (window.projectPathManager && window.projectPathManager.getCurrentProjectPath && window.projectPathManager.getCurrentProjectPath())
                || (this.currentProjectPath) || (window.app && window.app.currentProject && window.app.currentProject.path) || null;
            if (!projectPath) return;

            const filePath = `${projectPath}/characters/characters.json`;
            let characters = [];
            try {
                const text = await window.electronAPI.readFile(filePath);
                if (text) {
                    const data = JSON.parse(text);
                    if (Array.isArray(data)) characters = data;
                    else if (data && Array.isArray(data.characters)) characters = data.characters;
                    else if (data && typeof data === 'object') {
                        // 对象形式 { id: {name:...}, ... }
                        characters = Object.values(data);
                    }
                }
            } catch (e) {
                console.warn('读取角色列表失败:', e?.message);
            }

            // 填充下拉
            select.innerHTML = '';
            characters.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id || c.name || '';
                opt.textContent = c.name || c.id || '(未命名)';
                select.appendChild(opt);
            });

        } catch (error) {
            console.warn('更新AI助手参与角色失败:', error?.message);
        }
    }

    refreshAllCharacterSelectors() {
        try {
            const selects = document.querySelectorAll('select.character-select, select#dialogue-characters, select#dialogue-character');
            const chars = Array.from(this.characterLibrary.values());
            selects.forEach(sel => {
                const prev = Array.from(sel.selectedOptions).map(o=>o.value);
                sel.innerHTML = '';
                chars.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.id || c.name || '';
                    opt.textContent = c.name || c.id || '(未命名)';
                    sel.appendChild(opt);
                });
                // 尝试恢复已选
                prev.forEach(v => {
                    const o = Array.from(sel.options).find(x => x.value === v);
                    if (o) o.selected = true;
                });
            });
        } catch (e) {
            console.warn('刷新角色选择器失败:', e?.message);
        }
    }

    /**
     * 初始化预览器事件
     */
    initPreviewEvents() {
        // 开始预览
        const previewPlayBtn = document.getElementById('preview-play-btn');
        if (previewPlayBtn) {
            previewPlayBtn.addEventListener('click', () => {
                this.startGamePreview();
            });
        }

        // 调试模式
        const previewDebugBtn = document.getElementById('preview-debug-btn');
        if (previewDebugBtn) {
            previewDebugBtn.addEventListener('click', () => {
                this.startDebugPreview();
            });
        }

        // 章节选择
        const chapterSelect = document.getElementById('preview-chapter-select');
        if (chapterSelect) {
            chapterSelect.addEventListener('change', (e) => {
                this.previewChapter(e.target.value);
            });
        }
    }

    /**
     * 初始化打包事件
     */
    initPackageEvents() {
        // 选择输出目录
        const selectOutputDirBtn = document.getElementById('select-output-dir-btn');
        if (selectOutputDirBtn) {
            selectOutputDirBtn.addEventListener('click', () => {
                this.selectOutputDirectory();
            });
        }

        // 开始打包
        const startPackageBtn = document.getElementById('start-package-btn');
        if (startPackageBtn) {
            startPackageBtn.addEventListener('click', () => {
                this.startPackaging();
            });
        }

        // 测试打包
        const testPackageBtn = document.getElementById('test-package-btn');
        if (testPackageBtn) {
            testPackageBtn.addEventListener('click', () => {
                this.testPackaging();
            });
        }
    }

    /**
     * 初始化拖拽功能
     */
    initDragAndDrop() {
        // 资源拖拽到场景编辑器
        const sceneTimeline = document.getElementById('scene-timeline');
        if (sceneTimeline) {
            sceneTimeline.addEventListener('dragover', (e) => {
                e.preventDefault();
            });

            sceneTimeline.addEventListener('drop', (e) => {
                e.preventDefault();
                const assetData = e.dataTransfer.getData('text/plain');
                if (!assetData) return;
                try {
                    const data = JSON.parse(assetData);
                    this.handleAssetDrop(data);
                } catch (err) {
                    console.warn('拖拽数据不是有效的 JSON:', err);
                }
            });
        }
    }

    /**
     * 生成对话
     */
    generateDialogue() {
        console.log('生成对话');
        
        // 从AI面板获取对话生成参数
        const characterSelect = document.getElementById('dialogue-character');
        const sceneInput = document.getElementById('dialogue-scene');
        const topicInput = document.getElementById('dialogue-topic');
        
        if (!characterSelect || !characterSelect.value) {
            alert('请先选择一个角色');
            return;
        }
        
        const character = this.characterLibrary.get(characterSelect.value);
        if (!character) {
            alert('选择的角色不存在');
            return;
        }
        
        // 构建AI生成提示词
        const prompt = this.buildDialoguePrompt(character, sceneInput?.value, topicInput?.value);
        
        // 调用AI生成
        this.callAIGeneration('dialogue', prompt, {
            character: character,
            scene: sceneInput?.value,
            topic: topicInput?.value
        });
    }

    /**
     * 导入角色设定
     */
    async importCharacterSettings() {
        try {
            console.log('导入角色设定');
            // 实际的导入逻辑
        } catch (error) {
            console.error('导入角色设定失败:', error);
        }
    }

    /**
     * 刷新角色列表
     */
    /**
     * 开始调试预览
     */
    startDebugPreview() {
        console.log('开始调试预览');
        
        const frame = document.getElementById('game-preview-frame');
        if (!frame) return;

        frame.innerHTML = `
            <div class="debug-preview-container">
                <div class="debug-toolbar">
                    <button class="debug-btn" title="步进">
                        <i class="fas fa-step-forward"></i>
                    </button>
                    <button class="debug-btn" title="断点">
                        <i class="fas fa-pause"></i>
                    </button>
                    <button class="debug-btn" title="重置">
                        <i class="fas fa-redo"></i>
                    </button>
                </div>
                <div class="debug-content">
                    <div id="debug-game-screen">
                        <!-- 游戏预览内容 -->
                    </div>
                </div>
            </div>
        `;
        
        // 加载当前场景到预览
        this.loadSceneToPreview();
    }

    /**
     * 显示打包错误
     */
    showPackageError(error) {
        console.error('打包错误:', error);
        alert(`打包失败: ${error.message}`);
    }

    /**
     * 测试打包
     */
    async testPackaging() {
        console.log('开始测试打包');
        
        try {
            const settings = this.getPackageSettings();
            settings.testMode = true; // 标记为测试模式
            
            const progressDiv = document.getElementById('package-progress');
            if (progressDiv) {
                progressDiv.style.display = 'block';
                progressDiv.innerHTML = '<p>正在测试打包...</p>';
            }
            
            // 模拟打包过程
            setTimeout(() => {
                if (progressDiv) {
                    progressDiv.innerHTML = '<p>测试打包完成</p>';
                }
            }, 2000);
            
        } catch (error) {
            console.error('测试打包失败:', error);
            this.showPackageError(error.message);
        }
    }

    /**
     * 创建资源文件夹
     */
    createAssetFolder() {
        console.log('创建资源文件夹');
        
        // 创建模态框来获取文件夹信息
        const modal = document.createElement('div');
        modal.className = 'modal folder-create-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-folder-plus"></i> 创建资源文件夹</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="input-group">
                        <label>文件夹名称:</label>
                        <input type="text" id="folder-name-input" placeholder="请输入文件夹名称" />
                    </div>
                    <div class="input-group">
                        <label>文件夹类型:</label>
                        <select id="folder-type-select">
                            <option value="images">图片文件夹</option>
                            <option value="audio">音频文件夹</option>
                            <option value="backgrounds">背景文件夹</option>
                            <option value="characters">角色文件夹</option>
                            <option value="ui">UI文件夹</option>
                            <option value="other">其他</option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="galGameUIController.confirmCreateFolder()">
                        <i class="fas fa-check"></i> 创建
                    </button>
                    <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times"></i> 取消
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 聚焦到文件夹名称输入框
        setTimeout(() => {
            const input = document.getElementById('folder-name-input');
            if (input) input.focus();
        }, 100);
    }

    /**
     * 确认创建文件夹
     */
    async confirmCreateFolder() {
        const nameInput = document.getElementById('folder-name-input');
        const typeSelect = document.getElementById('folder-type-select');
        
        if (!nameInput || !nameInput.value.trim()) {
            alert('请输入文件夹名称');
            return;
        }
        
        const folderName = nameInput.value.trim();
        const folderType = typeSelect ? typeSelect.value : 'other';
        
        try {
            // 获取项目资源目录
            const projectPath = this.getCurrentProjectPath();
            if (!projectPath) {
                alert('当前没有打开的项目');
                return;
            }
            
            // 构建文件夹路径
            const folderPath = `${projectPath}/assets/${folderName}`;
            
            // 创建文件夹
            await window.electronAPI.createDirectory(folderPath);
            
            // 创建文件夹配置文件
            const folderConfig = {
                name: folderName,
                type: folderType,
                created: new Date().toISOString(),
                description: `${folderType} 资源文件夹`
            };
            
            await window.electronAPI.writeFile(
                `${folderPath}/.folder-config.json`, 
                JSON.stringify(folderConfig, null, 2)
            );
            
            console.log('文件夹创建成功:', folderPath);
            
            // 重新加载资源库
            await this.loadAssetLibrary();
            
            // 关闭模态框
            const modal = document.querySelector('.folder-create-modal');
            if (modal) modal.remove();
            
            // 显示成功消息
            this.showNotification('文件夹创建成功！', 'success');
            
        } catch (error) {
            console.error('创建文件夹失败:', error);
            alert(`创建文件夹失败: ${error.message}`);
        }
    }

    /**
     * 切换资源分类
     */
    switchAssetCategory(category) {
        console.log('切换资源分类:', category);
        
        // 更新分类按钮的活动状态
        const categoryBtns = document.querySelectorAll('.category-btn, .category');
        categoryBtns.forEach(btn => {
            if (btn.dataset.category === category) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // 过滤资源显示
        const assetItems = document.querySelectorAll('.asset-item');
        let visibleCount = 0;
        
        assetItems.forEach(item => {
            const assetType = item.dataset.assetType;
            const assetCategory = item.dataset.assetCategory;
            
            let shouldShow = false;
            
            if (category === 'all') {
                shouldShow = true;
            } else if (category === assetType || category === assetCategory) {
                shouldShow = true;
            }
            
            if (shouldShow) {
                item.style.display = 'block';
                visibleCount++;
            } else {
                item.style.display = 'none';
            }
        });
        
        // 更新资源计数显示
        const countDisplay = document.querySelector('.assets-count');
        if (countDisplay) {
            countDisplay.textContent = `${visibleCount} 个资源`;
        }
        
        // 更新当前选中的分类
        this.currentAssetCategory = category;
    }

    /**
     * 显示背景选择器
     */


    /**
     * 显示音乐选择器  
     */
    showMusicSelector() {
        console.log('显示音乐选择器');
        
        try {
            const modal = document.createElement('div');
        modal.className = 'modal music-selector-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>选择背景音乐</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="music-list" id="music-list">
                        <!-- 音乐文件列表 -->
                    </div>
                    <div class="music-controls">
                        <audio id="preview-audio" controls style="width: 100%; margin-top: 10px;">
                            您的浏览器不支持音频播放。
                        </audio>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="cancel-music">取消</button>
                    <button class="btn btn-primary" id="confirm-music" disabled>确定</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

        // 填充音乐文件列表
        this.populateMusicList();

        // 绑定事件
        const closeBtn = modal.querySelector('.modal-close');
        const cancelBtn = modal.querySelector('#cancel-music');
        const confirmBtn = modal.querySelector('#confirm-music');

        let selectedMusic = null;

        const closeModal = () => {
            const audio = modal.querySelector('#preview-audio');
            if (audio) {
                audio.pause();
            }
            document.body.removeChild(modal);
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        
        confirmBtn.addEventListener('click', () => {
            if (selectedMusic && this.selectedElement) {
                this.applyMusicToElement(this.selectedElement, selectedMusic);
            }
            closeModal();
        });

        // 音乐选择事件
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('music-item')) {
                // 清除之前的选择
                modal.querySelectorAll('.music-item').forEach(item => {
                    item.classList.remove('selected');
                });
                
                // 选择当前项
                e.target.classList.add('selected');
                selectedMusic = e.target.dataset.musicPath;
                confirmBtn.disabled = false;
                
                // 预览音乐
                const audio = modal.querySelector('#preview-audio');
                if (audio && selectedMusic) {
                    audio.src = selectedMusic;
                }
            }
        });

        } catch (error) {
            console.error('显示音乐选择器失败:', error);
            this.showNotification('音乐选择器加载失败: ' + error.message, 'error');
        }
    }
    
    /**
     * 将音乐应用到元素
     */
    applyMusicToElement(element, musicPath) {
        if (!element) return;
        
        // 更新元素的数据属性
        element.dataset.musicPath = musicPath;
        
        // 更新元素的显示
        const musicInfo = element.querySelector('.music-info');
        if (musicInfo) {
            const pathText = musicInfo.querySelector('p');
            let audioElement = musicInfo.querySelector('audio');
            
            if (pathText) {
                pathText.textContent = `音乐文件: ${musicPath}`;
            }
            
            if (audioElement) {
                audioElement.innerHTML = `<source src="${musicPath}">`;
            } else {
                // 创建新的音频元素
                audioElement = document.createElement('audio');
                audioElement.controls = true;
                audioElement.style.width = '100%';
                audioElement.style.maxWidth = '300px';
                audioElement.innerHTML = `<source src="${musicPath}">`;
                musicInfo.appendChild(audioElement);
            }
        }
        
        // 触发自动保存
        this.debounceAutoSave();
        
        console.log('音乐已应用到元素:', musicPath);
    }

    /**
     * AI续写场景
     */
    aiContinueScene() {
        console.log('AI续写场景');
        if (window.galGameAIAssistant) {
            window.galGameAIAssistant.continueScene();
        }
    }

    /**
     * AI生成图片
     */
    aiGenerateImage() {
        console.log('AI生成图片');
        if (window.galGameAIAssistant) {
            window.galGameAIAssistant.generateImage();
        }
    }

    /**
     * 编辑元素
     */
    editElement(element) {
        console.log('编辑元素:', element);
        
        if (!element) return;
        
        // 设置当前选中的元素
        this.selectedElement = element;
        
        // 高亮选中的元素
        document.querySelectorAll('.scene-element').forEach(el => {
            el.classList.remove('selected');
        });
        element.classList.add('selected');
        
        // 根据元素类型显示相应的编辑面板
        const elementType = element.dataset.type;
        
        switch(elementType) {
            case 'text':
                this.showTextEditor(element);
                break;
            case 'character':
                this.showCharacterEditor(element);
                break;
            case 'background':
                this.showBackgroundEditor(element);
                break;
            case 'music':
                this.showMusicEditor(element);
                break;
            case 'effect':
                this.showEffectEditor(element);
                break;
            default:
                this.showGenericEditor(element);
                break;
        }
        
        // 更新属性面板
        this.updatePropertyPanel(element);
    }

    /**
     * 添加文本元素到场景时间轴
     */
    addTextElement() {
        const timeline = document.getElementById('scene-timeline');
        if (!timeline) return;

        // 检查是否已有文本元素
        if (timeline.querySelector('.text-element')) {
            alert('每个场景只能有一个文本元素');
            return;
        }

        this.removePlaceholder();
        const index = timeline.querySelectorAll('.timeline-element').length;
        const model = { type: 'text', character: '', text: '' };
        this.renderElementToTimeline(model, index);

        this.updateWordCount();
        this.debounceAutoSave();
    }

    /**
     * 添加选择元素到场景时间轴
     */
    addChoiceElement() {
        const timeline = document.getElementById('scene-timeline');
        if (!timeline) return;

        // 检查是否已有选择元素
        if (timeline.querySelector('.choice-element')) {
            alert('每个场景只能有一个选择元素');
            return;
        }

        this.removePlaceholder();
        const index = timeline.querySelectorAll('.timeline-element').length;
        const model = { type: 'choice', description: '', choices: [{ text: '' }, { text: '' }] };
        this.renderElementToTimeline(model, index);

        this.updateWordCount();
        this.debounceAutoSave();
    }

    /**
     * 添加背景元素 - 应用到场景属性而非时间轴
     */
    addBackgroundElement(imagePath = null) {
        const backgroundSelect = document.getElementById('background-select');
        if (backgroundSelect && imagePath && backgroundSelect.value !== imagePath) {
            backgroundSelect.value = imagePath;
        }
        
        // 标记为需要保存
        this.isDirty = true;
        this.debounceAutoSave();
        
        console.log('背景图片已设置:', imagePath);
    }
    
    /**
     * 添加音乐元素 - 应用到场景属性而非时间轴
     */
    addMusicElement(musicPath = null) {
        const musicSelect = document.getElementById('music-select');
        if (musicSelect && musicPath && musicSelect.value !== musicPath) {
            musicSelect.value = musicPath;
        }
        
        // 标记为需要保存
        this.isDirty = true;
        this.debounceAutoSave();
        
        console.log('背景音乐已设置:', musicPath);
    }
    
    /**
     * 添加角色元素到时间轴
     */
    addCharacterElement(characterId = null, position = 'center') {
        const timeline = document.getElementById('scene-timeline');
        if (!timeline) return;
        
        this.removePlaceholder();
        
        const character = characterId ? this.characterLibrary.get(characterId) : null;
        const characterName = character ? character.name : (characterId || '未选择角色');
        
        const charElement = document.createElement('div');
        charElement.className = 'timeline-element character-element';
        charElement.dataset.characterId = characterId || '';
        charElement.dataset.position = position;
        charElement.innerHTML = `
            <div class="element-header">
                <i class="fas fa-user"></i>
                <span>角色: ${characterName}</span>
                <div class="element-actions">
                    <button class="btn-small select-character" title="选择角色">
                        <i class="fas fa-user-plus"></i>
                    </button>
                    <button class="btn-small edit-element" title="编辑">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-small delete-element" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="element-content">
                <div class="character-setup">
                    <div class="character-row">
                        <label>角色:</label>
                        <select class="character-select">
                            <option value="">选择角色</option>
                        </select>
                    </div>
                    <div class="position-row">
                        <label>位置:</label>
                        <select class="position-select">
                            <option value="left">左侧</option>
                            <option value="center" selected>中央</option>
                            <option value="right">右侧</option>
                        </select>
                    </div>
                    ${character && character.avatar ? `<div class="character-preview"><img src="${character.avatar}" alt="${characterName}" style="max-width: 100px; max-height: 100px;"></div>` : ''}
                </div>
            </div>
        `;
        
        timeline.appendChild(charElement);
        this.bindElementEvents(charElement);
        this.populateCharacterSelect(charElement.querySelector('.character-select'));
        
        // 设置默认值
        const characterSelect = charElement.querySelector('.character-select');
        const positionSelect = charElement.querySelector('.position-select');
        
        if (characterSelect && characterId) {
            characterSelect.value = characterId;
        }
        
        if (positionSelect) {
            positionSelect.value = position;
        }
        
        this.debounceAutoSave();
    }


    /**
     * 绑定元素事件
     */
    bindElementEvents(element) {
        // 删除按钮
        const deleteBtn = element.querySelector('.delete-element');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                if (confirm('确定要删除这个元素吗？')) {
                    element.remove();
                    this.updateWordCount();
                    this.checkPlaceholder();
                    this.debounceAutoSave(); // 触发自动保存
                }
            });
        }

        // 编辑按钮
        const editBtn = element.querySelector('.edit-element');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                this.editElement(element);
            });
        }

        // 添加选择选项按钮
        const addChoiceBtn = element.querySelector('.add-choice-option');
        if (addChoiceBtn) {
            addChoiceBtn.addEventListener('click', () => {
                this.addChoiceOption(element);
            });
        }

        // 删除选择选项按钮
        const removeChoiceBtns = element.querySelectorAll('.remove-choice-option');
        removeChoiceBtns.forEach(removeBtn => {
            removeBtn.addEventListener('click', () => {
                const choiceOption = removeBtn.closest('.choice-option');
                if (choiceOption && element.querySelectorAll('.choice-option').length > 1) {
                    choiceOption.remove();
                    this.debounceAutoSave();
                } else {
                    alert('至少需要保留一个选项');
                }
            });
        });

        // 文本输入监听 - 添加自动保存
        const textInputs = element.querySelectorAll('input, textarea, select');
        textInputs.forEach(input => {
            input.addEventListener('input', () => {
                this.updateWordCount();
                this.debounceAutoSave(); // 触发自动保存
            });
            
            // 对于选择框，也监听change事件
            if (input.tagName === 'SELECT') {
                input.addEventListener('change', () => {
                    this.debounceAutoSave();
                });
            }
        });
    }

    /**
     * 移除占位符
     */
    removePlaceholder() {
        const placeholder = document.querySelector('.timeline-placeholder');
        if (placeholder) {
            placeholder.style.display = 'none';
        }
    }

    /**
     * 检查是否需要显示占位符
     */
    checkPlaceholder() {
        const timeline = document.getElementById('scene-timeline');
        const elements = timeline?.querySelectorAll('.timeline-element');
        const placeholder = document.querySelector('.timeline-placeholder');
        
        if (placeholder && (!elements || elements.length === 0)) {
            placeholder.style.display = 'block';
        }
    }

    /**
     * 更新字数统计
     */
    updateWordCount() {
        const timeline = document.getElementById('scene-timeline');
        if (!timeline) return;
        let wordCount = 0;
        const collectText = (val) => (val || '').replace(/\s/g, '').length;
        // 文本元素正文
        const textAreas = timeline.querySelectorAll('textarea.text-content');
        textAreas.forEach(el => { wordCount += collectText(el.value); });
        // 角色名称（输入框或下拉选择）
        const characterInputs = timeline.querySelectorAll('input.character-input');
        characterInputs.forEach(el => { wordCount += collectText(el.value); });
        const characterSelects = timeline.querySelectorAll('select.character-select');
        characterSelects.forEach(sel => { wordCount += collectText(sel.value); });
        // 选择描述
        const choiceDescInputs = timeline.querySelectorAll('input.choice-description');
        choiceDescInputs.forEach(el => { wordCount += collectText(el.value); });
        // 选择项文本
        const choiceTextInputs = timeline.querySelectorAll('input.choice-text, [data-role="choice-text"]');
        choiceTextInputs.forEach(el => { wordCount += collectText(el.value || el.textContent); });

        const wordCountElement = document.getElementById('scene-word-count');
        if (wordCountElement) {
            wordCountElement.textContent = wordCount;
        }
    }

    /**
     * 填充角色选择下拉框
     */
    populateCharacterSelect(select) {
        if (!select) return;

        // 清空现有选项
        select.innerHTML = '<option value="">选择角色</option>';

        // 添加角色选项
        this.characterLibrary.forEach((character, id) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = character.name;
            select.appendChild(option);
        });
    }

    /**
     * 导入资源
     */
    async importAssets() {
        try {
            const result = await window.electronAPI.showOpenDialog({
                properties: ['openFile', 'multiSelections'],
                filters: [
                    { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
                    { name: '音频文件', extensions: ['mp3', 'wav', 'ogg', 'aac'] },
                    { name: '所有文件', extensions: ['*'] }
                ]
            });

            const files = (result && !result.canceled && Array.isArray(result.filePaths)) ? result.filePaths : [];
            if (files.length > 0) {
                for (const file of files) {
                    await this.processAssetFile(file);
                }
                this.refreshAssetGrid();
            }
        } catch (error) {
            console.error('导入资源失败:', error);
        }
    }

    /**
     * 处理资源文件
     */
    async processAssetFile(filePath) {
        // 复制文件到项目资源目录
    const fileName = (filePath || '').split(/\\\\|\//).pop();
        const targetPath = await this.getAssetTargetPath(fileName);
        
        await window.electronAPI.copyFile(filePath, targetPath);
        
        // 添加到资源库
        const assetInfo = {
            id: this.generateAssetId(),
            name: fileName,
            path: targetPath,
            type: this.getAssetType(fileName),
            size: await this.getFileSize(targetPath),
            imported: new Date().toISOString()
        };
        
        this.assetLibrary.set(assetInfo.id, assetInfo);
        
        console.log('资源已导入:', assetInfo);
    }

    /**
     * 获取资源目标路径
     */
    async getAssetTargetPath(fileName) {
        const projectPath = this.getCurrentProjectPath();
        if (!projectPath) {
            throw new Error('没有打开的项目');
        }
        
        const assetsDir = `${projectPath}/assets`;
        await window.electronAPI.ensureDir(assetsDir);
        return `${assetsDir}/${fileName}`;
    }    /**
     * 生成资源ID
     */
    generateAssetId() {
        return `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 获取资源类型
     */
    getAssetType(fileName) {
    const dot = fileName.lastIndexOf('.')
    const ext = (dot >= 0 ? fileName.slice(dot) : '').toLowerCase();
        
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
            return 'image';
        }
        if (['.mp3', '.wav', '.ogg', '.aac'].includes(ext)) {
            return 'audio';
        }
        
        return 'other';
    }

    /**
     * 显示角色编辑器
     */
    showCharacterEditor(characterId = null) {
        const editor = document.getElementById('character-editor');
        const list = document.querySelector('.characters-placeholder');
        
        if (editor) {
            editor.style.display = 'block';
        }
        if (list) {
            list.style.display = 'none';
        }
        
        if (characterId && this.characterLibrary.has(characterId)) {
            this.loadCharacterDataToEditor(characterId);
            document.getElementById('character-editor-title').textContent = '编辑角色';
            document.getElementById('delete-character-btn').style.display = 'inline-block';
        } else {
            this.clearCharacterEditor();
            document.getElementById('character-editor-title').textContent = '新建角色';
            document.getElementById('delete-character-btn').style.display = 'none';
        }
    }

    /**
     * 隐藏角色编辑器
     */
    hideCharacterEditor() {
        const editor = document.getElementById('character-editor');
        const list = document.querySelector('.characters-placeholder');
        
        if (editor) {
            editor.style.display = 'none';
        }
        if (list) {
            list.style.display = 'block';
        }
        
        this.clearCharacterEditor();
        this.currentEditingCharacter = null;
    }

    /**
     * 清空角色编辑器
     */
    clearCharacterEditor() {
        const fields = ['character-name', 'character-age', 'character-description', 'character-background', 'character-relationships'];
        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = '';
            }
        });
        
        const avatar = document.getElementById('character-avatar-preview');
        if (avatar) {
            avatar.src = '';
            avatar.style.display = 'none';
        }
    }

    /**
     * 加载角色数据到编辑器
     */
    loadCharacterDataToEditor(characterId) {
        const character = this.characterLibrary.get(characterId);
        if (!character) return;
        
        document.getElementById('character-name').value = character.name || '';
        document.getElementById('character-age').value = character.age || '';
        document.getElementById('character-description').value = character.description || '';
        document.getElementById('character-background').value = character.background || '';
        document.getElementById('character-relationships').value = character.relationships || '';
        
        if (character.avatar) {
            const avatar = document.getElementById('character-avatar-preview');
            if (avatar) {
                avatar.src = character.avatar;
                avatar.style.display = 'block';
            }
        }
        
        this.currentEditingCharacter = characterId;
    }

    /**
     * 从面板保存角色
     */
    async saveCharacterFromPanel() {
        try {
            const name = document.getElementById('character-name').value.trim();
            if (!name) {
                this.showAlert('错误', '角色名称不能为空', 'error');
                return;
            }

            const characterData = {
                name: name,
                age: document.getElementById('character-age').value.trim(),
                description: document.getElementById('character-description').value.trim(),
                background: document.getElementById('character-background').value.trim(),
                relationships: document.getElementById('character-relationships').value.trim(),
                id: this.currentEditingCharacter || this.generateCharacterId(),
                avatar: document.getElementById('character-avatar-preview').src || null
            };

            // 保存到角色库
            this.characterLibrary.set(characterData.id, characterData);
            
            // 保存到文件
            await this.saveCharacterLibrary();
            
            // 刷新角色列表
            this.refreshCharactersList();
            
            // 刷新下拉框
            this.refreshAllCharacterSelects();
            
            this.showToast('角色保存成功', 'success');
            this.hideCharacterEditor();
            
        } catch (error) {
            console.error('保存角色失败:', error);
            this.showAlert('保存失败', `保存角色失败: ${error.message}`, 'error');
        }
    }

    /**
     * 从面板删除角色
     */
    async deleteCharacterFromPanel() {
        if (!this.currentEditingCharacter) return;
        
        const character = this.characterLibrary.get(this.currentEditingCharacter);
        if (!character) return;
        
        const confirmed = await this.showConfirmDialog('删除角色', `确定要删除角色 "${character.name}" 吗？此操作不可撤销。`);
        if (!confirmed) return;

        try {
            // 从角色库中删除
            this.characterLibrary.delete(this.currentEditingCharacter);
            
            // 保存角色库
            await this.saveCharacterLibrary();
            
            // 刷新角色列表
            this.refreshCharactersList();
            
            // 刷新下拉框
            this.refreshAllCharacterSelects();
            
            this.showToast('角色已删除', 'success');
            this.hideCharacterEditor();
            
        } catch (error) {
            console.error('删除角色失败:', error);
            this.showAlert('删除失败', `删除角色失败: ${error.message}`, 'error');
        }
    }

    /**
     * 刷新所有角色选择下拉框
     */
    refreshAllCharacterSelects() {
        const selects = document.querySelectorAll('.character-select, select[id*="character"], select[data-type="character"]');
        selects.forEach(select => {
            this.populateCharacterSelect(select);
        });
    }

    /**
     * 隐藏角色编辑器
     */
    hideCharacterEditor() {
        const editor = document.getElementById('character-editor');
        if (editor) {
            editor.style.display = 'none';
        }
    }

    /**
     * 保存角色
     */
    saveCharacter() {
        const form = document.querySelector('.character-form');
        if (!form) return;

        const characterData = {
            id: this.generateCharacterId(),
            name: form.querySelector('#character-name')?.value || '',
            description: form.querySelector('#character-description')?.value || '',
            avatar: form.querySelector('#character-avatar-preview')?.dataset.avatar || '',
            voice: form.querySelector('#character-voice')?.value || ''
        };

        this.characterLibrary.set(characterData.id, characterData);
        
        // 保存到项目目录
        this.saveCharacterLibraryToProject();
        
        this.refreshCharactersList();
        this.hideCharacterEditor();
        
        console.log('角色已保存:', characterData);
    }

    /**
     * 生成角色ID
     */
    generateCharacterId() {
        return `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 保存角色库到项目目录
     */
    async saveCharacterLibraryToProject() {
        try {
            if (!this.currentProjectPath) {
                this.currentProjectPath = window.app?.currentProject?.path || window.appManager?.currentProject?.path || null;
            }
            if (!this.currentProjectPath) {
                console.warn('没有当前项目，无法保存角色库');
                return;
            }

            const charactersData = {};
            this.characterLibrary.forEach((character, id) => {
                charactersData[id] = character;
            });

            const dirPath = this.currentProjectPath + '/characters';
            await window.electronAPI.ensureDir?.(dirPath) || await window.electronAPI.createDirectory?.(dirPath);
            const charactersPath = dirPath + '/characters.json';
            await window.electronAPI.writeFile(charactersPath, JSON.stringify(charactersData, null, 2));
            console.log('角色库已保存到项目目录');
        } catch (error) {
            console.error('保存角色库失败:', error);
        }
    }

    /**
     * 保存资源库到项目目录
     */
    async saveAssetLibraryToProject() {
        try {
            // 尝试获取项目路径，必要时等待短暂时间以等UI初始化
            let projectPath = this.currentProjectPath || window.app?.currentProject?.path || window.appManager?.currentProject?.path;
            if (!projectPath) {
                console.warn('没有当前项目，等待初始化后再试...');
                await new Promise(r => setTimeout(r, 200));
                projectPath = this.currentProjectPath || window.app?.currentProject?.path || window.appManager?.currentProject?.path;
            }
            if (!projectPath) {
                console.warn('没有当前项目，无法保存资源库');
                return;
            }
            this.currentProjectPath = projectPath;

            // 统一采用新格式保存：{ assets: [...], lastUpdated }
            const assetsArray = Array.from(this.assetLibrary.values());
            const assetsPayload = {
                assets: assetsArray,
                lastUpdated: new Date().toISOString()
            };

            const assetsPath = projectPath + '/assets.json';
            await window.electronAPI.writeFile(assetsPath, JSON.stringify(assetsPayload, null, 2));
            console.log('资源库已保存到项目目录');
        } catch (error) {
            console.error('保存资源库失败:', error);
        }
    }

    /**
     * 开始游戏预览
     */
    startGamePreview() {
        const frame = document.getElementById('game-preview-frame');
        if (!frame) return;

        // 创建游戏预览界面
        frame.innerHTML = `
            <div class="game-engine-container">
                <div class="game-screen" id="preview-game-screen">
                    <div class="game-background" id="preview-background"></div>
                    <div class="game-characters" id="preview-characters"></div>
                    <div class="game-ui">
                        <div class="dialogue-box" id="preview-dialogue-box">
                            <div class="character-name" id="preview-character-name"></div>
                            <div class="dialogue-text" id="preview-dialogue-text">点击开始预览当前章节</div>
                        </div>
                        <div class="game-controls">
                            <button class="btn btn-primary" id="preview-start">开始</button>
                            <button class="btn btn-secondary" id="preview-next">下一句</button>
                            <button class="btn btn-secondary" id="preview-auto">自动</button>
                            <button class="btn btn-success" id="preview-in-player" title="在播放器中预览">
                                <i class="fas fa-external-link-alt"></i> 播放器预览
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 绑定预览控制事件
        this.initGamePreviewControls();
        
        // 加载当前章节数据
        this.loadCurrentChapterPreview();
    }

    /**
     * 初始化游戏预览控制
     */
    initGamePreviewControls() {
        const startBtn = document.getElementById('preview-start');
        const nextBtn = document.getElementById('preview-next');
        const autoBtn = document.getElementById('preview-auto');
        const playerPreviewBtn = document.getElementById('preview-in-player');

        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.startChapterPreview();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.nextDialogue();
            });
        }

        if (autoBtn) {
            autoBtn.addEventListener('click', () => {
                this.toggleAutoPlay();
            });
        }

        if (playerPreviewBtn) {
            playerPreviewBtn.addEventListener('click', async () => {
                await this.previewInPlayer();
            });
        }
    }

    /**
     * 加载当前章节预览
     */
    async loadCurrentChapterPreview() {
        try {
            if (!window.app?.currentChapter) {
                console.log('没有当前章节');
                return;
            }

            // 获取当前章节数据
            const chapterData = window.app.currentChapter;
            if (chapterData && chapterData.content && chapterData.content.scenes) {
                this.previewScenes = chapterData.content.scenes;
                this.currentSceneIndex = 0;
                this.currentElementIndex = 0;
                
                console.log('章节预览数据加载完成:', this.previewScenes);
            }
        } catch (error) {
            console.error('加载章节预览失败:', error);
        }
    }

    /**
     * 开始章节预览
     */
    startChapterPreview() {
        if (!this.previewScenes || this.previewScenes.length === 0) {
            const dialogueText = document.getElementById('preview-dialogue-text');
            if (dialogueText) {
                dialogueText.textContent = '没有可预览的内容';
            }
            return;
        }

        this.currentSceneIndex = 0;
        this.currentElementIndex = 0;
        this.loadCurrentScene();
    }

    /**
     * 加载当前场景
     */
    loadCurrentScene() {
        if (!this.previewScenes || this.currentSceneIndex >= this.previewScenes.length) {
            return;
        }

        const scene = this.previewScenes[this.currentSceneIndex];
        
        // 设置背景
        const background = document.getElementById('preview-background');
        if (background && scene.background) {
            background.style.backgroundImage = `url(${scene.background})`;
        }

        // 设置背景音乐
        if (scene.music) {
            this.playPreviewMusic(scene.music);
        }

        // 显示第一个元素
        this.currentElementIndex = 0;
        this.showCurrentElement();
    }

    /**
     * 显示当前元素
     */
    showCurrentElement() {
        const scene = this.previewScenes[this.currentSceneIndex];
        if (!scene || !scene.elements || this.currentElementIndex >= scene.elements.length) {
            // 场景结束，切换到下一个场景
            this.nextScene();
            return;
        }

        const element = scene.elements[this.currentElementIndex];
        const characterName = document.getElementById('preview-character-name');
        const dialogueText = document.getElementById('preview-dialogue-text');

        if (element.type === 'text' || element.type === 'dialogue') {
            if (characterName) {
                characterName.textContent = element.character || '';
            }
            if (dialogueText) {
                this.typeWriterEffect(dialogueText, element.content || element.text || '');
            }
        }
    }

    /**
     * 下一句对话
     */
    nextDialogue() {
        this.currentElementIndex++;
        this.showCurrentElement();
    }

    /**
     * 下一个场景
     */
    nextScene() {
        this.currentSceneIndex++;
        if (this.currentSceneIndex < this.previewScenes.length) {
            this.loadCurrentScene();
        } else {
            // 章节结束
            const dialogueText = document.getElementById('preview-dialogue-text');
            if (dialogueText) {
                dialogueText.textContent = '章节预览完成';
            }
        }
    }

    /**
     * 打字机效果
     */
    typeWriterEffect(element, text) {
        element.textContent = '';
        let i = 0;
        const speed = 50; // 打字速度

        const typeWriter = () => {
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
                setTimeout(typeWriter, speed);
            }
        };

        typeWriter();
    }

    /**
     * 播放预览音乐
     */
    playPreviewMusic(musicPath) {
        // 实现音乐播放逻辑
        console.log('播放预览音乐:', musicPath);
    }

    /**
     * 在播放器中预览项目
     */
    async previewInPlayer() {
        try {
            console.log('启动播放器预览...');
            
            // 确保项目已保存到最新状态
            await this.saveProject();
            
            // 获取当前项目路径
            const projectPath = this.getCurrentProjectPath();
            if (!projectPath) {
                this.showAlert('错误', '没有打开的项目', 'error');
                return;
            }
            
            // 显示加载提示
            const loadingToast = this.showToast('正在启动播放器...', 'info', 0);
            
            try {
                // 调用主进程启动播放器预览
                const result = await window.electronAPI.previewProject(projectPath);
                
                // 关闭加载提示
                if (loadingToast && loadingToast.close) {
                    loadingToast.close();
                }
                
                if (result.success) {
                    this.showToast('播放器已启动，正在加载项目...', 'success', 3000);
                } else {
                    this.showAlert('启动失败', result.error || '无法启动播放器', 'error');
                }
            } catch (error) {
                // 关闭加载提示
                if (loadingToast && loadingToast.close) {
                    loadingToast.close();
                }
                
                console.error('启动播放器失败:', error);
                this.showAlert('启动失败', `无法启动播放器: ${error.message}`, 'error');
            }
            
        } catch (error) {
            console.error('预览项目失败:', error);
            this.showAlert('预览失败', `预览项目时出错: ${error.message}`, 'error');
        }
    }

    /**
     * 切换自动播放
     */
    toggleAutoPlay() {
        this.isAutoPlay = !this.isAutoPlay;
        const autoBtn = document.getElementById('preview-auto');
        
        if (this.isAutoPlay) {
            autoBtn.textContent = '停止';
            this.startAutoPlay();
        } else {
            autoBtn.textContent = '自动';
            this.stopAutoPlay();
        }
    }

    /**
     * 开始自动播放
     */
    startAutoPlay() {
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
        }
        
        this.autoPlayInterval = setInterval(() => {
            if (this.isAutoPlay) {
                this.nextDialogue();
            }
        }, 3000); // 3秒间隔
    }

    /**
     * 停止自动播放
     */
    stopAutoPlay() {
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }
    }

    /**
     * 开始打包
     */
    async startPackaging() {
        const settings = this.getPackageSettings();
        
        try {
            const progressDiv = document.getElementById('package-progress');
            if (progressDiv) {
                progressDiv.style.display = 'block';
            }

            const result = await window.electronAPI.invoke('package-project', settings);
            
            if (result.success) {
                this.showPackageComplete();
            } else {
                this.showPackageError(result.error);
            }
        } catch (error) {
            console.error('打包失败:', error);
            this.showPackageError(error.message);
        }
    }

    /**
     * 获取打包设置
     */
    getPackageSettings() {
        // 获取项目名称，优先从输入框，如果为空则从当前项目获取
        let projectName = document.getElementById('package-name')?.value || '';
        
        if (!projectName && window.projectPathManager) {
            const currentProjectPath = window.projectPathManager.getCurrentProjectPath();
            if (currentProjectPath) {
                try {
                    const path = require('path');
                    projectName = path.basename(currentProjectPath);
                } catch (error) {
                    console.error('获取项目名称失败:', error);
                }
            }
        }
        
        return {
            name: projectName,
            version: document.getElementById('package-version')?.value || '1.0.0',
            platforms: this.getSelectedPlatforms(),
            architectures: this.getSelectedArchitectures(),
            outputDir: document.getElementById('output-directory')?.value || ''
        };
    }

    /**
     * 获取选中的平台
     */
    getSelectedPlatforms() {
        const platforms = [];
        
        if (document.getElementById('platform-windows')?.checked) platforms.push('win32');
        if (document.getElementById('platform-mac')?.checked) platforms.push('darwin');
        if (document.getElementById('platform-linux')?.checked) platforms.push('linux');
        if (document.getElementById('platform-web')?.checked) platforms.push('web');
        
        return platforms;
    }

    /**
     * 获取选中的架构
     */
    getSelectedArchitectures() {
        const archs = [];
        
        if (document.getElementById('arch-x64')?.checked) archs.push('x64');
        if (document.getElementById('arch-arm64')?.checked) archs.push('arm64');
        if (document.getElementById('arch-ia32')?.checked) archs.push('ia32');
        
        return archs;
    }



    /**
     * 生成对话
     */
    generateDialogue() {
        if (window.galGameAIAssistant) {
            window.galGameAIAssistant.generateDialogue();
        }
    }

    /**
     * 导入角色设定
     */
    async importCharacterSettings() {
        console.log('导入角色设定');
        
        try {
            // 打开文件选择对话框
            const result = await window.electronAPI.showOpenDialog({
                title: '选择角色设定文件',
                filters: [
                    { name: '角色设定文件', extensions: ['json', 'txt'] },
                    { name: 'JSON文件', extensions: ['json'] },
                    { name: '文本文件', extensions: ['txt'] },
                    { name: '所有文件', extensions: ['*'] }
                ],
                properties: ['openFile']
            });
            
            if (result.canceled || !result.filePaths?.length) {
                return;
            }
            
            const filePath = result.filePaths[0];
            
            // 读取文件内容
            const readResult = await window.electronAPI.readFile(filePath);
            const content = readResult && readResult.success ? readResult.content : '';
            
            let characterData;
            
            // 尝试解析JSON格式
            try {
                characterData = JSON.parse(content);
            } catch (e) {
                // 如果不是JSON格式，尝试解析纯文本格式
                characterData = this.parseTextCharacterSettings(content);
            }
            
            // 验证角色数据
            if (!characterData || typeof characterData !== 'object') {
                throw new Error('无效的角色设定格式');
            }
            
            // 如果是角色数组，逐个导入
            if (Array.isArray(characterData)) {
                let importCount = 0;
                for (const char of characterData) {
                    if (this.importSingleCharacter(char)) {
                        importCount++;
                    }
                }
                this.showNotification(`成功导入 ${importCount} 个角色`);
            } else {
                // 单个角色
                if (this.importSingleCharacter(characterData)) {
                    this.showNotification('角色导入成功');
                } else {
                    throw new Error('角色数据格式错误');
                }
            }
            
            // 刷新角色列表
            this.refreshCharactersList();
            
        } catch (error) {
            console.error('导入角色设定失败:', error);
            this.showNotification('导入失败: ' + error.message, 'error');
        }
    }

    /**
     * 清空角色表单
     */
    clearCharacterForm() {
        const nameInput = document.getElementById('character-name');
        const bioInput = document.getElementById('character-bio');
        const avatarPreview = document.getElementById('character-avatar-preview');
        const voiceSelect = document.getElementById('character-voice');

        if (nameInput) nameInput.value = '';
        if (bioInput) bioInput.value = '';
        if (voiceSelect) voiceSelect.value = '';
        if (avatarPreview) {
            avatarPreview.src = '';
            avatarPreview.dataset.avatar = '';
        }
    }

    /**
     * 创建资源文件夹
     */
    createAssetFolder() {
        // 使用自定义对话框而不是prompt()
        this.showCreateFolderDialog();
    }

    /**
     * 显示创建文件夹对话框
     */
    showCreateFolderDialog() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>创建文件夹</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <label for="folder-name">文件夹名称:</label>
                    <input type="text" id="folder-name" class="form-control" placeholder="输入文件夹名称">
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" id="create-folder-confirm">创建</button>
                    <button class="btn btn-secondary" id="create-folder-cancel">取消</button>
                </div>
            </div>
        `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    const input = modal.querySelector('#folder-name');
        const confirmBtn = modal.querySelector('#create-folder-confirm');
        const cancelBtn = modal.querySelector('#create-folder-cancel');
        const closeBtn = modal.querySelector('.modal-close');
        const closeModal = () => {
            modal.classList.remove('show');
            setTimeout(() => { if (modal.parentNode) document.body.removeChild(modal); }, 200);
        };
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        input.focus();

        confirmBtn.addEventListener('click', () => {
            const folderName = input.value.trim();
            if (folderName) {
                console.log('创建资源文件夹:', folderName);
                if (window.galGameAssetManager) {
                    window.galGameAssetManager.createFolder(folderName);
                }
            }
            closeModal();
        });

        cancelBtn.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                confirmBtn.click();
            }
        });
    }

    /**
     * 切换资源分类
     */
    switchAssetCategory(category) {
        console.log('切换资源分类:', category);
        if (window.galGameAssetManager) {
            window.galGameAssetManager.switchCategory(category);
        }
    }

    /**
     * 显示背景选择器
     */




    /**
     * AI生成图像
     */
    aiGenerateImage() {
        console.log('AI生成图像');
        if (window.galGameAIAssistant) {
            window.galGameAIAssistant.generateImage();
        }
    }

    /**
     * 编辑元素
     */
    editElement(element) {
        console.log('编辑元素:', element);
        // 这里可以显示元素编辑对话框
    }

    /**
     * 添加选择选项
     */
    addChoiceOption(element) {
        const choiceOptions = element.querySelector('.choice-options');
        if (!choiceOptions) return;
        const index = choiceOptions.querySelectorAll('.choice-option').length;
        const newOption = document.createElement('div');
        newOption.className = 'choice-option';
        newOption.setAttribute('data-choice-index', String(index));
        newOption.innerHTML = `
            <div class="option-row">
                <label>选项${index + 1}:</label>
                <input type="text" class="choice-text" placeholder="选择${index + 1}的文本">
            </div>
            <div class="option-row">
                <label>跳转:</label>
                <select class="choice-target">
                    <option value="">请选择目标章节</option>
                </select>
            </div>
            <div class="option-actions">
                <button class="btn-small btn-danger remove-choice-option" title="删除选项">
                    <i class="fas fa-minus"></i>
                </button>
            </div>
        `;
        choiceOptions.appendChild(newOption);

        // 绑定删除事件
        const removeBtn = newOption.querySelector('.remove-choice-option');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                const total = choiceOptions.querySelectorAll('.choice-option').length;
                if (total > 1) {
                    newOption.remove();
                    this.debounceAutoSave?.();
                } else {
                    alert('至少需要保留一个选项');
                }
            });
        }

        // 刷新章节下拉
        try { window.timelineElementRenderer?.updateChapterSelects(element) } catch {}
    }

    /**
     * 处理资源拖拽
     */
    handleAssetDrop(assetData) {
        console.log('处理资源拖拽:', assetData);
        
        if (assetData.type === 'image') {
            // 如果是图片，可能是背景或立绘
            this.handleImageAssetDrop(assetData);
        } else if (assetData.type === 'audio') {
            // 如果是音频，可能是背景音乐或音效
            this.handleAudioAssetDrop(assetData);
        }
    }

    /**
     * 处理图片资源拖拽
     */
    handleImageAssetDrop(assetData) {
        console.log('设置背景图片:', assetData.name);
        // 这里可以设置当前场景的背景图片
    }

    /**
     * 处理音频资源拖拽
     */
    handleAudioAssetDrop(assetData) {
        console.log('设置背景音乐:', assetData.name);
        // 这里可以设置当前场景的背景音乐
    }

    /**
     * 更新章节名称 - 移除场景概念，直接更新章节标题
     */
    updateChapterTitle(title) {
        if (!this.currentChapter) {
            console.warn('没有当前章节');
            return;
        }
        
        this.currentChapter.title = title;
        console.log('章节标题已更新:', title);
        
        // 更新界面显示
        const titleElement = document.querySelector('.chapter-title-display');
        if (titleElement) {
            titleElement.textContent = title;
        }
        
        // 自动保存
        this.debounceAutoSave();
    }
    
    /**
     * 加载章节到编辑器 - 使用章节状态管理器
     */
    async loadChapter(chapterId) {
        try {
            console.log(`[UIController] 加载章节: ${chapterId}`);

            if (this.chapterStateManager) {
                // 使用章节状态管理器加载
                const chapterData = await this.chapterStateManager.loadChapter(chapterId, this);
                
                // 同步到本地状态（兼容性）
                this.currentChapter = chapterData;
                
                // 清空编辑器并渲染章节
                this.clearSceneEditor();
                this.renderChapterToEditor(chapterData);
                
                // 更新界面标题
                this.updateChapterTitleDisplay(chapterData.title || '未命名章节');
                
                // 再次显式同步当前章节，保证ID存在
                if (this.chapterStateManager && typeof this.chapterStateManager.setCurrentChapter === 'function') {
                    const id = chapterData.id || chapterId;
                    this.chapterStateManager.setCurrentChapter({ id, title: chapterData.title });
                }

                // 加载场景属性到界面
                this.loadSceneProperties(chapterData.sceneProperties);

                console.log('[UIController] 章节加载完成:', chapterData.title);
                return chapterData;
                
            } else {
                // 备用方案：使用原有逻辑
                return await this.loadChapterLegacy(chapterId);
            }

        } catch (error) {
            console.error('[UIController] 加载章节失败:', error);
            throw error;
        }
    }

    /**
     * 备用的章节加载方法
     */
    async loadChapterLegacy(chapterId) {
        try {
            // 验证chapterId参数
            if (!chapterId || chapterId === 'undefined' || chapterId === null) {
                console.error('无效的章节ID:', chapterId);
                this.showAlert && this.showAlert('加载失败', '章节ID无效或未定义', 'error');
                return;
            }

            console.log(`准备加载章节: ${chapterId}`);

            const appCtx = window.appManager || window.app;
            if (!appCtx?.currentProject) {
                console.error('没有打开的项目，无法加载章节');
                throw new Error('没有打开的项目');
            }
            
            // 保存当前章节（如果有的话）
            if (this.currentChapter && this.isDirty) {
                await this.saveCurrentChapter();
            }
            
            // 从项目章节列表中查找章节信息
            const chapterRef = appCtx.currentProject.chapters?.find(ch => ch.id === chapterId);
            
            const projectPath = appCtx.currentProject.path;
            const chapterPath = `${projectPath}/chapters/${chapterId}/content.json`;
            
            // 读取章节文件
            const chapterResult = await window.electronAPI.readFile(chapterPath);
            if (!chapterResult.success) {
                console.log('章节文件不存在，创建新章节');
                // 如果文件不存在，创建空章节，使用项目中的标题或默认标题
                this.currentChapter = {
                    id: chapterId,
                    title: chapterRef?.title || `章节 ${chapterId}`,
                    elements: []
                };
            } else {
                this.currentChapter = JSON.parse(chapterResult.content);
                // 确保使用项目中的最新标题
                if (chapterRef?.title) {
                    this.currentChapter.title = chapterRef.title;
                }
            }
            
            // 清空当前编辑器
            this.clearSceneEditor();
            
            // 加载章节数据到编辑器
            this.renderChapterToEditor(this.currentChapter);
            
            // 加载场景属性到界面
            this.loadSceneProperties(this.currentChapter.sceneProperties);
            
            // 更新界面标题
            this.updateChapterTitleDisplay(this.currentChapter.title || '未命名章节');
            
            console.log('章节已加载:', this.currentChapter.title || '未命名章节');
            this.isDirty = false;
            
        } catch (error) {
            console.error('加载章节失败:', error);
            this.showAlert && this.showAlert('加载失败', `无法加载章节: ${error.message}`, 'error');
        }
    }

/**
 * 创建新章节
 */
async createNewChapter(title = '新章节') {
    try {
        if (!window.app?.currentProject) {
            this.showAlert('错误', '没有打开的项目', 'error');
            return;
        }
        
        // 生成章节ID
        const chapterId = `chapter_${Date.now()}`;
        
        // 创建章节数据
        const chapterData = {
            id: chapterId,
            title: title,
            elements: []
        };
        
        // 保存章节文件
        const projectPath = this.getCurrentProjectPath();
        const chaptersDir = `${projectPath}/chapters/${chapterId}`;
        const chapterPath = `${chaptersDir}/content.json`;        // 确保目录存在
    await window.electronAPI.ensureDir(chaptersDir);
        
        // 写入章节文件
        await window.electronAPI.writeFile(chapterPath, JSON.stringify(chapterData, null, 2));
        
        // 添加到项目的章节列表
        if (!window.app.currentProject.chapters) {
            window.app.currentProject.chapters = [];
        }
        
        window.app.currentProject.chapters.push({
            id: chapterId,
            title: title,
            file: `chapters/${chapterId}/content.json`
        });
        
        // 保存项目文件
        await this.saveProjectFile();
        
        // 加载新章节到编辑器
        await this.loadChapter(chapterId);
        
        // 确保currentChapter被正确设置
        if (!this.currentChapter || this.currentChapter.id !== chapterId) {
            this.currentChapter = {
                id: chapterId,
                title: title,
                elements: []
            };
            console.log('重新设置currentChapter:', this.currentChapter);
        }
        
        this.showToast('新章节创建成功', 'success');
        console.log('新章节已创建:', title);
        
        return chapterId;
        
    } catch (error) {
        console.error('创建章节失败:', error);
        this.showAlert('创建失败', `无法创建章节: ${error.message}`, 'error');
        return null;
    }
}

/**
 * 保存项目文件
 */
async saveProjectFile() {
    if (!window.app?.currentProject) {
        throw new Error('没有当前项目');
    }
    
    const projectPath = this.getCurrentProjectPath();
    const projectData = window.app.currentProject;
    const projectFilePath = `${projectPath}/${projectData.name}.json`;
    
    await window.electronAPI.writeFile(projectFilePath, JSON.stringify(projectData, null, 2));
}

/**
 * 导入资源文件
 */
async importAsset(type = 'image') {
    try {
            if (!this.hasOpenProject()) {
                this.showAlert('错误', '没有打开的项目', 'error');
                return;
            }
        let filters;
        let title;
        
        if (type === 'image') {
            title = '选择图片文件';
            filters = [
                { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] },
                { name: '所有文件', extensions: ['*'] }
            ];
        } else if (type === 'audio') {
            title = '选择音频文件';
            filters = [
                { name: '音频文件', extensions: ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'] },
                { name: '所有文件', extensions: ['*'] }
            ];
        }
        
        // 打开文件选择对话框
        const result = await window.electronAPI.showOpenDialog({
            title: title,
            filters: filters,
            properties: ['openFile', 'multiSelections']
        });
        
        if (result.canceled || !result.filePaths?.length) {
            return;
        }
        
        // 处理每个选中的文件，并记录最后一个
        let lastAsset = null;
        for (const filePath of result.filePaths) {
            lastAsset = await this.processImportedAsset(filePath, type);
        }
        
        // 刷新下拉并自动选中最后一个导入的文件
        if (typeof this.refreshBackgroundAndMusicSelects === 'function') {
            this.refreshBackgroundAndMusicSelects();
        }
        if (lastAsset) {
            if (type === 'image') {
                const bgSelect = document.getElementById('background-select');
                if (bgSelect) { bgSelect.value = lastAsset.path; bgSelect.dispatchEvent(new Event('change')); }
            } else if (type === 'audio') {
                const musicSelect = document.getElementById('music-select');
                if (musicSelect) { musicSelect.value = lastAsset.path; musicSelect.dispatchEvent(new Event('change')); }
            }
        }
        
        this.showToast(`成功导入 ${result.filePaths.length} 个文件`, 'success');
        
    } catch (error) {
        console.error('导入资源失败:', error);
        this.showAlert('导入失败', `无法导入资源: ${error.message}`, 'error');
    }
}

/**
 * 处理导入的资源文件
 */
async processImportedAsset(filePath, type) {
    try {
        const appCtx = window.appManager || window.app;
        const projectPath = this.currentProjectPath || appCtx?.currentProject?.path;
        if (!projectPath) {
            throw new Error('没有打开的项目');
        }
        // 根据资源类型归类到子目录
        const typeDir = type === 'image' ? 'images' : (type === 'audio' ? 'audio' : 'other');
        const assetsDir = `${projectPath}/assets/${typeDir}`;
        
        // 确保assets目录存在
    await window.electronAPI.ensureDir(assetsDir);
        
        // 获取文件信息
        const fileName = filePath.split(/[/\\]/).pop();
        const fileExtension = fileName.split('.').pop().toLowerCase();
        
        // 目标路径
    const targetPath = `${assetsDir}/${fileName}`;
        
        // 复制文件到项目目录
        await window.electronAPI.copyFile(filePath, targetPath);
        
        // 添加到资源库（去重按路径）
        const relativePath = `assets/${typeDir}/${fileName}`;
        let existKey = null;
        for (const [id, a] of this.assetLibrary.entries()) {
            if (a.path === relativePath || a.fullPath === targetPath) { existKey = id; break; }
        }
        const assetId = existKey || `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const assetInfo = {
            id: assetId,
            name: fileName,
            type: type,
            path: relativePath,
            fullPath: targetPath,
            extension: fileExtension,
            size: await this.getFileSize(targetPath),
            imported: new Date().toISOString()
        };
        this.assetLibrary.set(assetId, assetInfo);
        
        // 保存资源库到文件
        await this.saveAssetLibraryToProject();
        
        console.log('资源已导入:', assetInfo);
        return assetInfo;
    } catch (error) {
        console.error('处理导入资源失败:', error);
        throw error;
    }
}

/**
 * 获取文件大小
 */
async getFileSize(filePath) {
    try {
        const stats = await window.electronAPI.getFileStats(filePath);
        return stats.size || 0;
    } catch (error) {
        console.warn('获取文件大小失败:', error);
        return 0;
    }
}

    /**
     * 清空编辑器
     */
    clearEditor() {
        const timeline = document.getElementById('scene-timeline');
        if (timeline) {
            // 只保留占位符
            const elements = timeline.querySelectorAll('.timeline-element');
            elements.forEach(element => element.remove());
            
            this.checkPlaceholder();
        }
    }
    
    /**
     * 渲染章节数据到编辑器
     */
    // 过时的renderChapterToEditor函数已删除，使用下面更新的版本
    
    /**
     * 渲染文本元素
     */
    renderTextElement(data, index) {
        this.addTextElement(); // 创建基本结构
        
        const textElement = document.querySelector('.timeline-element.text-element:last-child');
        if (textElement) {
            const characterSelect = textElement.querySelector('.character-select');
            const textContent = textElement.querySelector('.text-content');
            
            if (characterSelect && data.character) {
                characterSelect.value = data.character;
            }
            
            if (textContent && data.text) {
                textContent.value = data.text;
            }
        }
    }
    
    /**
     * 渲染选择元素
     */
    renderChoiceElement(data, index) {
        this.addChoiceElement(); // 创建基本结构
        
        const choiceElement = document.querySelector('.timeline-element.choice-element:last-child');
        if (choiceElement) {
            const description = choiceElement.querySelector('.choice-description');
            if (description && data.description) {
                description.value = data.description;
            }
            
            // 渲染选择选项
            if (data.choices && Array.isArray(data.choices)) {
                const choiceOptions = choiceElement.querySelectorAll('.choice-option');
                data.choices.forEach((choice, choiceIndex) => {
                    if (choiceIndex < choiceOptions.length) {
                        const option = choiceOptions[choiceIndex];
                        const textInput = option.querySelector('.choice-text');
                        const targetInput = option.querySelector('.choice-target');
                        
                        if (textInput) textInput.value = choice.text || '';
                        if (targetInput) {
                            targetInput.value = (choice.target || choice?.action?.target || '')
                        }
                    }
                });
                
                // 如果有更多选项，添加它们
                if (data.choices.length > 2) {
                    for (let i = 2; i < data.choices.length; i++) {
                        this.addChoiceOption(choiceElement);
                        // 然后填充数据
                        const newOptions = choiceElement.querySelectorAll('.choice-option');
                        const newOption = newOptions[i];
                        if (newOption) {
                            const textInput = newOption.querySelector('.choice-text');
                            const targetInput = newOption.querySelector('.choice-target');
                            
                            if (textInput) textInput.value = data.choices[i].text || '';
                            if (targetInput) {
                                const ch = data.choices[i] || {};
                                targetInput.value = (ch.target || ch?.action?.target || '');
                            }
                        }
                    }
                }
            }
        }
    }
    
    /**
     * 更新章节标题显示
     */
    updateChapterTitleDisplay(title) {
        const titleInput = document.getElementById('chapter-title');
        if (titleInput) {
            titleInput.value = title;
        }
        
        const titleDisplay = document.querySelector('.chapter-title-display');
        if (titleDisplay) {
            titleDisplay.textContent = title;
        }
    }
    
    /**
     * 渲染背景元素
     */
    renderBackgroundElement(data, index) {
        const timeline = document.getElementById('scene-timeline');
        if (!timeline) return;
        
        this.removePlaceholder();
        
        const bgElement = document.createElement('div');
        bgElement.className = 'timeline-element background-element';
        bgElement.dataset.backgroundPath = data.image || '';
        bgElement.innerHTML = `
            <div class="element-header">
                <i class="fas fa-image"></i>
                <span>背景图片</span>
                <div class="element-actions">
                    <button class="btn-small edit-element" title="编辑">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-small delete-element" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="element-content">
                <div class="background-preview">
                    ${data.image ? `<img src="${data.image}" alt="背景图片" style="max-width: 200px; max-height: 100px;">` : ''}
                    <p>图片路径: ${data.image || '未选择'}</p>
                </div>
            </div>
        `;
        
        timeline.appendChild(bgElement);
        this.bindElementEvents(bgElement);
    }
    
    /**
     * 渲染音乐元素
     */
    renderMusicElement(data, index) {
        const timeline = document.getElementById('scene-timeline');
        if (!timeline) return;
        
        this.removePlaceholder();
        
        const musicElement = document.createElement('div');
        musicElement.className = 'timeline-element music-element';
        musicElement.dataset.musicPath = data.file || '';
        musicElement.innerHTML = `
            <div class="element-header">
                <i class="fas fa-music"></i>
                <span>背景音乐</span>
                <div class="element-actions">
                    <button class="btn-small edit-element" title="编辑">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-small delete-element" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="element-content">
                <div class="music-info">
                    <p>音乐文件: ${data.file || '未选择'}</p>
                    ${data.file ? `<audio controls style="width: 100%; max-width: 300px;"><source src="${data.file}"></audio>` : ''}
                </div>
            </div>
        `;
        
        timeline.appendChild(musicElement);
        this.bindElementEvents(musicElement);
    }
    
    /**
     * 渲染角色元素
     */
    renderCharacterElement(data, index) {
        const timeline = document.getElementById('scene-timeline');
        if (!timeline) return;
        
        this.removePlaceholder();
        
        const charElement = document.createElement('div');
        charElement.className = 'timeline-element character-element';
        charElement.dataset.characterId = data.character || '';
        charElement.dataset.position = data.position || 'center';
        
        const character = this.characterLibrary.get(data.character);
        const characterName = character ? character.name : data.character;
        
        // 统一为与 addCharacterElement 创建的新元素一致的结构和按钮
        charElement.innerHTML = `
            <div class="element-header">
                <i class="fas fa-user"></i>
                <span>角色: ${characterName}</span>
                <div class="element-actions">
                    <button class="btn-small select-character" title="选择角色">
                        <i class="fas fa-user-plus"></i>
                    </button>
                    <button class="btn-small edit-element" title="编辑">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-small delete-element" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="element-content">
                <div class="character-setup">
                    <div class="character-row">
                        <label>角色:</label>
                        <select class="character-select">
                            <option value="">选择角色</option>
                        </select>
                    </div>
                    <div class="position-row">
                        <label>位置:</label>
                        <select class="position-select">
                            <option value="left" ${data.position === 'left' ? 'selected' : ''}>左侧</option>
                            <option value="center" ${!data.position || data.position === 'center' ? 'selected' : ''}>中央</option>
                            <option value="right" ${data.position === 'right' ? 'selected' : ''}>右侧</option>
                        </select>
                    </div>
                    ${character && character.avatar ? `<div class="character-preview"><img src="${character.avatar}" alt="${characterName}" style="max-width: 100px; max-height: 100px;"></div>` : ''}
                </div>
            </div>
        `;
        
        timeline.appendChild(charElement);
    this.bindElementEvents(charElement);
    // 填充下拉并设置默认值
    const characterSelect = charElement.querySelector('.character-select');
    this.populateCharacterSelect(characterSelect);
    if (characterSelect && data.character) characterSelect.value = data.character;
    const posSelect = charElement.querySelector('.position-select');
    if (posSelect && data.position) posSelect.value = data.position;
    }
    
    /**
     * 防抖自动保存
     */
    debounceAutoSave() {
        this.isDirty = true;
        
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }
        
        this.autoSaveTimer = setTimeout(async () => {
            if (this.isDirty) {
                await this.autoSave();
            }
        }, 2000); // 2秒后自动保存
    }
    
    /**
     * 自动保存
     */
    async autoSave() {
        try {
            if (this.currentChapter && window.app?.currentProject) {
                await this.saveCurrentChapter();
                this.isDirty = false;
                console.log('自动保存完成');
                
                // 显示保存状态
                this.showSaveStatus('已保存');
            }
        } catch (error) {
            console.error('自动保存失败:', error);
            this.showSaveStatus('保存失败', 'error');
        }
    }
    
    /**
     * 显示保存状态
     */
    showSaveStatus(message, type = 'success') {
        const statusElement = document.querySelector('.save-status');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `save-status ${type}`;
            
            // 3秒后隐藏状态
            setTimeout(() => {
                statusElement.textContent = '';
                statusElement.className = 'save-status';
            }, 3000);
        }
    }

    /**
     * 搜索资源
     */
    searchAssets(term) {
        console.log('搜索资源:', term);
        if (window.galGameAssetManager) {
            window.galGameAssetManager.searchAssets(term);
        }
    }

    /**
     * 选择角色头像
     */
    async selectCharacterAvatar() {
        console.log('选择角色头像');
        
        try {
            // 打开文件选择对话框
            const result = await window.electronAPI.showOpenDialog({
                title: '选择角色头像',
                filters: [
                    { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] },
                    { name: 'PNG图片', extensions: ['png'] },
                    { name: 'JPEG图片', extensions: ['jpg', 'jpeg'] },
                    { name: '所有文件', extensions: ['*'] }
                ],
                properties: ['openFile']
            });
            
            if (result.canceled || !result.filePaths?.length) {
                return;
            }
            
            const filePath = result.filePaths[0];
            
            // 复制文件到项目资源目录
            const targetPath = await this.getAssetTargetPath((filePath || '').split(/\\\\|\//).pop());
            await window.electronAPI.copyFile(filePath, targetPath);
            
            // 更新头像预览
            const avatarPreview = document.getElementById('character-avatar-preview');
            if (avatarPreview) {
                avatarPreview.src = targetPath;
                avatarPreview.style.display = 'block';
            }
            
            // 保存头像路径
            this.selectedCharacterAvatar = targetPath;
            
            this.showNotification('头像选择成功');
            
        } catch (error) {
            console.error('选择头像失败:', error);
            this.showNotification('选择头像失败: ' + error.message, 'error');
        }
    }

    /**
     * 预览章节
     */
    async previewChapter(chapterName) {
        console.log('预览章节:', chapterName);
        
        try {
            if (!window.app?.currentProject?.path || !chapterName) {
                throw new Error('项目未打开或章节名称无效');
            }
            
            // 构建章节文件路径
            const chapterPath = `${this.getCurrentProjectPath()}/chapters/${chapterName}.md`;
            
            // 读取章节内容
            const contentResult = await window.electronAPI.readFile(chapterPath);
            const content = contentResult && contentResult.success ? contentResult.content : '';
            
            // 创建预览窗口
            const previewModal = document.createElement('div');
            previewModal.className = 'modal chapter-preview-modal';
            previewModal.innerHTML = `
                <div class="modal-content large">
                    <div class="modal-header">
                        <h3>章节预览 - ${chapterName}</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="preview-toolbar">
                            <button class="btn btn-secondary" id="preview-raw">原始文档</button>
                            <button class="btn btn-primary" id="preview-rendered">渲染预览</button>
                            <button class="btn btn-secondary" id="preview-game">游戏预览</button>
                        </div>
                        <div class="preview-content" id="preview-content">
                            <pre class="raw-content">${content}</pre>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="close-preview">关闭</button>
                        <button class="btn btn-primary" id="edit-chapter">编辑章节</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(previewModal);
            requestAnimationFrame(() => previewModal.classList.add('show'));
            
            // 绑定事件
            const closeBtn = previewModal.querySelector('.modal-close');
            const closePreviewBtn = previewModal.querySelector('#close-preview');
            const editChapterBtn = previewModal.querySelector('#edit-chapter');
            const rawBtn = previewModal.querySelector('#preview-raw');
            const renderedBtn = previewModal.querySelector('#preview-rendered');
            const gameBtn = previewModal.querySelector('#preview-game');
            const contentDiv = previewModal.querySelector('#preview-content');
            
            const closeModal = () => {
                document.body.removeChild(previewModal);
            };
            
            closeBtn.addEventListener('click', closeModal);
            closePreviewBtn.addEventListener('click', closeModal);
            
            editChapterBtn.addEventListener('click', () => {
                closeModal();
                this.openChapterForEdit(chapterName);
            });
            
            // 切换预览模式
            rawBtn.addEventListener('click', () => {
                contentDiv.innerHTML = `<pre class="raw-content">${content}</pre>`;
                this.setActivePreviewBtn(rawBtn, [rawBtn, renderedBtn, gameBtn]);
            });
            
            renderedBtn.addEventListener('click', () => {
                const renderedContent = this.renderMarkdown(content);
                contentDiv.innerHTML = `<div class="rendered-content">${renderedContent}</div>`;
                this.setActivePreviewBtn(renderedBtn, [rawBtn, renderedBtn, gameBtn]);
            });
            
            gameBtn.addEventListener('click', () => {
                const gamePreview = this.renderGamePreview(content);
                contentDiv.innerHTML = `<div class="game-preview">${gamePreview}</div>`;
                this.setActivePreviewBtn(gameBtn, [rawBtn, renderedBtn, gameBtn]);
            });
            
        } catch (error) {
            console.error('预览章节失败:', error);
            this.showNotification('预览章节失败: ' + error.message, 'error');
        }
    }

    /**
     * 选择输出目录
     */
    async selectOutputDirectory() {
        console.log('选择输出目录');
        
        try {
            // 打开文件夹选择对话框
            const result = await window.electronAPI.showOpenDialog({
                title: '选择输出目录',
                properties: ['openDirectory']
            });
            
            if (result.canceled || !result.filePaths?.length) {
                return null;
            }
            
            const selectedPath = result.filePaths[0];
            
            // 更新输出路径显示
            const outputPathInput = document.getElementById('output-path');
            if (outputPathInput) {
                outputPathInput.value = selectedPath;
            }
            
            // 保存输出路径
            this.selectedOutputDirectory = selectedPath;
            
            this.showNotification('输出目录选择成功');
            
            return selectedPath;
            
        } catch (error) {
            console.error('选择输出目录失败:', error);
            this.showNotification('选择输出目录失败: ' + error.message, 'error');
            return null;
        }
    }

    // 重复的 loadAssetLibrary 方法已删除，使用前面的完整版本

    /**
     * 加载角色库
     */
    async loadCharacterLibrary() {
        try {
            if (!window.app?.currentProject?.path) {
                console.log('没有当前项目，跳过角色库加载');
                return;
            }
            
            console.log('角色库加载完成');
        } catch (error) {
            console.error('加载角色库失败:', error);
        }
    }

    // 重复的 loadAssetLibrary 方法已删除，使用前面的完整版本

    /**
     * 加载角色库
     */
    async loadCharacterLibrary() {
        try {
            if (!window.app?.currentProject?.path) {
                console.log('没有当前项目，跳过角色库加载');
                return;
            }
            
            console.log('角色库加载完成');
        } catch (error) {
            console.error('加载角色库失败:', error);
        }
    }

    /**
     * 显示打包完成
     */
    showPackageComplete() {
        console.log('打包完成');
        alert('打包完成！');
    }

    /**
     * 刷新资源网格
     */
    refreshAssetGrid() {
        const grid = document.getElementById('assets-grid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        this.assetLibrary.forEach((asset, id) => {
            const assetElement = document.createElement('div');
            assetElement.className = 'asset-item';
            assetElement.dataset.assetId = id;
            assetElement.innerHTML = `
                <div class="asset-preview">
                    <i class="fas fa-${this.getAssetIcon(asset.type)}"></i>
                </div>
                <div class="asset-name">${asset.name}</div>
            `;
            
            // 添加拖拽支持
            assetElement.draggable = true;
            assetElement.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify(asset));
            });
            
            grid.appendChild(assetElement);
        });
    }

    /**
     * 获取资源图标
     */
    getAssetIcon(type) {
        switch (type) {
            case 'image': return 'image';
            case 'audio': return 'music';
            case 'video': return 'video';
            default: return 'file';
        }
    }

    /**
     * 获取文件大小
     */
    async getFileSize(filePath) {
        try {
            const stats = await window.electronAPI.getFileStats(filePath);
            return stats.size;
        } catch (error) {
            return 0;
        }
    }

    /**
     * 加载角色数据
     */
    loadCharacterData(characterId) {
        const character = this.characterLibrary.get(characterId);
        if (!character) return;
        
        const nameInput = document.getElementById('character-name');
        const bioInput = document.getElementById('character-bio');
        const avatarPreview = document.getElementById('character-avatar-preview');
        const voiceSelect = document.getElementById('character-voice');
        
        if (nameInput) nameInput.value = character.name || '';
        if (bioInput) bioInput.value = character.description || '';
        if (voiceSelect) voiceSelect.value = character.voice || '';
        if (avatarPreview && character.avatar) {
            avatarPreview.src = character.avatar;
            avatarPreview.dataset.avatar = character.avatar;
        }
    }

    /**
     * 刷新角色列表
     */
    refreshCharactersList() {
        console.log('刷新角色列表');
        
        // 更新所有角色选择下拉框
        const characterSelects = document.querySelectorAll('.character-select');
        characterSelects.forEach(select => {
            this.populateCharacterSelect(select);
        });
    }

    /**
     * 导入角色设定
     */
    async importCharacterSettings() {
        try {
            const result = await window.electronAPI.showOpenDialog({
                properties: ['openFile'],
                filters: [
                    { name: 'JSON文件', extensions: ['json'] },
                    { name: '所有文件', extensions: ['*'] }
                ]
            });
            const files = (result && !result.canceled && Array.isArray(result.filePaths)) ? result.filePaths : [];
            if (files.length > 0) {
                const contentResult = await window.electronAPI.readFile(files[0]);
                if (!contentResult.success) throw new Error(contentResult.error || 'read file failed');
                const characterData = JSON.parse(contentResult.content);
                
                const id = this.generateCharacterId();
                this.characterLibrary.set(id, { ...characterData, id });
                this.refreshCharactersList();
                
                console.log('角色设定导入完成');
            }
        } catch (error) {
            console.error('导入角色设定失败:', error);
        }
    }



    /**
     * 显示打包错误
     */
    showPackageError(error) {
        console.error('打包错误:', error);
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `
            <div class="error-header">
                <i class="fas fa-exclamation-triangle"></i>
                <span>打包失败</span>
            </div>
            <div class="error-content">
                ${error}
            </div>
        `;
        
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            if (document.body.contains(errorDiv)) {
                document.body.removeChild(errorDiv);
            }
        }, 5000);
    }



    /**
     * 创建资源文件夹
     */
    createAssetFolder() {
        this.showCreateFolderDialog();
    }

    /**
     * 切换资源分类
     */
    switchAssetCategory(category) {
        console.log('切换资源分类:', category);
        
        const grid = document.getElementById('assets-grid');
        if (!grid) return;
        
        // 过滤并显示对应分类的资源
        const filteredAssets = new Map();
        
        this.assetLibrary.forEach((asset, id) => {
            if (category === 'all' || asset.type === category) {
                filteredAssets.set(id, asset);
            }
        });
        
        this.renderAssets(filteredAssets);
    }

    /**
     * 渲染资源列表
     */
    renderAssets(assets) {
        const grid = document.getElementById('assets-grid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        assets.forEach((asset, id) => {
            const assetElement = document.createElement('div');
            assetElement.className = 'asset-item';
            assetElement.innerHTML = `
                <div class="asset-preview">
                    <i class="fas fa-${this.getAssetIcon(asset.type)}"></i>
                </div>
                <div class="asset-name">${asset.name}</div>
            `;
            
            grid.appendChild(assetElement);
        });
    }

    /**
     * 显示背景选择器
     */
    showBackgroundSelector() {
        console.log('显示背景选择器');
        
        try {
            const modal = document.createElement('div');
            modal.className = 'modal background-selector-modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>选择背景图片</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="background-grid" id="background-grid">
                            <p>正在加载背景图片...</p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="cancel-background">取消</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            requestAnimationFrame(() => modal.classList.add('show'));

            // 填充背景图片
            setTimeout(() => {
                try {
                    this.populateBackgroundGrid();
                } catch (error) {
                    console.error('填充背景网格失败:', error);
                    const grid = document.getElementById('background-grid');
                    if (grid) {
                        grid.innerHTML = '<p>加载背景图片失败</p>';
                    }
                }
            }, 100);

            // 绑定事件
            const closeBtn = modal.querySelector('.modal-close');
            const cancelBtn = modal.querySelector('#cancel-background');

            let selectedBackground = null;

            const closeModal = () => {
                document.body.removeChild(modal);
            };

            closeBtn.addEventListener('click', closeModal);
            cancelBtn.addEventListener('click', closeModal);
            
            // 背景选择事件
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('background-item')) {
                    // 清除之前的选择
                    modal.querySelectorAll('.background-item').forEach(item => {
                        item.classList.remove('selected');
                    });
                    
                    // 选择当前项
                    e.target.classList.add('selected');
                    selectedBackground = e.target.dataset.imagePath;
                    
                    // 应用背景到选中的元素
                    if (this.selectedElement && selectedBackground) {
                        this.applyBackgroundToElement(this.selectedElement, selectedBackground);
                        closeModal();
                    }
                }
            });

        } catch (error) {
            console.error('显示背景选择器失败:', error);
            this.showNotification('背景选择器加载失败: ' + error.message, 'error');
        }
    }
    
    /**
     * 将背景应用到元素
     */
    applyBackgroundToElement(element, imagePath) {
        if (!element) return;
        
        // 更新元素的数据属性
        element.dataset.backgroundPath = imagePath;
        
        // 更新元素的预览显示
        const preview = element.querySelector('.background-preview');
        if (preview) {
            const img = preview.querySelector('img');
            const pathText = preview.querySelector('p');
            
            if (img) {
                img.src = imagePath;
                img.style.display = 'block';
            } else {
                // 创建新的图片元素
                const newImg = document.createElement('img');
                newImg.src = imagePath;
                newImg.alt = '背景图片';
                newImg.style.maxWidth = '200px';
                newImg.style.maxHeight = '100px';
                preview.insertBefore(newImg, pathText);
            }
            
            if (pathText) {
                pathText.textContent = `图片路径: ${imagePath}`;
            }
        }
        
        // 触发自动保存
        this.debounceAutoSave();
        
        console.log('背景已应用到元素:', imagePath);
    }

    /**
     * 填充背景图片网格
     */
    populateBackgroundGrid() {
        const grid = document.getElementById('background-grid');
        if (!grid) return;
        
        grid.innerHTML = ''; // 清空现有内容
        
        // 过滤图片资源
        const imageAssets = [];
        this.assetLibrary.forEach((asset, id) => {
            if (asset.type === 'image') {
                imageAssets.push(asset);
            }
        });
        
        if (imageAssets.length === 0) {
            grid.innerHTML = '<p>没有找到图片资源，请先导入背景图片</p>';
            return;
        }
        
        imageAssets.forEach(asset => {
            const bgItem = document.createElement('div');
            bgItem.className = 'background-item';
            bgItem.dataset.imagePath = asset.path;
            bgItem.innerHTML = `
                <img src="${asset.path}" alt="${asset.name}" style="max-width: 150px; max-height: 100px; object-fit: cover;">
                <div class="bg-name">${asset.name}</div>
            `;
            
            grid.appendChild(bgItem);
        });
    }

    /**
     * 设置场景背景
     */
    setSceneBackground(asset) {
        console.log('设置场景背景:', asset.name);
        
        if (this.currentScene) {
            this.currentScene.background = asset.path;
        }
        
        // 更新UI显示
        const bgDisplay = document.getElementById('current-background-display');
        if (bgDisplay) {
            bgDisplay.innerHTML = `
                <img src="${asset.path}" alt="当前背景">
                <span>${asset.name}</span>
            `;
        }
    }



    /**
     * 填充音乐列表
     */
    populateMusicList() {
        const list = document.getElementById('music-list');
        if (!list) return;
        
        list.innerHTML = ''; // 清空现有内容
        
        // 过滤音频资源
        const audioAssets = [];
        this.assetLibrary.forEach((asset, id) => {
            if (asset.type === 'audio') {
                audioAssets.push(asset);
            }
        });
        
        if (audioAssets.length === 0) {
            list.innerHTML = '<p>没有找到音频资源，请先导入音乐文件</p>';
            return;
        }
        
        audioAssets.forEach(asset => {
            const musicItem = document.createElement('div');
            musicItem.className = 'music-item';
            musicItem.dataset.musicPath = asset.path;
            musicItem.innerHTML = `
                <div class="music-icon">
                    <i class="fas fa-music"></i>
                </div>
                <div class="music-info">
                    <div class="music-name">${asset.name}</div>
                    <div class="music-size">${this.formatFileSize(asset.size || 0)}</div>
                </div>
                <div class="music-actions">
                    <button class="btn-small play-music" title="试听" onclick="event.stopPropagation();">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            `;
            
            list.appendChild(musicItem);
        });
    }

    /**
     * 设置场景音乐
     */
    setSceneMusic(asset) {
        console.log('设置场景音乐:', asset.name);
        
        if (this.currentScene) {
            this.currentScene.bgMusic = asset.path;
        }
        
        // 更新UI显示
        const musicDisplay = document.getElementById('current-music-display');
        if (musicDisplay) {
            musicDisplay.innerHTML = `
                <i class="fas fa-music"></i>
                <span>${asset.name}</span>
            `;
        }
    }

    /**
     * 格式化文件大小
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // 刷新场景属性（背景/音乐）下拉框
    refreshBackgroundAndMusicSelects() {
        this.populateBackgroundSelect();
        this.populateMusicSelect();
    }
    populateBackgroundSelect() {
        const select = document.getElementById('background-select');
        if (!select) return;
        const prev = select.value;
        select.innerHTML = '<option value="">选择背景</option>';
        const imgs = [];
        this.assetLibrary.forEach(a => { if (a.type === 'image') imgs.push(a); });
        imgs.sort((a,b) => a.name.localeCompare(b.name));
        imgs.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.path;
            opt.textContent = a.name;
            select.appendChild(opt);
        });
        if (prev) select.value = prev;
    }
    populateMusicSelect() {
        const select = document.getElementById('music-select');
        if (!select) return;
        const prev = select.value;
        select.innerHTML = '<option value="">选择音乐</option>';
        const auds = [];
        this.assetLibrary.forEach(a => { if (a.type === 'audio') auds.push(a); });
        auds.sort((a,b) => a.name.localeCompare(b.name));
        auds.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.path;
            opt.textContent = a.name;
            select.appendChild(opt);
        });
        if (prev) select.value = prev;
    }

    /**
     * AI续写场景
     */
    aiContinueScene() {
        console.log('AI续写场景');
        
        if (window.galGameAIAssistant) {
            window.galGameAIAssistant.generateStory();
        } else {
            console.error('AI助手未初始化');
        }
    }

    /**
     * AI生成图像
     */
    aiGenerateImage() {
        console.log('AI生成图像');
        
        if (window.galGameAIAssistant) {
            window.galGameAIAssistant.generateImage();
        } else {
            console.error('AI助手未初始化');
        }
    }

    /**
     * 编辑元素
     */
    editElement(element) {
        console.log('编辑元素:', element);
        
        // 高亮选中的元素
        const allElements = document.querySelectorAll('.timeline-element');
        allElements.forEach(el => el.classList.remove('editing'));
        element.classList.add('editing');
        
        // 聚焦到第一个输入框
        const firstInput = element.querySelector('input, textarea');
        if (firstInput) {
            firstInput.focus();
        }
    }



    /**
     * 获取AI模式标签
     */
    getAIModeLabel(mode) {
        switch (mode) {
            case 'dialogue': return '对话生成';
            case 'story': return '剧情续写';
            case 'image': return '图像生成';
            case 'agent': return 'AI代理';
            default: return '未知模式';
        }
    }

    /**
     * 生成对话
     */
    generateDialogue() {
        if (window.galGameAIAssistant) {
            window.galGameAIAssistant.generateDialogue();
        }
    }

    /**
     * 生成故事
     */
    generateStory() {
        if (window.galGameAIAssistant) {
            window.galGameAIAssistant.generateStory();
        }
    }

    /**
     * 生成图像
     */
    generateImage() {
        if (window.galGameAIAssistant) {
            window.galGameAIAssistant.generateImage();
        }
    }

    /**
     * 接受AI结果
     */
    acceptAIResult() {
        console.log('接受AI结果');
        
        const aiResultPanel = document.getElementById('ai-result-panel');
        if (aiResultPanel) {
            aiResultPanel.style.display = 'none';
        }
    }

    /**
     * 重新生成AI内容
     */
    regenerateAIContent() {
        console.log('重新生成AI内容');
        
        // 重新调用当前的AI生成方法
        if (window.galGameAIAssistant) {
            const currentMode = window.galGameAIAssistant.currentMode;
            switch (currentMode) {
                case 'dialogue':
                    this.generateDialogue();
                    break;
                case 'story':
                    this.generateStory();
                    break;
                case 'image':
                    this.generateImage();
                    break;
            }
        }
    }

    /**
     * 拒绝AI结果
     */
    rejectAIResult() {
        console.log('拒绝AI结果');
        
        const aiResultPanel = document.getElementById('ai-result-panel');
        if (aiResultPanel) {
            aiResultPanel.style.display = 'none';
        }
    }

    // === 辅助方法 ===

    /**
     * 显示通知消息
     */
    showNotification(message, type = 'info') {
        console.log('Notification:', message);
        
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span class="notification-message">${message}</span>
            <button class="notification-close">&times;</button>
        `;
        
        // 添加到页面
        document.body.appendChild(notification);
        
        // 自动显示
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // 绑定关闭事件
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            this.hideNotification(notification);
        });
        
        // 自动隐藏
        setTimeout(() => {
            this.hideNotification(notification);
        }, 3000);
    }

    /**
     * 隐藏通知
     */
    hideNotification(notification) {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }

    /**
     * 解析文本格式的角色设定
     */
    parseTextCharacterSettings(content) {
        const lines = content.split('\n');
        const character = {
            name: '',
            bio: '',
            personality: '',
            relationships: {},
            customProps: {}
        };
        
        let currentSection = '';
        
        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            
            // 检查是否是章节标题
            if (line.startsWith('#') || line.includes('名称') || line.includes('姓名')) {
                currentSection = 'name';
            } else if (line.includes('简介') || line.includes('背景')) {
                currentSection = 'bio';
            } else if (line.includes('性格') || line.includes('特点')) {
                currentSection = 'personality';
            } else if (line.includes('关系')) {
                currentSection = 'relationships';
            } else {
                // 内容行
                if (currentSection === 'name' && !character.name) {
                    character.name = line.replace(/^[#\s]*/, '');
                } else if (currentSection === 'bio') {
                    character.bio += (character.bio ? '\n' : '') + line;
                } else if (currentSection === 'personality') {
                    character.personality += (character.personality ? '\n' : '') + line;
                }
            }
        }
        
        // 如果没有解析到名称，使用第一行作为名称
        if (!character.name && lines.length > 0) {
            character.name = lines[0].trim().replace(/^[#\s]*/, '');
        }
        
        return character;
    }

    /**
     * 导入单个角色
     */
    importSingleCharacter(characterData) {
        try {
            // 验证必要字段
            if (!characterData.name) {
                console.warn('角色缺少名称字段');
                return false;
            }
            
            // 生成ID
            const characterId = characterData.id || this.generateCharacterId();
            
            // 标准化角色数据
            const standardizedCharacter = {
                id: characterId,
                name: characterData.name,
                bio: characterData.bio || characterData.biography || characterData.description || '',
                personality: characterData.personality || characterData.traits || '',
                avatar: characterData.avatar || characterData.image || '',
                relationships: characterData.relationships || {},
                customProps: characterData.customProps || characterData.custom || {},
                created: new Date().toISOString(),
                modified: new Date().toISOString()
            };
            
            // 保存到角色库
            this.characterLibrary.set(characterId, standardizedCharacter);
            
            return true;
        } catch (error) {
            console.error('导入角色失败:', error);
            return false;
        }
    }

    /**
     * 填充音乐文件列表
     */
    async populateMusicList() {
        const musicList = document.getElementById('music-list');
        if (!musicList) return;
        
        // 获取音频资源
        const audioAssets = Array.from(this.assetLibrary.values()).filter(asset => 
            asset.type === 'audio' || /\.(mp3|wav|ogg|m4a)$/i.test(asset.name)
        );
        
        if (audioAssets.length === 0) {
            musicList.innerHTML = '<div class="no-assets">暂无音乐文件</div>';
            return;
        }
        
        musicList.innerHTML = audioAssets.map(asset => `
            <div class="music-item" data-music-path="${asset.path}">
                <div class="music-info">
                    <div class="music-name">${asset.name}</div>
                    <div class="music-path">${asset.relativePath || asset.path}</div>
                </div>
            </div>
        `).join('');
    }

    /**
     * 设置活动预览按钮
     */
    setActivePreviewBtn(activeBtn, allBtns) {
        allBtns.forEach(btn => btn.classList.remove('active'));
        activeBtn.classList.add('active');
    }

    /**
     * 渲染Markdown内容
     */
    renderMarkdown(content) {
        // 简单的Markdown渲染，可以后续使用专门的库替换
        return content
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
            .replace(/\*(.*)\*/gim, '<em>$1</em>')
            .replace(/\n/gim, '<br>');
    }

    /**
     * 渲染游戏预览
     */
    renderGamePreview(content) {
        // 解析GalGame特有的语法
        const lines = content.split('\n');
        let html = '<div class="game-preview-content">';
        
        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            
            // 对话格式：角色名：对话内容
            if (line.includes('：') || line.includes(':')) {
                const parts = line.split(/[：:]/);
                if (parts.length >= 2) {
                    const character = parts[0].trim();
                    const dialogue = parts.slice(1).join(':').trim();
                    html += `
                        <div class="game-dialogue">
                            <div class="character-name">${character}</div>
                            <div class="dialogue-text">${dialogue}</div>
                        </div>
                    `;
                    continue;
                }
            }
            
            // 旁白或描述
            html += `<div class="game-narration">${line}</div>`;
        }
        
        html += '</div>';
        return html;
    }

    /**
     * 打开章节进行编辑
     */
    openChapterForEdit(chapterName) {
        console.log('打开章节编辑:', chapterName);
        // 触发主编辑器的章节打开事件
        if (window.app && window.app.openChapter) {
            window.app.openChapter(chapterName);
        }
    }

    /**
     * 更新元素属性
     */
    updateElementProperty(element, property, value) {
        if (!element) return;
        
        element.dataset[property] = value;
        
        // 触发元素更新事件
        const event = new CustomEvent('elementUpdated', {
            detail: {
                element: element,
                property: property,
                value: value
            }
        });
        
        element.dispatchEvent(event);
    }

    /**
     * 显示文本编辑器
     */
    showTextEditor(element) {
        console.log('显示文本编辑器');
        // 实现文本编辑器显示逻辑
    }

    /**
     * 显示角色编辑器
     */
    showCharacterEditor(element) {
        console.log('显示角色编辑器');
        // 实现角色编辑器显示逻辑
    }

    /**
     * 显示背景编辑器
     */
    showBackgroundEditor(element) {
        console.log('显示背景编辑器');
        // 实现背景编辑器显示逻辑
    }

    /**
     * 显示音乐编辑器
     */
    showMusicEditor(element) {
        console.log('显示音乐编辑器');
        // 实现音乐编辑器显示逻辑
    }

    /**
     * 显示效果编辑器
     */
    showEffectEditor(element) {
        console.log('显示效果编辑器');
        // 实现效果编辑器显示逻辑
    }

    /**
     * 显示通用编辑器
     */
    showGenericEditor(element) {
        console.log('显示通用编辑器');
        // 实现通用编辑器显示逻辑
    }

    /**
     * 更新属性面板
     */
    updatePropertyPanel(element) {
        console.log('更新属性面板');
        // 实现属性面板更新逻辑
    }

    /**
     * 加载场景到预览
     */
    loadSceneToPreview() {
        console.log('加载场景到预览');
        const debugScreen = document.getElementById('debug-game-screen');
        if (debugScreen && this.currentScene) {
            debugScreen.innerHTML = `
                <div class="scene-preview">
                    <h3>场景预览: ${this.currentScene.name || '未命名场景'}</h3>
                    <div class="scene-elements">
                        <!-- 场景元素预览 -->
                    </div>
                </div>
            `;
        }
    }

    /**
     * 获取打包设置
     */
    getPackageSettings() {
        // 优先使用 project 内定义的 productName/metadata.name/name，回退到项目文件夹名，再回退到 '未命名项目'
        let projectName = '未命名项目';
        try {
            const p = window.app?.currentProject;
            if (p) projectName = p.productName || p.metadata?.name || p.name || projectName;
            if ((!projectName || !projectName.trim()) && this.currentProjectPath) {
                projectName = window.path?.basename ? window.path.basename(this.currentProjectPath) : (this.currentProjectPath.split(/[\\\/]/).pop() || projectName);
            }
        } catch (e) {}
        return {
            projectName,
            version: '1.0.0',
            outputPath: this.selectedOutputDirectory || 'dist',
            platform: 'web',
            testMode: false
        };
    }

    /**
     * 显示创建文件夹对话框
     */
    showCreateFolderDialog() {
        const modal = document.createElement('div');
        modal.className = 'modal create-folder-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>创建资源文件夹</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="folder-name">文件夹名称:</label>
                        <input type="text" id="folder-name" placeholder="请输入文件夹名称">
                    </div>
                    <div class="form-group">
                        <label for="folder-type">文件夹类型:</label>
                        <select id="folder-type">
                            <option value="images">图片</option>
                            <option value="audio">音频</option>
                            <option value="video">视频</option>
                            <option value="fonts">字体</option>
                            <option value="other">其他</option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="cancel-create">取消</button>
                    <button class="btn btn-primary" id="confirm-create">创建</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));
        
        const input = modal.querySelector('#folder-name');
        const typeSelect = modal.querySelector('#folder-type');
        const confirmBtn = modal.querySelector('#confirm-create');
        const cancelBtn = modal.querySelector('#cancel-create');
        const closeBtn = modal.querySelector('.modal-close');
        
        const closeModal = () => {
            document.body.removeChild(modal);
        };
        
        confirmBtn.addEventListener('click', () => {
            const folderName = input.value.trim();
            const folderType = typeSelect.value;
            
            if (folderName) {
                this.confirmCreateFolder(folderName, folderType);
                closeModal();
            } else {
                this.showNotification('请输入文件夹名称', 'error');
            }
        });
        
        cancelBtn.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
        
        input.focus();
    }
    /**
     * 缺失方法的实现
     */
    
    // AI相关方法
    switchAIMode() {
        console.log('切换AI模式');
        // 实现AI模式切换逻辑
    }
    
    generateDialogue() {
        console.log('生成对话');
        // 实现对话生成逻辑
    }
    
    aiContinueScene() {
        console.log('AI继续场景');
        // 实现AI场景续写逻辑
    }
    
    aiGenerateImage() {
        console.log('AI生成图片');
        // 实现AI图片生成逻辑
    }
    
    // 角色管理方法
    importCharacterSettings() {
        console.log('导入角色设置');
        // 实现角色设置导入逻辑
    }
    
    clearCharacterForm() {
        const form = document.querySelector('#character-form');
        if (form) {
            form.reset();
        }
        console.log('清空角色表单');
    }
    
    refreshCharactersList() {
        console.log('刷新角色列表');
        // 实现角色列表刷新逻辑
    }
    
    // 场景编辑方法
    editElement(elementId) {
        console.log('编辑元素:', elementId);
        // 实现元素编辑逻辑
    }
    
    // 预览相关方法
    startDebugPreview() {
        console.log('开始调试预览');
        // 实现调试预览逻辑
    }
    
    // 资源管理方法
    createAssetFolder() {
        console.log('创建资源文件夹');
        // 实现资源文件夹创建逻辑
    }
    
    createFolder() {
        console.log('创建文件夹');
        // 实现文件夹创建逻辑
    }
    
    switchAssetCategory(category) {
        console.log('切换资源分类:', category);
        // 实现资源分类切换逻辑
    }
    
    showBackgroundSelector() {
        console.log('显示背景选择器');
        // 实现背景选择器逻辑
    }
    
    showMusicSelector() {
        console.log('显示音乐选择器');
        // 实现音乐选择器逻辑
    }
    
    // 打包相关方法
    testPackaging() {
        console.log('测试打包');
        // 实现打包测试逻辑
    }
    
    showPackageError(error) {
        console.error('打包错误:', error);
        // 实现打包错误显示逻辑
    }
    
    /**
     * 保存项目 - 修复保存功能
     */
    async saveProject() {
        try {
            if (!window.app?.currentProject) {
                this.showAlert('错误', '没有打开的项目', 'error');
                return false;
            }

            console.log('开始保存项目...');
            
            // 获取项目路径
            const projectPath = this.getCurrentProjectPath();
            const projectData = window.app.currentProject;
            
            // 保存主项目文件
            const projectFilePath = `${projectPath}/${projectData.name}.json`;
            await window.electronAPI.writeFile(projectFilePath, JSON.stringify(projectData, null, 2));
            
            // 保存资源库
            await this.saveAssetLibraryToProject();
            
            // 保存角色库
            await this.saveCharacterLibraryToProject();
            
            // 保存章节内容
            await this.saveCurrentChapter();
            
            this.showToast('项目已保存', 'success');
            console.log('项目保存完成');
            return true;
            
        } catch (error) {
            console.error('保存项目失败:', error);
            this.showAlert('保存失败', `保存项目时出错: ${error.message}`, 'error');
            return false;
        }
    }
    
    /**
     * 保存当前章节 - 使用章节状态管理器
     */
    async saveCurrentChapter() {
        try {
            if (this.chapterStateManager) {
                // 如果章节管理器缺少ID，尝试从当前章节或UI上补全
                if (!this.chapterStateManager.getCurrentChapterId() && this.currentChapter?.id) {
                    this.chapterStateManager.setCurrentChapter({ id: this.currentChapter.id, title: this.currentChapter.title });
                }
                return await this.chapterStateManager.saveCurrentChapter(this);
            } else {
                // 备用方案：使用原有逻辑
                return await this.saveCurrentChapterLegacy();
            }
        } catch (error) {
            console.error('保存章节失败:', error);
            throw error;
        }
    }

    /**
     * 备用的章节保存方法
     */
    async saveCurrentChapterLegacy() {
        try {
            const appCtx = window.appManager || window.app;
            if (!this.currentChapter || !appCtx?.currentProject) {
                console.warn('无法保存章节: 缺少currentChapter或currentProject');
                return;
            }
            
            // 调试信息
            console.log('保存章节 - currentChapter:', this.currentChapter);
            console.log('保存章节 - currentChapter.id:', this.currentChapter.id);
            
            if (!this.currentChapter.id || this.currentChapter.id === 'undefined') {
                console.error('章节ID无效:', this.currentChapter.id);
                
                // 尝试生成新的章节ID
                if (!this.currentChapter.id) {
                    const newChapterId = `chapter_${Date.now()}`;
                    console.warn('生成新的章节ID:', newChapterId);
                    this.currentChapter.id = newChapterId;
                    
                    // 添加到项目章节列表
                    if (!appCtx.currentProject.chapters) {
                        appCtx.currentProject.chapters = [];
                    }
                    appCtx.currentProject.chapters.push({
                        id: newChapterId,
                        title: this.currentChapter.title || '新章节',
                        file: `chapters/${newChapterId}/content.json`
                    });
                } else {
                    throw new Error('章节ID无效，无法保存');
                }
            }
            
            const projectPath = appCtx.currentProject.path;
            const chapterPath = `${projectPath}/chapters/${this.currentChapter.id}/content.json`;
            
            console.log('章节保存路径:', chapterPath);
            
            // 确保chapters目录存在
            const chaptersDir = `${projectPath}/chapters/${this.currentChapter.id}`;
            await window.electronAPI.ensureDir(chaptersDir);
            
            // 收集场景属性
            const sceneProperties = this.collectSceneProperties();
            
            // 收集当前编辑器中的章节数据（直接elements数组，无scene层级）
            const chapterData = {
                id: this.currentChapter.id,
                title: this.currentChapter.title,
                sceneProperties: sceneProperties,
                elements: this.collectChapterData()
            };
            
            await window.electronAPI.writeFile(chapterPath, JSON.stringify(chapterData, null, 2));
            console.log('章节已保存:', chapterPath);
            
            // 同步更新内存中的章节数据
            this.currentChapter = chapterData;
            
            // 更新项目数据中的章节引用
            if (appCtx?.currentProject?.chapters) {
                const chapterIndex = appCtx.currentProject.chapters.findIndex(ch => ch.id === chapterData.id);
                if (chapterIndex >= 0) {
                    appCtx.currentProject.chapters[chapterIndex] = {
                        id: chapterData.id,
                        title: chapterData.title,
                        file: `chapters/${chapterData.id}/content.json`
                    };
                }
            }
            
        } catch (error) {
            console.error('保存章节失败:', error);
            throw error;
        }
    }

    /**
     * 加载场景属性到界面
     */
    loadSceneProperties(sceneProperties) {
        try {
            // 先清空所有场景属性
            this.clearSceneProperties();
            
            if (!sceneProperties) {
                console.log('[UIController] 没有场景属性数据，保持清空状态');
                return;
            }
            
            // 场景名称
            const sceneNameInput = document.getElementById('scene-name');
            if (sceneNameInput) {
                sceneNameInput.value = sceneProperties.sceneName || '';
            }
            
            // 背景图片
            const backgroundSelect = document.getElementById('background-select');
            if (backgroundSelect && sceneProperties.backgroundImage) {
                backgroundSelect.value = sceneProperties.backgroundImage;
            }
            
            // 背景音乐
            const musicSelect = document.getElementById('music-select');
            if (musicSelect && sceneProperties.backgroundMusic) {
                musicSelect.value = sceneProperties.backgroundMusic;
            }
            
            console.log('[UIController] 场景属性已加载:', sceneProperties);
            
        } catch (error) {
            console.error('[UIController] 加载场景属性失败:', error);
        }
    }

    /**
     * 清空场景属性
     */
    clearSceneProperties() {
        try {
            // 清空场景名称
            const sceneNameInput = document.getElementById('scene-name');
            if (sceneNameInput) {
                sceneNameInput.value = '';
            }
            
            // 重置背景图片选择
            const backgroundSelect = document.getElementById('background-select');
            if (backgroundSelect) {
                backgroundSelect.selectedIndex = 0; // 选择第一个选项（通常是"选择背景"）
            }
            
            // 重置背景音乐选择
            const musicSelect = document.getElementById('music-select');
            if (musicSelect) {
                musicSelect.selectedIndex = 0; // 选择第一个选项（通常是"选择音乐"）
            }
            
            console.log('[UIController] 场景属性已清空');
            
        } catch (error) {
            console.error('[UIController] 清空场景属性失败:', error);
        }
    }
    collectSceneProperties() {
        const sceneNameInput = document.getElementById('scene-name');
        const backgroundSelect = document.getElementById('background-select');
        const musicSelect = document.getElementById('music-select');
        
        return {
            sceneName: sceneNameInput?.value || '',
            backgroundImage: backgroundSelect?.value || '',
            backgroundMusic: musicSelect?.value || ''
        };
    }
    
    /**
     * 清空场景编辑器
     */
    clearSceneEditor() {
        try {
            // 清空时间轴
            const timeline = document.getElementById('scene-timeline');
            if (timeline) {
                timeline.innerHTML = '';
            }
            
            // 不重置当前章节对象，避免后续访问 this.currentChapter.title 为空
            // 只清空临时选择与UI
            this.selectedElement = null;
            
            console.log('场景编辑器已清空');
        } catch (error) {
            console.error('清空场景编辑器失败:', error);
        }
    }
    
    /**
     * 将章节数据渲染到编辑器
     */
    renderChapterToEditor(chapter) {
        try {
            if (!chapter) {
                console.log('章节为空，跳过渲染');
                return;
            }
            
            const timeline = document.getElementById('scene-timeline');
            if (!timeline) {
                console.warn('找不到场景时间轴容器');
                return;
            }
            
            // 应用场景属性到 UI
            if (chapter.sceneProperties) {
                this.applyScenePropertiesToUI(chapter.sceneProperties);
            }
            
            // 渲染时间轴元素 - 只渲染文本、对话、选项等，不渲染背景/音乐
            if (chapter.elements && Array.isArray(chapter.elements)) {
                chapter.elements.forEach((element, index) => {
                    if (this.shouldRenderToTimeline(element)) {
                        this.renderElementToTimeline(element, index);
                    }
                });
                
                // 渲染完成后填充所有角色下拉框和设置选中值
                setTimeout(() => {
                    this.refreshAllCharacterSelects();
                    
                    // 设置每个元素的角色选中值
                    chapter.elements.forEach((element, index) => {
                        if (element.type === 'text' && element.character) {
                            const elementDiv = document.querySelector(`[data-index="${index}"]`);
                            if (elementDiv) {
                                const characterSelect = elementDiv.querySelector('.character-select');
                                if (characterSelect) {
                                    characterSelect.value = element.character;
                                }
                            }
                        }
                    });
                    
                    // 重新绑定所有时间轴元素的事件
                    const timelineElements = document.querySelectorAll('.timeline-element');
                    timelineElements.forEach(element => {
                        this.bindElementEvents(element);
                    });
                    
                }, 100);
                
                // 渲染完成后将时间轴滚动到顶部
                try { timeline.scrollTop = 0; } catch {}
                console.log(`渲染了 ${chapter.elements.filter(e => this.shouldRenderToTimeline(e)).length} 个时间轴元素`);
            }
            
        } catch (error) {
            console.error('渲染章节到编辑器失败:', error);
        }
    }

    /**
     * 判断元素是否应该渲染到时间轴
     */
    shouldRenderToTimeline(element) {
        // 背景和音乐应该应用到场景属性，不显示在时间轴
        const timelineTypes = ['text', 'dialogue', 'narration', 'choice', 'condition', 'variable', 'character'];
        return timelineTypes.includes(element.type);
    }

    /**
     * 应用场景属性到UI
     */
    applyScenePropertiesToUI(sceneProperties) {
        const sceneNameInput = document.getElementById('scene-name');
        const backgroundSelect = document.getElementById('background-select');
        const musicSelect = document.getElementById('music-select');
        
        if (sceneNameInput && sceneProperties.sceneName) {
            sceneNameInput.value = sceneProperties.sceneName;
        }
        
        if (backgroundSelect && sceneProperties.backgroundImage) {
            backgroundSelect.value = sceneProperties.backgroundImage;
        }
        
        if (musicSelect && sceneProperties.backgroundMusic) {
            musicSelect.value = sceneProperties.backgroundMusic;
        }
    }
    
    /**
     * 将元素渲染到时间轴
     */
    /**
     * 渲染单个元素到时间轴 - 使用统一渲染器
     */
    renderElementToTimeline(element, index) {
        try {
            const timeline = document.getElementById('scene-timeline');
            if (!timeline) {
                console.warn('找不到场景时间轴容器');
                return;
            }
            
            let elementHtml = '';
            
            if (this.timelineRenderer) {
                // 使用统一的时间轴渲染器
                elementHtml = this.timelineRenderer.renderElementToTimeline(element, index);
            } else {
                // 备用方案：使用原有逻辑
                elementHtml = this.renderElementToTimelineLegacy(element, index);
            }
            
            if (elementHtml) {
                timeline.insertAdjacentHTML('beforeend', elementHtml);
                
                // 获取刚插入的元素并绑定事件
                const insertedElement = timeline.lastElementChild;
                if (insertedElement && this.timelineRenderer) {
                    this.timelineRenderer.bindElementEvents(insertedElement, this);
                } else if (insertedElement) {
                    this.bindElementEvents(insertedElement);
                }

                // 渲染后刷新字数统计
                if (typeof this.updateWordCount === 'function') {
                    this.updateWordCount();
                }
            }
            
        } catch (error) {
            console.error('渲染元素到时间轴失败:', error);
        }
    }

    /**
     * 备用的元素渲染方法
     */
    renderElementToTimelineLegacy(element, index) {
        switch (element.type) {
            case 'text':
                return this.createTextElementHtml(element, index);
            case 'choice':
                return this.createChoiceElementHtml(element, index);
            case 'background':
                return this.createBackgroundElementHtml(element, index);
            case 'music':
                return this.createMusicElementHtml(element, index);
            default:
                console.warn('未知的元素类型:', element.type);
                return '';
        }
    }
    
    /**
     * 创建文本元素HTML
     */
    createTextElementHtml(element, index) {
        const characterName = element.character || '旁白';
        const text = element.text || '';
        
        return `
            <div class="timeline-element text-element" data-index="${index}" data-type="text">
                <div class="element-header">
                    <div class="element-type-icon">
                        <i class="fas fa-comment"></i>
                    </div>
                    <div class="element-info">
                        <div class="element-title">${characterName}</div>
                        <div class="element-preview">${text.substring(0, 50)}${text.length > 50 ? '...' : ''}</div>
                    </div>
                    <div class="element-actions">
                        <button class="btn-small edit-element" title="编辑">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-small delete-element" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="element-content">
                    <div class="form-group">
                        <label>角色:</label>
                        <select class="character-select">
                            <option value="">旁白</option>
                            <!-- 动态加载角色列表 -->
                        </select>
                    </div>
                    <div class="form-group">
                        <label>文本内容:</label>
                        <textarea class="text-content" rows="3">${text}</textarea>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * 创建选择元素HTML
     */
    createChoiceElementHtml(element, index) {
        const description = element.description || '玩家选择';
        const choices = element.choices || [];
        
        let choicesHtml = '';
        choices.forEach((choice, choiceIndex) => {
            choicesHtml += `
                <div class="choice-option" data-choice-index="${choiceIndex}">
                    <div class="option-row">
                        <label>选项${choiceIndex + 1}:</label>
                        <input type="text" class="choice-text" value="${choice.text || ''}" placeholder="选择${choiceIndex + 1}的文本">
                    </div>
                    <div class="option-row">
                        <label>跳转:</label>
                        <input type="text" class="choice-target" value="${choice.target || ''}" placeholder="目标章节或场景">
                    </div>
                    <div class="option-actions">
                        <button class="btn-small btn-danger remove-choice-option" title="删除选项">
                            <i class="fas fa-minus"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        // 如果没有选项，添加默认的两个选项
        if (choices.length === 0) {
            choicesHtml = `
                <div class="choice-option" data-choice-index="0">
                    <div class="option-row">
                        <label>选项1:</label>
                        <input type="text" class="choice-text" placeholder="选择1的文本">
                    </div>
                    <div class="option-row">
                        <label>跳转:</label>
                        <input type="text" class="choice-target" placeholder="目标章节或场景">
                    </div>
                    <div class="option-actions">
                        <button class="btn-small btn-danger remove-choice-option" title="删除选项">
                            <i class="fas fa-minus"></i>
                        </button>
                    </div>
                </div>
                <div class="choice-option" data-choice-index="1">
                    <div class="option-row">
                        <label>选项2:</label>
                        <input type="text" class="choice-text" placeholder="选择2的文本">
                    </div>
                    <div class="option-row">
                        <label>跳转:</label>
                        <input type="text" class="choice-target" placeholder="目标章节或场景">
                    </div>
                    <div class="option-actions">
                        <button class="btn-small btn-danger remove-choice-option" title="删除选项">
                            <i class="fas fa-minus"></i>
                        </button>
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="timeline-element choice-element" data-index="${index}" data-type="choice">
                <div class="element-header">
                    <div class="element-type-icon">
                        <i class="fas fa-question-circle"></i>
                    </div>
                    <div class="element-info">
                        <div class="element-title">选择分支</div>
                        <div class="element-preview">${description} (${choices.length} 个选项)</div>
                    </div>
                    <div class="element-actions">
                        <button class="btn-small add-choice-option" title="添加选项">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button class="btn-small edit-element" title="编辑">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-small delete-element" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="element-content">
                    <div class="choice-setup">
                        <label>选择描述:</label>
                        <input type="text" class="choice-description" value="${description}" placeholder="描述这个选择的情况...">
                        <div class="choice-options">
                            ${choicesHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * 创建背景元素HTML
     */
    createBackgroundElementHtml(element, index) {
        const backgroundPath = element.background || '无背景';
        const fileName = backgroundPath.split('/').pop() || backgroundPath;
        
        return `
            <div class="timeline-element background-element" data-index="${index}" data-type="background">
                <div class="element-header">
                    <div class="element-type-icon">
                        <i class="fas fa-image"></i>
                    </div>
                    <div class="element-info">
                        <div class="element-title">背景图片</div>
                        <div class="element-preview">${fileName}</div>
                    </div>
                    <div class="element-actions">
                        <button class="btn-icon edit-element" title="编辑">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon delete-element" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * 创建音乐元素HTML
     */
    createMusicElementHtml(element, index) {
        const musicPath = element.music || '无音乐';
        const fileName = musicPath.split('/').pop() || musicPath;
        
        return `
            <div class="timeline-element music-element" data-index="${index}" data-type="music">
                <div class="element-header">
                    <div class="element-type-icon">
                        <i class="fas fa-music"></i>
                    </div>
                    <div class="element-info">
                        <div class="element-title">背景音乐</div>
                        <div class="element-preview">${fileName}</div>
                    </div>
                    <div class="element-actions">
                        <button class="btn-icon edit-element" title="编辑">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon delete-element" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * 更新章节标题显示
     */
    updateChapterTitleDisplay(title) {
        try {
            const titleElements = document.querySelectorAll('.chapter-title, .current-chapter-title');
            titleElements.forEach(element => {
                element.textContent = title || '未命名章节';
            });
        } catch (error) {
            console.error('更新章节标题显示失败:', error);
        }
    }
    
    /**
     * 收集章节数据 - 移除scene概念，直接使用chapter.elements
     */
    collectChapterData() {
        try {
            // 从编辑器界面收集章节元素数据
            const timelineElements = document.querySelectorAll('.timeline-element');
            const elements = [];
            
            timelineElements.forEach((element, index) => {
                const elementData = this.extractElementData(element);
                if (elementData) {
                    elementData.id = `element_${index}`;
                    elements.push(elementData);
                }
            });
            
            return elements;
            
        } catch (error) {
            console.error('收集章节数据失败:', error);
            return [];
        }
    }
    
    /**
     * 提取元素数据
     */
    extractElementData(element) {
        const type = this.getElementType(element);
        
        switch (type) {
            case 'text':
                return this.extractTextElementData(element);
            case 'choice':
                return this.extractChoiceElementData(element);
            case 'background':
                return this.extractBackgroundElementData(element);
            case 'music':
                return this.extractMusicElementData(element);
            case 'character':
                return this.extractCharacterElementData(element);
            default:
                return null;
        }
    }
    
    /**
     * 提取文本元素数据
     */
    extractTextElementData(element) {
        const characterSelect = element.querySelector('.character-select');
        const characterInput = element.querySelector('.character-input');
        const textContent = element.querySelector('.text-content');
        
        return {
            type: 'text',
            character: (characterInput?.value || characterSelect?.value || null),
            text: textContent?.value || ''
        };
    }
    
    /**
     * 提取选择元素数据
     */
    extractChoiceElementData(element) {
        const description = element.querySelector('.choice-description');
        const choices = [];
        
        const choiceOptions = element.querySelectorAll('.choice-option');
        choiceOptions.forEach(option => {
            const textInput = option.querySelector('.choice-text');
            const targetInput = option.querySelector('.choice-target');
            
            if (textInput?.value) {
                const target = (targetInput?.value || '').trim();
                const entry = {
                    text: textInput.value
                };
                // 兼容两种结构：顶层 target 和 action.target 都写入
                if (target) {
                    entry.target = target;
                    entry.action = { type: 'jump', target };
                }
                choices.push(entry);
            }
        });
        
        return {
            type: 'choice',
            description: description?.value || '',
            choices: choices
        };
    }

    // 章节选择弹窗
    async openChapterPickerModal(onPick) {
        try {
            let chapters = [];
            const projectPath = this.getCurrentProjectPath();

            // 1) 内存中的当前项目
            if (Array.isArray(window.app?.currentProject?.chapters)) {
                chapters = window.app.currentProject.chapters;
            }
            // 2) 项目管理器 API
            if ((!chapters || chapters.length === 0) && window.galGameProjectManager?.getChaptersList && projectPath) {
                try { chapters = await window.galGameProjectManager.getChaptersList(projectPath); } catch {}
            }
            // 3) project.json
            if ((!chapters || chapters.length === 0) && projectPath) {
                try {
                    const projectFile = `${projectPath}/project.json`;
                    const res = await window.electronAPI.readFile(projectFile);
                    if (res?.success && res.content) {
                        const cfg = JSON.parse(res.content);
                        const cj = cfg?.chapters;
                        if (Array.isArray(cj)) {
                            chapters = cj.map(c => ({ id: c.id || String(c), title: c.title || String(c.id || c) }));
                        } else if (cj && typeof cj === 'object') {
                            chapters = Object.keys(cj).map(k => {
                                const v = cj[k];
                                return { id: k, title: (typeof v === 'string') ? v : (v?.title || k) };
                            });
                        }
                    }
                } catch {}
            }
            // 4) 扫描 chapters 目录
            if ((!chapters || chapters.length === 0) && projectPath) {
                try {
                    const dir = `${projectPath}/chapters`;
                    const entries = await window.electronAPI.fsReaddir(dir);
                    const list = [];
                    for (const id of entries || []) {
                        if (!id || id.startsWith('.')) continue;
                        let title = id;
                        try {
                            const jsonPath = `${dir}/${id}/${id}.json`;
                            const altJsonPath = `${dir}/${id}/content.json`;
                            let fileRes = await window.electronAPI.readFile(jsonPath);
                            if (!fileRes?.success) fileRes = await window.electronAPI.readFile(altJsonPath);
                            if (fileRes?.success) {
                                const content = JSON.parse(fileRes.content);
                                title = content?.title || id;
                            }
                        } catch {}
                        list.push({ id, title });
                    }
                    chapters = list;
                } catch {}
            }

            const modal = document.createElement('div');
            modal.className = 'modal chapter-picker-modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>选择章节</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="picker-search"><input type="text" placeholder="搜索章节标题或ID..."></div>
                        <div class="picker-list">
                            ${chapters && chapters.length ? chapters.map((c,i)=>`<div class="picker-item" data-id="${c.id}"><span class="pi-index">${i+1}</span><span class="pi-title">${c.title||c.id}</span><span class="pi-id">${c.id}</span></div>`).join('') : `<div class="picker-empty">未找到章节，请先创建章节</div>`}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary picker-cancel">取消</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            requestAnimationFrame(()=>modal.classList.add('show'));

            const close = () => { modal.classList.remove('show'); setTimeout(()=>modal.remove(),200); };
            modal.querySelector('.modal-close')?.addEventListener('click', close);
            modal.querySelector('.picker-cancel')?.addEventListener('click', close);
            modal.addEventListener('click', (e)=>{ if(e.target===modal) close(); });
            modal.querySelectorAll('.picker-item').forEach(item=>{
                item.addEventListener('click', ()=>{
                    const id = item.getAttribute('data-id');
                    const found = chapters.find(c=>c.id===id);
                    onPick?.(found||{id});
                    close();
                });
            });
            const searchInput = modal.querySelector('.picker-search input');
            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    const q = searchInput.value.trim().toLowerCase();
                    modal.querySelectorAll('.picker-item').forEach(item => {
                        const title = item.querySelector('.pi-title')?.textContent?.toLowerCase() || '';
                        const id = item.querySelector('.pi-id')?.textContent?.toLowerCase() || '';
                        item.style.display = (!q || title.includes(q) || id.includes(q)) ? '' : 'none';
                    });
                });
            }
        } catch (e) {
            console.warn('打开章节选择器失败:', e?.message);
        }
    }

    // 角色选择弹窗（补回并统一样式）
    async openCharacterPickerModal(onPick) {
        try {
            let characters = [];
            const projectPath = this.getCurrentProjectPath();
            if (projectPath) {
                try {
                    const res = await window.electronAPI.readFile(`${projectPath}/characters/characters.json`);
                    if (res?.success) {
                        const data = JSON.parse(res.content);
                        if (Array.isArray(data)) characters = data;
                        else if (data?.characters) characters = data.characters;
                        else if (data && typeof data === 'object') characters = Object.values(data);
                    }
                } catch {}
            }
            if (!characters.length && this.characterLibrary?.size) {
                characters = Array.from(this.characterLibrary.values());
            }

            const modal = document.createElement('div');
            modal.className = 'modal character-picker-modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>选择角色</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="picker-search"><input type="text" placeholder="搜索角色名称或ID..."></div>
                        <div class="picker-list">
                            ${characters && characters.length ? characters.map(c=>`<div class="picker-item" data-id="${c.id||c.name}"><span class="pi-title">${c.name||c.id}</span><span class="pi-id">${c.id||c.name}</span></div>`).join('') : `<div class="picker-empty">未找到角色，请先创建角色</div>`}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary picker-cancel">取消</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            requestAnimationFrame(()=>modal.classList.add('show'));

            const close = () => { modal.classList.remove('show'); setTimeout(()=>modal.remove(),200); };
            modal.querySelector('.modal-close')?.addEventListener('click', close);
            modal.querySelector('.picker-cancel')?.addEventListener('click', close);
            modal.addEventListener('click', (e)=>{ if(e.target===modal) close(); });
            modal.querySelectorAll('.picker-item').forEach(item=>{
                item.addEventListener('click', ()=>{
                    const id = item.getAttribute('data-id');
                    const found = characters.find(c => (c.id||c.name) === id);
                    onPick?.(found || { id, name: id });
                    close();
                });
            });
            const searchInput = modal.querySelector('.picker-search input');
            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    const q = searchInput.value.trim().toLowerCase();
                    modal.querySelectorAll('.picker-item').forEach(item => {
                        const title = item.querySelector('.pi-title')?.textContent?.toLowerCase() || '';
                        const id = item.querySelector('.pi-id')?.textContent?.toLowerCase() || '';
                        item.style.display = (!q || title.includes(q) || id.includes(q)) ? '' : 'none';
                    });
                });
            }
        } catch (e) {
            console.warn('打开角色选择器失败:', e?.message);
        }
    }
    
    /**
     * 提取背景元素数据
     */
    extractBackgroundElementData(element) {
        const backgroundPath = element.dataset.backgroundPath || '';
        
        return {
            type: 'background',
            image: backgroundPath
        };
    }
    
    /**
     * 提取音乐元素数据
     */
    extractMusicElementData(element) {
        const musicPath = element.dataset.musicPath || '';
        
        return {
            type: 'music',
            file: musicPath
        };
    }
    
    /**
     * 提取角色元素数据
     */
    extractCharacterElementData(element) {
        const characterId = element.dataset.characterId || '';
        const position = element.dataset.position || 'center';
        
        return {
            type: 'character',
            character: characterId,
            position: position
        };
    }
    
    /**
     * 获取元素类型
     */
    getElementType(element) {
        if (element.classList.contains('text-element')) return 'text';
        if (element.classList.contains('choice-element')) return 'choice';
        if (element.classList.contains('background-element')) return 'background';
        if (element.classList.contains('music-element')) return 'music';
        if (element.classList.contains('character-element')) return 'character';
        return 'unknown';
    }
    
    /**
     * 显示警告对话框
     */
    showAlert(title, message, type = 'info') {
        // 创建模态对话框
        const modal = document.createElement('div');
        modal.className = 'modal alert-modal';
        modal.innerHTML = `
            <div class="modal-content alert-content">
                <div class="modal-header alert-header ${type}">
                    <i class="fas fa-${this.getAlertIcon(type)}"></i>
                    <h3>${title}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body alert-body">
                    <p>${message}</p>
                </div>
                <div class="modal-footer alert-footer">
                    <button class="btn btn-primary" id="alert-ok">确定</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));
        
        // 绑定事件
        const closeModal = () => {
            document.body.removeChild(modal);
        };
        
        modal.querySelector('.modal-close').addEventListener('click', closeModal);
        modal.querySelector('#alert-ok').addEventListener('click', closeModal);
        
        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
        
        // 自动聚焦确定按钮
        setTimeout(() => {
            modal.querySelector('#alert-ok').focus();
        }, 100);
    }
    
    /**
     * 显示通知消息
     */
    showNotification(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${this.getAlertIcon(type)}"></i>
            <span>${message}</span>
            <button class="notification-close">&times;</button>
        `;
        
        // 添加到页面
        let container = document.querySelector('.notification-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'notification-container';
            document.body.appendChild(container);
        }
        
        container.appendChild(notification);
        
        // 绑定关闭事件
        const closeNotification = () => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        };
        
        notification.querySelector('.notification-close').addEventListener('click', closeNotification);
        
        // 自动消失
        if (duration > 0) {
            setTimeout(closeNotification, duration);
        }
    }
    
    /**
     * 显示Toast消息
     */
    showToast(message, type = 'success', duration = 2000) {
        this.showNotification(message, type, duration);
    }
    
    /**
     * 获取警告图标
     */
    getAlertIcon(type) {
        const icons = {
            info: 'info-circle',
            success: 'check-circle',
            warning: 'exclamation-triangle',
            error: 'times-circle'
        };
        return icons[type] || 'info-circle';
    }

    /**
     * 清空角色表单
     */
    clearCharacterForm() {
        try {
            console.log('清空角色表单');
            const form = document.getElementById('character-form');
            if (form) {
                form.reset();
                
                // 清空头像预览
                const avatarPreview = document.getElementById('character-avatar-preview');
                if (avatarPreview) {
                    avatarPreview.src = '';
                    avatarPreview.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('清空角色表单失败:', error);
        }
    }

    /**
     * 刷新角色列表
     */
    refreshCharactersList() {
        try {
            console.log('刷新角色列表');
            const charactersList = document.getElementById('characters-list');
            if (!charactersList) return;

            charactersList.innerHTML = '';
            
            this.characterLibrary.forEach((character, name) => {
                const characterItem = document.createElement('div');
                characterItem.className = 'character-item';
                characterItem.innerHTML = `
                    <img src="${character.avatar || 'default-avatar.png'}" alt="${name}" class="character-avatar">
                    <div class="character-info">
                        <div class="character-name">${name}</div>
                        <div class="character-description">${character.description || ''}</div>
                    </div>
                    <div class="character-actions">
                        <button class="btn btn-sm btn-secondary" onclick="window.galGameUIController.editCharacter('${name}')">编辑</button>
                        <button class="btn btn-sm btn-danger" onclick="window.galGameUIController.deleteCharacter('${name}')">删除</button>
                    </div>
                `;
                charactersList.appendChild(characterItem);
            });

            // 更新角色选择下拉框
            const characterSelects = document.querySelectorAll('.character-select');
            characterSelects.forEach(select => {
                const currentValue = select.value;
                select.innerHTML = '<option value="">选择角色</option>';
                
                this.characterLibrary.forEach((character, name) => {
                    const option = document.createElement('option');
                    option.value = name;
                    option.textContent = name;
                    option.selected = name === currentValue;
                    select.appendChild(option);
                });
            });
        } catch (error) {
            console.error('刷新角色列表失败:', error);
        }
    }

    /**
     * 开始调试预览
     */
    async startDebugPreview() {
        try {
            console.log('开始调试预览');
            if (!window.app?.currentProject) {
                this.showAlert('错误', '没有打开的项目', 'error');
                return;
            }

            // 保存当前项目
            await this.saveProject();
            
            // 启动预览
            const result = await window.electronAPI.invoke('preview-project', this.getCurrentProjectPath());
            
            if (result.success) {
                this.showToast('预览已启动', 'success');
            } else {
                this.showAlert('启动失败', result.error || '无法启动预览', 'error');
            }
        } catch (error) {
            console.error('启动预览失败:', error);
            this.showAlert('预览失败', `启动预览时出错: ${error.message}`, 'error');
        }
    }

    /**
     * 显示打包错误
     */
    showPackageError(error) {
        console.error('打包错误:', error);
        this.showAlert('打包失败', `项目打包失败: ${error}`, 'error');
    }

    /**
     * 测试打包
     */
    async testPackaging() {
        try {
            console.log('测试打包');
            this.showToast('正在测试打包配置...', 'info');
            
            // 模拟打包测试
            setTimeout(() => {
                this.showToast('打包配置测试完成', 'success');
            }, 2000);
        } catch (error) {
            console.error('测试打包失败:', error);
            this.showToast('测试打包失败', 'error');
        }
    }

    /**
     * 创建资源文件夹
     */
    async createAssetFolder() {
        try {
            console.log('创建资源文件夹');
            
            if (!window.app?.currentProject) {
                this.showAlert('错误', '没有打开的项目', 'error');
                return;
            }

            // 显示文件夹名称输入对话框
            const folderName = await this.showInputDialog('创建文件夹', '请输入文件夹名称:', 'new_folder');
            
            if (!folderName) return;
            
            const projectPath = this.getCurrentProjectPath();
            const folderPath = `${projectPath}/assets/${folderName}`;
            
            // 创建文件夹
            await window.electronAPI.ensureDir(folderPath);
            
            // 刷新资源库
            await this.loadAssetLibrary();
            
            this.showToast('文件夹创建成功', 'success');
        } catch (error) {
            console.error('创建资源文件夹失败:', error);
            this.showAlert('创建失败', `创建文件夹失败: ${error.message}`, 'error');
        }
    }

    /**
     * 创建文件夹（通用方法）
     */
    async createFolder(parentPath = '') {
        try {
            console.log('创建文件夹:', parentPath);
            
            if (!window.app?.currentProject) {
                this.showAlert('错误', '没有打开的项目', 'error');
                return;
            }

            // 显示文件夹名称输入对话框
            const folderName = await this.showInputDialog('创建文件夹', '请输入文件夹名称:', 'new_folder');
            
            if (!folderName) return;
            
            const projectPath = this.getCurrentProjectPath();
            const basePath = parentPath ? `${projectPath}/${parentPath}` : `${projectPath}/assets`;
            const folderPath = `${basePath}/${folderName}`;
            
            // 创建文件夹
            await window.electronAPI.ensureDir(folderPath);
            
            // 刷新相关视图
            await this.loadAssetLibrary();
            
            this.showToast('文件夹创建成功', 'success');
        } catch (error) {
            console.error('创建文件夹失败:', error);
            this.showAlert('创建失败', `创建文件夹失败: ${error.message}`, 'error');
        }
    }

    /**
     * 切换资源类别
     */
    switchAssetCategory(category) {
        try {
            console.log('切换资源类别:', category);
            
            // 更新选中状态
            const categoryButtons = document.querySelectorAll('[data-asset-category]');
            categoryButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.assetCategory === category);
            });
            
            // 显示对应类别的资源
            this.currentAssetCategory = category;
            this.displayAssetsByCategory(category);
            
        } catch (error) {
            console.error('切换资源类别失败:', error);
        }
    }

    /**
     * 按类别显示资源
     */
    displayAssetsByCategory(category) {
        try {
            const assetsList = document.getElementById('assets-list');
            if (!assetsList) return;
            
            assetsList.innerHTML = '';
            
            // 获取该类别的资源
            const categoryAssets = Array.from(this.assetLibrary.values()).filter(asset => 
                asset.type === category || asset.category === category
            );
            
            if (categoryAssets.length === 0) {
                assetsList.innerHTML = `<div class="no-assets">暂无${category}资源</div>`;
                return;
            }
            
            categoryAssets.forEach(asset => {
                const assetItem = document.createElement('div');
                assetItem.className = 'asset-item';
                assetItem.innerHTML = `
                    <div class="asset-preview">
                        ${this.getAssetPreview(asset)}
                    </div>
                    <div class="asset-name">${asset.name}</div>
                    <div class="asset-actions">
                        <button class="btn btn-sm btn-primary" onclick="window.galGameUIController.useAsset('${asset.name}')">使用</button>
                        <button class="btn btn-sm btn-danger" onclick="window.galGameUIController.deleteAsset('${asset.name}')">删除</button>
                    </div>
                `;
                assetsList.appendChild(assetItem);
            });
        } catch (error) {
            console.error('显示资源失败:', error);
        }
    }

    /**
     * 获取资源预览
     */
    getAssetPreview(asset) {
        const extension = asset.path.split('.').pop().toLowerCase();
        
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
            return `<img src="${asset.path}" alt="${asset.name}" class="asset-thumbnail">`;
        } else if (['mp3', 'wav', 'ogg'].includes(extension)) {
            return `<div class="asset-icon audio-icon">♪</div>`;
        } else {
            return `<div class="asset-icon file-icon">📄</div>`;
        }
    }

    /**
     * 显示背景选择器
     */
    showBackgroundSelector() {
        try {
            console.log('显示背景选择器');
            this.switchAssetCategory('backgrounds');
            
            // 切换到资源库标签
            const assetTab = document.querySelector('[data-tab="assets"]');
            if (assetTab) {
                assetTab.click();
            }
        } catch (error) {
            console.error('显示背景选择器失败:', error);
        }
    }

    /**
     * 显示音乐选择器
     */
    showMusicSelector() {
        try {
            console.log('显示音乐选择器');
            this.switchAssetCategory('music');
            
            // 切换到资源库标签
            const assetTab = document.querySelector('[data-tab="assets"]');
            if (assetTab) {
                assetTab.click();
            }
        } catch (error) {
            console.error('显示音乐选择器失败:', error);
        }
    }

    /**
     * AI继续场景
     */
    async aiContinueScene() {
        try {
            console.log('AI继续场景');
            if (!window.app?.currentProject) {
                this.showAlert('错误', '没有打开的项目', 'error');
                return;
            }

            this.showToast('AI正在分析场景...', 'info');
            
            // 这里可以调用AI API继续场景
            // 暂时添加示例内容
            setTimeout(() => {
                this.addElementToTimeline({
                    type: 'text',
                    content: 'AI继续: 故事在这里继续发展...'
                });
                this.showToast('场景继续生成完成', 'success');
            }, 1500);
        } catch (error) {
            console.error('AI继续场景失败:', error);
            this.showToast('AI继续场景失败', 'error');
        }
    }

    /**
     * AI生成图片
     */
    async aiGenerateImage() {
        try {
            console.log('AI生成图片');
            this.showToast('AI图片生成功能开发中...', 'info');
        } catch (error) {
            console.error('AI生成图片失败:', error);
            this.showToast('AI生成图片失败', 'error');
        }
    }

    /**
     * 编辑元素
     */
    editElement(elementId) {
        try {
            console.log('编辑元素:', elementId);
            
            if (!this.currentChapter?.elements) {
                this.showAlert('错误', '没有可编辑的元素', 'error');
                return;
            }
            
            const element = this.currentChapter.elements.find(el => el.id === elementId);
            if (!element) {
                this.showAlert('错误', '元素不存在', 'error');
                return;
            }
            
            // 显示编辑对话框
            this.showElementEditDialog(element);
        } catch (error) {
            console.error('编辑元素失败:', error);
            this.showAlert('编辑失败', `编辑元素失败: ${error.message}`, 'error');
        }
    }

    /**
     * 显示元素编辑对话框
     */
    showElementEditDialog(element) {
        const modal = document.createElement('div');
        modal.className = 'modal edit-element-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>编辑${element.type}元素</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="input-group">
                        <label>内容:</label>
                        <textarea id="element-content" placeholder="请输入内容">${element.content || ''}</textarea>
                    </div>
                    ${element.type === 'dialogue' ? `
                    <div class="input-group">
                        <label>角色:</label>
                        <select id="element-character">
                            <option value="">选择角色</option>
                            ${Array.from(this.characterLibrary.keys()).map(name => 
                                `<option value="${name}" ${element.character === name ? 'selected' : ''}>${name}</option>`
                            ).join('')}
                        </select>
                    </div>
                    ` : ''}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="cancel-edit">取消</button>
                    <button class="btn btn-primary" id="confirm-edit">保存</button>
                </div>
            </div>
        `;
        
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));
        
        const contentInput = modal.querySelector('#element-content');
        const characterSelect = modal.querySelector('#element-character');
        const closeBtn = modal.querySelector('.modal-close');
        const cancelBtn = modal.querySelector('#cancel-edit');
        const confirmBtn = modal.querySelector('#confirm-edit');
        
        const closeModal = () => {
            modal.classList.remove('show');
            setTimeout(() => { if (modal.parentNode) document.body.removeChild(modal); }, 200);
        };
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        
        confirmBtn.addEventListener('click', () => {
            element.content = contentInput.value;
            if (characterSelect && element.type === 'dialogue') {
                element.character = characterSelect.value;
            }
            
            this.updateElementInTimeline(element);
            this.markDirty();
            closeModal();
            
            this.showToast('元素更新成功', 'success');
        });
    }

    /**
     * 显示输入对话框
     */
    async showInputDialog(title, message, defaultValue = '') {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal input-dialog-modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>${message}</p>
                        <input type="text" id="input-value" value="${defaultValue}" class="form-input">
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="cancel-input">取消</button>
                        <button class="btn btn-primary" id="confirm-input">确定</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            requestAnimationFrame(() => modal.classList.add('show'));
            
            const input = modal.querySelector('#input-value');
            const closeBtn = modal.querySelector('.modal-close');
            const cancelBtn = modal.querySelector('#cancel-input');
            const confirmBtn = modal.querySelector('#confirm-input');
            
            const closeModal = (value = null) => {
                document.body.removeChild(modal);
                resolve(value);
            };
            
            closeBtn.addEventListener('click', () => closeModal(null));
            cancelBtn.addEventListener('click', () => closeModal(null));
            confirmBtn.addEventListener('click', () => {
                const value = input.value.trim();
                closeModal(value || null);
            });
            
            // 自动聚焦并选中
            setTimeout(() => {
                input.focus();
                input.select();
            }, 100);
            
            // 回车确认
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    confirmBtn.click();
                }
            });
        });
    }

    /**
     * 导入资源文件到项目
     */
    async importAssetToProject() {
        try {
            if (!window.app?.currentProject) {
                this.showAlert('错误', '没有打开的项目', 'error');
                return;
            }

            // 选择文件
            const result = await window.electronAPI.showOpenDialog({
                properties: ['openFile', 'multiSelections'],
                filters: [
                    { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
                    { name: '音频', extensions: ['mp3', 'wav', 'ogg', 'm4a'] },
                    { name: '所有文件', extensions: ['*'] }
                ]
            });

            if (result.canceled || !result.filePaths?.length) {
                return;
            }

            const projectPath = this.getCurrentProjectPath();
            const assetsDir = `${projectPath}/assets`;
            
            // 确保assets目录存在
            await window.electronAPI.ensureDir(assetsDir);

            let importedCount = 0;
            
            for (const filePath of result.filePaths) {
                try {
                    const fileName = filePath.split(/[\\/]/).pop();
                    const fileExt = fileName.split('.').pop().toLowerCase();
                    
                    // 确定资源类型
                    let category = 'other';
                    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt)) {
                        category = 'images';
                    } else if (['mp3', 'wav', 'ogg', 'm4a'].includes(fileExt)) {
                        category = 'audio';
                    }
                    
                    const categoryDir = `${assetsDir}/${category}`;
                    await window.electronAPI.ensureDir(categoryDir);
                    
                    const destPath = `${categoryDir}/${fileName}`;
                    
                    // 复制文件
                    await window.electronAPI.copyFile(filePath, destPath);
                    
                    // 添加到资源库
                    const assetId = `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    this.assetLibrary.set(assetId, {
                        id: assetId,
                        name: fileName,
                        path: `assets/${category}/${fileName}`,
                        type: category,
                        category: category,
                        size: 0, // 可以通过API获取实际大小
                        addedAt: new Date().toISOString()
                    });
                    
                    importedCount++;
                } catch (error) {
                    console.error('导入文件失败:', fileName, error);
                }
            }
            
            if (importedCount > 0) {
                // 保存资源库信息
                await this.saveAssetLibrary();
                
                // 刷新界面
                await this.loadAssetLibrary();
                
                this.showToast(`成功导入 ${importedCount} 个资源文件`, 'success');
            } else {
                this.showAlert('导入失败', '没有成功导入任何文件', 'error');
            }
            
        } catch (error) {
            console.error('导入资源失败:', error);
            this.showAlert('导入失败', `导入资源时出错: ${error.message}`, 'error');
        }
    }

    /**
     * 保存资源库信息
     */
    async saveAssetLibrary() {
        try {
            if (!window.app?.currentProject) {
                return;
            }

            const projectPath = this.getCurrentProjectPath();
            const assetsJsonPath = `${projectPath}/assets.json`;
            
            const assetsData = {
                assets: Array.from(this.assetLibrary.entries()).map(([id, asset]) => ({
                    id,
                    ...asset
                })),
                lastUpdated: new Date().toISOString()
            };
            
            await window.electronAPI.writeFile(assetsJsonPath, JSON.stringify(assetsData, null, 2));
            console.log('资源库信息已保存');
        } catch (error) {
            console.error('保存资源库失败:', error);
        }
    }

    /**
     * 使用资源
     */
    useAsset(assetName) {
        try {
            const asset = Array.from(this.assetLibrary.values()).find(a => a.name === assetName);
            if (!asset) {
                this.showAlert('错误', '资源不存在', 'error');
                return;
            }

            // 根据资源类型使用不同的处理方式
            if (asset.category === 'images') {
                // 添加为背景或角色立绘
                this.addElementToTimeline({
                    type: 'background',
                    path: asset.path,
                    name: asset.name
                });
            } else if (asset.category === 'audio') {
                // 添加为背景音乐或音效
                this.addElementToTimeline({
                    type: 'music',
                    path: asset.path,
                    name: asset.name
                });
            }
            
            this.showToast(`已使用资源: ${asset.name}`, 'success');
        } catch (error) {
            console.error('使用资源失败:', error);
            this.showAlert('使用失败', `使用资源失败: ${error.message}`, 'error');
        }
    }

    /**
     * 删除资源
     */
    async deleteAsset(assetName) {
        try {
            const asset = Array.from(this.assetLibrary.values()).find(a => a.name === assetName);
            if (!asset) {
                this.showAlert('错误', '资源不存在', 'error');
                return;
            }

            // 确认删除
            const confirmed = await this.showConfirmDialog('删除资源', `确定要删除资源 "${assetName}" 吗？此操作不可撤销。`);
            if (!confirmed) return;

            // 删除文件
            const projectPath = this.getCurrentProjectPath();
            const filePath = `${projectPath}/${asset.path}`;
            
            try {
                // 这里可以添加删除文件的逻辑，但需要小心处理
                console.log('删除文件:', filePath);
            } catch (error) {
                console.warn('删除物理文件失败:', error);
            }
            
            // 从资源库中移除
            this.assetLibrary.delete(asset.id);
            
            // 保存资源库
            await this.saveAssetLibrary();
            
            // 刷新界面
            this.displayAssetsByCategory(this.currentAssetCategory || 'images');
            
            this.showToast('资源已删除', 'success');
        } catch (error) {
            console.error('删除资源失败:', error);
            this.showAlert('删除失败', `删除资源失败: ${error.message}`, 'error');
        }
    }

    /**
     * 显示确认对话框
     */
    async showConfirmDialog(title, message) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal confirm-dialog-modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>${message}</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="cancel-confirm">取消</button>
                        <button class="btn btn-danger" id="confirm-confirm">确定</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            requestAnimationFrame(() => modal.classList.add('show'));
            
            const closeBtn = modal.querySelector('.modal-close');
            const cancelBtn = modal.querySelector('#cancel-confirm');
            const confirmBtn = modal.querySelector('#confirm-confirm');
            
            const closeModal = (result) => {
                document.body.removeChild(modal);
                resolve(result);
            };
            
            closeBtn.addEventListener('click', () => closeModal(false));
            cancelBtn.addEventListener('click', () => closeModal(false));
            confirmBtn.addEventListener('click', () => closeModal(true));
        });
    }

    /**
     * 编辑角色
     */
    editCharacter(characterName) {
        try {
            const character = this.characterLibrary.get(characterName);
            if (!character) {
                this.showAlert('错误', '角色不存在', 'error');
                return;
            }

            // 显示角色编辑器并填充数据
            this.showCharacterEditor();
            
            // 填充表单数据
            const form = document.getElementById('character-form');
            if (form) {
                form.querySelector('[name="name"]').value = character.name || '';
                form.querySelector('[name="description"]').value = character.description || '';
                
                // 设置头像
                if (character.avatar) {
                    const avatarPreview = document.getElementById('character-avatar-preview');
                    if (avatarPreview) {
                        avatarPreview.src = character.avatar;
                        avatarPreview.style.display = 'block';
                    }
                }
            }
            
            // 标记为编辑模式
            this.editingCharacter = characterName;
            
        } catch (error) {
            console.error('编辑角色失败:', error);
            this.showAlert('编辑失败', `编辑角色失败: ${error.message}`, 'error');
        }
    }

    /**
     * 删除角色
     */
    async deleteCharacter(characterName) {
        try {
            const confirmed = await this.showConfirmDialog('删除角色', `确定要删除角色 "${characterName}" 吗？此操作不可撤销。`);
            if (!confirmed) return;

            // 从角色库中删除
            this.characterLibrary.delete(characterName);
            
            // 刷新角色列表
            this.refreshCharactersList();
            
            // 保存角色库
            await this.saveCharacterLibrary();
            
            this.showToast('角色已删除', 'success');
        } catch (error) {
            console.error('删除角色失败:', error);
            this.showAlert('删除失败', `删除角色失败: ${error.message}`, 'error');
        }
    }

    /**
     * 保存角色库
     */
    async saveCharacterLibrary() {
        try {
            if (!window.app?.currentProject) {
                return;
            }

            const projectPath = this.getCurrentProjectPath();
            const charactersJsonPath = `${projectPath}/characters.json`;
            
            const charactersData = {
                characters: Array.from(this.characterLibrary.entries()).map(([name, character]) => ({
                    name,
                    ...character
                })),
                lastUpdated: new Date().toISOString()
            };
            
            await window.electronAPI.writeFile(charactersJsonPath, JSON.stringify(charactersData, null, 2));
            console.log('角色库信息已保存');
        } catch (error) {
            console.error('保存角色库失败:', error);
        }
    }
}

// 全局初始化
window.galGameUIController = new GalGameUIController();
