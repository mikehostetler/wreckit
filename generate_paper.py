#!/usr/bin/env python3
"""Generate NeurIPS paper for Wreckit using Denario + GLM-4.7"""

import os
import sys
import time

# Add TinyTeX to PATH
os.environ["PATH"] = f"{os.environ['HOME']}/Library/TinyTeX/bin/universal-darwin:" + os.environ["PATH"]

# Set API credentials
os.environ["OPENAI_API_KEY"] = "1cd54a1d237e4693b516a56e8513366a.1r4gXJRbfYp0Nw52"
os.environ["OPENAI_BASE_URL"] = "https://open.bigmodel.cn/api/coding/paas/v4"
os.environ["PERPLEXITY_API_KEY"] = "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"

# Monkey-patch for Zhipu rate limits
from langchain_openai import ChatOpenAI
_original_invoke = ChatOpenAI.invoke
_original_stream = ChatOpenAI.stream

def _patched_invoke(self, *args, **kwargs):
    time.sleep(2)
    return _original_invoke(self, *args, **kwargs)

def _patched_stream(self, *args, **kwargs):
    time.sleep(2)
    return _original_stream(self, *args, **kwargs)

ChatOpenAI.invoke = _patched_invoke
ChatOpenAI.stream = _patched_stream
print("Applied 2s rate limit delay")

from denario import Denario
from denario.llm import LLM

print("=== Creating Denario project for Wreckit ===")

# Initialize Denario
d = Denario(
    project_dir=".", 
    clear_project_dir=False
)

# Create LLM instance
glm = LLM(name="glm-4.7", max_output_tokens=16384, temperature=0.7)

print("\n=== Loading real benchmark results from results.md ===")
with open("input_files/results.md", "r") as f:
    real_results = f.read()
d.set_results(real_results)

# WE SKIP get_idea, get_method, and get_results
# Because we have them curated in input_files and results.md

print("\n=== Generating NeurIPS Paper with Citations ===")
print("(This will take several minutes...)")
d.get_paper(llm=glm, journal="NeurIPS", add_citations=True)

print("\n=== Paper generation complete! ===")
print("Check ./paper/ for the generated PDF")
