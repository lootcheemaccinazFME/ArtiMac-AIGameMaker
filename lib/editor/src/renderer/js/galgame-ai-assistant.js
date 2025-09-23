/**
 * GalGame AI助手管理器
 * 负责处理各种AI辅助功能
 */

class GalGameAIAssistant {
    constructor() {
        this.currentMode = 'dialogue';
        this.isGenerating = false;
        this.lastAIResult = null;
        this.pendingChapter = null;
        this.agentRunning = false;
        this.retryCounters = {};
        this.countdownInterval = null;  // 自动重试倒计时
        this.init();
    }

    init() {
        this.initEventListeners();
        console.log('GalGame AI助手初始化完成');
    }

    initEventListeners() {
        // 对话生成
        this.initDialogueGeneration();
        
        // 故事续写
        this.initStoryGeneration();
        
        // 图像生成
    this.initImageGeneration();
        
        // Agent模式
        this.initAgentMode();
    }

    /**
     * 初始化对话生成功能
     */
    initDialogueGeneration() {
    const generateBtn = document.getElementById('generate-dialogue-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                this.generateDialogue();
            });
        }

        // 对话参数设置
    const characterSelect = document.getElementById('dialogue-characters');
    const contextInput = document.getElementById('dialogue-context');
    const emotionSelect = document.getElementById('dialogue-emotion');

        if (characterSelect) {
            characterSelect.addEventListener('change', () => {
                this.updateDialogueParameters();
            });
        }
    }

    updateDialogueParameters() {
        // 预留：可根据选择动态调整提示或样式
        // 当前仅记录日志避免报错
        try {
            const sel = document.getElementById('dialogue-characters');
            const ids = sel ? Array.from(sel.selectedOptions).map(o => o.value) : [];
            console.log('对话角色已选择:', ids);
        } catch {}
    }

    showGeneratingStatus(text) {
        const mode = this.getCurrentAIMode();
        const map = { dialogue: 'dialogue-loading', story: 'story-loading', image: 'image-loading', agent: 'agent-loading' };
        const id = map[mode];
        const el = id && document.getElementById(id);
        if (el) el.classList.add('show');
        const status = document.getElementById('ai-status');
        if (status) status.innerHTML = `<i class="fas fa-robot"></i> ${text || 'AI生成中'}`;
        this.setResultButtonsEnabled(false);
        // 也调用appManager状态显示作为补充
        if (window.appManager?.showStatus) window.appManager.showStatus(text || '生成中...');
    }

    hideGeneratingStatus() {
        ['dialogue-loading','story-loading','image-loading','agent-loading'].forEach(id => {
            const el = document.getElementById(id); if (el) el.classList.remove('show');
        });
        const status = document.getElementById('ai-status');
        if (status) status.innerHTML = '<i class="fas fa-robot"></i> 就绪';
        this.setResultButtonsEnabled(true);
        // 也调用appManager状态隐藏
        if (window.appManager?.hideStatus) window.appManager.hideStatus();
    }

    getCurrentAIMode() {
        const activeTab = document.querySelector('.ai-tab.active');
        return activeTab?.getAttribute('data-mode') || 'dialogue';
    }

    setResultButtonsEnabled(enabled) {
        const buttons = ['accept-ai-result-btn', 'regenerate-btn', 'reject-ai-result-btn'];
        buttons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = !enabled;
        });
    }

    showError(msg) {
        if (window.appManager?.showError) window.appManager.showError(msg);
        else alert(msg);
    }

    showSuccess(msg) {
        if (window.appManager?.showSuccess) window.appManager.showSuccess(msg);
    }

    // 删除占位的 displayAIResult，实现见下文

    /**
     * 生成对话内容
     */
    async generateDialogue() {
        if (this.isGenerating) return;

    const charSelectEl = document.getElementById('dialogue-characters');
    const selectedIds = charSelectEl ? Array.from(charSelectEl.selectedOptions).map(o => o.value) : [];
    // 兼容：优先使用对话提示词输入框
    const context = document.getElementById('dialogue-prompt')?.value || document.getElementById('dialogue-context')?.value || '';
    const emotion = document.getElementById('dialogue-emotion')?.value || 'neutral';

        if (!selectedIds.length) {
            this.showError('请选择角色');
            return;
        }

        this.isGenerating = true;
        this.showGeneratingStatus('正在生成对话...');

        try {
            // 获取角色信息（从项目文件读取最新数据，避免内存库不同步）
            const characters = await this.loadProjectCharacters();
            const selected = characters.filter(c => selectedIds.includes(c.id || c.name));
            if (!selected.length) throw new Error('选中的角色未找到');

            // 构建提示词（支持多角色）
            const prompt = this.buildDialoguePrompt(selected, context, emotion);

            // 调用AI API
            const result = await this.callAIAPI(prompt, {
                type: 'dialogue',
                characters: selected.map(c => c.name),
                context: context,
                emotion: emotion
            });

            this.displayAIResult(result, 'dialogue');
            
        } catch (error) {
            console.error('生成对话失败:', error);
            this.showError('生成对话失败: ' + error.message);
        } finally {
            this.isGenerating = false;
            this.hideGeneratingStatus();
        }
    }

    async loadProjectCharacters() {
        try {
            const projectPath = window.projectPathManager?.getCurrentProjectPath?.() || window.app?.currentProject?.path;
            if (!projectPath) return [];
            const fp = `${projectPath}/characters/characters.json`;
            const res = await window.electronAPI.readFile(fp);
            if (res?.success && res.content) {
                const data = JSON.parse(res.content);
                if (Array.isArray(data)) return data.map(c => ({ id: c.id || c.name, name: c.name, description: c.description || c.bio || '' }));
                if (data?.characters && Array.isArray(data.characters)) return data.characters.map(c => ({ id: c.id || c.name, name: c.name, description: c.description || c.bio || '' }));
                if (data && typeof data === 'object') return Object.values(data).map(c => ({ id: c.id || c.name, name: c.name, description: c.description || c.bio || '' }));
            }
        } catch {}
        return [];
    }

    /**
     * 续写章节（文本+图像串联）
     */
    async continueScene(hintOverride, options = {}) {
        if (this.isGenerating) return;
        try {
            const appCtx = window.appManager || window.app;
            const projectPath = appCtx?.currentProject?.path;
            if (!projectPath) throw new Error('没有打开的项目');

            const uiHint = (document.getElementById('story-prompt')?.value || '').trim();
            const hint = (typeof hintOverride === 'string' && hintOverride.length) ? hintOverride : uiHint;
            
            // 从模态框配置或localStorage读取目标
            let goal = '';
            try {
                const config = JSON.parse(localStorage.getItem('agent-config') || '{}');
                goal = config.goal || '';
            } catch {}
            
            const layerInfo = (options?.layer && options?.totalLayers)
                ? `（当前为第${options.layer}层 / 共${options.totalLayers}层，请只推进本层的一小部分内容，不要一次写完全部。）`
                : '';
            const composedHint = goal
                ? `${goal}
—— 本次子任务：${hint || '从当前进度继续'} ${layerInfo}`
                : (hint || '从当前进度继续');
            this.isGenerating = true;
            this.showGeneratingStatus('正在生成下一章...');

            const parsedMaxChoices = Number.isFinite(parseInt(options?.maxChoices, 10)) ? Math.max(1, parseInt(options.maxChoices, 10)) : undefined;
            const resp = await window.electronAPI.invoke('ai-continue-chapter', {
                projectPath,
                hint: composedHint,
                imageSize: (options?.imageSize || options?.size || options?.image_size),
                maxChoices: parsedMaxChoices
            });
            if (!resp?.success) {
                const errMsg = resp?.error || '续写失败';
                const codeMatch = String(errMsg).match(/\b(\d{3}|[A-Z_]{3,})\b/);
                const key = options?.caller ? `continueScene:${options.caller}` : 'continueScene';
                // 阻塞式：暂停Agent直到用户选择
                const decision = await this.showAIErrorBlocking({ key, code: codeMatch?.[1] || 'AI_CONTINUE_ERROR', message: errMsg });
                return { status: decision === 'retry' ? 'retry' : 'skip' };
            }

            // 缓存章节，并在 UI 预览（时间线）
            this.pendingChapter = resp.chapter;
            // 规范化 choices：补齐 action
            try {
                if (Array.isArray(this.pendingChapter.elements)) {
                    const choiceEl = this.pendingChapter.elements.find(e => e?.type === 'choice');
                    if (choiceEl && Array.isArray(choiceEl.choices)) {
                        choiceEl.choices = choiceEl.choices.map(c => {
                            const text = c?.text || String(c || '');
                            const target = c?.target || '';
                            const action = c?.action && typeof c.action === 'object' ? c.action : { type: 'jump', target: target || '' };
                            return { text, target: target || '', action };
                        });
                    }
                }
            } catch {}
            this.previewChapterOnTimeline(resp.chapter);

            // 若有图片，尝试下载保存到项目
            if (resp.image?.url) {
                try {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const fileName = `chapter-${resp.chapter.id}-${timestamp}.png`;
                    const dl = await window.electronAPI.downloadImageToProject({ imageUrl: resp.image.url, projectPath, fileName });
                    if (dl?.success) {
                        this.attachImageToChapter(resp.chapter, `assets/images/${dl.fileName}`);
                    }
                } catch (e) {
                    console.warn('下载续写图片失败:', e?.message || e);
                }
            }

            this.displayAIResult({ type: 'chapter', data: resp.chapter }, 'story');
            // 续写自动接受插入：直接将文本插入时间线并隐藏结果区
            try { this.insertStoryResult(); this.hideAIResult(); } catch {}
            return { status: 'ok' };
        } catch (err) {
            console.error('continueScene error:', err);
            this.showError('续写失败：' + (err?.message || err));
            return { status: 'skip' };
        } finally {
            this.isGenerating = false;
            this.hideGeneratingStatus();
        }
    }

    /**
     * 接受当前 pendingChapter 并保存为新章节
     */
    async acceptPendingChapter() {
        if (!this.pendingChapter) {
            this.showError('没有可接受的章节');
            return null;
        }
        const appCtx = window.appManager || window.app;
        const projectPath = appCtx?.currentProject?.path;
        if (!projectPath) { this.showError('没有打开的项目'); return; }
        try {
            // 自动补齐新增角色：结合 newCharacters 字段与章节 elements 中的角色名
            const toCreate = new Set();
            if (Array.isArray(this.pendingChapter.newCharacters)) {
                this.pendingChapter.newCharacters.forEach(nc => { if (nc?.name) toCreate.add(nc.name); });
            }
            if (Array.isArray(this.pendingChapter.elements)) {
                this.pendingChapter.elements.forEach(el => {
                    if (el?.type === 'text' && el.character && el.character !== '旁白') {
                        toCreate.add(el.character);
                    }
                });
            }
            if (toCreate.size) {
                await this.ensureNewCharacters(projectPath, Array.from(toCreate).map(name => ({ name, note: '' })));
            }
            
            // 使用正确的保存逻辑，调用主进程的save-chapter IPC
            const chapterId = this.pendingChapter.id || `chapter-${Date.now()}`;
            const title = this.pendingChapter.title || '未命名章节';
            
            // 转换章节格式为GalGame格式
            const elements = this.pendingChapter.elements || [];
            // 规范化 choice 动作
            try {
                const choiceEl = elements.find(e => e?.type === 'choice');
                if (choiceEl && Array.isArray(choiceEl.choices)) {
                    choiceEl.choices = choiceEl.choices.map(c => {
                        const text = c?.text || String(c || '');
                        const target = c?.target || '';
                        const action = c?.action && typeof c.action === 'object' ? c.action : { type: 'jump', target: target || '' };
                        return { text, target: target || '', action };
                    });
                }
            } catch {}

            // 统一落盘结构：根级 sceneProperties + elements
            const content = {
                id: chapterId,
                title,
                sceneProperties: {
                    sceneName: (this.pendingChapter.sceneProperties && this.pendingChapter.sceneProperties.sceneName) || title || '',
                    backgroundImage: '',
                    backgroundMusic: ''
                },
                elements
            };
            // 使用正确的键写入场景属性（背景图与音乐）
            if (this.pendingChapter.sceneProperties?.backgroundImage) {
                content.sceneProperties.backgroundImage = this.pendingChapter.sceneProperties.backgroundImage;
            }
            // 不允许AI填入背景音乐，强制为空（或保留UI收集到的）
            if (this.pendingChapter.sceneProperties?.backgroundMusic) {
                content.sceneProperties.backgroundMusic = this.pendingChapter.sceneProperties.backgroundMusic;
            } else {
                content.sceneProperties.backgroundMusic = '';
            }
            
            const result = await window.electronAPI.invoke('save-chapter', {
                projectPath,
                chapterId,
                title,
                content
            });
            
            if (!result.success) throw new Error(result.error || '保存失败');
            
            this.pendingChapter = null;
            this.showSuccess('新章节已保存');
            
            // 刷新章节/资源
            try {
                const appCtx2 = window.appManager || window.app;
                const projectPath2 = appCtx2?.currentProject?.path;
                if (projectPath2 && typeof appCtx2.loadProject === 'function') {
                    await appCtx2.loadProject(projectPath2);
                } else if (typeof appCtx2.renderChaptersList === 'function') {
                    appCtx2.renderChaptersList();
                }
            } catch (e) {
                console.warn('刷新章节列表失败:', e?.message || e);
            }
            return chapterId;
        } catch (e) {
            console.error('保存章节失败:', e);
            this.showError('保存章节失败：' + (e?.message || e));
            return null;
        }
    }

    /**
     * Agent 自动续写
     */
    async startAIAgent() {
        if (this.agentRunning) return;
    let round = 0;
    let generatedCount = 0;
        this.agentRunning = true;
        
        // 显示停止按钮，隐藏启动按钮
        const startBtn = document.getElementById('start-agent-btn');
        const stopBtn = document.getElementById('stop-agent-btn');
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'inline-block';
        
        try {
            this.agentRunning = true;
            this.showGeneratingStatus('Agent 运行中...');
            const agentOverlay = document.getElementById('agent-loading');
            agentOverlay && (agentOverlay.style.display = 'flex');
            this.logAgent('Agent 启动');
            // 进度条初始化
            const progressWrap = document.getElementById('agent-progress');
            const progressFill = document.getElementById('agent-progress-fill');
            const progressText = document.getElementById('agent-progress-text');
            const depthInputEl = document.getElementById('agent-max-depth');
            const maxDepth = Math.max(1, parseInt(depthInputEl?.value || '2', 10));
            
            // 从配置读取延时与分支数
            let delayMs = 0, maxChoicesPerStep = 2, agentImageSize = null;
            try {
                const config = JSON.parse(localStorage.getItem('agent-config') || '{}');
                delayMs = Math.max(0, parseInt(config.delay || '0', 10));
                maxChoicesPerStep = Math.max(1, parseInt(config.choices || '2', 10));
                if (config.imageSize) agentImageSize = String(config.imageSize);
            } catch {}
            
            const showProgress = (done, total) => {
                if (!progressWrap || !progressFill || !progressText) return;
                const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
                progressWrap.classList.add('show');
                progressFill.style.width = pct + '%';
                progressText.textContent = `${done} / ${total}`;
            };
            const hideProgress = () => { 
                progressWrap?.classList.remove('show'); 
                if (progressFill) progressFill.style.width = '0%'; 
                if (progressText) progressText.textContent = '0 / 0'; 
            };

            const mode = (document.getElementById('agent-mode-exponential')?.checked) ? 'exponential' : 'linear';
            if (mode === 'linear') {
                // 线性模式：每次生成当前章节的下一章
                while (this.agentRunning && round < maxDepth) {
                    this.logAgent(`线性模式 第 ${round + 1} 轮续写...`);
                    while (true) {
                                const r = await this.continueScene(undefined, { layer: round + 1, totalLayers: maxDepth, imageSize: agentImageSize, maxChoices: maxChoicesPerStep });
                        if (r?.status === 'retry') continue;
                        break;
                    }
                    if (!this.pendingChapter) { this.logAgent('未获得章节，结束'); break; }
                    const newChapterId = await this.acceptPendingChapter();
                    if (newChapterId) { generatedCount += 1; }
                    showProgress(generatedCount, maxDepth);
                    if (delayMs) await new Promise(r => setTimeout(r, delayMs));
                    this.logAgent(`已保存章节 ${newChapterId || '(失败)'}`);
                    round += 1;
                }
            } else {
                // 指数模式（多层 BFS）：从当前或最新一章作为第0层前沿，逐层展开；每个主章的每个选项生成一个从章
                const appCtx = window.appManager || window.app;
                const project = appCtx?.currentProject;
                if (!project?.path) throw new Error('没有打开的项目');

                // BFS 深度限制（默认2层，可在UI加输入后读取）
                // maxDepth 已在上面取值

                // 初始化前沿：优先使用当前章节；若已有章节但未选择，则让用户选择；若完全没有章节，则自动创建初始章节
                let frontier = [];
                try {
                    const currentId = window.chapterStateManager?.getCurrentChapterId?.();
                    if (currentId) frontier = [currentId];
                } catch {}
                const hasChapters = Array.isArray(project.chapters) && project.chapters.length > 0;
                if (!frontier.length && hasChapters) {
                    this.logAgent('请选择一个初始章节作为起点');
                    try {
                        await new Promise(resolve => {
                            window.galGameUIController?.openChapterPickerModal?.((chapter) => {
                                if (chapter?.id) frontier = [chapter.id];
                                resolve();
                            });
                        });
                    } catch {}
                }
                if (!frontier.length && !hasChapters) {
                    this.logAgent('未发现章节，正在创建初始章节...');
                    while (true) {
                        const r = await this.continueScene('创建故事的开端章节', { layer: 1, totalLayers: maxDepth, imageSize: agentImageSize, maxChoices: maxChoicesPerStep });
                        if (r?.status === 'retry') continue;
                        break;
                    }
                    if (!this.pendingChapter) throw new Error('无法创建初始章节');
                    const rootId = await this.acceptPendingChapter();
                    if (!rootId) throw new Error('保存初始章节失败');
                    this.logAgent(`初始章节已创建：${rootId}`);
                    generatedCount += 1;
                    showProgress(generatedCount, 1); // 初始章节计入
                    frontier = [rootId];
                }
                if (!frontier.length) throw new Error('未选择初始章节');

                let depth = 0;
                let totalEstimated = 0; // 总预计章节数
                
                // 指数模式计算：初始章节数 + sum(maxChoicesPerStep^i, i=1 to maxDepth)
                const allChapters = this.currentProject?.chapters || [];
                const initialChapters = allChapters.length;
                let exponentialSum = 0;
                for (let i = 1; i <= maxDepth; i++) {
                    exponentialSum += Math.pow(maxChoicesPerStep, i);
                }
                const totalExpected = initialChapters + exponentialSum;
                // 使用预计的总数进行进度显示
                showProgress(generatedCount, totalExpected);
                while (this.agentRunning && depth < maxDepth && frontier.length) {
                    this.logAgent(`指数模式：展开第 ${depth + 1}/${maxDepth} 层，前沿数=${frontier.length}`);
                    const nextFrontier = [];
                    for (const parentId of frontier) {
                        if (!this.agentRunning) break;
                        this.logAgent(`处理主章节 ${parentId}`);
                        let parentData = await window.apiAdapter.loadChapter({ projectPath: project.path, chapterId: parentId });
                        if (!parentData?.success) { this.logAgent(`读取主章节失败: ${parentId}`); continue; }
                        const content = parentData.chapter?.content || parentData.chapter;
                        let elements = [];
                        if (content?.elements) elements = content.elements; else if (content?.scenes && content.scenes[0]?.elements) elements = content.scenes[0].elements;
                        const choiceEl = (elements || []).find(el => el?.type === 'choice');
                        const choices = Array.isArray(choiceEl?.choices) ? choiceEl.choices : [];
                        if (!choices.length) { this.logAgent('主章节没有选择，跳过'); continue; }
                        // 每个主章节仅按一次性配置的每步分支数展开
                        const limitedChoices = choices.slice(0, maxChoicesPerStep);
                        for (let i = 0; i < limitedChoices.length; i++) {
                            if (!this.agentRunning) break;
                            const opt = limitedChoices[i];
                            const optText = (opt && opt.text) ? String(opt.text) : '';
                            this.logAgent(`为主 ${parentId} 的选项 ${i + 1}/${limitedChoices.length} 生成从章节（hint='${optText}'）...`);
                            while (true) {
                                const r = await this.continueScene(optText, { layer: depth + 1, totalLayers: maxDepth, caller: `agent:${parentId}:${i}` , imageSize: agentImageSize, maxChoices: maxChoicesPerStep});
                                if (r?.status === 'retry') continue;
                                if (r?.status === 'skip') { this.logAgent(`选项 ${i + 1} 被用户选择跳过`); }
                                break;
                            }
                            if (!this.pendingChapter) { this.logAgent('生成失败，跳过此选项'); continue; }
                            const childId = await this.acceptPendingChapter();
                            this.logAgent(`从章节已保存：${childId}，回填到主章节选项`);
                            try {
                                await this.linkParentChoiceToChild(project.path, parentId, i, childId);
                                if (childId) { generatedCount += 1; }
                                nextFrontier.push(childId);
                                showProgress(generatedCount, totalExpected);
                                if (delayMs) await new Promise(r => setTimeout(r, delayMs));
                            } catch (e) {
                                console.warn('回填失败:', e?.message || e);
                            }
                        }
                    }
                    frontier = nextFrontier;
                    depth += 1;
                }
                hideProgress();
            }
            this.showSuccess(`Agent 完成，共生成 ${generatedCount} 章`);
            this.logAgent(`Agent 完成，共生成 ${generatedCount} 章`);
        } catch (e) {
            console.error('Agent 运行失败:', e);
            this.showError('Agent 运行失败：' + (e?.message || e));
            this.logAgent('运行失败：' + (e?.message || e));
        } finally {
            this.agentRunning = false;
            this.hideGeneratingStatus();
            const agentOverlay = document.getElementById('agent-loading');
            agentOverlay && (agentOverlay.style.display = 'none');
            hideProgress();
            // 恢复按钮状态
            if (startBtn) startBtn.style.display = 'inline-block';
            if (stopBtn) stopBtn.style.display = 'none';
        }
    }

    // 阻塞式错误弹窗：暂停Agent直到用户选择
    async showAIErrorBlocking({ key = 'ai', code, message }) {
        // 错误码提示映射
        const tipsMap = {
            '401': '未授权：请检查 API Key 是否正确、有权限。',
            '403': '禁止访问：BaseURL 或模型无权访问。',
            '404': '接口不存在：请检查 BaseURL 与路径是否正确。',
            '408': '请求超时：网络不稳定，可重试或稍后再试。',
            '429': '请求过多：请降低频率或提高延时。',
            '500': '服务器错误：服务端异常，请稍后重试。',
            '502': '网关错误：上游服务不可用，建议稍后重试。',
            '503': '服务不可用：服务限流或维护中，稍后重试。',
            'AI_CONTINUE_ERROR': '续写失败：请检查 AI 参数配置与提示词。'
        };
        const guidance = tipsMap[code] || '请检查 AI 配置（API Key、BaseURL、模型名），或稍后重试。';
        
        // 自动重试相关配置
        const retryableErrors = ['408', '429', '500', '502', '503'];
        const shouldAutoRetry = retryableErrors.includes(code);
        const autoRetryDelay = shouldAutoRetry ? 10 : 0; // 10秒倒计时

    return new Promise((resolve) => {
            let modal = document.getElementById('ai-error-modal');
            if (!modal) {
                const html = `
                <div id="ai-error-modal" class="modal">
                  <div class="modal-content small">
                    <div class="modal-header">
                      <h3>AI 错误</h3>
                      <button class="modal-close" data-close>&times;</button>
                    </div>
                    <div class="modal-body">
                      <p><strong>错误代码：</strong><span id="ai-error-code"></span></p>
                      <p><strong>错误信息：</strong><span id="ai-error-message"></span></p>
                      <p class="subtle" id="ai-error-guidance"></p>
                      <div id="ai-error-countdown" style="display: none; text-align: center; margin-top: 10px;">
                        <p>将在 <span id="ai-countdown-seconds">10</span> 秒后自动重试...</p>
                        <div class="countdown-progress">
                          <div id="ai-countdown-bar" class="countdown-bar"></div>
                        </div>
                      </div>
                    </div>
                    <div class="modal-footer">
                      <button id="ai-retry-btn" class="btn-primary">立即重试</button>
                      <button id="ai-skip-btn" class="btn-secondary">跳过</button>
                    </div>
                  </div>
                </div>`;
                document.body.insertAdjacentHTML('beforeend', html);
                modal = document.getElementById('ai-error-modal');
                
                // 添加倒计时样式
                const style = document.createElement('style');
                style.textContent = `
                    .countdown-progress {
                        width: 100%;
                        height: 4px;
                        background-color: #e0e0e0;
                        border-radius: 2px;
                        margin-top: 5px;
                        overflow: hidden;
                    }
                    .countdown-bar {
                        height: 100%;
                        background-color: #007acc;
                        width: 100%;
                        transition: width 0.1s linear;
                    }
                `;
                document.head.appendChild(style);
                
                modal.addEventListener('click', (e) => { 
                    if (e.target.matches('[data-close]') || e.target === modal) { 
                        this.clearCountdown();
                        modal.classList.remove('show'); 
                        resolve('skip'); 
                    } 
                });
            }
            
            modal.querySelector('#ai-error-code').textContent = code || 'UNKNOWN';
            modal.querySelector('#ai-error-message').textContent = message || '未知错误';
            const guide = modal.querySelector('#ai-error-guidance');
            if (guide) guide.textContent = guidance;
            
            const countdownDiv = modal.querySelector('#ai-error-countdown');
            const countdownSeconds = modal.querySelector('#ai-countdown-seconds');
            const countdownBar = modal.querySelector('#ai-countdown-bar');
            
            const retryBtn = modal.querySelector('#ai-retry-btn');
            const skipBtn = modal.querySelector('#ai-skip-btn');
            
            // 清除之前的倒计时
            this.clearCountdown();
            
            retryBtn.onclick = () => {
                this.clearCountdown();
                modal.classList.remove('show');
                const count = this.retryCounters[key] || 0;
                this.retryCounters[key] = count + 1;
                resolve('retry');
            };
            skipBtn.onclick = () => {
                this.clearCountdown();
                modal.classList.remove('show');
                resolve('skip');
            };
            
            // 如果是可自动重试的错误，启动倒计时
            if (shouldAutoRetry) {
                countdownDiv.style.display = 'block';
                retryBtn.textContent = '立即重试';
                
                let remainingTime = autoRetryDelay;
                countdownSeconds.textContent = remainingTime;
                countdownBar.style.width = '100%';
                
                this.countdownInterval = setInterval(() => {
                    remainingTime--;
                    countdownSeconds.textContent = remainingTime;
                    countdownBar.style.width = `${(remainingTime / autoRetryDelay) * 100}%`;
                    
                    if (remainingTime <= 0) {
                        this.clearCountdown();
                        modal.classList.remove('show');
                        const count = this.retryCounters[key] || 0;
                        this.retryCounters[key] = count + 1;
                        resolve('retry');
                    }
                }, 1000);
            } else {
                countdownDiv.style.display = 'none';
                retryBtn.textContent = '重试';
            }
            
            modal.classList.add('show');
        });
    }
    
    clearCountdown() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
    }

    async linkParentChoiceToChild(projectPath, parentId, choiceIndex, childId) {
    // 读取主章节，修改 choice.target，写回
        const res = await window.apiAdapter.loadChapter({ projectPath, chapterId: parentId });
    if (!res?.success) throw new Error(res?.error || '读取主章节失败');
        const raw = res.chapter?.content || res.chapter;
    if (!raw) throw new Error('主章节内容为空');
        let isScenes = false;
        let elements = [];
        if (raw.elements) elements = raw.elements; else if (raw.scenes && raw.scenes[0]?.elements) { isScenes = true; elements = raw.scenes[0].elements; }
        const el = (elements || []).find(e => e?.type === 'choice');
    if (!el || !Array.isArray(el.choices) || !el.choices[choiceIndex]) throw new Error('主章节缺少对应选项');
        el.choices[choiceIndex].target = childId;
        el.choices[choiceIndex].action = { type: 'jump', target: childId };
        // 写回（使用顶层格式，若原来是 scenes 则仍落回 scenes）
        let content;
        if (isScenes) {
            content = { 
                scenes: [{ 
                    id: 'scene_1', 
                    name: raw.scenes?.[0]?.name || '', 
                    elements, 
                    backgroundImage: raw.scenes?.[0]?.backgroundImage || raw.scenes?.[0]?.background || '', 
                    backgroundMusic: raw.scenes?.[0]?.backgroundMusic || raw.scenes?.[0]?.music || '', 
                    effects: raw.scenes?.[0]?.effects || [] 
                }] 
            };
        } else {
            content = { id: parentId, title: res.chapter?.title || raw.title || '', sceneProperties: raw.sceneProperties || {}, elements };
        }
        await window.apiAdapter.saveChapter({ projectPath, chapterId: parentId, title: res.chapter?.title || raw.title || '', content });
    }

    // —— 工具与落盘 ——
    previewChapterOnTimeline(chapter) {
        try {
            const controller = window.galGameUIController;
            if (!controller || !chapter) return;

            // 清空当前时间线（仅预览，不落盘）
            const timeline = document.getElementById('scene-timeline');
            if (timeline) {
                timeline.querySelectorAll('.timeline-element').forEach(el => el.remove());
            }

            // 应用场景属性到UI（如背景/音乐）
            if (controller.applyScenePropertiesToUI && chapter.sceneProperties) {
                controller.applyScenePropertiesToUI(chapter.sceneProperties);
            }

            // 渲染 GalGame 元素（一个 text + 一个 choice）
            if (chapter.elements && Array.isArray(chapter.elements)) {
                let index = 0;
                chapter.elements.forEach(element => {
                    if (element.type === 'text') {
                        controller.renderElementToTimeline({
                            type: 'text',
                            character: element.character || '',
                            text: element.text || ''
                        }, index++);
                    } else if (element.type === 'choice') {
                        controller.renderElementToTimeline({
                            type: 'choice',
                            description: element.description || '请选择',
                            choices: (element.choices || []).map(c => ({ text: c.text || '', target: c.target || '', action: c.action && typeof c.action==='object' ? c.action : { type:'jump', target: c.target || '' } }))
                        }, index++);
                    }
                });
                return;
            }

            // 兼容旧格式
            let idx = 0;
            if (chapter.text) {
                controller.renderElementToTimeline({ type: 'text', character: '', text: chapter.text }, idx++);
            }
            if (Array.isArray(chapter.choices)) {
                controller.renderElementToTimeline({ type: 'choice', description: '请选择', choices: chapter.choices.map(c => ({ text: c.text || c, target: c.target || '', action: c.action && typeof c.action==='object' ? c.action : { type:'jump', target: c.target || '' } })) }, idx++);
            }
        } catch (e) {
            console.warn('预览章节失败:', e);
        }
    }

    attachImageToChapter(chapter, relPath) {
        if (!chapter) return;
        if (!chapter.sceneProperties || typeof chapter.sceneProperties !== 'object') {
            chapter.sceneProperties = {};
        }
        // 将生成的图片作为场景背景应用（根级 sceneProperties 键）
        chapter.sceneProperties.backgroundImage = relPath || '';
    }

    async ensureNewCharacters(projectPath, newCharacters) {
        if (!Array.isArray(newCharacters) || newCharacters.length === 0) return;
        const filePath = (window.path && window.path.join) ? window.path.join(projectPath, 'characters', 'characters.json') : `${projectPath}/characters/characters.json`;
        let list = [];
        try {
            const res = await window.electronAPI.readFile(filePath);
            if (res?.success && res.content) {
                const data = JSON.parse(res.content);
                if (Array.isArray(data)) list = data;
                else if (data?.characters && Array.isArray(data.characters)) list = data.characters;
                else if (data && typeof data === 'object') list = Object.values(data);
            }
        } catch {}
        const existingNames = new Set(list.map(c => c.name));
        for (const nc of newCharacters) {
            if (!nc?.name) continue;
            if (!existingNames.has(nc.name)) {
                list.push({ id: nc.name, name: nc.name, description: nc.note || '' });
                existingNames.add(nc.name);
            }
        }
        await window.electronAPI.ensureDir((window.path && window.path.join) ? window.path.join(projectPath, 'characters') : `${projectPath}/characters`);
        await window.electronAPI.writeFile(filePath, JSON.stringify(list, null, 2));
        // 通知角色更新
        document.dispatchEvent(new Event('characters-changed'));
    }

    /**
     * 构建对话提示词
     */
    buildDialoguePrompt(characters, context, emotion) {
        const projectName = window.app?.currentProject?.name || window.app?.currentProject?.project?.name || '';
        let prompt = projectName ? `项目名称：${projectName}\n\n` : '';

        if (Array.isArray(characters)) {
            const names = characters.map(c => c.name).join('、');
            prompt += `请为角色"${names}"生成一段对话。\n\n`;
            prompt += '角色信息：\n';
            characters.forEach((c, idx) => {
                prompt += `- ${c.name}: ${c.description || '(无描述)'}\n`;
            });
            prompt += '\n';
        } else if (characters) {
            prompt += `请为角色"${characters.name}"生成一段对话。\n\n`;
            prompt += `角色信息：\n${characters.description}\n\n`;
        }
        
        if (context) {
            prompt += `当前情境：${context}\n\n`;
        }
        
        if (emotion && emotion !== 'neutral') {
            prompt += `情绪状态：${this.getEmotionDescription(emotion)}\n\n`;
        }
        
    prompt += '请生成符合角色特点和当前情境的对话内容，对话应该自然、生动，符合角色性格。\n\n重要：请使用与项目描述或用户输入相同的语言作答，不要混用多种语言。';
        
        return prompt;
    }

    /**
     * 获取情绪描述
     */
    getEmotionDescription(emotion) {
        const emotions = {
            happy: '开心、愉快',
            sad: '难过、沮丧',
            angry: '愤怒、生气',
            surprised: '惊讶、意外',
            confused: '困惑、疑惑',
            excited: '兴奋、激动',
            nervous: '紧张、不安',
            calm: '平静、冷静'
        };
        
        return emotions[emotion] || '中性';
    }

    /**
     * 初始化故事生成功能
     */
    initStoryGeneration() {
        const generateBtn = document.getElementById('generate-story-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                this.generateStory();
            });
        }
    }

    /**
     * 生成故事内容
     */
    async generateStory() {
        if (this.isGenerating) return;

        const hint = document.getElementById('story-context')?.value || 
                    document.getElementById('story-prompt')?.value || '';

        this.isGenerating = true;
        this.showGeneratingStatus('正在生成故事内容...');

        try {
            const appCtx = window.appManager || window.app;
            const projectPath = appCtx?.currentProject?.path;
            if (!projectPath) throw new Error('没有打开的项目');

            // 直接调用ai-continue-chapter IPC
            const config = JSON.parse(localStorage.getItem('agent-config') || '{}');
            const preferredSize = config?.imageSize || undefined;
            const resp = await window.electronAPI.invoke('ai-continue-chapter', { projectPath, hint, imageSize: preferredSize });
            if (!resp?.success) throw new Error(resp?.error || '续写失败');

            // 缓存章节，并在 UI 预览（时间线）
            this.pendingChapter = resp.chapter;
            this.previewChapterOnTimeline(resp.chapter);

            // 若有图片，尝试下载保存到项目
            if (resp.image?.url) {
                try {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const fileName = `chapter-${resp.chapter.id}-${timestamp}.png`;
                    const dl = await window.electronAPI.downloadImageToProject({ imageUrl: resp.image.url, projectPath, fileName });
                    if (dl?.success) {
                        this.attachImageToChapter(resp.chapter, `assets/images/${dl.fileName}`);
                    }
                } catch (e) {
                    console.warn('下载续写图片失败:', e?.message || e);
                }
            }

            this.displayAIResult({ type: 'chapter', data: resp.chapter }, 'story');
            
        } catch (error) {
            console.error('生成故事失败:', error);
            this.showError('生成故事失败: ' + error.message);
        } finally {
            this.isGenerating = false;
            this.hideGeneratingStatus();
        }
    }

    /**
     * 获取当前场景上下文
     */
    getCurrentSceneContext() {
        const timeline = document.getElementById('scene-timeline');
        if (!timeline) return '';

        let context = '';
        const elements = timeline.querySelectorAll('.timeline-element');
        
        elements.forEach(element => {
            if (element.classList.contains('dialogue-element')) {
                const character = element.querySelector('.character-select')?.value || '未知角色';
                const text = element.querySelector('.dialogue-text')?.value || '';
                if (text) {
                    context += `${character}: ${text}\n`;
                }
            } else if (element.classList.contains('narration-element')) {
                const text = element.querySelector('.narration-text')?.value || '';
                if (text) {
                    context += `[旁白] ${text}\n`;
                }
            }
        });

        return context;
    }

    /**
     * 构建故事提示词
     */
    buildStoryPrompt(context, style, length, sceneContext) {
        let prompt = '请续写以下故事内容：\n\n';
        
        if (sceneContext) {
            prompt += `当前场景内容：\n${sceneContext}\n\n`;
        }
        
        if (context) {
            prompt += `续写要求：${context}\n\n`;
        }
        
        // 添加风格指导
        const styleGuides = {
            romantic: '请以浪漫温馨的风格续写',
            comedy: '请以轻松幽默的风格续写',
            drama: '请以戏剧性和情感深度的风格续写',
            mystery: '请以悬疑推理的风格续写',
            adventure: '请以冒险刺激的风格续写'
        };
        
        if (styleGuides[style]) {
            prompt += styleGuides[style] + '\n\n';
        }
        
        // 添加长度指导
        const lengthGuides = {
            short: '请生成简短的内容（1-2段）',
            medium: '请生成适中长度的内容（3-5段）',
            long: '请生成较长的内容（6-10段）'
        };
        
        if (lengthGuides[length]) {
            prompt += lengthGuides[length] + '\n\n';
        }
        
    prompt += '请保持故事的连贯性和角色的一致性。\n\n重要：请使用与项目描述或用户输入相同的语言作答，不要混用多种语言。';
        
        return prompt;
    }

    /**
     * 初始化图像生成功能
     */
    initImageGeneration() {
        const generateBtn = document.getElementById('generate-image-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                this.generateImage();
            });
        }
    }

    /**
     * 生成图像
     */
    async generateImage() {
        if (this.isGenerating) return;

        const prompt = document.getElementById('image-prompt')?.value || '';
        const style = document.getElementById('image-style')?.value || 'anime';
        const size = (document.getElementById('image-size')?.value)
            || (window.appManager?.settings?.ai?.image?.defaultSize)
            || '1920x1080';

        if (!prompt) {
            this.showError('请输入图像描述');
            return;
        }

        this.isGenerating = true;
        this.showGeneratingStatus('正在生成图像...');

        try {
            // 构建图像生成提示词
            const fullPrompt = this.buildImagePrompt(prompt, style);

            // 调用AI图像生成API
            const result = await this.callImageGenerationAPI(fullPrompt, {
                style: style,
                size: size
            });

            this.displayAIResult(result, 'image');
            
        } catch (error) {
            console.error('生成图像失败:', error);
            this.showError('生成图像失败: ' + error.message);
        } finally {
            this.isGenerating = false;
            this.hideGeneratingStatus();
        }
    }

    /**
     * 生成当前章节背景并自动应用
     */
    async generateBackgroundForCurrentChapter() {
        if (this.isGenerating) return;
        try {
            const appCtx = window.appManager || window.app;
            const projectPath = appCtx?.currentProject?.path;
            if (!projectPath) throw new Error('没有打开的项目');

            // 基于当前场景/章节内容构建提示词
            const timeline = document.getElementById('scene-timeline');
            let sceneSummary = '';
            if (timeline) {
                timeline.querySelectorAll('.timeline-element').forEach(el => {
                    if (el.classList.contains('dialogue-element')) {
                        const role = el.querySelector('.character-select')?.value || '';
                        const text = el.querySelector('.dialogue-text')?.value || '';
                        if (text) sceneSummary += `${role ? role + ': ' : ''}${text}\n`;
                    }
                    if (el.classList.contains('narration-element')) {
                        const text = el.querySelector('.narration-text')?.value || '';
                        if (text) sceneSummary += `${text}\n`;
                    }
                });
            }
            const extra = document.getElementById('scene-description')?.value || '';
            const title = document.getElementById('chapter-title')?.value || '';
            const prompt = `Galgame 背景图，主题：${title || '当前章节'}。场景要素：${extra || ''}。剧情摘要：${sceneSummary || '无'}。风格：anime，干净构图，高分辨率，细节丰富。`;

            this.isGenerating = true;

            const result = await window.electronAPI.generateAIImage({
                model: (window.aiManager && window.aiManager.getImageModel && window.aiManager.getImageModel()) || undefined,
                prompt,
                imageSize: (window.appManager?.settings?.ai?.image?.defaultSize) || '1920x1080',
                steps: 20,
                guidance: 7.5
            });
            if (!result?.success || !Array.isArray(result.images) || result.images.length === 0) {
                throw new Error(result?.error || '图片生成失败');
            }
            const firstImg = result.images[0];
            let imageUrl = firstImg?.url;
            if (!imageUrl && firstImg?.b64_json) {
                imageUrl = `data:image/png;base64,${firstImg.b64_json}`;
            }
            if (!imageUrl) throw new Error('图片URL缺失');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `bg-${timestamp}.png`;
            const dl = await window.electronAPI.downloadImageToProject({ imageUrl, projectPath, fileName });
            if (!dl?.success) throw new Error(dl?.error || '保存图片失败');

            // 应用为当前场景背景
            if (window.galGameUIController?.addBackgroundElement) {
                window.galGameUIController.addBackgroundElement(`assets/images/${dl.fileName}`);
            }
            // 刷新资源库
            if (window.galGameAssetManager?.loadAssets) {
                await window.galGameAssetManager.loadAssets();
                window.galGameUIController?.refreshBackgroundAndMusicSelects?.();
            } else if (window.galGameUIController?.loadAssetLibrary) {
                await window.galGameUIController.loadAssetLibrary();
            }

            // 在结果面板中展示
            this.displayAIResult({ type: 'image', url: imageUrl, prompt }, 'image');
            this.showSuccess('背景已生成并应用');
        } catch (e) {
            console.error('生成背景失败:', e);
            this.showError('生成背景失败：' + (e?.message || e));
        } finally {
            this.isGenerating = false;
            this.hideGeneratingStatus();
        }
    }

    /**
     * 构建图像提示词
     */
    buildImagePrompt(userPrompt, style) {
        const stylePrompts = {
            anime: 'anime style, high quality, detailed, colorful, ',
            realistic: 'photorealistic, high resolution, detailed, professional, ',
            cartoon: 'cartoon style, vibrant colors, clean lines, ',
            watercolor: 'watercolor painting style, soft colors, artistic, ',
            sketch: 'pencil sketch style, black and white, detailed lines, '
        };

        const stylePrefix = stylePrompts[style] || '';
        
        return stylePrefix + userPrompt;
    }

    /**
     * 初始化Agent模式
     */
    initAgentMode() {
        const startBtn = document.getElementById('start-agent-btn');
        const stopBtn = document.getElementById('stop-agent-btn');

        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.startAIAgent();
            });
        }

        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                this.stopAIAgent();
            });
        }
    }

    stopAIAgent() {
        if (this.agentRunning) {
            this.agentRunning = false;
            this.logAgent('收到停止指令，等待当前轮次结束...');
            this.showAgentStatus('Agent 即将停止');
            
            // 恢复按钮状态
            const startBtn = document.getElementById('start-agent-btn');
            const stopBtn = document.getElementById('stop-agent-btn');
            if (startBtn) startBtn.style.display = 'inline-block';
            if (stopBtn) stopBtn.style.display = 'none';
            const agentOverlay = document.getElementById('agent-loading');
            agentOverlay && (agentOverlay.style.display = 'none');
        }
    }

    logAgent(message) {
        const container = document.getElementById('agent-logs');
        const line = `[${new Date().toLocaleTimeString()}] ${message}`;
        if (container) {
            const div = document.createElement('div');
            div.textContent = line;
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
        } else {
            console.log('Agent:', line);
        }
    }

    /**
     * 调用AI API
     */
    async callAIAPI(prompt, options = {}) {
        if (!window.aiManager) {
            throw new Error('AI管理器未初始化');
        }

        // 使用现有的AI管理器
        return await window.aiManager.generateContent(prompt, options);
    }

    /**
     * 调用图像生成API
     */
    async callImageGenerationAPI(prompt, options = {}) {
        const payload = {
            model: options?.model,
            prompt,
            imageSize: options?.size || options?.image_size,
            batchSize: options?.batchSize ?? 1,
            steps: options?.steps ?? 20,
            guidance: options?.guidance ?? 7.5
        };
        const res = await window.electronAPI.generateAIImage(payload);
        if (!res?.success) throw new Error(res?.error || '图片生成失败');
        const img = res.images?.[0];
        if (!img) throw new Error('未返回图片');
        let url = img.url;
        // 如果是 base64，则转成 data URL 显示
        if (!url && img.b64_json) {
            url = `data:image/png;base64,${img.b64_json}`;
        }
        return { type: 'image', url, prompt, options };
    }

    /**
     * 显示AI结果
     */
    displayAIResult(result, type) {
        this.lastAIResult = result;
        
        const resultContainer = document.getElementById('ai-result-container');
        const resultContent = document.getElementById('ai-result-content');
        // index.html 中无 id="ai-result-actions"，直接操作按钮

        if (resultContainer && resultContent) {
            resultContainer.style.display = 'block';
            
            if (type === 'image') {
                resultContent.innerHTML = `
                    <div class="image-result">
                        <img src="${result.url}" alt="生成的图像" style="max-width: 100%; height: auto;">
                        <p class="image-prompt">提示词: ${result.prompt}</p>
                        <div style="margin-top:8px;">
                            <button id="apply-image-as-background" class="btn-secondary">
                                <i class="fas fa-image"></i> 应用为当前背景
                            </button>
                        </div>
                    </div>
                `;
                const applyBtn = document.getElementById('apply-image-as-background');
                if (applyBtn) {
                    applyBtn.addEventListener('click', async () => {
                        try {
                            const appCtx = window.appManager || window.app;
                            const projectPath = appCtx?.currentProject?.path;
                            if (!projectPath) throw new Error('没有打开的项目');
                            const url = result.url;
                            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                            const fileName = `bg-${timestamp}.png`;
                            const dl = await window.electronAPI.downloadImageToProject({ imageUrl: url, projectPath, fileName });
                            if (!dl?.success) throw new Error(dl?.error || '保存图片失败');
                            if (window.galGameUIController?.addBackgroundElement) {
                                window.galGameUIController.addBackgroundElement(`assets/images/${dl.fileName}`);
                            }
                            if (window.galGameAssetManager?.loadAssets) {
                                await window.galGameAssetManager.loadAssets();
                                window.galGameUIController?.refreshBackgroundAndMusicSelects?.();
                            } else if (window.galGameUIController?.loadAssetLibrary) {
                                await window.galGameUIController.loadAssetLibrary();
                            }
                            this.showSuccess('已应用为当前背景');
                        } catch (e) {
                            this.showError('应用背景失败：' + (e?.message || e));
                        }
                    });
                }
            } else if (result?.type === 'chapter' || type === 'story') {
                const chapter = (result && typeof result === 'object') ? (result.data || result.chapter || result) : { text: String(result || '') };
                const title = chapter.title || chapter.name || 'AI生成章节';
                
                // 渲染GalGame章节格式
                if (chapter.elements && Array.isArray(chapter.elements)) {
                    const elementsHtml = chapter.elements.map((el, idx) => {
                        if (el.type === 'text') {
                            return `<div class="chapter-element"><strong>${el.character || '旁白'}:</strong> ${el.text || ''}</div>`;
                        } else if (el.type === 'choice') {
                            const choicesHtml = (el.choices || []).map(c => `<li>${c.text} → ${c.target || '未知目标'}</li>`).join('');
                            return `<div class="chapter-element"><strong>选择:</strong> <ul>${choicesHtml}</ul></div>`;
                        }
                        return '';
                    }).join('');
                    
                    resultContent.innerHTML = `
                        <div class="text-result">
                            <h5>${title}</h5>
                            <div class="chapter-preview">${elementsHtml}</div>
                            ${chapter.sceneProperties?.sceneName ? `<p><em>场景: ${chapter.sceneProperties.sceneName}</em></p>` : ''}
                            ${chapter.imagePrompt ? `<p><em>图片提示: ${chapter.imagePrompt}</em></p>` : ''}
                        </div>
                    `;
                } else {
                    // 兼容旧格式或纯文本
                    const text = chapter.text || chapter.content || String(result?.content || '');
                    const choices = Array.isArray(chapter.choices) ? chapter.choices : [];
                    const choicesHtml = choices.length ? `<ul>${choices.map(c => `<li>${c.text || c}</li>`).join('')}</ul>` : '';
                    resultContent.innerHTML = `
                        <div class="text-result">
                            <h5>${title}</h5>
                            <pre>${text}</pre>
                            ${choicesHtml}
                        </div>
                    `;
                }
            } else {
                const plain = (result && typeof result === 'object') ? (result.content || result.text || result.message || '') : String(result || '');
                resultContent.innerHTML = `
                    <div class="text-result">
                        <pre>${plain}</pre>
                    </div>
                `;
            }
        }
    this.setResultButtonsEnabled(true);
    }

    /**
     * 接受AI结果
     */
    acceptAIResult() {
        if (!this.lastAIResult) return;
        this.setResultButtonsEnabled(false);
        this.clearResultContent();

        const currentMode = this.getCurrentAIMode();
        
        if (currentMode === 'dialogue') {
            this.insertDialogueResult();
        } else if (currentMode === 'story') {
            this.insertStoryResult();
        } else if (currentMode === 'image') {
            this.insertImageResult();
        }

        this.hideAIResult();
    }

    /**
     * 插入对话结果
     */
    insertDialogueResult() {
        if (!this.lastAIResult) return;

        // 添加对话元素到场景时间轴
        if (window.galGameUIController) {
            window.galGameUIController.addDialogueElement();
            
            // 填充生成的内容
            const timeline = document.getElementById('scene-timeline');
            const lastDialogue = timeline?.querySelector('.dialogue-element:last-child');
            
            if (lastDialogue) {
                const textInput = lastDialogue.querySelector('.dialogue-text');
                if (textInput) {
                    const val = (this.lastAIResult && typeof this.lastAIResult === 'object') ? (this.lastAIResult.content || this.lastAIResult.text || this.lastAIResult.message || '') : String(this.lastAIResult || '');
                    textInput.value = val;
                }
            }
        }
    }

    /**
     * 插入故事结果
     */
    insertStoryResult() {
        if (!this.lastAIResult) return;
        const text = (this.lastAIResult && typeof this.lastAIResult === 'object') ? (this.lastAIResult.content || this.lastAIResult.text || this.lastAIResult.message || '') : String(this.lastAIResult || '');
        if (window.galGameUIController) {
            window.galGameUIController.renderElementToTimeline({ type: 'text', character: '旁白', text }, undefined);
        }
    }

    /**
     * 插入图像结果
     */
    async insertImageResult() {
        if (!this.lastAIResult || !this.lastAIResult.url) return;
        try {
            const appCtx = window.appManager || window.app;
            const projectPath = appCtx?.currentProject?.path;
            if (!projectPath) throw new Error('没有打开的项目');
            const url = this.lastAIResult.url;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `ai-generated-${timestamp}.png`;
            const dl = await window.electronAPI.downloadImageToProject({ imageUrl: url, projectPath, fileName });
            if (!dl?.success) throw new Error(dl?.error || '保存图片失败');

            // 添加到资源库并刷新
            if (window.galGameAssetManager?.loadAssets) {
                await window.galGameAssetManager.loadAssets();
                window.galGameUIController?.refreshBackgroundAndMusicSelects?.();
            } else if (window.galGameUIController?.loadAssetLibrary) {
                await window.galGameUIController.loadAssetLibrary();
            }
            // 如果当前在场景编辑器，直接添加到背景列表供选择
            if (window.galGameUIController?.addBackgroundElement) {
                window.galGameUIController.addBackgroundElement(`assets/images/${dl.fileName}`);
            }
            this.showSuccess('图片已保存到项目资源');
        } catch (e) {
            console.error('保存AI图片失败:', e);
            this.showError('保存AI图片失败：' + (e?.message || e));
        }
    }

    // —— 统一按钮状态与结果区 ——
    setResultButtonsEnabled(enabled) {
        const accept = document.getElementById('accept-ai-result-btn');
        const regen = document.getElementById('regenerate-btn');
        const reject = document.getElementById('reject-ai-result-btn');
        [accept, regen, reject].forEach(b => { if (b) b.disabled = !enabled; });
    }
    clearResultContent() {
        const resultContent = document.getElementById('ai-result-content');
        if (resultContent) resultContent.innerHTML = '';
    }

    // —— 工具方法 ——

    handleAIError({ key = 'ai', code, message, recover, onSkip }) {
        try {
            const count = this.retryCounters[key] || 0;
            if (count >= 3) {
                // 达到上限：执行跳过并不再弹窗
                if (typeof onSkip === 'function') onSkip();
                return;
            }
            this.showAIErrorModal({ key, code, message, recover, onSkip });
            if (window.electronAPI?.notify) {
                window.electronAPI.notify({ title: 'AI 错误', body: `错误代码：${code}` });
            }
        } catch {}
    }

        showAIErrorModal({ key = 'ai', code, message, recover, onSkip }) {
        let modal = document.getElementById('ai-error-modal');
        if (!modal) {
            const html = `
            <div id="ai-error-modal" class="modal">
              <div class="modal-content small">
                <div class="modal-header">
                  <h3>AI 错误</h3>
                  <button class="modal-close" data-close>&times;</button>
                </div>
                <div class="modal-body">
                  <p><strong>错误代码：</strong><span id="ai-error-code"></span></p>
                  <p><strong>错误信息：</strong><span id="ai-error-message"></span></p>
                  <p class="subtle">指导：请检查 AI 配置（API Key、BaseURL、模型名），或稍后重试。</p>
                </div>
                <div class="modal-footer">
                  <button id="ai-retry-btn" class="btn-primary">重试</button>
                  <button id="ai-skip-btn" class="btn-secondary">跳过</button>
                </div>
              </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', html);
            modal = document.getElementById('ai-error-modal');
            modal.addEventListener('click', (e) => { if (e.target.matches('[data-close]') || e.target === modal) modal.classList.remove('show'); });
            const skip = modal.querySelector('#ai-skip-btn');
                        skip.addEventListener('click', () => { modal.classList.remove('show'); if (typeof onSkip === 'function') onSkip(); });
        }
        modal.querySelector('#ai-error-code').textContent = code || 'UNKNOWN';
        modal.querySelector('#ai-error-message').textContent = message || '';
        const retryBtn = modal.querySelector('#ai-retry-btn');
                let countdown = 30;
        let timerId;
        const updateText = () => { retryBtn.textContent = `重试（${countdown}s）`; };
        const clearTimer = () => { if (timerId) { clearInterval(timerId); timerId = null; } };
        const doRetry = async () => {
            clearTimer(); attempts += 1;
                        this.retryCounters[key] = (this.retryCounters[key] || 0) + 1;
                        if (this.retryCounters[key] > 3) {
                                modal.classList.remove('show');
                                if (typeof onSkip === 'function') onSkip();
                                return;
                        }
                        modal.classList.remove('show');
                        if (typeof recover === 'function') await recover();
        };
        retryBtn.onclick = doRetry;
        const startCountdown = () => {
            countdown = 30; updateText();
            clearTimer();
            timerId = setInterval(() => {
                countdown -= 1; updateText();
                if (countdown <= 0) doRetry();
            }, 1000);
        };
        modal.classList.add('show');
        startCountdown();
    }

    /**
     * 获取当前AI模式
     */
    getCurrentAIMode() {
        const activeTab = document.querySelector('.ai-tab.active');
        return activeTab?.dataset.mode || 'dialogue';
    }

    /**
     * 设置生成按钮状态  
     */
    setGenerateButtonsEnabled(enabled) {
        const buttons = document.querySelectorAll('.ai-generate-btn');
        buttons.forEach(button => {
            button.disabled = !enabled;
        });
    }

    /**
     * 隐藏AI结果
     */
    hideAIResult() {
        const resultContainer = document.getElementById('ai-result-container');
        if (resultContainer) {
            resultContainer.style.display = 'none';
        }
    }

    /**
     * 显示错误信息
     */
    showError(message) {
        console.error('AI助手错误:', message);
        
        // 这里可以显示错误提示
        if (window.app && typeof window.app.showError === 'function') {
            window.app.showError(message);
        } else {
            alert('错误: ' + message);
        }
    }

    /**
     * 显示Agent状态
     */
    showAgentStatus(message) {
        const statusElement = document.getElementById('agent-status');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }
}

// 全局初始化AI助手
window.galGameAIAssistant = new GalGameAIAssistant();
