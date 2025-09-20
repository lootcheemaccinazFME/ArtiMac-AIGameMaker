(function(){
  const qs = new URLSearchParams(location.search)
  const root = qs.get('root') || ''
  const rootPathEl = document.getElementById('root-path')
  const treeEl = document.getElementById('file-tree')
  const editorEl = document.getElementById('editor')
  const statusEl = document.getElementById('status')
  const currentFileEl = document.getElementById('current-file')
  const cursorEl = document.getElementById('cursor')
  const gutterEl = document.getElementById('gutter')
  const editorArea = document.getElementById('editor-area')
  const editorPane = document.getElementById('editor-pane')
  const btnRefresh = document.getElementById('btn-refresh')
  const btnNew = document.getElementById('btn-new')
  const btnNewFolder = document.getElementById('btn-new-folder')
  const btnDelete = document.getElementById('btn-delete')
  const btnReveal = document.getElementById('btn-reveal')
  const btnRename = document.getElementById('btn-rename')
  const btnSave = document.getElementById('btn-save')
  const btnSaveAs = document.getElementById('btn-save-as')
  const btnFind = document.getElementById('btn-find')
  const btnReplace = document.getElementById('btn-replace')
  const inputFind = document.getElementById('find')
  const inputReplace = document.getElementById('replace')
  const btnGoto = document.getElementById('btn-goto')
  const toggleWrap = document.getElementById('toggle-wrap')
  const saveIndicator = document.getElementById('save-indicator')
  // modal elements
  const modalMask = document.getElementById('modal-mask')
  const modalTitle = document.getElementById('modal-title')
  const modalMsg = document.getElementById('modal-message')
  const modalInput = document.getElementById('modal-input')
  const modalOk = document.getElementById('modal-ok')
  const modalCancel = document.getElementById('modal-cancel')
  // window controls
  const winMin = document.getElementById('win-min')
  const winClose = document.getElementById('win-close')

  let currentFile = null
  let currentContent = ''
  let hasUnsaved = false
  let selectedNode = null

  // context menu
  let ctxMenuEl = null

  rootPathEl.textContent = root || '-'

  // Apply global theme class to this window
  ;(async ()=>{
    try{
      const res = await window.electronAPI?.getTheme?.()
      const theme = res?.theme || 'dark'
      const apply = () => {
        const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches
        const isLight = theme === 'light' || (theme === 'auto' && !prefersDark)
        document.body.classList.toggle('light-theme', isLight)
      }
      apply()
      if (theme === 'auto'){
        try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply) } catch {}
      }
    }catch(e){ /* no-op */ }
  })()

  function toast(text){
    statusEl.textContent = text
  }

  function setSaveState(saved){
    hasUnsaved = !saved
    const ts = new Date()
    if (saveIndicator){
      if (saved){
        saveIndicator.classList.remove('unsaved'); saveIndicator.classList.add('saved')
        saveIndicator.textContent = `${ts.toLocaleTimeString()} 已保存`
      } else {
        saveIndicator.classList.remove('saved'); saveIndicator.classList.add('unsaved')
        saveIndicator.textContent = `${ts.toLocaleTimeString()} 未保存`
      }
    }
  }

  function showModal(title, message, placeholder, initialValue){
    return new Promise((resolve)=>{
      modalTitle.textContent = title || '输入'
      modalMsg.textContent = message || ''
      modalInput.placeholder = placeholder || ''
      modalInput.value = initialValue || ''
      modalMask.style.display = 'flex'
      setTimeout(()=>{ modalInput.focus(); modalInput.select() }, 0)
      const cleanup = ()=>{
        modalMask.style.display = 'none'
        modalOk.onclick = null
        modalCancel.onclick = null
      }
      modalOk.onclick = ()=>{ const v = modalInput.value; cleanup(); resolve(v) }
      modalCancel.onclick = ()=>{ cleanup(); resolve(null) }
      modalMask.onclick = (e)=>{ if(e.target===modalMask){ cleanup(); resolve(null) } }
    })
  }

  async function askInput(title, message, placeholder, initial){
    return await showModal(title, message, placeholder, initial)
  }

  async function askConfirm(message){
    const v = await showModal('确认', message || '确认？', '', '')
    // 约定：非空即确认
    return !!v
  }

  function buildTreeStructure(entries){
    // entries 可能是字符串数组（旧接口）或 {path,type} 数组（新接口）
    const rootNode = { name: '', path: root, isDir: true, children: new Map() }
    const dirs = new Set()
    const files = []
    for (const it of entries){
      if (!it) continue
      if (typeof it === 'string') { files.push(it.replace(/\\/g,'/')); continue }
      const p = (it.path||'').replace(/\\/g,'/')
      if (it.type === 'dir') dirs.add(p); else files.push(p)
    }
    const normalizeRoot = root.replace(/\\/g,'/')
    const addPathParts = (fullPath, isFile) => {
      const rel = fullPath.replace(/\\/g,'/').replace(normalizeRoot+'/', '')
      const parts = rel.split('/')
      let node = rootNode
      let acc = normalizeRoot
      for (let i=0;i<parts.length;i++){
        const part = parts[i]
        acc += '/' + part
        const isLast = i === parts.length-1
        const pathHere = acc
        const isDir = isLast ? !isFile : true
        if (!node.children.has(part)){
          node.children.set(part, { name: part, path: pathHere, isDir: isDir, children: new Map() })
        }
        node = node.children.get(part)
        if (isLast){ node.isDir = !isFile ? true : false }
      }
    }
    // 先添加目录，再添加文件，确保空目录存在
    for (const d of dirs) addPathParts(d, false)
  for (const f of files) addPathParts(f, true)
    return rootNode
  }

  function renderTreeNode(node, depth=0){
    if (!node) return null
    if (depth===0){
      const container = document.createElement('div')
      container.className = 'children'
      for (const child of node.children.values()){
        const el = renderTreeNode(child, depth)
        if (el) container.appendChild(el)
      }
      return container
    }
    const row = document.createElement('div')
    const isFolder = !!node.isDir
    row.className = isFolder ? 'folder' : 'file'
    const wrapper = document.createElement('div')
    wrapper.className = 'row'
    // indent
    for (let i=1;i<depth;i++){
      const ind = document.createElement('span')
      ind.className = 'indent'
      wrapper.appendChild(ind)
    }
    // twisty
    const twisty = document.createElement('span')
    twisty.className = 'twisty' + (isFolder ? '' : ' hidden')
    twisty.innerHTML = '<i class="fas fa-caret-right"></i>'
    wrapper.appendChild(twisty)
    // icon
    const icon = document.createElement('span')
    icon.className = 'icon'
    icon.innerHTML = isFolder ? '<i class="fas fa-folder"></i>' : '<i class="fas fa-file"></i>'
    wrapper.appendChild(icon)
    // name
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = node.name
    wrapper.appendChild(name)

    row.appendChild(wrapper)
    const children = document.createElement('div')
    children.className = 'children'
    row.appendChild(children)

    // toggle folder
    if (isFolder){
      let open = false
      const updateOpen = ()=>{
        row.classList.toggle('open', open)
        twisty.innerHTML = `<i class="fas ${open?'fa-caret-down':'fa-caret-right'}"></i>`
      }
      wrapper.addEventListener('click', (e)=>{
        if (e.target.closest('.twisty') || e.target.closest('.icon') || e.target.closest('.name')){
          open = !open; updateOpen()
        }
      })
      updateOpen()
      for (const child of node.children.values()){
        const el = renderTreeNode(child, depth+1)
        if (el) children.appendChild(el)
      }
    } else {
      // file
      wrapper.addEventListener('click', ()=>{
        selectRow(wrapper)
        openFile(node.path)
      })
    }

    // context menu
    wrapper.addEventListener('contextmenu', (e)=>{
      e.preventDefault()
      showContextMenu(e.pageX, e.pageY, node)
    })
  // store path on clickable row for selection/highlight
  wrapper.dataset.path = node.path
    return row
  }

  function clearContextMenu(){ if (ctxMenuEl){ ctxMenuEl.remove(); ctxMenuEl=null } }
  function showContextMenu(x,y,node){
    clearContextMenu()
    const m = document.createElement('div')
    m.style.position='fixed'; m.style.left=x+'px'; m.style.top=y+'px'; m.style.zIndex=2000
    m.style.background='var(--pe-panel)'; m.style.border='1px solid var(--pe-border)'; m.style.borderRadius='8px'; m.style.minWidth='180px'; m.style.boxShadow='0 8px 24px rgba(0,0,0,.4)'
    const addItem=(label,fn)=>{ const it=document.createElement('div'); it.textContent=label; it.style.padding='8px 12px'; it.style.cursor='pointer'; it.style.color='var(--pe-text)'; it.onmouseenter=()=>it.style.background='var(--pe-hover)'; it.onmouseleave=()=>it.style.background='transparent'; it.onclick=()=>{ clearContextMenu(); fn&&fn() }; m.appendChild(it) }
    const isDir = !!node.isDir
    addItem('在资源管理器中打开', ()=> window.electronAPI.showItemInFolder(node.path))
    addItem(isDir?'新建文件':'打开', ()=>{ if(isDir) createInDir(node.path); else openFile(node.path) })
    addItem('重命名', ()=> renamePath(node.path))
    addItem('删除', ()=> deletePath(node.path, isDir))
    document.body.appendChild(m)
    ctxMenuEl = m
    const off = ()=>{ clearContextMenu(); document.removeEventListener('click',off,true) }
    setTimeout(()=> document.addEventListener('click', off, true), 0)
  }

  async function createInDir(dir){
    const name = await askInput('新建文件','输入文件名','new.txt')
    if (!name) return
    const full = (dir.replace(/\\/g,'/') + '/' + name).replace(/\/+/,'/')
    await window.electronAPI.writeFile(full,'')
    await refreshTree()
    await openFile(full)
  }

  async function renamePath(p){
    const base = p.split(/[/\\]/).pop()
    const newName = await askInput('重命名','输入新名称', base, base)
    if (!newName) return
    const dir = p.replace(/[/\\][^/\\]+$/, '')
    const dest = (dir.replace(/\\/g,'/') + '/' + newName).replace(/\/+/,'/')
    await window.electronAPI.moveFile(p,dest)
    if (currentFile===p) currentFile=dest
    await refreshTree()
  }

  async function deletePath(p, isDir){
    const ok = await askConfirm('确认删除吗？输入任意内容确认')
    if (!ok) return
    if (isDir){
      await window.electronAPI.deleteDirectory?.(p)
    } else {
      await window.electronAPI.deleteFile(p)
    }
    if (currentFile===p){ currentFile=null; editorEl.value=''; updateCursor() }
    await refreshTree()
  }

  function selectRow(row){
    if (selectedNode) selectedNode.classList.remove('active')
    selectedNode = row
    if (row) row.classList.add('active')
  }

  async function refreshTree(){
    treeEl.innerHTML = ''
    clearContextMenu()
    if (!root) { treeEl.innerHTML = '<div class="subtle">未提供根目录</div>'; return }
    try {
      const exists = await window.electronAPI.pathExists(root)
      if (!exists) { treeEl.innerHTML = '<div class="subtle">目录不存在，请先在发布设置中初始化</div>'; return }
      // 优先使用返回包含目录项的扫描接口（如果存在）
      let paths = []
      if (window.electronAPI.scanDirectoryWithDirs) {
        const res = await window.electronAPI.scanDirectoryWithDirs(root)
        paths = Array.isArray(res) ? res : []
      } else {
        paths = await window.electronAPI.scanDirectory(root)
      }
      // 排序：目录在前，名称A->Z
      const arr = paths.slice()
      arr.sort((a,b)=>{
        const pa = typeof a==='string'?a:a.path
        const pb = typeof b==='string'?b:b.path
        const ta = typeof a==='string'?'file':a.type
        const tb = typeof b==='string'?'file':b.type
        if (ta!==tb) return ta==='dir'?-1:1
        return pa.localeCompare(pb)
      })
      const model = buildTreeStructure(arr)
      for (const child of model.children.values()){
        const el = renderTreeNode(child, 1)
        if (el) treeEl.appendChild(el)
      }
    } catch(e){
      console.error(e)
      treeEl.innerHTML = '<div class="subtle">读取失败: '+ (e?.message||e) +'</div>'
    }
  }

  async function openFile(full){
    try {
      const res = await window.electronAPI.readFile(full)
      if (!res || res.success !== true) throw new Error(res?.error || '读取失败')
      const content = typeof res.content === 'string' ? res.content : ''
      // 简单二进制保护（遇到大量\0或不可打印字符就拒绝以文本打开）
      const suspicious = /\u0000/.test(content)
      if (suspicious) throw new Error('该文件可能为二进制，无法以文本方式打开')
      currentFile = full
      currentContent = content
      editorEl.value = content
      setSaveState(true)
      toast('已打开: '+full)
      // 高亮当前文件
      const row = treeEl.querySelector(`.row[data-path="${cssEscape(full)}"]`) || findRowByPath(full)
      if (row) selectRow(row)
      // 更新标题栏文件名与行号
      updateCurrentFileUI()
      refreshGutter()
      // 滚动到顶部并将光标置于开头
      try {
        editorEl.scrollTop = 0
        editorEl.setSelectionRange(0,0)
      } catch {}
    } catch(e){
      toast('打开失败: '+ (e?.message||e))
    }
  }

  async function saveFile(){
    if (!currentFile) { toast('没有打开的文件'); return }
    const text = editorEl.value
    if (text === currentContent){ toast('未修改'); setSaveState(true); return }
    try {
      const res = await window.electronAPI.writeFile(currentFile, text)
      if (!res || res.success !== true) throw new Error(res?.error || '写入失败')
      currentContent = text
      setSaveState(true)
      toast('已保存')
    } catch(e){
      toast('保存失败: '+ (e?.message||e))
    }
  }

  async function createNew(){
    const name = await askInput('新建文件','输入文件名，例如 about.html / about.css','about.html')
    if (!name) return
    try {
      const full = (root.replace(/\\/g,'/') + '/' + name).replace(/\/+/, '/')
      await window.electronAPI.ensureDir(root)
      await window.electronAPI.writeFile(full, '')
      await refreshTree()
      await openFile(full)
    } catch(e){ toast('新建失败: '+ (e?.message||e)) }
  }

  async function createFolder(){
    const name = await askInput('新建文件夹','输入文件夹名称','assets')
    if (!name) return
    try {
      const full = (root.replace(/\\/g,'/') + '/' + name).replace(/\/+/, '/')
      await window.electronAPI.createDirectory(full)
      await refreshTree()
      toast('已创建文件夹')
    } catch(e){ toast('创建文件夹失败: '+ (e?.message||e)) }
  }

  async function renameItem(){
    if (!currentFile){ toast('没有选中文件'); return }
    const newName = await askInput('重命名','重命名为（不含路径）','', currentFile.split(/[/\\]/).pop())
    if (!newName) return
    try {
      const dir = currentFile.replace(/[/\\][^/\\]+$/, '')
      const dest = (dir.replace(/\\/g,'/') + '/' + newName).replace(/\/+/, '/')
      await window.electronAPI.moveFile(currentFile, dest)
      currentFile = dest
      await refreshTree()
      toast('已重命名')
    } catch(e){ toast('重命名失败: '+ (e?.message||e)) }
  }

  async function deleteFile(){
    if (!currentFile){ toast('没有打开的文件'); return }
    const ok = await askConfirm('确认删除当前文件吗？输入任意内容确定')
    if (!ok) return
    try {
      await window.electronAPI.deleteFile(currentFile)
      currentFile = null
      editorEl.value = ''
      await refreshTree()
      toast('已删除')
    } catch(e){ toast('删除失败: '+ (e?.message||e)) }
  }

  function revealInFolder(){
    if (!currentFile) { toast('没有打开的文件'); return }
  window.electronAPI.showItemInFolder(currentFile)
  }

  function findNext(){
    const q = inputFind.value
    if (!q) return
    const start = editorEl.selectionEnd
    const idx = editorEl.value.indexOf(q, start)
    if (idx >= 0){
      editorEl.focus()
      editorEl.setSelectionRange(idx, idx+q.length)
      toast('找到位置: '+idx)
    } else {
      toast('未找到: '+q)
    }
  }

  function replaceOne(){
    const q = inputFind.value
    const r = inputReplace.value
    if (!q) return
    const start = editorEl.selectionStart
    const end = editorEl.selectionEnd
    const sel = editorEl.value.substring(start, end)
    if (sel === q){
      const before = editorEl.value.substring(0, start)
      const after = editorEl.value.substring(end)
      editorEl.value = before + r + after
      editorEl.setSelectionRange(start, start + r.length)
      toast('已替换一次')
    } else {
      findNext()
    }
  }

  function updateCursor(){
    const pos = editorEl.selectionStart
    const lines = editorEl.value.substring(0, pos).split(/\n/)
    const row = lines.length
    const col = (lines[lines.length-1]||'').length + 1
    cursorEl.textContent = row+':'+col
    // 更新行号（行数变化时）
    const total = editorEl.value.split(/\n/).length
    if (gutterEl.dataset.count != total) {
      let out = ''
      for (let i=1;i<=total;i++) out += i + "\n"
      gutterEl.textContent = out
      gutterEl.dataset.count = String(total)
    }
  }

  function refreshGutter(){
    const total = editorEl.value.split(/\n/).length
    let out = ''
    for (let i=1;i<=total;i++) out += i + "\n"
    gutterEl.textContent = out
    gutterEl.dataset.count = String(total)
  }

  function updateCurrentFileUI(){
    if (!currentFileEl) return
    currentFileEl.textContent = currentFile ? currentFile.split(/[/\\]/).pop() : ''
  }

  function cssEscape(sel){
    return sel.replace(/\\/g,'\\\\').replace(/"/g,'\\"')
  }

  function findRowByPath(full){
    let match = null
    treeEl.querySelectorAll('.row').forEach(el=>{ if (el.dataset.path === full) match = el })
    return match
  }

  editorEl.addEventListener('keyup', ()=>{ updateCursor(); setSaveState(editorEl.value === currentContent) })
  editorEl.addEventListener('click', updateCursor)
  editorEl.addEventListener('input', ()=>{ setSaveState(editorEl.value === currentContent); updateCursor(); refreshGutter() })
  editorEl.addEventListener('scroll', ()=>{
    // 以 textarea 为唯一滚动容器，同步行号
    gutterEl.style.transform = `translate(0px, ${-editorEl.scrollTop}px)`
  })

  // 让鼠标滚轮在编辑区域任意位置都能滚动 textarea
  editorArea.addEventListener('wheel', (e)=>{
    // 仅当事件目标不是 textarea 自身时，转发滚动
    if (e.target !== editorEl){
      e.preventDefault()
      editorEl.scrollTop += e.deltaY
    }
  }, { passive: false })

  function gotoLine(){
    showModal('转到行','输入目标行号','12','').then((v)=>{
      const n = parseInt(v,10)
      if (!n || n<1) return
      const parts = editorEl.value.split(/\n/)
      let pos = 0
      for (let i=0;i<n-1 && i<parts.length;i++) pos += parts[i].length + 1
      editorEl.focus()
      editorEl.setSelectionRange(pos, pos)
      updateCursor()
    })
  }

  async function saveAs(){
    const res = await window.electronAPI.showSaveDialog({ title:'另存为', defaultPath: currentFile || (root + '/untitled.txt') })
    if (!res || res.canceled) return
    const filePath = res.filePath
    if (!filePath) return
    try {
      await window.electronAPI.writeFile(filePath, editorEl.value)
      currentFile = filePath
      currentContent = editorEl.value
      setSaveState(true)
      await refreshTree()
      toast('已另存为')
    } catch(e){ toast('另存为失败: '+ (e?.message||e)) }
  }

  function applyWrap(){
    const on = !!toggleWrap.checked
    editorEl.style.whiteSpace = on ? 'pre-wrap' : 'pre'
  }

  btnRefresh.addEventListener('click', refreshTree)
  btnNew.addEventListener('click', createNew)
  btnNewFolder.addEventListener('click', createFolder)
  btnDelete.addEventListener('click', deleteFile)
  btnReveal.addEventListener('click', revealInFolder)
  btnRename.addEventListener('click', renameItem)
  btnSave.addEventListener('click', saveFile)
  btnSaveAs.addEventListener('click', saveAs)
  btnFind.addEventListener('click', findNext)
  btnReplace.addEventListener('click', replaceOne)
  btnGoto.addEventListener('click', gotoLine)
  toggleWrap.addEventListener('change', applyWrap)

  // window control buttons
  winMin?.addEventListener('click', ()=> window.electronAPI.invoke?.('window-minimize'))
  winClose?.addEventListener('click', ()=> window.electronAPI.invoke?.('window-close'))

  document.addEventListener('keydown', (e)=>{
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='s'){ e.preventDefault(); saveFile() }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='f'){ e.preventDefault(); inputFind.focus() }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='h'){ e.preventDefault(); inputReplace.focus() }
    if (e.key === 'F2'){ e.preventDefault(); renameItem() }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='n'){ e.preventDefault(); createNew() }
    if (e.key === 'Home' && (e.ctrlKey || e.metaKey)){
      e.preventDefault();
      try { editorEl.setSelectionRange(0,0); editorEl.scrollTop = 0 } catch {}
    }
    if (e.key === 'End' && (e.ctrlKey || e.metaKey)){
      e.preventDefault();
      try {
        const len = editorEl.value.length;
        editorEl.setSelectionRange(len, len);
        editorEl.scrollTop = editorEl.scrollHeight;
      } catch {}
    }
  })

  window.addEventListener('beforeunload', (e)=>{
    if (hasUnsaved){
      e.preventDefault()
      e.returnValue = ''
    }
  })

  refreshTree()
  applyWrap()
  updateCursor()
  refreshGutter()
})();
