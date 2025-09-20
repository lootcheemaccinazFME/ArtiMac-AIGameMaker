/**
 * GalGame项目管理器
 * 负责管理GalGame项目的创建、加载、保存等操作
 */

class GalGameProjectManager {
    constructor() {
        this.currentProject = null;
        this.projectsDir = null;
        this.chapterManager = window.galGameChapterManager;
        this.init();
    }

    /**
     * 初始化项目管理器
     */
    async init() {
        try {
            // 获取项目目录路径
            const documentsPath = await window.electronAPI.getDocumentsPath();
            this.projectsDir = `${documentsPath}/ArtiMeow-AIGalGame-Maker-Projects`;
            
            // 确保项目目录存在
            await window.electronAPI.createDirectory(this.projectsDir);
            
            // 初始化章节管理器
            this.chapterManager.init(this);
            
            console.log('GalGame项目管理器初始化完成');
        } catch (error) {
            console.error('初始化GalGame项目管理器失败:', error);
        }
    }

    /**
     * 创建新的GalGame项目
     * @param {string} projectName - 项目名称
     * @param {Object} options - 项目选项
     * @returns {Promise<Object>} 项目对象
     */
    async createProject(projectName, options = {}) {
        try {
            const projectId = this.generateProjectId(projectName);
            
            const projectData = {
                id: projectId,
                title: projectName,
                description: options.description || '',
                author: options.author || 'Anonymous'
            };

            // 监听项目创建进度
            this.setupProjectCreationProgressListener();

            // 调用后端创建项目（包含完整的Electron项目结构）
            const result = await window.electronAPI.invoke('galgame-create-project', projectData);
            
            if (!result.success) {
                throw new Error(result.error);
            }

            // 项目创建成功后加载项目信息
            const project = await this.loadProjectFromPath(result.projectPath);
            this.currentProject = project;
            
            console.log('GalGame项目创建成功:', projectName);
            return project;
            
        } catch (error) {
            console.error('创建GalGame项目失败:', error);
            throw error;
        }
    }

    /**
     * 设置项目创建进度监听器
     */
    setupProjectCreationProgressListener() {
        // 移除之前的监听器
        if (window.electronAPI.removeAllListeners) {
            window.electronAPI.removeAllListeners('project-creation-progress');
        }

        // 添加新的监听器
        if (window.electronAPI.on) {
            window.electronAPI.on('project-creation-progress', (event, data) => {
                console.log('项目创建进度:', data);
                
                // 可以在这里添加UI进度显示
                const progressEvent = new CustomEvent('project-creation-progress', {
                    detail: data
                });
                document.dispatchEvent(progressEvent);
            });
        }
    }

    /**
     * 创建项目目录结构
     * @param {string} projectPath - 项目路径
     */
    async createProjectStructure(projectPath) {
        const directories = [
            projectPath,
            `${projectPath}/chapters`,      // 章节数据
            `${projectPath}/assets`,        // 资源库
            `${projectPath}/assets/images`, // 图片资源
            `${projectPath}/assets/audio`,  // 音频资源
            `${projectPath}/assets/music`,  // 音乐资源
            `${projectPath}/backup`,        // 备份目录
            `${projectPath}/export`         // 导出目录
        ];

        for (const dir of directories) {
            await window.electronAPI.createDirectory(dir);
        }
    }

    /**
     * 从路径加载项目
     * @param {string} projectPath - 项目根路径
     * @returns {Promise<Object>} 项目对象
     */
    async loadProjectFromPath(projectPath) {
        try {
            const result = await window.electronAPI.invoke('galgame-load-project', projectPath);
            
            if (!result.success) {
                throw new Error(result.error);
            }

            const project = {
                id: result.project.info.id,
                name: result.project.info.title,
                path: projectPath,
                dataPath: result.dataPath,
                metadata: result.project.info,
                projectData: result.project
            };

            return project;
        } catch (error) {
            console.error('加载项目失败:', error);
            throw error;
        }
    }

    /**
     * 加载GalGame项目
     * @param {string} projectPath - 项目路径或项目ID
     * @returns {Promise<Object>} 项目对象
     */
    async loadProject(projectPath) {
        try {
            // 如果传入的是项目ID，转换为完整路径
            if (!projectPath.includes('/') && !projectPath.includes('\\')) {
                projectPath = `${this.projectsDir}/${projectPath}`;
            }

            return await this.loadProjectFromPath(projectPath);
        } catch (error) {
            console.error('加载项目失败:', error);
            throw error;
        }
    }

    /**
     * 旧版本加载方法（兼容性）
     * @param {string} projectPath - 项目路径或项目ID
     * @returns {Promise<Object>} 项目对象
     */
    async loadProjectLegacy(projectPath) {
        try {
            // 如果传入的是项目ID，转换为完整路径
            if (!projectPath.includes('/') && !projectPath.includes('\\')) {
                projectPath = `${this.projectsDir}/${projectPath}`;
            }

            // 检查项目路径是否存在
            const exists = await window.electronAPI.pathExists(projectPath);
            if (!exists) {
                throw new Error('项目不存在');
            }

            // 加载元数据
            const metadataPath = `${projectPath}/metadata.json`;
            const metadataData = await window.electronAPI.readFile(metadataPath);
            const metadata = JSON.parse(metadataData);

            // 加载知识库
            const knowledgeBasePath = `${projectPath}/knowledge-base.json`;
            let knowledgeBase = {};
            try {
                const knowledgeBaseData = await window.electronAPI.readFile(knowledgeBasePath);
                knowledgeBase = JSON.parse(knowledgeBaseData);
            } catch (error) {
                console.warn('知识库文件不存在或损坏，将创建新的知识库');
                knowledgeBase = {
                    characters: [],
                    locations: [],
                    items: [],
                    worldView: '',
                    plotSummary: '',
                    chapterSummaries: {}
                };
            }

            const project = {
                id: metadata.id,
                name: metadata.name,
                path: projectPath,
                metadata: metadata,
                knowledgeBase: knowledgeBase
            };

            this.currentProject = project;
            
            console.log('GalGame项目加载成功:', metadata.name);
            return project;
            
        } catch (error) {
            console.error('加载GalGame项目失败:', error);
            throw error;
        }
    }

    /**
     * 保存项目
     * @param {Object} project - 项目对象
     * @returns {Promise<void>}
     */
    async saveProject(project = null) {
        try {
            const targetProject = project || this.currentProject;
            if (!targetProject) {
                throw new Error('没有要保存的项目');
            }

            // 更新时间戳
            targetProject.metadata.updatedAt = new Date().toISOString();

            // 保存元数据
            await window.electronAPI.writeFile(
                `${targetProject.path}/metadata.json`, 
                JSON.stringify(targetProject.metadata, null, 2)
            );

            // 保存知识库
            await window.electronAPI.writeFile(
                `${targetProject.path}/knowledge-base.json`, 
                JSON.stringify(targetProject.knowledgeBase, null, 2)
            );

            console.log('项目已保存:', targetProject.name);
        } catch (error) {
            console.error('保存项目失败:', error);
            throw error;
        }
    }

    /**
     * 获取项目列表
     * @returns {Promise<Array>} 项目列表
     */
    async getProjectList() {
        try {
            const projects = [];
            const items = await window.electronAPI.listDirectory(this.projectsDir);
            
            for (const item of items) {
                const itemPath = `${this.projectsDir}/${item}`;
                const isDirectory = await window.electronAPI.isDirectory(itemPath);
                
                if (isDirectory) {
                    try {
                        const metadataPath = `${itemPath}/metadata.json`;
                        const exists = await window.electronAPI.pathExists(metadataPath);
                        
                        if (exists) {
                            const metadataData = await window.electronAPI.readFile(metadataPath);
                            const metadata = JSON.parse(metadataData);
                            
                            projects.push({
                                id: metadata.id,
                                name: metadata.name,
                                path: itemPath,
                                description: metadata.description || '',
                                updatedAt: metadata.updatedAt,
                                coverImage: metadata.coverImage
                            });
                        }
                    } catch (error) {
                        console.warn(`跳过无效项目: ${item}`, error);
                    }
                }
            }
            
            return projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        } catch (error) {
            console.error('获取项目列表失败:', error);
            return [];
        }
    }

    /**
     * 删除项目
     * @param {string} projectId - 项目ID
     * @returns {Promise<void>}
     */
    async deleteProject(projectId) {
        try {
            const projectPath = `${this.projectsDir}/${projectId}`;
            await window.electronAPI.deleteDirectory(projectPath);
            
            if (this.currentProject && this.currentProject.id === projectId) {
                this.currentProject = null;
            }
            
            console.log('项目已删除:', projectId);
        } catch (error) {
            console.error('删除项目失败:', error);
            throw error;
        }
    }

    /**
     * 导出项目为.artimeow-gg-maker文件
     * @param {string} projectId - 项目ID
     * @param {string} exportPath - 导出路径
     * @returns {Promise<string>} 导出文件路径
     */
    async exportProject(projectId, exportPath) {
        try {
            const project = await this.loadProject(projectId);
            const outputFile = `${exportPath}/${project.name}.artimeow-gg-maker`;
            
            // 使用系统的压缩功能创建ZIP文件
            await window.electronAPI.createZip(project.path, outputFile);
            
            console.log('项目导出成功:', outputFile);
            return outputFile;
        } catch (error) {
            console.error('导出项目失败:', error);
            throw error;
        }
    }

    /**
     * 导入.artimeow-gg-maker项目文件
     * @param {string} filePath - 项目文件路径
     * @returns {Promise<Object>} 导入的项目对象
     */
    async importProject(filePath) {
        try {
            const tempDir = `${this.projectsDir}/temp_import_${Date.now()}`;
            
            // 解压项目文件
            await window.electronAPI.extractZip(filePath, tempDir);
            
            // 读取元数据
            const metadataPath = `${tempDir}/metadata.json`;
            const metadataData = await window.electronAPI.readFile(metadataPath);
            const metadata = JSON.parse(metadataData);
            
            // 生成新的项目ID（避免冲突）
            const newProjectId = this.generateProjectId(metadata.name);
            const newProjectPath = `${this.projectsDir}/${newProjectId}`;
            
            // 移动临时目录到正式位置
            await window.electronAPI.moveDirectory(tempDir, newProjectPath);
            
            // 更新元数据中的ID
            metadata.id = newProjectId;
            metadata.updatedAt = new Date().toISOString();
            await window.electronAPI.writeFile(
                `${newProjectPath}/metadata.json`, 
                JSON.stringify(metadata, null, 2)
            );
            
            console.log('项目导入成功:', metadata.name);
            
            return {
                id: newProjectId,
                name: metadata.name,
                path: newProjectPath
            };
        } catch (error) {
            console.error('导入项目失败:', error);
            throw error;
        }
    }

    /**
     * 复制资源到项目资源库
     * @param {string} sourcePath - 源文件路径
     * @param {string} category - 资源类别 (images/audio/music)
     * @param {string} filename - 目标文件名
     * @returns {Promise<string>} 目标文件路径
     */
    async copyAssetToProject(sourcePath, category, filename = null) {
        try {
            if (!this.currentProject) {
                throw new Error('没有当前项目');
            }

            if (!filename) {
                const path = require('path');
                filename = path.basename(sourcePath);
            }

            const targetDir = `${this.currentProject.path}/assets/${category}`;
            await window.electronAPI.createDirectory(targetDir);
            
            const targetPath = `${targetDir}/${filename}`;
            await window.electronAPI.copyFile(sourcePath, targetPath);
            
            return targetPath;
        } catch (error) {
            console.error('复制资源失败:', error);
            throw error;
        }
    }

    /**
     * 获取项目资源列表
     * @param {string} category - 资源类别
     * @returns {Promise<Array>} 资源文件列表
     */
    async getProjectAssets(category) {
        try {
            if (!this.currentProject) {
                return [];
            }

            const assetsDir = `${this.currentProject.path}/assets/${category}`;
            const exists = await window.electronAPI.pathExists(assetsDir);
            
            if (!exists) {
                return [];
            }

            const files = await window.electronAPI.listDirectory(assetsDir);
            return files.filter(file => !file.startsWith('.'));
        } catch (error) {
            console.error('获取项目资源失败:', error);
            return [];
        }
    }

    /**
     * 生成项目ID
     * @param {string} projectName - 项目名称
     * @returns {string} 项目ID
     */
    generateProjectId(projectName) {
        const timestamp = Date.now();
        const sanitized = projectName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
        return `${sanitized}_${timestamp}`;
    }

    /**
     * 获取当前项目
     * @returns {Object|null} 当前项目
     */
    getCurrentProject() {
        return this.currentProject;
    }

    /**
     * 设置当前项目
     * @param {Object} project - 项目对象
     */
    setCurrentProject(project) {
        this.currentProject = project;
    }

    /**
     * 更新知识库
     * @param {Object} knowledgeBase - 知识库数据
     * @returns {Promise<void>}
     */
    async updateKnowledgeBase(knowledgeBase) {
        if (!this.currentProject) {
            throw new Error('没有当前项目');
        }

        this.currentProject.knowledgeBase = knowledgeBase;
        await this.saveProject();
    }

    /**
     * 添加角色到知识库
     * @param {Object} character - 角色数据
     */
    addCharacter(character) {
        if (!this.currentProject) {
            throw new Error('没有当前项目');
        }

        character.id = this.generateId();
        this.currentProject.knowledgeBase.characters.push(character);
    }

    /**
     * 添加地点到知识库
     * @param {Object} location - 地点数据
     */
    addLocation(location) {
        if (!this.currentProject) {
            throw new Error('没有当前项目');
        }

        location.id = this.generateId();
        this.currentProject.knowledgeBase.locations.push(location);
    }

    /**
     * 生成唯一ID
     * @returns {string} 唯一ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // ========================================
    // 预览和调试功能
    // ========================================

    /**
     * 预览项目（调试模式）
     * @param {string} projectPath - 项目路径
     */
    async previewProject(projectPath) {
        try {
            const result = await window.electronAPI.editorPreviewProject(projectPath);
            if (result.success) {
                console.log('项目预览启动成功');
                this.showPreviewControls();
            } else {
                alert('启动预览失败: ' + result.error);
            }
        } catch (error) {
            console.error('预览项目失败:', error);
            alert('预览项目失败: ' + error.message);
        }
    }

    /**
     * 启动独立播放器
     * @param {string} projectPath - 项目路径
     */
    async launchPlayer(projectPath) {
        try {
            const result = await window.electronAPI.editorLaunchPlayer(projectPath);
            if (result.success) {
                console.log('播放器启动成功');
            } else {
                alert('启动播放器失败: ' + result.error);
            }
        } catch (error) {
            console.error('启动播放器失败:', error);
            alert('启动播放器失败: ' + error.message);
        }
    }

    /**
     * 显示预览控制面板
     */
    showPreviewControls() {
        // 创建预览控制面板
        let controlPanel = document.getElementById('preview-controls');
        
        if (!controlPanel) {
            controlPanel = document.createElement('div');
            controlPanel.id = 'preview-controls';
            controlPanel.className = 'preview-controls-panel';
            controlPanel.innerHTML = `
                <div class="control-panel-header">
                    <h4><i class="fas fa-gamepad"></i> 预览控制</h4>
                    <button id="close-preview-btn" class="btn btn-sm btn-secondary">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="control-panel-body">
                    <div class="control-group">
                        <label>快速跳转:</label>
                        <select id="preview-chapter-select" class="form-control">
                            <option value="">选择章节...</option>
                        </select>
                        <button id="jump-to-chapter-btn" class="btn btn-sm btn-primary">跳转</button>
                    </div>
                    <div class="control-group">
                        <label>变量调试:</label>
                        <div class="variable-debug">
                            <input type="text" id="debug-var-name" placeholder="变量名" class="form-control">
                            <input type="text" id="debug-var-value" placeholder="变量值" class="form-control">
                            <button id="set-variable-btn" class="btn btn-sm btn-info">设置</button>
                        </div>
                    </div>
                    <div class="control-group">
                        <button id="reload-project-btn" class="btn btn-sm btn-warning">
                            <i class="fas fa-refresh"></i> 重新加载
                        </button>
                        <button id="get-game-state-btn" class="btn btn-sm btn-info">
                            <i class="fas fa-info"></i> 获取状态
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(controlPanel);
            
            // 设置事件监听器
            this.setupPreviewControlEvents(controlPanel);
        }
        
        // 加载章节选项
        this.loadPreviewChapterOptions();
        
        controlPanel.style.display = 'block';
    }

    /**
     * 设置预览控制事件
     */
    setupPreviewControlEvents(panel) {
        // 关闭面板
        panel.querySelector('#close-preview-btn').addEventListener('click', () => {
            panel.style.display = 'none';
        });

        // 跳转章节
        panel.querySelector('#jump-to-chapter-btn').addEventListener('click', () => {
            const chapterId = panel.querySelector('#preview-chapter-select').value;
            if (chapterId) {
                this.sendDebugCommand('load-chapter', { chapterId });
            }
        });

        // 设置变量
        panel.querySelector('#set-variable-btn').addEventListener('click', () => {
            const name = panel.querySelector('#debug-var-name').value.trim();
            const value = panel.querySelector('#debug-var-value').value.trim();
            if (name) {
                this.sendDebugCommand('set-variable', { name, value });
            }
        });

        // 重新加载项目
        panel.querySelector('#reload-project-btn').addEventListener('click', () => {
            this.sendDebugCommand('reload-project');
        });

        // 获取游戏状态
        panel.querySelector('#get-game-state-btn').addEventListener('click', () => {
            this.sendDebugCommand('get-game-state');
        });
    }

    /**
     * 加载预览章节选项
     */
    async loadPreviewChapterOptions() {
        const select = document.querySelector('#preview-chapter-select');
        if (!select || !this.currentProject) return;

        try {
            const chaptersDir = `${this.currentProject.path}/chapters`;
            const files = await window.electronAPI.readdir(chaptersDir);
            
            select.innerHTML = '<option value="">选择章节...</option>';
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const chapterId = file.replace('.json', '');
                    const option = document.createElement('option');
                    option.value = chapterId;
                    option.textContent = chapterId;
                    select.appendChild(option);
                }
            }
        } catch (error) {
            console.error('加载章节选项失败:', error);
        }
    }

    /**
     * 发送调试命令到播放器
     */
    async sendDebugCommand(command, data = {}) {
        try {
            await window.electronAPI.editorToPlayer(command, data);
        } catch (error) {
            console.error('发送调试命令失败:', error);
        }
    }

    /**
     * 监听来自播放器的响应
     */
    setupPlayerResponseListener() {
        if (window.electronAPI && window.electronAPI.onPlayerCommand) {
            window.electronAPI.onPlayerCommand((command, data) => {
                console.log('Received player response:', command, data);
                
                switch (command) {
                    case 'game-state':
                        this.displayGameState(data);
                        break;
                    case 'project-loaded':
                        if (data.success) {
                            console.log('项目已在播放器中加载');
                        } else {
                            console.error('播放器加载项目失败:', data.error);
                        }
                        break;
                }
            });
        }
    }

    /**
     * 预览项目（调试模式）
     * @param {string} projectPath - 项目路径
     */
    async previewProject(projectPath = null) {
        try {
            const targetPath = projectPath || this.currentProject?.path;
            
            if (!targetPath) {
                throw new Error('没有选择要预览的项目');
            }

            console.log('开始预览项目:', targetPath);
            
            const result = await window.electronAPI.invoke('editor-preview-project', targetPath);
            
            if (result.success) {
                console.log('项目预览已启动');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('预览项目失败:', error);
            throw error;
        }
    }

    /**
     * 打包项目 - 调用新的打包器
     * @param {string} projectPath - 项目路径
     * @param {Object} packageOptions - 打包选项
     */
    async packageProject(projectPath = null, packageOptions = {}) {
        console.log('打包功能已迁移到新的项目打包器');
        
        // 调用新的打包器
        if (window.projectPackager) {
            if (packageOptions.quick) {
                return await window.projectPackager.quickPackage();
            } else {
                return await window.projectPackager.showPackageDialog();
            }
        } else {
            throw new Error('项目打包器未初始化');
        }
    }

    /**
     * 设置打包进度监听器 - 已废弃
     */
    setupPackageProgressListener() {
        // 新的打包器不再需要此方法
        console.log('打包进度监听已迁移到新的打包器');
    }

    /**
     * 获取项目列表
     */
    async getProjectList() {
        try {
            const result = await window.electronAPI.invoke('galgame-get-project-list');
            
            if (result.success) {
                return result.projects;
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('获取项目列表失败:', error);
            return [];
        }
    }

    /**
     * 显示游戏状态
     */
    displayGameState(gameState) {
        const modal = document.createElement('div');
        modal.className = 'modal game-state-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>游戏状态调试</h3>
                    <button class="btn-close">&times;</button>
                </div>
                <div class="modal-body">
                    <pre>${JSON.stringify(gameState, null, 2)}</pre>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('.btn-close').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }
}

// 全局实例
window.galGameProjectManager = new GalGameProjectManager();

// 设置播放器响应监听
window.galGameProjectManager.setupPlayerResponseListener();
