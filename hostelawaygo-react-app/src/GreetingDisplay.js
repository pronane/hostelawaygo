import React from 'react';
import './GreetingDisplay.css'; // Styles will be updated in next step

function GreetingDisplay() {
    return (
        <div className="homepage-content"> {/* Ensure class name matches CSS */}
            <h1>Welcome to HostelAwayGo!</h1>
            <p>All your hostel needs.</p>
        </div>
    );
}

export default GreetingDisplay;
