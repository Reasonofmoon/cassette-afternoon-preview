'use strict';
(() => {
const $=id=>document.getElementById(id), root=$('reader');
let story, pageNumber=1, mode=matchMedia('(max-width:899px)').matches?'continuous':'pages', scriptView=false;
const panels=new Map(), pageSections=new Map();
const reducedMotion=matchMedia('(prefers-reduced-motion:reduce)').matches;
const state={clips:[],ready:false,queue:[],index:0,token:0,playing:false,paused:false,cancel:null,currentPanel:null};
const voice=new Audio(), music=new Audio(), room=new Audio(), click=new Audio(), warm=new Audio();
voice.preload='auto';warm.preload='none';music.preload=room.preload=click.preload='none';music.loop=room.loop=true;
music.src='audio/bgm.mp3';room.src='audio/room.wav';click.src='audio/click.wav';
let context=null, gains=null, silentMusic=false, roomNear=false, duck=false, fadeEnding=false,currentClipGain=1,currentFxScale=.5;
const levels={voice:.9,music:.11,fx:.35};
function text(tag,value,className){const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el;}
function status(message){$('audioStatus').textContent=message;}
function pageInfo(n){const list=story.panels.filter(p=>p.page===n);const first=story.panels.indexOf(list[0])+1;return {list,first,last:first+list.length-1};}
function render(){
 root.replaceChildren();
 for(let n=1;n<=8;n++){
  const info=pageInfo(n), section=document.createElement('section');section.className='comic-page';section.id='page-'+n;section.dataset.page=n;section.setAttribute('aria-label',n+'페이지');
  section.append(text('h2',n+'페이지 · '+info.first+'–'+info.last+'컷','page-heading'));
  const viewport=document.createElement('div');viewport.className='page-viewport';const canvas=document.createElement('div');canvas.className='page-canvas';
  for(const p of info.list){
   const count=story.panels.indexOf(p)+1, article=document.createElement('article');article.className='panel';article.id=p.id;article.dataset.panel=p.id;article.setAttribute('aria-label',count+'번째 컷');
   ['x','y','w','h'].forEach((key,i)=>article.style.setProperty('--'+key,p.rect[i]));article.style.setProperty('--art-ratio',p.rect[2]+'/'+p.rect[3]);
   const figure=document.createElement('figure');figure.className='art';const img=document.createElement('img');img.src='images/'+p.id+'.jpg';img.alt=p.visual;img.loading=count<=5?'eager':'lazy';img.decoding='async';img.width=p.rect[2];img.height=p.rect[3];
   img.addEventListener('error',()=>{img.hidden=true;const error=text('p','그림을 불러오지 못했습니다. 대본은 계속 읽을 수 있습니다.','art-error');figure.replaceChildren(error);figure.setAttribute('aria-label',p.visual);});figure.append(img);
   const lettering=document.createElement('div');lettering.className='lettering';
   if(p.narration)lettering.append(text('p',p.narration,'narration'));
   if(p.dialogue){for(const line of p.dialogue.split('\n').filter(Boolean)){const split=line.indexOf(':');const speaker=split<0?'':line.slice(0,split).trim();const words=split<0?line:line.slice(split+1).trim();const recall=speaker.includes('기억');const bubble=text('p','',recall?'speech recollection':'speech');if(speaker)bubble.append(text('span',recall?'나 · 기억 속 말':speaker,'speaker'));bubble.append(document.createTextNode(words));lettering.append(bubble);}}
   // The cassette label belongs to the lettering layer, never to the bitmap.
   if(p.id==='P02-01'){figure.append(text('span','정란','cassette-label'));}const clocks={'P01-01':'15:10','P03-05':'15:29','P06-05':'15:46','P08-01':'16:10'};if(clocks[p.id])figure.append(text('span',clocks[p.id],'scene-clock'));if(['P02-02','P02-03','P02-05','P03-03','P04-01','P04-03','P04-04','P05-04','P05-05','P06-02'].includes(p.id))article.classList.add('memory-panel');
   const foot=document.createElement('div');foot.className='panel-foot';foot.append(text('span',count+' / 40컷','panel-count'));
   const btn=text('button','이 컷 듣기','panel-play');btn.type='button';btn.disabled=true;btn.setAttribute('aria-label',count+'번째 컷 듣기');btn.addEventListener('click',()=>start(state.clips.filter(c=>c.panel===p.id)));foot.append(btn);
   article.append(figure,lettering,foot);canvas.append(article);panels.set(p.id,article);
  }
  viewport.append(canvas);section.append(viewport);root.append(section);pageSections.set(n,section);
  const button=text('button',String(n));button.type='button';button.setAttribute('aria-label',n+'페이지로 이동');button.addEventListener('click',()=>navigate(n,true));$('contents').append(button);
 }
 applyMode();
 if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{if(mode!=='continuous'||state.playing)return;const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio);if(visible[0]){pageNumber=Number(visible[0].target.dataset.page);updateNavigation();}}, {rootMargin:'-15% 0px -45% 0px',threshold:[0,.1,.3]});pageSections.forEach(s=>observer.observe(s));}
}
function sizePages(){const width=Math.max(900,Math.min(1080,root.clientWidth-18));root.style.setProperty('--page-width',(width*Number($('zoom').value)/100)+'px');root.style.setProperty('--reader-zoom',Number($('zoom').value)/100);$('zoomValue').value=$('zoom').value+'%';}
function applyMode(){document.body.classList.toggle('view-pages',mode==='pages');document.body.classList.toggle('script-view',scriptView);$('continuousMode').setAttribute('aria-pressed',mode==='continuous');$('pageMode').setAttribute('aria-pressed',mode==='pages');$('scriptMode').setAttribute('aria-pressed',scriptView);document.querySelector('.zoom-control').hidden=mode!=='pages'||scriptView;pageSections.forEach((s,n)=>s.hidden=mode==='pages'&&n!==pageNumber);sizePages();updateNavigation();}
function updateNavigation(){if(!story)return;const info=pageInfo(pageNumber);$('pageLabel').textContent=pageNumber+' / 8 페이지 · '+info.first+'–'+info.last+' / 40컷';$('prevPage').disabled=pageNumber===1;$('nextPage').disabled=pageNumber===8;$('endNote').hidden=pageNumber!==8;[...$('contents').children].forEach((b,i)=>b.setAttribute('aria-current',i+1===pageNumber?'page':'false'));}
function navigate(n,stopAudio){if(!story||n<1||n>8)return;if(stopAudio)stop(false);pageNumber=n;applyMode();pageSections.get(n).scrollIntoView({behavior:'instant',block:'start'});}
$('prevPage').addEventListener('click',()=>navigate(pageNumber-1,true));$('nextPage').addEventListener('click',()=>navigate(pageNumber+1,true));
$('continuousMode').addEventListener('click',()=>{mode='continuous';applyMode();pageSections.get(pageNumber).scrollIntoView({block:'start'});});$('pageMode').addEventListener('click',()=>{mode='pages';applyMode();});$('scriptMode').addEventListener('click',()=>{scriptView=!scriptView;applyMode();});$('zoom').addEventListener('input',sizePages);window.addEventListener('resize',sizePages);
document.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,textarea,select,button,summary,a'))return;if(e.key==='ArrowLeft'){e.preventDefault();navigate(pageNumber-1,true);}if(e.key==='ArrowRight'){e.preventDefault();navigate(pageNumber+1,true);}if(e.key==='Home'){e.preventDefault();stop(false);$('home').scrollIntoView();}});
$('homeLink').addEventListener('click',()=>stop(false));
function setGain(el,node,value,time=.35){value=Math.max(0,Math.min(3,value));if(context&&node){const t=context.currentTime;node.gain.cancelScheduledValues(t);node.gain.setValueAtTime(node.gain.value,t);node.gain.linearRampToValueAtTime(value,t+time);}else el.volume=Math.min(1,value);}
function mix(time=.35){const m=fadeEnding?0:levels.music*(silentMusic?.15:1)*(duck?.35:1)*($('musicMute').checked?0:1);setGain(voice,gains?.voice,levels.voice*currentClipGain,.06);setGain(music,gains?.music,m,time);setGain(room,gains?.room,fadeEnding?0:levels.fx*(roomNear?2.0:.5),time);setGain(click,gains?.click,levels.fx*currentFxScale,.05);}
async function unlock(){
 if(!context){const AC=window.AudioContext||window.webkitAudioContext;if(AC){try{context=new AC();gains={};for(const [name,el] of Object.entries({voice,music,room,click})){const source=context.createMediaElementSource(el),gain=context.createGain();source.connect(gain);gain.connect(context.destination);gains[name]=gain;el.volume=1;}}catch(error){context=null;gains=null;}}}
 if(context?.state==='suspended')await context.resume();mix(0);
}
async function softPlay(el){try{await el.play();}catch(error){/* Optional ambience never blocks a voice clip. */}}
function ambience(){fadeEnding=false;mix();softPlay(music);softPlay(room);}
function updateButtons(){const busy=state.playing||state.paused;$('pauseAudio').disabled=!busy;$('pauseAudio').textContent=state.paused?'계속 듣기':'일시정지';}
function clearHighlight(){panels.forEach(p=>{p.classList.remove('is-playing');p.removeAttribute('aria-current');});}
function stop(reset){state.token++;state.cancel?.();state.cancel=null;[voice,music,room,click,warm].forEach(a=>a.pause());state.playing=false;state.paused=false;duck=false;fadeEnding=false;updateButtons();if(reset){voice.currentTime=0;music.currentTime=0;room.currentTime=0;state.queue=[];state.index=0;state.currentPanel=null;clearHighlight();$('audioPosition').textContent='';silentMusic=false;roomNear=false;navigate(1,false);}status(state.ready?'음원 준비됨 · 듣기를 선택해 주세요.':'음원준비중');}
function follow(panel){clearHighlight();state.currentPanel=panel;const element=panels.get(panel);element.classList.add('is-playing');element.setAttribute('aria-current','true');const p=story.panels.find(p=>p.id===panel);const ordinal=story.panels.indexOf(p)+1;$('audioPosition').textContent=p.page+'페이지 · '+ordinal+' / 40컷';if($('autoFollow').checked){pageNumber=p.page;applyMode();element.scrollIntoView({behavior:reducedMotion?'instant':'smooth',block:mode==='pages'?'nearest':'center'});}}
function wait(ms,token){return new Promise(resolve=>{let left=ms,last=performance.now();const tick=()=>{if(token!==state.token){resolve(false);return;}const now=performance.now();if(!state.paused)left-=now-last;last=now;if(left<=0)resolve(true);else setTimeout(tick,80);};tick();});}
function playClip(clip,token){return new Promise((resolve,reject)=>{let done=false;const finish=(ok,error)=>{if(done)return;done=true;voice.removeEventListener('ended',ended);voice.removeEventListener('error',failed);state.cancel=null;error?reject(error):resolve(ok);};const ended=()=>finish(true);const failed=()=>finish(false,new Error('음원 오류'));state.cancel=()=>finish(false);voice.addEventListener('ended',ended);voice.addEventListener('error',failed);currentClipGain=Number(clip.gain)||1;mix(.01);voice.src=clip.file;voice.currentTime=0;const promise=voice.play();if(promise)promise.catch(error=>{if(token===state.token)finish(false,error);else finish(false);});});}
function warmNext(next){warm.pause();warm.removeAttribute('src');warm.load();if(next){warm.preload='auto';warm.src=next.file;warm.load();}}
async function scene(panel,token){const specific={ 'P07-01':{file:'audio/sfx-phone.wav',gain:.035},'P07-04':{file:'audio/sfx-case.wav',gain:.22},'P08-03':{file:'audio/sfx-cloth.wav',gain:.20} };currentFxScale=panel==='P07-01'?.10:panel==='P07-04'?.60:.5;if(specific[panel]){click.pause();click.src=specific[panel].file;setGain(click,gains?.click,levels.fx*currentFxScale,.01);click.currentTime=0;softPlay(click);}silentMusic=panel==='P01-03';roomNear=panel==='P01-03'||panel.startsWith('P08');fadeEnding=panel==='P08-04';mix(fadeEnding?2.3:1.1);if(panel==='P01-03'){click.src='audio/click.wav';click.currentTime=0;softPlay(click);return wait(600,token);}return true;}
async function start(queue){
 if(!state.ready||!queue.length){status('이 컷의 음원은 준비중입니다.');return;}stop(false);state.queue=queue;state.index=0;state.playing=true;state.paused=false;const token=state.token;updateButtons();
 try{await unlock();if(token!==state.token)return;ambience();status('듣는 중');let lastPanel=null;
  for(let i=0;i<queue.length;i++){
   if(token!==state.token)return;state.index=i;const clip=queue[i];
   if(lastPanel!==clip.panel){follow(clip.panel);if(!await scene(clip.panel,token))return;lastPanel=clip.panel;}
   if(!await wait(10,token))return;duck=true;mix(.2);warmNext(queue[i+1]);
   if(!await playClip(clip,token))return;duck=false;mix(.5);
   if(i<queue.length-1&&!await wait(queue[i+1].panel===clip.panel?480:720,token))return;
  }
  if(token!==state.token)return;state.playing=false;state.paused=false;fadeEnding=true;mix(2.2);updateButtons();status(queue.at(-1)?.panel==='P08-04'?'이야기가 멈췄습니다.':'듣기를 마쳤습니다.');warm.pause();warm.removeAttribute('src');warm.load();setTimeout(()=>{if(token===state.token){music.pause();room.pause();click.pause();}},2400);
 }catch(error){if(token!==state.token)return;stop(false);status(error.name==='NotAllowedError'?'재생이 허용되지 않았습니다. 듣기 버튼을 다시 눌러 주세요.':'이 컷의 음원을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');}
}
$('playAll').addEventListener('click',()=>start(state.clips));$('playPage').addEventListener('click',()=>start(state.clips.filter(c=>story.panels.find(p=>p.id===c.panel)?.page===pageNumber)));$('resetAudio').addEventListener('click',()=>stop(true));
$('pauseAudio').addEventListener('click',async()=>{if(state.paused){const token=state.token;try{await unlock();if(token!==state.token)return;state.paused=false;state.playing=true;if(voice.src&&!voice.ended)await voice.play();softPlay(music);softPlay(room);status('듣는 중');}catch(e){stop(false);status('재생을 다시 시작해 주세요.');}}else if(state.playing){state.paused=true;state.playing=false;[voice,music,room,click].forEach(a=>a.pause());status('일시정지');}updateButtons();});
for(const name of ['voice','music','fx']){$(name+'Volume').addEventListener('input',()=>{levels[name]=Number($(name+'Volume').value)/100;$(name+'Value').value=$(name+'Volume').value+'%';mix();});}$('musicMute').addEventListener('change',()=>mix());
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.playing)$('pauseAudio').click();});window.addEventListener('pagehide',()=>stop(false));
async function loadAudio(){try{const response=await fetch('audio/audio-manifest.json',{cache:'no-cache'});if(!response.ok)throw new Error();const manifest=await response.json();if(!Array.isArray(manifest.clips))throw new Error();const known=new Set(story.panels.map(p=>p.id));const clips=manifest.clips.filter(c=>known.has(c.panel)&&['narration','dialogue'].includes(c.role)&&typeof c.file==='string'&&/^audio\/[A-Za-z0-9._-]+\.(mp3|wav|m4a|ogg)$/i.test(c.file)&&!c.file.includes('..'));if(!clips.length)throw new Error();const order=new Map(story.panels.map((p,i)=>[p.id,i]));state.clips=clips.map((c,i)=>({...c,_i:i})).sort((a,b)=>order.get(a.panel)-order.get(b.panel)||(a.role==='narration'?0:1)-(b.role==='narration'?0:1)||a._i-b._i);state.ready=true;$('playAll').disabled=$('playPage').disabled=false;panels.forEach((element,id)=>{element.querySelector('.panel-play').disabled=!state.clips.some(c=>c.panel===id);});const covered=new Set(clips.map(c=>c.panel)).size;status(covered<40?'음원 일부 준비됨 · '+covered+' / 40컷':manifest.human_listening_approval==='pending'?'음원 준비됨 · 청취 확인 전':'음원 준비됨 · 듣기를 선택해 주세요.');}catch(error){state.ready=false;status('음원준비중 · 대본은 먼저 읽을 수 있습니다.');}}
async function init(){try{const response=await fetch('story.json');if(!response.ok)throw new Error();story=await response.json();if(story.panels.length!==40||new Set(story.panels.map(p=>p.page)).size!==8)throw new Error();render();await loadAudio();}catch(error){root.replaceChildren(text('p','이야기를 불러오지 못했습니다. 새로고침해 주세요.','loading'));status('음원준비중');}}
window.__comicReaderStatus=()=>({ready:state.ready,clips:state.clips.length,currentPanel:state.currentPanel,playing:state.playing,paused:state.paused,voiceTime:voice.currentTime,voiceDuration:Number.isFinite(voice.duration)?voice.duration:null,voiceError:voice.error?.message??null,gain:gains?.voice?.gain.value??null});init();
})();
