export async function clientApi<T=unknown>(path:string,method='GET',data?:unknown):Promise<T>{
  const response=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json',...(method==='POST'?{'Idempotency-Key':crypto.randomUUID()}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})});
  const result=await response.json();if(!response.ok)throw new Error(result.error?.message||'Yêu cầu không thành công.');return result;
}
