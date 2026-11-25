
const en = {
  "文件操作":"File activity",
  "读取文件":"Read",
  "写入文件":"Write",
  "修改文件":"Edit",
  "创建文件":"Create",
  "删除文件":"Delete",
  "移动或重命名":"Move or rename",
  "注入上下文":"Context injection",
  "全部操作":"All actions",
  "整个会话":"Entire session",
  "按文件路径搜索":"Search file paths",
  "没有匹配的文件记录":"No matching file records",
  "只显示日志支持的操作。文件操作结果以原步骤状态为准。":"Shows actions supported by the logs. Check the source step for the recorded outcome.",

  "评估集":"Evaluations",
  "会话记录":"Sessions",
  "执行分析":"Insights",
  "Skills 中心":"Skills Studio",
  "MCP 中心":"MCP Studio",
  "反馈":"Feedback",
  "记录反馈":"Record feedback",
  "如何开启 Codex Trace":"Enable Codex Trace",
  "从该终端启动新的 Codex CLI 会话。旧会话不会补录，正在运行的桌面会话不会切换设置。":"Start a new Codex CLI session from this terminal. Past sessions cannot be backfilled. Existing desktop processes keep their settings.",
  "选择生成的会话子目录。生成 state.json 时，请使用录制该包的同一个 Codex 可执行文件。":"Select the generated session subfolder. To produce state.json, use the same Codex executable that recorded the bundle.",
  "原始请求可能含有提示词、代码和工具数据，只在本机按需读取。":"Raw requests may contain prompts, code, and tool data. AgentLens reads them locally on demand.",
  "打开已生成的 Trace":"Open reduced trace",
  "用 Codex 处理 Trace":"Reduce with Codex",
  "AgentLens 检测到录制目录配置。":"AgentLens inherited a trace directory setting.",
  "AgentLens 未检测到录制目录配置。":"AgentLens did not inherit a trace directory setting.",
  "此状态只反映 AgentLens 的环境，其他 Codex 进程可能使用不同配置。":"This reflects the AgentLens environment. Other Codex processes may use a different setting.",
  "尚未打开 Trace 包":"No trace bundle open",
  "已打开 Trace 包":"Trace bundle open",
  "正在加载 Trace…":"Loading trace…",
  "模型请求尝试":"Inference attempts",
  "推理尝试 ID":"Inference attempt ID",
  "查看原始请求体":"View raw request body",
  "请求体缺失或未完整录制":"Request body is missing or only partially captured",
  "请求体已完整录制":"Complete request body captured",
  "没有已记录的模型请求":"No inference requests recorded",
  "记录状态":"Recording status",
  "已完成":"Completed",
  "尚未封存":"Unclosed",
  "已封存，包含部分数据":"Closed with partial data",
  "模型":"Model",
  "提供方":"Provider",
  "关联工具调用":"Linked tool calls",
  "会话 ID":"Thread ID",
  "请选择日志目录":"Choose a log folder",
  "已添加日志目录":"Log folder added",
  "无法添加日志目录":"Could not add log folder",
  "子智能体 ID":"Subagent ID",
  "子会话":"Child session",
  "子智能体路径":"Subagent path",
  "关联子会话日志尚未找到":"Linked child log is not available yet",
  "日志未记录可关联的子会话 ID":"No linkable child session ID was recorded",
  "刷新子会话":"Refresh child session",
  "打开子会话":"Open child session",
  "请求":"Requests",
  "模型请求与响应记录":"Model request and response records",
  "外部请求线索":"External request evidence",
  "HTTP 方法":"HTTP method",
  "已记录 HTTP 状态码":"Recorded HTTP status",
  "已记录目标":"Recorded targets",
  "日志未记录目标":"No target recorded",
  "这是日志记录的操作或入参。网络状态、响应码和请求完成情况以日志证据为准。":"This shows a recorded action or input. Network status, response codes and completion require explicit log evidence.",
  "源日志偏移":"Source log byte offset",
  "结果日志偏移":"Result log byte offset",
  "已拒绝":"Declined",
  "排查会话":"Inspect session",
  "关闭":"Close",
  "失败排查":"Failures",
  "改动与验证":"Changes & checks",
  "Skills 与 MCP":"Skills & MCP",
  "导出排查包":"Export report",
  "选择任务轮次":"Select a turn",
  "选取失败步骤":"Select a failed step",
  "未记录失败步骤":"No recorded failures",
  "相关修改":"Related prior edits",
  "未找到关联文件修改":"No prior edits matched the recorded file evidence",
  "本轮后续相同命令":"Later runs of the same command in this turn",
  "未记录验证":"No matching verification was recorded",
  "工作目录缺失，关联仅基于命令文本":"Working directory missing. Matched by exact command text.",
  "本轮文件操作":"Recorded file activity in this turn",
  "本轮验证命令":"Check commands in this turn",
  "未记录文件改动":"No recorded file changes",
  "未识别到验证命令":"No recognized check command",
  "打开原步骤":"Open original step",
  "添加到排查包":"Add to report",
  "从排查包移除":"Remove from report",
  "没有 Skills 或 MCP 调用记录":"No recorded Skill or MCP activity",
  "选取本轮步骤后可预览并保存。默认仅包含状态与类型。":"Select steps to preview and save. Only status and type are included by default.",
  "命令与脚本":"Commands and scripts",
  "消息内容":"Message text",
  "调用参数与错误":"Arguments and errors",
  "输出与退出码":"Output and exit code",
  "文件路径与补丁":"Paths and patches",
  "调用与轮次 ID":"Call and turn IDs",
  "保存 Markdown":"Save Markdown",
  "已保存到本机":"Saved locally",
  "排查包预览":"Report preview",
  "本轮没有可选步骤":"No steps in this turn",
  "折叠详情":"Details",
  "条记录":"records",
  "调用":"Calls",
  "文件引用":"File references",
  "无已记录耗时":"No duration recorded",
  "检查结果以退出码或工具状态为准":"Check results reflect exit codes or recorded tool status.",
  "记录位置":"Record location",
  "工具结果未记录":"No tool result recorded",
  "模型和轮次":"Model & turns",
  "已中止":"Aborted",
  "工具调用 ID":"Tool call ID",
  "轮次 ID":"Turn ID",
  "根轮次 ID":"Root turn ID",
  "模型响应 ID":"Model response ID",
  "请求 ID":"Request ID",
  "已记录原因":"Recorded reason",
  "错误代码或类型":"Error code or type",
  "耗时":"Duration",
  "日志未记录原因":"No reason recorded",
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
  const time={hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'};
  if(compact && date.toDateString()===new Date().toDateString())return date.toLocaleTimeString(locale(),time);
  return date.toLocaleString(locale(),{...time,year:compact?undefined:'numeric',month:'short',day:'numeric'});
}
const sessionTitle = source => source.title ? (local?source.title:t(source.title)) : t('未命名会话');
const groupOpen = new Map();
let sessionDrawKey = '';
function applyLanguage(){
  document.dispatchEvent(new Event("agentlens-language"));
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
const atTop = () => $('timeline').scrollTop<=12;
function latestPosition(){
  const timeline=$('timeline');
  timeline.scrollTop=importedChat()?timeline.scrollHeight:0;
  display.unseen=0;
  updateJump();
}
function timelineAnchor(){
  const timeline=$('timeline');
  const top=timeline.getBoundingClientRect().top;
  for(const entry of timeline.querySelectorAll('.round > summary, .step')){
    const rect=entry.getBoundingClientRect();
    if(rect.height && rect.bottom>top){
      return {id:entry.id,round:entry.parentElement.dataset.round,offset:rect.top-top};
    }
  }
  return null;
}
function restoreAnchor(anchor){
  if(!anchor)return;
  const timeline=$('timeline');
  const group=[...timeline.querySelectorAll('.round')].find(entry=>entry.dataset.round===anchor.round);
  const entry=(anchor.id && $(anchor.id)) || group?.firstElementChild;
  if(entry)timeline.scrollTop+=entry.getBoundingClientRect().top-timeline.getBoundingClientRect().top-anchor.offset;
}
function updateJump() {
  $('jump').hidden=!display.unseen;
  $('jump').textContent=language==='en' ? number(display.unseen)+' new steps ↑' : '有 '+number(display.unseen)+' 个新步骤 ↑';
}
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
      button.onclick=()=>{if(local){void selectLocal(source.key);return;}stop();Object.assign(display,{active:i,selected:4,file:null,failed:false,unseen:0});render();latestPosition();};
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
  if(step.diagnostic)return {category:'model',title:eventName(step)[language==='en'?1:0]};
  if(step.kind==='事件')return {category:'event',title:eventName(step)[language==='en'?1:0]};
  if(step.kind==='消息')return {category:'message',title:step.title};
  const external=step.network || /^(web__|browser__)/.test(namespace) || /^(web_search|WebSearch|WebFetch)$/.test(tool);
  return {category:'tool',external,title:step.command || step.script || step.path || step.title};
}
const eventLabels={
  model_response:['模型响应已记录','Model response recorded','Codex 的用量记录带有响应 ID。','The Codex usage record contains a response ID.'],
  stream_error:['模型响应流出错','Model stream error','Codex 记录了响应流错误。该轮可能仍会继续。','Codex recorded a response stream error. The turn may continue.'],
  session_error:['会话运行出错','Session error','Codex 报告了一条运行时错误。','Codex reported a runtime error.'],
  task_complete:['任务轮次结束','Turn completed','Codex 记录了轮次结束。','Codex recorded the end of a turn.'],
  turn_aborted:['任务轮次中止','Turn aborted','Codex 记录了轮次中止。','Codex recorded that the turn was aborted.'],
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
const filters=[['activity','执行轨迹'],['tool','工具'],['skill','Skills'],['mcp','MCP'],['request','请求'],['model','模型和轮次'],['event','事件'],['message','消息'],['all','全部记录']];
const isActivity = (step,type) => type!=='event' && (type!=='model' || ['失败','已中止'].includes(step.state));
function renderFilters(steps){
  const bar=$('activity-filter');
  bar.hidden=Boolean(importedChat());
  if(bar.hidden)return;
  const counts={activity:0,all:steps.length};
  for(const step of steps){
    const type=labelStep(step).category;
    counts[type]=(counts[type]??0)+1;
    if(requestEvidence(step))counts.request=(counts.request??0)+1;
    if(isActivity(step,type))counts.activity++;
  }
  const key=JSON.stringify([language,display.category,counts]);
  if(key===bar.dataset.key)return;
  bar.dataset.key=key;
  bar.replaceChildren();
  for(const [category,name] of filters){
    const button=node('button',t(name)+' '+number(counts[category]??0));
    button.setAttribute('aria-pressed',String(display.category===category));
    button.onclick=()=>{display.category=category;display.file=null;render();latestPosition();};
    bar.append(button);
  }
}
function childSession(step){
  if(!local || !step?.child)return null;
  const provider=localSessions.find(parent=>parent.key===localKey)?.provider;
  return localSessions.find(session=>{
    const file=session.key.split('/').at(-1);
    return session.provider===provider && session.key!==localKey &&
      (file===step.child+'.jsonl' || file==='agent-'+step.child+'.jsonl' ||
        (provider==='Codex' && file.endsWith('-'+step.child+'.jsonl')));
  });
}
function renderChildSession(pane,step){
  if(!local || (!step.child && !['spawn_agent','Agent','Task'].includes(step.tool)))return;
  const group=node('details',undefined,'section');
  const content=node('div',undefined,'child-records');
  group.append(node('summary',t('展开子会话')+(step.agentPath?' · '+step.agentPath:'')));
  if(step.child) group.append(node('p',t('子智能体 ID')+' · '+step.child,'tool-name'));
  const child=childSession(step);
  if(!child){
    group.append(node('p',t(step.child?'关联子会话日志尚未找到':'日志未记录可关联的子会话 ID'),'event-description'));
    pane.append(group);
    return;
  }
  const actions=node('div',undefined,'actions');
  const open=node('button',t('打开子会话'));
  open.onclick=()=>void selectLocal(child.key);
  const refresh=node('button',t('刷新子会话'));
  let loaded=false;
  async function load(){
    refresh.disabled=true;
    content.textContent=t('读取中…');
    try {
      const result=await invoke('read_session',{key:child.key});
      content.replaceChildren();
      for(const row of result.steps){
        if(!isActivity(row,labelStep(row).category))continue;
        const title=[stepKind(row),labelStep(row).title,t(row.state),readableTime(row.time,true)].filter(Boolean).join(' · ');
        const body=[row.command,row.args,row.output,row.patch,row.content,row.reason].filter(Boolean).join('\n');
        content.append(section(title,body,row.role==='assistant' || row.state==='失败'));
      }
      loaded=true;
      if(!content.children.length)content.append(node('p',t('没有符合筛选条件的步骤'),'muted'));
    } catch(error) { loaded=false;content.textContent=String(error); }
    finally{refresh.disabled=false;}
  }
  refresh.onclick=()=>void load();
  group.ontoggle=()=>{if(group.open && !loaded && !refresh.disabled)void load();};
  actions.append(open,refresh);
  group.append(actions,content);
  pane.append(group);
}
function details(steps) {
  const pane=$('detail'), step=steps.find(row=>row.id===display.selected);
  pane.replaceChildren(node('small',t('步骤详情')));
  if(!step){pane.append(node('p',t('选择一个工具步骤查看记录。'),'empty'));return;}
  const info=labelStep(step);
  const heading=info.category==='tool' ? step.tool??step.title : info.title;
  pane.append(node('h2',t(heading)),node('p',stepKind(step)+' · '+t(step.state),step.state==='失败'?'fail':'muted'));
  if(info.category==='event'||info.category==='model'){
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
  const identifiers=[['工具调用 ID',step.call],['轮次 ID',step.turnId],['根轮次 ID',step.rootTurnId],
    ['模型响应 ID',step.responseId],['请求 ID',step.requestId],['源日志偏移',step.sourceOffset],['结果日志偏移',step.resultOffset],['耗时',typeof step.durationMs==='number'?number(step.durationMs)+' ms':null]];
  for(const [label,value] of identifiers){
    if(value==null || value==='')continue;
    const row=node('p',undefined,'tool-name');
    row.append(node('span',t(label)+' '),node('code',value));
    pane.append(row);
  }
  if(step.reason)pane.append(section(t('已记录原因'),step.reason,true));
  else if(step.diagnostic && ['失败','已中止'].includes(step.state))pane.append(node('p',t('日志未记录原因'),'muted tool-name'));
  if(step.errorCode)pane.append(section(t('错误代码或类型'),step.errorCode,true));
  const request=requestEvidence(step);
  if(request){
    pane.append(node('h2',t(request.type==='model'?'模型请求与响应记录':'外部请求线索')));
    if(request.type!=='model'){
      pane.append(node('p',t('这是日志记录的操作或入参。网络状态、响应码和请求完成情况以日志证据为准。'),'event-description'));
      if(request.status!=null)pane.append(node('p',t('已记录 HTTP 状态码')+' · '+request.status,'tool-name'));
      if(request.method)pane.append(node('p',t('HTTP 方法')+' · '+request.method,'tool-name'));
      if(request.targets.length)pane.append(section(t('已记录目标'),request.targets.join('\n'),true));
      else pane.append(node('p',t('日志未记录目标'),'muted tool-name'));
    }
  }
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
  renderChildSession(pane,step);
  if(local && !importedChat()){
    const feedback=node('button',t('记录反馈'));
    feedback.onclick=()=>document.dispatchEvent(new CustomEvent('insight-feedback',{detail:{
      source:localKey,turn:step.turnId??'',offset:step.sourceOffset??null
    }}));
    pane.append(feedback);
  }
}
let detailKey='';
function visibleSteps(steps){
  return steps.filter(step=>{
    const category=labelStep(step).category;
    return (importedChat() || display.category==='all' || (display.category==='activity' && isActivity(step,category)) || (display.category==='request' && requestEvidence(step)) || category===display.category);
  }).filter(step=>(!display.failed || ['失败','已中止'].includes(step.state)) && (!display.file || ((step.round??1)===display.file.round && stepPaths(step).includes(display.file.path))));
}
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
  $('diagnostics').hidden=Boolean(importedChat());
  $('diagnostics').disabled=!steps.length;
  for(const id of ['play','next','reset'])$(id).hidden=local;
  $('play').textContent=t(display.timer?'暂停播放':'播放后续日志');
  $('play').disabled=done;$('next').disabled=done;
  $('failed').setAttribute('aria-pressed',String(display.failed));
  $('file').hidden=!display.file;$('file').textContent=(display.file?.path??'')+' ×';
  sessions();
  const container=$('steps');
  renderFilters(steps);
  const visible=visibleSteps(steps);
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
    const groups=[...rounds];
    if(!importedChat())groups.reverse();
    for(const [round, entries] of groups){
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
      for(const step of importedChat()?entries:[...entries].reverse()){
        const e=node('button',undefined,'step');
        e.id='step-'+step.id;
        e.onclick=()=>{display.selected=step.id;render();$(e.id)?.focus({preventScroll:true});};
        const stateClass=({失败:'fail',已中止:'wait',成功:'ok',等待结果:'wait'})[step.state]??'';
        const label=node('span');
        const info=labelStep(step);
        const headline=node('strong',t(info.title??'未知记录'));
        if(info.category==='tool' && (step.command || step.script))headline.className='code-preview';
        const type=info.category==='skill'?'Skills':info.category==='mcp'?'MCP':info.category==='model'?t('模型和轮次'):info.external?t('外部工具'):stepKind(step);
        label.append(headline,node('small',[type,step.child?t('子会话'):null,step.tool && (step.command || step.script)?step.tool:null,readableTime(step.time,true)].filter(Boolean).join(' · ')));
        e.append(node('span',type[0],'icon '+info.category),label,node('span',t(step.state),'state '+stateClass));
        e.setAttribute('aria-pressed',String(step.id===display.selected));
        group.append(e);
      }
      container.append(group);
    }
    if(!visible.length)container.append(node('p',t('没有符合筛选条件的步骤'),'empty'));
  }
  const selected=steps.find(step=>step.id===display.selected);
  const key=JSON.stringify([language,localKey,display.active,selected,childSession(selected)?.key]);
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
  const follow=atTop();
  const anchor=follow?null:timelineAnchor();
  const before=visibleSteps(rows()).length;
  counts[index]++;
  if(!follow)display.unseen+=Math.max(0,visibleSteps(rows()).length-before);
  if(counts[index]===logs[index].length)stop();
  render();if(follow)latestPosition();else restoreAnchor(anchor);
}
$('project').oninput=sessions;$('provider').onchange=sessions;
$('next').onclick=advance;
$('play').onclick=()=>{if(display.timer)stop();else display.timer=setInterval(advance,1100);render();};
$('reset').onclick=()=>{stop();counts[display.active]=initialCount;Object.assign(display,{selected:4,file:null,failed:false,unseen:0});render();latestPosition();};
$('failed').onclick=()=>{display.failed=!display.failed;display.file=null;render();};
$('file').onclick=()=>{display.file=null;render();};
$('jump').onclick=latestPosition;
$('timeline').addEventListener('scroll',()=>{if(!importedChat()&&atTop()&&display.unseen){display.unseen=0;updateJump();}});
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
    latestPosition();
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
$('folder-toggle').onclick=()=>{
  const panel=$('folder-options');
  panel.hidden=!panel.hidden;
  $('folder-toggle').setAttribute('aria-expanded',String(!panel.hidden));
};
async function addFolder(provider) {
  const status=$('folder-status');
  const controls=[$('codex-folder'),$('claude-folder')];
  controls.forEach(control=>{control.disabled=true;});
  status.hidden=false;
  status.textContent=t('请选择日志目录');
  try {
    if(!await invoke('choose_folder',{provider})){
      status.hidden=true;
      return;
    }
    localSessions=await invoke('local_sessions');
    status.textContent=t('已添加日志目录')+' · '+provider;
    if(local)render();
  } catch(error) {
    status.textContent=t('无法添加日志目录')+' · '+String(error);
  } finally {
    controls.forEach(control=>{control.disabled=false;});
  }
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
        const follow=atTop();
        const anchor=follow?null:timelineAnchor();
        const added=Math.max(0,visibleSteps(session.steps).length-visibleSteps(localSteps).length);
        eventCount=session.eventCount;localSteps=session.steps;localUsage=session.usage;localModel=session.model;lastUpdate=new Date();
        if(!follow)display.unseen+=added;
        render();
        if(follow)latestPosition();else restoreAnchor(anchor);
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
