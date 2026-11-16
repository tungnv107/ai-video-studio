import { mkdir, readFile, writeFile, stat,rm,realpath,lstat } from 'node:fs/promises';
import path from 'node:path';
import { S3Client,PutObjectCommand,GetObjectCommand,HeadBucketCommand,DeleteObjectCommand,ListObjectsV2Command,DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config';
import { invariant } from '../domain/errors';
let s3:S3Client|undefined,signingClient:S3Client|undefined;
function createClient(endpoint?:string){return new S3Client({region:process.env.S3_REGION||'us-east-1',endpoint,forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY||'',secretAccessKey:process.env.S3_SECRET_KEY||''}});}
function client(){ return s3 ??= createClient(process.env.S3_INTERNAL_ENDPOINT||process.env.S3_ENDPOINT); }
export function storagePath(key:string) {
  invariant(/^[a-zA-Z0-9/_\-.]+$/.test(key) && !key.split('/').includes('..') && !path.isAbsolute(key),'STORAGE_KEY','Đường dẫn tài sản không hợp lệ.');
  const result=path.resolve(config.storageDir,key); invariant(result.startsWith(config.storageDir+path.sep),'STORAGE_KEY','Đường dẫn không hợp lệ.'); return result;
}
export async function putAsset(key:string,data:Buffer,mime:string) {
  if(config.storageDriver==='s3') await client().send(new PutObjectCommand({Bucket:process.env.S3_BUCKET,Key:key,Body:data,ContentType:mime}));
  else { const file=storagePath(key); await mkdir(path.dirname(file),{recursive:true}); await writeFile(file,data); }
}
export async function readAsset(key:string) {
  if(config.storageDriver==='s3') { const r=await client().send(new GetObjectCommand({Bucket:process.env.S3_BUCKET,Key:key})); return Buffer.from(await r.Body!.transformToByteArray()); }
  return readFile(storagePath(key));
}
export async function downloadUrl(key:string) { return getSignedUrl(signingClient??=createClient(process.env.S3_ENDPOINT),new GetObjectCommand({Bucket:process.env.S3_BUCKET,Key:key}),{expiresIn:300}); }
export async function storageHealth() { if(config.storageDriver==='s3') await client().send(new HeadBucketCommand({Bucket:process.env.S3_BUCKET})); else {await mkdir(config.storageDir,{recursive:true});await stat(config.storageDir);} }
export async function deleteAsset(workspaceId:string,key:string){invariant(/^[A-Za-z0-9_-]+$/.test(workspaceId)&&key.startsWith(workspaceId+'/'),'STORAGE_OWNER','Tài sản nằm ngoài workspace.');storagePath(key);if(config.storageDriver==='s3')await client().send(new DeleteObjectCommand({Bucket:process.env.S3_BUCKET,Key:key}));else await rm(storagePath(key),{force:true});}
export async function purgeWorkspaceStorage(workspaceId:string){invariant(/^[A-Za-z0-9_-]{1,100}$/.test(workspaceId),'STORAGE_OWNER','Workspace ID không hợp lệ.');if(config.storageDriver==='s3'){for(let i=0;i<1000;i++){const page=await client().send(new ListObjectsV2Command({Bucket:process.env.S3_BUCKET,Prefix:workspaceId+'/',MaxKeys:1000}));if(!page.Contents?.length)return;const objects=page.Contents.map(o=>({Key:o.Key!}));invariant(objects.every(o=>o.Key.startsWith(workspaceId+'/')),'STORAGE_OWNER','S3 prefix không hợp lệ.');const result=await client().send(new DeleteObjectsCommand({Bucket:process.env.S3_BUCKET,Delete:{Objects:objects}}));invariant(!result.Errors?.length,'STORAGE_DELETE','S3 chưa xóa hết tài sản.');}throw new Error('Purge limit reached; rerun to continue.');}else{const target=storagePath(workspaceId);try{const info=await lstat(target);invariant(info.isDirectory()&&!info.isSymbolicLink(),'STORAGE_OWNER','Đường dẫn purge không phải thư mục thật.');const actual=await realpath(target),root=await realpath(config.storageDir);invariant(actual.startsWith(root+path.sep)&&path.basename(actual)===workspaceId,'STORAGE_OWNER','Đường dẫn purge nằm ngoài workspace.');await rm(actual,{recursive:true,force:true});}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}}
