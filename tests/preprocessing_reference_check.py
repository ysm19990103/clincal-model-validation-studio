"""Independent SciPy check of the ridge baseline on generated data; no downloads."""
import json,subprocess
from pathlib import Path
import numpy as np
from scipy.optimize import minimize
from scipy.special import expit
ROOT=Path(__file__).resolve().parents[1]
script="""
import P from './public/studio/preprocess.mjs';
const data={columns:['outcome','number','group'],rows:Array.from({length:180},(_,i)=>[i%5<2?'yes':'no',i%29===0?'':String(Math.sin(i)*3+i%7),i%3?'A':'B'])};
const p=P.preprocess(data,{outcome:0,event:'yes',seed:42,testFraction:.2,predictors:[{include:true,type:'categorical'},{include:true,type:'numeric'},{include:true,type:'categorical'}]});
console.log(JSON.stringify({data,prepared:p,fit:P.fitBaseline(p)}));
"""
v=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT,text=True))
p=v['prepared'];rows=p['rows'];train=[r for r in rows if r['partition']=='training'];holdout=[r for r in rows if r['partition']=='holdout']
X=np.column_stack([np.ones(len(train)),np.array([r['x'] for r in train])]);y=np.array([r['label']=='yes' for r in train],dtype=float)
lam=v['fit']['lambda']
fun=lambda b: np.mean(np.logaddexp(0,X@b)-y*(X@b))+lam/2*np.dot(b[1:],b[1:])
jac=lambda b: X.T@(expit(X@b)-y)/len(y)+np.r_[0,lam*b[1:]]
fit=minimize(fun,np.zeros(X.shape[1]),jac=jac,method='BFGS',options={'gtol':1e-10})
Z=np.column_stack([np.ones(len(holdout)),np.array([r['x'] for r in holdout])]);expected=expit(Z@fit.x)
actual=np.array([r['predictions'][0] for r in v['fit']['cohort']['rows']]);error=np.max(np.abs(expected-actual));assert error<1e-5,error
raw=[v['data']['rows'][r['row']-2][1] for r in train];values=np.array([float(x) for x in raw if x]);med=np.median(values);filled=np.array([float(x) if x else med for x in raw]);t=p['recipe']['transforms'][0]
assert abs(t['median']-med)<1e-12
assert abs(t['mean']-filled.mean())<1e-12
assert abs(t['scale']-filled.std())<1e-12
print(json.dumps({'baseline_holdout_predictions':len(actual),'max_probability_error':float(error),'training_median_mean_sd':'passed','status':'passed'}))
