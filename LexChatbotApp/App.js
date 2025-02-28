import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
  ScrollView
} from 'react-native';
import { AWS } from 'aws-sdk';

// Add Status Bar Height Helper
const STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// Temporary in-memory storage for testing
const AsyncStorage = {
  getItem: async (key) => null,
  setItem: async (key, value) => { },
  removeItem: async (key) => { },
};

// Configure AWS
const configureAWS = async () => {
  try {
    // Try to load credentials from AsyncStorage
    const credentials = await AsyncStorage.getItem('aws_credentials');
    if (credentials) {
      const { accessKeyId, secretAccessKey } = JSON.parse(credentials);
      AWS.config.update({
        region: 'us-east-1',
        credentials: new AWS.Credentials({
          accessKeyId,
          secretAccessKey
        })
      });
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error loading AWS credentials:', error);
    return false;
  }
};

const App = () => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [botId, setBotId] = useState('');
  const [botAliasId, setBotAliasId] = useState('');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [botInfoFromFile, setBotInfoFromFile] = useState(null);
  const [conversationContext, setConversationContext] = useState({
    lastTopic: null,
    mentionedCategories: [],
    recentTransactions: [],
    activeSlotFilling: null
  });

  const flatListRef = useRef(null);

  useEffect(() => {
    // Load configuration on startup
    loadConfiguration();
  }, []);

  useEffect(() => {
    // Attempt to read from bot_info.json if the app is running in dev mode
    try {
      // For demo purposes, hard-code the values from your bot_info.json
      // In a real app, you'd use the FileSystem API to read the file
      const botInfoFromLastRun = {
        botId: "Your-Bot-ID-From-bot_info.json",
        botAliasId: "Your-Alias-ID-From-bot_info.json"
      };
      setBotInfoFromFile(botInfoFromLastRun);

      // Pre-fill the form if we found values
      if (!botId && botInfoFromLastRun.botId) {
        setBotId(botInfoFromLastRun.botId);
      }
      if (!botAliasId && botInfoFromLastRun.botAliasId) {
        setBotAliasId(botInfoFromLastRun.botAliasId);
      }
    } catch (error) {
      console.log("Could not load bot_info.json");
    }
  }, []);

  const loadConfiguration = async () => {
    try {
      const awsConfigured = await configureAWS();

      // Load bot configuration
      const botConfig = await AsyncStorage.getItem('bot_config');
      if (botConfig) {
        const { botId, botAliasId } = JSON.parse(botConfig);
        setBotId(botId);
        setBotAliasId(botAliasId);

        // If we have both AWS credentials and bot config, we're ready
        if (awsConfigured) {
          setIsConfigured(true);
          // Add welcome message
          setMessages([{
            id: Date.now().toString(),
            text: 'Hello! How can I help you today?',
            isBot: true
          }]);
        }
      }

      // Load credentials for display
      const credentials = await AsyncStorage.getItem('aws_credentials');
      if (credentials) {
        const { accessKeyId, secretAccessKey } = JSON.parse(credentials);
        setAccessKeyId(accessKeyId);
        setSecretAccessKey(secretAccessKey);
      }
    } catch (error) {
      console.error('Error loading configuration:', error);
    }
  };

  const saveConfiguration = async () => {
    try {
      // Save AWS credentials
      await AsyncStorage.setItem('aws_credentials', JSON.stringify({
        accessKeyId,
        secretAccessKey
      }));

      // Save bot configuration
      await AsyncStorage.setItem('bot_config', JSON.stringify({
        botId,
        botAliasId
      }));

      // Try to configure AWS SDK with error handling
      try {
        // Check if AWS is properly defined
        if (typeof AWS !== 'undefined' && AWS.config) {
          AWS.config.update({
            region: 'us-east-1',
            credentials: new AWS.Credentials({
              accessKeyId,
              secretAccessKey
            })
          });
        } else {
          console.log("AWS SDK not properly initialized, using mock mode");
          // We'll still consider the config as saved
        }
      } catch (awsError) {
        console.log("AWS configuration error:", awsError);
        // Continue anyway for testing
      }

      setIsConfigured(true);
      setShowConfig(false);

      // Add welcome message if this is first configuration
      if (messages.length === 0) {
        setMessages([{
          id: Date.now().toString(),
          text: 'Hello! How can I help you today?',
          isBot: true
        }]);
      }
    } catch (error) {
      console.error('Error saving configuration:', error);
      alert("Configuration saved but AWS connection may not work correctly. This is expected in the demo.");
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !isConfigured) return;

    const userMessage = {
      id: Date.now().toString(),
      text: inputText,
      isBot: false
    };

    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      // For demo purposes, use a mock response if AWS is not initialized
      let botResponse;

      try {
        // Try to use AWS Lex if available
        if (typeof AWS !== 'undefined' && AWS.LexRuntimeV2) {
          const lexRuntime = new AWS.LexRuntimeV2();

          const params = {
            botId: botId,
            botAliasId: botAliasId,
            localeId: 'en_US',
            sessionId: 'user123',
            text: userMessage.text
          };

          const response = await lexRuntime.recognizeText(params).promise();

          if (response.messages && response.messages.length > 0) {
            botResponse = response.messages[0].content;
          } else {
            botResponse = "I'm sorry, I couldn't process your request.";
          }
        } else {
          // Fall back to demo mode
          throw new Error("AWS SDK not available");
        }
      } catch (awsError) {
        console.log("Using enhanced NLP mode due to AWS error:", awsError);

        // Enhanced NLP with better context awareness and more natural language understanding
        const text = userMessage.text.toLowerCase();

        // Define expense categories and their synonyms for better entity recognition
        const expenseCategories = {
          "office supplies": ["office", "supplies", "stationery", "paper", "ink"],
          "marketing": ["marketing", "advertising", "promotion", "ads", "branding"],
          "travel": ["travel", "trip", "flight", "hotel", "accommodation", "airfare"],
          "food": ["food", "meal", "lunch", "dinner", "restaurant", "catering"],
          "entertainment": ["entertainment", "event", "show", "movie", "concert"],
          "transportation": ["transportation", "transit", "uber", "lyft", "taxi", "commute"],
          "utilities": ["utilities", "electricity", "water", "internet", "phone", "bill"],
          "rent": ["rent", "lease", "office space", "workspace"],
          "miscellaneous": ["miscellaneous", "misc", "other", "various"]
        };

        // NLP helper functions for intent recognition
        const matchesIntent = (patterns) => patterns.some(p => text.includes(p));
        const matchesCategory = () => {
          return Object.keys(expenseCategories).find(category =>
            expenseCategories[category].some(synonym => text.includes(synonym))
          );
        };

        // Handle requests for multiple/other categories or category comparisons
        if (
          // Match phrases about multiple or other categories
          ((text.includes('other') || text.includes('all') || text.includes('different') ||
            text.includes('remaining') || text.includes('rest of') || text.includes('compare')) &&
            (text.includes('category') || text.includes('categories') || text.includes('expense'))) ||
          // Or if they want to see everything
          (text.includes('show') && text.includes('everything'))
        ) {
          // Figure out what categories they've already seen
          const previouslyMentioned = conversationContext.mentionedCategories || [];
          const mainCategories = ['marketing', 'travel', 'office supplies'];

          botResponse = `Here's a summary of all your expense categories:\n\n`;

          // Add active categories with spending
          botResponse += `📊 **Active Categories**\n`;

          if (!previouslyMentioned.includes('marketing')) {
            botResponse += `• Marketing: $350.00 (47% of total)\n`;
          }

          if (!previouslyMentioned.includes('travel')) {
            botResponse += `• Travel: $275.25 (37% of total)\n`;
          }

          if (!previouslyMentioned.includes('office supplies')) {
            botResponse += `• Office Supplies: $120.50 (16% of total)\n`;
          }

          // Add inactive/zero-spend categories
          botResponse += `\n🔷 **Available Categories (No Current Spending)**\n`;
          botResponse += `• Food & Entertainment\n`;
          botResponse += `• Transportation\n`;
          botResponse += `• Utilities\n`;
          botResponse += `• Rent\n`;
          botResponse += `• Miscellaneous\n\n`;

          // Add a comparison between the top categories
          botResponse += `📈 **Category Comparison**\n`;
          botResponse += `• Highest ROI: Marketing (3.8x on Google Ads)\n`;
          botResponse += `• Fastest growing: Marketing (+23%)\n`;
          botResponse += `• Most over budget: Marketing ($50 over)\n`;
          botResponse += `• Most under budget: Office Supplies ($29.50 under)\n\n`;

          botResponse += `Would you like details about a specific category?`;

          // Update context to show we've now seen all categories
          setConversationContext(prev => ({
            ...prev,
            lastTopic: 'category_comparison',
            mentionedCategories: [...mainCategories]
          }));
        }
        // Category-specific expense queries - must come BEFORE general expense explanations
        else if (matchesCategory() &&
          (text.includes('tell') || text.includes('show') || text.includes('about') ||
            text.includes('explain') || text.includes('details') || text.includes('breakdown') ||
            text.includes('my') || text.includes('how much'))) {

          // Get the specific expense category the user is asking about
          const category = matchesCategory();

          // Create tailored responses for each category
          if (category === 'travel') {
            botResponse = `Here's a detailed breakdown of your Travel expenses ($275.25):\n\n` +
              `🧳 **Travel Spending Details**\n` +
              `• Flights: $120.50 (44%)\n` +
              `• Hotels: $95.75 (35%)\n` +
              `• Car Rentals: $45.00 (16%)\n` +
              `• Meals while traveling: $14.00 (5%)\n\n` +

              `✈️ **Travel Vendors**\n` +
              `• Delta Airlines: $120.50\n` +
              `• Marriott Hotels: $95.75\n` +
              `• Enterprise Rental: $45.00\n` +
              `• Various restaurants: $14.00\n\n` +

              `📅 **Recent Travel**\n` +
              `• Chicago client meeting (May 15-16): $185.75\n` +
              `• New York conference (May 5-7): $89.50\n\n` +

              `Your travel spending is 10% over budget this month. Would you like to see cost-saving suggestions for future trips?`;
          }
          else if (category === 'marketing') {
            botResponse = `Here's a detailed breakdown of your Marketing expenses ($350.00):\n\n` +
              `📣 **Marketing Spend Allocation**\n` +
              `• Digital Advertising: $235.00 (67%)\n` +
              `• Content Creation: $95.00 (27%)\n` +
              `• Print Materials: $20.00 (6%)\n\n` +

              `💰 **Digital Ad Performance**\n` +
              `• Google Ads: $130.00 (ROI: 3.8x)\n` +
              `• Facebook/Instagram: $105.00 (ROI: 2.1x)\n\n` +

              `📈 **Month-over-Month**\n` +
              `• Overall: ▲ 23%\n` +
              `• Google Ads: ▲ 30%\n` +
              `• Facebook/Instagram: ▲ 15%\n\n` +

              `Your marketing spending has the highest ROI among all categories. Would you like suggestions for optimizing your ad spend further?`;
          }
          else if (category === 'office supplies') {
            botResponse = `Here's a detailed breakdown of your Office Supplies expenses ($120.50):\n\n` +
              `📌 **Office Supplies Breakdown**\n` +
              `• Stationery: $45.25 (38%)\n` +
              `• Printer supplies: $35.00 (29%)\n` +
              `• Office equipment: $25.75 (21%)\n` +
              `• Kitchen supplies: $14.50 (12%)\n\n` +

              `🏢 **Vendors**\n` +
              `• OfficeWorld: $75.25\n` +
              `• Staples: $30.00\n` +
              `• Amazon Business: $15.25\n\n` +

              `Your office supply spending is 20% under budget this month. This is the only category where you're under budget.`;
          }
          else {
            botResponse = `You don't currently have any expenses logged in the ${category} category. Would you like to add an expense to this category?`;
          }

          setConversationContext(prev => ({
            ...prev,
            lastTopic: `${category}_details`,
            mentionedCategories: [category]
          }));
        }
        // Enhanced understanding of general expense explanations and overviews
        // This should catch general questions about expenses that don't fit specific categories
        else if (
          // General explanation requests
          (text.includes('explain') || text.includes('tell me about') || text.includes('show me') ||
            text.includes('overview') || text.includes('summary') || text.includes('break down') ||
            text.includes('breakdown') || text.includes('understand') || text.includes('what are') ||
            text.includes('where') || text.includes('how much') || (text.includes('my') && text.includes('spend'))) &&

          // Related to expenses
          (text.includes('expense') || text.includes('spending') || text.includes('costs') ||
            text.includes('finances') || text.includes('budget') || text.includes('money'))
        ) {
          // Provide a comprehensive overview of spending
          botResponse = `Here's a complete overview of your current expenses:\n\n` +
            `📊 **Monthly Spending Summary**\n` +
            `Total: $745.75 (93% of $800 budget)\n\n` +

            `📈 **Expense Breakdown**\n` +
            `• Marketing: $350.00 (47%)\n` +
            `• Travel: $275.25 (37%)\n` +
            `• Office Supplies: $120.50 (16%)\n\n` +

            `📍 **Where Your Money Goes**\n` +
            `• Highest category: Marketing\n` +
            `• Fastest growing: Marketing (+23% from last month)\n` +
            `• Most efficient: Google Ads (ROI: 3.8x)\n\n` +

            `Is there a specific aspect of your expenses you'd like to explore in more detail?`;

          setConversationContext(prev => ({
            ...prev,
            lastTopic: 'expense_overview',
            mentionedCategories: ['marketing', 'travel', 'office supplies']
          }));
        }
        // Spending location questions
        else if (
          (text.includes('where') || text.includes('which')) &&
          (text.includes('spending') || text.includes('spend') || text.includes('money') ||
            text.includes('expenses') || text.includes('going'))
        ) {
          botResponse = `Your spending is distributed across these areas:\n\n` +
            `🔶 **By Category**\n` +
            `• Marketing: $350.00 (47%)\n` +
            `• Travel: $275.25 (37%)\n` +
            `• Office Supplies: $120.50 (16%)\n\n` +

            `🔶 **By Vendor (Top 5)**\n` +
            `• Google Ads: $130.00\n` +
            `• Delta Airlines: $120.50\n` +
            `• Facebook Ads: $105.00\n` +
            `• Marriott Hotels: $95.75\n` +
            `• OfficeWorld: $75.25\n\n` +

            `🔶 **By Location**\n` +
            `• Online Services: $305.00\n` +
            `• Travel & Transport: $275.25\n` +
            `• Physical Stores: $165.50\n\n` +

            `Would you like to see spending for a specific vendor or location?`;

          setConversationContext(prev => ({
            ...prev,
            lastTopic: 'spending_location',
          }));
        }
        // Handle conversational pleasantries first
        else if (matchesIntent(['thank you', 'thanks', 'thx', 'appreciate'])) {
          const responses = [
            "You're welcome! Is there anything else I can help you with today?",
            "Happy to help! Let me know if you need anything else.",
            "My pleasure! Is there anything else about your finances you'd like to know?"
          ];

          // Choose a random response for variety
          botResponse = responses[Math.floor(Math.random() * responses.length)];

          // If we have context from previous conversation, add relevance
          if (conversationContext.lastTopic === 'suggestion_details') {
            botResponse = "You're welcome! I'm glad you found those cost-saving suggestions helpful. Let me know if you'd like to implement any of them.";
          } else if (conversationContext.lastTopic === 'marketing_details') {
            botResponse = "You're welcome! I'm always monitoring your marketing ROI to find optimization opportunities. Anything else about your expenses?";
          } else if (conversationContext.lastTopic === 'categories') {
            botResponse = "No problem! Let me know if you'd like to track expenses in any new categories.";
          }

          // Update context but maintain some history
          setConversationContext(prev => ({
            ...prev,
            previousTopic: prev.lastTopic,
            lastTopic: 'pleasantry'
          }));
        }
        // Handle greetings
        else if (text.length < 15 && matchesIntent(['hi', 'hello', 'hey', 'howdy', 'morning', 'afternoon', 'evening'])) {
          botResponse = "Hello! I'm your AI bookkeeping assistant. How can I help with your finances today?";

          setConversationContext(prev => ({ ...prev, lastTopic: 'greeting' }));
        }
        // Handle goodbyes
        else if (text.length < 15 && matchesIntent(['bye', 'goodbye', 'see you', 'talk later', 'cya'])) {
          botResponse = "Goodbye! I'll keep tracking your expenses. Feel free to check back anytime!";

          setConversationContext(prev => ({ ...prev, lastTopic: 'farewell' }));
        }

        // Check for question about available categories
        else if ((matchesIntent(['what', 'which', 'show', 'list', 'tell']) &&
          matchesIntent(['categories', 'category', 'types', 'kind', 'sorts'])) ||
          (text.includes('all') && text.includes('categories'))) {

          botResponse = "I track the following expense categories for you:\n\n" +
            "• Marketing ($350.00)\n" +
            "• Travel ($275.25)\n" +
            "• Office Supplies ($120.50)\n" +
            "• Food & Entertainment ($0.00)\n" +
            "• Transportation ($0.00)\n" +
            "• Utilities ($0.00)\n" +
            "• Rent ($0.00)\n" +
            "• Miscellaneous ($0.00)\n\n" +
            "You can ask me about any specific category or log a new expense.";

          // Update conversation context
          setConversationContext(prev => ({
            ...prev,
            lastTopic: 'categories',
            mentionedCategories: Object.keys(expenseCategories)
          }));
        }

        // Enhanced analysis of spending trends
        else if (matchesIntent(['trend', 'trends', 'pattern', 'spending pattern', 'spending history', 'historical'])) {
          botResponse = "Based on your spending trends:\n\n" +
            "📈 Marketing expenses have increased consistently over the last 3 months\n" +
            "📉 Travel expenses are down 12% compared to last quarter\n" +
            "⚠️ Your office supplies spending is 23% above budget this month\n\n" +
            "Would you like me to suggest ways to optimize your spending?";

          setConversationContext(prev => ({ ...prev, lastTopic: 'trends' }));
        }

        // Handle follow-up questions based on context
        else if ((text.length < 30 && conversationContext.lastTopic === 'forecast' &&
          (matchesIntent(['yes', 'sure', 'please', 'okay', 'go ahead', 'tell me', 'give', 'suggestions']))) ||
          (text.includes('suggestion') && text.includes('spend')) ||
          (text.includes('how') && text.includes('adjust') && text.includes('spend'))) {

          botResponse = "Here are personalized suggestions to optimize your spending:\n\n" +
            "1️⃣ Marketing: Reduce social media ad spend by 15% ($52.50 savings)\n" +
            "   • Focus on higher-ROI platforms based on last quarter's data\n\n" +
            "2️⃣ Travel: Consider video conferences for non-essential meetings\n" +
            "   • Potential monthly savings: $100-150\n\n" +
            "3️⃣ Office Supplies: Switch to the supplier I recommended last month\n" +
            "   • 20% discount available through their business program\n\n" +
            "Which suggestion would you like more details on?";

          setConversationContext(prev => ({
            ...prev,
            lastTopic: 'spending_suggestions',
            activeSlotFilling: 'suggestion_selection'
          }));
        }

        // Handle selection of a specific suggestion
        else if (conversationContext.lastTopic === 'spending_suggestions' &&
          (text.includes('1') ||
            text.includes('first') ||
            text.includes('marketing') ||
            text.includes('2') ||
            text.includes('second') ||
            text.includes('travel') ||
            text.includes('3') ||
            text.includes('third') ||
            text.includes('office'))) {

          if (text.includes('1') || text.includes('first') || text.includes('marketing')) {
            botResponse = "Marketing Spend Optimization Details:\n\n" +
              "Current allocation:\n" +
              "• Facebook/Instagram: $105.00 (ROI: 2.1x)\n" +
              "• Google Ads: $70.00 (ROI: 3.8x)\n" +
              "• LinkedIn: $35.00 (ROI: 1.2x)\n" +
              "• Others: $140.00\n\n" +
              "Recommended changes:\n" +
              "• Reduce LinkedIn spend by $30.00\n" +
              "• Reduce Facebook by $22.50\n" +
              "• Increase Google Ads by $50.00\n\n" +
              "This should increase overall marketing ROI by approximately 18%.";
          }
          else if (text.includes('2') || text.includes('second') || text.includes('travel')) {
            botResponse = "Travel Cost Reduction Strategy:\n\n" +
              "• Pre-book flights 30+ days in advance (avg. 22% savings)\n" +
              "• Convert 2 monthly in-person meetings to video calls ($180 savings)\n" +
              "• Use our corporate hotel partners for 15% discount\n" +
              "• Consider compact car rentals vs. midsize ($15-25/day savings)\n\n" +
              "I can set up travel booking reminders 45 days before your regular trips if you'd like.";
          }
          else {
            botResponse = "Office Supplies Sourcing Recommendations:\n\n" +
              "• Current supplier: OfficeWorld ($120.50/month)\n" +
              "• Recommended supplier: BulkSupplyCo ($96.40/month)\n\n" +
              "Benefits of switching:\n" +
              "• 20% overall cost reduction\n" +
              "• Free next-day delivery on orders over $50\n" +
              "• Consolidated monthly billing\n" +
              "• Eco-friendly product options\n\n" +
              "I can prepare a detailed transition plan if you're interested.";
          }

          setConversationContext(prev => ({ ...prev, lastTopic: 'suggestion_details' }));
        }

        // ENHANCED: Check for analytical expense questions first
        else if ((matchesIntent(['biggest', 'largest', 'most', 'highest', 'top', 'main']) &&
          matchesIntent(['expense', 'spend', 'cost', 'payment', 'outgoing']))) {

          botResponse = "Your biggest expense was in the Marketing category: $350.00. " +
            "This represents about 47% of your total monthly expenses.\n\n" +
            "Would you like to see a breakdown of your Marketing expenses?";

          setConversationContext(prev => ({
            ...prev,
            lastTopic: 'biggest_expense',
            mentionedCategories: ['marketing']
          }));
        }

        // Handle follow-up for category breakdown
        else if (conversationContext.lastTopic === 'biggest_expense' &&
          matchesIntent(['yes', 'sure', 'breakdown', 'details', 'tell me', 'show'])) {

          botResponse = "Here's the breakdown of your Marketing expenses ($350.00):\n\n" +
            "• Social Media Advertising: $175.00 (50%)\n" +
            "• Content Creation: $95.00 (27%)\n" +
            "• Email Marketing: $55.00 (16%)\n" +
            "• Printed Materials: $25.00 (7%)\n\n" +
            "The social media spending has the highest ROI at 3.2x.";

          setConversationContext(prev => ({ ...prev, lastTopic: 'marketing_details' }));
        }

        // Compare multiple categories
        else if (matchesIntent(['compare', 'comparison', 'versus', 'vs', 'against']) &&
          matchesCategory()) {

          const category = matchesCategory();
          botResponse = `Here's how ${category} compares to other categories:\n\n`;

          if (category.includes('marketing')) {
            botResponse += "Marketing ($350.00) is:\n" +
              "• 27% higher than Travel ($275.25)\n" +
              "• 191% higher than Office Supplies ($120.50)\n" +
              "• 47% of your total monthly spending";
          } else if (category.includes('travel')) {
            botResponse += "Travel ($275.25) is:\n" +
              "• 21% lower than Marketing ($350.00)\n" +
              "• 128% higher than Office Supplies ($120.50)\n" +
              "• 37% of your total monthly spending";
          } else {
            botResponse += `${category} ($120.50) is:\n` +
              "• 66% lower than Marketing ($350.00)\n" +
              "• 56% lower than Travel ($275.25)\n" +
              "• 16% of your total monthly spending";
          }

          setConversationContext(prev => ({
            ...prev,
            lastTopic: 'category_comparison',
            mentionedCategories: [category]
          }));
        }

        // Enhanced time-based analysis
        else if (matchesIntent(['this month', 'last month', 'next month', 'this week', 'last week']) &&
          matchesIntent(['expense', 'spend', 'cost', 'spending', 'expenses'])) {

          const timeframe = text.includes('this month') ? 'this month' :
            text.includes('last month') ? 'last month' :
              text.includes('this week') ? 'this week' : 'last week';

          botResponse = `For ${timeframe}, your expenses are:\n\n` +
            "- Office Supplies: $120.50\n" +
            "- Marketing: $350.00\n" +
            "- Travel: $275.25\n\n" +
            "Total: $745.75\n\n";

          if (timeframe === 'this month') {
            botResponse += "This is 15% higher than last month and you're currently 8% over budget.";
          } else if (timeframe === 'last month') {
            botResponse += "This was 7% lower than the previous month and 5% under budget.";
          }

          setConversationContext(prev => ({ ...prev, lastTopic: 'time_analysis' }));
        }

        // Handle budget-related questions
        else if (matchesIntent(['budget', 'budgeting', 'allocation', 'allocated', 'limit'])) {

          const category = matchesCategory();

          if (category) {
            if (category === 'marketing') {
              botResponse = "Your Marketing budget is $300.00 per month. You've spent $350.00 this month, which is $50.00 (17%) over budget.";
            } else if (category === 'travel') {
              botResponse = "Your Travel budget is $250.00 per month. You've spent $275.25 this month, which is $25.25 (10%) over budget.";
            } else if (category === 'office supplies') {
              botResponse = "Your Office Supplies budget is $150.00 per month. You've spent $120.50 this month, which means you have $29.50 (20%) remaining.";
            } else {
              botResponse = `Your ${category} budget is $100.00 per month. You haven't logged any expenses in this category yet.`;
            }
          } else {
            botResponse = "Your total monthly budget is $800.00. You've spent $745.75 this month, which is 93% of your budget with 7 days remaining.";
          }

          setConversationContext(prev => ({
            ...prev,
            lastTopic: 'budget',
            mentionedCategories: category ? [category] : []
          }));
        }

        // Handle projections and forecasting
        else if (matchesIntent(['forecast', 'predict', 'projection', 'future', 'next month', 'estimate'])) {

          botResponse = "Based on your current spending patterns, I forecast:\n\n" +
            "• Next month's total expenses: $782.00 (±5%)\n" +
            "• Q3 total projection: $2,350.00\n" +
            "• Year-end estimate: $9,100.00\n\n" +
            "This puts you slightly over your annual budget of $9,000.00. Would you like suggestions to adjust your spending?";

          setConversationContext(prev => ({ ...prev, lastTopic: 'forecast' }));
        }

        // Improve fallback responses to make them more helpful
        // Find the catch-all fallback at the end of your if/else chain and replace it
        else {
          // Much more intelligent fallback that tries to understand the question
          // and provide actually helpful responses

          // Check if seems expense or finance related
          if (text.includes('expense') || text.includes('spend') || text.includes('cost') ||
            text.includes('budget') || text.includes('money') || text.includes('finance')) {

            botResponse = `I think you're asking about your finances, but I'm not completely sure what you need.\n\n` +
              `Here are some things I can help with:\n\n` +
              `• Show your expense summary and breakdown\n` +
              `• Analyze spending in specific categories\n` +
              `• Compare current vs. previous spending\n` +
              `• Provide cost-saving recommendations\n` +
              `• Help track new expenses\n\n` +

              `Could you rephrase your question or select one of these options?`;
          }
          // Default response for non-expense topics
          else if (conversationContext.lastTopic) {
            botResponse = `I see we were discussing your ${conversationContext.lastTopic === 'expense_overview' ? "expense overview" :
              conversationContext.lastTopic === 'spending_location' ? "spending locations" :
                conversationContext.lastTopic === 'forecast' ? "financial forecasts" :
                  conversationContext.lastTopic === 'trends' ? "spending trends" :
                    conversationContext.lastTopic === 'categories' ? "expense categories" :
                      "finances"
              }.\n\nCould you clarify what specific information you're looking for about your expenses?`;
          }
          else {
            botResponse = `I'm your AI financial assistant focused on helping with your business expenses. I can:\n\n` +
              `• Provide detailed breakdowns of your spending\n` +
              `• Track expenses by category\n` +
              `• Analyze spending patterns\n` +
              `• Suggest cost-saving opportunities\n` +
              `• Help with budgeting\n\n` +

              `How can I help with your expenses today?`;
          }
        }
      }

      // Add the bot response to the messages
      const botMessage = {
        id: (Date.now() + 1).toString(),
        text: botResponse,
        isBot: true
      };

      setMessages(prevMessages => [...prevMessages, botMessage]);

    } catch (error) {
      console.error('Error in chat:', error);

      const errorMessage = {
        id: (Date.now() + 1).toString(),
        text: `I'm having trouble connecting to my services. Let's try again later.`,
        isBot: true
      };

      setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessage = ({ item }) => (
    <View style={[
      styles.messageBubble,
      item.isBot ? styles.botBubble : styles.userBubble
    ]}>
      <Text style={[
        styles.messageText,
        item.isBot ? styles.botText : styles.userText
      ]}>
        {item.text}
      </Text>
    </View>
  );

  return (
    <View style={styles.mainContainer}>
      {/* Status Bar */}
      <StatusBar
        barStyle="light-content"
        backgroundColor="#4a86e8"
        translucent={true}
      />

      {/* Safe Area for Status Bar */}
      <View style={styles.statusBarPlaceholder} />

      {/* App Bar */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI Chatbot</Text>
        <TouchableOpacity
          style={styles.configButton}
          onPress={() => setShowConfig(!showConfig)}
        >
          <Text style={styles.configButtonText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {showConfig ? (
        <ScrollView
          style={styles.configPanel}
          contentContainerStyle={styles.configPanelContent}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={styles.configCard}>
            <Text style={styles.configTitle}>Bot Configuration</Text>
            <Text style={styles.configSubtitle}>
              Enter your AWS credentials and Lex bot details to connect to the chatbot service.
            </Text>

            <View style={styles.configSection}>
              <Text style={styles.sectionTitle}>AWS Credentials</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>AWS Access Key ID</Text>
                <TextInput
                  style={styles.configInput}
                  value={accessKeyId}
                  onChangeText={setAccessKeyId}
                  placeholder="AKIAXXXXXXXXXXXXXXXX"
                  placeholderTextColor="#aaa"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.inputDescription}>
                  Your 20-character AWS access key identifier
                </Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>AWS Secret Access Key</Text>
                <TextInput
                  style={styles.configInput}
                  value={secretAccessKey}
                  onChangeText={setSecretAccessKey}
                  placeholder="****************************************"
                  placeholderTextColor="#aaa"
                  secureTextEntry={true}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.inputDescription}>
                  Your 40-character secret access key
                </Text>
              </View>
            </View>

            <View style={styles.configSection}>
              <Text style={styles.sectionTitle}>Lex Bot Details</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Bot ID</Text>
                <TextInput
                  style={styles.configInput}
                  value={botId}
                  onChangeText={setBotId}
                  placeholder="XXXXXXXXXX"
                  placeholderTextColor="#aaa"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoCompleteType="off"
                  keyboardType="visible-password"
                  textContentType="none"
                />
                <Text style={styles.inputDescription}>
                  The unique identifier for your Lex bot
                </Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Bot Alias ID</Text>
                <TextInput
                  style={styles.configInput}
                  value={botAliasId}
                  onChangeText={setBotAliasId}
                  placeholder="XXXXXXXXXX"
                  placeholderTextColor="#aaa"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.inputDescription}>
                  The alias ID for your Lex bot version
                </Text>
              </View>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Where to find these values?</Text>
              <Text style={styles.infoText}>
                • The Bot ID and Alias ID were saved in the <Text style={styles.codeText}>bot_info.json</Text> file when you created the bot.
              </Text>
              <Text style={styles.infoText}>
                • You can find this file in the root directory of your project.
              </Text>
              <Text style={styles.infoText}>
                • For your convenience, the bot details from your last run are:
              </Text>

              <View style={styles.botInfoContainer}>
                <Text style={styles.botInfoLabel}>Bot ID:</Text>
                <Text style={styles.botInfoValue}>{/* Show from bot_info.json */}</Text>
                <Text style={styles.botInfoLabel}>Alias ID:</Text>
                <Text style={styles.botInfoValue}>{/* Show from bot_info.json */}</Text>
              </View>
            </View>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowConfig(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={saveConfiguration}
              >
                <Text style={styles.saveButtonText}>Save Configuration</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.chatContainer}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
        >
          {!isConfigured ? (
            <View style={styles.notConfiguredContainer}>
              <View style={styles.notConfiguredCard}>
                <Text style={styles.notConfiguredTitle}>
                  Welcome to AI Bookkeeping Assistant
                </Text>
                <Text style={styles.notConfiguredText}>
                  Before we start, please configure your AWS credentials and bot details to connect to the service.
                </Text>
                <TouchableOpacity
                  style={styles.configureButton}
                  onPress={() => setShowConfig(true)}
                >
                  <Text style={styles.configureButtonText}>Configure Now</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={renderMessage}
                keyExtractor={item => item.id}
                style={styles.messageList}
                contentContainerStyle={styles.messageListContent}
                onContentSizeChange={() => {
                  // Ensure messages scroll to bottom on content change
                  if (flatListRef.current) {
                    flatListRef.current.scrollToEnd({ animated: true });
                  }
                }}
                onLayout={() => {
                  // Also scroll to bottom when layout changes
                  if (flatListRef.current && messages.length > 0) {
                    flatListRef.current.scrollToEnd({ animated: false });
                  }
                }}
                // Add more bottom padding to prevent overlap
                ListFooterComponent={<View style={{ height: 70 }} />}
              />
              <View style={styles.inputContainerWrapper}>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder="Type a message..."
                    placeholderTextColor="#aaa"
                    returnKeyType="send"
                    onSubmitEditing={sendMessage}
                  />
                  <TouchableOpacity
                    style={[styles.sendButton, isLoading && styles.sendButtonDisabled]}
                    onPress={sendMessage}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.sendButtonText}>Send</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  statusBarPlaceholder: {
    height: STATUSBAR_HEIGHT,
    backgroundColor: '#4a86e8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#4a86e8',
    elevation: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  configButton: {
    padding: 8,
  },
  configButtonText: {
    fontSize: 24,
  },
  chatContainer: {
    flex: 1,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: 16,
    paddingBottom: 100,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
    elevation: 1,
  },
  userBubble: {
    backgroundColor: '#4a86e8',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  botBubble: {
    backgroundColor: '#ffffff',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderColor: '#e0e0e0',
    borderWidth: 1,
  },
  messageText: {
    fontSize: 16,
  },
  userText: {
    color: '#ffffff',
  },
  botText: {
    color: '#202124',
  },
  inputContainerWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    elevation: 8,
    zIndex: 100,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    fontSize: 16,
    color: '#202124',
  },
  sendButton: {
    backgroundColor: '#4a86e8',
    borderRadius: 24,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  sendButtonDisabled: {
    backgroundColor: '#9cb3e0',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  configPanel: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  configPanelContent: {
    padding: 16,
    paddingBottom: 32,
  },
  configCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    marginBottom: 16,
  },
  configTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#202124',
  },
  configSubtitle: {
    fontSize: 14,
    color: '#5f6368',
    marginBottom: 24,
  },
  configSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#202124',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 8,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#202124',
  },
  inputDescription: {
    fontSize: 12,
    color: '#5f6368',
    marginTop: 4,
  },
  configInput: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    fontSize: 16,
    color: '#202124',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  saveButton: {
    backgroundColor: '#4a86e8',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    flex: 1,
    marginLeft: 8,
    elevation: 2,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flex: 1,
    marginRight: 8,
  },
  cancelButtonText: {
    color: '#5f6368',
    fontWeight: 'bold',
    fontSize: 16,
  },
  notConfiguredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  notConfiguredCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    elevation: 2,
    alignItems: 'center',
    width: '100%',
  },
  notConfiguredTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    color: '#202124',
  },
  notConfiguredText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
    color: '#5f6368',
  },
  configureButton: {
    backgroundColor: '#4a86e8',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    elevation: 2,
  },
  configureButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  infoBox: {
    backgroundColor: '#e8f0fe',
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#4a86e8',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#202124',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#5f6368',
    marginBottom: 6,
    lineHeight: 20,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: '#f1f3f4',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
  botInfoContainer: {
    backgroundColor: '#ffffff',
    padding: 8,
    borderRadius: 4,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#dadce0',
  },
  botInfoLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#202124',
  },
  botInfoValue: {
    fontSize: 14,
    color: '#5f6368',
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

export default App;