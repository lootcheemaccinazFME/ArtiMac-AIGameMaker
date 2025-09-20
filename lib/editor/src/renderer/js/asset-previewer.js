/**
 * 资源预览器 - 独立窗口
 */

const { BrowserWindow, ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs-extra');

class AssetPreviewer {
    constructor() {
        this.previewWindow = null;
        this.setupIPC();
    }

    /**
     * 创建预览窗口
     */
    createPreviewWindow(assetInfo) {
        if (this.previewWindow) {
            this.previewWindow.close();
        }

        this.previewWindow = new BrowserWindow({
            width: 800,
            height: 600,
            frame: false,
            transparent: true,
            resizable: true,
            minimizable: true,
            maximizable: true,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                preload: path.join(__dirname, 'asset-previewer-preload.js')
            },
            titleBarStyle: 'hidden',
            titleBarOverlay: {
                color: '#2c2c2c',
                symbolColor: '#ffffff',
                height: 30
            }
        });

        // 加载预览页面（__dirname 为 renderer/js）
        this.previewWindow.loadFile(path.join(__dirname, '..', 'asset-preview.html'));

        // 窗口准备完成后显示并发送资源信息
        this.previewWindow.once('ready-to-show', () => {
            this.previewWindow.show();
            this.previewWindow.webContents.send('asset-info', assetInfo);
        });

        // 窗口关闭时清理引用
        this.previewWindow.on('closed', () => {
            this.previewWindow = null;
        });

        // 开发模式下打开调试工具
    const isDev = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development');
    if (isDev) {
            this.previewWindow.webContents.openDevTools();
        }

        return this.previewWindow;
    }

    /**
     * 设置IPC通信
     */
    setupIPC() {
        // 预览资源
        ipcMain.handle('preview-asset', async (event, assetInfo) => {
            try {
                // 验证资源文件存在
                const assetPath = assetInfo.fullPath || assetInfo.path;
                if (!await fs.pathExists(assetPath)) {
                    throw new Error('资源文件不存在');
                }

                // 获取资源详细信息
                const stat = await fs.stat(assetPath);
                const extendedInfo = {
                    ...assetInfo,
                    size: stat.size,
                    lastModified: stat.mtime.toISOString(),
                    absolutePath: path.resolve(assetPath)
                };

                // 创建预览窗口
                this.createPreviewWindow(extendedInfo);
                
                return { success: true };
            } catch (error) {
                console.error('预览资源失败:', error);
                return { success: false, error: error.message };
            }
        });

        // 关闭预览窗口
        ipcMain.handle('close-asset-preview', () => {
            if (this.previewWindow) {
                this.previewWindow.close();
                return { success: true };
            }
            return { success: false, message: '没有打开的预览窗口' };
        });

        // 预览窗口控制
        ipcMain.handle('preview-window-minimize', () => {
            if (this.previewWindow) {
                this.previewWindow.minimize();
            }
        });

        ipcMain.handle('preview-window-maximize', () => {
            if (this.previewWindow) {
                if (this.previewWindow.isMaximized()) {
                    this.previewWindow.unmaximize();
                } else {
                    this.previewWindow.maximize();
                }
            }
        });

        ipcMain.handle('preview-window-close', () => {
            if (this.previewWindow) {
                this.previewWindow.close();
            }
        });
    }

    /**
     * 清理资源
     */
    cleanup() {
        if (this.previewWindow) {
            this.previewWindow.close();
            this.previewWindow = null;
        }
    }
}

module.exports = AssetPreviewer;