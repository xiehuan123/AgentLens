(() => {
  const dialog = $('diagnostics-dialog');
  const tabs = $('diagnostics-tabs');
  const content = $('diagnostics-content');
  const views = [['failure','失败排查'],['checks','改动与验证'],['usage','Skills 与 MCP'],['export','导出排查包']];
  let view, snapshot, round, failureId, reportSession;
  const included = new Set();
  const fields = [
    ['command','命令与脚本', [['实际命令','command'],['提交给工具的脚本','script']]],
    ['message','消息内容', [['消息内容','content']]],
    ['args','调用参数与错误', [['调用参数','args'],['已记录原因','reason'],['错误代码或类型','errorCode']]],
    ['output','输出与退出码', [['工具输出','output'],['退出码','exit']]],
    ['paths','文件路径与补丁', [['文件路径与补丁','paths'],['补丁','patch']]],
    ['identity','调用与轮次 ID', [['工具调用 ID','call'],['轮次 ID','turnId'],['源日志偏移','sourceOffset'],['结果日志偏移','resultOffset']]],
  ];
  const enabled = new Set();

  function button(label, action) {
    const control = node('button', label);
    control.type = 'button';
    control.onclick = action;
    return control;
  }

  const inRound = () => snapshot.filter(step => (step.round ?? 1) === round);
  const failures = steps => steps.filter(step => step.state === '失败');
  const normalizePath = path => path.replace(/^\.\//,'').replace(/\\/g,'/');
  const isEdit = step => step.kind === '修改' && stepPaths(step).length > 0;
  const isCheck = command => typeof command === 'string' &&
    /^(?:(?:npm|pnpm|yarn|bun)\s+(?:(?:run|run-script)\s+)?(?:test|build|lint|check|typecheck)(?=[:\s]|$)|(?:cargo\s+(?:test|check|build|clippy)|(?:pytest|vitest|jest)|go\s+(?:test|vet|build)|tsc)(?=\s|$))/i.test(command.trim());

  function relatedToFailure(steps, failure) {
    const paths = stepPaths(failure).map(normalizePath);
    const tokens = new Set(String(failure.output ?? '').match(/[\w./\\-]+/g)?.map(normalizePath) ?? []);
    const edits = steps.filter(step => step.id < failure.id && isEdit(step) &&
      stepPaths(step).some(path => {
        const normalized = normalizePath(path);
        return paths.includes(normalized) || tokens.has(normalized) ||
          (failure.cwd && normalized.startsWith(failure.cwd + '/') && tokens.has(normalized.slice(failure.cwd.length + 1)));
      }));
    const runs = !failure.command ? [] : steps.filter(step => step.id > failure.id &&
      step.command?.trim() === failure.command.trim() && (!step.cwd || !failure.cwd || step.cwd === failure.cwd));
    return {edits, runs};
  }

  function description(step) {
    return String(labelStep(step).title ?? step.tool ?? t('未知记录'));
  }

  function record(step) {
    const item = node('li', undefined, 'diagnostic-record');
    const descriptionNode = node('strong', description(step));
    descriptionNode.title = descriptionNode.textContent;
    item.append(descriptionNode, node('small', [t(step.state),
      step.exit != null ? t('退出码')+' '+step.exit : null, readableTime(step.time)].filter(Boolean).join(' · ')));
    const actions = node('div', undefined, 'diagnostic-actions');
    actions.append(button(t('打开原步骤'), () => { dialog.close(); showStep(step.id); }));
    const added = included.has(step.id);
    actions.append(button(t(added ? '从排查包移除' : '添加到排查包'), () => {
      if(added)included.delete(step.id);else included.add(step.id);
      renderPanel();
    }));
    item.append(actions);
    return item;
  }

  function listing(title, steps, empty) {
    const section = node('section', undefined, 'diagnostic-section');
    section.append(node('h3', t(title)));
    if(steps.length) {
      const list = node('ul');
      list.append(...steps.map(record));
      section.append(list);
    } else section.append(node('p', t(empty), 'muted'));
    return section;
  }

  function renderFailure(steps) {
    const options = failures(steps);
    if(!options.length) { content.append(node('p', t('未记录失败步骤'), 'empty'));return; }
    const failure = options.find(step => step.id === failureId) ?? options[0];
    const choose = node('select');
    choose.setAttribute('aria-label',t('选取失败步骤'));
    for(const step of options) {
      const option = node('option', '#'+step.id+' · '+description(step).slice(0,90));
      option.value = step.id;
      choose.append(option);
    }
    choose.value = failure.id;
    choose.onchange = () => { failureId=Number(choose.value);renderPanel(); };
    content.append(choose,listing('失败排查',[failure]));
    const evidence = failure.output || failure.reason;
    if(evidence)content.append(section(t(failure.output?'工具输出':'已记录原因'),evidence,true));
    const {edits,runs} = relatedToFailure(steps,failure);
    content.append(listing('相关修改',edits.slice().reverse(),'未找到关联文件修改'),
      listing('本轮后续相同命令',runs,'未记录验证'));
    if(runs.some(step=>!step.cwd || !failure.cwd))content.append(node('small',t('工作目录缺失，关联仅基于命令文本')));
  }

  function renderChecks(steps){
    const edits=steps.filter(isEdit);
    const files = new Map();
    for(const step of edits)for(const path of stepPaths(step)){
      if(!files.has(path))files.set(path,[]);
      files.get(path).push(step);
    }
    content.append(node('h3',t('本轮文件操作')));
    if(!files.size)content.append(node('p',t('未记录文件改动'),'muted'));
    for(const [path,records] of files){
      const group=node('details',undefined,'diagnostic-section');
      const list=node('ul');
      list.append(...records.map(record));
      group.append(node('summary',path+' · '+number(records.length)),list);
      content.append(group);
    }
    content.append(listing('本轮验证命令',steps.filter(step=>isCheck(step.command)),'未识别到验证命令'),
      node('small',t('检查结果以退出码或工具状态为准')));
  }

  function renderUsage(steps){
    const groups=new Map();
    for(const step of steps){
      const info=labelStep(step);
      if(!['skill','mcp'].includes(info.category))continue;
      const key=info.category+' '+info.title;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push({step,info});
    }
    if(!groups.size)content.append(node('p',t('没有 Skills 或 MCP 调用记录'),'empty'));
    for(const [key,entries] of groups){
      const group=node('details',undefined,'diagnostic-section');
      const list=node('ul');
      const records=entries.map(entry=>entry.step);
      const refs=entries.filter(({info})=>info.category==='skill' && !info.explicit).length;
      const time=records.map(step=>step.durationMs).filter(value=>typeof value==='number');
      for(const {step,info} of entries){
        const item=record(step);
        if(info.category==='skill')item.prepend(node('small',t(info.explicit?'Skills 调用':'技能文件引用')));
        list.append(item);
      }
      group.append(node('summary',[key,number(records.length-refs)+' '+t('调用'),
        refs ? number(refs)+' '+t('文件引用') : null,
        number(failures(records).length)+' '+t('失败数'),
        records.some(step=>String(step.outcome).toLowerCase()==='declined') ? number(records.filter(step=>String(step.outcome).toLowerCase()==='declined').length)+' '+t('已拒绝') : null,
        time.length ? time.map(ms=>number(ms)+' ms').join(', ') : t('无已记录耗时')].filter(Boolean).join(' · ')),list);
      content.append(group);
    }
  }

  function checkbox(label, checked, change){
    const row=node('label');
    const input=node('input');
    input.type='checkbox';
    input.checked=checked;
    input.onchange=()=>change(input.checked);
    row.append(input,document.createTextNode(label));
    return row;
  }

  function fenced(value){
    const text=String(value);
    const size=(text.match(/`+/g)??[]).reduce((max,run)=>Math.max(max,run.length),2)+1;
    const fence='`'.repeat(size);
    return fence+'\n'+text+'\n'+fence;
  }

  function markdown(){
    const lines=['# AgentLens · '+t('排查会话')];
    for(const step of snapshot.filter(step=>included.has(step.id))){
      const info=labelStep(step);
      const category=filters.find(([key])=>key===info.category)?.[1]??'工具';
      lines.push('', '## '+t('任务轮次')+' '+(step.round??1)+' · #'+step.id,
        '', '- '+t('记录位置')+' · '+t(category)+' · '+t(step.state),
        ...(step.time ? ['- '+readableTime(step.time)] : []));
      if(['等待结果','未记录结果'].includes(step.state))lines.push('- '+t('工具结果未记录'));
      for(const [key,, pairs] of fields){
        if(!enabled.has(key))continue;
        for(const [label,property] of pairs){
          const value=property==='paths'?stepPaths(step).join('\n'):step[property];
          if(value!=null && value!=='')lines.push('', '### '+t(label), '', fenced(value));
        }
      }
    }
    return lines.join('\n')+'\n';
  }

  function renderExport(steps){
    content.append(node('p',t('选取本轮步骤后可预览并保存。默认仅包含状态与类型。'),'muted'));
    const records=node('div',undefined,'diagnostics-options diagnostics-record-options');
    for(const step of steps)
      records.append(checkbox('#'+step.id+' · '+description(step).replace(/\s+/g,' ').slice(0,95),included.has(step.id),checked=>{
        if(checked)included.add(step.id);else included.delete(step.id);
        refreshPreview();
      }));
    if(!records.children.length)records.append(node('p',t('本轮没有可选步骤'),'muted'));
    const options=node('div',undefined,'diagnostics-options');
    for(const [key,label] of fields)options.append(checkbox(t(label),enabled.has(key),checked=>{
      if(checked)enabled.add(key);else enabled.delete(key);
      refreshPreview();
    }));
    const preview=node('textarea',undefined,'diagnostic-preview');
    preview.readOnly=true;
    preview.setAttribute('aria-label',t('排查包预览'));
    const status=node('p',undefined,'muted');
    status.setAttribute('role','status');
    const save=button(t('保存 Markdown'),async()=>{
      const body=preview.value;
      save.disabled=true;
      status.textContent='';
      try{ if(await invoke('save_diagnostics',{markdown:body}))status.textContent=t('已保存到本机'); }
      catch(error){status.textContent=String(error);}
      finally{save.disabled=!included.size;}
    });
    function refreshPreview(){preview.value=markdown();save.disabled=!included.size;}
    refreshPreview();
    content.append(records,options,preview,save,status);
  }

  function renderPanel() {
    tabs.replaceChildren();
    for(const [id,label] of views){
      const control=button(t(label)+(id==='export' && included.size?' '+number(included.size):''),()=>{view=id;renderPanel();});
      control.setAttribute('aria-pressed',String(view===id));
      tabs.append(control);
    }
    content.replaceChildren();
    const turns=node('select');
    turns.setAttribute('aria-label',t('选择任务轮次'));
    for(const id of [...new Set(snapshot.map(step=>step.round??1))].reverse()){
      const option=node('option',t('任务轮次')+' '+id);option.value=id;turns.append(option);
    }
    turns.value=round;
    turns.onchange=()=>{round=Number(turns.value);failureId=null;renderPanel();};
    content.append(turns);
    const steps=inRound();
    ({failure:renderFailure,checks:renderChecks,usage:renderUsage,export:renderExport})[view](steps);
  }

  $('diagnostics').onclick=()=>{
    snapshot=rows().slice();
    const selected=snapshot.find(step=>step.id===display.selected);
    const first=selected?.state==='失败'?selected:failures(snapshot).at(-1);
    round=(first??selected??snapshot.at(-1))?.round??1;
    failureId=first?.id;
    const session=local?localKey:'demo:'+display.active;
    if(reportSession!==session){
      reportSession=session;
      included.clear();
      enabled.clear();
    }
    const available=new Set(snapshot.map(step=>step.id));
    for(const id of included)if(!available.has(id))included.delete(id);
    view='failure';
    renderPanel();
    dialog.showModal();
  };
})();
