import { readFile,writeFile,access,mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
try{await access('.env');console.log('.env đã tồn tại; không ghi đè.');process.exit(0);}catch{}
const tenantPassword=randomBytes(24).toString('hex');
const password=randomBytes(24).toString('hex'),storagePassword=randomBytes(24).toString('hex');
let env=await readFile('.env.example','utf8');
env=env.replace('ENCRYPTION_KEY=','ENCRYPTION_KEY='+randomBytes(32).toString('base64')).replace('TENANT_DB_PASSWORD=CHANGE_ME','TENANT_DB_PASSWORD='+tenantPassword).replace('studio_tenant:CHANGE_ME','studio_tenant:'+tenantPassword).replaceAll('CHANGE_ME',password).replace('S3_SECRET_KEY='+password,'S3_SECRET_KEY='+storagePassword).replace('MINIO_ROOT_PASSWORD='+password,'MINIO_ROOT_PASSWORD='+storagePassword);
await writeFile('.env',env,{mode:0o600});await mkdir('data',{recursive:true});
console.log('Đã tạo .env với secrets ngẫu nhiên. Không in secrets ra console.');
