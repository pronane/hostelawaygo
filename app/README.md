# HostelAwayGo - Android Application

This is an Android application that fetches and displays a greeting message (an ID and content) from a public API. It features a basic UI, a refresh capability, and an interactive FloatingActionButton.

## Prerequisites

Before you begin, ensure you have the following installed:

*   **Android Studio:** Arctic Fox (2020.3.1) or later is recommended. You can download it from the [Android Developer website](https://developer.android.com/studio).
*   **Android SDK:**
    *   The project is configured with:
        *   `compileSdkVersion`: 26 (Android 8.0 Oreo)
        *   `minSdkVersion`: 15 (Android 4.0.3 Ice Cream Sandwich)
        *   `targetSdkVersion`: 26 (Android 8.0 Oreo)
    *   Android Studio will typically manage the download and installation of the required SDK components when you open the project. Ensure you have the Android 8.0 (Oreo) SDK Platform installed via the SDK Manager in Android Studio.
*   **Git:** For cloning the repository. You can download it from [git-scm.com](https://git-scm.com/).

## Setup Instructions

1.  **Clone the Repository:**
    Open your terminal or command prompt and run:
    ```bash
    git clone <repository_url>
    ```
    (Replace `<repository_url>` with the actual URL of the repository).

2.  **Open in Android Studio:**
    *   Launch Android Studio.
    *   Select "Open" (or "File" > "Open..." from the menu).
    *   Navigate to the directory where you cloned the repository and select the root folder of the project.
    *   Android Studio will import the project and Gradle will attempt to sync and build it. This may take a few minutes. Ensure you have an active internet connection for Gradle to download dependencies.

3.  **Build the Project (if needed):**
    *   If Gradle sync is successful, the project should build automatically.
    *   If not, you can manually trigger a build by selecting "Build" > "Make Project" from the Android Studio menu.
    *   Address any build errors that may arise (e.g., missing SDK components, which Android Studio should prompt you to install).

## Running the Application

1.  **Set up an Emulator or Device:**
    *   **Emulator:** In Android Studio, you can create an Android Virtual Device (AVD) via "Tools" > "AVD Manager". Create an emulator that targets Android 8.0 (API 26) or higher, though it should run on API 15+ devices.
    *   **Physical Device:** Connect an Android device to your computer via USB with USB debugging enabled. Ensure it's running Android 4.0.3 (API 15) or higher.

2.  **Run the 'app' Configuration:**
    *   Select the `app` configuration from the run configurations dropdown in the toolbar (it should be selected by default).
    *   Choose your target emulator or physical device.
    *   Click the "Run" button (green play icon) or select "Run" > "Run 'app'" from the menu.

3.  **Expected Behavior:**
    *   The app will install and launch on the selected emulator/device.
    *   The main screen will display:
        *   An ActionBar with the app title.
        *   Initially:
            ```
            ID: Loading...
            Content: Loading...
            ```
        *   After data is fetched from the API:
            ```
            ID: <some_id>
            Content: <some_message>
            ```
            (e.g., "ID: 1", "Content: Hello, World!")
        *   If an error occurs:
            ```
            ID: Error
            Content: Error
            ```
    *   A FloatingActionButton (email icon) is visible in the bottom-right. Tapping it will display a Toast message: "FAB Clicked! Email action would go here."
    *   A refresh option is available in the ActionBar's overflow menu.

## API Endpoint

This application fetches data from the following public Spring Guides API:
`http://rest-service.guides.spring.io/greeting`
