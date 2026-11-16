import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import Studio from '@/components/studio';
export const dynamic='force-dynamic';
export default async function Page(){let actor;try{actor=await currentActor();}catch{return <main className="setup-page"><h1>Studio đang chờ dịch vụ</h1><p>Khởi động PostgreSQL và Redis, chạy migration rồi tải lại trang.</p><code>npm run db:migrate</code></main>;}if(!actor)redirect('/login');return <Studio/>;}
