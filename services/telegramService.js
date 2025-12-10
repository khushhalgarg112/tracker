import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const TELEGRAM_BASE = process.env.TELEGRAM_BOT_TOKEN
  ? `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`
  : null;
const QUICK_COMMERCE_BASE = process.env.QUICK_COMMERCE_BOT
  ? `https://api.telegram.org/bot${process.env.QUICK_COMMERCE_BOT}`
  : null;

export const sendTelegram = async (text, chatId = null) => {
  if (!TELEGRAM_BASE) {
    console.warn("TELEGRAM_BOT_TOKEN missing - skipping default Telegram send");
    return;
  }
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

export const sendAmazonTelegram = async (text) => {
  try {
    // Use Amazon-specific bot token if available, otherwise fallback to default
    const amazonBotToken = process.env.AMAZON_TELEGRAM_BOT;
    const amazonChatId = process.env.AMAZON_TELEGRAM_ID;

    // If Amazon chat ID is set, use Amazon bot (or default bot)
    if (amazonChatId) {
      const amazonTelegramBase = `https://api.telegram.org/bot${amazonBotToken}`;
      const url = `${amazonTelegramBase}/sendMessage`;
      await axios.post(url, {
        chat_id: amazonChatId,
        text,
        parse_mode: "Markdown",
        disable_notification: false,
      });
    } else {
      // Fallback to default chat if AMAZON_TELEGRAM_ID not set
      await sendTelegram(text);
    }
  } catch (err) {
    console.error("Amazon Telegram send error:", err.message);
    // Fallback to default telegram if Amazon bot fails
    try {
      await sendTelegram(text);
    } catch (fallbackErr) {
      console.error("Fallback Telegram send error:", fallbackErr.message);
    }
  }
};

export const sendQuickCommerceTelegram = async (text, chatId = null) => {
  if (!QUICK_COMMERCE_BASE) {
    console.warn(
      "QUICK_COMMERCE_BOT missing - falling back to default Telegram sender"
    );
    await sendTelegram(text, chatId);
    return;
  }

  try {
    const url = `${QUICK_COMMERCE_BASE}/sendMessage`;
    const targetChatId = chatId || process.env.QUICK_COMMERCE_ID;
    await axios.post(url, {
      chat_id: targetChatId,
      text,
      parse_mode: "Markdown",
      disable_notification: false,
    });
  } catch (err) {
    console.error("Quick Commerce Telegram send error:", err.message);
    await sendTelegram(text, chatId);
  }
};
