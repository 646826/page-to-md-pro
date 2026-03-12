# GitHub Copilot Instructions for Chrome Extension Project

## Project Structure
- **src/**: Contains all the source code for the extension.
  - **background.js**: Background script for handling events.
  - **content.js**: Content script for interacting with web pages.
  - **popup.html**: HTML for the extension's popup interface.
  - **manifest.json**: Configuration file for the Chrome extension.
- **tests/**: Contains unit tests and integration tests.
- **dist/**: Contains the built version of the extension.

## Setup
1. Clone the repository:
   ```
   git clone https://github.com/646826/page-to-md-pro.git
   cd page-to-md-pro
   ```
2. Install required dependencies (if applicable):
   ```
   npm install
   ```

## Testing
- To run the tests:
  ```
  npm test
  ```

## Building
1. Make sure to have all dependencies installed.
2. Run the build command:
   ```
   npm run build
   ```
3. The built extension will be available in the `dist/` folder.
