// 发布设置模块（基础占位实现）
(function(){
  class PublishSettings {
    constructor() {
      this.rootRel = 'distinfo/files';
      this.settingsRel = 'distinfo/settings.json';
      this.currentFile = null;
      this.initialized = false;
      this.aboutMode = 'builtin';
      this.initWhenReady();
    }

    initWhenReady() {
      document.addEventListener('DOMContentLoaded', () => this.init());
    }

    async init() {
      if (this.initialized) return;
      this.cacheDom();
      this.bindEvents();
      this.initialized = true;
      // 若切到发布页或项目加载后，刷新文件树
      document.addEventListener('project:loaded', () => this.refreshAll());
      this.observeTabSwitch();
    }

    cacheDom() {
      this.initBtn = document.getElementById('publish-init-structure');
      this.openEditorBtn = document.getElementById('publish-open-editor');
      this.licenseStatusEl = document.getElementById('license-status');
      this.licenseUploadBtn = document.getElementById('license-upload-btn');
      this.licenseRemoveBtn = document.getElementById('license-remove-btn');
      this.modeSelect = document.getElementById('about-mode');
    }

    bindEvents() {
      this.initBtn?.addEventListener('click', () => this.ensureStructure());
      this.openEditorBtn?.addEventListener('click', async () => {
        // 避免重复点击与无项目情况下“无反应”
        if (this.openEditorBtn.disabled) {
          this.toast('当前为内置模式或正在处理，请稍后或切换为自定义模式', 'warning')
          return;
        }
        const project = this.getProjectRoot();
        if (!project) { this.toast('没有打开的项目', 'error'); return; }
        try {
          this.openEditorBtn.disabled = true;
          await this.launchExternalEditor();
        } finally {
          // 确保状态恢复；自定义模式才可再次启用
          const disabled = (this.aboutMode !== 'custom');
          this.openEditorBtn.disabled = disabled;
        }
      });
      this.licenseUploadBtn?.addEventListener('click', () => this.uploadLicense());
      this.licenseRemoveBtn?.addEventListener('click', () => this.removeLicense());
      this.modeSelect?.addEventListener('change', (e)=> this.onModeChanged(e.target.value));
    }

    observeTabSwitch() {
      const tabs = document.querySelectorAll('.tab[data-tab]');
      tabs.forEach(tab => tab.addEventListener('click', () => {
        if (tab.dataset.tab === 'publish') {
          this.refreshAll();
        }
      }));
    }

    getProjectRoot() {
      try { return window.projectPathManager?.getCurrentProjectPath(); } catch { return null; }
    }

    buildPath(...segments) {
      const root = this.getProjectRoot();
      if (!root) return null;
      const joined = [root, ...segments]
        .join('/')
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/');
      return joined;
    }

    async ensureStructure() {
      const project = this.getProjectRoot();
      if (!project) return this.toast('没有打开的项目', 'error');
      const dir = this.buildPath(this.rootRel);
      try {
        // 二级确认：首次确认（原生消息框）
        const c1 = await window.electronAPI.invoke('show-message-box', {
          type: 'question',
          title: '确认创建发布目录',
          message: '将创建/校验 distinfo/files 及默认 about.html/css',
          buttons: ['是','否'],
          defaultId: 0,
          cancelId: 1
        }).catch(()=>null)
        if (!c1 || c1.response !== 0) return;
        // 如果已存在，提示不会覆盖现有文件
        const exists = await window.electronAPI.pathExists(dir)
        if (exists) {
          const c2 = await window.electronAPI.invoke('show-message-box', {
            type: 'question',
            title: '目录已存在',
            message: '目录已存在：将仅补全缺失文件，不覆盖现有内容',
            buttons: ['继续','取消'],
            defaultId: 0,
            cancelId: 1
          }).catch(()=>null)
          if (!c2 || c2.response !== 0) return;
        }
        await window.electronAPI.ensureDir(dir);
        // 初始化建议文件
        const aboutHtml = this.buildPath(this.rootRel, 'about.html');
        const aboutCss = this.buildPath(this.rootRel, 'about.css');
        if (!(await window.electronAPI.pathExists(aboutHtml))) {
          await window.electronAPI.writeFile(aboutHtml, '<!doctype html><html><head><meta charset="utf-8"><title>关于</title><link rel="stylesheet" href="about.css"></head><body><div class="container">自定义关于内容</div></body></html>');
        }
        if (!(await window.electronAPI.pathExists(aboutCss))) {
          await window.electronAPI.writeFile(aboutCss, '/* about.css */\n');
        }
        this.toast('发布目录已就绪');
        await this.refreshAll();
        await this.saveSettingsJson();
      } catch (e) {
        console.error(e);
        this.toast('初始化目录失败: ' + e.message, 'error');
      }
    }

    async refreshAll() {
      this.loadMode();
      await this.refreshLicenseStatus();
      await this.saveSettingsJson();
    }

    updatePreview() { /* 无内嵌预览 */ }

    async refreshLicenseStatus() {
      const lic = this.buildPath(this.rootRel, 'LICENSE');
      const exists = !!(await window.electronAPI.pathExists(lic));
      this.licenseStatusEl && (this.licenseStatusEl.textContent = exists ? '已设置（LICENSE）' : '未设置');
      this.licenseRemoveBtn && (this.licenseRemoveBtn.style.display = exists ? 'inline-flex' : 'none');
    }

    async uploadLicense() {
      const project = this.getProjectRoot();
      if (!project) return this.toast('没有打开的项目', 'error');
      const result = await window.electronAPI.showOpenDialog({
        title: '选择许可证文件', properties: ['openFile'],
        filters: [{ name: '文本', extensions: ['txt','md','text',''] }]
      });
      if (result?.canceled) return;
      const filePath = result.filePaths?.[0];
      if (!filePath) return;
      try {
        const dest = this.buildPath(this.rootRel, 'LICENSE');
        await window.electronAPI.ensureDir(this.buildPath(this.rootRel));
        await window.electronAPI.copyFile(filePath, dest);
        await this.refreshLicenseStatus();
        await this.saveSettingsJson();
        this.toast('许可证已上传');
      } catch (e) {
        this.toast('上传失败: ' + e.message, 'error');
      }
    }

    async removeLicense() {
      try {
        const dest = this.buildPath(this.rootRel, 'LICENSE');
        await window.electronAPI.deleteFile(dest);
        await this.refreshLicenseStatus();
        await this.saveSettingsJson();
        this.toast('许可证已移除');
      } catch (e) {
        this.toast('移除失败: ' + e.message, 'error');
      }
    }

    onModeChanged(val) {
      this.aboutMode = val === 'custom' ? 'custom' : 'builtin';
      localStorage.setItem('publish.aboutMode', this.aboutMode);
      // 自定义模式时建议初始化目录
      if (this.aboutMode === 'custom') {
        this.ensureStructure();
      }
      // 控制按钮是否可用
      const disabled = (this.aboutMode !== 'custom');
      if (this.openEditorBtn) this.openEditorBtn.disabled = disabled;
      if (this.initBtn) this.initBtn.disabled = false; // 初始化目录始终可用
      this.saveSettingsJson();
    }

    loadMode() {
      const saved = localStorage.getItem('publish.aboutMode');
      if (saved) this.aboutMode = saved;
      if (this.modeSelect) this.modeSelect.value = this.aboutMode;
      const disabled = (this.aboutMode !== 'custom');
      if (this.openEditorBtn) this.openEditorBtn.disabled = disabled;
    }

    async saveSettingsJson() {
      // 将基础设置写入 distinfo/settings.json
      const project = this.getProjectRoot();
      if (!project) return;
      const rootDir = this.buildPath('distinfo');
      const settingsPath = this.buildPath(this.settingsRel);
      try {
        await window.electronAPI.ensureDir(rootDir);
        const hasLic = await window.electronAPI.pathExists(this.buildPath(this.rootRel, 'LICENSE'));
        const payload = {
          aboutMode: this.aboutMode,
          license: hasLic ? 'present' : 'absent'
        };
        await window.electronAPI.writeJsonFile(settingsPath, payload);
      } catch (e) {
        console.warn('[publish] 写入 settings.json 失败:', e?.message||e);
      }
    }

    async launchExternalEditor() {
      if (this.aboutMode !== 'custom') {
        return this.toast('当前为内置模式，请先切换到自定义模式', 'warning');
      }
      const root = this.buildPath(this.rootRel);
      if (!root) return this.toast('没有打开的项目', 'error');
      try {
        // 打开独立进程的外部编辑器窗口
        const res = await window.electronAPI.invoke('open-publish-editor', { root });
        if (!res || res.success !== true) throw new Error(res?.error || '无法打开外部编辑器');
        this.toast('已打开外部编辑器');
      } catch (e) {
        console.error(e);
        this.toast('打开外部编辑器失败: ' + e.message, 'error');
      }
    }

    toast(msg, type) {
      if (window.app?.showToast) return window.app.showToast(msg, type || 'info');
      console.log('[publish]', type || 'info', msg);
    }
  }

  window.publishSettings = new PublishSettings();
})();
