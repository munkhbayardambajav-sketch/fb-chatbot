const { sendMessage, sendImageMessage, replyToComment } = require('../utils/messenger');
const { askAI } = require('../utils/openai');
const { getAvailableSlots, bookSlot, getSheetSettings } = require('../utils/sheets');
const pages = require('../config/pages');

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

    res.status(200).send('EVENT_RECEIVED');

    const tasks = [];
    for (const entry of body.entry) {
      const pageId     = entry.id;
      const pageConfig = pages[pageId];
      if (!pageConfig) { console.log('Unknown pageId:', pageId); continue; }

      if (entry.messaging) {
        for (const event of entry.messaging) {
          if (event.message && !event.message.is_echo) {
            tasks.push(handleMessage(event, pageConfig));
          }
        }
      }

      if (entry.changes) {
        for (const change of entry.changes) {
          const v = change.value;
          if (change.field === 'feed' && v.item === 'comment' && v.verb === 'add') {
            tasks.push(handleComment(v, pageConfig));
          }
        }
      }
    }
    await Promise.all(tasks);
  }
};

async function handleMessage(event, pageConfig) {
  try {
    const senderId = event.sender.id;
    const msg      = event.message;
    let userText = msg.text || '';
    let imageUrl = null;
    if (msg.attachments) {
      for (const att of msg.attachments) {
        if (att.type === 'image') {
          imageUrl = att.payload.url;
          if (!userText) userText = 'Хэрэглэгч зураг илгээлээ.';
        }
      }
    }

    let systemPrompt = pageConfig.systemPrompt;
    let priceImageUrl = null;

    if (pageConfig.spreadsheetId) {
      const [settings, slots] = await Promise.all([
        getSheetSettings(pageConfig.spreadsheetId),
        getAvailableSlots(pageConfig.spreadsheetId)
      ]);
      if (settings.systemPrompt) systemPrompt = settings.systemPrompt;
      if (settings.priceImageUrl) priceImageUrl = settings.priceImageUrl;
      if (slots) systemPrompt += '\n\nОДООГИЙН СУЛ ОГНООНУУД:\n' + slots;
      if (priceImageUrl) {
        systemPrompt += '\n\nҮНИЙН ЗУРАГ: Хэрэглэгч үнэ, багц асуухад хариултынхаа эхэнд [SEND_IMAGE] гэж нэм.';
      }
    }

    systemPrompt += '\n\nЗАХИАЛГА: Огноо баталгаажуулахад эцэст [BOOK:YYYY-MM-DD:УТАС:УРЬДЧИЛГАА] нэм. Жишээ: [BOOK:2026-07-15:99001234:200000]';

    const reply = await askAI(systemPrompt, userText, imageUrl);
    console.log('AI reply length:', reply && reply.length);

    if (priceImageUrl && reply.includes('[SEND_IMAGE]')) {
      await sendImageMessage(pageConfig.token, senderId, priceImageUrl);
    }
    const bookMatch = reply.match(/\[BOOK:([^:]+):([^:]+):([^\]]*)]/);
    if (bookMatch && pageConfig.spreadsheetId) {
      const [, date, phone, advance] = bookMatch;
      await bookSlot(pageConfig.spreadsheetId, date, phone, advance);
    }
    const cleanReply = reply.replace(/\[SEND_IMAGE\]/g, '').replace(/\[BOOK:[^\]]+\]/g, '').trim();
    if (cleanReply) await sendMessage(pageConfig.token, senderId, cleanReply);
  } catch (err) {
    console.error('handleMessage error:', err.message, err.stack);
  }
}

async function handleComment(commentData, pageConfig) {
  try {
    const commentId   = commentData.comment_id;
    const commentText = commentData.message || '';
    if (!commentId || !commentText) return;
    let systemPrompt = pageConfig.systemPrompt;
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
