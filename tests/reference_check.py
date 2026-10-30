"""Check the JavaScript calculations against scikit-learn and SciPy.

Optional developer check: python tests/reference_check.py
Requires numpy, scipy, scikit-learn, and Node.js. No data downloads.
"""
import json
import subprocess
from pathlib import Path

import numpy as np
from scipy.optimize import minimize
from scipy.special import expit, logit
from sklearn.metrics import average_precision_score, brier_score_loss, log_loss, roc_auc_score

ROOT = Path(__file__).resolve().parents[1]
source = r"""
const M = require('./public/studio/metrics.js');
const output = [];
for (const scenario of ['standard', 'rare', 'shift', 'leakage']) {
  const c = M.generateCohort(scenario, 800, 42);
  const y = c.rows.map(r => r.outcome);
  c.models.forEach((name, i) => {
    const p = c.rows.map(r => r.predictions[i]);
    output.push({scenario, name, y, p, result:M.metrics(y,p,0.2,10)});
  });
}
console.log(JSON.stringify(output));
"""
records = json.loads(subprocess.check_output(["node", "-e", source], cwd=ROOT, text=True))
metric_checks = 0
fit_checks = 0
max_error = 0.0
for record in records:
    y = np.array(record["y"])
    p = np.array(record["p"])
    actual = record["result"]
    expected = {
        "auc": roc_auc_score(y, p),
        "ap": average_precision_score(y, p),
        "brier": brier_score_loss(y, p),
        "logLoss": log_loss(y, np.clip(p, 1e-12, 1 - 1e-12)),
    }
    for key, value in expected.items():
        err = abs(actual[key] - value)
        max_error = max(max_error, err)
        assert err < 1e-10, (record["scenario"], record["name"], key, err)
        metric_checks += 1
    selected = p >= 0.2
    tp = ((y == 1) & selected).sum()
    fp = ((y == 0) & selected).sum()
    assert abs(actual["netBenefit"] - (tp - fp * 0.2 / 0.8) / len(y)) < 1e-12
    x = logit(np.clip(p, 1e-12, 1 - 1e-12))
    X = np.column_stack([np.ones(len(y)), x])
    objective = lambda beta: np.sum(np.logaddexp(0, X @ beta) - y * (X @ beta))
    gradient = lambda beta: X.T @ (expit(X @ beta) - y)
    fit = minimize(objective, np.array([0.0, 1.0]), jac=gradient, method="BFGS", options={"gtol": 1e-9})
    if actual["fit"]["slope"] is not None:
        assert np.max(np.abs(fit.x - [actual["fit"]["intercept"], actual["fit"]["slope"]])) < 1e-5
        fit_checks += 1
    offset = minimize(
        lambda a: np.sum(np.logaddexp(0, a[0] + x) - y * (a[0] + x)),
        np.array([0.0]),
        jac=lambda a: np.array([np.sum(expit(a[0] + x) - y)]),
        method="BFGS",
        options={"gtol": 1e-9},
    )
    if actual["fit"]["citl"] is not None:
        assert abs(offset.x[0] - actual["fit"]["citl"]) < 1e-5
        fit_checks += 1
    assert sum(b["n"] for b in actual["calibration"]) == len(y)
print(json.dumps({"comparisons": metric_checks, "calibration_fit_checks": fit_checks, "maximum_metric_error": max_error, "status": "passed"}, indent=2))
