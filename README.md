# AI-Powered Expense Tracking Chatbot

An intelligent expense tracking assistant built with React Native and AWS Lex. This application provides natural language processing capabilities to help users track expenses, analyze spending patterns, and get personalized financial insights through conversational AI.

## Features

- 💬 Natural language understanding for expense-related questions
- 📊 Detailed category-specific expense breakdowns
- 📈 Spending pattern analysis with contextual understanding
- 💲 Budget monitoring with alerts and recommendations
- 🤖 Intelligent fallback mode when AWS is unavailable

## Quick Start

1. **Setup AWS Lex Bot**
   ```bash
   # Configure AWS credentials
   aws configure
   
   # Run the bot creation script
   python bot_creation.py
   ```
   This creates your expense tracking bot and saves details to `bot_info.json`

2. **Launch the App**
   
   ### Environment Setup
   ```bash
   cd LexChatbotApp
   npm install
   ```

   ### For Android
   ```bash
   # Start Metro bundler
   npx react-native start
   
   # In another terminal, launch on Android
   npx react-native run-android
   ```
   
   #### Running on a Physical Android Device
   - Enable Developer options and USB debugging on your device
   - Connect your device via USB and authorize the connection
   - Run `adb devices` to verify the device is detected
   - Then run `npx react-native run-android`

   ### For iOS
   ```bash
   # Install CocoaPods dependencies
   cd ios && pod install && cd ..
   
   # Start Metro bundler
   npx react-native start
   
   # In another terminal, launch on iOS
   npx react-native run-ios
   ```
   
   #### Running on a Physical iOS Device
   - Open `ios/LexChatbotApp.xcworkspace` in Xcode
   - Select your device in the device dropdown
   - Sign the app with your Apple Developer account
   - Press the Run button or `Cmd+R`

   ### Building for Production
   
   #### Android Release Build
   ```bash
   # Generate a signed APK
   cd android
   ./gradlew assembleRelease
   ```
   The APK will be available at `android/app/build/outputs/apk/release/app-release.apk`
   
   #### iOS Release Build
   Use Xcode to create an archive and distribute the app through App Store Connect or as an Ad Hoc distribution.

3. **Configure the App**
   - Enter your AWS Access Key and Secret Key
   - The Bot ID and Alias ID should auto-populate from `bot_info.json`
   - Or enter them manually from your AWS console

## Mobile App Troubleshooting

### Android Issues
- **Build fails with SDK errors**: Ensure Android SDK paths are correctly set in your environment
- **App crashes on startup**: Check that you have completed the React Native setup for Android development
- **Gradle timeout errors**: Add `org.gradle.jvmargs=-Xmx4g` to `android/gradle.properties`

### iOS Issues
- **Pod install failing**: Try `pod repo update` before running `pod install`
- **Xcode build errors**: Ensure you have the latest Xcode command line tools with `xcode-select --install`
- **Signing issues**: Configure your Apple Developer account in Xcode's Signing & Capabilities section

### General Issues
- **Metro bundler crashes**: Clear the cache with `npx react-native start --reset-cache`
- **Red screen errors**: Check the error message and console logs for specific issues
- **Performance issues**: Enable Hermes engine in `android/app/build.gradle` and `ios/Podfile`

## Usage Examples

The chatbot understands natural language queries about your expenses:

- "Show me my expenses" - View overall expense breakdown
- "Tell me about my travel expenses" - Get category-specific analysis
- "What was my biggest spend?" - Find largest expense categories
- "Where is my money going?" - See spending distribution by vendor
- "Give me suggestions to reduce spending" - Get AI-powered cost-saving tips

## Troubleshooting

- **AWS Connection Issues**: The app will use Enhanced NLP Mode as a fallback
- **Bot Not Responding**: Try using more specific expense-related terms
- **Configuration Errors**: Verify your AWS credentials and bot details

## Advanced Features

- **Context Tracking**: The bot remembers previous conversation topics
- **Category Comparisons**: Ask about relationships between expense categories
- **Trend Analysis**: Get insights on spending patterns over time
- **Budget Recommendations**: Receive personalized advice to optimize spending

## Architecture

- React Native for the mobile interface
- AWS Lex V2 for natural language understanding
- DynamoDB for expense data storage (when connected)
- Enhanced local NLP for offline functionality

## License

MIT License
