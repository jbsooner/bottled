
(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const LOGICAL_W = 420;
  const LOGICAL_H = 640;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  function resizeCanvas() {
    const scale = Math.min(
      (window.innerWidth - 32) / LOGICAL_W,
      (window.innerHeight - (window.innerWidth <= 650 ? 160 : 260)) / LOGICAL_H,
      1.25
    );

    canvas.style.width = `${LOGICAL_W * scale}px`;
    canvas.style.height = `${LOGICAL_H * scale}px`;

    canvas.width = Math.round(LOGICAL_W * DPR);
    canvas.height = Math.round(LOGICAL_H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  const W = LOGICAL_W;
  const H = LOGICAL_H;

  // ---------- Assets ----------
  const robertImg = new Image();
  robertImg.src = "robert.png";


  const fart = new Audio("fart.mp3");
  fart.volume = 0.6;

  // ---------- Audio ----------
  let muted = false;
  try { muted = localStorage.getItem("rbb_muted") === "1"; } catch {}
  function setMuted(next) {
    muted = next;
    fart.muted = muted;
    try { localStorage.setItem("rbb_muted", muted ? "1" : "0"); } catch {}
  }
  setMuted(muted);

  // ---------- Physics (Flappy-like) ----------
  const FLOOR_H = 62;
  const GRAVITY = 0.38;
  const FLAP_VY = -6.7;
  const MAX_FALL = 12.5;

  const ROBERT_RADIUS = 20;

  // Visuals
  const SPRITE_W = 76;
  const SPRITE_H = 114;

  // Bottles
  const BASE_SCROLL = 2.55;
  const BOTTLE_W = 78;
  const SPAWN_EVERY = 145;

  // Variable gaps
  


  // Cigarettes
  const CIG_RADIUS = 18;
  const CIG_POINTS = 5;
  const CIG_SPAWN_CHANCE = 0.9;



  // ---------- Easter Egg / Bonus ----------
  const EGG_WINDOW_FRAMES = 180; // ~3 seconds at 60fps
  const BONUS_POINTS = 50;

  // ---------- State ----------
  let state = "menu"; // "menu" | "play" | "bonus" | "gameover"
  let score = 0;
  let best = 0;
  let frame = 0;
  let shake = 0;
  let gates = 0, combo = 0, collected = 0, perfects = 0, lastGap = 250, scenery = 0, toast = "", toastLife = 0;
  let shieldCharge = 0;
  let gameMode = "classic";
  let dailyRandState = 1;
  let pausedFrom = "play";

  try { best = Math.max(0, Number(localStorage.getItem("rbb_best")) || 0); } catch {}

  function dateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  }

  function seedForDate(key) {
    let hash = 2166136261;
    for (const char of key) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return hash >>> 0;
  }

  const today = dateKey();
  const dailySeed = seedForDate(today);
  const missionDefs = [
    { type:"gates", target:8 + dailySeed%5, reward:2, verb:"Pass", noun:"bottles" },
    { type:"perfects", target:3 + (dailySeed>>>4)%3, reward:3, verb:"Hit", noun:"perfects" },
    { type:"collected", target:2 + (dailySeed>>>8)%3, reward:2, verb:"Collect", noun:"cigs" }
  ];
  let meta = { caps:0, completedDate:today, completed:[false,false,false], progress:[0,0,0], lastDailyDate:"", streak:0, dailyDate:today, dailyBest:0, trail:"smoke" };
  try {
    const saved = JSON.parse(localStorage.getItem("rbb_meta_v2") || "null");
    if (saved) meta = { ...meta, ...saved };
  } catch {}
  if (meta.completedDate !== today) { meta.completedDate = today; meta.completed = [false,false,false]; meta.progress = [0,0,0]; }
  if (!Array.isArray(meta.progress)) meta.progress = [0,0,0];
  if (meta.dailyDate !== today) { meta.dailyDate = today; meta.dailyBest = 0; }

  function saveMeta() {
    try { localStorage.setItem("rbb_meta_v2", JSON.stringify(meta)); } catch {}
  }

  function trailColor() {
    if (meta.trail === "ember") return "rgba(255,116,55,.9)";
    if (meta.trail === "neon") return "rgba(52,236,213,.9)";
    return "rgba(225,231,229,.82)";
  }

  function syncMetaUI() {
    document.getElementById("page-best").textContent = best;
    document.getElementById("daily-streak").textContent = meta.streak;
    document.getElementById("cap-count").textContent = meta.caps;
    document.getElementById("board-date").textContent = new Date().toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"});
    document.getElementById("run-label").textContent = gameMode === "daily" ? `Daily best ${meta.dailyBest}` : "Endless";
    document.getElementById("mode-classic").className = gameMode === "classic" ? "active" : "";
    document.getElementById("mode-daily").className = gameMode === "daily" ? "active" : "";
    document.getElementById("mode-classic").setAttribute?.("aria-pressed", gameMode === "classic");
    document.getElementById("mode-daily").setAttribute?.("aria-pressed", gameMode === "daily");
    missionDefs.forEach((mission,index) => {
      const value = Math.min(meta.progress[index], mission.target);
      document.getElementById(`mission-${index}-name`).textContent = `${mission.verb} ${mission.target} ${mission.noun}`;
      document.getElementById(`mission-${index}-progress`).textContent = meta.completed[index] ? "Complete" : `${value} / ${mission.target}`;
      document.getElementById(`mission-${index}`).className = meta.completed[index] ? "mission complete" : "mission";
    });
    const trails = [{id:"smoke",cost:0},{id:"ember",cost:4},{id:"neon",cost:8}];
    trails.forEach(({id,cost}) => {
      const unlocked = meta.caps >= cost;
      document.getElementById(`trail-${id}`).className = `${meta.trail===id?"selected ":""}${unlocked?"":"locked"}`.trim();
      document.getElementById(`trail-${id}`).setAttribute?.("aria-pressed", meta.trail === id);
      document.getElementById(`trail-${id}`).setAttribute?.("aria-disabled", !unlocked);
    });
    document.getElementById("shield-pips").innerHTML = Array.from({length:4},(_,i)=>`<i class="${i<shieldCharge?"filled":""}"></i>`).join("");
  }

  function checkGoals() {
    let earned = 0;
    missionDefs.forEach((mission,index) => {
      if (!meta.completed[index] && meta.progress[index] >= mission.target) {
        meta.completed[index] = true;
        meta.caps += mission.reward;
        earned += mission.reward;
      }
    });
    if (earned) { toast = `GOAL CLEARED  +${earned} CAPS`; toastLife = 120; }
    saveMeta();
    syncMetaUI();
  }

  function recordDailyVisit() {
    if (meta.lastDailyDate === today) return;
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
    meta.streak = meta.lastDailyDate === dateKey(yesterday) ? meta.streak + 1 : 1;
    meta.lastDailyDate = today;
    saveMeta();
  }

  function selectMode(next) {
    if (state === "play" || state === "bonus" || state === "paused") return;
    gameMode = next;
    try { localStorage.setItem("rbb_mode", gameMode); } catch {}
    syncMetaUI();
  }

  function selectTrail(id,cost) {
    if (meta.caps < cost) { toast = `NEED ${cost-meta.caps} MORE CAPS`; toastLife = 90; return; }
    meta.trail = id; saveMeta(); syncMetaUI();
  }

  try { gameMode = localStorage.getItem("rbb_mode") === "daily" ? "daily" : "classic"; } catch {}

  const robert = { x: 140, y: H * 0.4, vy: 0, squash: 0 };

  // obstacles: { x, gapY, gapH, passed, flipTop }
  const obstacles = [];
  // cigs: { x, y, collected, spin }
  const cigs = [];
  // particles: { x, y, vx, vy, life, size, color }
  const puffs = [];
  const pops = [];

  // background
  const clouds = Array.from({ length: 6 }, (_, i) => ({
    x: Math.random() * W,
    y: 60 + Math.random() * 220,
    scale: 0.6 + Math.random() * 1.1,
    speed: 0.2 + Math.random() * 0.45,
    bump: Math.random() * Math.PI * 2,
  }));

  // bonus state
  let eggUsedThisRun = false;
  let bonusPhase = "ready"; // "ready" | "pulled" | "drop"
  let bonusTimer = 0;

  // ---------- Helpers ----------
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function runRandom() {
    if (gameMode !== "daily") return Math.random();
    dailyRandState = (Math.imul(dailyRandState,1664525) + 1013904223) >>> 0;
    return dailyRandState / 4294967296;
  }

  function runRand(min,max) { return min + runRandom() * (max-min); }

  function currentSpeed() {
    return BASE_SCROLL + Math.min(1.5, gates * 0.045);
  }

  function currentGap() {
    return Math.max(178, 248 - gates * 2.3);
  }

  function startFreshRun() {
    if (gameMode === "daily") recordDailyVisit();
    state = "play";
    document.getElementById("pause").textContent = "Pause";
    score = 0;
    sceneBlend = 1; gates = 0; combo = 0; collected = 0; perfects = 0; shieldCharge = 0; lastGap = 250; toastLife = 0;
    dailyRandState = dailySeed;
    frame = 0;
    shake = 0;

    robert.y = H * 0.4;
    robert.vy = 0;
    robert.squash = 0;

    obstacles.length = 0;
    cigs.length = 0;
    puffs.length = 0;
    pops.length = 0;

    eggUsedThisRun = false;
    bonusPhase = "ready";
    bonusTimer = 0;
    syncMetaUI();
  }

  function spawnBottlePair() {
    const floorTop = H - FLOOR_H;
    const margin = 70;

    const gapH = currentGap();
    const center = clamp(lastGap + runRand(-85, 85), margin + gapH/2, floorTop - margin - gapH/2);
    lastGap = center;
    const gapY = center - gapH/2;
    const x = W + 40;

    const flipTop = true;
    obstacles.push({ x, gapY, gapH, passed:false, flipTop });

    if (runRandom() < CIG_SPAWN_CHANCE) {
      const cy = gapY + gapH * 0.5;
      const cx = x + BOTTLE_W / 2;
      cigs.push({ x: cx, y: cy, collected:false, spin: runRandom() * 6 });
    }
  }

  function circleRect(cx,cy,r,rx,ry,rw,rh){
    const px=Math.max(rx,Math.min(cx,rx+rw));
    const py=Math.max(ry,Math.min(cy,ry+rh));
    return (cx-px)**2+(cy-py)**2 <= r*r;
  }

  function bottleHit(cx, cy, r, x, y, w, h, flipped) {
    const localY = flipped ? y+h-cy : cy-y;
    return circleRect(cx,localY,r,x+w*.3,0,w*.4,Math.min(25,h)) ||
      circleRect(cx,localY,r,x+w*.15,25,w*.7,Math.max(0,Math.min(33,h-25))) ||
      (h>58 && circleRect(cx,localY,r,x,58,w,h-58));
  }

  function circleCircle(x1,y1,r1,x2,y2,r2){
    const dx=x1-x2, dy=y1-y2;
    return dx*dx+dy*dy <= (r1+r2)*(r1+r2);
  }

  function endGame() {
    state = "gameover";
    best = Math.max(best, score);
    try { localStorage.setItem("rbb_best", String(best)); } catch {}
    if (gameMode === "daily" && score > meta.dailyBest) { meta.dailyBest = score; saveMeta(); }
    syncMetaUI();
  }

  function enterBonusMode() {
    state = "bonus";
    bonusPhase = "ready";
    bonusTimer = 0;
    eggUsedThisRun = true;

    robert.vy = 0;
  }

  function exitBonusModeDropBack() {
    state = "play";
    robert.y = H * 0.30;
    robert.vy = 2.0;
  }

  function spawnPuff(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      puffs.push({
        x, y,
        vx: rand(-1.2, 1.2),
        vy: rand(-1.2, 1.2),
        life: rand(14, 24),
        size: rand(4, 10),
        color
      });
    }
  }

  function spawnPop(x, y, color) {
    for (let i = 0; i < 10; i++) {
      pops.push({
        x, y,
        vx: rand(-2.4, 2.4),
        vy: rand(-2.4, 2.4),
        life: rand(18, 26),
        size: rand(2, 5),
        color
      });
    }
  }

  // ---------- Input ----------
  function handleInput() {
    if (state === "paused") { togglePause(); return; }
    if (!muted) {
      try { fart.currentTime = 0; fart.play().catch(() => {}); } catch {}
    }

    if (state === "menu") {
      startFreshRun();
      robert.vy = FLAP_VY;
      robert.squash = 0.35;
      spawnPuff(robert.x - 22, robert.y + 6, 6, trailColor());
      return;
    }

    if (state === "gameover") {
      startFreshRun();
      robert.vy = FLAP_VY;
      robert.squash = 0.35;
      spawnPuff(robert.x - 22, robert.y + 6, 6, trailColor());
      return;
    }

    if (state === "bonus") {
      if (bonusPhase === "ready") {
        bonusPhase = "pulled";
        bonusTimer = 40;
      }
      return;
    }

    if (state === "play") {
      robert.vy = FLAP_VY;
      robert.squash = 0.35;
      spawnPuff(robert.x - 22, robert.y + 6, 6, trailColor());
    }
  }

  function togglePause() {
    if (state === "play" || state === "bonus") { pausedFrom = state; state = "paused"; }
    else if (state === "paused") state = pausedFrom;
    document.getElementById("pause").textContent = state === "paused" ? "Resume" : "Pause";
  }
  window.addEventListener("keydown", e => {
    if (e.target instanceof HTMLSelectElement || (e.target instanceof HTMLButtonElement && e.code === "Space")) return;
    if (["Space", "ArrowUp", "KeyP", "Escape", "KeyR", "KeyM"].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === "Space" || e.code === "ArrowUp") handleInput();
    if (e.code === "KeyR") startFreshRun();
    if (e.code === "KeyM") { setMuted(!muted); syncSound(); }
    if (e.code === "KeyP" || e.code === "Escape") togglePause();
  });
  canvas.addEventListener("pointerdown", e => { e.preventDefault(); handleInput(); });
  document.getElementById("bounce").addEventListener("click", handleInput);
  document.getElementById("pause").addEventListener("click", togglePause);
  function syncSound() { document.getElementById("sound").textContent = muted ? "Sound off" : "Sound on"; }
  document.getElementById("sound").addEventListener("click", () => { setMuted(!muted); syncSound(); });
  document.getElementById("mode-classic").addEventListener("click", () => selectMode("classic"));
  document.getElementById("mode-daily").addEventListener("click", () => selectMode("daily"));
  document.getElementById("trail-smoke").addEventListener("click", () => selectTrail("smoke",0));
  document.getElementById("trail-ember").addEventListener("click", () => selectTrail("ember",4));
  document.getElementById("trail-neon").addEventListener("click", () => selectTrail("neon",8));
  document.addEventListener("visibilitychange", () => { if (document.hidden && (state === "play" || state === "bonus")) togglePause(); });
  syncSound();
  syncMetaUI();

  // ---------- Drawing helpers ----------
  function roundRectPath(x, y, w, h, r) {
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawCloud(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.arc(20, -6, 24, 0, Math.PI * 2);
    ctx.arc(44, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const SCENES = [
    {name:"SUNSET TOWN",sky:["#18243e","#8d647f","#f3b581"],hills:["#655773","#40425e","#26374b"],sun:"#ffe1aa",kind:"town"},
    {name:"MOONLIT PINES",sky:["#061127","#1c3f66","#5b8493"],hills:["#345775","#203f57","#122e3d"],sun:"#e3f5ff",kind:"forest"},
    {name:"DESERT DAWN",sky:["#69475d","#dc8b7c","#ffd9a0"],hills:["#b87770","#945d5a","#65464e"],sun:"#fff1be",kind:"desert"},
    {name:"NEON WATERFRONT",sky:["#120e30","#3e2860","#a05a84"],hills:["#473464","#2e2b51","#172c43"],sun:"#f5a9d4",kind:"city"}
  ];
  let sceneBlend = 1;
  function sceneIndex() { return Math.floor(gates / 10) % SCENES.length; }
  function drawLandscape(index, opacity) {
    const theme=SCENES[index];ctx.save();ctx.globalAlpha=opacity;
    const sky=ctx.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,theme.sky[0]);sky.addColorStop(.6,theme.sky[1]);sky.addColorStop(1,theme.sky[2]);
    ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    for(let i=0;i<38;i++) {
      ctx.fillStyle=theme.kind==="desert"?"#ffffff35":"#dfefff99";
      ctx.fillRect((i*137.3)%W,30+(i*53)%215, i%4===0?2:1, i%4===0?2:1);
    }
    ctx.fillStyle=theme.sun;ctx.shadowColor=theme.sun;ctx.shadowBlur=28;
    ctx.beginPath();ctx.arc(322,theme.kind==="forest"?160:285,theme.kind==="forest"?25:42,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    if(theme.kind==="forest"){ctx.fillStyle=theme.sky[0];ctx.beginPath();ctx.arc(335,150,24,0,Math.PI*2);ctx.fill();}
    for(let layer=0;layer<3;layer++) {
      ctx.fillStyle=theme.hills[layer];ctx.beginPath();ctx.moveTo(0,H);
      for(let x=0;x<=W+8;x+=8){
        const phase=(x+scenery*(.12+layer*.12))*.008+layer*2;
        const ridge=theme.kind==="forest"?Math.abs(Math.sin(phase))*85:Math.sin(phase)*33;
        ctx.lineTo(x,390+layer*51+ridge+Math.sin(x*.021+layer)*13);
      }
      ctx.lineTo(W,H);ctx.fill();
    }
    for(let i=0;i<10;i++){
      const x=((i*67-scenery*.55)%670+670)%670-100,y=H-FLOOR_H;
      ctx.fillStyle=theme.hills[2];
      if(theme.kind==="town"){
        ctx.fillRect(x,y-25,48,25);ctx.beginPath();ctx.moveTo(x-5,y-25);ctx.lineTo(x+24,y-45);ctx.lineTo(x+53,y-25);ctx.fill();
        ctx.fillStyle="#ffd18d99";ctx.fillRect(x+10,y-18,7,9);ctx.fillRect(x+29,y-18,7,9);
      } else if(theme.kind==="forest"){
        ctx.fillRect(x+20,y-64,5,64);
        for(let j=0;j<3;j++){ctx.beginPath();ctx.moveTo(x+22,y-108+j*23);ctx.lineTo(x-2-j*4,y-53+j*20);ctx.lineTo(x+46+j*4,y-53+j*20);ctx.fill();}
      } else if(theme.kind==="desert"){
        ctx.lineWidth=10;ctx.lineCap="round";ctx.strokeStyle=theme.hills[2];ctx.beginPath();ctx.moveTo(x+20,y);ctx.lineTo(x+20,y-72);ctx.moveTo(x+20,y-27);ctx.lineTo(x+2,y-27);ctx.lineTo(x+2,y-48);ctx.moveTo(x+20,y-41);ctx.lineTo(x+38,y-41);ctx.lineTo(x+38,y-59);ctx.stroke();
      } else {
        const bh=40+(i*37)%95;ctx.fillRect(x,y-bh,49,bh);
        ctx.fillStyle=i%2?"#ef8ad999":"#79ece499";
        for(let row=0;row<bh-12;row+=15)for(let col=0;col<3;col++)if((row+col+i)%3)ctx.fillRect(x+7+col*13,y-bh+8+row,5,6);
        ctx.fillRect(x,y-bh,49,2);
      }
    }
    if(theme.kind==="city"){
      ctx.fillStyle="#192a43bb";ctx.fillRect(0,H-105,W,43);
      for(let i=0;i<26;i++){ctx.fillStyle=i%2?"#f394c855":"#73dcd955";ctx.fillRect((i*47+scenery*.35)%W,H-99+(i*17)%34,12+i%4*5,1);}
    }
    ctx.restore();
  }
  function drawBackground() {
    const index=sceneIndex();
    if(sceneBlend<1){drawLandscape((index+SCENES.length-1)%SCENES.length,1);drawLandscape(index,sceneBlend);}
    else drawLandscape(index,1);
  }

  function drawCig(x,y,rot) {
    ctx.save();ctx.translate(x,y);ctx.rotate(-.2+Math.sin(rot)*.13);
    const glow=ctx.createRadialGradient(0,0,4,0,0,32);glow.addColorStop(0,"#ffdc8e44");glow.addColorStop(1,"#ffdc8e00");ctx.fillStyle=glow;ctx.fillRect(-33,-33,66,66);
    ctx.shadowColor="#0009";ctx.shadowBlur=5;ctx.shadowOffsetY=3;
    const paper=ctx.createLinearGradient(0,-5,0,5);paper.addColorStop(0,"#fffdf3");paper.addColorStop(.45,"#fffef7");paper.addColorStop(1,"#b6b7b3");
    ctx.fillStyle=paper;roundRectPath(-24,-5,48,10,2);ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    const filter=ctx.createLinearGradient(0,-5,0,5);filter.addColorStop(0,"#edbc79");filter.addColorStop(1,"#ad692e");ctx.fillStyle=filter;ctx.fillRect(10,-5,14,10);
    ctx.fillStyle="#89512588";for(let i=0;i<12;i++)ctx.fillRect(12+(i*7)%11,-3+(i*3)%7,1,1);
    ctx.fillStyle="#d8cbbb";ctx.fillRect(7,-5,2,10);ctx.fillStyle="#79777c";ctx.fillRect(-25,-5,5,10);
    ctx.shadowColor="#ff6f2e";ctx.shadowBlur=10;ctx.fillStyle="#ff8843";ctx.fillRect(-23,-4,2,8);ctx.shadowBlur=0;
    ctx.fillStyle="#dedadd";ctx.fillRect(-25,-3,2,2);ctx.fillRect(-24,1,2,2);
    ctx.strokeStyle="#eaf1ef88";ctx.lineWidth=1.4;ctx.lineCap="round";
    for(let i=0;i<2;i++){const drift=Math.sin(rot*.7+i)*5;ctx.beginPath();ctx.moveTo(-24,-7);ctx.bezierCurveTo(-30+drift,-17,-16+drift,-21,-25+drift,-32-i*8);ctx.stroke();}
    ctx.restore();
  }

  function drawBottleColumn(x, y, w, h, flipped) {
    if (h <= 0) return;
    ctx.save(); ctx.translate(x, flipped ? y+h : y); if (flipped) ctx.scale(1,-1);
    // One continuous bottle silhouette; collision follows the shoulder and neck.
    const glass=ctx.createLinearGradient(0,0,w,0);
    glass.addColorStop(0,"#291c1c");glass.addColorStop(.25,"#a46630");glass.addColorStop(.5,"#573422");glass.addColorStop(.78,"#b87b39");glass.addColorStop(1,"#291b1a");
    ctx.fillStyle=glass; ctx.strokeStyle="#e4b066"; ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(w*.3,0);ctx.lineTo(w*.7,0);ctx.lineTo(w*.7,25);ctx.quadraticCurveTo(w,39,w,58);ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.lineTo(0,58);ctx.quadraticCurveTo(0,39,w*.3,25);ctx.closePath();ctx.fill();ctx.stroke();
    const cap=ctx.createLinearGradient(w*.29,0,w*.71,0);cap.addColorStop(0,"#80522d");cap.addColorStop(.4,"#ffe3a2");cap.addColorStop(1,"#ae743c");
    ctx.fillStyle=cap;ctx.fillRect(w*.29,0,w*.42,12);
    ctx.strokeStyle="#56371d88";ctx.lineWidth=1;for(let i=0;i<7;i++){ctx.beginPath();ctx.moveTo(w*.31+i*4,1);ctx.lineTo(w*.31+i*4,11);ctx.stroke();}
    ctx.fillStyle="#791f28";ctx.fillRect(w*.32,13,w*.36,9);
    ctx.fillStyle="#ffd89844";ctx.fillRect(w*.36,25,3,15);
    ctx.fillStyle="#f3bf5722";roundRectPath(5,55,w-10,Math.max(1,h-55),9);ctx.fill();
    const shine=ctx.createLinearGradient(0,0,w,0);shine.addColorStop(0,"#ffffff00");shine.addColorStop(.18,"#fff8d777");shine.addColorStop(.25,"#ffffff00");shine.addColorStop(.85,"#ffd28944");shine.addColorStop(1,"#ffffff00");ctx.fillStyle=shine;ctx.fillRect(5,60,w-10,Math.max(0,h-60));
    ctx.strokeStyle="#edbd7655";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(10,57);ctx.quadraticCurveTo(17,41,w*.36,35);ctx.stroke();
    if(h>127){
      const labelY=72;ctx.fillStyle="#162b2b";roundRectPath(7,labelY,w-14,64,4);ctx.fill();
      ctx.strokeStyle="#e5bd76";ctx.lineWidth=1;roundRectPath(10,labelY+3,w-20,58,2);ctx.stroke();
      ctx.textAlign="center";ctx.fillStyle="#e9c17d";ctx.font="8px Georgia";ctx.fillText("EST. 2025",w/2,labelY+14);
      ctx.font="bold 10px Georgia";ctx.fillText("ROBERT’S",w/2,labelY+29);
      ctx.fillStyle="#fff0c7";ctx.font="7px system-ui";ctx.fillText("BELLY BOURBON",w/2,labelY+41);
      ctx.fillStyle="#dda95b";ctx.font="6px system-ui";ctx.fillText("SMALL BATCH · No. 01",w/2,labelY+54);
    }
    ctx.restore();ctx.textAlign="left";
  }

  // Clip the original illustration to Robert's silhouette, preserving his identity.
  // Points use the original 1024 × 1536 illustration coordinates.
  const ROBERT_OUTLINE = [[466,103],[477,69],[516,54],[568,57],[611,79],[626,122],[623,157],[641,161],[647,190],[632,220],[620,243],[634,265],[670,282],[699,297],[723,340],[745,393],[763,448],[775,477],[756,488],[786,526],[809,564],[840,601],[866,630],[899,633],[918,632],[925,641],[919,653],[898,665],[902,677],[932,705],[948,731],[940,740],[926,735],[909,715],[925,746],[916,753],[902,742],[885,720],[893,750],[881,755],[868,741],[850,713],[841,691],[823,710],[807,705],[805,682],[795,662],[762,646],[732,630],[700,609],[690,668],[704,715],[699,777],[686,844],[666,928],[657,1022],[660,1101],[673,1173],[671,1217],[661,1246],[681,1284],[701,1320],[731,1348],[744,1363],[742,1377],[727,1387],[682,1391],[628,1388],[580,1376],[564,1362],[557,1332],[548,1285],[531,1257],[512,1263],[492,1249],[479,1279],[459,1307],[450,1342],[435,1374],[413,1401],[386,1417],[349,1425],[308,1420],[279,1408],[278,1392],[292,1350],[309,1315],[324,1290],[331,1258],[327,1215],[332,1162],[340,1102],[352,1042],[364,983],[363,934],[346,881],[334,824],[323,777],[324,750],[310,739],[305,686],[283,654],[268,669],[264,710],[259,755],[250,789],[235,804],[220,796],[211,784],[201,782],[192,765],[189,739],[197,702],[207,662],[214,624],[224,580],[239,532],[251,509],[241,499],[254,466],[268,424],[283,385],[305,352],[340,324],[382,303],[426,286],[451,273],[458,251],[444,229],[442,209],[451,197],[450,172],[452,156],[465,159]];
  function drawRobertSprite(x,y,w,h,tilt=0,squash=0) {
    ctx.save();ctx.translate(x,y);ctx.rotate(tilt);ctx.scale(1+squash*.18,1-squash*.18);
    ctx.translate(-w/2,-h/2);ctx.scale(w/800,h/1390);ctx.translate(-170,-45);
    ctx.beginPath();ROBERT_OUTLINE.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();ctx.clip();
    if(robertImg.complete&&robertImg.naturalWidth)ctx.drawImage(robertImg,0,0,1024,1536);
    else {ctx.fillStyle="#dda976";ctx.fill();}
    ctx.restore();
  }
  function drawRobert() {
    drawRobertSprite(robert.x,robert.y,SPRITE_W,SPRITE_H,clamp(robert.vy/30,-.25,.35),robert.squash);
  }

  function drawGround() {
    const y=H-FLOOR_H; ctx.fillStyle="#0f1d2e";ctx.fillRect(0,y,W,FLOOR_H);
    ctx.fillStyle="#e6b77b";ctx.fillRect(0,y,W,3);ctx.fillStyle="#7b624e";ctx.fillRect(0,y+4,W,4);
    ctx.strokeStyle="#ffffff0c";ctx.lineWidth=1;
    for(let x=-60;x<W+60;x+=50){ctx.beginPath();ctx.moveTo(x-scenery%50,y+9);ctx.lineTo(x-25-scenery%50,H);ctx.stroke();}
    ctx.fillStyle="#9da8b7";ctx.textAlign="center";ctx.font="10px system-ui";ctx.fillText(SCENES[sceneIndex()].name+"  /  STAGE "+(1+Math.floor(gates/10)),W/2,H-20);ctx.textAlign="left";
  }

  function drawObstacles() {
    const floorTop = H - FLOOR_H;
    for (const o of obstacles) {
      drawBottleColumn(o.x, 0, BOTTLE_W, o.gapY, o.flipTop);
      const bottomY = o.gapY + o.gapH;
      const bottomH = floorTop - bottomY;
      drawBottleColumn(o.x, bottomY, BOTTLE_W, bottomH, false);
    }
  }

  function drawCigs() {
    for (const c of cigs) {
      if (c.collected) continue;
      drawCig(c.x, c.y, c.spin);
    }
  }

  function drawParticles() {
    for (const p of puffs) {
      ctx.globalAlpha = Math.max(0, p.life / 24);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of pops) {
      ctx.globalAlpha = Math.max(0, p.life / 26);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- Bonus slot scene ----------
  function drawSlotMachineScene() {
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255,255,255,.08)";
    ctx.fillRect(0, H - 120, W, 120);

    const sx = W * 0.60;
    const sy = H * 0.36;
    const sw = 150;
    const sh = 220;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.6)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#b23b3b";
    roundRectPath(sx - sw/2, sy - sh/2, sw, sh, 18);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#111";
    roundRectPath(sx - 52, sy - 60, 104, 70, 10);
    ctx.fill();

    ctx.fillStyle = "#f5e7a3";
    ctx.font = "900 20px system-ui";
    ctx.textAlign = "center";

    let reelsText = "???";
    if (bonusPhase === "ready") reelsText = "???";
    if (bonusPhase === "pulled") reelsText = (bonusTimer % 6 < 3) ? "7 7 7" : "BAR";
    if (bonusPhase === "drop") reelsText = "50!";

    ctx.fillText(reelsText, sx, sy - 20);

    ctx.strokeStyle = "#f2f2f2";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(sx + sw/2 - 15, sy - 40);
    ctx.lineTo(sx + sw/2 + 20, sy + 20);
    ctx.stroke();

    ctx.fillStyle = "#f2f2f2";
    ctx.beginPath();
    ctx.arc(sx + sw/2 + 20, sy + 20, 14, 0, Math.PI*2);
    ctx.fill();

    const rx = W * 0.30;
    const ry = H * 0.55;
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(-0.06);
    drawRobertSprite(0,0,95,165);
    ctx.restore();

    ctx.fillStyle = "#fff";
    ctx.font = "900 22px Georgia";
    ctx.fillText("SECRET SLOT!", W/2, 90);

    ctx.font = "600 14px system-ui";
    if (bonusPhase === "ready") {
      ctx.fillText("Press SPACE to pull the lever", W/2, 120);
    } else if (bonusPhase === "pulled") {
      ctx.fillText("Spinning...", W/2, 120);
    } else {
      ctx.fillText("+50 points! Dropping you back in...", W/2, 120);
    }

    ctx.textAlign = "left";
  }

  // ---------- Update loop ----------
  function updatePlay() {
    frame++;

    if (frame % SPAWN_EVERY === 0) spawnBottlePair();

    const scrollSpeed = currentSpeed();

    robert.vy += GRAVITY;
    if (robert.vy > MAX_FALL) robert.vy = MAX_FALL;
    robert.y += robert.vy;
    robert.squash = Math.max(0, robert.squash - 0.04);

    const floorY = H - FLOOR_H - ROBERT_RADIUS;
    if (robert.y > floorY) {
      robert.y = floorY;
      shake = 10;
      spawnPop(robert.x, robert.y + 12, "rgba(255,107,107,.9)");
      endGame();
      return;
    }

    if (robert.y < ROBERT_RADIUS) {
      robert.y = ROBERT_RADIUS;
      robert.vy = 0;

      if (!eggUsedThisRun && frame <= EGG_WINDOW_FRAMES) {
        enterBonusMode();
        return;
      }
    }

    const floorTop = H - FLOOR_H;

    for (const o of obstacles) {
      o.x -= scrollSpeed;

      if (!o.passed && o.x + BOTTLE_W < robert.x) {
        o.passed = true;
        score++; gates++;
        meta.progress[0]++;
        if(gates%10===0)sceneBlend=0;
        if (Math.abs(robert.y - (o.gapY + o.gapH/2)) < 34) {
          combo++; perfects++; const reward = Math.min(combo, 5); score += reward;
          meta.progress[1]++;
          toast = `PERFECT ×${Math.min(combo,5)}  +${reward}`; toastLife = 75;
          spawnPop(robert.x,robert.y,"#ffe3a0");
        } else combo = 0;
        checkGoals();
      }

      const hitTop = bottleHit(robert.x, robert.y, ROBERT_RADIUS, o.x, 0, BOTTLE_W, o.gapY, true);
      const bottomY = o.gapY + o.gapH;
      const bottomH = floorTop - bottomY;
      const hitBottom = bottleHit(robert.x, robert.y, ROBERT_RADIUS, o.x, bottomY, BOTTLE_W, bottomH, false);

      if (hitTop || hitBottom) {
        shake = 12;
        if (shieldCharge >= 4) {
          shieldCharge = 0;
          o.x = -BOTTLE_W - 1;
          robert.vy = FLAP_VY * .55;
          toast = "LUCKY BREAK"; toastLife = 100;
          spawnPop(robert.x, robert.y, "#e8bd63");
          syncMetaUI();
          continue;
        } else {
          spawnPop(robert.x, robert.y, "rgba(255,107,107,.9)");
          endGame();
          return;
        }
      }
    }

    for (const c of cigs) {
      if (c.collected) continue;
      c.x -= scrollSpeed;
      c.spin += 0.08;

      if (circleCircle(robert.x, robert.y, ROBERT_RADIUS, c.x, c.y, CIG_RADIUS)) {
        c.collected = true;
        score += CIG_POINTS; collected++; shieldCharge = Math.min(4,shieldCharge+1);
        meta.progress[2]++;
        toast = shieldCharge === 4 ? "LUCKY BREAK READY" : "+5 · NICE CATCH"; toastLife = 60;
        spawnPop(c.x, c.y, "rgba(255,204,77,.9)");
        checkGoals();
      }
    }

    for (const cloud of clouds) {
      cloud.x -= cloud.speed;
      cloud.bump += 0.01;
      cloud.y += Math.sin(cloud.bump) * 0.08;
      if (cloud.x < -80) {
        cloud.x = W + rand(40, 120);
        cloud.y = 60 + Math.random() * 220;
      }
    }

    for (const p of puffs) {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
      p.size *= 0.97;
    }

    for (const p of pops) {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
      p.size *= 0.96;
    }

    while (puffs.length && puffs[0].life <= 0) puffs.shift();
    while (pops.length && pops[0].life <= 0) pops.shift();

    while (obstacles.length && obstacles[0].x + BOTTLE_W < -180) obstacles.shift();
    while (cigs.length && (cigs[0].x < -220 || cigs[0].collected)) cigs.shift();
  }

  function updateBonus() {
    if (bonusPhase === "pulled") {
      bonusTimer--;
      if (bonusTimer <= 0) {
        score += BONUS_POINTS;
        bonusPhase = "drop";
        bonusTimer = 55;
      }
    } else if (bonusPhase === "drop") {
      bonusTimer--;
      if (bonusTimer <= 0) {
        exitBonusModeDropBack();
      }
    }
  }

  // ---------- Render ----------
  function drawHUD() {
    ctx.fillStyle="#0f1b30c7";roundRectPath(16,16,W-32,66,14);ctx.fill();
    ctx.strokeStyle="#e8be7433";ctx.lineWidth=1;roundRectPath(16,16,W-32,66,14);ctx.stroke();
    ctx.fillStyle="#a8b4c8";ctx.font="10px Arial";ctx.textAlign="left";ctx.fillText("SCORE",30,36);
    ctx.fillStyle="#fff1d3";ctx.font="bold 27px Georgia";ctx.fillText(String(score).padStart(2,"0"),28,64);
    ctx.fillStyle="#a8b4c8";ctx.font="10px Arial";ctx.textAlign="center";ctx.fillText(combo>1?`STREAK ×${combo}`:"STAGE",W/2,36);
    ctx.fillStyle=combo>1?"#efc27e":"#f2e8d9";ctx.font="bold 20px Georgia";ctx.fillText(combo>1?`+${Math.min(combo,5)}`:String(1+Math.floor(gates/10)).padStart(2,"0"),W/2,62);
    ctx.textAlign="right";ctx.fillStyle="#a8b4c8";ctx.font="10px Arial";ctx.fillText("LUCK",W-30,36);
    for(let i=0;i<4;i++){ctx.fillStyle=i<shieldCharge?"#efc27e":"#40516a";ctx.fillRect(W-99+i*18,52,13,5);}
    if(toastLife>0) {ctx.textAlign="center";ctx.fillStyle="#ffe3a0";ctx.font="bold 14px Arial";ctx.fillText(toast,W/2,111);}
    ctx.textAlign="left";
  }

  function renderPlay() {
    drawBackground();
    drawGround();
    drawObstacles();
    drawCigs();
    drawParticles();
    drawRobert();
    drawHUD();
  }

  function runMedal() {
    if (score >= 60) return "Gold";
    if (score >= 30) return "Silver";
    if (score >= 12) return "Bronze";
    return "No medal";
  }

  function panel(kicker,title,subtitle,action) {
    ctx.fillStyle="#0b152978";ctx.fillRect(0,0,W,H-FLOOR_H);
    ctx.fillStyle="#111f34ed";roundRectPath(30,178,W-60,284,22);ctx.fill();
    ctx.strokeStyle="#e8be7440";ctx.lineWidth=1;roundRectPath(30,178,W-60,284,22);ctx.stroke();
    ctx.textAlign="center";ctx.fillStyle="#eac58d";ctx.font="bold 11px Arial";ctx.fillText(kicker,W/2,214);
    ctx.fillStyle="#fff2d9";ctx.font="bold 43px Georgia";ctx.fillText(title,W/2,269);
    ctx.fillStyle="#aebbcd";ctx.font="13px Arial";ctx.fillText(subtitle,W/2,302);
    ctx.fillStyle="#efbe76";roundRectPath(59,330,W-118,52,11);ctx.fill();
    ctx.fillStyle="#182336";ctx.font="bold 14px Arial";ctx.fillText(action,W/2,362);
    ctx.fillStyle="#8192ac";ctx.font="12px Arial";ctx.fillText("Space, tap, or click",W/2,419);ctx.textAlign="left";
  }
  function renderMenu() {
    drawBackground();drawGround();
    const detail=gameMode==="daily"?`Same course for everyone · Best ${meta.dailyBest}`:`Endless run · Best ${best}`;
    panel(gameMode==="daily"?"TODAY’S RUN":"CLASSIC RUN","Bottled",detail,"START RUN");
    drawRobertSprite(W/2,120+Math.sin(scenery*.04)*4,60,105);
  }
  function renderGameOver() {
    renderPlay();panel(runMedal().toUpperCase(),`${score} points`,`${gates} gates · ${perfects} perfect · ${collected} caught`,"RUN IT BACK");
  }
  let previousTime = 0, accumulator = 0;
  function loop(now = 0) {
    accumulator += Math.min(100, now - previousTime); previousTime = now;
    while (accumulator + 1e-7 >= 1000/60) {
      if(state!=="paused") { scenery+=.7; sceneBlend=Math.min(1,sceneBlend+1/120); if(toastLife>0)toastLife--; }
      if (state === "play") updatePlay(); else if (state === "bonus") updateBonus();
      accumulator -= 1000/60;
    }
    ctx.save();
    if (shake > 0 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      ctx.translate(rand(-shake,shake)*.35,rand(-shake,shake)*.35);shake=Math.max(0,shake-.8);
    }
    if (state === "menu") renderMenu();
    else if (state === "play") renderPlay();
    else if (state === "bonus") {drawBackground();drawSlotMachineScene();drawHUD();}
    else if (state === "gameover") renderGameOver();
    else if (state === "paused") {renderPlay();panel("On a break.","Your run is right where you left it.","TAP TO RESUME  →");}
    ctx.restore();requestAnimationFrame(loop);
  }

  // start at menu
  state = "menu";
  loop();
})();
