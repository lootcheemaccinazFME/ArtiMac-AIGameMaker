const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // 窗口控制
    minimizeWindow: () => ipcRenderer.invoke('preview-window-minimize'),
    maximizeWindow: () => ipcRenderer.invoke('preview-window-maximize'),
    closeWindow: () => ipcRenderer.invoke('preview-window-close'),
    
    // 文件操作
    pathExists: (path) => ipcRenderer.invoke('path-exists', path),
    getFileStats: (path) => ipcRenderer.invoke('get-file-stats', path),
    
    // 事件监听
    onAssetInfo: (callback) => {
        ipcRenderer.on('asset-info', (event, assetInfo) => callback(assetInfo));
    },
    
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    }
});