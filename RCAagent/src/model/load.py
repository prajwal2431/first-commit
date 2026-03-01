import os

from langchain_aws import ChatBedrock

# Amazon Nova (no third-party marketplace / use-case form; uses standard Bedrock access).
# Override with BEDROCK_MODEL_ID env var if needed.
MODEL_ID = "amazon.nova-lite-v1:0"


def load_model() -> ChatBedrock:
    """
    Get Bedrock model client (Amazon Nova by default).
    Uses IAM authentication via the execution role.
    """
    model_id = os.getenv("BEDROCK_MODEL_ID", MODEL_ID)
    return ChatBedrock(model_id=model_id)