# Lex Chatbot React Native App

A simple React Native application that connects to an AWS Lex chatbot.

## Setup Instructions

1. Install dependencies:
```bash
npm install
# or
yarn install
```

2. Run the app:
```bash
# For iOS
npx react-native run-ios

# For Android
npx react-native run-android
```

3. Configure the app:
   - When you first launch the app, tap the "Configure Now" button
   - Enter your AWS credentials (Access Key ID and Secret Access Key)
   - Enter your Bot ID and Bot Alias ID from the AWS Lex console
   - Tap "Save Configuration"

## Features

- Chat interface for interacting with your AWS Lex bot
- Secure storage of AWS credentials using AsyncStorage
- Configuration panel for setting up the connection to your bot
- Real-time communication with AWS Lex

## Project Structure

- `App.js` - Main application component
- `package.json` - Project dependencies

## Requirements

- React Native 0.71.0 or higher
- AWS SDK for JavaScript
- AsyncStorage for React Native
