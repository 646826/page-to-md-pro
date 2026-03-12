# Build and Test Documentation for Chrome Extension

## Building the Extension

1. **Install Dependencies**: Make sure you have Node.js and npm installed. You can download it from [nodejs.org](https://nodejs.org/).
   
   ```bash
   npm install
   ```

2. **Build the Extension**: Use the following command to build the extension. This will compile the necessary files.
   
   ```bash
   npm run build
   ```

## Testing the Extension

1. **Load Unpacked Extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`.
   - Enable `Developer mode` by toggling the switch at the top right corner.
   - Click `Load unpacked` and select the `dist` folder that was created during the build process.
   
2. **Running Tests**:
   - If there are automated tests, you can run them using:
   
   ```bash
   npm test
   ```
   
## Additional Notes

- Make sure to check the console for any errors during the loading of the extension.
- Keep the Chrome browser updated for the best compatibility with extensions. 

## Update Log

- **2026-03-12**: Created initial documentation on how to build and test the Chrome extension.