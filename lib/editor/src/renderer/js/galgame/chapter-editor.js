/**
 * GalGame章节编辑器UI
 * 负责章节编辑界面的渲染和交互
 */

class GalGameChapterEditor {
    constructor() {
        this.currentChapter = null;
        this.chapterManager = window.galGameChapterManager;
        this.projectManager = window.galGameProjectManager;
        this.isModified = false;
        this.autoSaveTimer = null;
        
        this.initUI();
        this.setupEventListeners();
    }

    /**
     * 初始化UI
     */
    initUI() {
        this.createEditorHTML();
        this.setupAutoSave();
    }

    /**
     * 创建编辑器HTML结构
     */
    createEditorHTML() {
        const editorContainer = document.getElementById('editor-container') || document.body;
        
        const editorHTML = `
            <div id="galgame-chapter-editor" class="galgame-editor" style="display: none;">
                <div class="editor-header">
                    <div class="chapter-info">
                        <input type="text" id="chapter-title" class="chapter-title-input" placeholder="章节标题" />
                        <span id="chapter-id" class="chapter-id"></span>
                    </div>
                    <div class="editor-tools">
                        <button id="save-chapter-btn" class="btn btn-primary" title="保存章节">
                            <i class="fas fa-save"></i> 保存
                        </button>
                        <button id="preview-chapter-btn" class="btn btn-secondary" title="预览章节">
                            <i class="fas fa-eye"></i> 预览
                        </button>
                        <button id="ai-assist-btn" class="btn btn-ai" title="AI辅助">
                            <i class="fas fa-robot"></i> AI辅助
                        </button>
                    </div>
                </div>
                
                <div class="editor-content">
                    <div class="content-sections">
                        <!-- 主文案编辑区 -->
                        <div class="section main-text-section">
                            <div class="section-header">
                                <h3><i class="fas fa-comment"></i> 主文案内容</h3>
                                <div class="section-tools">
                                    <button id="ai-rewrite-btn" class="btn btn-sm btn-ai" title="AI重写">
                                        <i class="fas fa-magic"></i> 重写
                                    </button>
                                    <button id="ai-continue-btn" class="btn btn-sm btn-ai" title="AI续写">
                                        <i class="fas fa-plus"></i> 续写
                                    </button>
                                </div>
                            </div>
                            <textarea id="main-text-editor" class="main-text-editor" placeholder="在这里输入章节的主要对话和叙述内容..."></textarea>
                            <div class="text-stats">
                                字数: <span id="word-count">0</span>
                            </div>
                        </div>
                        
                        <!-- 选项编辑区 -->
                        <div class="section choices-section">
                            <div class="section-header">
                                <h3><i class="fas fa-list"></i> 选择分支</h3>
                                <button id="add-choice-btn" class="btn btn-sm btn-primary">
                                    <i class="fas fa-plus"></i> 添加选项
                                </button>
                            </div>
                            <div id="choices-list" class="choices-list">
                                <!-- 选项列表将在这里动态生成 -->
                            </div>
                        </div>
                        
                        <!-- 背景设置区 -->
                        <div class="section background-section">
                            <div class="section-header">
                                <h3><i class="fas fa-image"></i> 背景设置</h3>
                            </div>
                            <div class="background-controls">
                                <div class="control-group">
                                    <label>背景图片:</label>
                                    <div class="file-input-group">
                                        <select id="bg-image-select" class="bg-image-select">
                                            <option value="">选择背景图片...</option>
                                        </select>
                                        <button id="upload-bg-btn" class="btn btn-sm btn-secondary">
                                            <i class="fas fa-upload"></i> 上传
                                        </button>
                                        <button id="ai-generate-bg-btn" class="btn btn-sm btn-ai">
                                            <i class="fas fa-magic"></i> AI生成
                                        </button>
                                    </div>
                                    <div id="bg-preview" class="bg-preview"></div>
                                </div>
                                
                                <div class="control-group">
                                    <label>背景音乐:</label>
                                    <div class="file-input-group">
                                        <select id="bg-music-select" class="bg-music-select">
                                            <option value="">选择背景音乐...</option>
                                        </select>
                                        <button id="upload-music-btn" class="btn btn-sm btn-secondary">
                                            <i class="fas fa-upload"></i> 上传
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 变量操作区 -->
                        <div class="section variables-section">
                            <div class="section-header">
                                <h3><i class="fas fa-code"></i> 变量操作</h3>
                                <button id="add-variable-btn" class="btn btn-sm btn-primary">
                                    <i class="fas fa-plus"></i> 添加变量
                                </button>
                            </div>
                            <div id="variables-list" class="variables-list">
                                <!-- 变量列表将在这里动态生成 -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        editorContainer.insertAdjacentHTML('beforeend', editorHTML);
        this.loadAssetOptions();
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 章节标题编辑
        const titleInput = document.getElementById('chapter-title');
        if (titleInput) {
            titleInput.addEventListener('input', () => {
                if (this.currentChapter) {
                    this.currentChapter.title = titleInput.value;
                    this.markModified();
                }
            });
        }

        // 主文案编辑
        const mainTextEditor = document.getElementById('main-text-editor');
        if (mainTextEditor) {
            mainTextEditor.addEventListener('input', () => {
                this.updateWordCount();
                if (this.currentChapter) {
                    this.currentChapter.content.mainText = mainTextEditor.value;
                    this.markModified();
                }
            });
        }
        // 动态绑定选项文本变化时的字数更新（委托到容器）
        const choicesList = document.getElementById('choices-list');
        if (choicesList) {
            choicesList.addEventListener('input', (e) => {
                const target = e.target;
                if (target && target.classList && target.classList.contains('choice-text')) {
                    this.updateWordCount();
                }
            });
        }

        // 保存按钮
        const saveBtn = document.getElementById('save-chapter-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveChapter());
        }

        // 预览按钮
        const previewBtn = document.getElementById('preview-chapter-btn');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => this.previewChapter());
        }

        // AI辅助按钮
        const aiAssistBtn = document.getElementById('ai-assist-btn');
        if (aiAssistBtn) {
            aiAssistBtn.addEventListener('click', () => this.showAIAssistPanel());
        }

        // 添加选项按钮
        const addChoiceBtn = document.getElementById('add-choice-btn');
        if (addChoiceBtn) {
            addChoiceBtn.addEventListener('click', () => this.addChoice());
        }

        // 添加变量按钮
        const addVariableBtn = document.getElementById('add-variable-btn');
        if (addVariableBtn) {
            addVariableBtn.addEventListener('click', () => this.addVariable());
        }

        // 背景图片选择
        const bgImageSelect = document.getElementById('bg-image-select');
        if (bgImageSelect) {
            bgImageSelect.addEventListener('change', (e) => {
                this.setBackgroundImage(e.target.value);
            });
        }

        // 背景音乐选择
        const bgMusicSelect = document.getElementById('bg-music-select');
        if (bgMusicSelect) {
            bgMusicSelect.addEventListener('change', (e) => {
                this.setBackgroundMusic(e.target.value);
            });
        }

        // 上传背景图片
        const uploadBgBtn = document.getElementById('upload-bg-btn');
        if (uploadBgBtn) {
            uploadBgBtn.addEventListener('click', () => this.uploadBackgroundImage());
        }

        // AI生成背景图片
        const aiGenerateBgBtn = document.getElementById('ai-generate-bg-btn');
        if (aiGenerateBgBtn) {
            aiGenerateBgBtn.addEventListener('click', () => this.generateBackgroundImage());
        }

        // 上传背景音乐
        const uploadMusicBtn = document.getElementById('upload-music-btn');
        if (uploadMusicBtn) {
            uploadMusicBtn.addEventListener('click', () => this.uploadBackgroundMusic());
        }



        // AI重写
        const aiRewriteBtn = document.getElementById('ai-rewrite-btn');
        if (aiRewriteBtn) {
            aiRewriteBtn.addEventListener('click', () => this.aiRewrite());
        }

        // AI续写
        const aiContinueBtn = document.getElementById('ai-continue-btn');
        if (aiContinueBtn) {
            aiContinueBtn.addEventListener('click', () => this.aiContinue());
        }
    }

    /**
     * 加载章节数据到编辑器
     * @param {Object} chapter - 章节数据
     */
    loadChapter(chapter) {
        this.currentChapter = chapter;
        
        // 填充基本信息
        const titleInput = document.getElementById('chapter-title');
        const chapterIdSpan = document.getElementById('chapter-id');
        const mainTextEditor = document.getElementById('main-text-editor');

        if (titleInput) titleInput.value = chapter.title || '';
        if (chapterIdSpan) chapterIdSpan.textContent = `ID: ${chapter.id}`;
        if (mainTextEditor) mainTextEditor.value = chapter.content.mainText || '';

        // 更新字数统计
        this.updateWordCount();

        // 加载选项
        this.loadChoices();

        // 加载变量
        this.loadVariables();

        // 加载背景设置
        this.loadBackgroundSettings();

        // 显示编辑器
        document.getElementById('galgame-chapter-editor').style.display = 'block';
        
        this.isModified = false;
    }

    /**
     * 加载选项列表
     */
    loadChoices() {
        const choicesList = document.getElementById('choices-list');
        if (!choicesList || !this.currentChapter) return;

        choicesList.innerHTML = '';

        this.currentChapter.content.choices.forEach((choice, index) => {
            const choiceElement = this.createChoiceElement(choice, index);
            choicesList.appendChild(choiceElement);
        });
    }

    /**
     * 创建选项元素
     * @param {Object} choice - 选项数据
     * @param {number} index - 选项索引
     * @returns {HTMLElement} 选项DOM元素
     */
    createChoiceElement(choice, index) {
        const div = document.createElement('div');
        div.className = 'choice-item';
        div.innerHTML = `
            <div class="choice-header">
                <span class="choice-number">${index + 1}</span>
                <button class="btn btn-sm btn-danger delete-choice-btn" data-choice-id="${choice.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="choice-content">
                <div class="form-group">
                    <label>选项文本:</label>
                    <input type="text" class="choice-text" value="${choice.text || ''}" data-choice-id="${choice.id}">
                </div>
                <div class="form-group">
                    <label>跳转章节:</label>
                    <input type="text" class="choice-target" value="${choice.targetChapter || ''}" data-choice-id="${choice.id}" placeholder="目标章节ID">
                </div>
                <div class="form-group">
                    <label>显示条件:</label>
                    <input type="text" class="choice-conditions" value="${this.formatConditions(choice.conditions)}" data-choice-id="${choice.id}" placeholder="变量名=值,变量名2=值2">
                </div>
            </div>
        `;

        // 绑定事件
        const textInput = div.querySelector('.choice-text');
        textInput.addEventListener('input', (e) => {
            this.updateChoiceText(choice.id, e.target.value);
        });

        const targetInput = div.querySelector('.choice-target');
        targetInput.addEventListener('input', (e) => {
            this.updateChoiceTarget(choice.id, e.target.value);
        });

        const conditionsInput = div.querySelector('.choice-conditions');
        conditionsInput.addEventListener('input', (e) => {
            this.updateChoiceConditions(choice.id, e.target.value);
        });

        const deleteBtn = div.querySelector('.delete-choice-btn');
        deleteBtn.addEventListener('click', () => {
            this.deleteChoice(choice.id);
        });

        return div;
    }

    /**
     * 添加新选项
     */
    addChoice() {
        if (!this.currentChapter) return;

        const choice = this.chapterManager.addChoice(
            this.currentChapter,
            '新选项',
            null,
            {}
        );

        this.loadChoices();
        this.markModified();
    }

    /**
     * 删除选项
     * @param {string} choiceId - 选项ID
     */
    deleteChoice(choiceId) {
        if (!this.currentChapter) return;

        this.chapterManager.removeChoice(this.currentChapter, choiceId);
        this.loadChoices();
        this.markModified();
    }

    /**
     * 更新选项文本
     * @param {string} choiceId - 选项ID
     * @param {string} text - 新文本
     */
    updateChoiceText(choiceId, text) {
        const choice = this.currentChapter.content.choices.find(c => c.id === choiceId);
        if (choice) {
            choice.text = text;
            this.markModified();
        }
    }

    /**
     * 更新选项目标章节
     * @param {string} choiceId - 选项ID
     * @param {string} target - 目标章节ID
     */
    updateChoiceTarget(choiceId, target) {
        const choice = this.currentChapter.content.choices.find(c => c.id === choiceId);
        if (choice) {
            choice.targetChapter = target;
            this.markModified();
        }
    }

    /**
     * 更新选项显示条件
     * @param {string} choiceId - 选项ID
     * @param {string} conditionsStr - 条件字符串
     */
    updateChoiceConditions(choiceId, conditionsStr) {
        const choice = this.currentChapter.content.choices.find(c => c.id === choiceId);
        if (choice) {
            choice.conditions = this.parseConditions(conditionsStr);
            this.markModified();
        }
    }

    /**
     * 解析条件字符串
     * @param {string} str - 条件字符串 (格式: var1=value1,var2=value2)
     * @returns {Object} 条件对象
     */
    parseConditions(str) {
        const conditions = {};
        if (str.trim()) {
            str.split(',').forEach(pair => {
                const [key, value] = pair.split('=');
                if (key && value) {
                    conditions[key.trim()] = value.trim();
                }
            });
        }
        return conditions;
    }

    /**
     * 格式化条件对象为字符串
     * @param {Object} conditions - 条件对象
     * @returns {string} 条件字符串
     */
    formatConditions(conditions) {
        if (!conditions) return '';
        return Object.entries(conditions)
            .map(([key, value]) => `${key}=${value}`)
            .join(',');
    }

    /**
     * 加载变量列表
     */
    loadVariables() {
        const variablesList = document.getElementById('variables-list');
        if (!variablesList || !this.currentChapter) return;

        variablesList.innerHTML = '';

        Object.entries(this.currentChapter.content.variables || {}).forEach(([key, value]) => {
            const variableElement = this.createVariableElement(key, value);
            variablesList.appendChild(variableElement);
        });
    }

    /**
     * 创建变量元素
     * @param {string} key - 变量名
     * @param {any} value - 变量值
     * @returns {HTMLElement} 变量DOM元素
     */
    createVariableElement(key, value) {
        const div = document.createElement('div');
        div.className = 'variable-item';
        div.innerHTML = `
            <div class="variable-controls">
                <input type="text" class="variable-key" value="${key}" placeholder="变量名">
                <input type="text" class="variable-value" value="${value}" placeholder="变量值">
                <button class="btn btn-sm btn-danger delete-variable-btn" data-variable-key="${key}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        // 绑定事件
        const keyInput = div.querySelector('.variable-key');
        const valueInput = div.querySelector('.variable-value');
        const deleteBtn = div.querySelector('.delete-variable-btn');

        keyInput.addEventListener('input', () => {
            this.updateVariable(key, keyInput.value, valueInput.value);
        });

        valueInput.addEventListener('input', () => {
            this.updateVariable(key, keyInput.value, valueInput.value);
        });

        deleteBtn.addEventListener('click', () => {
            this.deleteVariable(key);
        });

        return div;
    }

    /**
     * 添加变量
     */
    addVariable() {
        if (!this.currentChapter) return;

        if (!this.currentChapter.content.variables) {
            this.currentChapter.content.variables = {};
        }

        const key = `variable_${Date.now()}`;
        this.currentChapter.content.variables[key] = '';

        this.loadVariables();
        this.markModified();
    }

    /**
     * 删除变量
     * @param {string} key - 变量名
     */
    deleteVariable(key) {
        if (!this.currentChapter || !this.currentChapter.content.variables) return;

        delete this.currentChapter.content.variables[key];
        this.loadVariables();
        this.markModified();
    }

    /**
     * 更新变量
     * @param {string} oldKey - 旧变量名
     * @param {string} newKey - 新变量名
     * @param {any} value - 变量值
     */
    updateVariable(oldKey, newKey, value) {
        if (!this.currentChapter || !this.currentChapter.content.variables) return;

        if (oldKey !== newKey) {
            delete this.currentChapter.content.variables[oldKey];
        }
        
        this.currentChapter.content.variables[newKey] = value;
        this.markModified();
    }

    /**
     * 加载背景设置
     */
    loadBackgroundSettings() {
        if (!this.currentChapter) return;

        const bgImageSelect = document.getElementById('bg-image-select');
        const bgMusicSelect = document.getElementById('bg-music-select');

        if (bgImageSelect) {
            bgImageSelect.value = this.currentChapter.content.backgroundImage || '';
            this.updateBackgroundPreview();
        }

        if (bgMusicSelect) {
            bgMusicSelect.value = this.currentChapter.content.backgroundMusic || '';
        }
    }

    /**
     * 设置背景图片
     * @param {string} imagePath - 图片路径
     */
    setBackgroundImage(imagePath) {
        if (!this.currentChapter) return;

        this.chapterManager.setBackgroundImage(this.currentChapter, imagePath);
        this.updateBackgroundPreview();
        this.markModified();
    }

    /**
     * 设置背景音乐
     * @param {string} musicPath - 音乐路径
     */
    setBackgroundMusic(musicPath) {
        if (!this.currentChapter) return;

        this.chapterManager.setBackgroundMusic(this.currentChapter, musicPath);
        this.markModified();
    }

    /**
     * 更新背景预览
     */
    updateBackgroundPreview() {
        const preview = document.getElementById('bg-preview');
        if (!preview || !this.currentChapter) return;

        const imagePath = this.currentChapter.content.backgroundImage;
        if (imagePath) {
            preview.innerHTML = `<img src="file://${imagePath}" alt="背景预览" class="bg-preview-img">`;
        } else {
            preview.innerHTML = '<div class="no-preview">无背景图片</div>';
        }
    }

    /**
     * 加载资源选项
     */
    async loadAssetOptions() {
        try {
            const project = this.projectManager.getCurrentProject();
            if (!project) return;

            // 加载图片资源
            const images = await this.projectManager.getProjectAssets('images');
            const bgImageSelect = document.getElementById('bg-image-select');
            if (bgImageSelect) {
                bgImageSelect.innerHTML = '<option value="">选择背景图片...</option>';
                images.forEach(image => {
                    const option = document.createElement('option');
                    option.value = `${project.path}/assets/images/${image}`;
                    option.textContent = image;
                    bgImageSelect.appendChild(option);
                });
            }

            // 加载音乐资源
            const music = await this.projectManager.getProjectAssets('music');
            const bgMusicSelect = document.getElementById('bg-music-select');
            if (bgMusicSelect) {
                bgMusicSelect.innerHTML = '<option value="">选择背景音乐...</option>';
                music.forEach(track => {
                    const option = document.createElement('option');
                    option.value = `${project.path}/assets/music/${track}`;
                    option.textContent = track;
                    bgMusicSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('加载资源选项失败:', error);
        }
    }

    /**
     * 上传背景图片
     */
    async uploadBackgroundImage() {
        try {
            const filePaths = await window.electronAPI.chooseFile(['jpg', 'jpeg', 'png', 'gif', 'webp']);
            if (filePaths && filePaths.length > 0) {
                const sourcePath = filePaths[0];
                const targetPath = await this.projectManager.copyAssetToProject(sourcePath, 'images');
                
                // 更新选择框
                await this.loadAssetOptions();
                
                // 设置为当前背景
                this.setBackgroundImage(targetPath);
                
                const bgImageSelect = document.getElementById('bg-image-select');
                if (bgImageSelect) {
                    bgImageSelect.value = targetPath;
                }
            }
        } catch (error) {
            console.error('上传背景图片失败:', error);
            alert('上传背景图片失败: ' + error.message);
        }
    }

    /**
     * AI生成背景图片
     */
    async generateBackgroundImage() {
        try {
            if (!this.currentChapter || !this.currentChapter.content.mainText) {
                alert('请先输入主文案内容，AI将根据内容生成相应的背景图片');
                return;
            }

            // 显示加载状态
            const button = document.getElementById('ai-generate-bg-btn');
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...';
            button.disabled = true;

            // 调用AI生成图片
            const prompt = `根据以下故事内容生成合适的背景图片: ${this.currentChapter.content.mainText.substring(0, 200)}`;
            
            const result = await window.electronAPI.callAI({
                type: 'image',
                prompt: prompt,
                projectId: this.projectManager.getCurrentProject().id
            });

            if (result.success && result.imagePath) {
                // 复制到项目资源库
                const targetPath = await this.projectManager.copyAssetToProject(result.imagePath, 'images');
                
                // 更新选择框
                await this.loadAssetOptions();
                
                // 设置为当前背景
                this.setBackgroundImage(targetPath);
                
                const bgImageSelect = document.getElementById('bg-image-select');
                if (bgImageSelect) {
                    bgImageSelect.value = targetPath;
                }
                
                alert('背景图片生成成功！');
            } else {
                alert('生成背景图片失败: ' + (result.error || '未知错误'));
            }
        } catch (error) {
            console.error('AI生成背景图片失败:', error);
            alert('AI生成背景图片失败: ' + error.message);
        } finally {
            // 恢复按钮状态
            const button = document.getElementById('ai-generate-bg-btn');
            button.innerHTML = '<i class="fas fa-magic"></i> AI生成';
            button.disabled = false;
        }
    }

    /**
     * 上传背景音乐
     */
    async uploadBackgroundMusic() {
        try {
            const filePaths = await window.electronAPI.chooseFile(['mp3', 'wav', 'ogg', 'm4a', 'aac']);
            if (filePaths && filePaths.length > 0) {
                const sourcePath = filePaths[0];
                const targetPath = await this.projectManager.copyAssetToProject(sourcePath, 'music');
                
                // 更新选择框
                await this.loadAssetOptions();
                
                // 设置为当前背景音乐
                this.setBackgroundMusic(targetPath);
                
                const bgMusicSelect = document.getElementById('bg-music-select');
                if (bgMusicSelect) {
                    bgMusicSelect.value = targetPath;
                }
            }
        } catch (error) {
            console.error('上传背景音乐失败:', error);
            alert('上传背景音乐失败: ' + error.message);
        }
    }

    /**
     * AI重写功能
     */
    async aiRewrite() {
        try {
            const mainTextEditor = document.getElementById('main-text-editor');
            if (!mainTextEditor || !mainTextEditor.value.trim()) {
                alert('请先输入一些文本内容');
                return;
            }

            const button = document.getElementById('ai-rewrite-btn');
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 重写中...';
            button.disabled = true;

            const project = this.projectManager.getCurrentProject();
            const knowledgeBase = project ? project.knowledgeBase : {};
            
            const prompt = this.buildAIPrompt('rewrite', mainTextEditor.value, knowledgeBase);
            
            const result = await window.electronAPI.callAI({
                type: 'text',
                prompt: prompt
            });

            if (result.success) {
                mainTextEditor.value = result.content;
                this.currentChapter.content.mainText = result.content;
                this.updateWordCount();
                this.markModified();
            } else {
                alert('AI重写失败: ' + (result.error || '未知错误'));
            }
        } catch (error) {
            console.error('AI重写失败:', error);
            alert('AI重写失败: ' + error.message);
        } finally {
            const button = document.getElementById('ai-rewrite-btn');
            button.innerHTML = '<i class="fas fa-magic"></i> 重写';
            button.disabled = false;
        }
    }

    /**
     * AI续写功能
     */
    async aiContinue() {
        try {
            const mainTextEditor = document.getElementById('main-text-editor');
            
            const button = document.getElementById('ai-continue-btn');
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 续写中...';
            button.disabled = true;

            const project = this.projectManager.getCurrentProject();
            const knowledgeBase = project ? project.knowledgeBase : {};
            
            const prompt = this.buildAIPrompt('continue', mainTextEditor.value, knowledgeBase);
            
            const result = await window.electronAPI.callAI({
                type: 'text',
                prompt: prompt
            });

            if (result.success) {
                const newContent = mainTextEditor.value + '\n\n' + result.content;
                mainTextEditor.value = newContent;
                this.currentChapter.content.mainText = newContent;
                this.updateWordCount();
                this.markModified();
            } else {
                alert('AI续写失败: ' + (result.error || '未知错误'));
            }
        } catch (error) {
            console.error('AI续写失败:', error);
            alert('AI续写失败: ' + error.message);
        } finally {
            const button = document.getElementById('ai-continue-btn');
            button.innerHTML = '<i class="fas fa-plus"></i> 续写';
            button.disabled = false;
        }
    }

    /**
     * 构建AI提示词
     * @param {string} type - 操作类型 (rewrite/continue)
     * @param {string} content - 当前内容
     * @param {Object} knowledgeBase - 知识库
     * @returns {string} AI提示词
     */
    buildAIPrompt(type, content, knowledgeBase) {
        let prompt = '';
        
        // 添加知识库信息
        if (knowledgeBase.worldView) {
            prompt += `世界观设定: ${knowledgeBase.worldView}\n\n`;
        }
        
        if (knowledgeBase.characters && knowledgeBase.characters.length > 0) {
            prompt += `角色设定:\n`;
            knowledgeBase.characters.forEach(char => {
                prompt += `- ${char.name}: ${char.description}\n`;
            });
            prompt += '\n';
        }
        
        if (knowledgeBase.plotSummary) {
            prompt += `剧情概要: ${knowledgeBase.plotSummary}\n\n`;
        }

        // 添加操作指令
        if (type === 'rewrite') {
            prompt += `请重写以下GalGame章节内容，使其更加生动有趣，符合视觉小说的风格:\n\n${content}`;
        } else if (type === 'continue') {
            prompt += `请基于以下GalGame章节内容继续创作，保持风格一致:\n\n${content}\n\n请继续写下去:`;
        }

        return prompt;
    }

    /**
     * 显示AI助手面板
     */
    showAIAssistant() {
        // 显示AI助手对话框
        alert('AI助手功能正在开发中...');
    }

    /**
     * 更新字数统计
     */
    updateWordCount() {
        const mainTextEditor = document.getElementById('main-text-editor');
        const wordCountSpan = document.getElementById('word-count');
        
        if (wordCountSpan) {
            const mainText = mainTextEditor ? mainTextEditor.value : '';
            let total = this.chapterManager.calculateWordCount(mainText);
            try {
                const choiceInputs = document.querySelectorAll('#choices-list .choice-text');
                choiceInputs.forEach(input => { total += this.chapterManager.calculateWordCount(input.value || ''); });
            } catch {}
            wordCountSpan.textContent = total;
        }
    }

    /**
     * 保存章节
     */
    async saveChapter() {
        try {
            if (!this.currentChapter) {
                alert('没有要保存的章节');
                return;
            }

            const project = this.projectManager.getCurrentProject();
            if (!project) {
                alert('没有当前项目');
                return;
            }

            await this.chapterManager.saveChapter(project.path, this.currentChapter);
            
            this.isModified = false;
            
            // 更新保存按钮状态
            const saveBtn = document.getElementById('save-chapter-btn');
            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fas fa-check"></i> 已保存';
                setTimeout(() => {
                    saveBtn.innerHTML = '<i class="fas fa-save"></i> 保存';
                }, 2000);
            }
            
            console.log('章节已保存');
        } catch (error) {
            console.error('保存章节失败:', error);
            alert('保存章节失败: ' + error.message);
        }
    }

    /**
     * 预览章节
     */
    previewChapter() {
        if (!this.currentChapter) {
            alert('没有要预览的章节');
            return;
        }

        // 在游戏框架中预览章节
        this.showPreviewModal();
    }

    /**
     * 显示预览模态框
     */
    showPreviewModal() {
        // 创建预览模态框
        const modal = document.createElement('div');
        modal.className = 'modal preview-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>章节预览: ${this.currentChapter.title}</h3>
                    <button class="btn-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="preview-content">
                        <div class="preview-text">${this.currentChapter.content.mainText}</div>
                        <div class="preview-choices">
                            ${this.currentChapter.content.choices.map((choice, index) => 
                                `<button class="preview-choice-btn">${index + 1}. ${choice.text}</button>`
                            ).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 关闭按钮事件
        modal.querySelector('.btn-close').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    /**
     * 标记为已修改
     */
    markModified() {
        this.isModified = true;
        
        // 更新保存按钮状态
        const saveBtn = document.getElementById('save-chapter-btn');
        if (saveBtn && !saveBtn.innerHTML.includes('spinner')) {
            saveBtn.innerHTML = '<i class="fas fa-save"></i> 保存*';
        }
    }

    /**
     * 设置自动保存
     */
    setupAutoSave() {
        this.autoSaveTimer = setInterval(async () => {
            if (this.isModified && this.currentChapter) {
                try {
                    const project = this.projectManager.getCurrentProject();
                    if (project) {
                        await this.chapterManager.saveChapter(project.path, this.currentChapter);
                        this.isModified = false;
                        console.log('自动保存完成');
                    }
                } catch (error) {
                    console.error('自动保存失败:', error);
                }
            }
        }, 30000); // 30秒自动保存
    }

    /**
     * 隐藏编辑器
     */
    hide() {
        const editor = document.getElementById('galgame-chapter-editor');
        if (editor) {
            editor.style.display = 'none';
        }
    }

    /**
     * 销毁编辑器
     */
    destroy() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }
        
        const editor = document.getElementById('galgame-chapter-editor');
        if (editor) {
            editor.remove();
        }
    }

    // ========================================
    // 选项和条件管理功能
    // ========================================

    /**
     * 添加选择选项
     */
    addChoice() {
        if (!this.currentChapter) return;

        if (!this.currentChapter.content.choices) {
            this.currentChapter.content.choices = [];
        }

        const choice = this.chapterManager.createChoice('新选项');
        this.currentChapter.content.choices.push(choice);
        
        this.renderChoices();
        this.markModified();
    }

    /**
     * 渲染选择选项列表
     */
    renderChoices() {
        const choicesList = document.getElementById('choices-list');
        if (!choicesList || !this.currentChapter) return;

        choicesList.innerHTML = '';

        this.currentChapter.content.choices.forEach((choice, index) => {
            const choiceElement = this.createChoiceElement(choice, index);
            choicesList.appendChild(choiceElement);
        });
    }

    /**
     * 创建选项元素
     */
    createChoiceElement(choice, index) {
        const div = document.createElement('div');
        div.className = 'choice-item';
        div.innerHTML = `
            <div class="choice-header">
                <div class="choice-number">${index + 1}</div>
                <button class="btn btn-sm btn-danger delete-choice-btn" data-choice-id="${choice.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="choice-content">
                <div class="form-group">
                    <label>选项文本:</label>
                    <input type="text" class="choice-text-input form-control" 
                           value="${choice.text}" data-choice-id="${choice.id}">
                </div>
                
                <div class="form-group">
                    <label>默认跳转章节:</label>
                    <select class="choice-target-select form-control" data-choice-id="${choice.id}">
                        <option value="">选择目标章节...</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label>条件跳转设置:</label>
                    <div class="choice-conditions" data-choice-id="${choice.id}">
                        <!-- 条件列表 -->
                    </div>
                    <button type="button" class="btn btn-sm btn-secondary add-condition-btn" 
                            data-choice-id="${choice.id}">
                        <i class="fas fa-plus"></i> 添加条件
                    </button>
                </div>
                
                <div class="form-group">
                    <label>变量操作:</label>
                    <div class="choice-variables" data-choice-id="${choice.id}">
                        <!-- 变量操作列表 -->
                    </div>
                    <button type="button" class="btn btn-sm btn-secondary add-choice-variable-btn" 
                            data-choice-id="${choice.id}">
                        <i class="fas fa-plus"></i> 添加变量
                    </button>
                </div>
            </div>
        `;

        // 设置事件监听器
        this.setupChoiceEvents(div, choice);
        
        // 渲染条件和变量
        this.renderChoiceConditions(choice);
        this.renderChoiceVariables(choice);
        this.loadChapterOptions(div.querySelector('.choice-target-select'), choice.targetChapter);

        return div;
    }

    /**
     * 设置选项事件
     */
    setupChoiceEvents(element, choice) {
        // 选项文本输入
        const textInput = element.querySelector('.choice-text-input');
        textInput.addEventListener('input', (e) => {
            choice.text = e.target.value;
            this.markModified();
        });

        // 目标章节选择
        const targetSelect = element.querySelector('.choice-target-select');
        targetSelect.addEventListener('change', (e) => {
            choice.targetChapter = e.target.value;
            this.markModified();
        });

        // 删除选项
        const deleteBtn = element.querySelector('.delete-choice-btn');
        deleteBtn.addEventListener('click', () => {
            this.deleteChoice(choice.id);
        });

        // 添加条件
        const addConditionBtn = element.querySelector('.add-condition-btn');
        addConditionBtn.addEventListener('click', () => {
            this.addChoiceCondition(choice.id);
        });

        // 添加变量操作
        const addVariableBtn = element.querySelector('.add-choice-variable-btn');
        addVariableBtn.addEventListener('click', () => {
            this.addChoiceVariable(choice.id);
        });
    }

    /**
     * 删除选项
     */
    deleteChoice(choiceId) {
        if (!this.currentChapter) return;

        const index = this.currentChapter.content.choices.findIndex(c => c.id === choiceId);
        if (index !== -1) {
            this.currentChapter.content.choices.splice(index, 1);
            this.renderChoices();
            this.markModified();
        }
    }

    /**
     * 添加选项条件
     */
    addChoiceCondition(choiceId) {
        const choice = this.currentChapter.content.choices.find(c => c.id === choiceId);
        if (!choice) return;

        if (!choice.conditionalTargets) {
            choice.conditionalTargets = [];
        }

        const condition = this.chapterManager.createCondition('', '==', '', '');
        choice.conditionalTargets.push(condition);
        
        this.renderChoiceConditions(choice);
        this.markModified();
    }

    /**
     * 渲染选项条件
     */
    renderChoiceConditions(choice) {
        const conditionsContainer = document.querySelector(`.choice-conditions[data-choice-id="${choice.id}"]`);
        if (!conditionsContainer || !choice.conditionalTargets) return;

        conditionsContainer.innerHTML = '';

        choice.conditionalTargets.forEach((condition, index) => {
            const conditionElement = this.createConditionElement(condition, choice.id, index);
            conditionsContainer.appendChild(conditionElement);
        });
    }

    /**
     * 创建条件元素
     */
    createConditionElement(condition, choiceId, index) {
        const div = document.createElement('div');
        div.className = 'condition-item';
        div.innerHTML = `
            <div class="condition-controls">
                <input type="text" class="condition-variable form-control" placeholder="变量名" 
                       value="${condition.variable}" style="width: 20%;">
                <select class="condition-operator form-control" style="width: 15%;">
                    <option value="==" ${condition.operator === '==' ? 'selected' : ''}>=</option>
                    <option value="!=" ${condition.operator === '!=' ? 'selected' : ''}>≠</option>
                    <option value=">" ${condition.operator === '>' ? 'selected' : ''}>&gt;</option>
                    <option value="<" ${condition.operator === '<' ? 'selected' : ''}>&lt;</option>
                    <option value=">=" ${condition.operator === '>=' ? 'selected' : ''}>≥</option>
                    <option value="<=" ${condition.operator === '<=' ? 'selected' : ''}>≤</option>
                    <option value="contains" ${condition.operator === 'contains' ? 'selected' : ''}>包含</option>
                </select>
                <input type="text" class="condition-value form-control" placeholder="比较值" 
                       value="${condition.value}" style="width: 20%;">
                <span style="width: 5%; text-align: center; padding: 8px;">→</span>
                <select class="condition-target form-control" style="width: 25%;">
                    <option value="">选择跳转章节...</option>
                </select>
                <button class="btn btn-sm btn-danger delete-condition-btn" style="width: 10%;" 
                        data-condition-id="${condition.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        // 设置事件监听器
        this.setupConditionEvents(div, condition, choiceId);
        
        // 加载章节选项
        this.loadChapterOptions(div.querySelector('.condition-target'), condition.targetChapter);

        return div;
    }

    /**
     * 设置条件事件
     */
    setupConditionEvents(element, condition, choiceId) {
        const variableInput = element.querySelector('.condition-variable');
        const operatorSelect = element.querySelector('.condition-operator');
        const valueInput = element.querySelector('.condition-value');
        const targetSelect = element.querySelector('.condition-target');
        const deleteBtn = element.querySelector('.delete-condition-btn');

        variableInput.addEventListener('input', (e) => {
            condition.variable = e.target.value;
            this.markModified();
        });

        operatorSelect.addEventListener('change', (e) => {
            condition.operator = e.target.value;
            this.markModified();
        });

        valueInput.addEventListener('input', (e) => {
            condition.value = e.target.value;
            this.markModified();
        });

        targetSelect.addEventListener('change', (e) => {
            condition.targetChapter = e.target.value;
            this.markModified();
        });

        deleteBtn.addEventListener('click', () => {
            this.deleteChoiceCondition(choiceId, condition.id);
        });
    }

    /**
     * 删除选项条件
     */
    deleteChoiceCondition(choiceId, conditionId) {
        const choice = this.currentChapter.content.choices.find(c => c.id === choiceId);
        if (!choice || !choice.conditionalTargets) return;

        const index = choice.conditionalTargets.findIndex(c => c.id === conditionId);
        if (index !== -1) {
            choice.conditionalTargets.splice(index, 1);
            this.renderChoiceConditions(choice);
            this.markModified();
        }
    }

    /**
     * 添加选项变量操作
     */
    addChoiceVariable(choiceId) {
        const choice = this.currentChapter.content.choices.find(c => c.id === choiceId);
        if (!choice) return;

        if (!choice.variables) {
            choice.variables = {};
        }

        const key = `var_${Date.now()}`;
        choice.variables[key] = '';
        
        this.renderChoiceVariables(choice);
        this.markModified();
    }

    /**
     * 渲染选项变量
     */
    renderChoiceVariables(choice) {
        const variablesContainer = document.querySelector(`.choice-variables[data-choice-id="${choice.id}"]`);
        if (!variablesContainer) return;

        variablesContainer.innerHTML = '';

        if (choice.variables) {
            Object.entries(choice.variables).forEach(([key, value]) => {
                const variableElement = this.createChoiceVariableElement(key, value, choice.id);
                variablesContainer.appendChild(variableElement);
            });
        }
    }

    /**
     * 创建选项变量元素
     */
    createChoiceVariableElement(key, value, choiceId) {
        const div = document.createElement('div');
        div.className = 'variable-item';
        div.innerHTML = `
            <div class="variable-controls">
                <input type="text" class="variable-key form-control" value="${key}" placeholder="变量名">
                <span>=</span>
                <input type="text" class="variable-value form-control" value="${value}" placeholder="变量值">
                <button class="btn btn-sm btn-danger delete-variable-btn">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        // 设置事件监听器
        const keyInput = div.querySelector('.variable-key');
        const valueInput = div.querySelector('.variable-value');
        const deleteBtn = div.querySelector('.delete-variable-btn');

        keyInput.addEventListener('input', (e) => {
            this.updateChoiceVariable(choiceId, key, e.target.value, value);
        });

        valueInput.addEventListener('input', (e) => {
            this.updateChoiceVariable(choiceId, key, key, e.target.value);
        });

        deleteBtn.addEventListener('click', () => {
            this.deleteChoiceVariable(choiceId, key);
        });

        return div;
    }

    /**
     * 更新选项变量
     */
    updateChoiceVariable(choiceId, oldKey, newKey, newValue) {
        const choice = this.currentChapter.content.choices.find(c => c.id === choiceId);
        if (!choice || !choice.variables) return;

        if (oldKey !== newKey) {
            delete choice.variables[oldKey];
        }
        choice.variables[newKey] = newValue;
        this.markModified();
    }

    /**
     * 删除选项变量
     */
    deleteChoiceVariable(choiceId, key) {
        const choice = this.currentChapter.content.choices.find(c => c.id === choiceId);
        if (!choice || !choice.variables) return;

        delete choice.variables[key];
        this.renderChoiceVariables(choice);
        this.markModified();
    }

    /**
     * 加载章节选项到下拉列表
     */
    async loadChapterOptions(selectElement, selectedValue = '') {
        if (!selectElement) return;

        try {
            const project = this.projectManager.getCurrentProject();
            if (!project) return;

            // 清空现有选项
            selectElement.innerHTML = '<option value="">选择目标章节...</option>';

            // 获取项目中的所有章节
            const chaptersDir = path.join(project.path, 'chapters');
            const exists = await window.electronAPI.fsExists(chaptersDir);
            
            if (exists) {
                const chapterFiles = await window.electronAPI.fsReaddir(chaptersDir);
                
                for (const file of chapterFiles) {
                    if (file.endsWith('.json')) {
                        const chapterId = file.replace('.json', '');
                        const chapterPath = path.join(chaptersDir, file);
                        
                        try {
                            const chapterData = JSON.parse(await window.electronAPI.fsReadFile(chapterPath));
                            const option = document.createElement('option');
                            option.value = chapterId;
                            option.textContent = `${chapterId} - ${chapterData.title || '未命名'}`;
                            
                            if (chapterId === selectedValue) {
                                option.selected = true;
                            }
                            
                            selectElement.appendChild(option);
                        } catch (error) {
                            console.warn(`读取章节文件失败: ${file}`, error);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('加载章节选项失败:', error);
        }
    }

    // ========================================
    // AI 辅助功能
    // ========================================

    /**
     * 显示AI辅助面板
     */
    showAIAssistPanel() {
        // 创建AI辅助模态框
        const modal = document.createElement('div');
        modal.className = 'modal ai-assist-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-robot"></i> AI 写作辅助</h3>
                    <button class="btn-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="ai-assist-tools">
                        <div class="tool-group">
                            <h4>文本辅助</h4>
                            <button id="ai-continue-btn" class="btn btn-ai">
                                <i class="fas fa-arrow-right"></i> AI续写
                            </button>
                            <button id="ai-rewrite-btn" class="btn btn-ai">
                                <i class="fas fa-sync"></i> AI重写
                            </button>
                            <button id="ai-optimize-btn" class="btn btn-ai">
                                <i class="fas fa-star"></i> AI优化
                            </button>
                        </div>
                        <div class="tool-group">
                            <h4>图像生成</h4>
                            <button id="ai-image-btn" class="btn btn-ai">
                                <i class="fas fa-image"></i> AI作图
                            </button>
                        </div>
                        <div class="tool-group">
                            <h4>自定义提示</h4>
                            <textarea id="ai-custom-prompt" placeholder="输入自定义AI提示词..." rows="3"></textarea>
                            <button id="ai-custom-btn" class="btn btn-ai">
                                <i class="fas fa-magic"></i> 执行自定义AI
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 设置事件监听
        modal.querySelector('.btn-close').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });

        // AI功能按钮事件
        modal.querySelector('#ai-continue-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
            this.aiContinueWriting();
        });

        modal.querySelector('#ai-rewrite-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
            this.aiRewriteContent();
        });

        modal.querySelector('#ai-optimize-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
            this.aiOptimizeContent();
        });

        modal.querySelector('#ai-image-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
            this.aiGenerateImage();
        });

        modal.querySelector('#ai-custom-btn').addEventListener('click', () => {
            const prompt = modal.querySelector('#ai-custom-prompt').value.trim();
            if (!prompt) {
                alert('请输入自定义提示词');
                return;
            }
            document.body.removeChild(modal);
            this.aiCustomGenerate(prompt);
        });
    }

    /**
     * AI 续写功能
     */
    async aiContinueWriting() {
        if (!this.currentChapter) return;
        
        const currentText = this.getMainText();
        if (!currentText.trim()) {
            alert('请先输入一些文本作为续写的起点');
            return;
        }
        
        this.showAILoading('AI正在续写...');
        
        try {
            const prompt = `请基于以下内容继续写一段对话：\n${currentText}`;
            const result = await window.electronAPI.galgame.generateText(prompt, {
                temperature: 0.8,
                maxTokens: 300
            });
            
            if (result.success) {
                // 在现有文本后添加续写内容
                const textarea = document.querySelector('.main-text-editor');
                const newText = currentText + '\n\n' + result.content;
                textarea.value = newText;
                this.updateMainText(newText);
                this.markModified();
                alert('AI续写完成');
            } else {
                alert('AI续写失败: ' + result.error);
            }
        } catch (error) {
            console.error('AI续写错误:', error);
            alert('AI续写失败: ' + error.message);
        }
        
        this.hideAILoading();
    }
    
    /**
     * AI 重写功能
     */
    async aiRewriteContent() {
        if (!this.currentChapter) return;
        
        const currentText = this.getMainText();
        if (!currentText.trim()) {
            alert('请先输入一些文本进行重写');
            return;
        }
        
        this.showAILoading('AI正在重写...');
        
        try {
            const prompt = `请重新改写以下对话内容，使其更加生动有趣：\n${currentText}`;
            const result = await window.electronAPI.galgame.generateText(prompt, {
                temperature: 0.9,
                maxTokens: 400
            });
            
            if (result.success) {
                const textarea = document.querySelector('.main-text-editor');
                textarea.value = result.content;
                this.updateMainText(result.content);
                this.markModified();
                alert('AI重写完成');
            } else {
                alert('AI重写失败: ' + result.error);
            }
        } catch (error) {
            console.error('AI重写错误:', error);
            alert('AI重写失败: ' + error.message);
        }
        
        this.hideAILoading();
    }
    
    /**
     * AI 优化功能
     */
    async aiOptimizeContent() {
        if (!this.currentChapter) return;
        
        const currentText = this.getMainText();
        if (!currentText.trim()) {
            alert('请先输入一些文本进行优化');
            return;
        }
        
        this.showAILoading('AI正在优化...');
        
        try {
            const prompt = `请优化以下对话内容的表达，使其更符合视觉小说的风格：\n${currentText}`;
            const result = await window.electronAPI.galgame.generateText(prompt, {
                temperature: 0.7,
                maxTokens: 400
            });
            
            if (result.success) {
                const textarea = document.querySelector('.main-text-editor');
                textarea.value = result.content;
                this.updateMainText(result.content);
                this.markModified();
                alert('AI优化完成');
            } else {
                alert('AI优化失败: ' + result.error);
            }
        } catch (error) {
            console.error('AI优化错误:', error);
            alert('AI优化失败: ' + error.message);
        }
        
        this.hideAILoading();
    }
    
    /**
     * AI 作图功能
     */
    async aiGenerateImage() {
        if (!this.currentChapter) return;
        
        const currentText = this.getMainText();
        if (!currentText.trim()) {
            alert('请先输入一些文本作为作图的参考');
            return;
        }
        
        this.showAILoading('AI正在生成图片...');
        
        try {
            const prompt = `请根据以下剧情内容生成背景图片：场景描述需要详细具体，包含环境、光线、氛围等元素。剧情内容：\n${currentText}`;
            const result = await window.electronAPI.galgame.generateImage(prompt, {
                width: 1920,
                height: 1080,
                style: 'anime'
            });
            
            if (result.success) {
                alert('AI图片生成完成');
                // 这里可以处理生成的图片
                if (result.imagePath) {
                    // 自动设置为当前章节的背景
                    this.setChapterBackground(result.imagePath);
                }
            } else {
                alert('AI作图功能暂未开放: ' + result.error);
            }
        } catch (error) {
            console.error('AI作图错误:', error);
            alert('AI作图失败: ' + error.message);
        }
        
        this.hideAILoading();
    }

    /**
     * 自定义AI生成
     */
    async aiCustomGenerate(customPrompt) {
        if (!this.currentChapter) return;
        
        const currentText = this.getMainText();
        
        this.showAILoading('AI正在处理自定义请求...');
        
        try {
            let prompt = customPrompt;
            if (currentText.trim()) {
                prompt += `\n\n当前文本内容：\n${currentText}`;
            }

            const result = await window.electronAPI.galgame.generateText(prompt, {
                temperature: 0.8,
                maxTokens: 500
            });
            
            if (result.success) {
                const textarea = document.querySelector('.main-text-editor');
                textarea.value = result.content;
                this.updateMainText(result.content);
                this.markModified();
                alert('自定义AI生成完成');
            } else {
                alert('自定义AI生成失败: ' + result.error);
            }
        } catch (error) {
            console.error('自定义AI生成错误:', error);
            alert('自定义AI生成失败: ' + error.message);
        }
        
        this.hideAILoading();
    }

    /**
     * 显示AI加载状态
     */
    showAILoading(message) {
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'ai-loading-overlay';
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.innerHTML = `
            <div class="loading-content">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        `;
        document.body.appendChild(loadingOverlay);
    }

    /**
     * 隐藏AI加载状态
     */
    hideAILoading() {
        const loadingOverlay = document.getElementById('ai-loading-overlay');
        if (loadingOverlay) {
            document.body.removeChild(loadingOverlay);
        }
    }

    /**
     * 获取主文本内容
     */
    getMainText() {
        const textarea = document.querySelector('.main-text-editor');
        return textarea ? textarea.value : '';
    }

    /**
     * 更新主文本内容
     */
    updateMainText(text) {
        if (this.currentChapter) {
            this.currentChapter.content.mainText = text;
        }
        this.updateTextStats();
    }

    /**
     * 设置章节背景
     */
    async setChapterBackground(imagePath) {
        if (!this.currentChapter) return;
        
        try {
            // 复制图片到项目资源目录
            const project = this.projectManager.getCurrentProject();
            if (!project) return;
            
            const result = await window.electronAPI.galgame.copyAsset(imagePath, project.path, 'backgrounds');
            if (result.success) {
                this.currentChapter.content.background = result.relativePath;
                this.updateBackgroundPreview();
                this.markModified();
                console.log('背景图片设置成功:', result.relativePath);
            }
        } catch (error) {
            console.error('设置背景图片失败:', error);
        }
    }
}

// 全局实例
window.galGameChapterEditor = new GalGameChapterEditor();
