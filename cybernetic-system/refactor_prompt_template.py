import requests
import json

with open("lib/cybernetic/vsm/system4/llm/pipeline/steps/prompt_template.ex", "r") as f:
    code = f.read()

prompt = f"""You are a Senior Elixir Architect. Refactor the following code to use a simple ETS-based cache for templates and provide a hardcoded fallback prompt. 
Templates should be stored in an ETS table named :cybernetic_prompts.
The code should check the ETS table first, and if not found, read from disk and then store in ETS.
Provide a hardcoded fallback for "system_analysis.md" and "user_analysis.md" inside the module as attributes.

Output ONLY the refactored code, no explanation, no markdown JSON wrapper, just the raw Elixir code.

CODE:
{code}"""

headers = {
    "Content-Type": "application/json",
    "x-api-key": "1cd54a1d237e4693b516a56e8513366a.1r4gXJRbfYp0Nw52",
    "anthropic-version": "2023-06-01"
}

payload = {
    "model": "glm-4.7",
    "max_tokens": 4096,
    "messages": [{"role": "user", "content": prompt}]
}

response = requests.post("https://api.z.ai/api/anthropic/v1/messages", json=payload, headers=headers)
print(response.json()['content'][0]['text'])
