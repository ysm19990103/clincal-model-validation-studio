'use strict';
const MAX_BYTES=1024*1024, MAX_ROWS=5000, MAX_COLS=60;
const missing=v=>v==null||['','na','n/a','null','nan'].includes(String(v).trim().toLowerCase());
const numeric=v=>!missing(v)&&/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(String(v).trim())&&Number.isFinite(Number(v));
const median=a=>{a=[...a].sort((x,y)=>x-y);const h=Math.floor(a.length/2);return a.length%2?a[h]:(a[h-1]+a[h])/2;};
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const sorted=a=>[...new Set(a)].sort((a,b)=>a<b?-1:a>b?1:0);
const mode=a=>{const c=new Map();a.forEach(v=>c.set(v,(c.get(v)||0)+1));return [...c].sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:1))[0]?.[0];};
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function parse(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)throw Error('Use a UTF-8 CSV no larger than 1 MB.');
 text=text.replace(/^\uFEFF/,'');let table=[],row=[],cell='',quoted=false,closed=false;
 const push=()=>{row.push(cell);if(row.some(v=>v.trim()))table.push(row);row=[];cell='';closed=false;if(table.length>MAX_ROWS+1)throw Error('Use at most 5,000 rows.');};
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
 else if(c==='"'){if(cell.trim()||closed)throw Error('Unexpected quote in CSV.');cell='';quoted=true;}
 else if(c===','){row.push(cell);cell='';closed=false;if(row.length>=MAX_COLS)throw Error('Use at most 60 columns.');}
 else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;push();}
 else{if(closed&&c.trim())throw Error('Unexpected text after a quoted field.');cell+=c;}}
 if(quoted)throw Error('A quoted CSV field was not closed.');push();
 if(table.length<3)throw Error('Include a header and at least two data rows.');
 const columns=table.shift().map(v=>v.trim());
 if(columns.length<2||columns.length>MAX_COLS)throw Error('Use between 2 and 60 columns.');
 if(columns.some(v=>!v||v.length>100)||new Set(columns).size!==columns.length)throw Error('Column names must be nonempty, unique, and at most 100 characters.');
 const rows=table.map((r,i)=>{if(r.length!==columns.length)throw Error(`Record ${i+2} has the wrong number of fields.`);return r.map(v=>{v=v.trim();if(v.length>500)throw Error(`Record ${i+2} has a cell longer than 500 characters.`);return v;});});
 return {columns,rows};
}
function profile(data){return data.columns.map((name,j)=>{const values=data.rows.map(r=>r[j]),present=values.filter(v=>!missing(v));return{name,index:j,missing:values.length-present.length,unique:new Set(present).size,type:present.length&&present.every(numeric)?'numeric':'categorical',examples:sorted(present).slice(0,3)};});}
function outcomeLevels(data,index){return sorted(data.rows.map(r=>r[index]).filter(v=>!missing(v)));}
function preprocess(data,config){
 if(config.outcome===null||config.outcome===undefined||config.outcome==='')throw Error('Choose an outcome column.');
 const oi=Number(config.outcome);
 if(!Number.isInteger(oi)||oi<0||oi>=data.columns.length)throw Error('Choose an outcome column.');
 const seed=Number(config.seed??42), testFraction=Number(config.testFraction??0.2);
 if(!Number.isInteger(seed)||seed<1||seed>999999)throw Error('Use a seed between 1 and 999,999.');
 if(![0.2,0.3].includes(testFraction))throw Error('Choose a 20% or 30% holdout.');
 const choices=data.columns.map((_,j)=>config.predictors?.[j]??{include:true,type:profile(data)[j].type});
 for(let j=0;j<choices.length;j++)if(j!==oi&&choices[j].include&&!['numeric','categorical'].includes(choices[j].type))throw Error('Each predictor must be numeric or categorical.');
 let droppedOutcome=0,duplicates=0;const seen=new Set(),valid=[];
 data.rows.forEach((values,index)=>{if(missing(values[oi])){droppedOutcome++;return;}const key=JSON.stringify(values);if(seen.has(key)){duplicates++;if(config.removeDuplicates)return;}seen.add(key);valid.push({index,values,label:String(values[oi])});});
 const classes=sorted(valid.map(r=>r.label));
 if(classes.length<2||classes.length>20)throw Error('The categorical outcome needs 2–20 distinct nonmissing levels. Continuous outcomes must be categorized deliberately before import.');
 const counts=classes.map(c=>valid.filter(r=>r.label===c).length);
 if(counts.some(n=>n<2))throw Error('Each outcome category needs at least two rows for a stratified split.');
 const random=rng(seed),testIds=new Set();
 classes.forEach(c=>{const ids=valid.filter(r=>r.label===c).map(r=>r.index);for(let i=ids.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}ids.slice(0,Math.max(1,Math.min(ids.length-1,Math.round(ids.length*testFraction)))).forEach(i=>testIds.add(i));});
 const training=valid.filter(r=>!testIds.has(r.index)),test=valid.filter(r=>testIds.has(r.index));
 const transforms=[],dropped=[],audit=[],features=[];
 choices.forEach((choice,j)=>{if(j===oi||!choice.include)return;const name=data.columns[j];const all=valid.map(r=>r.values[j]),tr=training.map(r=>r.values[j]);
 if(choice.type==='numeric'){
  const present=tr.filter(numeric).map(Number),invalid=all.filter(v=>!missing(v)&&!numeric(v)).length;
  if(!present.length){dropped.push({name,reason:'No usable numeric values in training'});return;}
  const fill=median(present),imputed=tr.map(v=>numeric(v)?Number(v):fill),center=mean(imputed),scale=Math.sqrt(mean(imputed.map(v=>(v-center)**2)));
  if(scale<1e-12){dropped.push({name,reason:'Constant in training'});return;}
  transforms.push({index:j,name,type:'numeric',median:fill,mean:center,scale});features.push(name);
  audit.push({name,type:'numeric',missing:all.filter(missing).length,invalid,imputed:all.filter(v=>!numeric(v)).length,rule:`Median ${fill.toPrecision(5)}; training mean/SD scaling`});
 }else{
  const present=tr.filter(v=>!missing(v)),fill=mode(present);
  if(fill===undefined){dropped.push({name,reason:'All values missing in training'});return;}
  const levels=sorted(present);
  if(levels.length===1){dropped.push({name,reason:'Constant in training'});return;}
  if(levels.length>30)throw Error(`“${name}” has more than 30 training categories. Exclude identifiers or review the column type.`);
  transforms.push({index:j,name,type:'categorical',mode:fill,levels});features.push(...levels.map(v=>`${name} = ${v}`),`${name} = [unseen]`);
  audit.push({name,type:'categorical',missing:all.filter(missing).length,invalid:0,imputed:all.filter(missing).length,unseen:test.filter(r=>!missing(r.values[j])&&!levels.includes(r.values[j])).length,rule:`Mode “${fill}”; ${levels.length} training levels + unseen indicator`});
 }});
 if(!transforms.length)throw Error('No usable predictors remain. Include a nonconstant numeric or categorical column.');
 if(features.length>200)throw Error('More than 200 encoded features. Exclude high-cardinality columns.');
 const rows=valid.map(r=>{const x=[];transforms.forEach(t=>{const v=r.values[t.index];if(t.type==='numeric')x.push(((numeric(v)?Number(v):t.median)-t.mean)/t.scale);else{const label=missing(v)?t.mode:v;x.push(...t.levels.map(l=>label===l?1:0),t.levels.includes(label)?0:1);}});return{row:r.index+2,partition:testIds.has(r.index)?'holdout':'training',label:r.label,y:classes.indexOf(r.label),x};});
 if(rows.some(r=>r.x.some(v=>!Number.isFinite(v))))throw Error('Numeric values are too extreme to preprocess safely.');
 const event=classes.includes(String(config.event))?String(config.event):classes[classes.length-1];
 return {version:2,columns:data.columns,outcome:{index:oi,name:data.columns[oi],type:'categorical',classes,event},features,rows,recipe:{seed,testFraction,transforms,classes,missingTokens:['blank','NA','N/A','null','NaN'],removeDuplicates:!!config.removeDuplicates},audit:{inputRows:data.rows.length,retained:rows.length,training:training.length,holdout:test.length,droppedOutcome,duplicates,duplicatesRemoved:config.removeDuplicates?duplicates:0,columns:audit,dropped},config:{...config,outcome:oi,event,seed,testFraction,predictors:choices}};
}
function fitBaseline(prepared){
 const {classes,event}=prepared.outcome;if(classes.length!==2)throw Error('Baseline validation currently supports binary outcomes. Your multicategory preprocessing can still be exported.');
 const train=prepared.rows.filter(r=>r.partition==='training'),test=prepared.rows.filter(r=>r.partition==='holdout');
 const y=train.map(r=>r.label===event?1:0),counts=[y.filter(v=>v===0).length,y.filter(v=>v===1).length];
 if(Math.min(...counts)<5||test.length<4)throw Error('Baseline fitting needs at least five training rows in each class and four holdout rows.');
 const d=prepared.features.length,n=train.length,lambda=0.05,beta=Array(d+1).fill(0),prevalence=mean(y);beta[0]=Math.log(prevalence/(1-prevalence));
 const sigmoid=z=>z>=0?1/(1+Math.exp(-z)):Math.exp(z)/(1+Math.exp(z));
 const predict=(x,b)=>sigmoid(b[0]+x.reduce((s,v,j)=>s+v*b[j+1],0));
 const objective=b=>mean(train.map((r,i)=>{const z=b[0]+r.x.reduce((s,v,j)=>s+v*b[j+1],0);return Math.max(z,0)+Math.log1p(Math.exp(-Math.abs(z)))-y[i]*z;}))+lambda/2*b.slice(1).reduce((s,v)=>s+v*v,0);
 let loss=objective(beta),converged=false,iteration=0;
 for(;iteration<1500;iteration++){
  const grad=Array(d+1).fill(0);train.forEach((r,i)=>{const residual=predict(r.x,beta)-y[i];grad[0]+=residual/n;r.x.forEach((v,j)=>grad[j+1]+=residual*v/n);});for(let j=1;j<=d;j++)grad[j]+=lambda*beta[j];
  const norm=grad.reduce((s,v)=>s+v*v,0);if(Math.sqrt(norm)<1e-6){converged=true;break;}
  let step=1,candidate,next;for(let k=0;k<30;k++){candidate=beta.map((v,j)=>v-step*grad[j]);next=objective(candidate);if(Number.isFinite(next)&&next<=loss-0.0001*step*norm)break;step/=2;}
  if(!Number.isFinite(next)||next>loss)break;candidate.forEach((v,j)=>beta[j]=v);loss=next;
 }
 if(!converged)throw Error('The baseline optimizer did not converge. Review extreme values and predictor selection. No validation result was produced.');
 return {coefficients:beta,lambda,iterations:iteration,trainingN:n,holdoutN:test.length,event,cohort:{name:'Your dataset · held-out results',source:'uploaded',scenario:null,seed:prepared.recipe.seed,n:test.length,models:['Ridge logistic baseline','Training prevalence'],detail:`Held-out validation: ${test.length} rows; model and preprocessing fitted on ${n} training rows. Event: “${event}”. This is one internal split, not external validation.`,rows:test.map(r=>({outcome:r.label===event?1:0,group:'All held-out observations',predictions:[predict(r.x,beta),prevalence]}))}};
}
export default {MAX_BYTES,MAX_ROWS,MAX_COLS,missing,numeric,parse,profile,outcomeLevels,preprocess,fitBaseline};
