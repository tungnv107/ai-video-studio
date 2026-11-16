import { AppError,invariant } from '../domain/errors';
export async function platformFetch(url:string,init:RequestInit={},fetcher:typeof fetch=fetch){
  try{const response=await fetcher(url,{...init,redirect:'error',signal:AbortSignal.timeout(120000)});
    if(!response.ok&&response.status!==308)throw new AppError(response.status===429?'PLATFORM_RATE_LIMIT':'PLATFORM_HTTP','Nền tảng trả HTTP '+response.status+'.',502,response.status===429);
    return response;
  }catch(error){if(error instanceof AppError)throw error;throw new AppError('PLATFORM_UNKNOWN','Mất kết nối với nền tảng. Cần đối soát trạng thái trước khi gửi lại.',502);}
}
export function trustedUploadUrl(value:string,platform:'youtube'|'tiktok'){
  const url=new URL(value),valid=platform==='youtube'?(url.hostname==='www.googleapis.com'||url.hostname==='upload.youtube.com'):(['open-upload.tiktokapis.com','upload.us.tiktokapis.com','upload.eu.tiktokapis.com'].includes(url.hostname)||url.hostname.endsWith('.upload.tiktokapis.com'));
  invariant(url.protocol==='https:'&&valid&&!url.username&&!url.password&&!url.port,'UPLOAD_HOST','Nền tảng trả upload URL ngoài danh sách cho phép.',502);return value;
}
export class YouTubeAdapter {
  constructor(private token:string,private fetcher:typeof fetch=fetch){}
  private headers(){return {Authorization:'Bearer '+this.token};}
  async initialize(meta:{title:string;description:string;tags:string[];privacy:string;publishAt?:string;synthetic:boolean;madeForKids:boolean},size:number){
    if(meta.publishAt) invariant(meta.privacy==='private'&&new Date(meta.publishAt)>new Date(),'YOUTUBE_SCHEDULE','Hẹn giờ yêu cầu video mới, riêng tư và thời điểm tương lai.');
    const r=await platformFetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{method:'POST',headers:{...this.headers(),'Content-Type':'application/json','X-Upload-Content-Length':String(size),'X-Upload-Content-Type':'video/mp4'},body:JSON.stringify({snippet:{title:meta.title,description:meta.description,tags:meta.tags,categoryId:'27'},status:{privacyStatus:meta.privacy,containsSyntheticMedia:meta.synthetic,selfDeclaredMadeForKids:meta.madeForKids,...(meta.publishAt?{publishAt:meta.publishAt}:{})}})},this.fetcher);
    const location=r.headers.get('location');invariant(location,'UPLOAD_SESSION','YouTube không trả upload session.',502);return trustedUploadUrl(location,'youtube');
  }
  async resume(session:string,bytes:Buffer){
    trustedUploadUrl(session,'youtube');
    const check=await platformFetch(session,{method:'PUT',headers:{...this.headers(),'Content-Length':'0','Content-Range':'bytes */'+bytes.length}},this.fetcher);
    if(check.status!==308)return check.json();
    const range=check.headers.get('range'),start=range?Number(range.match(/-(\d+)$/)?.[1])+1:0;
    invariant(Number.isFinite(start)&&start<bytes.length,'UPLOAD_RANGE','Cần đối soát upload range.',409);
    const response=await platformFetch(session,{method:'PUT',headers:{...this.headers(),'Content-Type':'video/mp4','Content-Length':String(bytes.length-start),'Content-Range':`bytes ${start}-${bytes.length-1}/${bytes.length}`},body:new Uint8Array(bytes.subarray(start))},this.fetcher);
    invariant(response.status!==308,'UPLOAD_INCOMPLETE','Upload chưa hoàn tất; giữ session để tiếp tục.',502);return response.json();
  }
  async status(id:string){const r=await platformFetch('https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails,statistics&id='+encodeURIComponent(id),{headers:this.headers()},this.fetcher);const data=await r.json();invariant(data.items?.[0],'REMOTE_NOT_FOUND','Không tìm thấy video trên YouTube.',404);return data.items[0];}
  async thumbnail(id:string,bytes:Buffer){invariant(bytes.length<=2_000_000,'THUMBNAIL_SIZE','Thumbnail YouTube tối đa 2 MB.');await platformFetch('https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId='+encodeURIComponent(id)+'&uploadType=media',{method:'POST',headers:{...this.headers(),'Content-Type':'image/jpeg','Content-Length':String(bytes.length)},body:new Uint8Array(bytes)},this.fetcher);}
  async analytics(id:string,start:string,end:string){const query=new URLSearchParams({ids:'channel==MINE',startDate:start,endDate:end,metrics:'views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares',filters:'video=='+id});const response=await platformFetch('https://youtubeanalytics.googleapis.com/v2/reports?'+query,{headers:this.headers()},this.fetcher);return response.json();}
}
export function tiktokChunks(size:number){invariant(Number.isSafeInteger(size)&&size>0&&size<=4_000_000_000,'TIKTOK_SIZE','TikTok yêu cầu file từ 1 byte đến 4 GB.');const chunkSize=size<=64_000_000?size:10_000_000,count=Math.floor(size/chunkSize);return {chunkSize,count,chunks:Array.from({length:count},(_,i)=>({start:i*chunkSize,end:i===count-1?size-1:(i+1)*chunkSize-1}))};}
export type CreatorInfo={creator_username:string;creator_nickname:string;privacy_level_options:string[];comment_disabled:boolean;duet_disabled:boolean;stitch_disabled:boolean;max_video_post_duration_sec:number};
export class TikTokAdapter{
  constructor(private token:string,private fetcher:typeof fetch=fetch){}
  async call(endpoint:string,body:unknown){
    const r=await platformFetch('https://open.tiktokapis.com/v2/'+endpoint,{method:'POST',headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json; charset=UTF-8'},body:JSON.stringify(body)},this.fetcher),data=await r.json();
    invariant(data.error?.code==='ok','TIKTOK_API','TikTok từ chối yêu cầu: '+String(data.error?.code||'unknown'),502);return data.data;
  }
  async creator():Promise<CreatorInfo>{return this.call('post/publish/creator_info/query/',{});}
  async initialize(input:{title:string;privacy:string;disableComment:boolean;disableDuet:boolean;disableStitch:boolean;synthetic:boolean;brandContent:boolean;brandOrganic:boolean;mode:'DIRECT'|'UPLOAD';size:number},creator?:CreatorInfo){
    if(input.mode==='DIRECT'){
      invariant(creator,'CREATOR_REQUIRED','Cần creator_info mới nhất.');
      invariant(process.env.TIKTOK_DIRECT_POST_ENABLED==='true','DIRECT_POST_DISABLED','Direct Post chưa được bật/đủ điều kiện.',409);
      invariant(creator?.privacy_level_options.includes(input.privacy),'TIKTOK_PRIVACY','Quyền riêng tư không có trong creator_info mới nhất.');
      invariant(!creator.comment_disabled||input.disableComment,'TIKTOK_COMMENT','Tài khoản đã tắt comment.');
      invariant(!creator.duet_disabled||input.disableDuet,'TIKTOK_DUET','Tài khoản đã tắt duet.');
      invariant(!creator.stitch_disabled||input.disableStitch,'TIKTOK_STITCH','Tài khoản đã tắt stitch.');
      invariant(!input.brandContent||input.privacy!=='SELF_ONLY','TIKTOK_BRAND','Nội dung quảng bá đối tác không thể SELF_ONLY.');
    }
    const plan=tiktokChunks(input.size);
    const endpoint=input.mode==='DIRECT'?'post/publish/video/init/':'post/publish/inbox/video/init/';
    const body={source_info:{source:'FILE_UPLOAD',video_size:input.size,chunk_size:plan.chunkSize,total_chunk_count:plan.count},...(input.mode==='DIRECT'?{post_info:{title:input.title,privacy_level:input.privacy,disable_comment:input.disableComment,disable_duet:input.disableDuet,disable_stitch:input.disableStitch,is_aigc:input.synthetic,brand_content_toggle:input.brandContent,brand_organic_toggle:input.brandOrganic}}:{})};
    const data=await this.call(endpoint,body);invariant(data.publish_id&&data.upload_url,'TIKTOK_INIT','TikTok không trả publish ID/upload URL.',502);trustedUploadUrl(data.upload_url,'tiktok');return data as {publish_id:string;upload_url:string};
  }
  async upload(url:string,bytes:Buffer,startAt=0,onProgress:(offset:number)=>Promise<void>=async()=>{}){
   trustedUploadUrl(url,'tiktok');const plan=tiktokChunks(bytes.length);invariant(startAt===bytes.length||plan.chunks.some(c=>c.start===startAt),'UPLOAD_OFFSET','Offset không nằm ở ranh giới chunk.',409);
   for(const chunk of plan.chunks.filter(c=>c.start>=startAt)){let completed=false;for(let attempt=0;attempt<3&&!completed;attempt++){
    let r:Response;try{r=await this.fetcher(url,{method:'PUT',redirect:'error',signal:AbortSignal.timeout(120000),headers:{'Content-Type':'video/mp4','Content-Length':String(chunk.end-chunk.start+1),'Content-Range':`bytes ${chunk.start}-${chunk.end}/${bytes.length}`},body:new Uint8Array(bytes.subarray(chunk.start,chunk.end+1))});}catch{if(attempt<2)continue;throw new AppError('PLATFORM_UNKNOWN','Chunk chưa xác định; giữ session và offset để đối soát.',502);}
    if(r.status>=500&&attempt<2)continue;
    const acknowledged=r.headers.get('content-range')?.match(/^bytes\s+0-(\d+)\/(\d+)$/i);
    invariant(r.ok||(r.status===416&&acknowledged&&Number(acknowledged[1])===chunk.end&&Number(acknowledged[2])===bytes.length),'UPLOAD_CHUNK','TikTok chưa xác nhận chunk; cần đối soát.',502);
    await onProgress(chunk.end+1);completed=true;
   }}
  }
  async status(id:string){return this.call('post/publish/status/fetch/',{publish_id:id});}
  async metrics(ids:string[]){invariant(ids.length>0&&ids.length<=20,'METRICS_IDS','Tối đa 20 video mỗi lần.');return this.call('video/query/?fields=id,view_count,like_count,comment_count,share_count',{filters:{video_ids:ids}});}
}
export function youtubeState(video:{status:{privacyStatus?:string;publishAt?:string;uploadStatus?:string};processingDetails?:{processingStatus?:string}}){
  if(video.status.uploadStatus==='failed'||video.status.uploadStatus==='rejected'||video.processingDetails?.processingStatus==='failed')return 'FAILED';
  if(video.status.privacyStatus==='public'&&video.status.uploadStatus==='processed')return 'PUBLISHED';
  if(video.status.publishAt)return 'PLATFORM_SCHEDULED';
  if(video.status.uploadStatus==='processed')return 'UPLOADED_PRIVATE';
  return 'PLATFORM_PROCESSING';
}
