import {currentActor} from '@/server/auth';
import Studio from '@/components/studio';
import Login from '@/components/login';
export const dynamic='force-dynamic';
export default async function JoinPage(){return await currentActor()?<Studio/>:<Login/>;}
