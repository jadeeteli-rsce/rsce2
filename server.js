const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

let chunks = [];
const CACHE_FILE = path.join(__dirname, 'website-cache.txt');

const RSCE_URLS = [
  'https://www.rsce.es/',
  'https://www.rsce.es/quienes-somos/',
  'https://www.rsce.es/organigrama/',
  'https://www.rsce.es/socios-abonados/',
  'https://www.rsce.es/eventos-rsce/',
  'https://www.rsce.es/razas-espanolas/',
  'https://www.rsce.es/morfologia/',
  'https://www.rsce.es/agility/',
  'https://www.rsce.es/igp/',
  'https://www.rsce.es/obediencia/',
  'https://www.rsce.es/busqueda-y-rescate/',
  'https://www.rsce.es/rally-obediencia/',
  'https://www.rsce.es/grooming/',
  'https://www.rsce.es/salud-y-bienestar-rsce/',
  'https://www.rsce.es/criadores/',
  'https://www.rsce.es/criadores-premium/',
  'https://www.rsce.es/servicios-rsce/',
  'https://www.rsce.es/tramites-rsc/',
  'https://www.rsce.es/afijos/',
  'https://www.rsce.es/displasia/',
  'https://www.rsce.es/certificados-de-pedigree/',
  'https://www.rsce.es/tarifas/',
  'https://www.rsce.es/contacto-rsce/',
  'https://www.rsce.es/reglamentos_rsce/',
  'https://www.rsce.es/area-de-formaciones/',
  'https://www.rsce.es/noticias-rsce/',
  'https://www.rsce.es/jueces-de-la-rsce/',
  'https://www.rsce.es/faq/',
];

// Split a page into smaller chunks of ~1000 chars
function chunkText(url, title, text) {
  const size = 1000;
  const results = [];
  for (let i = 0; i < text.length; i += size) {
    results.push({
      url,
      title,
      content: text.substring(i, i + size)
    });
  }
  return results;
}

// Find the most relevant chunks for a question using keyword matching
function getRelevantChunks(question, allChunks, topN = 5) {
  const words = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const scored = allChunks.map(chunk => {
    const text = chunk.content.toLowerCase();
    const score = words.reduce((acc, word) => acc + (text.includes(word) ? 1 : 0), 0);
    return { ...chunk, score };
  });
  return scored
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

async function scrapeWebsite() {
  console.log('Iniciando extraccion del sitio web de la RSCE...');
  const newChunks = [];
  for (const url of RSCE_URLS) {
    try {
      console.log('Extrayendo: ' + url);
      const response = await axios.get(url, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      const $ = cheerio.load(response.data);
      const title = $('title').text();
      const mainContent = $('main').text() || $('body').text();
      const pageChunks = chunkText(url, title, mainContent.substring(0, 20000));
      newChunks.push(...pageChunks);
    } catch (error) {
      console.error('Error al extraer ' + url + ': ' + error.message);
    }
  }
  if (newChunks.length > 0) {
    chunks = newChunks;
  }
  console.log('Total chunks: ' + chunks.length);
  return chunks;
}

function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      chunks = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      console.log('Cache cargado: ' + chunks.length + ' chunks');
    } catch (e) {
      console.log('Cache invalido, esperando scrape...');
    }
  } else {
    console.log('No hay cache, esperando primer scrape...');
  }
}

async function scrapeAndCache() {
  await scrapeWebsite();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(chunks), 'utf-8');
  console.log('Cache guardado en website-cache.txt');
}

loadCache();
scrapeAndCache().catch(err => console.error('Error en scrape inicial:', err));
setInterval(scrapeAndCache, 24 * 60 * 60 * 1000);

app.post('/api/chat', async (req, res) => {
  const { message: userMessage, history = [] } = req.body;

  if (!userMessage || userMessage.trim() === '') {
    return res.json({ reply: 'Por favor, escribe una pregunta!', confidence: 'none' });
  }
  if (chunks.length === 0) {
    return res.json({
      reply: 'Todavia estoy cargando la informacion. Por favor, intentalo de nuevo en un momento.',
      confidence: 'low'
    });
  }

  try {
    const relevant = getRelevantChunks(userMessage, chunks);
    const context = relevant.length > 0
      ? relevant.map(c => '--- ' + c.title + ' (' + c.url + ') ---\n' + c.content).join('\n\n')
      : chunks.slice(0, 5).map(c => c.content).join('\n\n');

    const systemPrompt =
      'Eres un asistente virtual de la RSCE (Real Sociedad Canina de Espana).\n' +
      'Responde SIEMPRE en espanol de forma natural y conversacional.\n' +
      'Responde de forma precisa y detallada usando el contenido disponible.\n' +
      'IMPORTANTE: No menciones nunca "el contenido proporcionado" ni "segun la informacion". Responde directamente.'   
      'INFORMACION IMPORTANTE SOBRE PRUEBAS DE ADN:\n' +
      '1. Accede al formulario de pre-registro en https://rsce.igecan.es/ y complétalo con tus datos y los de tu perro.\n' +
      '2. Si no eres socio de la RSCE, realiza el pago correspondiente (solo se admiten pagos mediante el sistema de pre-registro).\n' +
      '3. Tras el pre-registro, recibirás un correo electrónico con las instrucciones para comenzar el proceso.\n' +
      '4. Después podrás elegir el laboratorio que prefieras. Contáctalos para que te informen de sus tarifas y te envíen los kits para la toma de muestras.\n' +
      'Guía de ayuda completa: https://www.rsce.es/wp-content/uploads/2025/04/PROCEDIMIENTO_SOLICITUD_ADN.pdf\n';;

    const chat = model.startChat({
  systemInstruction: { parts: [{ text: systemPrompt }] },
  history: history,
});

    const adnInfo =
  'PROCEDIMIENTO PRUEBAS DE ADN (usa esto si preguntan sobre ADN):\n' +
  '1. Accede al pre-registro en https://rsce.igecan.es/ y complétalo con tus datos y los de tu perro.\n' +
  '2. Si no eres socio, realiza el pago (solo se admiten pagos por pre-registro).\n' +
  '3. Recibirás un correo con instrucciones para comenzar.\n' +
  '4. Elige un laboratorio, contáctalos para tarifas y kits de muestras.\n' +
  'Guía completa: https://www.rsce.es/wp-content/uploads/2025/04l/PROCEDIMIENTO_SOLICITUD_ADN.pdf\n\n';

    const messageWithContext =
  adnInfo +
  'Contenido relevante de la web RSCE:\n' + context + '\n\nPregunta: ' + userMessage;

    const result = await chat.sendMessage(messageWithContext);
    const reply = result.response.text();

    res.json({ reply, confidence: 'high', source: 'basado-en-web' });
  } catch (error) {
    console.error('Error al llamar a Gemini:', error.message);
    res.json({
      reply: 'Ha ocurrido un error. Por favor, contactanos en info@rsce.es',
      confidence: 'low',
      error: error.message
    });
  }
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index2.html'));
});


app.listen(PORT, () => {
  console.log('Chatbot RSCE ejecutandose en el puerto ' + PORT);
  console.log('Proveedor de IA: Google Gemini (gemini-2.5-flash)');
  console.log('Abre http://localhost:' + PORT + ' en tu navegador');
});
