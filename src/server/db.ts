import { PrismaClient } from '@prisma/client';
import {AsyncLocalStorage} from 'node:async_hooks';
import {invariant} from '../domain/errors';
type TenantEntry={client:PrismaClient;active:number;used:number;verified:boolean};
const globalDB = globalThis as unknown as { prisma?: PrismaClient;tenantContext?:AsyncLocalStorage<PrismaClient>;tenantClients?:Map<string,TenantEntry> };
const adminUrl=new URL(process.env.DATABASE_URL||'postgresql://localhost/studio');if(!adminUrl.searchParams.has('connection_limit'))adminUrl.searchParams.set('connection_limit','8');
export const adminDb = globalDB.prisma ?? new PrismaClient({datasourceUrl:adminUrl.href,transactionOptions:{maxWait:10000,timeout:15000}});
if (process.env.NODE_ENV !== 'production') globalDB.prisma = adminDb;
const context=globalDB.tenantContext??=new AsyncLocalStorage<PrismaClient>();
const tenants=globalDB.tenantClients??=new Map<string,TenantEntry>();
// Authentication and the trusted worker use adminDb. Authenticated tenant routes use a
// separate NOBYPASSRLS login, with immutable tenant settings on every pooled connection.
export const db=new Proxy(adminDb,{get(target,key){const client=context.getStore()||target,value=Reflect.get(client,key);return typeof value==='function'?value.bind(client):value;}});
export async function withTenant<T>(workspaceId:string,work:()=>Promise<T>):Promise<T>{
 const base=process.env.TENANT_DATABASE_URL;
 if(!base){invariant(process.env.RLS_REQUIRED!=='true'&&process.env.NODE_ENV!=='production','RLS_CONFIG','Thiếu TENANT_DATABASE_URL cho chế độ RLS.',503);return work();}
 invariant(/^[A-Za-z0-9_-]{1,100}$/.test(workspaceId),'TENANT_ID','Workspace ID không hợp lệ.');
 let entry=tenants.get(workspaceId);
 if(!entry){if(tenants.size>=16){const idle=[...tenants.entries()].filter(([,e])=>e.active===0).sort((a,b)=>a[1].used-b[1].used)[0];invariant(idle,'TENANT_CAPACITY','Máy chủ đang bận, thử lại sau.',503);tenants.delete(idle[0]);await idle[1].client.$disconnect();}const url=new URL(base);url.searchParams.set('options','-c app.workspace_id='+workspaceId);url.searchParams.set('connection_limit','2');entry={client:new PrismaClient({datasourceUrl:url.href,transactionOptions:{maxWait:10000,timeout:15000}}),active:0,used:Date.now(),verified:false};tenants.set(workspaceId,entry);}
 entry.active++;entry.used=Date.now();try{if(!entry.verified){const roles=await entry.client.$queryRaw<{rolsuper:boolean;rolbypassrls:boolean}[]>`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;invariant(roles[0]&&!roles[0].rolsuper&&!roles[0].rolbypassrls,'RLS_ROLE','Tenant role không được có SUPERUSER/BYPASSRLS.',503);entry.verified=true;}return await context.run(entry.client,work);}finally{entry.active--;}
}
export async function closeTenantClients(){await Promise.all([...tenants.values()].map(e=>e.client.$disconnect()));tenants.clear();}
