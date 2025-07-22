import React, { useEffect } from "react";

export const LoadingSpinner: React.FC = () => (
  <div className="loading-overlay">
    <div style={{ textAlign: "center", color: "white" }}>
      <div className="spinner"></div>
      <p style={{ fontSize: "1.25rem", fontWeight: 600 }}>Processing PDF...</p>
    </div>
  </div>
);

export const ErrorMessage: React.FC<{
  message: string;
  onDismiss?: () => void;
}> = ({ message, onDismiss }) => {
  useEffect(() => {
    if (onDismiss) {
      const timer = setTimeout(() => {
        onDismiss();
      }, 3000); // 3 seconds

      return () => clearTimeout(timer);
    }
  }, [onDismiss]);

  return (
    <div className="error-message">
      <strong style={{ fontWeight: "bold" }}>Error: </strong>
      <span>{message}</span>
    </div>
  );
};
