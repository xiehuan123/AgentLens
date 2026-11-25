/* Classify recorded file targets. Shell text is inspected locally and never executed. */
function fileActivity(step){
  const records=[];
  const cleanPath=path=>{
    if(typeof path!=='string'||!path.trim())return '';
    let value=path.replace(/\\/g,'/').replace(/^\.\//,'');
    if(step.cwd&&typeof step.cwd==='string'&&!/^(?:\/|~\/|[a-z]:\/)/i.test(value)){
      value=step.cwd.replace(/\\/g,'/').replace(/\/$/,'')+'/'+value;
    }
    return value;
  };
  const emit=(operation,path,to=null)=>{
    const file=cleanPath(path),dest=cleanPath(to);
    if(file&&!records.some(item=>item.operation===operation&&item.path===file&&item.to===dest)){
      records.push({operation,path:file,to:dest});
    }
  };
  for(const path of step.contextFiles??[])emit('context',path);
  if(step.fileChanges?.length){
    for(const change of step.fileChanges)emit(change.operation,change.path,change.to);
    return records;
  }
  if(typeof step.patch==='string'){
    let current=null;
    const patch=[];
    for(const line of step.patch.split(/\r?\n/)){
      const match=/^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
      const move=/^\*\*\* Move to: (.+)$/.exec(line);
      if(move&&current?.operation==='modify'){
        current.operation='move';current.to=move[1];
      }else if(match){
        current={operation:{Add:'create',Update:'modify',Delete:'delete'}[match[1]],path:match[2]};
        if(current.operation)patch.push(current);
      }
    }
    for(const item of patch)emit(item.operation,item.path,item.to);
    if(patch.length)return records;
  }
  const operation=step.kind==='读取'?'read':
    ['Write','NotebookEdit'].includes(step.tool)?'write':step.kind==='修改'?'modify':null;
  if(operation)for(const path of stepPaths(step))emit(operation,path);
  if(!operation&&typeof step.command==='string')shellFileActivity(step.command,emit);
  return records;
}

function shellFileActivity(command,emit){
  const source=command.trim();
  const words=source.match(/'[^']*'|"[^"\\$`]*"|[^\s"'&;<>|$`*?{}()[\]\\]+/g)??[];
  // Only complete, literal argv is classified. Compound commands and expansions
  // stay in the timeline, where readers can inspect them without false attribution.
  if(!words.length||words.join(' ')!==source.replace(/('[^']*'|"[^"]*")|\s+/g,(match,quoted)=>quoted??' '))return;
  const [tool,...tokens]=words.map(word=>word.replace(/^(['"])(.*)\1$/s,'$2'));
  if(tool==='sed'&&tokens.length===3&&tokens[0]==='-n'&&/^\d+(?:,\d+)?p$/.test(tokens[1])){
    emit('read',tokens[2]);return;
  }
  const files=[];
  let optionMode=true;
  for(let i=0;i<tokens.length;i++){
    const token=tokens[i];
    if(optionMode&&token==='--'){optionMode=false;continue;}
    if(optionMode&&['head','tail'].includes(tool)&&['-n','-c','--lines','--bytes'].includes(token)){
      if(!/^[+-]?\d+$/.test(tokens[++i]??''))return;
      continue;
    }
    if(optionMode&&token.startsWith('-')){
      const flags={cat:/^-[nbsvETeAt]+$/,head:/^-(?:q|v|[0-9]+)$/,tail:/^-(?:q|v|[0-9]+)$/,
        wc:/^-[clmwL]+$/,rm:/^-[fiv]+$/,mv:/^-[finv]+$/,cp:/^-[finpv]+$/,touch:/^-[acm]+$/,nl:/^-[b]?a$/};
      if(!flags[tool]?.test(token))return;
      continue;
    }
    files.push(token);
  }
  if(!files.length)return;
  if(['cat','head','tail','wc','nl'].includes(tool))for(const file of files)emit('read',file);
  if(tool==='rm')for(const file of files)emit('delete',file);
  if(tool==='touch')for(const file of files)emit('write',file);
  if(tool==='mv'&&files.length===2)emit('move',files[0],files[1]);
  if(tool==='cp'&&files.length===2){emit('read',files[0]);emit('write',files[1]);}
}
