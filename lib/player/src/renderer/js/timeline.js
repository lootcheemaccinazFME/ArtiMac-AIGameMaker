/**
 * 时间线管理器
 */

class Timeline {
  constructor() {
    this.nodes = [];
    this.currentNodeId = null;
    this.isVisible = false;
    this.init();
  }

  init() {
    this.setupEventListeners();
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 时间线面板切换
    const timelineBtn = document.getElementById('timeline-btn');
    const timelinePanel = document.getElementById('timeline-panel');
    const timelineClose = document.getElementById('timeline-close');

    if (timelineBtn) {
      timelineBtn.addEventListener('click', () => this.toggle());
    }

    if (timelineClose) {
      timelineClose.addEventListener('click', () => this.hide());
    }

    // 点击面板外区域关闭
    document.addEventListener('click', (e) => {
      if (this.isVisible && 
          !timelinePanel.contains(e.target) && 
          !timelineBtn.contains(e.target)) {
        this.hide();
      }
    });

    // ESC键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }

  /**
   * 显示时间线面板
   */
  show() {
    const panel = document.getElementById('timeline-panel');
    if (panel) {
      panel.classList.add('active');
      this.isVisible = true;
      this.render();
    }
  }

  /**
   * 隐藏时间线面板
   */
  hide() {
    const panel = document.getElementById('timeline-panel');
    if (panel) {
      panel.classList.remove('active');
      this.isVisible = false;
    }
  }

  /**
   * 切换时间线面板显示状态
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * 加载项目时间线
   * @param {string} projectId - 项目ID
   */
  async loadTimeline(projectId) {
    try {
      this.nodes = await window.projectManager.getTimelineHistory(projectId);
      this.currentNodeId = window.projectManager.getCurrentProject()?.currentCheckpoint;
      
      if (this.isVisible) {
        this.render();
      }
    } catch (error) {
      console.error('加载时间线失败:', error);
      Utils.showNotification('加载时间线失败', 'error');
    }
  }

  /**
   * 添加新的时间线节点
   * @param {Object} nodeData - 节点数据
   */
  addNode(nodeData) {
    // 检查节点是否已存在
    const existingIndex = this.nodes.findIndex(node => node.id === nodeData.id);
    
    if (existingIndex !== -1) {
      // 更新现有节点
      this.nodes[existingIndex] = nodeData;
    } else {
      // 添加新节点
      this.nodes.push(nodeData);
      
      // 按时间戳排序
      this.nodes.sort((a, b) => a.timestamp - b.timestamp);
    }

    // 更新当前节点
    this.currentNodeId = nodeData.id;

    // 如果面板可见，重新渲染
    if (this.isVisible) {
      this.render();
    }
  }

  /**
   * 渲染时间线
   */
  render() {
    const container = document.getElementById('timeline-content');
    if (!container) return;

    container.innerHTML = '';

    if (this.nodes.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-timeline';
      emptyState.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <div style="font-size: 3rem; margin-bottom: 20px; opacity: 0.5;">📈</div>
          <h3>暂无时间线</h3>
          <p>开始你的故事，时间线将自动记录每个重要节点。</p>
        </div>
      `;
      container.appendChild(emptyState);
      return;
    }

    // 创建连接线容器
    const lineContainer = document.createElement('div');
    lineContainer.className = 'timeline-line';
    lineContainer.style.cssText = `
      position: absolute;
      left: 18px;
      top: 20px;
      bottom: 20px;
      width: 2px;
      background: linear-gradient(to bottom, var(--primary-color), var(--accent-color));
      opacity: 0.3;
      z-index: 1;
    `;
    container.style.position = 'relative';
    container.appendChild(lineContainer);

    // 渲染节点
    this.nodes.forEach((node, index) => {
      const nodeElement = this.createTimelineNode(node, index);
      container.appendChild(nodeElement);
    });

    // 如果时间线可见且有节点，自动滚动到底部
    if (this.isVisible && this.nodes.length > 0) {
      // 使用 setTimeout 确保DOM已更新
      setTimeout(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    }
  }

  /**
   * 创建时间线节点元素
   * @param {Object} node - 节点数据
   * @param {number} index - 节点索引
   */
  createTimelineNode(node, index) {
    const nodeDiv = document.createElement('div');
    nodeDiv.className = 'timeline-node';
    nodeDiv.setAttribute('data-node-id', node.id);

    // 检查是否为当前节点
    const isCurrent = node.id === this.currentNodeId;
    if (isCurrent) {
      nodeDiv.classList.add('current');
    }

    // 节点内容
    const content = node.content || {};
    const dialogue = content.dialogue || '无内容';
    const summary = content.chapterSummary || '无摘要';
    const timestamp = new Date(node.timestamp);

    nodeDiv.innerHTML = `
      <h4>节点 ${index + 1} ${isCurrent ? '(当前)' : ''}</h4>
      <p title="${dialogue.replace(/"/g, '&quot;')}">${Utils.truncateText(dialogue, 80)}</p>
      <div class="timestamp">${Utils.formatTime(timestamp.getTime())}</div>
      ${node.isCheckpoint ? '<div class="checkpoint-badge">检查点</div>' : ''}
      ${summary !== '无摘要' ? `<div class="summary" title="${summary.replace(/"/g, '&quot;')}">${Utils.truncateText(summary, 60)}</div>` : ''}
    `;

    // 添加点击事件
    nodeDiv.addEventListener('click', () => this.selectNode(node.id));

    // 添加悬停效果
    nodeDiv.addEventListener('mouseenter', () => {
      if (!isCurrent) {
        nodeDiv.style.transform = 'translateX(8px)';
      }
    });

    nodeDiv.addEventListener('mouseleave', () => {
      if (!isCurrent) {
        nodeDiv.style.transform = '';
      }
    });

    return nodeDiv;
  }

  /**
   * 选择时间线节点
   * @param {string} nodeId - 节点ID
   */
  async selectNode(nodeId) {
    if (nodeId === this.currentNodeId) {
      // 如果点击当前节点，关闭面板
      this.hide();
      return;
    }

    try {
      // 确认回档操作
      const confirmed = confirm('确定要回档到这个时间点吗？这将会把后续的章节移动到备份目录。');
      if (!confirmed) return;

  // 显示加载状态，并在完成后手动关闭
  const notif = Utils.showNotification('正在回档...', 'info', 0);

      // 执行回档
      await window.projectManager.revertToCheckpoint(nodeId);

      // 更新当前节点
      this.currentNodeId = nodeId;

      // 重新加载游戏状态
      const gameEngine = window.gameEngine;
      if (gameEngine && gameEngine.isGameActive()) {
        await gameEngine.loadCurrentCheckpoint();
      }

  // 重新加载时间线数据后渲染，确保后续节点已从磁盘移除
  await this.loadTimeline(window.projectManager.getCurrentProject().id);

      // 隐藏面板
      this.hide();

  if (notif && notif.close) notif.close();
  Utils.showNotification('回档成功！', 'success', 2000);

    } catch (error) {
  console.error('回档失败:', error);
  if (notif && notif.close) notif.close();
  Utils.showNotification('回档失败', 'error', 3000);
    }
  }

  /**
   * 更新当前节点
   * @param {string} nodeId - 节点ID
   */
  setCurrentNode(nodeId) {
    this.currentNodeId = nodeId;
    
    if (this.isVisible) {
      // 更新节点样式
      const nodes = document.querySelectorAll('.timeline-node');
      nodes.forEach(node => {
        const id = node.getAttribute('data-node-id');
        if (id === nodeId) {
          node.classList.add('current');
          // 滚动到当前节点
          node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          node.classList.remove('current');
        }
      });
    }
  }

  /**
   * 清除时间线
   */
  clear() {
    this.nodes = [];
    this.currentNodeId = null;
    
    if (this.isVisible) {
      this.render();
    }
  }

  /**
   * 获取时间线统计信息
   */
  getStats() {
    const checkpoints = this.nodes.filter(node => node.isCheckpoint);
    const totalChoices = this.nodes.reduce((sum, node) => {
      return sum + (node.content?.choices?.length || 0);
    }, 0);

    return {
      totalNodes: this.nodes.length,
      checkpoints: checkpoints.length,
      totalChoices,
      currentPosition: this.nodes.findIndex(node => node.id === this.currentNodeId) + 1
    };
  }

  /**
   * 导出时间线数据
   */
  export() {
    return {
      nodes: this.nodes,
      currentNodeId: this.currentNodeId,
      stats: this.getStats(),
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * 搜索时间线节点
   * @param {string} query - 搜索关键词
   */
  search(query) {
    if (!query || query.trim().length < 2) {
      this.render();
      return;
    }

    const searchTerm = query.toLowerCase().trim();
    const matchingNodes = this.nodes.filter(node => {
      const content = node.content || {};
      const dialogue = (content.dialogue || '').toLowerCase();
      const summary = (content.chapterSummary || '').toLowerCase();
      
      return dialogue.includes(searchTerm) || summary.includes(searchTerm);
    });

    // 渲染搜索结果
    this.renderSearchResults(matchingNodes, query);
  }

  /**
   * 渲染搜索结果
   * @param {Array} results - 搜索结果
   * @param {string} query - 搜索关键词
   */
  renderSearchResults(results, query) {
    const container = document.getElementById('timeline-content');
    if (!container) return;

    container.innerHTML = `
      <div class="search-results-header">
        <h4>搜索结果 (${results.length})</h4>
        <button class="btn btn-secondary btn-sm" onclick="window.timeline.render()">
          清除搜索
        </button>
      </div>
    `;

    if (results.length === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'no-search-results';
      noResults.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <div style="font-size: 2rem; margin-bottom: 15px;">
            <i class="fa fa-magnifying-glass"></i>
          </div>
          <h4>未找到相关内容</h4>
          <p>尝试使用不同的关键词搜索</p>
        </div>
      `;
      container.appendChild(noResults);
      return;
    }

    // 渲染匹配的节点
    results.forEach((node, index) => {
      const nodeElement = this.createTimelineNode(node, this.nodes.indexOf(node));
      
      // 高亮搜索关键词
      const highlightedContent = this.highlightSearchTerm(
        nodeElement.innerHTML, 
        query
      );
      nodeElement.innerHTML = highlightedContent;
      
      container.appendChild(nodeElement);
    });
  }

  /**
   * 高亮搜索关键词
   * @param {string} content - 内容
   * @param {string} term - 搜索词
   */
  highlightSearchTerm(content, term) {
    const regex = new RegExp(`(${term})`, 'gi');
    return content.replace(regex, '<mark style="background: var(--accent-color); color: white; padding: 2px 4px; border-radius: 3px;">$1</mark>');
  }

  /**
   * 生成时间线可视化图表
   */
  generateFlowChart() {
    // 这里可以集成图表库，如D3.js或mermaid，生成流程图
    const chartData = this.nodes.map((node, index) => ({
      id: node.id,
      label: `节点${index + 1}`,
      content: Utils.truncateText(node.content?.dialogue || '', 30),
      choices: node.content?.choices?.length || 0,
      isCheckpoint: node.isCheckpoint,
      isCurrent: node.id === this.currentNodeId
    }));

    return chartData;
  }
}

// 添加样式
const timelineStyles = `
.search-results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--border-color);
  margin-bottom: var(--spacing-md);
}

.search-results-header h4 {
  margin: 0;
  color: var(--text-primary);
}

.btn-sm {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 0.8rem;
}

.checkpoint-badge {
  position: absolute;
  top: var(--spacing-xs);
  right: var(--spacing-xs);
  background: var(--gradient-accent);
  color: white;
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-weight: 600;
}

.timeline-node {
  position: relative;
  z-index: 2;
}

mark {
  background: var(--accent-color) !important;
  color: white !important;
  padding: 2px 4px !important;
  border-radius: 3px !important;
}
`;

// 添加样式到页面
if (!document.getElementById('timeline-styles')) {
  const styleSheet = document.createElement('style');
  styleSheet.id = 'timeline-styles';
  styleSheet.textContent = timelineStyles;
  document.head.appendChild(styleSheet);
}

// 创建全局时间线实例
try {
  const btn = document.getElementById('timeline-btn');
  if (btn && btn.style.display !== 'none') {
    window.timeline = new Timeline();
  } else {
    window.timeline = { show(){}, hide(){}, toggle(){}, loadTimeline: async ()=>{} };
  }
} catch {
  window.timeline = { show(){}, hide(){}, toggle(){}, loadTimeline: async ()=>{} };
}
