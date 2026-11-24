
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
const display = {active:0, selected:4, failed:false, file:null, unseen:0, timer:null};
const initialCount = 7;
const counts = sources.map(() => initialCount);
let logs = [];
const node = (tag, value, cls) => {const e=document.createElement(tag); if(value!==undefined)e.textContent=value; if(cls)e.className=cls; return e;};
const rows = () => replay(logs[display.active], counts[display.active]);
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
  sources.forEach((source,i) => {
    if (($('provider').value && $('provider').value!==source.provider) ||
      !source.project.includes($('project').value.trim().toLowerCase())) return;
    const button=node('button',undefined,'session');
    button.setAttribute('aria-pressed',String(i===display.active));
    button.append(node('span',source.provider+' · '+source.time,'source'),node('strong',source.title),node('small',source.project));
    button.onclick=()=>{stop();Object.assign(display,{active:i,selected:4,file:null,failed:false,unseen:0});$('round').open=true;render();goBottom();};
    container.append(button);
  });
  if(!container.children.length)container.append(node('p','未找到匹配的会话','empty'));
}
function showStep(id) {
  display.selected=id;display.failed=false;display.file=null;$('round').open=true;
  render();
  $('step-'+id)?.scrollIntoView({block:'nearest'});
  $('step-'+id)?.focus({preventScroll:true});
}
function section(label,content,open=false) {
  const e=node('details',undefined,'section');e.open=open;e.append(node('summary',label),node('pre',content));return e;
}
function details(steps) {
  const pane=$('detail'), step=steps.find(row=>row.id===display.selected);
  pane.replaceChildren(node('small','步骤详情'));
  if(!step){pane.append(node('p','选择一个工具步骤查看记录。','empty'));return;}
  pane.append(node('h2',step.title),node('p',step.kind+' · '+step.state,step.state==='失败'?'fail':'muted'));
  const actions=node('div',undefined,'actions');
  if(step.state==='失败') {
    const previous=steps.filter(row=>row.id<step.id && row.kind==='修改' && row.path===step.path).at(-1);
    if(previous){const jump=node('button','查看前一次修改 ↑');jump.onclick=()=>showStep(previous.id);actions.append(jump);}
  }
  if(step.path){const filter=node('button','查看本轮同文件步骤');filter.onclick=()=>{display.file=step.path;display.failed=false;render();};actions.append(filter);}
  pane.append(actions);
  if(step.command)pane.append(section('命令',step.command,true));
  if(step.exit!==undefined)pane.append(node('p','退出码 '+step.exit,step.exit===0?'ok':'fail'));
  if(step.output)pane.append(section('工具输出',step.output,step.state==='失败'));
  if(step.patch)pane.append(section('补丁',step.patch,true));
  if(step.content)pane.append(section('读取结果',step.content,true));
}
let detailKey='';
function render() {
  const source=sources[display.active], steps=rows(), done=counts[display.active]===logs[display.active].length;
  $('title').textContent=source.title;
  $('meta').textContent=source.provider+' / '+source.project+' · '+steps.length+' 条记录 · '+(done?'演示结束':display.timer?'正在播放':'可继续演示');
  $('play').textContent=display.timer?'暂停播放':'播放后续日志';
  $('play').disabled=done;$('next').disabled=done;
  $('failed').setAttribute('aria-pressed',String(display.failed));
  $('file').hidden=!display.file;$('file').textContent=(display.file??'')+' ×';
  sessions();
  const container=$('steps');
  const visible=steps.filter(step=>(!display.failed || step.state==='失败') && (!display.file || step.path===display.file));
  const stale=new Set([...container.children].map(e=>e.id));
  visible.forEach((step,i)=>{
    const id='step-'+step.id;stale.delete(id);
    let e=$(id);
    if(!e){e=node('button',undefined,'step');e.id=id;e.onclick=()=>{display.selected=step.id;render();};}
    const stateClass=({失败:'fail',成功:'ok',等待结果:'wait'})[step.state]??'';
    const label=node('span');
    label.append(node('strong',step.title),node('small',step.kind));
    if(e.dataset.state!==step.state){e.replaceChildren(node('span',step.kind[0],'icon'),label,node('span',step.state,'state '+stateClass));e.dataset.state=step.state;}
    e.setAttribute('aria-pressed',String(step.id===display.selected));
    if(container.children[i]!==e)container.insertBefore(e,container.children[i]??null);
  });
  for(const id of stale)container.querySelector(id?'#'+id:'.empty')?.remove();
  if(!visible.length)container.append(node('p','没有符合筛选条件的步骤','empty'));
  const key=JSON.stringify([display.active,steps.find(step=>step.id===display.selected)]);
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
$('reset').onclick=()=>{stop();counts[display.active]=initialCount;Object.assign(display,{selected:4,file:null,failed:false,unseen:0});$('round').open=true;render();goBottom();};
$('failed').onclick=()=>{display.failed=!display.failed;display.file=null;render();};
$('file').onclick=()=>{display.file=null;render();};
$('jump').onclick=goBottom;
$('timeline').addEventListener('scroll',()=>{if(atBottom()&&display.unseen){display.unseen=0;updateJump();}});
window.__TAURI__.core.invoke('demo_records').then(records => {
  logs = records;
  render();
}).catch(error => {
  $('meta').textContent = String(error);
});
