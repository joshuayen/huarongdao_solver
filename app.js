
(function(){
  'use strict';
  // DOM refs
  var btnLoadExample = document.getElementById('btnLoadExample');
  var mapFile = document.getElementById('mapFile');
  var mapText = document.getElementById('mapText');
  var btnSolveChest = document.getElementById('btnSolveChest');
  var btnSolveExit  = document.getElementById('btnSolveExit');
  var statusMsg = document.getElementById('statusMsg');
  var boardSizeEl = document.getElementById('boardSize');
  var stepCountEl = document.getElementById('stepCount');
  var perfLoadEl  = document.getElementById('perfLoad');
  var perfSolveEl = document.getElementById('perfSolve');
  var perfTotalEl = document.getElementById('perfTotal');
  var nodesExpandedEl = document.getElementById('nodesExpanded');
  var statesVisitedEl = document.getElementById('statesVisited');
  var peakQueueEl     = document.getElementById('peakQueue');
  var boardGrid = document.getElementById('boardGrid');
  var stepList = document.getElementById('stepList');
  var btnReplay = document.getElementById('btnReplay');
  var btnPrev = document.getElementById('btnPrev');
  var btnNext = document.getElementById('btnNext');
  var replayPos = document.getElementById('replayPos');
  var lastUpdated = document.getElementById('lastUpdated');

  var ROWS = 7, COLS = 4; // default
  var replayStates = []; // Array<string[]> lines per step
  var replayIndex = 0;

  // Last updated time
  try {
    var dt = new Date();
    lastUpdated.textContent = dt.toLocaleString('zh-TW');
  } catch(e) {}

  // NL-safe utilities
  var NL = String.fromCharCode(10);
  function splitLines(s){
    var CR = String.fromCharCode(13);
    return (s||'').split(CR).join('')
      .split(NL).map(function(x){return x.trim();}).filter(function(x){return x.length;});
  }

  // Busy state
  function setBusy(on){
    mapText.disabled = on;
    mapFile.disabled = on;
    btnLoadExample.disabled = on;
    btnSolveChest.disabled = on;
    btnSolveExit.disabled = on;
    btnReplay.disabled = on || !replayStates.length;
    btnPrev.disabled = on || !replayStates.length;
    btnNext.disabled = on || !replayStates.length;
    if (on) boardGrid.classList.add('is-busy'); else boardGrid.classList.remove('is-busy');
  }
  function setStatus(text, isBusy){
    statusMsg.textContent = text;
    if (isBusy){
      var s = document.createElement('span'); s.className='spinner';
      statusMsg.insertBefore(s, statusMsg.firstChild);
      statusMsg.insertBefore(document.createTextNode(' '), s.nextSibling);
    }
  }

  // Render from lines (each line length COLS)
  function renderBoardFromLines(lines){
    ROWS = lines.length; COLS = lines[0].length;
    boardGrid.innerHTML = '';
    boardGrid.style.gridTemplateColumns = 'repeat(' + COLS + ', var(--cell-size))';
    boardGrid.style.gridTemplateRows = 'repeat(' + ROWS + ', var(--cell-size))';
    for (var r=0; r<ROWS; r++){
      for (var c=0; c<COLS; c++){
        var ch = lines[r][c];
        var cell = document.createElement('div');
        var kind = ch;
        if (ch === '.') kind = 'dot';
        if (ch === 'x') kind = 'X'; // 覆蓋寶箱的小寫以 X 樣式顯示
        cell.className = 'cell c-' + kind;
        cell.textContent = (kind==='dot' ? '.' : kind.toUpperCase());
        boardGrid.appendChild(cell);
      }
    }
    boardSizeEl.textContent = COLS + 'x' + ROWS;
  }

  // Replay controls
  btnReplay.addEventListener('click', function(){ if(!replayStates.length) return; btnReplay.disabled=true; var i=0; (function step(){ if (i>=replayStates.length){ btnReplay.disabled=false; return;} replayIndex=i; var st=replayStates[i]; renderBoardFromLines(st); mapText.value = st.map(function(x){return x;}).join(NL); replayPos.textContent = replayIndex + '/' + (replayStates.length-1); i++; setTimeout(step, 350);} )(); });
  btnPrev.addEventListener('click', function(){ if(!replayStates.length) return; replayIndex=Math.max(0, replayIndex-1); var st=replayStates[replayIndex]; renderBoardFromLines(st); mapText.value = st.join(NL); replayPos.textContent = replayIndex + '/' + (replayStates.length-1); });
  btnNext.addEventListener('click', function(){ if(!replayStates.length) return; replayIndex=Math.min(replayStates.length-1, replayIndex+1); var st=replayStates[replayIndex]; renderBoardFromLines(st); mapText.value = st.join(NL); replayPos.textContent = replayIndex + '/' + (replayStates.length-1); });

  // Example load
  var DEFAULT_EXAMPLE_URL = 'example/map.txt';
  var EXAMPLE_FALLBACK = ['CCSV','CCSV','VGGS','VSHH','X.HH','VVVV','VVVV'].join(NL);
  function loadDefaultExample(){ if (!window.fetch){ mapText.value=EXAMPLE_FALLBACK; statusMsg.textContent='已載入內建範例（環境不支援 fetch）。'; return;} fetch(DEFAULT_EXAMPLE_URL).then(function(resp){return resp.text();}).then(function(txt){ mapText.value = txt; statusMsg.textContent='已載入預設範例 example/map.txt。'; }).catch(function(){ mapText.value=EXAMPLE_FALLBACK; statusMsg.textContent='讀取 example/map.txt 失敗，已載入內建範例。'; }); }
  btnLoadExample.addEventListener('click', loadDefaultExample);
  mapFile.addEventListener('change', function(e){ var f=e.target.files && e.target.files[0]; if(!f) return; var reader=new FileReader(); reader.onload=function(){ mapText.value=reader.result; statusMsg.textContent='已載入檔案：'+f.name; }; reader.readAsText(f); });

  // Worker
  var worker = new Worker('solver-worker.js');
  worker.onmessage = function(ev){
    var data = ev.data || {};
    if (data.type === 'SOLVE_DONE'){
      // fill metrics
      perfLoadEl.textContent  = '讀檔' + (data.metrics.usLoad!=null ? (' ' + data.metrics.usLoad + ' μs') : ' —');
      perfSolveEl.textContent = '求解 ' + (data.metrics.usSolve!=null ? (data.metrics.usSolve + ' μs') : '—');
      perfTotalEl.textContent = '總計 ' + (data.metrics.usTotal!=null ? (data.metrics.usTotal + ' μs') : '—');
      nodesExpandedEl.textContent = '展開 ' + (data.metrics.nodesExpanded!=null ? data.metrics.nodesExpanded : '—');
      statesVisitedEl.textContent = '訪問 ' + (data.metrics.statesVisited!=null ? data.metrics.statesVisited : '—');
      peakQueueEl.textContent     = '峰值 ' + (data.metrics.peakQueue!=null ? data.metrics.peakQueue : '—');

      stepList.innerHTML = '';
      var steps = data.steps || [];
      stepCountEl.textContent = steps.length ? steps.length : '不可達';
      if (!steps.length){ setStatus(data.msg || '未找到解', false); replayStates=[]; replayPos.textContent='—/—'; setBusy(false); return; }
      setStatus((data.mode==='CHEST'?'已找到最短解！（BFS）':'已找到解！（A*）'), false);
      for (var i=0;i<steps.length;i++){ var li=document.createElement('li'); li.textContent = (i+1)+'. '+steps[i][0]+steps[i][1]; stepList.appendChild(li); }
      // states for replay
      replayStates = data.states || [];
      replayIndex = 0;
      var st0 = replayStates[0];
      renderBoardFromLines(st0);
      mapText.value = st0.join(NL);
      replayPos.textContent = replayIndex + '/' + (replayStates.length-1);
      btnReplay.disabled=false; btnPrev.disabled=false; btnNext.disabled=false;
      setBusy(false);
    } else if (data.type === 'SOLVE_ERROR'){
      setStatus('錯誤：' + (data.error || '未知錯誤'), false);
      setBusy(false);
    } else if (data.type === 'SOLVE_PROGRESS'){
      setStatus('正在求解… ' + data.progress + ' 節點', true);
    }
  };

  // Button handlers
  btnSolveChest.addEventListener('click', function(){
    try {
      var raw = (mapText.value||'').trim();
      if (!raw) throw new Error('請先載入或貼上盤面文字');
      setBusy(true); setStatus('正在求解（BFS：關羽吃寶箱）…請稍候', true);
      worker.postMessage({ type:'SOLVE_CHEST', payload:{ raw: raw } });
    } catch(err){ setStatus('錯誤：' + err.message, false); setBusy(false); }
  });
  btnSolveExit.addEventListener('click', function(){
    try {
      var raw = (mapText.value||'').trim();
      if (!raw) throw new Error('請先載入或貼上盤面文字');
      setBusy(true); setStatus('正在求解（曹操脫逃 A*）…請稍候', true);
      worker.postMessage({ type:'SOLVE_EXIT', payload:{ raw: raw } });
    } catch(err){ setStatus('錯誤：' + err.message, false); setBusy(false); }
  });

  // Auto-load example on start
  loadDefaultExample();
})();
