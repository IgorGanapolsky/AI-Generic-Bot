from dotenv import load_dotenv
import os
import json
import boto3
from io import BytesIO
from botocore.exceptions import ClientError
import time
import datetime
import uuid

# Load environment variables from .env file
load_dotenv()

# AWS Configuration
AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
REGION = 'us-east-1'

# Initialize AWS Clients
lex_client = boto3.client('lexv2-models', region_name=REGION,
                         aws_access_key_id=AWS_ACCESS_KEY_ID,
                         aws_secret_access_key=AWS_SECRET_ACCESS_KEY)
lambda_client = boto3.client('lambda', region_name=REGION,
                            aws_access_key_id=AWS_ACCESS_KEY_ID,
                            aws_secret_access_key=AWS_SECRET_ACCESS_KEY)
runtime_lex_client = boto3.client('lexv2-runtime', region_name=REGION,
                                 aws_access_key_id=AWS_ACCESS_KEY_ID,
                                 aws_secret_access_key=AWS_SECRET_ACCESS_KEY)
iam_client = boto3.client('iam', region_name=REGION,
                         aws_access_key_id=AWS_ACCESS_KEY_ID,
                         aws_secret_access_key=AWS_SECRET_ACCESS_KEY)

def create_lambda_role():
    role_name = 'LambdaLexExecutionRole'
    try:
        role = iam_client.create_role(
            RoleName=role_name,
            AssumeRolePolicyDocument=json.dumps({
                'Version': '2012-10-17',
                'Statement': [{
                    'Effect': 'Allow',
                    'Principal': {'Service': 'lambda.amazonaws.com'},
                    'Action': 'sts:AssumeRole'
                }]
            }),
            Description='Role for Lambda to execute and interact with Lex'
        )
        iam_client.attach_role_policy(
            RoleName=role_name,
            PolicyArn='arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
        )
        return role['Role']['Arn']
    except ClientError as e:
        if e.response['Error']['Code'] == 'EntityAlreadyExists':
            return iam_client.get_role(RoleName=role_name)['Role']['Arn']
        raise

def create_lambda_function(role_arn):
    lambda_function_name = 'ChatbotLogic'
    # Create a temporary file to store the Lambda code
    with BytesIO() as zip_buffer:
        from zipfile import ZipFile, ZIP_DEFLATED
        with ZipFile(zip_buffer, 'w', ZIP_DEFLATED) as zip_file:
            # Add lambda_function.py to the ZIP with the handler code
            zip_file.writestr('lambda_function.py', '''
import boto3
import json
import uuid
from datetime import datetime

def lambda_handler(event, context):
    print("Received event:", event)
    
    # Get intent name
    intent_name = event.get('sessionState', {}).get('intent', {}).get('name', '')
    
    # Handle different intents
    if intent_name == 'LogExpense':
        return handle_log_expense(event)
    elif intent_name == 'ShowReport':
        return handle_show_report(event)
    elif intent_name == 'SetTaxReminder':
        return handle_tax_reminder(event)
    elif intent_name == 'EchoIntent':
        return handle_echo(event)
    else:
        # Default response for unknown intents
        return {
            'sessionState': {
                'dialogAction': {'type': 'Close'},
                'intent': {'name': intent_name, 'state': 'Fulfilled'}
            },
            'messages': [
                {
                    'contentType': 'PlainText',
                    'content': "I'm your bookkeeping assistant. I can help with logging expenses, showing reports, and setting tax reminders."
                }
            ]
        }

def handle_echo(event):
    # Get user input
    message = event.get('inputTranscript', '')
    if not message:
        message = event.get('sessionState', {}).get('sessionAttributes', {}).get('message', '')
    if not message:
        message = event.get('transcriptions', [{}])[0].get('transcription', 'No input detected')
    
    return {
        'sessionState': {
            'dialogAction': {'type': 'Close'},
            'intent': {'name': 'EchoIntent', 'state': 'Fulfilled'}
        },
        'messages': [
            {
                'contentType': 'PlainText',
                'content': f'You said: {message}'
            }
        ]
    }

def handle_log_expense(event):
    # Extract slot values
    slots = event.get('sessionState', {}).get('intent', {}).get('slots', {})
    amount = slots.get('Amount', {}).get('value', {}).get('interpretedValue', '0')
    category = slots.get('Category', {}).get('value', {}).get('interpretedValue', 'miscellaneous')
    
    # Save to DynamoDB
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table('BookkeepingExpenses')
    
    # Generate a unique ID for this expense
    expense_id = str(uuid.uuid4())
    
    # Use a fixed user ID for simplicity (in a real app, this would be the authenticated user)
    user_id = 'user123'
    
    # Save the expense
    table.put_item(
        Item={
            'userId': user_id,
            'expenseId': expense_id,
            'amount': float(amount),
            'category': category,
            'timestamp': datetime.now().isoformat()
        }
    )
    
    return {
        'sessionState': {
            'dialogAction': {'type': 'Close'},
            'intent': {'name': 'LogExpense', 'state': 'Fulfilled'}
        },
        'messages': [
            {
                'contentType': 'PlainText',
                'content': f'Logged ${amount} expense for {category}.'
            }
        ]
    }

def handle_show_report(event):
    # Use a fixed user ID for simplicity
    user_id = 'user123'
    
    # Query DynamoDB for expenses
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table('BookkeepingExpenses')
    
    response = table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key('userId').eq(user_id)
    )
    
    expenses = response.get('Items', [])
    
    if not expenses:
        return {
            'sessionState': {
                'dialogAction': {'type': 'Close'},
                'intent': {'name': 'ShowReport', 'state': 'Fulfilled'}
            },
            'messages': [
                {
                    'contentType': 'PlainText',
                    'content': 'You have no expenses recorded yet.'
                }
            ]
        }
    
    # Calculate totals by category
    categories = {}
    total = 0
    
    for expense in expenses:
        amount = float(expense.get('amount', 0))
        category = expense.get('category', 'miscellaneous')
        
        if category not in categories:
            categories[category] = 0
        
        categories[category] += amount
        total += amount
    
    # Format the report
    report = "Expense Summary:\\n"
    for category, amount in categories.items():
        report += f"- {category}: ${amount:.2f}\\n"
    
    report += f"\\nTotal Expenses: ${total:.2f}"
    
    return {
        'sessionState': {
            'dialogAction': {'type': 'Close'},
            'intent': {'name': 'ShowReport', 'state': 'Fulfilled'}
        },
        'messages': [
            {
                'contentType': 'PlainText',
                'content': report
            }
        ]
    }

def handle_tax_reminder(event):
    # Extract slot values
    slots = event.get('sessionState', {}).get('intent', {}).get('slots', {})
    date = slots.get('Date', {}).get('value', {}).get('interpretedValue', '')
    
    if not date:
        return {
            'sessionState': {
                'dialogAction': {'type': 'Close'},
                'intent': {'name': 'SetTaxReminder', 'state': 'Fulfilled'}
            },
            'messages': [
                {
                    'contentType': 'PlainText',
                    'content': 'Please provide a valid date for your tax reminder.'
                }
            ]
        }
    
    # Save to DynamoDB
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table('BookkeepingReminders')
    
    # Generate a unique ID for this reminder
    reminder_id = str(uuid.uuid4())
    
    # Use a fixed user ID for simplicity
    user_id = 'user123'
    
    # Save the reminder
    table.put_item(
        Item={
            'userId': user_id,
            'reminderId': reminder_id,
            'date': date,
            'reminderType': 'tax',
            'timestamp': datetime.now().isoformat()
        }
    )
    
    return {
        'sessionState': {
            'dialogAction': {'type': 'Close'},
            'intent': {'name': 'SetTaxReminder', 'state': 'Fulfilled'}
        },
        'messages': [
            {
                'contentType': 'PlainText',
                'content': f'I will remind you about taxes on {date}.'
            }
        ]
    }
''')
        zip_buffer.seek(0)
        try:
            response = lambda_client.create_function(
                FunctionName=lambda_function_name,
                Runtime='python3.9',
                Role=role_arn,
                Handler='lambda_function.lambda_handler',
                Code={'ZipFile': zip_buffer.read()},
                Timeout=15
            )
            return response['FunctionArn']
        except ClientError as e:
            if e.response['Error']['Code'] == 'ResourceConflictException':
                return lambda_client.get_function(FunctionName=lambda_function_name)['Configuration']['FunctionArn']
            raise

def create_lex_bot(lambda_arn):
    bot_name = f'MyCursorChatbot_{datetime.datetime.now().strftime("%Y%m%d%H%M%S")}'
    try:
        print("Creating Lex bot...")
        bot_response = lex_client.create_bot(
            botName=bot_name,
            description='A simple chatbot built with Cursor IDE',
            idleSessionTTLInSeconds=300,
            roleArn=create_lambda_role(),
            dataPrivacy={'childDirected': False}
        )
        bot_id = bot_response['botId']
        print(f"Bot created with ID: {bot_id}. Waiting for it to become active...")

        # Wait for bot to be active
        wait_for_bot_status(bot_id)

        print("Creating bot locale...")
        lex_client.create_bot_locale(
            botId=bot_id,
            botVersion='DRAFT',
            localeId='en_US',
            nluIntentConfidenceThreshold=0.40
        )

        # Wait for locale to be created
        wait_for_locale_status(bot_id)

        # Create EchoIntent
        print("Creating EchoIntent...")
        lex_client.create_intent(
            botId=bot_id,
            botVersion='DRAFT',
            localeId='en_US',
            intentName='EchoIntent',
            description='Echo back what the user says',
            sampleUtterances=[
                {'utterance': 'Hello'},
                {'utterance': 'Hi'},
                {'utterance': 'Hey'},
                {'utterance': 'Echo'},
                {'utterance': "What's up"},
                {'utterance': 'How are you'},
                {'utterance': 'Good morning'},
                {'utterance': 'Tell me something'},
                {'utterance': 'Can you help me'}
            ],
            fulfillmentCodeHook={'enabled': True}
        )
        
        # Create LogExpense Intent
        print("Creating LogExpense Intent...")
        log_expense_response = lex_client.create_intent(
            botId=bot_id,
            botVersion='DRAFT',
            localeId='en_US',
            intentName='LogExpense',
            description='Log a business expense',
            sampleUtterances=[
                {'utterance': 'Log an expense of {Amount} for {Category}'},
                {'utterance': 'I spent {Amount} on {Category}'},
                {'utterance': 'Add {Amount} expense for {Category}'},
                {'utterance': 'Record a {Amount} payment for {Category}'},
                {'utterance': 'Track {Amount} spent on {Category}'}
            ],
            fulfillmentCodeHook={'enabled': True}
        )
        log_expense_intent_id = log_expense_response['intentId']

        # Wait for intent to be available before adding slots
        print(f"Waiting for LogExpense intent to be ready...")
        time.sleep(5)

        # After creating LogExpense intent and waiting for it to be ready
        print("Creating Amount slot for LogExpense intent...")
        amount_slot_response = lex_client.create_slot(
            botId=bot_id,
            botVersion='DRAFT',
            localeId='en_US',
            intentId=log_expense_intent_id,
            slotName='Amount',
            slotTypeId='AMAZON.Number',
            valueElicitationSetting={
                'slotConstraint': 'Required',
                'promptSpecification': {
                    'messageGroups': [
                        {
                            'message': {
                                'plainTextMessage': {
                                    'value': 'How much was the expense?'
                                }
                            }
                        }
                    ],
                    'maxRetries': 3
                }
            }
        )

        print("Creating Category slot for LogExpense intent...")
        category_slot_response = lex_client.create_slot(
            botId=bot_id,
            botVersion='DRAFT',
            localeId='en_US',
            intentId=log_expense_intent_id,
            slotName='Category',
            slotTypeId='AMAZON.AlphaNumeric',
            valueElicitationSetting={
                'slotConstraint': 'Required',
                'promptSpecification': {
                    'messageGroups': [
                        {
                            'message': {
                                'plainTextMessage': {
                                    'value': 'What category does this expense belong to (e.g., supplies, marketing)?'
                                }
                            }
                        }
                    ],
                    'maxRetries': 3
                }
            }
        )

        # After creating both slots, now we can set their priorities
        amount_slot_id = amount_slot_response['slotId']
        category_slot_id = category_slot_response['slotId']

        lex_client.update_intent(
            botId=bot_id,
            botVersion='DRAFT',
            localeId='en_US',
            intentId=log_expense_intent_id,
            intentName='LogExpense',
            slotPriorities=[
                {
                    'slotId': amount_slot_id,
                    'priority': 1
                },
                {
                    'slotId': category_slot_id,
                    'priority': 2
                }
            ]
        )
        
        # Create ShowReport Intent
        print("Creating ShowReport Intent...")
        lex_client.create_intent(
            botId=bot_id,
            botVersion='DRAFT',
            localeId='en_US',
            intentName='ShowReport',
            description='Show expense report',
            sampleUtterances=[
                {'utterance': 'Show me my expenses'},
                {'utterance': 'What\'s my spending report'},
                {'utterance': 'Give me a financial summary'},
                {'utterance': 'How much have I spent'},
                {'utterance': 'Show expense report'},
                {'utterance': 'What are my total expenses'},
                {'utterance': 'Generate spending report'}
            ],
            fulfillmentCodeHook={'enabled': True}
        )
        
        # Create SetTaxReminder Intent with Date slot
        print("Creating SetTaxReminder Intent...")
        tax_reminder_response = lex_client.create_intent(
            botId=bot_id,
            botVersion='DRAFT',
            localeId='en_US',
            intentName='SetTaxReminder',
            description='Set a tax deadline reminder',
            sampleUtterances=[
                {'utterance': 'Remind me about taxes on {Date}'},
                {'utterance': 'Set a tax reminder for {Date}'},
                {'utterance': 'Alert me for tax deadline on {Date}'},
                {'utterance': 'Create tax reminder for {Date}'},
                {'utterance': 'I need a tax reminder on {Date}'}
            ],
            fulfillmentCodeHook={'enabled': True}
        )
        tax_reminder_intent_id = tax_reminder_response['intentId']

        # Wait for intent to be available
        print(f"Waiting for SetTaxReminder intent to be ready...")
        time.sleep(5)

        # Create Date slot for SetTaxReminder
        print("Adding Date slot to SetTaxReminder intent...")
        date_slot_response = lex_client.create_slot(
            botId=bot_id,
            botVersion='DRAFT',
            localeId='en_US',
            intentId=tax_reminder_intent_id,
            slotName='Date',
            slotTypeId='AMAZON.Date',
            valueElicitationSetting={
                'slotConstraint': 'Required',
                'promptSpecification': {
                    'messageGroups': [
                        {
                            'message': {
                                'plainTextMessage': {
                                    'value': 'When would you like to be reminded about taxes?'
                                }
                            }
                        }
                    ],
                    'maxRetries': 3
                }
            }
        )
        date_slot_id = date_slot_response['slotId']

        # Set priority for Date slot
        lex_client.update_intent(
            botId=bot_id,
            botVersion='DRAFT',
            localeId='en_US',
            intentId=tax_reminder_intent_id,
            intentName='SetTaxReminder',
            slotPriorities=[
                {
                    'slotId': date_slot_id,
                    'priority': 1
                }
            ]
        )

        # Build the bot
        print("Building the bot...")
        lex_client.build_bot_locale(
            botId=bot_id,
            botVersion='DRAFT',
            localeId='en_US'
        )

        # Wait for locale to be built
        wait_for_locale_built(bot_id)

        # After the locale is built, add this code:
        print("Creating a bot version...")
        version_response = lex_client.create_bot_version(
            botId=bot_id,
            botVersionLocaleSpecification={
                'en_US': {
                    'sourceBotVersion': 'DRAFT'
                }
            }
        )
        bot_version = version_response['botVersion']
        print(f"Created bot version: {bot_version}")
        
        # Add this waiting code
        wait_for_bot_version(bot_id, bot_version)

        # Now create the bot alias
        print("Creating a bot alias...")
        alias_response = lex_client.create_bot_alias(
            botId=bot_id,
            botAliasName='TestAlias',
            botVersion=bot_version,
            botAliasLocaleSettings={
                'en_US': {
                    'enabled': True,
                    'codeHookSpecification': {
                        'lambdaCodeHook': {
                            'lambdaARN': lambda_arn,
                            'codeHookInterfaceVersion': '1.0'
                        }
                    }
                }
            },
            sentimentAnalysisSettings={
                'detectSentiment': False
            }
        )
        bot_alias_id = alias_response['botAliasId']
        print(f"Created bot alias with ID: {bot_alias_id}")
        
        # Return both bot ID and alias ID
        return bot_id, bot_alias_id
    except ClientError as e:
        print(f"Error creating Lex bot: {e}")
        raise

def chat_with_bot(bot_id, bot_alias_id, user_input):
    response = runtime_lex_client.recognize_text(
        botId=bot_id,
        botAliasId=bot_alias_id,  # Use the created alias ID instead of 'DRAFT'
        localeId='en_US',
        sessionId='user123',
        text=user_input
    )
    return response['messages'][0]['content'] if 'messages' in response else "No response"

def test_bot(bot_id, bot_alias_id):
    print("Testing bot locally. Type 'exit' to quit.")
    while True:
        user_input = input("You: ")
        if user_input.lower() in ['exit', 'quit']:
            break
        if not user_input.strip():  # Check if input is empty or whitespace
            print("Please enter some text.")
            continue
        try:
            response = chat_with_bot(bot_id, bot_alias_id, user_input)
            print(f"Bot: {response}")
        except Exception as e:
            print(f"Error in conversation: {e}")

def main():
    print("Setting up AWS Chatbot...")
    role_arn = create_lambda_role()
    print(f"Created IAM Role: {role_arn}")

    # Create DynamoDB tables first
    create_dynamodb_tables()
    print("DynamoDB tables created")

    lambda_arn = create_lambda_function(role_arn)
    print(f"Created Lambda Function: {lambda_arn}")

    bot_id, bot_alias_id = create_lex_bot(lambda_arn)
    print(f"Created Lex Bot with ID: {bot_id} and Alias ID: {bot_alias_id}")
    
    # Add the specific permission
    update_lambda_permissions(lambda_arn, bot_id, bot_alias_id)

    # Save the bot info to a file for the React Native app
    with open('bot_info.json', 'w') as f:
        json.dump({
            'botId': bot_id, 
            'botAliasId': bot_alias_id
        }, f)
    print(f"Bot info saved to bot_info.json - use these values in your React Native app")

    # Start local testing
    test_bot(bot_id, bot_alias_id)

def wait_for_bot_status(bot_id, target_status='Available'):
    print(f"Waiting for bot to be {target_status.lower()}...")
    while True:
        bot_status = lex_client.describe_bot(botId=bot_id)['botStatus']
        print(f"Current bot status: {bot_status}")
        if bot_status == target_status:
            break
        time.sleep(10)

def wait_for_locale_status(bot_id, target_status=None):
    print(f"Waiting for locale to be {target_status.lower() if target_status else 'created'}...")
    while True:
        locale_status = lex_client.describe_bot_locale(
            botId=bot_id,
            botVersion='DRAFT',
            localeId='en_US'
        )['botLocaleStatus']
        print(f"Current locale status: {locale_status}")
        if target_status and locale_status == target_status:
            break
        elif not target_status and locale_status in ['Built', 'NotBuilt']:
            break
        time.sleep(10)

def wait_for_locale_built(bot_id):
    print("Waiting for locale to be built...")
    start_time = time.time()
    timeout = 1200  # 20 minutes timeout
    while True:
        if time.time() - start_time > timeout:
            raise Exception("Timeout waiting for locale to be built")

        locale_info = lex_client.describe_bot_locale(
            botId=bot_id,
            botVersion='DRAFT',
            localeId='en_US'
        )
        locale_status = locale_info['botLocaleStatus']
        print(f"Current locale status: {locale_status}")
        
        if locale_status == 'Built':
            break
        elif locale_status == 'Failed':
            failure_reasons = locale_info.get('failureReasons', ['Unknown error'])
            error_details = "\n".join(failure_reasons)
            raise Exception(f"Locale creation failed: {error_details}")
        
        time.sleep(30)

def wait_for_bot_version(bot_id, bot_version):
    print("Waiting for bot version to be ready...")
    version_ready = False
    retry_count = 0
    while not version_ready and retry_count < 10:
        try:
            version_info = lex_client.describe_bot_version(
                botId=bot_id,
                botVersion=bot_version
            )
            version_ready = True
            print(f"Bot version {bot_version} is now available")
        except ClientError:
            print(f"Bot version not ready yet, waiting... (attempt {retry_count+1})")
            retry_count += 1
            time.sleep(5)

# Add this helper function to get your AWS account ID
def get_account_id():
    sts_client = boto3.client('sts', 
                             region_name=REGION,
                             aws_access_key_id=AWS_ACCESS_KEY_ID,
                             aws_secret_access_key=AWS_SECRET_ACCESS_KEY)
    return sts_client.get_caller_identity()['Account']

def update_lambda_permissions(lambda_arn, bot_id, bot_alias_id):
    print("Updating Lambda permissions...")
    lambda_function_name = lambda_arn.split(':')[-1]
    try:
        # Remove any existing permissions first
        try:
            lambda_client.remove_permission(
                FunctionName=lambda_function_name,
                StatementId='AllowLexToInvoke'
            )
            print("Removed existing permissions")
        except ClientError:
            pass  # No existing permission to remove
            
        # Add the specific permission for this bot alias
        lambda_client.add_permission(
            FunctionName=lambda_function_name,
            StatementId='AllowLexToInvoke',
            Action='lambda:InvokeFunction',
            Principal='lexv2.amazonaws.com',
            SourceArn=f'arn:aws:lex:us-east-1:{get_account_id()}:bot-alias/{bot_id}/{bot_alias_id}'
        )
        print("Added specific permission for this bot alias")
    except ClientError as e:
        print(f"Error updating Lambda permissions: {e}")
        raise

def create_dynamodb_tables():
    dynamodb = boto3.resource('dynamodb', region_name=REGION,
                             aws_access_key_id=AWS_ACCESS_KEY_ID,
                             aws_secret_access_key=AWS_SECRET_ACCESS_KEY)
    
    # Expenses table
    try:
        expenses_table = dynamodb.create_table(
            TableName='BookkeepingExpenses',
            KeySchema=[
                {'AttributeName': 'userId', 'KeyType': 'HASH'},
                {'AttributeName': 'expenseId', 'KeyType': 'RANGE'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'userId', 'AttributeType': 'S'},
                {'AttributeName': 'expenseId', 'AttributeType': 'S'}
            ],
            ProvisionedThroughput={'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
        )
        print("Creating BookkeepingExpenses table...")
        expenses_table.meta.client.get_waiter('table_exists').wait(TableName='BookkeepingExpenses')
        print("BookkeepingExpenses table created")
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceInUseException':
            print("BookkeepingExpenses table already exists")
        else:
            raise
    
    # Reminders table
    try:
        reminders_table = dynamodb.create_table(
            TableName='BookkeepingReminders',
            KeySchema=[
                {'AttributeName': 'userId', 'KeyType': 'HASH'},
                {'AttributeName': 'reminderId', 'KeyType': 'RANGE'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'userId', 'AttributeType': 'S'},
                {'AttributeName': 'reminderId', 'AttributeType': 'S'}
            ],
            ProvisionedThroughput={'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
        )
        print("Creating BookkeepingReminders table...")
        reminders_table.meta.client.get_waiter('table_exists').wait(TableName='BookkeepingReminders')
        print("BookkeepingReminders table created")
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceInUseException':
            print("BookkeepingReminders table already exists")
        else:
            raise

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Error: {e}")
