/**
 * GalGame 资源管理器（统一实现）
 * - 单一导入逻辑，避免双重文件选择器
 * - 资源卡片底部显示文件名与类型
 * - 统一预览、删除、使用逻辑
 */
class GalGameAssetManager {
    constructor() {
        this.assets = new Map();
        this.currentCategory = 'all';
        this.searchTerm = '';
        this.selectedAssets = new Set();
        this.init();
    }

    // 统一获取项目路径
    getCurrentProjectPath() {
        if (window.projectPathManager?.getCurrentProjectPath) {
            const p = window.projectPathManager.getCurrentProjectPath();
            if (p) return p;
        }
        if (window.galGameUIController?.getCurrentProjectPath) {
            const p = window.galGameUIController.getCurrentProjectPath();
            if (p) return p;
        }
        return window.app?.currentProject?.path || window.appManager?.currentProject?.path || null;
    }

    init() {
        this.initEventListeners();
        this.initDragAndDrop();
        const p = this.getCurrentProjectPath();
        if (p) this.loadAssets();
        document.addEventListener('project:loaded', () => this.loadAssets());
        document.addEventListener('project:closed', () => { this.assets.clear(); this.refreshAssetGrid(); });
    }

    initEventListeners() {
        // 仅绑定一次导入按钮，避免重复弹窗
        const importBtn = document.getElementById('import-assets-btn');
        if (importBtn) importBtn.addEventListener('click', () => this.showImportDialog());

        // 搜索框
        const searchInput = document.getElementById('assets-search');
        if (searchInput) searchInput.addEventListener('input', (e) => this.searchAssets(e.target.value));

        // 分类标签（存在则绑定）
        const categories = document.querySelectorAll('.asset-categories .category, .category');
        categories.forEach(category => {
            category.addEventListener('click', () => {
                this.switchCategory(category.dataset.category);
                categories.forEach(c => c.classList?.remove('active'));
                category.classList?.add('active');
            });
        });
    }

    // 打开导入对话框
    async showImportDialog() {
        try {
            const projectPath = this.getCurrentProjectPath();
            if (!projectPath) return this.showError('请先打开一个项目后再导入资源');

            const result = await window.electronAPI.showOpenDialog({
                properties: ['openFile', 'multiSelections'],
                filters: [
                    { name: '所有支持的文件', extensions: ['jpg','jpeg','png','gif','webp','svg','mp3','wav','ogg','aac','mp4','webm','avi','ico','icns'] },
                    { name: '图片文件', extensions: ['jpg','jpeg','png','gif','webp','svg'] },
                    { name: '图标文件', extensions: ['ico','icns'] },
                    { name: '音频文件', extensions: ['mp3','wav','ogg','aac'] },
                    { name: '视频文件', extensions: ['mp4','webm','avi'] },
                    { name: '所有文件', extensions: ['*'] }
                ]
            });

            const filePaths = (result && !result.canceled && Array.isArray(result.filePaths)) ? result.filePaths : [];
            if (filePaths.length) await this.importFiles(filePaths);
        } catch (e) {
            console.error('[AssetManager] showImportDialog error:', e);
            this.showError('导入文件失败: ' + e.message);
        }
    }

    async importFiles(filePaths) {
        const progressContainer = document.getElementById('import-progress');
        const progressBar = document.getElementById('import-progress-bar');
        const progressText = document.getElementById('import-progress-text');
        if (progressContainer) progressContainer.style.display = 'block';
        try {
            for (let i = 0; i < filePaths.length; i++) {
                const filePath = filePaths[i];
                const fileName = this.getFileName(filePath);
                const progress = Math.round(((i + 1) / filePaths.length) * 100);
                if (progressBar) progressBar.style.width = `${progress}%`;
                if (progressText) progressText.textContent = `正在导入: ${fileName} (${i + 1}/${filePaths.length})`;
                await this.importSingleFile(filePath);
            }
            this.refreshAssetGrid();
            this.showSuccess(`成功导入 ${filePaths.length} 个文件`);
        } catch (e) {
            console.error('[AssetManager] importFiles error:', e);
            this.showError('导入过程中出错: ' + e.message);
        } finally {
            if (progressContainer) progressContainer.style.display = 'none';
        }
    }

    async importSingleFile(filePath) {
        const fileName = this.getFileName(filePath);
        const assetType = this.getAssetType(this.getFileExtension(fileName));

        // 冲突处理
        const existing = this.findAssetByName(fileName);
        if (existing) {
            const yes = await this.confirmOverwrite(fileName);
            if (!yes) return;
        }

        const targetAbsPath = await this.getTargetPath(fileName, assetType);
        await this.copyFile(filePath, targetAbsPath);
        const relativePath = `assets/${assetType}/${fileName}`.replace(/\\/g, '/');

        const assetInfo = {
            id: this.generateAssetId(),
            name: fileName,
            type: assetType,
            category: this.getDefaultCategory(assetType),
            path: relativePath,
            fullPath: targetAbsPath,
            originalPath: filePath,
            size: await this.getFileSize(targetAbsPath),
            created: new Date().toISOString(),
            tags: [],
            metadata: await this.extractMetadata(filePath, assetType)
        };
        this.assets.set(assetInfo.id, assetInfo);
    }

    // 刷新网格
    refreshAssetGrid() {
        const grid = document.getElementById('assets-grid');
        if (!grid) return;
        grid.innerHTML = '';
        const list = this.getFilteredAssets();
        if (!list.length) {
            grid.innerHTML = `
                <div class="assets-empty">
                    <i class="fas fa-folder-open"></i>
                    <p>没有找到资源</p>
                    <p class="text-muted">尝试导入一些资源文件</p>
                </div>`;
            return;
        }
        list.forEach(asset => grid.appendChild(this.createAssetElement(asset)));
    }

    // 卡片元素（文件名与类型在底部）
    createAssetElement(asset) {
        const el = document.createElement('div');
        el.className = 'asset-item';
        el.dataset.assetId = asset.id;
        el.draggable = true;

        const previewUrl = this.buildPreviewUrl(asset);
        const thumbnail = this.buildThumbnail(asset, previewUrl);

        el.innerHTML = `
            <div class="asset-content">
                ${thumbnail}
                <div class="asset-info">
                    <div class="asset-name" title="${asset.name}">${this.truncateFileName(asset.name, 20)}</div>
                    <div class="asset-meta">
                        <span class="asset-type">${this.getTypeLabel(asset.type)}</span>
                        <span class="asset-size">${this.formatFileSize(asset.size || 0)}</span>
                    </div>
                </div>
                <div class="asset-actions">
                    <button class="asset-action-btn preview-btn" title="预览"><i class="fas fa-eye"></i></button>
                    <button class="asset-action-btn use-btn" title="使用"><i class="fas fa-plus"></i></button>
                    <button class="asset-action-btn delete-btn" title="删除"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div class="asset-select"><input type="checkbox" class="asset-checkbox"></div>`;

        this.bindAssetEvents(el, asset);
        return el;
    }

    buildThumbnail(asset, previewUrl) {
        if (asset.type === 'image') {
            return `<div class="asset-thumbnail image">
                <img src="${previewUrl}" alt="${asset.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="asset-icon-fallback" style="display:none;"><i class="fas fa-image"></i></div>
            </div>`;
        }
        if (asset.type === 'icon') {
            return `<div class="asset-thumbnail other"><div class="asset-icon"><i class="fas fa-icons"></i></div></div>`;
        }
        if (asset.type === 'audio') return `<div class="asset-thumbnail audio"><div class="asset-icon"><i class="fas fa-music"></i></div></div>`;
        if (asset.type === 'video') return `<div class="asset-thumbnail video"><div class="asset-icon"><i class="fas fa-video"></i></div></div>`;
        return `<div class="asset-thumbnail other"><div class="asset-icon"><i class="fas fa-file"></i></div></div>`;
    }

    bindAssetEvents(el, asset) {
        el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', JSON.stringify(asset)); el.classList.add('dragging'); });
        el.addEventListener('dragend', () => el.classList.remove('dragging'));
        el.addEventListener('dblclick', () => this.previewAsset(asset));
        el.querySelector('.preview-btn')?.addEventListener('click', (e) => { e.stopPropagation(); this.previewAsset(asset); });
        el.querySelector('.use-btn')?.addEventListener('click', (e) => { e.stopPropagation(); this.useAsset(asset); });
        el.querySelector('.delete-btn')?.addEventListener('click', async (e) => { e.stopPropagation(); await this.deleteAsset(asset); });
        el.querySelector('.asset-checkbox')?.addEventListener('change', (e) => {
            if (e.target.checked) this.selectedAssets.add(asset.id); else this.selectedAssets.delete(asset.id);
            this.updateSelectionUI();
        });
    }

    // 预览 - 使用独立窗口
    async previewAsset(asset) {
        // 兼容传入ID或对象
        if (typeof asset === 'string') {
            const found = this.assets.get(asset);
            if (!found) {
                return this.showError('资源不存在');
            }
            asset = found;
        }

        const projectPath = this.getCurrentProjectPath();
        if (!projectPath) {
            this.showError('没有打开的项目');
            return;
        }

        try {
            // 构建完整资源路径
            let fullPath = asset.fullPath;
            if (!fullPath || !await window.electronAPI.pathExists(fullPath)) {
                fullPath = window.path?.join 
                    ? window.path.join(projectPath, 'assets', asset.name)
                    : `${projectPath}/assets/${asset.name}`;
            }

            // 准备资源信息
            const assetInfo = {
                ...asset,
                fullPath: fullPath,
                projectPath: projectPath
            };

            // 调用主进程创建预览窗口
            const result = await window.electronAPI.previewAsset(assetInfo);
            
            if (!result.success) {
                this.showError('预览失败: ' + result.error);
            }
        } catch (error) {
            console.error('预览资源失败:', error);
            this.showError('预览资源失败: ' + error.message);
        }
    }

    createPreviewContent(asset, url) {
        if (asset.type === 'image') return `<img src="${url}" alt="${asset.name}" style="max-width:100%; max-height:400px; object-fit:contain;">`;
        if (asset.type === 'audio') return `<div class="audio-preview"><div class="audio-icon"><i class="fas fa-music fa-4x"></i></div><audio controls style="width:100%; margin-top:20px;"><source src="${url}" type="audio/mpeg"><source src="${url}" type="audio/wav"><source src="${url}" type="audio/ogg">您的浏览器不支持音频播放</audio></div>`;
        if (asset.type === 'video') return `<video controls style="max-width:100%; max-height:400px;"><source src="${url}" type="video/mp4"><source src="${url}" type="video/webm">您的浏览器不支持视频播放</video>`;
        return `<div class="file-preview"><div class="file-icon"><i class="fas fa-file fa-4x"></i></div><p>无法预览此类型的文件</p></div>`;
    }

    // 使用资源
    async useAsset(asset) {
        try {
            if (asset.type === 'icon') {
                // 选择要设置的平台
                let choice = 3;
                try {
                    if (window.electronAPI?.showMessageBox) {
                        const res = await window.electronAPI.showMessageBox({
                            type: 'question',
                            buttons: ['Windows', 'macOS', 'Linux', '取消'],
                            cancelId: 3,
                            defaultId: 0,
                            message: '将此图标设为哪一平台的打包图标？',
                            detail: asset.name
                        });
                        choice = res?.response ?? 3;
                    }
                } catch {}
                if (choice === 3) return; // 取消

                const saved = localStorage.getItem('packageSettings');
                const settings = saved ? JSON.parse(saved) : {};

                if (choice === 0) settings.windowsIcon = asset.fullPath || asset.path;
                if (choice === 1) settings.macIcon = asset.fullPath || asset.path;
                if (choice === 2) settings.linuxIcon = asset.fullPath || asset.path;

                localStorage.setItem('packageSettings', JSON.stringify(settings));
                this.showSuccess(`已设为${['Windows','macOS','Linux'][choice]} 打包图标`);
                return;
            }
            if (asset.type === 'image' && window.galGameUIController?.addBackgroundElement) {
                window.galGameUIController.addBackgroundElement(asset.path);
                return this.showSuccess(`已添加背景图片: ${asset.name}`);
            }
            if (asset.type === 'audio' && window.galGameUIController?.addMusicElement) {
                window.galGameUIController.addMusicElement(asset.path);
                return this.showSuccess(`已添加背景音乐: ${asset.name}`);
            }
            if (window.galGameUIController?.addAssetToScene) {
                window.galGameUIController.addAssetToScene(asset);
                return this.showSuccess(`已添加资源: ${asset.name}`);
            }
            this.showInfo('暂不支持此类型资源的直接使用');
        } catch (e) {
            console.error('使用资源失败:', e);
            this.showError('使用资源失败: ' + e.message);
        }
    }

    // 删除资源
    async deleteAsset(asset) {
        const ok = confirm(`确定要删除资源 "${asset.name}" 吗？`);
        if (!ok) return;
        try {
            const projectPath = this.getCurrentProjectPath();
            const filePath = asset.fullPath || (projectPath ? `${projectPath}/${asset.path}` : asset.path);
            await window.electronAPI.deleteFile(filePath);
            this.assets.delete(asset.id);
            this.refreshAssetGrid();
            this.showSuccess(`资源 "${asset.name}" 删除成功`);
        } catch (e) {
            console.error('删除资源失败:', e);
            this.showError('删除资源失败: ' + e.message);
        }
    }

    // 过滤
    getFilteredAssets() {
        let arr = Array.from(this.assets.values());
        if (this.currentCategory && this.currentCategory !== 'all') arr = arr.filter(a => a.type === this.currentCategory || a.category === this.currentCategory);
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            arr = arr.filter(a => a.name.toLowerCase().includes(term) || a.tags?.some(t => t.toLowerCase().includes(term)));
        }
        return arr.sort((a,b) => a.name.localeCompare(b.name));
    }
    switchCategory(category) { this.currentCategory = category; this.refreshAssetGrid(); }
    searchAssets(term) { this.searchTerm = term || ''; this.refreshAssetGrid(); }

    // 拖拽导入
    initDragAndDrop() {
        const panel = document.getElementById('assets-panel');
        if (!panel) return;
        panel.addEventListener('dragover', (e) => { e.preventDefault(); panel.classList.add('drag-over'); });
        panel.addEventListener('dragleave', (e) => { if (!panel.contains(e.relatedTarget)) panel.classList.remove('drag-over'); });
        panel.addEventListener('drop', async (e) => {
            e.preventDefault(); panel.classList.remove('drag-over');
            const files = Array.from(e.dataTransfer.files || []);
            if (files.length) await this.importFiles(files.map(f => f.path));
        });
    }

    // 构造预览URL
    buildPreviewUrl(asset) {
        if (window.projectPathManager) {
            const abs = window.projectPathManager.buildAssetPath(asset.path || asset.fullPath || '');
            return window.projectPathManager.toFileUrl(abs || asset.fullPath || asset.path || '');
        }
        const projectPath = this.getCurrentProjectPath();
        const p = asset.path || asset.fullPath || '';
        if (!p) return '';
        if (typeof p === 'string' && p.startsWith('file://')) return p;
        if (/^[a-zA-Z]:\\|^[a-zA-Z]:\//.test(p) || p.startsWith('/')) {
            const norm = p.replace(/\\/g, '/');
            return `file://${norm.startsWith('/') ? '' : '/'}${norm}`;
        }
        const combined = (projectPath ? `${projectPath}/${p}` : p).replace(/\\/g, '/');
        return `file://${combined.startsWith('/') ? '' : '/'}${combined}`;
    }

    // 基础工具
    getFileName(filePath) { return (filePath || '').split(/[\\/]/).pop(); }
    getFileExtension(fileName) { return (fileName || '').split('.').pop().toLowerCase(); }
    getAssetType(ext) { const img=['jpg','jpeg','png','gif','webp','svg']; const aud=['mp3','wav','ogg','aac']; const vid=['mp4','webm','avi']; const ico=['ico','icns']; return img.includes(ext)?'image':aud.includes(ext)?'audio':vid.includes(ext)?'video':ico.includes(ext)?'icon':'other'; }
    getDefaultCategory(t) { return ({ image:'backgrounds', audio:'music', video:'videos', icon:'icons' }[t]) || 'other'; }
    getTypeLabel(t) { return ({ image:'图片', audio:'音频', video:'视频', icon:'图标', other:'其他' }[t]) || '未知'; }
    formatFileSize(bytes) { if (!bytes) return '0 B'; const k=1024, sizes=['B','KB','MB','GB']; const i=Math.floor(Math.log(bytes)/Math.log(k)); return parseFloat((bytes/Math.pow(k,i)).toFixed(1))+' '+sizes[i]; }
    async ensureDirectory(dirPath) { try { await window.electronAPI.ensureDir(dirPath); } catch(e){ console.error('创建目录失败:', e); } }
    async copyFile(src, dst) { try { await window.electronAPI.copyFile(src, dst); } catch(e){ console.error('复制文件失败:', e); throw e; } }
    async getFileSize(p) { try { const s = await window.electronAPI.getFileStats(p); return s?.size || 0; } catch { return 0; } }
    async getTargetPath(fileName, assetType) {
        const projectPath = this.getCurrentProjectPath(); if (!projectPath) throw new Error('没有打开的项目');
        const assetsDir = window.path?.join ? window.path.join(projectPath, 'assets') : `${projectPath}/assets`;
        const typeDir = window.path?.join ? window.path.join(assetsDir, assetType) : `${assetsDir}/${assetType}`;
        await this.ensureDirectory(typeDir);
        return window.path?.join ? window.path.join(typeDir, fileName) : `${typeDir}/${fileName}`;
    }
    async extractMetadata(filePath, assetType) {
        const metadata = { imported: new Date().toISOString() };
        const toFileUrl = (p) => { if (!p) return ''; if (p.startsWith('file://')) return p; const norm = p.replace(/\\/g,'/'); return norm.match(/^[a-zA-Z]:\//) ? `file:///${norm}` : `file://${norm.startsWith('/')?'':'/'}${norm}`; };
        try {
            if (assetType === 'image') {
                if (window.electronAPI?.getImageInfo) {
                    const info = await window.electronAPI.getImageInfo(filePath); Object.assign(metadata, { width: info.width, height: info.height, format: info.format });
                } else {
                    metadata.format = this.getFileExtension(this.getFileName(filePath));
                    await new Promise((resolve)=>{ const img=new Image(); let done=false; const finish=()=>{ if(!done){done=true; resolve();}}; img.onload=()=>{ metadata.width=img.naturalWidth; metadata.height=img.naturalHeight; finish();}; img.onerror=finish; img.src=toFileUrl(filePath); setTimeout(finish,2000);});
                }
            } else if (assetType === 'audio') {
                if (window.electronAPI?.getAudioInfo) {
                    const info = await window.electronAPI.getAudioInfo(filePath); Object.assign(metadata, { duration: info.duration, bitrate: info.bitrate, format: info.format });
                } else {
                    metadata.format = this.getFileExtension(this.getFileName(filePath));
                    await new Promise((resolve)=>{ const a=document.createElement('audio'); let done=false; const finish=()=>{ if(!done){done=true; resolve();}}; a.addEventListener('loadedmetadata', ()=>{ metadata.duration=a.duration; finish();}); a.addEventListener('error', finish); a.src=toFileUrl(filePath); setTimeout(finish,2000);});
                }
            }
        } catch (e) { console.warn('提取元数据失败:', e?.message); }
        return metadata;
    }

    // 目录扫描与注册
    async loadAssets() {
        try {
            const projectPath = this.getCurrentProjectPath();
            if (!projectPath) return;
            const assetsPath = window.path?.join ? window.path.join(projectPath, 'assets') : `${projectPath}/assets`;
            const exists = await window.electronAPI.pathExists(assetsPath);
            if (!exists) { await this.ensureDirectory(assetsPath); this.refreshAssetGrid(); return; }
            const files = await this.scanAssetDirectory(assetsPath);
            this.assets.clear();
            for (const f of files) await this.registerExistingAsset(f);
            this.refreshAssetGrid();
        } catch (e) { console.error('加载资源失败:', e); }
    }
    async scanAssetDirectory(dirPath) { try { return await window.electronAPI.scanDirectory(dirPath, { recursive:true, includeFiles:true, includeDirs:false }); } catch { return []; } }
    async registerExistingAsset(filePath) {
        const fileName = this.getFileName(filePath);
        const assetType = this.getAssetType(this.getFileExtension(fileName));
        const projectPath = this.getCurrentProjectPath();
        let relativePath = filePath;
        try {
            const normProject = (projectPath||'').replace(/\\/g,'/');
            const normFile = (filePath||'').replace(/\\/g,'/');
            if (normProject && normFile.startsWith(normProject + '/')) relativePath = normFile.substring(normProject.length + 1);
        } catch {}
        const assetInfo = {
            id: this.generateAssetId(),
            name: fileName,
            type: assetType,
            category: this.getDefaultCategory(assetType),
            path: relativePath,
            fullPath: filePath,
            size: await this.getFileSize(filePath),
            created: new Date().toISOString(),
            tags: [],
            metadata: await this.extractMetadata(filePath, assetType)
        };
        this.assets.set(assetInfo.id, assetInfo);
    }

    // 杂项
    generateAssetId() { return `asset_${Date.now()}_${Math.random().toString(36).substr(2,9)}`; }
    findAssetByName(name) { for (const a of this.assets.values()) if (a.name === name) return a; return null; }
    async confirmOverwrite(fileName) { if (window.electronAPI?.showMessageBox) { const r = await window.electronAPI.showMessageBox({ type:'question', buttons:['覆盖','取消'], defaultId:0, message:`文件 "${fileName}" 已存在，是否覆盖？`}); return r?.response === 0; } return confirm(`文件 "${fileName}" 已存在，是否覆盖？`); }
    truncateFileName(fn, max) { if (!fn || fn.length <= max) return fn; const ext = fn.split('.').pop(); const base = fn.substring(0, fn.lastIndexOf('.')); return `${base.substring(0, max - ext.length - 4)}....${ext}`; }
    updateSelectionUI() { const n = this.selectedAssets.size; const el = document.getElementById('selection-info'); if (el) el.textContent = n>0 ? `已选择 ${n} 个资源` : ''; if (el) el.style.display = n>0 ? 'block' : 'none'; }
    showSuccess(msg){ if (window.galGameUIController?.showToast) window.galGameUIController.showToast(msg,'success'); else console.log('SUCCESS:', msg);}    
    showError(msg){ if (window.galGameUIController?.showAlert) window.galGameUIController.showAlert('错误', msg, 'error'); else console.error('ERROR:', msg);}    
    showInfo(msg){ if (window.galGameUIController?.showToast) window.galGameUIController.showToast(msg,'info'); else console.log('INFO:', msg);}    
}

// 全局实例
window.galGameAssetManager = new GalGameAssetManager();
