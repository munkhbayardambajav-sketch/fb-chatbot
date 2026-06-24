const { sendMessage, sendImageMessage, replyToComment } = require('../utils/messenger');
const { askAI } = require('../utils/openai');
const { getAvailableSlots, bookSlot, getSheetSettings } = require('../utils/sheets');
const pages = require('../config/pages');

// Үнийн санал асуусан эсэхийг шалгах keyword-ууд
const PRICE_KEYWORDS = ['үнэ', 'үнийн', 'санал', 'price', 'хэд', 'төгрөг', 'багц', 'package', 'тариф', 'cost', 'хямд', 'яасан'];

function isPriceQuery(text) {
  const lower = text.toLowerCase();
  return PRICE_KEYWORDS.some(k => lower.includes(k));
}

module.exports = async (req, res) => {

  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method === 'POST') {
    const body = req.body;
    if (body.object !== 'page') return res.status(404).send('Not a page event');

    const tasks = [];
    for (const entry of body.entry) {
      const pageId     = entry.id;
      const pageConfig = pages[pageId];
      if (!pageConfig) continue;

      if (entry.messaging) {
        for (const event of entry.messaging) {
          if (event.message && !event.message.is_echo) {
            tasks.push(handleMessage(event, pageConfig));
          }
        }
      }
    }
    await Promise.all(tasks);
    res.status(200).send('EVENT_RECEIVED');
  }
};

async function handleMessage(event, pageConfig) {
  try {
    const senderId = event.sender.id;
    const msg = event.message;
    let userText = msg.text || '';

    let imageUrl = null;
    if (msg.attachments) {
      for (const att of msg.attachments) {
        if (att.type === 'image') { imageUrl = att.payload.url; if (!userText) userText = 'Зураг явуулав.'; }
      }
    }

    let systemPrompt = pageConfig.systemPrompt || '';
    let priceImageUrl = null;

    if (pageConfig.spreadsheetId) {
      const [settings, slots] = await Promise.all([
        getSheetSettings(pageConfig.spreadsheetId),
        getAvailableSlots(pageConfig.spreadsheetId)
      ]);
      if (settings.systemPrompt) systemPrompt = settings.systemPrompt;
      if (settings.priceImageUrl) priceImageUrl = settings.priceImageUrl;
      if (slots) systemPrompt += '\n\nОДООГИЙН СУЛ ОГНООНУУД:\n' + slots;
    }

    systemPrompt += '\n\nЗАХИАЛГА: Огноо баталгаажуулахад [BOOK:YYYY-MM-DD:УТАС:УРЬДЧИЛГАА] нэм.';

    // Үнийн санал асуусан бол шууд зураг явуул (AI-д найдахгүй)
    if (priceImageUrl && isPriceQuery(userText)) {
      await sendImageMessage(pageConfig.token, senderId, priceImageUrl);
    }

    const reply = await askAI(systemPrompt, userText, imageUrl);

    const bookMatch = reply.match(/\[BOOK:([^:]+):([^:]+):([^\]]*)]/ );
    if (bookMatch && pageConfig.spreadsheetId) {
      await bookSlot(pageConfig.spreadsheetId, bookMatch[1], bookMatch[2], bookMatch[3]);
    }
    const cleanReply = reply.replace(/\[SEND_IMAGE\]/g, '').replace(/\[BOOK:[^\]]+\]/g, '').trim();
    if (cleanReply) {
      await sendMessage(pageConfig.token, senderId, cleanReply);
    }
  } catch (err) {
    console.error('handleMessage error:', err.message);
  }
}

async function handleComment(commentData, pageConfig) {
  try {
    const commentId = commentData.comment_id;
    const commentText = commentData.message || '';
    if (!commentId || !commentText) return;
    let systemPrompt = pageConfig.systemPrompt || '';
    if (pageConfig.spreadsheetId) {
      const settings = await getSheetSettings(pageConfig.spreadsheetId);
      if (settings.systemPrompt) systemPrompt = settings.systemPrompt;
    }
    const reply = await askAI(systemPrompt, commentText, null);
    const cleanReply = reply.replace(/\[SEND_IMAGE\]/g, '').replace(/\[BOOK:[^\]]+\]/g, '').trim();
    await replyToComment(pageConfig.token, commentId, cleanReply);
  } catch (err) {
    console.error('handleComment error:', err.message);
  }
}
