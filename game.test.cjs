const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const elements = {};
const noop=()=>{};
const context = new Proxy({}, {get:(_,k)=>k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop:noop}):noop,set:()=>true});
const sandbox = {console,Math,HTMLButtonElement:class{},HTMLSelectElement:class{},Image:class{},Audio:class{play(){return Promise.resolve()}},localStorage:{getItem:()=>null,setItem:noop},requestAnimationFrame:noop,window:{devicePixelRatio:1,innerWidth:1280,innerHeight:800,addEventListener:noop,matchMedia:()=>({matches:false})},document:{addEventListener:noop,getElementById:id=>elements[id]??=( {style:{},getContext:()=>context,addEventListener:noop})}};
let source=fs.readFileSync(__dirname+'/game.js','utf8');
source=source.replace('// start at menu',`globalThis.test = {startFreshRun,handleInput,togglePause,updatePlay,updateBonus,spawnBottlePair,currentGap,currentSpeed,bottleHit,loop,enterBonusMode,get:()=>({state,score,gates,frame,y:robert.y,vy:robert.vy,obstacles,cigs,combo}),set:(v)=>{if(v.score!==undefined)score=v.score;if(v.gates!==undefined)gates=v.gates;if(v.y!==undefined)robert.y=v.y;if(v.vy!==undefined)robert.vy=v.vy;}}; // start at menu`);
vm.createContext(sandbox);vm.runInContext(source,sandbox);const t=sandbox.test;
t.handleInput();assert.equal(t.get().state,'play');assert.ok(t.get().vy<0);
t.togglePause();assert.equal(t.get().state,'paused');t.handleInput();assert.equal(t.get().state,'play');
const speed=t.currentSpeed(),gap=t.currentGap();t.set({score:1000});assert.equal(t.currentSpeed(),speed);assert.equal(t.currentGap(),gap);
for(let n=0;n<100;n++){t.set({gates:n});t.spawnBottlePair();const o=t.get().obstacles.at(-1);assert.ok(o.gapY>=70-1e-9);assert.ok(o.gapY+o.gapH<=508+1e-9);assert.ok(o.gapH>=178);}
t.startFreshRun();t.set({y:570});t.updatePlay();assert.equal(t.get().state,'gameover');
t.startFreshRun();t.set({y:0,vy:-2});t.updatePlay();assert.equal(t.get().state,'bonus');t.handleInput();for(let i=0;i<95;i++)t.updateBonus();assert.equal(t.get().score,50);assert.equal(t.get().state,'play');assert.equal(t.currentSpeed(),speed);
assert.equal(t.bottleHit(5,5,2,0,0,78,200,false),false);assert.equal(t.bottleHit(39,5,2,0,0,78,200,false),true);
t.startFreshRun();t.spawnBottlePair();const o=t.get().obstacles[0];o.x=62;t.get().cigs.length=0;t.set({y:o.gapY+o.gapH/2,vy:0});t.updatePlay();assert.equal(t.get().gates,1);assert.equal(t.get().score,2);assert.equal(t.get().combo,1);
// Same half-second of free fall at 60 and 120 Hz.
function simulate(hz){const env={...sandbox};vm.createContext(env);vm.runInContext(source,env);env.test.startFreshRun();for(let i=1;i<=hz/2;i++){env.test.loop(i*1000/hz);}return env.test.get();}
const a=simulate(60),b=simulate(120);assert.ok(Math.abs(a.y-b.y)<0.00001);assert.ok(Math.abs(a.frame-b.frame)<=1);
console.log('PASS: start, pause/resume, difficulty isolation, 100 generated gaps, floor collision, bonus return, bottle neck collision, perfect scoring, 60/120 Hz timing.');
