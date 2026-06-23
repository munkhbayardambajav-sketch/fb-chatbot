const defaultWeddingPrompt = process.env.WEDDING_SYSTEM_PROMPT || `You are a wedding photography assistant. Answer in Mongolian. Packages: Basic 800000T (4h, 200+ photos), Standard 1200000T (8h, 400+ photos), Premium 2000000T (full day, 600+ photos+video). Ask for name, phone, wedding date when booking.`;

const defaultClothingPrompt = process.env.CLOTHING_SYSTEM_PROMPT || `You are a clothing store assistant. Answer in Mongolian. Size chart: XS(155-160cm,45-50kg), S(160-165cm,50-57kg), M(165-170cm,57-65kg), L(170-175cm,65-73kg), XL(175-180cm,73-82kg), XXL(180-185cm,82-92kg). If customer sends image: give price and available sizes. If customer sends height/weight: recommend size.`;

module.exports = {
    [process.env.WEDDING_PAGE_ID || 'WEDDING_PAGE_ID_HERE']: {
          name: 'Wedding Photography',
          token: process.env.WEDDING_PAGE_TOKEN,
          systemPrompt: defaultWeddingPrompt
    },
    [process.env.CLOTHING_PAGE_ID || 'CLOTHING_PAGE_ID_HERE']: {
          name: 'Clothing Store',
          token: process.env.CLOTHING_PAGE_TOKEN,
          systemPrompt: defaultClothingPrompt
    }
};
