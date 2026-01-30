# Testing Telegram Bots and Mini Apps from the Terminal

This guide explains how to test the Cybernetic Telegram integration using terminal-based tools. This is useful for debugging commands, responses, and API calls without needing the full Telegram app.

---

## 1. Testing Telegram Bots

### A. Using Telegram CLI (`tg`) for Interactive Testing
The `telegram-cli` is a command-line Telegram client that lets you log in as a user, chat with bots, send commands, and view responses in real-time.

#### Installation (Linux/macOS):
1. **Clone the repository:**
   ```bash
   git clone --recursive https://github.com/vysheng/tg.git && cd tg
   ```
2. **Install dependencies (example for Ubuntu/Debian):**
   ```bash
   sudo apt-get install libreadline-dev libconfig-dev libssl-dev lua5.2 liblua5.2-dev libevent-dev libjansson-dev libpython-dev make
   ```
3. **Build the client:**
   ```bash
   ./configure
   make
   ```
   The binary will be in `./bin/telegram-cli`.

#### Usage:
1. **Start the client:**
   ```bash
   ./bin/telegram-cli -k tg-server.pub
   ```
2. **Log in** with your phone number when prompted.
3. **Interact with the bot:**
   - **Send a message:** `msg @Cyber_netic_bot hello`
   - **View history:** `history @Cyber_netic_bot 10`
4. **Exit:** Type `quit`.

---

### B. Using `curl` for API-Level Testing
Telegram's Bot API is HTTP-based, so you can test endpoints directly.

#### Prerequisites:
- **BOT_TOKEN**: Obtain from @BotFather.
- **Base URL**: `https://api.telegram.org/bot<BOT_TOKEN>/`

#### Examples:
- **Get bot info:**
  ```bash
  curl https://api.telegram.org/bot<BOT_TOKEN>/getMe
  ```
- **Send a message to a user:**
  ```bash
  curl -X POST https://api.telegram.org/bot<BOT_TOKEN>/sendMessage \
    -d chat_id=<CHAT_ID> \
    -d text="Test message from terminal"
  ```
- **Poll for updates:**
  ```bash
  curl https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
  ```
- **Set a webhook:**
  ```bash
  curl -X POST https://api.telegram.org/bot<BOT_TOKEN>/setWebhook \
    -d url="https://your-webhook-url.com"
  ```

---

## 2. Testing Telegram Mini Apps

Telegram Mini Apps are web-based. Terminal testing typically involves tunneling your local development server.

### Using Tunneling Tools

#### Using ngrok:
1. **Install ngrok** from [ngrok.com](https://ngrok.com/).
2. **Start your Mini App server** (e.g., `npm run dev` on port 3000).
3. **Tunnel it:**
   ```bash
   ./ngrok http 3000
   ```
4. **Update @BotFather:** Set your Mini App URL to the generated ngrok URL (e.g., `https://abc123.ngrok.io`).

#### Using Pinggy (No install needed):
1. **Run:**
   ```bash
   ssh -p 443 -R0:localhost:3000 a.pinggy.io
   ```
2. **Get the URL** and update @BotFather.

---

## 3. Debugging & Tips

- **Unit/Integration Testing:** Use libraries like `python-telegram-bot` (Python), `Telegraf` (JS), or `Teloxide` (Rust) for mocking interactions.
- **Stress Testing:** Use `curl` in a loop or `ab` (Apache Benchmark) to test endpoint resilience.
- **Security:** **NEVER** expose your `BOT_TOKEN` in scripts or public repositories. Always use environment variables.
- **Debug Mode:** Enable in Telegram via `Settings > Advanced > Experimental > Enable webview inspecting`.
- **Console Logs:** Integrate [Eruda](https://github.com/liriliri/eruda) into your Mini App code for an in-app console.
