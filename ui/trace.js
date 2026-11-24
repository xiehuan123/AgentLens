(() => {
  const dialog = $('trace-dialog');
  const controls = [$('trace-existing'),$('trace-reduce')];
  const status = $('trace-status');
  const list = $('trace-requests');
  let generation = 0;
  let busy = false;

  const traceStatus = value => t(({
    complete:'已完成', unclosed:'尚未封存', closed_with_partial_payloads:'已封存，包含部分数据',
    completed:'已完成', failed:'失败', aborted:'已中止', canceled:'已中止', cancelled:'已中止',
  })[typeof value==='string'?value:value?.status] ??
    (typeof value==='string'?value:value==null?'未知':JSON.stringify(value)));

  function showRequests(bundle){
    const requests=bundle.requests??[];
    status.textContent=t('已打开 Trace 包')+' · '+t('记录状态')+' · '+traceStatus(bundle.recordingStatus);
    $('trace-help').open=false;
    list.replaceChildren(node('h3',t('模型请求尝试')+' · '+number(requests.length)));
    if(!requests.length){list.append(node('p',t('没有已记录的模型请求'),'muted'));return;}
    for(const request of requests){
      const group=node('details',undefined,'section');
      const summary=[request.model,traceStatus(request.status),readableTime(request.startedAt),
        request.durationMs==null?null:number(request.durationMs)+' ms'].filter(Boolean).join(' · ');
      group.append(node('summary',summary));
      const fields=[
        ['模型',request.model],['提供方',request.provider],['会话 ID',request.threadId],
        ['轮次 ID',request.turnId],['推理尝试 ID',request.id],['请求 ID',request.requestId],['模型响应 ID',request.responseId],
        ['关联工具调用',request.toolCallIds?.join(', ')],
      ];
      for(const [label,value] of fields){
        if(!value)continue;
        const row=node('p',undefined,'tool-name');
        row.append(node('span',t(label)+' '),node('code',value));
        group.append(row);
      }
      group.append(node('p',t(request.capture==='complete'?'请求体已完整录制':'请求体缺失或未完整录制'),'muted'));
      if(request.capture==='complete'){
        const reveal=node('button',t('查看原始请求体'));
        reveal.type='button';
        const body=node('pre');
        body.hidden=true;
        reveal.onclick=async()=>{
          reveal.disabled=true;
          const current=generation;
          try{
            const raw=await invoke('read_codex_trace_request',{id:request.id});
            if(current!==generation)return;
            body.textContent=raw;
            body.hidden=false;
            reveal.hidden=true;
          }catch(error){
            if(current===generation){body.textContent=String(error);body.hidden=false;}
          }finally{reveal.disabled=false;}
        };
        group.append(reveal,body);
      }
      list.append(group);
    }
  }

  async function selectBundle(reduce){
    if(busy)return;
    busy=true;
    const current=++generation;
    controls.forEach(control=>{control.disabled=true;});
    status.textContent=t('正在加载 Trace…');
    list.replaceChildren();
    try{
      await invoke('close_codex_trace');
      if(current!==generation)return;
      const bundle=await invoke('open_codex_trace',{reduce});
      if(current!==generation){
        await invoke('close_codex_trace');
        return;
      }
      if(bundle)showRequests(bundle);
      else status.textContent=t('尚未打开 Trace 包');
    }catch(error){
      if(current===generation){status.textContent=String(error);$('trace-help').open=true;}
    }finally{
      busy=false;
      controls.forEach(control=>{control.disabled=false;});
    }
  }
  $('trace-existing').onclick=()=>void selectBundle(false);
  $('trace-reduce').onclick=()=>void selectBundle(true);
  $('trace-open').onclick=async()=>{
    const current=++generation;
    status.textContent=t('尚未打开 Trace 包');
    $('trace-config').textContent='';
    $('trace-help').open=true;
    dialog.showModal();
    try{
      const configured=await invoke('trace_configured');
      if(current!==generation)return;
      $('trace-config').textContent=t(configured?'AgentLens 检测到录制目录配置。':'AgentLens 未检测到录制目录配置。')+
        ' '+t('此状态只反映 AgentLens 的环境，其他 Codex 进程可能使用不同配置。');
    }catch(error){
      if(current===generation)$('trace-config').textContent=String(error);
    }
  };
  dialog.addEventListener('close',()=>{
    generation++;
    list.replaceChildren();
    void invoke('close_codex_trace').catch(()=>{});
  });
})();
