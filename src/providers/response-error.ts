import {AppError} from '../domain/errors';

// Inspect a bounded error body only to classify known failures. Never surface raw
// upstream text: relays can include credentials, prompts or internal URLs in it.
async function errorHint(response:Response):Promise<string>{
  const reader=response.body?.getReader();if(!reader)return '';
  const chunks:Uint8Array[]=[];let length=0;
  try{while(length<4096){const {done,value}=await reader.read();if(done)break;const part=value.subarray(0,4096-length);chunks.push(part);length+=part.length;}}
  catch{return '';}
  finally{void reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks).toString('utf8');
}
export async function providerResponseError(response:Response,endpoint:string,model:unknown){
  const step=({'/images/generations':'Tạo ảnh','/audio/speech':'Giọng đọc','/chat/completions':'Viết nội dung','/embeddings':'Embeddings'} as Record<string,string>)[endpoint]||'AI';
  const name=typeof model==='string'&&/^[\w./:-]{1,100}$/.test(model)?model:'model đã cấu hình';
  const context=`${step} (${name}, HTTP ${response.status}): `,hint=await errorHint(response);
  if(response.status===429)return new AppError('PROVIDER_RATE_LIMIT',context+'provider giới hạn lượt gọi hoặc quota.',429,true);
  if(response.status>=500)return new AppError('PROVIDER_UNKNOWN',context+'provider trả lỗi máy chủ; kết quả và chi phí chưa xác định.',502);
  let reason='provider từ chối yêu cầu. Kiểm tra model, API key và quyền sử dụng.';
  if(/no credentials (?:found )?for provider|no available (?:accounts|connections|credentials)/i.test(hint))reason='relay chưa có tài khoản kết nối cho tuyến model này. Kiểm tra tiền tố provider/model và kết nối trong relay; ảnh Codex dùng cx/<model ảnh>, Edge TTS dùng edge-tts/<tên giọng>.';
  else if(response.status===401)reason='API key không hợp lệ hoặc đã hết hạn.';
  else if(response.status===403)reason='tài khoản chưa có quyền sử dụng model này.';
  else if(/invalid model format|model_not_found|unknown model|unsupported model|model[^\n]{0,80}(?:not found|does not exist)/i.test(hint))reason='model không tồn tại hoặc định tuyến không đúng. Kiểm tra tên model và tiền tố provider/model của relay.';
  return new AppError('PROVIDER_REJECTED',context+reason,502);
}
