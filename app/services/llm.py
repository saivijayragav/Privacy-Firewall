from langchain_openai import ChatOpenAI
from app.settings import AppSettings

def get_langchain_llm(settings: AppSettings) -> ChatOpenAI:
    """
    Creates a centralized LangChain Chat model instance connected to the AIPipe.
    """
    return ChatOpenAI(
        openai_api_base=f"{settings.aipipe_base_url}/openrouter/v1",
        openai_api_key=settings.aipipe_token,
        model_name=settings.aipipe_model,
        temperature=0.4,
        max_tokens=1024,
    )
