import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {handleDatasets} from '../../../../lib/dataset-service.mjs';
export const dynamic='force-dynamic';
async function handle(request:Request,context:{params:Promise<{id:string}>}){const user=await getChatGPTUser();const {id}=await context.params;return handleDatasets(request,env.DB,user?.userId,id);}
export const GET=handle;export const PUT=handle;
