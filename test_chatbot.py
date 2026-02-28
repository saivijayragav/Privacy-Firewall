import asyncio
from app.services.chatbot import ChatbotService
from app.settings import get_settings

async def test():
    settings = get_settings()
    chatbot = ChatbotService(settings)
    
    response = await chatbot.chat("Hello there! Is my document safe?")
    print(f"Chatbot reply: {response.reply}")

asyncio.run(test())
