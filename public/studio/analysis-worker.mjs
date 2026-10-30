import P from './preprocess.mjs';
self.onmessage=({data})=>{try{const result=data.action==='prepare'?P.preprocess(data.dataset,data.config):P.fitBaseline(data.prepared);self.postMessage({result});}catch(e){self.postMessage({error:e.message});}};
