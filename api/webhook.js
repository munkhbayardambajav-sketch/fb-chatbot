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
      console.log('Entry pageId:', pageId, 'found:', !!pageConfig);
      if (!pageConfig) continue;

      if (entry.messaging) {
        for (const event of entry.messaging) {
          console.log('Event type:', JSON.stringify(Object.keys(event)));
          if (event.message && !event.message.is_echo) {
            tasks.push(handleMessage(event, pageConfig));
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
    console.log('handleMessage start, sender:', senderId, 'text:', userText.slice(0,30));

    let imageUrl = null;
    if (msg.attachments) {
      for (const att of msg.attachments) {
        if (att.type === 'image') { imageUrl = att.payload.url; if (!userText) userText = 'Зураг.'; }
      }
    }

    let systemPrompt = pageConfig.systemPrompt;
    let priceImageUrl = null;

    if (pageConfig.spreadsheetId) {
      console.log('Reading sheets...');
      const [settings, slots] = await Promise.all([
        getSheetSettings(pageConfig.spreadsheetId),
        getAvailableSlots(pageConfig.spreadsheetId)
      ]);
      console.log('Sheets done. systemPrompt from Sheet2:', !!settings.systemPrompt, 'priceUrl:', !!settings.priceImageUrl);
      if (settings.systemPrompt) systemPrompt = settings.systemPrompt;
      if (settings.priceImageUrl) priceImageUrl = settings.priceImageUrl;
      if (slots) systemPrompt += '\n\nОДООГИЙН СУЛ ОГНООНУУД:\n' + slots;
      if (priceImageUrl) systemPrompt += '\n\nҮНИЙН ЗУРАГ: Үнэ асуухад [SEND_IMAGE] нэм.';
    }

    systemPrompt += '\n\nЗАХИАЛГА: Огноо баталгаажуулахад [BOOK:YYYY-MM-DD:УТАС:УРЬДЧИЛГАА] нэм.';

    console.log('Calling OpenAI...');
    const reply = await askAI(systemPrompt, userText, imageUrl);
    console.log('OpenAI replied, length:', reply && reply.length);

    if (priceImageUrl && reply.includes('[SEND_IMAGE]')) {
      await sendImageMessage(pageConfig.token, senderId, priceImageUrl);
    }
    const bookMatch = reply.match(/\[BOOK:([^:]+):([^:]+):([^\]]*)]/);
    if (bookMatch && pageConfig.spreadsheetId) {
      await bookSlot(pageConfig.spreadsheetId, bookMatch[1], bookMatch[2], bookMatch[3]);
    }
    const cleanReply = reply.replace(/\[SEND_IMAGE\]/g, '').replace(/\[BOOK:[^\]]+\]/g, '').trim();
    console.log('Sending reply, length:', cleanReply.length);
    if (cleanReply) {
      const fbRes = await fetch('https://graph.facebook.com/v19.0/me/messages?access_token=' + pageConfig.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: senderId }, message: { text: cleanReply } })
      });
      const fbData = await fbRes.json();
      console.log('FB send result:', JSON.stringify(fbData).slice(0, 200));
    }
  } catch (err) {
    console.error('handleMessage error:', err.message, err.stack);
  }
}

async function handleComment(commentData, pageConfig) {
  try {
    const commentId = commentData.comment_id;
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
