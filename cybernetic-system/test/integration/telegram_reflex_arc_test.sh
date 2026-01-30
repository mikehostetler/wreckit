#!/bin/bash
# Integration test script for Telegram Reflex Arc
# Tests the complete message flow: Telegram -> AMQP -> S4 -> Response -> Telegram

set -e

echo "======================================"
echo "Telegram Reflex Arc Integration Test"
echo "======================================"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo "ERROR: TELEGRAM_BOT_TOKEN environment variable not set"
    echo "Please export TELEGRAM_BOT_TOKEN=your_bot_token"
    exit 1
fi

if [ -z "$TELEGRAM_TEST_CHAT_ID" ]; then
    echo "ERROR: TELEGRAM_TEST_CHAT_ID environment variable not set"
    echo "Please export TELEGRAM_TEST_CHAT_ID=your_chat_id"
    echo "You can get this by sending a message to your bot and visiting:"
    echo "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates"
    exit 1
fi

echo "✓ Telegram bot token configured"
echo "✓ Test chat ID configured: $TELEGRAM_TEST_CHAT_ID"
echo ""

# Test 1: Simple greeting
echo "Test 1: Sending 'hi' message..."
RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
    -d "chat_id=$TELEGRAM_TEST_CHAT_ID" \
    -d "text=hi")

if echo "$RESPONSE" | grep -q '"ok":true'; then
    echo "✓ Message sent successfully"
    echo "  Check Telegram app for response within 2 seconds..."
else
    echo "✗ Failed to send message"
    echo "$RESPONSE"
    exit 1
fi
echo ""

# Wait for response
sleep 3

# Test 2: Reasoning request
echo "Test 2: Sending 'think: what is 2+2?'..."
RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
    -d "chat_id=$TELEGRAM_TEST_CHAT_ID" \
    -d "text=think: what is 2+2?")

if echo "$RESPONSE" | grep -q '"ok":true'; then
    echo "✓ Message sent successfully"
    echo "  Check Telegram app for analysis response..."
else
    echo "✗ Failed to send message"
    echo "$RESPONSE"
    exit 1
fi
echo ""

# Wait for response
sleep 3

# Test 3: Analysis request
echo "Test 3: Sending 'analyze: why is the sky blue?'..."
RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
    -d "chat_id=$TELEGRAM_TEST_CHAT_ID" \
    -d "text=analyze: why is the sky blue?")

if echo "$RESPONSE" | grep -q '"ok":true'; then
    echo "✓ Message sent successfully"
    echo "  Check Telegram app for structured analysis response..."
else
    echo "✗ Failed to send message"
    echo "$RESPONSE"
    exit 1
fi
echo ""

echo "======================================"
echo "Integration Test Complete"
echo "======================================"
echo ""
echo "Manual verification steps:"
echo "1. Check application logs for complete message flow"
echo "2. Verify responses received in Telegram"
echo "3. Check RabbitMQ management UI for cyb.s4.llm queue depth"
echo "   (should be 0 or very low - messages should be consumed)"
echo ""
echo "Expected log pattern:"
echo "  [debug] S1 Telegram received from <chat_id>: hi"
echo "  [debug] S4 Consumer received message with routing key: s4.reason"
echo "  [debug] System4 received intelligence: ..."
echo "  [info] System4: Processing intelligence - ..."
echo "  [debug] Sent S4 response to TelegramAgent for correlation_id: tg_..."
