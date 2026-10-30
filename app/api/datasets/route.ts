import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {handleDatasets} from '../../../lib/dataset-service.mjs';
export const dynamic='force-dynamic';
async function handle(request:Request){const user=await getChatGPTUser();return handleDatasets(request,env.DB,user?.userId);}
export const GET=handle;export const POST=handle;
