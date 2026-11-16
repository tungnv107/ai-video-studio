export function speechVoice(model:string,channelVoice:string){
  return model.startsWith('edge-tts/')?model.slice('edge-tts/'.length):channelVoice;
}
