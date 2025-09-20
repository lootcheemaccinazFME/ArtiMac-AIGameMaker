/**
 * 角色和设定管理器
 */
class CharacterManager {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.characters = [];
    this.settings = [];
    this.currentCharacter = null;
    this.currentSetting = null;
    this.currentTab = 'characters';
    // 仅在角色管理模态框内操作，避免与编辑面板的重复ID冲突
    this.root = document.getElementById('character-management-modal');
    this.qs = (sel) => (this.root ? this.root.querySelector(sel) : document.querySelector(sel));
    this.qsa = (sel) => (this.root ? this.root.querySelectorAll(sel) : document.querySelectorAll(sel));
    
    this.initEventListeners();
  }

  /**
   * 初始化事件监听器
   */
  initEventListeners() {
    // 标签切换
    this.qsa('.character-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabName = e.currentTarget.dataset.tab;
        this.switchTab(tabName);
      });
    });

    // 新建角色按钮
    const addCharacterBtn = this.qs('#add-character-btn');
    if (addCharacterBtn) {
      addCharacterBtn.addEventListener('click', () => {
        this.createNewCharacter();
      });
    }

    // 新建设定按钮
    const addSettingBtn = this.qs('#add-setting-btn');
    if (addSettingBtn) {
      addSettingBtn.addEventListener('click', () => {
        this.createNewSetting();
      });
    }

    // 保存按钮
    const saveBtn = this.qs('#save-character-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.saveCurrentItem();
      });
    }

    // 删除按钮
    const deleteBtn = this.qs('#delete-character-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        this.deleteCurrentItem();
      });
    }
  }

  /**
   * 切换标签
   */
  switchTab(tabName) {
    this.currentTab = tabName;
    
    // 更新标签样式
    this.qsa('.character-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    const activeTab = this.qs(`[data-tab="${tabName}"]`);
    if (activeTab) activeTab.classList.add('active');
    
    // 更新内容显示
    this.qsa('.character-tab-content').forEach(content => {
      content.classList.remove('active');
    });
    const contentEl = this.qs(`#${tabName}-content`);
    if (contentEl) contentEl.classList.add('active');
    
    // 清空编辑器
    this.clearEditor();
  }

  /**
   * 加载数据
   */
  async loadData() {
    try {
      console.log('开始加载角色设定数据，项目路径:', this.projectPath);
      
      // 确保characters目录存在
      await this.ensureCharactersDirectory();
      
      const charactersPath = `${this.projectPath}/characters/characters.json`;
            const settingsPath = `${this.projectPath}/characters/settings.json`;
      
      // 加载角色数据
      try {
        console.log('尝试读取角色文件:', charactersPath);
        const charactersResult = await window.electronAPI.readFile(charactersPath);
        if (charactersResult.success) {
          this.characters = JSON.parse(charactersResult.content);
          console.log('角色数据加载成功，数量:', this.characters.length);
        } else {
          console.log('角色文件不存在，初始化为空数组');
          this.characters = [];
        }
      } catch (error) {
        console.log('读取角色文件失败，初始化为空数组:', error);
        this.characters = [];
      }
      
      // 加载设定数据
      try {
        console.log('尝试读取设定文件:', settingsPath);
        const settingsResult = await window.electronAPI.readFile(settingsPath);
        if (settingsResult.success) {
          this.settings = JSON.parse(settingsResult.content);
          console.log('设定数据加载成功，数量:', this.settings.length);
        } else {
          console.log('设定文件不存在，初始化为空数组');
          this.settings = [];
        }
      } catch (error) {
        console.log('读取设定文件失败，初始化为空数组:', error);
        this.settings = [];
      }
      
      this.renderLists();
    } catch (error) {
      console.error('加载角色设定数据失败:', error);
    }
  }

  /**
   * 确保characters目录存在
   */
  async ensureCharactersDirectory() {
    try {
      const charactersPath = `${this.projectPath}/characters`;
      const result = await window.electronAPI.createDirectory(charactersPath);
      if (!result.success) {
        console.error('创建characters目录失败:', result.error);
      }
    } catch (error) {
      console.error('创建characters目录失败:', error);
    }
  }

  /**
   * 渲染列表
   */
  renderLists() {
    this.renderCharacterList();
    this.renderSettingList();
  }

  /**
   * 渲染角色列表
   */
  renderCharacterList() {
    const list = this.qs('#character-list');
    if (!list) return;
    
    if (this.characters.length === 0) {
      list.innerHTML = '<div class="empty-list">暂无角色</div>';
      return;
    }
    
    list.innerHTML = this.characters.map((character, index) => `
      <div class="character-item" data-index="${index}" data-type="character">
        <div class="character-name">${character.name}</div>
        <div class="character-preview">${character.bio ? character.bio.substring(0, 50) + '...' : '暂无描述'}</div>
      </div>
    `).join('');
    
    // 添加点击事件
    list.querySelectorAll('.character-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        this.selectCharacter(index);
      });
    });
  }

  /**
   * 渲染设定列表
   */
  renderSettingList() {
    const list = this.qs('#setting-list');
    if (!list) return;
    
    if (this.settings.length === 0) {
      list.innerHTML = '<div class="empty-list">暂无设定</div>';
      return;
    }
    
    list.innerHTML = this.settings.map((setting, index) => `
      <div class="character-item" data-index="${index}" data-type="setting">
        <div class="character-name">${setting.name}</div>
        <div class="character-preview">${setting.content ? setting.content.substring(0, 50) + '...' : '暂无内容'}</div>
      </div>
    `).join('');
    
    // 添加点击事件
    list.querySelectorAll('.character-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        this.selectSetting(index);
      });
    });
  }

  /**
   * 选择角色
   */
  selectCharacter(index) {
    this.currentCharacter = this.characters[index];
    this.currentSetting = null;
    this.showCharacterEditor();
  }

  /**
   * 选择设定
   */
  selectSetting(index) {
    this.currentSetting = this.settings[index];
    this.currentCharacter = null;
    this.showSettingEditor();
  }

  /**
   * 显示角色编辑器
   */
  showCharacterEditor() {
    // 隐藏其他表单
    const settingForm = this.qs('#setting-form');
    const emptyEl = this.qs('#character-editor-empty');
    if (settingForm) settingForm.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'none';
    
    // 显示角色表单
    const charForm = this.qs('#character-form');
    if (charForm) charForm.style.display = 'block';
    
    // 填充数据
    if (this.currentCharacter) {
      const nameEl = this.qs('#character-name');
      const bioEl = this.qs('#character-bio');
      const titleEl = this.qs('#character-editor-title');
      if (nameEl) nameEl.value = this.currentCharacter.name || '';
      if (bioEl) bioEl.value = this.currentCharacter.bio || '';
      if (titleEl) titleEl.textContent = `编辑角色: ${this.currentCharacter.name}`;
    }
    
    // 显示操作按钮
    const saveBtn = this.qs('#save-character-btn');
    const delBtn = this.qs('#delete-character-btn');
    if (saveBtn) saveBtn.style.display = 'inline-block';
    if (delBtn) delBtn.style.display = 'inline-block';
  }

  /**
   * 显示设定编辑器
   */
  showSettingEditor() {
    // 隐藏其他表单
    const charForm = this.qs('#character-form');
    const emptyEl = this.qs('#character-editor-empty');
    if (charForm) charForm.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'none';
    
    // 显示设定表单
    const settingForm = this.qs('#setting-form');
    if (settingForm) settingForm.style.display = 'block';
    
    // 填充数据
    if (this.currentSetting) {
      const nameEl = this.qs('#setting-name');
      const contentEl = this.qs('#setting-content');
      const titleEl = this.qs('#character-editor-title');
      if (nameEl) nameEl.value = this.currentSetting.name || '';
      if (contentEl) contentEl.value = this.currentSetting.content || '';
      if (titleEl) titleEl.textContent = `编辑设定: ${this.currentSetting.name}`;
    }
    
    // 显示操作按钮
    const saveBtn = this.qs('#save-character-btn');
    const delBtn = this.qs('#delete-character-btn');
    if (saveBtn) saveBtn.style.display = 'inline-block';
    if (delBtn) delBtn.style.display = 'inline-block';
  }

  /**
   * 清空编辑器
   */
  clearEditor() {
    const charForm = this.qs('#character-form');
    const settingForm = this.qs('#setting-form');
    const emptyEl = this.qs('#character-editor-empty');
    const saveBtn = this.qs('#save-character-btn');
    const delBtn = this.qs('#delete-character-btn');
    const titleEl = this.qs('#character-editor-title');
    if (charForm) charForm.style.display = 'none';
    if (settingForm) settingForm.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    if (saveBtn) saveBtn.style.display = 'none';
    if (delBtn) delBtn.style.display = 'none';
    if (titleEl) titleEl.textContent = '选择一个角色或设定进行编辑';
    
    this.currentCharacter = null;
    this.currentSetting = null;
  }

  /**
   * 创建新角色
   */
  createNewCharacter() {
    this.currentCharacter = {
      id: Date.now().toString(),
      name: '',
      bio: ''
    };
    this.currentSetting = null;
    
    const nameEl = this.qs('#character-name');
    const bioEl = this.qs('#character-bio');
    const titleEl = this.qs('#character-editor-title');
    if (nameEl) nameEl.value = '';
    if (bioEl) bioEl.value = '';
    if (titleEl) titleEl.textContent = '新建角色';
    
    this.showCharacterEditor();
    const focusEl = this.qs('#character-name');
    if (focusEl) focusEl.focus();
  }

  /**
   * 创建新设定
   */
  createNewSetting() {
    this.currentSetting = {
      id: Date.now().toString(),
      name: '',
      content: ''
    };
    this.currentCharacter = null;
    
    const nameEl = this.qs('#setting-name');
    const contentEl = this.qs('#setting-content');
    const titleEl = this.qs('#character-editor-title');
    if (nameEl) nameEl.value = '';
    if (contentEl) contentEl.value = '';
    if (titleEl) titleEl.textContent = '新建设定';
    
    this.showSettingEditor();
    const focusEl = this.qs('#setting-name');
    if (focusEl) focusEl.focus();
  }

  /**
   * 保存当前项目
   */
  async saveCurrentItem() {
    try {
      if (this.currentCharacter) {
        await this.saveCharacter();
      } else if (this.currentSetting) {
        await this.saveSetting();
      }
    } catch (error) {
      console.error('保存失败:', error);
      if (window.appManager) {
        window.appManager.showError('保存失败: ' + error.message);
      }
    }
  }

  /**
   * 保存角色
   */
  async saveCharacter() {
    const name = (this.qs('#character-name')?.value || '').trim();
    const bio = (this.qs('#character-bio')?.value || '').trim();
    
    if (!name) {
      if (window.appManager) {
        window.appManager.showError('请输入角色名称');
      }
      return;
    }
    
    this.currentCharacter.name = name;
    this.currentCharacter.bio = bio;
    
    // 查找是否已存在
    const existingIndex = this.characters.findIndex(c => c.id === this.currentCharacter.id);
    if (existingIndex >= 0) {
      this.characters[existingIndex] = this.currentCharacter;
    } else {
      this.characters.push(this.currentCharacter);
    }
    
    await this.saveCharactersToFile();
    this.renderCharacterList();
    
    if (window.appManager) {
      window.appManager.showSuccess('角色保存成功');
    }
  }

  /**
   * 保存设定
   */
  async saveSetting() {
    const name = (this.qs('#setting-name')?.value || '').trim();
    const content = (this.qs('#setting-content')?.value || '').trim();
    
    if (!name) {
      if (window.appManager) {
        window.appManager.showError('请输入设定名称');
      }
      return;
    }
    
    this.currentSetting.name = name;
    this.currentSetting.content = content;
    
    // 查找是否已存在
    const existingIndex = this.settings.findIndex(s => s.id === this.currentSetting.id);
    if (existingIndex >= 0) {
      this.settings[existingIndex] = this.currentSetting;
    } else {
      this.settings.push(this.currentSetting);
    }
    
    await this.saveSettingsToFile();
    this.renderSettingList();
    
    if (window.appManager) {
      window.appManager.showSuccess('设定保存成功');
    }
  }

  /**
   * 删除当前项目
   */
  async deleteCurrentItem() {
    try {
      if (this.currentCharacter) {
        await this.deleteCharacter();
      } else if (this.currentSetting) {
        await this.deleteSetting();
      }
    } catch (error) {
      console.error('删除失败:', error);
      if (window.appManager) {
        window.appManager.showError('删除失败: ' + error.message);
      }
    }
  }

  /**
   * 删除角色
   */
  async deleteCharacter() {
    if (!this.currentCharacter) return;
    
    const confirmed = confirm(`确定要删除角色 "${this.currentCharacter.name}" 吗？`);
    if (!confirmed) return;
    
    this.characters = this.characters.filter(c => c.id !== this.currentCharacter.id);
    await this.saveCharactersToFile();
    this.renderCharacterList();
    this.clearEditor();
    
    if (window.appManager) {
      window.appManager.showSuccess('角色删除成功');
    }
  }

  /**
   * 删除设定
   */
  async deleteSetting() {
    if (!this.currentSetting) return;
    
    const confirmed = confirm(`确定要删除设定 "${this.currentSetting.name}" 吗？`);
    if (!confirmed) return;
    
    this.settings = this.settings.filter(s => s.id !== this.currentSetting.id);
    await this.saveSettingsToFile();
    this.renderSettingList();
    this.clearEditor();
    
    if (window.appManager) {
      window.appManager.showSuccess('设定删除成功');
    }
  }

  /**
   * 保存角色数据到文件
   */
  async saveCharactersToFile() {
    try {
      const filePath = `${this.projectPath}/characters/characters.json`;
      console.log('保存角色数据到:', filePath);
      const result = await window.electronAPI.writeFile(filePath, JSON.stringify(this.characters, null, 2));
      if (!result.success) {
        throw new Error(result.error);
      }
      console.log('角色数据保存成功');
    } catch (error) {
      console.error('保存角色数据失败:', error);
      throw error;
    }
  }

  /**
   * 保存设定数据到文件
   */
  async saveSettingsToFile() {
    try {
      const filePath = `${this.projectPath}/characters/settings.json`;
      console.log('保存设定数据到:', filePath);
      const result = await window.electronAPI.writeFile(filePath, JSON.stringify(this.settings, null, 2));
      if (!result.success) {
        throw new Error(result.error);
      }
      console.log('设定数据保存成功');
    } catch (error) {
      console.error('保存设定数据失败:', error);
      throw error;
    }
  }
}
