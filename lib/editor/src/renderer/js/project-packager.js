/**
 * 项目打包器 - 新版本
 * 负责将编辑器项目打包成可分发的游戏文件
 */

class ProjectPackager {
    constructor() {
        this.packagingInProgress = false;
        this.currentProject = null;
        this.outputPath = null;
    }

    /**
     * 初始化打包器
     */
    init() {
        this.setupEventListeners();
        this.loadPackageSettings();
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 打包按钮
        const packageBtn = document.getElementById('package-project-btn');
        if (packageBtn) {
            packageBtn.addEventListener('click', () => this.showPackageDialog());
        }

        // 快速打包入口暂时禁用（按钮已在 HTML 中隐藏），保留代码以便将来恢复
        // const quickPackageBtn = document.getElementById('quick-package-btn');
        // if (quickPackageBtn) {
        //     quickPackageBtn.addEventListener('click', () => this.quickPackage());
        // }
    }

    /**
     * 加载打包设置
     */
    loadPackageSettings() {
        const saved = localStorage.getItem('packageSettings');
        this.settings = saved ? JSON.parse(saved) : {
            outputDir: '',
            includeAssets: true,
            includeSource: false,
            compressionLevel: 'normal',
            targetPlatform: 'current',
            packageName: '',
            version: '1.0.0',
            description: '',
            author: '',
                icon: '',
                windowsIcon: '',
                macIcon: '',
                linuxIcon: '',
                autoCleanup: true
        };
        // 兼容旧版本：若存在通用 icon 则作为三平台默认
        if (this.settings.icon) {
            this.settings.windowsIcon = this.settings.windowsIcon || this.settings.icon;
            this.settings.macIcon = this.settings.macIcon || this.settings.icon;
            this.settings.linuxIcon = this.settings.linuxIcon || this.settings.icon;
        }
    }

    /**
     * 保存打包设置
     */
    savePackageSettings() {
        localStorage.setItem('packageSettings', JSON.stringify(this.settings));
    }

    /**
     * 显示打包对话框
     */
    async showPackageDialog() {
        if (this.packagingInProgress) {
            this.showAlert('打包进行中', '请等待当前打包完成', 'warning');
            return;
        }

        const projectPath = this.getCurrentProjectPath();
        if (!projectPath) {
            this.showAlert('错误', '没有打开的项目', 'error');
            return;
        }

        try {
            // 加载项目信息
            await this.loadProjectInfo(projectPath);
            
            // 创建打包对话框
            const modal = this.createPackageDialog();
            document.body.appendChild(modal);
            
            // 显示对话框
            requestAnimationFrame(() => modal.classList.add('show'));
        } catch (error) {
            console.error('打包对话框创建失败:', error);
            this.showAlert('错误', '创建打包对话框失败: ' + error.message, 'error');
        }
    }

    /**
     * 创建打包对话框
     */
    createPackageDialog() {
        const modal = document.createElement('div');
        modal.className = 'modal package-dialog';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-box"></i> 项目打包</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="package-form">
                        <!-- 基本信息 -->
                        <div class="form-group">
                            <label>项目名称</label>
                            <input type="text" id="package-name" value="${this.currentProject?.name || ''}" class="form-control">
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>版本号</label>
                                <input type="text" id="package-version" value="${this.settings.version}" class="form-control" placeholder="1.0.0">
                            </div>
                            <div class="form-group">
                                <label>作者</label>
                                <input type="text" id="package-author" value="${this.settings.author}" class="form-control">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>描述</label>
                            <textarea id="package-description" class="form-control" rows="3" placeholder="项目描述...">${this.currentProject?.description || this.settings.description}</textarea>
                        </div>
                        
                        <!-- 输出设置 -->
                        <div class="form-group">
                            <label>输出目录</label>
                            <div class="input-group">
                                <input type="text" id="package-output-dir" value="${this.settings.outputDir}" class="form-control" readonly>
                                <button type="button" id="choose-output-dir" class="btn btn-outline">选择目录</button>
                            </div>
                        </div>
                        
                        <!-- 打包选项 -->
                        <div class="form-group">
                            <label>打包选项</label>
                            <div class="checkbox-group">
                                <label class="checkbox-label">
                                    <input type="checkbox" id="include-assets" ${this.settings.includeAssets ? 'checked' : ''}>
                                    <span>包含资源文件</span>
                                </label>
                                <label class="checkbox-label">
                                    <input type="checkbox" id="include-source" ${this.settings.includeSource ? 'checked' : ''}>
                                    <span>包含源代码（开发版本）</span>
                                </label>
                                <label class="checkbox-label">
                                    <input type="checkbox" id="create-installer" ${this.settings.createInstaller ? 'checked' : ''}>
                                    <span>创建安装程序</span>
                                </label>
                                <label class="checkbox-label">
                                    <input type="checkbox" id="auto-cleanup" ${this.settings.autoCleanup !== false ? 'checked' : ''}>
                                    <span>打包后自动清除打包目录工程文件</span>
                                </label>
                            </div>
                        </div>
                        
                        <!-- 应用图标 -->
                        <div class="form-group">
                            <label>应用图标（可选，建议分别提供三端最优格式）</label>
                            <div class="icon-pickers">
                                <div class="icon-picker-row">
                                    <span class="icon-label"><i class="fab fa-windows"></i> Windows (.ico)</span>
                                    <div class="input-group">
                                        <input type="text" id="icon-windows" value="${this.settings.windowsIcon || ''}" class="form-control" placeholder="选择 .ico 文件" readonly>
                                        <button type="button" id="choose-icon-windows" class="btn btn-outline">选择文件</button>
                                        <button type="button" id="clear-icon-windows" class="btn btn-outline">清除</button>
                                    </div>
                                </div>
                                <div class="icon-picker-row">
                                    <span class="icon-label"><i class="fab fa-apple"></i> macOS (.icns)</span>
                                    <div class="input-group">
                                        <input type="text" id="icon-mac" value="${this.settings.macIcon || ''}" class="form-control" placeholder="选择 .icns 文件" readonly>
                                        <button type="button" id="choose-icon-mac" class="btn btn-outline">选择文件</button>
                                        <button type="button" id="clear-icon-mac" class="btn btn-outline">清除</button>
                                    </div>
                                </div>
                                <div class="icon-picker-row">
                                    <span class="icon-label"><i class="fab fa-linux"></i> Linux (.png)</span>
                                    <div class="input-group">
                                        <input type="text" id="icon-linux" value="${this.settings.linuxIcon || ''}" class="form-control" placeholder="选择 .png 文件（512x512 建议）" readonly>
                                        <button type="button" id="choose-icon-linux" class="btn btn-outline">选择文件</button>
                                        <button type="button" id="clear-icon-linux" class="btn btn-outline">清除</button>
                                    </div>
                                </div>
                            </div>
                            <p class="subtle" style="margin-top:6px;">未设置时将使用 Electron 默认图标或播放器内置图标。</p>
                        </div>

                        <!-- 压缩级别 -->
                        <div class="form-group">
                            <label>压缩级别</label>
                            <select id="compression-level" class="form-control">
                                <option value="none" ${this.settings.compressionLevel === 'none' ? 'selected' : ''}>无压缩（最快）</option>
                                <option value="fast" ${this.settings.compressionLevel === 'fast' ? 'selected' : ''}>快速压缩</option>
                                <option value="normal" ${this.settings.compressionLevel === 'normal' ? 'selected' : ''}>标准压缩</option>
                                <option value="best" ${this.settings.compressionLevel === 'best' ? 'selected' : ''}>最大压缩（最慢）</option>
                            </select>
                        </div>
                        
                        <!-- 目标平台 -->
                        <div class="form-group">
                            <label>目标平台</label>
                            <select id="target-platform" class="form-control">
                                <option value="current" ${this.settings.targetPlatform === 'current' ? 'selected' : ''}>当前平台</option>
                                <option value="windows" ${this.settings.targetPlatform === 'windows' ? 'selected' : ''}>Windows</option>
                                <option value="mac" ${this.settings.targetPlatform === 'mac' ? 'selected' : ''}>macOS</option>
                                <option value="linux" ${this.settings.targetPlatform === 'linux' ? 'selected' : ''}>Linux</option>
                                <option value="all" ${this.settings.targetPlatform === 'all' ? 'selected' : ''}>所有平台</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" id="start-package">
                        <i class="fas fa-play"></i> 开始打包
                    </button>
                    <button class="btn btn-secondary" id="cancel-package">取消</button>
                </div>
            </div>
        `;

        // 绑定事件
        this.bindDialogEvents(modal);
        
        return modal;
    }

    /**
     * 绑定对话框事件
     */
    bindDialogEvents(modal) {
        const closeBtn = modal.querySelector('.modal-close');
        const cancelBtn = modal.querySelector('#cancel-package');
        const startBtn = modal.querySelector('#start-package');
        const chooseDirBtn = modal.querySelector('#choose-output-dir');
        const chooseWinIconBtn = modal.querySelector('#choose-icon-windows');
        const clearWinIconBtn = modal.querySelector('#clear-icon-windows');
        const chooseMacIconBtn = modal.querySelector('#choose-icon-mac');
        const clearMacIconBtn = modal.querySelector('#clear-icon-mac');
        const chooseLinuxIconBtn = modal.querySelector('#choose-icon-linux');
        const clearLinuxIconBtn = modal.querySelector('#clear-icon-linux');

        // 关闭对话框
        const closeDialog = () => {
            modal.classList.remove('show');
            setTimeout(() => {
                if (modal.parentNode) {
                    document.body.removeChild(modal);
                }
            }, 200);
        };

        closeBtn.addEventListener('click', closeDialog);
        cancelBtn.addEventListener('click', closeDialog);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeDialog();
        });

        // 选择输出目录
        chooseDirBtn.addEventListener('click', async () => {
            try {
                const result = await window.electronAPI.showOpenDialog({
                    title: '选择输出目录',
                    properties: ['openDirectory'],
                    defaultPath: this.settings.outputDir || ''
                });

                if (!result.canceled && result.filePaths.length > 0) {
                    const outputDir = result.filePaths[0];
                    modal.querySelector('#package-output-dir').value = outputDir;
                }
            } catch (error) {
                console.error('选择输出目录失败:', error);
                this.showAlert('错误', '选择输出目录失败', 'error');
            }
        });

        // 选择 Windows 图标
        chooseWinIconBtn.addEventListener('click', async () => {
            try {
                const result = await window.electronAPI.showOpenDialog({
                    title: '选择 Windows 图标 (.ico)',
                    properties: ['openFile'],
                    filters: [{ name: 'Windows 图标', extensions: ['ico'] }]
                });
                if (!result.canceled && result.filePaths.length > 0) {
                    modal.querySelector('#icon-windows').value = result.filePaths[0];
                }
            } catch (e) {
                console.error('选择 Windows 图标失败:', e);
                this.showAlert('错误', '选择 Windows 图标失败', 'error');
            }
        });
        clearWinIconBtn.addEventListener('click', () => { modal.querySelector('#icon-windows').value = ''; });

        // 选择 macOS 图标
        chooseMacIconBtn.addEventListener('click', async () => {
            try {
                const result = await window.electronAPI.showOpenDialog({
                    title: '选择 macOS 图标 (.icns)',
                    properties: ['openFile'],
                    filters: [{ name: 'macOS 图标', extensions: ['icns'] }]
                });
                if (!result.canceled && result.filePaths.length > 0) {
                    modal.querySelector('#icon-mac').value = result.filePaths[0];
                }
            } catch (e) {
                console.error('选择 macOS 图标失败:', e);
                this.showAlert('错误', '选择 macOS 图标失败', 'error');
            }
        });
        clearMacIconBtn.addEventListener('click', () => { modal.querySelector('#icon-mac').value = ''; });

        // 选择 Linux 图标
        chooseLinuxIconBtn.addEventListener('click', async () => {
            try {
                const result = await window.electronAPI.showOpenDialog({
                    title: '选择 Linux 图标 (.png)',
                    properties: ['openFile'],
                    filters: [{ name: 'Linux 图标', extensions: ['png'] }]
                });
                if (!result.canceled && result.filePaths.length > 0) {
                    modal.querySelector('#icon-linux').value = result.filePaths[0];
                }
            } catch (e) {
                console.error('选择 Linux 图标失败:', e);
                this.showAlert('错误', '选择 Linux 图标失败', 'error');
            }
        });
        clearLinuxIconBtn.addEventListener('click', () => { modal.querySelector('#icon-linux').value = ''; });

        // 开始打包
        startBtn.addEventListener('click', () => {
            this.collectFormData(modal);
            closeDialog();
            this.startPackaging();
        });
    }

    /**
     * 收集表单数据
     */
    collectFormData(modal) {
        this.settings = {
            ...this.settings,
            packageName: modal.querySelector('#package-name').value.trim(),
            version: modal.querySelector('#package-version').value.trim(),
            author: modal.querySelector('#package-author').value.trim(),
            description: modal.querySelector('#package-description').value.trim(),
            outputDir: modal.querySelector('#package-output-dir').value.trim(),
            includeAssets: modal.querySelector('#include-assets').checked,
            includeSource: modal.querySelector('#include-source').checked,
            createInstaller: modal.querySelector('#create-installer').checked,
            compressionLevel: modal.querySelector('#compression-level').value,
                targetPlatform: modal.querySelector('#target-platform').value,
                autoCleanup: modal.querySelector('#auto-cleanup').checked,
                windowsIcon: modal.querySelector('#icon-windows').value.trim(),
                macIcon: modal.querySelector('#icon-mac').value.trim(),
                linuxIcon: modal.querySelector('#icon-linux').value.trim()
        };

        // 保存设置
        this.savePackageSettings();
    }

    /**
     * 快速打包
     */
    async quickPackage() {
        if (this.packagingInProgress) {
            this.showAlert('打包进行中', '请等待当前打包完成', 'warning');
            return;
        }

        const projectPath = this.getCurrentProjectPath();
        if (!projectPath) {
            this.showAlert('错误', '没有打开的项目', 'error');
            return;
        }

        try {
            // 加载项目信息
            await this.loadProjectInfo(projectPath);
            
            // 使用默认设置
            if (!this.settings) this.settings = {};
            // 优先使用项目内部定义的名称（metadata/productName/name），再退回到当前项目的文件夹名，最后回退到未命名
            let pkgName = '未命名项目';
            try {
                if (this.currentProject) {
                    // project.json 可能包含多种命名字段
                    pkgName = this.currentProject.productName || this.currentProject.metadata?.name || this.currentProject.name || pkgName;
                }
                // 如果仍然没有有效名字，则尝试使用目录名
                if (!pkgName || !pkgName.trim()) {
                    pkgName = projectPath ? (window.path?.basename ? window.path.basename(projectPath) : projectPath.split(/[\\\/]/).pop()) : pkgName;
                }
            } catch (e) {
                // 忽略错误，使用默认
            }
            this.settings.packageName = pkgName;
            // 默认导出到下载目录/项目名-版本
            let defaultOutput = this.settings.outputDir;
            if (!defaultOutput) {
                try {
                    const downloads = await window.electronAPI.getDownloadsPath();
                    defaultOutput = downloads || '';
                } catch {}
            }
            this.settings.outputDir = defaultOutput || (window.path?.dirname ? window.path.dirname(projectPath) : projectPath);
            
            // 开始打包
            await this.startPackaging();
        } catch (error) {
            console.error('快速打包失败:', error);
            this.showAlert('错误', '快速打包失败: ' + error.message, 'error');
        }
    }

    /**
     * 开始打包
     */
    async startPackaging() {
        if (!this.settings || !this.settings.packageName || !this.settings.packageName.trim()) {
            this.showAlert('错误', '请输入项目名称', 'error');
            return;
        }

        if (!this.settings.outputDir || !this.settings.outputDir.trim()) {
            this.showAlert('错误', '请选择输出目录', 'error');
            return;
        }

        // Node.js 环境检测：若缺失则拒绝打包并提示
        try {
            const res = await window.electronAPI.checkNodeEnv();
            if (!res || !res.installed) {
                await this.showNodeInstallGuideModal();
                return;
            }
        } catch {}

        this.packagingInProgress = true;
        
        try {
            // 显示打包进度
            const progressModal = this.createProgressModal();
            document.body.appendChild(progressModal);
            
            // 开始打包流程
            await this.executePackaging(progressModal);
            
        } catch (error) {
            console.error('打包失败:', error);
            this.showAlert('打包失败', error.message, 'error');
        } finally {
            this.packagingInProgress = false;
        }
    }

    /**
     * 显示 Node.js 安装引导模态框
     */
    async showNodeInstallGuideModal() {
        const modal = document.createElement('div');
        modal.className = 'modal node-install-guide';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:820px">
                <div class="modal-header">
                    <h3><i class="fas fa-exclamation-triangle text-warning"></i> 未检测到 Node.js 环境</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <p>项目打包需要系统已安装 Node.js（包含 npm）。请按以下步骤安装：</p>
                    <ol style="line-height:1.7">
                        <li>打开 <a href="https://nodejs.org/" target="_blank">Node.js 官方网站</a>。</li>
                        <li>下载对应平台的 LTS 版本安装包（推荐）。</li>
                        <li>运行安装包，保持默认选项完成安装。</li>
                        <li>安装完成后，重启本应用或点击下方“重新检测”。</li>
                    </ol>
                    <div class="callout" style="margin-top:10px;padding:10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-secondary)">
                        <strong>提示：</strong>如下载缓慢，可使用国内镜像；安装后在命令行执行 <code>node -v</code> 与 <code>npm -v</code> 验证。
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" id="btn-open-node-site"><i class="fas fa-external-link-alt"></i> 打开 Node.js 官网</button>
                    <button class="btn btn-secondary" id="btn-recheck-node"><i class="fas fa-sync"></i> 重新检测</button>
                    <button class="btn" id="btn-close-node-guide">关闭</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const close = () => { modal.classList.remove('show'); setTimeout(()=>modal.remove(), 200); };
        modal.querySelector('.modal-close').addEventListener('click', close);
        modal.addEventListener('click', (e)=>{ if(e.target===modal) close(); });
        modal.querySelector('#btn-open-node-site').addEventListener('click', ()=>{
            try { window.electronAPI.shell.openExternal('https://nodejs.org/'); } catch {}
        });
        modal.querySelector('#btn-recheck-node').addEventListener('click', async ()=>{
            try {
                const res = await window.electronAPI.checkNodeEnv();
                if (res && res.installed) {
                    this.showAlert('检测通过', '已检测到 Node.js 环境，可以继续打包。', 'success');
                    close();
                } else {
                    this.showAlert('仍未检测到', '请按引导完成安装后再试。', 'warning');
                }
            } catch { this.showAlert('检测失败', '检测进程遇到问题，请稍后重试。', 'error'); }
        });
        modal.querySelector('#btn-close-node-guide').addEventListener('click', close);
        requestAnimationFrame(()=> modal.classList.add('show'));
    }

    /**
     * 创建进度模态框
     */
    createProgressModal() {
        const modal = document.createElement('div');
        modal.className = 'modal package-progress-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-cog fa-spin"></i> 正在打包项目...</h3>
                </div>
                <div class="modal-body">
                    <div class="progress-info">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: 0%"></div>
                        </div>
                        <div class="progress-text">准备中...</div>
                        <pre class="progress-details" style="max-height: 280px; overflow: auto; background: #0b1220; color: #d1e7ff; padding: 10px; border-radius: 8px; font-family: Consolas, 'Courier New', monospace; white-space: pre-wrap;"></pre>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-danger" id="cancel-packaging" style="display: none;">取消打包</button>
                </div>
            </div>
        `;
        
        modal.classList.add('show');
        return modal;
    }

    /**
     * 执行打包
     */
    async executePackaging(progressModal) {
        const projectPath = this.getCurrentProjectPath();
        const outputDir = this.settings.outputDir;
        const packageName = this.settings.packageName.replace(/[^a-zA-Z0-9-_\u4e00-\u9fff]/g, '_');
        
        // 创建输出目录
        const finalOutputPath = window.path?.join 
            ? window.path.join(outputDir, `${packageName}-${this.settings.version}`)
            : `${outputDir}/${packageName}-${this.settings.version}`;

        this.outputPath = finalOutputPath;

        try {
            console.group('[Packager] 执行打包');
            console.log('[Packager] 项目路径:', projectPath);
            console.log('[Packager] 输出目录:', outputDir);
            console.log('[Packager] 最终输出路径:', finalOutputPath);
            // 步骤1: 准备输出目录
            this.updateProgress(progressModal, 10, '准备输出目录...', '');
            console.time('[Packager] 准备输出目录');
            await this.prepareOutputDirectory(finalOutputPath);
            console.timeEnd('[Packager] 准备输出目录');

            // 步骤2: 复制项目文件
            this.updateProgress(progressModal, 30, '复制项目文件...', '');
            console.time('[Packager] 复制项目文件');
            await this.copyProjectFiles(projectPath, finalOutputPath);
            try {
                const list = await window.electronAPI.fsReaddir(finalOutputPath);
                console.log('[Packager] 输出目录初始内容:', list);
            } catch {}
            console.timeEnd('[Packager] 复制项目文件');

            // 步骤3: 处理资源文件
            if (this.settings.includeAssets) {
                this.updateProgress(progressModal, 50, '处理资源文件...', '');
                console.time('[Packager] 处理资源文件');
                await this.processAssets(projectPath, finalOutputPath);
                console.timeEnd('[Packager] 处理资源文件');
            }

            // 步骤4: 生成播放器
            this.updateProgress(progressModal, 72, '准备游戏播放器...', '');
            console.time('[Packager] 复制播放器源码');
            await this.bundlePlayer(finalOutputPath);
            console.timeEnd('[Packager] 复制播放器源码');

            // 步骤5: 创建配置文件
            this.updateProgress(progressModal, 78, '生成配置文件...', '');
            console.time('[Packager] 生成配置文件');
            await this.generateConfigFiles(finalOutputPath);
            console.timeEnd('[Packager] 生成配置文件');

            // 步骤6: 后台构建（总是执行 electron-builder 以生成分发）
            this.updateProgress(progressModal, 80, '安装依赖 (npm install)...', '');
            // 先安装非 electron 依赖
            console.log('[Packager] 执行 npm install --ignore-scripts');
            let install = await window.electronAPI.packagerRunWithEnv(finalOutputPath, 'npm', ['install', '--ignore-scripts'], {
                npm_config_production: 'false'
            });
            if (install?.success) {
                console.log('[Packager] 依赖安装任务ID:', install.jobId);
                const installRes = await this.streamPackagerLogs(progressModal, install.jobId, 80, 88);
                if (!installRes || installRes.error || (typeof installRes.exitCode === 'number' && installRes.exitCode !== 0)) {
                    throw new Error('依赖安装失败: ' + (installRes?.error || `退出码 ${installRes?.exitCode}`));
                }
            }
            
            // 检查安装结果
            const nm = window.path?.join ? window.path.join(finalOutputPath, 'node_modules') : `${finalOutputPath}/node_modules`;
            const hasNm = await window.electronAPI.pathExists(nm);
            console.log('[Packager] node_modules 存在:', hasNm);
                
            // 如果 electron 安装失败，尝试使用系统 electron
            const electronDir = window.path?.join ? window.path.join(nm, 'electron') : `${nm}/electron`;
            const electronExists = await window.electronAPI.pathExists(electronDir);
            if (!electronExists) {
                console.warn('[Packager] Electron 目录不存在，但继续构建尝试...');
            }

            this.updateProgress(progressModal, 88, '构建安装包 (npm run dist)...', '');
            console.log('[Packager] 使用 npm run dist 构建');
            
            // 在执行前检查 package.json 是否存在 dist 脚本
            const packageJsonPath = window.path?.join ? window.path.join(finalOutputPath, 'package.json') : `${finalOutputPath}/package.json`;
            try {
                const packageContent = await window.electronAPI.readFile(packageJsonPath);
                const packageData = JSON.parse(packageContent);
                console.log('[Packager] package.json scripts:', packageData.scripts);
                console.log('[Packager] package.json devDependencies:', packageData.devDependencies);
            } catch (e) {
                console.warn('[Packager] 无法读取 package.json:', e.message);
            }
            
            console.log('[Packager] 即将启动构建命令: npm run dist');
            console.log('[Packager] 构建目录:', finalOutputPath);
            // 根据用户选择的目标平台传递 electron-builder 平台参数
            let buildArgs = ['run', 'dist'];
            try {
                const tp = (this.settings && this.settings.targetPlatform) ? this.settings.targetPlatform : 'current';
                if (tp === 'windows') buildArgs = ['run', 'dist', '--', '--win'];
                else if (tp === 'mac') buildArgs = ['run', 'dist', '--', '--mac'];
                else if (tp === 'linux') buildArgs = ['run', 'dist', '--', '--linux'];
                else if (tp === 'all') buildArgs = ['run', 'dist', '--', '--win', '--mac', '--linux'];
                // 'current' -> keep default (host platform)
            } catch (e) {
                console.warn('[Packager] 构建参数解析失败，使用默认参数', e?.message || e);
            }
            const build = await window.electronAPI.packagerRun(finalOutputPath, 'npm', buildArgs);
            console.log('[Packager] 构建命令返回结果:', build);
            
            if (build?.success && build.jobId) {
                console.log('[Packager] 构建任务ID:', build.jobId);
                console.log('[Packager] 开始监听构建日志...');
                const buildRes = await this.streamPackagerLogs(progressModal, build.jobId, 88, 100);
                if (!buildRes || buildRes.error || (typeof buildRes.exitCode === 'number' && buildRes.exitCode !== 0)) {
                    console.error('[Packager] 构建失败:', buildRes);
                    throw new Error('构建失败: ' + (buildRes?.error || `退出码 ${buildRes?.exitCode}`));
                }
                // 检查 dist
                const distDir = window.path?.join ? window.path.join(finalOutputPath, 'dist') : `${finalOutputPath}/dist`;
                const hasDist = await window.electronAPI.pathExists(distDir);
                console.log('[Packager] dist 存在:', hasDist);
                if (hasDist) {
                    let distFiles = [];
                    try { 
                        distFiles = await window.electronAPI.fsReaddir(distDir); 
                        console.log('[Packager] dist 文件列表:', distFiles);
                    } catch (e) {
                        console.warn('[Packager] 无法读取 dist 目录:', e.message);
                    }
                }
            } else {
                console.error('[Packager] 构建命令启动失败:', build?.error || '未知错误');
                console.error('[Packager] 构建命令完整响应:', build);
                throw new Error(`构建命令启动失败: ${build?.error || '未知错误'}`);
            }

            // 完成
            this.updateProgress(progressModal, 100, '打包完成！', `输出路径: ${finalOutputPath}`);

            // 可选清理：保留 dist 与启动脚本，移除复制的源码等
            try {
                // 验证 dist 下是否有可执行产物
                const distDir = window.path?.join ? window.path.join(finalOutputPath, 'dist') : `${finalOutputPath}/dist`;
                const hasDist = await window.electronAPI.pathExists(distDir);
                if (!hasDist) {
                    throw new Error('构建未生成 dist 目录，请查看构建日志。');
                }
                let list = [];
                try { list = await window.electronAPI.fsReaddir(distDir); } catch { list = []; }
                if (!list || list.length === 0) {
                    throw new Error('dist 目录为空，请查看构建日志。');
                }
                // 仅当存在构建产物时根据选项清理工程文件
                if (this.settings.autoCleanup) {
                    this.updateProgress(progressModal, 100, '清理打包目录...', '移除临时工程文件');
                    await this.cleanupBuildFolder(finalOutputPath);
                }
            } catch (e) {
                console.warn('构建产物验证或清理步骤遇到问题：', e?.message || e);
            }

            // 显示完成对话框
            setTimeout(() => {
                this.showPackageComplete(progressModal, finalOutputPath);
            }, 1000);

        } catch (error) {
            console.error('打包执行失败:', error);
            this.updateProgress(progressModal, 0, '打包失败', error.message);
            // 在失败时展示可关闭按钮
            try {
                const footer = progressModal.querySelector('.modal-footer');
                if (footer) {
                    const doneBtn = document.createElement('button');
                    doneBtn.className = 'btn';
                    doneBtn.id = 'close-on-fail';
                    doneBtn.textContent = '完成';
                    doneBtn.addEventListener('click', () => {
                        progressModal.classList.remove('show');
                        setTimeout(() => progressModal.remove(), 200);
                    });
                    footer.appendChild(doneBtn);
                }
            } catch {}
            throw error;
        } finally {
            console.groupEnd('[Packager] 执行打包');
        }
    }

    /**
     * 准备输出目录
     */
    async prepareOutputDirectory(outputPath) {
        // 调用主进程创建目录
        await window.electronAPI.ensureDir(outputPath);
        
        // 清理已存在的文件
        const exists = await window.electronAPI.pathExists(outputPath);
        if (exists) {
            // 备份旧版本
            const backupPath = `${outputPath}_backup_${Date.now()}`;
            try {
                await window.electronAPI.moveFile(outputPath, backupPath);
                await window.electronAPI.ensureDir(outputPath);
            } catch (error) {
                console.warn('备份旧版本失败，直接覆盖:', error);
            }
        }
    }

    /**
     * 复制项目文件
     */
    async copyProjectFiles(sourcePath, outputPath) {
        // 复制常见的项目结构（目录复制由主进程copy实现）
        const candidates = [
            'project.json',
            'settings.json',
            'chapters',
            'assets',
            'characters',
            'backgrounds',
            'music',
            'audio',
            'images'
        ];

        for (const item of candidates) {
            const srcPath = window.path?.join ? window.path.join(sourcePath, item) : `${sourcePath}/${item}`;
            const destPath = window.path?.join ? window.path.join(outputPath, item) : `${outputPath}/${item}`;
            if (await window.electronAPI.pathExists(srcPath)) {
                await window.electronAPI.copyFile(srcPath, destPath);
            }
        }
    }

    /**
     * 处理资源文件
     */
    async processAssets(sourcePath, outputPath) {
        const assetsSource = window.path?.join ? window.path.join(sourcePath, 'assets') : `${sourcePath}/assets`;
        const assetsTarget = window.path?.join ? window.path.join(outputPath, 'assets') : `${outputPath}/assets`;
        
        if (await window.electronAPI.pathExists(assetsSource)) {
            await window.electronAPI.copyFile(assetsSource, assetsTarget);
        }
    }

    /**
     * 打包播放器
     */
    async bundlePlayer(outputPath) {
            console.group('[Packager] bundlePlayer');
        // 复制播放器文件到输出目录（整份源码），带回退路径
        let appPath = '';
        try {
            appPath = await window.electronAPI.getAppPath();
        } catch {}
        // 仅支持 lib/player，不再使用 framework 回退
        let playerSource;
        if (appPath.endsWith('.asar')) {
            // 打包态：始终指向 asar.unpacked
            const unpackedPath = appPath.replace(/\.asar$/, '.asar.unpacked');
            playerSource = window.path?.join ? window.path.join(unpackedPath, 'lib', 'player') : `${unpackedPath}/lib/player`;
        } else {
            // 开发态
            playerSource = window.path?.join ? window.path.join(appPath, 'lib', 'player') : `${appPath}/lib/player`;
        }
        const playerTarget = window.path?.join ? window.path.join(outputPath, 'player') : `${outputPath}/player`;
        
            console.log('[Packager] appPath:', appPath);
            console.log('[Packager] playerSource:', playerSource);
            console.log('[Packager] playerTarget:', playerTarget);
        // 校验 lib/player 是否存在且包含入口文件
        const entryCheck = window.path?.join ? window.path.join(playerSource, 'src', 'main.js') : `${playerSource}/src/main.js`;
        const hasPlayerDir = await window.electronAPI.pathExists(playerSource);
        const hasEntry = await window.electronAPI.pathExists(entryCheck);
        if (hasPlayerDir && hasEntry) {
            await window.electronAPI.copyFile(playerSource, playerTarget);
                console.log('[Packager] 已复制播放器到:', playerTarget);
        } else {
                console.error('[Packager] 未找到播放器源码目录或入口文件');
                console.error('[Packager] 期望路径:', playerSource);
                console.error('[Packager] 期望入口:', entryCheck);
                console.groupEnd('[Packager] bundlePlayer');
            throw new Error('未找到播放器源码目录，请确认应用包内存在 lib/player 及 src/main.js');
        }

        // 移除播放器根目录中的许可证文件（不随成品分发）
        try {
            const candidates = ['LICENSE.md', 'LICENSE', 'LICENSE.txt'];
            for (const name of candidates) {
                const p = window.path?.join ? window.path.join(playerTarget, name) : `${playerTarget}/${name}`;
                const exists = await window.electronAPI.pathExists(p);
                if (exists) {
                    await window.electronAPI.deleteFile(p);
                    console.log('[Packager] 已移除播放器许可证文件:', name);
                }
            }
        } catch (e) {
            console.warn('[Packager] 移除播放器许可证文件时出现问题:', e?.message || e);
        }

        // 覆盖播放器的内置图标到 player/assets 下（用于窗口与 UI 显示）
        try {
            const assetsDir = window.path?.join ? window.path.join(playerTarget, 'assets') : `${playerTarget}/assets`;
            const ensureDir = await window.electronAPI.pathExists(assetsDir);
            if (!ensureDir) {
                try { await window.electronAPI.ensureDir(assetsDir); } catch {}
            }

            // 覆盖 Windows ICO
            if (this.settings.windowsIcon && this.settings.windowsIcon.endsWith('.ico')) {
                const icoTarget = window.path?.join ? window.path.join(assetsDir, 'icon.ico') : `${assetsDir}/icon.ico`;
                try {
                    const exists = await window.electronAPI.pathExists(this.settings.windowsIcon);
                    if (exists) {
                        await window.electronAPI.copyFile(this.settings.windowsIcon, icoTarget);
                        console.log('[Packager] 覆盖 player/assets/icon.ico');
                    }
                } catch (e) {
                    console.warn('[Packager] 覆盖 icon.ico 失败:', e?.message || e);
                }
            }

            // 覆盖 macOS ICNS
            if (this.settings.macIcon && this.settings.macIcon.endsWith('.icns')) {
                const icnsTarget = window.path?.join ? window.path.join(assetsDir, 'AppIcon.icns') : `${assetsDir}/AppIcon.icns`;
                try {
                    const exists = await window.electronAPI.pathExists(this.settings.macIcon);
                    if (exists) {
                        await window.electronAPI.copyFile(this.settings.macIcon, icnsTarget);
                        console.log('[Packager] 覆盖 player/assets/AppIcon.icns');
                    }
                } catch (e) {
                    console.warn('[Packager] 覆盖 AppIcon.icns 失败:', e?.message || e);
                }
            }

            // 覆盖 PNG（用于 UI 引用的 icon.png）
            if (this.settings.linuxIcon && this.settings.linuxIcon.toLowerCase().endsWith('.png')) {
                const pngTarget = window.path?.join ? window.path.join(assetsDir, 'icon.png') : `${assetsDir}/icon.png`;
                try {
                    const exists = await window.electronAPI.pathExists(this.settings.linuxIcon);
                    if (exists) {
                        await window.electronAPI.copyFile(this.settings.linuxIcon, pngTarget);
                        console.log('[Packager] 覆盖 player/assets/icon.png');
                    }
                } catch (e) {
                    console.warn('[Packager] 覆盖 icon.png 失败:', e?.message || e);
                }
            } else if (this.settings.windowsIcon && this.settings.windowsIcon.toLowerCase().endsWith('.png')) {
                // 兼容：若 Windows 图标意外选择为 PNG，则也用来覆盖 icon.png
                const pngTarget = window.path?.join ? window.path.join(assetsDir, 'icon.png') : `${assetsDir}/icon.png`;
                try {
                    const exists = await window.electronAPI.pathExists(this.settings.windowsIcon);
                    if (exists) {
                        await window.electronAPI.copyFile(this.settings.windowsIcon, pngTarget);
                        console.log('[Packager] 覆盖 player/assets/icon.png (来自 windowsIcon)');
                    }
                } catch (e) {
                    console.warn('[Packager] 覆盖 icon.png 失败 (windowsIcon):', e?.message || e);
                }
            } else if (this.settings.macIcon && this.settings.macIcon.toLowerCase().endsWith('.png')) {
                // 兼容：若 macOS 图标意外选择为 PNG，则也用来覆盖 icon.png
                const pngTarget = window.path?.join ? window.path.join(assetsDir, 'icon.png') : `${assetsDir}/icon.png`;
                try {
                    const exists = await window.electronAPI.pathExists(this.settings.macIcon);
                    if (exists) {
                        await window.electronAPI.copyFile(this.settings.macIcon, pngTarget);
                        console.log('[Packager] 覆盖 player/assets/icon.png (来自 macIcon)');
                    }
                } catch (e) {
                    console.warn('[Packager] 覆盖 icon.png 失败 (macIcon):', e?.message || e);
                }
            } else {
                // 未提供 PNG 时保留默认
                if (this.settings.linuxIcon || this.settings.windowsIcon || this.settings.macIcon) {
                    console.log('[Packager] 未提供 PNG 图标，保留内置 player/assets/icon.png');
                }
            }
        } catch (err) {
            console.warn('[Packager] 覆盖播放器图标时出现问题:', err?.message || err);
        }

        // 若项目包含 distinfo（包含 settings.json 与 files/），复制到播放器目录
        try {
            const projectRoot = this.getCurrentProjectPath();
            if (projectRoot) {
                const distinfoSource = window.path?.join ? window.path.join(projectRoot, 'distinfo') : `${projectRoot}/distinfo`;
                const exists = await window.electronAPI.pathExists(distinfoSource);
                if (exists) {
                    const distinfoTarget = window.path?.join ? window.path.join(playerTarget, 'src', 'renderer', 'distinfo') : `${playerTarget}/src/renderer/distinfo`;
                    try { await window.electronAPI.ensureDir(distinfoTarget); } catch {}
                    await window.electronAPI.copyFile(distinfoSource, distinfoTarget);
                    console.log('[Packager] 已复制 distinfo 到:', distinfoTarget);
                    // 兼容旧版：仍复制 files 到 custom 以供旧逻辑加载
                    const filesSource = window.path?.join ? window.path.join(distinfoSource, 'files') : `${distinfoSource}/files`;
                    const hasFiles = await window.electronAPI.pathExists(filesSource);
                    if (hasFiles) {
                        const customTarget = window.path?.join ? window.path.join(playerTarget, 'src', 'renderer', 'custom') : `${playerTarget}/src/renderer/custom`;
                        try { await window.electronAPI.ensureDir(customTarget); } catch {}
                        await window.electronAPI.copyFile(filesSource, customTarget);
                        console.log('[Packager] 兼容复制 files 到 custom:', customTarget);
                    }
                } else {
                    console.log('[Packager] 未发现 distinfo，跳过发布信息复制');
                }
            }
        } catch (e) {
            console.warn('[Packager] 复制自定义关于/许可证失败:', e?.message || e);
        }

        // 创建启动脚本
        await this.createLaunchScript(outputPath);
            console.groupEnd('[Packager] bundlePlayer');
    }

    // 监听并显示打包日志，同时平滑推进进度
    async streamPackagerLogs(modal, jobId, from = 0, to = 100) {
        return new Promise((resolve) => {
            const details = modal.querySelector('.progress-details');
            let percent = from;
            const step = Math.max(0.2, (to - from) / 200);
            let isResolved = false;
            
            // 平滑进度条更新
            const timer = setInterval(() => {
                if (percent < to - 1 && !isResolved) {
                    percent += step;
                    this.updateProgress(modal, percent, null, null);
                }
            }, 200);
            
            // 设置超时保护（5分钟）
            const timeout = setTimeout(() => {
                if (isResolved) return;
                console.warn('[Packager] 日志监听超时，自动结束');
                isResolved = true;
                clearInterval(timer);
                resolve({ exitCode: null, error: 'timeout' });
            }, 300000); // 5 minutes
            
            let cleanup = () => {
                if (!isResolved) {
                    isResolved = true;
                    clearInterval(timer);
                    clearTimeout(timeout);
                }
            };
            
            const onLog = (payload) => {
                if (isResolved || !payload || payload.jobId !== jobId) return;

                if (payload.type === 'stdout' || payload.type === 'stderr') {
                    if (details) {
                        details.insertAdjacentText('beforeend', payload.data || '');
                        details.scrollTop = details.scrollHeight;
                    }
                } else if (payload.type === 'exit') {
                    const code = parseInt(String(payload.data), 10);
                    this.updateProgress(modal, to, null, `进程退出码: ${payload.data}`);
                    cleanup();
                    resolve({ exitCode: Number.isNaN(code) ? null : code, error: null });
                } else if (payload.type === 'error') {
                    this.updateProgress(modal, from, '执行错误', payload.data || '未知错误');
                    cleanup();
                    resolve({ exitCode: null, error: payload.data || '未知错误' });
                }
            };

            // 注册监听器并获取取消函数
            const unsubscribe = window.electronAPI.onPackagerLog(onLog);

            // 立即拉取主进程缓存的早期日志（如果有），并按顺序处理
            // 拉取缓存日志（如果有），使用 Promise 以避免在非 async 回调中使用 await
            window.electronAPI.drainPackagerBuffer(jobId).then((drained) => {
                if (drained && drained.success && Array.isArray(drained.buffer)) {
                    for (const item of drained.buffer) {
                        try { onLog({ jobId, type: item.type, data: item.data }); } catch (e) { /* ignore */ }
                    }
                }
            }).catch((e) => {
                console.warn('[Packager] 拉取缓冲日志失败:', e?.message || e);
            });

            // 在 cleanup/resolve 后移除监听
            const origCleanup = cleanup;
            cleanup = () => {
                try { if (typeof unsubscribe === 'function') unsubscribe(); } catch (e) {}
                origCleanup();
            };
        });
    }

    /**
     * 生成配置文件
     */
    async generateConfigFiles(outputPath) {
          console.group('[Packager] generateConfigFiles');
        // 生成package.json（直接以 player 源码入口为主进程入口）
        const packageJson = {
            name: this.settings.packageName,
            version: this.settings.version,
            description: this.settings.description,
            author: this.settings.author,
            main: "player/src/main.js",
            scripts: {
                start: "electron .",
                dist: "electron-builder",
                "electron:install": "node -p \"require('fs').existsSync('node_modules/electron') ? 'Electron already installed' : process.exit(1)\""
            },
            build: {
                appId: `com.artimeow.${this.settings.packageName.toLowerCase()}`,
                productName: this.settings.packageName,
                directories: {
                    output: "dist"
                },
                files: [
                    "**/*",
                    "!dist/**"
                ],
                electronDownload: {
                    mirror: "https://npmmirror.com/mirrors/electron/"
                }
            },
            dependencies: {
                "fs-extra": "^11.2.0",
                "music-metadata": "^7.14.0"
            },
            devDependencies: {
                "electron": "^30.1.2",
                "electron-builder": "^24.13.3"
            },
            // 添加 npm 配置以避免 electron 下载问题
            "config": {
                "electron_mirror": "https://npmmirror.com/mirrors/electron/",
                "electron_custom_dir": "{{ version }}"
            }
        };

        // 处理应用图标：将用户选择的图标复制到 build-resources 并写入 build 配置
        const iconDir = window.path?.join ? window.path.join(outputPath, 'build-resources') : `${outputPath}/build-resources`;
        try {
            await window.electronAPI.ensureDir(iconDir);
        } catch {}

        const iconConfig = {};
        const copyIfSet = async (src, filename) => {
            if (!src) return null;
            try {
                const exists = await window.electronAPI.pathExists(src);
                if (!exists) return null;
                const dst = window.path?.join ? window.path.join(iconDir, filename) : `${iconDir}/${filename}`;
                await window.electronAPI.copyFile(src, dst);
                return `build-resources/${filename}`;
            } catch (e) {
                console.warn('复制图标失败:', src, e?.message || e);
                return null;
            }
        };

        const winIconRel = await copyIfSet(this.settings.windowsIcon, 'app-win.ico');
        const macIconRel = await copyIfSet(this.settings.macIcon, 'app-mac.icns');
        const linuxIconRel = await copyIfSet(this.settings.linuxIcon, 'app-linux.png');

        if (winIconRel) {
            iconConfig.win = { icon: winIconRel };
        }
        if (macIconRel) {
            iconConfig.mac = { icon: macIconRel };
        }
        if (linuxIconRel) {
            iconConfig.linux = { icon: linuxIconRel };
        }

        // 合并到 packageJson.build 中
        packageJson.build = {
            ...packageJson.build,
            ...iconConfig
        };

        // 根据用户选择的目标平台调整 electron-builder 的构建目标
        try {
            const tp = (this.settings && this.settings.targetPlatform) ? this.settings.targetPlatform : 'current';
            // 'current' -> 不做额外调整，使用默认 host 平台
            if (tp && tp !== 'current') {
                // 确保 build 对象存在
                packageJson.build = packageJson.build || {};
                if (tp === 'windows' || tp === 'all') {
                    packageJson.build.win = packageJson.build.win || {};
                    // 如果没有显式 target，默认使用 nsis（常用）
                    if (!packageJson.build.win.target) packageJson.build.win.target = ['nsis'];
                }
                if (tp === 'mac' || tp === 'all') {
                    packageJson.build.mac = packageJson.build.mac || {};
                    if (!packageJson.build.mac.target) packageJson.build.mac.target = ['dmg'];
                }
                if (tp === 'linux' || tp === 'all') {
                    packageJson.build.linux = packageJson.build.linux || {};
                    if (!packageJson.build.linux.target) packageJson.build.linux.target = ['AppImage'];
                }
            }
        } catch (e) {
            console.warn('[Packager] 设置目标平台到 package.json 时发生错误:', e?.message || e);
        }

        const packagePath = window.path?.join ? window.path.join(outputPath, 'package.json') : `${outputPath}/package.json`;
        await window.electronAPI.writeFile(packagePath, JSON.stringify(packageJson, null, 2));
    console.log('[Packager] 写入 package.json ->', packagePath);

        // 生成 .npmrc 文件配置 electron 镜像
        const npmrcContent = `electron_mirror=https://npmmirror.com/mirrors/electron/
electron_cache=./.electron-cache
registry=https://registry.npmmirror.com/
disturl=https://npmmirror.com/mirrors/node/
sass_binary_site=https://npmmirror.com/mirrors/node-sass/
phantomjs_cdnurl=https://npmmirror.com/mirrors/phantomjs/
electron_builder_binaries_mirror=https://npmmirror.com/mirrors/electron-builder-binaries/
sqlite3_binary_site=https://npmmirror.com/mirrors/sqlite3/
python_mirror=https://npmmirror.com/mirrors/python/
`;
        const npmrcPath = window.path?.join ? window.path.join(outputPath, '.npmrc') : `${outputPath}/.npmrc`;
        await window.electronAPI.writeFile(npmrcPath, npmrcContent);
        console.log('[Packager] 写入 .npmrc ->', npmrcPath);

        // 不再写入占位 main.js，避免显示乱码占位页

        // 生成游戏配置文件
        const gameConfig = {
            name: this.settings.packageName,
            version: this.settings.version,
            description: this.settings.description,
            author: this.settings.author,
            createdAt: new Date().toISOString(),
            packagedBy: 'ArtiMeow AI GalGame Maker',
            settings: this.currentProject?.settings || {}
        };

        const configPath = window.path?.join ? window.path.join(outputPath, 'game-config.json') : `${outputPath}/game-config.json`;
        await window.electronAPI.writeFile(configPath, JSON.stringify(gameConfig, null, 2));
        console.log('[Packager] 写入 game-config.json ->', configPath);
        console.groupEnd('[Packager] generateConfigFiles');
    }

    /**
     * 压缩打包
     */
    async compressPackage(outputPath) {
        // 调用主进程进行压缩
        const zipPath = `${outputPath}.zip`;
        await window.electronAPI.zipDirectory(outputPath, zipPath);
        return zipPath;
    }

    /**
     * 创建启动脚本
     */
    async createLaunchScript(outputPath) {
        const platform = await window.electronAPI.getPlatform();
        
        if (platform === 'win32') {
                // Windows批处理文件：优先运行 electron-builder 产物，其次 fallback 到开发运行
                const batchContent = `@echo off
    setlocal enabledelayedexpansion
    cd /d "%~dp0"

    REM 优先运行根 dist 解压版本 - 自动查找任意 exe
    set "UNPACKED_DIR=dist\\win-unpacked"
    if exist "%UNPACKED_DIR%" (
        for %%F in ("%UNPACKED_DIR%\\*.exe") do (
            set "APP_PATH=%%~fF"
            goto :FOUND_APP
        )
    )

    goto :CHECK_OLD

    :FOUND_APP
    if exist "%APP_PATH%" (
        echo Launching: %APP_PATH%
        start "" "%APP_PATH%" --preview-mode --project-dir="%cd%"
        goto :eof
    )

    :CHECK_OLD
    REM 兼容老位置（player 下）
    if exist "player\\dist\\win-unpacked\\ArtiMeow-Player.exe" (
        start "" "player\\dist\\win-unpacked\\ArtiMeow-Player.exe" --preview-mode --project-dir="%cd%"
        goto :eof
    )

    REM 若无构建产物，则使用开发模式启动
    npm install
    npm start

    pause`;
            
            const batchPath = window.path?.join ? window.path.join(outputPath, 'start.bat') : `${outputPath}/start.bat`;
            await window.electronAPI.writeFile(batchPath, batchContent);
            
        } else {
            // Unix shell脚本
            const shellContent = `#!/bin/bash
cd "$(dirname "$0")"
if [ -f "player/ArtiMeow-Player" ]; then
    ./player/ArtiMeow-Player --project-dir="$(pwd)"
else
    npm install
    npm start
fi`;
            
            const shellPath = window.path?.join ? window.path.join(outputPath, 'start.sh') : `${outputPath}/start.sh`;
            await window.electronAPI.writeFile(shellPath, shellContent);
            
            // 设置执行权限
            await window.electronAPI.chmodFile(shellPath, '755');
        }
    }

    /**
     * 清理打包目录工程文件：保留 dist/ 与启动脚本，其余尽量精简
     */
    async cleanupBuildFolder(rootPath) {
        try {
                            // 规则：保留根 dist 与启动脚本，其余全部清理
                            const keep = new Set(['dist', 'start.bat', 'start.sh']);
                            const entries = await window.electronAPI.fsReaddir(rootPath);
                            for (const name of entries) {
                                    if (keep.has(name)) continue;
                                    const full = window.path?.join ? window.path.join(rootPath, name) : `${rootPath}/${name}`;
                                    try { await window.electronAPI.deleteDirectory(full); } catch {}
                                    try { await window.electronAPI.deleteFile(full); } catch {}
                            }
        } catch (e) {
            console.warn('cleanupBuildFolder error:', e);
        }
    }

    /**
     * 显示打包完成对话框
     */
    showPackageComplete(progressModal, outputPath) {
        // 更新进度模态框
        const modalContent = progressModal.querySelector('.modal-content');
        modalContent.innerHTML = `
            <div class="modal-header">
                <h3><i class="fas fa-check-circle text-success"></i> 打包完成</h3>
            </div>
            <div class="modal-body">
                <div class="package-complete">
                    <p class="text-center"><strong>项目打包成功！</strong></p>
                    <div class="output-info">
                        <p><strong>项目名称:</strong> ${this.settings.packageName}</p>
                        <p><strong>版本号:</strong> ${this.settings.version}</p>
                        <p><strong>输出路径:</strong></p>
                        <div class="output-path">${outputPath}</div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-primary" id="open-output-folder">
                    <i class="fas fa-folder-open"></i> 打开输出目录
                </button>
                <button class="btn btn-secondary" id="close-complete">关闭</button>
            </div>
        `;

        // 绑定新的事件
        const openFolderBtn = progressModal.querySelector('#open-output-folder');
    // 移除测试运行按钮
        const closeBtn = progressModal.querySelector('#close-complete');

        openFolderBtn.addEventListener('click', async () => {
            // 使用 openPath 打开目录（非打开文件）
            try {
                await window.electronAPI.invoke('shell-open-path', outputPath);
            } catch {
                // 回退到 showItemInFolder
                try { window.electronAPI.showItemInFolder(outputPath); } catch {}
            }
        });

        const closeComplete = () => {
            progressModal.classList.remove('show');
            setTimeout(() => {
                if (progressModal.parentNode) {
                    document.body.removeChild(progressModal);
                }
            }, 200);
        };

        closeBtn.addEventListener('click', closeComplete);
    }

    /**
     * 测试打包结果
     */
    async testPackage(outputPath) {
        try {
            const platform = await window.electronAPI.getPlatform();
            const startScript = platform === 'win32' ? 'start.bat' : 'start.sh';
            const scriptPath = window.path?.join ? window.path.join(outputPath, startScript) : `${outputPath}/${startScript}`;
            
            if (await window.electronAPI.pathExists(scriptPath)) {
                await window.electronAPI.executeFile(scriptPath);
            } else {
                this.showAlert('测试失败', '找不到启动脚本', 'error');
            }
        } catch (error) {
            console.error('测试打包结果失败:', error);
            this.showAlert('测试失败', error.message, 'error');
        }
    }

    /**
     * 更新打包进度
     */
    updateProgress(modal, percentage, text, details) {
        const progressFill = modal.querySelector('.progress-fill');
        const progressText = modal.querySelector('.progress-text');
        const progressDetails = modal.querySelector('.progress-details');

        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }
        
        if (progressText) {
            progressText.textContent = text;
        }
        
        if (progressDetails && details != null) {
            // 追加状态行，不覆盖已有日志
            const line = `[${new Date().toLocaleTimeString()}] ${details}\n`;
            progressDetails.insertAdjacentText('beforeend', line);
            progressDetails.scrollTop = progressDetails.scrollHeight;
        }
    }

    /**
     * 加载项目信息
     */
    async loadProjectInfo(projectPath) {
        try {
            const projectFile = window.path?.join ? window.path.join(projectPath, 'project.json') : `${projectPath}/project.json`;
            const projectData = await window.electronAPI.readJsonFile(projectFile);
            this.currentProject = projectData;
        } catch (error) {
            console.error('加载项目信息失败:', error);
            // 如果无法读取 project.json，尝试用项目目录名作为项目名的回退
            try {
                const folderName = projectPath ? (window.path?.basename ? window.path.basename(projectPath) : projectPath.split(/[\\\/]/).pop()) : '未命名项目';
                this.currentProject = { name: folderName || '未命名项目', description: '', settings: {} };
            } catch (e) {
                this.currentProject = { name: '未命名项目', description: '', settings: {} };
            }
        }
    }

    /**
     * 获取播放器路径
     */
    getPlayerPath() {
        // 这里需要根据实际情况调整播放器路径
        // electronAPI.getAppPath 返回 Promise
        // 此函数同步使用时返回占位，真正复制在 bundlePlayer 中通过 await 处理
        return '';
    }

    /**
     * 获取当前项目路径
     */
    getCurrentProjectPath() {
        return window.projectPathManager ? window.projectPathManager.getCurrentProjectPath() : null;
    }

    /**
     * 显示提示信息
     */
    showAlert(title, message, type = 'info') {
        if (window.galGameUIController && typeof window.galGameUIController.showAlert === 'function') {
            window.galGameUIController.showAlert(title, message, type);
        } else {
            alert(`${title}: ${message}`);
        }
    }
}

// 全局初始化
window.projectPackager = new ProjectPackager();