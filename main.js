/**
 * ArtiMeow AI GalGame Maker 启动器
 * 只负责选择启动编辑器或播放器，不包含任何业务逻辑
 */

// 设置环境变量，让子应用知道自己的根目录
process.env.ARTIMEOW_ROOT = __dirname;

// 立即决定要启动什么
const mode = process.argv.includes('--player') ? 'player' : 'editor';

console.log(`启动模式: ${mode}`);
console.log(`项目根目录: ${__dirname}`);

if (mode === 'editor') {
  // 启动编辑器
  console.log('正在启动编辑器...');
  require('./lib/editor/src/main.js');
} else {
  // 启动播放器
  console.log('正在启动播放器...');
  require('./lib/player/src/main.js');
}
