import React from "react";

export const LoadingSpinner: React.FC = () => (
  <div className="loading-overlay">
    <div style={{ textAlign: "center", color: "white" }}>
      <div className="spinner"></div>
      <p style={{ fontSize: "1.25rem", fontWeight: 600 }}>Processing PDF...</p>
    </div>
  </div>
);

export const ErrorMessage: React.FC<{ message: string }> = ({ message }) => (
  <div className="error-message">
    <strong style={{ fontWeight: "bold" }}>Error: </strong>
    <span>{message}</span>
  </div>
);
