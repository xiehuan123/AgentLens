
const sources = [
  {provider:'Codex', project:'workspace-web', title:'修复构建类型错误', path:'src/config.ts', command:'npm run build', time:'14:32'},
  {provider:'Claude Code', project:'inventory-cli', title:'修复配置解析失败', path:'src/settings.ts', command:'npm test', time:'14:19'}
];
function replay(records, count) {
  return records.slice(0,count).reduce((steps, record) => record.target
    ? steps.map(step => step.id===record.target ? {...step,...record.result} : step)
    : [...steps,record], []);
}
const $ = id => document.getElementById(id);
const invoke = (command, args) => window.__TAURI__.core.invoke(command, args);
let localSessions = [], localSteps = [], localKey = null, local = false;
let loading = false, refreshing = false, eventCount = null, lastUpdate = null, listTick = 0, selection = 0;
const display = {active:0, selected:4, failed:false, file:null, unseen:0, timer:null};
const initialCount = 7;
const counts = sources.map(() => initialCount);
let logs = [];
const node = (tag, value, cls) => {const e=document.createElement(tag); if(value!==undefined)e.textContent=value; if(cls)e.className=cls; return e;};
const rows = () => local ? localSteps : replay(logs[display.active], counts[display.active]);
const atBottom = () => $('timeline').scrollHeight-$('timeline').scrollTop-$('timeline').clientHeight<=12;
function updateJump() {
  $('jump').hidden=!display.unseen;
  $('jump').textContent='有 '+display.unseen+' 个新步骤 ↓';
}
function goBottom() { $('timeline').scrollTop=$('timeline').scrollHeight; display.unseen=0; updateJump(); }
function stop() {clearInterval(display.timer);display.timer=null;}
function sessions() {
  const container=$('sessions');
  container.replaceChildren();
  (local ? localSessions : sources).forEach((source,i) => {
    if (($('provider').value && $('provider').value!==source.provider) ||
      !source.project.toLowerCase().includes($('project').value.trim().toLowerCase())) return;
    const button=node('button',undefined,'session');
    button.setAttribute('aria-pressed',String(local ? source.key===localKey : i===display.active));
    button.append(node('span',source.provider+' · '+(source.archived?'归档':local ? new Date(source.modified*1000).toLocaleString() : source.time),'source'),node('strong',source.title),node('small',source.project));
    button.onclick=()=>{if(local){void selectLocal(source.key);return;}stop();Object.assign(display,{active:i,selected:4,file:null,failed:false,unseen:0});render();goBottom();};
    container.append(button);
  });
  if(!container.children.length)container.append(node('p','未找到匹配的会话','empty'));
}
function showStep(id) {
  display.selected=id;display.failed=false;display.file=null;
  render();
  const round=$('step-'+id)?.closest('details');
  if(round)round.open=true;
  $('step-'+id)?.scrollIntoView({block:'nearest'});
  $('step-'+id)?.focus({preventScroll:true});
}
function section(label,content,open=false) {
  const e=node('details',undefined,'section');e.open=open;e.append(node('summary',label),node('pre',content));return e;
}
const stepPaths=step=>step.paths?.length ? step.paths : step.path ? [step.path] : [];
function details(steps) {
  const pane=$('detail'), step=steps.find(row=>row.id===display.selected);
  pane.replaceChildren(node('small','步骤详情'));
  if(!step){pane.append(node('p','选择一个工具步骤查看记录。','empty'));return;}
  pane.append(node('h2',step.title),node('p',step.kind+' · '+step.state,step.state==='失败'?'fail':'muted'));
  const actions=node('div',undefined,'actions');
  if(step.state==='失败') {
    const prior=steps.filter(row=>row.id<step.id && row.kind==='修改');
    const hints=stepPaths(step);
    const previous=prior.filter(row=>stepPaths(row).some(path=>hints.includes(path) ||
      step.output?.includes(path) || step.output?.includes(path.replace(/^.*\//,'')))).at(-1) ?? prior.at(-1);
    if(previous){const jump=node('button','查看前一次修改 ↑');jump.onclick=()=>showStep(previous.id);actions.append(jump);}
  }
  for(const path of stepPaths(step)){
    const filter=node('button','查看本轮同文件步骤 · '+path);
    filter.onclick=()=>{display.file={path,round:step.round??1};display.failed=false;render();};
    actions.append(filter);
  }
  pane.append(actions);
  if(step.time)pane.append(node('small',step.time));
  if(step.cwd)pane.append(section('工作目录',step.cwd));
  if(step.args)pane.append(section('原始参数',step.args));
  if(step.command)pane.append(section('命令',step.command,true));
  if(step.exit!=null)pane.append(node('p','退出码 '+step.exit,step.exit===0?'ok':'fail'));
  if(step.output)pane.append(section('工具输出',step.output,step.state==='失败'));
  if(step.patch)pane.append(section('补丁',step.patch,true));
  if(step.content)pane.append(section('读取结果',step.content,true));
  if(step.child && local){
    const child=localSessions.find(session=>{
      const file=session.key.split('/').at(-1);
      return session.provider===localSessions.find(parent=>parent.key===localKey)?.provider &&
        session.key!==localKey && (file===step.child+'.jsonl' || file==='agent-'+step.child+'.jsonl' ||
        (session.provider==='Codex' && file.endsWith('-'+step.child+'.jsonl')));
    });
    if(child){
      const group=node('details',undefined,'section');
      const content=node('div');
      group.append(node('summary','展开子会话'),content);
      let loaded=false;
      group.ontoggle=async()=>{
        if(!group.open || loaded)return;
        loaded=true;
        content.textContent='读取中…';
        try {
          const result=await invoke('read_session',{key:child.key});
          content.replaceChildren();
          for(const row of result.steps){
            const body=[row.command,row.args,row.output,row.patch,row.content].filter(Boolean).join('\n');
            content.append(section(row.kind+' · '+row.title+' · '+row.state,body));
          }
        } catch(error) { loaded=false;content.textContent=String(error); }
      };
      pane.append(group);
    }
  }
}
let detailKey='';
function render() {
  const source=local ? localSessions.find(session=>session.key===localKey) : sources[display.active];
  const steps=rows(), done=!local && counts[display.active]===logs[display.active].length;
  $('title').textContent=source?.title??'本机会话';
  $('meta').textContent=source ? source.provider+' / '+source.project+' · '+steps.length+' 条记录'+(local?'':' · '+(done?'演示结束':display.timer?'正在播放':'可继续演示')) : '从左侧选择一个会话';
  if(local && localKey) $('meta').textContent+=' · '+(lastUpdate?'最近更新 '+lastUpdate.toLocaleTimeString():'暂无新记录');
  $('folders').hidden=!local;
  for(const id of ['play','next','reset'])$(id).hidden=local;
  $('play').textContent=display.timer?'暂停播放':'播放后续日志';
  $('play').disabled=done;$('next').disabled=done;
  $('failed').setAttribute('aria-pressed',String(display.failed));
  $('file').hidden=!display.file;$('file').textContent=(display.file?.path??'')+' ×';
  sessions();
  const container=$('steps');
  const visible=steps.filter(step=>(!display.failed || step.state==='失败') && (!display.file || ((step.round??1)===display.file.round && stepPaths(step).includes(display.file.path))));
  const openRounds = new Map([...container.querySelectorAll('details')].map(e=>[e.dataset.round,e.open]));
  const rounds = new Map();
  for(const step of visible) {
    const round=String(step.round??1);
    if(!rounds.has(round))rounds.set(round,[]);
    rounds.get(round).push(step);
  }
  const drawKey=JSON.stringify([localKey,display.active,display.selected,visible]);
  if(container.dataset.drawKey!==drawKey){
    container.dataset.drawKey=drawKey;
    container.replaceChildren();
    for(const [round, entries] of rounds){
      const group=node('details',undefined,'round');
      group.dataset.round=round;
      group.open=openRounds.get(round)??true;
      group.append(node('summary','任务轮次 '+round));
      for(const step of entries){
        const e=node('button',undefined,'step');
        e.id='step-'+step.id;
        e.onclick=()=>{display.selected=step.id;render();$(e.id)?.focus({preventScroll:true});};
        const stateClass=({失败:'fail',成功:'ok',等待结果:'wait'})[step.state]??'';
        const label=node('span');
        label.append(node('strong',step.title??'未知记录'),node('small',step.kind));
        e.append(node('span',step.kind[0],'icon'),label,node('span',step.state,'state '+stateClass));
        e.setAttribute('aria-pressed',String(step.id===display.selected));
        group.append(e);
      }
      container.append(group);
    }
    if(!visible.length)container.append(node('p','没有符合筛选条件的步骤','empty'));
  }
  const key=JSON.stringify([localKey,display.active,steps.find(step=>step.id===display.selected)]);
  if(detailKey!==key){detailKey=key;details(steps);}
  updateJump();
}
function advance(){
  const index=display.active, record=logs[index][counts[index]];
  if(!record)return;
  const follow=atBottom();
  counts[index]++;
  if(!follow && !record.target)display.unseen++;
  if(counts[index]===logs[index].length)stop();
  render();if(follow)goBottom();
}
$('project').oninput=sessions;$('provider').onchange=sessions;
$('next').onclick=advance;
$('play').onclick=()=>{if(display.timer)stop();else display.timer=setInterval(advance,1100);render();};
$('reset').onclick=()=>{stop();counts[display.active]=initialCount;Object.assign(display,{selected:4,file:null,failed:false,unseen:0});render();goBottom();};
$('failed').onclick=()=>{display.failed=!display.failed;display.file=null;render();};
$('file').onclick=()=>{display.file=null;render();};
$('jump').onclick=goBottom;
$('timeline').addEventListener('scroll',()=>{if(atBottom()&&display.unseen){display.unseen=0;updateJump();}});
async function selectLocal(key) {
  const generation=++selection;
  localKey=key;
  localSteps=[];
  eventCount=null;lastUpdate=null;loading=true;
  Object.assign(display,{selected:null,file:null,failed:false,unseen:0});
  render();
  try {
    const session=await invoke('read_session',{key});
    if(!local || selection!==generation)return;
    localSteps=session.steps;eventCount=session.eventCount;
    render();
    goBottom();
  } catch(error) {
    if(local && selection===generation)$('meta').textContent=String(error);
  } finally { if(selection===generation)loading=false; }
}
$('mode').onclick=async()=>{
  stop();
  local=!local;
  selection++;loading=false;eventCount=null;lastUpdate=null;listTick=0;
  localKey=null;
  localSteps=[];
  Object.assign(display,{selected:local?null:4,file:null,failed:false,unseen:0});
  $('mode').textContent=local?'切换演示':'浏览本机会话';
  $('mode-label').textContent=local?'本机会话':'演示模式 · 模拟日志';
  $('project').value='';
  $('provider').value='';
  render();
  if(local)try {
    localSessions=await invoke('local_sessions');
    if(local)render();
  } catch(error) { if(local)$('meta').textContent=String(error); }
};
async function addFolder(provider) {
  try {
    if(await invoke('choose_folder',{provider})) {
      localSessions=await invoke('local_sessions');
      if(local)render();
    }
  } catch(error) { if(local)$('meta').textContent=String(error); }
}
$('codex-folder').onclick=()=>void addFolder('Codex');
$('claude-folder').onclick=()=>void addFolder('Claude Code');
setInterval(async()=>{
  if(!local || refreshing || loading)return;
  refreshing=true;
  const generation=selection;
  const key=localKey;
  try {
    if(key) {
      const session=await invoke('read_session',{key});
      if(!local || selection!==generation)return;
      if(session.eventCount!==eventCount || JSON.stringify(session.steps)!==JSON.stringify(localSteps)){
        const follow=atBottom();
        const added=Math.max(0,session.steps.length-localSteps.length);
        eventCount=session.eventCount;localSteps=session.steps;lastUpdate=new Date();
        if(!follow)display.unseen+=added;
        render();
        if(follow)goBottom();
      }
    }
    if(listTick++%4===0){
      localSessions=await invoke('local_sessions');
      if(local)sessions();
    }
  } catch(error) {
    if(local && selection===generation)$('meta').textContent=String(error);
  } finally { refreshing=false; }
},700);
$('mode').disabled=true;
invoke('demo_records').then(records=>{
  logs=records;
  $('mode').disabled=false;
  render();
}).catch(error=>{$('meta').textContent=String(error);});
