from dotenv import load_dotenv
import os
import json
import boto3
from io import BytesIO
from botocore.exceptions import ClientError
import time
import datetime

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
def lambda_handler(event, context):
    print("Received event:", event)
    
    # Get intent name (default to EchoIntent if not found)
    intent_name = event.get('sessionState', {}).get('intent', {}).get('name', 'EchoIntent')
    
    # Try multiple ways to get user's input
    message = event.get('inputTranscript', '')
    if not message:
        message = event.get('sessionState', {}).get('sessionAttributes', {}).get('message', '')
    if not message:
        # Just get the last message from user input
        message = event.get('transcriptions', [{}])[0].get('transcription', 'No input detected')
    
    return {
        'sessionState': {
            'dialogAction': {
                'type': 'Close'
            },
            'intent': {
                'name': intent_name,
                'state': 'Fulfilled'
            }
        },
        'messages': [
            {
                'contentType': 'PlainText',
                'content': f'You said: {message}'
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
            # After creating the Lambda function, add this permission
            try:
                print("Adding Lex permission to Lambda function...")
                lambda_client.add_permission(
                    FunctionName=lambda_function_name,
                    StatementId='AllowLexToInvoke',
                    Action='lambda:InvokeFunction',
                    Principal='lexv2.amazonaws.com',
                    SourceArn=f'arn:aws:lex:us-east-1:{get_account_id()}:*'
                )
            except ClientError as e:
                if e.response['Error']['Code'] == 'ResourceConflictException':
                    print("Permission already exists")
                else:
                    raise
            
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

        # Create an intent
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
            fulfillmentCodeHook={
                'enabled': True,
                'postFulfillmentStatusSpecification': {
                    'successResponse': {
                        'messageGroups': [
                            {
                                'message': {
                                    'plainTextMessage': {
                                        'value': 'Success'
                                    }
                                }
                            }
                        ]
                    }
                }
            }
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

    lambda_arn = create_lambda_function(role_arn)
    print(f"Created Lambda Function: {lambda_arn}")

    bot_id, bot_alias_id = create_lex_bot(lambda_arn)
    print(f"Created Lex Bot with ID: {bot_id} and Alias ID: {bot_alias_id}")
    
    # Add the specific permission
    update_lambda_permissions(lambda_arn, bot_id, bot_alias_id)

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

        locale_status = lex_client.describe_bot_locale(
            botId=bot_id,
            botVersion='DRAFT',
            localeId='en_US'
        )['botLocaleStatus']
        print(f"Current locale status: {locale_status}")
        if locale_status == 'Built':
            break
        elif locale_status == 'Failed':
            raise Exception("Locale creation failed")
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

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Error: {e}")
