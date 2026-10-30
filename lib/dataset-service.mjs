import Prep from '../public/studio/preprocess.mjs';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const error=(message,status)=>json({error:message},status);
const MAX_BODY=2*1024*1024;
export function checkRequest(request,userId){
 if(!userId)return error('Sign in to save or reopen datasets.',401);
 if(!['GET','HEAD'].includes(request.method)){
  const origin=request.headers.get('origin');
  if(!origin||origin!==new URL(request.url).origin)return error('This action must start from the studio.',403);
  if(request.headers.get('sec-fetch-site')==='cross-site')return error('Cross-site requests are not accepted.',403);
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return error('Send JSON content.',415);
 }
 return null;
}
async function readBody(request){
 if(Number(request.headers.get('content-length'))>MAX_BODY)throw Error('Request is too large.');
 const reader=request.body?.getReader();if(!reader)throw Error('A request body is required.');let total=0,chunks=[];
 while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BODY){await reader.cancel();throw Error('Request is too large.');}chunks.push(value);}
 const bytes=new Uint8Array(total);let offset=0;chunks.forEach(v=>{bytes.set(v,offset);offset+=v.length;});return JSON.parse(new TextDecoder().decode(bytes));
}
function chunksOf(text){const result=[];for(let i=0;i<text.length;i+=60000)result.push(text.slice(i,i+60000));return result;}
async function owned(db,id,owner){return db.prepare('SELECT * FROM datasets WHERE id = ? AND owner_id = ?').bind(id,owner).first();}
async function rawData(db,id,owner){const q=await db.prepare("SELECT c.content FROM dataset_chunks c JOIN datasets d ON d.id=c.dataset_id WHERE d.id=? AND d.owner_id=? AND c.kind='raw' ORDER BY c.position").bind(id,owner).all();return q.results.map(r=>r.content).join('');}
export async function handleDatasets(request,db,userId,id=null){
 const blocked=checkRequest(request,userId);if(blocked)return blocked;
 if(!db)return error('The dataset database is unavailable. Your local work is unchanged.',503);
 try{
  if(!id&&request.method==='GET'){
   const result=await db.prepare('SELECT id,name,row_count,column_count,byte_count,revision,archived,created_at,updated_at,summary_json FROM datasets WHERE owner_id=? ORDER BY updated_at DESC LIMIT 100').bind(userId).all();
   return json({datasets:result.results.map(r=>({...r,summary:r.summary_json?JSON.parse(r.summary_json):null,summary_json:undefined}))});
  }
  if(!id&&request.method==='POST'){
   const body=await readBody(request);if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>100) return error('Give this dataset a name of 1–100 characters.',400);
   const data=Prep.parse(body.csv),byteCount=new TextEncoder().encode(body.csv).length;
   const count=await db.prepare('SELECT COUNT(*) AS n FROM datasets WHERE owner_id=?').bind(userId).first();if(count.n>=50)return error('This workspace supports 50 stored datasets.',409);
   const datasetId=crypto.randomUUID(),now=new Date().toISOString();
   const statements=[db.prepare('INSERT INTO datasets (id,owner_id,name,row_count,column_count,byte_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(datasetId,userId,body.name.trim(),data.rows.length,data.columns.length,byteCount,now,now),...chunksOf(body.csv).map((chunk,i)=>db.prepare('INSERT INTO dataset_chunks (dataset_id,kind,position,content) VALUES (?,?,?,?)').bind(datasetId,'raw',i,chunk))];
   await db.batch(statements);return json({id:datasetId,revision:1,name:body.name.trim()},201);
  }
  if(!id||!/^[0-9a-f-]{36}$/.test(id))return error('Dataset not found.',404);
  const record=await owned(db,id,userId);if(!record)return error('Dataset not found.',404);
  if(request.method==='GET')return json({id:record.id,name:record.name,revision:record.revision,archived:record.archived,csv:await rawData(db,id,userId),config:record.config_json?JSON.parse(record.config_json):null,summary:record.summary_json?JSON.parse(record.summary_json):null});
  if(request.method==='PUT'){
   const body=await readBody(request);if(body.revision!==record.revision)return error('This dataset changed in another tab. Reopen it before saving.',409);
   if(typeof body.archived==='boolean'){
    const result=await db.prepare('UPDATE datasets SET archived=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=?').bind(body.archived?1:0,new Date().toISOString(),id,userId,record.revision).run();
    if(result.meta.changes!==1)return error('This dataset changed in another tab. Reopen it before saving.',409);
    return json({id,revision:record.revision+1,archived:body.archived});
   }
   if(record.archived)return error('Restore this dataset before saving changes.',409);
   if(!body.config||JSON.stringify(body.config).length>20000)return error('Invalid preprocessing settings.',400);
   const prepared=Prep.preprocess(Prep.parse(await rawData(db,id,userId)),body.config);
   const summary={...prepared.audit,outcome:prepared.outcome,features:prepared.features.length};
   // D1 batch is transactional. A compare-and-swap revision makes stale saves fail.
   // Result chunks carry the new revision; a failed CAS cannot replace current data.
   const next=record.revision+1,kind='prepared:'+next;
   const statements=[db.prepare('UPDATE datasets SET config_json=?,summary_json=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=?').bind(JSON.stringify(prepared.config),JSON.stringify(summary),new Date().toISOString(),id,userId,record.revision)];
   chunksOf(JSON.stringify(prepared)).forEach((chunk,i)=>statements.push(db.prepare('INSERT OR IGNORE INTO dataset_chunks (dataset_id,kind,position,content) SELECT id,?,?,? FROM datasets WHERE id=? AND owner_id=? AND revision=? AND config_json=?').bind(kind,i,chunk,id,userId,next,JSON.stringify(prepared.config))));
   const results=await db.batch(statements);if(results[0].meta.changes!==1)return error('This dataset changed in another tab. Reopen it before saving.',409);
   await db.prepare("DELETE FROM dataset_chunks WHERE dataset_id=? AND kind!='raw' AND kind!=? AND EXISTS (SELECT 1 FROM datasets WHERE id=? AND owner_id=? AND revision=?)").bind(id,kind,id,userId,next).run();
   return json({id,revision:next,summary});
  }
  return error('Method not allowed.',405);
 }catch(e){
  // Never log request bodies, dataset values, identity headers, or database errors.
  if(e instanceof SyntaxError)return error('The request is not valid JSON.',400);
  if(e?.message&&(/^(Use |Include |Column |Record |Unexpected |A quoted |Choose |Each |The categorical |Continuous |No usable |More than |Numeric values |“|Request |A request )/.test(e.message)))return error(e.message,400);
  return error('The dataset could not be saved or loaded. Please try again.',500);
 }
}
