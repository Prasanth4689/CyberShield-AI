import os
import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.svm import OneClassSVM
from sklearn.preprocessing import StandardScaler

class BaselineProfiler:
    def __init__(self):
        self.iso_forest = IsolationForest(contamination=0.02, random_state=42)
        self.ocsvm = OneClassSVM(nu=0.02, kernel='rbf')
        self.scaler = StandardScaler()
        
    def fit(self, X_normal):
        X_scaled = self.scaler.fit_transform(X_normal)
        self.iso_forest.fit(X_scaled)
        self.ocsvm.fit(X_scaled)
        
    def predict(self, X):
        scores = self.score(X)
        return np.where(scores < -0.5, -1, 1)
        
    def score(self, X):
        X_scaled = self.scaler.transform(X)
        # Average anomaly scores (lower is more anomalous in sklearn)
        iso_scores = self.iso_forest.decision_function(X_scaled)
        svm_scores = self.ocsvm.decision_function(X_scaled)
        return (iso_scores + svm_scores) / 2.0
        
    def save(self, filepath):
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        joblib.dump((self.iso_forest, self.ocsvm, self.scaler), filepath)
        
    def load(self, filepath):
        self.iso_forest, self.ocsvm, self.scaler = joblib.load(filepath)
