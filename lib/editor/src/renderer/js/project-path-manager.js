/**
 * 项目路径管理器
 * 统一管理项目路径，避免各组件重复获取逻辑
 */

class ProjectPathManager {
    constructor() {
        this.currentProjectPath = null;
        this.currentProject = null;
        this.listeners = new Set();
        this.initEventListeners();
        console.log('[ProjectPathManager] 项目路径管理器初始化');
    }

    /**
     * 初始化事件监听
     */
    initEventListeners() {
        // 监听项目加载事件
        document.addEventListener('project:loaded', (event) => {
            const { projectPath, project } = event.detail || {};
            this.setCurrentProject(projectPath, project);
        });

        // 监听项目关闭事件
        document.addEventListener('project:closed', () => {
            this.clearCurrentProject();
        });

        // 定期检查项目状态同步
        this.checkInterval = setInterval(() => {
            this.syncProjectState();
        }, 2000);
    }

    /**
     * 设置当前项目
     */
    setCurrentProject(projectPath, project) {
        if (!projectPath) {
            console.warn('[ProjectPathManager] 尝试设置空的项目路径');
            return;
        }

        const oldPath = this.currentProjectPath;
        this.currentProjectPath = projectPath;
        this.currentProject = project || null;

        console.log('[ProjectPathManager] 项目路径已设置:', projectPath);

        // 同步到其他组件
        this.syncToComponents();

        // 通知监听器
        if (oldPath !== projectPath) {
            this.notifyListeners({
                type: 'project-changed',
                oldPath,
                newPath: projectPath,
                project: this.currentProject
            });
        }
    }

    /**
     * 清除当前项目
     */
    clearCurrentProject() {
        const oldPath = this.currentProjectPath;
        this.currentProjectPath = null;
        this.currentProject = null;

        console.log('[ProjectPathManager] 项目路径已清除');

        // 同步到其他组件
        this.syncToComponents();

        // 通知监听器
        this.notifyListeners({
            type: 'project-cleared',
            oldPath,
            newPath: null,
            project: null
        });
    }

    /**
     * 获取当前项目路径
     */
    getCurrentProjectPath() {
        return this.currentProjectPath;
    }

    /**
     * 获取当前项目信息
     */
    getCurrentProject() {
        return this.currentProject;
    }

    /**
     * 检查是否有打开的项目
     */
    hasOpenProject() {
        return !!this.currentProjectPath;
    }

    /**
     * 同步项目状态（从其他组件获取最新状态）
     */
    syncProjectState() {
        // 如果当前没有项目路径，尝试从其他组件获取
        if (!this.currentProjectPath) {
            let foundPath = null;
            let foundProject = null;

            // 优先从 window.app 获取
            if (window.app?.currentProject?.path) {
                foundPath = window.app.currentProject.path;
                foundProject = window.app.currentProject;
            }
            // 其次从 window.appManager 获取
            else if (window.appManager?.currentProject?.path) {
                foundPath = window.appManager.currentProject.path;
                foundProject = window.appManager.currentProject;
            }
            // 再从 galGameUIController 获取
            else if (window.galGameUIController?.currentProjectPath) {
                foundPath = window.galGameUIController.currentProjectPath;
            }

            if (foundPath && foundPath !== this.currentProjectPath) {
                console.log('[ProjectPathManager] 从其他组件同步项目路径:', foundPath);
                this.setCurrentProject(foundPath, foundProject);
            }
        }
    }

    /**
     * 同步到其他组件
     */
    syncToComponents() {
        // 同步到 galGameUIController
        if (window.galGameUIController) {
            window.galGameUIController.currentProjectPath = this.currentProjectPath;
            if (typeof window.galGameUIController.setCurrentProjectPath === 'function') {
                window.galGameUIController.setCurrentProjectPath(this.currentProjectPath);
            }
        }

        // 同步到其他可能的组件
        if (window.assetLibraryManager && typeof window.assetLibraryManager.onProjectChanged === 'function') {
            window.assetLibraryManager.onProjectChanged(this.currentProjectPath, this.currentProject);
        }
    }

    /**
     * 添加监听器
     */
    addListener(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * 通知所有监听器
     */
    notifyListeners(event) {
        this.listeners.forEach(callback => {
            try {
                callback(event);
            } catch (error) {
                console.error('[ProjectPathManager] 监听器执行失败:', error);
            }
        });
    }

    /**
     * 构建项目相对路径
     */
    buildProjectPath(...segments) {
        if (!this.currentProjectPath) {
            throw new Error('没有打开的项目');
        }
        return this.normalizePath([this.currentProjectPath, ...segments].join('/'));
    }

    /**
     * 构建资源路径
     */
    buildAssetPath(relativePath) {
        if (!relativePath) return null;

        // 已是 file:// URL
        if (this.isFileUrl(relativePath)) return relativePath;

        // 如果是绝对路径（Windows 或 POSIX），直接规范化返回
        if (this.isAbsolutePath(relativePath)) return this.normalizePath(relativePath);

        // 必须有当前项目路径
        if (!this.currentProjectPath) return null;

        // 去掉开头的 ./ 或 /，避免重复
        let cleanPath = String(relativePath).replace(/^\.+[\/]+/, '').replace(/^\/+/, '');

        // 如果相对路径错误地包含了项目路径片段，去重
        const normProj = this.normalizePath(this.currentProjectPath);
        const normRel = this.normalizePath(relativePath);
        if (normRel.startsWith(normProj + '/')) {
            cleanPath = normRel.substring(normProj.length + 1);
        }

        return this.normalizePath(`${normProj}/${cleanPath}`);
    }

    /**
     * 将本地路径转换为 file:/// URL（不会重复前缀）
     */
    toFileUrl(p) {
        if (!p) return null;
        if (this.isFileUrl(p)) return p;
        const norm = this.normalizePath(p);
        // 处理 Windows 盘符
        const urlPath = norm.replace(/^([a-zA-Z]):\//, '/$1:/');
        return encodeURI(`file://${urlPath.startsWith('/') ? '' : '/'}${urlPath}`);
    }

    /** 规范化路径为正斜杠且去掉重复斜杠 */
    normalizePath(p) {
        return String(p).replace(/\\/g, '/').replace(/\/+/g, '/');
    }

    /** 是否为绝对路径（Windows 或 POSIX） */
    isAbsolutePath(p) {
        const s = String(p);
        return /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(s);
    }

    /** 是否为 file:// URL */
    isFileUrl(p) {
        return /^file:\/\//i.test(String(p));
    }

    /**
     * 销毁管理器
     */
    destroy() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        this.listeners.clear();
        console.log('[ProjectPathManager] 项目路径管理器已销毁');
    }
}

// 创建全局实例
window.projectPathManager = new ProjectPathManager();

// 导出供其他模块使用
window.ProjectPathManager = ProjectPathManager;

console.log('[ProjectPathManager] 全局项目路径管理器已创建');