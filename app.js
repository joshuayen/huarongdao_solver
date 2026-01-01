
(function(){
  'use strict';

  // ====== 全域錯誤保護 ======
  window.addEventListener('error', function(e){
    var statusMsg = document.getElementById('statusMsg');
    var msg = '未捕捉錯誤：' + (e.message || e.error);
    if (statusMsg) statusMsg.textContent = msg;
    console.error(e.error || e.message, e);
  });

  // ====== 盤面 I/O ======
  var mapFile = document.getElementById('mapFile');
  var btnLoadExample = document.getElementById('btnLoadExample');
  var mapText = document.getElementById('mapText');
  var btnSolve = document.getElementById('btnSolve');

  var statusMsg = document.getElementById('statusMsg');
  var boardSizeEl = document.getElementById('boardSize');
  var stepCountEl = document.getElementById('stepCount');

  var boardGrid = document.getElementById('boardGrid');
  var stepList = document.getElementById('stepList');

  var btnReplay = document.getElementById('btnReplay');
  var btnPrev = document.getElementById('btnPrev');
  var btnNext = document.getElementById('btnNext');
  var replayPos = document.getElementById('replayPos');

  var ROWS = 7, COLS = 4;
  var chest = null;          // [r, c]
  var pieces = [];           // Array of {name,w,h,r,c,kind}
  var solutionSteps = [];    // Array of [name, dir]
  var replayStates = [];     // Array of pieces states for playback
  var replayIndex = 0;

  // ====== 範例盤面（請勿拆行正則或插入不可見字元） ======
  var EXAMPLE = [
    'CCSV',
    'CCSV',
    'VGGS',
    'VSHH',
    'X.HH',
    'VVVV',
    'VVVV'
  ].join("\n");

  btnLoadExample.addEventListener('click', function(){
    mapText.value = EXAMPLE;
    statusMsg.textContent = '已載入範例盤面。';
  });

  mapFile.addEventListener('change', function(e){
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function(){
      mapText.value = reader.result;
      statusMsg.textContent = '已載入檔案：' + f.name;
    };
    reader.readAsText(f);
  });

  // ====== 忙碌狀態與訊息 ======
  function setBusy(on){
    mapText.disabled = on;
    mapFile.disabled = on;
    btnLoadExample.disabled = on;
    btnSolve.disabled = on;

    btnReplay.disabled = on || !replayStates.length;
    btnPrev.disabled = on || !replayStates.length;
    btnNext.disabled = on || !replayStates.length;

    if (on) boardGrid.classList.add('is-busy'); else boardGrid.classList.remove('is-busy');
  }
  function setStatus(text, isBusy){
    statusMsg.textContent = text;
    if (isBusy){
      var s = document.createElement('span');
      s.className = 'spinner';
      statusMsg.insertBefore(s, statusMsg.firstChild);
      statusMsg.insertBefore(document.createTextNode(' '), s.nextSibling);
    }
  }

  // ====== 解析佈局（X 視為 '.' 以檢查棋子形狀） ======
  function parseLayout(lines){
    var rows = lines.length;
    if (rows === 0) throw new Error('棋盤不可空白');
    var cols = lines[0].length;
    for (var i=0; i<rows; i++){
      if (lines[i].length !== cols) throw new Error('每一行長度必須相同');
    }

    ROWS = rows; COLS = cols;
    var chestPos = null;

    function at(r, c){ var ch = lines[r][c]; return ch === 'X' ? '.' : ch; }

    // 尋找 X
    for (var r=0; r<ROWS; r++){
      for (var c=0; c<COLS; c++){
        if (lines[r][c] === 'X'){
          if (chestPos) throw new Error('棋盤只能有一個 X（寶箱）');
          chestPos = [r, c];
        }
      }
    }
    if (!chestPos) throw new Error("請用 'X' 標記寶箱所在單格");
    chest = chestPos;

    var seen = [];
    for (r=0; r<ROWS; r++){ seen.push([]); for (c=0; c<COLS; c++){ seen[r].push(false); } }

    var piecesOut = [];
    var vcnt = 0, hcnt = 0, scnt = 0;
    var cFound = false, gFound = false;

    function add(name, kind, r, c, w, h){ piecesOut.push({name:name, kind:kind, r:r, c:c, w:w, h:h}); }

    for (r=0; r<ROWS; r++){
      for (c=0; c<COLS; c++){
        if (seen[r][c]) continue;
        var ch = at(r, c);
        if (ch === '.'){ seen[r][c] = true; continue; }

        if (ch === 'C'){
          for (var rr=r; rr<r+2; rr++){
            for (var cc=c; cc<c+2; cc++){
              if (!(0<=rr && rr<ROWS && 0<=cc && cc<COLS) || at(rr,cc) !== 'C') throw new Error('C 必須形成 2x2 方塊');
              seen[rr][cc] = true;
            }
          }
          if (cFound) throw new Error('只能有一個 C（曹操）');
          add('曹操','C',r,c,2,2); cFound = true;
        }
        else if (ch === 'V'){
          if (r+1 >= ROWS || at(r+1,c) !== 'V') throw new Error('V 在 ('+r+','+c+') 下方必須也是 V（形成 1x2）');
          seen[r][c] = true; seen[r+1][c] = true;
          vcnt++; add('縱將'+vcnt,'V',r,c,1,2);
        }
        else if (ch === 'G' || ch === 'H'){
          if (c+1 >= COLS || at(r,c+1) !== ch) throw new Error(ch+' 在 ('+r+','+c+') 右邊必須也是 '+ch+'（形成 2x1）');
          seen[r][c] = true; seen[r][c+1] = true;
          if (ch === 'G'){
            if (gFound) throw new Error('只能有一個 G（關羽）');
            add('關羽','G',r,c,2,1); gFound = true;
          } else {
            hcnt++; add('橫將'+hcnt,'H',r,c,2,1);
          }
        }
        else if (ch === 'S'){
          seen[r][c] = true; scnt++; add('兵卒'+scnt,'S',r,c,1,1);
        }
        else {
          throw new Error('不支援的字元：'+ch+'（位置 '+r+','+c+'）');
        }
      }
    }

    if (!gFound) throw new Error("請用 'G' 標記關羽（2x1 水平，連續兩格）");
    return piecesOut;
  }

  // ====== 狀態工具 ======
  function piecesToGridIdx(pcs){
    var grid = []; for (var r=0; r<ROWS; r++){ grid.push([]); for (var c=0; c<COLS; c++){ grid[r].push(null); } }
    for (var i=0; i<pcs.length; i++){
      var p = pcs[i];
      for (var rr=p.r; rr<p.r+p.h; rr++){
        for (var cc=p.c; cc<p.c+p.w; cc++){
          if (!(0<=rr && rr<ROWS && 0<=cc && cc<COLS)) throw new Error(p.name+' 位置越界');
          if (grid[rr][cc] !== null) throw new Error('棋子重疊：'+p.name+' 在 ('+rr+','+cc+')');
          grid[rr][cc] = i;
        }
      }
    }
    return grid;
  }
  function gridKey(pcs){
    var grid = []; for (var r=0; r<ROWS; r++){ grid.push([]); for (var c=0; c<COLS; c++){ grid[r].push('.'); } }
    for (var i=0; i<pcs.length; i++){
      var p = pcs[i];
      for (var rr=p.r; rr<p.r+p.h; rr++) for (var cc=p.c; cc<p.c+p.w; cc++) grid[rr][cc] = p.kind;
    }
    var s=''; for (r=0; r<ROWS; r++){ s += grid[r].join(''); } return s;
  }
  function canMove(p, gridIdx, dr, dc){
    var nr = p.r + dr, nc = p.c + dc;
    if (nr < 0 || nc < 0 || nr + p.h > ROWS || nc + p.w > COLS) return false;
    if (dr === -1){ for (var cc=p.c; cc<p.c+p.w; cc++) if (gridIdx[p.r-1][cc] !== null) return false; }
    else if (dr === 1){ for (var cc2=p.c; cc2<p.c+p.w; cc2++) if (gridIdx[p.r+p.h][cc2] !== null) return false; }
    else if (dc === -1){ for (var rr=p.r; rr<p.r+p.h; rr++) if (gridIdx[rr][p.c-1] !== null) return false; }
    else if (dc === 1){ for (var rr2=p.r; rr2<p.r+p.h; rr2++) if (gridIdx[rr2][p.c+p.w] !== null) return false; }
    else return false;
    return true;
  }
  function movePiece(pcs, i, dr, dc){
    var p = pcs[i];
    var newP = {name:p.name, kind:p.kind, r:p.r+dr, c:p.c+dc, w:p.w, h:p.h};
    var out = pcs.slice(0); out[i] = newP; return out;
  }
  function isGoalChest(pcs, chest){
    var rX = chest[0], cX = chest[1];
    for (var i=0; i<pcs.length; i++){
      var p = pcs[i]; if (p.kind === 'G'){
        for (var rr=p.r; rr<p.r+p.h; rr++) for (var cc=p.c; cc<p.c+p.w; cc++) if (rr===rX && cc===cX) return true;
      }
    }
    return false;
  }

  // ====== BFS ======
  function solveBfs(start){
    var DIRS = [[-1,0,'上'], [1,0,'下'], [0,-1,'左'], [0,1,'右']];
    var q = [[start, []]];
    var visited = {}; visited[gridKey(start)] = true;

    while (q.length){
      var pair = q.shift(); var state = pair[0], path = pair[1];
      if (isGoalChest(state, chest)) return [path, state];

      var gridIdx = piecesToGridIdx(state);
      for (var i=0; i<state.length; i++){
        var p = state[i];
        for (var d=0; d<DIRS.length; d++){
          var dr = DIRS[d][0], dc = DIRS[d][1], dname = DIRS[d][2];
          if (canMove(p, gridIdx, dr, dc)){
            var nxt = movePiece(state, i, dr, dc);
            var k = gridKey(nxt);
            if (!visited[k]){
              visited[k] = true;
              q.push([nxt, path.concat([[p.name, dname]])]);
            }
          }
        }
      }
    }
    return [null, null];
  }

  // ====== 渲染 ======
  function renderBoard(pcs){
    boardGrid.innerHTML = '';
    boardGrid.style.gridTemplateColumns = 'repeat(' + COLS + ', var(--cell-size))';
    boardGrid.style.gridTemplateRows = 'repeat(' + ROWS + ', var(--cell-size))';

    for (var r=0; r<ROWS; r++){
      for (var c=0; c<COLS; c++){
        var cell = document.createElement('div');
        cell.className = 'cell c-dot';
        boardGrid.appendChild(cell);
      }
    }

    for (var i=0; i<pcs.length; i++){
      var p = pcs[i];
      for (var rr=p.r; rr<p.r+p.h; rr++){
        for (var cc=p.c; cc<p.c+p.w; cc++){
          var idx = rr * COLS + cc;
          var cell = boardGrid.children[idx];
          cell.className = 'cell c-' + p.kind;
          cell.textContent = p.kind;
        }
      }
    }

    if (chest){
      var idx2 = chest[0] * COLS + chest[1];
      var cell2 = boardGrid.children[idx2];
      cell2.classList.add('c-X');
    }
  }

  // ====== 逐步回放控制 ======
  btnReplay.addEventListener('click', function(){
    if (!replayStates.length) return;
    btnReplay.disabled = true;
    var i=0;
    (function step(){
      if (i >= replayStates.length){ btnReplay.disabled = false; return; }
      replayIndex = i;
      renderBoard(replayStates[i]);
      replayPos.textContent = replayIndex + '/' + (replayStates.length-1);
      i++;
      setTimeout(step, 350);
    })();
  });
  btnPrev.addEventListener('click', function(){
    if (!replayStates.length) return;
    replayIndex = Math.max(0, replayIndex - 1);
    renderBoard(replayStates[replayIndex]);
    replayPos.textContent = replayIndex + '/' + (replayStates.length-1);
  });
  btnNext.addEventListener('click', function(){
    if (!replayStates.length) return;
    replayIndex = Math.min(replayStates.length-1, replayIndex + 1);
    renderBoard(replayStates[replayIndex]);
    replayPos.textContent = replayIndex + '/' + (replayStates.length-1);
  });

  // ====== 求解（含鎖定／解鎖） ======
  btnSolve.addEventListener('click', function(){
    try{
      var raw = (mapText.value || '').trim();
      if (!raw) throw new Error('請先載入或貼上盤面文字');

      setBusy(true);
      setStatus('正在求解（BFS）… 請稍候', true);

      // ★ 注意：正則不可拆行，必須單一寫成 /\\r?\\n/
      var lines = raw.split(/\r?\n/).map(function(s){ return s.trim(); }).filter(function(s){ return s.length; });
      pieces = parseLayout(lines);

      boardSizeEl.textContent = COLS + 'x' + ROWS;
      renderBoard(pieces);

      setTimeout(function(){
        var result = solveBfs(pieces);
        var steps = result[0];

        solutionSteps = steps || [];
        stepCountEl.textContent = steps ? steps.length : '不可達';
        stepList.innerHTML = '';

        if (!steps){
          setStatus('找不到解：此佈局可能讓關羽無法觸及寶箱。');
          replayStates = [];
          replayPos.textContent = '—/—';
          setBusy(false);
          return;
        }

        setStatus('已找到最短解！');
        for (var i=0; i<steps.length; i++){
          var li = document.createElement('li');
          li.textContent = (i+1) + '. ' + steps[i][0] + steps[i][1];
          stepList.appendChild(li);
        }

        // 準備回放序列
        replayStates = [pieces];
        var cur = pieces;
        for (var j=0; j<steps.length; j++){
          var name = steps[j][0], dir = steps[j][1];
          var idx = -1; for (var k=0; k<cur.length; k++){ if (cur[k].name === name){ idx = k; break; } }
          var dr = (dir === '上' ? -1 : (dir === '下' ? 1 : 0));
          var dc = (dir === '左' ? -1 : (dir === '右' ? 1 : 0));
          var gridIdx = piecesToGridIdx(cur);
          if (!canMove(cur[idx], gridIdx, dr, dc)) throw new Error('回放移動無效：' + name + dir);
          cur = movePiece(cur, idx, dr, dc);
          replayStates.push(cur);
        }

        btnReplay.disabled = false;
        btnPrev.disabled = false;
        btnNext.disabled = false;
        replayIndex = 0;
        replayPos.textContent = replayIndex + '/' + (replayStates.length-1);
        setBusy(false);
      }, 30);
    } catch(err){
      setStatus('錯誤：' + err.message);
      replayStates = [];
      replayPos.textContent = '—/—';
      setBusy(false);
    }
  });
})();
