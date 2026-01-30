#!/bin/bash

# Cybernetic Telegram Bot Service Launcher
# Runs the bot as a persistent background service

export TELEGRAM_BOT_TOKEN="7747520054:AAFNts5iJn8mYZezAG9uQF2_slvuztEScZI"
cd /Users/speed/Downloads/cybernetic

# Kill any existing instances
pkill -f "mix run --no-halt" 2>/dev/null

echo "🤖 Starting Cybernetic Telegram Bot Service..."
echo "Bot: @VaoAssitantBot"
echo ""

# Start in background with nohup so it persists
nohup mix run --no-halt > telegram_bot.log 2>&1 &
BOT_PID=$!

echo "✅ Bot started with PID: $BOT_PID"
echo "📝 Logs: tail -f telegram_bot.log"
echo ""
echo "The bot is now running in the background and will:"
echo "• Continue running even if you close the terminal"
echo "• Respond to messages on Telegram automatically"
echo "• Route through the VSM architecture"
echo ""
echo "To stop: kill $BOT_PID"