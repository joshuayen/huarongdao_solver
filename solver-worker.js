
// solver-worker.js
(function(){
  'use strict';
  const NL = String.fromCharCode(10);
  const CR = String.fromCharCode(13);
  let ROWS = 7, COLS = 4;

  function splitLines(s){
    return (s||'').split(CR).join('').split(NL).map(x=>x.trim()).filter(x=>x.length);
  }
  function normalizeChar(ch){
    if (ch === 'X' || ch === 'x') return '.'; // X/x 標記為目標格但不佔位
    if (ch === 'c') return 'C';
    if (ch === 'g') return 'G';
    if (ch === 'h') return 'H';
    if (ch === 'v') return 'V';
    if (ch === 's') return 'S';
    return ch;
  }
  function parseLayout(lines, needChest){
    const rows = lines.length; const cols = lines[0].length;
    for (let i=0;i<rows;i++){ if (lines[i].length!==cols) throw new Error('每一行長度必須相同'); }
    ROWS=rows; COLS=cols;
    let chestPos = null;
    for (let r=0;r<ROWS;r++){
      for (let c=0;c<COLS;c++){
        const ch = lines[r][c];
        if (ch==='X'||ch==='x'||ch==='c'||ch==='g'||ch==='h'||ch==='v'||ch==='s'){
          if (chestPos) throw new Error('棋盤只允許一個寶箱標記（X/x 或小寫覆蓋）');
          chestPos=[r,c];
        }
      }
    }
    if (needChest && !chestPos) throw new Error("請用 'X' 或小寫覆蓋字母（c/g/h/v/s）標記寶箱所在單格");
    function at(r,c){ return normalizeChar(lines[r][c]); }
    const seen=Array.from({length:ROWS},()=>Array(COLS).fill(false));
    const pcs=[]; let cFound=false, gFound=false;
    let vcnt=0, hcnt=0, scnt=0;
    function add(name, kind, r,c,w,h){ pcs.push({name,kind,r,c,w,h}); }
    for (let r=0;r<ROWS;r++){
      for (let c=0;c<COLS;c++){
        if (seen[r][c]) continue; const ch=at(r,c);
        if (ch==='.') { seen[r][c]=true; continue; }
        if (ch==='C'){
          for (let rr=r; rr<r+2; rr++) for (let cc=c; cc<c+2; cc++){
            if (!(0<=rr && rr<ROWS && 0<=cc && cc<COLS) || at(rr,cc)!=='C') throw new Error('C 必須形成 2x2 方塊');
            seen[rr][cc]=true;
          }
          if (cFound) throw new Error('只能有一個 C（曹操）'); add('曹操','C',r,c,2,2); cFound=true;
        } else if (ch==='V'){
          if (r+1>=ROWS || at(r+1,c)!=='V') throw new Error(`V 在 (${r},${c}) 下方必須也是 V（形成 1x2）`);
          seen[r][c]=true; seen[r+1][c]=true; vcnt++; add('直將'+vcnt,'V',r,c,1,2);
        } else if (ch==='G' || ch==='H'){
          if (c+1>=COLS || at(r,c+1)!==ch) throw new Error(`${ch} 在 (${r},${c}) 右邊必須也是 ${ch}（形成 2x1）`);
          seen[r][c]=true; seen[r][c+1]=true;
          if (ch==='G'){ if (gFound) throw new Error('只能有一個 G（關羽）'); add('關羽','G',r,c,2,1); gFound=true; }
          else { hcnt++; add('橫將'+hcnt,'H',r,c,2,1); }
        } else if (ch==='S'){
          seen[r][c]=true; scnt++; add('兵卒'+scnt,'S',r,c,1,1);
        } else { throw new Error('不支援的字元：'+ch+`（位置 ${r},${c}）`); }
      }
    }
    return { pieces: pcs, chest: chestPos };
  }
  function piecesToGridIdx(pcs){
    const grid=Array.from({length:ROWS},()=>Array(COLS).fill(null));
    for (let i=0;i<pcs.length;i++){
      const p=pcs[i];
      for (let rr=p.r; rr<p.r+p.h; rr++){
        for (let cc=p.c; cc<p.c+p.w; cc++){
          if (!(0<=rr && rr<ROWS && 0<=cc && cc<COLS)) throw new Error(p.name+' 位置越界');
          if (grid[rr][cc]!==null) throw new Error('棋子重疊：'+p.name+' 在 ('+rr+','+cc+')');
          grid[rr][cc]=i;
        }
      }
    }
    return grid;
  }
  function gridKey(pcs){
    const grid=Array.from({length:ROWS},()=>Array(COLS).fill('.'));
    for (let i=0;i<pcs.length;i++){
      const p=pcs[i];
      for (let rr=p.r; rr<p.r+p.h; rr++) for (let cc=p.c; cc<p.c+p.w; cc++) grid[rr][cc]=p.kind;
    }
    let s=''; for (let r=0;r<ROWS;r++){ s+=grid[r].join(''); } return s;
  }
  function canMove(p, gridIdx, dr, dc){
    const nr=p.r+dr, nc=p.c+dc;
    if (nr<0 || nc<0 || nr+p.h>ROWS || nc+p.w>COLS) return false;
    if (dr===-1){ for (let cc=p.c; cc<p.c+p.w; cc++) if (gridIdx[p.r-1][cc]!==null) return false; }
    else if (dr===1){ for (let cc=p.c; cc<p.c+p.w; cc++) if (gridIdx[p.r+p.h][cc]!==null) return false; }
    else if (dc===-1){ for (let rr=p.r; rr<p.r+p.h; rr++) if (gridIdx[rr][p.c-1]!==null) return false; }
    else if (dc===1){ for (let rr=p.r; rr<p.r+p.h; rr++) if (gridIdx[rr][p.c+p.w]!==null) return false; }
    else return false;
    return true;
  }
  function movePiece(pcs,i,dr,dc){ const p=pcs[i]; const np={name:p.name,kind:p.kind,r:p.r+dr,c:p.c+dc,w:p.w,h:p.h}; const out=pcs.slice(0); out[i]=np; return out; }
  function isGoalChest(pcs, chest){ if (!chest) return false; const rX=chest[0], cX=chest[1]; for (let i=0;i<pcs.length;i++){ const p=pcs[i]; if (p.kind==='G'){ for (let rr=p.r; rr<p.r+p.h; rr++) for (let cc=p.c; cc<p.c+p.w; cc++) if (rr===rX && cc===cX) return true; } } return false; }
  function isGoalCaoExit(pcs){ const goalR=ROWS-2, goalC=1; for (let i=0;i<pcs.length;i++){ const p=pcs[i]; if (p.kind==='C') return (p.r===goalR && p.c===goalC); } return false; }
  function lowerOf(kind){ return ({C:'c',G:'g',H:'h',V:'v',S:'s'})[kind] || 'x'; }
  function stateToLines(pcs, chest){ const grid=Array.from({length:ROWS},()=>Array(COLS).fill('.')); for (let i=0;i<pcs.length;i++){ const p=pcs[i]; for (let rr=p.r; rr<p.r+p.h; rr++){ for (let cc=p.c; cc<p.c+p.w; cc++){ grid[rr][cc]=p.kind; } } } if (chest){ const rX=chest[0], cX=chest[1]; const ch=grid[rX][cX]; grid[rX][cX]=(ch==='.'?'X':lowerOf(ch)); } return grid.map(row=>row.join('')); }

  // Heuristic for exit
  function hExit(pcs){ let cTop=null; for (let i=0;i<pcs.length;i++){ const p=pcs[i]; if (p.kind==='C'){ cTop=[p.r,p.c]; break; } } if (!cTop) return 9999; const goalR=ROWS-2, goalC=1; const dv=Math.abs(goalR-cTop[0]); const hx=Math.abs(goalC-cTop[1]); const grid=piecesToGridIdx(pcs); let blockers=0; const seenKinds={}; for (let r=cTop[0]+2; r<ROWS; r++){ for (let c=1; c<=2; c++){ const idx=grid[r][c]; if (idx!==null){ const k=pcs[idx].kind; if (k!=='C' && !seenKinds[k]){ seenKinds[k]=true; blockers++; } } } } return dv+hx+blockers; }

  function solveBfs(start, chest){ const DIRS=[[-1,0,'上'],[1,0,'下'],[0,-1,'左'],[0,1,'右']]; const q=[[start,[]]]; const visited={}; visited[gridKey(start)]=true; let nodes=0, peak=1; while (q.length){ const pair=q.shift(); const state=pair[0], path=pair[1]; nodes++; if (isGoalChest(state,chest)) return {path,state,nodes,visitedCount:Object.keys(visited).length,peak}; const gridIdx=piecesToGridIdx(state); for (let i=0;i<state.length;i++){ const p=state[i]; for (let d=0; d<DIRS.length; d++){ const dr=DIRS[d][0], dc=DIRS[d][1], dname=DIRS[d][2]; if (canMove(p,gridIdx,dr,dc)){ const nxt=movePiece(state,i,dr,dc); const k=gridKey(nxt); if (!visited[k]){ visited[k]=true; q.push([nxt, path.concat([[p.name,dname]])]); if (q.length>peak) peak=q.length; } } } } } return {path:null,state:null,nodes,visitedCount:Object.keys(visited).length,peak}; }

  function solveAstarExit(start){ const DIRS=[[1,0,'下'],[-1,0,'上'],[0,-1,'左'],[0,1,'右']]; // 下、上、左、右
    // MinHeap for open list
    class MinHeap{ constructor(){ this.a=[]; } size(){return this.a.length;} push(x){ this.a.push(x); this._up(this.a.length-1);} pop(){ if (!this.a.length) return null; const r=this.a[0]; const x=this.a.pop(); if (this.a.length){ this.a[0]=x; this._down(0);} return r; } _up(i){ const a=this.a; while(i){ const p=(i-1)>>1; if (a[p].f<=a[i].f) break; const t=a[p]; a[p]=a[i]; a[i]=t; i=p; } } _down(i){ const a=this.a; for(;;){ const l=i*2+1,r=i*2+2; let m=i; if (l<a.length && a[l].f<a[m].f) m=l; if (r<a.length && a[r].f<a[m].f) m=r; if (m===i) break; const t=a[i]; a[i]=a[m]; a[m]=t; i=m; } } }
    const open=new MinHeap(); const startH=hExit(start); open.push({f:startH,g:0,h:startH,state:start,path:[]}); const visited={}; visited[gridKey(start)]=true; let nodes=0, peak=1;
    while(open.size()){ const node=open.pop(); const state=node.state, path=node.path; nodes++; if (isGoalCaoExit(state)) return {path,state,nodes,visitedCount:Object.keys(visited).length,peak}; const gridIdx=piecesToGridIdx(state); for (let i=0;i<state.length;i++){ const p=state[i]; for (let d=0; d<DIRS.length; d++){ const dr=DIRS[d][0], dc=DIRS[d][1], dname=DIRS[d][2]; if (canMove(p,gridIdx,dr,dc)){ const nxt=movePiece(state,i,dr,dc); const k=gridKey(nxt); if (!visited[k]){ visited[k]=true; const g2=path.length+1; const h2=hExit(nxt); const f2=g2+h2; open.push({f:f2,g:g2,h:h2,state:nxt,path:path.concat([[p.name,dname]])}); if (open.size()>peak) peak=open.size(); } } } } } return {path:null,state:null,nodes,visitedCount:Object.keys(visited).length,peak}; }

  function handleSolve(mode, raw){
    try{
      const t0 = performance.now();
      const lines = splitLines(raw);
      const needChest = (mode==='CHEST');
      const {pieces, chest} = parseLayout(lines, needChest);
      const t1 = performance.now();
      let result;
      const t2 = performance.now();
      if (mode==='CHEST') result = solveBfs(pieces, chest);
      else result = solveAstarExit(pieces);
      const t3 = performance.now();
      const usLoad = Math.round((t1 - t0) * 1000);
      const usSolve = Math.round((t3 - t2) * 1000);
      const usTotal = Math.round((t3 - t0) * 1000);
      if (!result.path){
        postMessage({ type:'SOLVE_DONE', mode, steps:[], states:[], metrics:{usLoad, usSolve, usTotal, nodesExpanded:result.nodes, statesVisited:result.visitedCount, peakQueue:result.peak}, msg:'未找到解'});
        return;
      }
      // Build replay states
      const states = [ stateToLines(pieces, chest) ];
      let cur = pieces;
      for (let j=0;j<result.path.length;j++){
        const name = result.path[j][0], dir = result.path[j][1];
        let idx = -1; for (let k=0;k<cur.length;k++){ if (cur[k].name===name){ idx=k; break; } }
        const dr = (dir==='上'?-1:(dir==='下'?1:0)); const dc=(dir==='左'?-1:(dir==='右'?1:0));
        const gridIdx = piecesToGridIdx(cur);
        if (!canMove(cur[idx], gridIdx, dr, dc)) throw new Error('回放移動無效：'+name+dir);
        cur = movePiece(cur, idx, dr, dc);
        states.push( stateToLines(cur, chest) );
      }
      postMessage({ type:'SOLVE_DONE', mode, steps: result.path, states, metrics:{usLoad, usSolve, usTotal, nodesExpanded:result.nodes, statesVisited:result.visitedCount, peakQueue:result.peak} });
    }catch(err){ postMessage({ type:'SOLVE_ERROR', error: (err && err.message) || String(err) }); }
  }

  onmessage = function(ev){ const data=ev.data||{}; if (data.type==='SOLVE_CHEST') handleSolve('CHEST', data.payload.raw); else if (data.type==='SOLVE_EXIT') handleSolve('EXIT', data.payload.raw); };
})();
