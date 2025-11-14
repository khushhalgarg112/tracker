import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const TELEGRAM_BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export const sendTelegram = async (text) => {
  try {
    const url = `${TELEGRAM_BASE}/sendMessage`;
    await axios.post(url, {
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: "Markdown",
      disable_notification: false,
    });
  } catch (err) {
    console.error("Telegram send error:", err.message);
  }
};
