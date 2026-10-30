# Methods

This document describes version 2.0.0. The implementation is in `public/studio/metrics.js` and can be used without the interface.

## Scope and inputs

The validation calculations accept binary outcomes y in {0,1} and predicted event probabilities p in [0,1], evaluated on the same rows. The dataset workspace can preprocess raw predictors and fit a baseline using only training rows; the version 2 section below describes that separate step. The metric engine does not impute, drop, train, select, or recalibrate its supplied predictions. A probability equal to the decision threshold counts as a positive prediction.

The overall dataset must contain both outcomes. A subgroup may contain a single class; AUROC and average precision are then displayed as unavailable. Sensitivity, specificity, and predictive values are unavailable when their relevant denominators are zero. This deliberate display policy avoids implying that single-class subgroup ranking performance is established.

## Discrimination

Scores are sorted from high to low and tied scores are processed as one group. The empirical ROC area is integrated by trapezoids, equivalent to the concordance probability with half credit for ties. Average precision is the sum of precision multiplied by the increase in recall at each distinct score. It is not trapezoidal precision–recall area. The precision–recall plot uses steps consistent with this definition.

## Probability error

The Brier score is mean((p−y)²). It reflects probability error, including both discrimination and calibration. Log loss is −mean(y log(p)+(1−y) log(1−p)). Only log-based calculations clip probabilities to [10⁻¹²,1−10⁻¹²]; Brier scores and threshold decisions use the original values. The observed/expected ratio is sum(y)/sum(p), unavailable when sum(p)=0.

## Calibration

The user can choose 5, 10, or 15 equal-width probability bins. Each nonempty bin contributes mean predicted probability, observed event proportion, observation count, and event count. A prediction of exactly 1 is assigned to the final bin. The detailed view uses two-sided 95% Wilson score intervals for the observed binomial proportions. These are not simultaneous confidence bands and do not describe uncertainty in the bin mean predicted probability.

Logistic recalibration fits logit(P(y=1)) = a + b logit(p), without regularization. The ideal intercept and slope are 0 and 1. Calibration-in-the-large separately fits a with logit(p) as an offset, so the slope is fixed at 1. The UI distinguishes these intercepts. Newton iterations are bounded, and nonconvergence, constant scores, and separated or numerically unstable fits are reported as unavailable rather than returning a misleading coefficient. Perfect separation has no finite maximum-likelihood calibration slope.

## Decision curves

At each threshold t, net benefit is TP/n − FP/n × t/(1−t). The act-on-everyone comparator is prevalence − (1−prevalence) × t/(1−t); the act-on-no-one comparator is zero. Displayed net benefit is multiplied by 100. The focus threshold changes the confusion matrix, sensitivity, specificity, positive and negative predictive values, and net benefit.

The plot covers 1–30%, 1–60%, or 1–90%. Very negative values are clipped by the displayed plotting range, and the caption states that boundary. The calculations retain all values. The chosen threshold is not optimized on the evaluation sample. Its clinical relevance must come from the decision context. The implementation assumes a representative binary-outcome cohort and does not adjust for case-control sampling or censoring.

## Bootstrap

The ordinary nonparametric bootstrap samples n rows with replacement. All models use the same sampled rows, so differences in AUROC are paired. The fixed bootstrap seed is 2026 in the UI; the function permits a different seed. Users can request 200, 500, or 1,000 draws. The 2.5th and 97.5th percentiles use linear interpolation between sorted values.

Single-class resamples are skipped for every model and metric in that draw. Requested, valid, and skipped counts are reported. Fewer than 100 valid draws results in unavailable intervals. A low number of draws or sparse outcomes makes percentile estimates less stable. These intervals are descriptive tools, not a substitute for study-specific sample-size planning.

No prediction model is refitted within the bootstrap. The intervals therefore omit model-development, selection, and tuning uncertainty and do not correct optimism. They require independent observations. Pooled cross-validation predictions may share training data across folds, and simple row resampling can miss this dependence. Clustered or repeated measurements require a different design.

## Synthetic examples

The generator uses a seeded pseudorandom number generator and two normally distributed latent predictors. A binary synthetic group contributes a small additive term. Outcomes are Bernoulli draws from the specified latent risk. All rows are generated independently. No examples are based on individual patients.

- Standard: log-odds = −1.3 + 1.05a + 0.75b + group term (±0.25). The clinical score equals the generating risk; the simpler score uses sigmoid(−1.3 + 0.92a). The overconfident score multiplies clinical log-odds by 1.9, preserving the ranking.
- Rare: the baseline intercept becomes −3.6 for both outcome generation and the corresponding prediction formulas.
- Shift: outcomes use a +1.05 intercept shift, while the prediction formulas retain the standard baseline.
- Leakage: the third score adds 3.2 × (2y−1) to the clinical log-odds. This explicitly uses the outcome and is an invalid predictive evaluation. It demonstrates contamination rather than training a leakage detector.

Group A and Group B are arbitrary simulated groups, not demographic categories. Their results do not support claims about any patient population.

## References

The app follows the definitions in the [scikit-learn evaluation documentation](https://scikit-learn.org/stable/modules/model_evaluation.html). Its reporting is informed by [TRIPOD+AI](https://www.bmj.com/content/385/bmj-2023-078378). Decision curve methods follow the [MSK resources](https://mskcc-epi-bio.github.io/decisioncurveanalysis/). These sources do not endorse or certify this software.

## Dataset preparation and baseline model (version 2)

The outcome is categorical text after trimming whitespace. Numeric-looking labels are not numerically merged. Missing outcome rows are excluded and counted. Duplicate rows are counted and optionally removed before splitting. A seeded, stratified random split reserves 20% or 30% of each class, rounded to the nearest whole row and bounded to leave at least one row per class in both partitions.

Only training rows determine usable columns, numeric medians, categorical modes, category levels, means, and population standard deviations. Numeric parsing accepts decimal and scientific notation, not locale separators or units. Invalid numeric strings are counted and imputed as missing. Categorical-mode ties are resolved in ascending text order. Each known training level has an indicator, with a separate unseen-level indicator for holdout values. All-missing or constant training columns are excluded. Numeric columns are standardized after median imputation. No oversampling, feature selection based on outcomes, or automatic outlier removal is performed.

For a binary outcome, ridge logistic regression minimizes mean logistic loss plus 0.05/2 times the squared slope norm. The intercept is unpenalized. The solver uses gradient descent with backtracking, a gradient-norm stopping criterion of 1e-6, and at most 1,500 iterations. Failure to converge produces an error, not a purportedly valid model. The baseline needs at least five training observations in each class and at least four holdout observations; these are computation safeguards, not a sufficient sample-size recommendation. One-hot indicators use all levels with ridge regularization. The comparator predicts the training event frequency for every holdout row.

Only holdout predictions enter the validation dashboard. No refitting or recalibration on the holdout occurs. Bootstrap intervals remain conditional on the fitted model and preprocessing. The split is not appropriate for repeated patients, clusters, families, sites that must be separated, or time-ordered evaluation. Repeated tuning against this holdout causes selection optimism. A separate study design is necessary for robust model development and external validation.

Primary implementation references: [scikit-learn common pitfalls](https://scikit-learn.org/stable/common_pitfalls), [imputation](https://scikit-learn.org/stable/modules/generated/sklearn.impute.SimpleImputer), [one-hot encoding](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.OneHotEncoder), and [preprocessing](https://scikit-learn.org/stable/modules/preprocessing.html). The studio implements its own documented JavaScript calculations and is not an embedded scikit-learn service.
