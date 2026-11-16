'use client';

export default function ProviderModelHelp({baseUrl}:{baseUrl?:string}){
  return <div className="note"><div><strong>Dùng 9router với Codex và Edge TTS</strong><p>Nhập Base URL HTTPS của relay đã được quản trị viên cho phép. Model ảnh cần tiền tố <code>cx/</code>; model giọng Việt là <code>edge-tts/vi-VN-HoaiMyNeural</code> (nữ) hoặc <code>edge-tts/vi-VN-NamMinhNeural</code> (nam). Giọng được chọn theo model TTS, thay cho giọng OpenAI của kênh.</p><button className="button" type="button" onClick={e=>{
    const form=e.currentTarget.closest('form');if(!form)return;
    const url=form.elements.namedItem('baseUrl');
    if(url instanceof HTMLInputElement&&url.value.startsWith('https://api.openai.com')){url.value='';url.placeholder='https://relay-cua-ban.example/v1';}
    for(const [name,value] of Object.entries({kind:'OPENAI',llmModel:'cx/gpt-6-luna',imageModel:'cx/gpt-image-2.5-flare',ttsModel:'edge-tts/vi-VN-HoaiMyNeural',timeoutMs:'300000'})){
      const input=form.elements.namedItem(name);if(input instanceof HTMLInputElement||input instanceof HTMLSelectElement)input.value=value;
    }
  }} disabled={!!baseUrl&&baseUrl.startsWith('https://api.openai.com')}>Điền model Codex + giọng Việt</button><p className="muted">Dùng Base URL và key của relay. Kiểm tra model có trong tài khoản kết nối trước khi lưu. ChatGPT Plus và OpenAI API có thanh toán riêng; điền API key không tự chuyển gói Plus thành API credit.</p></div></div>;
}
