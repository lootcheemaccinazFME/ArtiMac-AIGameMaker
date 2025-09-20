/**
 * GalGame 项目管理器
 * 负责创建和管理GalGame项目结构
 */

class GalGameProjectManager {
    constructor() {
        this.projectTemplate = {
            metadata: {
                name: '',
                version: '1.0.0',
                author: '',
                description: '',
                created: '',
                lastModified: '',
                gameEngine: 'ArtiMeow GalGame Engine',
                resolution: { width: 1920, height: 1080 },
                language: 'zh-CN'
            },
            characters: {},
            settings: {
                worldBackground: '',
                gameRules: '',
                timeline: ''
            },
            chapters: {},
            resources: {
                backgrounds: [],
                characters: [],
                music: [],
                sounds: [],
                videos: []
            },
            gameConfig: {
                autoSave: true,
                textSpeed: 50,
                musicVolume: 80,
                soundVolume: 80,
                fullscreen: false
            }
        };
        
        this.init();
    }

    init() {
        console.log('GalGame项目管理器初始化完成');
    }

    /**
     * 创建新的GalGame项目
     */
    async createProject(projectName, projectPath) {
        try {
            // 创建项目目录结构
            await this.createProjectStructure(projectPath);
            
            // 创建项目元数据
            const metadata = {
                ...this.projectTemplate.metadata,
                name: projectName,
                created: new Date().toISOString(),
                lastModified: new Date().toISOString()
            };

            // 创建完整的项目配置
            const projectConfig = {
                ...this.projectTemplate,
                metadata
            };

            // 保存项目配置文件
            await this.saveProjectConfig(projectPath, projectConfig);

            console.log('GalGame项目创建成功:', projectName);
            return { success: true, project: projectConfig };

        } catch (error) {
            console.error('创建GalGame项目失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 创建项目目录结构
     */
    async createProjectStructure(projectPath) {
        const directories = [
            'assets',
            'assets/backgrounds',
            'assets/characters',
            'assets/music',
            'assets/sounds',
            'assets/videos',
            'assets/ui',
            'chapters',
            'scripts',
            'saves',
            'exports'
        ];

        for (const dir of directories) {
            const fullPath = window.path ? 
                window.path.join(projectPath, dir) : 
                `${projectPath}/${dir}`;
            await this.ensureDirectory(fullPath);
        }

        // 创建示例文件
        await this.createSampleFiles(projectPath);
    }

    /**
     * 创建示例文件
     */
    async createSampleFiles(projectPath) {
        // 创建示例章节
        const sampleChapter = {
            id: 'chapter_001',
            title: '第一章',
            scenes: [
                {
                    id: 'scene_001',
                    name: '开场',
                    background: '',
                    music: '',
                    elements: [
                        {
                            type: 'narration',
                            content: '故事从这里开始...'
                        },
                        {
                            type: 'dialogue',
                            character: '',
                            content: '欢迎来到你的GalGame世界！'
                        }
                    ]
                }
            ]
        };

        const chapterPath = window.path ? 
            window.path.join(projectPath, 'chapters', 'chapter_001', 'chapter_001.json') :
            `${projectPath}/chapters/chapter_001/content.json`;
            
        await this.saveJSON(chapterPath, sampleChapter);

        // 创建README文件
        const readmeContent = `# GalGame Project

这是一个使用 ArtiMeow AI GalGame Maker 创建的项目。

## 项目结构

- \`assets/\` - 游戏资源文件
  - \`backgrounds/\` - 背景图片
  - \`characters/\` - 角色立绘
  - \`music/\` - 背景音乐
  - \`sounds/\` - 音效文件
  - \`videos/\` - 视频文件
  - \`ui/\` - 界面元素
- \`chapters/\` - 章节数据文件
- \`scripts/\` - 脚本文件
- \`saves/\` - 存档文件
- \`exports/\` - 导出文件

## 开发说明

使用 ArtiMeow AI GalGame Maker 编辑器来编辑这个项目。

---

Created with ArtiMeow AI GalGame Maker
`;

        const readmePath = window.path ? 
            window.path.join(projectPath, 'README.md') :
            `${projectPath}/README.md`;
            
        await this.saveText(readmePath, readmeContent);
    }

    /**
     * 保存项目配置
     */
    async saveProjectConfig(projectPath, config) {
        const configPath = window.path ? 
            window.path.join(projectPath, 'project.json') :
            `${projectPath}/project.json`;
            
        await this.saveJSON(configPath, config);
    }

    /**
     * 加载项目配置
     */
    async loadProjectConfig(projectPath) {
        try {
            const configPath = window.path ? 
                window.path.join(projectPath, 'project.json') :
                `${projectPath}/project.json`;
                
            const config = await this.loadJSON(configPath);
            
            // 验证项目配置
            if (!this.validateProjectConfig(config)) {
                throw new Error('项目配置文件格式不正确');
            }

            return config;

        } catch (error) {
            console.error('加载项目配置失败:', error);
            throw error;
        }
    }

    /**
     * 验证项目配置
     */
    validateProjectConfig(config) {
        if (!config || typeof config !== 'object') return false;
        if (!config.metadata || !config.metadata.name) return false;
        if (!config.chapters || typeof config.chapters !== 'object') return false;
        return true;
    }

    /**
     * 保存章节数据
     */
    async saveChapter(projectPath, chapterData) {
        try {
            const chapterPath = window.path ? 
                window.path.join(projectPath, 'chapters', chapterData.id, `${chapterData.id}.json`) :
                `${projectPath}/chapters/${chapterData.id}/content.json`;
            // 确保子目录存在
            const chapterDir = window.path ? window.path.join(projectPath, 'chapters', chapterData.id) : `${projectPath}/chapters/${chapterData.id}`;
            await this.ensureDirectory(chapterDir);
                
            await this.saveJSON(chapterPath, chapterData);
            console.log('章节保存成功:', chapterData.title);

        } catch (error) {
            console.error('保存章节失败:', error);
            throw error;
        }
    }

    /**
     * 加载章节数据
     */
    async loadChapter(projectPath, chapterId) {
        try {
            const chapterPath = window.path ? 
                window.path.join(projectPath, 'chapters', chapterId, `${chapterId}.json`) :
                `${projectPath}/chapters/${chapterId}/content.json`;
                
            return await this.loadJSON(chapterPath);

        } catch (error) {
            console.error('加载章节失败:', error);
            throw error;
        }
    }

    /**
     * 获取所有章节列表
     */
    async getChaptersList(projectPath) {
        try {
            const chaptersDir = window.path ? 
                window.path.join(projectPath, 'chapters') :
                `${projectPath}/chapters`;
                
            const entries = await this.listFiles(chaptersDir);
            const chapters = [];

            for (const entry of entries) {
                // 期望结构：chapters/<id>/content.json
                const chapterId = entry;
                const fileName = `${chapterId}.json`;
                const chapterPath = window.path ? 
                    window.path.join(chaptersDir, chapterId, fileName) :
                    `${chaptersDir}/${chapterId}/${fileName}`;

                try {
                    const chapterData = await this.loadJSON(chapterPath);
                    chapters.push({
                        id: chapterData.id,
                        title: chapterData.title,
                        file: `${chapterId}/${fileName}`
                    });
                } catch (error) {
                    // 非章节目录或缺失文件，忽略
                }
            }

            return chapters.sort((a, b) => a.id.localeCompare(b.id));

        } catch (error) {
            console.error('获取章节列表失败:', error);
            return [];
        }
    }

    /**
     * 添加角色到项目
     */
    async addCharacterToProject(projectPath, characterData) {
        try {
            const config = await this.loadProjectConfig(projectPath);
            config.characters[characterData.id] = characterData;
            config.metadata.lastModified = new Date().toISOString();
            
            await this.saveProjectConfig(projectPath, config);
            console.log('角色添加成功:', characterData.name);

        } catch (error) {
            console.error('添加角色失败:', error);
            throw error;
        }
    }

    /**
     * 更新项目元数据
     */
    async updateProjectMetadata(projectPath, metadata) {
        try {
            const config = await this.loadProjectConfig(projectPath);
            config.metadata = { ...config.metadata, ...metadata };
            config.metadata.lastModified = new Date().toISOString();
            
            await this.saveProjectConfig(projectPath, config);
            console.log('项目元数据更新成功');

        } catch (error) {
            console.error('更新项目元数据失败:', error);
            throw error;
        }
    }

    // 文件系统辅助方法
    async ensureDirectory(dirPath) {
        if (window.electronAPI && window.electronAPI.ensureDirectory) {
            return await window.electronAPI.ensureDir(dirPath);
        } else {
            console.warn('ensureDirectory API不可用，跳过目录创建');
        }
    }

    async saveJSON(filePath, data) {
        const content = JSON.stringify(data, null, 2);
        return await this.saveText(filePath, content);
    }

    async loadJSON(filePath) {
        const content = await this.loadText(filePath);
        return JSON.parse(content);
    }

    async saveText(filePath, content) {
        if (window.electronAPI && window.electronAPI.writeFile) {
            return await window.electronAPI.writeFile(filePath, content);
        } else {
            console.warn('writeFile API不可用，无法保存文件:', filePath);
        }
    }

    async loadText(filePath) {
        if (window.electronAPI && window.electronAPI.readFile) {
            return await window.electronAPI.readFile(filePath);
        } else {
            throw new Error('readFile API不可用');
        }
    }

    async listFiles(dirPath) {
        if (window.electronAPI && window.electronAPI.readDirectory) {
            return await window.electronAPI.readDirectory(dirPath);
        } else {
            return [];
        }
    }
}

// 全局初始化项目管理器
window.galGameProjectManager = new GalGameProjectManager();
