const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs-extra')
const fsSync = require('fs')
const { exec, spawn } = require('child_process')
const { promisify } = require('util')
const Store = require('electron-store')
const axios = require('axios')
const archiver = require('archiver')
const extractZip = require('extract-zip')
const os = require('os')

// 导入自定义模块
const AssetPreviewer = require('./renderer/js/asset-previewer')

const store = new Store.default ? new Store.default() : new Store()
const execAsync = promisify(exec)
let aiProcess = null
let mainWindow = null
let splashWindow = null
let assetPreviewer = null
let packagerProcesses = new Map()
// 缓存每个打包 job 的日志，防止渲染器尚未注册监听就错过早期输出
let packagerBuffers = new Map()
let publishEditorWindow = null
let creatingPublishEditor = false

// 环境变量
const isDev = process.env.NODE_ENV === 'development'
const isPackaged = app.isPackaged

// 资源路径处理函数
function getResourcePath(relativePath) {
  if (isPackaged) {
    // 打包后的应用，资源在app.asar/src/内
    return path.join(__dirname, relativePath)
  } else {
    // 开发环境，资源在src/内
    return path.join(__dirname, relativePath)
  }
}

// 获取应用根目录路径
function getAppRootPath() {
  if (isPackaged) {
    // 打包后的应用：返回 app.asar 所在路径，便于访问打包进 asar 的源码（如 lib/player）
    return app.getAppPath()
  } else {
    // 开发环境：从 lib/editor/src/main.js 回到项目根目录
    return path.join(__dirname, '..', '..', '..')
  }
}

// 日志系统
const logger = {
  info: (message, ...args) => {
    if (isDev) {
      console.log(`[INFO] ${message}`, ...args)
    }
  },
  warn: (message, ...args) => {
    if (isDev) {
      console.warn(`[WARN] ${message}`, ...args)
    }
  },
  error: (message, ...args) => {
    console.error(`[ERROR] ${message}`, ...args)
  }
}

// 启用GPU加速
app.commandLine.appendSwitch('enable-gpu-rasterization')
// 单实例锁：二次启动时前置已有窗口并阻止重复运行
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = mainWindow || BrowserWindow.getAllWindows()?.find(w => w === mainWindow) || BrowserWindow.getAllWindows()?.[0]
    if (win) {
      try { if (win.isMinimized()) win.restore() } catch {}
      try { win.show(); win.focus() } catch {}
    }
  })
}
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor')

// 默认设置
const defaultSettings = {
  ai: {
    engines: {
      openai: {
        apiKey: '',
        baseURL: 'https://api.openai.com/v1',
        model: 'gpt-4'
      },
      ollama: {
        baseURL: 'http://localhost:11434',
        model: 'llama2'
      },
      llamacpp: {
        baseURL: 'http://localhost:8080',
        model: 'llama2'
      },
      custom: {
        apiKey: '',
        baseURL: 'https://api.example.com/v1',
        model: 'custom-model',
        name: '自定义 AI'
      }
    },
    // 图片生成（手动配置 URL / API Key / 模型）
    image: {
      apiKey: '',
      baseURL: '',
      model: '',
      defaultSize: '1920x1080',
      steps: 20,
      guidance: 7.5
    },
    selectedEngine: 'openai',
  systemPrompt: '你是一位专业的小说家，擅长创作各种类型的小说。请根据用户提供的上下文和要求，续写精彩的故事内容。保持故事的连贯性和风格一致性，每次生成约500-1000字的内容。重要：始终使用与项目描述或用户输入相同的语言进行输出，不要在同一段落中混用多种语言。',
    agentMode: false,
    agentPrompt: '请根据故事的发展，自动续写下一章节的内容。',
    temperature: 0.7,
    maxTokens: 2000
  },
  git: {
    userName: '',
    userEmail: '',
    defaultRemote: 'origin',
    defaultBranch: 'main'
  },
  editor: {
    fontSize: 16,
    fontFamily: 'Georgia, serif',
    theme: 'dark',
    autoSave: true,
    autoSaveInterval: 30000,
    customFonts: []
  },
  general: {
    language: 'zh-CN',
    projectsDir: null, // 将在需要时动态获取
    backupEnabled: true,
    backupInterval: 300000, // 5分钟
    theme: 'dark', // 'light', 'dark', 'auto'
    autoSave: true,
    autoSaveInterval: 30000
  }
}

// Windows 任务栏图标需要 AppUserModelId
if (process.platform === 'win32') {
  try { app.setAppUserModelId('com.artimeow.galgame-maker'); } catch {}
}

// 创建主窗口
function createWindow() {
  // 设置窗口图标路径
  let iconPath
  if (process.platform === 'win32') {
    iconPath = isPackaged ? 
      path.join(process.resourcesPath, 'icon', 'icon.ico') :
      path.join(__dirname, '..', 'src', 'icon', 'icon.ico')
  } else if (process.platform === 'darwin') {
    iconPath = getResourcePath('renderer/assets/icons/icon.icns')
  } else {
    iconPath = getResourcePath('renderer/assets/icons/icon.png')
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: getResourcePath('preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      hardwareAcceleration: true, // 启用硬件加速
      webSecurity: !isDev // 开发时允许跨域，生产环境开启安全限制
    },
    frame: false, // 禁用原生窗口框架
    show: false, // 初始不显示，等加载完成后显示
    icon: iconPath
  })

  // 加载应用页面
  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'))

  // 开发模式下打开开发者工具
  if (isDev) {
    mainWindow.webContents.openDevTools()
    logger.info('开发者工具已打开')
  }

  logger.info('应用窗口已创建', {
    platform: process.platform,
    isPackaged: isPackaged,
    iconPath: iconPath
  })

  mainWindow.once('ready-to-show', () => {
    // 窗口准备好后，关闭启动画面并显示主窗口
    if (splashWindow) {
      splashWindow.close()
      splashWindow = null
    }
    mainWindow.show()
    logger.info('应用窗口已显示')
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createSplashWindow() {
  // 设置窗口图标路径
  let iconPath
  if (process.platform === 'win32') {
    iconPath = isPackaged ? 
      path.join(process.resourcesPath, 'icon', 'icon.ico') :
      path.join(__dirname, '..', 'src', 'icon', 'icon.ico')
  } else if (process.platform === 'darwin') {
    iconPath = getResourcePath('renderer/assets/icons/icon.icns')
  } else {
    iconPath = getResourcePath('renderer/assets/icons/icon.png')
  }

  splashWindow = new BrowserWindow({
    width: 800,
    height: 450,
    frame: false,
    alwaysOnTop: true,
    transparent: false,
    resizable: false,
    movable: false,
    center: true,
    webPreferences: {
      preload: getResourcePath('preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    },
    icon: iconPath
  })

  // 加载启动画面
  splashWindow.loadFile(path.join(__dirname, 'renderer/splash.html'))

  splashWindow.on('closed', () => {
    splashWindow = null
  })

  logger.info('启动画面窗口已创建')
}

// 应用就绪时创建窗口
app.whenReady().then(() => {
  // 首先创建启动画面
  createSplashWindow()
  
  // 初始化资源预览器
  assetPreviewer = new AssetPreviewer()
  
  // 不再自动创建主窗口，等待启动画面准备就绪的信号

  // macOS 特定处理
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSplashWindow()
    }
  })
})

// 所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 获取项目目录
function getProjectsDirectory() {
  try {
    return path.join(app.getPath('documents'), 'ArtiMeow-AIGalGame-Maker-Projects')
  } catch (error) {
    // 如果无法获取文档路径，使用用户主目录
    const os = require('os')
    return path.join(os.homedir(), 'Documents', 'ArtiMeow-AIGalGame-Maker-Projects')
  }
}

// 初始化设置
function initializeSettings() {
  const settings = store.get('settings', defaultSettings)
  const correctProjectsDir = getProjectsDirectory()
  
  // 确保项目目录设置正确 - 强制更新到新目录名
  if (!settings.general) settings.general = {}
  
  // 如果当前目录不是正确的目录名，强制更新
  if (settings.general.projectsDir !== correctProjectsDir) {
    console.log(`更新项目目录从 "${settings.general.projectsDir}" 到 "${correctProjectsDir}"`)
    settings.general.projectsDir = correctProjectsDir
  }
  
  store.set('settings', { ...defaultSettings, ...settings })
  return store.get('settings')
}

// IPC 处理程序

// 启动画面相关
ipcMain.handle('splash-ready', () => {
  // 启动画面准备就绪，可以开始创建主窗口
  logger.info('启动画面准备就绪')
  if (!mainWindow) {
    createWindow()
  }
})

// 设置相关
ipcMain.handle('get-settings', () => {
  return store.get('settings', defaultSettings)
})

ipcMain.handle('save-settings', (event, settings) => {
  // 合并默认设置，防止 custom/AI 配置丢失
  const merged = Object.assign({}, defaultSettings, settings)
  // 深合并 AI engines
  if (defaultSettings.ai && settings.ai) {
    merged.ai = Object.assign({}, defaultSettings.ai, settings.ai)
    if (defaultSettings.ai.engines && settings.ai.engines) {
      merged.ai.engines = Object.assign({}, defaultSettings.ai.engines, settings.ai.engines)
    }
  }
  if (defaultSettings.editor && settings.editor) {
    merged.editor = Object.assign({}, defaultSettings.editor, settings.editor)
  }
  if (defaultSettings.git && settings.git) {
    merged.git = Object.assign({}, defaultSettings.git, settings.git)
  }
  if (defaultSettings.general && settings.general) {
    merged.general = Object.assign({}, defaultSettings.general, settings.general)
  }
  store.set('settings', merged)
  return true
})

ipcMain.handle('reset-settings', () => {
  store.set('settings', defaultSettings)
  return defaultSettings
})

// 窗口控制
ipcMain.handle('window-minimize', (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event?.sender) || mainWindow
    win?.minimize()
  } catch {}
})

ipcMain.handle('window-maximize', (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event?.sender) || mainWindow
    if (!win) return
    if (win.isMaximized()) win.unmaximize(); else win.maximize()
  } catch {}
})

ipcMain.handle('window-close', (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event?.sender) || mainWindow
    win?.close()
  } catch {}
})

// 终端操作
ipcMain.handle('open-terminal', async (event, command = '', workingDirectory = '') => {
  try {
    const isWindows = process.platform === 'win32'
    const isMac = process.platform === 'darwin'
    const isLinux = process.platform === 'linux'

    let terminalCommand
    let args = []

    if (isWindows) {
      // Windows: 打开PowerShell或CMD
      terminalCommand = 'cmd'
      args = ['/c', 'start', 'powershell']
      if (workingDirectory) {
        // 设置UTF-8编码并切换到目标目录
        const psInit = `[Console]::InputEncoding=[System.Text.UTF8Encoding]::new(); [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); $OutputEncoding=[System.Text.UTF8Encoding]::new(); chcp 65001 > $null; Set-Location '${workingDirectory.replace(/'/g, "''")}'`
        args.push('-NoExit', '-Command', psInit)
      }
      if (command) {
        // 在已有初始化后追加命令执行
        args.push(';', command)
      }
    } else if (isMac) {
      // macOS: 打开Terminal
      terminalCommand = 'open'
      args = ['-a', 'Terminal']
      if (workingDirectory) {
        args.push(workingDirectory)
      }
    } else if (isLinux) {
      // Linux: 尝试常见的终端
      const terminals = ['gnome-terminal', 'konsole', 'xterm', 'terminator']
      for (const terminal of terminals) {
        try {
          await new Promise((resolve, reject) => {
            exec(`which ${terminal}`, (error) => {
              if (error) reject(error)
              else resolve()
            })
          })
          terminalCommand = terminal
          if (workingDirectory) {
            args.push('--working-directory', workingDirectory)
          }
          break
        } catch (e) {
          continue
        }
      }
      if (!terminalCommand) {
        throw new Error('未找到可用的终端应用')
      }
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(terminalCommand, args, {
        cwd: workingDirectory || process.cwd(),
        detached: true,
        stdio: 'ignore'
      })

      proc.on('error', (error) => {
        reject({ success: false, error: error.message })
      })

      proc.on('spawn', () => {
        proc.unref() // 允许父进程退出而不等待子进程
        resolve({ success: true, message: '终端已打开' })
      })
    })
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 项目管理 - 新的基于目录扫描的方式
ipcMain.handle('get-project-list', async () => {
  try {
    const settings = store.get('settings', defaultSettings)
    let projectsDir = settings.general.projectsDir
    
    // 如果项目目录为空或无效，使用默认目录
    if (!projectsDir) {
      projectsDir = getProjectsDirectory()
      // 更新设置
      const updatedSettings = { ...settings }
      updatedSettings.general.projectsDir = projectsDir
      store.set('settings', updatedSettings)
    }
    
    // 确保项目目录存在
    await fs.mkdir(projectsDir, { recursive: true })
    
    // 读取项目目录
    const entries = await fs.readdir(projectsDir, { withFileTypes: true })
    const projects = []
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projectPath = path.join(projectsDir, entry.name)
        const projectFilePath = path.join(projectPath, 'project.json')
        
        try {
          // 检查项目配置文件是否存在
          await fs.access(projectFilePath)
          
          // 读取项目元数据
          const projectData = JSON.parse(await fs.readFile(projectFilePath, 'utf-8'))
          const stats = await fs.stat(projectFilePath)
          
          // 计算字数（如果有章节的话）
          let wordCount = 0
          const chaptersDir = path.join(projectPath, 'chapters')
          try {
            const chapterFiles = await fs.readdir(chaptersDir)
            for (const chapterFile of chapterFiles) {
              if (chapterFile.endsWith('.md')) {
                const chapterPath = path.join(chaptersDir, chapterFile)
                const content = await fs.readFile(chapterPath, 'utf-8')
                wordCount += content.length // 简单字符计数，可以后续优化为更准确的字数统计
              }
            }
          } catch (error) {
            // 章节目录不存在或无法读取，wordCount保持为0
          }
          
          const projectInfo = {
            id: entry.name,
            path: projectPath,
            metadata: {
              title: projectData.name || entry.name,
              description: projectData.description || '',
              author: projectData.author || '',
              genre: projectData.genre || '',
              created: projectData.createTime || stats.birthtime.getTime(),
              lastModified: projectData.updateTime || stats.mtime.getTime(),
              wordCount: wordCount,
              useGit: projectData.useGit || false,
              version: projectData.version || '1.0.0'
            }
          }
          
          projects.push(projectInfo)
        } catch (error) {
          console.warn(`跳过无效项目目录 ${entry.name}:`, error.message)
        }
      }
    }
    
    // 按最后修改时间排序（最新的在前）
    projects.sort((a, b) => b.metadata.lastModified - a.metadata.lastModified)
    
    console.log(`扫描到 ${projects.length} 个有效项目`)
    return { success: true, projects }
  } catch (error) {
    console.error('获取项目列表失败:', error)
    return { success: false, error: error.message }
  }
})

// 导入项目
ipcMain.handle('import-project', async (event, options = {}) => {
  try {
    // 显示文件选择对话框
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择要导入的项目zip文件',
      filters: [
        { name: '项目包', extensions: ['artimeow-gg-maker','zip'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    
    if (result.canceled) {
      return { success: false, canceled: true }
    }
    
  const zipPath = result.filePaths[0]
    const settings = store.get('settings', defaultSettings)
    const projectsDir = settings.general.projectsDir
    
    // 确保项目目录存在
    await fs.mkdir(projectsDir, { recursive: true })
    
    // 创建临时解压目录
    const tempDir = path.join(os.tmpdir(), `artimeow-import-${Date.now()}`)
    await fs.mkdir(tempDir, { recursive: true })
    
    try {
  // 解压文件（支持 .artimeow-gg-maker/.zip，均为 zip 格式）
  await extractZip(zipPath, { dir: tempDir })
      
      // 查找项目配置文件
      let projectConfigPath = null
      let projectName = null
      let extractedProjectPath = null
      
      // 检查临时目录中的内容
      const tempContents = await fs.readdir(tempDir, { withFileTypes: true })
      
      // 查找项目配置文件的位置
      for (const entry of tempContents) {
        if (entry.isDirectory()) {
          const possibleConfigPath = path.join(tempDir, entry.name, 'project.json')
          try {
            await fs.access(possibleConfigPath)
            projectConfigPath = possibleConfigPath
            extractedProjectPath = path.join(tempDir, entry.name)
            break
          } catch (error) {
            // 继续查找
          }
        }
      }
      
      // 如果在子目录中没找到，检查根目录
      if (!projectConfigPath) {
        const rootConfigPath = path.join(tempDir, 'project.json')
        try {
          await fs.access(rootConfigPath)
          projectConfigPath = rootConfigPath
          extractedProjectPath = tempDir
        } catch (error) {
          throw new Error('未找到有效的项目配置文件 (project.json)')
        }
      }
      
      // 读取项目配置
      const projectData = JSON.parse(await fs.readFile(projectConfigPath, 'utf-8'))
      projectName = projectData.name || 'imported-project'
      
      // 检查项目名称是否已存在，如果存在则添加后缀
      let finalProjectName = projectName
      let counter = 1
      while (true) {
        const targetPath = path.join(projectsDir, finalProjectName)
        try {
          await fs.access(targetPath)
          finalProjectName = `${projectName}_${counter}`
          counter++
        } catch (error) {
          // 目录不存在，可以使用这个名称
          break
        }
      }
      
      // 移动项目到目标位置
      const finalProjectPath = path.join(projectsDir, finalProjectName)
      await fs.mkdir(finalProjectPath, { recursive: true })
      
      // 复制所有文件
      const copyRecursively = async (src, dest) => {
        const entries = await fs.readdir(src, { withFileTypes: true })
        await fs.mkdir(dest, { recursive: true })
        
        for (const entry of entries) {
          const srcPath = path.join(src, entry.name)
          const destPath = path.join(dest, entry.name)
          
          if (entry.isDirectory()) {
            await copyRecursively(srcPath, destPath)
          } else {
            await fs.copyFile(srcPath, destPath)
          }
        }
      }
      
      await copyRecursively(extractedProjectPath, finalProjectPath)
      
      // 更新项目配置中的名称和时间戳
      const finalConfigPath = path.join(finalProjectPath, 'project.json')
      const finalProjectData = JSON.parse(await fs.readFile(finalConfigPath, 'utf-8'))
      finalProjectData.name = finalProjectName
      finalProjectData.updateTime = Date.now()
      if (!finalProjectData.createTime) {
        finalProjectData.createTime = Date.now()
      }
      await fs.writeFile(finalConfigPath, JSON.stringify(finalProjectData, null, 2), 'utf-8')
      
      // 清理临时目录
      await fs.rm(tempDir, { recursive: true, force: true })
      
      return {
        success: true,
        projectPath: finalProjectPath,
        projectName: finalProjectName,
        message: `项目 "${finalProjectName}" 导入成功`
      }
      
    } catch (extractError) {
      // 清理临时目录
      try {
        await fs.rm(tempDir, { recursive: true, force: true })
      } catch (cleanupError) {
        console.warn('清理临时目录失败:', cleanupError)
      }
      throw extractError
    }
    
  } catch (error) {
    console.error('导入项目失败:', error)
    return { 
      success: false, 
      error: error.message,
      details: '请确保选择的是有效的ArtiMeow项目压缩包'
    }
  }
})

// 导出完整项目为 .artimeow-gg-maker 包
ipcMain.handle('export-project-package', async (event, projectPath) => {
  try {
    if (!projectPath) throw new Error('未指定项目路径')
    const stat = await fs.stat(projectPath).catch(()=>null)
    if (!stat || !stat.isDirectory()) throw new Error('项目路径无效')
    const projectName = path.basename(projectPath)
    const ts = new Date().toISOString().replace(/[:.]/g,'-')
    const defaultName = `${projectName}-${ts}.artimeow-gg-maker`
    const res = await dialog.showSaveDialog(mainWindow, {
      title: '导出项目包',
      defaultPath: defaultName,
      filters: [ { name: 'ArtiMeow 项目包', extensions: ['artimeow-gg-maker'] } ]
    })
    if (res.canceled || !res.filePath) return { success:false, canceled:true }
    // 采用 zip 打包
    const outPath = res.filePath
    await new Promise((resolve, reject)=>{
      const output = fsSync.createWriteStream(outPath)
      const archive = archiver('zip', { zlib: { level: 9 } })
      output.on('close', resolve)
      archive.on('error', reject)
      archive.pipe(output)
      archive.directory(projectPath, false)
      archive.finalize()
    })
    return { success:true, filePath: res.filePath }
  } catch (e) {
    return { success:false, error: e?.message || String(e) }
  }
})

ipcMain.handle('create-project', async (event, projectData) => {
  try {
    const settings = store.get('settings', defaultSettings)
    let projectsDir = settings.general.projectsDir
    
    // 如果项目目录为空或无效，使用默认目录
    if (!projectsDir) {
      projectsDir = getProjectsDirectory()
      // 更新设置
      const updatedSettings = { ...settings }
      updatedSettings.general.projectsDir = projectsDir
      store.set('settings', updatedSettings)
    }
    
    const projectDir = path.join(projectsDir, projectData.name)
    
    // 创建项目目录
    await fs.mkdir(projectDir, { recursive: true })
    
    // 创建项目文件
    const projectFile = {
      name: projectData.name,
      description: projectData.description || '',
      author: projectData.author || '',
      genre: projectData.genre || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      chapters: [],
      characters: [],
      settings: {
        wordGoal: projectData.wordGoal || 0,
        style: projectData.style || 'default'
      }
    }
    
    await fs.writeFile(
      path.join(projectDir, 'project.json'),
      JSON.stringify(projectFile, null, 2)
    )
    
    // 创建章节目录
    await fs.mkdir(path.join(projectDir, 'chapters'), { recursive: true })
    
    // 创建资源目录
    await fs.mkdir(path.join(projectDir, 'assets'), { recursive: true })
    
    // 初始化 Git 仓库
    if (projectData.useGit) {
      await initGitRepo(projectDir)
    }
    
    return { success: true, projectDir }
  } catch (error) {
    console.error('创建项目失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('load-project', async (event, projectPath) => {
  try {
    const projectFilePath = path.join(projectPath, 'project.json')
    const projectData = JSON.parse(await fs.readFile(projectFilePath, 'utf-8'))
    
    // 加载章节列表
    const chaptersDir = path.join(projectPath, 'chapters')
    const chapterDirs = await fs.readdir(chaptersDir, { withFileTypes: true }).catch(() => [])
    
    const chapters = await Promise.all(
      chapterDirs
        .filter(dirent => dirent.isDirectory())
        .map(async (dirent) => {
          try {
            const chapterDir = path.join(chaptersDir, dirent.name)
            
            // 读取元数据
            const metadataPath = path.join(chapterDir, 'metadata.json')
            const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'))
            
            // 读取内容（GalGame JSON格式）
            const contentPath = path.join(chapterDir, 'content.json')
            let content = {}
            try {
              const contentStr = await fs.readFile(contentPath, 'utf-8')
              content = JSON.parse(contentStr)
            } catch (error) {
              // 如果没有content.json，尝试读取旧的content.md并转换
              try {
                const mdPath = path.join(chapterDir, 'content.md')
                const mdContent = await fs.readFile(mdPath, 'utf-8')
                content = {
                  scenes: [{
                    id: 'scene_1',
                    name: '场景1',
                    elements: [{
                      type: 'text',
                      content: mdContent,
                      timestamp: 0
                    }],
                    background: '',
                    music: '',
                    effects: []
                  }]
                }
                // 保存为新格式
                await fs.writeFile(contentPath, JSON.stringify(content, null, 2), 'utf-8')
              } catch (e) {
                content = { scenes: [] }
              }
            }
            
            return {
              ...metadata,
              content: content // 只在加载时包含内容，用于显示
            }
          } catch (error) {
            console.error(`加载章节 ${dirent.name} 失败:`, error)
            return null
          }
        })
    )
    
    // 过滤掉加载失败的章节
    const validChapters = chapters.filter(chapter => chapter !== null)
    
    // 将章节数据存储在项目对象中
    projectData.chapters = validChapters
    projectData.path = projectPath
    
    return { success: true, project: projectData }
  } catch (error) {
    console.error('加载项目失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('get-recent-projects', async () => {
  try {
    // 复用get-project-list的逻辑，但只返回项目列表
    const result = await ipcMain.handle('get-project-list', null)();
    if (result.success && result.projects) {
      // 转换为旧格式以保持兼容性
      const recentProjects = result.projects.map(project => ({
        name: project.metadata.title,
        path: project.path,
        description: project.metadata.description,
        author: project.metadata.author,
        lastModified: project.metadata.lastModified
      }));
      return recentProjects;
    }
    return [];
  } catch (error) {
    console.error('获取最近项目失败:', error);
    return [];
  }
})

ipcMain.handle('add-recent-project', async (event, projectPath) => {
  try {
    // 基于新的目录扫描模式，我们不需要维护单独的最近项目列表
    // 只需要更新项目的最后修改时间
    const configPath = path.join(projectPath, 'project.json');
    
    // 检查项目是否存在
    await fs.access(configPath);
    
    // 更新项目配置的updateTime
    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);
    config.updateTime = Date.now();
    
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    
    return { success: true };
  } catch (error) {
    console.error('更新项目时间失败:', error);
    return { success: false, error: error.message };
  }
})

// AI 集成
ipcMain.handle('call-ai-api', async (event, options) => {
  try {
    const settings = store.get('settings', defaultSettings)
    const engine = settings.ai.engines[settings.ai.selectedEngine]
    
    let response
    
    switch (settings.ai.selectedEngine) {
      case 'openai':
        response = await callOpenAI(engine, options)
        break
      case 'ollama':
        response = await callOllama(engine, options)
        break
      case 'llamacpp':
        response = await callLlamaCpp(engine, options)
        break
      default:
        throw new Error('未知的 AI 引擎')
    }
    
    return { success: true, response }
  } catch (error) {
    console.error('AI API 调用失败:', error)
    return { success: false, error: error.message }
  }
})

// OpenAI API 调用
async function callOpenAI(engine, options) {
  const requestData = {
    model: engine.model,
    messages: options.messages
  }
  if (options.temperature !== undefined) requestData.temperature = options.temperature
  if (options.maxTokens !== undefined) requestData.max_tokens = options.maxTokens
  console.log('OpenAI API Request:', JSON.stringify(requestData, null, 2))
  try {
    const response = await axios.post(
      `${(engine.baseURL || 'https://api.openai.com/v1').replace(/\/$/,'')}/chat/completions`,
      requestData,
      {
        headers: {
          'Authorization': `Bearer ${engine.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000
      }
    )
    const content = response?.data?.choices?.[0]?.message?.content || ''
    return filterThinkTags(content)
  } catch (err) {
    const msg = err?.response?.data?.error?.message || err.message || 'OpenAI 请求失败'
    throw new Error(msg)
  }
}

// Ollama API 调用
async function callOllama(engine, options) {
  const requestData = {
    model: engine.model,
    messages: options.messages,
    stream: false,
    options: {}
  }
  if (options.temperature !== undefined) requestData.options.temperature = options.temperature
  if (options.maxTokens !== undefined) requestData.options.max_tokens = options.maxTokens
  console.log('Ollama API Request:', JSON.stringify(requestData, null, 2))
  try {
    const base = (engine.baseURL || 'http://localhost:11434').replace(/\/$/,'')
    const response = await axios.post(`${base}/api/chat`, requestData, { timeout: 300000 })
    const content = response?.data?.message?.content || ''
    return filterThinkTags(content)
  } catch (err) {
    const msg = err?.response?.data?.error || err.message || 'Ollama 请求失败'
    throw new Error(msg)
  }
}

// Llama.cpp API 调用
async function callLlamaCpp(engine, options) {
  const requestData = { prompt: options.prompt }
  if (options.temperature !== undefined) requestData.temperature = options.temperature
  if (options.maxTokens !== undefined) requestData.n_predict = options.maxTokens
  console.log('Llama.cpp API Request:', JSON.stringify(requestData, null, 2))
  try {
    const base = (engine.baseURL || 'http://localhost:8080').replace(/\/$/,'')
    const response = await axios.post(`${base}/completion`, requestData, { timeout: 180000 })
    const content = response?.data?.content || response?.data?.choices?.[0]?.text || ''
    return filterThinkTags(content)
  } catch (err) {
    const msg = err?.response?.data?.error || err.message || 'Llama.cpp 请求失败'
    throw new Error(msg)
  }
}

// 自定义 AI API 调用
async function callCustomAI(engine, options) {
  const requestData = { model: engine.model, messages: options.messages }
  if (options.temperature !== undefined) requestData.temperature = options.temperature
  if (options.maxTokens !== undefined) requestData.max_tokens = options.maxTokens
  console.log('Custom AI API Request:', JSON.stringify(requestData, null, 2))
  try {
    const base = (engine.baseURL || '').replace(/\/$/,'')
    const response = await axios.post(
      `${base}/chat/completions`,
      requestData,
      {
        headers: {
          'Authorization': engine.apiKey ? `Bearer ${engine.apiKey}` : undefined,
          'Content-Type': 'application/json'
        },
        timeout: 120000
      }
    )
    const content = response?.data?.choices?.[0]?.message?.content || ''
    return filterThinkTags(content)
  } catch (err) {
    const msg = err?.response?.data?.error?.message || err.message || '自定义AI 请求失败'
    throw new Error(msg)
  }
}

// Git 操作
async function initGitRepo(projectDir) {
  return new Promise((resolve, reject) => {
    exec('git init', { 
      cwd: projectDir,
      shell: true 
    }, (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

ipcMain.handle('git-status', async (event, projectPath) => {
  return new Promise((resolve, reject) => {
    // 首先检查是否是Git仓库
    exec('git rev-parse --is-inside-work-tree', { 
      cwd: projectPath,
      shell: true 
    }, (error) => {
      if (error) {
        resolve({ 
          success: false, 
          error: '不是Git仓库',
          status: {
            isRepository: false,
            files: [],
            current: null
          }
        })
        return
      }

      // 获取当前分支
      exec('git branch --show-current', { 
        cwd: projectPath,
        shell: true 
      }, (branchError, branchOutput) => {
        const currentBranch = branchError ? 'main' : branchOutput.trim()

        // 获取状态
        exec('git status --porcelain', { 
          cwd: projectPath,
          shell: true 
        }, (statusError, statusOutput) => {
          if (statusError) {
            resolve({ 
              success: false, 
              error: statusError.message,
              status: {
                isRepository: true,
                files: [],
                current: currentBranch
              }
            })
          } else {
            const files = statusOutput.trim() ? statusOutput.trim().split('\n') : []
            resolve({ 
              success: true, 
              status: {
                isRepository: true,
                files: files,
                current: currentBranch,
                raw: statusOutput
              }
            })
          }
        })
      })
    })
  })
})

ipcMain.handle('git-commit', async (event, projectPath, message) => {
  return new Promise((resolve, reject) => {
    exec(`git add . && git commit -m "${message}"`, { 
      cwd: projectPath,
      shell: true 
    }, (error) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        resolve({ success: true })
      }
    })
  })
})

// 文件操作
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return { success: true, content }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    // 确保目录存在
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
    
    await fs.writeFile(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 复制文件
ipcMain.handle('copy-file', async (event, srcPath, destPath) => {
  try {
    // 确保目标目录存在
    const dir = path.dirname(destPath)
    await fs.mkdir(dir, { recursive: true })

    // 使用 fs-extra 的 copy，兼容复制目录与文件
    if (typeof fs.copy === 'function') {
      await fs.copy(srcPath, destPath, { overwrite: true, errorOnExist: false })
    } else {
      // 回退：仅复制文件
      await fs.copyFile(srcPath, destPath)
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 确保目录存在（等同于 ensureDir）
ipcMain.handle('ensure-dir', async (event, dirPath) => {
  try {
    // 使用 fs-extra 的 ensureDir，递归创建并在存在时不报错
    if (typeof fs.ensureDir === 'function') {
      await fs.ensureDir(dirPath)
    } else {
      await fs.mkdir(dirPath, { recursive: true })
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 创建目录
ipcMain.handle('create-directory', async (event, dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true })
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options)
  return result
})

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options)
  return result
})

// 选择目录
ipcMain.handle('choose-directory', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择项目目录'
    });
    return result;
  } catch (error) {
    console.error('Choose directory error:', error);
    throw error;
  }
});

// —— 剧情续写 + 图像串联：后端聚合接口 ——
ipcMain.handle('ai-continue-chapter', async (_event, { projectPath, hint, maxChoices = 3, imageSize }) => {
  try {
    if (!projectPath) throw new Error('缺少项目路径');

    // 读取项目元数据
    const projectJsonPath = path.join(projectPath, 'project.json');
    const project = await fs.readJson(projectJsonPath).catch(() => ({}));

    // 读取角色库（多种结构兼容）
    let characters = [];
    const charactersJsonPath = path.join(projectPath, 'characters', 'characters.json');
    if (await fs.pathExists(charactersJsonPath)) {
      const charData = await fs.readJson(charactersJsonPath).catch(() => null);
      if (Array.isArray(charData)) characters = charData;
      else if (charData?.characters && Array.isArray(charData.characters)) characters = charData.characters;
      else if (charData && typeof charData === 'object') characters = Object.values(charData);
    }

    // 最近3章内容：优先从 project.json 的章节列表读取，再回退旧格式
    const chaptersDir = path.join(projectPath, 'chapters');
    let lastChapters = [];
    try {
      const projectData = await fs.readJson(projectJsonPath).catch(() => ({}));
      const chapterList = Array.isArray(projectData.chapters) ? projectData.chapters.slice() : [];
      // 按 createdAt 或 lastModified 排序，取最近3个
      chapterList.sort((a, b) => {
        const ta = new Date(a.lastModified || a.createdAt || 0).getTime();
        const tb = new Date(b.lastModified || b.createdAt || 0).getTime();
        return ta - tb;
      });
      const recent = chapterList.slice(-3);
      for (const meta of recent) {
        const cid = meta.id || meta.directory || meta;
        try {
          const contentPath = path.join(chaptersDir, cid, 'content.json');
          const content = await fs.readJson(contentPath);
          const firstScene = Array.isArray(content.scenes) ? content.scenes[0] : null;
          lastChapters.push({
            id: cid,
            title: meta.title || (firstScene?.name || ''),
            elements: Array.isArray(firstScene?.elements) ? firstScene.elements : [],
            sceneProperties: {
              sceneName: firstScene?.name || meta.title || '',
              backgroundImage: firstScene?.background || '',
              backgroundMusic: firstScene?.music || ''
            }
          });
        } catch {
          // 回退读取旧格式直存JSON文件
          try {
            const legacyPath = path.join(chaptersDir, `${cid}.json`);
            const data = await fs.readJson(legacyPath);
            lastChapters.push({
              id: data.id || cid,
              title: data.title || '',
              elements: data.elements || [],
              sceneProperties: data.sceneProperties || { sceneName: data.title || '', backgroundImage: '', backgroundMusic: '' }
            });
          } catch {}
        }
      }
      // 若通过 project.json 未取到，则再回退扫描旧格式根目录 JSON
      if (lastChapters.length === 0 && await fs.pathExists(chaptersDir)) {
        const files = (await fs.readdir(chaptersDir)).filter(f => f.toLowerCase().endsWith('.json')).sort();
        const pick = files.slice(-3);
        for (const f of pick) {
          try {
            const data = await fs.readJson(path.join(chaptersDir, f));
            lastChapters.push({
              id: data.id || path.basename(f, '.json'),
              title: data.title || '',
              elements: data.elements || [],
              sceneProperties: data.sceneProperties || { sceneName: data.title || '', backgroundImage: '', backgroundMusic: '' }
            });
          } catch {}
        }
      }
    } catch {}

    // 构造提示词与系统指令（约束输出 JSON）
    const settings = store.get('settings', defaultSettings);
    const engineKey = settings?.ai?.selectedEngine || 'openai';
    const model = settings?.ai?.engines?.[engineKey]?.model || 'gpt-4';
    const systemPrompt = `你是一个擅长视觉小说/galgame写作的助手。基于提供的项目信息、角色设定与最近剧情，生成“下一章”的单章骨架。

必须遵守：
1) 仅输出一个章节（禁止预置或引用任何后续章节）；
2) 该章节必须且仅包含【一个 text 元素】与【一个 choice 元素】；
3) choice 的每个选项只包含字段 text，不得包含 target/action/id 等跳转信息（由应用稍后回填）；
4) 不输出任何与 JSON 无关的文字、注释或代码块标记；
5) 提供一个高质量的英文图片提示词 imagePrompt（用于背景图生成，聚焦场景、氛围、风格，避免人物姓名）。

输出 JSON 示例（注意：不包含 chapter.id，elements 仅示例结构）：
{
  "title": "章节标题",
  "elements": [
    { "type": "text", "character": "旁白或角色名", "text": "一段完整的对话或叙述", "id": "element_0" },
    { "type": "choice", "description": "选择提示", "choices": [ { "text": "选项1" }, { "text": "选项2" } ], "id": "element_1" }
  ],
  "newCharacters": [ { "name": "(可选)新角色名", "note": "(可选)角色描述" } ],
  "imagePrompt": "Highly-detailed anime background of ... (English)"
}`;

    const userPrompt = {
      instruction: '请生成下一章内容，语言与风格延续前文，包含角色对话和玩家选择分支。',
      hint: hint || '',
      project: {
        name: project?.name || '',
        description: project?.description || '',
        author: project?.author || '',
        genre: project?.genre || ''
      },
      characters: characters.map(c => ({ id: c.id || c.name, name: c.name, description: c.description || c.brief || c.bio || '' })),
      recentChapters: lastChapters.map(ch => ({
        id: ch.id,
        title: ch.title,
        elements: Array.isArray(ch.elements) ? ch.elements : [],
        sceneProperties: ch.sceneProperties || undefined
      })),
      constraints: {
        maxChoices,
        output: 'json-only',
        format: 'galgame-timeline'
      }
    };

    // 调用文本生成（沿用 call-ai 的提供者与鉴权配置）
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(userPrompt) }
    ];

    const textResp = await (async () => {
      // 直接复用内部 provider 调用逻辑，避免额外 IPC 嵌套
      const engine = settings?.ai?.engines?.[engineKey] || {};
      const requestOptions = { provider: engineKey, model, messages };
      if (engineKey === 'openai') return callOpenAI(engine, requestOptions);
      if (engineKey === 'ollama') return callOllama(engine, requestOptions);  
      if (engineKey === 'llamacpp') return callLlamaCpp(engine, requestOptions);
      return callCustomAI(engine, requestOptions);
    })();

    let content = '';
    if (textResp && typeof textResp === 'string') {
      content = textResp.trim();
    } else {
      throw new Error('文本生成失败：返回内容为空');
    }

    // 提取 JSON（容错：剥离代码块/杂质）
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : content;
  let chapter = JSON.parse(jsonText);

    // 强制格式化：修复AI可能返回的错误结构
    // 1. 如果有 name 键且没有 sceneName，将 name 改为 sceneName
    if (chapter.name && !chapter.sceneName) {
      chapter.sceneName = chapter.name;
      delete chapter.name;
    }
    
    // 2. 如果场景属性在根层级，移入 sceneProperties
    const sceneKeys = ['sceneName', 'backgroundImage', 'backgroundMusic'];
    let needsRestructure = false;
    const sceneProps = chapter.sceneProperties || {};
    
    sceneKeys.forEach(key => {
      if (chapter.hasOwnProperty(key)) {
        sceneProps[key] = chapter[key];
        delete chapter[key];
        needsRestructure = true;
      }
    });
    
    if (needsRestructure) {
      chapter.sceneProperties = sceneProps;
    }

    // 兜底结构 - 按GalGame章节格式
  const elementId = (index) => `element_${index}`;
  const chapterId = `chapter_${Date.now()}`;
    
  if (!chapter.elements || !Array.isArray(chapter.elements)) {
      // 如果AI返回的是旧格式，转换为新格式
      chapter.elements = [];
      if (chapter.text) {
        chapter.elements.push({
          type: 'text',
          character: chapter.speaker || '',
          text: chapter.text,
          id: elementId(0)
        });
      }
      if (chapter.choices && Array.isArray(chapter.choices)) {
        chapter.elements.push({
          type: 'choice',
          description: '玩家选择',
          choices: chapter.choices.map(c => ({
            text: c.text || c
          })),
          id: elementId(1)
        });
      }
    }

    // 确保章节格式符合要求：一个text + 一个choice
    const textElements = chapter.elements.filter(el => el.type === 'text');
    const choiceElements = chapter.elements.filter(el => el.type === 'choice');
    
    // 重构elements数组，确保只有一个text和一个choice
    const correctedElements = [];
    
    // 处理text元素：只保留第一个，或创建默认的
    if (textElements.length > 0) {
      correctedElements.push({
        ...textElements[0],
        id: elementId(0)
      });
    } else {
      correctedElements.push({
        type: 'text',
        character: '旁白',
        text: '剧情继续...',
        id: elementId(0)
      });
    }
    
    // 处理choice元素：只保留第一个，或创建默认的
    if (choiceElements.length > 0) {
      const choice = choiceElements[0];
      // 严格移除预置跳转信息
      const sanitizedChoices = (choice.choices || []).slice(0, 3).map((opt) => ({ text: (opt && (opt.text || opt.content)) || '' }));
      correctedElements.push({
        type: 'choice',
        description: choice.description || '请选择',
        choices: sanitizedChoices,
        id: elementId(1)
      });
    } else {
      // 创建默认选择
      correctedElements.push({
        type: 'choice',
        description: '请选择',
        choices: [ { text: '继续' } ],
        id: elementId(1)
      });
    }

    chapter = {
      id: chapterId,
      title: chapter.title || '未命名章节',
      sceneProperties: chapter.sceneProperties || {
        sceneName: chapter.title || '新场景',
        backgroundImage: '',
        backgroundMusic: ''
      },
      elements: correctedElements, // 使用修正后的元素数组
      newCharacters: Array.isArray(chapter.newCharacters) ? chapter.newCharacters : [],
      imagePrompt: chapter.imagePrompt || ''
    };

    // 如果缺少 imagePrompt，基于文本元素自动生成一个通用英文提示词（兜底）
    if (!chapter.imagePrompt) {
      try {
        const firstText = correctedElements.find(e => e.type === 'text')?.text || '';
        const safeSummary = String(firstText).slice(0, 160).replace(/\n/g, ' ');
        chapter.imagePrompt = `Highly detailed anime visual novel background, cinematic lighting, clean composition, rich details. Scene based on: ${safeSummary}. No characters, focus on environment.`;
      } catch {}
    }

    // 生成图片（若提供 imagePrompt）
    let image = null;
    if (chapter.imagePrompt) {
      const imageCfg = settings?.ai?.image || {};
      if (!imageCfg.apiKey) {
        // 若未配置图片服务，则仅返回章节，前端可提示补全配置
      } else {
        if (typeof fetch !== 'function') {
          const { fetch: undiciFetch } = require('undici');
          global.fetch = undiciFetch;
        }
         const endpoint = (imageCfg.baseURL || '').replace(/\/$/, '') + '/v1/images/generations';
         const requestData = {
           model: imageCfg.model || 'image-model',
           prompt: chapter.imagePrompt,
           image_size: (imageSize && typeof imageSize === 'string' && imageSize.trim()) ? imageSize.trim() : (imageCfg.defaultSize || '1920x1080'),
           batch_size: 1,
           num_inference_steps: imageCfg.steps ?? 20,
           guidance_scale: imageCfg.guidance ?? 7.5
         };
         const resp = await fetch(endpoint, {
           method: 'POST',
           headers: { 'Authorization': `Bearer ${imageCfg.apiKey}`, 'Content-Type': 'application/json' },
           body: JSON.stringify(requestData)
         });
         if (!resp.ok) throw new Error(`Image API error: ${resp.status} ${await resp.text()}`);
         const imgResp = await resp.json();
         if (imgResp?.images?.length) image = imgResp.images[0];
       }
     }

     return { success: true, chapter, image };
  } catch (error) {
    console.error('ai-continue-chapter error:', error);
    return { success: false, error: error?.message || String(error) };
  }
});
// 应用退出时清理
app.on('before-quit', () => {
  if (aiProcess) {
    aiProcess.kill()
  }
})

// 初始化应用
app.whenReady().then(() => {
  initializeSettings()
})

ipcMain.handle('save-project', async (event, saveData) => {
  try {
    const { path: projectPath, content, metadata } = saveData
    const projectFilePath = path.join(projectPath, 'project.json')
    
    // 读取现有项目数据
    const existingData = JSON.parse(await fs.readFile(projectFilePath, 'utf-8'))
    
    // 更新项目数据
    const updatedData = {
      ...existingData,
      ...metadata,
      updatedAt: new Date().toISOString()
    }
    
    // 保存项目文件
    await fs.writeFile(projectFilePath, JSON.stringify(updatedData, null, 2))
    
    // 保存内容到主文件
    const contentPath = path.join(projectPath, 'content.md')
    await fs.writeFile(contentPath, content)
    
    return { success: true }
  } catch (error) {
    console.error('保存项目失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('delete-project', async (event, projectPath) => {
  try {
    // 递归删除项目目录
    await fs.rm(projectPath, { recursive: true, force: true })
    return { success: true }
  } catch (error) {
    console.error('删除项目失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('export-project', async (event, exportData) => {
  try {
    const { projectPath, content, format, metadata } = exportData
    const projectName = metadata.title || path.basename(projectPath)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `${projectName}-${timestamp}.${format}`
    
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: fileName,
      filters: [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'Markdown Files', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    
    if (!result.canceled) {
      await fs.writeFile(result.filePath, content)
      return { success: true, filePath: result.filePath }
    }
    
    return { success: false, error: '用户取消保存' }
  } catch (error) {
    console.error('导出项目失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('open-project', async (event, projectPath) => {
  try {
    const fs = require('fs').promises
    const path = require('path')
    
    console.log('尝试打开项目:', projectPath)
    
    // 确保路径是绝对路径
    const absoluteProjectPath = path.resolve(projectPath)
    console.log('解析后的绝对路径:', absoluteProjectPath)
    
    // 检查项目路径是否存在
    const projectJsonPath = path.join(absoluteProjectPath, 'project.json')
    console.log('项目文件路径:', projectJsonPath)
    
    try {
      await fs.access(projectJsonPath)
      console.log('项目文件存在')
    } catch (error) {
      console.error('项目文件不存在:', projectJsonPath)
      throw new Error(`项目文件不存在: ${projectJsonPath}`)
    }
    
    // 读取项目文件
    const projectData = await fs.readFile(projectJsonPath, 'utf8')
    const project = JSON.parse(projectData)
    
    // 确保项目对象有必要的属性
    if (!project.metadata) {
      project.metadata = {}
    }
    
    if (!project.chapters) {
      project.chapters = []
    }
    
    if (!project.settings) {
      project.settings = {}
    }
    
    // 设置项目路径
    project.path = absoluteProjectPath
    
    console.log('项目打开成功:', project.metadata.title)
    
    return { 
      success: true, 
      project: project
    }
  } catch (error) {
    console.error('打开项目失败:', error)
    return { 
      success: false, 
      error: error.message 
    }
  }
})

// AI 相关 API
ipcMain.handle('call-ai', async (event, options) => {
  try {
    const settings = store.get('settings', defaultSettings)
    const { provider, model, prompt, systemPrompt, context, temperature, maxTokens } = options
    
    console.log('AI call options:', options)
    
    const engine = settings.ai?.engines?.[provider] || settings.ai?.engines?.[settings.ai?.selectedEngine]
    if (!engine) {
      throw new Error('未配置所选AI引擎，请在设置中填写密钥与地址')
    }
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      throw new Error('提示词为空')
    }
    
    let response
    
    // 构建消息数组，严格按照OpenAI官方文档格式
    const messages = []
    
    // 添加系统提示（如果存在）
    if (systemPrompt && systemPrompt.trim()) {
      messages.push({
        role: 'system',
        content: systemPrompt.trim()
      })
    }
    
    // 构建用户消息
    let userContent = prompt
    const contextStr = typeof context === 'string' ? context : (context?.context || '')
    if (contextStr && contextStr.trim()) {
      userContent = `${prompt}\n\n需要处理的文本：\n${contextStr.trim()}`
    }
    
    messages.push({
      role: 'user',
      content: userContent
    })
    
    console.log('Constructed messages:', JSON.stringify(messages, null, 2))
    
    // 构建请求参数
    const requestOptions = {
      messages: messages
    }
    
    // 添加可选参数（只有在明确设置时才包含）
    if (temperature !== undefined) {
      requestOptions.temperature = temperature
    } else if (settings.ai.temperature !== undefined) {
      requestOptions.temperature = settings.ai.temperature
    }
    
    if (maxTokens !== undefined) {
      requestOptions.maxTokens = maxTokens
    } else if (settings.ai.maxTokens !== undefined) {
      requestOptions.maxTokens = settings.ai.maxTokens
    }
    
    // 对于llama.cpp，构建单一prompt
    if (provider === 'llamacpp') {
      let llamaPrompt = ''
      if (systemPrompt && systemPrompt.trim()) {
        llamaPrompt += systemPrompt.trim() + '\n\n'
      }
      llamaPrompt += userContent
      requestOptions.prompt = llamaPrompt
    }
    
    console.log('Final request options:', JSON.stringify(requestOptions, null, 2))
    
    switch (provider) {
      case 'openai':
        response = await callOpenAI(engine, requestOptions)
        break
      case 'ollama':
        response = await callOllama(engine, requestOptions)
        break
      case 'llamacpp':
        response = await callLlamaCpp(engine, requestOptions)
        break
      case 'custom':
        response = await callCustomAI(engine, requestOptions)
        break
      default:
        throw new Error(`未知的 AI 提供商: ${provider}`)
    }
    
    return { success: true, content: response }
  } catch (error) {
    console.error('AI 调用失败:', error)
    return { success: false, error: error?.message || 'AI 调用失败' }
  }
})

// 更新设置 API
ipcMain.handle('update-settings', async (event, settings) => {
  try {
    const currentSettings = store.get('settings', defaultSettings)
    
    // 深合并函数
    function deepMerge(target, source) {
      const result = { ...target }
      
      for (const key in source) {
        if (source.hasOwnProperty(key)) {
          if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
            result[key] = deepMerge(target[key] || {}, source[key])
          } else {
            result[key] = source[key]
          }
        }
      }
      
      return result
    }
    
    const mergedSettings = deepMerge(currentSettings, settings)
    store.set('settings', mergedSettings)
    
    try {
      const mask = (obj) => {
        if (!obj || typeof obj !== 'object') return obj
        const out = Array.isArray(obj) ? [] : {}
        Object.keys(obj).forEach(k => {
          const v = obj[k]
          if (k.toLowerCase() === 'apikey') {
            out[k] = v ? '***' : ''
          } else if (v && typeof v === 'object') {
            out[k] = mask(v)
          } else {
            out[k] = v
          }
        })
        return out
      }
      console.log('Settings updated successfully, merged AI engines:', JSON.stringify(mask(mergedSettings.ai?.engines || {}), null, 2))
    } catch {
      console.log('Settings updated successfully')
    }
    
    return { success: true }
  } catch (error) {
    console.error('更新设置失败:', error)
    return { success: false, error: error.message }
  }
})

// Git 相关 API
ipcMain.handle('git-init', async (event, projectPath) => {
  return new Promise((resolve) => {
    exec('git init', { 
      cwd: projectPath,
      shell: true 
    }, (error) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        resolve({ success: true })
      }
    })
  })
})

ipcMain.handle('git-add', async (event, projectPath, files) => {
  return new Promise((resolve) => {
    const fileList = Array.isArray(files) ? files.join(' ') : files
    exec(`git add ${fileList}`, { 
      cwd: projectPath,
      shell: true 
    }, (error) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        resolve({ success: true })
      }
    })
  })
})

ipcMain.handle('git-push', async (event, projectPath, remote = 'origin', branch = null) => {
  return new Promise((resolve) => {
    // 首先检查是否有提交
    exec('git log --oneline -1', { 
      cwd: projectPath,
      shell: true 
    }, (logError, logOutput) => {
      if (logError) {
        resolve({ success: false, error: '没有可推送的提交，请先提交一些内容' })
        return
      }

      // 获取当前分支
      exec('git branch --show-current', { 
        cwd: projectPath,
        shell: true 
      }, (branchError, branchOutput) => {
        const currentBranch = branch || (branchError ? 'main' : branchOutput.trim())
        
        if (!currentBranch) {
          resolve({ success: false, error: '无法确定当前分支' })
          return
        }
        
        // 检查远程仓库是否存在
        exec('git remote -v', { 
          cwd: projectPath,
          shell: true 
        }, (remoteError, remoteOutput) => {
          if (remoteError || !remoteOutput.includes(remote)) {
            resolve({ success: false, error: `远程仓库 '${remote}' 不存在，请先添加远程仓库` })
            return
          }
          
          // 执行推送
          exec(`git push ${remote} ${currentBranch}`, { 
            cwd: projectPath,
            shell: true 
          }, (error, stdout, stderr) => {
            if (error) {
              // 如果是首次推送，尝试设置上游分支
              if (error.message.includes('does not match any') || error.message.includes('no upstream') || stderr.includes('does not match any')) {
                exec(`git push -u ${remote} ${currentBranch}`, { 
                  cwd: projectPath,
                  shell: true 
                }, (retryError, retryStdout) => {
                  if (retryError) {
                    resolve({ success: false, error: `推送失败: ${retryError.message}` })
                  } else {
                    resolve({ success: true, message: `推送成功并设置上游分支 (${currentBranch})` })
                  }
                })
              } else {
                resolve({ success: false, error: `推送失败: ${error.message}` })
              }
            } else {
              resolve({ success: true, message: '推送成功' })
            }
          })
        })
      })
    })
  })
})

ipcMain.handle('git-pull', async (event, projectPath, remote, branch) => {
  return new Promise((resolve) => {
    exec(`git pull ${remote} ${branch}`, { 
      cwd: projectPath,
      shell: true 
    }, (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        const hasChanges = stdout.includes('files changed') || stdout.includes('file changed')
        resolve({ success: true, hasChanges })
      }
    })
  })
})

ipcMain.handle('git-add-remote', async (event, projectPath, name, url) => {
  return new Promise((resolve) => {
    exec(`git remote add ${name} ${url}`, { 
      cwd: projectPath,
      shell: true 
    }, (error) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        resolve({ success: true })
      }
    })
  })
})

ipcMain.handle('git-clone', async (event, url, localPath) => {
  return new Promise((resolve) => {
    exec(`git clone ${url} "${localPath}"`, {
      shell: true
    }, (error) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        resolve({ success: true })
      }
    })
  })
})

ipcMain.handle('git-log', async (event, projectPath, limit) => {
  return new Promise((resolve) => {
    const cmd = `git log --oneline -${limit || 20} --format="%H|%s|%an|%ad" --date=short`
    exec(cmd, { 
      cwd: projectPath,
      shell: true 
    }, (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        const commits = stdout.trim().split('\n').map(line => {
          const [hash, subject, author, date] = line.split('|')
          return { hash, subject, author, date }
        })
        resolve({ success: true, commits })
      }
    })
  })
})

// Git 分支操作
ipcMain.handle('git-create-branch', async (event, projectPath, branchName) => {
  return new Promise((resolve) => {
    exec(`git checkout -b ${branchName}`, { 
      cwd: projectPath,
      shell: true 
    }, (error) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        resolve({ success: true, message: `分支 ${branchName} 创建成功` })
      }
    })
  })
})

ipcMain.handle('git-switch-branch', async (event, projectPath, branchName) => {
  return new Promise((resolve) => {
    exec(`git checkout ${branchName}`, { 
      cwd: projectPath,
      shell: true 
    }, (error) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        resolve({ success: true, message: `切换到分支 ${branchName}` })
      }
    })
  })
})

ipcMain.handle('git-delete-branch', async (event, projectPath, branchName, force = false) => {
  return new Promise((resolve) => {
    // 检查是否为当前分支
    exec('git branch --show-current', { 
      cwd: projectPath,
      shell: true 
    }, (branchError, branchOutput) => {
      const currentBranch = branchError ? '' : branchOutput.trim()
      
      if (currentBranch === branchName) {
        resolve({ success: false, error: '不能删除当前分支，请先切换到其他分支' })
        return
      }
      
      const deleteCmd = force ? `git branch -D ${branchName}` : `git branch -d ${branchName}`
      
      exec(deleteCmd, { 
        cwd: projectPath,
        shell: true 
      }, (error) => {
        if (error) {
          if (error.message.includes('not fully merged')) {
            resolve({ 
              success: false, 
              error: '分支未完全合并，使用强制删除或先合并分支',
              needsForce: true 
            })
          } else {
            resolve({ success: false, error: error.message })
          }
        } else {
          resolve({ success: true, message: `分支 ${branchName} 删除成功` })
        }
      })
    })
  })
})

ipcMain.handle('git-push-branch', async (event, projectPath, branchName, remote = 'origin') => {
  return new Promise((resolve) => {
    exec(`git push -u ${remote} ${branchName}`, { 
      cwd: projectPath,
      shell: true 
    }, (error) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        resolve({ success: true, message: `分支 ${branchName} 推送成功` })
      }
    })
  })
})

ipcMain.handle('git-get-branches', async (event, projectPath) => {
  return new Promise((resolve) => {
    exec('git branch -a', { 
      cwd: projectPath,
      shell: true 
    }, (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        const branches = stdout.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('*'))
          .map(line => {
            const current = line.startsWith('*')
            const name = line.replace(/^\*\s*/, '').replace(/^remotes\/[^\/]+\//, '')
            const isRemote = line.includes('remotes/')
            return {
              name,
              current,
              isRemote,
              fullName: line.replace(/^\*\s*/, '')
            }
          })
        
       

        const currentBranch = stdout.split('\n')
          .find(line => line.startsWith('*'))
          ?.replace(/^\*\s*/, '') || 'main'
        
        resolve({ 
          success: true, 
          branches,
          currentBranch: currentBranch.replace(/^remotes\/[^\/]+\//, '')
        })
      }
    })
  })
})

// Git 远程仓库操作
ipcMain.handle('git-remove-remote', async (event, projectPath, remoteName) => {
  return new Promise((resolve) => {
    exec(`git remote remove ${remoteName}`, { 
      cwd: projectPath,
      shell: true 
    }, (error) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        resolve({ success: true, message: `远程仓库 ${remoteName} 删除成功` })
      }
    })
  })
})

ipcMain.handle('git-rename-remote', async (event, projectPath, oldName, newName) => {
  return new Promise((resolve) => {
    exec(`git remote rename ${oldName} ${newName}`, { 
      cwd: projectPath,
      shell: true 
    }, (error) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        resolve({ success: true, message: `远程仓库 ${oldName} 重命名为 ${newName}` })
      }
    })
  })
})

ipcMain.handle('git-fetch-remote', async (event, projectPath, remoteName) => {
  return new Promise((resolve) => {
    exec(`git fetch ${remoteName}`, { 
      cwd: projectPath,
      shell: true 
    }, (error) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        resolve({ success: true, message: `远程仓库 ${remoteName} 获取成功` })
      }
    })
  })
})

ipcMain.handle('git-get-remotes', async (event, projectPath) => {
  return new Promise((resolve) => {
    exec('git remote -v', { 
      cwd: projectPath,
      shell: true 
    }, (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        const remotes = {}
        stdout.split('\n')
          .filter(line => line.trim())
          .forEach(line => {
            const [name, url, type] = line.split(/\s+/)
            if (name && url) {
              if (!remotes[name]) {
                remotes[name] = { name, urls: {} }
              }
              remotes[name].urls[type?.replace(/[()]/g, '') || 'fetch'] = url
            }
          })
        
        resolve({ 
          success: true, 
          remotes: Object.values(remotes)
        })
      }
    })
  })
})

// 获取远程仓库列表
ipcMain.handle('git-list-remotes', async (event, projectPath) => {
  return new Promise((resolve) => {
    exec('git remote -v', { 
      cwd: projectPath,
      shell: true 
    }, (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        const lines = stdout.trim().split('\n').filter(line => line.trim())
        const remoteMap = {}
        
        lines.forEach(line => {
          const parts = line.split(/\s+/)
          if (parts.length >= 2) {
            const name = parts[0]
            const url = parts[1]
            if (!remoteMap[name]) {
              remoteMap[name] = { name, url, type: 'fetch' }
            }
          }
        })
        
        const remotes = Object.values(remoteMap)
        resolve({ success: true, remotes })
      }
    })
  })
})

// 获取分支列表
ipcMain.handle('git-list-branches', async (event, projectPath, includeRemote = false) => {
  return new Promise((resolve) => {
    const cmd = includeRemote ? 'git branch -a' : 'git branch'
    exec(cmd, { 
      cwd: projectPath,
           shell: true 
    }, (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {



        const branches = stdout.trim().split('\n').map(line => {
          const cleanLine = line.replace(/^\*\s*/, '').trim()
          const isCurrent = line.startsWith('*')
          const isRemote = cleanLine.startsWith('remotes/')
          
          return { 
            name: cleanLine, 
            current: isCurrent, 
            type: isRemote ? 'remote' : 'local' 
          }
        }).filter(branch => branch.name && branch.name !== '' && !branch.name.includes('HEAD'))
        
        resolve({ success: true, branches })
      }
    })
  })
})

// 获取当前分支信息
ipcMain.handle('git-current-branch', async (event, projectPath) => {
  return new Promise((resolve) => {
    exec('git branch --show-current', { 
      cwd: projectPath,
      shell: true 
    }, (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        resolve({ success: true, branch: stdout.trim() })
      }
    })
  })
})

// 获取远程仓库状态
ipcMain.handle('git-remote-status', async (event, projectPath, remote = 'origin') => {
  return new Promise((resolve) => {
    exec(`git remote show ${remote}`, { 
      cwd: projectPath,
      shell: true 
    }, (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        resolve({ success: true, status: stdout })
      }
    })
  })
})

// 获取提交差异
ipcMain.handle('git-diff', async (event, projectPath, commitHash1, commitHash2) => {
  return new Promise((resolve) => {
    const cmd = commitHash2 ? `git diff ${commitHash1} ${commitHash2}` : `git diff ${commitHash1}`
    exec(cmd, { cwd: projectPath }, (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        resolve({ success: true, diff: stdout })
      }
    })
  })
})

// 同步远程仓库（fetch）
ipcMain.handle('git-fetch', async (event, projectPath, remote = 'origin') => {
  return new Promise((resolve) => {
    exec(`git fetch ${remote}`, { 
      cwd: projectPath,
      shell: true 
    }, (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        resolve({ success: true, output: stdout })
      }
    })
  })
})

// 自动保存和备份
let autoSaveTimer = null
let backupTimer = null

ipcMain.handle('enable-auto-save', async (event, projectPath, interval) => {
  try {
    // 清除现有定时器
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer)
    }
    
    // 设置新的自动保存定时器
    autoSaveTimer = setInterval(async () => {
      // 触发自动保存事件
      if (mainWindow) {
        mainWindow.webContents.send('auto-save-trigger')
      }
    }, interval)
    
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('disable-auto-save', async () => {
  try {
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer)
      autoSaveTimer = null
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('create-backup', async (event, projectPath) => {
  try {
    const settings = store.get('settings', defaultSettings)
    const backupDir = path.join(settings.general.projectsDir, 'backups')
    
    // 确保备份目录存在
    await fs.mkdir(backupDir, { recursive: true })
    
    const projectName = path.basename(projectPath)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(backupDir, `${projectName}-${timestamp}.zip`)
    
    // 创建压缩包
    await createZipBackup(projectPath, backupPath)
    
    return { success: true, backupPath }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

async function createZipBackup(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fsSync.createWriteStream(outputPath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    
    output.on('close', () => resolve())
    archive.on('error', reject)
    
    archive.pipe(output)
    archive.directory(sourceDir, false)
    archive.finalize()
  })
}

// 字数计算函数
function getWordCount(text) {
  // 中文字符计数
  const chineseCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  // 英文单词计数
  const englishCount = text.replace(/[\u4e00-\u9fa5]/g, '').split(/\s+/).filter(word => word.length > 0).length;
  return chineseCount + englishCount;
}

// 章节操作
ipcMain.handle('save-chapter', async (event, { projectPath, chapterId, title, content }) => {
  try {
    const chaptersDir = path.join(projectPath, 'chapters')
    
    // 确保章节目录存在
    await fs.mkdir(chaptersDir, { recursive: true })
    
    // 创建章节子目录
    const chapterDir = path.join(chaptersDir, chapterId)
    await fs.mkdir(chapterDir, { recursive: true })
    
    // 保存GalGame JSON格式内容
    const contentPath = path.join(chapterDir, 'content.json')
    
    // 如果传入的是字符串（旧格式），转换为JSON格式
    let jsonContent;
    if (typeof content === 'string') {
      jsonContent = {
        scenes: [{
          id: 'scene_1',
          name: '场景1',
          elements: [{
            type: 'text',
            content: content,
            timestamp: 0
          }],
          background: '',
          music: '',
          effects: []
        }]
      };
    } else {
      jsonContent = content;
    }
    
    await fs.writeFile(contentPath, JSON.stringify(jsonContent, null, 2), 'utf-8')
    
    // 计算字数（从JSON内容中提取文本）
    let textContent = '';
    if (typeof content === 'string') {
      textContent = content;
    } else if (jsonContent && jsonContent.scenes) {
      textContent = jsonContent.scenes
        .flatMap(scene => scene.elements || [])
        .filter(element => element.type === 'text' || element.type === 'dialogue')
        .map(element => element.content || element.text || '')
        .join(' ');
    }
    const wordCount = getWordCount(textContent)
    
    // 检查是否已有元数据文件以获取创建时间
    const metadataPath = path.join(chapterDir, 'metadata.json')
    let createdAt = new Date().toISOString()
    
    try {
      const existingMetadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'))
      createdAt = existingMetadata.createdAt || createdAt
    } catch (error) {
      // 文件不存在，使用当前时间
    }
    
    // 保存元数据
    const metadata = {
      id: chapterId,
      title: title,
      wordCount: wordCount,
      lastModified: new Date().toISOString(),
      createdAt: createdAt
    }
    
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
    
    // 更新项目文件中的章节列表
    const projectFilePath = path.join(projectPath, 'project.json')
    const projectData = JSON.parse(await fs.readFile(projectFilePath, 'utf-8'))
    
    // 确保 chapters 是数组
    if (!Array.isArray(projectData.chapters)) {
      projectData.chapters = []
    }
    
    // 查找或添加章节
    const existingChapterIndex = projectData.chapters.findIndex(ch => ch && ch.id === chapterId)
    const chapterInfo = {
      id: chapterId,
      title: title,
      wordCount: wordCount,
      lastModified: new Date().toISOString(),
      createdAt: createdAt, // 包含创建时间
      directory: chapterId
    }
    
    if (existingChapterIndex >= 0) {
      projectData.chapters[existingChapterIndex] = chapterInfo
    } else {
      projectData.chapters.push(chapterInfo)
    }
    
    // 更新项目修改时间
    projectData.updatedAt = new Date().toISOString()
    
    // 保存项目文件
    await fs.writeFile(projectFilePath, JSON.stringify(projectData, null, 2), 'utf-8')
    
    return { success: true, chapterDir }
  } catch (error) {
    console.error('Save chapter error:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('load-chapter', async (event, { projectPath, chapterId }) => {
  try {
    const chapterDir = path.join(projectPath, 'chapters', chapterId)
    
    // 读取内容文件（优先读取JSON格式）
    let content;
    const jsonContentPath = path.join(chapterDir, 'content.json')
    const mdContentPath = path.join(chapterDir, 'content.md')
    
    try {
      // 首先尝试读取JSON格式
      const jsonContent = await fs.readFile(jsonContentPath, 'utf-8')
      content = JSON.parse(jsonContent)
    } catch (error) {
      // 如果JSON不存在，尝试读取MD格式并转换
      try {
        const mdContent = await fs.readFile(mdContentPath, 'utf-8')
        content = {
          scenes: [{
            id: 'scene_1',
            name: '场景1',
            elements: [{
              type: 'text',
              content: mdContent,
              timestamp: 0
            }],
            background: '',
            music: '',
            effects: []
          }]
        }
        // 保存为新的JSON格式
        await fs.writeFile(jsonContentPath, JSON.stringify(content, null, 2), 'utf-8')
      } catch (e) {
        console.error('读取章节内容失败:', e);
        // 创建默认内容
        content = {
          scenes: [{
            id: 'scene_1',
            name: '场景1',
            elements: [],
            background: '',
            music: '',
            effects: []
          }]
        };
        // 保存默认内容
        await fs.writeFile(jsonContentPath, JSON.stringify(content, null, 2), 'utf-8')
      }
    }
    
    // 读取元数据文件
    const metadataPath = path.join(chapterDir, 'metadata.json')
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'))
    
    // 合并数据
    const chapterData = {
      ...metadata,
      content: content
    }
    
    return { success: true, chapter: chapterData }
  } catch (error) {
    console.error('Load chapter error:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('delete-chapter', async (event, { projectPath, chapterId }) => {
  try {
    const chapterDir = path.join(projectPath, 'chapters', chapterId)
    
    // 删除整个章节目录
    await fs.rm(chapterDir, { recursive: true, force: true })
    
    // 更新项目文件
    const projectFilePath = path.join(projectPath, 'project.json')
    const projectData = JSON.parse(await fs.readFile(projectFilePath, 'utf-8'))
    
    // 确保 chapters 是数组
    if (!Array.isArray(projectData.chapters)) {
      projectData.chapters = []
    }
    
    // 从章节列表中移除
    projectData.chapters = projectData.chapters.filter(ch => ch && ch.id !== chapterId)
    
    // 更新项目修改时间
    projectData.updatedAt = new Date().toISOString()
    
    // 保存项目文件
    await fs.writeFile(projectFilePath, JSON.stringify(projectData, null, 2), 'utf-8')
    
    return { success: true }
  } catch (error) {
    console.error('Delete chapter error:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('rename-chapter', async (event, { projectPath, chapterId, newTitle }) => {
  try {
    const chapterDir = path.join(projectPath, 'chapters', chapterId)
    
    // 更新章节元数据
    const metadataPath = path.join(chapterDir, 'metadata.json')
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'))
    
    // 更新标题和修改时间
    metadata.title = newTitle
    metadata.lastModified = new Date().toISOString()
    
    // 保存元数据
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
    
    // 更新项目文件中的章节列表
    const projectFilePath = path.join(projectPath, 'project.json')
    const projectData = JSON.parse(await fs.readFile(projectFilePath, 'utf-8'))
    
    // 确保 chapters 是数组
    if (!Array.isArray(projectData.chapters)) {
      projectData.chapters = []
    }
    
    // 查找并更新章节
    const chapterIndex = projectData.chapters.findIndex(ch => ch && ch.id === chapterId)
    if (chapterIndex >= 0) {
      projectData.chapters[chapterIndex].title = newTitle
      projectData.chapters[chapterIndex].lastModified = new Date().toISOString()
    }
    
    // 更新项目修改时间
    projectData.updatedAt = new Date().toISOString()
    
    // 保存项目文件
    await fs.writeFile(projectFilePath, JSON.stringify(projectData, null, 2), 'utf-8')
    
    return { success: true }
  } catch (error) {
    console.error('Rename chapter error:', error)
    return { success: false, error: error.message }
  }
})

// 字体管理
ipcMain.handle('get-system-fonts', async () => {
  try {
    // 获取系统字体列表
    const systemFonts = [
      'Arial', 'Times New Roman', 'Helvetica', 'Georgia', 'Verdana',
      'Trebuchet MS', 'Arial Black', 'Impact', 'Lucida Console',
      'Tahoma', 'Palatino', 'Garamond', 'Bookman', 'Avant Garde',
      'SimSun', 'SimHei', 'Microsoft YaHei', 'KaiTi', 'FangSong',
      'LiSu', 'YouYuan', 'STXihei', 'STKaiti', 'STSong'
    ]
    
    return { success: true, fonts: systemFonts }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('add-custom-font', async (event, fontPath) => {
  try {
    const fontName = path.basename(fontPath, path.extname(fontPath))
    const settings = store.get('settings', defaultSettings)
    
    if (!settings.editor.customFonts) {
      settings.editor.customFonts = []
    }
    
    // 检查字体是否已存在
    const existingFont = settings.editor.customFonts.find(f => f.path === fontPath)
    if (existingFont) {
      return { success: false, error: '字体已存在' }
    }
    
    // 添加字体
    settings.editor.customFonts.push({
      name: fontName,
      path: fontPath,
      addedAt: new Date().toISOString()
    })
    
    store.set('settings', settings)
    
    return { success: true, font: { name: fontName, path: fontPath } }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('remove-custom-font', async (event, fontPath) => {
  try {
    const settings = store.get('settings', defaultSettings)
    
    if (!settings.editor.customFonts) {
      return { success: true }
    }
    
    settings.editor.customFonts = settings.editor.customFonts.filter(f => f.path !== fontPath)
    store.set('settings', settings)
    
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 主题管理
ipcMain.handle('set-theme', async (event, theme) => {
  try {
    const settings = store.get('settings', defaultSettings)
    settings.general.theme = theme
    store.set('settings', settings)
    
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('get-theme', async () => {
  try {
    const settings = store.get('settings', defaultSettings)
    return { success: true, theme: settings.general.theme || 'dark' }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 过滤AI回答中的<think>标签
function filterThinkTags(content) {
  if (!content || typeof content !== 'string') {
    return content
  }
  
  // 移除<think>标签及其内容（支持多行）
  return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

// 备份文件夹操作
ipcMain.handle('open-backup-folder', async () => {
  try {
    const settings = store.get('settings', defaultSettings)
    const backupDir = path.join(settings.general.projectsDir, 'backups')
    
    // 确保备份文件夹存在
    await fs.mkdir(backupDir, { recursive: true })
    
    // 打开文件夹
    shell.openPath(backupDir)
    
    return { success: true }
  } catch (error) {
    console.error('Open backup folder error:', error)
    return { success: false, error: error.message }
  }
})

// 设置导入导出
ipcMain.handle('export-settings', async (event, filePath) => {
  try {
    const settings = store.get('settings', defaultSettings)
    
    // 移除敏感信息（API密钥等）
    const exportSettings = JSON.parse(JSON.stringify(settings))
    if (exportSettings.ai?.engines?.openai?.apiKey) {
      exportSettings.ai.engines.openai.apiKey = '***已隐藏***'
    }
    if (exportSettings.ai?.engines?.custom?.apiKey) {
      exportSettings.ai.engines.custom.apiKey = '***已隐藏***'
    }
    
    await fs.writeFile(filePath, JSON.stringify(exportSettings, null, 2), 'utf-8')
    
    return { success: true }
  } catch (error) {
    console.error('Export settings error:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('import-settings', async (event, filePath) => {
  try {
    const data = await fs.readFile(filePath, 'utf-8')
    const importedSettings = JSON.parse(data)
    
    // 合并设置，保留现有的敏感信息
    const currentSettings = store.get('settings', defaultSettings)
    const mergedSettings = {
      ...defaultSettings,
      ...importedSettings
    }
    
    // 保留当前的API密钥（如果导入的设置中包含占位符）
    if (importedSettings.ai?.engines?.openai?.apiKey === '***已隐藏***') {
      mergedSettings.ai.engines.openai.apiKey = currentSettings.ai?.engines?.openai?.apiKey || ''
    }
    if (importedSettings.ai?.engines?.custom?.apiKey === '***已隐藏***') {
      mergedSettings.ai.engines.custom.apiKey = currentSettings.ai?.engines?.custom?.apiKey || ''
    }
    
    store.set('settings', mergedSettings)
    
    return { success: true }
  } catch (error) {
    console.error('Import settings error:', error)
    return { success: false, error: error.message }
  }
})

// AI连接测试
ipcMain.handle('test-ai-connection', async (event, engine, engineSettings) => {
  try {
    console.log('=== AI连接测试开始 ===')
    console.log('引擎参数:', engine, '(类型:', typeof engine, ')')
    try {
      const mask = (obj) => {
        if (!obj || typeof obj !== 'object') return obj
        const out = Array.isArray(obj) ? [] : {}
        Object.keys(obj).forEach(k => {
          const v = obj[k]
          if (k.toLowerCase() === 'apikey') {
            out[k] = v ? '***' : ''
          } else if (v && typeof v === 'object') {
            out[k] = mask(v)
          } else {
            out[k] = v
          }
        })
        return out
      }
      console.log('设置参数:', JSON.stringify(mask(engineSettings), null, 2))
    } catch { console.log('设置参数: [masked]') }
    
    // 检查参数有效性
    if (!engine || typeof engine !== 'string') {
      const errorMsg = `无效的引擎参数: ${typeof engine} - ${engine}`
      console.error(errorMsg)
      return { success: false, error: errorMsg }
    }
    if (!engineSettings || typeof engineSettings !== 'object') {
      const errorMsg = `无效的引擎设置参数: ${typeof engineSettings}`
      console.error(errorMsg)
      return { success: false, error: errorMsg }
    }
    
    let testResult = false
    let errorMessage = ''
    
    console.log('开始测试引擎:', engine)
    
    switch (engine) {
      case 'openai':
        if (!engineSettings.apiKey) {
          throw new Error('OpenAI API Key is required')
        }
        
        console.log('测试OpenAI连接...')
        try {
          const response = await axios.post(
            `${engineSettings.baseURL || 'https://api.openai.com/v1'}/chat/completions`,
            {
              model: engineSettings.model || 'gpt-3.5-turbo',
              messages: [{ role: 'user', content: 'Hello' }],
              max_tokens: 5
            },
            {
              headers: {
                'Authorization': `Bearer ${engineSettings.apiKey}`,
                'Content-Type': 'application/json'
              },
              timeout: 30000
            }
          )
          
          testResult = response.status === 200
          console.log('OpenAI连接测试结果:', testResult)
        } catch (error) {
          errorMessage = error.response?.data?.error?.message || error.message
          console.error('OpenAI连接测试失败:', errorMessage)
        }
        break
        
      case 'ollama':
        console.log('测试Ollama连接...')
        try {
          const response = await axios.get(
            `${engineSettings.baseURL || 'http://localhost:11434'}/api/tags`,
            { timeout: 5000 }
          )
          
          testResult = response.status === 200
          console.log('Ollama连接测试结果:', testResult)
        } catch (error) {
          errorMessage = error?.message?.includes('ECONNREFUSED') ? '无法连接到 Ollama 服务器（拒绝连接）' : '无法连接到 Ollama 服务器'
          console.error('Ollama连接测试失败:', error.message)
        }
        break
        
      case 'llamacpp':
        console.log('测试Llama.cpp连接...')
        try {
          const response = await axios.get(
            `${engineSettings.baseURL || 'http://localhost:8080'}/health`,
            { timeout: 5000 }
          )
          
          testResult = response.status === 200
          console.log('Llama.cpp连接测试结果:', testResult)
        } catch (error) {
          errorMessage = error?.message?.includes('ECONNREFUSED') ? '无法连接到 Llama.cpp 服务（拒绝连接）' : '无法连接到 Llama.cpp 服务'
          console.error('Llama.cpp连接测试失败:', error.message)
        }
        break
        
      case 'custom':
        console.log('测试自定义API连接...')
        console.log('Custom API settings:', {
          hasApiKey: !!engineSettings.apiKey,
          baseURL: engineSettings.baseURL,
          model: engineSettings.model,
          temperature: engineSettings.temperature,
          maxTokens: engineSettings.maxTokens
        })
        
        if (!engineSettings.baseURL || engineSettings.baseURL.trim() === '') {
          throw new Error('Custom API Base URL is required')
        }
        if (!engineSettings.model || engineSettings.model.trim() === '') {
          throw new Error('Custom API Model is required')
        }
        
        try {
          const response = await axios.post(
            `${engineSettings.baseURL.trim()}/chat/completions`,
            {
              model: engineSettings.model.trim(),
              messages: [{ role: 'user', content: 'Hello' }],
              max_tokens: 5,
              temperature: engineSettings.temperature || 0.7
            },
            {
              headers: {
                'Authorization': `Bearer ${engineSettings.apiKey}`,
                'Content-Type': 'application/json'
              },
              timeout: 30000
            }
          )
          
          testResult = response.status === 200
          console.log('自定义API连接测试结果:', testResult)
        } catch (error) {
          errorMessage = error.response?.data?.error?.message || error.message
          console.error('自定义API连接测试失败:', errorMessage)
        }
        break
        
      default:
        throw new Error(`Unsupported engine: ${engine}`)
    }
    
    console.log('=== AI连接测试完成 ===')
    return { success: testResult, error: errorMessage }
  } catch (error) {
    console.error('AI连接测试异常:', error)
    return { success: false, error: error.message }
  }
})

// Git状态获取
ipcMain.handle('get-git-status', async (event, projectPath) => {
  try {
    console.log('Getting git status for:', projectPath)
    
    // 检查是否是Git仓库
    try {
      await fs.access(path.join(projectPath, '.git'))
    } catch (error) {
      return {
        success: true,
        status: {
          isRepo: false,
          isClean: true,
          changedFiles: 0,
          message: 'Not a Git repository'
        }
      }
    }
    
    return new Promise((resolve) => {
      exec('git status --porcelain', { cwd: projectPath, shell: true }, (error, stdout) => {
        if (error) {
          console.error('Git status error:', error)
          resolve({
            success: false,
            error: error.message
          })
          return
        }
        
        const files = stdout.trim().split('\n').filter(line => line.length > 0)
        const changedFiles = files.length
        const isClean = changedFiles === 0
        
        resolve({
          success: true,
          status: {
            isRepo: true,
            isClean,
            changedFiles,
            files,
            message: isClean ? 'Working tree clean' : `${changedFiles} file(s) changed`
          }
        })
      })
    })
    
  } catch (error) {
    console.error('Get git status error:', error)
    return { success: false, error: error.message }
  }
})

// Git 删除远程仓库
ipcMain.handle('git-delete-remote', async (event, projectPath, remoteName) => {
  return new Promise((resolve) => {
    exec(`git remote remove ${remoteName}`, { 
      cwd: projectPath,
      shell: true 
    }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        resolve({ success: true, message: `远程仓库 ${remoteName} 已删除` })
      }
    })
  })
})

// Git 获取远程分支列表
ipcMain.handle('git-get-remote-branches', async (event, projectPath, remoteName = 'origin') => {
  return new Promise((resolve) => {
    exec(`git ls-remote --heads ${remoteName}`, { 
      cwd: projectPath,
      shell: true 
    }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: error.message })
      } else {
        try {
          const branches = stdout.split('\n')
            .filter(line => line.trim())
            .map(line => {
              const parts = line.split('\t')
              if (parts.length >= 2) {
                return {
                  name: parts[1].replace('refs/heads/', ''),
                  hash: parts[0]
                }
              }
              return null
            })
            .filter(branch => branch !== null)
          
          resolve({ success: true, branches })
        } catch (parseError) {
          resolve({ success: false, error: 'Failed to parse remote branches' })
        }
      }
    })
  })
})

// 系统路径相关 IPC 处理
// 获取文档目录
ipcMain.handle('get-documents-path', () => {
  return app.getPath('documents')
})

// 获取下载目录
ipcMain.handle('get-downloads-path', () => {
  return app.getPath('downloads')
})

// 教程相关 IPC 处理
// 获取教程目录
ipcMain.handle('get-tutorial-directory', async () => {
  try {
    // 处理打包后的路径问题
    let tutorialPath
    if (isPackaged) {
      // 打包后，tutorial目录可能在多个位置
      const possiblePaths = [
        path.join(process.resourcesPath, 'tutorial'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'tutorial'),
        path.join(__dirname, '..', '..', 'tutorial'),
        path.join(__dirname, '..', 'tutorial')
      ]
      
      for (const possiblePath of possiblePaths) {
        try {
          await fs.access(possiblePath)
          tutorialPath = possiblePath
          break
        } catch (e) {
          // 继续尝试下一个路径
        }
      }
      
      if (!tutorialPath) {
        console.error('在打包环境中找不到教程目录，尝试的路径:', possiblePaths)
        throw new Error('找不到教程目录')
      }
    } else {
      // 在开发环境中，使用根目录的环境变量
      const rootDir = process.env.ARTIMEOW_ROOT || path.join(__dirname, '..', '..', '..')
      tutorialPath = path.join(rootDir, 'lib', 'editor', 'tutorial')
    }
    
    return tutorialPath
  } catch (error) {
    console.error('获取教程目录失败:', error)
    throw error
  }
})

// 读取所有教程文件
ipcMain.handle('read-tutorial-files', async () => {
  try {
    // 处理打包后的路径问题
    let tutorialPath
    if (isPackaged) {
      // 打包后，tutorial目录可能在多个位置
      const possiblePaths = [
        path.join(process.resourcesPath, 'tutorial'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'tutorial'),
        path.join(__dirname, '..', '..', 'tutorial'),
        path.join(__dirname, '..', 'tutorial')
      ]
      
      for (const possiblePath of possiblePaths) {
        try {
          await fs.access(possiblePath)
          tutorialPath = possiblePath
          break
        } catch (e) {
          // 继续尝试下一个路径
        }
      }
      
      if (!tutorialPath) {
        console.error('在打包环境中找不到教程目录，尝试的路径:', possiblePaths)
        throw new Error('找不到教程目录')
      }
    } else {
      // 在开发环境中，使用根目录的环境变量
      const rootDir = process.env.ARTIMEOW_ROOT || path.join(__dirname, '..', '..', '..')
      tutorialPath = path.join(rootDir, 'lib', 'editor', 'tutorial')
    }
    
    console.log('读取教程文件，路径:', tutorialPath)
    const files = await fs.readdir(tutorialPath)
    
    const tutorialFiles = []
    
    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(tutorialPath, file)
        const content = await fs.readFile(filePath, 'utf8')
        tutorialFiles.push({
          filename: file,
          content: content
        })
      }
    }
    
    return tutorialFiles
  } catch (error) {
    console.error('读取教程文件失败:', error)
    throw error
  }
})

// 读取单个教程文件
ipcMain.handle('read-tutorial-file', async (event, filename) => {
  try {
    // 处理打包后的路径问题
    let tutorialPath
    if (isPackaged) {
      // 打包后，tutorial目录可能在多个位置
      const possiblePaths = [
        path.join(process.resourcesPath, 'tutorial'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'tutorial'),
        path.join(__dirname, '..', '..', 'tutorial'),
        path.join(__dirname, '..', 'tutorial')
      ]
      
      for (const possiblePath of possiblePaths) {
        try {
          await fs.access(possiblePath)
          tutorialPath = possiblePath
          break
        } catch (e) {
          // 继续尝试下一个路径
        }
      }
      
      if (!tutorialPath) {
        console.error('在打包环境中找不到教程目录，尝试的路径:', possiblePaths)
        throw new Error('找不到教程目录')
      }
    } else {
      tutorialPath = path.join(__dirname, '..', 'tutorial')
    }
    
    const filePath = path.join(tutorialPath, filename)
    
    // 检查文件是否存在
    const exists = await fs.access(filePath).then(() => true).catch(() => false)
    if (!exists) {
      throw new Error(`教程文件不存在: ${filename}`)
    }
    
    const content = await fs.readFile(filePath, 'utf8')
    return {
      filename: filename,
      content: content
    }
  } catch (error) {
    console.error('读取教程文件失败:', error)
    throw error
  }
})

// 获取应用版本信息
ipcMain.handle('get-app-version-info', async () => {
  try {
    // 读取主package.json
    const rootDir = process.env.ARTIMEOW_ROOT || path.join(__dirname, '..', '..', '..')
    const packageJsonPath = isPackaged ?
      path.join(process.resourcesPath, 'app.asar', 'package.json') :
      path.join(rootDir, 'package.json')
    
    logger.info('读取package.json路径:', packageJsonPath)
    
    let packageInfo
    try {
      if (isPackaged) {
        // 在打包环境中，直接使用require读取
        packageInfo = require(path.join(rootDir, 'package.json'))
      } else {
        // 在开发环境中，读取文件
        const packageContent = await fs.readFile(packageJsonPath, 'utf8')
        packageInfo = JSON.parse(packageContent)
      }
    } catch (error) {
      logger.error('无法读取package.json，使用备用方法:', error)
      // 备用方法：直接require根目录的package.json
      packageInfo = require(path.join(rootDir, 'package.json'))
    }

    // 获取Node.js模块路径
    const nodeModulesPath = isPackaged ?
      path.join(process.resourcesPath, 'app.asar', 'node_modules') :
      path.join(__dirname, '..', 'node_modules')

    // 读取关键依赖包的版本信息
    const getDependencyVersion = async (packageName) => {
      try {
        if (isPackaged) {
          // 在打包环境中，尝试从app.asar中读取
          try {
            const depPackage = require(path.join(__dirname, '..', 'node_modules', packageName, 'package.json'))
            return depPackage.version
          } catch (error) {
            // 如果打包环境中读取失败，从主package.json中获取
            const version = packageInfo.dependencies?.[packageName] || packageInfo.devDependencies?.[packageName]
            return version ? version.replace(/[\^~]/, '') : 'Unknown'
          }
        } else {
          // 在开发环境中读取文件
          const depPackagePath = path.join(__dirname, '..', 'node_modules', packageName, 'package.json')
          const depContent = await fs.readFile(depPackagePath, 'utf8')
          const depPackage = JSON.parse(depContent)
          return depPackage.version
        }
      } catch (error) {
        logger.warn(`无法获取 ${packageName} 版本:`, error)
        // 备用方法：从主package.json的dependencies中获取
        const version = packageInfo.dependencies?.[packageName] || packageInfo.devDependencies?.[packageName]
        return version ? version.replace(/[\^~]/, '') : 'Unknown'
      }
    }

    // 获取Electron版本（特殊处理）
    const getElectronVersion = () => {
      try {
        return process.versions.electron || 'Unknown'
      } catch (error) {
        logger.warn('无法获取Electron版本:', error)
        return packageInfo.devDependencies?.electron?.replace(/[\^~]/, '') || 'Unknown'
      }
    }

    // 获取关键包版本
    const [
      markedVersion,
      axiosVersion,
      highlightjsVersion,
      electronStoreVersion,
      archiverVersion,
      diffVersion,
      extractZipVersion
    ] = await Promise.all([
      getDependencyVersion('marked'),
      getDependencyVersion('axios'),
      getDependencyVersion('highlight.js'),
      getDependencyVersion('electron-store'),
      getDependencyVersion('archiver'),
      getDependencyVersion('diff'),
      getDependencyVersion('extract-zip')
    ])

    const versionInfo = {
      app: {
        name: packageInfo.name || 'artimeow-ai-galgame-writer',
        version: packageInfo.version || '1.1.0',
        description: packageInfo.description || 'ArtiMeow - AI 集成小说写作桌面应用'
      },
      system: {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        electron: getElectronVersion()
      },
      dependencies: {
        'marked': markedVersion,
        'axios': axiosVersion,
        'highlight.js': highlightjsVersion,
        'electron-store': electronStoreVersion,
        'archiver': archiverVersion,
        'diff': diffVersion,
        'extract-zip': extractZipVersion
      },
      buildInfo: {
        isPackaged: isPackaged,
        resourcesPath: process.resourcesPath || 'N/A',
        execPath: process.execPath
      }
    }

    logger.info('版本信息收集完成:', versionInfo)
    return versionInfo

  } catch (error) {
    logger.error('获取版本信息失败:', error)
    // 返回基本信息作为备用
    return {
      app: {
        name: 'artimeow-aiwriter',
        version: '1.1.0',
        description: 'ArtiMeow - AI 集成小说写作桌面应用'
      },
      system: {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        electron: process.versions.electron || 'Unknown'
      },
      dependencies: {
        'marked': 'Unknown',
        'axios': 'Unknown',
        'highlight.js': 'Unknown',
        'electron-store': 'Unknown',
        'archiver': 'Unknown',
        'diff': 'Unknown',
        'extract-zip': 'Unknown'
      },
      buildInfo: {
        isPackaged: isPackaged,
        resourcesPath: process.resourcesPath || 'N/A',
        execPath: process.execPath
      },
      error: error.message
    }
  }
})

// Shell操作处理
ipcMain.handle('shell-open-external', async (event, url) => {
  try {
    await shell.openExternal(url)
    return { success: true }
  } catch (error) {
    logger.error('打开外部链接失败:', error)
    return { success: false, error: error.message }
  }
})

// ========================================
// Web服务器相关处理器
// ========================================

// Web服务器相关代码已移除

// ========================================
// GalGame 专用 API 处理器
// ========================================

// 获取GalGame项目目录
ipcMain.handle('galgame-get-projects-dir', () => {
  return getProjectsDirectory()
})

// 创建GalGame项目
ipcMain.handle('galgame-create-project', async (event, projectData) => {
  try {
    const projectsDir = getProjectsDirectory()
    await fs.ensureDir(projectsDir)
    
    const projectPath = path.join(projectsDir, projectData.id)
    await fs.ensureDir(projectPath)
    
    // 通知前端开始创建项目
    event.sender.send('project-creation-progress', { stage: 'structure', message: '正在创建项目结构...' })
    
    // 创建data目录结构 - 游戏数据放在data子目录
    const dataPath = path.join(projectPath, 'data')
    await fs.ensureDir(dataPath)
    
    // 创建项目结构（在data目录中）
    const projectStructure = {
      info: {
        id: projectData.id,
        title: projectData.title,
        description: projectData.description || '',
        author: projectData.author || '',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      chapters: [],
      characters: [],
      variables: {},
      settings: {
        defaultBackground: '',
        music: {
          bgm: '',
          volume: 0.7
        },
        ui: {
          textSpeed: 50,
          autoPlay: false
        }
      }
    }
    
    // 写入项目文件（在data目录中）
    await fs.writeJson(path.join(dataPath, 'project.json'), projectStructure, { spaces: 2 })
    
    // 创建资源目录（在data目录中）
    await fs.ensureDir(path.join(dataPath, 'assets'))
    await fs.ensureDir(path.join(dataPath, 'assets', 'backgrounds'))
    await fs.ensureDir(path.join(dataPath, 'assets', 'characters'))
    await fs.ensureDir(path.join(dataPath, 'assets', 'music'))
    await fs.ensureDir(path.join(dataPath, 'assets', 'sounds'))
    
    // 通知前端开始创建Electron项目
    event.sender.send('project-creation-progress', { stage: 'electron', message: '正在创建Electron项目结构...' })
    
    // 创建完整的Electron项目结构（在项目根目录）
    const electronPackageJson = {
      name: `galgame-${projectData.id}`,
      version: '1.0.0',
      description: projectData.description || projectData.title,
      main: 'main.js',
      scripts: {
        start: 'electron .',
        dev: 'electron . --dev',
        build: 'electron-builder',
        'build-win': 'electron-builder --win',
        'build-mac': 'electron-builder --mac',
        'build-linux': 'electron-builder --linux'
      },
      build: {
        appId: `com.artimeow.galgame.${projectData.id}`,
        productName: projectData.title,
        directories: {
          output: 'dist'
        },
        files: [
          'main.js',
          'src/**/*',
          'data/**/*',
          'node_modules/**/*',
          'package.json'
        ],
        win: {
          target: 'nsis',
          icon: 'src/assets/icon.ico'
        },
        mac: {
          target: 'dmg',
          icon: 'src/assets/icon.icns'
        },
        linux: {
          target: 'AppImage',
          icon: 'src/assets/icon.png'
        }
      },
      keywords: ['galgame', 'visual-novel', 'artimeow'],
      author: projectData.author || 'Unknown',
      license: 'MIT',
      devDependencies: {
        electron: '^38.0.0',
        'electron-builder': '^26.0.12'
      },
      dependencies: {
        'fs-extra': '^11.3.1',
        'music-metadata': '^11.8.3'
      }
    }
    
    // 写入Electron项目的package.json
    await fs.writeJson(path.join(projectPath, 'package.json'), electronPackageJson, { spaces: 2 })
    
    // 复制播放器源代码到项目src目录
    const srcPath = path.join(projectPath, 'src')
    const playerSourcePath = path.join(__dirname, '..', '..', 'player', 'src')
    await fs.copy(playerSourcePath, srcPath)
    
    // 创建项目的main.js（基于播放器的main.js但做适配）
    const mainJsContent = `
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');

class GalGameApp {
  constructor() {
    this.mainWindow = null;
    this.init();
  }

  async init() {
    await app.whenReady();
    this.createMainWindow();
    this.setupIPCHandlers();
  }

  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'src', 'preload.js'),
        webSecurity: false
      },
      show: false,
      frame: false,
      titleBarStyle: 'hidden',
      backgroundColor: '#1a1a2e',
      icon: path.join(__dirname, 'src', 'assets', 'icon.ico')
    });

    this.mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      ${process.env.NODE_ENV === 'development' ? '' : '// '}if (process.env.NODE_ENV === 'development') {
        this.mainWindow.webContents.openDevTools();
      }
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  setupIPCHandlers() {
    // 窗口控制
    ipcMain.handle('window-minimize', (event) => {
      try {
        const win = BrowserWindow.fromWebContents(event?.sender) || this.mainWindow;
        win?.minimize();
      } catch {}
    });

    ipcMain.handle('window-maximize', (event) => {
      try {
        const win = BrowserWindow.fromWebContents(event?.sender) || this.mainWindow;
        if (!win) return;
        if (win.isMaximized()) win.restore(); else win.maximize();
      } catch {}
    });

    ipcMain.handle('window-close', (event) => {
      try {
        const win = BrowserWindow.fromWebContents(event?.sender) || this.mainWindow;
        win?.close();
      } catch {}
    });

    // 文件系统操作
    ipcMain.handle('fs-exists', async (event, filePath) => {
      return await fs.pathExists(filePath);
    });

    ipcMain.handle('fs-read-json', async (event, filePath) => {
      return await fs.readJson(filePath);
    });

    ipcMain.handle('fs-read-file', async (event, filePath) => {
      return await fs.readFile(filePath, 'utf8');
    });

    ipcMain.handle('fs-readdir', async (event, dirPath) => {
      try { return await fs.readdir(dirPath); } catch (e) { return []; }
    });

    ipcMain.handle('app-get-path', (event, name) => {
      return app.getPath(name);
    });

    // 获取游戏数据目录
    ipcMain.handle('get-game-data-dir', () => {
      return path.join(__dirname, 'data');
    });
  }
}

app.whenReady().then(() => {
  new GalGameApp();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    new GalGameApp();
  }
});
`;

    await fs.writeFile(path.join(projectPath, 'main.js'), mainJsContent.trim())
    
    // 通知前端开始安装依赖
    event.sender.send('project-creation-progress', { stage: 'dependencies', message: '正在安装项目依赖...' })
    
    // 安装npm依赖
    await new Promise((resolve, reject) => {
      const npm = spawn('npm', ['install'], {
        cwd: projectPath,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      
      npm.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`npm install failed with code ${code}`))
        }
      })
      
      npm.on('error', reject)
    })
    
    // 通知前端项目创建完成
    event.sender.send('project-creation-progress', { stage: 'complete', message: '项目创建完成！' })
    
    logger.info('GalGame项目创建成功:', projectData.title)
    return { success: true, projectPath, dataPath }
  } catch (error) {
    logger.error('创建GalGame项目失败:', error)
    event.sender.send('project-creation-progress', { stage: 'error', message: `创建失败: ${error.message}` })
    return { success: false, error: error.message }
  }
})

// 项目打包处理器
ipcMain.handle('package-project', async (event, options = {}) => {
  try {
    console.log('开始打包项目:', options);
    
    // 这里实现项目打包逻辑
    // 目前返回模拟结果
    return {
      success: true,
      message: '打包功能正在开发中',
      outputPath: options.outputPath || 'dist'
    };
    
  } catch (error) {
    logger.error('项目打包失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 文件对话框处理器
ipcMain.handle('showOpenDialog', async (event, options) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result;
  } catch (error) {
    logger.error('打开文件对话框失败:', error);
    return { canceled: true, error: error.message };
  }
});

// 注意：show-open-dialog 和 show-save-dialog 已在上方定义，此处不重复注册

// 追踪当前预览进程（若有）
let currentPreviewPid = null;

async function killPreviewIfRunning() {
  try {
    if (!currentPreviewPid) return;
    const pid = currentPreviewPid;
    currentPreviewPid = null;
    // 根据平台终止进程
    if (process.platform === 'win32') {
      // /T 终止进程树，/F 强制
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { detached: false, stdio: 'ignore', shell: true });
    } else {
      spawn('kill', ['-9', String(pid)], { detached: false, stdio: 'ignore' });
    }
    logger.info('已终止已有预览进程:', pid);
  } catch (e) {
    logger.warn('终止已有预览进程失败（可能已退出）:', e?.message || e);
  }
}

// 启动播放器预览的通用方法
async function startPlayerPreview(projectPath) {
  // 构建播放器路径（开发态：项目根/lib/player；打包态：asar.unpacked 内 /lib/player）
  const appRootPath = getAppRootPath();
  let playerPath;
  if (isPackaged && appRootPath.endsWith('.asar')) {
    // 打包态：始终指向 asar.unpacked
    const unpackedPath = appRootPath.replace(/\.asar$/, '.asar.unpacked');
    playerPath = path.join(unpackedPath, 'lib', 'player');
  } else {
    // 开发态
    playerPath = path.join(appRootPath, 'lib', 'player');
  }

  // 打包态下预览前自动安装依赖
  if (isPackaged && appRootPath.endsWith('.asar')) {
    const nodeModules = path.join(playerPath, 'node_modules');
    const fsExtraPath = path.join(nodeModules, 'fs-extra');
    const musicMetaPath = path.join(nodeModules, 'music-metadata');
    let needInstall = false;
    if (!(await fs.pathExists(nodeModules))) needInstall = true;
    if (!(await fs.pathExists(fsExtraPath))) needInstall = true;
    if (!(await fs.pathExists(musicMetaPath))) needInstall = true;
    if (needInstall) {
      logger.info('检测到 player 依赖缺失，自动执行 npm install...');
      let installOk = false;
      let lastError = '';
      // 优先尝试 npm.cmd/npm
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      try {
        await new Promise((resolve, reject) => {
          const proc = spawn(npmCmd, ['install'], {
            cwd: playerPath,
            shell: process.platform === 'win32',
            stdio: 'inherit'
          });
          proc.on('exit', code => {
            if (code === 0) resolve();
            else reject(new Error('npm install 失败，退出码 ' + code));
          });
        });
        installOk = true;
      } catch (e) {
        lastError = e && e.message ? e.message : String(e);
        logger.error('npm install 失败:', lastError);
      }
      // 若失败再尝试 npx npm install
      if (!installOk) {
        const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        try {
          await new Promise((resolve, reject) => {
            const proc = spawn(npx, ['npm', 'install'], {
              cwd: playerPath,
              shell: process.platform === 'win32',
              stdio: 'inherit'
            });
            proc.on('exit', code => {
              if (code === 0) resolve();
              else reject(new Error('npx npm install 失败，退出码 ' + code));
            });
          });
          installOk = true;
        } catch (e2) {
          lastError += '\n' + (e2 && e2.message ? e2.message : String(e2));
          logger.error('npx npm install 也失败:', e2);
        }
      }
      if (!installOk) {
        // 弹窗指引用户手动安装
        const msg = `player 依赖自动安装失败，请手动在如下目录执行 npm install：\n${playerPath}\n\n详细错误：${lastError}`;
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('show-error-dialog', {
            title: '依赖安装失败',
            message: msg
          });
        }
        throw new Error(msg);
      }
      logger.info('player 依赖安装完成');
    }
  }

  logger.info('启动项目预览:', projectPath);

  // 若已存在预览实例，先终止
  await killPreviewIfRunning();

  // 入口校验
  const entryToUse = path.join(playerPath, 'src', 'main.js');
  if (!(await fs.pathExists(playerPath))) {
    throw new Error('找不到播放器目录: ' + playerPath);
  }
  if (!(await fs.pathExists(entryToUse))) {
    throw new Error('找不到播放器入口文件: ' + entryToUse);
  }

  // 组装参数
  const projectArg = process.platform === 'win32' ? `--project-dir=${JSON.stringify(projectPath)}` : `--project-dir=${projectPath}`;
  const entryArg = process.platform === 'win32' ? JSON.stringify(entryToUse) : entryToUse;
  const baseArgs = [entryArg, '--preview-mode', projectArg];

  let cmd = null; let cmdArgs = [];
  if (!isPackaged) {
    // 开发态：优先使用本地 electron 可执行文件
    const localElectronCmd = process.platform === 'win32' ? 'electron.cmd' : 'electron';
    const localElectron = path.join(appRootPath, 'node_modules', '.bin', localElectronCmd);
    if (await fs.pathExists(localElectron)) {
      cmd = localElectron; cmdArgs = baseArgs;
    } else { cmd = localElectronCmd; cmdArgs = baseArgs; }
  } else {
    // 打包态：使用 npx electron 启动（依赖系统 Node.js），给出更稳定的外部进程
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    cmd = npx; cmdArgs = ['electron', ...baseArgs];
  }

  // 启动播放器进程
  const previewCwd = isPackaged ? process.resourcesPath : playerPath;
  logger.info('启动播放器命令:', { cmd, args: cmdArgs, cwd: previewCwd });
  const playerProcess = spawn(cmd, cmdArgs, {
    detached: true,
    stdio: 'ignore',
    cwd: previewCwd,
    shell: process.platform === 'win32'
  });

  // 分离进程，使其独立运行
  playerProcess.unref();

  logger.info('预览模式播放器已启动，进程ID:', playerProcess.pid);

  // 记录当前预览进程 PID，便于下次启动时终止
  currentPreviewPid = playerProcess.pid;
  // 清理：当子进程退出时重置
  try {
    playerProcess.on?.('exit', () => { if (currentPreviewPid === playerProcess.pid) currentPreviewPid = null; });
    playerProcess.on?.('close', () => { if (currentPreviewPid === playerProcess.pid) currentPreviewPid = null; });
  } catch {}

  return {
    success: true,
    message: '预览模式已启动',
    pid: playerProcess.pid
  };
}

// 预览项目功能 - 启动播放器（预览模式）
ipcMain.handle('preview-project', async (event, projectPath) => {
  try {
    return await startPlayerPreview(projectPath);
  } catch (error) {
    logger.error('启动预览失败:', error);
    return { success: false, error: error.message };
  }
});

// 兼容旧渲染层调用：editor-preview-project/editor-launch-player
ipcMain.handle('editor-preview-project', async (event, projectPath) => {
  try {
    return await startPlayerPreview(projectPath);
  } catch (error) {
    logger.error('启动预览失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('editor-launch-player', async (event, projectPath) => {
  try {
    return await startPlayerPreview(projectPath);
  } catch (error) {
    logger.error('启动播放器失败:', error);
    return { success: false, error: error.message };
  }
});

// 注意：不再使用 handleMap 转发，以上两个 handler 已直接实现

// 编辑器->播放器调试命令占位（外部进程当前不支持直连）
ipcMain.handle('editor-to-player', async (event, command, data) => {
  logger.info('收到 editor-to-player 命令，但当前未实现跨进程调试通道:', command, data);
  return { success: false, error: '调试命令通道未实现（外部播放器）' };
});

// 扫描目录
ipcMain.handle('scan-directory', async (event, dirPath) => {
  try {
    const files = [];
    
    const scanRecursive = async (currentPath) => {
      try {
        const items = await fs.readdir(currentPath);
        for (const item of items) {
          const fullPath = path.join(currentPath, item);
          const stat = await fs.stat(fullPath);
          
          if (stat.isDirectory()) {
            await scanRecursive(fullPath);
          } else {
            files.push(fullPath.replace(/\\/g, '/'));
          }
        }
      } catch (error) {
        // 忽略无法访问的目录
      }
    };
    
    await scanRecursive(dirPath);
    return files;
  } catch (error) {
    logger.error('扫描目录失败:', error);
    return [];
  }
});

// 扫描目录（包含目录项，支持空文件夹）
ipcMain.handle('scan-directory-with-dirs', async (event, dirPath) => {
  try {
    const entries = [];
    const visit = async (p) => {
      let items;
      try { items = await fs.readdir(p); } catch { items = []; }
      // 即使空目录也要把目录本身加入（除根）
      if (p !== dirPath) entries.push({ path: p.replace(/\\/g,'/'), type: 'dir' });
      for (const name of items) {
        const full = path.join(p, name);
        let stat;
        try { stat = await fs.stat(full); } catch { continue; }
        if (stat.isDirectory()) {
          await visit(full);
        } else {
          entries.push({ path: full.replace(/\\/g,'/'), type: 'file' });
        }
      }
    };
    await visit(dirPath);
    return entries;
  } catch (e) {
    logger.error('scan-directory-with-dirs 失败:', e);
    return [];
  }
});

// 获取文件统计
ipcMain.handle('get-file-stats', async (event, filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      mtime: stats.mtime,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile()
    };
  } catch (error) {
    logger.error('获取文件统计失败:', error);
    throw error;
  }
});

// 检查路径是否存在处理器
ipcMain.handle('path-exists', async (event, filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
});

// 压缩目录为ZIP文件
ipcMain.handle('zip-directory', async (event, sourcePath, outputPath) => {
  try {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const output = fsSync.createWriteStream(outputPath);
    
    return new Promise((resolve, reject) => {
      output.on('close', () => {
        resolve({ success: true, bytes: archive.pointer() });
      });
      
      archive.on('error', (err) => {
        reject({ success: false, error: err.message });
      });
      
      archive.pipe(output);
      archive.directory(sourcePath, false);
      archive.finalize();
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 在资源管理器中显示项目/文件
ipcMain.handle('show-item-in-folder', async (event, targetPath) => {
  try {
    const stat = await fs.stat(targetPath).catch(() => null)
    if (stat && stat.isDirectory()) {
      // 如果是目录，直接打开目录
      await shell.openPath(targetPath)
    } else {
      // 如果是文件，定位到文件
      shell.showItemInFolder(targetPath)
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 打开目录或路径（不以“打开文件”形式）
ipcMain.handle('shell-open-path', async (event, targetPath) => {
  try {
    const resolved = path.resolve(String(targetPath || ''))
    const errMsg = await shell.openPath(resolved)
    if (errMsg) {
      return { success: false, error: errMsg }
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})
    
    // 原生消息框（确认/取消）
    ipcMain.handle('show-message-box', async (event, options = {}) => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender)
        const result = await dialog.showMessageBox(win || null, Object.assign({
          type: 'question',
          buttons: ['是','否'],
          defaultId: 0,
          cancelId: 1,
          title: options.title || '确认',
          message: options.message || '请确认',
          detail: options.detail || ''
        }, options))
        return { success: true, response: result.response }
      } catch (error) {
        return { success: false, error: error.message }
      }
    })

// 打开“发布外部编辑器”独立窗口
ipcMain.handle('open-publish-editor', async (event, options = {}) => {
  try {
    const { root } = options || {}
    // 若已存在窗口则聚焦
    if (publishEditorWindow && !publishEditorWindow.isDestroyed()) {
      try { publishEditorWindow.focus() } catch {}
      return { success: true }
    }

    if (creatingPublishEditor) {
      // 正在创建，直接返回成功，稍后窗口会显示
      return { success: true }
    }
    creatingPublishEditor = true

    // 创建新窗口
  publishEditorWindow = new BrowserWindow({
      width: 1100,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      show: false,
      frame: false,
      title: 'Publish Text Editor',
      icon: process.platform === 'win32' ? (isPackaged ?
        path.join(process.resourcesPath, 'icon', 'icon.ico') :
        path.join(__dirname, '..', 'src', 'icon', 'icon.ico'))
        : (process.platform === 'darwin' ? getResourcePath('renderer/assets/icons/icon.icns') : getResourcePath('renderer/assets/icons/icon.png')),
      webPreferences: {
        preload: getResourcePath('preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false
      }
    })

    const editorHtml = path.join(__dirname, 'renderer', 'publish-editor.html')
    // 通过 query 传递根目录路径（编码确保安全）
    const query = root ? { root } : {}
    await publishEditorWindow.loadFile(editorHtml, { query })

    publishEditorWindow.once('ready-to-show', () => {
      try { publishEditorWindow.show() } catch {}
    })

    // 兜底：若 2 秒仍未显示，强制显示并聚焦
    setTimeout(() => {
      try {
        if (publishEditorWindow && !publishEditorWindow.isDestroyed() && !publishEditorWindow.isVisible()) {
          publishEditorWindow.show(); publishEditorWindow.focus();
        }
      } catch {}
    }, 2000)

    publishEditorWindow.webContents.on('did-fail-load', (_e, ec, desc) => {
      logger.error('发布外部编辑器加载失败:', ec, desc)
    })
    publishEditorWindow.on('unresponsive', () => { logger.warn('发布外部编辑器未响应') })

    publishEditorWindow.on('closed', () => { publishEditorWindow = null; creatingPublishEditor = false })
    creatingPublishEditor = false
    return { success: true }
  } catch (error) {
    logger.error('打开发布外部编辑器失败:', error)
    try { if (publishEditorWindow) publishEditorWindow.close() } catch {}
    publishEditorWindow = null; creatingPublishEditor = false
    return { success: false, error: error.message }
  }
})

// 删除文件
ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    await fs.remove(filePath)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 删除目录（递归）
ipcMain.handle('delete-directory', async (event, dirPath) => {
  try {
    await fs.remove(dirPath)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 设置文件权限
ipcMain.handle('chmod-file', async (event, filePath, mode) => {
  try {
    await fs.chmod(filePath, mode);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 读取目录（统一入口，避免未注册报错）
ipcMain.handle('fs-readdir', async (event, dirPath) => {
  try {
    return await fs.readdir(dirPath)
  } catch (e) {
    return []
  }
})

// 执行文件
ipcMain.handle('execute-file', async (event, filePath, args = []) => {
  try {
    // Windows 下 .bat 需要通过 cmd /c 执行
    if (process.platform === 'win32' && filePath.toLowerCase().endsWith('.bat')) {
      const cmd = `cmd /c "\"${filePath}\" ${args.join(' ')}"`
      const result = await execAsync(cmd)
      return { success: true, stdout: result.stdout, stderr: result.stderr }
    }
    const result = await execAsync(`"${filePath}" ${args.join(' ')}`);
    return { success: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 获取应用根路径（用于定位 lib/player 等）
ipcMain.handle('get-app-path', async () => {
  try {
    // 返回用于读取资源/源码的根路径（开发态为项目根，打包态为 app.asar 根）
    return getAppRootPath();
  } catch (error) {
    logger.error('获取应用路径失败:', error);
    return '';
  }
});

// 后台打包：运行命令并实时推送日志
ipcMain.handle('packager-run', async (event, cwd, command, args = []) => {
  try {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2,8)}`
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        npm_config_production: 'false',
        NODE_ENV: 'development',
        npm_config_loglevel: process.env.npm_config_loglevel || 'info',
        FORCE_COLOR: '1'
      },
    })
    packagerProcesses.set(jobId, child)

    const send = (type, data) => {
      try {
        // 推送给渲染器
        event.sender.send('packager-log', { jobId, type, data })
      } catch {}
      try {
        // 也缓存一份，方便渲染器在注册监听后拉取
        if (!packagerBuffers.has(jobId)) packagerBuffers.set(jobId, []);
        packagerBuffers.get(jobId).push({ type, data });
      } catch {}
    }

    child.stdout?.on('data', (chunk) => send('stdout', chunk.toString()))
    child.stderr?.on('data', (chunk) => send('stderr', chunk.toString()))
    child.on('error', (err) => send('error', err.message))
    child.on('close', (code) => {
      send('exit', String(code))
      packagerProcesses.delete(jobId)
    })

    return { success: true, jobId }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 提供拉取并清空缓存的接口，渲染器在注册监听后可以调用以获取早期日志
ipcMain.handle('packager-drain-buffer', async (event, jobId) => {
  try {
    const buf = packagerBuffers.get(jobId) || [];
    // 返回副本并清空原始缓存
    packagerBuffers.delete(jobId);
    return { success: true, buffer: buf };
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
});

// 后台打包（带自定义环境变量）：运行命令并实时推送日志
ipcMain.handle('packager-run-with-env', async (event, cwd, command, args = [], customEnv = {}) => {
  try {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2,8)}`
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        npm_config_production: 'false',
        NODE_ENV: 'development',
        npm_config_loglevel: process.env.npm_config_loglevel || 'info',
        FORCE_COLOR: '1',
        ...customEnv
      },
    })
    packagerProcesses.set(jobId, child)

    const send = (type, data) => {
      try { event.sender.send('packager-log', { jobId, type, data }) } catch {}
    }

    child.stdout?.on('data', (chunk) => send('stdout', chunk.toString()))
    child.stderr?.on('data', (chunk) => send('stderr', chunk.toString()))
    child.on('error', (err) => send('error', err.message))
    child.on('close', (code) => {
      send('exit', String(code))
      packagerProcesses.delete(jobId)
    })

    return { success: true, jobId }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('packager-kill', async (event, jobId) => {
  const proc = packagerProcesses.get(jobId)
  if (proc) {
    try { proc.kill('SIGTERM') } catch {}
    packagerProcesses.delete(jobId)
    return { success: true }
  }
  return { success: false, error: 'not-found' }
})

// 检测 Node.js 环境（npm 可用性）
ipcMain.handle('check-node-env', async () => {
  return new Promise((resolve) => {
    try {
      const cmd = process.platform === 'win32' ? 'npm -v' : 'npm -v';
      const child = spawn(cmd, [], { shell: true });
      let ok = false;
      child.stdout?.on('data', (d) => { ok = true; });
      child.on('close', (code) => resolve({ installed: ok && code === 0 }));
      child.on('error', () => resolve({ installed: false }));
    } catch {
      resolve({ installed: false });
    }
  });
})

// 移动文件
ipcMain.handle('move-file', async (event, srcPath, destPath) => {
  try {
    await fs.move(srcPath, destPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 读取JSON文件
ipcMain.handle('read-json-file', async (event, filePath) => {
  try {
    const data = await fs.readJson(filePath);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 写入JSON文件
ipcMain.handle('write-json-file', async (event, filePath, data) => {
  try {
    await fs.writeJson(filePath, data, { spaces: 2 });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// AI 图片生成 API
ipcMain.handle('generate-ai-image', async (event, options) => {
  try {
    // 确保全局 fetch 可用（Node 18+/Electron 20+ 内置）。
    if (typeof fetch !== 'function') {
      const { fetch: undiciFetch } = require('undici');
      global.fetch = undiciFetch;
    }
     const { model, prompt, imageSize, batchSize, steps, guidance } = options;
     const settings = store.get('settings', defaultSettings);
     // 使用手动配置
     const imageCfg = settings?.ai?.image || {};
     const apiKey = imageCfg.apiKey;
     const baseURL = imageCfg.baseURL || '';
     const finalModel = model || imageCfg.model || 'image-model';
  const defaultSize = imageCfg.defaultSize || '1920x1080';

    if (!apiKey) {
      throw new Error('未配置图片生成 API Key');
    }
    if (!baseURL) {
      throw new Error('未配置图片生成 Base URL');
    }
    
    console.log('AI image generation options:', options);
    
    let response;

    // 通用（兼容 OpenAI Images 风格）的图片生成请求
    const requestData = {
      model: finalModel,
      prompt: prompt,
      image_size: imageSize || defaultSize,
      batch_size: batchSize ?? 1,
      num_inference_steps: steps ?? imageCfg.steps ?? 20,
      guidance_scale: guidance ?? imageCfg.guidance ?? 7.5
    };

    console.log('Image generation request data:', requestData);

    const endpoint = baseURL.endsWith('/v1/images/generations')
      ? baseURL
      : `${baseURL.replace(/\/$/, '')}/v1/images/generations`;
    const apiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`Image API error: ${apiResponse.status} ${errorText}`);
    }

    response = await apiResponse.json();
    
    console.log('AI image generation response:', response);
    
    // 规范化返回，提取下载URL
    let images = [];
    if (Array.isArray(response.images)) {
      images = response.images.map(img => {
        if (typeof img === 'string') return { url: img };
        if (img?.url) return { url: img.url };
        if (img?.b64_json) return { b64_json: img.b64_json };
        return img;
      });
    }
    return { success: true, images, timings: response.timings, seed: response.seed };
  } catch (error) {
    console.error('AI 图片生成失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 下载图片到项目资源目录
ipcMain.handle('download-image-to-project', async (event, { imageUrl, projectPath, fileName }) => {
  try {
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      throw new Error(`下载图片失败: ${response.status}`);
    }
    
    // 确保资源目录存在
    const assetsDir = path.join(projectPath, 'assets', 'images');
    await fs.ensureDir(assetsDir);
    
    // 生成文件名（如果没有提供）
    if (!fileName) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      fileName = `ai-generated-${timestamp}.png`;
    }
    
    const filePath = path.join(assetsDir, fileName);
    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    
    await fs.writeFile(filePath, buffer);
    
    return {
      success: true,
      filePath: filePath,
      fileName: fileName
    };
    
  } catch (error) {
    console.error('下载图片失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});
