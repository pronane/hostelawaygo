# HostelAwayGo - React Web Application

This project is a simple React web application designed to fetch and display a greeting message (an ID and content) from a public API. It was created as a web counterpart to an existing Android application.

## Prerequisites

Before you begin, ensure you have the following installed:

*   **Node.js:** Version 16.x or later is recommended. You can download it from [nodejs.org](https://nodejs.org/).
*   **npm (Node Package Manager):** This is usually installed with Node.js. Version 8.x or later is recommended.
*   **Git:** For cloning the repository. You can download it from [git-scm.com](https://git-scm.com/).

## Setup Instructions

1.  **Clone the Repository:**
    Open your terminal or command prompt and run:
    ```bash
    git clone <repository_url>
    ```
    (Replace `<repository_url>` with the actual URL of the repository).

2.  **Navigate to the Project Directory:**
    ```bash
    cd <repository_name>/hostelawaygo-react-app
    ```
    (Replace `<repository_name>` with the name of the cloned repository folder).

3.  **Install Dependencies:**
    Run the following command to install the project dependencies defined in `package.json`:
    ```bash
    npm install
    ```
    Alternatively, if you prefer using Yarn:
    ```bash
    yarn install
    ```

## Running the Application

1.  **Start the Development Server:**
    Once the dependencies are installed, you can start the React development server:
    ```bash
    npm start
    ```
    Or, with Yarn:
    ```bash
    yarn start
    ```

2.  **View in Browser:**
    This command should automatically open a new tab in your default web browser and navigate to `http://localhost:3000/`.
    *   You will see the "HostelAwayGo (Web Version)" page.
    *   The application will initially display "Loading..." for the ID and Message fields.
    *   After a moment, it will show the fetched greeting (e.g., "ID: 1", "Message: Hello, World!").
    *   If there's an error fetching data, an error message will be displayed.
    *   You can click the "Refresh Greeting" button to fetch new data from the API.

## API Endpoint

This application fetches data from the following public Spring Guides API:
`http://rest-service.guides.spring.io/greeting`
