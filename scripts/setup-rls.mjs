import {randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {PrismaClient} from '@prisma/client';
const db=new PrismaClient(),password=process.env.TENANT_DB_PASSWORD||randomBytes(32).toString('hex');
if(!/^[A-Za-z0-9_-]{20,128}$/.test(password))throw new Error('TENANT_DB_PASSWORD must be 20–128 URL-safe characters.');
try{
 await db.$executeRawUnsafe(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='studio_tenant') THEN CREATE ROLE studio_tenant LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF; END $$`);
 await db.$executeRawUnsafe(`ALTER ROLE studio_tenant WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${password}'`);
 await db.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO studio_tenant');
 const direct=['WorkspaceOAuthApp','OAuthState','WorkspaceMember','WorkspaceInvitation','ContentChannel','AIProvider','VideoProject','Script','GeneratedAsset','ProductionJob','ScriptEditJob','ScheduleRule','CostUsage','VideoTemplate','SocialAccount','Notification','AuditLog','ContentTopic','ContentIdea','VoiceProfile','BrandKit','MediaItem','Campaign','Experiment','AutomationTask'];
 const tenant="current_setting('app.workspace_id', true)";
 const policies=new Map(direct.map(table=>[table,`"workspaceId" = ${tenant}`]));
 policies.set('Workspace',`"id" = ${tenant}`);
 policies.set('User',`EXISTS (SELECT 1 FROM "WorkspaceMember" m WHERE m."userId"="User"."id" AND m."workspaceId"=${tenant})`);
 policies.set('Session',`"workspaceId" = ${tenant}`);
 const children={AIModelConfig:['AIProvider','providerId'],VideoScene:['VideoProject','projectId'],ApprovalRequest:['VideoProject','projectId'],ResearchSource:['VideoProject','projectId'],ScriptVersion:['Script','scriptId'],AudioAsset:['GeneratedAsset','assetId'],RenderJob:['ProductionJob','productionJobId'],ScheduledOccurrence:['ScheduleRule','scheduleId'],SocialAccountCredential:['SocialAccount','socialAccountId'],PublishedPost:['PublishingJob','publishingJobId'],PlatformMetricSnapshot:['PublishedPost','postId']};
 for(const [table,[parent,fk]] of Object.entries(children))policies.set(table,`EXISTS (SELECT 1 FROM "${parent}" p WHERE p."id"="${table}"."${fk}")`);
 policies.set('PublishingJob','EXISTS (SELECT 1 FROM "VideoProject" p WHERE p."id"="PublishingJob"."projectId") AND EXISTS (SELECT 1 FROM "SocialAccount" a WHERE a."id"="PublishingJob"."socialAccountId")');
 for(const [table,expression] of policies){await db.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);await db.$executeRawUnsafe(`DROP POLICY IF EXISTS studio_tenant_isolation ON "${table}"`);await db.$executeRawUnsafe(`CREATE POLICY studio_tenant_isolation ON "${table}" TO studio_tenant USING (${expression}) WITH CHECK (${expression})`);await db.$executeRawUnsafe(`GRANT ${table==='User'?'SELECT':'SELECT,INSERT,UPDATE,DELETE'} ON "${table}" TO studio_tenant`);}
 if(process.argv.includes('--write-env')){const url=new URL(process.env.DATABASE_URL);url.username='studio_tenant';url.password=password;let env=await readFile('.env','utf8');for(const [key,value] of Object.entries({TENANT_DB_PASSWORD:password,TENANT_DATABASE_URL:url.href,RLS_REQUIRED:'true'})){const line=key+'='+value;env=new RegExp('^'+key+'=.*$','m').test(env)?env.replace(new RegExp('^'+key+'=.*$','m'),line):env+'\n'+line;}await writeFile('.env',env);}
 console.log(JSON.stringify({rls:true,role:'studio_tenant',tables:policies.size,secretsPrinted:false}));
}finally{await db.$disconnect();}
