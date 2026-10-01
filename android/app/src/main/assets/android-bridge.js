(() => {
  if (!window.AndroidBridge) return;

  window.isWebMode = false;
  window.platform = 'android';
  window.process = { platform: 'android' };
  const pending = new Map();

  window.__androidComplete = (id, value) => {
    const resolve = pending.get(id);
    if (resolve) {
      pending.delete(id);
      resolve(value);
    }
  };

  const aliases = {
    getDataDir: 'get-data-dir',
    getPlatform: 'get-platform',
    getAppVersion: 'get-app-version',
    getAppVersionInfo: 'get-app-version-info',
    getAppPath: 'get-app-path',
    appGetPath: 'app-get-path',
    fsExists: 'fs-exists',
    fsReadJson: 'fs-read-json',
    fsWriteJson: 'fs-write-json',
    fsReadFile: 'fs-read-file',
    fsReaddir: 'fs-readdir',
    openSettings: 'open-settings',
    getSettings: 'get-settings',
    getProjectList: 'get-project-list',
    saveProject: 'save-project',
    openProject: 'open-project',
    loadProject: 'load-project',
    createProject: 'create-project',
    getRecentProjects: 'get-recent-projects',
    addRecentProject: 'add-recent-project',
    getDocumentsPath: 'get-documents-path',
    getDownloadsPath: 'get-downloads-path',
    createDirectory: 'create-directory',
    pathExists: 'path-exists',
    readJsonFile: 'read-json-file',
    writeJsonFile: 'write-json-file',
    getFileStats: 'get-file-stats',
    showMessageBox: 'show-message-box'
  };
  const nested = new Set(['fs', 'storage', 'dialog', 'shell', 'window', 'theme', 'path', 'zip', 'audio', 'galgame']);

  function decode(raw) {
    try { return JSON.parse(raw); } catch { return raw; }
  }

  function call(channel, args) {
    if (channel === 'get-platform') return Promise.resolve('android');
    try {
      const value = decode(window.AndroidBridge.invoke(channel, JSON.stringify(args)));
      if (value && value.__pendingId) {
        return new Promise(resolve => pending.set(value.__pendingId, result => {
          if (channel === 'show-open-dialog') {
            if (window.location.pathname.includes('/player/')) resolve(result ? [result] : []);
            else resolve(result ? { canceled: false, filePaths: [result] } : { canceled: true, filePaths: [] });
          } else {
            resolve(result);
          }
        }));
      }
      return Promise.resolve(value);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function makeScope(prefix) {
    return new Proxy({}, {
      get(_target, property) {
        if (typeof property !== 'string') return undefined;
        if (nested.has(property)) {
          const childPrefix = prefix ? `${prefix}-${property}` : property;
          if (property === 'storage' || property === 'dialog' || property === 'shell' ||
              property === 'theme' || property === 'window' || property === 'path' ||
              property === 'zip' || property === 'audio') {
            return new Proxy({}, {
              get(_child, method) {
                if (typeof method !== 'string') return undefined;
                if (property === 'storage') return (...args) => call(`storage-${method}`, args);
                if (property === 'dialog') return (...args) => call(method.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`), args);
                if (property === 'shell') return (...args) => call(`shell-${method.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`, args);
                if (property === 'window') return (...args) => call(`window-${method.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`, args);
                if (property === 'theme') return (...args) => call(`theme-${method.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`, args);
                if (property === 'path') return (...args) => call(`app-get-path`, args.length ? args : ['userData']);
                return (...args) => call(`${childPrefix}-${method.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`, args);
              }
            });
          }
          return makeScope(childPrefix);
        }
        if (property === 'getPlatform') return () => 'android';
        if (property === 'isDev') return false;
        if (property === 'getLocalIPs') return () => ({ success: true, ips: { ipv4: [], ipv6: [] } });
        if (property === 'on' || property.startsWith('on') || property === 'removeAllListeners') {
          return () => () => {};
        }
        const channel = aliases[property] || property.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
        if (prefix === 'dialog') return (...args) => call(channel, args);
        if (prefix === 'path') return (...args) => call('app-get-path', args.length ? args : ['userData']);
        return (...args) => call(prefix ? `${prefix}-${channel}` : channel, args);
      }
    });
  }

  const api = makeScope('');
  api.invoke = (channel, ...args) => call(channel, args);
  api.getDataDir = () => call('get-data-dir', []);
  api.getPlatform = () => 'android';
  api.openSettings = () => Promise.resolve();
  api.playerLoadProject = path => call('player-load-project', [path]);
  api.playerGetDebugProject = () => Promise.resolve(null);
  api.playerToEditor = () => Promise.resolve(false);
  api.playerLog = () => Promise.resolve();
  api.loadProject = (path, debugMode) => call('load-project', [path, debugMode]);
  api.fs = makeScope('fs');
  api.storage = makeScope('storage');
  api.dialog = makeScope('dialog');
  api.shell = makeScope('shell');
  api.window = makeScope('window');
  api.theme = makeScope('theme');
  api.path = makeScope('path');
  api.zip = makeScope('zip');
  api.audio = makeScope('audio');
  api.galgame = makeScope('galgame');
  window.electronAPI = api;
})();
