import { db } from '../src/server/db';
import { templates } from '../src/server/templates';
for(const workspace of await db.workspace.findMany()){
  for(const t of templates) await db.videoTemplate.upsert({where:{workspaceId_slug_version:{workspaceId:workspace.id,slug:t.slug,version:1}},create:{workspaceId:workspace.id,slug:t.slug,name:t.name,config:t},update:{}});
}
console.log('Seed templates hoàn tất. Không tạo user mặc định, dữ liệu AI hoặc số liệu xuất bản giả.');
await db.$disconnect();
