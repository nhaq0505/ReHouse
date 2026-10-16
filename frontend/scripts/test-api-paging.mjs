import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
const bundle=await build({stdin:{contents:'export {api} from "./src/api";',resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'cjs',platform:'node'});
const calls=[];
const module={exports:{}};
vm.runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,URLSearchParams,Headers,AbortSignal,Intl,Date,Set,Map,
  fetch:async path=>{
    const url=new URL(path,'http://fixture.invalid');calls.push(url);
    const page=Number(url.searchParams.get('page'));
    const start=(page-1)*100;
    return {ok:true,status:200,text:async()=>JSON.stringify({items:Array.from({length:page===1?100:2},(_,i)=>({id:String(start+i)})),total:102})};
  }});
const records=await module.exports.api.invoices.list('2026-10','fixture-occupancy');
assert.equal(records.length,102);assert.equal(calls.length,2);assert.equal(records.at(-1).id,'101');
for(const url of calls){assert.equal(url.searchParams.get('occupancyId'),'fixture-occupancy');assert.equal(url.searchParams.get('period'),'2026-10');assert.equal(url.searchParams.get('pageSize'),'100');}
console.log('PASS: secondary invoice consumers preserve scoped data past100rows through bounded pages');
