import React, { useState, useEffect } from 'react';
import './App.css';
import GreetingDisplay from './GreetingDisplay';

function App() {
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    fetch('/api/greeting')
      .then(response => response.text())
      .then(data => setGreeting(data))
      .catch(error => console.error('Error fetching greeting:', error));
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <GreetingDisplay message={greeting} />
      </header>
    </div>
  );
}

export default App;
