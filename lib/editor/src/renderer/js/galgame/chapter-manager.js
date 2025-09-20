/**
 * GalGame章节管理器
 * 负责管理GalGame项目的章节数据结构
 */

class GalGameChapterManager {
    constructor() {
        this.currentChapter = null;
        this.chapters = new Map(); // 缓存加载的章节
        this.projectManager = null; // 引用主项目管理器
    }

    /**
     * 初始化章节管理器
     * @param {Object} projectManager - 项目管理器实例
     */
    init(projectManager) {
        this.projectManager = projectManager;
    }

    /**
     * 创建新章节
     * @param {string} chapterId - 章节ID
     * @param {string} title - 章节标题
     * @returns {Object} 章节数据对象
     */
    createChapter(chapterId, title = '新章节') {
        const chapter = {
            id: chapterId,
            title: title,
            content: {
                mainText: '', // 主文案（对话内容）
                choices: [], // 选项列表
                backgroundImage: null, // 背景图片路径
                backgroundMusic: null, // 背景音乐路径
                variables: {}, // 章节变量操作
                metadata: {
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    wordCount: 0
                }
            }
        };

        this.chapters.set(chapterId, chapter);
        return chapter;
    }

    /**
     * 创建选项对象
     * @param {string} text - 选项文本
     * @param {string} targetChapter - 目标章节ID
     * @param {Object} variables - 变量操作
     * @returns {Object} 选项对象
     */
    createChoice(text, targetChapter = null, variables = {}) {
        return {
            id: this.generateId(),
            text: text,
            targetChapter: targetChapter,
            variables: variables, // { varName: value, ... }
            conditions: [], // 条件表达式列表
            conditionalTargets: [] // 条件跳转目标列表
        };
    }

    /**
     * 创建条件表达式
     * @param {string} variable - 变量名
     * @param {string} operator - 操作符 (==, !=, >, <, >=, <=, contains)
     * @param {any} value - 比较值
     * @param {string} targetChapter - 满足条件时的跳转章节
     * @returns {Object} 条件对象
     */
    createCondition(variable, operator, value, targetChapter) {
        return {
            id: this.generateId(),
            variable: variable,
            operator: operator,
            value: value,
            targetChapter: targetChapter
        };
    }

    /**
     * 加载章节数据
     * @param {string} projectPath - 项目路径
     * @param {string} chapterId - 章节ID
     * @returns {Promise<Object>} 章节数据
     */
    async loadChapter(projectPath, chapterId) {
        try {
            const chapterPath = `${projectPath}/chapters/${chapterId}/content.json`;
            const exists = await window.electronAPI.pathExists(chapterPath);
            
            if (!exists) {
                // 创建新章节
                const chapter = this.createChapter(chapterId);
                await this.saveChapter(projectPath, chapter);
                return chapter;
            }

            const chapterData = await window.electronAPI.readFile(chapterPath);
            const chapter = JSON.parse(chapterData);
            
            // 确保章节数据结构完整
            this.validateChapterStructure(chapter);
            
            this.chapters.set(chapterId, chapter);
            this.currentChapter = chapter;
            
            return chapter;
        } catch (error) {
            console.error('加载章节失败:', error);
            throw error;
        }
    }

    /**
     * 保存章节数据
     * @param {string} projectPath - 项目路径
     * @param {Object} chapter - 章节数据
     * @returns {Promise<void>}
     */
    async saveChapter(projectPath, chapter) {
        try {
            // 确保chapters目录存在
            const chaptersDir = `${projectPath}/chapters/${chapter.id}`;
            await window.electronAPI.createDirectory(chaptersDir);

            // 更新时间戳和字数统计（正文 + 所有选项文本）
            chapter.content.metadata.updatedAt = new Date().toISOString();
            const main = this.calculateWordCount(chapter.content.mainText);
            const choices = Array.isArray(chapter.content.choices) ? chapter.content.choices.reduce((sum, c) => sum + this.calculateWordCount(c?.text || ''), 0) : 0;
            chapter.content.metadata.wordCount = main + choices;

            const chapterPath = `${chaptersDir}/content.json`;
            await window.electronAPI.writeFile(chapterPath, JSON.stringify(chapter, null, 2));
            
            // 更新缓存
            this.chapters.set(chapter.id, chapter);
            
            console.log('章节已保存:', chapter.id);
        } catch (error) {
            console.error('保存章节失败:', error);
            throw error;
        }
    }

    /**
     * 删除章节
     * @param {string} projectPath - 项目路径
     * @param {string} chapterId - 章节ID
     * @returns {Promise<void>}
     */
    async deleteChapter(projectPath, chapterId) {
        try {
            const chapterPath = `${projectPath}/chapters/${chapterId}/content.json`;
            await window.electronAPI.deleteFile(chapterPath);
            
            this.chapters.delete(chapterId);
            
            if (this.currentChapter && this.currentChapter.id === chapterId) {
                this.currentChapter = null;
            }
            
            console.log('章节已删除:', chapterId);
        } catch (error) {
            console.error('删除章节失败:', error);
            throw error;
        }
    }

    /**
     * 获取项目所有章节列表
     * @param {string} projectPath - 项目路径
     * @returns {Promise<Array>} 章节列表
     */
    async getChapterList(projectPath) {
        try {
            const chaptersDir = `${projectPath}/chapters`;
            const exists = await window.electronAPI.pathExists(chaptersDir);
            
            if (!exists) {
                await window.electronAPI.createDirectory(chaptersDir);
                return [];
            }

            const chapterFolders = await window.electronAPI.listDirectory(chaptersDir);
            const chapters = [];

            for (const folder of chapterFolders) {
                // 期待结构：chapters/<id>/content.json
                const chapterId = folder;
                const file = `${chapterId}.json`;
                const chapterFilePath = `${chaptersDir}/${chapterId}/${file}`;
                const exists = await window.electronAPI.pathExists(chapterFilePath);
                if (!exists) continue;
                try {
                    const chapter = await this.loadChapter(projectPath, chapterId);
                    const main = this.calculateWordCount(chapter.content?.mainText || '');
                    const choices = Array.isArray(chapter.content?.choices) ? chapter.content.choices.reduce((sum, c) => sum + this.calculateWordCount(c?.text || ''), 0) : 0;
                    const wc = (chapter.content?.metadata?.wordCount ?? (main + choices));
                    chapters.push({
                        id: chapter.id,
                        title: chapter.title,
                        wordCount: wc,
                        updatedAt: chapter.content?.metadata?.updatedAt
                    });
                } catch (error) {
                    console.error(`加载章节 ${chapterId} 失败:`, error);
                }
            }

            return chapters.sort((a, b) => a.id.localeCompare(b.id));
        } catch (error) {
            console.error('获取章节列表失败:', error);
            return [];
        }
    }

    /**
     * 验证章节数据结构
     * @param {Object} chapter - 章节数据
     */
    validateChapterStructure(chapter) {
        if (!chapter.content) {
            chapter.content = {};
        }
        
        if (!chapter.content.mainText) {
            chapter.content.mainText = '';
        }
        
        if (!chapter.content.choices) {
            chapter.content.choices = [];
        }
        
        if (!chapter.content.metadata) {
            chapter.content.metadata = {
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                wordCount: 0
            };
        }
        
        if (!chapter.content.variables) {
            chapter.content.variables = {};
        }
    }

    /**
     * 计算文本字数
     * @param {string} text - 文本内容
     * @returns {number} 字数
     */
    calculateWordCount(text) {
        if (!text) return 0;
        return text.replace(/\s/g, '').length;
    }

    /**
     * 生成唯一ID
     * @returns {string} 唯一ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    /**
     * 添加选项到章节
     * @param {Object} chapter - 章节数据
     * @param {string} text - 选项文本
     * @param {string} targetChapter - 目标章节
     * @param {Object} variables - 变量操作
     * @returns {Object} 新添加的选项
     */
    addChoice(chapter, text, targetChapter = null, variables = {}) {
        const choice = this.createChoice(text, targetChapter, variables);
        chapter.content.choices.push(choice);
        return choice;
    }

    /**
     * 删除选项
     * @param {Object} chapter - 章节数据
     * @param {string} choiceId - 选项ID
     * @returns {boolean} 是否成功删除
     */
    removeChoice(chapter, choiceId) {
        const index = chapter.content.choices.findIndex(choice => choice.id === choiceId);
        if (index !== -1) {
            chapter.content.choices.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * 更新章节背景图片
     * @param {Object} chapter - 章节数据
     * @param {string} imagePath - 图片路径
     */
    setBackgroundImage(chapter, imagePath) {
        chapter.content.backgroundImage = imagePath;
    }

    /**
     * 更新章节背景音乐
     * @param {Object} chapter - 章节数据
     * @param {string} musicPath - 音乐路径
     */
    setBackgroundMusic(chapter, musicPath) {
        chapter.content.backgroundMusic = musicPath;
    }

    /**
     * 获取当前章节
     * @returns {Object|null} 当前章节数据
     */
    getCurrentChapter() {
        return this.currentChapter;
    }

    /**
     * 设置当前章节
     * @param {Object} chapter - 章节数据
     */
    setCurrentChapter(chapter) {
        this.currentChapter = chapter;
    }
}

// 全局实例
window.galGameChapterManager = new GalGameChapterManager();
