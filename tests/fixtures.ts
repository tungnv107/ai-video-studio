import type {ScriptData} from '../src/domain/schemas';
export const fixtureScript:ScriptData={
  script_id:'test-only-fixture',title:'Video kiểm thử kỹ thuật',topic:'Kiểm thử',target_audience:'Người kiểm thử',language:'vi',
  target_duration:10,tone:'Giải thích',hook:'Đây là video kiểm thử.',full_narration:'Đây là video kiểm thử. Hình ảnh và âm thanh chỉ là dữ liệu thử nghiệm.',
  scenes:[
    {scene_id:'s1',scene_order:1,duration_seconds:5,narration_text:'Đây là video kiểm thử tiếng Việt có dấu.',visual_description:'Màu xanh',image_generation_prompt:'Test fixture blue gradient',video_generation_prompt:'',camera_motion:'zoom-in',transition:'cut',on_screen_text:'Kiểm thử',subtitle_segments:[],background_music_hint:'',visual_asset_source:'TEST_FIXTURE'},
    {scene_id:'s2',scene_order:2,duration_seconds:5,narration_text:'Hình ảnh và âm thanh chỉ là dữ liệu thử nghiệm.',visual_description:'Màu tím',image_generation_prompt:'Test fixture purple gradient',video_generation_prompt:'',camera_motion:'zoom-out',transition:'cut',on_screen_text:'Tiếng Việt',subtitle_segments:[],background_music_hint:'',visual_asset_source:'TEST_FIXTURE'}
  ],closing_cta:'Kết thúc kiểm thử.',source_references:[],compliance_flags:['TEST_FIXTURE','HUMAN_FACT_REVIEW'],estimated_cost:0
};
