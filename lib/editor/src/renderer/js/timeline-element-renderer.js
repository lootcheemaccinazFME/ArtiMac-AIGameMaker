/**
 * 时间轴元素渲染器
 * 统一处理时间轴元素的创建和渲染，确保新建和加载的元素完全一致
 */

class TimelineElementRenderer {
    constructor() {
        this.nextElementId = 0;
    }

    /**
     * 创建文本元素HTML - 统一版本
     */
    createTextElementHtml(element, index) {
        const characterName = element.character || '';
        const text = element.text || '';
        const elementId = element.id || `text-${this.nextElementId++}`;
        
        return `
            <div class="timeline-element text-element" data-index="${index}" data-type="text" data-element-id="${elementId}">
                <div class="element-header">
                    <div class="element-type-icon">
                        <i class="fas fa-comment"></i>
                    </div>
                    <div class="element-info">
                        <div class="element-title">${characterName || '场景文本'}</div>
                        <div class="element-preview">${text.substring(0, 50)}${text.length > 50 ? '...' : ''}</div>
                    </div>
                    <div class="element-actions">
                        <button class="btn-small edit-element" title="编辑">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-small delete-element" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="element-content">
                    <div class="text-setup">
                        <div class="character-row">
                            <label>说话角色:</label>
                            <div class="picker-row">
                                <input type="text" class="character-input" placeholder="请选择角色" value="${characterName || ''}" readonly>
                                <button type="button" class="btn-small open-character-picker">选择</button>
                            </div>
                        </div>
                        <div class="text-row">
                            <label>文本内容:</label>
                            <textarea class="text-content" placeholder="输入场景文本内容..." rows="4">${text}</textarea>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 创建选择元素HTML - 统一版本
     */
    createChoiceElementHtml(element, index) {
        const description = element.description || '';
        const choices = element.choices || [];
        const elementId = element.id || `choice-${this.nextElementId++}`;
        
        let choicesHtml = '';
        
        // 如果有现有选项，使用现有数据
        if (choices.length > 0) {
            choices.forEach((choice, choiceIndex) => {
                const targetVal = (choice && (choice.target || choice?.action?.target)) || '';
                choicesHtml += `
                    <div class="choice-option" data-choice-index="${choiceIndex}">
                        <div class="option-row">
                            <label>选项${choiceIndex + 1}:</label>
                            <input type="text" class="choice-text" value="${choice.text || ''}" placeholder="选择${choiceIndex + 1}的文本">
                        </div>
                        <div class="option-row">
                            <label>跳转:</label>
                            <div class="picker-row">
                                <input type="text" class="choice-target" value="${targetVal}" placeholder="请选择目标章节" readonly>
                                <button type="button" class="btn-small open-chapter-picker">选择</button>
                            </div>
                        </div>
                        <div class="option-actions">
                            <button class="btn-small btn-danger remove-choice-option" title="删除选项">
                                <i class="fas fa-minus"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
        } else {
            // 默认创建两个选项
            choicesHtml = `
                <div class="choice-option" data-choice-index="0">
                    <div class="option-row">
                        <label>选项1:</label>
                        <input type="text" class="choice-text" placeholder="选择1的文本">
                    </div>
                    <div class="option-row">
                        <label>跳转:</label>
                        <div class="picker-row">
                            <input type="text" class="choice-target" placeholder="请选择目标章节" readonly>
                            <button type="button" class="btn-small open-chapter-picker">选择</button>
                        </div>
                    </div>
                    <div class="option-actions">
                        <button class="btn-small btn-danger remove-choice-option" title="删除选项">
                            <i class="fas fa-minus"></i>
                        </button>
                    </div>
                </div>
                <div class="choice-option" data-choice-index="1">
                    <div class="option-row">
                        <label>选项2:</label>
                        <input type="text" class="choice-text" placeholder="选择2的文本">
                    </div>
                    <div class="option-row">
                        <label>跳转:</label>
                        <div class="picker-row">
                            <input type="text" class="choice-target" placeholder="请选择目标章节" readonly>
                            <button type="button" class="btn-small open-chapter-picker">选择</button>
                        </div>
                    </div>
                    <div class="option-actions">
                        <button class="btn-small btn-danger remove-choice-option" title="删除选项">
                            <i class="fas fa-minus"></i>
                        </button>
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="timeline-element choice-element" data-index="${index}" data-type="choice" data-element-id="${elementId}">
                <div class="element-header">
                    <div class="element-type-icon">
                        <i class="fas fa-question-circle"></i>
                    </div>
                    <div class="element-info">
                        <div class="element-title">选择分支</div>
                        <div class="element-preview">${description || '玩家选择'} (${choices.length} 个选项)</div>
                    </div>
                    <div class="element-actions">
                        <button class="btn-small add-choice-option" title="添加选项">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button class="btn-small edit-element" title="编辑">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-small delete-element" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="element-content">
                    <div class="choice-setup">
                        <label>选择描述:</label>
                        <input type="text" class="choice-description" value="${description}" placeholder="描述这个选择的情况...">
                        <div class="choice-options">
                            ${choicesHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 创建背景元素HTML
     */
    createBackgroundElementHtml(element, index) {
        const backgroundPath = element.background || '无背景';
        const fileName = backgroundPath.split('/').pop() || backgroundPath;
        const elementId = element.id || `background-${this.nextElementId++}`;
        
        return `
            <div class="timeline-element background-element" data-index="${index}" data-type="background" data-element-id="${elementId}">
                <div class="element-header">
                    <div class="element-type-icon">
                        <i class="fas fa-image"></i>
                    </div>
                    <div class="element-info">
                        <div class="element-title">背景图片</div>
                        <div class="element-preview">${fileName}</div>
                    </div>
                    <div class="element-actions">
                        <button class="btn-small edit-element" title="编辑">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-small delete-element" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 创建音乐元素HTML
     */
    createMusicElementHtml(element, index) {
        const musicPath = element.music || '无音乐';
        const fileName = musicPath.split('/').pop() || musicPath;
        const elementId = element.id || `music-${this.nextElementId++}`;
        
        return `
            <div class="timeline-element music-element" data-index="${index}" data-type="music" data-element-id="${elementId}">
                <div class="element-header">
                    <div class="element-type-icon">
                        <i class="fas fa-music"></i>
                    </div>
                    <div class="element-info">
                        <div class="element-title">背景音乐</div>
                        <div class="element-preview">${fileName}</div>
                    </div>
                    <div class="element-actions">
                        <button class="btn-small edit-element" title="编辑">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-small delete-element" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染元素到时间轴 - 统一入口
     */
    renderElementToTimeline(element, index) {
        try {
            let elementHtml = '';
            
            switch (element.type) {
                case 'text':
                case 'dialogue':
                case 'narration':
                    elementHtml = this.createTextElementHtml(element, index);
                    break;
                case 'choice':
                    elementHtml = this.createChoiceElementHtml(element, index);
                    break;
                case 'background':
                    elementHtml = this.createBackgroundElementHtml(element, index);
                    break;
                case 'music':
                    elementHtml = this.createMusicElementHtml(element, index);
                    break;
                default:
                    console.warn('未知的元素类型:', element.type);
                    return '';
            }
            
            return elementHtml;
            
        } catch (error) {
            console.error('渲染元素失败:', error);
            return '';
        }
    }

    /**
     * 绑定元素事件 - 统一事件处理
     */
    bindElementEvents(element, controller) {
        if (!element || !controller) return;
        
        // 删除按钮
        const deleteBtn = element.querySelector('.delete-element');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                if (confirm('确定要删除这个元素吗？')) {
                    element.remove();
                    if (controller.updateWordCount) controller.updateWordCount();
                    if (controller.checkPlaceholder) controller.checkPlaceholder();
                    if (controller.debounceAutoSave) controller.debounceAutoSave();
                }
            });
        }

        // 编辑按钮
        const editBtn = element.querySelector('.edit-element');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                if (controller.editElement) {
                    controller.editElement(element);
                }
            });
        }

        // 添加选择选项按钮
        const addChoiceBtn = element.querySelector('.add-choice-option');
        if (addChoiceBtn) {
            addChoiceBtn.addEventListener('click', () => {
                if (controller.addChoiceOption) {
                    controller.addChoiceOption(element);
                }
            });
        }

        // 删除选择选项按钮
        const removeChoiceBtns = element.querySelectorAll('.remove-choice-option');
        removeChoiceBtns.forEach(removeBtn => {
            removeBtn.addEventListener('click', () => {
                const choiceOption = removeBtn.closest('.choice-option');
                if (choiceOption && element.querySelectorAll('.choice-option').length > 1) {
                    choiceOption.remove();
                    if (controller.debounceAutoSave) controller.debounceAutoSave();
                } else {
                    alert('至少需要保留一个选项');
                }
            });
        });

        // 文本输入监听
        const textInputs = element.querySelectorAll('input, textarea, select');
        textInputs.forEach(input => {
            input.addEventListener('input', () => {
                if (controller.updateWordCount) controller.updateWordCount();
                if (controller.debounceAutoSave) controller.debounceAutoSave();
            });
            
            if (input.tagName === 'SELECT') {
                input.addEventListener('change', () => {
                    if (controller.debounceAutoSave) controller.debounceAutoSave();
                });
            }
        });

        // 当渲染出 choice 元素后，异步填充章节下拉框
        if (element.classList.contains('choice-element')) {
            // 绑定章节选择弹窗
            element.querySelectorAll('.open-chapter-picker').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (controller?.openChapterPickerModal) {
                        const input = btn.closest('.option-row')?.querySelector('.choice-target');
                        controller.openChapterPickerModal((chapter) => {
                            if (input) input.value = chapter?.id || '';
                            if (controller.debounceAutoSave) controller.debounceAutoSave();
                        });
                    }
                });
            });
        }
        
        // 当渲染出 text 元素后，绑定角色选择弹窗
        if (element.classList.contains('text-element')) {
            element.querySelectorAll('.open-character-picker').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (controller?.openCharacterPickerModal) {
                        const input = btn.closest('.character-row')?.querySelector('.character-input');
                        controller.openCharacterPickerModal((character) => {
                            if (input) input.value = character?.name || character?.id || '';
                            if (controller.debounceAutoSave) controller.debounceAutoSave();
                        });
                    }
                });
            });
        }
    }

    /**
     * 更新所有角色选择器的选项
     */
    async updateCharacterSelects(containerElement = document) {
        if (!containerElement) return;

        setTimeout(async () => {
            try {
                // 从文件读取角色列表，兼容多种格式
                const projectPath = window.projectPathManager?.getCurrentProjectPath?.() || window.app?.currentProject?.path || null;
                let characters = [];
                if (projectPath) {
                    const filePath = `${projectPath}/characters/characters.json`;
                    try {
                        const res = await window.electronAPI.readFile(filePath);
                        if (res && res.success && res.content) {
                            const data = JSON.parse(res.content);
                            if (Array.isArray(data)) characters = data;
                            else if (data && Array.isArray(data.characters)) characters = data.characters;
                            else if (data && typeof data === 'object') characters = Object.values(data);
                        }
                    } catch {}
                }

                // 回退到内存中的当前项目角色
                if (!characters.length && window.app?.currentProject?.characters) {
                    characters = window.app.currentProject.characters;
                }

                // 填充所有角色选择器
                const characterSelects = containerElement.querySelectorAll('.character-select');
                characterSelects.forEach(select => {
                    const currentValue = select.value;
                    select.innerHTML = '<option value="">旁白/无角色</option>';
                    characters.forEach(c => {
                        const name = c.name || c.id || '';
                        const option = document.createElement('option');
                        option.value = name;
                        option.textContent = name;
                        select.appendChild(option);
                    });
                    if (currentValue && characters.some(c => (c.name||c.id) === currentValue)) {
                        select.value = currentValue;
                    }
                });

                console.log(`[Timeline] 已更新 ${characterSelects.length} 个角色选择器，可选角色: ${characters.length} 个`);
            } catch (error) {
                console.warn('[Timeline] 加载角色列表失败:', error?.message);
            }
        }, 0);
    }

    /**
     * 更新所有章节跳转选择器的选项  
     */
    updateChapterSelects(containerElement = document) {
        if (!containerElement) return;
        
        setTimeout(async () => {
            try {
                // 获取当前项目路径
                const projectPath = window.projectPathManager?.getCurrentProjectPath() || 
                    window.galGameUIController?.getCurrentProjectPath?.() || 
                    window.app?.currentProject?.path || null;
                    
                if (!projectPath) {
                    console.warn('[Timeline] 无法获取项目路径');
                    return;
                }

                // 获取章节列表
                let chapters = [];
                if (window.app?.currentProject?.chapters) {
                    chapters = window.app.currentProject.chapters;
                } else if (window.galGameProjectManager?.getChaptersList) {
                    chapters = await window.galGameProjectManager.getChaptersList(projectPath);
                }

                // 查找所有章节选择器
                const selects = containerElement.querySelectorAll('select.choice-target');
                
                selects.forEach((sel) => {
                    const initialValue = sel.getAttribute('data-initial-value') || sel.value || '';
                    
                    // 清空并填充
                    sel.innerHTML = '<option value="">请选择目标章节</option>' +
                        chapters.map((c, i) => 
                            `<option value="${c.id}">第${i + 1}章 · ${c.title || c.id}</option>`
                        ).join('');
                        
                    // 恢复之前的选择值
                    if (initialValue && chapters.some(c => c.id === initialValue)) {
                        sel.value = initialValue;
                    }
                });
                
                console.log(`[Timeline] 已更新 ${selects.length} 个章节选择器，可选章节: ${chapters.length} 个`);
            } catch (error) {
                console.warn('[Timeline] 加载章节列表失败:', error?.message);
            }
        }, 0);
    }
}

// 全局实例
window.timelineElementRenderer = new TimelineElementRenderer();