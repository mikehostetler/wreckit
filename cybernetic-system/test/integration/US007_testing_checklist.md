# US-007: End-to-End Testing Checklist

## Automated Verification

### Unit Tests
```bash
mix test test/cybernetic/vsm/system4/amqp_consumer_test.exs
```
**Result:** ✓ 13 tests, 0 failures

### Compilation
```bash
mix compile
```
**Result:** ✓ Compiles successfully

## Manual Testing Procedure

### Prerequisites
1. Application running: `mix phx.server`
2. RabbitMQ running and accessible
3. Telegram bot token configured: `export TELEGRAM_BOT_TOKEN=your_token`
4. Test chat ID configured: `export TELEGRAM_TEST_CHAT_ID=your_chat_id`

### Test 1: Simple Greeting
**Command:**
```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d "chat_id=$TELEGRAM_TEST_CHAT_ID" \
  -d "text=hi"
```

**Expected Results:**
- [ ] Response received in Telegram within 2 seconds
- [ ] Response is intelligent and relevant
- [ ] Logs show complete message flow:
  - `S1 Telegram received from <chat_id>: hi`
  - `S4 Consumer received message with routing key: s4.reason`
  - `System4 received intelligence`
  - `Sent S4 response to TelegramAgent`

### Test 2: Complex Reasoning Request
**Command:**
```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d "chat_id=$TELEGRAM_TEST_CHAT_ID" \
  -d "text=think: what is 2+2?"
```

**Expected Results:**
- [ ] Response received within 2 seconds
- [ ] Response shows analytical thinking
- [ ] Logs show intelligence processing

### Test 3: Analysis Request
**Command:**
```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d "chat_id=$TELEGRAM_TEST_CHAT_ID" \
  -d "text=analyze: why is the sky blue?"
```

**Expected Results:**
- [ ] Response received within 2 seconds
- [ ] Structured analysis with health score (if applicable)
- [ ] Logs show analysis processing

### Test 4: Queue Monitoring
**Steps:**
1. Open RabbitMQ management UI (usually http://localhost:15672)
2. Navigate to Queues → cyb.s4.llm
3. Check queue depth

**Expected Results:**
- [ ] Queue depth is 0 or very low
- [ ] Messages are being consumed (not accumulating)
- [ ] Consumer is visible in Consumers tab

### Test 5: Error Handling
**Steps:**
1. Stop S4 Service: `kill -9 <pid>`
2. Send message to Telegram
3. Check response

**Expected Results:**
- [ ] Error response received (not hanging)
- [ ] Error logged appropriately
- [ ] No message stuck in queue

## Observable Metrics

### Performance
- [ ] Response time <2000ms for all tests
- [ ] No message loss (100% success rate)
- [ ] No orphaned correlation_ids

### Logs
- [ ] No error logs in console
- [ ] Complete message flow visible in logs
- [ ] Telemetry events emitted

### RabbitMQ
- [ ] Consumer connected to `cyb.s4.llm` queue
- [ ] No message buildup
- [ ] Message ACK rate = 100%

## Success Criteria

All of the following must pass:
- [ ] Test 1: Simple greeting receives response
- [ ] Test 2: Complex reasoning receives analysis
- [ ] Test 3: Analysis request receives structured response
- [ ] All responses received within 2 seconds
- [ ] No error logs in console
- [ ] No message buildup in RabbitMQ queue
- [ ] Complete message flow visible in logs

## Test Script

Run the automated integration test script:
```bash
export TELEGRAM_BOT_TOKEN=your_token
export TELEGRAM_TEST_CHAT_ID=your_chat_id
./test/integration/telegram_reflex_arc_test.sh
```

## Notes

- This test requires manual verification of responses in Telegram
- The test script sends messages but cannot verify responses automatically
- Check application logs for complete message flow
- Monitor RabbitMQ management UI for queue status
