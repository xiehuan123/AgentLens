/* Local candidate selection and author review. Sharing always uses a native Save dialog. */
const evaluationUI=(()=>{
  const l=(cn,en)=>language==='en'?en:cn;
  const request=(action,input)=>invoke('agent_insights',{action,input});
  const button=(label,onclick)=>{
    const el=node('button',label);el.type='button';el.onclick=onclick;return el;
  };
  function field(label,value='',multiline=false){
    const wrap=node('label',label);
    const input=node(multiline?'textarea':'input');
    input.value=value;input.maxLength=multiline?2600:180;wrap.append(input);
    return {wrap,input};
  }
  function picker(label,items,value){
    const wrap=node('label',label),input=node('select');
    for(const [key,label] of items){const option=node('option',label);option.value=key;input.append(option);}
    input.value=value;wrap.append(input);return {wrap,input};
  }
  function status(){
    const el=node('p',undefined,'muted');el.setAttribute('role','status');return el;
  }
  function action(message,fn){
    return async event=>{
      const control=event.currentTarget;control.disabled=true;message.textContent='';
      try{await fn();}catch(error){message.textContent=String(error);}
      finally{control.disabled=false;}
    };
  }

  function sharing(mount,skill,openSource,syncLogs){
    const switches=node('nav',undefined,'studio-tabs');
    switches.setAttribute('aria-label',l('分享方式','Share options'));
    const container=node('div',undefined,'eval-workspace');
    const panels=new Map();
    let active;
    const views=[
      ['sessions',l('完整会话','Full sessions'),sessionPicker],
      ['cases',l('评估贡献包','Evaluation contribution'),candidates],
    ];
    for(const [key,label,render] of views){
      switches.append(button(label,()=>show(key,render)));
      switches.lastElementChild.dataset.view=key;
    }
    function show(key,render){
      active=key;
      if(!panels.has(key)){
        const panel=node('div',undefined,'eval-workspace');
        panels.set(key,{panel,controller:render(panel,skill,openSource,syncLogs)});
      }
      container.replaceChildren(panels.get(key).panel);
      for(const control of switches.children)control.setAttribute('aria-pressed',String(control.dataset.view===key));
    }
    mount.append(switches,container);
    show('sessions',sessionPicker);
    return {refresh:()=>panels.get(active)?.controller.refresh()};
  }

  function sessionPicker(mount,skill,openSource,syncLogs){
    const list=node('div',undefined,'eval-list'), controls=node('div',undefined,'insight-actions');
    const message=status(), count=node('small');
    const selected=new Map();
    const max=100;
    let offset=0, generation=0, choices=[];
    const identity={path:skill.path||'',name:skill.name};
    const rowKey=row=>JSON.stringify(row.key);
    const exportButton=button(l('保存完整会话…','Save full sessions…'),()=>previewSessions(identity,[...selected.values()],message));
    const markPage=button(l('全选本页','Select this page'),()=>{
      for(const {row} of choices){
        if(selected.size===max)break;
        selected.set(rowKey(row),row);
      }
      update();
      if(choices.some(({row})=>!selected.has(rowKey(row))))message.textContent=l('一次最多保存 100 个会话。','You can save up to 100 sessions at a time.');
    });
    const clear=button(l('清空选择','Clear selection'),()=>{selected.clear();update();});
    function update(){
      count.textContent=l('已选 '+selected.size+' 个会话','Selected sessions: '+selected.size);
      exportButton.disabled=clear.disabled=!selected.size;
      for(const {row,check} of choices)check.checked=selected.has(rowKey(row));
      markPage.disabled=!choices.some(({check})=>!check.checked)||selected.size===max;
    }
    controls.append(count,markPage,clear,exportButton,button(l('同步日志','Sync logs'),action(message,syncLogs)));
    mount.append(node('p',l('勾选此 Skill 关联的会话，新建一个包含所选会话完整原始日志的 JSON。',
      'Select linked sessions to save their complete original logs in one JSON file.'),'muted'),controls,message,list);
    async function load(next){
      const current=++generation;
      try{
        const data=await request('eval_sessions',{...identity,offset:next});
        if(current!==generation)return;
        offset=data.offset;choices=[];list.replaceChildren();
        if(!data.items.length)list.append(node('p',l('没有找到此技能的已确认调用。','No confirmed calls were found for this skill.'),'muted'));
        for(const row of data.items){
          const card=node('div',undefined,'insight-box eval-session-row');
          const label=node('label',undefined,'eval-checkbox');
          const check=node('input');check.type='checkbox';
          const summary=node('span',undefined,'eval-session-label');
          summary.append(node('strong',row.title),node('small',[
            row.key.provider,row.time?readableTime(row.time*1000):null,row.callCount+' '+l('次调用','calls')
          ].filter(Boolean).join(' · ')));
          label.append(check,summary);
          const id=rowKey(row);
          check.onchange=()=>{
            if(check.checked&&selected.size===max&&!selected.has(id)){
              message.textContent=l('一次最多保存 100 个会话。','You can save up to 100 sessions at a time.');
            }else if(check.checked)selected.set(id,row);
            else selected.delete(id);
            update();
          };
          choices.push({row,check});
          card.append(label,button(l('打开会话','Open session'),()=>openSource(row)));list.append(card);
        }
        const paging=node('div',undefined,'insight-actions');
        if(offset)paging.append(button(l('上一页','Previous'),action(message,()=>load(Math.max(0,offset-20)))));
        if(data.more)paging.append(button(l('下一页','Next'),action(message,()=>load(offset+20))));
        list.append(paging);
        update();
      }catch(error){if(current===generation)message.textContent=String(error);}
    }
    update();void load(0);
    return {refresh:()=>load(offset)};
  }

  function previewSessions(identity,sessions,message){
    const dialog=node('dialog',undefined,'diagnostics-dialog');
    const content=node('div',undefined,'diagnostics-content');
    const progress=status();
    const title=node('h2',l('保存完整会话','Save full sessions'));
    title.id='session-export-title';dialog.setAttribute('aria-labelledby',title.id);
    const names=node('ul');
    for(const item of sessions)names.append(node('li',item.title+' · '+item.key.provider));
    content.append(title,node('p',l('导出包含会话中记录的所有轮次、消息、工具参数和结果。日志原样保存在本机 JSON，可能包含代码、路径和凭据。请在转发前核对。',
      'The local JSON includes all recorded turns, messages, tool inputs and results. Original logs may contain code, paths and credentials. Review them before forwarding.')),names,progress);
    const actions=node('div',undefined,'insight-actions');
    actions.append(button(l('返回','Back'),()=>dialog.close()),button(l('保存 JSON','Save JSON'),action(progress,async()=>{
      if(await request('eval_sessions_save',{...identity,sessions:sessions.map(item=>item.key)})){
        message.textContent=l('已保存 '+sessions.length+' 个完整会话。','Saved '+sessions.length+' full sessions.');
        dialog.close();
      }
    })));
    content.append(actions);dialog.append(content);document.body.append(dialog);
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
  }

  function candidates(mount,skill,openSource,syncLogs){
    const list=node('div',undefined,'eval-list'), controls=node('div',undefined,'insight-actions');
    const message=status(), drafts=new Map(), selected=new Map();
    let offset=0, requestNumber=0;
    const project=field(l('Skill 包标识（建议填写仓库或包名）','Skill package ID (repository or package name)'));
    project.input.placeholder='owner/repository';
    const size=node('small');
    const share=button(l('预览贡献包','Preview contribution'),action(message,async()=>{
      const samples=[...selected.values()].map(({row,input,observed})=>({
        id:row.id,group:row.group,skill:row.skill,package:project.input.value.trim(),
        input:input.value.trim(),observed:observed.value.trim(),trigger:row.trigger
      }));
      if(samples.some(item=>!item.input)){
        message.textContent=l('请为每个勾选案例填写可分享的输入。','Add a shareable input for every selected case.');
        return;
      }
      preview(samples,message);
    }));
    function update(){
      size.textContent=selected.size+' '+l('个已选','selected');
      share.disabled=selected.size===0;
    }
    controls.append(size,share,button(l('同步日志','Sync logs'),action(message,syncLogs)));
    mount.append(node('p',l('自动列出该 Skill 已确认调用的轮次。预览仅在本机显示，贡献内容由你填写或选用。',
      'Confirmed turns for this skill are matched automatically. The preview stays local. Choose what to include in the contribution.'),'muted'),
      project.wrap,controls,message,list);
    async function load(next){
      const current=++requestNumber;
      try{
        const data=await request('eval_candidates',{path:skill.path||'',name:skill.name,offset:next});
        if(current!==requestNumber)return;
        offset=data.offset;list.replaceChildren();
        if(!data.items.length)list.append(node('p',l('没有找到此技能的已确认调用。','No confirmed calls were found for this skill.'),'muted'));
        for(const row of data.items){
          const card=node('details',undefined,'insight-box');
          const header=node('summary',[row.provider,row.time?readableTime(row.time*1000):l('时间未知','Time unknown'),
              row.shared?l('同轮有其他 Skill','Shared turn'):null,!row.turn?l('轮次未知','Turn unknown'):null].filter(Boolean).join(' · '));
          card.append(header);
          const proof=node('small',l('调用证据','Invocation evidence')+' · '+row.proof.join(', '));
          const copy=node('pre',row.prompt||l('这条记录没有可匹配的用户请求。','No user request could be matched.'));
          const draft=drafts.get(row.id);
          const input=field(l('分享的输入','Shareable input'),draft?.input.value,true);
          const observed=field(l('问题或实际结果','Issue or observed result'),draft?.observed.value,true);
          card.open=draft?.card.open??false;
          const fields={row,input:input.input,observed:observed.input,card};
          drafts.set(row.id,fields);
          const label=node('label',undefined,'eval-checkbox');
          const check=node('input');check.type='checkbox';check.checked=selected.has(row.id);
          label.append(check,document.createTextNode(l('加入贡献包','Include in contribution')));
          const bind=()=>{
            if(check.checked&&!selected.has(row.id)&&selected.size>=100){
              check.checked=false;
              message.textContent=l('每个贡献包最多 100 个案例。','A contribution can contain at most 100 cases.');
            }
            if(check.checked)selected.set(row.id,fields);
            else selected.delete(row.id);
            update();
          };
          check.onchange=bind;
          if(check.checked)bind();
          const notes=node('ul');
          for(const item of row.notes){
            const text=item.kind==='user'?l('同轮用户消息','User message in this turn')+' · '+item.text:
              [item.text||l('工具结果','Tool result'), item.failed===true?l('失败','Failed'):null,
                item.exit==null?null:'exit '+item.exit].filter(Boolean).join(' · ');
            notes.append(node('li',text));
          }
          const actions=node('div',undefined,'insight-actions');
          actions.append(button(l('打开原始会话','Open source session'),()=>openSource(row)));
          if(row.prompt)actions.append(button(l('复制请求到分享草稿','Copy request to share draft'),()=>{input.input.value=row.prompt;}));
          card.append(proof,copy);
          if(notes.children.length)card.append(notes);
          card.append(actions,input.wrap,observed.wrap,label);
          list.append(card);
        }
        const paging=node('div',undefined,'insight-actions');
        if(offset) paging.append(button(l('上一页','Previous'),action(message,()=>load(Math.max(0,offset-20)))));
        if(data.more) paging.append(button(l('下一页','Next'),action(message,()=>load(offset+20))));
        list.append(paging);
      }catch(error){if(current===requestNumber)message.textContent=String(error);}
    }
    update();void load(0);
    return {refresh:()=>load(offset)};
  }

  function preview(samples,message){
    const dialog=node('dialog',undefined,'diagnostics-dialog');
    const content=node('div',undefined,'diagnostics-content');
    const progress=status();
    const payload={format:'agentlens-eval-cases',version:1,cases:samples};
    const pre=node('pre',JSON.stringify(payload,null,2),'eval-preview');
    content.append(node('h2',l('预览贡献包','Preview contribution')),
      node('p',l('核对分享内容，移除私有路径、凭据和业务信息。','Review the contents and remove private paths, credentials, and business data.')),
      pre,progress);
    const actions=node('div',undefined,'insight-actions');
    actions.append(button(l('返回编辑','Back to editing'),()=>dialog.close()),button(l('保存 JSON','Save JSON'),action(progress,async()=>{
      if(await request('eval_save',{kind:'bundle',data:payload})){
        message.textContent=l('贡献包已保存。','Contribution saved.');dialog.close();
      }
    })));
    content.append(actions);dialog.append(content);document.body.append(dialog);
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
  }

  function library(mount){
    const message=status(),list=node('div',undefined,'eval-list');
    const file=node('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
    const toolbar=node('div',undefined,'insight-actions');
    toolbar.append(button(l('导入贡献包','Import contribution'),()=>file.click()),file);
    mount.append(toolbar,message,list);
    file.onchange=async()=>{
      const selected=file.files[0];
      file.value='';
      if(!selected)return;
      try{
        if(selected.size>2_000_000)throw Error(l('贡献包超过 2 MB。','The contribution exceeds 2 MB.'));
        const data=JSON.parse(await selected.text());
        const result=await request('eval_library',{action:'import',data});
        await load();message.textContent=l('新增案例 ','New cases: ')+result.inserted;
      }catch(error){message.textContent=String(error);}
    };
    async function load(){
      try{
        const rows=await request('eval_library',{action:'list'});
        list.replaceChildren();
        if(!rows.length){
          list.append(node('p',l('导入使用者从 Skills 中心导出的贡献包，审核后即可生成评估集。',
            'Import a contribution from Skills Studio. Review its cases to build an evaluation set.'),'muted'));
          return;
        }
        const groups=new Map();
        for(const entry of rows){
          const {sample}=entry;
          const key=JSON.stringify([sample.skill,sample.package]);
          if(!groups.has(key))groups.set(key,[]);
          groups.get(key).push(entry);
        }
        for(const entries of groups.values()){
          const {skill,package:pkg}=entries[0].sample;
          const group=node('section',undefined,'insight-box');
          group.append(node('h2',[skill,pkg].filter(Boolean).join(' · ')));
          const controls=node('div',undefined,'insight-actions');
          for(const [split,label] of [['development',l('导出开发集','Export development set')],['holdout',l('导出金标留出集','Export gold holdout')]]){
            const save=button(label,action(message,async()=>{
              if(await request('eval_save',{kind:'dataset',data:{skill,package:pkg,split}})){
                message.textContent=l('评估集已保存。','Dataset saved.');
              }
            }));
            save.disabled=!entries.some(item=>item.split===split&&['trigger','skip'].includes(item.expectation));
            controls.append(save);
          }
          group.append(controls);
          for(const entry of entries) group.append(review(entry,load));
          list.append(group);
        }
      }catch(error){message.textContent=String(error);}
    }
    void load();
  }

  function review(entry,load){
    const {sample}=entry;
    const panel=node('details',undefined,'eval-review');
    const reviewStatus=entry.expectation==='trigger'?l('应触发','Should trigger'):
      entry.expectation==='skip'?l('不应触发','Should skip'):l('待确认','Needs review');
    const caption=node('summary',reviewStatus+' · '+sample.input.slice(0,100));
    const expectation=picker(l('预期触发','Expected trigger'),
      [['uncertain',l('待确认','Uncertain')],['trigger',l('应触发','Should trigger')],['skip',l('不应触发','Should skip')]],entry.expectation||'uncertain');
    const checks=field(l('验收条件','Acceptance checks'),entry.checks,true);
    const split=picker(l('归入集合','Dataset split'),[['development',l('开发集','Development')],['holdout',l('金标留出集','Gold holdout')]],entry.split);
    const message=status();
    panel.append(caption,node('pre',sample.input,'eval-preview'));
    if(sample.observed)panel.append(node('p',sample.observed,'feedback-body'));
    panel.append(expectation.wrap,checks.wrap,split.wrap,button(l('保存审核','Save review'),action(message,async()=>{
      await request('eval_library',{action:'review',data:{id:sample.id,expectation:expectation.input.value,checks:checks.input.value,split:split.input.value}});
      await load();
    })),message);
    return panel;
  }
  return {sharing,library};
})();
