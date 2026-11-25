// A task owns its own lock until its promise settles. Concurrent tasks cannot release each other.
export function createWaitTasks(onChange,{delay=300,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  const tasks=new Map();let timer=null,visible=false;
  const active=()=>[...tasks.values()].sort((a,b)=>b.priority-a.priority)[0]||null;
  const emit=()=>onChange({locked:tasks.size>0,visible:tasks.size>0&&visible,text:active()?.text||'',size:tasks.size});
  function begin(key,text,priority=0){
    const id=Symbol(key),wasEmpty=tasks.size===0;
    tasks.set(id,{key,text,priority});
    if(wasEmpty){
      visible=false;
      timer=setTimer(()=>{timer=null;visible=tasks.size>0;emit();},delay);
    }
    emit();
    return {
      update(text){const task=tasks.get(id);if(task){task.text=text;emit();}},
      end(){if(!tasks.delete(id))return;if(!tasks.size){if(timer!==null)clearTimer(timer);timer=null;visible=false;}emit();}
    };
  }
  function update(key,text){
    let changed=false;for(const task of tasks.values())if(task.key===key){task.text=text;changed=true;}
    if(changed)emit();
  }
  async function run(key,text,priority,fn){
    const task=begin(key,text,priority);
    try{return await fn(task);}finally{task.end();}
  }
  return {begin,update,run,isLocked:()=>tasks.size>0};
}
