import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = ({ 
  size = 'medium', 
  variant = 'primary', 
  message = 'Loading...', 
  showMessage = true 
}) => {
  return (
    <div className={`loading-container ${size}`}>
      <div className={`loading-spinner ${variant}`}>
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
      </div>
      {showMessage && (
        <div className="loading-message">
          {message}
        </div>
      )}
    </div>
  );
};

export default LoadingSpinner; 