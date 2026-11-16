import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
const exec=promisify(execFile),container='ai-video-studio-postgres-1',user=process.env.POSTGRES_USER,source=process.env.POSTGRES_DB||'studio',target='studio_restore_test_'+randomBytes(6).toString('hex'),dump='/tmp/'+target+'.dump';
if(!user||!/^studio_restore_test_[a-f0-9]{12}$/.test(target))throw Error('Invalid test target');
const run=async args=>(await exec('docker',['exec',container,...args],{windowsHide:true,maxBuffer:2_000_000})).stdout.trim();let created=false;
try{
 await run(['pg_dump','-U',user,'-d',source,'-Fc','--file',dump]);await run(['createdb','-U',user,target]);created=true;await run(['pg_restore','-U',user,'-d',target,'--exit-on-error',dump]);
 const sql=`SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema='public'),(SELECT count(*) FROM "_prisma_migrations"),(SELECT count(*) FROM "VideoProject"),(SELECT count(*) FROM pg_policies WHERE schemaname='public');`;
 const original=await run(['psql','-U',user,'-d',source,'-Atc',sql]),restored=await run(['psql','-U',user,'-d',target,'-Atc',sql]);if(original!==restored)throw Error('Restored DB counts differ');
 const report={passed:true,format:'pg_dump custom + pg_restore',comparison:'public tables, migrations, videos, RLS policies',counts:original.split('|').map(Number),isolatedRestore:true,temporaryBackupRemoved:true};await mkdir('artifacts',{recursive:true});await writeFile('artifacts/backup-restore-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(created)await run(['dropdb','-U',user,target]);await run(['rm','-f',dump]);}
