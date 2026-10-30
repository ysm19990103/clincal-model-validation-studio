import {getChatGPTUser} from '../../chatgpt-auth';
export const dynamic='force-dynamic';
export async function GET(){const user=await getChatGPTUser();return Response.json({authenticated:!!user},{headers:{'cache-control':'private, no-store'}});}
