import React from 'react';
import './GreetingDisplay.css';

function GreetingDisplay({ message }) {
  return (
    <div className="greeting-container">
      <h1>{message || "Loading..."}</h1>
    </div>
  );
}

export default GreetingDisplay;
