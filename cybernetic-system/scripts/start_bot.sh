#!/bin/bash

# Cybernetic Telegram Bot Service
# Runs as a persistent background daemon

export TELEGRAM_BOT_TOKEN="7747520054:AAFNts5iJn8mYZezAG9uQF2_slvuztEScZI"

# Kill any existing bot processes
pkill -f "beam.*telegram" 2>/dev/null
pkill -f "mix run" 2>/dev/null
sleep 1

echo "🤖 Starting Cybernetic Telegram Bot..."
echo "=================================="

# Start with nohup so it persists when terminal closes
nohup mix run --no-halt > telegram_bot.log 2>&1 &
BOT_PID=$!

echo "✅ Bot started with PID: $BOT_PID"
echo ""
echo "The bot is now running as a background service!"
echo "• It will continue running even if you close the terminal"
echo "• It will keep polling and responding to messages"
echo ""
echo "📝 Commands:"
echo "  View logs:  tail -f telegram_bot.log"
echo "  Stop bot:   kill $BOT_PID"
echo "  Check bot:  ps aux | grep $BOT_PID"
echo ""
echo "Send messages to @VaoAssitantBot on Telegram!"