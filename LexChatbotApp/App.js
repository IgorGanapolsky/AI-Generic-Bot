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
  ActivityIndicator
} from 'react-native';
import { AWS } from 'aws-sdk';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  
  const flatListRef = useRef(null);

  useEffect(() => {
    // Load configuration on startup
    loadConfiguration();
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
      
      // Configure AWS SDK
      AWS.config.update({
        region: 'us-east-1',
        credentials: new AWS.Credentials({
          accessKeyId,
          secretAccessKey
        })
      });
      
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
      // Create Lex runtime service object
      const lexRuntime = new AWS.LexRuntimeV2();
      
      // Send request to Lex
      const params = {
        botId: botId,
        botAliasId: botAliasId,
        localeId: 'en_US',
        sessionId: 'user123', // You might want to generate a unique session ID
        text: userMessage.text
      };
      
      const response = await lexRuntime.recognizeText(params).promise();
      
      // Process response
      if (response.messages && response.messages.length > 0) {
        const botMessage = {
          id: (Date.now() + 1).toString(),
          text: response.messages[0].content,
          isBot: true
        };
        
        setMessages(prevMessages => [...prevMessages, botMessage]);
      } else {
        // Handle no response
        const errorMessage = {
          id: (Date.now() + 1).toString(),
          text: "I'm sorry, I couldn't process your request.",
          isBot: true
        };
        
        setMessages(prevMessages => [...prevMessages, errorMessage]);
      }
    } catch (error) {
      console.error('Error communicating with Lex:', error);
      
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        text: `Error: ${error.message || 'Failed to communicate with the chatbot'}`,
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
      <Text style={styles.messageText}>{item.text}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
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
        <View style={styles.configPanel}>
          <Text style={styles.configTitle}>Bot Configuration</Text>
          
          <Text style={styles.inputLabel}>AWS Access Key ID:</Text>
          <TextInput
            style={styles.configInput}
            value={accessKeyId}
            onChangeText={setAccessKeyId}
            placeholder="Enter AWS Access Key ID"
            secureTextEntry={false}
          />
          
          <Text style={styles.inputLabel}>AWS Secret Access Key:</Text>
          <TextInput
            style={styles.configInput}
            value={secretAccessKey}
            onChangeText={setSecretAccessKey}
            placeholder="Enter AWS Secret Access Key"
            secureTextEntry={true}
          />
          
          <Text style={styles.inputLabel}>Bot ID:</Text>
          <TextInput
            style={styles.configInput}
            value={botId}
            onChangeText={setBotId}
            placeholder="Enter Bot ID"
          />
          
          <Text style={styles.inputLabel}>Bot Alias ID:</Text>
          <TextInput
            style={styles.configInput}
            value={botAliasId}
            onChangeText={setBotAliasId}
            placeholder="Enter Bot Alias ID"
          />
          
          <TouchableOpacity 
            style={styles.saveButton}
            onPress={saveConfiguration}
          >
            <Text style={styles.saveButtonText}>Save Configuration</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.chatContainer}
          keyboardVerticalOffset={100}
        >
          {!isConfigured ? (
            <View style={styles.notConfiguredContainer}>
              <Text style={styles.notConfiguredText}>
                Please configure your AWS credentials and bot details to start chatting.
              </Text>
              <TouchableOpacity 
                style={styles.configureButton}
                onPress={() => setShowConfig(true)}
              >
                <Text style={styles.configureButtonText}>Configure Now</Text>
              </TouchableOpacity>
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
                onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
              />
              
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Type a message..."
                  returnKeyType="send"
                  onSubmitEditing={sendMessage}
                />
                <TouchableOpacity 
                  style={styles.sendButton}
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
            </>
          )}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#4a86e8',
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
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  userBubble: {
    backgroundColor: '#4a86e8',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  botBubble: {
    backgroundColor: '#e5e5e5',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    color: '#000',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  input: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: '#4a86e8',
    borderRadius: 20,
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  configPanel: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  configTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
    marginTop: 8,
  },
  configInput: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  saveButton: {
    backgroundColor: '#4a86e8',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  notConfiguredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  notConfiguredText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  configureButton: {
    backgroundColor: '#4a86e8',
    borderRadius: 8,
    padding: 12,
  },
  configureButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default App;