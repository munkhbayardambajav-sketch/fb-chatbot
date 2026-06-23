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

      for (const entry of body.entry) {
              const pageId     = entry.id;
              const pageConfig = pages[pageId];
              if (!pageConfig) continue;

            if (entry.messaging) {
                      for (const event of entry.messaging) {
                                  if (event.message && !event.message.is_echo) {
                                                await handleMessage(event, pageConfig);
                                  }
                      }
            }

            if (entry.changes) {
                      for (const change of entry.changes) {
                                  const v = change.value;
                                  if (change.field === 'feed' && v.item === 'comment' && v.verb === 'add') {
                                                await handleComment(v, pageConfig);
                                  }
                      }
            }
      }
    }
};

async function handleMessage(event, pageConfig) {
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
        const settings = await getSheetSettings(pageConfig.spreadsheetId);
        if (settings.systemPrompt) systemPrompt = settings.systemPrompt;
        if (settings.priceImageUrl) priceImageUrl = settings.priceImageUrl;

      const slots = await getAvailableSlots(pageConfig.spreadsheetId);
        if (slots) systemPrompt += '\n\nОДООГИЙН СУЛ ОГНООНУУД:\n' + slots;

      if (priceImageUrl) {
              systemPrompt += '\n\nҮНИЙН ЗУРАГ: Хэрэглэгч үнэ, багц, үйлчилгээний мэдээлэл асуухад хариултынхаа эхэнд [SEND_IMAGE] гэж нэм.';
      }
  }

  systemPrompt += '\n\nЗАХИАЛГА: Хэрэглэгч огноо баталгаажуулахад хариултынхаа эцэст [BOOK:YYYY-MM-DD:УТАС:УРЬДЧИЛГАА] форматаар нэм. Жишээ: [BOOK:2026-07-15:99001234:200000]';

  const reply = await askAI(systemPrompt, userText, imageUrl);

  if (priceImageUrl && reply.includes('[SEND_IMAGE]')) {
        await sendImageMessage(pageConfig.token, senderId, priceImageUrl);
  }

  const bookMatch = reply.match(/\[BOOK:([^:]+):([^:]+):([^\]]*)\]/);
    if (bookMatch && pageConfig.spreadsheetId) {
          const [, date, phone, advance] = bookMatch;
          await bookSlot(pageConfig.spreadsheetId, date, phone, advance);
    }

  const cleanReply = reply.replace(/\[SEND_IMAGE\]/g, '').replace(/\[BOOK:[^\]]+\]/g, '').trim();
    if (cleanReply) await sendMessage(pageConfig.token, senderId, cleanReply);
}

async function handleComment(commentData, pageConfig) {
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
}
