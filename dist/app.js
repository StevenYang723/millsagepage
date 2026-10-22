import {prepareLive2DPlayer} from './assets/player.js';
import {loadGarage} from './garage.js';
const $=s=>document.querySelector(s), state={mode:'loading',busy:false,paused:matchMedia('(prefers-reduced-motion: reduce)').matches,time:0,selected:null};
const portraits={},garages={},effects=$('#effects'),ctx=effects.getContext('2d');
let W=innerWidth,H=innerHeight,last=performance.now(),toastTimer,portraitApp;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=v=>v*v*(3-2*v);
function mode(value){state.mode=value;document.body.dataset.state=value;$('#garage').setAttribute('aria-hidden',String(value!=='garage'));$('#home').setAttribute('aria-hidden',String(value==='garage'));for(const b of document.querySelectorAll('.choice'))b.disabled=value!=='home';}
function toast(message){$('#notice').textContent=message;$('#notice').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#notice').classList.remove('show'),3000)}
function progress(n,label,detail){$('#load-bar').style.width=`${n}%`;$('#load-label').textContent=label;if(detail)$('#load-detail').textContent=detail;}
function resize(){W=innerWidth;H=innerHeight;effects.width=Math.round(W*devicePixelRatio);effects.height=Math.round(H*devicePixelRatio);ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);Object.values(portraits).forEach(p=>p.fit());}
addEventListener('resize',resize);resize();
async function makePortrait(key,runtime){
 const {PIXI,Live2DModel}=runtime,manifest=await fetch(`assets/${key}/manifest.json`).then(r=>r.json());
 portraitApp??=new PIXI.Application({width:W,height:H,resolution:Math.min(devicePixelRatio,1.5),backgroundAlpha:0,antialias:true,preserveDrawingBuffer:true,autoStart:false});
 const app=portraitApp,output=$(`#${key}-canvas`),outputContext=output.getContext('2d'),container=new PIXI.Container();
 const model=await Live2DModel.from(`assets/${key}/${manifest.model}`,{autoUpdate:false,autoFocus:false,autoHitTest:false,motionPreload:'NONE',idleMotionGroup:'__manual__'});
 container.addChild(model);
 const internal=model.internalModel,core=internal.coreModel;
 for(const [id,v] of Object.entries(manifest.defaults))core.setParameterValueById(id,v);
 core.saveParameters();internal.eyeBlink=undefined;internal.breath=undefined;internal.updateFocus=()=>{};
 const ids=core._model.parameters.ids,eyeIds=ids.filter(id=>/Eye.*Open/i.test(id));
 const p={app,model,internal,core,eyeIds,fit(){app.renderer.resize(W,H);output.width=app.view.width;output.height=app.view.height;const ow=internal.originalWidth,oh=internal.originalHeight;const scale=H/(oh*.18);model.scale.set(scale);model.position.set(W*.5-ow*.5*scale,H*.43-oh*(key==='kanata'?.222:.2466)*scale);},render(dt){model.update(dt);app.renderer.render(container);outputContext.clearRect(0,0,output.width,output.height);outputContext.drawImage(app.view,0,0)}};
 internal.on('beforeModelUpdate',()=>{
  const phase=state.time%5.3;let blink=1;
  if(phase>4.55&&phase<4.85)blink=Math.abs((phase-4.7)/.15);
  for(const id of eyeIds)core.setParameterValueById(id,blink);
  core.setParameterValueById('ParamBreath',.5+.5*Math.sin(state.time*2*Math.PI/4.6));
  for(const id of ['ParamAngleX','ParamAngleY','ParamAngleZ','ParamBodyAngleX'])core.setParameterValueById(id,0);
 });
 p.fit();p.render(0);portraits[key]=p;
 document.body.dataset[`${key}Model`]=`${internal.originalWidth}x${internal.originalHeight}; eyes:${eyeIds.join(',')}`;
 return p;
}
function render(now){const dt=Math.min(now-last,40);last=now;if(!state.paused&&!document.hidden)state.time+=dt/1000;
 if(state.mode!=='garage'&&!document.hidden)for(const p of Object.values(portraits)){const dy=state.paused?0:Math.sin(state.time*2*Math.PI/4.6)*H*.0025;p.model.pivot.y=dy/p.model.scale.y;p.render(state.paused?0:dt)}
 requestAnimationFrame(render);
}requestAnimationFrame(render);
function tween(duration,draw){return new Promise(resolve=>{const start=performance.now();function tick(t){const p=clamp((t-start)/duration);draw(p);if(p<1)requestAnimationFrame(tick);else resolve()}requestAnimationFrame(tick)})}
function snapshot(canvas){const out=document.createElement('canvas');out.width=W;out.height=H;out.getContext('2d').drawImage(canvas,0,0,W,H);return out;}
function feather(x,y,size,angle,opacity){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(size,size);ctx.globalAlpha=opacity;ctx.fillStyle='#fffdf4';ctx.beginPath();ctx.moveTo(0,-1);ctx.bezierCurveTo(.55,-.7,.65,.05,.05,1);ctx.bezierCurveTo(-.7,.35,-.45,-.5,0,-1);ctx.fill();ctx.strokeStyle='#bdcbc9';ctx.lineWidth=.018;ctx.beginPath();ctx.moveTo(0,-1);ctx.quadraticCurveTo(.1,0,.05,1.25);ctx.stroke();for(let n=-.7;n<.8;n+=.15){ctx.beginPath();ctx.moveTo(.02,n+.12);ctx.lineTo(.36*(1-Math.abs(n)),n-.1);ctx.moveTo(.02,n+.12);ctx.lineTo(-.29*(1-Math.abs(n)),n-.08);ctx.stroke()}ctx.restore()}
async function featherAway(){
 const panel=$('#hotaru-panel'),particles=Array.from({length:110},()=>({x:W*(.5+Math.random()*.5),y:H*Math.random(),r:8+Math.random()*19,d:Math.random()*.5,speed:.6+Math.random(),spin:Math.random()*7,drift:(Math.random()-.5)*W*.25}));
 await tween(state.paused?450:2900,p=>{ctx.clearRect(0,0,W,H);panel.style.opacity=1-ease(clamp(p*1.5));panel.style.filter=`brightness(${1+p*3}) blur(${p*6}px)`;for(const q of particles){const a=clamp((p-q.d)/(.95-q.d));if(!a)continue;feather(q.x+Math.sin(a*6+q.spin)*25+q.drift*a,q.y-a*H*q.speed,q.r*(1-a*.25),q.spin+a*3,Math.sin(Math.PI*a)*.95)}$('#kanata-panel').style.filter=`brightness(${1+p*.12})`;});
}
async function glassAway(){
 const source=snapshot($('#kanata-canvas')),panel=$('#kanata-panel'),triangles=[];const cols=W<600?6:10,rows=12,cw=W*.5/cols,ch=H/rows;
 const vertices=Array.from({length:rows+1},(_,y)=>Array.from({length:cols+1},(_,x)=>({x:x*cw+(x&&x<cols?(Math.random()-.5)*cw*.7:0),y:y*ch+(y&&y<rows?(Math.random()-.5)*ch*.7:0)})));
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const [a,b,c,d]=[vertices[y][x],vertices[y][x+1],vertices[y+1][x+1],vertices[y+1][x]];for(const points of [[a,b,c],[a,c,d]])triangles.push({points,cx:points.reduce((s,p)=>s+p.x,0)/3,cy:points.reduce((s,p)=>s+p.y,0)/3,spin:(Math.random()-.5)*2,dx:(Math.random()-.5)*W*.32,delay:Math.random()*.18});}
 panel.style.opacity=0;
 await tween(state.paused?450:2600,p=>{ctx.clearRect(0,0,W,H);for(const q of triangles){const t=clamp((p-q.delay)/(.82-q.delay)),fall=t*t*H*1.35;ctx.save();ctx.globalAlpha=1-clamp((t-.5)*2);ctx.translate(q.cx+q.dx*t,q.cy+fall);ctx.rotate(t*q.spin);ctx.translate(-q.cx,-q.cy);ctx.beginPath();q.points.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();ctx.clip();ctx.drawImage(source,0,0,W,H);ctx.fillStyle=`rgba(210,235,249,${.08+t*.15})`;ctx.fill();ctx.strokeStyle='#dbeef780';ctx.lineWidth=.7;ctx.stroke();ctx.restore()}});
}
async function enter(key){
 if(state.busy||state.mode!=='home')return;state.busy=true;state.selected=key;mode('transition');
 try{
  const scenePromise=ensureGarage(key).then(scene=>({scene}),error=>({error}));if(key==='kanata')await featherAway();else await glassAway();
  ctx.clearRect(0,0,W,H);await tween(550,p=>{$('#whiteout').style.opacity=ease(p)});
  $('#whiteout').textContent='正在打开原版车库…';const result=await scenePromise;$('#whiteout').textContent='';if(result.error)throw result.error;const scene=result.scene;showGarage(key);scene.replay();scene.setPaused(state.paused);
  mode('garage');await tween(850,p=>{$('#whiteout').style.opacity=1-ease(p)});
  $('#return').focus({preventScroll:true});
 }catch(e){console.error(e);resetHome();toast('车库载入失败，请重试。'+e.message)}finally{state.busy=false}
}
function showGarage(key){for(const [k,s] of Object.entries(garages)){s.element.style.display=k===key?'block':'none';s.viewer.setPaused(k!==key||state.paused)}const name=key==='kanata'?'奏多':'萤';$('#scene-title').textContent=`${name}的时光`;$('#scene-tip').textContent=`轻触钢琴前的${name}，回到重逢的间隙。`;$('#scene-kicker').textContent=key==='kanata'?'THE DAYS WE SHARED':'THE LIGHT THAT REMAINS';$('#garage').style.visibility='visible';$('#garage').style.opacity=1;}
async function ensureGarage(key){if(garages[key])return garages[key].viewer;const element=document.createElement('div');element.style.cssText='position:absolute;inset:0';$('#scene').append(element);const viewer=await loadGarage(element,key,{onCharacter:id=>{if((key==='kanata'&&/kanata/i.test(id))||(key==='hotaru'&&/hotaru/i.test(id)))returnHome();else toast('轻触钢琴前的'+(key==='kanata'?'奏多':'萤')+'，返回主页。')}});garages[key]={viewer,element};viewer.setPaused(true);return viewer;}
function resetHome(){for(const s of Object.values(garages)){s.viewer.setPaused(true);s.element.style.display='none'}$('#garage').style.opacity='';$('#garage').style.visibility='';$('#home').style.visibility='';$('#whiteout').style.opacity=0;$('#garage').style.transform='';$('#garage').style.filter='';for(const panel of document.querySelectorAll('.portrait')){panel.style.opacity='';panel.style.filter='';}ctx.clearRect(0,0,W,H);mode('home')}
async function returnHome(){
 if(state.busy||state.mode!=='garage')return;state.busy=true;mode('transition');
 const scene=$('#garage'),snapshotCanvas=garages[state.selected]?.element.querySelector('canvas');let shot;try{shot=snapshot(snapshotCanvas)}catch{};
 await tween(state.paused?400:1650,p=>{ctx.clearRect(0,0,W,H);const intensity=Math.sin(p*Math.PI);scene.style.transform=`scale(${1+p*.8}) rotate(${p*p*8}deg)`;scene.style.filter=`blur(${p*p*15}px) saturate(${1+p})`;ctx.save();ctx.translate(W*.5,H*.5);for(let i=36;i>0;i--){const r=Math.max(W,H)*i/36*.75;ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.clip();ctx.rotate(intensity*(1-i/36)*1.4);if(shot){ctx.globalAlpha=intensity*.8;ctx.drawImage(shot,-W*.5,-H*.5,W,H)}ctx.strokeStyle=`rgba(${i%2?'172,208,217':'219,202,225'},${intensity*.12})`;ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,0,r,r*.55,p*3+i*.09,0,Math.PI*2);ctx.stroke();ctx.restore()}ctx.restore();$('#whiteout').style.opacity=ease(clamp((p-.6)/.4));});
 resetHome();$('#whiteout').style.opacity=1;await tween(700,p=>{$('#whiteout').style.opacity=1-ease(p)});state.busy=false;$('#choose-'+state.selected).focus({preventScroll:true});
}
$('#choose-kanata').onclick=()=>enter('kanata');$('#choose-hotaru').onclick=()=>enter('hotaru');$('#return').onclick=returnHome;$('#brand').onclick=e=>{e.preventDefault();if(state.mode==='garage')returnHome()};
addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#about-dialog').open&&state.mode==='garage')returnHome()});
$('#about').onclick=()=>$('#about-dialog').showModal();$('.close-dialog').onclick=()=>$('#about-dialog').close();$('#about-dialog').addEventListener('click',e=>{if(e.target===$('#about-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}});
function updatePause(){document.body.classList.toggle('paused',state.paused);$('#motion').textContent=state.paused?'▷':'Ⅱ';$('#motion').setAttribute('aria-label',state.paused?'继续动态':'暂停动态');$('#motion').title=state.paused?'继续动态':'暂停动态';for(const [key,s]of Object.entries(garages))s.viewer.setPaused(state.paused||key!==state.selected||state.mode!=='garage')}
$('#motion').onclick=()=>{state.paused=!state.paused;updatePause();toast(state.paused?'动态已暂停':'动态已继续')};
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{toast('当前浏览器不支持全屏，请使用浏览器的全屏功能。')}};
$('#retry').onclick=()=>location.reload();updatePause();
async function init(){try{progress(5,'正在唤醒记忆','载入 Live2D 渲染引擎');const runtime=await prepareLive2DPlayer(new URL('assets/live2dcubismcore.min.js',location.href).href);progress(15,'正在唤醒记忆','载入奏多与萤的原版模型');let n=0;await Promise.all(['kanata','hotaru'].map(async key=>{await makePortrait(key,runtime);progress(20+(++n)*30,'正在唤醒记忆',key==='kanata'?'奏多已经在这里':'萤已经在这里')}));progress(100,'在这里，再次相遇。','轻触一侧，走进她的世界');await new Promise(r=>setTimeout(r,350));mode('home');document.body.dataset.ready='true';}catch(e){console.error(e);mode('error');progress(0,'记忆暂时未能载入',e.message);$('#retry').hidden=false;document.body.dataset.error=e.message}}
init();
