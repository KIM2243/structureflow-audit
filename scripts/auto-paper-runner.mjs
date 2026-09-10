// Run as a separate unprivileged systemd service on the existing market VM.
const origin=process.env.STRUCTUREFLOW_SITE_URL || 'https://structureflow.tpfresh.com';
const token=process.env.KIWOOM_BRIDGE_TOKEN;
if(!token)throw new Error('Missing runner credential');
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});
while(!stopping) {
  try {
    const response=await fetch(new URL('/api/paper/auto/tick',origin),{method:'POST',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(65000)});
    const result=await response.json();
    if(!response.ok)console.error(JSON.stringify({event:'paper_tick_failed',status:response.status}));
    else if(result.checked)console.log(JSON.stringify({event:'paper_tick',checked:result.checked,at:new Date().toISOString()}));
  } catch {console.error(JSON.stringify({event:'paper_tick_connection_failed'}));}
  await new Promise(resolve=>setTimeout(resolve,5000));
}
