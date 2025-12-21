
document.addEventListener("DOMContentLoaded", () => {
  const VERSION = "1767";
  const WORD_LEN = 5;
  const MAX_ROWS = 15;
  const BOARD_COUNT = 8;
  const VALID_TXT_URL = "assets/valid_words.txt?v=" + VERSION;
  const STORAGE_KEY = "8xfww-state";
  const STATS_KEY = "8xfww-stats";

  (function initTheme(){
    try{
      const saved = localStorage.getItem("8xfww-theme");
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const theme = (saved === "light" || saved === "dark") ? saved : (prefersDark ? "dark" : "light");
      document.documentElement.setAttribute("data-theme", theme);
      const radios = document.querySelectorAll('input[name="theme"]');
      radios.forEach(r=>{ r.checked = (r.value === theme); r.addEventListener("change", (e)=>{ const t=e.target.value; document.documentElement.setAttribute("data-theme", t); localStorage.setItem("8xfww-theme", t); }); });
    }catch(e){ console.warn("theme init", e); }
  })();

  function getETParts() {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
    const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
    return {year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour};
  }
  function etMidnightUTC(y,m,d) { return Date.UTC(y, m-1, d); }
  function dayIndexET() { const {year,month,day,hour} = getETParts(); const EPOCH=Date.UTC(2025,0,1); let t=etMidnightUTC(year,month,day); if(hour<8) t-=86400000; return Math.floor((t-EPOCH)/86400000); }
  function safeJSONParse(str){
    try{ return JSON.parse(str); }catch{ return null; }
  }

  async function loadValidList() {
    try {
      const r = await fetch(VALID_TXT_URL, { cache: "no-store" });
      if (!r.ok) throw new Error("no valid_words.txt");
      const raw = await r.text();
      const list = raw.split(/\r?\n|[\s,]+/).map(w=>w.trim().toUpperCase()).filter(w=>/^[A-Z]{5}$/.test(w));
      return Array.from(new Set(list));
    } catch (e) {
      console.warn("fallback WORDS", e);
      const fb = (window.WORDS||[]).map(w=>String(w).trim().toUpperCase()).filter(w=>/^[A-Z]{5}$/.test(w));
      return fb.length?fb:["APPLE","BRAIN","CANDY","DOUBT","EAGER","FRAIL","GHOST","HONEY"];
    }
  }
  function selectAnswers(validList) {
    if (!validList.length) return ["APPLE","BRAIN","CANDY","DOUBT","EAGER","FRAIL","GHOST","HONEY"];
    const idx = dayIndexET();
    const start = (idx*BOARD_COUNT) % validList.length;
    const out=[]; for (let i=0;i<BOARD_COUNT;i++) out.push(validList[(start+i)%validList.length]);
    return out;
  }

  (async function init(){
    const validList = await loadValidList();
    const ANSWERS = selectAnswers(validList);
    const todayIndex = dayIndexET();

    let activeBoard=0, viewBoard=0, maxUnlocked=0, runFinished=false;
    let state = ANSWERS.map(()=>({rows:Array(MAX_ROWS).fill(""),attempt:0,solved:false,invalidRow:-1}));

    const boardsEl=document.getElementById("boards");
    const keyboardEl=document.getElementById("keyboard");
    const boardNumEl=document.getElementById("boardNum");
    const activeNumEl=document.getElementById("activeNum");
    const resetBtn=document.getElementById("resetBtn");
    const validSet = new Set(validList);

    hydrateFromStorage();

    buildBoards(); buildKeyboard();
    renderAllBoards(true);
    updateLockUI(); updateStatus(); updateNavButtons(); drawPreviewAll(); persistState();

    window.addEventListener("keydown",(e)=>{ const k=e.key; if(/^[a-z]$/i.test(k)) onLetter(k.toUpperCase()); else if(k==="Backspace") onBackspace(); else if(k==="Enter") onEnter(); });
    resetBtn?.addEventListener("click", resetGame);
    ensureStatsForToday();

    function buildBoards(){
      boardsEl.innerHTML="";
      for (let i=0;i<BOARD_COUNT;i++){
        const b=document.createElement("section"); b.className="board"+(i===0?"":" locked"); b.dataset.index=i;
        const title=document.createElement("div"); title.className="board-title"; title.textContent="Board "+(i+1); b.appendChild(title);
        const grid=document.createElement("div"); grid.className="grid";
        for (let r=0;r<MAX_ROWS;r++) for (let c=0;c<WORD_LEN;c++){ const t=document.createElement("div"); t.className="tile"; grid.appendChild(t);}
        b.appendChild(grid); boardsEl.appendChild(b);
      }
    }
    function buildKeyboard(){
      keyboardEl.innerHTML="";
      const nav=document.createElement("div"); nav.className="krow krow-nav";
      for (let i=1;i<=BOARD_COUNT;i++){ const k=mk("button","key",String(i)); k.dataset.idx=String(i-1); k.type="button"; k.title="Jump to board "+i; k.setAttribute("aria-label","Jump to board "+i); k.addEventListener("click",()=>onNavClick(i-1)); nav.appendChild(k);}
      const rows=["QWERTYUIOP","ASDFGHJKL","ZXCVBNM"];
      const r1=document.createElement("div"); r1.className="krow";
      const r2=document.createElement("div"); r2.className="krow";
      const r3=document.createElement("div"); r3.className="krow";
      for (const ch of rows[0]) r1.appendChild(mkKey(ch));
      for (const ch of rows[1]) r2.appendChild(mkKey(ch));
      r3.appendChild(mkKey("ENTER","wide"));
      for (const ch of rows[2]) r3.appendChild(mkKey(ch));
      r3.appendChild(mkKey("⌫","wide"));
      keyboardEl.append(nav,r1,r2,r3);
    }
    function mkKey(label,extra){ const key=mk("button","key"+(extra?" "+extra:""),label); key.type="button"; key.setAttribute("aria-label", label==="ENTER"?"Submit guess":(label==="⌫"?"Backspace":label)); key.addEventListener("click",()=>{ if(label==="ENTER") onEnter(); else if(label==="⌫") onBackspace(); else onLetter(label); }); return key; }
    function mk(tag,cls,txt){ const el=document.createElement(tag); el.className=cls; el.textContent=txt; return el;}
    function cur(){return state[activeBoard];}
    function boardEl(i){return boardsEl.children[i];}

    // NAVIGATION (view only)
    function onNavClick(idx){ viewBoard=idx; updateStatus(); updateNavButtons(); boardEl(viewBoard).scrollIntoView({behavior:"smooth",block:"nearest"}); drawPreviewAll(); persistState(); }
    function updateNavButtons(){ const btns=keyboardEl.querySelectorAll('.krow-nav .key'); btns.forEach((b,i)=>{ b.classList.toggle('active', i===viewBoard); b.classList.toggle('solved', state[i]?.solved===true); b.disabled = i>maxUnlocked; }); }

    // INPUT to active board only
    function onLetter(ch){ const s=cur(); if(runFinished||s.solved) return; if(s.invalidRow===s.attempt) return; const row=s.rows[s.attempt]||""; if(row.length>=WORD_LEN) return; s.rows[s.attempt]=row+ch; renderRowActive(activeBoard,s.attempt); persistState(); drawPreviewAll(); }
    function onBackspace(){ const s=cur(); if(runFinished||s.solved) return; let row=s.rows[s.attempt]||""; if(!row.length){ if(s.invalidRow===s.attempt){clearInvalidRow(activeBoard,s.attempt); s.invalidRow=-1;} drawPreviewAll(); persistState(); return; } s.rows[s.attempt]=row.slice(0,-1); renderRowActive(activeBoard,s.attempt); if(s.invalidRow===s.attempt){clearInvalidRow(activeBoard,s.attempt); s.invalidRow=-1;} persistState(); drawPreviewAll(); }
    function onEnter(){ 
      const s=cur(); if(runFinished||s.solved) return; if(s.invalidRow===s.attempt) return; 
      const guess=(s.rows[s.attempt]||"").toUpperCase(); if(guess.length!==WORD_LEN) return; 
      if(!validSet.has(guess)){markInvalidRow(activeBoard,s.attempt); s.invalidRow=s.attempt; return;}

      // Mirror guess (ghost) on every UNSOLVED board; keep rows aligned.
      for(let bi=0; bi<BOARD_COUNT; bi++){ 
        const sb=state[bi]; if(sb.solved) continue; if(sb.attempt>=MAX_ROWS) continue; 
        if(!sb.rows[sb.attempt]) sb.rows[sb.attempt]=guess; paintRowGhost(bi,sb.attempt); if(bi!==activeBoard) sb.attempt++; 
      }

      const answer=ANSWERS[activeBoard]; const res=evalGuess(guess,answer); paintRowColored(activeBoard,s.attempt,res); updateKeyboard(guess,res);
      incrementTries();

      if(guess===answer){ s.solved=true; s.attempt=Math.min(s.attempt+1,MAX_ROWS); confettiBurstForBoard(activeBoard); updateStatsAfterSolve(); updateNavButtons(); if(activeBoard===BOARD_COUNT-1){ if(window.launchConfetti) window.launchConfetti(); finalizeRun(state.every(b=>b.solved)); } else unlockNext(); }
      else { s.attempt++; if(s.attempt>=MAX_ROWS){ unlockNext(); if(activeBoard===BOARD_COUNT-1) finalizeRun(state.every(b=>b.solved)); } }
      persistState();
      drawPreviewAll(); 
    }

    // Preview while typing: mirror partial word to other boards' current rows in ghost
    function drawPreviewAll(){ 
      const sCur=cur(); const curStr=(sCur.rows[sCur.attempt]||""); 
      for(let bi=0; bi<BOARD_COUNT; bi++){ 
        const s=state[bi]; if(s.solved) continue; const ri=s.attempt; if(ri>=MAX_ROWS) continue; 
        if(bi===activeBoard) { renderRowActive(bi,ri); continue; }
        const existing=s.rows[ri]||""; const str = existing.length===WORD_LEN ? existing : (existing || curStr); setRowGhost(bi,ri,str,true); 
      } 
    }

    // Render helpers
    function setRowGhost(bi,ri,str,ghost=true){ const b=boardEl(bi); const tiles=b.querySelectorAll(".tile"); const start=ri*WORD_LEN; for(let i=0;i<WORD_LEN;i++){ const t=tiles[start+i]; t.classList.remove("correct","present","absent","invalid"); if(ghost) t.classList.add("ghost"); else t.classList.remove("ghost"); t.textContent=str[i] || ""; } }
    function renderRowActive(bi,ri){ const s=state[bi]; const str=s.rows[ri]||""; setRowGhost(bi,ri,str,false); }
    function markInvalidRow(bi,ri){ const b=boardEl(bi); const tiles=b.querySelectorAll(".tile"); const start=ri*WORD_LEN; for(let i=0;i<WORD_LEN;i++) tiles[start+i].classList.add("invalid"); }
    function clearInvalidRow(bi,ri){ const b=boardEl(bi); const tiles=b.querySelectorAll(".tile"); const start=ri*WORD_LEN; for(let i=0;i<WORD_LEN;i++) tiles[start+i].classList.remove("invalid"); }
    function evalGuess(guess,answer){ const res=Array(WORD_LEN).fill("absent"); const cnt={}; for(const ch of answer) cnt[ch]=(cnt[ch]||0)+1; for(let i=0;i<WORD_LEN;i++) if(guess[i]===answer[i]){ res[i]="correct"; cnt[guess[i]]--; } for(let i=0;i<WORD_LEN;i++) if(res[i]!=="correct"){ const ch=guess[i]; if((cnt[ch]||0)>0){ res[i]="present"; cnt[ch]--; } } return res; }
    function paintRowColored(bi,ri,res,instant=false){ const b=boardEl(bi); const tiles=b.querySelectorAll(".tile"); const start=ri*WORD_LEN; const word=state[bi].rows[ri]; for(let i=0;i<WORD_LEN;i++){ const t=tiles[start+i]; t.classList.remove("ghost"); t.textContent=word[i] || ""; if(instant){ t.classList.remove("flip"); t.classList.add(res[i]); } else { t.classList.add("flip"); setTimeout(()=>{ t.classList.remove("flip"); t.classList.add(res[i]); },80+i*30); } } }
    function paintRowGhost(bi,ri){ const s=state[bi]; const str=s.rows[ri]||""; setRowGhost(bi,ri,str,true); }
    function paintExistingAsColored(bi,instant=false){ const s=state[bi]; for(let r=0;r<s.attempt;r++){ const guess=s.rows[r]; if(!guess) continue; const res=evalGuess(guess,ANSWERS[bi]); paintRowColored(bi,r,res,instant); updateKeyboard(guess,res); } if(!s.solved && s.attempt<MAX_ROWS) renderRowActive(bi,s.attempt); }
    
    function autoSolveIfPreGuessed(bi){
      const s = state[bi];
      const answer = ANSWERS[bi];
      for(let r=0; r<=s.attempt; r++){
        const g = (s.rows[r]||"").toUpperCase();
        if(g.length===WORD_LEN && g===answer){
          const res = evalGuess(g, answer);
          paintRowColored(bi, r, res);
          s.solved = true;
          s.attempt = Math.max(s.attempt, r+1);
          confettiBurstForBoard(bi); updateStatsAfterSolve(); updateNavButtons();
          if(bi===BOARD_COUNT-1){
            if(window.launchConfetti) window.launchConfetti();
            finalizeRun(state.every(b=>b.solved));
          } else {
            unlockNext();
          }
          return true;
        }
      }
      return false;
    }
    function updateKeyboard(guess,res){ for(let i=0;i<WORD_LEN;i++){ const ch=guess[i]; const k=findKey(ch); if(!k) continue; if(res[i]==="correct"){k.classList.remove("present","absent");k.classList.add("correct");} else if(res[i]==="present"&&!k.classList.contains("correct")){k.classList.remove("absent");k.classList.add("present");} else if(!k.classList.contains("correct")&&!k.classList.contains("present")){k.classList.add("absent");} } }
    function findKey(ch){ return Array.from(keyboardEl.querySelectorAll(".key")).find(k=>k.textContent===ch)||null; }

    function confettiBurstForBoard(bi){
      try{
        const el = boardEl(bi);
        const r = el.getBoundingClientRect();
        const cx = (r.left + r.width / 2) / window.innerWidth;
        const cy = (r.top + r.height / 2) / window.innerHeight;
        window.confetti({ particleCount: 90, spread: 80, origin: { x: cx, y: cy }, ticks: 90 });
      }catch(e){}
    }

    function unlockNext(){
      if(activeBoard<BOARD_COUNT-1){
        activeBoard=activeBoard+1;
        if(activeBoard>maxUnlocked) maxUnlocked=activeBoard;
        viewBoard=activeBoard;
        paintExistingAsColored(activeBoard);
        const autoSolved = autoSolveIfPreGuessed(activeBoard);
        updateLockUI(); updateStatus(); updateNavButtons();
        boardEl(viewBoard).scrollIntoView({behavior:"smooth",block:"nearest"});
        persistState();
        if(autoSolved) checkRunComplete();
      } else if(activeBoard===BOARD_COUNT-1){
        checkRunComplete();
      }
    }
    function updateLockUI(){ for(let i=0;i<BOARD_COUNT;i++){ const b=boardEl(i); if(i<=maxUnlocked) b.classList.remove("locked"); else b.classList.add("locked"); } }
    function updateStatus(){ boardNumEl.textContent=(viewBoard+1); activeNumEl.textContent=(activeBoard+1); }

    function checkRunComplete(){
      if(runFinished) return;
      const allFinished = state.every(s=>s.solved || s.attempt>=MAX_ROWS);
      if(allFinished) finalizeRun(state.every(s=>s.solved));
    }

    function resetGame(){ for(let i=0;i<state.length;i++) state[i]={rows:Array(MAX_ROWS).fill(""),attempt:0,solved:false,invalidRow:-1}; activeBoard=0; viewBoard=0; maxUnlocked=0; runFinished=false; for(let i=0;i<BOARD_COUNT;i++){ const b=boardEl(i); b.querySelectorAll(".tile").forEach(t=>{t.className="tile"; t.textContent="";}); } buildKeyboard(); updateLockUI(); updateStatus(); updateNavButtons(); drawPreviewAll(); persistState(); }

    function renderAllBoards(instant=false){
      for(let i=0;i<BOARD_COUNT;i++){
        paintExistingAsColored(i,instant);
        if(state[i].invalidRow===state[i].attempt) markInvalidRow(i,state[i].attempt);
      }
    }

    function sanitizeBoardState(b){
      const rows=Array.isArray(b.rows)?b.rows.slice(0,MAX_ROWS).map(v=>String(v||"").toUpperCase()):Array(MAX_ROWS).fill("");
      while(rows.length<MAX_ROWS) rows.push("");
      let attempt= Math.min(Math.max(parseInt(b.attempt,10)||0,0),MAX_ROWS);
      const lastFilled = rows.reduce((idx,row,i)=> row?i:idx,-1);
      if(lastFilled>=0 && attempt<lastFilled+1) attempt = Math.min(lastFilled+1, MAX_ROWS);
      return {rows,attempt,solved:!!b.solved,invalidRow:Math.min(Math.max(parseInt(b.invalidRow,10)||-1,-1),MAX_ROWS-1)};
    }

    function hydrateFromStorage(){
      const raw = safeJSONParse(localStorage.getItem(STORAGE_KEY));
      if(!raw || raw.dayIndex!==todayIndex) { localStorage.removeItem(STORAGE_KEY); return null; }
      if(!Array.isArray(raw.answers) || raw.answers.length!==ANSWERS.length || raw.answers.join(",")!==ANSWERS.join(",")) { localStorage.removeItem(STORAGE_KEY); return null; }
      const savedState = Array.isArray(raw.state)?raw.state.map(sanitizeBoardState):[];
      if(savedState.length!==BOARD_COUNT) return null;
      state = savedState;
      activeBoard = Math.min(Math.max(parseInt(raw.activeBoard,10)||0,0),BOARD_COUNT-1);
      viewBoard = Math.min(Math.max(parseInt(raw.viewBoard,10)||0,0),BOARD_COUNT-1);
      maxUnlocked = Math.min(Math.max(parseInt(raw.maxUnlocked,10)||0,0),BOARD_COUNT-1);
      runFinished = !!raw.runFinished;
      for(let i=1;i<BOARD_COUNT;i++){
        if((state[i-1].solved || state[i-1].attempt>=MAX_ROWS) && maxUnlocked<i) maxUnlocked=i;
      }
      if(activeBoard>maxUnlocked) activeBoard=maxUnlocked;
      if(viewBoard>maxUnlocked) viewBoard=maxUnlocked;
      return raw;
    }

    function persistState(){
      try{
        const payload={dayIndex:todayIndex, answers:ANSWERS, activeBoard, viewBoard, maxUnlocked, runFinished, state};
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }catch(e){ console.warn("persist state", e); }
    }

    const toNum = (v,d=0)=>{ const n=parseInt(v,10); return Number.isFinite(n)?n:d; };

    function ensureStatsForToday(){
      const today=todayIndex;
      const raw = safeJSONParse(localStorage.getItem(STATS_KEY)) || {};
      let {dayIndex= today, solved=0, tries=0, best=0, streak=0, lastWinDay=null} = raw;
      dayIndex = toNum(dayIndex, today);
      solved = toNum(solved,0); tries=toNum(tries,0); best=toNum(best,0); streak=toNum(streak,0);
      lastWinDay = Number.isFinite(toNum(lastWinDay,NaN)) ? toNum(lastWinDay,NaN) : null;
      if(dayIndex!==today){
        const carryStreak = (lastWinDay===dayIndex && dayIndex===today-1) || (lastWinDay===today-1);
        streak = carryStreak ? streak : 0;
        solved=0; tries=0; dayIndex=today;
      }
      saveStats({dayIndex, solved, tries, best, streak, lastWinDay});
    }

    function saveStats(stats){
      try{
        localStorage.setItem(STATS_KEY, JSON.stringify(stats));
        localStorage.setItem("x-solved", String(stats.solved||0));
        localStorage.setItem("x-tries", String(stats.tries||0));
        localStorage.setItem("x-best", String(stats.best||0));
        localStorage.setItem("x-streak", String(stats.streak||0));
        document.dispatchEvent(new CustomEvent("xui-stats-updated",{detail:stats}));
      }catch(e){ console.warn("stats save", e); }
    }

    function readStats(){
      const raw = safeJSONParse(localStorage.getItem(STATS_KEY)) || {};
      let stats = {dayIndex:toNum(raw.dayIndex,todayIndex), solved:toNum(raw.solved,0), tries:toNum(raw.tries,0), best:toNum(raw.best,0), streak:toNum(raw.streak,0), lastWinDay:Number.isFinite(toNum(raw.lastWinDay,NaN))?toNum(raw.lastWinDay,NaN):null};
      if(stats.dayIndex!==todayIndex){
        const carryStreak = (stats.lastWinDay===stats.dayIndex && stats.dayIndex===todayIndex-1) || (stats.lastWinDay===todayIndex-1);
        stats = {...stats, dayIndex:todayIndex, solved:0, tries:0, streak: carryStreak ? stats.streak : 0};
        saveStats(stats);
      }
      return stats;
    }

    function incrementTries(){
      const stats = readStats();
      stats.tries += 1;
      saveStats(stats);
    }

    function updateStatsAfterSolve(){
      const stats = readStats();
      stats.solved += 1;
      stats.best = Math.max(stats.best||0, stats.solved);
      saveStats(stats);
    }

    function finalizeRun(allSolved){
      if(runFinished) return;
      runFinished=true;
      const stats=readStats();
      stats.best = Math.max(stats.best||0, stats.solved);
      if(allSolved){
        if(stats.dayIndex===todayIndex){
          if(stats.lastWinDay===todayIndex-1) stats.streak = (stats.streak||0)+1;
          else if(stats.lastWinDay===todayIndex) stats.streak = stats.streak||1;
          else stats.streak = (stats.solved>0)?1:0;
          stats.lastWinDay = todayIndex;
        }
      } else {
        stats.streak = 0;
      }
      saveStats(stats);
      persistState();
    }
  })().catch(err=>{ console.error(err); const s=document.getElementById("status"); if(s) s.textContent="Error loading game: "+err; });
});
