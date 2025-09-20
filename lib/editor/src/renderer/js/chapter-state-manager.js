/**
 * 章节状态管理器
 * 专门处理当前章节状态和保存逻辑
 */

class ChapterStateManager {
    constructor() {
        this.currentChapter = null;
        this.isDirty = false;
    }

    /**
     * 设置当前章节
     */
    setCurrentChapter(chapter) {
        console.log('[ChapterStateManager] 设置当前章节:', chapter);
        if (chapter) {
            const id = chapter.id || chapter.chapterId || null;
            const title = chapter.title || chapter.name || '未命名章节';
            this.currentChapter = { ...chapter, id, title };
        } else {
            this.currentChapter = null;
        }
        this.isDirty = false;
    }

    /**
     * 获取当前章节
     */
    getCurrentChapter() {
        return this.currentChapter;
    }

    /**
     * 获取当前章节ID
     */
    getCurrentChapterId() {
        return this.currentChapter?.id || null;
    }

    /**
     * 更新当前章节标题
     */
    updateCurrentChapterTitle(title) {
        if (this.currentChapter) {
            this.currentChapter.title = title;
            this.markDirty();
        }
    }

    /**
     * 标记为需要保存
     */
    markDirty() {
        this.isDirty = true;
    }

    /**
     * 标记为已保存
     */
    markClean() {
        this.isDirty = false;
    }

    /**
     * 检查是否需要保存
     */
    needsSave() {
        return this.isDirty;
    }

    /**
     * 保存当前章节 - 使用现有章节ID
     */
    async saveCurrentChapter(controller) {
        try {
            if (!this.currentChapter) {
                console.warn('[ChapterStateManager] 没有当前章节需要保存');
                return;
            }

            const appCtx = window.appManager || window.app;
            if (!appCtx?.currentProject) {
                throw new Error('没有打开的项目');
            }

            // 使用现有的章节ID，不生成新的
            let chapterId = this.currentChapter.id;
            if (!chapterId) {
                // 尝试从控制器或app中获取
                chapterId = controller?.currentChapter?.id || (window.appManager||window.app)?.currentChapter?.id || null;
            }
            if (!chapterId) throw new Error('当前章节缺少ID');

            console.log('[ChapterStateManager] 保存章节ID:', chapterId);

            const projectPath = appCtx.currentProject.path;
            const chapterPath = `${projectPath}/chapters/${chapterId}/content.json`;
            const chaptersDir = `${projectPath}/chapters/${chapterId}`;

            // 确保目录存在
            await window.electronAPI.ensureDir(chaptersDir);

            // 收集场景属性
            const sceneProperties = controller.collectSceneProperties ? controller.collectSceneProperties() : {};
            
            // 收集章节数据
            const elements = controller.collectChapterData ? controller.collectChapterData() : [];

            // 构建章节数据
            const chapterData = {
                id: chapterId,
                title: this.currentChapter.title || '未命名章节',
                sceneProperties: sceneProperties,
                elements: elements
            };

            // 保存到文件
            await window.electronAPI.writeFile(chapterPath, JSON.stringify(chapterData, null, 2));
            console.log('[ChapterStateManager] 章节已保存到:', chapterPath);

            // 更新内存中的章节数据
            this.currentChapter = { ...chapterData };
            this.markClean();

            // 更新项目中的章节信息
            if (appCtx.currentProject.chapters) {
                const chapterIndex = appCtx.currentProject.chapters.findIndex(ch => ch.id === chapterId);
                if (chapterIndex >= 0) {
                    appCtx.currentProject.chapters[chapterIndex].title = chapterData.title;
                }
            }

            return chapterData;

        } catch (error) {
            console.error('[ChapterStateManager] 保存章节失败:', error);
            throw error;
        }
    }

    /**
     * 加载章节数据
     */
    async loadChapter(chapterId, controller) {
        try {
            if (!chapterId) {
                throw new Error('章节ID不能为空');
            }

            console.log('[ChapterStateManager] 加载章节:', chapterId);

            const appCtx = window.appManager || window.app;
            if (!appCtx?.currentProject) {
                throw new Error('没有打开的项目');
            }

            // 保存当前章节（如果有的话）
            if (this.currentChapter && this.isDirty) {
                await this.saveCurrentChapter(controller);
            }

            // 从项目章节列表中查找章节信息
            const chapterRef = appCtx.currentProject.chapters?.find(ch => ch.id === chapterId);
            
            const projectPath = appCtx.currentProject.path;
            const chapterPath = `${projectPath}/chapters/${chapterId}/content.json`;
            
            // 读取章节文件
            const chapterResult = await window.electronAPI.readFile(chapterPath);
            let chapterData;
            
            if (!chapterResult.success) {
                console.log('[ChapterStateManager] 章节文件不存在，创建新章节');
                // 创建新章节
                chapterData = {
                    id: chapterId,
                    title: chapterRef?.title || `章节 ${chapterId}`,
                    elements: [],
                    sceneProperties: {}
                };
            } else {
                const raw = JSON.parse(chapterResult.content);
                // 兼容旧格式：若为 scenes 包装，转换为顶层格式
                if (raw && Array.isArray(raw.scenes)) {
                    const scene = raw.scenes[0] || {};
                    const normalizeElements = (arr) => {
                        if (!Array.isArray(arr)) return [];
                        return arr
                            .filter(el => el && el.type)
                            .map(el => {
                                if (el.type === 'text' || el.type === 'dialogue' || el.type === 'narration') {
                                    return {
                                        type: 'text',
                                        character: el.character || '',
                                        text: el.text || el.content || ''
                                    };
                                }
                                if (el.type === 'choice') {
                                    return {
                                        type: 'choice',
                                        description: el.description || '请选择',
                                        choices: Array.isArray(el.choices) ? el.choices.map(c => ({
                                            text: (c && (c.text || c.content)) || '',
                                            target: (c && c.target) || ''
                                        })) : []
                                    };
                                }
                                return null;
                            })
                            .filter(Boolean);
                    };
                    chapterData = {
                        id: chapterId,
                        title: chapterRef?.title || scene.name || `章节 ${chapterId}`,
                        sceneProperties: {
                            sceneName: scene.name || '',
                            backgroundImage: scene.background || '',
                            backgroundMusic: scene.music || ''
                        },
                        elements: normalizeElements(scene.elements)
                    };
                } else {
                    // 已是顶层结构
                    chapterData = raw;
                }
                // 确保使用项目中的最新标题
                if (chapterRef?.title) {
                    chapterData.title = chapterRef.title;
                }
            }

            // 设置为当前章节
            this.setCurrentChapter(chapterData);

            return chapterData;

        } catch (error) {
            console.error('[ChapterStateManager] 加载章节失败:', error);
            throw error;
        }
    }

    /**
     * 创建新章节
     */
    async createNewChapter(title, controller) {
        try {
            const appCtx = window.appManager || window.app;
            if (!appCtx?.currentProject) {
                throw new Error('没有打开的项目');
            }

            // 生成章节ID
            const chapterId = `chapter_${Date.now()}`;
            
            // 创建章节数据
            const chapterData = {
                id: chapterId,
                title: title || '新章节',
                elements: [],
                sceneProperties: {}
            };

            const projectPath = appCtx.currentProject.path;
            const chaptersDir = `${projectPath}/chapters/${chapterId}`;
            const chapterPath = `${chaptersDir}/content.json`;

            // 确保目录存在
            await window.electronAPI.ensureDir(chaptersDir);
            
            // 写入章节文件
            await window.electronAPI.writeFile(chapterPath, JSON.stringify(chapterData, null, 2));
            
            // 添加到项目的章节列表
            if (!appCtx.currentProject.chapters) {
                appCtx.currentProject.chapters = [];
            }
            
            appCtx.currentProject.chapters.push({
                id: chapterId,
                title: title || '新章节',
                file: `chapters/${chapterId}/content.json`
            });

            // 设置为当前章节
            this.setCurrentChapter(chapterData);

            console.log('[ChapterStateManager] 新章节创建完成:', chapterId);
            return chapterData;

        } catch (error) {
            console.error('[ChapterStateManager] 创建新章节失败:', error);
            throw error;
        }
    }

    /**
     * 清除当前章节
     */
    clearCurrentChapter() {
        this.currentChapter = null;
        this.isDirty = false;
    }

    /**
     * 检查章节是否有效
     */
    isCurrentChapterValid() {
        return this.currentChapter && this.currentChapter.id;
    }
}

// 全局实例
window.chapterStateManager = new ChapterStateManager();