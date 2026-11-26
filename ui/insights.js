(() => {
  const root=$('insights-main');
  const nav=$('insight-nav');
  const layout=root.parentElement;
  const l=(cn,en)=>language==='en'?en:cn;
  const call=(action,input={})=>invoke('agent_insights',{action,input});
  const triggerLabel=key=>({explicit:l('主动调用','User-requested'),implicit:l('被动调用','Agent-triggered'),unknown:l('来源未知','Trigger unknown'),candidate:l('候选证据','Candidate')})[key]??key;
  const proofLabel=key=>({user_request:l('用户明确指定','User requested this skill'),assistant_selection:l('AI 声明使用','Agent declared use'),
    skill_file_read:l('已读取技能文件','Skill file read'),skill_file_reference:l('引用技能文件','Skill file referenced'),
    skill_script_reference:l('引用技能脚本','Skill script referenced'),user_selection:l('用户消息包含技能链接','User message contains skill link'),
    codex_initial_request:l('Codex 首条请求明确指定','Skill requested in first Codex message'),
    selected_instructions:l('运行器注入选定技能','Runtime injected selected skill'),native_skill_success:l('原生 Skill 工具成功','Native Skill tool succeeded'),
    native_skill_failed:l('原生 Skill 工具失败或被拒绝','Native Skill tool failed or was declined'),
    native_skill_attempt:l('已请求原生 Skill 工具','Native Skill tool requested'),
    codex_native_skill:l('Codex 专用 Skill 工具成功','Codex native Skill tool succeeded')})[key]??key;
  const outcomeLabel=key=>({success:l('成功','Succeeded'),failure:l('失败','Failed'),declined:l('拒绝','Declined'),unknown:l('未知','Unknown')})[key]??key;
  const day=86400;
  const date=value=>value==null?'—':readableTime(value*1000);
  const state={page:'sessions',range:'30',project:'',provider:'',confidence:'',bucket:'day',heat:'all',
    dateFrom:'',dateUntil:'',drill:{},data:null,previous:null,activityOffset:0,search:'',
    scope:'',origin:'',usage:'',studioOffset:0,studioOrder:'count',order:'count',advanced:false,
    selection:null,tab:'overview',feedback:[],draft:null};
  let token=0,indexing=false,lastScan=0,status='',indexMeta=null,scanMeta=null;
  let evaluationPanel=null;
  const pastDays=n=>{
    const start=new Date();
    start.setHours(0,0,0,0);
    start.setDate(start.getDate()-n+1);
    return Math.floor(start.getTime()/1000);
  };
  function dateBound(value,next=false){
    if(!value)return null;
    const date=new Date(value+'T00:00:00');
    if(next)date.setDate(date.getDate()+1);
    return date.getTime()/1000;
  }
  function studioScope(){
    const item=state.selection;
    if(!item)return {};
    if(state.page==='skills')return {category:'skill',...(item.path?{server:item.path}:{name:item.name})};
    return {category:'mcp',server:item.name,...(item.tool?{name:item.tool}:{})};
  }
  function query(includeActivity=false){
    const bounds=state.range==='all'?{}:state.range==='custom'?{
      from:dateBound(state.dateFrom),until:dateBound(state.dateUntil,true)
    }:{from:pastDays(Number(state.range)),until:pastDays(0)};
    return {...bounds,project:state.project,provider:state.provider,confidence:state.confidence,
      ...studioScope(),...(state.tab==='errors'?{outcome:'failed'}:{}),
      ...(includeActivity?{...state.drill,offset:state.activityOffset}:{})};
  }

  function button(label, action, pressed) {
    const el=node('button',label);el.type='button';el.onclick=action;
    if(pressed!==undefined)el.setAttribute('aria-pressed',String(pressed));
    return el;
  }
  function select(label, options, value, action){
    const item=node('select');item.setAttribute('aria-label',label);
    for(const option of options){const el=node('option',option[1]);el.value=option[0];item.append(el);}
    item.value=value;item.onchange=()=>action(item.value);
    return item;
  }
  function sectionBox(name,...contents){
    const item=node('section',undefined,'insight-box');
    item.append(node('h2',name),...contents);return item;
  }
  const empty=()=>node('p',l('当前范围内未观察到符合条件的记录。','No matching records were observed in this range.'),'muted');
  const sum=rows=>rows.reduce((total,row)=>total+row.count,0);
  const confirmed=row=>row.category==='skill'&&row.trigger!=='candidate';
  const bySkill=row=>row.server||row.name;
  const filterRow=(row,pick)=>Object.entries(pick).every(([key,value])=>value===row[key]);
  const percent=(value,total)=>total?Math.round(value*100/total)+'%':'—';
  const compact=seconds=>seconds==null?'—':new Date(seconds*1000).toLocaleDateString(locale());
  const skillGroup=()=>state.data.groups.filter(confirmed);

  async function reload(compare=false){
    if(['sessions','feedback','evaluations'].includes(state.page))return;
    const request=++token,filter=query();
    try{
      const hasActivityFilter=state.activityOffset||Object.keys(state.drill).length;
      const [result,activity]=await Promise.all([call('query',filter),
        hasActivityFilter?call('query',{...query(true),activity_only:true}):null]);
      if(request!==token)return;
      state.data=activity?{...result,activity:activity.activity}:result;
      if(compare)state.previous=null;
      render();
      if(compare&&filter.from!=null&&filter.until!=null&&filter.until>filter.from&&state.page==='overview'&&!Object.keys(state.drill).length){
        const result=await call('query',{...filter,from:filter.from-(filter.until-filter.from),until:filter.from,offset:0});
        if(request===token){state.previous=result;render();}
      }
    }catch(error){if(request===token){status=String(error);render();}}
  }
  async function index(scan=false,rebuild=false){
    if(indexing)return;
    indexing=true;status=l('正在读取本机日志…','Indexing local logs…');render();
    try{
      if(rebuild)await call('rebuild');
      let batch=await call('index');
      indexMeta=batch;await reload();
      if(scan){scanMeta=await call('scan');lastScan=Date.now();await reload();}
      while(batch.pending&&!['sessions','feedback','evaluations'].includes(state.page)){
        await new Promise(resolve=>setTimeout(resolve,120));
        batch=await call('index');
        indexMeta=batch;await reload();
      }
      status=batch.pending?l('部分数据已索引','Partial coverage'):l('本机索引已更新','Local index updated');
      await reload(true);
    }catch(error){status=String(error);}
    finally{
      indexing=false;render();
      if(state.page==='skills'&&state.tab==='evaluations')void evaluationPanel?.refresh();
    }
  }
  async function page(page,keepList=false){
    token++;
    evaluationPanel=null;
    state.page=page;state.selection=null;state.tab='overview';state.drill={};state.activityOffset=0;
    if(!keepList){
      state.search='';state.scope='';state.origin='';state.usage='';state.studioOffset=0;state.studioOrder='count';state.advanced=false;
    }
    layout.classList.toggle('insight-layout',page!=='sessions');
    document.body.classList.toggle('insight-workspace',page!=='sessions');
    for(const id of ['session-main','session-detail','session-sidebar'])$(id).hidden=page!=='sessions';
    root.hidden=page==='sessions';
    for(const el of nav.querySelectorAll('button'))el.setAttribute('aria-pressed',String(el.dataset.insight===page));
    if(page==='sessions')return;
    root.scrollTop=0;
    render();
    if(page==='feedback'){await loadFeedback();return;}
    if(page==='evaluations')return;
    await reload(true);
    if(!indexing)void index(!lastScan);
  }

  function setFilter(key,value){
    state[key]=value;state.activityOffset=0;state.studioOffset=0;state.drill={};void reload(true);
  }
  function setDrill(pick){
    state.drill=pick;state.activityOffset=0;void reload().then(()=>$('insight-activity')?.scrollIntoView({block:'nearest'}));
  }
  function openSession(entry){
    void page('sessions').then(async()=>{
      await selectLocal(entry.source);
      const step=localSteps.find(row=>row.sourceOffset===entry.offset && entry.offset!=null) ??
        localSteps.find(row=>row.call===entry.callId && entry.callId) ??
        localSteps.find(row=>row.turnId===entry.turn && entry.turn);
      if(step)showStep(step.id);
    });
  }
  function evidenceLink(row,proof){
    const matching=state.drill.evidence_kind?[state.drill.evidence_kind]:
      row.trigger==='explicit'?['user_selection','user_request','codex_initial_request']:confirmed(row)?['selected_instructions','native_skill_success','codex_native_skill','skill_file_read']:['skill_file_read'];
    const preferred=proof??row.evidence?.find(item=>matching.includes(item.kind))??row.evidence?.[0];
    return {subject:row.category==='skill'?(row.server||row.name):'',source:row.source,turn:row.turn,
      offset:preferred?.byteOffset??null,callId:preferred?.callId??null};
  }

  function activities(title, rows, paging, skillFilters=false){
    const box=sectionBox(title);box.id='insight-activity';
    const drillKeys=Object.keys(state.drill).length;
    if(skillFilters){
      const filters=node('div',undefined,'insight-evidence-filters');
      filters.setAttribute('role','group');
      filters.setAttribute('aria-label',l('筛选活动证据','Filter evidence'));
      const selected=state.drill.evidence_kind?'reads':state.drill.trigger==='candidate'?'candidates':
        state.drill.confirmed_only&&state.drill.category==='skill'&&!state.drill.from&&!state.drill.trigger&&!state.drill.turn_required?'confirmed':
        drillKeys?'':'all';
      for(const [key,label,pick] of [
        ['all',l('全部活动','All activity'),{}],
        ['confirmed',l('调用记录','Invocations'),{category:'skill',confirmed_only:true}],
        ['reads',l('文件读取','File reads'),{category:'skill',evidence_kind:'skill_file_read'}],
        ['candidates',l('候选线索','Candidates'),{category:'skill',trigger:'candidate'}]
      ])filters.append(button(label,()=>setDrill(pick),selected===key));
      if(drillKeys&&!selected)filters.append(button(l('清除筛选','Clear filter'),()=>setDrill({})));
      box.append(filters);
    }else if(drillKeys)box.append(button(l('清除筛选','Clear filter'),()=>setDrill({})));
    if(!rows.length){box.append(empty());return box;}
    const table=node('table',undefined,'insight-table');
    const header=node('tr');
    for(const label of [l('能力','Capability'),l('证据','Evidence'),l('项目与时间','Project & time'),l('操作','Actions')])header.append(node('th',label));
    const head=node('thead');head.append(header);table.append(head);
    const body=node('tbody');
    for(const row of rows){
      const tr=node('tr');
      const caption=row.category==='mcp'?row.server+' / '+row.name:row.name;
      const details=node('details',undefined,'insight-evidence');
      const proofs=row.evidence??[];
      const reads=proofs.filter(item=>item.kind==='skill_file_read').length;
      const category=row.category==='mcp'?outcomeLabel(row.outcome):confirmed(row)?triggerLabel(row.trigger):
        reads?l('文件读取','File read'):l('候选线索','Candidate evidence');
      const pill=node('span',category,'insight-evidence-tag');
      pill.dataset.kind=row.category==='mcp'?row.outcome:confirmed(row)?'activation':reads?'read':'candidate';
      const summary=node('summary');
      summary.append(pill);
      if(row.category==='skill'&&reads&&(confirmed(row)||reads>1))summary.append(node('small',number(reads)+' '+l('条读取','reads')));
      details.append(summary);
      if(row.category==='skill'){
        if(confirmed(row)&&!row.turn)details.append(node('small',l('缺少轮次 ID','Turn ID unavailable')));
        const list=node('ul',undefined,'insight-proof-list');
        for(const item of proofs){
          const line=node('li');
          const offset=[item.byteOffset,item.resultOffset].filter(value=>value!=null).map(value=>'@'+value).join(' → ');
          line.append(node('span',proofLabel(item.kind)));
          if(offset)line.append(node('small',offset));
          if(item.kind==='skill_file_read')line.append(button(l('定位读取','Open read step'),()=>openSession(evidenceLink(row,item))));
          list.append(line);
        }
        details.append(list);
      }else{
        const proof=proofs.map(item=>[proofLabel(item.kind),item.byteOffset!=null?'@'+item.byteOffset:null,
          item.resultOffset!=null?'→ @'+item.resultOffset:null,item.callId].filter(Boolean).join(' ')).join('\n');
        details.append(node('pre',proof));
      }
      if(row.category==='mcp'){
        const summary=row.evidence?.[0];
        const metadata=[['arguments',l('参数结构','Argument shape')],['result',l('结果结构','Result shape')]];
        for(const [key,label] of metadata){
          const info=summary?.[key];
          if(info)details.append(node('p',label+' · '+info.shape.kind+' · '+info.bytes+' B · '+l('内容已隐藏','Payload hidden')));
        }
        if(row.duration!=null)details.append(node('small',number(row.duration)+' ms'));
      }
      if(row.category==='skill')details.append(node('small',l('历史版本未知','Unknown version')));
      const actions=node('div',undefined,'insight-actions');
      actions.append(button(l('打开会话','Open session'),()=>openSession(evidenceLink(row))),button(l('反馈','Feedback'),()=>openFeedback(evidenceLink(row))));
      const cells=[node('td'),node('td'),node('td'),node('td')];
      cells[0].append(node('strong',caption),node('small',row.provider));
      if(row.category==='skill'&&row.server){const path=node('small',row.server,'insight-evidence-path');path.title=row.server;cells[0].append(path);}
      cells[1].append(details);cells[2].append(node('span',date(row.time)),node('small',row.project||'—'));
      cells[3].append(actions);tr.append(...cells);body.append(tr);
    }
    table.append(body);const wrap=node('div',undefined,'insight-table-wrap');wrap.append(table);box.append(wrap);
    if(paging){
      const actions=node('div',undefined,'insight-actions');
      if(state.activityOffset)actions.append(button(l('上一页','Previous'),()=>{state.activityOffset-=50;void reload();}));
      if(rows.length===50)actions.append(button(l('下一页','Next'),()=>{state.activityOffset+=50;void reload();}));
      box.append(actions);
    }
    return box;
  }
  function groups(rows, identity){
    const matched=new Map();
    for(const row of rows){
      const key=identity(row);
      if(!matched.has(key))matched.set(key,{key,name:row.name,server:row.server,rows:[],count:0,last:0,duration:0,timed:0,success:0,failure:0,unknown:0});
      const item=matched.get(key);
      item.rows.push(row);item.count+=row.count;item.last=Math.max(item.last,row.latest??0);
      item.duration+=row.durationSum??0;item.timed+=row.durationCount??0;
      if(row.outcome==='success')item.success+=row.count;
      if(['failure','declined'].includes(row.outcome))item.failure+=row.count;
      if(row.outcome==='unknown')item.unknown+=row.count;
    }
    return [...matched.values()];
  }
  function sorted(items,order=state.order){
    const metric={
      count:item=>item.count,latest:item=>item.last,fail:item=>item.failure,
      duration:item=>item.timed?item.duration/item.timed:-1,
      explicit:item=>sum(item.rows.filter(row=>row.trigger==='explicit')),
      implicit:item=>sum(item.rows.filter(row=>row.trigger==='implicit')),
      sessions:item=>state.data.reach.find(row=>row[1]===item.name&&row[2]===item.server)?.[3]??0,
    }[order]??(item=>item.count);
    return items.sort((a,b)=>metric(b)-metric(a)||b.count-a.count||a.key.localeCompare(b.key));
  }
  function stack(values,max){
    const range=node('span',undefined,'insight-bar');
    for(const [kind,count] of values){
      if(!count)continue;
      const span=node('span',undefined,kind);span.style.width=Math.min(100,count/Math.max(max,1)*100)+'%';range.append(span);
    }
    return range;
  }
  function rating(title,items,type,open){
    const box=sectionBox(title);
    if(!items.length){box.append(empty());return box;}
    const max=items.reduce((high,item)=>Math.max(high,item.count),0),total=items.reduce((value,item)=>value+item.count,0);
    for(const item of items.slice(0,10)){
      const values=type==='skill'?['explicit','implicit','unknown'].map(trigger=>[trigger,sum(item.rows.filter(row=>row.trigger===trigger))]):
        [['success',item.success],['failure',item.failure],['unknown',item.unknown]];
      const text=type==='server'?item.key:type==='tool'?item.server+' / '+item.name:item.name;
      const line=button(text+' · '+number(item.count),()=>open(item));
      line.className='insight-rate';
      const reach=state.data.reach.find(row=>row[0]==='skill'&&row[1]===item.name&&row[2]===item.server);
      const extra=type==='skill'&&reach?[reach[3]+' '+l('会话','sessions'),reach[4]+' '+l('项目','projects')]:
        type==='server'?[new Set(item.rows.map(row=>row.name)).size+' tools']:[];
      if(item.timed)extra.push(number(Math.round(item.duration/item.timed))+' ms avg');
      line.append(stack(values,max),node('small',[percent(item.count,total),...values.map(([kind,n])=>(type==='skill'?triggerLabel(kind):outcomeLabel(kind))+' '+n),
        ...extra,item.last?date(item.last):''].filter(Boolean).join(' · ')));
      box.append(line);
    }
    return box;
  }

  const bucketFor=(dayNumber,size)=>{
    if(size==='day')return dayNumber;
    const date=new Date(dayNumber*day*1000);
    if(size==='week')return dayNumber-(date.getUTCDay()+6)%7;
    return Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1)/1000/day;
  };
  function trend(title,category,rows=state.data.days,drillPick={}){
    const box=sectionBox(title);
    const buckets=new Map();
    for(const [d,cat,trigger,outcome,,count] of rows){
      if(cat!==category||trigger==='candidate')continue;
      const key=bucketFor(d,state.bucket);
      const group=buckets.get(key)??{};
      const type=category==='skill'?trigger:outcome==='declined'?'failure':outcome;
      group[type]=(group[type]??0)+count;buckets.set(key,group);
    }
    if(!buckets.size){box.append(empty());return box;}
    const max=[...buckets.values()].reduce((current,row)=>Math.max(current,Object.values(row).reduce((a,b)=>a+b,0)),1);
    const plot=node('div',undefined,'insight-trend');
    const keys=category==='skill'?['explicit','implicit','unknown']:['success','failure','unknown'];
    const legend=node('div',undefined,'insight-chart-legend');
    const hidden=new Set();
    const labelFor=key=>category==='skill'?triggerLabel(key):outcomeLabel(key);
    function draw(){
      plot.replaceChildren();
      for(const [bucket,values] of [...buckets].sort((a,b)=>a[0]-b[0])){
        const counts=keys.filter(k=>!hidden.has(k)).map(k=>[k,values[k]??0]);
        const total=counts.reduce((n,[,count])=>n+count,0);
        const dayDate=new Date(bucket*day*1000);
        const label=dayDate.toISOString().slice(0,10);
        const dateLabel=new Intl.DateTimeFormat(locale(),{timeZone:'UTC',month:'numeric',...(state.bucket==='month'?{year:'2-digit'}:{day:'numeric'})}).format(dayDate);
        const from=bucket*day;
        const until=state.bucket==='month'?Date.UTC(dayDate.getUTCFullYear(),dayDate.getUTCMonth()+1,1)/1000:from+day*(state.bucket==='week'?7:1);
        const narrowed=query();
        const entry=button('',()=>setDrill({...drillPick,category,confirmed_only:true,from:Math.max(from,narrowed.from??from),until:Math.min(until,narrowed.until??until)}));
        entry.title=label+' · '+counts.map(([key,count])=>labelFor(key)+' '+number(count)).join(' · ');
        entry.setAttribute('aria-label',entry.title);
        const column=node('span',undefined,'insight-chart-column');
        const bars=node('span',undefined,'insight-chart-bars');
        bars.style.height=(total/max*100)+'%';
        bars.style.minHeight=total?'3px':'0';
        for(const [kind,count] of counts){
          if(!count)continue;
          const segment=node('span',undefined,'insight-chart-segment '+kind);
          segment.style.flexGrow=String(count);bars.append(segment);
        }
        column.append(bars);
        entry.append(column,node('small',dateLabel));plot.append(entry);
      }
    }
    for(const key of keys){
      const item=button(labelFor(key),()=>{
        if(hidden.has(key))hidden.delete(key);else hidden.add(key);
        item.setAttribute('aria-pressed',String(!hidden.has(key)));draw();
      },true);
      item.prepend(node('span',undefined,'insight-series-dot '+key));legend.append(item);
    }
    draw();box.append(legend,plot,node('small',l('日期按 UTC 聚合','Buckets use UTC')));return box;
  }
  function distribution(rows){
    const keys=['explicit','implicit','unknown'];
    const counts=keys.map(key=>sum(rows.filter(row=>row.trigger===key)));
    const total=counts.reduce((a,b)=>a+b,0);
    const box=sectionBox(l('调用来源','Invocation sources'));
    box.append(stack(keys.map((key,i)=>[key,counts[i]]),total));
    const legend=node('div',undefined,'insight-breakdown');
    keys.forEach((key,i)=>{
      const row=button('',()=>setDrill({category:'skill',trigger:key,confirmed_only:true}));
      const label=node('span',triggerLabel(key));label.prepend(node('span',undefined,'insight-series-dot '+key));
      row.append(label,node('strong',number(counts[i])),node('small',percent(counts[i],total)));
      legend.append(row);
    });
    box.append(legend);return box;
  }
  function heatmap(){
    const box=sectionBox(l('每日活跃度','Activity heatmap'));
    box.append(select(l('活动类型','Activity type'),[['all',l('全部','All')],['skill','Skills'],['explicit',l('主动','Explicit')],['implicit',l('被动','Implicit')],['mcp','MCP']],state.heat,value=>{state.heat=value;render();}));
    const bins=new Map();
    for(const [d,category,trigger,,,count] of state.data.days){
      if(trigger==='candidate'||(state.heat!=='all'&&state.heat!==category&&state.heat!==trigger))continue;
      bins.set(d,(bins.get(d)??0)+count);
    }
    if(!bins.size){box.append(empty());return box;}
    const grid=node('div',undefined,'insight-heatmap');
    const until=Math.floor((query().until??Date.now()/1000)/day);
    const from=Math.max(Math.floor((query().from??(until-90)*day)/day),until-364);
    const max=[...bins.values()].reduce((a,b)=>Math.max(a,b),1);
    for(let d=from;d<=until;d++){
      const count=bins.get(d)??0;
      const pick=state.heat==='all'?{}:['skill','mcp'].includes(state.heat)?{category:state.heat}:{trigger:state.heat};
      const item=button('',()=>setDrill({...pick,confirmed_only:true,from:d*day,until:(d+1)*day}));
      item.style.setProperty('--intensity',String(count/max));
      item.title=new Date(d*day*1000).toISOString().slice(0,10)+' · '+count;
      item.setAttribute('aria-label',item.title);grid.append(item);
    }
    box.append(grid);return box;
  }

  function dataToolbar(){
    const bar=node('div',undefined,'insight-actions insight-data-toolbar');
    bar.append(select(l('时间范围','Date range'),[['1',l('今天','Today')],['7',l('近 7 天','Last 7 days')],['30',l('近 30 天','Last 30 days')],
      ['90',l('近 90 天','Last 90 days')],['all',l('全部时间','All time')],['custom',l('自定义','Custom')]],state.range,value=>setFilter('range',value)));
    if(state.range==='custom')for(const [key,label] of [['dateFrom',l('开始','From')],['dateUntil',l('结束','To')]]){
      const input=node('input');input.type='date';input.value=state[key];input.setAttribute('aria-label',label);
      input.onchange=()=>setFilter(key,input.value);bar.append(input);
    }
    const studioList=['skills','mcp'].includes(state.page)&&!state.selection;
    bar.append(select(l('项目','Project'),[['',l('所有项目','All projects')],...(state.data?.projects??[]).map(path=>[path,path])],state.project,value=>setFilter('project',value)));
    const extra=node('div',undefined,'insight-actions');
    extra.append(select('Agent',[['',l('所有来源','All sources')],['Codex','Codex'],['Claude Code','Claude Code']],state.provider,value=>setFilter('provider',value)),
      select(l('可信等级','Confidence'),[['',l('所有证据','All evidence')],['high','High'],['low','Low']],state.confidence,value=>setFilter('confidence',value)),
      select(l('聚合','Bucket'),[['day',l('天','Day')],['week',l('周','Week')],['month',l('月','Month')]],state.bucket,value=>{state.bucket=value;render();}));
    if(studioList){
      extra.lastElementChild.remove();
      const more=node('details',undefined,'studio-disclosure');more.open=state.advanced;
      more.ontoggle=()=>{if(more.isConnected)state.advanced=more.open;};
      more.append(node('summary',l('来源与证据','Source & evidence')),extra);bar.append(more);
    }else bar.append(...extra.children);
    if(state.page==='overview')bar.append(select(l('排行排序','Ranking order'),[
      ['count',l('调用次数','Calls')],['latest',l('最近使用','Latest')],['explicit','Explicit'],['implicit','Implicit'],
      ['sessions',l('覆盖会话','Sessions')],['fail',l('失败次数','Failures')],['duration',l('耗时','Duration')]
    ],state.order,value=>{state.order=value;render();}));
    return bar;
  }
  function metrics(){
    const skills=skillGroup(), mcp=state.data.groups.filter(row=>row.category==='mcp');
    const success=sum(mcp.filter(row=>row.outcome==='success'));
    const failed=sum(mcp.filter(row=>['failure','declined'].includes(row.outcome)));
    const prior=state.previous?.groups??[];
    const reads=rows=>rows.reduce((count,row)=>count+(row.fileReads??0),0);
    const turns=rows=>rows.reduce((count,row)=>count+(row.withTurn??0),0);
    const turnCount=turns(skills),withoutTurn=sum(skills)-turnCount;
    const values=[
      ['activation',l('Skill 调用轮次','Skill invocation turns'),turnCount,turns(prior.filter(confirmed)),
        ()=>setDrill({category:'skill',confirmed_only:true,turn_required:true}),
        withoutTurn?l('另有 ','Plus ')+number(withoutTurn)+l(' 条调用缺少轮次 ID',' invocations without a turn ID'):
          turnCount?l('同轮同一 Skill 合并','Same skill merged within each turn'):l('当前范围内证据不足','Insufficient evidence in this range')],
      ['read',l('Skill 文件读取','Skill file reads'),reads(state.data.groups),reads(prior),
        ()=>setDrill({category:'skill',evidence_kind:'skill_file_read'}),l('可定位到原始读取步骤','Open the original read steps')],
      ['skill',l('已调用 Skills','Skills invoked'),new Set(skills.map(bySkill)).size,0,
        ()=>page('skills'),l('按技能身份去重','Distinct skill identities')],
      ['mcp',l('MCP 工具调用','MCP tool calls'),sum(mcp),sum(prior.filter(row=>row.category==='mcp')),
        ()=>setDrill({category:'mcp'}),success+failed?l('已知结果成功率','Known-outcome success rate')+' '+percent(success,success+failed):l('结果证据不足','Insufficient outcome evidence')],
    ];
    const cards=node('div',undefined,'insight-metrics');
    for(const [kind,label,count,before,action,context] of values){
      const card=action?button('',action):node('div');
      card.className='insight-metric';card.dataset.kind=kind;
      card.append(node('span',label),node('strong',typeof count==='number'?number(count):count));
      if(context)card.append(node('small',context));
      if(state.previous&&before>0&&typeof count==='number'){
        const change=Math.round((count-before)/before*100);
        card.append(node('small',l('较上一同期','vs prior period')+' '+(change>0?'+':'')+change+'%'));
      }
      cards.append(card);
    }
    return cards;
  }
  let mcpSeries='';
  function overview(){
    const data=state.data,skills=skillGroup(),mcp=data.groups.filter(row=>row.category==='mcp');
    const installed=data.skills.filter(skill=>skill.present), seen=new Set(skills.map(bySkill));
    const observed=installed.filter(skill=>seen.has(skill.path));
    const adoption=sectionBox(l('技能采用情况','Skill adoption'),
      node('p',observed.length+' / '+installed.length+' '+l('项已安装技能有调用记录。','installed skills have invocation records.')),
      node('p',(installed.length-observed.length)+' '+l('项暂无调用证据。','installed skills lack invocation evidence in this range.')),
      button(l('打开 Skills Studio','Open Skills Studio'),()=>page('skills')));
    const observedChanges=installed.slice().sort((a,b)=>b.lastChanged-a.lastChanged).slice(0,5);
    if(observedChanges.length)adoption.append(node('h3',l('最近观察到版本','Latest observed versions')));
    for(const skill of observedChanges)adoption.append(button(skill.name+' · '+compact(skill.lastChanged),
      ()=>openStudio('skills',{...skill,server:skill.path})));
    const coverage=sectionBox(l('数据覆盖','Data coverage'),
      node('p',data.coverage.sessions+' '+l('已索引会话','indexed sessions')+' · '+compact(data.coverage.first)+' – '+compact(data.coverage.last)),
      node('p',l('最近索引','Last index')+' '+date(data.coverage.lastIndex)),
      node('p',l('解析异常','Parse errors')+' '+data.coverage.parseErrors+' · '+l('失败会话','Failed sources')+' '+data.coverage.failed),
      node('p',l('候选证据','Candidates')+' '+sum(data.groups.filter(row=>row.trigger==='candidate'))+' · '+l('历史版本未知','Unknown historical versions')+' '+sum(skills)),
      node('p',l('MCP 未知结果','Unknown MCP outcomes')+' '+sum(mcp.filter(row=>row.outcome==='unknown'))));
    const mcpServers=[...new Set(mcp.map(row=>row.server))];
    const activeMcp=mcpServers.includes(mcpSeries)?mcpSeries:'';
    const series=trend(l('MCP 调用趋势','MCP usage trend'),'mcp',activeMcp?data.days.filter(row=>row[4]===activeMcp):data.days,
      activeMcp?{server:activeMcp}:{});
    if(mcpServers.length>1)series.insertBefore(select(l('MCP 服务','MCP server'),[['',l('全部服务','All servers')],
      ...mcpServers.map(name=>[name,name])],activeMcp,value=>{mcpSeries=value;render();}),series.children[1]??null);
    const primary=node('div',undefined,'insight-grid insight-overview-primary');
    primary.append(trend(l('Skill 调用趋势','Skill invocation trend'),'skill'),distribution(skills));
    const grid=node('div',undefined,'insight-grid insight-overview-secondary');
    grid.append(rating(l('常用 Skills','Top skills'),sorted(groups(skills,bySkill)),'skill',item=>openStudio('skills',item)),
      rating(l('常用 MCP 服务','Top MCP servers'),sorted(groups(mcp,row=>row.server)),'server',item=>openStudio('mcp',item)),
      series,
      rating(l('常用 MCP 工具','Top MCP tools'),sorted(groups(activeMcp?mcp.filter(row=>row.server===activeMcp):mcp,
        row=>row.server+' / '+row.name)),'tool',item=>openStudio('mcp',item)),
      heatmap(),adoption,coverage);
    const recent=activities(l('活动明细','Activity evidence'),data.activity,true,true);
    if(data.lifecycle?.length){
      const changes=sectionBox(l('版本观察与反馈','Version observations & feedback'));
      for(const entry of data.lifecycle){
        const version=entry.kind==='version';
        changes.append(button([version?l('观察到版本','Version observed'):l('反馈已记录','Feedback recorded'),
          version?entry.name:entry.path,version?entry.version.slice(0,10):null,compact(entry.time)].filter(Boolean).join(' · '),
          ()=>{if(version)void openStudio('skills',{name:entry.name,server:entry.path});else void page('feedback');}));
      }
      grid.append(changes);
    }
    root.append(metrics(),primary,recent,grid);
  }

  async function openStudio(pageName,item){
    if(state.page!==pageName)await page(pageName);
    if(!state.data)return;
    const chosen=pageName==='skills'?state.data.skills.find(skill=>skill.path===item.server):
      state.data.servers.find(server=>server.name===item.server);
    state.selection=pageName==='skills'?{...chosen,path:item.server||undefined,name:item.name}:{...chosen,name:item.server,tool:item.key===item.server?null:item.name};
    state.tab='overview';
    state.activityOffset=0;state.drill={};
    root.scrollTop=0;
    await reload();
  }
  const studioPageSize=15;
  const scopeLabel=scope=>({
    project:l('项目','Project'),user:l('用户','User'),plugin:l('插件缓存','Plugin cache'),
    admin:l('管理员','Admin'),system:l('系统','System'),historical:l('历史','Historical')
  })[scope]??scope;
  function studioItems(skill){
    const data=state.data;
    if(skill){
      const items=new Map(data.skills.map(entry=>[entry.path,{...entry,key:entry.path,server:entry.path,count:0,candidates:0,reads:0,last:0,rows:[]}]));
      for(const record of groups(data.groups.filter(row=>row.category==='skill'),bySkill)){
        const entry=items.get(record.key)??{path:record.key,present:false,scope:'historical'};
        const candidates=sum(record.rows.filter(row=>row.trigger==='candidate'));
        const calls=record.rows.filter(confirmed);
        const reads=record.rows.reduce((total,row)=>total+(row.fileReads??0),0);
        items.set(record.key,{...entry,...record,count:sum(calls),candidates,reads,
          last:calls.reduce((latest,row)=>Math.max(latest,row.latest??0),0)});
      }
      return [...items.values()];
    }
    const items=new Map(groups(data.groups.filter(row=>row.category==='mcp'),row=>row.server)
      .map(entry=>[entry.key,{...entry,name:entry.key,configs:[]}]));
    for(const cfg of data.servers){
      if(!items.has(cfg.name))items.set(cfg.name,{key:cfg.name,server:cfg.name,name:cfg.name,configs:[],count:0,rows:[],last:0,failure:0});
      items.get(cfg.name).configs.push(cfg);
    }
    return [...items.values()];
  }
  function studioFilter(key,value){
    state[key]=value;state.studioOffset=0;drawStudioList();
  }
  function studioSummary(items,skill){
    const box=node('div',undefined,'studio-summary');
    const active=items.filter(item=>item.count>0);
    const initial=skill?items.filter(item=>item.present):items.filter(item=>item.configs.length);
    if(skill) box.classList.add('studio-skill-summary');
    const values=[
      [skill?l('已发现技能','Discovered skills'):l('已配置服务','Configured servers'),initial.length,'configured'],
      [skill?l('有调用记录','With invocations'):l('当前范围内有调用','Used in this range'),active.length,'used'],
      ...(skill?[
        [l('有文件读取','With file reads'),items.filter(item=>item.reads>0).length,'reads'],
        [l('有候选线索','With candidate evidence'),items.filter(item=>item.candidates>0).length,'candidate']
      ]:[
        [l('有失败或拒绝的服务','Servers with failures or declines'),items.filter(item=>item.failure>0).length,'failed']
      ])
    ];
    for(const [label,count,key] of values){
      const card=button('',()=>studioFilter('usage',state.usage===key?'':key),state.usage===key);
      card.className='studio-stat';card.dataset.summaryFilter=key;
      card.append(node('span',label),node('strong',number(count)));box.append(card);
    }
    return box;
  }
  function studioToolbar(skill){
    const bar=node('div',undefined,'insight-actions studio-toolbar');
    const input=node('input');input.type='search';input.value=state.search;
    input.placeholder=skill?l('搜索技能、描述或路径','Search skills, descriptions or paths'):l('搜索服务或工具名称','Search server or tool names');
    input.setAttribute('aria-label',input.placeholder);
    input.oninput=()=>studioFilter('search',input.value);
    bar.append(input,select(l('排序','Sort'),[
      ['count',l('按调用次数排序','Sort by calls')],['latest',l('按最近使用排序','Sort by last used')],
      ...(skill?[['version',l('按版本更新时间排序','Sort by version changed')]]:[['fail',l('按失败次数排序','Sort by failures')],['duration',l('按平均耗时排序','Sort by average duration')]])
    ],state.studioOrder,value=>studioFilter('studioOrder',value)));
    if(skill){
      bar.classList.add('studio-skill-toolbar');
      const origins=[...new Set(state.data.skills.map(entry=>entry.origin).filter(Boolean))].sort();
      const activity=select(l('活动状态','Activity status'),[['',l('所有活动状态','All activity statuses')],
        ['configured',l('已发现技能','Discovered skills')],['used',l('有调用记录','With invocations')],
        ['reads',l('有文件读取','With file reads')],['candidate',l('有候选线索','With candidate evidence')],
        ['unused',l('暂无调用或线索','No invocation or evidence')]],state.usage,value=>studioFilter('usage',value));
      activity.dataset.studioUsage='';
      bar.append(activity,select(l('作用域','Scope'),[['',l('所有作用域','All scopes')],...['project','user','plugin','admin','system','historical'].map(scope=>[scope,scopeLabel(scope)])],state.scope,
        value=>studioFilter('scope',value)),
        select(l('来源目录','Source directory'),[['',l('所有目录','All directories')],...origins.map(path=>[path,path])],state.origin,
          value=>studioFilter('origin',value)));
    }
    return bar;
  }
  function drawStudioList(){
    const mount=$('insight-studio-list');
    if(!mount)return;
    mount.replaceChildren();
    const isSkill=state.page==='skills';
    const query=state.search.toLowerCase().trim();
    for(const el of root.querySelectorAll('[data-summary-filter]'))el.setAttribute('aria-pressed',String(el.dataset.summaryFilter===state.usage));
    const activity=root.querySelector('[data-studio-usage]');
    if(activity)activity.value=state.usage;
    const rows=studioItems(isSkill).filter(item=>{
      if(state.usage==='configured'&&!(isSkill?item.present:item.configs.length))return false;
      if(state.usage==='used'&&!item.count)return false;
      if(state.usage==='reads'&&!item.reads)return false;
      if(state.usage==='candidate'&&!item.candidates)return false;
      if(state.usage==='unused'&&(!item.present||item.count||item.candidates))return false;
      if(state.usage==='failed'&&!item.failure)return false;
      if(isSkill&&((state.scope&&state.scope!==item.scope)||(state.origin&&state.origin!==item.origin)))return false;
      const labels=isSkill?[item.name,item.path,item.description]:[item.name,...item.rows.map(row=>row.name)];
      return labels.join(' ').toLowerCase().includes(query);
    });
    if(state.studioOrder==='version')rows.sort((a,b)=>(b.lastChanged??0)-(a.lastChanged??0)||a.name.localeCompare(b.name));
    else sorted(rows,state.studioOrder);
    const offset=Math.min(state.studioOffset,Math.max(0,Math.ceil(rows.length/studioPageSize)-1)*studioPageSize);
    state.studioOffset=offset;
    const heading=node('div',undefined,'studio-list-heading');
    heading.append(node('h2',isSkill?l('技能目录','Skill directory'):l('服务目录','Server directory')),
      node('small',number(rows.length)+' '+l('项结果','results')));
    mount.append(heading);
    if(!rows.length){
      mount.append(node('p',query?l('没有匹配搜索的结果。','No results match your search.'):
        l('当前筛选范围没有记录。','There are no records for these filters.'),'studio-empty muted'));
      return;
    }
    const columns=isSkill?
      [l('技能','Skill'),l('作用域','Scope'),l('调用','Invocations'),l('文件读取','File reads'),l('最近调用','Last invocation')]:
      [l('服务','Server'),l('配置状态','Status'),l('调用 / 失败与拒绝','Calls / failures'),l('最近使用','Last used')];
    const table=node('table',undefined,isSkill?'studio-table studio-skill-table':'studio-table');
    const head=node('tr');
    for(const label of columns){const cell=node('th',label);cell.scope='col';head.append(cell);}
    const thead=node('thead');thead.append(head);table.append(thead);
    const body=node('tbody');
    for(const item of rows.slice(offset,offset+studioPageSize)){
      const row=node('tr');
      const title=node('td',undefined,'studio-identity');
      const link=button(item.name,()=>openStudio(state.page,item));link.className='studio-link';
      title.append(link);
      const caption=isSkill?item.description||item.path:item.rows.length?new Set(item.rows.map(entry=>entry.name)).size+' '+l('种已观察工具','observed tools'):null;
      if(caption){const note=node('small',caption);note.title=caption;title.append(note);}
      const source=node('td');
      if(isSkill){
        source.append(node('span',scopeLabel(item.scope),'studio-tag'));
        if(!item.present&&item.scope!=='historical')source.append(node('small',l('仅有历史快照','Historical snapshots')));
      }else{
        const enabled=item.configs.filter(cfg=>cfg.enabled).length;
        const status=!item.configs.length?l('仅历史','Historical'):enabled===item.configs.length?l('已启用','Enabled'):enabled?l('部分启用','Partly enabled'):l('已禁用','Disabled');
        source.append(node('span',status,'studio-tag'));
        const transports=[...new Set(item.configs.map(cfg=>cfg.transport).filter(Boolean))];
        if(transports.length)source.append(node('small',transports.join(' · ')));
      }
      const calls=node('td',undefined,'studio-calls');
      if(isSkill){
        const tally=node('div',undefined,'studio-tally');
        tally.append(node('strong',number(item.count)));
        if(item.candidates)tally.append(node('small',number(item.candidates)+' '+l('条线索','candidates')));
        calls.append(tally);
        const flags=node('div',undefined,'studio-trigger-counts');
        for(const key of ['explicit','implicit','unknown']){
          const count=sum(item.rows.filter(entry=>entry.trigger===key));
          if(key==='unknown'&&!count)continue;
          const label=key==='explicit'?l('主动','User'):key==='implicit'?l('被动','Agent'):l('未知','Unknown');
          const flag=node('span',label+' '+number(count));flag.dataset.kind=key;
          flags.append(flag);
        }
        calls.append(flags);
        const reads=node('td',number(item.reads),'studio-read-count'+(item.reads?' has-reads':''));
        reads.dataset.label=l('读取','Reads');
        const latest=node('td',item.last?compact(item.last):'—','studio-date');
        if(item.last){latest.title=date(item.last);latest.append(node('small',new Date(item.last*1000).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'})));}
        row.append(title,source,calls,reads,latest);
      }else{
        calls.append(node('strong',number(item.count)));
        if(item.failure)calls.append(node('small',number(item.failure)+' '+l('失败或拒绝','failed or declined'),'studio-failed'));
        row.append(title,source,calls,node('td',date(item.last||null),'studio-date'));
      }
      body.append(row);
    }
    table.append(body);
    const wrap=node('div',undefined,'studio-table-wrap');wrap.append(table);mount.append(wrap);
    if(rows.length>studioPageSize){
      const footer=node('div',undefined,'studio-pagination');
      function turnPage(next){
        state.studioOffset=next;drawStudioList();
        const target=mount.querySelector(next>offset?'[data-next]':'[data-prev]');
        if(target&&!target.disabled)target.focus();else mount.querySelector('.studio-link')?.focus();
      }
      const prev=button(l('上一页','Previous'),()=>turnPage(offset-studioPageSize));
      const next=button(l('下一页','Next'),()=>turnPage(offset+studioPageSize));
      prev.disabled=offset===0;next.disabled=offset+studioPageSize>=rows.length;
      prev.dataset.prev='';next.dataset.next='';
      footer.append(node('small',(offset+1)+'–'+Math.min(offset+studioPageSize,rows.length)+' / '+number(rows.length)),prev,next);
      mount.append(footer);
    }
  }

  function safeMarkdown(text){
    const preview=node('div',undefined,'insight-markdown');
    const frontmatter=/^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
    if(frontmatter){preview.append(section('YAML Frontmatter',frontmatter[1]));text=text.slice(frontmatter[0].length);}
    let fence=null,buffer=[];
    for(const line of text.split('\n')){
      if(line.startsWith('```')){
        if(fence!==null){preview.append(node('pre',buffer.join('\n')));buffer=[];fence=null;}else fence=line;
        continue;
      }
      if(fence!==null){buffer.push(line);continue;}
      const heading=/^(#{1,6}) (.*)$/.exec(line);
      if(heading)preview.append(node('h'+Math.max(3,heading[1].length),heading[2]));
      else if(line.trim())preview.append(node('p',line.replace(/^[-*] /,'• ')));
    }
    if(buffer.length)preview.append(node('pre',buffer.join('\n')));
    return preview;
  }
  function diffLine(oldText,currentText){
    const old=oldText.split('\n'),current=currentText.split('\n');
    let start=0,end=0;
    while(start<old.length&&start<current.length&&old[start]===current[start])start++;
    while(end<old.length-start&&end<current.length-start&&old[old.length-1-end]===current[current.length-1-end])end++;
    return [l('起始行','Starting line')+' '+(start+1),...old.slice(start,old.length-end).map(line=>'- '+line),
      ...current.slice(start,current.length-end).map(line=>'+ '+line)].join('\n');
  }
  async function showVersions(box,skill,history){
    box.append(node('p',l('读取快照…','Loading snapshots…'),'muted'));
    try{
      const entries=await call('versions',{path:skill.path});
      box.replaceChildren();
      if(!entries.length){box.append(empty());return;}
      for(const [index,version] of (history?entries:[entries.find(item=>item.hash===skill.version)??entries[0]]).entries()){
        const group=node('details');
        group.open=!history||index===0;
        group.append(node('summary',version.hash.slice(0,12)+' · '+date(version.firstSeen)),
          node('small',l('首次观察时间','First observed')+(version.partial?' · '+l('部分快照','Partial snapshot'):'')));
        for(const [path,value] of Object.entries(version.files)){
          const file=node('details');file.open=!history&&path==='SKILL.md';file.append(node('summary',path));
          let loaded=false;
          const show=()=>{if(!file.open||loaded)return;loaded=true;file.append(path==='SKILL.md'?safeMarkdown(value):node('pre',value));};
          file.ontoggle=show;show();
          group.append(file);
        }
        if(history&&entries[index+1]){
          const previous=entries[index+1].files;
          const change=node('details');
          change.append(node('summary',l('与较早快照比较','Compare with earlier snapshot')));
          for(const path of new Set([...Object.keys(previous),...Object.keys(version.files)])){
            if((previous[path]??null)===(version.files[path]??null))continue;
            change.append(section(path,diffLine(previous[path]??'',version.files[path]??'')));
          }
          group.append(change);
        }
        box.append(group);
      }
    }catch(error){box.replaceChildren(node('p',String(error),'fail'));}
  }
  function studio(){
    const item=state.selection;
    if(!item){
      const skill=state.page==='skills';
      root.append(studioSummary(studioItems(skill),skill));
      const directory=node('section',undefined,'studio-directory');directory.append(studioToolbar(skill));
      const list=node('div');list.id='insight-studio-list';directory.append(list);root.append(directory);drawStudioList();return;
    }
    const skill=state.page==='skills';
    const tabs=skill?['overview','content','versions','invocations','evaluations','feedback']:['overview','invocations','errors'];
    const names={overview:l('概览','Overview'),content:l('内容','Content'),versions:l('版本','Versions'),invocations:skill?l('活动证据','Activity evidence'):l('调用','Invocations'),
      evaluations:l('评估样本','Evaluation cases'),feedback:l('反馈','Feedback'),errors:l('错误','Errors')};
    const bar=node('nav',undefined,'studio-tabs');bar.setAttribute('aria-label',l('详情视图','Detail views'));
    for(const tab of tabs)bar.append(button(names[tab],()=>{
      if(tab!==state.tab)evaluationPanel=null;
      const refresh=tab==='errors'||state.tab==='errors'||state.activityOffset!==0||Object.keys(state.drill).length>0;
      state.tab=tab;state.activityOffset=0;state.drill={};
      if(refresh)void reload();else render();
      if(tab==='feedback')void loadFeedback();
    },tab===state.tab));
    root.append(bar);
    const data=state.data;
    if(state.tab==='content'||state.tab==='versions'){
      const box=sectionBox(names[state.tab]);root.append(box);
      if(item.path)void showVersions(box,item,state.tab==='versions');else box.append(empty());
      return;
    }
    if(state.tab==='invocations'||state.tab==='errors'){
      root.append(activities(names[state.tab],data.activity,true,skill));return;
    }
    if(state.tab==='evaluations'){
      if(evaluationPanel?.item!==item || evaluationPanel?.language!==language){
        const mount=node('div',undefined,'eval-workspace');
        const panel=evaluationUI.sharing(mount,item,openSession,()=>index());
        evaluationPanel={item,language,mount,refresh:panel.refresh};
      }
      root.append(evaluationPanel.mount);return;
    }
    if(state.tab==='feedback'){
      root.append(feedbackList(item.path??item.name),button(l('新增反馈','Add feedback'),()=>openFeedback({subject:item.path??item.name,version:item.version})));return;
    }
    const rows=data.groups;
    const grid=node('div',undefined,'insight-grid');
    grid.append(trend(skill?l('调用趋势','Invocation trend'):l('调用趋势','Usage trend'),skill?'skill':'mcp',data.days,studioScope()));
    if(skill){
      grid.append(distribution(rows.filter(confirmed)));
    }else{
      const success=sum(rows.filter(row=>row.outcome==='success'));
      const failed=sum(rows.filter(row=>['failure','declined'].includes(row.outcome)));
      const unknown=sum(rows.filter(row=>row.outcome==='unknown'));
      grid.append(sectionBox(l('调用结果','Call outcomes'),
        node('p',[['success',success],['failure',failed],['unknown',unknown]].map(([key,count])=>outcomeLabel(key)+' '+number(count)).join(' · ')),
        node('p',l('敏感参数和返回内容留在原始会话。','Sensitive parameters and results stay in the original session.'),'muted')));
    }
    root.append(grid,activities(skill?l('活动证据','Activity evidence'):l('调用记录','Invocation records'),data.activity,true,skill));
    if(!skill&&!item.tool)root.append(rating(l('工具排行','Top tools'),sorted(groups(rows,row=>row.server+' / '+row.name)),'tool',row=>openStudio('mcp',row)));
    if(data.correlations?.length){
      const box=sectionBox(l('同轮共同出现','Co-occurrence within turns'),
        node('p',l('基于明确轮次 ID。同轮出现关系不代表因果。','Based on recorded turn IDs. Co-occurrence does not imply causation.'),'muted'));
      for(const [category,name,server,turns] of data.correlations){
        const label=category==='mcp'?server+' / '+name:name;
        box.append(button(label+' · '+turns+' '+l('轮','turns'),()=>openStudio(category==='mcp'?'mcp':'skills',{name,server,key:label})));
      }
      root.append(box);
    }
    if(data.relatedProjects?.length){
      const box=sectionBox(l('关联项目','Related projects'));
      for(const [project,count] of data.relatedProjects)box.append(button(project+' · '+number(count),
        ()=>setFilter('project',project),project===state.project));
      root.append(box);
    }
  }

  async function loadFeedback(){
    try{state.feedback=await call('feedback',{action:'list'});render();}
    catch(error){status=String(error);render();}
  }
  function feedbackList(subject){
    const list=node('div',undefined,'insight-studio-list');
    const search=node('input');search.type='search';search.placeholder=l('搜索反馈','Search feedback');
    search.setAttribute('aria-label',search.placeholder);
    const typeChoices=[['issue',l('执行问题','Execution issue')],['correction',l('用户纠正','Correction')],
      ['requirement',l('新增需求','New requirement')],['experience',l('有效经验','Useful experience')],['rule',l('待优化规则','Rule to improve')]];
    const statusChoices=[['open',l('待处理','Open')],['reviewed',l('已复核','Reviewed')],['resolved',l('已处理','Resolved')]];
    const get=(choices,value)=>choices.find(([key])=>key===value)?.[1]??value;
    const statusFilter=select(l('反馈状态','Feedback status'),[['',l('所有状态','All statuses')],...statusChoices],'',draw);
    function draw(){
      list.replaceChildren();
      const rows=state.feedback.filter(row=>(!subject||subject===row.subject)&&(!statusFilter.value||statusFilter.value===row.status)&&
        (row.body+' '+row.subject).toLowerCase().includes(search.value.toLowerCase().trim()));
      if(!rows.length)list.append(empty());
      for(const row of rows){
        const box=sectionBox(get(typeChoices,row.category),node('p',row.body,'feedback-body'),
          node('small',[get(statusChoices,row.status),row.subject,row.version?.slice(0,12),date(row.updated)].filter(Boolean).join(' · ')));
        const actions=node('div',undefined,'insight-actions');
        actions.append(button(l('编辑','Edit'),()=>openFeedback(row)),
          button(l('删除','Delete'),async()=>{
            if(!window.confirm(l('删除这条反馈？','Delete this feedback?')))return;
            try{state.feedback=await call('feedback',{action:'delete',item:{id:row.id}});render();}
            catch(error){status=String(error);render();}
          }));
        if(row.source)actions.append(button(l('打开会话','Open session'),()=>openSession(row)));
        box.append(actions);list.append(box);
      }
    }
    search.oninput=draw;draw();
    const group=node('div');const bar=node('div',undefined,'insight-actions');bar.append(search,statusFilter);
    group.append(bar,list);return group;
  }
  function openFeedback(item={}){
    state.draft={category:'issue',status:'open',body:'',...item};
    const dialog=node('dialog',undefined,'diagnostics-dialog');
    const form=node('form',undefined,'diagnostics-content');
    const title=node('h2',l('记录反馈','Record feedback'));title.id='insight-feedback-title';
    dialog.setAttribute('aria-labelledby',title.id);
    form.append(title);
    if(item.subject||item.source)form.append(node('small',[item.subject,item.source,item.turn].filter(Boolean).join(' · ')));
    const kind=select(l('反馈类型','Feedback type'),[['issue',l('执行问题','Execution issue')],['correction',l('用户纠正','Correction')],
      ['requirement',l('新增需求','New requirement')],['experience',l('有效经验','Useful experience')],['rule',l('待优化规则','Rule to improve')]],state.draft.category,()=>{});
    const statusField=select(l('反馈状态','Feedback status'),[['open',l('待处理','Open')],['reviewed',l('已复核','Reviewed')],['resolved',l('已处理','Resolved')]],state.draft.status,()=>{});
    const input=node('textarea');input.required=true;input.value=state.draft.body;input.rows=6;input.maxLength=32768;
    input.setAttribute('aria-label',l('反馈内容','Feedback content'));
    const error=node('p',undefined,'fail');error.setAttribute('role','alert');
    const actions=node('div',undefined,'insight-actions');
    const save=node('button',l('保存','Save'));save.type='submit';save.className='primary';
    actions.append(save,button(l('取消','Cancel'),()=>dialog.close()));
    form.append(kind,statusField,input,error,actions);dialog.append(form);document.body.append(dialog);
    dialog.onclose=()=>dialog.remove();
    form.onsubmit=async event=>{
      event.preventDefault();save.disabled=true;
      try{
        state.feedback=await call('feedback',{action:'save',item:{...state.draft,category:kind.value,status:statusField.value,body:input.value}});
        dialog.close();render();
      }catch(problem){error.textContent=String(problem);}
      finally{save.disabled=false;}
    };
    dialog.showModal();
  }

  function render(){
    if(state.page==='sessions')return;
    root.replaceChildren();
    root.classList.toggle('insights-overview',state.page==='overview');
    root.classList.toggle('insights-skills',state.page==='skills');
    const title={overview:l('执行分析','Agent Insights'),skills:l('Skills 中心','Skills Studio'),mcp:l('MCP 中心','MCP Studio'),feedback:l('反馈','Feedback'),evaluations:l('评估集','Evaluations')}[state.page];
    const item=state.selection;
    const heading=node('div',undefined,'insight-heading');
    const identity=node('div',undefined,'insight-identity');heading.append(identity);
    if(item){
      const back=button('‹ '+title,()=>page(state.page,true));back.className='studio-back';identity.append(back);
      identity.append(node('h1',item.name+(item.tool?' / '+item.tool:'')));
      if(item.description)identity.append(node('p',item.description,'muted'));
      const metadata=item.path?item.path:[item.origin??l('仅历史记录','Historical'),item.transport,l('运行状态未知','Runtime unknown')].filter(Boolean).join(' · ');
      identity.append(node('small',metadata));
    }else identity.append(node('h1',title));
    root.append(heading);
    if(state.page==='evaluations'){
      const mount=node('div',undefined,'eval-workspace');root.append(mount);evaluationUI.library(mount);return;
    }
    if(state.page==='feedback'){
      root.append(button(l('新增反馈','Add feedback'),()=>openFeedback()),feedbackList());return;
    }
    const controls=node('div',undefined,'insight-actions');
    const scan=button(l('重新扫描','Rescan'),()=>void index(true));scan.disabled=indexing;
    const rebuild=button(l('重建索引','Reindex'),()=>void index(true,true));rebuild.disabled=indexing;
    const maintenance=node('details',undefined,'studio-disclosure studio-maintenance');
    maintenance.append(node('summary',l('索引','Index')),controls);controls.append(scan,rebuild);heading.append(maintenance);
    const coverageNote=[status,indexMeta?.pending?indexMeta.pending+' '+l('待索引','pending'):null,
      indexMeta?.errors?indexMeta.errors+' '+l('本批失败','failed in batch'):null,
      scanMeta?.errors?scanMeta.errors+' '+l('技能扫描异常','skill scan errors'):null].filter(Boolean).join(' · ');
    const message=node('p',coverageNote||l('正在加载本机数据…','Loading local data…'),'muted');
    message.setAttribute('role','status');controls.append(message);
    if(indexing||!state.data||indexMeta?.errors||scanMeta?.errors||status.startsWith('Error')){
      const notice=node('p',message.textContent,'studio-index-note muted');notice.setAttribute('role','status');root.append(notice);
    }
    root.append(dataToolbar());
    if(!state.data)return;
    if(state.page==='overview')overview();else studio();
  }

  for(const item of nav.querySelectorAll('button'))item.onclick=()=>void page(item.dataset.insight);
  document.addEventListener('insight-feedback',event=>openFeedback(event.detail));
  document.addEventListener('agentlens-language',render);
  setInterval(()=>{
    const focused=document.activeElement;
    const editing=root.contains(focused)&&focused.matches('input,select,summary');
    if(!['sessions','feedback','evaluations'].includes(state.page)&&!state.selection&&!indexing&&!editing)void index(Date.now()-lastScan>30_000);
  },12_000);
})();
