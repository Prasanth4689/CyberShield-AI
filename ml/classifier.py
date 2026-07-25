import os
import joblib
import xgboost as xgb
from imblearn.over_sampling import SMOTE
from sklearn.preprocessing import LabelEncoder

class AttackClassifier:
    def __init__(self):
        self.clf = xgb.XGBClassifier(use_label_encoder=False, eval_metric='mlogloss')
        self.le = LabelEncoder()
        
    def train(self, X, y):
        # Apply SMOTE for class imbalance in anomalous data
        smote = SMOTE(random_state=42)
        X_res, y_res = smote.fit_resample(X, y)
        
        y_encoded = self.le.fit_transform(y_res)
        self.clf.fit(X_res, y_encoded)
        
    def predict(self, X):
        y_pred_enc = self.clf.predict(X)
        y_prob = self.clf.predict_proba(X)
        
        predicted_attack_type = self.le.inverse_transform(y_pred_enc)
        
        confidence_scores = []
        for probs in y_prob:
            conf_dict = {self.le.classes_[i]: float(probs[i]) for i in range(len(self.le.classes_))}
            confidence_scores.append(conf_dict)
            
        return predicted_attack_type, confidence_scores
        
    def save(self, filepath):
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        joblib.dump((self.clf, self.le), filepath)
        
    def load(self, filepath):
        self.clf, self.le = joblib.load(filepath)
