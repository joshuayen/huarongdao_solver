
// ====== 盤面 I/O ======
const mapFile = document.getElementById('mapFile');
const btnLoadExample = document.getElementById('btnLoadExample');
const mapText = document.getElementById('mapText');
const btnSolve = document.getElementById('btnSolve');

const statusMsg = document.getElementById('statusMsg');
const boardSizeEl = document.getElementById('boardSize');
const stepCountEl = document.getElementById('stepCount');

const boardGrid = document.getElementById('boardGrid');
const stepList = document.getElementById('stepList');

const btnReplay = document.getElementById('btnReplay');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const replayPos = document.getElementById('replayPos');

let ROWS = 7, COLS = 4;
let chest = null;          // [r, c]
let pieces = [];           // Array of {name,w,h,r,c,kind}
let solutionSteps = [];    // Array of [name, dir]
let replayStates = [];     // Array of pieces states for playback
let replayIndex = 0;

// 範例盤面（與 Python 內建示例一致）
const EXAMPLE = [
  "CCSV",
  "CCSV",
  "VGGS",
  "VSHH",
  "X.HH",
  "VVVV",
  "VVVV",
].join('
');

btnLoadExample.addEventListener('click', () => {
  mapText.value = EXAMPLE;
  statusMsg.textContent = '已載入範例盤面。';
});

mapFile.addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const txt = await f.text();
  mapText.value = txt;
  statusMsg.textContent = `已載入檔案：${f.name}`;
});

// ====== 新增：忙碌狀態與訊息 ======
function setBusy(on) {
  mapText.disabled = on;
  mapFile.disabled = on;
  btnLoadExample.disabled = on;
  btnSolve.disabled = on;

  btnReplay.disabled = on || !replayStates.length;
  btnPrev.disabled = on || !replayStates.length;
  btnNext.disabled = on || !replayStates.length;

  boardGrid.classList.toggle('is-busy', on);
}
function setStatus(text, isBusy = false) {
  statusMsg.innerHTML = isBusy ? `<span class="spinner"></span> ${text}` : text;
}

// ====== 解析佈局（X 視為 '.' 以檢查棋子形狀） ======
function parseLayout(lines) {
  const rows = lines.length;
  if (rows === 0) throw new Error('棋盤不可空白');
  const cols = lines[0].length;
  if (!lines.every(r => r.length === cols)) throw new Error('每一行長度必須相同');

  ROWS = rows; COLS = cols;
  let chestPos = null;

  const at = (r, c) => {
    const ch = lines[r][c];
    return ch === 'X' ? '.' : ch;
  };

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (lines[r][c] === 'X') {
        if (chestPos) throw new Error('棋盤只能有一個 X（寶箱）');
        chestPos = [r, c];
      }
    }
  }
  if (!chestPos) throw new Error("請用 'X' 標記寶箱所在單格");
  chest = chestPos;

  const seen = Array.from({length: ROWS}, () => Array(COLS).fill(false));
  const piecesOut = [];
  let vcnt = 0, hcnt = 0, scnt = 0;
  let cFound = false, gFound = false;

  function add(name, kind, r, c, w, h) {
    piecesOut.push({name, kind, r, c, w, h});
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (seen[r][c]) continue;
      let ch = at(r, c);
      if (ch === '.') { seen[r][c] = true; continue; }

      if (ch === 'C') {
        for (let rr = r; rr < r+2; rr++) for (let cc = c; cc < c+2; cc++) {
          if (!(0 <= rr && rr < ROWS && 0 <= cc && cc < COLS) || at(rr, cc) !== 'C') {
            throw new Error('C 必須形成 2×2 方塊');
          }
          seen[rr][cc] = true;
        }
        if (cFound) throw new Error('只能有一個 C（曹操）');
        add('曹操', 'C', r, c, 2, 2); cFound = true;

      } else if (ch === 'V') {
        if (r+1 >= ROWS || at(r+1, c) !== 'V') {
          throw new Error(`V 在 (${r},${c}) 下方必須也是 V（形成 1×2）`);
        }
        seen[r][c] = true; seen[r+1][c] = true;
        vcnt++; add(`縱將${vcnt}`, 'V', r, c, 1, 2);

      } else if (ch === 'G' || 'H') {
        if (ch === 'G' || ch === 'H') {
          if (c+1 >= COLS || at(r, c+1) !== ch) {
            throw new Error(`${ch} 在 (${r},${c}) 右邊必須也是 ${ch}（形成 2×1）`);
          }
          seen[r][c] = true; seen[r][c+1] = true;
          if (ch === 'G') {
            if (gFound) throw new Error('只能有一個 G（關羽）');
            add('關羽', 'G', r, c, 2, 1); gFound = true;
          } else {
            hcnt++; add(`橫將${hcnt}`, 'H', r, c, 2, 1);
          }
        }

      } else if (ch === 'S') {
        seen[r][c] = true; scnt++; add(`兵卒${scnt}`, 'S', r, c, 1, 1);

      } else {
        throw new Error(`不支援的字元：${ch}（位置 ${r},${c}）`);
      }
    }
  }

  if (!gFound) throw new Error("請用 'G' 標記關羽（2×1 水平，連續兩格）");
  return piecesOut;
}

function piecesToGridIdx(pcs) {
  const grid = Array.from({length: ROWS}, () => Array(COLS).fill(null));
  pcs.forEach((p, idx) => {
    for (let rr = p.r; rr < p.r + p.h; rr++) {
      for (let cc = p.c; cc < p.c + p.w; cc++) {
        if (!(0 <= rr && rr < ROWS && 0 <= cc && cc < COLS)) {
          throw new Error(`${p.name} 位置越界`);
        }
        if (grid[rr][cc] !== null) {
          throw new Error(`棋子重疊：${p.name} 與索引 ${grid[rr][cc]} 在 (${rr},${cc})`);
        }
        grid[rr][cc] = idx;
      }
    }
  });
  return grid;
}
function gridKey(pcs) {
  const grid = Array.from({length: ROWS}, () => Array(COLS).fill('.'));
  pcs.forEach(p => {
    for (let rr = p.r; rr < p.r+p.h; rr++) for (let cc = p.c; cc < p.c+p.w; cc++) {
      grid[rr][cc] = p.kind;
    }
  });
  return grid.map(row => row.join('')).join('');
}
function canMove(p, gridIdx, dr, dc) {
  const nr = p.r + dr, nc = p.c + dc;
  if (nr < 0 || nc < 0 || nr + p.h > ROWS || nc + p.w > COLS) return false;

  if (dr === -1) {
    for (let cc = p.c; cc < p.c+p.w; cc++) if (gridIdx[p.r-1][cc] !== null) return false;
  } else if (dr === 1) {
    for (let cc = p.c; cc < p.c+p.w; cc++) if (gridIdx[p.r+p.h][cc] !== null) return false;
  } else if (dc === -1) {
    for (let rr = p.r; rr < p.r+p.h; rr++) if (gridIdx[rr][p.c-1] !== null) return false;
  } else if (dc === 1) {
    for (let rr = p.r; rr < p.r+p.h; rr++) if (gridIdx[rr][p.c+p.w] !== null) return false;
  } else return false;

  return true;
}
function movePiece(pcs, i, dr, dc) {
  const p = pcs[i];
  const newP = {...p, r: p.r + dr, c: p.c + dc};
  const out = pcs.slice();
  out[i] = newP;
  return out;
}
function isGoalChest(pcs, chest) {
  const [rX, cX] = chest;
  for (const p of pcs) {
    if (p.kind === 'G') {
      for (let rr = p.r; rr < p.r+p.h; rr++) for (let cc = p.c; cc < p.c+p.w; cc++) {
        if (rr === rX && cc === cX) return true;
      }
    }
  }
  return false;
}

function solveBfs(start) {
  const DIRS = [[-1,0,'上'], [1,0,'下'], [0,-1,'左'], [0,1,'右']];
  const q = [];
  q.push([start, []]);
  const visited = new Set([gridKey(start)]);

  while (q.length) {
    const [state, path] = q.shift();
    if (isGoalChest(state, chest)) return [path, state];

    const gridIdx = piecesToGridIdx(state);
    for (let i = 0; i < state.length; i++) {
      const p = state[i];
      for (const [dr, dc, dname] of DIRS) {
        if (canMove(p, gridIdx, dr, dc)) {
          const nxt = movePiece(state, i, dr, dc);
          const k = gridKey(nxt);
          if (!visited.has(k)) {
            visited.add(k);
            q.push([nxt, [...path, [p.name, dname]]]);
          }
        }
      }
    }
  }
  return [null, null];
}

function renderBoard(pcs) {
  boardGrid.innerHTML = '';
  boardGrid.style.gridTemplateColumns = `repeat(${COLS}, var(--cell-size))`;
  boardGrid.style.gridTemplateRows = `repeat(${ROWS}, var(--cell-size))`;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell c-dot';
      cell.dataset.r = r; cell.dataset.c = c;
      boardGrid.appendChild(cell);
    }
  }
  pcs.forEach(p => {
    for (let rr = p.r; rr < p.r+p.h; rr++) {
      for (let cc = p.c; cc < p.c+p.w; cc++) {
        const idx = rr * COLS + cc;
        const cell = boardGrid.children[idx];
        cell.className = `cell c-${p.kind}`;
        cell.textContent = p.kind;
      }
    }
  });
  if (chest) {
    const idx = chest[0] * COLS + chest[1];
    const cell = boardGrid.children[idx];
    cell.classList.add('c-X');
  }
}

btnReplay.addEventListener('click', async () => {
  if (!replayStates.length) return;
  btnReplay.disabled = true;
  for (let i = 0; i < replayStates.length; i++) {
    replayIndex = i;
    renderBoard(replayStates[i]);
    replayPos.textContent = `${replayIndex}/${replayStates.length-1}`;
    await new Promise(r => setTimeout(r, 350));
  }
  btnReplay.disabled = false;
});

btnPrev.addEventListener('click', () => {
  if (!replayStates.length) return;
  replayIndex = Math.max(0, replayIndex - 1);
  renderBoard(replayStates[replayIndex]);
  replayPos.textContent = `${replayIndex}/${replayStates.length-1}`;
});
btnNext.addEventListener('click', () => {
  if (!replayStates.length) return;
  replayIndex = Math.min(replayStates.length-1, replayIndex + 1);
  renderBoard(replayStates[replayIndex]);
  replayPos.textContent = `${replayIndex}/${replayStates.length-1}`;
});

// ====== 求解（含鎖定／解鎖） ======
btnSolve.addEventListener('click', async () => {
  try {
    const raw = (mapText.value || '').trim();
    if (!raw) throw new Error('請先載入或貼上盤面文字');

    setBusy(true);
    setStatus('正在求解（BFS）… 請稍候', true);

    const lines = raw.split(/?
/).map(s => s.trim()).filter(s => s.length);
    pieces = parseLayout(lines);

    boardSizeEl.textContent = `${COLS}×${ROWS}`;
    renderBoard(pieces);

    await new Promise(r => setTimeout(r, 30));

    const [steps, finalState] = solveBfs(pieces);
    solutionSteps = steps || [];
    stepCountEl.textContent = steps ? steps.length : '不可達';
    stepList.innerHTML = '';

    if (!steps) {
      setStatus('找不到解：此佈局可能讓關羽無法觸及寶箱。');
      replayStates = [];
      replayPos.textContent = '—/—';
      return;
    }

    setStatus('已找到最短解！');
    steps.forEach(([name, dir], i) => {
      const li = document.createElement('li');
      li.textContent = `${i+1}. ${name}${dir}`;
      stepList.appendChild(li);
    });

    replayStates = [pieces];
    let cur = pieces;
    steps.forEach(([name, dir]) => {
      const idx = cur.findIndex(p => p.name === name);
      const dr = (dir === '上' ? -1 : dir === '下' ? 1 : 0);
      const dc = (dir === '左' ? -1 : dir === '右' ? 1 : 0);
      const gridIdx = piecesToGridIdx(cur);
      if (!canMove(cur[idx], gridIdx, dr, dc)) {
        throw new Error(`回放移動無效：${name}${dir}`);
      }
      cur = movePiece(cur, idx, dr, dc);
      replayStates.push(cur);
    });

    btnReplay.disabled = false;
    btnPrev.disabled = false;
    btnNext.disabled = false;
    replayIndex = 0;
    replayPos.textContent = `${replayIndex}/${replayStates.length-1}`;

  } catch (err) {
    setStatus(`錯誤：${err.message}`);
    replayStates = [];
    replayPos.textContent = '—/—';
  } finally {
    setBusy(false);
  }
});
