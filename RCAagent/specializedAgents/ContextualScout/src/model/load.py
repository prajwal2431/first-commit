from langchain_aws import ChatBedrock

# https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html
MODEL_ID = "amazon.nova-lite-v1:0"

def load_model() -> ChatBedrock:
    """
    Get Bedrock model client.
    Uses IAM authentication via the execution role.
    """
    model_id = os.getenv("BEDROCK_MODEL_ID", MODEL_ID)
    return ChatBedrock(model_id=model_id)