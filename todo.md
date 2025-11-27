# Project To-Do List

## 1. Rename Extension
- **Goal**: Change the extension name from "scraper" to "LinkedIn Sales Nav Agent".
- **Details**:
    - Update the `name` and `short_name` fields in `manifest.json`.
    - Update any visible UI titles or headers in the popup and CRM dashboard.

## 2. Handle "Load More" Button in Message List
- **Goal**: Handle the "Load More" button that appears when scrolling through the main list of messages/conversations.
- **Details**:
    - **Context**: This refers to the main list of all chats on the left side, NOT the individual conversation view.
    - **Detection**: Detect when the "Load More" button appears at the bottom of the message list while scrolling.
    - **Action**: Click the button to load the next batch of conversations.
    - **Resilience**: Ensure the scraper waits for the new list items to load before continuing to scroll or process.

## 3. Improve Chat Loading Reliability
- **Goal**: Address issues where selected user chats take time to load or fail to load completely.
- **Details**:
    - **Delay Mechanism**: Implement a robust delay after selecting a user to allow the chat window to fully render.
    - **Verification**: Add a check to confirm the chat content is visible before attempting to scrape or analyze.
    - **Retry Logic**: 
        - If a chat fails to load within the timeout period, retry selecting the same user.
        - If it continues to fail, log the issue and proceed to the next user to prevent the agent from getting stuck.

## 4. Fix CRM Duplicate Counting
- **Goal**: Ensure the CRM lead counter accurately reflects unique leads.
- **Details**:
    - Modify the lead addition logic to check for existing records before incrementing the count.
    - Use a unique identifier (e.g., Profile URL or Thread ID) to detect duplicates.
    - If a duplicate is found, update the existing record if needed, but do not increase the total lead count.

## 5. Fix Start/Stop Button Functionality
- **Goal**: Ensure the Start and Stop controls work reliably and immediately.
- **Details**:
    - Debug the event listeners for the Start and Stop buttons.
    - **Stop**: Ensure clicking "Stop" immediately halts the scraping loop and resets any necessary state flags.
    - **Start**: Ensure clicking "Start" correctly initializes the process and doesn't create multiple parallel instances if clicked multiple times.
