/**
 * GalGame项目打包器
 * 负责将GalGame项目打包成可执行的游戏文件
 */

class GalGameProjectPackager {
    constructor() {
        this.projectManager = window.galGameProjectManager;
        this.isPackaging = false;
        this.packageLogCallback = null;
        this.init();
    }

    /**
     * 初始化打包器
     */
    init() {
        this.setupPackageUI();
    }

    /**
     * 设置打包UI
     */
    setupPackageUI() {
        const packageHTML = `
            <div id="package-modal" class="modal">
                <div class="modal-content package-modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-box"></i> 打包游戏项目</h3>
                        <button class="btn-close" id="package-close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="package-form">
                            <div class="form-group">
                                <label>项目名称:</label>
                                <input type="text" id="package-project-name" class="form-control" readonly>
                            </div>
                            
                            <div class="form-group">
                                <label>输出目录:</label>
                                <div class="input-group">
                                    <input type="text" id="package-output-dir" class="form-control" readonly>
                                    <button id="choose-output-dir-btn" class="btn btn-secondary">选择目录</button>
                                </div>
                            </div>
                            
                            <div class="form-row">
                                <div class="form-group col-md-6">
                                    <label>目标平台:</label>
                                    <select id="package-platform" class="form-control">
                                        <option value="win32">Windows</option>
                                        <option value="darwin">macOS</option>
                                        <option value="linux">Linux</option>
                                    </select>
                                </div>
                                <div class="form-group col-md-6">
                                    <label>目标架构:</label>
                                    <select id="package-arch" class="form-control">
                                        <option value="x64">x64 (64位)</option>
                                        <option value="ia32">ia32 (32位)</option>
                                        <option value="arm64">ARM64</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" id="package-compress" checked>
                                    压缩输出文件
                                </label>
                            </div>
                            
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" id="package-installer" checked>
                                    创建安装程序
                                </label>
                            </div>
                            
                            <div class="package-actions">
                                <button id="start-package-btn" class="btn btn-primary">
                                    <i class="fas fa-play"></i> 开始打包
                                </button>
                                <button id="cancel-package-btn" class="btn btn-secondary">
                                    <i class="fas fa-times"></i> 取消
                                </button>
                            </div>
                        </div>
                        
                        <div id="package-progress" class="package-progress" style="display: none;">
                            <div class="progress-info">
                                <div class="progress-text">正在打包...</div>
                                <div class="progress-bar">
                                    <div id="progress-fill" class="progress-fill"></div>
                                </div>
                            </div>
                            
                            <div class="package-log">
                                <div class="log-header">
                                    <h4>打包日志</h4>
                                    <button id="clear-log-btn" class="btn btn-sm btn-secondary">清空日志</button>
                                </div>
                                <div id="package-log-content" class="log-content"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', packageHTML);
        // 确保日志面板文本在浅色/深色模式下都可读（固定为白色文字）
        const styleEl = document.createElement('style');
        styleEl.id = 'package-modal-log-style';
        styleEl.innerHTML = `
            #package-modal .log-content, #package-modal .log-entry { color: #ffffff !important; }
            #package-modal .log-content { background: rgba(0,0,0,0.35) !important; }
        `;
        document.head.appendChild(styleEl);
        this.setupPackageEvents();
    }

    /**
     * 设置打包事件
     */
    setupPackageEvents() {
        // 选择输出目录
        const chooseOutputBtn = document.getElementById('choose-output-dir-btn');
        if (chooseOutputBtn) {
            chooseOutputBtn.addEventListener('click', async () => {
                const directory = await window.electronAPI.chooseDirectory();
                if (directory) {
                    document.getElementById('package-output-dir').value = directory;
                }
            });
        }

        // 开始打包
        const startPackageBtn = document.getElementById('start-package-btn');
        if (startPackageBtn) {
            startPackageBtn.addEventListener('click', () => {
                this.startPackaging();
            });
        }

        // 取消打包
        const cancelPackageBtn = document.getElementById('cancel-package-btn');
        if (cancelPackageBtn) {
            cancelPackageBtn.addEventListener('click', () => {
                this.cancelPackaging();
            });
        }

        // 清空日志
        const clearLogBtn = document.getElementById('clear-log-btn');
        if (clearLogBtn) {
            clearLogBtn.addEventListener('click', () => {
                document.getElementById('package-log-content').innerHTML = '';
            });
        }

        // 关闭模态框
        const modal = document.getElementById('package-modal');
        const closeBtn = document.getElementById('package-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hidePackageModal());
        }
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hidePackageModal();
                }
            });
        }
    }

    /**
     * 显示打包模态框
     * @param {Object} project - 项目对象
     */
    showPackageModal(project) {
        if (!project) {
            alert('没有要打包的项目');
            return;
        }

        // 填充项目信息
        document.getElementById('package-project-name').value = project.name;
        
        // 设置默认输出目录
        const defaultOutputDir = `${project.path}/export`;
        document.getElementById('package-output-dir').value = defaultOutputDir;

        // 显示模态框
        const modal = document.getElementById('package-modal');
        if (modal) {
            // 使用统一 .show 控制
            modal.classList.add('show');
        }
    }

    /**
     * 隐藏打包模态框
     */
    hidePackageModal() {
        if (!this.isPackaging) {
            const modal = document.getElementById('package-modal');
            if (modal) modal.classList.remove('show');
            // 重置表单
            document.getElementById('package-progress').style.display = 'none';
            document.querySelector('.package-form').style.display = 'block';
        }
    }

    /**
     * 开始打包
     */
    async startPackaging() {
        try {
            const project = this.projectManager.getCurrentProject();
            if (!project) {
                alert('没有当前项目');
                return;
            }

            // 获取打包配置
            const config = this.getPackageConfig();
            if (!config) {
                return;
            }

            this.isPackaging = true;
            this.showPackageProgress();

            this.log('开始打包项目: ' + project.name);
            this.log('目标平台: ' + config.platform);
            this.log('目标架构: ' + config.arch);

            // 准备项目文件
            this.log('正在准备项目文件...');
            this.updateProgress(10);
            
            const gameProjectPath = await this.prepareGameProject(project, config);
            
            this.log('项目文件准备完成');
            this.updateProgress(30);

            // Windows: 仅弹一次权限选择，并在安装/构建复用
            this.elevateAll = false;
            if (window.platform === 'win32') {
                const res = await window.apiAdapter.showMessageBox({
                    type: 'question', buttons: ['以管理员运行', '直接尝试', '取消'], defaultId: 0, cancelId: 2,
                    title: '需要管理员权限？', message: '是否以管理员权限运行安装与打包？', detail: '该选择会应用于依赖安装与构建步骤。'
                });
                if (res?.response === 2) throw new Error('用户取消')
                this.elevateAll = res?.response === 0
            }

            // 安装依赖
            this.log('正在安装游戏框架依赖...');
            await this.installGameDependencies(gameProjectPath);
            
            this.log('依赖安装完成');
            this.updateProgress(50);

            // 执行打包
            this.log('正在执行 Electron Builder 打包...');
            const result = await this.executePackaging(gameProjectPath, config);
            
            if (result.success) {
                this.log('打包完成！');
                this.log('输出文件: ' + result.outputPath);
                this.updateProgress(100);
                
                setTimeout(() => {
                    this.showPackageComplete(result.outputPath);
                }, 1000);
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            console.error('打包失败:', error);
            this.log('错误: ' + error.message);
            alert('打包失败: ' + error.message);
        } finally {
            this.isPackaging = false;
        }
    }

    /**
     * 获取打包配置
     * @returns {Object|null} 打包配置
     */
    getPackageConfig() {
        const projectName = document.getElementById('package-project-name').value;
        const outputDir = document.getElementById('package-output-dir').value;
        const platform = document.getElementById('package-platform').value;
        const arch = document.getElementById('package-arch').value;
        const compress = document.getElementById('package-compress').checked;
        const installer = document.getElementById('package-installer').checked;

        if (!projectName || !outputDir) {
            alert('请填写完整的打包配置');
            return null;
        }

        return {
            projectName,
            outputDir,
            platform,
            arch,
            compress,
            installer
        };
    }

    /**
     * 准备游戏项目文件
     * @param {Object} project - 项目对象
     * @param {Object} config - 打包配置
     * @returns {Promise<string>} 游戏项目路径
     */
    async prepareGameProject(project, config) {
        // 创建临时游戏项目目录
        const gameProjectPath = `${config.outputDir}/temp_game_${Date.now()}`;
        await window.electronAPI.createDirectory(gameProjectPath);

        // 复制游戏框架文件
        const playerFrameworkPath = await this.getPlayerFrameworkPath();
        await this.copyGameFramework(playerFrameworkPath, gameProjectPath);

        // 复制项目数据
        await this.copyProjectData(project.path, gameProjectPath);

        // 生成游戏配置文件
        await this.generateGameConfig(project, gameProjectPath, config);

        return gameProjectPath;
    }

    /**
     * 获取游戏框架路径
     * @returns {Promise<string>} 游戏框架路径
     */
    async getPlayerFrameworkPath() {
        // 获取编辑器所在路径
        const editorPath = await window.electronAPI.getAppPath();
        return editorPath.replace(/lib[\\\/]editor$/, 'lib/player');
    }

    /**
     * 复制游戏框架
     * @param {string} frameworkPath - 框架源路径
     * @param {string} targetPath - 目标路径
     */
    async copyGameFramework(frameworkPath, targetPath) {
        // 复制游戏框架的核心文件
        const filesToCopy = [
            'src/main.js',
            'src/preload.js',
            'src/renderer/index.html',
            'src/renderer/js',
            'src/renderer/styles',
            'src/renderer/vendor',
            'assets',
            'package.json'
        ];

        for (const file of filesToCopy) {
            const sourcePath = `${frameworkPath}/${file}`;
            const targetFilePath = `${targetPath}/${file}`;
            
            const isDirectory = await window.electronAPI.isDirectory(sourcePath);
            if (isDirectory) {
                await window.electronAPI.copyDirectory(sourcePath, targetFilePath);
            } else {
                await window.electronAPI.copyFile(sourcePath, targetFilePath);
            }
        }
    }

    /**
     * 复制项目数据
     * @param {string} projectPath - 项目路径
     * @param {string} gameProjectPath - 游戏项目路径
     */
    async copyProjectData(projectPath, gameProjectPath) {
        // 创建游戏数据目录
        const gameDataPath = `${gameProjectPath}/game-data`;
        await window.electronAPI.createDirectory(gameDataPath);

        // 复制项目文件
        const filesToCopy = [
            'metadata.json',
            'knowledge-base.json',
            'chapters',
            'assets'
        ];

        for (const file of filesToCopy) {
            const sourcePath = `${projectPath}/${file}`;
            const targetFilePath = `${gameDataPath}/${file}`;
            
            const exists = await window.electronAPI.pathExists(sourcePath);
            if (exists) {
                const isDirectory = await window.electronAPI.isDirectory(sourcePath);
                if (isDirectory) {
                    await window.electronAPI.copyDirectory(sourcePath, targetFilePath);
                } else {
                    await window.electronAPI.copyFile(sourcePath, targetFilePath);
                }
            }
        }

        // 复制 distinfo：用于自定义关于页与许可证
        try {
            const distinfoSource = `${projectPath}/distinfo`;
            const exists = await window.electronAPI.pathExists(distinfoSource);
            if (exists) {
                const distinfoTarget = `${gameDataPath}/distinfo`;
                await window.electronAPI.createDirectory(distinfoTarget);
                await window.electronAPI.copyDirectory(distinfoSource, distinfoTarget);
            }
        } catch (e) {
            this.log('警告: 复制 distinfo 失败: ' + (e?.message || e));
        }
    }

    /**
     * 生成游戏配置文件
     * @param {Object} project - 项目对象
     * @param {string} gameProjectPath - 游戏项目路径
     * @param {Object} config - 打包配置
     */
    async generateGameConfig(project, gameProjectPath, config) {
        // 更新package.json
        const packageJsonPath = `${gameProjectPath}/package.json`;
        const packageJson = JSON.parse(await window.electronAPI.readFile(packageJsonPath));
        
        packageJson.name = project.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        packageJson.productName = project.name;
        packageJson.description = project.metadata.description || project.name;
        packageJson.version = project.metadata.version || '1.0.0';
        packageJson.author = project.metadata.author || 'Anonymous';

        // 更新构建配置
        packageJson.build = {
            appId: `com.artimeow.${packageJson.name}`,
            productName: project.name,
            directories: {
                output: '../dist'
            },
            files: [
                'src/**/*',
                'game-data/**/*',
                'assets/**/*',
                'node_modules/**/*'
            ],
            win: {
                target: config.platform === 'win32' ? [
                    {
                        target: config.installer ? 'nsis' : 'portable',
                        arch: [config.arch]
                    }
                ] : undefined,
                icon: 'assets/icon.ico'
            },
            mac: {
                target: config.platform === 'darwin' ? [
                    {
                        target: config.installer ? 'dmg' : 'dir',
                        arch: [config.arch]
                    }
                ] : undefined,
                icon: 'assets/AppIcon.icns'
            },
            linux: {
                target: config.platform === 'linux' ? [
                    {
                        target: config.installer ? 'AppImage' : 'dir',
                        arch: [config.arch]
                    }
                ] : undefined,
                icon: 'assets/icon.png'
            },
            compression: config.compress ? 'normal' : 'store'
        };

        await window.electronAPI.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

        // 生成游戏启动配置
        const gameConfigPath = `${gameProjectPath}/game-data/config.json`;
        const gameConfig = {
            projectId: project.id,
            projectName: project.name,
            version: project.metadata.version || '1.0.0',
            startChapter: 'start',
            settings: project.metadata.settings || {}
        };

        await window.electronAPI.writeFile(gameConfigPath, JSON.stringify(gameConfig, null, 2));
    }

    /**
     * 安装游戏依赖
     * @param {string} gameProjectPath - 游戏项目路径
     */
    async installGameDependencies(gameProjectPath) {
        this.log('正在安装 npm 依赖...');
        // 使用后台 packagerRun 来运行 npm install，确保能监听到退出码
        let spawnResult;
        const elevate = !!this.elevateAll;
        if (elevate && window.electronAPI.packagerRunEx) {
            spawnResult = await window.electronAPI.packagerRunEx(gameProjectPath, 'npm', ['install'], { elevate: true })
        } else {
            spawnResult = await window.electronAPI.packagerRun(gameProjectPath, 'npm', ['install']);
        }
        if (!spawnResult || spawnResult.success === false) {
            throw new Error('无法启动依赖安装进程: ' + (spawnResult?.error || '未知错误'));
        }

        const jobId = spawnResult.jobId;
        this.log('[Packager] 依赖安装已触发，jobId=' + jobId);

        let exitCode = null;
        const onLogHandler = (payload) => {
            try {
                if (!payload || payload.jobId !== jobId) return;
                const t = payload.type;
                const d = payload.data;
                if (t === 'stdout' || t === 'stderr') {
                    this.log(d);
                } else if (t === 'error') {
                    this.log('依赖安装进程错误: ' + d);
                } else if (t === 'exit') {
                    exitCode = parseInt(String(d), 10);
                }
            } catch (e) {
                console.error('onLogHandler error', e);
            }
        };

        const unsubscribe = window.electronAPI.onPackagerLog(onLogHandler);

        // 拉取并处理可能在我们注册前产生的缓冲日志
        try {
            const drained = await window.electronAPI.drainPackagerBuffer(jobId);
            if (drained && drained.success && Array.isArray(drained.buffer)) {
                for (const item of drained.buffer) {
                    try { onLogHandler({ jobId, type: item.type, data: item.data }); } catch (e) {}
                }
            }
        } catch (e) {
            // 忽略缓冲读取错误
        }

        // 等待 exit 事件
        await new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (exitCode !== null) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 200);
        });

        try { if (typeof unsubscribe === 'function') unsubscribe(); } catch (e) { /* ignore */ }

        if (typeof exitCode !== 'undefined' && exitCode !== 0) {
            throw new Error('依赖安装进程退出码 ' + exitCode);
        }
    }

    /**
     * 执行打包
     * @param {string} gameProjectPath - 游戏项目路径
     * @param {Object} config - 打包配置
     * @returns {Promise<Object>} 打包结果
     */
    async executePackaging(gameProjectPath, config) {
        this.log('正在执行 electron-builder...');
        
        // 构建electron-builder命令
            this.log('正在执行 npm run dist...');

            // 使用后台 packagerRun，监听 packager-log 事件以获取实际退出码和实时日志
            let spawnResult;
            const elevate = !!this.elevateAll;
            if (elevate && window.electronAPI.packagerRunEx) {
                spawnResult = await window.electronAPI.packagerRunEx(gameProjectPath, 'npm', ['run', 'dist'], { elevate: true })
            } else {
                spawnResult = await window.electronAPI.packagerRun(gameProjectPath, 'npm', ['run', 'dist']);
            }
            if (!spawnResult || spawnResult.success === false) {
                this.log('无法启动打包进程: ' + (spawnResult?.error || '未知错误'));
                return { success: false, error: spawnResult?.error || '无法启动打包进程' };
            }

            const jobId = spawnResult.jobId;
            this.log(`打包已触发，jobId=${jobId}，开始监听打包日志和退出事件`);

            let exitCode = null;
            const onLogHandler = (payload) => {
                try {
                    if (!payload || payload.jobId !== jobId) return;
                    const t = payload.type;
                    const d = payload.data;
                    if (t === 'stdout' || t === 'stderr') {
                        this.log(d);
                        // 简单的关键字进度映射
                        if (d.includes('packaging')) this.updateProgress(30);
                        else if (d.includes('building')) this.updateProgress(65);
                        else if (d.includes('finalizing')) this.updateProgress(95);
                    } else if (t === 'error') {
                        this.log('打包进程错误: ' + d);
                    } else if (t === 'exit') {
                        exitCode = parseInt(String(d), 10);
                    }
                } catch (e) {
                    console.error('onLogHandler error', e);
                }
            };

            // 注册监听器（preload 已将事件转为 callback(payload) 的形式），会返回一个取消监听的函数
            const unsubscribe = window.electronAPI.onPackagerLog(onLogHandler);

            // 拉取并处理可能在我们注册前产生的缓冲日志（确保不会错过早期 exit）
            try {
                const drained = await window.electronAPI.drainPackagerBuffer(jobId);
                if (drained && drained.success && Array.isArray(drained.buffer)) {
                    for (const item of drained.buffer) {
                        try { onLogHandler({ jobId, type: item.type, data: item.data }); } catch (e) {}
                    }
                }
            } catch (e) {
                // 忽略缓冲读取错误
            }

            // 等待 exit 事件
            await new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (exitCode !== null) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 200);
            });

            // 收到 exit 后取消监听，避免内存泄漏
            try { if (typeof unsubscribe === 'function') unsubscribe(); } catch (e) { /* ignore */ }

            // 当拿到 exitCode 后做判断
            if (typeof exitCode !== 'undefined' && exitCode !== 0) {
                this.log(`构建进程以非零退出码结束: ${exitCode}`);
                return {
                    success: false,
                    error: `构建进程退出码 ${exitCode}`
                };
            }

            // 检查 dist 目录是否存在且包含输出文件
            const distPath = `${gameProjectPath}/dist`;
            const distExists = await window.electronAPI.pathExists(distPath);
            if (!distExists) {
                this.log('错误: 未找到 dist 目录，打包可能未成功');
                return {
                    success: false,
                    error: '未生成 dist 目录'
                };
            }

            const outputFiles = await window.electronAPI.listDirectory(distPath);
            if (!outputFiles || outputFiles.length === 0) {
                this.log('错误: dist 目录为空，打包失败');
                return {
                    success: false,
                    error: 'dist 目录为空，未生成输出文件'
                };
            }

            // 返回第一个输出条目作为结果
            return {
                success: true,
                outputPath: `${distPath}/${outputFiles[0]}`
            };
    }

    /**
     * 取消打包
     */
    cancelPackaging() {
        if (this.isPackaging) {
            // TODO: 实现取消打包逻辑
            this.log('正在取消打包...');
            this.isPackaging = false;
        }
        this.hidePackageModal();
    }

    /**
     * 显示打包进度
     */
    showPackageProgress() {
        document.querySelector('.package-form').style.display = 'none';
        document.getElementById('package-progress').style.display = 'block';
        
        // 重置进度
        this.updateProgress(0);
        document.getElementById('package-log-content').innerHTML = '';
    }

    /**
     * 更新进度条
     * @param {number} percent - 进度百分比 (0-100)
     */
    updateProgress(percent) {
        const progressFill = document.getElementById('progress-fill');
        if (progressFill) {
            progressFill.style.width = percent + '%';
        }
        
        const progressText = document.querySelector('.progress-text');
        if (progressText) {
            progressText.textContent = `正在打包... (${percent}%)`;
        }
    }

    /**
     * 添加日志信息
     * @param {string} message - 日志消息
     */
    log(message) {
        const logContent = document.getElementById('package-log-content');
        if (logContent) {
            const timestamp = new Date().toLocaleTimeString();
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            logEntry.innerHTML = `<span class="log-time">[${timestamp}]</span> ${message}`;
            logContent.appendChild(logEntry);
            logContent.scrollTop = logContent.scrollHeight;
        }
        
        console.log('[Package]', message);
    }

    /**
     * 显示打包完成
     * @param {string} outputPath - 输出路径
     */
    showPackageComplete(outputPath) {
        const completeHTML = `
            <div class="package-complete">
                <div class="complete-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <h4>打包完成！</h4>
                <p>游戏已成功打包到:</p>
                <div class="output-path">${outputPath}</div>
                <div class="complete-actions">
                    <button id="open-output-folder-btn" class="btn btn-primary">
                        <i class="fas fa-folder-open"></i> 打开输出目录
                    </button>
                    <button id="close-package-modal-btn" class="btn btn-secondary">
                        <i class="fas fa-times"></i> 关闭
                    </button>
                </div>
            </div>
        `;
        
        const progressDiv = document.getElementById('package-progress');
        progressDiv.innerHTML = completeHTML;
        
        // 绑定事件
        document.getElementById('open-output-folder-btn').addEventListener('click', async () => {
            await window.electronAPI.showInFileManager(outputPath);
        });
        
        document.getElementById('close-package-modal-btn').addEventListener('click', () => {
            this.hidePackageModal();
        });
    }

    /**
     * 设置日志回调
     * @param {Function} callback - 日志回调函数
     */
    setLogCallback(callback) {
        this.packageLogCallback = callback;
    }

    /**
     * 获取支持的平台列表
     * @returns {Array} 平台列表
     */
    getSupportedPlatforms() {
        const currentPlatform = (typeof process !== 'undefined' && process.platform) ? process.platform : 'win32';
        const platforms = [
            { value: 'win32', label: 'Windows', supported: true },
            { value: 'darwin', label: 'macOS', supported: currentPlatform === 'darwin' },
            { value: 'linux', label: 'Linux', supported: currentPlatform === 'linux' || currentPlatform === 'win32' }
        ];
        
        return platforms.filter(p => p.supported);
    }
}

// 全局实例
window.galGameProjectPackager = new GalGameProjectPackager();
