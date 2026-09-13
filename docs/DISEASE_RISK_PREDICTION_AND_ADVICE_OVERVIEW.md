# Disease Risk Prediction and Health Advice Technical Overview

## Purpose

This report explains the technical background, architecture, training process, selected algorithms, evaluation metrics, feature usage, explainability approach, and advice generation flow for the diabetes, stroke, and hypertension risk prediction features.

The report is written as a descriptive technical overview and does not list implementation file names.

## 1. High-Level Architecture

The disease risk prediction system uses a layered architecture:

```text
Mobile application
  -> Backend application server
  -> Machine learning service
  -> Saved model artifacts
  -> Database storage
```

The mobile application collects user health values and displays the result. The backend handles authentication, saved profile values, request preparation, prediction history, and chat history. The machine learning service loads the trained model and preprocessor, performs inference, and returns the prediction output.

The full prediction flow is:

```text
User enters health values
-> Mobile app sends values to backend
-> Backend merges new values with saved health profile
-> Backend calculates helper values such as BMI
-> Backend sends structured payload to ML service
-> ML service preprocesses the payload
-> Trained model predicts positive-class probability
-> Probability is converted into Low, Medium, or High risk
-> Explanation factors are generated
-> Backend saves prediction result and input snapshot
-> Mobile app displays risk level, confidence, factors, and summary
```

## 2. Diseases Covered

The system currently covers:

```text
Diabetes risk prediction
Stroke risk prediction
Hypertension risk prediction
```

These are awareness and screening-support features. They are not diagnostic medical tools. The output is intended to help users and caregivers understand possible risk indicators and seek professional follow-up when needed.

## 3. Training Background

Each disease model was trained using tabular health data. The training process compares several machine learning algorithms and chooses the best candidate based on evaluation metrics.

The candidate algorithms are:

```text
Logistic Regression
Decision Tree
Random Forest
XGBoost
Soft Voting Ensemble
```

The training process follows these steps:

```text
1. Load public health dataset.
2. Validate the target column and required features.
3. Convert the target into binary form when required.
4. Build the feature matrix and target label.
5. Split the data into training and testing subsets.
6. Apply preprocessing.
7. Train each candidate algorithm.
8. Evaluate every model using the same test data.
9. Compare the results.
10. Save the selected model, preprocessor, metrics, features, and visualizations.
```

The training split is:

```text
80 percent training data
20 percent testing data
Stratified split
Random state 42
```

Stratification is used so that the train and test sets preserve the target-class distribution.

## 4. Evaluation Metrics

The system evaluates each model using:

```text
Accuracy
Precision
Recall
F1-score
ROC-AUC
Confusion matrix
```

Accuracy measures the total proportion of correct predictions.

Precision measures how many predicted positive risk cases were actually positive. High precision means fewer false alarms.

Recall measures how many actual positive risk cases were detected. High recall means fewer missed risk cases.

F1-score balances precision and recall.

ROC-AUC measures how well the model separates positive and negative classes across probability thresholds.

The confusion matrix shows:

```text
True negatives
False positives
False negatives
True positives
```

For healthcare screening, recall is especially important because missing a real risk case can be more harmful than giving a cautious warning.

## 5. Algorithm Selection Method

The final algorithms were selected by comparing the evaluation scores of all candidate models.

For diabetes and stroke, the selection priority is:

```text
Recall
F1-score
ROC-AUC
Accuracy
```

This priority supports a screening-style goal, where detecting possible risk is more important than minimizing every false positive.

For hypertension, the selection priority is:

```text
Accuracy
Recall
F1-score
ROC-AUC
```

When several models perform similarly, the simpler and more explainable model is preferred.

## 6. Soft Voting Ensemble

A soft voting ensemble was tested during training.

The ensemble combines:

```text
Logistic Regression
Random Forest
XGBoost
```

Soft voting means each model produces a probability, and the ensemble averages those probabilities.

Example:

```text
Logistic Regression probability = 0.62
Random Forest probability       = 0.70
XGBoost probability             = 0.66

Final ensemble probability = (0.62 + 0.70 + 0.66) / 3
                           = 0.66
```

The ensemble was not automatically selected. It had to satisfy this rule:

```text
It must be at least as strong as the best individual model on all required metrics,
and it must improve at least one required metric.
```

In the saved results, the ensemble did not outperform the best individual model strongly enough, so the system deployed the best individual algorithm for each disease.

## 7. Diabetes Risk Prediction

The selected diabetes algorithm is:

```text
XGBoost
```

XGBoost was selected because it had the strongest overall diabetes performance among the tested models. It handled non-linear tabular health patterns better than simpler models and achieved strong recall and F1-score.

The diabetes features are:

```text
Age
Sex
BMI
High blood pressure flag
Smoking flag
Physical activity flag
Heart disease or heart attack history
Stroke history
General health indicator
Difficulty walking indicator
```

Application values are converted into model-compatible values:

```text
Age is converted into a health survey age bin.
Gender is converted into the sex feature.
Height and weight are converted into BMI.
Blood pressure at or above 140/90 becomes high blood pressure.
Smoking status becomes a binary smoking feature.
Physical activity is mapped into active or inactive status.
Disease history text is scanned for heart disease, stroke, hypertension, and mobility issues.
```

The diabetes probability is converted to risk level as:

```text
Low risk    = probability below 0.40
Medium risk = probability from 0.40 to below 0.70
High risk   = probability 0.70 or above
```

The diabetes model scores are:

```text
Selected algorithm: XGBoost
Accuracy: 0.7427
Precision: 0.7195
Recall: 0.7954
F1-score: 0.7556
ROC-AUC: 0.8204
Confusion matrix: [[4878, 2192], [1446, 5623]]
Training positives: 28277
Training negatives: 28276
```

The diabetes module also includes a clinical guardrail. This guardrail prevents clearly concerning user values from being labelled as low risk. For example, very high blood sugar, high BMI, high blood pressure, family history, or low activity can raise the minimum displayed risk level.

## 8. Stroke Risk Prediction

The selected stroke algorithm is:

```text
Logistic Regression
```

Logistic Regression was selected because the stroke dataset is highly imbalanced and the model achieved the best recall priority. For stroke screening, recall is important because the system should avoid missing possible positive cases.

The stroke features are:

```text
Age
Hypertension flag
Heart disease flag
Average glucose level
BMI
Gender
Marriage status
Work type
Residence type
Smoking status
```

Application values are converted as follows:

```text
Blood pressure and disease history determine hypertension status.
Disease history determines heart disease status.
Blood sugar can be used as glucose level.
Height and weight are converted into BMI when BMI is not directly supplied.
Gender is normalized into supported categories.
Smoking is normalized into current, former, or never-smoked categories.
Default values are used for missing demographic fields.
```

The stroke probability is converted to risk level as:

```text
Low risk    = probability below 0.30
Medium risk = probability from 0.30 to below 0.65
High risk   = probability 0.65 or above
```

The stroke model scores are:

```text
Selected algorithm: Logistic Regression
Accuracy: 0.7466
Precision: 0.1384
Recall: 0.8000
F1-score: 0.2360
ROC-AUC: 0.8426
Confusion matrix: [[723, 249], [10, 40]]
Training positives: 199
Training negatives: 3889
```

The stroke model has high recall but low precision. This means it catches many positive risk cases, but it can also generate false positives. Therefore, it should be presented as a screening and awareness model, not a diagnostic model.

## 9. Hypertension Risk Prediction

The selected hypertension algorithm is:

```text
Logistic Regression
```

Logistic Regression was selected because several candidate models had similar headline performance, and the simpler model was preferred. Since the hypertension dataset has a label-quality warning, a complex model was not justified.

The hypertension features are:

```text
Age
BMI
Cholesterol
Systolic blood pressure
Diastolic blood pressure
Alcohol intake
Stress level
Salt intake
Sleep duration
Heart rate
LDL
HDL
Triglycerides
Glucose
Country
Smoking status
Physical activity level
Family history
Diabetes status
Gender
Education level
Employment status
```

Application values are converted as follows:

```text
BMI is calculated from height and weight when not supplied.
Blood pressure values are used directly.
Glucose can be taken from blood sugar input.
Smoking is normalized into current, former, or never-smoked status.
Physical activity is normalized into low, moderate, or high.
Family history and diabetes are normalized into yes or no.
Missing values use saved model defaults.
```

The hypertension probability is converted to risk level as:

```text
Low risk    = probability below 0.40
Medium risk = probability from 0.40 to below 0.70
High risk   = probability 0.70 or above
```

The hypertension model scores are:

```text
Selected algorithm: Logistic Regression
Accuracy: 0.7188
Balanced accuracy: 0.5000
Precision: 0.7188
Recall: 1.0000
F1-score: 0.8364
ROC-AUC: 0.4955
Confusion matrix: [[0, 9840], [0, 25157]]
Training positives: 100624
Training negatives: 39361
```

The hypertension model has an important limitation. The source label has weak agreement with a clinically derived blood-pressure indicator. The high recall and F1-score are strongly influenced by the majority positive class, while ROC-AUC is close to random. Therefore, this model should be described as a phase-one prototype rather than a clinically strong model.

## 10. Runtime Prediction Output

Each disease prediction returns:

```text
Risk type
Risk level
Confidence
Selected algorithm
Contributing factors
Raw probability
Features used
Derived values
```

The raw probability is the model's estimated probability for the positive risk class.

The confidence value is:

```text
confidence = round(probability * 100)
```

The risk level is the simplified user-facing category:

```text
Low
Medium
High
```

Derived values include calculated fields such as BMI, high blood pressure flag, hypertension flag, heart disease flag, glucose level, cholesterol, systolic pressure, and diastolic pressure.

## 11. Explainable AI and Interpretability

The system supports explainability in two main ways.

First, training produces visual evaluation artifacts:

```text
Confusion matrix
ROC curve
Model metrics comparison
Feature correlation heatmap
Target correlation bar chart
```

These help explain model performance, model comparison, and the relationship between features and the target variable.

Second, runtime predictions include human-readable contributing factors. These factors are generated from the user's input values and derived values.

Examples include:

```text
High blood sugar
High BMI
Overweight BMI
High blood pressure
Low physical activity
Smoking history
Family history
Older age
Heart disease history
Very high glucose
High cholesterol
High stress
High salt intake
Short sleep duration
Combined health indicators
```

These factors are explanation labels for user understanding. They are not full SHAP explanations for the disease models. The goal is to provide a clear and elderly-friendly explanation of why the result may be concerning.

## 12. Advice System Background

The advice system is separate from the prediction system.

The prediction system answers:

```text
What is the user's estimated risk?
```

The advice system answers:

```text
What should the user know or do next?
How can the risk be reduced?
What should a caregiver monitor?
Why is the risk high or medium?
```

The advice system uses controlled Retrieval-Augmented Generation.

The advice flow is:

```text
User asks an advice question
-> Backend detects health advice intent
-> Backend selects diabetes, stroke, or hypertension
-> Backend loads the latest prediction context
-> Backend retrieves trusted guidance chunks
-> Machine learning service generates a short controlled answer
-> Backend adds sources and safety note
-> Conversation history is saved
-> Mobile application displays the answer
```

## 13. Advice Intent Detection

The backend detects health advice questions using risk-related and advice-related terms.

Risk-related terms include:

```text
Diabetes
Sugar
Glucose
Hypertension
Blood pressure
BP
Stroke
Risk
```

Advice-related terms include:

```text
Advice
Reduce
Lower
Prevent
What should
How can
Caregiver
Monitor
Guidance
Manage
Control
Healthy
Lifestyle
```

Example advice questions are:

```text
How can I reduce my diabetes risk?
What should I do about high blood pressure?
Why is my stroke risk high?
What should my caregiver monitor?
```

Medication-only questions are not handled by this disease-risk advice module unless they also mention disease risk context.

## 14. Advice Risk Type Selection

The advice module selects one of:

```text
Diabetes
Stroke
Hypertension
```

If the user explicitly names a condition, that condition is selected.

If the question is general, the backend looks at the latest saved predictions and selects the highest-risk condition.

The internal priority is:

```text
High = 3
Medium = 2
Low = 1
Unknown = 0
```

This allows a broad question such as "What should I do now?" to be answered using the most important available risk result.

## 15. Advice Knowledge Base

The advice system uses trusted health guidance. The guidance sources include:

```text
World Health Organization
Centers for Disease Control and Prevention
American Heart Association
Sri Lanka Noncommunicable Disease Unit
```

The guidance is stored as small chunks grouped by:

```text
General chronic disease prevention
Diabetes
Stroke
Hypertension
```

The topics include:

```text
Shared chronic disease risk factors
Metabolic risk factors
Diabetes risk factors
Physical activity and healthy eating
Blood sugar and health appointments
Stroke medical risk factors
Stroke lifestyle risk factors
Healthy eating and healthy weight
Physical activity for stroke prevention
High blood pressure risk factors
Home blood pressure monitoring
Very high blood pressure warning signs
```

## 16. Advice Retrieval Method

The backend builds a retrieval query using:

```text
Selected risk type
User question
Latest risk level
Prediction factors
```

Each guidance chunk has a lightweight local embedding. The embedding uses tokenization, stop-word removal, token normalization, hashing into a 64-dimensional vector, and vector normalization.

The chunk ranking formula is:

```text
Final retrieval score =
0.7 * cosine similarity
+ 0.2 * term overlap
+ 0.1 * exact risk type boost
```

The default maximum number of retrieved chunks is:

```text
6
```

If the database table for guidance chunks is unavailable, the backend falls back to the trusted guidance chunks stored in application code and regenerates embeddings locally.

## 17. Advice Answer Generation

After retrieving the most relevant trusted chunks, the backend sends the user question, selected risk type, latest prediction, user role, and retrieved chunks to the machine learning service.

The local language model generates a short answer, but it is controlled by a strict safety prompt.

The prompt rules are:

```text
Use only retrieved trusted health guidance.
Use only the provided prediction context.
Do not diagnose disease.
Do not prescribe medicine.
Do not suggest starting, stopping, or changing medicine.
Do not replace professional healthcare advice.
Explain in simple language.
For high risk or abnormal readings, recommend consulting a healthcare professional.
Write 3 to 6 short sentences.
Return a structured answer.
```

This means the language model is used for explanation and wording, not for independent medical decision-making.

## 18. Advice Fallback Logic

If the language model is unavailable or returns an empty answer, the backend creates a deterministic fallback answer.

The fallback answer uses:

```text
Risk type
Risk level
Top prediction factors
Retrieved guidance topics
Professional follow-up sentence
```

If no reliable guidance chunks are available, the system says:

```text
Reliable guidance is not available in the current knowledge base for this question.
```

This makes the advice module resilient even when the language model service fails.

## 19. Safety and Medical Boundaries

The system uses safety boundaries throughout the prediction and advice flow.

The disease prediction result is described as health awareness, not diagnosis.

The advice module does not prescribe treatment. It does not tell users to start, stop, or change medication. It recommends professional consultation when risk or readings may be high.

The standard safety note is:

```text
This is general health guidance, not a medical diagnosis.
It does not replace advice from a healthcare professional.
```

## 20. Final Technical Summary

The disease risk prediction system uses trained tabular machine learning models for diabetes, stroke, and hypertension. Multiple algorithms were trained and compared using accuracy, precision, recall, F1-score, ROC-AUC, and confusion matrix. Diabetes selected XGBoost because it achieved the strongest overall performance. Stroke selected Logistic Regression because recall was prioritized for a highly imbalanced screening task. Hypertension selected Logistic Regression because the dataset had label-quality limitations and a simpler model was more appropriate.

The advice system is a separate controlled RAG layer. It uses the latest prediction result, retrieves trusted health guidance, and generates a short safe answer with sources and a medical safety note. This design keeps prediction, explanation, and advice clearly separated while making the app easier for elderly users and caregivers to understand.

