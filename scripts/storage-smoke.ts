import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {S3Client,CreateBucketCommand,DeleteObjectCommand,DeleteBucketCommand} from '@aws-sdk/client-s3';
import {putAsset,readAsset,downloadUrl} from '../src/server/storage';
if(process.env.STORAGE_DRIVER!=='s3')throw new Error('Run with STORAGE_DRIVER=s3 for this isolated smoke test.');
const bucket='studio-smoke-'+randomUUID();process.env.S3_BUCKET=bucket;
const client=new S3Client({endpoint:process.env.S3_ENDPOINT,region:process.env.S3_REGION||'us-east-1',forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY!,secretAccessKey:process.env.S3_SECRET_KEY!}});
const key='test-workspace/test.txt',bytes=Buffer.from('Tài sản kiểm thử riêng tư — tiếng Việt');
await client.send(new CreateBucketCommand({Bucket:bucket}));
try{
  await putAsset(key,bytes,'text/plain; charset=utf-8');
  if(!(await readAsset(key)).equals(bytes))throw new Error('S3 read mismatch');
  const signed=await downloadUrl(key),response=await fetch(signed);if(!response.ok||!Buffer.from(await response.arrayBuffer()).equals(bytes))throw new Error('Signed download failed');
  const anonymous=await fetch(process.env.S3_ENDPOINT+'/'+bucket+'/'+key);if(anonymous.ok)throw new Error('Private object readable anonymously');
  await mkdir('artifacts',{recursive:true});await writeFile('artifacts/storage-smoke.json',JSON.stringify({passed:true,provider:'Local MinIO',put:true,read:true,signedDownload:true,anonymousDenied:true,testFixture:true,checkedAt:new Date().toISOString()},null,2));
  console.log('PASS: MinIO put/read/signed URL, anonymous access denied.');
}finally{await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));await client.send(new DeleteBucketCommand({Bucket:bucket}));client.destroy();}
