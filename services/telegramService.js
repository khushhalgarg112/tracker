import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const TELEGRAM_BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export const sendTelegram = async (text, chatId = null) => {
  try {
    const url = `${TELEGRAM_BASE}/sendMessage`;
    const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID;
    await axios.post(url, {
      chat_id: targetChatId,
      text,
      parse_mode: "Markdown",
      disable_notification: false,
    });
  } catch (err) {
    console.error("Telegram send error:", err.message);
  }
};

export const sendOppoTelegram = async (text) => {
  try {
    // Use OPPO-specific bot token if available, otherwise fallback to default
    const oppoBotToken = process.env.OPPO_TELEGRAM_BOT;
    const oppoChatId = process.env.OPPO_TELEGRAM_ID;

    // If OPPO chat ID is set, use OPPO bot (or default bot)
    if (oppoChatId) {
      const oppoTelegramBase = `https://api.telegram.org/bot${oppoBotToken}`;
      const url = `${oppoTelegramBase}/sendMessage`;
      await axios.post(url, {
        chat_id: oppoChatId,
        text,
        parse_mode: "Markdown",
        disable_notification: false,
      });
    } else {
      // Fallback to default chat if OPPO_TELEGRAM_ID not set
      await sendTelegram(text);
    }
  } catch (err) {
    console.error("OPPO Telegram send error:", err.message);
    // Fallback to default telegram if OPPO bot fails
    try {
      await sendTelegram(text);
    } catch (fallbackErr) {
      console.error("Fallback Telegram send error:", fallbackErr.message);
    }
  }
};
