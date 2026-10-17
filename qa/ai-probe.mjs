import { getPlatformProxy } from 'wrangler';
import { writeFile,mkdir } from 'node:fs/promises';
const platform=await getPlatformProxy({configPath:'wrangler.jsonc',remoteBindings:true});
try {
  const result=await platform.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast',{
    messages:[{role:'system',content:'Return only JSON: {"tasks":[{"text":"a task"}]}. Use Japanese tasks.'},{role:'user',content:'参考を集めて、デザインの下書きを作る'}],temperature:0.2,max_tokens:256
  });
  await mkdir('qa/private',{recursive:true});
  await writeFile('qa/private/workers-ai-live.json',JSON.stringify({checkedAt:new Date().toISOString(),model:'@cf/meta/llama-3.3-70b-instruct-fp8-fast',result},null,2));
  console.log(JSON.stringify({success:true,response:result.response}));
} finally {await platform.dispose();}
