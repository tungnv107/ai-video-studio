import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile} from 'node:fs/promises';
import {db} from '../src/server/db';
import {putAsset,readAsset} from '../src/server/storage';
const exec=promisify(execFile),workspace=await db.workspace.create({data:{name:'TEST lifecycle purge',archivedAt:new Date()}}),neighbor=await db.workspace.create({data:{name:'TEST lifecycle neighbor'}});
const key=workspace.id+'/fixture.txt',neighborKey=neighbor.id+'/fixture.txt';
try{await putAsset(key,Buffer.from('fixture'),'text/plain');await putAsset(neighborKey,Buffer.from('neighbor'),'text/plain');
 const run=(args:string[])=>exec(process.execPath,['--env-file=.env','node_modules/tsx/dist/cli.mjs','scripts/workspace-lifecycle.ts','--id',workspace.id,...args],{windowsHide:true});
 await run([]);if(!await db.workspace.findUnique({where:{id:workspace.id}}))throw Error('Dry run mutated workspace');await run(['--restore','--apply']);if((await db.workspace.findUniqueOrThrow({where:{id:workspace.id}})).archivedAt)throw Error('Restore failed');await db.workspace.update({where:{id:workspace.id},data:{archivedAt:new Date()}});await run(['--purge','--confirm',workspace.name,'--apply']);if(await db.workspace.findUnique({where:{id:workspace.id}}))throw Error('Purge did not delete workspace');let removed=false;try{await readAsset(key);}catch{removed=true;}if(!removed||(await readAsset(neighborKey)).toString()!=='neighbor')throw Error('Storage scope failed');const result={passed:true,dryRun:true,restore:true,purge:true,neighborPreserved:true,testFixturesOnly:true};await writeFile('artifacts/lifecycle-smoke.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await db.workspace.deleteMany({where:{id:{in:[workspace.id,neighbor.id]}}});await db.$disconnect();}
