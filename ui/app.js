
const en = {
  "执行轨迹":"Trajectory",
  "外部工具":"External tool",
  "外部调用信息以日志为准":"External activity shown here is limited to what the tool recorded.",
  "全部记录":"All records",
  "Skills 调用":"Skill invoked",
  "技能文件引用":"Skill file referenced",
  "实际命令":"Recorded command",
  "提交给工具的脚本":"Script sent to tool",
  "命令已记录":"Command recorded",
  "MCP 服务":"MCP server",
  "事件类型":"Event type",
  "已完成项目":"Completed item",
  "没有可用的事件说明":"No description is available for this event. The log identifier is shown below.",
  "消息":"Messages",
  "步骤":"steps",
  "条事件":"events",
  "失败数":"failed",
  "导入 ChatGPT 聊天":"Import ChatGPT chats",
  "导入的聊天记录":"Imported chat history",
  "正在导入…":"Importing…",
  "用户":"User",
  "助手":"Assistant",
  "未命名会话":"Untitled session",
  "无项目":"No project",
  "目录设置":"Log folders",
  "工具名称":"Tool name",
  "调用参数":"Call arguments",
  "原始参数文本":"Original argument text",
  "脚本或文本参数":"Script or text argument",
  "日志未记录参数":"No arguments recorded",
  "参数":"Arguments",
  "没有记录工具输出":"No tool output recorded",
  "修复构建类型错误": "Fix a build type error",
  "修复配置解析失败": "Fix config parsing",
  "归档": "Archived",
  "未找到匹配的会话": "No matching sessions",
  "步骤详情": "Step details",
  "选择一个工具步骤查看记录。": "Select a tool step to inspect its records.",
  "查看前一次修改 ↑": "View previous edit ↑",
  "查看本轮同文件步骤": "View file activity in this turn",
  "工作目录": "Working directory",
  "原始参数": "Original arguments",
  "命令": "Command",
  "退出码": "Exit code",
  "工具输出": "Tool output",
  "补丁": "Patch",
  "读取结果": "Recorded content",
  "展开子会话": "Expand child session",
  "读取中…": "Loading…",
  "本机会话": "Local sessions",
  "演示结束": "Demo complete",
  "正在播放": "Playing",
  "可继续演示": "Ready to play",
  "从左侧选择一个会话": "Select a session on the left",
  "最近更新": "Last updated",
  "暂无新记录": "No new records",
  "暂停播放": "Pause",
  "播放后续日志": "Play remaining records",
  "任务轮次": "Turn",
  "未知记录": "Unknown record",
  "没有符合筛选条件的步骤": "No matching steps",
  "Token 用量": "Token usage",
  "输入": "Input",
  "输出": "Output",
  "总计": "Total",
  "缓存输入": "Cached input",
  "缓存写入": "Cache write",
  "推理输出": "Reasoning output",
  "缓存读取": "Cache read",
  "会话": "Session",
  "未知来源": "Unknown source",
  "未知": "Unknown",
  "切换演示": "Switch to demo",
  "浏览本机会话": "Browse local sessions",
  "演示模式 · 模拟日志": "Demo mode · Synthetic logs",
  "读取": "Read",
  "修改": "Edit",
  "工具": "Tool",
  "消息": "Message",
  "事件": "Event",
  "结果": "Result",
  "失败": "Failed",
  "成功": "Succeeded",
  "等待结果": "Waiting for result",
  "未记录结果": "No recorded result",
  "已记录结果": "Result recorded",
  "已记录": "Recorded",
  "代理来源": "Agent source",
  "所有来源": "All sources",
  "筛选项目": "Filter projects",
  "单步写入": "Append one record",
  "重置": "Reset",
  "只看失败": "Failures only",
  "执行时间线": "Execution timeline",
  "本地演示": "Local demo",
  "添加 Codex 日志目录": "Add Codex log folder",
  "添加 Claude Code 日志目录": "Add Claude Code log folder",
  "从失败步骤出发，能否快速找到相关修改并看见重跑结果？选一个会话试走一遍。": "Open a failed step to inspect the error and trace earlier edits.",
  "未配对的工具结果": "Unmatched tool result",
  "未知工具": "Unknown tool"
};
let language = localStorage.getItem('agentlens.language') ?? (navigator.language.startsWith('zh') ? 'zh' : 'en');
const t = text => language==='en' ? en[text]??text : text;
const number = n => n.toLocaleString(language==='en'?'en':'zh-CN');
const locale = () => language==='en'?'en':'zh-CN';
function readableTime(value, compact=false) {
  if(value==null || value==='')return '';
  const date=value instanceof Date?value:new Date(value);
  if(!Number.isFinite(date.getTime()))return String(value);
  const time={hour:'2-digit',minute:'2-digit',hourCycle:'h23'};
  if(compact && date.toDateString()===new Date().toDateString())return date.toLocaleTimeString(locale(),time);
  return date.toLocaleString(locale(),{...time,year:compact?undefined:'numeric',month:'short',day:'numeric',second:compact?undefined:'2-digit'});
}
const sessionTitle = source => source.title ? (local?source.title:t(source.title)) : t('未命名会话');
const groupOpen = new Map();
let sessionDrawKey = '';
function applyLanguage(){
  document.documentElement.lang=language==='en'?'en':'zh-CN';
  $('language').textContent=language==='en'?'中文':'English';
  document.querySelectorAll('[data-label]').forEach(e=>{e.textContent=t(e.dataset.label);});
  document.querySelectorAll('[data-aria]').forEach(e=>e.setAttribute('aria-label',t(e.dataset.aria)));
  $('project').placeholder=t('筛选项目');
  $('mode').textContent=t(local?'切换演示':'浏览本机会话');
  $('mode-label').textContent=t(local?'本机会话':'演示模式 · 模拟日志');
}
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
let localUsage=null, localModel=null;
let loading = false, refreshing = false, eventCount = null, lastUpdate = null, listTick = 0, selection = 0;
const display = {active:0, selected:4, failed:false, category:"activity", file:null, unseen:0, timer:null};
const initialCount = 7;
const counts = sources.map(() => initialCount);
let logs = [];
const node = (tag, value, cls) => {const e=document.createElement(tag); if(value!==undefined)e.textContent=value; if(cls)e.className=cls; return e;};
const importedChat = () => local && localKey?.startsWith('chatgpt-export:');
const stepKind = step => step.role==='user'?t('用户'):step.role==='assistant'?t('助手'):t(step.kind);
const rows = () => local ? localSteps : replay(logs[display.active], counts[display.active]);
const atBottom = () => $('timeline').scrollHeight-$('timeline').scrollTop-$('timeline').clientHeight<=12;
function updateJump() {
  $('jump').hidden=!display.unseen;
  $('jump').textContent=language==='en' ? number(display.unseen)+' new steps ↓' : '有 '+number(display.unseen)+' 个新步骤 ↓';
}
function goBottom() { $('timeline').scrollTop=$('timeline').scrollHeight; display.unseen=0; updateJump(); }
function stop() {clearInterval(display.timer);display.timer=null;}
function sessions() {
  const container=$('sessions');
  const sourceFilter=$('provider').value;
  const query=$('project').value.trim().toLowerCase();
  const all=local ? localSessions : sources;
  const drawKey=JSON.stringify([language,local,localKey,display.active,sourceFilter,query,all]);
  if(drawKey===sessionDrawKey)return;
  sessionDrawKey=drawKey;
  container.replaceChildren();
  const groups=new Map();
  all.forEach((source,i)=>{
    const project=source.project || t('无项目');
    if((sourceFilter && sourceFilter!==source.provider) ||
      ![project,sessionTitle(source)].some(value=>value.toLowerCase().includes(query)))return;
    const key=source.project_key??source.project;
    if(!groups.has(key))groups.set(key,{project,order:source.project_order,entries:[]});
    groups.get(key).entries.push([source,i]);
  });
  const ordered=[...groups].sort(([,a],[,b])=>(a.order??Infinity)-(b.order??Infinity));
  for(const [key,{project,entries}] of ordered){
    const group=node('details',undefined,'project-group');
    group.open=Boolean(query) || (groupOpen.get(key)??true);
    group.ontoggle=()=>{if(!query)groupOpen.set(key,group.open);};
    const heading=node('summary');
    const name=node('strong',project);name.title=project;
    heading.append(name,node('small',number(entries.length)));
    group.append(heading);
    for(const [source,i] of entries){
      const button=node('button',undefined,'session');
      const current=local ? source.key===localKey : i===display.active;
      button.setAttribute('aria-pressed',String(current));
      const title=node('strong',sessionTitle(source));title.title=title.textContent;
      const time=local && source.modified ? readableTime(new Date(source.modified*1000),true) : source.time;
      button.append(title,node('span',[source.provider,source.archived?t('归档'):null,time].filter(Boolean).join(' · '),'source'));
      button.onclick=()=>{if(local){void selectLocal(source.key);return;}stop();Object.assign(display,{active:i,selected:4,file:null,failed:false,unseen:0});render();goBottom();};
      group.append(button);
    }
    container.append(group);
  }
  if(!container.children.length)container.append(node('p',t('未找到匹配的会话'),'empty'));
}

function showStep(id) {
  display.selected=id;display.failed=false;display.file=null;
  display.category='all';
  render();
  const round=$('step-'+id)?.closest('details');
  if(round)round.open=true;
  $('step-'+id)?.scrollIntoView({block:'nearest'});
  $('step-'+id)?.focus({preventScroll:true});
}
function section(label,content,open=false) {
  const e=node('details',undefined,'section');e.open=open;e.append(node('summary',label),node('pre',content));return e;
}
function argumentDetails(raw) {
  let parsed;
  try { parsed=JSON.parse(raw); } catch { /* The log can contain a script or plain text. */ }
  if(!parsed || typeof parsed!=='object' || Array.isArray(parsed))
    return section(t('脚本或文本参数'),raw,true);

  const details=node('details',undefined,'section');
  details.open=true;
  const entries=Object.entries(parsed);
  details.append(node('summary',t('调用参数')+' · '+number(entries.length)));
  const fields=node('dl',undefined,'argument-fields');
  for(const [key,value] of entries){
    const field=node('div');
    const body=typeof value==='string'?value:JSON.stringify(value,null,2);
    const label=node('dt',key);
    const data=node('dd');
    data.append(node('pre',body));
    field.append(label,data);
    fields.append(field);
  }
  details.append(fields,section(t('原始参数文本'),raw));
  return details;
}
const stepPaths=step=>step.paths?.length ? step.paths : step.path ? [step.path] : [];
function objectArgs(raw){
  try {
    const data=JSON.parse(raw);
    return data && typeof data==='object' && !Array.isArray(data)?data:{};
  } catch { return {}; }
}
function labelStep(step){
  const args=objectArgs(step.args);
  const namespace=step.namespace??'';
  const tool=step.tool??'';
  const mcp=/^mcp__([^_].*?)(?:__(.+))?$/.exec(tool);
  const server=step.server || mcp?.[1] || (namespace.startsWith('mcp__')?namespace.slice(5):'');
  if(server)return {category:'mcp',title:server+' / '+(mcp?.[2]??tool),server};
  if(tool.toLowerCase()==='skill')return {category:'skill',title:args.skill??args.name??tool,explicit:true};
  const refs=[...new Set(
    [step.path,step.command,step.script].filter(Boolean).flatMap(value=>
      [...String(value).matchAll(/(?:^|[~/.])skills[\/]+([^\/\s"'`]+)\/SKILL\.md\b/g)].map(match=>match[1]))
  )];
  if(refs.length)return {category:'skill',title:refs.join(' · '),explicit:false};
  if(step.kind==='事件')return {category:'event',title:eventName(step)[language==='en'?1:0]};
  if(step.kind==='消息')return {category:'message',title:step.title};
  const external=step.network || /^(web__|browser__)/.test(namespace) || /^(web_search|WebSearch|WebFetch)$/.test(tool);
  return {category:'tool',external,title:step.command || step.script || step.path || step.title};
}
const eventLabels={
  task_started:['开始任务','Task started','代理开始处理一轮任务。','The agent started a task turn.'],
  additional_tools:['登记可用工具','Tools registered','运行时记录了可用的工具定义。','The runtime recorded available tool definitions.'],
  world_state:['更新运行状态','Runtime state update','运行时记录了一次环境状态。','The runtime recorded an environment state.'],
  thread_settings_applied:['应用会话配置','Session settings applied','运行时应用了当前会话配置。','The runtime applied the session settings.'],
  item_completed:['执行项目已完成','Item completed','运行时记录了一个执行项目的结束。可查看项目类型了解是哪类活动。','The runtime recorded the end of an execution item. See its item type for the activity.'],
  ContextCompaction:['压缩上下文','Context compacted','运行时压缩了较早的会话上下文。','The runtime compacted earlier conversation context.'],
  SubAgentActivity:['子代理活动结束','Subagent activity completed','运行时记录了一项子代理活动结束。','The runtime recorded completed subagent activity.'],
  AgentMessage:['助手消息已完成','Assistant message completed','运行时记录了助手消息结束。','The runtime recorded completion of an assistant message.'],
  UserMessage:['用户消息已处理','User message processed','运行时记录了用户消息处理结束。','The runtime recorded processing of a user message.'],
  file_history_snapshot:['记录文件快照','File snapshot recorded','日志保存了用于跟踪文件历史的快照。','The log saved a snapshot for tracking file history.'],
  'file-history-snapshot':['记录文件快照','File snapshot recorded','日志保存了用于跟踪文件历史的快照。','The log saved a snapshot for tracking file history.'],
  permission_request:['请求执行权限','Permission requested','工具执行需要权限判断。','Tool execution required a permission decision.'],
};
function eventName(step){
  const label=[step.itemType,step.title].find(key=>Object.hasOwn(eventLabels,key));
  return label ? eventLabels[label] : [step.title,step.title];
}
const filters=[['activity','执行轨迹'],['tool','工具'],['skill','Skills'],['mcp','MCP'],['event','事件'],['message','消息'],['all','全部记录']];
function renderFilters(steps){
  const bar=$('activity-filter');
  bar.hidden=Boolean(importedChat());
  if(bar.hidden)return;
  const counts={activity:0,all:steps.length};
  for(const step of steps){
    const type=labelStep(step).category;
    counts[type]=(counts[type]??0)+1;
    if(type!=='event')counts.activity++;
  }
  const key=JSON.stringify([language,display.category,counts]);
  if(key===bar.dataset.key)return;
  bar.dataset.key=key;
  bar.replaceChildren();
  for(const [category,name] of filters){
    const button=node('button',t(name)+' '+number(counts[category]??0));
    button.setAttribute('aria-pressed',String(display.category===category));
    button.onclick=()=>{display.category=category;display.file=null;render();};
    bar.append(button);
  }
}
function details(steps) {
  const pane=$('detail'), step=steps.find(row=>row.id===display.selected);
  pane.replaceChildren(node('small',t('步骤详情')));
  if(!step){pane.append(node('p',t('选择一个工具步骤查看记录。'),'empty'));return;}
  const info=labelStep(step);
  const heading=info.category==='tool' ? step.tool??step.title : info.title;
  pane.append(node('h2',t(heading)),node('p',stepKind(step)+' · '+t(step.state),step.state==='失败'?'fail':'muted'));
  if(info.category==='event'){
    const event=eventName(step);
    pane.append(node('p',event[language==='en'?3:2]??t('没有可用的事件说明'),'event-description'));
    pane.append(node('code',[step.title,step.itemType].filter(Boolean).join(' / ')));
  } else if(info.category==='skill'){
    pane.append(node('p',t(info.explicit?'Skills 调用':'技能文件引用')+' · '+info.title,'tool-name'));
  } else if(info.server){
    pane.append(node('p',t('MCP 服务')+' · '+info.server,'tool-name'));
  }
  const actions=node('div',undefined,'actions');
  if(step.state==='失败') {
    const prior=steps.filter(row=>row.id<step.id && row.kind==='修改');
    const hints=stepPaths(step);
    const previous=prior.filter(row=>stepPaths(row).some(path=>hints.includes(path) ||
      step.output?.includes(path) || step.output?.includes(path.replace(/^.*\//,'')))).at(-1) ?? prior.at(-1);
    if(previous){const jump=node('button',t('查看前一次修改 ↑'));jump.onclick=()=>showStep(previous.id);actions.append(jump);}
  }
  for(const path of stepPaths(step)){
    const filter=node('button',t('查看本轮同文件步骤')+' · '+path);
    filter.onclick=()=>{display.category='activity';display.file={path,round:step.round??1};display.failed=false;render();};
    actions.append(filter);
  }
  pane.append(actions);
  if(info.external)pane.append(node('p',t('外部调用信息以日志为准'),'event-description'));
  if(step.time)pane.append(node('small',readableTime(step.time),'step-time'));
  if(step.cwd)pane.append(section(t('工作目录'),step.cwd));
  if(step.tool) {
    const tool=node('p',undefined,'tool-name');
    tool.append(node('span',t('工具名称')+' '),node('code',step.tool));
    pane.append(tool);
  }
  if(step.command)pane.append(section(t('实际命令'),step.command,true));
  if(step.script)pane.append(section(t('提交给工具的脚本'),step.script,true));
  if(step.args!=null && step.args!==step.script)pane.append(argumentDetails(step.args));
  else if(step.tool && !step.script)pane.append(node('p',t('日志未记录参数'),'muted tool-name'));
  if(step.exit!=null)pane.append(node('p',t('退出码')+' '+step.exit,step.exit===0?'ok':'fail'));
  if(step.output!=null)pane.append(section(t('工具输出'),step.output,step.state==='失败'));
  else if(step.tool && !['等待结果','未记录结果'].includes(step.state))pane.append(node('p',t('没有记录工具输出'),'muted tool-name'));
  if(step.patch)pane.append(section(t('补丁'),step.patch,true));
  if(step.content)pane.append(section(step.kind==='消息'?t('消息'):t('读取结果'),step.content,true));
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
      group.append(node('summary',t('展开子会话')),content);
      let loaded=false;
      group.ontoggle=async()=>{
        if(!group.open || loaded)return;
        loaded=true;
        content.textContent=t('读取中…');
        try {
          const result=await invoke('read_session',{key:child.key});
          content.replaceChildren();
          for(const row of result.steps){
            const body=[row.command,row.args,row.output,row.patch,row.content].filter(Boolean).join('\n');
            content.append(section(t(row.kind)+' · '+row.title+' · '+t(row.state),body));
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
  $('title').textContent=source?(sessionTitle(source)):t('本机会话');
  $('meta').textContent=source ? source.provider+' / '+(source.project||t('无项目'))+' · '+(language==='en' ? number(steps.length)+' records' : number(steps.length)+' 条记录')+(local?'':' · '+t(done?'演示结束':display.timer?'正在播放':'可继续演示')) : t('从左侧选择一个会话');
  if(local && localModel) $('meta').textContent+=' · '+localModel;
  if(importedChat()) $('meta').textContent+=' · '+t('导入的聊天记录');
  else if(local && localKey) $('meta').textContent+=' · '+(lastUpdate?t('最近更新')+' '+lastUpdate.toLocaleTimeString(language==='en'?'en':'zh-CN'):t('暂无新记录'));
  $('folders').hidden=!local;
  $('import-chatgpt').hidden=!local;
  $('import-status').hidden=!local || !$('import-status').textContent;
  $('failed').hidden=Boolean(importedChat());
  for(const id of ['play','next','reset'])$(id).hidden=local;
  $('play').textContent=t(display.timer?'暂停播放':'播放后续日志');
  $('play').disabled=done;$('next').disabled=done;
  $('failed').setAttribute('aria-pressed',String(display.failed));
  $('file').hidden=!display.file;$('file').textContent=(display.file?.path??'')+' ×';
  sessions();
  const container=$('steps');
  renderFilters(steps);
  const visible=steps.filter(step=>{
    const category=labelStep(step).category;
    return (importedChat() || display.category==='all' || (display.category==='activity' && category!=='event') || category===display.category);
  }).filter(step=>(!display.failed || step.state==='失败') && (!display.file || ((step.round??1)===display.file.round && stepPaths(step).includes(display.file.path))));
  const openRounds = new Map([...container.querySelectorAll('details')].map(e=>[e.dataset.round,e.open]));
  const rounds = new Map();
  for(const step of visible) {
    const round=String(step.round??1);
    if(!rounds.has(round))rounds.set(round,[]);
    rounds.get(round).push(step);
  }
  const drawKey=JSON.stringify([language,localKey,display.active,display.selected,visible]);
  if(container.dataset.drawKey!==drawKey){
    container.dataset.drawKey=drawKey;
    container.replaceChildren();
    const latest=[...rounds.keys()].at(-1);
    for(const [round, entries] of rounds){
      const group=node('details',undefined,'round');
      group.dataset.round=round;
      group.open=openRounds.get(round)??(!local || round===latest || entries.some(step=>step.id===display.selected));
      const summary=node('summary');
      const first=steps.find(step=>String(step.round??1)===round && step.role==='user');
      const label=node('strong',t('任务轮次')+' '+round+(first?' · '+first.title:''));
      label.title=label.textContent;
      const failureCount=entries.filter(step=>step.state==='失败').length;
      summary.append(label,node('small',number(entries.length)+' '+t('步骤')+(failureCount?' · '+number(failureCount)+' '+t('失败数'):'')));
      group.append(summary);
      for(const step of entries){
        const e=node('button',undefined,'step');
        e.id='step-'+step.id;
        e.onclick=()=>{display.selected=step.id;render();$(e.id)?.focus({preventScroll:true});};
        const stateClass=({失败:'fail',成功:'ok',等待结果:'wait'})[step.state]??'';
        const label=node('span');
        const info=labelStep(step);
        const headline=node('strong',t(info.title??'未知记录'));
        if(info.category==='tool' && (step.command || step.script))headline.className='code-preview';
        const type=info.category==='skill'?'Skills':info.category==='mcp'?'MCP':info.external?t('外部工具'):stepKind(step);
        label.append(headline,node('small',[type,step.tool && (step.command || step.script)?step.tool:null,readableTime(step.time,true)].filter(Boolean).join(' · ')));
        e.append(node('span',type[0],'icon '+info.category),label,node('span',t(step.state),'state '+stateClass));
        e.setAttribute('aria-pressed',String(step.id===display.selected));
        group.append(e);
      }
      container.append(group);
    }
    if(!visible.length)container.append(node('p',t('没有符合筛选条件的步骤'),'empty'));
  }
  const key=JSON.stringify([language,localKey,display.active,steps.find(step=>step.id===display.selected)]);
  if(detailKey!==key){detailKey=key;details(steps);}
  const usage=$('usage');
  usage.hidden=!local || !localKey || Boolean(importedChat());
  usage.replaceChildren(node('h2',t('Token 用量')));
  if(local && localKey){
    const values=localUsage?.values??{};
    const names={input_tokens:'输入',output_tokens:'输出',total_tokens:'总计',cached_input_tokens:'缓存输入',
      cache_write_input_tokens:'缓存写入',reasoning_output_tokens:'推理输出',cache_read_input_tokens:'缓存读取',
      cache_creation_input_tokens:'缓存写入'};
    const fields=localUsage?.source==='message.usage'
      ? ['input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens']
      : ['input_tokens','output_tokens','total_tokens','cached_input_tokens','cache_write_input_tokens','reasoning_output_tokens'];
    usage.append(node('small',localUsage ? t('会话')+' · '+localUsage.source : t('会话')+' · '+t('未知来源')));
    const dl=node('dl');
    for(const field of fields)dl.append(node('dt',t(names[field])),node('dd',values[field]==null?t('未知'):number(values[field])));
    usage.append(dl);
  }
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
  localSteps=[];localUsage=null;localModel=null;
  eventCount=null;lastUpdate=null;loading=true;
  Object.assign(display,{selected:null,file:null,failed:false,category:"activity",unseen:0});
  render();
  try {
    const session=await invoke('read_session',{key});
    if(!local || selection!==generation)return;
    localSteps=session.steps;eventCount=session.eventCount;localUsage=session.usage;localModel=session.model;
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
  localSteps=[];localUsage=null;localModel=null;
  Object.assign(display,{selected:local?null:4,file:null,failed:false,category:"activity",unseen:0});
  $('mode').textContent=t(local?'切换演示':'浏览本机会话');
  $('mode-label').textContent=t(local?'本机会话':'演示模式 · 模拟日志');
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
let importCount=null;
function showImportCount(){
  if(importCount==null)return;
  $('import-status').textContent=language==='en'
    ? 'Processed '+number(importCount)+' ChatGPT conversations.'
    : '已处理 '+number(importCount)+' 段 ChatGPT 聊天。';
}
$('import-chatgpt').onclick=async()=>{
  const button=$('import-chatgpt'), status=$('import-status');
  importCount=null;
  button.disabled=true;
  status.hidden=false;
  status.textContent=t('正在导入…');
  try{
    const count=await invoke('import_chatgpt');
    status.textContent='';
    if(count==null)return;
    importCount=count;
    localSessions=await invoke('local_sessions');
    if(local){
      $('provider').value='ChatGPT';
      $('project').value='';
      showImportCount();
      if(!importedChat()){
        const first=localSessions.find(s=>s.provider==='ChatGPT');
        if(first)await selectLocal(first.key);
        else render();
      }
      else await selectLocal(localKey);
    }
  }catch(error){
    status.textContent=String(error);
  }finally{
    status.hidden=!local || !status.textContent;
    button.disabled=false;
  }
};
$('codex-folder').onclick=()=>void addFolder('Codex');
$('claude-folder').onclick=()=>void addFolder('Claude Code');
setInterval(async()=>{
  if(!local || refreshing || loading)return;
  refreshing=true;
  const generation=selection;
  const key=localKey;
  try {
    if(key && !importedChat()) {
      const session=await invoke('read_session',{key});
      if(!local || selection!==generation)return;
      if(session.eventCount!==eventCount || JSON.stringify(session.steps)!==JSON.stringify(localSteps)){
        const follow=atBottom();
        const added=Math.max(0,session.steps.length-localSteps.length);
        eventCount=session.eventCount;localSteps=session.steps;localUsage=session.usage;localModel=session.model;lastUpdate=new Date();
        if(!follow)display.unseen+=added;
        render();
        if(follow)goBottom();
      }
    }
    if(listTick++%4===0){
      localSessions=await invoke('local_sessions');
      if(local)render();
    }
  } catch(error) {
    if(local && selection===generation)$('meta').textContent=String(error);
  } finally { refreshing=false; }
},700);
$('language').onclick=()=>{
  language=language==='en'?'zh':'en';
  localStorage.setItem('agentlens.language',language);
  applyLanguage();
  showImportCount();
  if(logs.length)render();
};
applyLanguage();
$('mode').disabled=true;
invoke('demo_records').then(records=>{
  logs=records;
  $('mode').disabled=false;
  render();
}).catch(error=>{$('meta').textContent=String(error);});
